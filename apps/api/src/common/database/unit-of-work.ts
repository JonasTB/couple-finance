/**
 * Explicit transaction boundary for application services (MODULES.md §4).
 * The context is opaque: application code passes it to repositories without knowing the ORM.
 */
export interface TransactionContext {
  readonly kind: 'transaction';
}

export abstract class UnitOfWork {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
