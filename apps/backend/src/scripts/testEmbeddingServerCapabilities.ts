import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_SLUG = process.env.EMBEDDING_MODEL || 'mxbai-embed-large';
const BASE_URL = process.env.EMBEDDING_BASE_URL || 'http://localhost:11434/v1';
const API_KEY = process.env.EMBEDDING_API_KEY || 'ollama';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL.replace(/\/$/, ''),
  timeout: 300000, // 5 minutes
});

interface DiagnosticResult {
  testName: string;
  status: 'SUCCESS' | 'FAILED' | 'NOT_SUPPORTED';
  details: string;
  latencyMs?: number;
}

async function runDiagnostics() {
  console.log('==================================================');
  console.log('       EMBEDDING SERVER CAPABILITY DIAGNOSTICS      ');
  console.log('==================================================');
  console.log(`Server URL:   ${BASE_URL}`);
  console.log(`Model:        ${MODEL_SLUG}`);
  console.log(`API Key:      ${API_KEY === 'ollama' ? 'ollama (default)' : '<custom>'}`);
  console.log('==================================================\n');

  const results: DiagnosticResult[] = [];

  // --- TEST 1: Basic Ping ---
  console.log('[Test 1] Testing basic ping...');
  const t0 = Date.now();
  try {
    const res = await client.embeddings.create({
      model: MODEL_SLUG,
      input: 'ping',
    });
    const d = Date.now() - t0;
    console.log(`  ✓ Success! Latency: ${d}ms, Vector dimension: ${res.data[0].embedding.length}\n`);
    results.push({
      testName: 'Basic Ping & Dimension',
      status: 'SUCCESS',
      details: `Successfully embedded 'ping'. Dimension: ${res.data[0].embedding.length}`,
      latencyMs: d,
    });
  } catch (err) {
    const d = Date.now() - t0;
    console.error(`  ✗ Failed: ${(err as Error).message}\n`);
    results.push({
      testName: 'Basic Ping & Dimension',
      status: 'FAILED',
      details: (err as Error).message,
      latencyMs: d,
    });
  }

  // --- TEST 2: Native Batching Support ---
  console.log('[Test 2] Testing native batching support...');
  const t1 = Date.now();
  try {
    const res = await client.embeddings.create({
      model: MODEL_SLUG,
      input: ['first text element', 'second text element'],
    });
    const d = Date.now() - t1;
    console.log(`  ✓ Success! Embedded batch of 2. Vectors returned: ${res.data.length}. Latency: ${d}ms\n`);
    results.push({
      testName: 'Native Batching (Array input)',
      status: 'SUCCESS',
      details: `Supported! Successfully embedded an array of 2 elements.`,
      latencyMs: d,
    });
  } catch (err) {
    const d = Date.now() - t1;
    console.warn(`  ✗ Failed: ${(err as Error).message}\n`);
    results.push({
      testName: 'Native Batching (Array input)',
      status: 'NOT_SUPPORTED',
      details: (err as Error).message,
      latencyMs: d,
    });
  }

  // --- TEST 3: UTF-8 & Emojis ---
  console.log('[Test 3] Testing UTF-8 and special character inputs...');
  const t2 = Date.now();
  try {
    const specialText = 'Section: 🚀 Emojis & Science 🧬. 中文 (Chinese) & Hindi (हिंदी). Control chars: \t \n. Symbols: 🥈 🥇 🏆.';
    const res = await client.embeddings.create({
      model: MODEL_SLUG,
      input: specialText,
    });
    const d = Date.now() - t2;
    console.log(`  ✓ Success! Latency: ${d}ms\n`);
    results.push({
      testName: 'UTF-8 & Emojis Support',
      status: 'SUCCESS',
      details: `Successfully processed complex multilingual text with emojis.`,
      latencyMs: d,
    });
  } catch (err) {
    const d = Date.now() - t2;
    console.error(`  ✗ Failed: ${(err as Error).message}\n`);
    results.push({
      testName: 'UTF-8 & Emojis Support',
      status: 'FAILED',
      details: (err as Error).message,
      latencyMs: d,
    });
  }

  // --- TEST 4: Context Length Boundaries ---
  console.log('[Test 4] Testing context length boundaries (stress-testing input sizes)...');
  const sizes = [500, 1000, 2000, 4000, 8000, 16000];
  for (const size of sizes) {
    const text = 'word '.repeat(size);
    const ts = Date.now();
    try {
      await client.embeddings.create({
        model: MODEL_SLUG,
        input: text,
      });
      const d = Date.now() - ts;
      console.log(`  ✓ Size ${size} words: SUCCESS (${d}ms)`);
      results.push({
        testName: `Context Size: ${size} words`,
        status: 'SUCCESS',
        details: `Successfully embedded a text of ${size} words (~${size * 5.5} chars).`,
        latencyMs: d,
      });
    } catch (err) {
      const d = Date.now() - ts;
      console.error(`  ✗ Size ${size} words: FAILED (${d}ms) - ${(err as Error).message}`);
      results.push({
        testName: `Context Size: ${size} words`,
        status: 'FAILED',
        details: (err as Error).message,
        latencyMs: d,
      });
      break; // stop testing larger sizes if one fails
    }
  }
  console.log();

  // --- TEST 5: Concurrency Capability ---
  console.log('[Test 5] Testing concurrency levels (parallel request handling)...');
  const concurrencyLevels = [2, 4, 8];
  for (const level of concurrencyLevels) {
    const tc = Date.now();
    console.log(`  Testing concurrency: ${level} concurrent requests...`);
    try {
      const requests = Array.from({ length: level }, (_, i) => 
        client.embeddings.create({
          model: MODEL_SLUG,
          input: `concurrent text query number ${i + 1}`,
        })
      );
      await Promise.all(requests);
      const d = Date.now() - tc;
      console.log(`  ✓ Concurrency ${level}: SUCCESS (${d}ms total, average ${(d / level).toFixed(0)}ms/req)`);
      results.push({
        testName: `Concurrency Level: ${level}`,
        status: 'SUCCESS',
        details: `Successfully processed ${level} concurrent requests in parallel.`,
        latencyMs: d,
      });
    } catch (err) {
      const d = Date.now() - tc;
      console.error(`  ✗ Concurrency ${level}: FAILED (${d}ms) - ${(err as Error).message}`);
      results.push({
        testName: `Concurrency Level: ${level}`,
        status: 'FAILED',
        details: (err as Error).message,
        latencyMs: d,
      });
    }
  }
  console.log();

  // --- GENERATING REPORT ---
  console.log('Generating diagnostic report...');
  let md = `# Embedding Server Diagnostic Report\n\n`;
  md += `Generated at: ${new Date().toISOString()}\n\n`;
  md += `## Configuration\n`;
  md += `* **Endpoint Base URL**: \`${BASE_URL}\`\n`;
  md += `* **Model Slug**: \`${MODEL_SLUG}\`\n`;
  md += `* **API Key**: \`${API_KEY === 'ollama' ? 'ollama (default)' : '<custom>'}\`\n\n`;

  md += `## Test Results Summary\n\n`;
  md += `| Test Name | Status | Latency | Details |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  for (const r of results) {
    const statusEmoji = r.status === 'SUCCESS' ? '✅ SUCCESS' : r.status === 'FAILED' ? '❌ FAILED' : '⚠️ NOT SUPPORTED';
    md += `| ${r.testName} | ${statusEmoji} | ${r.latencyMs ? `${r.latencyMs}ms` : 'N/A'} | ${r.details} |\n`;
  }

  md += `\n## Findings & Capabilities analysis\n\n`;

  // Dynamic analysis based on results
  const ping = results.find(r => r.testName === 'Basic Ping & Dimension');
  const batch = results.find(r => r.testName === 'Native Batching (Array input)');
  const utf = results.find(r => r.testName === 'UTF-8 & Emojis Support');
  const maxContext = results.filter(r => r.testName.startsWith('Context Size:') && r.status === 'SUCCESS').slice(-1)[0];
  const maxConcurrency = results.filter(r => r.testName.startsWith('Concurrency Level:') && r.status === 'SUCCESS').slice(-1)[0];

  md += `### 1. Latency Profile\n`;
  if (ping && ping.status === 'SUCCESS') {
    md += `* Base ping latency: **${ping.latencyMs}ms**\n`;
    md += `* Recommendation: ${ping.latencyMs! > 2000 ? 'The server latency is high. Consider upgrading server hardware/RAM or running on a GPU-enabled instance.' : 'Latency is healthy.'}\n`;
  } else {
    md += `* The server is offline or unreachable.\n`;
  }

  md += `### 2. Batch & UTF-8 Support\n`;
  md += `* Native array batching is **${batch && batch.status === 'SUCCESS' ? 'SUPPORTED' : 'NOT SUPPORTED'}** by this endpoint.\n`;
  md += `* Special characters & emojis: **${utf && utf.status === 'SUCCESS' ? 'Fully supported without encoding errors' : 'Failed to process emojis/UTF-8 characters'}**\n`;

  md += `### 3. Context Window Limit\n`;
  if (maxContext) {
    md += `* Verified maximum context length: **${maxContext.testName.replace('Context Size: ', '')}** (~${parseInt(maxContext.testName.replace('Context Size: ', '')) * 5.5} characters).\n`;
  } else {
    md += `* Context stress-testing failed immediately.\n`;
  }

  md += `### 4. Concurrency Limit\n`;
  if (maxConcurrency) {
    md += `* Verified stable parallel concurrency: **${maxConcurrency.testName.replace('Concurrency Level: ', '')} concurrent requests** in parallel.\n`;
  } else {
    md += `* The server failed or blocked during parallel concurrency stress tests. Concurrency is not recommended.\n`;
  }

  const reportPath = path.join(__dirname, '..', '..', '..', '..', 'embedding_server_report.md');
  const artifactReportPath = path.join('/Users/yashhwanth/.gemini/antigravity-ide/brain/f906d78c-498a-4f68-9f3d-910731f5bb33', 'embedding_server_report.md');
  
  await fs.writeFile(artifactReportPath, md);
  console.log(`\n✅ Diagnostic Complete. Report written to ${artifactReportPath}`);
  console.log('==================================================\n');
}

runDiagnostics().catch(console.error);
