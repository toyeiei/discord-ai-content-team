import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { postToChannel } from './discord';
import { searchWeb, summarizeSearchResults } from './exa';
import type { Env, WorkflowChannels } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowParams {
  topic: string;
  userId: string;
  channels: WorkflowChannels;
}

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const RESEARCH_WITH_EXA_PROMPT = `You are a research analyst. Based on the following web search results, create a concise research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

**CRITICAL: Keep the summary to 150-200 words max. Be concise and focused.**

Provide:
- Key findings (bullet list)
- Top 3-5 points to cover in the blog
- Any important statistics or facts

Use bullet points and keep it brief.`;

const DRAFT_PROMPT = `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

**CRITICAL: Write a draft of 180-220 words. Stay within Discord message limits (under 2000 characters).**

Write a blog post with:
- Engaging title
- Introduction (2-3 sentences)
- 3-4 key points with supporting details
- Conclusion with call to action`;

const EDIT_PROMPT = `You are a senior editor. Review the draft below and provide 3-5 clear, actionable revision tips.

**CRITICAL: Keep your tips to 100-150 words max (under 1200 characters). Be concise.**

Draft:
{draft}

Provide 3-5 specific, actionable tips to improve clarity, engagement, and impact. Use bullet points.`;

const FINAL_PROMPT = `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Original draft:
{draft}

Revision tips:
{tips}

Apply the revision tips above to improve the draft. Return the final polished blog post only - no preamble, no explanation.

Length: 200-300 words.`;

const FACEBOOK_PROMPT = `Convert this blog post into a Facebook post.

Requirements:
- Tone: Conversational, friendly, engaging
- Include: An emoji or two and a call to action
- Length: 600-800 characters

Blog post:
{blog}`;

const TWITTER_PROMPT = `Convert this blog post into an X/Twitter post.

Requirements:
- Tone: Bold, punchy, concise
- Include: Trending language or hashtags if appropriate
- Length: 600-800 characters

Blog post:
{blog}`;

const LINKEDIN_PROMPT = `Convert this blog post into a LinkedIn post.

Requirements:
- Tone: Professional, insightful, authoritative
- Include: A key takeaway or perspective
- Length: 800-1200 characters

Blog post:
{blog}`;

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export class ContentWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { topic, channels } = event.payload;
    
    // Check if MINIMAX_API_KEY is configured
    if (!this.env.MINIMAX_API_KEY) {
      await postToChannel(channels.research, '❌ **ERROR**: MINIMAX_API_KEY not configured. Please set it via `wrangler secret put MINIMAX_API_KEY`', this.env.DISCORD_BOT_TOKEN);
      throw new Error('MINIMAX_API_KEY not configured');
    }
    
    const miniMax = new MiniMaxClient(this.env.MINIMAX_API_KEY);
    const botToken = this.env.DISCORD_BOT_TOKEN;

    // RESEARCH
    await postToChannel(channels.research, '🔍 **Research Phase** - Searching the web...', botToken);
    
    const research = await step.do('research', async () => {
      // Use EXA for real web search if API key is available
      if (this.env.EXA_API_KEY) {
        const results = await searchWeb(`${topic} latest news, trends, insights, statistics`, this.env.EXA_API_KEY);
        await postToChannel(channels.research, `Found ${results.length} search results. Generating summary...`, botToken);
        const summary = await summarizeSearchResults(results);
        return await miniMax.chat([{
          role: 'user',
          content: RESEARCH_WITH_EXA_PROMPT.replace('{summary}', summary).replace('{topic}', topic),
        }], { maxTokens: 1600 });
      }
      // Fallback: use MiniMax's training knowledge
      await postToChannel(channels.research, 'No EXA_API_KEY found. Using training knowledge...', botToken);
      return await miniMax.chat([{
        role: 'user',
        content: `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles.\n\nTopic: ${topic}\n\n**CRITICAL: Keep the summary to 150-200 words max. Be concise and focused.**`,
      }], { maxTokens: 1600 });
    });
    
    if (this.env.CACHE) {
      const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await this.env.CACHE.put(key, research, { expirationTtl: 86400 });
    }
    await postToChannel(channels.research, `✅ **Research Phase Complete**\n\n${research}\n\n_Word count: ${research.split(' ').filter(Boolean).length} | Characters: ~${research.length}_`, botToken);

    // DRAFT
    const draft = await step.do('draft', async () => {
      await postToChannel(channels.draft, '✍️ **Draft Phase** - Writing...', botToken);
      return await miniMax.chat([{ role: 'user', content: DRAFT_PROMPT.replace('{topic}', topic).replace('{research}', research) }], { maxTokens: 2000 });
    });
    await postToChannel(channels.draft, `✅ **Draft Phase Complete**\n\n${draft}\n\n_Word count: ${draft.split(' ').filter(Boolean).length} | Characters: ~${draft.length}_`, botToken);

    // EDIT
    const edited = await step.do('edit', async () => {
      await postToChannel(channels.edit, '🔍 **Edit Phase** - Reviewing...', botToken);
      return await miniMax.chat([{ role: 'user', content: EDIT_PROMPT.replace('{draft}', draft) }], { maxTokens: 1200 });
    });
    await postToChannel(channels.edit, `✅ **Edit Phase Complete**\n\n${edited}\n\n_Word count: ${edited.split(' ').filter(Boolean).length} | Characters: ~${edited.length}_`, botToken);

    // FINAL
    const finalBlog = await step.do('final', async () => {
      await postToChannel(channels.final, '✨ **Final Phase** - Polishing...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: FINAL_PROMPT.replace('{topic}', topic).replace('{draft}', draft).replace('{tips}', edited) }], { maxTokens: 2000 });
      if (!result || result.trim().length === 0) {
        throw new Error('Final phase returned empty content');
      }
      return result;
    });
    await postToChannel(channels.final, `✅ **Final Phase Complete**\n\n${finalBlog}\n\n_Word count: ${finalBlog.split(' ').filter(Boolean).length} | Characters: ~${finalBlog.length}_`, botToken);

    // SOCIAL
    const facebook = await step.do('social-facebook', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating Facebook post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: FACEBOOK_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 1000 });
      if (!result || result.trim().length === 0) {
        throw new Error('Facebook returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **Facebook**\n${facebook}\n\n_Word count: ${facebook.split(' ').filter(Boolean).length} | Characters: ~${facebook.length}_`, botToken);

    const twitter = await step.do('social-twitter', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating X/Twitter post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: TWITTER_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 1000 });
      if (!result || result.trim().length === 0) {
        throw new Error('X/Twitter returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **X/Twitter**\n${twitter}\n\n_Word count: ${twitter.split(' ').filter(Boolean).length} | Characters: ~${twitter.length}_`, botToken);

    const linkedin = await step.do('social-linkedin', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating LinkedIn post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: LINKEDIN_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 1500 });
      if (!result || result.trim().length === 0) {
        throw new Error('LinkedIn returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **LinkedIn**\n${linkedin}\n\n_Word count: ${linkedin.split(' ').filter(Boolean).length} | Characters: ~${linkedin.length}_`, botToken);
    
    await postToChannel(channels.social, '✅ **Social Phase Complete**', botToken);
  }
}
