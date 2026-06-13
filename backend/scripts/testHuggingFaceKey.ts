/**
 * testHuggingFaceKey.ts — verify HUGGINGFACE_API_KEY works
 * for embeddings.
 *
 * Run:  npm run test:hf-key
 *
 * Tests three things in order (fails fast):
 *   1. Auth — the API key is accepted by HF
 *   2. Embedding shape — call returns a 1024-dim vector
 *      (mxbai-embed-large-v1)
 *   3. Math — L2 norm is ~1.0 (the model returns normalized
 *      vectors; the Atlas index expects this)
 *
 * Also prints a sample of the vector + a brief latency
 * number. The key itself is NEVER printed — only whether
 * it's set, and the test result.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const HF_API_BASE = 'https://api-inference.huggingface.co/models';

async function main(): Promise<void> {
  const key = (process.env.HUGGINGFACE_API_KEY ?? '').trim();
  if (!key) {
    console.error('FAIL: HUGGINGFACE_API_KEY is not set in .env / .env.local');
    process.exit(1);
  }
  console.log(`HF key: <set, length=${key.length} chars>`);

  const model = 'mixedbread-ai/mxbai-embed-large-v1';
  const query = 'how do I reset my password';
  const url = `${HF_API_BASE}/${model}`;

  console.log(`\nCalling ${model} for a 1-query embedding…`);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: query, options: { wait_for_model: true } }),
    });
  } catch (err) {
    // Node's `fetch` throws a TypeError whose .cause has the
    // real reason (DNS, TLS, ECONNRESET, etc.). Print everything
    // we can.
    const e = err as Error & { cause?: { code?: string; message?: string; name?: string } };
    console.error('FAIL: fetch failed (network error)');
    console.error(`  type:    ${e.name ?? 'Error'}`);
    console.error(`  message: ${e.message}`);
    if (e.cause) {
      console.error(`  cause:   ${e.cause.name ?? ''} ${e.cause.code ?? ''} ${e.cause.message ?? ''}`.trim());
    }
    // Common causes + remediation
    if (e.cause?.code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(e.cause?.message ?? '')) {
      console.error('  hint:    DNS lookup failed for api-inference.huggingface.co.');
      console.error('           Check DNS, VPN, corporate proxy, or /etc/hosts.');
    } else if (e.cause?.code === 'ECONNREFUSED') {
      console.error('  hint:    HF rejected the TCP connection (firewall or proxy).');
    } else if (e.cause?.code === 'ETIMEDOUT' || e.cause?.code === 'UND_ERR_SOCKET') {
      console.error('  hint:    Connection timed out. Check VPN / corporate proxy.');
    } else if (/TLS|certificate/i.test(e.cause?.message ?? '')) {
      console.error('  hint:    TLS error. Check system clock + root CA bundle.');
    }
    process.exit(1);
  }
  const elapsed = Date.now() - t0;

  // 1. Auth check
  if (res.status === 401 || res.status === 403) {
    console.error(`FAIL: HF rejected the key (HTTP ${res.status})`);
    const body = await res.text().catch(() => '');
    // Surface only the first 200 chars of the body — never the key
    console.error(`  response (truncated): ${body.slice(0, 200)}`);
    process.exit(1);
  }
  if (res.status === 404) {
    console.error(`FAIL: model ${model} not found (HTTP 404). Either the model slug is wrong or your account can't access it.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`FAIL: HTTP ${res.status}`);
    const body = await res.text().catch(() => '');
    console.error(`  body: ${body.slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`✓ Auth OK (HTTP ${res.status}, ${elapsed}ms)`);

  // 2. Shape check — response should be a single 1D array (not a 2D matrix)
  //    when inputs is a single string. Some HF endpoints return
  //    2D [[..vec..]] even for a single string; handle both.
  const data = await res.json() as number[] | number[][];
  let vec: number[];
  if (Array.isArray(data) && Array.isArray(data[0])) {
    vec = (data as number[][])[0];
  } else if (Array.isArray(data) && typeof data[0] === 'number') {
    vec = data as number[];
  } else {
    console.error('FAIL: unexpected response shape —', JSON.stringify(data).slice(0, 200));
    process.exit(1);
  }

  const expected = 1024;
  if (vec.length !== expected) {
    console.error(`FAIL: got ${vec.length}-dim vector, expected ${expected} (mxbai-embed-large-v1)`);
    console.error(`  First 8 values: [${vec.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}]`);
    process.exit(1);
  }
  console.log(`✓ Shape OK: ${vec.length}-dim vector`);

  // 3. L2-norm check — should be ~1.0 (the model returns
  //    normalized vectors; the Atlas dotProduct index
  //    assumes this)
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  const normDelta = Math.abs(norm - 1.0);
  if (normDelta > 0.01) {
    console.error(`FAIL: L2 norm is ${norm.toFixed(6)} (expected ~1.0, delta=${normDelta.toFixed(6)})`);
    process.exit(1);
  }
  console.log(`✓ Normalized: L2 norm = ${norm.toFixed(6)}`);

  // 4. Sanity: a second query should return a different vector
  //    (verifies the API isn't returning a cached/sentinel value)
  const res2 = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: 'completely different question', options: { wait_for_model: true } }),
  });
  const data2 = await res2.json() as number[] | number[][];
  const vec2: number[] = Array.isArray(data2[0]) ? (data2 as number[][])[0] : (data2 as number[]);
  let dotProduct = 0;
  for (let i = 0; i < vec.length; i++) dotProduct += vec[i] * vec2[i];
  if (dotProduct >= 0.99) {
    console.error(`FAIL: two distinct queries returned near-identical vectors (dot=${dotProduct.toFixed(4)}). API may be returning a cached or sentinel value.`);
    process.exit(1);
  }
  console.log(`✓ Distinct queries yield distinct vectors (cosine similarity = ${dotProduct.toFixed(4)})`);

  // 5. Sample preview
  console.log(`\n  first 8 dims: [${vec.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`  last  4 dims: [${vec.slice(-4).map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`  sum of squares: ${sumSq.toFixed(6)}`);

  console.log('\n✅ HUGGINGFACE_API_KEY is working. Embeddings will route through the HF Inference API.');
  console.log('   The Atlas vector_index expects 1024-dim dotProduct — this is exactly what you get.');
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
