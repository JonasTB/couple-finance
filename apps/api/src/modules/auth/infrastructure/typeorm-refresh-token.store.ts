import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull, type Repository } from 'typeorm';
import {
  type NewRefreshToken,
  type RefreshTokenTransaction,
  RefreshTokenStore,
  type StoredRefreshToken,
} from '../application/ports';
import { type RefreshTokenRevokedReason } from '../domain/refresh-token-policy';
import { RefreshTokenEntity } from './refresh-token.entity';

function toStored(entity: RefreshTokenEntity): StoredRefreshToken {
  return {
    id: entity.id,
    userId: entity.userId,
    familyId: entity.familyId,
    expiresAt: entity.expiresAt,
    rotatedAt: entity.rotatedAt,
    revokedAt: entity.revokedAt,
  };
}

async function revokeFamilyWith(
  manager: EntityManager,
  familyId: string,
  reason: RefreshTokenRevokedReason,
  revokedAt: Date,
): Promise<void> {
  await manager.update(
    RefreshTokenEntity,
    { familyId, revokedAt: IsNull() },
    { revokedAt, revokedReason: reason },
  );
}

@Injectable()
export class TypeOrmRefreshTokenStore extends RefreshTokenStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RefreshTokenEntity) private readonly tokens: Repository<RefreshTokenEntity>,
  ) {
    super();
  }

  async insert(token: NewRefreshToken): Promise<void> {
    await this.tokens.insert(token);
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const entity = await this.tokens.findOneBy({ tokenHash });
    return entity ? toStored(entity) : null;
  }

  async revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokedReason,
    revokedAt: Date,
  ): Promise<void> {
    await revokeFamilyWith(this.tokens.manager, familyId, reason, revokedAt);
  }

  withLockedToken<T>(
    tokenHash: string,
    work: (token: StoredRefreshToken | null, tx: RefreshTokenTransaction) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(RefreshTokenEntity, {
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      const tx: RefreshTokenTransaction = {
        insert: async (token) => {
          await manager.insert(RefreshTokenEntity, token);
        },
        markRotated: async (tokenId, rotatedAt, replacedById) => {
          await manager.update(RefreshTokenEntity, { id: tokenId }, { rotatedAt, replacedById });
        },
        revokeFamily: (familyId, reason, revokedAt) =>
          revokeFamilyWith(manager, familyId, reason, revokedAt),
      };
      return work(entity ? toStored(entity) : null, tx);
    });
  }
}
