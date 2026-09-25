/**
 * Read-only: actually EXECUTE programScope() + enforceProgramMembership()
 * against a real user + real batchId, using fake req/res objects, instead
 * of reasoning about the code in the abstract. If the diagnostic script
 * shows a matching, active ProgramEnrollment row but the live site still
 * 403s the user, something in the actual code path disagrees with a
 * manual read of the source — this finds out what, precisely.
 *
 * Makes no writes.
 *
 * Run:  npx tsx src/scripts/simulate-enforce-membership.ts <email> <batchId>
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';
import { programScope, enforceProgramMembership } from '../middleware/programScope.js';
import type { Request, Response, NextFunction } from 'express';

async function main() {
  const email = process.argv[2];
  const batchId = process.argv[3];
  if (!email || !batchId) throw new Error('Usage: npx tsx src/scripts/simulate-enforce-membership.ts <email> <batchId>');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const user = await User.findOne({ email });
  if (!user) {
    console.log(`NO USER FOUND for email: ${email}`);
    await mongoose.disconnect();
    return;
  }
  console.log('Loaded user:', { _id: user._id.toString(), email: user.email, role: user.role });

  const req = {
    query: { batchId },
    params: {},
    body: {},
    headers: {},
    user,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    status(n: number) { this.statusCode = n; return this; },
    json(body: unknown) { console.log(`RESPONSE status=${this.statusCode} body=${JSON.stringify(body)}`); return this; },
  } as unknown as Response;

  let programScopeCalledNext = false;
  const nextAfterScope: NextFunction = ((err?: unknown) => {
    if (err) { console.log('programScope() called next(err):', err); return; }
    programScopeCalledNext = true;
  }) as NextFunction;

  console.log('\n--- Running programScope() ---');
  await programScope()(req, res, nextAfterScope);
  console.log('programScope called next()?', programScopeCalledNext);
  console.log('req.programContext =', JSON.stringify(req.programContext));
  console.log('req.programEnrollment =', JSON.stringify(req.programEnrollment));

  if (programScopeCalledNext) {
    console.log('\n--- Running enforceProgramMembership() ---');
    let membershipCalledNext = false;
    const nextAfterMembership: NextFunction = ((err?: unknown) => {
      if (err) { console.log('enforceProgramMembership() called next(err):', err); return; }
      membershipCalledNext = true;
    }) as NextFunction;
    await enforceProgramMembership()(req, res, nextAfterMembership);
    console.log('enforceProgramMembership called next()?', membershipCalledNext);
    console.log(membershipCalledNext ? '\n=> REQUEST WOULD BE ALLOWED' : '\n=> REQUEST WOULD BE BLOCKED (see RESPONSE above)');
  } else {
    console.log('\n=> programScope() itself short-circuited the request (see RESPONSE above)');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
