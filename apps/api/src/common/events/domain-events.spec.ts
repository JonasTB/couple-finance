import { type TransactionContext } from '../database/unit-of-work';
import { DomainEvents } from './domain-events';

describe('DomainEvents', () => {
  const tx: TransactionContext = { kind: 'transaction' };
  const actor = { userId: 'u1', requestId: 'r1' };

  it('runs subscribers in registration order with the publisher transaction', async () => {
    const events = new DomainEvents();
    const calls: string[] = [];
    events.subscribe('household.created', async (receivedTx, _actor, payload) => {
      expect(receivedTx).toBe(tx);
      calls.push(`a:${payload.householdId}`);
      await Promise.resolve();
    });
    events.subscribe('household.created', async (_tx, receivedActor, payload) => {
      calls.push(`b:${payload.householdId}:${receivedActor.userId}`);
      await Promise.resolve();
    });
    await events.publish(tx, actor, 'household.created', { householdId: 'h1' });
    expect(calls).toEqual(['a:h1', 'b:h1:u1']);
  });

  it('propagates handler failures to the publisher (so its transaction rolls back)', async () => {
    const events = new DomainEvents();
    events.subscribe('household.created', () => Promise.reject(new Error('seed failed')));
    await expect(
      events.publish(tx, actor, 'household.created', { householdId: 'h1' }),
    ).rejects.toThrow('seed failed');
  });
});
