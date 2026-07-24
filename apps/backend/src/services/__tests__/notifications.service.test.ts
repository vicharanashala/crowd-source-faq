/**
 * notifications.service.test — Phase 1 R3: unit tests for the
 * notification service + outbox. Verifies that a failed direct
 * dispatch is captured in the outbox, that the drain successfully
 * delivers it, and that the cap + retry backoff behave correctly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  for (const coll of [
    'yaksha_faq_notifications',
    'yaksha_notification_outbox',
  ]) {
    await db.collection(coll).deleteMany({});
  }
});

const { notificationsService } = await import(
  '../../services/notifications.service.js'
);
const { default: Notification } = await import(
  '../../modules/notification/notification.model.js'
);
const { default: NotificationOutbox } = await import(
  '../../models/NotificationOutbox.js'
);
const { default: User } = await import('../../modules/auth/user.model.js');

async function seedUser(): Promise<{ _id: Types.ObjectId }> {
  const u = await User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    password: 'x'.repeat(8),
    role: 'user',
  });
  return { _id: u._id };
}

describe('notificationsService.dispatch — happy path', () => {
  it('writes to Notification on success, returns delivered=true viaOutbox=false', async () => {
    const { _id: userId } = await seedUser();
    const result = await notificationsService.dispatch({
      recipientId: userId,
      eventType: 'upvote',
      link: '/community?post=abc',
      message: 'test message',
    });
    expect(result.delivered).toBe(true);
    expect(result.viaOutbox).toBe(false);
    expect(result.notificationId).toBeInstanceOf(Types.ObjectId);

    const notif = await Notification.findById(result.notificationId);
    expect(notif?.type).toBe('upvote');
    expect(notif?.message).toBe('test message');
    expect(notif?.read).toBe(false);

    // No outbox row
    const outboxCount = await NotificationOutbox.countDocuments();
    expect(outboxCount).toBe(0);
  });
});

describe('notificationsService.dispatch — failure → outbox', () => {
  it('routes to outbox when Notification.create throws, returns delivered=true viaOutbox=true', async () => {
    const { _id: userId } = await seedUser();
    // Simulate a Mongo failure by stubbing Notification.create to throw.
    const originalCreate = Notification.create.bind(Notification);
    let callCount = 0;
    (Notification as any).create = async function patchedCreate() {
      callCount++;
      throw new Error('Simulated Mongo blip');
    };

    try {
      const result = await notificationsService.dispatch({
        recipientId: userId,
        eventType: 'upvote',
        link: '/community?post=abc',
        message: 'test',
      });
      expect(result.delivered).toBe(true);
      expect(result.viaOutbox).toBe(true);
      expect(result.outboxId).toBeInstanceOf(Types.ObjectId);
      expect(callCount).toBe(1);

      const outbox = await NotificationOutbox.findById(result.outboxId);
      expect(outbox?.attempts).toBe(0);
      expect(outbox?.type).toBe('upvote');
    } finally {
      (Notification as any).create = originalCreate;
    }
  });

  it('returns delivered=false if BOTH direct and outbox writes fail (permanent loss)', async () => {
    const { _id: userId } = await seedUser();
    const originalNotif = Notification.create.bind(Notification);
    const originalOutbox = NotificationOutbox.create.bind(NotificationOutbox);
    (Notification as any).create = async () => {
      throw new Error('Mongo down');
    };
    (NotificationOutbox as any).create = async () => {
      throw new Error('Outbox down too');
    };
    try {
      const result = await notificationsService.dispatch({
        recipientId: userId,
        eventType: 'upvote',
        link: '/x',
        message: 'y',
      });
      expect(result.delivered).toBe(false);
      expect(result.viaOutbox).toBe(false);
    } finally {
      (Notification as any).create = originalNotif;
      (NotificationOutbox as any).create = originalOutbox;
    }
  });
});

describe('notificationsService.drain — happy path', () => {
  it('delivers pending outbox rows and deletes them on success', async () => {
    const { _id: userId } = await seedUser();
    // Seed 3 outbox rows
    for (let i = 0; i < 3; i++) {
      await NotificationOutbox.create({
        recipient: userId,
        type: 'upvote',
        title: `t${i}`,
        message: `m${i}`,
        link: '/x',
        nextAttemptAt: new Date(Date.now() - 1000), // due
      });
    }
    expect(await NotificationOutbox.countDocuments()).toBe(3);

    const result = await notificationsService.drain();
    expect(result.attempted).toBe(3);
    expect(result.delivered).toBe(3);
    expect(result.rescheduled).toBe(0);
    expect(result.dropped).toBe(0);

    // All outbox rows gone, all 3 notifications persisted.
    expect(await NotificationOutbox.countDocuments()).toBe(0);
    expect(await Notification.countDocuments()).toBe(3);
  });

  it('skips rows that are not yet due (nextAttemptAt in the future)', async () => {
    const { _id: userId } = await seedUser();
    await NotificationOutbox.create({
      recipient: userId,
      type: 'upvote',
      title: 'future',
      message: 'x',
      link: '/x',
      nextAttemptAt: new Date(Date.now() + 60_000), // 1 min in the future
    });
    const result = await notificationsService.drain();
    expect(result.attempted).toBe(0);
    expect(result.delivered).toBe(0);
    expect(await NotificationOutbox.countDocuments()).toBe(1);
  });
});

describe('notificationsService.drain — failure path with backoff', () => {
  it('reschedules with exponential backoff on failure', async () => {
    const { _id: userId } = await seedUser();
    const row = await NotificationOutbox.create({
      recipient: userId,
      type: 'upvote',
      title: 't',
      message: 'm',
      link: '/x',
      nextAttemptAt: new Date(),
    });

    // Stub Notification.create to fail
    const originalCreate = Notification.create.bind(Notification);
    (Notification as any).create = async () => {
      throw new Error('still broken');
    };
    try {
      const result = await notificationsService.drain();
      expect(result.attempted).toBe(1);
      expect(result.delivered).toBe(0);
      expect(result.rescheduled).toBe(1);

      // Row still exists, with bumped attempts + future nextAttemptAt
      const reloaded = await NotificationOutbox.findById(row._id);
      expect(reloaded?.attempts).toBe(1);
      expect(reloaded?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(reloaded?.lastError).toBe('still broken');
    } finally {
      (Notification as any).create = originalCreate;
    }
  });

  it('drops the row after OUTBOX_MAX_ATTEMPTS', async () => {
    const { _id: userId } = await seedUser();
    const row = await NotificationOutbox.create({
      recipient: userId,
      type: 'upvote',
      title: 't',
      message: 'm',
      link: '/x',
      nextAttemptAt: new Date(),
    });

    // Manually set attempts to near the cap
    await NotificationOutbox.updateOne(
      { _id: row._id },
      { $set: { attempts: 23, nextAttemptAt: new Date() } },
    );

    const originalCreate = Notification.create.bind(Notification);
    (Notification as any).create = async () => {
      throw new Error('still broken');
    };
    try {
      const result = await notificationsService.drain();
      expect(result.dropped).toBe(1);
      expect(result.rescheduled).toBe(0);
      // Row is gone
      expect(await NotificationOutbox.findById(row._id)).toBeNull();
    } finally {
      (Notification as any).create = originalCreate;
    }
  });
});

describe('notificationsService.dispatch — idempotency', () => {
  it('never throws even when the user is invalid', async () => {
    const fakeId = new Types.ObjectId();
    const result = await notificationsService.dispatch({
      recipientId: fakeId,
      eventType: 'upvote',
      link: '/x',
      message: 'y',
    });
    // Notification.create with a non-existent user: by default mongoose
    // does not validate the recipient ref, so the create may succeed
    // and the row is stored. The contract: the service never throws.
    expect(typeof result.delivered).toBe('boolean');
  });
});

describe('notificationsService.outboxStats', () => {
  it('returns pending count and oldest timestamp', async () => {
    const { _id: userId } = await seedUser();
    await NotificationOutbox.create({
      recipient: userId,
      type: 'upvote',
      title: 't',
      message: 'm',
      link: '/x',
    });
    const stats = await notificationsService.outboxStats();
    expect(stats.pending).toBe(1);
    expect(stats.oldestPendingAt).toBeInstanceOf(Date);
  });

  it('returns zero/null when outbox is empty', async () => {
    const stats = await notificationsService.outboxStats();
    expect(stats.pending).toBe(0);
    expect(stats.oldestPendingAt).toBeNull();
  });
});
