import { reconcileDefaultSplit, validateDefaultSplit } from './default-split';
import { effectiveInvitationStatus, maskEmail } from './invitation-policy';
import { hasCapacityForInvitation, hasCapacityToJoin, planLeave } from './membership-policy';
import { hasPermission } from './permissions';

describe('permissions (ADR-005)', () => {
  it('lets every member read and owners manage', () => {
    expect(hasPermission('MEMBER', 'household.read')).toBe(true);
    expect(hasPermission('OWNER', 'household.read')).toBe(true);
    for (const permission of [
      'household.manage',
      'members.manage',
      'invitations.manage',
    ] as const) {
      expect(hasPermission('OWNER', permission)).toBe(true);
      expect(hasPermission('MEMBER', permission)).toBe(false);
    }
  });
});

describe('validateDefaultSplit', () => {
  const members = ['m1', 'm2'];

  it('accepts EQUAL and INCOME_PROPORTIONAL without weights', () => {
    expect(validateDefaultSplit({ type: 'EQUAL' }, members)).toEqual([]);
    expect(validateDefaultSplit({ type: 'INCOME_PROPORTIONAL' }, members)).toEqual([]);
    expect(validateDefaultSplit({ type: 'EQUAL', weights: [] }, members)).toEqual([
      'WEIGHTS_NOT_ALLOWED',
    ]);
  });

  it('accepts CUSTOM_PERCENT covering every active member and summing to 10000', () => {
    const rule = {
      type: 'CUSTOM_PERCENT' as const,
      weights: [
        { memberId: 'm1', bps: 6000 },
        { memberId: 'm2', bps: 4000 },
      ],
    };
    expect(validateDefaultSplit(rule, members)).toEqual([]);
  });

  it.each([
    [[], ['WEIGHTS_REQUIRED']],
    [[{ memberId: 'm1', bps: 10000 }], ['WEIGHTS_MUST_COVER_ACTIVE_MEMBERS']],
    [
      [
        { memberId: 'm1', bps: 5000 },
        { memberId: 'm1', bps: 5000 },
      ],
      ['WEIGHTS_MUST_COVER_ACTIVE_MEMBERS'],
    ],
    [
      [
        { memberId: 'm1', bps: 6000 },
        { memberId: 'm3', bps: 4000 },
      ],
      ['WEIGHTS_MUST_COVER_ACTIVE_MEMBERS'],
    ],
    [
      [
        { memberId: 'm1', bps: 6000 },
        { memberId: 'm2', bps: 3999 },
      ],
      ['WEIGHTS_MUST_SUM_TO_10000'],
    ],
    [
      [
        { memberId: 'm1', bps: 60.5 },
        { memberId: 'm2', bps: 9939.5 },
      ],
      ['WEIGHT_OUT_OF_RANGE'],
    ],
    [
      [
        { memberId: 'm1', bps: -1 },
        { memberId: 'm2', bps: 10001 },
      ],
      ['WEIGHT_OUT_OF_RANGE'],
    ],
  ])('rejects CUSTOM_PERCENT weights %j', (weights, expected) => {
    expect(validateDefaultSplit({ type: 'CUSTOM_PERCENT', weights }, members)).toEqual(expected);
  });

  it('falls back to EQUAL when custom weights stop matching the members', () => {
    const rule = {
      type: 'CUSTOM_PERCENT' as const,
      weights: [
        { memberId: 'm1', bps: 6000 },
        { memberId: 'm2', bps: 4000 },
      ],
    };
    expect(reconcileDefaultSplit(rule, members)).toBe(rule);
    expect(reconcileDefaultSplit(rule, ['m1'])).toEqual({ type: 'EQUAL' });
    expect(reconcileDefaultSplit({ type: 'INCOME_PROPORTIONAL' }, ['m1'])).toEqual({
      type: 'INCOME_PROPORTIONAL',
    });
  });
});

describe('membership policy', () => {
  it('caps active members plus other valid pending invitations at 2', () => {
    expect(hasCapacityForInvitation(1, 0)).toBe(true);
    expect(hasCapacityForInvitation(1, 1)).toBe(false);
    expect(hasCapacityForInvitation(2, 0)).toBe(false);
    expect(hasCapacityToJoin(1)).toBe(true);
    expect(hasCapacityToJoin(2)).toBe(false);
  });

  it('plans leaving according to role and remaining members', () => {
    expect(planLeave('MEMBER', 2)).toBe('LEAVE');
    expect(planLeave('OWNER', 2)).toBe('TRANSFER_OWNERSHIP_FIRST');
    expect(planLeave('OWNER', 1)).toBe('LEAVE_AND_ARCHIVE');
  });
});

describe('invitation policy', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('derives expiry from expiresAt (exclusive)', () => {
    const pending = { status: 'PENDING' as const, expiresAt: new Date(now.getTime() + 1) };
    expect(effectiveInvitationStatus(pending, now)).toBe('PENDING');
    expect(effectiveInvitationStatus({ ...pending, expiresAt: now }, now)).toBe('EXPIRED');
    expect(effectiveInvitationStatus({ ...pending, status: 'ACCEPTED', expiresAt: now }, now)).toBe(
      'ACCEPTED',
    );
  });

  it.each([
    ['alexandre@example.com', 'a********@example.com'],
    ['jo@example.com', 'j***@example.com'],
    ['invalid', '***'],
  ])('masks %s as %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});
