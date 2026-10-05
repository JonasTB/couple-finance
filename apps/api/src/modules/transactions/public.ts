// Public API of the transactions module: ledger reads for analytics, writes for commitments.
export { TransactionsModule } from './transactions.module';
export {
  type ConfirmationEntry,
  type InstallmentEntry,
  type LedgerEntry,
  LedgerQuery,
  type MemberFlows,
  type MonthlyResponsibilityRow,
  type MonthlySpendRow,
} from './application/ledger-query';
export {
  type SplitSnapshot,
  type TransactionInput,
  TransactionWriter,
} from './application/transaction-writer';
// Request shape of a split, reused by commitment templates (presentation contract).
export { SplitInputDto } from './presentation/dto/transactions.dto';
