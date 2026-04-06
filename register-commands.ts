/**
 * Register Discord Slash Commands.
 * Run: npx tsx register-commands.ts
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APP_ID = process.env.DISCORD_APP_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_APP_ID) {
  console.error('Required env vars: DISCORD_BOT_TOKEN, DISCORD_APP_ID');
  process.exit(1);
}

const commands = [
  {
    name: 'create',
    description: 'Start a new blog post workflow',
    options: [
      {
        type: 3,
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

const response = await fetch(
  `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`,
  {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  },
);

if (!response.ok) {
  console.error('Failed:', await response.text());
  process.exit(1);
}

console.log('Registered commands:');
for (const cmd of commands) {
  console.log(`  /${cmd.name} - ${cmd.description}`);
}
