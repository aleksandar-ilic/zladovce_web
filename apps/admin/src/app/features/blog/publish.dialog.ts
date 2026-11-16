import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import {
  belgradeDate,
  belgradeTime,
  fromIsoDate,
  SERBIAN_DATES,
  toIsoDate,
} from '../../shared/serbian-dates';
import { publishInstant } from './blog-form';

export interface PublishDialogData {
  /** Current scheduled moment, when the post is already scheduled. */
  publishedAt: string | null;
}

/** The answer: `publishedAt` null = now, an ISO instant = scheduled. */
export interface PublishDialogResult {
  publishedAt: string | null;
}

/** "Objavi": now, or at a chosen Serbian date and time (the post stays hidden until then). */
@Component({
  selector: 'adm-publish-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  providers: [SERBIAN_DATES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Objava na sajtu</h2>
    <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
      <mat-dialog-content>
        <mat-radio-group
          formControlName="when"
          class="flex flex-col gap-2"
          aria-label="Kada objaviti"
        >
          <mat-radio-button value="now" data-testid="publish-now">Odmah</mat-radio-button>
          <mat-radio-button value="later" data-testid="publish-later"
            >Zakaži za kasnije</mat-radio-button
          >
        </mat-radio-group>
        @if (form.controls.when.value === 'later') {
          <div class="mt-3 grid gap-x-3 sm:grid-cols-[1fr_8rem]">
            <mat-form-field appearance="outline">
              <mat-label>Datum</mat-label>
              <input
                matInput
                [matDatepicker]="picker"
                [min]="today"
                formControlName="day"
                data-testid="publish-day"
              />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Vreme</mat-label>
              <input matInput type="time" formControlName="time" data-testid="publish-time" />
            </mat-form-field>
          </div>
          <p class="text-sm text-ink-700">
            Do tada se objava ne vidi na sajtu. Vreme je po srpskom vremenu.
          </p>
        }
        @if (error()) {
          <p
            class="mt-2 text-sm font-medium text-danger-700"
            role="alert"
            data-testid="publish-error"
          >
            {{ error() }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-testid="publish-confirm">
          {{ form.controls.when.value === 'now' ? 'Objavi odmah' : 'Zakaži objavu' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PublishDialog {
  private readonly data = inject<PublishDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PublishDialog, PublishDialogResult>>(MatDialogRef);

  protected readonly today = fromIsoDate(belgradeDate());
  readonly error = signal('');
  readonly form = new FormGroup({
    when: new FormControl<'now' | 'later'>(this.data.publishedAt ? 'later' : 'now', {
      nonNullable: true,
    }),
    day: new FormControl<Date | null>(
      fromIsoDate(this.data.publishedAt ? belgradeDate(this.data.publishedAt) : belgradeDate()),
    ),
    time: new FormControl(this.data.publishedAt ? belgradeTime(this.data.publishedAt) : '08:00', {
      nonNullable: true,
    }),
  });

  confirm(): void {
    const v = this.form.getRawValue();
    const result = publishInstant(
      v.when === 'now' ? { when: 'now' } : { when: 'later', day: toIsoDate(v.day), time: v.time },
    );
    if ('error' in result) {
      this.error.set(result.error);
      return;
    }
    this.ref.close({ publishedAt: result.publishedAt });
  }
}
