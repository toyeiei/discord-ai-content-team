// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const API_CONFIG = {
  MINIMAX_BASE_URL: 'https://api.minimax.io/v1',
  MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
  MINIMAX_TIMEOUT_MS: 60_000,
  MINIMAX_MAX_RETRIES: 3,
  MINIMAX_RETRY_DELAY_MS: 1000,
} as const;

export const DISCORD_CONFIG = {
  MAX_MESSAGE_LENGTH: 1900,
  CHUNK_DELAY_MS: 100,
  AUTO_ARCHIVE_DURATION: 1440,
} as const;

export const EXA_CONFIG = {
  NUM_RESULTS: 10,
  REQUEST_TIMEOUT_MS: 30_000,
  MAX_RETRIES: 3,
} as const;

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

export const PROMPTS = {
  RESEARCH_WITH_EXA: `You are a research analyst. Based on the following web search results, create a detailed research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

Write a comprehensive research summary with:
- Key findings and insights
- 4-6 main points to cover in the blog post
- Important statistics, facts, or quotes
- Any relevant context or background

Aim for 200-300 words. Be thorough but focused.`,

  RESEARCH_FALLBACK: `You are a research analyst. Research the following topic thoroughly and provide a detailed summary.

Topic: {topic}

Provide:
- Key facts and statistics
- Recent developments and trends
- Interesting angles and perspectives
- 4-6 main points to cover

Aim for 200-300 words. Be thorough and informative.`,

  DRAFT: `You are a professional content writer. Write a complete blog post based on the research below.

Topic: {topic}

Research:
{research}

Requirements:
- Write a full blog post (300-500 words)
- Include an engaging title
- Introduction paragraph (2-3 sentences)
- 3-4 body paragraphs with key points and supporting details
- Conclusion with call to action

Make it informative, engaging, and ready for publication.`,

  EDIT: `You are a senior editor. Improve the following blog post draft.

Original Draft:
{draft}

Your task:
1. Fix any grammar, spelling, or clarity issues
2. Strengthen weak sentences or paragraphs
3. Improve flow and transitions
4. Ensure the tone is consistent and engaging
5. Return the improved version in full

Return ONLY the improved blog post, no explanations.`,

  FINAL: `You are a professional content editor. Create a polished, publication-ready version of this blog post.

Topic: {topic}

Original Draft:
{draft}

Editor Feedback:
{feedback}

Apply the feedback to improve the draft. Return the final version only - no preamble or explanation.

Target: 300-450 words.`,

  FACEBOOK: `Convert this blog post into an engaging Facebook post.

Blog Post:
{blog}

Requirements:
- Conversational, friendly tone
- Include 1-2 emojis and a call to action
- 150-300 characters
- Make it scannable and engaging for Facebook feed

Return ONLY the Facebook post text.`,

} as const;

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

export function sanitizeTopic(topic: string): string {
  return topic
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function countWords(text: string): number {
  return text.split(' ').filter(Boolean).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = API_CONFIG.MINIMAX_MAX_RETRIES, retryDelayMs = API_CONFIG.MINIMAX_RETRY_DELAY_MS, shouldRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && (shouldRetry === undefined || shouldRetry(error))) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError;
}
