import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordSlashHandler } from './discord-slash';
import type { DiscordInteraction } from './discord-slash';
import type { Env } from './env';

describe('DiscordSlashHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeEnv = (): Env =>
    ({
      OPENAI_API_KEY: 'minimax-key',
      DISCORD_BOT_TOKEN: 'discord-bot-token',
      DISCORD_APP_ID: 'discord-app-id',
      DISCORD_PUBLIC_KEY: 'discord-public-key',
      GITHUB_TOKEN: 'github-token',
      GITHUB_REPO: 'owner/repo',
      RESEARCH_CHANNEL_ID: 'ch-research',
      DRAFT_CHANNEL_ID: 'ch-draft',
      EDIT_CHANNEL_ID: 'ch-edit',
      FINAL_CHANNEL_ID: 'ch-final',
      PUBLISH_CHANNEL_ID: 'ch-publish',
      CONTENT_WORKFLOW: {
        create: vi.fn(),
        get: vi.fn(),
      },
      CACHE: null,
    }) as unknown as Env;

  it('returns ephemeral for unknown commands', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleInteraction({
      type: 2,
      token: 'token',
      data: { name: 'foobar' },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toBe('Unknown command');
  });

  it('handleButton returns ephemeral for unknown custom_id', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleButton({
      type: 3,
      token: 'token',
      data: { custom_id: 'unknown' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toBe('Unknown action');
  });

  it('handleCreate requires a topic', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleInteraction({
      type: 2,
      token: 'token',
      data: { name: 'create' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toContain('Usage');
  });

  it('handleCreate creates thread and starts workflow', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    // Mock Discord API: post to research channel (start message + instance ID)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );

    const mockInstance = { id: 'workflow-123', create: vi.fn() };
    env.CONTENT_WORKFLOW.create = vi.fn().mockResolvedValue(mockInstance);

    const response = await handler.handleInteraction({
      type: 2,
      token: 'interaction-token',
      guild_id: 'guild-123',
      member: { user: { id: 'user-123', username: 'neo' } },
      data: {
        name: 'create',
        options: [{ name: 'topic', value: 'AI in 2026' }],
      },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toContain('Workflow started');
    expect(env.CONTENT_WORKFLOW.create).toHaveBeenCalledWith({
      id: expect.stringContaining('workflow-user-123'),
      params: {
        topic: 'AI in 2026',
        userId: 'user-123',
        channels: {
          research: 'ch-research',
          draft: 'ch-draft',
          edit: 'ch-edit',
          final: 'ch-final',
          publish: 'ch-publish',
        },
      },
    });
  });

  it('handleStatus returns help message', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleInteraction({
      type: 2,
      token: 'token',
      data: { name: 'status' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toContain('pipeline channels');
  });

  it('handleCancel returns help message', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleInteraction({
      type: 2,
      token: 'token',
      data: { name: 'cancel' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toContain('cancel');
  });

  it('handleButton parses instance ID from custom_id and sends approval event', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);
    env.CONTENT_WORKFLOW.get = vi.fn().mockResolvedValue({ sendEvent: mockSendEvent });

    const response = await handler.handleButton({
      type: 3,
      token: 'token',
      data: { custom_id: 'publish_approve:workflow-user-123-1234567890' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(7);
    expect((response.data as any).content).toContain('Approved');
    expect(env.CONTENT_WORKFLOW.get).toHaveBeenCalledWith('workflow-user-123-1234567890');
    expect(mockSendEvent).toHaveBeenCalledWith({ type: 'approval', payload: { approved: true } });
  });

  it('handleButton parses instance ID for revise', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);
    env.CONTENT_WORKFLOW.get = vi.fn().mockResolvedValue({ sendEvent: mockSendEvent });

    const response = await handler.handleButton({
      type: 3,
      token: 'token',
      data: { custom_id: 'publish_revise:workflow-user-123-1234567890' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(7);
    expect((response.data as any).content).toContain('cancelled');
    expect(env.CONTENT_WORKFLOW.get).toHaveBeenCalledWith('workflow-user-123-1234567890');
    expect(mockSendEvent).toHaveBeenCalledWith({ type: 'approval', payload: { approved: false } });
  });

  it('handleButton returns error when custom_id has no instance ID', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);

    const response = await handler.handleButton({
      type: 3,
      token: 'token',
      data: { custom_id: 'publish_approve' },
      member: { user: { id: 'user-123', username: 'neo' } },
    } satisfies DiscordInteraction);

    expect(response.type).toBe(4);
    expect((response.data as any).content).toContain('Could not find');
  });
});
