export abstract class InsightDismissalsRepository {
  /** Fingerprint → dismissal instant, for the user in the household. */
  abstract forUser(householdId: string, userId: string): Promise<Map<string, Date>>;
  /** Idempotent: dismissing twice keeps the first instant. */
  abstract dismiss(
    householdId: string,
    userId: string,
    fingerprint: string,
    at: Date,
  ): Promise<void>;
  abstract undo(householdId: string, userId: string, fingerprint: string): Promise<void>;
}
