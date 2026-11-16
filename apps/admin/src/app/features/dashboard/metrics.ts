import {
  CategorySalesItem,
  DashboardSummary,
  OrderSeries,
  RevenueSeries,
  StatusCountItem,
  TopProductItem,
} from '@zladovce/models';
import { formatSerbianNumber } from '@zladovce/utilities';
import { BarListItem } from '../../shared/charts/bar-list';
import {
  CHART_COLORS,
  TimeChartData,
  toTimeChart,
  trend,
  Trend,
} from '../../shared/charts/chart-data';
import { pluralSr } from '../../shared/email-labels';

export type TileFormat = 'rsd' | 'count';

/** One number of the dashboard (P1.8): value, trend against the previous period and what it means. */
export interface MetricTile {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  format: TileFormat;
  /** Line under the value, e.g. "2 porudžbine". */
  detail: string;
  /** Plain-language meaning, shown under the tile. */
  hint: string;
  trend: Trend | null;
  /** Owner-only link (e.g. to the expenses). */
  link?: { label: string; path: string };
}

export const ordersWord = (count: number): string =>
  `${formatSerbianNumber(count)} ${pluralSr(count, 'porudžbina', 'porudžbine', 'porudžbina')}`;

/**
 * The money tiles of the dashboard, in the order of the cash-on-delivery flow:
 * ordered → delivered → (estimated) collected → actually collected → expenses → profit.
 * New orders are never counted as collected money.
 */
export function moneyTiles(summary: DashboardSummary, isOwner: boolean): MetricTile[] {
  const c = summary.current;
  const p = summary.previous;
  return [
    {
      key: 'orderedValue',
      label: 'Poručena vrednost',
      value: c.orderedValue,
      previous: p.orderedValue,
      format: 'rsd',
      detail: ordersWord(c.orderedCount),
      hint: 'Porudžbine primljene u ovom periodu (bez otkazanih i odbijenih). To još nije novac: kupac plaća kuriru pri isporuci.',
      trend: trend(c.orderedValue, p.orderedValue),
    },
    {
      key: 'deliveredValue',
      label: 'Vrednost isporučenih',
      value: c.deliveredValue,
      previous: p.deliveredValue,
      format: 'rsd',
      detail: `${ordersWord(c.deliveredCount)} isporučeno`,
      hint: 'Porudžbine koje su u ovom periodu označene kao isporučene, bez obzira kada su poručene.',
      trend: trend(c.deliveredValue, p.deliveredValue),
    },
    {
      key: 'estimatedCollected',
      label: 'Procenjena naplata',
      value: c.estimatedCollected,
      previous: p.estimatedCollected,
      format: 'rsd',
      detail: 'pouzećem, pri isporuci',
      hint: 'Kod plaćanja pouzećem smatra se da je isporučena porudžbina i naplaćena, pa je ovo jednako vrednosti isporučenih.',
      trend: trend(c.estimatedCollected, p.estimatedCollected),
    },
    {
      key: 'actualCollected',
      label: 'Stvarno naplaćeno',
      value: c.actualCollected,
      previous: p.actualCollected,
      format: 'rsd',
      detail: `${formatSerbianNumber(c.collectedCount)} ${pluralSr(c.collectedCount, 'upisana naplata', 'upisane naplate', 'upisanih naplata')}`,
      hint: 'Iznosi koje ste kod porudžbine upisali kao naplaćene, sa datumom naplate u ovom periodu. Može se razlikovati od procene.',
      trend: trend(c.actualCollected, p.actualCollected),
    },
    {
      key: 'expenses',
      label: 'Troškovi',
      value: c.expenses,
      previous: p.expenses,
      format: 'rsd',
      detail: 'upisani troškovi',
      hint: 'Troškovi (ambalaža, sirovine, dostava…) sa datumom u ovom periodu.',
      trend: trend(c.expenses, p.expenses, false),
      ...(isOwner ? { link: { label: 'Upiši ili pogledaj troškove', path: '/troskovi' } } : {}),
    },
    {
      key: 'estimatedProfit',
      label: 'Procenjena dobit',
      value: c.estimatedProfit,
      previous: p.estimatedProfit,
      format: 'rsd',
      detail: 'isporučeno minus troškovi',
      hint: 'Vrednost isporučenih umanjena za upisane troškove. Tačna je samo onoliko koliko su svi troškovi upisani.',
      trend: trend(c.estimatedProfit, p.estimatedProfit),
    },
  ];
}

/** Smaller numbers under the money tiles. */
export function orderTiles(summary: DashboardSummary): MetricTile[] {
  const c = summary.current;
  const p = summary.previous;
  return [
    {
      key: 'averageOrderValue',
      label: 'Prosečna porudžbina',
      value: c.averageOrderValue,
      previous: p.averageOrderValue,
      format: 'rsd',
      detail:
        c.averageOrderValue === null ? 'nema porudžbina' : 'poručena vrednost / broj porudžbina',
      hint: '',
      trend:
        c.averageOrderValue === null || p.averageOrderValue === null
          ? null
          : trend(c.averageOrderValue, p.averageOrderValue),
    },
    {
      key: 'cancelledCount',
      label: 'Otkazane',
      value: c.cancelledCount,
      previous: p.cancelledCount,
      format: 'count',
      detail: 'otkazane u ovom periodu',
      hint: '',
      trend: trend(c.cancelledCount, p.cancelledCount, false),
    },
    {
      key: 'rejectedCount',
      label: 'Odbijene',
      value: c.rejectedCount,
      previous: p.rejectedCount,
      format: 'count',
      detail: 'odbijene u ovom periodu',
      hint: '',
      trend: trend(c.rejectedCount, p.rejectedCount, false),
    },
  ];
}

export function revenueChart(series: RevenueSeries): TimeChartData {
  return toTimeChart(series.points, series.period.granularity, [
    { key: 'orderedValue', label: 'Poručeno', color: CHART_COLORS.series1 },
    { key: 'deliveredValue', label: 'Isporučeno', color: CHART_COLORS.series2 },
  ]);
}

export function ordersChart(series: OrderSeries): TimeChartData {
  return toTimeChart(series.points, series.period.granularity, [
    { key: 'orderCount', label: 'Porudžbine', color: CHART_COLORS.series1 },
  ]);
}

export function productBars(
  items: readonly TopProductItem[],
  by: 'revenue' | 'quantity',
): BarListItem[] {
  return items.map((item) => ({
    key: item.productId,
    label: item.productName,
    value: by === 'revenue' ? item.revenue : item.quantity,
    note:
      by === 'revenue'
        ? `${formatSerbianNumber(item.quantity)} kom.`
        : `${formatSerbianNumber(item.revenue)} RSD`,
  }));
}

export function categoryBars(items: readonly CategorySalesItem[]): BarListItem[] {
  return items.map((item) => ({
    key: item.categoryId ?? 'none',
    label: item.categoryName,
    value: item.revenue,
    note: `${formatSerbianNumber(item.quantity)} kom.`,
  }));
}

export function statusBars(items: readonly StatusCountItem[]): BarListItem[] {
  return items.map((item) => ({ key: item.status, label: item.label, value: item.count }));
}
