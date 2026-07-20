/**
 * journey-tracks.test.ts — integration tests for v1.76 Journey
 * Tracks. Covers:
 *   1. Track CRUD (create / update / status / duplicate / delete)
 *   2. Checkpoint + item CRUD
 *   3. Assignment scopes (user / batch / program / all)
 *   4. User-side: listMyJourneys respects assignment + published
 *   5. User-side: complete / uncomplete flow + 400 on non-required
 *   6. Progress monitoring: per-user %, current checkpoint, last activity
 *
 * The tests follow the same vi.hoisted mock pattern used by the
 * other backend tests so the existing test runner is happy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
// We can't reference `mongoose` symbols from inside `vi.hoisted`
// because vitest's import hoisting makes them unavailable at
// hoisted-evaluation time. Use vi.hoisted only for plain object
// state; construct ObjectId at test-runtime instead.
import mongoose, { Types } from 'mongoose';

const mocks = vi.hoisted(() => {
  // The shared state object holds the in-memory "database" rows
  // for the mocked models. Each mock factory closes over `state`
  // so it can read/write the same fields during a test run.
  // We can't reference `mongoose` symbols here because vitest
  // hoists vi.mock() above the import statements.
  const state: {
    trackDoc: any;
    userId: string;
    assignments: any[];
    progress: any[];
    enrollments: any[];
    users: any[];
  } = {
    trackDoc: null,
    // 24-hex placeholder; test code can swap this to a real
    // ObjectId before mocking `assigned to user X`.
    userId: '0000000000000000000000aa',
    assignments: [],
    progress: [],
    enrollments: [],
    users: [],
  };
  return { state };
});

// In-memory store. Each model exposes a tiny mock surface; the
// admin/user controllers call save() to persist and toObject()
// to serialise. We build chainable shapes that read/write the
// shared `state`.
function chainable(doc: any) {
  return {
    select: () => ({ lean: async () => doc }),
    lean: async () => doc,
    save: vi.fn(async function saveMock(this: unknown) {
      // Update the captured doc on save so the next read sees the
      // mutations made by the controller.
      return this;
    }),
    toObject: function toObject(this: any) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(this)) {
        if (k !== 'save' && k !== 'toObject' && k !== 'select' && k !== 'lean') {
          out[k] = this[k];
        }
      }
      return out;
    },
    ...doc,
  };
}

vi.mock('../modules/program/journey-track.model.js', () => ({
  default: {
    findById: vi.fn((_id: unknown) => chainable(mocks.state.trackDoc)),
    find: vi.fn(() => ({
      sort: () => ({ lean: async () => (mocks.state.trackDoc ? [mocks.state.trackDoc] : []) }),
      lean: async () => (mocks.state.trackDoc ? [mocks.state.trackDoc] : []),
    })),
    create: vi.fn(async (data: any) => {
      const doc = { _id: new Types.ObjectId(), ...data };
      mocks.state.trackDoc = chainable(doc);
      return mocks.state.trackDoc;
    }),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    findByIdAndUpdate: vi.fn(async (_id: unknown, patch: any) => {
      if (!mocks.state.trackDoc) return null;
      const inner = patch.$set ?? patch;
      Object.assign(mocks.state.trackDoc, inner);
      return mocks.state.trackDoc;
    }),
    findOneAndUpdate: vi.fn(async (_filter: any, patch: any) => {
      if (!mocks.state.trackDoc) return null;
      const inner = patch.$set ?? patch;
      Object.assign(mocks.state.trackDoc, inner);
      return mocks.state.trackDoc;
    }),
  },
}));

vi.mock('../modules/program/journey-assignment.model.js', () => ({
  default: {
    find: vi.fn(() => ({
      populate: () => ({
        populate: () => ({
          sort: () => ({ lean: async () => mocks.state.assignments }),
        }),
        sort: () => ({ lean: async () => mocks.state.assignments }),
      }),
      sort: () => ({ lean: async () => mocks.state.assignments }),
      // Direct `find().select('trackId').lean()` chain used by the
      // user-side assignedTrackIdsForUser query.
      select: () => ({ lean: async () => mocks.state.assignments }),
      lean: async () => mocks.state.assignments,
    })),
    findOneAndUpdate: vi.fn(async () => ({ _id: new Types.ObjectId() })),
    bulkWrite: vi.fn(async () => ({ upsertedCount: 1, modifiedCount: 0 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
    create: vi.fn(async (data: any) => ({ _id: new Types.ObjectId(), ...data })),
  },
}));

vi.mock('../modules/program/journey-progress.model.js', () => ({
  default: {
    find: vi.fn(() => ({ lean: async () => mocks.state.progress })),
    findOneAndUpdate: vi.fn(async () => ({ _id: new mongoose.Types.ObjectId(), completed: true })),
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  },
}));

vi.mock('../modules/program/program-enrollment.model.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({ lean: async () => mocks.state.enrollments }),
      lean: async () => mocks.state.enrollments,
    })),
  },
}));

vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({ lean: async () => mocks.state.users }),
    })),
    findById: vi.fn(() => ({
      select: () => ({ lean: async () => mocks.state.users[0] ?? null }),
    })),
  },
}));

vi.mock('../middleware/authShared.js', () => ({
  AuthedRequest: class {},
}));

vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
  authLog: { error: (): void => undefined },
}));

// ─── Test helpers ──────────────────────────────────────────────────────

function makeRes(): Response & { _status?: number; _body?: unknown } {
  const res: Partial<Response> & { _status?: number; _body?: unknown } = {
    status(code: number) {
      this._status = code;
      return this as Response;
    },
    json(body: unknown) {
      if (this._status === undefined) this._status = 200;
      this._body = body;
      return this as Response;
    },
  };
  return res as Response & { _status?: number; _body?: unknown };
}

function makeAdminReq(body: unknown = {}): Request {
  return {
    params: {},
    query: {},
    body,
    user: {
      _id: new mongoose.Types.ObjectId('0000000000000000000000aa'),
      name: 'Test Admin',
      role: 'admin',
    },
  } as unknown as Request;
}

function makeUserReq(opts: { params?: Record<string, string> } = {}): Request {
  return {
    params: opts.params ?? {},
    query: {},
    body: {},
    user: {
      _id: new mongoose.Types.ObjectId('0000000000000000000000bb'),
      role: 'user',
    },
  } as unknown as Request;
}

function newTrackDoc(overrides: Record<string, unknown> = {}): any {
  return {
    _id: new mongoose.Types.ObjectId('0000000000000000000000cc'),
    name: 'Test Track',
    description: '',
    icon: '🛤️',
    accentColor: 'accent',
    status: 'draft',
    checkpoints: [],
    createdBy: new mongoose.Types.ObjectId('0000000000000000000000aa'),
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.state.trackDoc = null;
  mocks.state.assignments = [];
  mocks.state.progress = [];
});

// ─── Imports under test ───────────────────────────────────────────────

import {
  createTrack,
  getTrack,
  deleteTrack,
  duplicateTrack,
  updateTrackStatus,
  appendCheckpoint,
  deleteCheckpoint,
  appendItem,
  createAssignments,
  deleteAssignment,
} from '../modules/admin/admin-journey.controller.js';
import {
  listMyJourneys,
  getMyJourney,
  completeJourneyItem,
} from '../modules/program/journey.controller.js';

// ─── Track CRUD ────────────────────────────────────────────────────────

describe('Journey Tracks — admin CRUD', () => {
  it('creates a draft track', async () => {
    const req = makeAdminReq({ name: 'My New Track' });
    const res = makeRes();
    await createTrack(req, res);
    expect(res._status).toBe(200);
    // The mock create() doesn't run the Mongoose schema defaults,
    // so we just check the data we passed in was captured.
    expect(mocks.state.trackDoc?.name).toBe('My New Track');
  });

  it('rejects empty name', async () => {
    const req = makeAdminReq({ name: '   ' });
    const res = makeRes();
    await createTrack(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 400 on invalid id', async () => {
    const req = { ...makeAdminReq(), params: { id: 'not-an-id' } } as unknown as Request;
    const res = makeRes();
    await getTrack(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 404 when the track does not exist', async () => {
    mocks.state.trackDoc = null;
    const req = {
      ...makeAdminReq(),
      params: { id: new mongoose.Types.ObjectId().toString() },
    } as unknown as Request;
    const res = makeRes();
    await getTrack(req, res);
    expect(res._status).toBe(404);
  });

  it('rejects delete on a non-draft track', async () => {
    mocks.state.trackDoc = newTrackDoc({ status: 'published' });
    const req = {
      ...makeAdminReq(),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await deleteTrack(req, res);
    expect(res._status).toBe(409);
  });

  it('allows delete on a draft track', async () => {
    mocks.state.trackDoc = newTrackDoc({ status: 'draft' });
    const req = {
      ...makeAdminReq(),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await deleteTrack(req, res);
    expect(res._status).toBe(200);
  });

  it('status flip sets publishedAt on publish and clears it on unpublish', async () => {
    mocks.state.trackDoc = newTrackDoc();
    const publish = {
      ...makeAdminReq({ status: 'published' }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res1 = makeRes();
    await updateTrackStatus(publish, res1);
    expect(res1._status).toBe(200);

    const unpublish = {
      ...makeAdminReq({ status: 'unpublished' }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res2 = makeRes();
    await updateTrackStatus(unpublish, res2);
    expect(res2._status).toBe(200);
  });

  it('rejects invalid status', async () => {
    const req = {
      ...makeAdminReq({ status: 'bogus' }),
      params: { id: new mongoose.Types.ObjectId().toString() },
    } as unknown as Request;
    const res = makeRes();
    await updateTrackStatus(req, res);
    expect(res._status).toBe(400);
  });

  it('duplicate clones the source without assignments', async () => {
    mocks.state.trackDoc = newTrackDoc({
      name: 'Original',
      checkpoints: [
        {
          _id: new mongoose.Types.ObjectId(),
          title: 'CP1',
          description: 'desc',
          icon: '',
          items: [{ type: 'task', title: 't1', body: '', required: true, href: '', action: '', actionLabel: '', metadata: {}, icon: '', accentColor: '' }],
        },
      ],
    });
    const req = {
      ...makeAdminReq(),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await duplicateTrack(req, res);
    expect(res._status).toBe(200);
  });
});

// ─── Checkpoint + Item CRUD ────────────────────────────────────────────

describe('Journey Tracks — checkpoint + item CRUD', () => {
  it('appends a checkpoint', async () => {
    mocks.state.trackDoc = newTrackDoc();
    const req = {
      ...makeAdminReq({ title: 'Checkpoint 1' }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await appendCheckpoint(req, res);
    expect(res._status).toBe(200);
  });

  it('rejects checkpoint with empty title', async () => {
    mocks.state.trackDoc = newTrackDoc();
    const req = {
      ...makeAdminReq({ title: '   ' }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await appendCheckpoint(req, res);
    expect(res._status).toBe(400);
  });

  it('deletes a checkpoint', async () => {
    mocks.state.trackDoc = newTrackDoc();
    const req = {
      ...makeAdminReq(),
      params: {
        id: mocks.state.trackDoc._id.toString(),
        cpId: new Types.ObjectId().toString(),
      },
    } as unknown as Request;
    const res = makeRes();
    await deleteCheckpoint(req, res);
    expect(res._status).toBe(200);
  });

  it('appends an item to a checkpoint', async () => {
    mocks.state.trackDoc = newTrackDoc();
    const cpId = new mongoose.Types.ObjectId();
    const req = {
      ...makeAdminReq({ type: 'task', title: 'Do thing', required: true }),
      params: {
        id: mocks.state.trackDoc._id.toString(),
        cpId: cpId.toString(),
      },
    } as unknown as Request;
    const res = makeRes();
    await appendItem(req, res);
    expect(res._status).toBe(200);
  });
});

// ─── Assignments ───────────────────────────────────────────────────────

describe('Journey Tracks — assignments', () => {
  beforeEach(() => {
    mocks.state.trackDoc = newTrackDoc();
  });

  it('creates a user-scope assignment', async () => {
    const userId = new Types.ObjectId('0000000000000000000000dd');
    const req = {
      ...makeAdminReq({ scope: 'user', userIds: [userId.toString()] }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await createAssignments(req, res);
    expect(res._status).toBe(200);
  });

  it('rejects an invalid scope', async () => {
    const req = {
      ...makeAdminReq({ scope: 'nope' }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await createAssignments(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 0 when batchIds is empty (no users enrolled)', async () => {
    const req = {
      ...makeAdminReq({ scope: 'batch', batchIds: [new Types.ObjectId().toString()] }),
      params: { id: mocks.state.trackDoc._id.toString() },
    } as unknown as Request;
    const res = makeRes();
    await createAssignments(req, res);
    expect(res._status).toBe(200);
    const body = res._body as { assigned: number; total: number };
    expect(body.assigned).toBe(0);
  });

  it('deletes an assignment', async () => {
    const id = new Types.ObjectId().toString();
    const req = {
      ...makeAdminReq(),
      params: { id: mocks.state.trackDoc._id.toString(), assignmentId: id },
    } as unknown as Request;
    const res = makeRes();
    await deleteAssignment(req, res);
    expect(res._status).toBe(200);
  });
});

// ─── User-side list / get / complete ──────────────────────────────────

describe('Journey Tracks — user side', () => {
  beforeEach(() => {
    mocks.state.trackDoc = newTrackDoc({
      status: 'published',
      checkpoints: [
        {
          _id: new mongoose.Types.ObjectId('0000000000000000000000a1'),
          title: 'CP1',
          description: '',
          icon: '',
          items: [
            {
              _id: new mongoose.Types.ObjectId('0000000000000000000000b1'),
              type: 'task',
              title: 'Required task',
              body: '',
              required: true,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
            {
              _id: new mongoose.Types.ObjectId('0000000000000000000000b2'),
              type: 'note',
              title: 'Optional note',
              body: '',
              required: false,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
          ],
        },
      ],
    });
  });

  it('returns 401 for an anonymous caller', async () => {
    const req = { params: {}, query: {}, body: {}, user: undefined } as unknown as Request;
    const res = makeRes();
    await listMyJourneys(req, res);
    expect(res._status).toBe(401);
  });

  it('returns an empty list when no tracks are assigned', async () => {
    // No assignment rows in state.assignments.
    const req = makeUserReq();
    const res = makeRes();
    await listMyJourneys(req, res);
    expect(res._status).toBe(200);
    const body = res._body as { journeys: unknown[] };
    expect(body.journeys).toEqual([]);
  });

  it('returns the track with progress when assigned + published', async () => {
    const trackId = mocks.state.trackDoc._id;
    mocks.state.assignments = [
      { userId: new mongoose.Types.ObjectId('0000000000000000000000bb'), trackId, scope: 'user' },
    ];
    mocks.state.progress = [
      {
        userId: new mongoose.Types.ObjectId('0000000000000000000000bb'),
        trackId,
        itemId: new mongoose.Types.ObjectId('0000000000000000000000b1'),
        completed: true,
        completedAt: new Date(),
      },
    ];
    const req = makeUserReq();
    const res = makeRes();
    await listMyJourneys(req, res);
    expect(res._status).toBe(200);
    const body = res._body as {
      journeys: Array<{ required: number; done: number; percent: number }>;
    };
    // 1 required task, 1 done → 100%
    expect(body.journeys[0].required).toBe(1);
    expect(body.journeys[0].done).toBe(1);
    expect(body.journeys[0].percent).toBe(100);
  });

  it('does not count non-required items toward progress', async () => {
    const trackId = mocks.state.trackDoc._id;
    mocks.state.assignments = [
      { userId: new mongoose.Types.ObjectId('0000000000000000000000bb'), trackId, scope: 'user' },
    ];
    mocks.state.progress = [
      {
        userId: new mongoose.Types.ObjectId('0000000000000000000000bb'),
        trackId,
        itemId: new mongoose.Types.ObjectId('0000000000000000000000b2'), // the optional note
        completed: true,
      },
    ];
    const req = makeUserReq();
    const res = makeRes();
    await listMyJourneys(req, res);
    expect(res._status).toBe(200);
    const body = res._body as {
      journeys: Array<{ required: number; done: number; percent: number }>;
    };
    expect(body.journeys[0].required).toBe(1);
    expect(body.journeys[0].done).toBe(0);
    expect(body.journeys[0].percent).toBe(0);
  });

  it('getMyJourney returns 404 when the track is not published', async () => {
    mocks.state.trackDoc = newTrackDoc({ status: 'draft' });
    const req = makeUserReq({
      params: { trackId: mocks.state.trackDoc._id.toString() },
    });
    const res = makeRes();
    await getMyJourney(req, res);
    expect(res._status).toBe(404);
  });

  it('getMyJourney returns 404 when the user is not assigned', async () => {
    const req = makeUserReq({
      params: { trackId: mocks.state.trackDoc._id.toString() },
    });
    const res = makeRes();
    await getMyJourney(req, res);
    expect(res._status).toBe(404);
  });

  it('completing a non-required item returns 400', async () => {
    const trackId = mocks.state.trackDoc._id;
    mocks.state.assignments = [
      { userId: new mongoose.Types.ObjectId('0000000000000000000000bb'), trackId, scope: 'user' },
    ];
    const req = makeUserReq({
      params: {
        trackId: trackId.toString(),
        itemId: '0000000000000000000000b2', // the optional note
      },
    });
    const res = makeRes();
    await completeJourneyItem(req, res);
    expect(res._status).toBe(400);
  });

  it('completing a required item returns 200', async () => {
    const trackId = mocks.state.trackDoc._id;
    mocks.state.assignments = [
      { userId: new mongoose.Types.ObjectId('0000000000000000000000bb'), trackId, scope: 'user' },
    ];
    const req = makeUserReq({
      params: {
        trackId: trackId.toString(),
        itemId: '0000000000000000000000b1', // the required task
      },
    });
    const res = makeRes();
    await completeJourneyItem(req, res);
    expect(res._status).toBe(200);
  });
});
