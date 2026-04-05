import { WorkflowStateDO } from './env';
import type { Env } from './env';
import { DiscordSlashHandler } from './discord-slash';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: Date.now() });
    }

    // Discord Slash Command endpoint
    if (url.pathname === '/discord' && request.method === 'POST') {
      try {
        const body = await request.json();
        const handler = new DiscordSlashHandler(env);
        const response = await handler.handleInteraction(body);
        return Response.json(response);
      } catch (error) {
        console.error('Discord interaction error:', error);
        return Response.json({ error: 'Internal error' }, { status: 500 });
      }
    }

    // Reaction handler endpoint (called by Discord message reaction events)
    if (url.pathname === '/reaction' && request.method === 'POST') {
      try {
        const body = await request.json() as { userId: string; channelId: string; emoji: string };
        const handler = new DiscordSlashHandler(env);
        await handler.handleReaction(body.userId, body.channelId, body.emoji);
        return Response.json({ ok: true });
      } catch (error) {
        console.error('Reaction handler error:', error);
        return Response.json({ error: 'Internal error' }, { status: 500 });
      }
    }

    if (url.pathname === '/workflow' && request.method === 'POST') {
      const body = await request.json() as { 
        action: string; 
        userId: string; 
        channelId?: string; 
        topic?: string;
        stepData?: Record<string, string>;
        step?: string;
        message?: string;
      };
      
      const workflowId = `workflow-${body.userId}`;
      const workflowStub = env.WORKFLOW.get(env.WORKFLOW.idFromName(workflowId));
      
      let endpoint = '/status';
      let method = 'GET';
      let reqBody: string | null = null;

      switch (body.action) {
        case 'create':
          endpoint = '/init';
          method = 'POST';
          reqBody = JSON.stringify({ 
            topic: body.topic, 
            userId: body.userId, 
            channelId: body.channelId, 
          });
          break;
        case 'status':
          endpoint = '/status';
          break;
        case 'advance':
          endpoint = '/advance';
          method = 'POST';
          break;
        case 'set-data':
          endpoint = '/set-data';
          method = 'POST';
          reqBody = JSON.stringify(body.stepData);
          break;
        case 'set-step':
          endpoint = '/set-step';
          method = 'POST';
          reqBody = JSON.stringify({ step: body.step });
          break;
        case 'set-error':
          endpoint = '/set-error';
          method = 'POST';
          reqBody = JSON.stringify({ message: body.message });
          break;
        case 'approve':
          endpoint = '/approve';
          method = 'POST';
          break;
        case 'retry':
          endpoint = '/retry';
          method = 'POST';
          break;
        case 'cancel':
          endpoint = '/cancel';
          method = 'POST';
          break;
      }

      const response = await workflowStub.fetch(new Request(`http://localhost${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: reqBody || undefined,
      }));

      const data = await response.json();
      return Response.json(data, { status: response.status });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env, undefined>;

export { WorkflowStateDO };
