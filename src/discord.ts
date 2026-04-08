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

export async function postToChannel(channelId: string, content: string, botToken: string): Promise<void> {
  const MAX_LENGTH = 1900;
  
  if (content.length <= MAX_LENGTH) {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
      body: JSON.stringify({ content }),
    });
    return;
  }

  // Split into chunks
  const chunks: string[] = [];
  let remaining = content;
  
  while (remaining.length > MAX_LENGTH) {
    chunks.push(remaining.slice(0, MAX_LENGTH));
    remaining = remaining.slice(MAX_LENGTH);
  }
  chunks.push(remaining);

  // Post each chunk
  for (let i = 0; i < chunks.length; i++) {
    const header = chunks.length > 1 ? `📄 [${i + 1}/${chunks.length}]\n` : '';
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
      body: JSON.stringify({ content: header + chunks[i] }),
    });
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function createThread(
  channelId: string,
  topic: string,
  botToken: string,
): Promise<string | null> {
  // Step 1: Create a message to use as the thread starter
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({ content: `Starting workflow for: **${topic}**` }),
  });

  if (!msgRes.ok) {
    console.error('Failed to create message:', await msgRes.text());
    return null;
  }

  const msgData = await msgRes.json() as { id: string };
  const messageId = msgData.id;

  // Step 2: Create a thread from that message
  const threadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify({
      name: topic.slice(0, 90),
      auto_archive_duration: 1440, // 24 hours
    }),
  });

  if (!threadRes.ok) {
    console.error('Failed to create thread:', await threadRes.text());
    return null;
  }

  const threadData = await threadRes.json() as { id: string };
  return threadData.id;
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

  if (!res.ok) {
    return null;
  }

  const messages = await res.json() as Array<{ content: string }>;
  const match = messages
    .map((m) => m.content.match(/`([^`]+)`/)?.[1])
    .find(Boolean);

  return match || null;
}

export async function postApprovalMessage(channelId: string, botToken: string, workflowId?: string): Promise<void> {
  const approveId = workflowId ? `publish_approve:${workflowId}` : 'publish_approve';
  const reviseId = workflowId ? `publish_revise:${workflowId}` : 'publish_revise';

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: 'Approve',
          custom_id: approveId,
        },
        {
          type: 2,
          style: 4,
          label: 'Revise',
          custom_id: reviseId,
        },
      ],
    },
  ];

  const body: Record<string, unknown> = {
    content: '**Publish to GitHub Pages?**\n✅ Approve to publish | ❌ Revise to go back',
    components,
  };

  if (workflowId) {
    body.content = `**Publish to GitHub Pages?**\n✅ Approve to publish | ❌ Revise to go back\n\nWorkflow: \`${workflowId}\``;
  }

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify(body),
  });
}


