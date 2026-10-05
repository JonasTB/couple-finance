import type { CurrencyCode, InsightView } from '@couple-finance/shared';
import { addMonths, formatMonth } from '@/shared/lib/dates';
import { formatBps, formatCents, formatPoints } from '@/shared/lib/money';

/**
 * pt-BR copy for each rule (ADR-009: the API sends rule id + metrics, the web writes the text).
 * Neutral language (ADR-005 §6): facts with numbers, no "deve", no blame, no ranking.
 */

export interface InsightLink {
  label: string;
  to: string;
}

export interface InsightCopy {
  text: string;
  /** Evidence lines (categories, expenses) with drill-down links (NFR-08). */
  evidence: { text: string; to?: string }[];
  links: InsightLink[];
  /** "Por que este destaque?": the rule in plain words. */
  why: string;
}

const averageLabel = (months: number) =>
  months === 1 ? 'do mês anterior' : `dos ${String(months)} meses anteriores`;
const previousLabel = (months: number) =>
  months === 1 ? 'no mês anterior' : `nos ${String(months)} meses anteriores`;

const signed = (cents: number, currency: CurrencyCode) =>
  `${cents >= 0 ? '+' : '−'}${formatCents(Math.abs(cents), currency)}`;

export function insightCopy(
  insight: InsightView,
  currency: CurrencyCode,
  names: ReadonlyMap<string, string>,
): InsightCopy {
  const money = (cents: number) => formatCents(cents, currency);
  const expenses = (categoryId: string) => `despesas?mes=${insight.month}&categoria=${categoryId}`;

  switch (insight.ruleId) {
    case 'CATEGORY_ABOVE_AVERAGE': {
      const { cents, averageCents, averageMonths, differenceBps } = insight.metrics;
      const { ratioBps, minDifferenceCents } = insight.thresholds;
      return {
        text:
          averageCents === 0
            ? `${insight.category.name}: ${money(cents)} neste mês, sem gastos ${previousLabel(averageMonths)}.`
            : `${insight.category.name}: ${money(cents)} neste mês, ${formatBps(differenceBps ?? 0)} acima da média ${averageLabel(averageMonths)} (${money(averageCents)}).`,
        evidence: [],
        links: [{ label: 'Ver despesas', to: expenses(insight.category.categoryId) }],
        why: `Aparece quando uma categoria passa de ${formatBps(ratioBps ?? 0)} da média dos meses anteriores (até 3) e a diferença é de pelo menos ${money(minDifferenceCents ?? 0)}.`,
      };
    }
    case 'CATEGORY_BELOW_AVERAGE': {
      const { cents, averageCents, averageMonths, differenceBps } = insight.metrics;
      const { ratioBps, minDifferenceCents } = insight.thresholds;
      return {
        text:
          cents === 0
            ? `${insight.category.name}: nenhum gasto neste mês, frente a uma média de ${money(averageCents)} ${averageLabel(averageMonths)}.`
            : `${insight.category.name}: ${money(cents)} neste mês, ${formatBps(Math.abs(differenceBps ?? 0))} abaixo da média ${averageLabel(averageMonths)} (${money(averageCents)}).`,
        evidence: [],
        links: [{ label: 'Ver despesas', to: expenses(insight.category.categoryId) }],
        why: `Aparece em meses já fechados quando uma categoria fica abaixo de ${formatBps(ratioBps ?? 0)} da média dos meses anteriores e a diferença é de pelo menos ${money(minDifferenceCents ?? 0)}.`,
      };
    }
    case 'BUDGET_NEAR_LIMIT': {
      const { state, amountCents, spentCents, remainingCents, usedBps } = insight.metrics;
      const name = insight.budget.name ? `de ${insight.budget.name}` : 'total da casa';
      return {
        text:
          state === 'EXCEEDED'
            ? `O orçamento ${name} passou do limite: ${money(spentCents)} de ${money(amountCents)} (${money(-remainingCents)} acima).`
            : `O orçamento ${name} chegou a ${formatBps(usedBps)}: ${money(spentCents)} de ${money(amountCents)}, restam ${money(remainingCents)}.`,
        evidence: [],
        links: [{ label: 'Ver orçamentos', to: `orcamentos?mes=${insight.month}` }],
        why: `Aparece a partir de ${formatBps(insight.thresholds.warningBps ?? 0)} do orçamento usado no mês.`,
      };
    }
    case 'INSTALLMENT_ENDING': {
      const { releaseMonth, releasedCents } = insight.metrics;
      return {
        text: `A última parcela de ${insight.plan.description} é em ${formatMonth(addMonths(releaseMonth, -1))}: a partir de ${formatMonth(releaseMonth)}, ${money(releasedCents)} por mês deixam de estar comprometidos.`,
        evidence: [],
        links: [{ label: 'Ver parcelamento', to: `compromissos/parcelados/${insight.plan.id}` }],
        why: `Aparece quando um parcelamento termina nos próximos ${String(insight.thresholds.withinMonths ?? 0)} meses.`,
      };
    }
    case 'CONTRIBUTION_DEVIATION': {
      const { paidShareBps, responsibleShareBps, differenceCents } = insight.metrics;
      const name = names.get(insight.memberId) ?? 'Ex-membro';
      const hasEvidence =
        insight.evidence.categories.length + insight.evidence.transactions.length > 0;
      return {
        text: `${name} pagou ${formatBps(paidShareBps)} das despesas compartilhadas, frente a ${formatBps(responsibleShareBps)} planejado (${money(differenceCents)} além da sua parte).${hasEvidence ? ' A diferença veio principalmente de:' : ''}`,
        evidence: [
          ...insight.evidence.categories.map((c) => ({
            text: `${c.name} (${signed(c.deltaCents, currency)})`,
            to: expenses(c.categoryId),
          })),
          ...insight.evidence.transactions.map((t) => ({
            text: `${t.description}, ${money(t.amountCents)} (${signed(t.deltaCents, currency)})`,
            to: `despesas/${t.transactionId}`,
          })),
        ],
        links: [],
        why: `Aparece quando a parte paga por alguém difere da planejada em ${formatPoints(insight.thresholds.minDeviationBps ?? 0)} ou mais.`,
      };
    }
    case 'DOMINANT_CATEGORY': {
      const { cents, sharedSpendCents, shareBps } = insight.metrics;
      return {
        text: `${insight.category.name} concentrou ${formatBps(shareBps)} das despesas compartilhadas do mês (${money(cents)} de ${money(sharedSpendCents)}).`,
        evidence: [],
        links: [{ label: 'Ver despesas', to: expenses(insight.category.categoryId) }],
        why: `Aparece quando uma categoria soma ${formatBps(insight.thresholds.minShareBps ?? 0)} ou mais das despesas compartilhadas do mês.`,
      };
    }
    case 'MOM_CHANGE': {
      const { cents, previousCents, changeBps } = insight.metrics;
      const verb = insight.direction === 'UP' ? 'subiram' : 'caíram';
      return {
        text: `As despesas compartilhadas ${verb} ${formatBps(Math.abs(changeBps))} em relação a ${formatMonth(addMonths(insight.month, -1))}: de ${money(previousCents)} para ${money(cents)}.${insight.evidence.categories.length > 0 ? ' Principalmente em:' : ''}`,
        evidence: insight.evidence.categories.map((c) => ({
          text: `${c.name} (${signed(c.changeCents, currency)})`,
          to: expenses(c.categoryId),
        })),
        links: [],
        why: `Aparece quando o total muda ${formatBps(insight.thresholds.minChangeBps ?? 0)} ou mais e pelo menos ${money(insight.thresholds.minChangeCents ?? 0)} em relação ao mês anterior. Quedas só aparecem em meses fechados.`,
      };
    }
  }
}
