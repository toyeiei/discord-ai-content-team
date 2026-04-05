/**
 * Script to register Discord Slash Commands
 * Run this once after deploying the Worker
 * 
 * Usage:
 *   npx tsx register-commands.ts
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const WORKER_URL = process.env.WORKFLOW_URL?.replace('/workflow', '/discord');

if (!DISCORD_BOT_TOKEN || !DISCORD_APP_ID || !WORKER_URL) {
  console.error('Missing required env vars:');
  if (!DISCORD_BOT_TOKEN) console.error('  - DISCORD_BOT_TOKEN');
  if (!DISCORD_APP_ID) console.error('  - DISCORD_APP_ID');
  if (!WORKER_URL) console.error('  - WORKFLOW_URL (used to derive worker Discord endpoint)');
  process.exit(1);
}

const commands = [
  {
    name: 'create',
    description: 'Create a new blog post workflow',
    options: [
      {
        type: 3, // STRING
        name: 'topic',
        description: 'The blog topic to write about',
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Check the status of your current workflow',
  },
  {
    name: 'cancel',
    description: 'Cancel the current workflow',
  },
];

async function registerCommands() {
  console.log('Registering slash commands...');
  console.log(`App ID: ${DISCORD_APP_ID}`);
  console.log(`Worker URL: ${WORKER_URL}`);

  const response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to register commands:', error);
    process.exit(1);
  }

  console.log('Successfully registered commands:');
  for (const cmd of commands) {
    console.log(`  /${cmd.name} - ${cmd.description}`);
  }
}

registerCommands();
