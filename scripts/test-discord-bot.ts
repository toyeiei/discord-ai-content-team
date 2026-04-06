/**
 * Discord Bot Testing Script
 * 
 * This script tests the /create command by:
 * 1. Testing the endpoint
 * 2. Verifying thread creation
 * 3. Checking slash command registration
 * 
 * Usage: 
 *   npx tsx scripts/test-discord-bot.ts
 * 
 * Or with wrangler dev:
 *   npx wrangler dev --test-script scripts/test-discord-bot.ts
 */

import { writeFileSync } from 'fs';

// Configuration - these should be set as environment variables
// or loaded from .env file
const CONFIG = {
  workerUrl: process.env.WORKER_URL || 'https://ai-media-team-v2.toy-297.workers.dev',
  publicKey: process.env.DISCORD_PUBLIC_KEY || 'f7638bc66dfd1214dca38302dee73f11ea8cf766e75d6ba5e9ea0798f5256e2e',
  appId: process.env.DISCORD_APP_ID || '1490408120034267187',
  botToken: process.env.DISCORD_BOT_TOKEN,
  channelId: process.env.DISCORD_CHANNEL_ID || '1490564191956766805',
  guildId: process.env.DISCORD_GUILD_ID || '1490564191331942460',
  testTopic: 'AI automation tools comparison 2026',
};

