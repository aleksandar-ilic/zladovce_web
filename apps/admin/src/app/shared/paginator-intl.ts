import { Injectable, Provider } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { formatSerbianNumber } from '@zladovce/utilities';

/** Serbian texts for every MatPaginator in the admin app. */
@Injectable()
export class SerbianPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Po strani:';
  override nextPageLabel = 'Sledeća strana';
  override previousPageLabel = 'Prethodna strana';
  override firstPageLabel = 'Prva strana';
  override lastPageLabel = 'Poslednja strana';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 od ${formatSerbianNumber(length)}`;
    }
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return `${formatSerbianNumber(start + 1)}–${formatSerbianNumber(end)} od ${formatSerbianNumber(length)}`;
  };
}

/** Add to `providers` of every component that shows a MatPaginator (keeps it out of the initial bundle). */
export const SERBIAN_PAGINATOR: Provider = {
  provide: MatPaginatorIntl,
  useClass: SerbianPaginatorIntl,
};
