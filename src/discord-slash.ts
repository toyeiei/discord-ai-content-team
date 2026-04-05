import { MiniMaxClient } from './minimax';
import { GitHubClient, generateBlogMarkdown } from './github';
import { runStep } from './steps';
import type { Env } from './env';
import type { WorkflowState } from './env';

const WORKFLOW_STEPS = ['RESEARCH', 'DRAFT', 'EDIT', 'FINAL', 'SOCIAL', 'APPROVAL'] as const;

export interface DiscordInteraction {
  type: number;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      value: string;
    }>;
  };
  token: string;
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  guild_id?: string;
  channel_id?: string;
}

export interface DiscordResponse {
  type: number;
  data?: {
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      color?: number;
    }>;
    components?: Array<{
      type: number;
      label: string;
      style: number;
      custom_id: string;
    }>;
  };
}

interface WorkflowChannels {
  categoryId: string;
  channels: Record<string, string>;
}

export class DiscordSlashHandler {
  private env: Env;
  private miniMax: MiniMaxClient;
  private github: GitHubClient;
  private userChannels: Map<string, WorkflowChannels> = new Map();
  private approvalMessages: Map<string, string> = new Map(); // userId -> approvalChannelId

  constructor(env: Env) {
    this.env = env;
    this.miniMax = new MiniMaxClient(env.MINIMAX_API_KEY);
    this.github = new GitHubClient(env.GITHUB_TOKEN, env.GITHUB_REPO);
  }

  async handleInteraction(body: DiscordInteraction): Promise<DiscordResponse> {
    const command = body.data?.name;

    switch (command) {
      case 'create':
        return this.handleCreate(body);
      case 'status':
        return this.handleStatus(body);
      case 'cancel':
        return this.handleCancel(body);
      default:
        return this.ephemeralResponse('Unknown command');
    }
  }

  private async handleCreate(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const guildId = body.guild_id;
    const topic = body.data?.options?.find((o) => o.name === 'topic')?.value || '';

    if (!topic) {
      return this.ephemeralResponse('Usage: /create topic: <your blog topic>');
    }

    if (!guildId) {
      return this.ephemeralResponse('Please use this command in a server channel.');
    }

    // Start workflow in background (creates channels and processes steps)
    this.runWorkflow(userId, guildId, topic).catch(console.error);

    return {
      type: 4,
      data: {
        content: `Starting workflow for: **${topic}**\n\nCreating channels...`,
      },
    };
  }

  private async handleStatus(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    try {
      const response = await workflowStub.fetch(new Request('http://localhost/status'));
      const { workflow } = await response.json() as { workflow: WorkflowState };

      if (!workflow || workflow.currentStep === 'IDLE') {
        return this.ephemeralResponse('No active workflow. Use `/create <topic>` to start.');
      }

      return {
        type: 4,
        data: {
          content: this.formatStatus(workflow),
        },
      };
    } catch {
      return this.ephemeralResponse('Could not fetch workflow status.');
    }
  }

  private async handleCancel(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const guildId = body.guild_id;
    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    try {
      await workflowStub.fetch(new Request('http://localhost/cancel', { method: 'POST' }));

      if (guildId) {
        await this.deleteWorkflowChannels(userId, guildId);
      }

      return this.ephemeralResponse('Workflow cancelled and channels deleted.');
    } catch {
      return this.ephemeralResponse('Could not cancel workflow.');
    }
  }

