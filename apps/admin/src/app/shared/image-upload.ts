import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { UploadPurpose } from '@zladovce/models';
import { concatMap, EMPTY, last, map, Observable, of, Subscription, tap } from 'rxjs';
import {
  ACCEPT_ATTRIBUTE,
  checkImageFile,
  MediaUploadService,
  uploadErrorMessage,
} from '../data/media-upload';

export type UploadItemStatus = 'waiting' | 'uploading' | 'processing' | 'error';

export interface UploadItem {
  id: number;
  file: File;
  preview: string | null;
  status: UploadItemStatus;
  percent: number;
  error: string | null;
}

export interface UploadedImage<T = unknown> {
  key: string;
  file: File;
  /** What `attach` returned (e.g. the updated product). */
  result: T;
}

/** Step after the storage upload: attach the key (product image) or just hand it over. */
export type AttachFn = (key: string, file: File) => Observable<unknown>;

let nextId = 0;

function objectUrl(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Reusable image picker and upload queue: choose one or several photos (button or drag and drop),
 * each gets a preview and its own progress; uploads run one after another. A file that is not
 * JPG/PNG/WebP or is larger than 10 MB is refused on the spot with a Serbian message.
 *
 * After the storage upload, `attach(key, file)` runs (e.g. attach to the product, with automatic
 * retry while the image is being processed). Successful files leave the queue and are emitted
 * through `uploaded`; failed ones stay with "Pokušaj ponovo" and "Ukloni".
 */
@Component({
  selector: 'adm-image-upload',
  imports: [MatButtonModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors"
      [class.border-olive-600]="dragging()"
      [class.bg-olive-50]="dragging()"
      [class.border-sage-400]="!dragging()"
      [class.opacity-60]="disabled()"
      data-testid="drop-zone"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <svg
        class="size-10 text-sage-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M4 16l4.5-5 3.5 4 2.5-3 5.5 6H4z" stroke-linejoin="round" />
        <circle cx="8.5" cy="7.5" r="1.5" />
        <rect x="2.5" y="3.5" width="19" height="17" rx="2" />
      </svg>
      <p class="text-base text-ink-700">
        {{ multiple() ? 'Prevucite fotografije ovde ili' : 'Prevucite fotografiju ovde ili' }}
      </p>
      <button matButton="tonal" type="button" [disabled]="disabled()" (click)="picker.click()">
        {{ multiple() ? 'Izaberite fotografije' : 'Izaberite fotografiju' }}
      </button>
      <input
        #picker
        type="file"
        class="hidden"
        [accept]="accept"
        [multiple]="multiple()"
        [disabled]="disabled()"
        [attr.aria-label]="multiple() ? 'Izaberite fotografije' : 'Izaberite fotografiju'"
        (change)="onPicked(picker)"
      />
      <p class="text-sm text-ink-500">JPG, PNG ili WebP, najviše 10 MB po fotografiji.</p>
    </div>

    @if (items().length > 0) {
      <ul class="mt-4 flex flex-col gap-3" aria-live="polite" data-testid="upload-queue">
        @for (item of items(); track item.id) {
          <li
            class="flex items-center gap-3 rounded-md border border-cream-200 bg-white p-2.5"
            [attr.data-status]="item.status"
          >
            @if (item.preview) {
              <img
                [src]="item.preview"
                alt=""
                class="size-16 shrink-0 rounded-sm bg-cream-100 object-cover"
              />
            } @else {
              <div class="size-16 shrink-0 rounded-sm bg-cream-100"></div>
            }
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink-900">{{ item.file.name }}</p>
              <p class="text-xs text-ink-500">{{ size(item.file.size) }}</p>
              @switch (item.status) {
                @case ('waiting') {
                  <p class="mt-1 text-sm text-ink-700">Čeka na slanje…</p>
                }
                @case ('uploading') {
                  <p class="mt-1 text-sm text-ink-700">Slanje: {{ item.percent }}%</p>
                  <mat-progress-bar
                    mode="determinate"
                    [value]="item.percent"
                    [attr.aria-label]="'Slanje fotografije ' + item.file.name"
                  />
                }
                @case ('processing') {
                  <p class="mt-1 text-sm text-ink-700">Obrada fotografije…</p>
                  <mat-progress-bar
                    mode="indeterminate"
                    [attr.aria-label]="'Obrada fotografije ' + item.file.name"
                  />
                }
                @case ('error') {
                  <p class="mt-1 text-sm font-medium text-danger-700" role="alert">
                    {{ item.error }}
                  </p>
                }
              }
            </div>
            @if (item.status === 'error') {
              <div class="flex shrink-0 flex-col gap-1 sm:flex-row">
                @if (canRetry(item)) {
                  <button matButton type="button" (click)="retry(item)">Pokušaj ponovo</button>
                }
                <button matButton type="button" (click)="remove(item)">Ukloni</button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class ImageUpload<T = unknown> {
  private readonly uploads = inject(MediaUploadService);

  readonly purpose = input.required<UploadPurpose>();
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Runs after the storage upload; by default the key is only handed over. */
  readonly attach = input<AttachFn>((key) => of(key));

  readonly uploaded = output<UploadedImage<T>>();
  /** True while files are waiting or being sent (parents can block leaving or saving). */
  readonly busyChange = output<boolean>();

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly items = signal<UploadItem[]>([]);
  protected readonly dragging = signal(false);
  protected readonly size = formatSize;

  private running: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.running?.unsubscribe();
      for (const item of this.items()) {
        this.revoke(item);
      }
    });
  }

  /** Adds files to the queue (also used by drag and drop). */
  addFiles(files: Iterable<File>): void {
    if (this.disabled()) {
      return;
    }
    const list = Array.from(files);
    const chosen = this.multiple() ? list : list.slice(0, 1);
    if (!this.multiple()) {
      // A single-image field replaces whatever was waiting or failed.
      for (const item of this.items()) {
        this.revoke(item);
      }
      this.running?.unsubscribe();
      this.running = null;
      this.items.set([]);
    }
    const added = chosen.map((file): UploadItem => {
      const problem = checkImageFile(file);
      return {
        id: nextId++,
        file,
        preview: problem ? null : objectUrl(file),
        status: problem ? 'error' : 'waiting',
        percent: 0,
        error: problem,
      };
    });
    this.items.update((items) => [...items, ...added]);
    this.processNext();
  }

  protected onPicked(picker: HTMLInputElement): void {
    if (picker.files) {
      this.addFiles(picker.files);
    }
    picker.value = ''; // choosing the same file again must fire change again
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.disabled() ? 'none' : 'copy';
    }
    this.dragging.set(!this.disabled());
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (event.dataTransfer?.files) {
      this.addFiles(event.dataTransfer.files);
    }
  }

  protected canRetry(item: UploadItem): boolean {
    return checkImageFile(item.file) === null;
  }

  protected retry(item: UploadItem): void {
    this.patch(item.id, { status: 'waiting', error: null, percent: 0 });
    this.processNext();
  }

  protected remove(item: UploadItem): void {
    this.revoke(item);
    this.items.update((items) => items.filter((i) => i.id !== item.id));
    this.emitBusy();
  }

  private processNext(): void {
    this.emitBusy();
    if (this.running) {
      return;
    }
    const next = this.items().find((item) => item.status === 'waiting');
    if (!next) {
      return;
    }
    this.patch(next.id, { status: 'uploading', percent: 0 });
    const run = new Subscription();
    this.running = run;
    const finish = (): void => {
      if (this.running === run) {
        this.running = null;
      }
      this.processNext();
    };
    const work = this.uploads
      .upload(next.file, this.purpose())
      .pipe(
        tap((progress) => {
          if (progress.type === 'progress') {
            this.patch(next.id, { percent: progress.percent });
          }
        }),
        last(),
        concatMap((progress) => {
          if (progress.type !== 'done') {
            return EMPTY;
          }
          this.patch(next.id, { status: 'processing', percent: 100 });
          return this.attach()(progress.key, next.file).pipe(
            last(),
            map((result) => ({ key: progress.key, result: result as T })),
          );
        }),
      )
      .subscribe({
        next: ({ key, result }) => {
          this.revoke(next);
          this.items.update((items) => items.filter((i) => i.id !== next.id));
          this.uploaded.emit({ key, file: next.file, result });
        },
        error: (error: unknown) => {
          this.patch(next.id, { status: 'error', error: uploadErrorMessage(error) });
          finish();
        },
        complete: finish,
      });
    run.add(work);
  }

  private patch(id: number, changes: Partial<UploadItem>): void {
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  private revoke(item: UploadItem): void {
    if (item.preview && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(item.preview);
    }
  }

  private emitBusy(): void {
    this.busyChange.emit(this.items().some((item) => item.status !== 'error'));
  }
}
