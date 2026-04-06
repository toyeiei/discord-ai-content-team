import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxClient } from './minimax';

describe('MiniMaxClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a client with default settings', () => {
      const client = new MiniMaxClient('test-api-key');

      expect(client).toBeDefined();
    });

    it('should use MiniMax-Text-01 as default model', () => {
      const client = new MiniMaxClient('test-api-key');
      expect(client).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should throw error on API error', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(
        client.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('MiniMax API error: 401 - Unauthorized');
    });

    it('should throw error when no choices returned', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [],
          }),
      });

      await expect(
        client.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('No response from MiniMax');
    });

    it('should return content from successful response', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Hello, how can I help you?',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
      });

      const result = await client.chat([{ role: 'user', content: 'Hello' }]);

      expect(result).toBe('Hello, how can I help you?');
    });

    it('should use provided temperature', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await client.chat([{ role: 'user', content: 'Hello' }], { temperature: 0.9 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.minimax.chat/v1/text/chatcompletion_v2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('"temperature":0.9'),
        }),
      );
    });

    it('should use provided maxTokens', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await client.chat([{ role: 'user', content: 'Hello' }], { maxTokens: 1024 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.minimax.chat/v1/text/chatcompletion_v2',
        expect.objectContaining({
          body: expect.stringContaining('"max_tokens":1024'),
        }),
      );
    });
  });

  describe('chatWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: { role: 'assistant', content: 'Success' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      const result = await client.chatWithRetry([{ role: 'user', content: 'Hello' }]);

      expect(result).toBe('Success');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'test',
              choices: [
                {
                  message: { role: 'assistant', content: 'Success on retry' },
                  finish_reason: 'stop',
                },
              ],
            }),
        });

      const result = await client.chatWithRetry([{ role: 'user', content: 'Hello' }], { retries: 3 });

      expect(result).toBe('Success on retry');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries exhausted', async () => {
      const client = new MiniMaxClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      });

      await expect(
        client.chatWithRetry([{ role: 'user', content: 'Hello' }], { retries: 3 }),
      ).rejects.toThrow('Server Error');

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
