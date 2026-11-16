import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DashboardPeriodKey, PeriodRange } from '@zladovce/models';
import { isValidCustomRange, PERIOD_OPTIONS, PeriodQuery, rangeText } from './period';
import { belgradeDate, fromIsoDate, SERBIAN_DATES, toIsoDate } from './serbian-dates';

/**
 * Period filter shown above dashboards and reports: one row of buttons (Danas, Juče, …) and, for
 * "Izabrani period", a date range with "Prikaži". It only reports the choice (`changed`); the page
 * keeps it in the URL. `range` (from the API) shows the exact dates the numbers are for.
 */
@Component({
  selector: 'adm-period-selector',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Period"
      data-testid="period-selector"
    >
      @for (option of options; track option.value) {
        <button
          type="button"
          class="inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
          [class]="
            selected() === option.value
              ? 'border-olive-700 bg-olive-700 text-white'
              : 'border-sage-400 bg-white text-ink-900 hover:bg-sage-50'
          "
          [attr.aria-pressed]="selected() === option.value"
          [attr.data-period]="option.value"
          (click)="choose(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>

    @if (selected() === 'custom') {
      <form
        class="mt-3 flex flex-wrap items-start gap-3"
        [formGroup]="range"
        (ngSubmit)="applyCustom()"
        data-testid="custom-range"
      >
        <mat-form-field appearance="outline" class="w-full sm:w-80" subscriptSizing="dynamic">
          <mat-label>Od – do</mat-label>
          <mat-date-range-input [rangePicker]="picker" [max]="today">
            <input matStartDate formControlName="from" placeholder="Od" data-testid="range-from" />
            <input matEndDate formControlName="to" placeholder="Do" data-testid="range-to" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
          <mat-hint>Na primer 01.11.2026. – 14.11.2026.</mat-hint>
        </mat-form-field>
        <button matButton="filled" type="submit" class="min-h-12" data-testid="apply-range">
          Prikaži
        </button>
        @if (rangeError()) {
          <p class="w-full text-sm font-medium text-danger-700" role="alert">{{ rangeError() }}</p>
        }
      </form>
    }

    @if (rangeLabel()) {
      <p class="mt-2 text-sm text-ink-700" data-testid="period-range">
        Prikazano: <strong class="font-semibold text-ink-900">{{ rangeLabel() }}</strong>
        @if (previousLabel()) {
          <span class="text-ink-500"> · poređenje sa {{ previousLabel() }}</span>
        }
      </p>
    }
  `,
})
export class PeriodSelector {
  readonly value = input.required<PeriodQuery>();
  /** Current and previous range the API used (shown under the buttons). */
  readonly current = input<PeriodRange | null>(null);
  readonly previous = input<PeriodRange | null>(null);
  readonly changed = output<PeriodQuery>();

  protected readonly options = PERIOD_OPTIONS;
  protected readonly today = fromIsoDate(belgradeDate());
  /** The button pressed; "custom" may be pressed before a range is applied. */
  protected readonly selected = signal<DashboardPeriodKey>('last30');
  protected readonly rangeError = signal('');
  protected readonly range = new FormGroup({
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  protected readonly rangeLabel = computed(() => rangeText(this.current()));
  protected readonly previousLabel = computed(() => rangeText(this.previous()));

  constructor() {
    effect(() => {
      const value = this.value();
      this.selected.set(value.period);
      if (value.period === 'custom') {
        this.range.setValue({ from: fromIsoDate(value.from), to: fromIsoDate(value.to) });
      }
    });
  }

  choose(period: DashboardPeriodKey): void {
    this.rangeError.set('');
    if (period === 'custom') {
      this.selected.set('custom');
      if (this.value().period !== 'custom' && this.current()) {
        // Start from the dates shown now, so "Prikaži" works right away.
        this.range.setValue({
          from: fromIsoDate(this.current()?.from),
          to: fromIsoDate(this.current()?.to),
        });
      }
      return;
    }
    this.selected.set(period);
    this.changed.emit({ period, from: '', to: '' });
  }

  applyCustom(): void {
    const from = toIsoDate(this.range.controls.from.value);
    const to = toIsoDate(this.range.controls.to.value);
    if (!from || !to) {
      this.rangeError.set('Izaberite datum od kog i do kog želite prikaz.');
      return;
    }
    if (!isValidCustomRange(from, to)) {
      this.rangeError.set(
        from > to
          ? 'Datum „od“ mora biti pre datuma „do“.'
          : 'Period može biti najviše tri godine.',
      );
      return;
    }
    this.rangeError.set('');
    this.changed.emit({ period: 'custom', from, to });
  }
}
