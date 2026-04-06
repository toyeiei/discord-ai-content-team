import { createThread, postInstanceId, findInstanceIdInThread } from './discord';
import type { Env } from './env';
import type { DiscordInteraction } from './discord';

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
    switch (body.data?.custom_id) {
      case 'approve': return this.handleApprove(body);
      case 'revise': return this.handleRevise(body);
      default: return this.ephemeral('Unknown action');
    }
  }

  private async handleCreate(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    const userId = body.member?.user.id || 'unknown';
    const topic = body.data?.options?.find((o: { name: string; value: string }) => o.name === 'topic')?.value || '';

    if (!topic) return this.ephemeral('Usage: `/create topic: <your blog topic>`');

    const threadId = await createThread(this.env.DISCORD_CHANNEL_ID, topic, this.env.DISCORD_BOT_TOKEN);
    if (!threadId) return this.ephemeral('Failed to create thread. Check channel permissions.');

    const instanceId = `workflow-${userId}-${Date.now()}`;
    await this.env.CONTENT_WORKFLOW.create({ id: instanceId, params: { topic, userId, threadId } });
    await postInstanceId(threadId, instanceId, this.env.DISCORD_BOT_TOKEN);

    return { type: 4, data: { content: `Workflow started in thread: <#${threadId}>` } };
  }

  private handleStatus(): { type: number; data: Record<string, unknown> } {
    return this.ephemeral('Check the thread for the latest workflow status. The workflow posts progress updates as it runs.');
  }

  private handleCancel(): { type: number; data: Record<string, unknown> } {
    return this.ephemeral('To cancel, archive the thread. The workflow times out after 24 hours if not approved.');
  }

  private async handleApprove(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    const threadId = body.channel_id || '';
    const instanceId = await findInstanceIdInThread(threadId, this.env.DISCORD_BOT_TOKEN);

    if (!instanceId) return this.ephemeral('Could not find workflow instance.');

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: true } });
      return { type: 7, data: { content: 'Approved! Publishing...', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private async handleRevise(body: DiscordInteraction): Promise<{ type: number; data?: Record<string, unknown> }> {
    const threadId = body.channel_id || '';
    const instanceId = await findInstanceIdInThread(threadId, this.env.DISCORD_BOT_TOKEN);

    if (!instanceId) return this.ephemeral('Could not find workflow instance.');

    try {
      const instance = await this.env.CONTENT_WORKFLOW.get(instanceId);
      await instance.sendEvent({ type: 'approval', payload: { approved: false } });
      return { type: 7, data: { content: 'Revising... going back to EDIT.', components: [] } };
    } catch {
      return this.ephemeral('Workflow not found or already completed.');
    }
  }

  private ephemeral(content: string): { type: number; data: Record<string, unknown> } {
    return { type: 4, data: { content, flags: 64 } };
  }
}
