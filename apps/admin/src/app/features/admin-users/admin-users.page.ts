import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { asApiError } from '@zladovce/api';
import { AdminRole, AdminUser, UpdateAdminRequest } from '@zladovce/models';
import { UiBadge, UiErrorState, UiLoadingState } from '@zladovce/ui';
import { SrDatePipe } from '@zladovce/utilities';
import { filter, Observable, of } from 'rxjs';
import { AdminUsersApi } from '../../data/people-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { RemoteData } from '../../shared/remote-data';
import { adminUserErrorText, InviteDialog } from './invite.dialog';

/** Number of active owners (the last one can be neither demoted nor deactivated). */
export function activeOwners(users: readonly AdminUser[]): number {
  return users.filter((user) => user.role === 'Owner' && user.isActive).length;
}

/**
 * Why a change is not allowed (shown before asking the server), or null. The server checks the
 * same rules (CANNOT_CHANGE_SELF, LAST_OWNER).
 */
export function changeBlocked(
  user: AdminUser,
  change: UpdateAdminRequest,
  users: readonly AdminUser[],
): string | null {
  if (user.isCurrentUser) {
    return 'Svoju ulogu i svoj nalog ne možete menjati. To može uraditi drugi vlasnik.';
  }
  const losesOwner =
    user.role === 'Owner' && user.isActive && (change.role !== 'Owner' || !change.isActive);
  if (losesOwner && activeOwners(users) <= 1) {
    return 'Ovo je jedini aktivni vlasnik. Prvo dodajte ili aktivirajte drugog vlasnika.';
  }
  return null;
}

/**
 * Administratori (owner only): who can sign in to the admin, their role (Vlasnik / Urednik) and
 * whether the account is active. A deactivated person cannot sign in at all; a role change
 * applies from their next sign-in.
 */
