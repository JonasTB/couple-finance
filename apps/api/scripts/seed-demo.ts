/**
 * Local demo data (Stage 12). Development only: refuses to run with NODE_ENV=production.
 *
 *   pnpm db:seed:demo                   # couple "Ana & Bruno", last 12 months
 *   pnpm db:seed:demo -- --reset        # deletes that couple first, then seeds again
 *   pnpm db:seed:demo -- --profile=volume --reset   # 5 years × ~300 expenses/month (NFR-06)
 *   pnpm db:seed:demo -- --profile=volume --delete  # removes that profile's data and stops
 *
 * The real application runs in-process and every record goes through the public HTTP API, so the
 * seed obeys every domain rule (splits, audit, validation). In the demo profile a controlled clock
 * walks through the months, so goals, budgets and audit events get realistic dates.
 * Sign in with the e-mails below and DEMO_PASSWORD (default in `DEFAULT_PASSWORD`, local only).
 */
import '../src/config/register-env';
import 'reflect-metadata';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_CSRF_HEADER, AUTH_CSRF_HEADER_VALUE } from '@couple-finance/shared';
import { DataSource } from 'typeorm';
import { Clock } from '../src/common/time/clock';

/** CLI output (this script is a terminal tool, not part of the API). */
const log = (message: string) => process.stdout.write(`${message}\n`);

const DEFAULT_PASSWORD = 'casal demo somente local';
const TIME_ZONE_NOON_UTC = 15; // 12:00 in America/Sao_Paulo

interface Profile {
  emails: [string, string];
  householdName: string;
  months: number;
  /** Variable expenses per month (approximate). */
  expensesPerMonth: number;
  timeTravel: boolean;
}

const PROFILES: Record<string, Profile> = {
  demo: {
    emails: ['demo.ana@example.com', 'demo.bruno@example.com'],
    householdName: 'Casa Ana & Bruno',
    months: 12,
    expensesPerMonth: 22,
    timeTravel: true,
  },
  volume: {
    emails: ['volume.ana@example.com', 'volume.bruno@example.com'],
    householdName: 'Casa Volume',
    months: 60,
    expensesPerMonth: 295,
    timeTravel: false,
  },
};

// --- small deterministic helpers --------------------------------------------------------------

/** Mulberry32: same seed → same demo data. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthShift = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const index = (y ?? 0) * 12 + (m ?? 1) - 1 + delta;
  return `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
};
const daysIn = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, m ?? 1, 0)).getUTCDate();
};
const dateIn = (month: string, day: number) => `${month}-${pad(Math.min(day, daysIn(month)))}`;
const todayInSaoPaulo = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

class SeedClock extends Clock {
  private current = new Date();
  now(): Date {
    return new Date(this.current);
  }
  setDate(date: string): void {
    this.current = new Date(`${date}T${pad(TIME_ZONE_NOON_UTC)}:00:00Z`);
  }
  reset(): void {
    this.current = new Date();
  }
}

// --- HTTP client against the in-process app -----------------------------------------------------

class Api {
  constructor(private readonly base: string) {}

  async call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        [AUTH_CSRF_HEADER]: AUTH_CSRF_HEADER_VALUE,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${String(response.status)} ${text}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

interface Person {
  email: string;
  token: string;
  memberId: string;
  tokenDate: string;
}

// --- reset ---------------------------------------------------------------------------------------

const RESET_STATEMENTS = [
  'DELETE FROM insight_dismissals WHERE household_id = ANY($1)',
  'DELETE FROM transaction_allocations WHERE transaction_id IN (SELECT id FROM transactions WHERE household_id = ANY($1))',
  'DELETE FROM goal_contributions WHERE goal_id IN (SELECT id FROM goals WHERE household_id = ANY($1))',
  'DELETE FROM purchase_plan_items WHERE purchase_plan_id IN (SELECT id FROM purchase_plans WHERE household_id = ANY($1))',
  'DELETE FROM recurring_occurrence_skips WHERE recurring_expense_id IN (SELECT id FROM recurring_expenses WHERE household_id = ANY($1))',
  'DELETE FROM transactions WHERE household_id = ANY($1)',
  'DELETE FROM installment_plans WHERE household_id = ANY($1)',
  'DELETE FROM recurring_expenses WHERE household_id = ANY($1)',
  'DELETE FROM purchase_plans WHERE household_id = ANY($1)',
  'DELETE FROM goals WHERE household_id = ANY($1)',
  'DELETE FROM budgets WHERE household_id = ANY($1)',
  'DELETE FROM settlements WHERE household_id = ANY($1)',
  'DELETE FROM income_records WHERE household_id = ANY($1)',
  'DELETE FROM audit_events WHERE household_id = ANY($1)',
  'DELETE FROM household_invitations WHERE household_id = ANY($1)',
  'DELETE FROM categories WHERE household_id = ANY($1) AND parent_id IS NOT NULL',
  'DELETE FROM categories WHERE household_id = ANY($1)',
  'DELETE FROM household_members WHERE household_id = ANY($1)',
  'DELETE FROM households WHERE id = ANY($1)',
];

/** Deletes the profile's users and every household they belong to (local data only). */
async function reset(dataSource: DataSource, emails: readonly string[]): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const users: { id: string }[] = await manager.query(
      'SELECT id FROM users WHERE email = ANY($1)',
      [emails],
    );
    const userIds = users.map((u) => u.id);
    const households: { household_id: string }[] = await manager.query(
      'SELECT DISTINCT household_id FROM household_members WHERE user_id = ANY($1)',
      [userIds],
    );
    const ids = households.map((h) => h.household_id);
    for (const statement of RESET_STATEMENTS) {
      await manager.query(statement, [ids]);
    }
    await manager.query('DELETE FROM insight_dismissals WHERE user_id = ANY($1)', [userIds]);
    await manager.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [userIds]);
    await manager.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  });
}

