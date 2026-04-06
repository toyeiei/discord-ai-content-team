import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { searchWeb, summarizeSearchResults } from './exa';
import { postToChannel } from './discord';
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

const RESEARCH_PROMPT = `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles.

Topic: {topic}

**CRITICAL: Keep the summary under 1600 characters and 250 words max. Be concise and focused.**`;

const RESEARCH_WITH_EXA_PROMPT = `You are a research analyst. Based on the following web search results, create a concise research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

**CRITICAL: Keep the summary under 1600 characters and 250 words max. Be concise and focused.**

Provide:
- Key findings (bullet list)
- Top 3-5 points to cover in the blog
- Any important statistics or facts

Use bullet points and keep it brief.`;

const DRAFT_PROMPT = `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

**CRITICAL: Keep the draft UNDER 1600 characters. No exceptions. This must fit in a single Discord message.**

Write a concise blog post with:
- Engaging title
- Short intro (1-2 sentences)
- 2-3 key points
- Brief conclusion

Be extremely concise.`;

const EDIT_PROMPT = `You are a senior editor. Review the draft below and provide 3-5 clear, actionable revision tips.

**CRITICAL: Keep your tips under 1200 characters total. Be concise.**

Draft:
{draft}

Provide 3-5 specific, actionable tips to improve clarity, engagement, and impact. Use bullet points.`;

const FINAL_PROMPT = `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Edited draft:
{edited}

**CRITICAL: Keep the blog post under 1600 characters and 300 words max. Be concise and focused.**

Return only the final polished blog post.`;

const FACEBOOK_PROMPT = `You are a social media strategist. Write a Facebook post based on this blog post.

Blog post:
{blog}

**CRITICAL: Keep it under 320 characters. Make it engaging and include a call to action if appropriate.**`;

const TWITTER_PROMPT = `You are a social media strategist. Write an X/Twitter post based on this blog post.

Blog post:
{blog}

**CRITICAL: Keep it under 280 characters. Make it punchy and engaging.**`;

const LINKEDIN_PROMPT = `You are a social media strategist. Write a LinkedIn post based on this blog post.

Blog post:
{blog}

**CRITICAL: Keep it under 900 characters. Make it professional and insightful.**`;

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
    
    let research: string;
    if (this.env.EXA_API_KEY) {
      const results = await step.do('research-web', async () => {
        return await searchWeb(`${topic} latest news, trends, insights, statistics`, this.env.EXA_API_KEY);
      });
      await postToChannel(channels.research, `🔍 **Research Phase** - Found ${results.length} results. Generating summary...`, botToken);
      
      const summary = await summarizeSearchResults(results);
      research = await step.do('research-summary', async () => {
        return await miniMax.chat([{
          role: 'user',
          content: RESEARCH_WITH_EXA_PROMPT.replace('{summary}', summary).replace('{topic}', topic),
        }], { maxTokens: 1600 });
      });
    } else {
      research = await step.do('research-direct', async () => {
        await postToChannel(channels.research, '🔍 **Research Phase** - No EXA_API_KEY, using MiniMax directly...', botToken);
        return await miniMax.chat([{
          role: 'user',
          content: RESEARCH_PROMPT.replace('{topic}', topic),
        }], { maxTokens: 1600 });
      });
    }
    
    if (this.env.CACHE) {
      const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await this.env.CACHE.put(key, research, { expirationTtl: 86400 });
    }
    await postToChannel(channels.research, `✅ **Research Phase Complete**\n\n${research}`, botToken);

    // DRAFT
    const draft = await step.do('draft', async () => {
      await postToChannel(channels.draft, '✍️ **Draft Phase** - Writing...', botToken);
      return await miniMax.chat([{ role: 'user', content: DRAFT_PROMPT.replace('{topic}', topic).replace('{research}', research) }], { maxTokens: 1550 });
    });
    await postToChannel(channels.draft, `✅ **Draft Phase Complete**\n\n${draft}`, botToken);

    // EDIT
    const edited = await step.do('edit', async () => {
      await postToChannel(channels.edit, '🔍 **Edit Phase** - Reviewing...', botToken);
      return await miniMax.chat([{ role: 'user', content: EDIT_PROMPT.replace('{draft}', draft) }], { maxTokens: 1200 });
    });
    await postToChannel(channels.edit, `✅ **Edit Phase Complete**\n\n${edited}`, botToken);

    // FINAL
    const finalBlog = await step.do('final', async () => {
      await postToChannel(channels.final, '✨ **Final Phase** - Polishing...', botToken);
      return await miniMax.chat([{ role: 'user', content: FINAL_PROMPT.replace('{topic}', topic).replace('{edited}', edited) }], { maxTokens: 1600 });
    });
    await postToChannel(channels.final, `✅ **Final Phase Complete**\n\n${finalBlog}`, botToken);

    // SOCIAL
    const facebook = await step.do('social-facebook', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating Facebook post...', botToken);
      return await miniMax.chat([{ role: 'user', content: FACEBOOK_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 320 });
    });
    await postToChannel(channels.social, `✅ **Facebook**\n${facebook}`, botToken);

    const twitter = await step.do('social-twitter', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating X/Twitter post...', botToken);
      return await miniMax.chat([{ role: 'user', content: TWITTER_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 280 });
    });
    await postToChannel(channels.social, `✅ **X/Twitter**\n${twitter}`, botToken);

    const linkedin = await step.do('social-linkedin', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating LinkedIn post...', botToken);
      return await miniMax.chat([{ role: 'user', content: LINKEDIN_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 900 });
    });
    await postToChannel(channels.social, `✅ **LinkedIn**\n${linkedin}`, botToken);
    
    await postToChannel(channels.social, '✅ **Social Phase Complete**', botToken);
  }
}
