import { postToChannel, postInstanceId } from './discord';
import type { Env, WorkflowChannels } from './env';
import type { DiscordInteraction } from './discord';
import { sanitizeTopic } from './config';

export { type DiscordInteraction };

export class DiscordSlashHandler {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async handleInteraction(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    switch (body.data?.name) {
      case 'create': return this.handleCreate(body);
      case 'status': return this.handleStatus();
      case 'cancel': return this.handleCancel();
      default: return this.ephemeral('Unknown command');
    }
  }

  async handleButton(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    const customId = body.data?.custom_id || '';

    // Parse instance ID from custom_id format: "action:instanceId"
    const instanceId = customId.includes(':') ? customId.split(':').slice(1).join(':') : null;
    const action = customId.includes(':') ? customId.split(':')[0] : customId;

    switch (action) {
      case 'approve': return this.handleApprove(instanceId);
      case 'revise': return this.handleRevise(instanceId);
      case 'publish_approve': return this.handlePublishApprove(instanceId);
      case 'publish_revise': return this.handlePublishRevise(instanceId);
      default: return this.ephemeral('Unknown action');
    }
  }

  private async handleCreate(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    const userId = body.member?.user.id || 'unknown';
    const rawTopic = body.data?.options?.find((o: { name: string; value: string }) => o.name === 'topic')?.value || '';
    const topic = sanitizeTopic(rawTopic);

    if (!topic) {
      return this.ephemeral('Usage: `/create topic: <your blog topic>`');
    }

    const channels: WorkflowChannels = {
      research: this.env.RESEARCH_CHANNEL_ID,
      draft: this.env.DRAFT_CHANNEL_ID,
      edit: this.env.EDIT_CHANNEL_ID,
      final: this.env.FINAL_CHANNEL_ID,
      publish: this.env.PUBLISH_CHANNEL_ID,
    };

    const instanceId = `workflow-${userId}-${Date.now()}`;
    await this.env.CONTENT_WORKFLOW.create({ id: instanceId, params: { topic, userId, channels } });

    // Post workflow start to research channel
    const startMsg = `🚀 **New Workflow Started**\n📝 **Topic:** ${topic}\n🔖 **ID:** \`${instanceId}\``;
    await postToChannel(this.env.RESEARCH_CHANNEL_ID, startMsg, this.env.DISCORD_BOT_TOKEN);

    // Post instance ID to research channel for tracking
    await postInstanceId(this.env.RESEARCH_CHANNEL_ID, instanceId, this.env.DISCORD_BOT_TOKEN);

    return { type: 4, data: { content: 'Workflow started! Check the pipeline channels: #research, #draft, #edit, #final' } };
  }

  private handleStatus(): { type: number; data: Record<string, unknown> } {
    return this.ephemeral('Check the pipeline channels for the latest workflow status. Each channel shows its respective stage.');
  }

  private handleCancel(): { type: number; data: Record<string, unknown> } {
    return this.ephemeral('To cancel, the workflow will timeout after 24 hours if not approved.');
  }

  private async handleApprove(instanceId: string | null): Promise<{ type: number; data?: Record<string, unknown> }> {
    if (!instanceId) {
      return this.ephemeral('Could not find workflow instance.');
    }

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: true } });
      return { type: 7, data: { content: 'Approved! Publishing...', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private async handleRevise(instanceId: string | null): Promise<{ type: number; data?: Record<string, unknown> }> {
    if (!instanceId) {
      return this.ephemeral('Could not find workflow instance.');
    }

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: false } });
      return { type: 7, data: { content: 'Revising... going back to EDIT.', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private async handlePublishApprove(instanceId: string | null): Promise<{ type: number; data?: Record<string, unknown> }> {
    if (!instanceId) {
      return this.ephemeral('Could not find workflow instance.');
    }

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: true } });
      return { type: 7, data: { content: '✅ Approved! Publishing to GitHub Pages...', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private async handlePublishRevise(instanceId: string | null): Promise<{ type: number; data?: Record<string, unknown> }> {
    if (!instanceId) {
      return this.ephemeral('Could not find workflow instance.');
    }

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: false } });
      return { type: 7, data: { content: '❌ Publish cancelled. Use /create to start a new workflow.', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private ephemeral(content: string): { type: number; data: Record<string, unknown> } {
    return { type: 4, data: { content, flags: 64 } };
  }
}
