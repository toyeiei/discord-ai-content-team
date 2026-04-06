/**
 * Stub for 'cloudflare:workers' used during Vitest testing.
 * The real module is a Wrangler virtual module only available at runtime.
 */
export abstract class DurableObject {
  protected ctx: { storage: { get: () => Promise<unknown>; put: () => Promise<void> } };
  protected env: unknown;

  constructor(ctx: { storage: { get: () => Promise<unknown>; put: () => Promise<void> } }, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}

export abstract class WorkflowEntrypoint<T = unknown, P = unknown> {
  protected env: T;

  constructor(ctx: unknown, env: T) {
    this.env = env;
  }

  abstract run(event: { payload: P }, step: WorkflowStep): Promise<unknown>;
}

export interface WorkflowStep {
  do(name: string, callback: () => Promise<unknown>): Promise<unknown>;
  sleep(name: string, duration: string): Promise<void>;
  waitForEvent<T = unknown>(name: string, options: { type: string; timeout: string }): Promise<{ payload: T }>;
}

export type Workflow<T = unknown, P = unknown> = {
  create(options?: { id?: string; params?: P }): Promise<WorkflowInstance>;
  get(id: string): Promise<WorkflowInstance>;
};

export interface WorkflowInstance {
  id: string;
  status(): Promise<{ status: string; error?: { name: string; message: string }; output?: unknown }>;
  sendEvent(options: { type: string; payload: unknown }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  terminate(): Promise<void>;
}
