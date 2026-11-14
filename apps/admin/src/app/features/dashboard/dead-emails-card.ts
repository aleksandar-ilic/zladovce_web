import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeadEmailsStore } from '../../core/dead-emails';
import { deadEmailsText } from '../../shared/email-labels';

/**
 * Warning on the dashboard while customer emails could not be sent (status Dead), with a link to
 * E-poruke filtered to them. Hidden when there are none (the count comes from the shared poller).
 */
@Component({
  selector: 'adm-dead-emails-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (count() > 0) {
      <div
        class="rounded-lg border border-danger-600/30 bg-danger-50 p-5 text-ink-900 lg:col-span-2"
        role="status"
        data-testid="dead-emails-card"
      >
        <p class="font-semibold text-danger-700">{{ text() }}</p>
        <p class="mt-1">
          Kupci nisu dobili ova obaveštenja ni posle svih automatskih pokušaja. Proverite razlog i
          pošaljite ih ponovo.
        </p>
        <a
          routerLink="/e-poruke"
          [queryParams]="{ status: 'Dead' }"
          class="mt-3 inline-block font-semibold text-olive-800 underline underline-offset-4"
          data-testid="dead-emails-link"
          >Otvori neuspešne e-poruke</a
        >
      </div>
    }
  `,
})
export class DeadEmailsCard {
  private readonly store = inject(DeadEmailsStore);
  protected readonly count = computed(() => this.store.count() ?? 0);
  protected readonly text = computed(() => deadEmailsText(this.count()));
}
