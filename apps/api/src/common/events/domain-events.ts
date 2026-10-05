import { Injectable } from '@nestjs/common';
import { type Actor } from '../auth/current-actor.decorator';
import { type TransactionContext } from '../database/unit-of-work';

/** Events published by lower modules for higher ones (keeps MODULES.md dependency direction). */
export interface DomainEventMap {
  'household.created': { householdId: string };
}

export type DomainEventName = keyof DomainEventMap;

type Handler<K extends DomainEventName> = (
  tx: TransactionContext,
  actor: Actor,
  payload: DomainEventMap[K],
) => Promise<void>;

/**
 * Minimal synchronous in-process event bus. Handlers run inside the publisher's transaction,
 * so their writes commit or roll back together with the change that triggered them.
 * Not a message broker: no persistence, no retries, no async delivery.
 */
@Injectable()
export class DomainEvents {
  private readonly handlers = new Map<DomainEventName, Handler<DomainEventName>[]>();

  subscribe<K extends DomainEventName>(name: K, handler: Handler<K>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as Handler<DomainEventName>);
    this.handlers.set(name, list);
  }

  async publish<K extends DomainEventName>(
    tx: TransactionContext,
    actor: Actor,
    name: K,
    payload: DomainEventMap[K],
  ): Promise<void> {
    for (const handler of this.handlers.get(name) ?? []) {
      await handler(tx, actor, payload);
    }
  }
}
