/**
 * End-to-End Test Script for Content Pipeline
 * 
 * Tests the full workflow: Research → Draft → Edit → Final → Social (FB, X, LinkedIn)
 * Run: MINIMAX_API_KEY=xxx npx tsx scripts/test-e2e.ts
 */

import { MiniMaxClient } from '../src/minimax';

const CONFIG = {
  minimaxKey: process.env.MINIMAX_API_KEY!,
  testTopic: process.env.TEST_TOPIC || 'The Future of AI in Content Creation 2026',
};

interface TestResult {
  step: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

// Prompts matching the actual workflow
const RESEARCH_PROMPT = `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles.

Topic: {topic}

**CRITICAL: Keep the summary under 1600 characters and 250 words max. Be concise and focused.**`;

const DRAFT_PROMPT = `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

**CRITICAL: Keep the draft around 200 words. Be thorough but stay within Discord message limits.**

Write a blog post with:
- Engaging title
- Introduction (2-3 sentences)
- 3-4 key points with supporting details
- Conclusion with call to action

Aim for 200 words.`;

const EDIT_PROMPT = `You are a senior editor. Review the draft below and provide 3-5 clear, actionable revision tips.

**CRITICAL: Keep your tips under 1200 characters total. Be concise.**

Draft:
{draft}

Provide 3-5 specific, actionable tips to improve clarity, engagement, and impact. Use bullet points.`;

const FINAL_PROMPT = `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Original draft:
{draft}

Revision tips:
{tips}

**CRITICAL: Keep the blog post under 1600 characters and 300 words max. Apply the revision tips to improve the draft.**

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

function assertNotEmpty(value: string, step: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${step} returned empty content`);
  }
  if (value.length < 20) {
    throw new Error(`${step} returned suspiciously short content: "${value}"`);
  }
}

