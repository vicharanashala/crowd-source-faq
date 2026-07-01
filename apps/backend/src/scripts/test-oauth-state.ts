/**
 * Quick smoke test for the OAuth state signing/verification.
 * Run with: cd backend && JWT_SECRET=test_secret node --import tsx scripts/test-oauth-state.ts
 */
import { signOAuthState, verifyOAuthState } from '../integrations/zoom/zoomOAuth.js';

let passed = 0;
let failed = 0;

function expect(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const userId = '64f0a1b2c3d4e5f6a7b8c9d0';

console.log('OAuth state security tests:');

// 1. Legitimate flow
{
  const state = signOAuthState(userId);
  const decoded = verifyOAuthState(state);
  expect('legit state → userId round-trip', decoded === userId, `got ${decoded}`);
}

// 2. Forged state (the original N1 vulnerability — just base64(userId))
{
  const forged = Buffer.from(userId).toString('base64');
  const decoded = verifyOAuthState(forged);
  expect('forged state rejected (was the N1 bug)', decoded === null, `got ${decoded}`);
}

// 3. Tampered HMAC
{
  const good = signOAuthState(userId);
  const tampered = good.slice(0, -10) + 'AAAAAAAAAA';
  const decoded = verifyOAuthState(tampered);
  expect('tampered HMAC rejected', decoded === null, `got ${decoded}`);
}

// 4. Garbage
{
  const decoded = verifyOAuthState('garbage-string');
  expect('garbage rejected', decoded === null);
}

// 5. Empty string
{
  const decoded = verifyOAuthState('');
  expect('empty string rejected', decoded === null);
}

// 6. State for invalid userId shape — should be rejected after verify (HMAC still valid)
{
  const badUserId = 'not-a-valid-objectid';
  const state = signOAuthState(badUserId);
  const decoded = verifyOAuthState(state);
  expect('invalid userId shape rejected', decoded === null, `got ${decoded}`);
}

// 7. Cross-user state forgery (sign for user A, try to use for user B)
//    This isn't quite the same as the forged test, but it covers an attacker
//    who somehow has a valid signature for a different user.
{
  const otherUser = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const stateForOther = signOAuthState(otherUser);
  const decoded = verifyOAuthState(stateForOther);
  expect('cross-user signature only decodes own userId', decoded === otherUser, `got ${decoded}`);
}

// 8. Expired state — can't easily test without time mocking, but the
//    timestamp is embedded; just sanity check the format.
// (Skipped — TTL is enforced via Date.now() comparison at runtime.)

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
