import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { postToChannel, postApprovalMessage } from './discord';
import { searchWeb, summarizeSearchResults } from './exa';
import { GitHubClient } from './github';
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
      await postToChannel(channels.edit, '🔍 **Edit Phase** - Reviewing draft...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.EDIT.replace('{draft}', draft) }], { maxTokens: 1500 });
      if (!result || result.trim().length < 50) {
        throw new Error('Edit phase returned insufficient content');
      }
      return result;
    });
    await postToChannel(channels.edit, `✅ **Edit Phase Complete**\n\n${edited}\n\n_Word count: ${countWords(edited)} | Characters: ~${countCharacters(edited)}_`, botToken);

    // FINAL
    const finalBlog = await step.do('final', async () => {
      await postToChannel(channels.final, '✨ **Final Phase** - Polishing...', botToken);
      const result = await miniMax.chat([{ role: 'user', content: PROMPTS.FINAL.replace('{topic}', topic).replace('{draft}', draft).replace('{feedback}', edited) }], { maxTokens: 2500 });
      if (!result || result.trim().length < 50) {
        throw new Error('Final phase returned insufficient content');
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

    await postToChannel(channels.final, '✅ **Social Phase Complete**\n\n⏳ **Awaiting Approval**\n\nClick **Approve** to publish to GitHub Pages or **Revise** to go back to editing.', botToken);

    // Send approval buttons
    await postApprovalMessage(channels.final, botToken);

    // Wait for approval
     
    const approvalEvent = await step.waitForEvent<{ approved?: boolean }>('approval', {
      type: 'approval',
      timeout: 86400, // 24 hours
    });

    const approved = approvalEvent?.payload?.approved === true;

    if (!approved) {
      await postToChannel(channels.final, '❌ **Publish Cancelled**\n\nUse `/create` to start a new workflow.', botToken);
      throw new Error('Publish cancelled by user');
    }

    // PUBLISH
    const githubPagesUrl = 'https://toyeiei.github.io/discord-ai-content-team/';

    await step.do('publish', async () => {
      await postToChannel(channels.final, '🚀 **Publish Phase** - Pushing to GitHub Pages...', botToken);

      if (!this.env.GITHUB_TOKEN || !this.env.GITHUB_REPO) {
        throw new Error('GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO.');
      }

      const github = new GitHubClient(this.env.GITHUB_TOKEN, this.env.GITHUB_REPO);

      // Generate excerpt (max 160 chars)
      const excerpt = finalBlog.slice(0, 157).replace(/\n/g, ' ').trim() + '...';

      // Extract title from blog post (first # heading)
      const titleMatch = finalBlog.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : topic;

      const slug = await github.publishBlogPost(title, finalBlog, excerpt, topic, facebook);

      await postToChannel(channels.final, `✅ **Published!**\n📝 Post: \`${slug}\`\n🔗 Check your GitHub Pages site.`, botToken);
      return slug;
    });

    // Send to publish channel
    await postToChannel(channels.publish, `🎉 **New Post Published!**\n\n📝 **Topic:** ${topic}\n🔗 **Read it here:** ${githubPagesUrl}`, botToken);
  }
}
