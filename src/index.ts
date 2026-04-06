import nacl from 'tweetnacl';
import { WorkflowStateDO } from './env';
import type { Env } from './env';
import { DiscordSlashHandler } from './discord-slash';
import type { DiscordInteraction } from './discord-slash';

function hexToUint8Array(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
}

function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const message = new TextEncoder().encode(timestamp + body);
  return nacl.sign.detached.verify(
    message,
    hexToUint8Array(signature),
    hexToUint8Array(publicKey),
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: Date.now() });
    }

    // Discord Interactions endpoint (slash commands + buttons)
    if (url.pathname === '/discord' && request.method === 'POST') {
      try {
        const rawBody = await request.text();
        const signature = request.headers.get('X-Signature-Ed25519') || '';
        const timestamp = request.headers.get('X-Signature-Timestamp') || '';

        if (!signature || !timestamp) {
          return new Response('Missing signature headers', { status: 401 });
        }

        const valid = verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody);
        if (!valid) {
          return new Response('Invalid request signature', { status: 401 });
        }

        const body = JSON.parse(rawBody) as DiscordInteraction;

        // PING
        if (body.type === 1) {
          return Response.json({ type: 1 });
        }

        // APPLICATION_COMMAND (slash commands)
        if (body.type === 2) {
          const handler = new DiscordSlashHandler(env);
          const response = await handler.handleInteraction(body, ctx);
          return Response.json(response);
        }

        // MESSAGE_COMPONENT (button clicks)
        if (body.type === 3) {
          const handler = new DiscordSlashHandler(env);
          const response = await handler.handleButton(body);
          return Response.json(response);
        }

        return Response.json({ error: 'Unsupported interaction type' }, { status: 400 });
      } catch (error) {
        console.error('Discord interaction error:', error);
        return Response.json({ error: 'Internal error' }, { status: 500 });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env, undefined>;

export { WorkflowStateDO };
