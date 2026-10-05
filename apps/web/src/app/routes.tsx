import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '@/features/auth/route-guards';
import { BudgetsPage } from '@/features/budgets/budgets-page';
import { CommitmentsPage } from '@/features/commitments/commitments-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { PlanningPage } from '@/features/planning/planning-page';
import { AcceptInvitationPage } from '@/features/households/accept-invitation-page';
import { CreateHouseholdPage } from '@/features/households/create-household-page';
import { HomeRedirect } from '@/features/households/home-redirect';
import { HouseholdLayout } from '@/features/households/household-layout';
import { HouseholdPage } from '@/features/households/household-page';
import { CategoriesPage } from '@/features/ledger/categories-page';
import { IncomePage } from '@/features/ledger/income-page';
import { TransactionsPage } from '@/features/ledger/transactions-page';
import { NotFoundPage } from './not-found-page';
import { RouteErrorPage } from './route-error-page';
import { RootLayout } from './root-layout';

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    // Last resort (the layout itself failed): no header, but a way out.
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          // Form libraries (react-hook-form, zod) load only with these pages.
          {
            path: 'entrar',
            lazy: async () => ({
              Component: (await import('@/features/auth/login-page')).LoginPage,
            }),
          },
          {
            path: 'criar-conta',
            lazy: async () => ({
              Component: (await import('@/features/auth/register-page')).RegisterPage,
            }),
          },
        ],
      },
      // Works signed in or out: shows the invitation and the next step.
      { path: 'convite', element: <AcceptInvitationPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'comecar', element: <CreateHouseholdPage /> },
          {
            path: 'casas/:householdId',
            element: <HouseholdLayout />,
            children: [
              {
                // Errors inside a tab keep the household header and tabs.
                errorElement: <RouteErrorPage />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'casa', element: <HouseholdPage /> },
                  { path: 'despesas', element: <TransactionsPage /> },
                  // The form (react-hook-form) loads on demand.
                  {
                    path: 'despesas/nova',
                    lazy: async () => ({
                      Component: (await import('@/features/ledger/transaction-form-page'))
                        .TransactionFormPage,
                    }),
                  },
                  {
                    path: 'despesas/:transactionId',
                    lazy: async () => ({
                      Component: (await import('@/features/ledger/transaction-form-page'))
                        .TransactionFormPage,
                    }),
                  },
                  { path: 'compromissos', element: <CommitmentsPage /> },
                  // Commitment forms load on demand.
                  {
                    path: 'compromissos/recorrentes/nova',
                    lazy: async () => ({
                      Component: (await import('@/features/commitments/recurring-form-page'))
                        .RecurringFormPage,
                    }),
                  },
                  {
                    path: 'compromissos/recorrentes/:recurringId',
                    lazy: async () => ({
                      Component: (await import('@/features/commitments/recurring-form-page'))
                        .RecurringFormPage,
                    }),
                  },
                  {
                    path: 'compromissos/parcelados/novo',
                    lazy: async () => ({
                      Component: (await import('@/features/commitments/installment-form-page'))
                        .InstallmentFormPage,
                    }),
                  },
                  {
                    path: 'compromissos/parcelados/:planId',
                    lazy: async () => ({
                      Component: (await import('@/features/commitments/installment-plan-page'))
                        .InstallmentPlanPage,
                    }),
                  },
                  { path: 'orcamentos', element: <BudgetsPage /> },
                  { path: 'metas', element: <PlanningPage /> },
                  {
                    path: 'metas/planos/:planId',
                    lazy: async () => ({
                      Component: (await import('@/features/planning/purchase-plan-page'))
                        .PurchasePlanPage,
                    }),
                  },
                  {
                    path: 'metas/:goalId',
                    lazy: async () => ({
                      Component: (await import('@/features/planning/goal-page')).GoalPage,
                    }),
                  },
                  // Analytics loads with the chart library (Recharts) on demand.
                  {
                    path: 'analises',
                    lazy: async () => ({
                      Component: (await import('@/features/analytics/analytics-page'))
                        .AnalyticsPage,
                    }),
                  },
                  { path: 'categorias', element: <CategoriesPage /> },
                  { path: 'renda', element: <IncomePage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