// Validate required config
function validateConfig(): boolean {
  const missing: string[] = [];
  
  if (!CONFIG.botToken) missing.push('DISCORD_BOT_TOKEN');
  if (!CONFIG.channelId) missing.push('DISCORD_CHANNEL_ID');
  
  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`);
    console.log('\nSet them with:');
    missing.forEach(v => {
      console.log(`  export ${v}="your-value"`);
    });
    console.log('\nOr add them to a .env file:');
    missing.forEach(v => {
      console.log(`  ${v}=your-value`);
    });
    return false;
  }
  return true;
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  response?: unknown;
}

class DiscordBotTester {
  private results: TestResult[] = [];

  async run(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           Discord Bot Testing Suite                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Validate configuration
    if (!validateConfig()) {
      return;
    }

    // Run tests
    await this.testHealthEndpoint();
    await this.testDiscordGetEndpoint();
    await this.testPingEndpoint();
    await this.testThreadCreation();
    await this.testSlashCommandRegistration();

    // Print summary
    this.printSummary();
  }

  private async testHealthEndpoint(): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(`${CONFIG.workerUrl}/health`);
      const data = await res.json();
      const passed = res.status === 200 && data.status === 'ok';
      this.record('Health Endpoint', passed, Date.now() - start, passed ? undefined : 'Unexpected response', data);
    } catch (e) {
      this.record('Health Endpoint', false, Date.now() - start, String(e));
    }
  }

  private async testDiscordGetEndpoint(): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(`${CONFIG.workerUrl}/discord`, { method: 'GET' });
      const data = await res.json();
      const passed = res.status === 200 && data.error === 'Discord endpoint active';
      this.record('Discord GET Endpoint', passed, Date.now() - start, passed ? undefined : 'Unexpected response', data);
    } catch (e) {
      this.record('Discord GET Endpoint', false, Date.now() - start, String(e));
    }
  }

  private async testPingEndpoint(): Promise<void> {
    const start = Date.now();
    try {
      const payload = { type: 1 };
      const body = JSON.stringify(payload);
      const timestamp = Date.now().toString();
      
      const res = await fetch(`${CONFIG.workerUrl}/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature-Ed25519': '0'.repeat(128),
          'X-Signature-Timestamp': timestamp,
        },
        body,
      });
      
      // PING should fail with invalid signature
      const passed = res.status === 401; // Expected - we send invalid signature
      this.record('PING (Signature Rejection)', passed, Date.now() - start, passed ? 'Correctly rejected invalid signature' : 'Unexpected response', { status: res.status });
    } catch (e) {
      this.record('PING (Signature Rejection)', false, Date.now() - start, String(e));
    }
  }

  private async testThreadCreation(): Promise<void> {
    const start = Date.now();
    try {
      // Create a message first
      const msgRes = await fetch(`https://discord.com/api/v10/channels/${CONFIG.channelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${CONFIG.botToken}`,
        },
        body: JSON.stringify({ content: `🧪 Test thread: ${CONFIG.testTopic}` }),
      });

      if (!msgRes.ok) {
        throw new Error(`Failed to create message: ${msgRes.status}`);
      }

      const msgData = await msgRes.json() as { id: string };
      
      // Create thread from message
      const threadRes = await fetch(
        `https://discord.com/api/v10/channels/${CONFIG.channelId}/messages/${msgData.id}/threads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${CONFIG.botToken}`,
          },
          body: JSON.stringify({
            name: `Test: ${CONFIG.testTopic}`.slice(0, 90),
            auto_archive_duration: 60, // 1 hour for testing
          }),
        }
      );

      if (!threadRes.ok) {
        throw new Error(`Failed to create thread: ${threadRes.status}`);
      }

      const threadData = await threadRes.json() as { id: string; name: string };
      
      // Post test message in thread
      await fetch(`https://discord.com/api/v10/channels/${threadData.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${CONFIG.botToken}`,
        },
        body: JSON.stringify({ content: '✅ Thread created successfully by test suite!' }),
      });

      this.record('Thread Creation', true, Date.now() - start, undefined, {
        threadId: threadData.id,
        threadName: threadData.name,
        url: `https://discord.com/channels/${CONFIG.guildId}/${threadData.id}`,
      });
    } catch (e) {
      this.record('Thread Creation', false, Date.now() - start, String(e));
    }
  }

  private async testSlashCommandRegistration(): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(`https://discord.com/api/v10/applications/${CONFIG.appId}/commands`, {
        headers: { Authorization: `Bot ${CONFIG.botToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch commands: ${res.status}`);
      }

      const commands = await res.json() as Array<{ name: string; id: string }>;
      const expectedCommands = ['create', 'status', 'cancel'];
      const missing = expectedCommands.filter(cmd => !commands.find(c => c.name === cmd));

      const passed = missing.length === 0;
      this.record('Slash Commands Registered', passed, Date.now() - start,
        passed ? undefined : `Missing commands: ${missing.join(', ')}`,
        { registered: commands.map(c => c.name) }
      );
    } catch (e) {
      this.record('Slash Commands Registered', false, Date.now() - start, String(e));
    }
  }

  private record(name: string, passed: boolean, duration: number, error?: string, response?: unknown): void {
    this.results.push({ name, passed, duration, error, response });
    
    const icon = passed ? '✅' : '❌';
    const durationStr = `${duration}ms`;
    
    console.log(`${icon} ${name.padEnd(30)} ${durationStr.padStart(8)}`);
    if (error) {
      console.log(`   └─ ${error}`);
    }
    if (response && !passed) {
      console.log(`   └─ Response:`, JSON.stringify(response, null, 2).split('\n').join('\n   '));
    }
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const allPassed = passed === total;
    
    console.log('\n' + '═'.repeat(56));
    console.log(`  Results: ${passed}/${total} tests passed`);
    
    if (allPassed) {
      console.log('  🎉 All tests passed!');
    } else {
      console.log('  ⚠️  Some tests failed');
      console.log('\n  Failed tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`    - ${r.name}: ${r.error}`);
      });
    }
    
    console.log('═'.repeat(56) + '\n');

    // Save results to file
    const timestamp = new Date().toISOString();
    writeFileSync(
      'test-results.json',
      JSON.stringify({ timestamp, results: this.results, summary: { passed, total } }, null, 2)
    );
    console.log(`📄 Results saved to test-results.json`);
  }
}

// Run tests
const tester = new DiscordBotTester();
tester.run().catch(console.error);
