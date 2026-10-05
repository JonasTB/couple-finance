# Dependency Rules

- Presentation/controllers depend on application use cases, not directly on TypeORM repositories.
- Domain code must not import NestJS, TypeORM, HTTP or UI concerns when separated as domain.
- Infrastructure implements ports/interfaces defined toward the application/domain side.
- Cross-module access should use explicit public services/contracts, not reach into another module's internals.
- Do not share TypeORM entities with the web app.
- API DTOs are boundary contracts, not domain entities.
- Financial calculations should live in named/tested domain/application services or value objects, never React components/controllers.
- Analytics may use optimized read queries but must reuse canonical business semantics.
- `packages/shared` must remain small; duplication is preferable to harmful coupling.
