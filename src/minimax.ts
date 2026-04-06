export interface MiniMaxMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('429') || message.includes('rate limit') || message.includes('timeout') || message.includes('network');
  }
  return false;
}

export class MiniMaxClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.io/v1';
    this.model = 'MiniMax-M2.7-highspeed';
  }

  async chat(
    messages: MiniMaxMessage[],
    options: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] } = {},
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const requestBody: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      };

      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools.map(tool => ({
          type: 'function',
          function: tool,
        }));
      }

      const makeRequest = async (): Promise<Response> => {
        return fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      };

      let res: Response;
      try {
        res = await withRetry(makeRequest, { shouldRetry: isRetryableError });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        throw new Error(`MiniMax API error: ${res.status} - ${await res.text()}`);
      }

      const data = await res.json() as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      if (!data.choices?.[0]) {
        throw new Error('No response from MiniMax');
      }

      const choice = data.choices[0].message;

      if (choice.tool_calls && choice.tool_calls.length > 0) {
        const toolCalls = choice.tool_calls.map(tc => ({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }));
        return JSON.stringify({ toolCalls });
      }

      return choice.content ?? '';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('MiniMax API request timed out');
      }
      throw error;
    }
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = 3, retryDelayMs = 1000, shouldRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && (shouldRetry === undefined || shouldRetry(error))) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  throw lastError;
}
