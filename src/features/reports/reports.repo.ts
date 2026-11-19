import type { Ctx } from '@/db/helpers';
import { addDays, getPayCycle, type LocalDate, type PayCycle, shiftPayCycle } from '@/core/dates';
import { changeBps, safeToSpend, type SafeToSpendResult, savingsRateBps } from '@/core/finance';
import { apportion, type Minor } from '@/core/money';
import type { AppSettings } from '@/features/settings/settings.repo';

/**
 * Reporting rules (spec §5), enforced in SQL and covered by reports.repo tests:
 * - Money IN  = income.
 * - Money OUT = expenses − refunds. Refunds reduce their category, they are not income.
 * - Transfers and balance adjustments are excluded from both.
 * - Split transactions report each split line under its own category.
 * - Sub-categories roll up into their parent for breakdowns.
 * All sums use base_amount_minor (user's default currency).
 */

export interface CashFlow {
  moneyIn: Minor;
  moneyOut: Minor;
  net: Minor;
  /** null when there is no income in the period. */
  savingsRateBps: number | null;
  count: number;
}

export async function cashFlow({ db, userId }: Ctx, from: LocalDate, to: LocalDate): Promise<CashFlow> {
  const r = await db.get<{ inc: number | null; exp: number | null; ref: number | null; n: number }>(
    `SELECT SUM(CASE WHEN type = 'income' THEN base_amount_minor END) AS inc,
            SUM(CASE WHEN type = 'expense' THEN base_amount_minor END) AS exp,
            SUM(CASE WHEN type = 'refund' THEN base_amount_minor END) AS ref,
            SUM(CASE WHEN type IN ('income','expense','refund') THEN 1 ELSE 0 END) AS n
       FROM transactions
      WHERE user_id = ? AND deleted_at IS NULL AND local_date BETWEEN ? AND ?`,
    [userId, from, to],
  );
  const moneyIn = r?.inc ?? 0;
  const moneyOut = (r?.exp ?? 0) - (r?.ref ?? 0);
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, savingsRateBps: savingsRateBps(moneyIn, moneyOut), count: r?.n ?? 0 };
}

/** Spending lines: split rows replace their parent's category; refunds count negative. */
const SPEND_LINES = `
  SELECT COALESCE(s.category_id, t.category_id) AS category_id,
         t.local_date,
         t.commitment_payment_id,
         CASE WHEN t.type = 'refund' THEN -COALESCE(s.base_amount_minor, t.base_amount_minor)
              ELSE COALESCE(s.base_amount_minor, t.base_amount_minor) END AS amt
    FROM transactions t
    LEFT JOIN transaction_splits s ON s.transaction_id = t.id AND s.deleted_at IS NULL
   WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type IN ('expense','refund')
     AND t.local_date BETWEEN ? AND ?`;

export interface CategoryTotal {
  categoryId: string;
  name: string;
  nameKey: string | null;
  icon: string;
  color: string;
  bucket: string | null;
  total: Minor;
  /** Share of total spending in basis points; all categories sum to exactly 10,000. */
  shareBps: number;
  /** Whole-percent share for display; all categories sum to exactly 100. */
  sharePct: number;
}

export async function spendingByCategory({ db, userId }: Ctx, from: LocalDate, to: LocalDate): Promise<CategoryTotal[]> {
  const rows = await db.all<Omit<CategoryTotal, 'shareBps' | 'sharePct'>>(
    `WITH lines AS (${SPEND_LINES})
     SELECT COALESCE(p.id, c.id) AS categoryId,
            COALESCE(p.name, c.name) AS name, COALESCE(p.name_key, c.name_key) AS nameKey,
            COALESCE(p.icon, c.icon) AS icon, COALESCE(p.color, c.color) AS color,
            COALESCE(p.bucket, c.bucket) AS bucket,
            SUM(l.amt) AS total
       FROM lines l
       JOIN categories c ON c.id = l.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      GROUP BY COALESCE(p.id, c.id)
     HAVING SUM(l.amt) > 0
      ORDER BY total DESC`,
    [userId, from, to],
  );
  // Largest-remainder rounding so the shown percentages always add up to exactly 100%.
  const totals = rows.map((r) => r.total);
  const bps = apportion(totals, 10_000);
  const pct = apportion(totals, 100);
  return rows.map((r, i) => ({ ...r, shareBps: bps[i], sharePct: pct[i] }));
}

export interface DailyTotal {
  date: LocalDate;
  out: Minor;
  in: Minor;
}

/** One entry per day in the range (zero-filled), for bar charts and calendars. */
export async function dailyTotals({ db, userId }: Ctx, from: LocalDate, to: LocalDate): Promise<DailyTotal[]> {
  const rows = await db.all<{ d: string; out: number; inc: number }>(
    `SELECT local_date AS d,
            SUM(CASE WHEN type = 'expense' THEN base_amount_minor WHEN type = 'refund' THEN -base_amount_minor ELSE 0 END) AS out,
            SUM(CASE WHEN type = 'income' THEN base_amount_minor ELSE 0 END) AS inc
       FROM transactions
      WHERE user_id = ? AND deleted_at IS NULL AND local_date BETWEEN ? AND ?
      GROUP BY local_date`,
    [userId, from, to],
  );
  const byDate = new Map(rows.map((r) => [r.d, r]));
  const out: DailyTotal[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDate.get(d);
    out.push({ date: d, out: r?.out ?? 0, in: r?.inc ?? 0 });
  }
  return out;
}

