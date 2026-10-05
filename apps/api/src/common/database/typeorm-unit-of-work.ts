import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { type TransactionContext, UnitOfWork } from './unit-of-work';

const managers = new WeakMap<TransactionContext, EntityManager>();

/** Infrastructure helper: the EntityManager bound to a transaction context. */
export function entityManagerOf(tx: TransactionContext): EntityManager {
  const manager = managers.get(tx);
  if (!manager) {
    throw new Error('Unknown or finished transaction context');
  }
  return manager;
}

@Injectable()
export class TypeOrmUnitOfWork extends UnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const tx: TransactionContext = { kind: 'transaction' };
      managers.set(tx, manager);
      try {
        return await work(tx);
      } finally {
        managers.delete(tx);
      }
    });
  }
}
