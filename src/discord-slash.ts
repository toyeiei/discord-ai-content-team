import { MiniMaxClient } from './minimax';
import { GitHubClient, generateBlogMarkdown } from './github';
import { runStep } from './steps';
import type { Env, WorkflowState, WorkflowStep } from './env';
import { STEP_CHANNEL_MAP } from './env';

export interface DiscordInteraction {
  type: number;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string }>;
    custom_id?: string;
  };
  token: string;
  member?: {
    user: { id: string; username: string };
  };
  guild_id?: string;
  channel_id?: string;
  message?: { id: string };
}

interface DiscordButtonComponent {
  type: number;
  style: number;
  label: string;
  custom_id: string;
}

export class DiscordSlashHandler {
  private env: Env;
  private miniMax: MiniMaxClient;
  private github: GitHubClient;

  constructor(env: Env) {
    this.env = env;
    this.miniMax = new MiniMaxClient(env.MINIMAX_API_KEY);
    this.github = new GitHubClient(env.GITHUB_TOKEN, env.GITHUB_REPO);
  }

  // --- Slash commands ---

  async handleInteraction(
    body: DiscordInteraction,
    executionContext?: ExecutionContext,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const command = body.data?.name;

    switch (command) {
      case 'create':
        return this.handleCreate(body, executionContext);
      case 'status':
        return this.handleStatus(body);
      case 'cancel':
        return this.handleCancel(body);
      default:
        return this.ephemeral('Unknown command');
    }
  }

  // --- Button interactions ---

  async handleButton(
    body: DiscordInteraction,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const customId = body.data?.custom_id || '';
    const userId = body.member?.user.id || 'unknown';

    if (customId === 'approve') {
      return this.handleApproveButton(body, userId);
    }

    if (customId === 'revise') {
      return this.handleReviseButton(body, userId);
    }

    return this.ephemeral('Unknown action');
  }

  // --- Command handlers ---

  private async handleCreate(
    body: DiscordInteraction,
    executionContext?: ExecutionContext,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const userId = body.member?.user.id || 'unknown';
    const topic = body.data?.options?.find((o) => o.name === 'topic')?.value || '';

    if (!topic) {
      return this.ephemeral('Usage: `/create topic: <your blog topic>`');
    }

    const task = this.runWorkflow(userId, topic).catch((error) => {
      console.error('Workflow error:', error);
    });
    executionContext?.waitUntil(task);

    return { type: 4, data: { content: `Starting workflow for: **${topic}**` } };
  }

  private async handleStatus(
    body: DiscordInteraction,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const userId = body.member?.user.id || 'unknown';
    const workflow = await this.getWorkflow(userId);

    if (!workflow || workflow.currentStep === 'IDLE') {
      return this.ephemeral('No active workflow. Use `/create topic: <topic>` to start one.');
    }

    return this.ephemeral(this.formatStatus(workflow));
  }

  private async handleCancel(
    body: DiscordInteraction,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const userId = body.member?.user.id || 'unknown';
    await this.callDO(userId, '/cancel', 'POST');
    return this.ephemeral('Workflow cancelled.');
  }

  // --- Button handlers ---

  private async handleApproveButton(
    body: DiscordInteraction,
    userId: string,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const workflow = await this.getWorkflow(userId);

    if (!workflow || workflow.currentStep !== 'AWAITING_APPROVAL') {
      return this.ephemeral('Nothing to approve.');
    }

    if (!workflow.data?.finalBlog) {
      return this.ephemeral('No blog content to publish.');
    }

    // Publish to GitHub
    const slug = this.github.generateSlug(workflow.topic);
    const path = `_posts/${formatDate()}-${slug}.md`;
    const socialPosts = typeof workflow.data.socialPosts === 'string'
      ? JSON.parse(workflow.data.socialPosts)
      : workflow.data.socialPosts;
    const markdown = generateBlogMarkdown(workflow.topic, workflow.data.finalBlog, socialPosts);
    const success = await this.github.createFile(path, markdown, `Publish: ${workflow.topic}`);

    if (success) {
      await this.callDO(userId, '/approve', 'POST');
      await this.postToChannel(this.env.CHANNEL_APPROVAL, `Published to GitHub Pages: \`${path}\``);
      return { type: 7, data: { content: 'Published!', components: [] } };
    }

    return this.ephemeral('Failed to publish. Check GitHub token permissions.');
  }

  private async handleReviseButton(
    body: DiscordInteraction,
    userId: string,
  ): Promise<{ type: number; data?: Record<string, unknown> }> {
    const workflow = await this.getWorkflow(userId);

    if (!workflow || workflow.currentStep !== 'AWAITING_APPROVAL') {
      return this.ephemeral('Nothing to revise.');
    }

    await this.callDO(userId, '/set-step', 'POST', { step: 'EDIT' });
    await this.postToChannel(this.env.CHANNEL_APPROVAL, 'Going back to **EDIT** for revisions...');

    // Resume workflow in background
    const task = this.runWorkflow(userId, workflow.topic).catch((error) => {
      console.error('Revision workflow error:', error);
    });
    // We can't get executionContext here, but fire-and-forget is fine for revisions
    task.catch(() => {});

    return { type: 7, data: { content: 'Revising... going back to EDIT.', components: [] } };
  }

