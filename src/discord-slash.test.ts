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
      CHANNEL_RESEARCH: 'ch-research',
      CHANNEL_DRAFT: 'ch-draft',
      CHANNEL_EDIT: 'ch-edit',
      CHANNEL_FINAL: 'ch-final',
      CHANNEL_SOCIAL: 'ch-social',
      CHANNEL_APPROVAL: 'ch-approval',
      WORKFLOW: {
        get: vi.fn(),
        idFromName: vi.fn(),
      },
      CACHE: null,
    }) as unknown as Env;

  it('schedules create workflow with waitUntil and returns an immediate response', async () => {
    const env = makeEnv();
    const handler = new DiscordSlashHandler(env);
    const runWorkflowSpy = vi
      .spyOn(handler as any, 'runWorkflow')
      .mockImplementation(async () => undefined);
    const waitUntil = vi.fn();

    const response = await handler.handleInteraction(
      {
        type: 2,
        token: 'interaction-token',
        guild_id: 'guild-123',
        member: { user: { id: 'user-123', username: 'neo' } },
        data: {
          name: 'create',
          options: [{ name: 'topic', value: 'macbook neo 2026 reviews' }],
        },
      } satisfies DiscordInteraction,
      { waitUntil, passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext,
    );

    expect(response).toEqual({
      type: 4,
      data: { content: 'Starting workflow for: **macbook neo 2026 reviews**' },
    });
    expect(runWorkflowSpy).toHaveBeenCalledWith('user-123', 'macbook neo 2026 reviews');
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

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
});
