/**
 * Discord API helpers used by both the Worker and Workflow.
 * These live here (not in discord-slash.ts) because the Workflow also calls Discord.
 */

export type DiscordInteraction = DiscordMessage;
export interface DiscordMessage {
  type: number;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string }>;
    custom_id?: string;
  };
  token: string;
  member?: { user: { id: string; username: string } };
  guild_id?: string;
  channel_id?: string;
  message?: { id: string };
}

export async function postToThread(threadId: string, content: string, botToken: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({ content }),
  });
}

export async function sendApprovalMessage(
  threadId: string,
  finalBlog: string,
  socialPosts: string,
  botToken: string,
): Promise<void> {
  let content = '## Content Ready for Review!\n\n';
  content += '### Blog Post:\n```\n' + truncate(finalBlog, 1500) + '\n```\n\n';

  const posts = typeof socialPosts === 'string' ? JSON.parse(socialPosts) : socialPosts;
  content += '### Social Posts:\n';
  content += `**Facebook:** ${truncate(posts.facebook || 'N/A', 200)}\n`;
  content += `**X/Twitter:** ${truncate(posts.twitter || 'N/A', 200)}\n`;
  content += `**LinkedIn:** ${truncate(posts.linkedin || 'N/A', 300)}\n`;

  await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({
      content,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Approve & Publish', custom_id: 'approve' },
          { type: 2, style: 4, label: 'Revise', custom_id: 'revise' },
        ],
      }],
    }),
  });
}

export async function createThread(
  channelId: string,
  topic: string,
  botToken: string,
): Promise<string | null> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({ content: `Starting workflow for: **${topic}**`, thread_name: topic.slice(0, 90) }),
  });

  if (!res.ok) return null;

  const data = await res.json() as { channel_id?: string; id: string };
  return data.channel_id || data.id;
}

export async function postInstanceId(threadId: string, instanceId: string, botToken: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({ content: `Workflow instance: \`${instanceId}\``, flags: 4 }),
  });
}

export async function findInstanceIdInThread(threadId: string, botToken: string): Promise<string | null> {
  const res = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages?limit=20`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!res.ok) return null;

  const messages = await res.json() as Array<{ content: string }>;
  const match = messages
    .map((m) => m.content.match(/`([^`]+)`/)?.[1])
    .find(Boolean);

  return match || null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 50) + '...\n\n_(truncated)_';
}