  // --- Workflow execution ---

  private async runWorkflow(userId: string, topic: string): Promise<void> {
    const channelId = this.env.CHANNEL_APPROVAL;
    const workflowStub = this.getStub(userId);

    // Init workflow
    await this.callStub(workflowStub, '/init', 'POST', { topic, userId, channelId });

    while (true) {
      const { workflow } = await this.callStub(workflowStub, '/status', 'GET');
      if (!workflow || workflow.currentStep === 'IDLE' || workflow.currentStep === 'PUBLISHED' || workflow.currentStep === 'ERROR') {
        break;
      }

      if (workflow.currentStep === 'AWAITING_APPROVAL') {
        await this.sendApprovalMessage(workflow);
        break;
      }

      // Post "processing" to the step's channel
      const channelKey = STEP_CHANNEL_MAP[workflow.currentStep];
      const stepChannelId = channelKey ? this.env[channelKey] as string : undefined;

      if (stepChannelId) {
        await this.postToChannel(stepChannelId, `**${workflow.currentStep}** - Processing...`);
      }

      // Run the step
      const result = await runStep(workflow.currentStep, {
        state: workflow,
        miniMax: this.miniMax,
        cache: this.env.CACHE,
        exaApiKey: this.env.EXA_API_KEY,
      });

      if (!result.success) {
        await this.callStub(workflowStub, '/set-error', 'POST', { message: result.error });
        if (stepChannelId) {
          await this.postToChannel(stepChannelId, `Error: ${result.error}`);
        }
        break;
      }

      // Save step data
      const dataKey = getDataKey(workflow.currentStep);
      if (dataKey && result.data) {
        await this.callStub(workflowStub, '/set-data', 'POST', { key: dataKey, value: result.data });
      }

      // Post result to channel
      if (stepChannelId && result.data) {
        await this.postToChannel(stepChannelId, `**${workflow.currentStep} Complete**\n\n${truncate(result.data, 1800)}`);
      }

      // Advance
      await this.callStub(workflowStub, '/advance', 'POST');
    }
  }

  private async sendApprovalMessage(workflow: WorkflowState): Promise<void> {
    let content = '## Content Ready for Review!\n\n';

    if (workflow.data?.finalBlog) {
      content += '### Blog Post:\n```\n' + truncate(workflow.data.finalBlog, 1500) + '\n```\n\n';
    }

    if (workflow.data?.socialPosts) {
      const posts = typeof workflow.data.socialPosts === 'string'
        ? JSON.parse(workflow.data.socialPosts)
        : workflow.data.socialPosts;
      content += '### Social Posts:\n';
      content += `**Facebook:** ${truncate(posts.facebook || 'N/A', 200)}\n`;
      content += `**X/Twitter:** ${truncate(posts.twitter || 'N/A', 200)}\n`;
      content += `**LinkedIn:** ${truncate(posts.linkedin || 'N/A', 300)}\n`;
    }

    await fetch(`https://discord.com/api/v10/channels/${this.env.CHANNEL_APPROVAL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        content,
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: 'Approve & Publish', custom_id: 'approve' },
              { type: 2, style: 4, label: 'Revise', custom_id: 'revise' },
            ],
          },
        ],
      }),
    });
  }

  // --- Discord API helpers ---

  private async postToChannel(channelId: string, content: string): Promise<void> {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ content }),
    });
  }

  // --- Durable Object helpers ---

  private getStub(userId: string): DurableObjectStub {
    const id = this.env.WORKFLOW.idFromName(`workflow-${userId}`);
    return this.env.WORKFLOW.get(id);
  }

  private async callStub(stub: DurableObjectStub, path: string, method: string, body?: unknown): Promise<any> {
    const req = new Request(`http://do${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const res = await stub.fetch(req);
    return res.json();
  }

  private async getWorkflow(userId: string): Promise<WorkflowState | null> {
    const { workflow } = await this.callDO(userId, '/status', 'GET');
    return workflow;
  }

  private async callDO(userId: string, path: string, method: string, body?: unknown): Promise<any> {
    return this.callStub(this.getStub(userId), path, method, body);
  }

  // --- Formatting ---

  private formatStatus(workflow: WorkflowState): string {
    let status = `**Workflow Status**\nTopic: ${workflow.topic}\nStep: ${workflow.currentStep}\n`;
    if (workflow.data?.errorMessage) {
      status += `Error: ${workflow.data.errorMessage}\n`;
    }
    if (workflow.data?.finalBlog) {
      status += `\n**Preview:**\n\`\`\`\n${truncate(workflow.data.finalBlog, 400)}\n\`\`\``;
    }
    return status;
  }

  private ephemeral(content: string): { type: number; data: Record<string, unknown> } {
    return { type: 4, data: { content, flags: 64 } };
  }
}

function getDataKey(step: string): string | null {
  switch (step) {
    case 'RESEARCH': return 'research';
    case 'DRAFT': return 'draft';
    case 'EDIT': return 'edited';
    case 'FINAL': return 'finalBlog';
    case 'SOCIAL': return 'socialPosts';
    default: return null;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 50) + '...\n\n_(truncated)_';
}

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}
