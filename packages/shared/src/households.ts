/** Household contracts (ADR-005, docs/domain/DOMAIN_MODEL.md). */

export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** MVP couple cap (ADR-005). The model itself is N-ary. */
export const MAX_ACTIVE_MEMBERS = 2;
export const HOUSEHOLD_NAME_MAX_LENGTH = 60;
export const INVITATION_TTL_DAYS = 7;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type HouseholdRole = 'OWNER' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export type IncomeVisibility = 'EXACT' | 'RATIO_ONLY';

/** Split types allowed as a household default (amount-specific types are per transaction). */
export const DEFAULT_SPLIT_TYPES = ['EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT'] as const;
export type DefaultSplitType = (typeof DEFAULT_SPLIT_TYPES)[number];

export interface SplitWeight {
  memberId: string;
  /** Basis points; 10000 = 100%. */
  bps: number;
}

export interface DefaultSplitRule {
  type: DefaultSplitType;
  /** Only for CUSTOM_PERCENT: one entry per active member, summing to 10000. */
  weights?: SplitWeight[];
}

export interface HouseholdSummary {
  id: string;
  name: string;
  currency: CurrencyCode;
  timezone: string;
  role: HouseholdRole;
  activeMemberCount: number;
}

export interface HouseholdDetail {
  id: string;
  name: string;
  currency: CurrencyCode;
  timezone: string;
  defaultSplit: DefaultSplitRule;
  version: number;
  createdAt: string;
  me: { memberId: string; role: HouseholdRole };
}

export interface HouseholdMemberView {
  id: string;
  displayName: string;
  email: string;
  role: HouseholdRole;
  status: MemberStatus;
  incomeVisibility: IncomeVisibility;
  joinedAt: string;
  isMe: boolean;
}

export type InvitationStatus = 'PENDING' | 'EXPIRED';

export interface HouseholdInvitationView {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** The raw token is returned once, at creation; only its hash is stored. */
export interface CreatedInvitation {
  invitation: HouseholdInvitationView;
  token: string;
}

export interface InvitationPreview {
  householdName: string;
  inviterDisplayName: string;
  /** Masked invited email, e.g. "a***@example.com". */
  emailHint: string;
  expiresAt: string;
}

export interface AcceptedInvitation {
  householdId: string;
}
