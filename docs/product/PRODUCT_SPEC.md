# Product Specification

## Vision
Create a financial operating system for couples. The app centralizes the household's financial truth while money remains in each person's bank/account.

## Primary jobs
- Record household and individual expenses quickly.
- Distinguish who paid from who is responsible for the cost.
- Show each member's paid amount and percentage.
- Explain WHY one member paid more in a period.
- Compare actual contribution with planned split (50/50, income proportional, custom or individual).
- Track rent/mortgage, condominium, utilities, subscriptions and other recurring commitments.
- Track installments and show when monthly commitments will end.
- Set category/household budgets and show remaining capacity.
- Track goals and purchase plans (e.g. furnishing a home).
- Detect spending patterns and produce deterministic, explainable savings insights.

## Example insight
`Alex paid 59% this month versus a planned 50%. The difference was mainly caused by condominium (+R$600), refrigerator installment (+R$310) and supermarket (+R$290).`

Do not frame this as debt/shame by default. Prefer contribution language and natural compensation over time.

## Household model
A `Household` is the shared workspace. MVP UX focuses on couples, but the data model must not hard-code exactly two members where avoidable. Stage 01 decision: the MVP caps active members at 2 via configuration (ADR-005). All transactions, including individual ones, are visible to every member.

## Expense capture
A transaction can include description, amount, date, category/subcategory, payer, participants, split rule, payment method, notes/tags, recurrence/installment metadata and household.

## Split modes
- Equal
- Income proportional
- Custom percentage/amount
- Individual
A household has a default split rule; a transaction may override it.

## Income
Members may register income. Preserve historical changes because proportional responsibility depends on the period. Privacy (Stage 01 decision): each member chooses `EXACT` or `RATIO_ONLY` visibility for their own income — see ADR-005.

## Recurring expenses
Rent/mortgage, condominium, water, electricity, internet, insurance, subscriptions, gym, etc. Separate fixed and variable recurring concepts where useful.

## Installments
Show total, installment value, paid/remaining installments, monthly commitment and release timeline. Example: `R$420/month will be released in December`.

## Budgets
Support household total and category budgets. Show spent, remaining, percentage used and in-app alerts.

## Goals
Target amount, deadline, contributions, participants and progress. Forecast completion using deterministic calculations.

## Purchase Plan
A structured project such as `Casita`: items with estimated price, paid price, priority, status (`pending`, `purchased`, `future`), responsible member, optional URL and notes. This is distinct from a savings Goal but may be associated with one.

## Analytics
Monthly spend, category spend, member payments, planned vs actual contribution, income commitment, fixed vs variable, installment load, trends and goal evolution.

## Insights engine
MVP insights are deterministic rules, not LLM outputs. Examples: category >20% above 3-month average; budget >80%; installment ending; actual contribution deviating from planned; dominant category; meaningful month-over-month change. Every insight must expose evidence.

## Future roadmap — not MVP
Natural-language transaction capture, receipt OCR, Open Finance import, Financial Copilot/LLM, push notifications, CSV/PDF export/import, PWA/native mobile.

## Non-goals
No bank account, custody, Pix, card issuance, transfers, payment initiation, lending, investment advice or automatic bank connectivity in MVP.