/**
 * Discretionary spending (expenses − refunds) excluding commitment payments,
 * split into "before today" and "today" for safe-to-spend.
 */
export async function discretionarySpend(
  { db, userId }: Ctx,
  cycle: PayCycle,
  today: LocalDate,
): Promise<{ beforeToday: Minor; today: Minor }> {
  const r = await db.get<{ before: number | null; today: number | null }>(
    `WITH lines AS (${SPEND_LINES})
     SELECT SUM(CASE WHEN local_date < ? THEN amt END) AS before,
            SUM(CASE WHEN local_date = ? THEN amt END) AS today
       FROM lines WHERE commitment_payment_id IS NULL`,
    [userId, cycle.start, cycle.end, today, today],
  );
  return { beforeToday: r?.before ?? 0, today: r?.today ?? 0 };
}

export interface Dashboard {
  today: LocalDate;
  cycle: PayCycle;
  spentToday: Minor;
  safe: SafeToSpendResult;
  flow: CashFlow;
  topCategories: CategoryTotal[];
  totalSpent: Minor;
}

export async function getDashboard(ctx: Ctx, settings: AppSettings, today: LocalDate): Promise<Dashboard> {
  const cycle = getPayCycle(today, settings.payDay);
  const [flow, cats, spend] = await Promise.all([
    cashFlow(ctx, cycle.start, cycle.end),
    spendingByCategory(ctx, cycle.start, cycle.end),
    discretionarySpend(ctx, cycle, today),
  ]);
  // Expected income: the larger of what the user told us and what has actually come in,
  // so an early bonus or side income is not ignored.
  const income = Math.max(settings.monthlyIncomeMinor, flow.moneyIn);
  const safe = safeToSpend({
    income,
    // Commitments arrive in Phase 2; until then there are none to reserve.
    commitments: 0,
    savingsTarget: settings.savingsTargetMinor,
    // Savings goals arrive in Phase 2; transfers to them will be summed here.
    savedThisCycle: 0,
    spentBeforeToday: spend.beforeToday,
    spentToday: spend.today,
    today,
    cycle,
  });
  return {
    today,
    cycle,
    spentToday: spend.today,
    safe,
    flow,
    topCategories: cats.slice(0, 5),
    totalSpent: cats.reduce((s, c) => s + c.total, 0),
  };
}

export interface PeriodReport {
  cycle: PayCycle;
  flow: CashFlow;
  previousFlow: CashFlow;
  moneyOutChangeBps: number | null;
  moneyInChangeBps: number | null;
  categories: (CategoryTotal & { previous: Minor; changeBps: number | null })[];
  daily: DailyTotal[];
  biggest: { id: string; amount: Minor; localDate: LocalDate; label: string | null; categoryId: string | null }[];
}

/** Monthly (pay-cycle) report with comparison against the previous cycle. */
export async function getCycleReport(ctx: Ctx, payDay: number, anchor: LocalDate, offset = 0): Promise<PeriodReport> {
  const cycle = shiftPayCycle(getPayCycle(anchor, payDay), offset, payDay);
  const prev = shiftPayCycle(cycle, -1, payDay);
  const [flow, previousFlow, cats, prevCats, daily, biggest] = await Promise.all([
    cashFlow(ctx, cycle.start, cycle.end),
    cashFlow(ctx, prev.start, prev.end),
    spendingByCategory(ctx, cycle.start, cycle.end),
    spendingByCategory(ctx, prev.start, prev.end),
    dailyTotals(ctx, cycle.start, cycle.end),
    ctx.db.all<{ id: string; amount: number; localDate: string; label: string | null; categoryId: string | null }>(
      `SELECT t.id, t.base_amount_minor AS amount, t.local_date AS localDate,
              COALESCE(m.name, t.note) AS label, t.category_id AS categoryId
         FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type = 'expense' AND t.local_date BETWEEN ? AND ?
        ORDER BY t.base_amount_minor DESC LIMIT 5`,
      [ctx.userId, cycle.start, cycle.end],
    ),
  ]);
  const prevMap = new Map(prevCats.map((c) => [c.categoryId, c.total]));
  return {
    cycle,
    flow,
    previousFlow,
    moneyOutChangeBps: changeBps(flow.moneyOut, previousFlow.moneyOut),
    moneyInChangeBps: changeBps(flow.moneyIn, previousFlow.moneyIn),
    categories: cats.map((c) => {
      const previous = prevMap.get(c.categoryId) ?? 0;
      return { ...c, previous, changeBps: changeBps(c.total, previous) };
    }),
    daily,
    biggest,
  };
}
