# AI Media Team Bot

A Discord bot powered by Cloudflare Workers and MiniMax that orchestrates content writing workflows using **Slash Commands** (fully serverless!).

## Features

- **Research** - Gather information on any topic using Exa API + MiniMax
- **Draft** - Write initial blog post drafts
- **Edit** - Review and critique content
- **Final** - Polish into publication-ready format
- **Social** - Generate Facebook, X/Twitter, and LinkedIn posts
- **Publish** - Push approved content to GitHub Pages

## Architecture

```
User types /create topic → Discord → Cloudflare Worker (serverless!)
                                    ↓
                              Durable Objects
                                    ↓
                              MiniMax + Exa API
                                    ↓
                              GitHub Pages
```

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Copy the **Application ID** (you'll need this)
4. Go to **Bot** → Add Bot
5. Enable **Message Content Intent** under Bot settings
6. Generate and copy the **bot token**

### 2. Deploy Cloudflare Worker

```bash
cd ai-media-team

# Set secrets
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_APP_ID
wrangler secret put MINIMAX_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
wrangler secret put WORKFLOW_URL

# Deploy
wrangler deploy
```

### 3. Register Slash Commands

```bash
# Set env vars
export DISCORD_BOT_TOKEN=your_bot_token
export DISCORD_APP_ID=your_app_id
export WORKFLOW_URL=https://your-worker.workers.dev

# Register commands
npx tsx register-commands.ts
```

### 4. Add Bot to Your Server

1. Go to OAuth2 URL Generator in Discord Developer Portal
2. Select scopes: `bot`, `applications.commands`
3. Select permissions: `Send Messages`, `Read Message History`
4. Use the generated URL to add the bot to your server

## Usage

Use slash commands in any channel:

| Command | Description |
|---------|-------------|
| `/create <topic>` | Start a new blog workflow |
| `/status` | Check current workflow status |
| `/cancel` | Cancel current workflow |

## Workflow Steps

1. **Research** - Exa web search + MiniMax synthesis
2. **Draft** - Writes initial blog post
3. **Edit** - Reviews and suggests improvements
4. **Final** - Polishes to publication-ready state
5. **Social** - Generates platform-specific posts
6. **Approval** - React ✅ to publish, ❌ to revise
7. **Publish** - Pushes to GitHub Pages

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_PUBLIC_KEY` | Yes | Discord application public key |
| `MINIMAX_API_KEY` | Yes | MiniMax API key |
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `GITHUB_REPO` | Yes | GitHub repo (format: `owner/repo`) |
| `WORKFLOW_URL` | Yes | Your Worker URL |
| `EXA_API_KEY` | No | Exa API key for enhanced research |

## Development

```bash
npm install
npm run dev  # Local development
npm test     # Run tests
npm run lint # Lint code
```

## License

MIT