// --- seeding -------------------------------------------------------------------------------------

interface Category {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

async function seed(api: Api, clock: SeedClock, profile: Profile, password: string): Promise<void> {
  const rand = random(20261005);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const amount = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;

  const today = todayInSaoPaulo();
  const current = today.slice(0, 7);
  const first = monthShift(current, -(profile.months - 1));
  const months = Array.from({ length: profile.months }, (_, i) => monthShift(first, i));
  const startDate = `${first}-01`;

  const people: Person[] = [];
  const at = (date: string) => {
    if (profile.timeTravel) clock.setDate(date);
  };
  /** Access tokens live 15 minutes on the seed clock: sign in again whenever the day changes. */
  const as = async (index: number, date: string): Promise<string> => {
    const person = people[index];
    if (!person) throw new Error('unknown person');
    const day = profile.timeTravel ? date : today;
    if (person.tokenDate !== day) {
      const session = await api.call<{ accessToken: string }>('POST', '/auth/login', {
        email: person.email,
        password,
      });
      person.token = session.accessToken;
      person.tokenDate = day;
    }
    return person.token;
  };

  // Household, partner, incomes ------------------------------------------------------------------
  at(startDate);
  for (const [i, email] of profile.emails.entries()) {
    const session = await api.call<{ accessToken: string }>('POST', '/auth/register', {
      email,
      password,
      displayName: i === 0 ? 'Ana' : 'Bruno',
    });
    people.push({
      email,
      token: session.accessToken,
      memberId: '',
      tokenDate: profile.timeTravel ? startDate : today,
    });
  }
  const household = await api.call<{ id: string; me: { memberId: string } }>(
    'POST',
    '/households',
    {
      name: profile.householdName,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      defaultSplit: { type: 'INCOME_PROPORTIONAL' },
    },
    await as(0, startDate),
  );
  const H = `/households/${household.id}`;
  const invite = await api.call<{ token: string }>(
    'POST',
    `${H}/invitations`,
    { email: profile.emails[1] },
    await as(0, startDate),
  );
  await api.call('POST', '/invitations/accept', { token: invite.token }, await as(1, startDate));
  const members = await api.call<{ id: string; isMe: boolean }[]>(
    'GET',
    `${H}/members`,
    undefined,
    await as(0, startDate),
  );
  (people[0] as Person).memberId = household.me.memberId;
  (people[1] as Person).memberId = members.find((m) => !m.isMe)?.id ?? '';
  const [ana, bruno] = [(people[0] as Person).memberId, (people[1] as Person).memberId];

  await api.call(
    'POST',
    `${H}/incomes/me`,
    { monthlyAmountCents: 820_000, effectiveFrom: startDate },
    await as(0, startDate),
  );
  await api.call(
    'POST',
    `${H}/incomes/me`,
    { monthlyAmountCents: 560_000, effectiveFrom: startDate },
    await as(1, startDate),
  );
  await api.call('PATCH', `${H}/members/me`, { incomeVisibility: 'EXACT' }, await as(0, startDate));

  const tree = await api.call<Category[]>(
    'GET',
    `${H}/categories`,
    undefined,
    await as(0, startDate),
  );
  const cat = (parent: string, child?: string): string => {
    const top = tree.find((c) => c.name === parent);
    const id = child ? top?.children.find((c) => c.name === child)?.id : top?.id;
    if (!id) throw new Error(`category ${parent} › ${child ?? ''} not found`);
    return id;
  };

  // A list of dated actions, run in date order (the clock follows them in the demo profile).
  const events: { date: string; order: number; run: () => Promise<void> }[] = [];
  const on = (date: string, run: () => Promise<void>, order = 5) => {
    if (date <= today) events.push({ date, order, run });
  };

  // Recurring commitments -------------------------------------------------------------------------
  const recurring = [
    {
      description: 'Aluguel',
      category: cat('Moradia', 'Aluguel ou financiamento'),
      cents: 280_000,
      day: 5,
      payer: 0,
      type: 'FIXED',
      method: 'BANK_TRANSFER',
    },
    {
      description: 'Condomínio',
      category: cat('Moradia', 'Condomínio'),
      cents: 65_000,
      day: 10,
      payer: 1,
      type: 'FIXED',
      method: 'BOLETO',
    },
    {
      description: 'Internet',
      category: cat('Moradia', 'Internet e telefone'),
      cents: 12_990,
      day: 15,
      payer: 1,
      type: 'FIXED',
      method: 'CREDIT_CARD',
    },
    {
      description: 'Energia',
      category: cat('Moradia', 'Energia'),
      cents: 18_000,
      day: 20,
      payer: 0,
      type: 'VARIABLE',
      method: 'PIX',
    },
    {
      description: 'Streaming',
      category: cat('Assinaturas', 'Streaming'),
      cents: 5_590,
      day: 12,
      payer: 0,
      type: 'FIXED',
      method: 'CREDIT_CARD',
    },
  ] as const;
  for (const template of recurring) {
    on(
      startDate,
      async () => {
        const token = await as(0, startDate);
        const created = await api.call<{ id: string }>(
          'POST',
          `${H}/recurring-expenses`,
          {
            description: template.description,
            categoryId: template.category,
            expectedAmountCents: template.cents,
            amountType: template.type,
            frequency: 'MONTHLY',
            interval: 1,
            startDate: dateIn(first, template.day),
            payerMemberId: template.payer === 0 ? ana : bruno,
            paymentMethod: template.method,
          },
          token,
        );
        for (const month of months) {
          const date = dateIn(month, template.day);
          const cents = template.type === 'VARIABLE' ? amount(13_000, 26_000) : template.cents;
          on(
            date,
            async () => {
              await api.call(
                'POST',
                `${H}/recurring-expenses/${created.id}/occurrences/${date}/confirm`,
                template.type === 'VARIABLE' ? { amountCents: cents } : {},
                await as(template.payer, date),
              );
            },
            2,
          );
        }
      },
      1,
    );
  }

  // Variable spending ------------------------------------------------------------------------------
  const kinds = [
    {
      cat: cat('Mercado', 'Supermercado'),
      name: ['Supermercado', 'Mercado do bairro', 'Atacadão'],
      min: 9_000,
      max: 42_000,
      weight: 6,
    },
    {
      cat: cat('Mercado', 'Feira e hortifrúti'),
      name: ['Feira', 'Hortifrúti'],
      min: 3_000,
      max: 9_000,
      weight: 3,
    },
    { cat: cat('Mercado', 'Padaria'), name: ['Padaria'], min: 1_200, max: 4_500, weight: 3 },
    {
      cat: cat('Alimentação fora', 'Restaurantes'),
      name: ['Restaurante', 'Almoço de domingo', 'Pizzaria'],
      min: 6_000,
      max: 22_000,
      weight: 3,
    },
    {
      cat: cat('Alimentação fora', 'Delivery'),
      name: ['Delivery', 'Japonês delivery'],
      min: 4_500,
      max: 12_000,
      weight: 3,
    },
    { cat: cat('Transporte', 'Combustível'), name: ['Posto'], min: 15_000, max: 30_000, weight: 2 },
    {
      cat: cat('Transporte', 'Aplicativos de transporte'),
      name: ['Corrida de app'],
      min: 1_800,
      max: 6_500,
      weight: 2,
    },
    { cat: cat('Saúde', 'Farmácia'), name: ['Farmácia'], min: 2_500, max: 14_000, weight: 1 },
    {
      cat: cat('Lazer', 'Passeios e eventos'),
      name: ['Cinema', 'Show', 'Parque'],
      min: 4_000,
      max: 25_000,
      weight: 1,
    },
    { cat: cat('Pets', 'Alimentação do pet'), name: ['Ração'], min: 9_000, max: 16_000, weight: 1 },
  ];
  const weighted = kinds.flatMap((k) => Array.from({ length: k.weight }, () => k));
  const pending: { date: string; body: object; who: number }[] = [];
  for (const month of months) {
    for (let i = 0; i < profile.expensesPerMonth; i += 1) {
      const kind = pick(weighted);
      const date = dateIn(month, 1 + Math.floor(rand() * daysIn(month)));
      const who = rand() < 0.55 ? 0 : 1;
      pending.push({
        date,
        who,
        body: {
          description: pick(kind.name),
          amountCents: amount(kind.min, kind.max),
          date,
          categoryId: kind.cat,
          payerMemberId: who === 0 ? ana : bruno,
          paymentMethod: pick(['PIX', 'CREDIT_CARD', 'DEBIT_CARD']),
          split: { type: rand() < 0.75 ? 'INCOME_PROPORTIONAL' : 'EQUAL' },
        },
      });
    }
    // One personal purchase per month, visible to both (ADR-005) but outside the shared figures.
    const date = dateIn(month, 18);
    const who = month.endsWith('1') || month.endsWith('3') ? 1 : 0;
    pending.push({
      date,
      who,
      body: {
        description: who === 0 ? 'Roupas' : 'Tênis de corrida',
        amountCents: amount(8_000, 30_000),
        date,
        categoryId: cat('Cuidados pessoais', 'Roupas e calçados'),
        payerMemberId: who === 0 ? ana : bruno,
        paymentMethod: 'CREDIT_CARD',
        split: { type: 'INDIVIDUAL', responsibleMemberId: who === 0 ? ana : bruno },
      },
    });
  }
  if (profile.timeTravel) {
    for (const expense of pending) {
      on(expense.date, async () => {
        await api.call(
          'POST',
          `${H}/transactions`,
          expense.body,
          await as(expense.who, expense.date),
        );
      });
    }
  }

  // Installments: one long, one ending next month (insight), one recent ---------------------------
  const plans = [
    {
      description: 'Geladeira',
      category: cat('Casa e decoração', 'Eletrodomésticos'),
      total: 420_000,
      count: 10,
      start: monthShift(current, -7),
      payer: 1,
    },
    {
      description: 'Notebook',
      category: cat('Casa e decoração', 'Eletrodomésticos'),
      total: 360_000,
      count: 4,
      start: monthShift(current, -2),
      payer: 0,
    },
    {
      description: 'Sofá',
      category: cat('Casa e decoração', 'Móveis'),
      total: 300_000,
      count: 6,
      start: monthShift(current, -1),
      payer: 1,
    },
  ].filter((p) => p.start >= first);
  for (const plan of plans) {
    const date = dateIn(plan.start, 8);
    on(
      date,
      async () => {
        await api.call(
          'POST',
          `${H}/installment-plans`,
          {
            description: plan.description,
            categoryId: plan.category,
            totalAmountCents: plan.total,
            installmentCount: plan.count,
            firstInstallmentDate: date,
            payerMemberId: plan.payer === 0 ? ana : bruno,
            paymentMethod: 'CREDIT_CARD',
          },
          await as(plan.payer, date),
        );
      },
      3,
    );
  }

  if (profile.timeTravel) {
    // Budgets: set at the start, adjusted mid-way (changes apply from the month on).
    on(
      startDate,
      async () => {
        const token = await as(0, startDate);
        for (const [categoryId, cents] of [
          [null, 1_150_000],
          [cat('Mercado'), 180_000],
          [cat('Alimentação fora'), 70_000],
        ] as const) {
          await api.call(
            'POST',
            `${H}/budgets/changes`,
            { categoryId, amountCents: cents, fromMonth: first },
            token,
          );
        }
      },
      1,
    );
    const adjust = monthShift(first, Math.floor(profile.months / 2));
    on(
      `${adjust}-01`,
      async () => {
        await api.call(
          'POST',
          `${H}/budgets/changes`,
          { categoryId: cat('Mercado'), amountCents: 200_000, fromMonth: adjust },
          await as(1, `${adjust}-01`),
        );
      },
      1,
    );

    // Goals with monthly contributions; a purchase plan linked to the trip.
    let reserva = '';
    let viagem = '';
    on(
      startDate,
      async () => {
        const token = await as(0, startDate);
        reserva = (
          await api.call<{ id: string }>(
            'POST',
            `${H}/goals`,
            {
              name: 'Reserva de emergência',
              targetAmountCents: 3_000_000,
              targetDate: null,
              participantMemberIds: [ana, bruno],
            },
            token,
          )
        ).id;
        viagem = (
          await api.call<{ id: string }>(
            'POST',
            `${H}/goals`,
            {
              name: 'Viagem para o Nordeste',
              targetAmountCents: 1_200_000,
              targetDate: dateIn(monthShift(current, 6), 30),
              participantMemberIds: [ana, bruno],
            },
            token,
          )
        ).id;
      },
      1,
    );
    for (const month of months) {
      on(
        dateIn(month, 6),
        async () => {
          const date = dateIn(month, 6);
          await api.call(
            'POST',
            `${H}/goals/${reserva}/entries`,
            { memberId: ana, type: 'CONTRIBUTION', amountCents: 60_000, date },
            await as(0, date),
          );
          await api.call(
            'POST',
            `${H}/goals/${viagem}/entries`,
            { memberId: ana, type: 'CONTRIBUTION', amountCents: amount(20_000, 40_000), date },
            await as(0, date),
          );
        },
        6,
      );
      on(
        dateIn(month, 7),
        async () => {
          const date = dateIn(month, 7);
          await api.call(
            'POST',
            `${H}/goals/${reserva}/entries`,
            { memberId: bruno, type: 'CONTRIBUTION', amountCents: 40_000, date },
            await as(1, date),
          );
        },
        6,
      );
    }
    const withdrawal = dateIn(monthShift(first, 4), 22);
    on(
      withdrawal,
      async () => {
        await api.call(
          'POST',
          `${H}/goals/${reserva}/entries`,
          {
            memberId: bruno,
            type: 'WITHDRAWAL',
            amountCents: 50_000,
            date: withdrawal,
            notes: 'Conserto do carro',
          },
          await as(1, withdrawal),
        );
      },
      7,
    );

    const planDate = dateIn(monthShift(current, -3), 2);
    on(
      planDate,
      async () => {
        const token = await as(0, planDate);
        const plan = await api.call<{ id: string }>(
          'POST',
          `${H}/purchase-plans`,
          {
            name: 'Escritório em casa',
            description: 'Para os dias de trabalho remoto',
            goalId: null,
          },
          token,
        );
        for (const item of [
          {
            name: 'Cadeira ergonômica',
            estimatedPriceCents: 180_000,
            quantity: 1,
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            name: 'Mesa',
            estimatedPriceCents: 120_000,
            quantity: 1,
            priority: 'MEDIUM',
            status: 'PENDING',
          },
          {
            name: 'Luminária',
            estimatedPriceCents: 15_000,
            quantity: 2,
            priority: 'LOW',
            status: 'PENDING',
          },
          {
            name: 'Monitor extra',
            estimatedPriceCents: 150_000,
            quantity: 1,
            priority: 'LOW',
            status: 'FUTURE',
          },
        ]) {
          await api.call(
            'POST',
            `${H}/purchase-plans/${plan.id}/items`,
            { ...item, responsibleMemberId: null },
            token,
          );
        }
        const view = await api.call<{ items: { id: string; name: string }[] }>(
          'GET',
          `${H}/purchase-plans/${plan.id}`,
          undefined,
          token,
        );
        const chair = view.items.find((i) => i.name === 'Cadeira ergonômica');
        const date = dateIn(monthShift(current, -2), 14);
        on(
          date,
          async () => {
            const t = await as(0, date);
            const expense = await api.call<{ id: string }>(
              'POST',
              `${H}/transactions`,
              {
                description: 'Cadeira ergonômica',
                amountCents: 168_900,
                date,
                categoryId: cat('Casa e decoração', 'Móveis'),
                payerMemberId: ana,
                paymentMethod: 'CREDIT_CARD',
              },
              t,
            );
            await api.call(
              'POST',
              `${H}/purchase-plans/${plan.id}/items/${chair?.id ?? ''}/purchase`,
              { paidPriceCents: 168_900, purchasedAt: date, transactionId: expense.id },
              t,
            );
          },
          8,
        );
      },
      8,
    );

    // A settlement ("acerto") a few months in.
    const settle = dateIn(monthShift(current, -4), 28);
    on(
      settle,
      async () => {
        await api.call(
          'POST',
          `${H}/settlements`,
          {
            fromMemberId: bruno,
            toMemberId: ana,
            amountCents: 45_000,
            date: settle,
            notes: 'Acerto do trimestre',
          },
          await as(1, settle),
        );
      },
      9,
    );
  }

  // Run the dated actions in order (actions may schedule later ones, so keep draining).
  while (events.length > 0) {
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
    const next = events.shift();
    if (!next) break;
    at(next.date);
    await next.run();
  }

  if (!profile.timeTravel) {
    // Volume profile: today's clock, expenses in parallel batches.
    let done = 0;
    for (let i = 0; i < pending.length; i += 8) {
      await Promise.all(
        pending.slice(i, i + 8).map(async (expense) => {
          await api.call('POST', `${H}/transactions`, expense.body, await as(expense.who, today));
        }),
      );
      done += Math.min(8, pending.length - i);
      if (done % 2000 < 8) log(`  ${String(done)}/${String(pending.length)} expenses`);
    }
  }
  log(`Seeded "${profile.householdName}" (${household.id}): ${String(profile.months)} months.`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed never runs in production.');
  }
  const args = process.argv.slice(2);
  const profileName = args.find((a) => a.startsWith('--profile='))?.split('=')[1] ?? 'demo';
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`Unknown profile "${profileName}" (demo | volume).`);
  const password = process.env.DEMO_PASSWORD ?? DEFAULT_PASSWORD;

  // In-process seeding is one client making many requests: lift the rate limits for this run.
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '1000000';
  process.env.LOGIN_RATE_LIMIT_PER_EMAIL = '1000000';
  process.env.API_RATE_LIMIT_PER_MINUTE = '1000000';
  process.env.LOG_LEVEL = 'warn';
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap/configure-app');

  const clock = new SeedClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  try {
    const dataSource = app.get(DataSource);
    const existing: unknown[] = await dataSource.query(
      'SELECT 1 FROM users WHERE email = ANY($1)',
      [profile.emails],
    );
    if (args.includes('--delete')) {
      await reset(dataSource, profile.emails);
      log(`Removed "${profile.householdName}" (if it existed).`);
      return;
    }
    if (existing.length > 0) {
      if (!args.includes('--reset')) {
        throw new Error(
          `"${profile.householdName}" already exists. Run again with --reset to recreate it.`,
        );
      }
      await reset(dataSource, profile.emails);
      log(`Removed the previous "${profile.householdName}".`);
    }
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    await seed(new Api(`http://127.0.0.1:${String(port)}/api/v1`), clock, profile, password);
    log(`Sign in as ${profile.emails[0]} or ${profile.emails[1]}.`);
  } finally {
    clock.reset();
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
