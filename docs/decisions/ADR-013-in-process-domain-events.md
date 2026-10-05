# ADR-013 — In-process domain events for upward notifications

Status: Accepted (Stage 05, 2026-10-04) — technical decision taken during implementation; open to review.

## Context
Creating a household must seed its default categories (FR-CAT-01). The dependency rule (MODULES.md §2) says `categories` may depend on `households`, not the other way round. Calling the categories module from `households` would create an upward dependency; seeding lazily on first read would race and hide failures.

## Decision
- `common/events/DomainEvents`: a minimal, synchronous, in-process publish/subscribe bus with a typed event map (`DomainEventMap`).
- Publishers call `events.publish(tx, actor, name, payload)` **inside their unit of work**; subscribers receive the same `TransactionContext`, so their writes commit or roll back with the publisher's change. Handler errors propagate to the publisher.
- Subscribers register in `onModuleInit`.
- First event: `household.created` → `categories` seeds the default pt-BR tree.

## Consequences
+ Dependency direction preserved; seeding is atomic with household creation.
+ No infrastructure (no broker, outbox or retries) — appropriate for a modular monolith.
− Synchronous handlers add latency to the publisher's request; keep them small.
− Not suitable for side effects that must happen after commit (e-mail, webhooks). Those would need an outbox (new ADR).

## Alternatives
- Direct call from `households` to `categories`: upward dependency; rejected.
- `@nestjs/event-emitter`: async by default and outside the transaction; rejected for this use.
- Database trigger seeding: hides business data in SQL and duplicates the seed list; rejected.
