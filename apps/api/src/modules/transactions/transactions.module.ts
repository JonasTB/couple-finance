import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { CategoriesModule } from '../categories/public';
import { HouseholdsModule } from '../households/public';
import { IncomesModule } from '../incomes/public';
import { UsersModule } from '../users/public';
import { LedgerQuery } from './application/ledger-query';
import { SettlementsRepository } from './application/settlements.repository';
import { SettlementsService } from './application/settlements.service';
import { TransactionWriter } from './application/transaction-writer';
import { TransactionsRepository } from './application/transactions.repository';
import { TransactionsService } from './application/transactions.service';
import { SettlementEntity } from './infrastructure/settlement.entity';
import { TransactionAllocationEntity } from './infrastructure/transaction-allocation.entity';
import { TransactionEntity } from './infrastructure/transaction.entity';
import { TypeOrmSettlementsRepository } from './infrastructure/typeorm-settlements.repository';
import { TypeOrmTransactionsRepository } from './infrastructure/typeorm-transactions.repository';
import { SettlementsController } from './presentation/settlements.controller';
import { TransactionsController } from './presentation/transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, TransactionAllocationEntity, SettlementEntity]),
    HouseholdsModule,
    CategoriesModule,
    IncomesModule,
    UsersModule,
    AuditModule,
  ],
  controllers: [TransactionsController, SettlementsController],
  providers: [
    TransactionsService,
    SettlementsService,
    LedgerQuery,
    TransactionWriter,
    { provide: TransactionsRepository, useClass: TypeOrmTransactionsRepository },
    { provide: SettlementsRepository, useClass: TypeOrmSettlementsRepository },
  ],
  exports: [LedgerQuery, TransactionWriter],
})
export class TransactionsModule {}
