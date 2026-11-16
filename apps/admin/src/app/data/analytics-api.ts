import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  DashboardSummary,
  InventoryReport,
  OrderSeries,
  RevenueSeries,
  SalesByCategory,
  SalesReport,
  StatusDistribution,
  TopProducts,
} from '@zladovce/models';
import { Observable } from 'rxjs';
import { periodApiParams, PeriodQuery } from '../shared/period';
import { FileDownloadService } from './file-download';

export type SalesGroupBy = 'variant' | 'category';

/** Dashboard metrics and charts (P1.8) and the reports with their CSV files (AdminAny). */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly api = inject(ApiClient);
  private readonly files = inject(FileDownloadService);

  summary(period: PeriodQuery): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>('/admin/dashboard/summary', {
      params: periodApiParams(period),
    });
  }

  revenueSeries(period: PeriodQuery): Observable<RevenueSeries> {
    return this.api.get<RevenueSeries>('/admin/dashboard/revenue-series', {
      params: periodApiParams(period),
    });
  }

  orderSeries(period: PeriodQuery): Observable<OrderSeries> {
    return this.api.get<OrderSeries>('/admin/dashboard/order-series', {
      params: periodApiParams(period),
    });
  }

  topProducts(period: PeriodQuery, limit = 5): Observable<TopProducts> {
    return this.api.get<TopProducts>('/admin/dashboard/top-products', {
      params: { ...periodApiParams(period), limit },
    });
  }

  salesByCategory(period: PeriodQuery): Observable<SalesByCategory> {
    return this.api.get<SalesByCategory>('/admin/dashboard/sales-by-category', {
      params: periodApiParams(period),
    });
  }

  statusDistribution(period: PeriodQuery): Observable<StatusDistribution> {
    return this.api.get<StatusDistribution>('/admin/dashboard/status-distribution', {
      params: periodApiParams(period),
    });
  }

  salesReport(period: PeriodQuery): Observable<SalesReport> {
    return this.api.get<SalesReport>('/admin/reports/sales', { params: periodApiParams(period) });
  }

  inventoryReport(): Observable<InventoryReport> {
    return this.api.get<InventoryReport>('/admin/reports/inventory');
  }

  /** Saves the sales CSV; completes with the file name. */
  downloadSalesCsv(period: PeriodQuery, groupBy: SalesGroupBy, fallbackName: string) {
    return this.files.download(
      '/admin/reports/sales',
      { ...periodApiParams(period), format: 'csv', groupBy },
      fallbackName,
    );
  }

  downloadInventoryCsv(fallbackName: string) {
    return this.files.download('/admin/reports/inventory', { format: 'csv' }, fallbackName);
  }
}
