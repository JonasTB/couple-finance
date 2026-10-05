import type { TransactionView } from '@couple-finance/shared';
import { type TransactionRecord } from './transactions.repository';

export function toTransactionView(record: TransactionRecord): TransactionView {
  return {
    id: record.id,
    description: record.description,
    amountCents: record.amountCents,
    date: record.date,
    categoryId: record.categoryId,
    payerMemberId: record.payerMemberId,
    paymentMethod: record.paymentMethod,
    notes: record.notes,
    tags: record.tags,
    split: record.split,
    allocations: record.allocations,
    origin: record.origin,
    createdByMemberId: record.createdByMemberId,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

/** Audit snapshot (ADR-008): the business state, without timestamps that change on every save. */
export function transactionSnapshot(record: TransactionRecord): Record<string, unknown> {
  const { createdAt: _created, updatedAt: _updated, ...rest } = toTransactionView(record);
  return rest;
}
