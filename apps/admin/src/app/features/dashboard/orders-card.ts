import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStatus } from '@zladovce/models';
import { UiCard, UiCardTitle, UiLoadingState } from '@zladovce/ui';
import { countOf, openCount, OrderSummaryStore } from '../../core/order-summary';

/** "1 porudžbina čeka na obradu", "3 porudžbine čekaju …", "5 porudžbina čeka …". */
export function waitingText(count: number): string {
  const last = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  if (last === 1 && !teen) {
    return 'porudžbina čeka na obradu';
  }
  return last >= 2 && last <= 4 && !teen
    ? 'porudžbine čekaju na obradu'
    : 'porudžbina čeka na obradu';
}

interface Row {
  status: OrderStatus;
  label: string;
  count: number;
}

/** Dashboard card "Porudžbine za obradu": counts from the summary, each a link to the filtered list. */
@Component({
  selector: 'adm-orders-card',
  imports: [RouterLink, UiCard, UiCardTitle, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ui-card data-testid="orders-card">
      <h2 uiCardTitle>Porudžbine za obradu</h2>
      @if (summary(); as s) {
        <p class="mt-3">
          <a
            routerLink="/porudzbine"
            class="text-4xl font-semibold text-olive-800 underline-offset-4 hover:underline"
            data-testid="open-count"
            >{{ open() }}</a
          >
          <span class="ml-2 text-ink-700">{{ waiting() }}</span>
        </p>
        <ul class="mt-4 flex flex-col divide-y divide-cream-200">
          @for (row of rows(); track row.status) {
            <li>
              <a
                routerLink="/porudzbine"
                [queryParams]="{ status: row.status }"
                class="flex items-center justify-between gap-3 py-2 text-ink-900 no-underline hover:text-olive-800"
                [attr.data-status]="row.status"
              >
                <span>{{ row.label }}</span>
                <span
                  class="text-lg font-semibold"
                  [class.text-warning-700]="row.count > 0 && row.status === 'Received'"
                  >{{ row.count }}</span
                >
              </a>
            </li>
          }
        </ul>
        <a
          routerLink="/porudzbine"
          class="mt-3 inline-block text-sm font-semibold text-olive-700 underline underline-offset-4"
          data-testid="orders-link"
          >Otvori porudžbine za obradu</a
        >
      } @else {
        <ui-loading-state label="Učitavanje porudžbina…" />
      }
    </ui-card>
  `,
})
export class OrdersCard {
  private readonly store = inject(OrderSummaryStore);
  protected readonly summary = this.store.summary;
  protected readonly open = computed(() => openCount(this.summary()));
  protected readonly waiting = computed(() => waitingText(this.open()));
  protected readonly rows = computed((): Row[] => {
    const summary = this.summary();
    return [
      { status: 'Received', label: 'Nove – čekaju potvrdu', count: countOf(summary, 'Received') },
      {
        status: 'Accepted',
        label: 'Prihvaćene – za pripremu',
        count: countOf(summary, 'Accepted'),
      },
      {
        status: 'Preparing',
        label: 'U pripremi – čekaju slanje',
        count: countOf(summary, 'Preparing'),
      },
      {
        status: 'DeliveryFailed',
        label: 'Neuspešna isporuka',
        count: countOf(summary, 'DeliveryFailed'),
      },
    ];
  });
}
