import { DurableObject } from 'cloudflare:workers';

export interface Env {
  LOADER: WorkerLoader;
  WORKFLOW: DurableObjectNamespace<WorkflowStateDO>;
  CACHE: KVNamespace;
  MINIMAX_API_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APP_ID: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  EXA_API_KEY?: string;
}

export interface WorkerLoader {
  load(code: WorkerCode): WorkerStub;
  get(id: string, callback: () => Promise<WorkerCode>): WorkerStub;
}

export interface WorkerCode {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  globalOutbound?: unknown;
  env?: Record<string, unknown>;
  tails?: unknown[];
}

export interface WorkerStub {
  getEntrypoint(): Entrypoint;
}

export interface Entrypoint {
  fetch(request: Request): Promise<Response>;
}

export class WorkflowStateDO extends DurableObject<Env> {
  private state: WorkflowState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<WorkflowState>('workflow')) ?? null;
      if (!this.state) {
        this.state = createInitialState(crypto.randomUUID(), '', '', '');
        await ctx.storage.put('workflow', this.state);
      }
    });
  }

  private async save(): Promise<void> {
    if (!this.state) {
      return;
    }
    this.state.updatedAt = Date.now();
    await this.ctx.storage.put('workflow', this.state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/init':
        return this.handleInit(request);
      case '/status':
        return this.handleStatus();
      case '/advance':
        return this.handleAdvance();
      case '/set-data':
        return this.handleSetData(request);
      case '/set-step':
        return this.handleSetStep(request);
      case '/set-error':
        return this.handleSetError(request);
      case '/approve':
        return this.handleApprove();
      case '/retry':
        return this.handleRetry();
      case '/cancel':
        return this.handleCancel();
      default:
        return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const { topic, userId, channelId } = await request.json() as {
      topic: string;
      userId: string;
      channelId: string;
    };

    if (!topic || !userId || !channelId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    this.state = createInitialState(crypto.randomUUID(), topic, userId, channelId);
    this.state.currentStep = 'RESEARCH';
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private handleStatus(): Response {
    return Response.json({
      workflow: this.state,
      canRetry: this.state ? isErrorRecoverable(this.state.currentStep) : false,
    });
  }

  private async handleAdvance(): Promise<Response> {
    if (!this.state) {
      return Response.json({ error: 'No workflow' }, { status: 400 });
    }

    const nextStep = getNextStep(this.state.currentStep);
    if (!nextStep) {
      return Response.json({ error: 'Cannot advance from current step' }, { status: 400 });
    }

    this.state.currentStep = nextStep;
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleSetData(request: Request): Promise<Response> {
    const { key, value } = await request.json() as { key: keyof WorkflowData; value: string };
    if (!this.state || !key) {
      return Response.json({ error: 'Missing key' }, { status: 400 });
    }

    (this.state.data as Record<string, unknown>)[key] = value;
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleSetStep(request: Request): Promise<Response> {
    const { step } = await request.json() as { step: WorkflowStep };
    if (!this.state || !step) {
      return Response.json({ error: 'Missing step' }, { status: 400 });
    }

    this.state.currentStep = step;
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleSetError(request: Request): Promise<Response> {
    const { message } = await request.json() as { message: string };
    if (!this.state) {
      return Response.json({ error: 'No workflow' }, { status: 400 });
    }

    this.state.currentStep = 'ERROR';
    this.state.data.errorMessage = message;
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleApprove(): Promise<Response> {
    if (!this.state || !isApprovalStep(this.state.currentStep)) {
      return Response.json({ error: 'Not in approval state' }, { status: 400 });
    }

    this.state.currentStep = 'PUBLISHED';
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleRetry(): Promise<Response> {
    if (!this.state || !isErrorRecoverable(this.state.currentStep)) {
      return Response.json({ error: 'Cannot retry from current state' }, { status: 400 });
    }

    const currentIdx = STEP_SEQUENCE.indexOf(this.state.currentStep);
    const retryFromStep = STEP_SEQUENCE[currentIdx - 1] || 'RESEARCH';
    this.state.currentStep = retryFromStep;
    this.state.data.errorMessage = undefined;
    await this.save();

    return Response.json({ workflow: this.state });
  }

  private async handleCancel(): Promise<Response> {
    if (!this.state) {
      return Response.json({ error: 'No workflow' }, { status: 400 });
    }

    this.state.currentStep = 'IDLE';
    this.state.data = {};
    this.state.data.errorMessage = undefined;
    await this.save();

    return Response.json({ workflow: this.state });
  }
}

export interface WorkflowState {
  id: string;
  topic: string;
  currentStep: WorkflowStep;
  data: WorkflowData;
  createdAt: number;
  updatedAt: number;
  userId: string;
  channelId: string;
}

export type WorkflowStep =
  | 'IDLE'
  | 'RESEARCH'
  | 'DRAFT'
  | 'EDIT'
  | 'FINAL'
  | 'SOCIAL'
  | 'AWAITING_APPROVAL'
  | 'PUBLISHED'
  | 'ERROR';

export interface WorkflowData {
  research?: string;
  draft?: string;
  edited?: string;
  finalBlog?: string;
  socialPosts?: SocialPosts;
  errorMessage?: string;
}

export interface SocialPosts {
  facebook: string;
  twitter: string;
  linkedin: string;
}

export function createInitialState(
  id: string,
  topic: string,
  userId: string,
  channelId: string,
): WorkflowState {
  return {
    id,
    topic,
    currentStep: 'IDLE',
    data: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    userId,
    channelId,
  };
}

export const STEP_SEQUENCE: WorkflowStep[] = [
  'RESEARCH',
  'DRAFT',
  'EDIT',
  'FINAL',
  'SOCIAL',
  'AWAITING_APPROVAL',
  'PUBLISHED',
];

export function getNextStep(current: WorkflowStep): WorkflowStep | null {
  const idx = STEP_SEQUENCE.indexOf(current);
  if (idx === -1 || idx >= STEP_SEQUENCE.length - 1) {
    return null;
  }
  return STEP_SEQUENCE[idx + 1];
}

export function isApprovalStep(step: WorkflowStep): boolean {
  return step === 'AWAITING_APPROVAL';
}

export function isErrorRecoverable(step: WorkflowStep): boolean {
  return step !== 'PUBLISHED' && step !== 'IDLE' && step !== 'ERROR';
}
