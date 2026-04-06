import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { postToChannel } from './discord';
import { searchWeb, summarizeSearchResults } from './exa';
import type { Env, WorkflowChannels } from './env';
import { PROMPTS, sanitizeTopic, countWords, countCharacters } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowParams {
  topic: string;
  userId: string;
  channels: WorkflowChannels;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export class ContentWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { topic: rawTopic, channels } = event.payload;
    const topic = sanitizeTopic(rawTopic);

    if (!this.env.MINIMAX_API_KEY) {
      await postToChannel(channels.research, '❌ **ERROR**: MINIMAX_API_KEY not configured. Please set it via `wrangler secret put MINIMAX_API_KEY`', this.env.DISCORD_BOT_TOKEN);
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const miniMax = new MiniMaxClient(this.env.MINIMAX_API_KEY);
    const botToken = this.env.DISCORD_BOT_TOKEN;

    // RESEARCH
    await postToChannel(channels.research, '🔍 **Research Phase** - Searching the web...', botToken);

    const research = await step.do('research', async () => {
      if (this.env.EXA_API_KEY) {
        const results = await searchWeb(`${topic} latest news, trends, insights, statistics`, this.env.EXA_API_KEY);
        await postToChannel(channels.research, `Found ${results.length} search results. Generating summary...`, botToken);
        const summary = await summarizeSearchResults(results);
        return await miniMax.chat([{
          role: 'user',
          content: PROMPTS.RESEARCH_WITH_EXA.replace('{summary}', summary).replace('{topic}', topic),
        }], { maxTokens: 1600 });
      }
      await postToChannel(channels.research, 'No EXA_API_KEY found. Using training knowledge...', botToken);
      return await miniMax.chat([{
        role: 'user',
        content: PROMPTS.RESEARCH_FALLBACK.replace('{topic}', topic),
      }], { maxTokens: 1600 });
    });

    if (this.env.CACHE) {
      const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await this.env.CACHE.put(key, research, { expirationTtl: 86400 });
    }
    await postToChannel(channels.research, `✅ **Research Phase Complete**\n\n${research}\n\n_Word count: ${countWords(research)} | Characters: ~${countCharacters(research)}_`, botToken);

    // DRAFT
    const draft = await step.do('draft', async () => {
      await postToChannel(channels.draft, '✍️ **Draft Phase** - Writing...', botToken);
      return await miniMax.chat([{ role: 'user', content: PROMPTS.DRAFT.replace('{topic}', topic).replace('{research}', research) }], { maxTokens: 2000 });
    });
    await postToChannel(channels.draft, `✅ **Draft Phase Complete**\n\n${draft}\n\n_Word count: ${countWords(draft)} | Characters: ~${countCharacters(draft)}_`, botToken);

    // EDIT
    const edited = await step.do('edit', async () => {
      await postToChannel(channels.edit, '🔍 **Edit Phase** - Reviewing...', botToken);
      return await miniMax.chat([{ role: 'user', content: PROMPTS.EDIT.replace('{draft}', draft) }], { maxTokens: 1200 });
    });
    await postToChannel(channels.edit, `✅ **Edit Phase Complete**\n\n${edited}\n\n_Word count: ${countWords(edited)} | Characters: ~${countCharacters(edited)}_`, botToken);

    // FINAL
    const finalBlog = await step.do('final', async () => {
      await postToChannel(channels.final, '✨ **Final Phase** - Polishing...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.FINAL.replace('{topic}', topic).replace('{draft}', draft).replace('{tips}', edited) }], { maxTokens: 2000 });
      if (!result || result.trim().length === 0) {
        throw new Error('Final phase returned empty content');
      }
      return result;
    });
    await postToChannel(channels.final, `✅ **Final Phase Complete**\n\n${finalBlog}\n\n_Word count: ${countWords(finalBlog)} | Characters: ~${countCharacters(finalBlog)}_`, botToken);

    // SOCIAL
    const facebook = await step.do('social-facebook', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating Facebook post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.FACEBOOK.replace('{blog}', finalBlog) }], { maxTokens: 1000 });
      if (!result || result.trim().length === 0) {
        throw new Error('Facebook returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **Facebook**\n${facebook}\n\n_Word count: ${countWords(facebook)} | Characters: ~${countCharacters(facebook)}_`, botToken);

    const twitter = await step.do('social-twitter', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating X/Twitter post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.TWITTER.replace('{blog}', finalBlog) }], { maxTokens: 1000 });
      if (!result || result.trim().length === 0) {
        throw new Error('X/Twitter returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **X/Twitter**\n${twitter}\n\n_Word count: ${countWords(twitter)} | Characters: ~${countCharacters(twitter)}_`, botToken);

    const linkedin = await step.do('social-linkedin', async () => {
      await postToChannel(channels.social, '📱 **Social Phase** - Creating LinkedIn post...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.LINKEDIN.replace('{blog}', finalBlog) }], { maxTokens: 1500 });
      if (!result || result.trim().length === 0) {
        throw new Error('LinkedIn returned empty content');
      }
      return result;
    });
    await postToChannel(channels.social, `✅ **LinkedIn**\n${linkedin}\n\n_Word count: ${countWords(linkedin)} | Characters: ~${countCharacters(linkedin)}_`, botToken);

    await postToChannel(channels.social, '✅ **Social Phase Complete**', botToken);
  }
}
