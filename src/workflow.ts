import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { GitHubClient, generateBlogMarkdown } from './github';
import { searchWeb, summarizeSearchResults } from './exa';
import { postToThread, sendApprovalMessage } from './discord';
import type { Env } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowParams {
  topic: string;
  userId: string;
  threadId: string;
}

export interface ApprovalPayload {
  approved: boolean;
}

export function parseSocialPosts(
  content: string,
): { facebook: string; twitter: string; linkedin: string } {
  const r = { facebook: '', twitter: '', linkedin: '' };
  const fb = content.match(/\*\*Facebook:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const tw = content.match(/\*\*X\/Twitter:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const li = content.match(/\*\*LinkedIn:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  if (fb) r.facebook = fb[1].trim();
  if (tw) r.twitter = tw[1].trim();
  if (li) r.linkedin = li[1].trim();
  return r;
}

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const RESEARCH_PROMPT = `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles. Format your response with clear sections.

Topic: {topic}`;

const RESEARCH_WITH_EXA_PROMPT = `You are a research analyst. Based on the following web search results, provide a comprehensive research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

Create a structured research summary with:
- Key findings and statistics
- Recent developments and trends
- Interesting angles and perspectives
- Potential points to cover in the blog

Format with clear sections.`;

const DRAFT_PROMPT = `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

Write a compelling, well-structured blog post draft with an engaging title, introduction, main body with 3-5 key points, and a conclusion.`;

const EDIT_PROMPT = `You are a senior editor reviewing a blog post draft. Review and critique the following draft. Provide specific, actionable suggestions for improvement.

Focus on:
- Clarity and readability
- Engagement and flow
- Factual accuracy
- SEO optimization opportunities
- Missing angles or perspectives

Draft:
{draft}

Provide your critique and suggested improvements.`;

const FINAL_PROMPT = `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Edited draft:
{edited}

Create a clean, final version with:
- Engaging title
- Compelling introduction
- Well-organized body
- Strong conclusion
- Proper formatting (use markdown)

Return only the final polished blog post.`;

const SOCIAL_PROMPT = `You are a social media strategist. Create social media posts for 3 platforms based on the following blog post.

Blog post:
{blog}

Create posts for:
1. Facebook - engaging, community-focused, up to 500 characters with relevant hashtags
2. X/Twitter - punchy, conversational, up to 280 characters with relevant hashtags
3. LinkedIn - professional, thought-leadership focused, up to 1300 characters with relevant hashtags

Format as:
**Facebook:**
[post]

**X/Twitter:**
[post]

**LinkedIn:**
[post]`;

const REVISE_EDIT_PROMPT = `You are a senior editor. The following blog post was sent back for revisions. Please revise it, addressing any issues with clarity, accuracy, engagement, and completeness.

Topic: {topic}
Current version:
{current}

Provide an improved version.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function publish(topic: string, finalBlog: string, socialPosts: string, env: Env): Promise<string> {
  const github = new GitHubClient(env.GITHUB_TOKEN, env.GITHUB_REPO);
  const slug = github.generateSlug(topic);
  const path = `_posts/${formatDate()}-${slug}.md`;
  const posts = typeof socialPosts === 'string' ? JSON.parse(socialPosts) : socialPosts;
  const markdown = generateBlogMarkdown(topic, finalBlog, posts);
  const ok = await github.createFile(path, markdown, `Publish: ${topic}`);
  if (!ok) throw new Error('GitHub publish failed');
  return path;
}

async function runRevision(
  topic: string,
  currentBlog: string,
  threadId: string,
  botToken: string,
  miniMax: MiniMaxClient,
): Promise<{ edited: string; finalBlog: string; socialPosts: string }> {
  const edited = await runAiStep(miniMax, 'revise-edit', `**REVISE - EDIT** - Revising...`, REVISE_EDIT_PROMPT.replace('{topic}', topic).replace('{current}', currentBlog), threadId, botToken);
  const finalBlog = await runAiStep(miniMax, 'revise-final', `**REVISE - FINAL** - Polishing...`, FINAL_PROMPT.replace('{topic}', topic).replace('{edited}', edited), threadId, botToken);
  const socialContent = await runAiStep(miniMax, 'revise-social', `**REVISE - SOCIAL** - Updating...`, SOCIAL_PROMPT.replace('{blog}', finalBlog), threadId, botToken);
  const socialPosts = JSON.stringify(parseSocialPosts(socialContent));
  await sendApprovalMessage(threadId, finalBlog, socialPosts, botToken);
  return { edited, finalBlog, socialPosts };
}

async function runAiStep(
  miniMax: MiniMaxClient,
  name: string,
  progress: string,
  prompt: string,
  threadId: string,
  botToken: string,
): Promise<string> {
  await postToThread(threadId, progress, botToken);
  return await miniMax.chatWithRetry([{ role: 'user', content: prompt }], { maxTokens: 2048 });
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export class ContentWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { topic, threadId } = event.payload;
    const miniMax = new MiniMaxClient(this.env.MINIMAX_API_KEY);
    const botToken = this.env.DISCORD_BOT_TOKEN;

    // RESEARCH
    const research = await step.do('research', async () => {
      await postToThread(threadId, '**RESEARCH** - Searching the web...', botToken);
      let data: string;

      if (this.env.EXA_API_KEY) {
        const results = await searchWeb(`${topic} latest news, trends, insights, statistics`, this.env.EXA_API_KEY);
        const summary = await summarizeSearchResults(results);
        data = await miniMax.chatWithRetry([{
          role: 'user',
          content: RESEARCH_WITH_EXA_PROMPT.replace('{summary}', summary).replace('{topic}', topic),
        }], { maxTokens: 2048 });
      } else {
        data = await miniMax.chatWithRetry([{
          role: 'user',
          content: RESEARCH_PROMPT.replace('{topic}', topic),
        }], { maxTokens: 2048 });
      }

      if (this.env.CACHE) {
        const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
        await this.env.CACHE.put(key, data, { expirationTtl: 86400 });
      }

      return data;
    });
    await postToThread(threadId, `**RESEARCH**\n\n${research}`, botToken);

    // DRAFT
    const draft = await runAiStep(miniMax, 'draft', '**DRAFT** - Writing...', DRAFT_PROMPT.replace('{topic}', topic).replace('{research}', research), threadId, botToken);
    await postToThread(threadId, `**DRAFT**\n\n${draft}`, botToken);

    // EDIT
    const edited = await runAiStep(miniMax, 'edit', '**EDIT** - Reviewing...', EDIT_PROMPT.replace('{draft}', draft), threadId, botToken);
    await postToThread(threadId, `**EDIT**\n\n${edited}`, botToken);

    // FINAL
    const finalBlog = await runAiStep(miniMax, 'final', '**FINAL** - Polishing...', FINAL_PROMPT.replace('{topic}', topic).replace('{edited}', edited), threadId, botToken);
    await postToThread(threadId, `**FINAL**\n\n${finalBlog}`, botToken);

    // SOCIAL
    const socialContent = await runAiStep(miniMax, 'social', '**SOCIAL** - Creating posts...', SOCIAL_PROMPT.replace('{blog}', finalBlog), threadId, botToken);
    const socialPosts = JSON.stringify(parseSocialPosts(socialContent));
    await postToThread(threadId, `**SOCIAL**\n\n${socialPosts}`, botToken);

    // APPROVAL
    await sendApprovalMessage(threadId, finalBlog, socialPosts, botToken);
    const { payload } = await step.waitForEvent<ApprovalPayload>('await-approval', {
      type: 'approval',
      timeout: '24 hours',
    });

    if (payload.approved) {
      await step.do('publish', async () => {
        await postToThread(threadId, '**PUBLISHING** - Uploading to GitHub Pages...', botToken);
        const path = await publish(topic, finalBlog, socialPosts, this.env);
        await postToThread(threadId, `Published to GitHub Pages: \`${path}\``, botToken);
      });
    } else {
      // Revision loop
      const { finalBlog: revFinal, socialPosts: revSocial } = await runRevision(
        topic, finalBlog, threadId, botToken, miniMax,
      );

      const { payload: p2 } = await step.waitForEvent<ApprovalPayload>('await-revision', {
        type: 'approval',
        timeout: '24 hours',
      });

      if (p2.approved) {
        await step.do('revise-publish', async () => {
          await postToThread(threadId, '**PUBLISHING** - Uploading to GitHub Pages...', botToken);
          const path = await publish(topic, revFinal, revSocial, this.env);
          await postToThread(threadId, `Published to GitHub Pages: \`${path}\``, botToken);
        });
      } else {
        await postToThread(threadId, 'Workflow ended. Use `/create` to start over.', botToken);
      }
    }
  }
}
