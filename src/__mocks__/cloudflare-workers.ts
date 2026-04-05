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
