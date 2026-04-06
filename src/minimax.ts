export interface MiniMaxMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class MiniMaxClient {
  private apiKey: string;
  private baseUrl = 'https://api.minimax.chat/v1';
  private model = 'MiniMax-Text-01';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: MiniMaxMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, temperature: options.temperature ?? 0.7, max_tokens: options.maxTokens ?? 4096 }),
    });

    if (!res.ok) throw new Error(`MiniMax API error: ${res.status} - ${await res.text()}`);

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    if (!data.choices?.[0]) throw new Error('No response from MiniMax');
    return data.choices[0].message.content;
  }

  async chatWithRetry(messages: MiniMaxMessage[], options: { temperature?: number; maxTokens?: number; retries?: number } = {}): Promise<string> {
    const { retries = 3 } = options;
    let last: Error | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        return await this.chat(messages, options);
      } catch (err) {
        last = err as Error;
        if (i < retries - 1) await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
    throw last;
  }
}