  private async createWorkflowChannels(userId: string, guildId: string, topic: string): Promise<WorkflowChannels> {
    const categoryName = `📝 ${topic.slice(0, 25)}`.replace(/[^a-zA-Z0-9\s-]/g, '');

    const categoryResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        name: categoryName,
        type: 4,
      }),
    });

    if (!categoryResponse.ok) {
      throw new Error('Failed to create category');
    }

    const category = await categoryResponse.json() as { id: string };
    const channels: Record<string, string> = {};

    for (const step of WORKFLOW_STEPS) {
      const channelResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          name: step.toLowerCase(),
          type: 0,
          parent_id: category.id,
          topic: `Step ${step} for workflow`,
        }),
      });

      if (channelResponse.ok) {
        const channel = await channelResponse.json() as { id: string };
        channels[step] = channel.id;
      }
    }

    const workflowChannels: WorkflowChannels = { categoryId: category.id, channels };
    this.userChannels.set(userId, workflowChannels);

    return workflowChannels;
  }

  private async deleteWorkflowChannels(userId: string, guildId: string): Promise<void> {
    const workflowChannels = this.userChannels.get(userId);
    if (!workflowChannels) {
return;
}

    for (const channelId of Object.values(workflowChannels.channels)) {
      await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
        },
      });
    }

    await fetch(`https://discord.com/api/v10/channels/${workflowChannels.categoryId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
      },
    });

    this.userChannels.delete(userId);
  }

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

  private async runWorkflow(userId: string, guildId: string, topic: string): Promise<void> {
    const workflowChannels = await this.createWorkflowChannels(userId, guildId, topic);

    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    await workflowStub.fetch(new Request('http://localhost/init', {
      method: 'POST',
      body: JSON.stringify({ topic, userId, channelId: guildId }),
    }));

    await this.runSteps(workflowStub, userId, workflowChannels);
  }

  private async runSteps(workflowStub: DurableObjectStub, userId: string, workflowChannels: WorkflowChannels): Promise<void> {
    while (true) {
      const statusResponse = await workflowStub.fetch(new Request('http://localhost/status'));
      const { workflow } = await statusResponse.json() as { workflow: WorkflowState };

      if (!workflow ||
          workflow.currentStep === 'IDLE' ||
          workflow.currentStep === 'PUBLISHED' ||
          workflow.currentStep === 'ERROR') {
        break;
      }

      if (workflow.currentStep === 'AWAITING_APPROVAL') {
        await this.sendApprovalRequest(workflowStub, userId, workflowChannels);
        break;
      }

      const stepChannelKey = this.getChannelKeyForStep(workflow.currentStep);
      const channelId = workflowChannels.channels[stepChannelKey];

      if (channelId) {
        await this.postToChannel(channelId, `**${workflow.currentStep}**\n\n⏳ Processing...`);
      }

      const stepResult = await runStep(workflow.currentStep, {
        state: workflow,
        miniMax: this.miniMax,
        cache: this.env.CACHE,
        exaApiKey: this.env.EXA_API_KEY,
      });

      if (!stepResult.success) {
        await workflowStub.fetch(new Request('http://localhost/set-error', {
          method: 'POST',
          body: JSON.stringify({ message: stepResult.error }),
        }));
        if (channelId) {
          await this.postToChannel(channelId, `❌ **Error:** ${stepResult.error}`);
        }
        await this.deleteWorkflowChannels(userId, workflowChannels.categoryId);
        break;
      }

      const dataKey = this.getDataKeyForStep(workflow.currentStep);
      if (dataKey && stepResult.data) {
        await workflowStub.fetch(new Request('http://localhost/set-data', {
          method: 'POST',
          body: JSON.stringify({ key: dataKey, value: stepResult.data }),
        }));
      }

      if (channelId && stepResult.data) {
        let content = `✅ **${workflow.currentStep} Complete!**\n\n`;
        content += this.truncate(stepResult.data, 1800);
        await this.postToChannel(channelId, content);
      }

      await workflowStub.fetch(new Request('http://localhost/advance', { method: 'POST' }));
    }
  }

  private async sendApprovalRequest(workflowStub: DurableObjectStub, userId: string, workflowChannels: WorkflowChannels): Promise<void> {
    const statusResponse = await workflowStub.fetch(new Request('http://localhost/status'));
    const { workflow } = await statusResponse.json() as { workflow: WorkflowState };

    const approvalChannelId = workflowChannels.channels['APPROVAL'];
    if (!approvalChannelId) {
return;
}

    let content = '## ✅ Content Ready for Review!\n\n';

    if (workflow?.data?.finalBlog) {
      content += '### 📝 **Final Blog Post:**\n';
      content += '```\n' + this.truncate(workflow.data.finalBlog, 1500) + '\n```\n\n';
    }

    if (workflow?.data?.socialPosts) {
      const posts = typeof workflow.data.socialPosts === 'string'
        ? JSON.parse(workflow.data.socialPosts)
        : workflow.data.socialPosts;
      content += '### 📱 **Social Posts:**\n\n';
      content += `**Facebook:** ${this.truncate(posts.facebook || 'N/A', 200)}\n\n`;
      content += `**X/Twitter:** ${this.truncate(posts.twitter || 'N/A', 200)}\n\n`;
      content += `**LinkedIn:** ${this.truncate(posts.linkedin || 'N/A', 300)}\n`;
    }

    content += '\n---\n**React ✅ to publish or ❌ to request revisions.**';

    await this.postToChannel(approvalChannelId, content);

    // Store approval channel for reaction handling
    this.approvalMessages.set(userId, approvalChannelId);
  }

  async handleReaction(userId: string, channelId: string, emoji: string): Promise<void> {
    const storedChannelId = this.approvalMessages.get(userId);

    // Check if reaction is in approval channel for this user
    if (channelId !== storedChannelId) {
return;
}

    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    const statusResponse = await workflowStub.fetch(new Request('http://localhost/status'));
    const { workflow } = await statusResponse.json() as { workflow: WorkflowState };

    if (!workflow || workflow.currentStep !== 'AWAITING_APPROVAL') {
return;
}

    if (emoji === '✅') {
      // Publish
      await this.publishWorkflow(workflowStub, userId, workflow);
    } else if (emoji === '❌') {
      // Request revision - go back to EDIT
      await workflowStub.fetch(new Request('http://localhost/set-step', {
        method: 'POST',
        body: JSON.stringify({ step: 'EDIT' }),
      }));
      await this.postToChannel(channelId, 'Got it! Going back to **EDIT** step...');

      // Resume workflow from EDIT
      await this.runSteps(workflowStub, userId, this.userChannels.get(userId)!);
    }
  }

  private async publishWorkflow(workflowStub: DurableObjectStub, userId: string, workflow: WorkflowState): Promise<void> {
    const approvalChannelId = this.approvalMessages.get(userId);

    if (!workflow.data?.finalBlog) {
      if (approvalChannelId) {
        await this.postToChannel(approvalChannelId, '❌ No blog content to publish.');
      }
      return;
    }

    if (approvalChannelId) {
      await this.postToChannel(approvalChannelId, '⏳ Publishing to GitHub Pages...');
    }

    try {
      const slug = this.github.generateSlug(workflow.topic);
      const path = `_posts/${this.formatDate()}-${slug}.md`;
      const markdown = generateBlogMarkdown(
        workflow.topic,
        workflow.data.finalBlog,
        typeof workflow.data.socialPosts === 'string'
          ? JSON.parse(workflow.data.socialPosts)
          : workflow.data.socialPosts,
      );

      const success = await this.github.createFile(path, markdown, `Publish blog post: ${workflow.topic}`);

      if (success) {
        await workflowStub.fetch(new Request('http://localhost/approve', { method: 'POST' }));

        if (approvalChannelId) {
          await this.postToChannel(approvalChannelId, `🎉 **Successfully published to GitHub Pages!**\n\nPath: \`${path}\``);
        }

        // Clean up channels after publishing
        const workflowChannels = this.userChannels.get(userId);
        if (workflowChannels) {
          setTimeout(() => this.deleteWorkflowChannels(userId, ''), 5000);
        }
      } else {
        if (approvalChannelId) {
          await this.postToChannel(approvalChannelId, '❌ Failed to publish. Check GitHub token permissions.');
        }
      }
    } catch (error) {
      if (approvalChannelId) {
        await this.postToChannel(approvalChannelId, `❌ Publishing error: ${error}`);
      }
    }
  }

  private getChannelKeyForStep(step: string): string {
    switch (step) {
      case 'RESEARCH': return 'RESEARCH';
      case 'DRAFT': return 'DRAFT';
      case 'EDIT': return 'EDIT';
      case 'FINAL': return 'FINAL';
      case 'SOCIAL': return 'SOCIAL';
      default: return 'APPROVAL';
    }
  }

  private getDataKeyForStep(step: string): string | null {
    switch (step) {
      case 'RESEARCH': return 'research';
      case 'DRAFT': return 'draft';
      case 'EDIT': return 'edited';
      case 'FINAL': return 'finalBlog';
      case 'SOCIAL': return 'socialPosts';
      default: return null;
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
return text;
}
    return text.slice(0, maxLength - 50) + '...\n\n_(truncated)_';
  }

  private formatStatus(workflow: WorkflowState): string {
    let status = '**Workflow Status**\n';
    status += `Topic: ${workflow.topic}\n`;
    status += `Step: ${workflow.currentStep}\n\n`;

    if (workflow.data.errorMessage) {
      status += `Error: ${workflow.data.errorMessage}\n\n`;
    }

    if (workflow.data.finalBlog) {
      status += '**Preview:**\n```\n';
      status += this.truncate(workflow.data.finalBlog, 400);
      status += '```';
    }

    return status;
  }

  private formatDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private ephemeralResponse(content: string): DiscordResponse {
    return {
      type: 4,
      data: {
        content,
      },
    };
  }
}
