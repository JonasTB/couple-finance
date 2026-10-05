/**
 * Per-browser conveniences only (never financial state). Storage may be unavailable
 * (private mode, blocked site data), so every access is guarded.
 */
const ACTIVE_HOUSEHOLD_KEY = 'cf:activeHouseholdId';
const PENDING_INVITATION_KEY = 'cf:pendingInvitationToken';

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) {
      storage().removeItem(key);
    } else {
      storage().setItem(key, value);
    }
  } catch {
    // Ignore: the app works without it.
  }
}

export const activeHousehold = {
  get: () => read(() => localStorage, ACTIVE_HOUSEHOLD_KEY),
  set: (id: string | null) => {
    write(() => localStorage, ACTIVE_HOUSEHOLD_KEY, id);
  },
};

/**
 * Keeps an invitation token while the invitee signs in or creates an account. Session storage:
 * scoped to the tab and cleared when it closes; removed as soon as the invitation is accepted.
 */
export const pendingInvitation = {
  get: () => read(() => sessionStorage, PENDING_INVITATION_KEY),
  set: (token: string | null) => {
    write(() => sessionStorage, PENDING_INVITATION_KEY, token);
  },
};