async function runE2ETest(): Promise<void> {
  const results: TestResult[] = [];
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        End-to-End Content Pipeline Test                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📋 Test Topic: "${CONFIG.testTopic}"\n`);

  if (!CONFIG.minimaxKey) {
    console.error('❌ MINIMAX_API_KEY not set');
    console.error('   Run: MINIMAX_API_KEY=xxx npx tsx scripts/test-e2e.ts');
    process.exit(1);
  }

  const miniMax = new MiniMaxClient(CONFIG.minimaxKey);

  // Step 1: RESEARCH
  const researchStart = Date.now();
  try {
    console.log('🔍 Step 1: RESEARCH');
    const research = await miniMax.chat([{
      role: 'user',
      content: RESEARCH_PROMPT.replace('{topic}', CONFIG.testTopic),
    }], { maxTokens: 1600 });
    
    assertNotEmpty(research, 'Research');
    results.push({ step: 'Research', passed: true, duration: Date.now() - researchStart, output: research });
    console.log(`   ✅ Research complete (${Date.now() - researchStart}ms, ${research.length} chars)`);
  } catch (e) {
    results.push({ step: 'Research', passed: false, duration: Date.now() - researchStart, output: '', error: String(e) });
    console.log(`   ❌ Research failed: ${e}`);
  }

  const research = results.find(r => r.step === 'Research')?.output || '';

  // Step 2: DRAFT
  const draftStart = Date.now();
  try {
    console.log('✍️  Step 2: DRAFT');
    const draft = await miniMax.chat([{
      role: 'user',
      content: DRAFT_PROMPT.replace('{topic}', CONFIG.testTopic).replace('{research}', research),
    }], { maxTokens: 2000 });
    
    assertNotEmpty(draft, 'Draft');
    results.push({ step: 'Draft', passed: true, duration: Date.now() - draftStart, output: draft });
    console.log(`   ✅ Draft complete (${Date.now() - draftStart}ms, ${draft.length} chars)`);
  } catch (e) {
    results.push({ step: 'Draft', passed: false, duration: Date.now() - draftStart, output: '', error: String(e) });
    console.log(`   ❌ Draft failed: ${e}`);
  }

  const draft = results.find(r => r.step === 'Draft')?.output || '';

  // Step 3: EDIT
  const editStart = Date.now();
  try {
    console.log('🔍 Step 3: EDIT');
    const edited = await miniMax.chat([{
      role: 'user',
      content: EDIT_PROMPT.replace('{draft}', draft),
    }], { maxTokens: 1200 });
    
    assertNotEmpty(edited, 'Edit');
    results.push({ step: 'Edit', passed: true, duration: Date.now() - editStart, output: edited });
    console.log(`   ✅ Edit complete (${Date.now() - editStart}ms, ${edited.length} chars)`);
  } catch (e) {
    results.push({ step: 'Edit', passed: false, duration: Date.now() - editStart, output: '', error: String(e) });
    console.log(`   ❌ Edit failed: ${e}`);
  }

  const edited = results.find(r => r.step === 'Edit')?.output || '';

  // Step 4: FINAL
  const finalStart = Date.now();
  try {
    console.log('✨ Step 4: FINAL');
    const finalBlog = await miniMax.chat([{
      role: 'user',
      content: FINAL_PROMPT.replace('{topic}', CONFIG.testTopic).replace('{draft}', draft).replace('{tips}', edited),
    }], { maxTokens: 1600 });
    
    assertNotEmpty(finalBlog, 'Final');
    results.push({ step: 'Final', passed: true, duration: Date.now() - finalStart, output: finalBlog });
    console.log(`   ✅ Final complete (${Date.now() - finalStart}ms, ${finalBlog.length} chars)`);
  } catch (e) {
    results.push({ step: 'Final', passed: false, duration: Date.now() - finalStart, output: '', error: String(e) });
    console.log(`   ❌ Final failed: ${e}`);
  }

  const finalBlog = results.find(r => r.step === 'Final')?.output || '';

  // Step 5: SOCIAL (3 separate calls)
  const socialResults: TestResult[] = [];
  
  // Facebook
  const fbStart = Date.now();
  try {
    console.log('📱 Step 5a: SOCIAL - Facebook');
    const facebook = await miniMax.chat([{
      role: 'user',
      content: FACEBOOK_PROMPT.replace('{blog}', finalBlog),
    }], { maxTokens: 500 });
    
    assertNotEmpty(facebook, 'Facebook');
    socialResults.push({ step: 'Facebook', passed: true, duration: Date.now() - fbStart, output: facebook });
    console.log(`   ✅ Facebook complete (${Date.now() - fbStart}ms, ${facebook.length} chars)`);
  } catch (e) {
    socialResults.push({ step: 'Facebook', passed: false, duration: Date.now() - fbStart, output: '', error: String(e) });
    console.log(`   ❌ Facebook failed: ${e}`);
  }

  // Twitter/X
  const twStart = Date.now();
  try {
    console.log('📱 Step 5b: SOCIAL - X/Twitter');
    const twitter = await miniMax.chat([{
      role: 'user',
      content: TWITTER_PROMPT.replace('{blog}', finalBlog),
    }], { maxTokens: 400 });
    
    assertNotEmpty(twitter, 'X/Twitter');
    socialResults.push({ step: 'X/Twitter', passed: true, duration: Date.now() - twStart, output: twitter });
    console.log(`   ✅ X/Twitter complete (${Date.now() - twStart}ms, ${twitter.length} chars)`);
  } catch (e) {
    socialResults.push({ step: 'X/Twitter', passed: false, duration: Date.now() - twStart, output: '', error: String(e) });
    console.log(`   ❌ X/Twitter failed: ${e}`);
  }

  // LinkedIn
  const liStart = Date.now();
  try {
    console.log('📱 Step 5c: SOCIAL - LinkedIn');
    const linkedin = await miniMax.chat([{
      role: 'user',
      content: LINKEDIN_PROMPT.replace('{blog}', finalBlog),
    }], { maxTokens: 1000 });
    
    assertNotEmpty(linkedin, 'LinkedIn');
    socialResults.push({ step: 'LinkedIn', passed: true, duration: Date.now() - liStart, output: linkedin });
    console.log(`   ✅ LinkedIn complete (${Date.now() - liStart}ms, ${linkedin.length} chars)`);
  } catch (e) {
    socialResults.push({ step: 'LinkedIn', passed: false, duration: Date.now() - liStart, output: '', error: String(e) });
    console.log(`   ❌ LinkedIn failed: ${e}`);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  const allSteps = [...results, ...socialResults];
  const passed = allSteps.filter(r => r.passed).length;
  
  console.log(`\n📊 Results: ${passed}/${allSteps.length} steps passed\n`);
  
  allSteps.forEach(r => {
    const status = r.passed ? '✅' : '❌';
    const icon = r.step === 'Facebook' || r.step === 'X/Twitter' || r.step === 'LinkedIn' ? '  ' : '';
    console.log(`${icon}${status} ${r.step}: ${r.duration}ms${r.error ? ` - ${r.error}` : ''}`);
  });

  if (passed === allSteps.length) {
    console.log('\n🎉 ALL TESTS PASSED!\n');
    console.log('📝 Content Preview:');
    console.log('-'.repeat(40));
    const final = results.find(r => r.step === 'Final');
    if (final) {
      console.log(final.output.slice(0, 500) + (final.output.length > 500 ? '...' : ''));
    }
    console.log('-'.repeat(40));
    socialResults.forEach(r => {
      console.log(`\n${r.step} (${r.output.length} chars):`);
      console.log(r.output.slice(0, 200) + (r.output.length > 200 ? '...' : ''));
    });
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
    process.exit(1);
  }
  
  console.log('\n' + '═'.repeat(60));
}

runE2ETest().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
