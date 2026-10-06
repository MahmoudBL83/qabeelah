const test = require('node:test');
const assert = require('node:assert/strict');

const messagesRoute = require('../dist/routes/messages.js');
const { UserRole } = require('../dist/types/shared.js');

const { resolveBranchForUser, getConversationKey, buildUnreadMessageQuery, DEFAULT_BRANCH_ID } = messagesRoute;

test('resolveBranchForUser keeps sub-admin pinned to own branch', () => {
  const user = { id: 'u1', role: UserRole.SUB_ADMIN, branchId: 'branch-a' };
  assert.equal(resolveBranchForUser(user, 'branch-b'), 'branch-a');
  assert.equal(resolveBranchForUser(user), 'branch-a');
});

test('resolveBranchForUser allows admin requested branch with fallback', () => {
  const admin = { id: 'u2', role: UserRole.QABILA_ADMIN, branchId: 'branch-a' };
  assert.equal(resolveBranchForUser(admin, 'branch-b'), 'branch-b');
  assert.equal(resolveBranchForUser(admin), 'branch-a');

  const member = { id: 'u3', role: UserRole.MEMBER, branchId: 'member-branch' };
  assert.equal(resolveBranchForUser(member, 'other-branch'), 'member-branch');

  const noBranchSubAdmin = { id: 'u4', role: UserRole.SUB_ADMIN };
  assert.equal(resolveBranchForUser(noBranchSubAdmin), DEFAULT_BRANCH_ID);
});

test('getConversationKey returns stable direct key regardless of order', () => {
  const keyOne = getConversationKey('DIRECT', 'user-a', 'user-b', 'tenant-1');
  const keyTwo = getConversationKey('DIRECT', 'user-b', 'user-a', 'tenant-1');
  assert.equal(keyOne, keyTwo);
  assert.match(keyOne, /^direct:/);
});

test('buildUnreadMessageQuery excludes sender for branch and announcement scopes', () => {
  const readAt = new Date('2024-01-01T00:00:00Z');

  const branchQuery = buildUnreadMessageQuery({
    tenantId: 'tenant-1',
    userId: 'u1',
    scope: 'BRANCH',
    branchId: 'branch-a',
  }, readAt);

  assert.deepEqual(branchQuery, {
    tenantId: 'tenant-1',
    scope: 'BRANCH',
    createdAt: { $gt: readAt },
    branchId: 'branch-a',
    senderId: { $ne: 'u1' },
  });

  const announcementQuery = buildUnreadMessageQuery({
    tenantId: 'tenant-1',
    userId: 'u1',
    scope: 'ANNOUNCEMENT',
    branchId: 'branch-a',
  }, readAt);

  assert.equal(announcementQuery.senderId.$ne, 'u1');
  assert.deepEqual(announcementQuery.$or, [
    { branchId: { $exists: false } },
    { branchId: '' },
    { branchId: 'branch-a' },
  ]);
});

test('buildUnreadMessageQuery for direct includes recipient and sender pairing', () => {
  const readAt = new Date('2024-01-01T00:00:00Z');

  const directQuery = buildUnreadMessageQuery({
    tenantId: 'tenant-1',
    userId: 'u1',
    scope: 'DIRECT',
    targetUserId: 'u2',
  }, readAt);

  assert.deepEqual(directQuery, {
    tenantId: 'tenant-1',
    scope: 'DIRECT',
    createdAt: { $gt: readAt },
    recipientUserId: 'u1',
    senderId: 'u2',
  });
});