@Component({
  selector: 'adm-admin-users-page',
  imports: [MatButtonModule, SrDatePipe, UiBadge, UiErrorState, UiLoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-w-4xl flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl">Administratori</h1>
        <p class="mt-2 max-w-2xl text-ink-700">
          Ko može da se prijavi u administraciju. <strong>Urednik</strong> radi sa porudžbinama,
          proizvodima i sadržajem; <strong>vlasnik</strong> vidi i troškove, podešavanja,
          administratore i dnevnik izmena.
        </p>
      </div>
      <button
        matButton="filled"
        type="button"
        class="min-h-12"
        data-testid="invite"
        (click)="invite()"
      >
        Dodaj administratora
      </button>
    </div>

    <div class="mt-6 max-w-4xl">
      @if (list().error; as e) {
        <ui-error-state
          title="Administratori nisu učitani"
          [message]="e.detail"
          (retry)="listData.reload()"
        />
      } @else if (list().data; as data) {
        <ul
          class="flex flex-col gap-2"
          aria-label="Administratori"
          [class.opacity-60]="list().busy"
        >
          @for (user of data.items; track user.id) {
            <li
              class="flex flex-wrap items-center gap-3 rounded-lg border border-cream-200 bg-white p-4"
              data-testid="admin-row"
              [attr.data-email]="user.email"
            >
              <div class="min-w-0 flex-1 basis-60">
                <p class="flex flex-wrap items-center gap-2 font-semibold">
                  {{ user.fullName }}
                  <ui-badge [tone]="user.role === 'Owner' ? 'success' : 'info'">{{
                    user.roleLabel
                  }}</ui-badge>
                  @if (!user.isActive) {
                    <ui-badge tone="danger">Deaktiviran</ui-badge>
                  }
                  @if (user.isCurrentUser) {
                    <ui-badge tone="neutral">Vi</ui-badge>
                  }
                </p>
                <p class="text-sm break-all text-ink-700">{{ user.email }}</p>
                <p class="text-xs text-ink-500">
                  {{
                    user.lastLoginAt
                      ? 'Poslednja prijava ' + (user.lastLoginAt | srDate: 'dateTime')
                      : 'Još se nije prijavio/la'
                  }}
                </p>
              </div>
              @if (user.isCurrentUser) {
                <p class="text-sm text-ink-500">Svoj nalog ne možete menjati.</p>
              } @else {
                <div class="flex flex-wrap gap-1">
                  @if (user.isActive) {
                    <button
                      matButton="outlined"
                      type="button"
                      data-testid="toggle-role"
                      [disabled]="busyId() === user.id"
                      (click)="setRole(user, user.role === 'Owner' ? 'Staff' : 'Owner')"
                    >
                      {{ user.role === 'Owner' ? 'Promeni u urednika' : 'Promeni u vlasnika' }}
                    </button>
                    <button
                      matButton
                      type="button"
                      class="danger-button"
                      data-testid="deactivate"
                      [disabled]="busyId() === user.id"
                      (click)="setActive(user, false)"
                    >
                      Deaktiviraj
                    </button>
                  } @else {
                    <button
                      matButton="outlined"
                      type="button"
                      data-testid="activate"
                      [disabled]="busyId() === user.id"
                      (click)="setActive(user, true)"
                    >
                      Aktiviraj
                    </button>
                  }
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <ui-loading-state />
      }
    </div>
  `,
})
export class AdminUsersPage {
  private readonly api = inject(AdminUsersApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly listData = new RemoteData(of(true), () => this.api.list());
  protected readonly list = this.listData.value;
  readonly busyId = signal<string | null>(null);

  invite(): void {
    this.dialog
      .open<InviteDialog, unknown, AdminUser>(InviteDialog, {
        width: '32rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .pipe(filter((user): user is AdminUser => !!user))
      .subscribe((user) => {
        this.snackBar.open(
          `${user.fullName} je dodat/a. Poziv sa privremenom lozinkom stiže na ${user.email}.`,
          'U redu',
          { duration: 8000 },
        );
        this.listData.reload();
      });
  }

  setRole(user: AdminUser, role: AdminRole): void {
    this.change(
      user,
      { role, isActive: user.isActive },
      {
        title: role === 'Owner' ? 'Dati ulogu vlasnika?' : 'Promeniti u urednika?',
        message:
          role === 'Owner'
            ? `${user.fullName} će videti i menjati sve, uključujući troškove, podešavanja i administratore.`
            : `${user.fullName} više neće videti troškove, podešavanja, administratore i dnevnik izmena.`,
        confirmLabel: 'Promeni ulogu',
      },
      'Uloga je promenjena. Važi od sledeće prijave te osobe.',
    );
  }

  setActive(user: AdminUser, isActive: boolean): void {
    this.change(
      user,
      { role: user.role, isActive },
      isActive
        ? {
            title: 'Aktivirati nalog?',
            message: `${user.fullName} će ponovo moći da se prijavi.`,
            confirmLabel: 'Aktiviraj',
          }
        : {
            title: 'Deaktivirati nalog?',
            message: `${user.fullName} više neće moći da se prijavi, odmah. Nalog možete kasnije ponovo aktivirati.`,
            confirmLabel: 'Deaktiviraj',
            tone: 'danger',
          },
      isActive ? 'Nalog je aktiviran.' : 'Nalog je deaktiviran.',
    );
  }

  private change(
    user: AdminUser,
    body: UpdateAdminRequest,
    question: Parameters<ConfirmService['ask']>[0],
    done: string,
  ): void {
    const blocked = changeBlocked(user, body, this.list().data?.items ?? []);
    if (blocked) {
      this.snackBar.open(blocked, 'U redu', { duration: 8000 });
      return;
    }
    const ask: Observable<boolean> = this.confirm.ask(question);
    ask.pipe(filter(Boolean)).subscribe(() => {
      this.busyId.set(user.id);
      this.api.update(user.id, body).subscribe({
        next: () => {
          this.busyId.set(null);
          this.snackBar.open(done, 'U redu', { duration: 5000 });
          this.listData.reload();
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.snackBar.open(adminUserErrorText(asApiError(error)), 'U redu', { duration: 8000 });
          this.listData.reload();
        },
      });
    });
  }
}
