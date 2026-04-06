/**
 * One-time script to create the AI Media Team category and channels.
 * Run: npx tsx setup-channels.ts
 *
 * After running, set the channel IDs as Wrangler secrets:
 *   wrangler secret put CHANNEL_RESEARCH
 *   wrangler secret put CHANNEL_DRAFT
 *   etc.
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_BOT_TOKEN || !GUILD_ID) {
  console.error('Required env vars: DISCORD_BOT_TOKEN, GUILD_ID');
  process.exit(1);
}

const CHANNELS = ['research', 'draft', 'edit', 'final', 'social', 'approval'];

async function setup() {
  // Create category
  console.log('Creating category "AI Media Team"...');
  const catRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify({ name: 'AI Media Team', type: 4 }),
  });

  if (!catRes.ok) {
    const err = await catRes.text();
    console.error('Failed to create category:', err);
    process.exit(1);
  }

  const category = await catRes.json() as { id: string };
  console.log(`Category created: ${category.id}`);

  // Create channels
  for (const name of CHANNELS) {
    const chRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        name,
        type: 0,
        parent_id: category.id,
        topic: `AI Media Team - ${name}`,
      }),
    });

    if (!chRes.ok) {
      const err = await chRes.text();
      console.error(`Failed to create #${name}:`, err);
      continue;
    }

    const channel = await chRes.json() as { id: string };
    console.log(`#${name} created: ${channel.id}`);
  }

  console.log('\nDone! Now set these channel IDs as Wrangler secrets:');
  console.log('  wrangler secret put CHANNEL_RESEARCH');
  console.log('  wrangler secret put CHANNEL_DRAFT');
  console.log('  wrangler secret put CHANNEL_EDIT');
  console.log('  wrangler secret put CHANNEL_FINAL');
  console.log('  wrangler secret put CHANNEL_SOCIAL');
  console.log('  wrangler secret put CHANNEL_APPROVAL');
}

setup();
