# ADR-005 — Roles, permissions and privacy

Status: Accepted (Stage 01, 2026-10-04). Inputs: user decisions on 2026-10-04 — roles `OWNER + MEMBER`; individual expenses visible to both; income visibility chosen per member.

## Decision

### Roles
- `OWNER`: the household creator (or a member who received ownership). Exactly one active owner in MVP.
- `MEMBER`: full financial read/write; no administrative actions.

### Permission matrix

| Action | OWNER | MEMBER |
|---|---|---|
| Read all household financial data (transactions incl. `INDIVIDUAL`, budgets, goals, plans, analytics) | ✅ | ✅ |
| Create/edit/delete/restore transactions, recurring, installments, budgets, goals, plans, categories | ✅ | ✅ |
| Create/edit own income, set own income visibility | ✅ | ✅ |
| Edit another member's income | ❌ | ❌ |
| Edit household name, timezone, default split rule | ✅ | ❌ |
| Create/revoke invitations, remove member | ✅ | ❌ |
| Transfer ownership, archive household | ✅ | ❌ |
| Leave household | ✅ after transferring ownership if others remain | ✅ |

Any member may edit records created by the partner; the audit trail records who did it.

### Capacity
`MAX_ACTIVE_MEMBERS = 2` in MVP (couple UX). The model and algorithms are N-ary; raising the limit is a configuration plus UX change.

### Privacy
- All transactions are visible to all members (no private expenses in MVP).
- Income: each member sets `incomeVisibility`:
  - `EXACT` — partners see amounts and history.
  - `RATIO_ONLY` (default) — partners see only resulting shares in bps; amounts are omitted from every response (incomes, analytics, audit `before/after`).
- Proportional split snapshots store bps, never raw income.
- **Caveat**: with two members, `RATIO_ONLY` can be reversed by a member who knows their own income. This is disclosed in the UI. (Q-02 accepted.)

## Amendments (Stage 04 implementation, 2026-10-04)
1. **Capacity counts valid pending invitations**: active members + still-valid pending invitations to *other* emails must stay below the cap. With the couple cap, an owner invites one person at a time (cancel to invite someone else).
2. **Re-inviting an email replaces its pending invitation** (new token, old one revoked), because the token is shown only once.
3. **Leaving**: the owner must transfer ownership first while others remain (`OWNERSHIP_TRANSFER_REQUIRED`); the last member leaving archives the household. Removal and leaving keep the member row (`LEFT`/`REMOVED`) for history; rejoining creates a new membership row.
4. **Default split types** are `EQUAL`, `INCOME_PROPORTIONAL`, `CUSTOM_PERCENT` (amount-specific rules belong to transactions). A household is created with `EQUAL` or `INCOME_PROPORTIONAL`; `CUSTOM_PERCENT` needs one bps weight per active member. When membership changes make custom weights invalid, the default falls back to `EQUAL` (audited).
5. **Invitation acceptance** requires the authenticated user's email to equal the invited email (`INVITATION_EMAIL_MISMATCH`); unknown/expired/revoked/used tokens all return `INVITATION_INVALID`.
6. **UI wording**: the OWNER role is shown as "Administra a casa" (not "responsável", which the domain reserves for economic responsibility).

## Consequences
+ Simple mental model for couples; administrative actions concentrated.
+ Income privacy respected by default without blocking proportional splits.
− Viewer-aware projections add work to analytics and audit endpoints; covered by tests.

## Alternatives
- Symmetric members: simpler, but ambiguous for removal/invitation conflicts.
- Private individual expenses: rejected by the user for MVP.
