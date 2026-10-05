# Roadmap and known limitations

The MVP covers authentication, households and invitations, categories and expenses with every split type, income, the monthly dashboard with settlements, recurring expenses and installments, budgets, goals and purchase plans, analytics, deterministic insights, and deployment (Vercel + Neon). Requirements: [`product/REQUIREMENTS.md`](product/REQUIREMENTS.md).

## Open product question
- **Q-08 Currency change (FR-HH-07).** Today a household's currency is fixed at creation (BUSINESS_RULES 29). One possible rule: allow the change while the household has no records.

## Known limitations
- **Expenses and commitments**
  - A fixed cost entered by hand (outside a recurring template) counts as variable in analytics (ADR-016).
  - Participant subsets in splits and range recalculation are available in the API only.
- **Planning**
  - Purchase-plan item name and estimate edits, and goal participants, are API-only.
- **Analytics and insights**
  - Household income in analytics uses today's active members for every month.
  - Goal evolution is shown on the Análises page only.
  - An insight dismissal holds for that month only; insights live on the dashboard only.
- **Other**
  - Categories have no icons or colors.
  - Change history is viewable for expenses only.
- **Deployment** (first deploy to confirm, see [`DEPLOYMENT.md`](DEPLOYMENT.md)):
  - Vercel Services are in beta;
  - check that real client IPs reach the API, and the cold-start latency;
  - re-measure performance on the deployed stack ([`architecture/PERFORMANCE.md`](architecture/PERFORMANCE.md)).
- **Not yet done:**
  - a database role that may only append to the audit log;
  - a documented backup and restore policy (Neon point-in-time restore).

## Post-MVP ideas (not scheduled)
- **Capture and import:** natural-language capture, receipt OCR, Open Finance import, CSV/PDF import and export.
- **Assistance:** an LLM copilot over structured facts, push notifications.
- **Platforms:** PWA or native apps.
- **Household model:** multi-currency, households with more than 2 members, private individual expenses.
- **Commitments:** auto-confirmed fixed recurring costs, credit-card billing cycles.
