import { ChangeDetectionStrategy, Component, inject, Injectable } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  /** One or more paragraphs of plain text. */
  message: string | readonly string[];
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` colours the confirm button red (archive, delete, discard). */
  tone?: 'primary' | 'danger';
}

/**
 * Reusable yes/no question. Open it through `ConfirmService.ask(...)`; the answer is `true` only
 * when the confirm button was pressed (Esc, backdrop and "Odustani" give `false`).
 */
@Component({
  selector: 'adm-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @for (paragraph of paragraphs; track $index) {
        <p class="mb-3 text-base text-ink-700 last:mb-0">{{ paragraph }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="false">
        {{ data.cancelLabel ?? 'Odustani' }}
      </button>
      <button
        matButton="filled"
        type="button"
        data-testid="confirm"
        [class.danger-button]="data.tone === 'danger'"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  protected readonly paragraphs: readonly string[] =
    typeof this.data.message === 'string' ? [this.data.message] : this.data.message;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  ask(options: ConfirmOptions): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmOptions, boolean>(ConfirmDialog, {
        data: options,
        width: '28rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .pipe(map((answer) => answer === true));
  }
}
