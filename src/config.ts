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
  RESEARCH_WITH_EXA: `You are a research analyst. Based on the following web search results, create a concise research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

**CRITICAL: Keep the summary to 150-200 words max. Be concise and focused.**

Provide:
- Key findings (bullet list)
- Top 3-5 points to cover in the blog
- Any important statistics or facts

Use bullet points and keep it brief.`,

  RESEARCH_FALLBACK: `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles.

Topic: {topic}

**CRITICAL: Keep the summary to 150-200 words max. Be concise and focused.**`,

  DRAFT: `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

**CRITICAL: Write a draft of 180-220 words. Stay within Discord message limits (under 2000 characters).**

Write a blog post with:
- Engaging title
- Introduction (2-3 sentences)
- 3-4 key points with supporting details
- Conclusion with call to action`,

  EDIT: `You are a senior editor. Review the draft below and provide 3-5 clear, actionable revision tips.

**CRITICAL: Keep your tips to 100-150 words max (under 1200 characters). Be concise.**

Draft:
{draft}

Provide 3-5 specific, actionable tips to improve clarity, engagement, and impact. Use bullet points.`,

  FINAL: `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Original draft:
{draft}

Revision tips:
{tips}

Apply the revision tips above to improve the draft. Return the final polished blog post only - no preamble, no explanation.

Length: 200-300 words.`,

  FACEBOOK: `Convert this blog post into a Facebook post.

Requirements:
- Tone: Conversational, friendly, engaging
- Include: An emoji or two and a call to action
- Length: 600-800 characters

Blog post:
{blog}`,

  TWITTER: `Convert this blog post into an X/Twitter post.

Requirements:
- Tone: Bold, punchy, concise
- Include: Trending language or hashtags if appropriate
- Length: 600-800 characters

Blog post:
{blog}`,

  LINKEDIN: `Convert this blog post into a LinkedIn post.

Requirements:
- Tone: Professional, insightful, authoritative
- Include: A key takeaway or perspective
- Length: 800-1200 characters

Blog post:
{blog}`,
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
