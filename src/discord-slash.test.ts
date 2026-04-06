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
      MINIMAX_API_KEY: 'minimax-key',
      DISCORD_BOT_TOKEN: 'discord-bot-token',
      DISCORD_APP_ID: 'discord-app-id',
      DISCORD_PUBLIC_KEY: 'discord-public-key',
      GITHUB_TOKEN: 'github-token',
      GITHUB_REPO: 'owner/repo',
      DISCORD_CHANNEL_ID: 'ch-create',
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

    // Mock Discord API: thread creation
    const threadResponse = { channel_id: 'thread-123', id: 'thread-123' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(threadResponse), { status: 200 }),
    );
    // Mock: post instance ID message
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
        threadId: 'thread-123',
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
    expect((response.data as any).content).toContain('Check the thread');
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
});
