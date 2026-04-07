/**
 * End-to-End Test Script for Content Pipeline
 * 
 * Tests the full workflow: Research → Draft → Edit → Final → Social (Facebook only)
 * Run: npx tsx scripts/test-e2e.ts
 */

import { MiniMaxClient } from '../src/minimax';
import { PROMPTS } from '../src/config';

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

function assertNotEmpty(value: string, step: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${step} returned empty content`);
  }
  if (value.length < 50) {
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
      content: PROMPTS.RESEARCH_FALLBACK.replace('{topic}', CONFIG.testTopic),
    }], { maxTokens: 2000 });
    
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
      content: PROMPTS.DRAFT.replace('{topic}', CONFIG.testTopic).replace('{research}', research),
    }], { maxTokens: 2500 });
    
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
      content: PROMPTS.EDIT.replace('{draft}', draft),
    }], { maxTokens: 2500 });
    
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
      content: PROMPTS.FINAL.replace('{topic}', CONFIG.testTopic).replace('{draft}', edited).replace('{feedback}', ''),
    }], { maxTokens: 2500 });
    
    assertNotEmpty(finalBlog, 'Final');
    results.push({ step: 'Final', passed: true, duration: Date.now() - finalStart, output: finalBlog });
    console.log(`   ✅ Final complete (${Date.now() - finalStart}ms, ${finalBlog.length} chars)`);
  } catch (e) {
    results.push({ step: 'Final', passed: false, duration: Date.now() - finalStart, output: '', error: String(e) });
    console.log(`   ❌ Final failed: ${e}`);
  }

  const finalBlog = results.find(r => r.step === 'Final')?.output || '';

  // Step 5: SOCIAL (Facebook only)
  const socialResults: TestResult[] = [];
  
  const fbStart = Date.now();
  try {
    console.log('📱 Step 5: SOCIAL - Facebook');
    const facebook = await miniMax.chat([{
      role: 'user',
      content: PROMPTS.FACEBOOK.replace('{blog}', finalBlog),
    }], { maxTokens: 1000 });
    
    assertNotEmpty(facebook, 'Facebook');
    socialResults.push({ step: 'Facebook', passed: true, duration: Date.now() - fbStart, output: facebook });
    console.log(`   ✅ Facebook complete (${Date.now() - fbStart}ms, ${facebook.length} chars)`);
  } catch (e) {
    socialResults.push({ step: 'Facebook', passed: false, duration: Date.now() - fbStart, output: '', error: String(e) });
    console.log(`   ❌ Facebook failed: ${e}`);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  const allSteps = [...results, ...socialResults];
  const passed = allSteps.filter(r => r.passed).length;
  
  console.log(`\n📊 Results: ${passed}/${allSteps.length} steps passed\n`);
  
  allSteps.forEach(r => {
    const status = r.passed ? '✅' : '❌';
    const icon = r.step === 'Facebook' ? '  ' : '';
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
