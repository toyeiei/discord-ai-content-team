import { Client, GatewayIntentBits, Partials, DMChannel } from 'discord.js';
import { runStep } from './steps';
import { GitHubClient, generateBlogMarkdown } from './github';
import { MiniMaxClient } from './minimax';
import type { WorkflowState, WorkflowStep } from './env';

export interface BotEnv {
  WORKFLOW_URL: string;
  MINIMAX_API_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  DISCORD_BOT_TOKEN: string;
  EXA_API_KEY?: string;
}

export class DiscordBot {
  private client: Client;
  private env: BotEnv;
  private miniMax: MiniMaxClient;

  constructor(env: BotEnv) {
    this.env = env;
    this.client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageReactions,
      ],
      partials: [Partials.Channel, Partials.DirectMessage, Partials.Message, Partials.Reaction],
    });

    this.miniMax = new MiniMaxClient(env.MINIMAX_API_KEY);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message) => {
      if (message.channel instanceof DMChannel && !message.author.bot) {
        await this.handleDM(message);
      }
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) {
return;
}

      const channelId = reaction.message.channelId;
      const userId = user.id;
      const emoji = reaction.emoji.name;

      await fetch(`${this.env.WORKFLOW_URL}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, channelId, emoji }),
      });
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.env.DISCORD_BOT_TOKEN);
  }

  private async callWorker(action: string, userId: string, data: Record<string, unknown> = {}): Promise<unknown> {
    const response = await fetch(`${this.env.WORKFLOW_URL}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId, ...data }),
    });
    return response.json();
  }

  private async handleDM(message: { author: { id: string }; channel: { id: string }; content: string; reply: (content: string) => Promise<unknown> }): Promise<void> {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const content = message.content.trim().toLowerCase();

    if (content.startsWith('create blog ')) {
      const topic = message.content.slice(11).trim();
      if (!topic) {
        await message.reply('Please provide a topic. Usage: `create blog <your topic>`');
        return;
      }

      const result = await this.callWorker('create', userId, { topic, channelId }) as { status?: number };
      if (result.status && result.status >= 400) {
        await message.reply('Failed to start workflow. Please try again.');
        return;
      }

      await message.reply(`Starting workflow for: "${topic}"\n\nStep 1: Researching...`);
      await this.runWorkflow(userId, message);
      return;
    }

    if (content === 'status') {
      const result = await this.callWorker('status', userId) as { workflow?: WorkflowState };
      const workflow = result.workflow;

      if (!workflow || workflow.currentStep === 'IDLE') {
        await message.reply('No active workflow. Use `create blog <topic>` to start.');
        return;
      }

      await message.reply(this.formatStatus(workflow));
      return;
    }

    if (content === 'cancel') {
      await this.callWorker('cancel', userId);
      await message.reply('Workflow cancelled.');
      return;
    }

    if (content === 'retry') {
      const result = await this.callWorker('retry', userId) as { status?: number };
      if (result.status && result.status >= 400) {
        await message.reply('Cannot retry from current state.');
        return;
      }
      await message.reply('Retrying last step...');
      await this.runWorkflow(userId, message);
      return;
    }

    if (content === 'yes' || content === 'approve') {
      const result = await this.callWorker('status', userId) as { workflow?: WorkflowState };
      if (result.workflow?.currentStep !== 'AWAITING_APPROVAL') {
        await message.reply('No content awaiting approval. Use `status` to check.');
        return;
      }
      await this.publishWorkflow(userId, message);
      return;
    }

    if (content === 'no' || content === 'revise') {
      const result = await this.callWorker('status', userId) as { workflow?: WorkflowState };
      if (result.workflow?.currentStep !== 'AWAITING_APPROVAL') {
        await message.reply('No content awaiting approval.');
        return;
      }
      await this.callWorker('set-step', userId, { step: 'EDIT' });
      await message.reply('Got it! Let\'s revise. Going back to edit...');
      await this.runWorkflow(userId, message);
      return;
    }

    await message.reply(
      'Available commands:\n' +
      '- `create blog <topic>` - Start a new blog workflow\n' +
      '- `status` - Check current workflow status\n' +
      '- `retry` - Retry failed step\n' +
      '- `cancel` - Cancel workflow\n' +
      '- `yes` - Approve and publish\n' +
      '- `no` - Request revisions',
    );
  }

  private async runWorkflow(userId: string, message: { reply: (content: string) => Promise<unknown> }): Promise<void> {
    const github = new GitHubClient(this.env.GITHUB_TOKEN, this.env.GITHUB_REPO);

    while (true) {
      const statusResult = await this.callWorker('status', userId) as { workflow?: WorkflowState };
      const workflow = statusResult.workflow;

      if (!workflow || workflow.currentStep === 'IDLE' || workflow.currentStep === 'AWAITING_APPROVAL' || workflow.currentStep === 'PUBLISHED' || workflow.currentStep === 'ERROR') {
        break;
      }

      await message.reply(`\n**Step: ${workflow.currentStep}**`);

      const stepResult = await runStep(workflow.currentStep, {
        state: workflow,
        miniMax: this.miniMax,
        cache: null as unknown as KVNamespace,
        exaApiKey: this.env.EXA_API_KEY,
      });

      if (!stepResult.success) {
        await this.callWorker('set-error', userId, { message: stepResult.error });
        await message.reply(`Error: ${stepResult.error}`);
        break;
      }

      const dataKey = this.getDataKeyForStep(workflow.currentStep);
      if (dataKey && stepResult.data) {
        await this.callWorker('set-data', userId, { stepData: { [dataKey]: stepResult.data } });
      }

      await this.callWorker('advance', userId);

      if (workflow.currentStep === 'FINAL') {
        const nextResult = await this.callWorker('status', userId) as { workflow?: WorkflowState };
        if (nextResult.workflow?.currentStep === 'AWAITING_APPROVAL') {
          await this.sendApprovalRequest(userId, message);
          break;
        }
      }
    }
  }

  private async sendApprovalRequest(userId: string, message: { reply: (content: string) => Promise<unknown> }): Promise<void> {
    const result = await this.callWorker('status', userId) as { workflow?: WorkflowState };
    const workflow = result.workflow;

    let reply = '**Content Ready for Review**\n\n';

    if (workflow?.data?.finalBlog) {
      reply += '**Final Blog Post:**\n```\n';
      reply += workflow.data.finalBlog.slice(0, 1500);
      if (workflow.data.finalBlog.length > 1500) {
reply += '\n... (truncated)';
}
      reply += '```\n\n';
    }

    if (workflow?.data?.socialPosts) {
      const posts = typeof workflow.data.socialPosts === 'string'
        ? JSON.parse(workflow.data.socialPosts)
        : workflow.data.socialPosts;
      reply += '**Social Posts:**\n';
      reply += `FB: ${posts.facebook?.slice(0, 200) || 'N/A'}\n`;
      reply += `X: ${posts.twitter?.slice(0, 200) || 'N/A'}\n`;
      reply += `LinkedIn: ${posts.linkedin?.slice(0, 200) || 'N/A'}\n`;
    }

    reply += '\n**Reply `yes` to publish or `no` to request revisions.**';

    await message.reply(reply);
  }

  private async publishWorkflow(userId: string, message: { reply: (content: string) => Promise<unknown> }): Promise<void> {
    const result = await this.callWorker('status', userId) as { workflow?: WorkflowState };
    const workflow = result.workflow;

    if (!workflow?.data?.finalBlog) {
      await message.reply('No blog content to publish.');
      return;
    }

    await message.reply('Publishing to GitHub Pages...');

    try {
      const github = new GitHubClient(this.env.GITHUB_TOKEN, this.env.GITHUB_REPO);
      const slug = github.generateSlug(workflow.topic);
      const path = `_posts/${this.formatDate()}-${slug}.md`;
      const markdown = generateBlogMarkdown(
        workflow.topic,
        workflow.data.finalBlog,
        typeof workflow.data.socialPosts === 'string'
          ? JSON.parse(workflow.data.socialPosts)
          : workflow.data.socialPosts,
      );

      const success = await github.createFile(path, markdown, `Publish blog post: ${workflow.topic}`);

      if (success) {
        await this.callWorker('approve', userId);
        await message.reply(`Successfully published to GitHub Pages!\n\nPath: ${path}`);
      } else {
        await message.reply('Failed to publish. Check GitHub token permissions.');
      }
    } catch (error) {
      await message.reply(`Publishing error: ${error}`);
    }
  }

  private getDataKeyForStep(step: WorkflowStep): string | null {
    switch (step) {
      case 'RESEARCH': return 'research';
      case 'DRAFT': return 'draft';
      case 'EDIT': return 'edited';
      case 'FINAL': return 'finalBlog';
      case 'SOCIAL': return 'socialPosts';
      default: return null;
    }
  }

  private formatStatus(workflow: WorkflowState): string {
    let status = '**Workflow Status**\n';
    status += `Topic: ${workflow.topic}\n`;
    status += `Step: ${workflow.currentStep}\n`;
    status += `Created: ${new Date(workflow.createdAt).toLocaleString()}\n\n`;

    if (workflow.data.errorMessage) {
      status += `Error: ${workflow.data.errorMessage}\n\n`;
    }

    if (workflow.data.finalBlog) {
      status += '**Preview (final blog):**\n```\n';
      status += workflow.data.finalBlog.slice(0, 500);
      if (workflow.data.finalBlog.length > 500) {
status += '\n...';
}
      status += '```\n';
    }

    return status;
  }

  private formatDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}

export function createBot(env: BotEnv): DiscordBot {
  return new DiscordBot(env);
}
