import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, asApiError } from '@zladovce/api';
import { AdminCategory, AdminProduct, AdminVariant, MeasurementUnit } from '@zladovce/models';
import {
  MEASUREMENT_UNIT_LABELS,
  MEASUREMENT_UNITS,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_TONES,
} from '@zladovce/shared';
import {
  UiBadge,
  UiErrorState,
  UiLoadingState,
  validationMessage,
  ValidationMessages,
} from '@zladovce/ui';
import { slugify } from '@zladovce/utilities';
import { concat, defer, filter, forkJoin, last, Observable, of, switchMap, tap } from 'rxjs';
import { CategoriesApi } from '../../data/categories-api';
import { ProductsApi } from '../../data/products-api';
import { ConfirmService } from '../../shared/confirm-dialog';
import { SLUG_MESSAGES } from '../../shared/patterns';
import { RichTextEditor } from '../../shared/rich-text-editor';
import { applyServerErrors } from '../../shared/server-errors';
import { HasUnsavedChanges, warnBeforeUnload } from '../../shared/unsaved-changes';
import {
  createProductRequest,
  createVariantRequest,
  markProductFieldsPristine,
  MAX_VARIANTS,
  PRODUCT_MESSAGES,
  productFieldsDirty,
  productForm,
  ProductForm,
  productValues,
  suggestProductSku,
  suggestVariantName,
  suggestVariantSku,
  updateProductRequest,
  variantForm,
  VariantForm,
  variantRequest,
  variantValues,
} from './product-form';
import { ProductImages } from './product-images';

type LoadState = { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready' };

/** Codes that mean "the product changed under you". */
export const CONCURRENT_EDIT = 'CONCURRENT_EDIT';

/**
 * Novi proizvod / Izmena proizvoda – one form for everything.
 *
 * New product: one request creates the product with all its packages (variants), opening stock
 * and low-stock thresholds; then the page switches to editing so photos can be added.
 *
 * Existing product: "Sačuvaj izmene" saves, in this order and one request at a time,
 *   1. the product fields (PUT with the latest `version`), when changed;
 *   2. every changed package (PUT per variant);
 *   3. every new package (POST, with its opening stock).
 * Every response is the whole product; its `version` is kept for the next request, so the
 * sequence never trips over its own changes. If a step fails, the steps before it stay saved,
 * the failing package shows its errors and nothing after it is sent. Removing a saved package
 * is a separate, confirmed action that happens at once. Photos are saved immediately too.
 */
@Component({
  selector: 'adm-product-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    UiBadge,
    UiLoadingState,
    UiErrorState,
    RichTextEditor,
    ProductImages,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  templateUrl: './product-form.page.html',
})
export class ProductFormPage implements OnInit, HasUnsavedChanges {
  private readonly productsApi = inject(ProductsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  /** Route parameter (`/proizvodi/:id`); absent on `/proizvodi/novi`. */
  readonly id = input<string>();

  protected readonly units = MEASUREMENT_UNITS;
  protected readonly unitLabels = MEASUREMENT_UNIT_LABELS;
  protected readonly stockLabels = STOCK_STATUS_LABELS;
  protected readonly stockTones = STOCK_STATUS_TONES;
  protected readonly maxVariants = MAX_VARIANTS;
  protected readonly skuMessages: ValidationMessages = PRODUCT_MESSAGES;
  protected readonly slugMessages: ValidationMessages = SLUG_MESSAGES;

  protected readonly isNew = computed(() => !this.id());
  protected readonly load = signal<LoadState>({ status: 'loading' });
  protected readonly categories = signal<AdminCategory[]>([]);
  /** The product as last returned by the API (edit mode). */
  readonly product = signal<AdminProduct | null>(null);
  /** `version` from the most recent response; sent with the next product update. */
  readonly version = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Set when the API answered 409 CONCURRENT_EDIT: someone else changed the product. */
  readonly conflict = signal(false);
  protected readonly editSlug = signal(false);
  protected readonly archived = computed(() => this.product()?.isArchived ?? false);

  form: ProductForm = productForm(this.fb);

  ngOnInit(): void {
    this.fetch();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnBeforeUnload(event, this.hasUnsavedChanges() || this.uploading());
  }

  protected message(
    errors: Record<string, unknown> | null,
    overrides: ValidationMessages = PRODUCT_MESSAGES,
  ): string | null {
    return validationMessage(errors, overrides);
  }

  protected loadError(): string {
    const state = this.load();
    return state.status === 'error' ? state.error.detail : '';
  }

  protected notFound(): boolean {
    const state = this.load();
    return state.status === 'error' && state.error.isNotFound;
  }

  protected get variants(): VariantForm[] {
    return this.form.controls.variants.controls;
  }

  /** Saved data of the variant shown in a row (stock, status), when the row is saved. */
  protected savedVariant(row: VariantForm): AdminVariant | undefined {
    const id = row.controls.id.value;
    return id ? this.product()?.variants.find((v) => v.id === id) : undefined;
  }

  protected slugPreview(): string {
    if (!this.isNew()) {
      return this.product()?.slug ?? '';
    }
    return slugify(this.form.controls.name.value);
  }

  protected categoryMissing(): boolean {
    const id = this.form.controls.categoryId.value;
    return id !== '' && !this.categories().some((c) => c.id === id);
  }

  fetch(): void {
    this.load.set({ status: 'loading' });
    this.conflict.set(false);
    this.formError.set(null);
    const id = this.id();
    forkJoin({
      categories: this.categoriesApi.list(),
      product: id ? this.productsApi.get(id) : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ categories, product }) => {
          this.categories.set(categories);
          this.resetForm(product);
          this.load.set({ status: 'ready' });
          this.scrollToFragment();
        },
        error: (error: unknown) => this.load.set({ status: 'error', error: asApiError(error) }),
      });
  }

  /** After creating a product the page opens at #fotografije: bring that section into view. */
  private scrollToFragment(): void {
    const fragment = this.route.snapshot.fragment;
    if (fragment && typeof document !== 'undefined') {
      setTimeout(() =>
        document.getElementById(fragment)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      );
    }
  }

  /** Rebuilds the whole form from the product (or empty for a new one). */
  private resetForm(product: AdminProduct | null): void {
    this.form = productForm(this.fb, product);
    this.editSlug.set(false);
    if (product) {
      this.applyProduct(product);
    } else if (this.categories().length === 1) {
      this.form.controls.categoryId.setValue(this.categories()[0]?.id ?? '');
    }
    this.wireSuggestions();
    this.updateDisabledState();
  }

  /** Keeps the latest product and version from any response, without touching unsaved edits. */
  applyProduct(product: AdminProduct): void {
    this.product.set(product);
    this.version.set(product.version);
    this.updateDisabledState();
  }

  private updateDisabledState(): void {
    if (this.archived()) {
      this.form.disable({ emitEvent: false });
    } else if (this.form.disabled) {
      this.form.enable({ emitEvent: false });
    }
  }

  /**
   * Suggestions for a new product: the base SKU follows the name, and a new package's name and
   * SKU follow its size – until the administrator types into those fields themselves.
   */
  private wireSuggestions(): void {
    const form = this.form;
    form.controls.name.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((name) => {
      if (this.isNew() && form.controls.sku.pristine) {
        form.controls.sku.setValue(suggestProductSku(name));
      }
    });
    form.controls.sku.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      for (const row of form.controls.variants.controls) {
        this.suggestForRow(row);
      }
    });
    for (const row of form.controls.variants.controls) {
      this.wireRow(row);
    }
  }

  private wireRow(row: VariantForm): void {
    const update = () => this.suggestForRow(row);
    row.controls.unitAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(update);
    row.controls.measurementUnit.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(update);
  }

  private suggestForRow(row: VariantForm): void {
    if (row.controls.id.value !== null) {
      return; // saved packages never change by themselves
    }
    const amount = row.controls.unitAmount.value;
    const unit: MeasurementUnit = row.controls.measurementUnit.value;
    if (row.controls.name.pristine) {
      row.controls.name.setValue(suggestVariantName(amount, unit));
    }
    if (row.controls.sku.pristine) {
      row.controls.sku.setValue(suggestVariantSku(this.form.controls.sku.value, amount, unit));
    }
  }

  protected startSlugEdit(): void {
    if (this.isNew() && !this.form.controls.slug.value) {
      this.form.controls.slug.setValue(slugify(this.form.controls.name.value));
    }
    this.editSlug.set(true);
  }

  protected addVariant(): void {
    const array = this.form.controls.variants;
    if (array.length >= MAX_VARIANTS) {
      return;
    }
    const previous = array.at(array.length - 1);
    const row = variantForm(this.fb, null, {
      measurementUnit: previous?.controls.measurementUnit.value ?? 'g',
    });
    this.wireRow(row);
    array.push(row);
    array.markAsDirty();
  }

  /** Removes a package: unsaved rows locally, saved ones on the server after confirmation. */
  protected removeVariant(index: number): void {
    const array = this.form.controls.variants;
    const row = array.at(index);
    const id = row.controls.id.value;
    const product = this.product();
    if (!id || !product) {
      array.removeAt(index);
      array.markAsDirty();
      return;
    }
    this.confirm
      .ask({
        title: `Ukloniti pakovanje „${row.controls.name.value}“?`,
        message: [
          'Pakovanje se odmah uklanja iz prodavnice i sa spiska pakovanja. Istorija zaliha i porudžbina ostaje sačuvana.',
          'Ako samo privremeno nema robe, bolje je isključiti „Pakovanje je u prodaji“.',
        ],
        confirmLabel: 'Ukloni pakovanje',
        tone: 'danger',
      })
      .pipe(
        filter(Boolean),
        tap(() => this.busy.set(true)),
        switchMap(() => this.productsApi.archiveVariant(product.id, id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          const position = array.controls.findIndex((r) => r.controls.id.value === id);
          if (position >= 0) {
            array.removeAt(position);
          }
          this.applyProduct(updated);
          this.snackBar.open('Pakovanje je uklonjeno.', 'U redu', { duration: 4000 });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 10000 });
        },
      });
  }

  save(): void {
    if (this.saving() || this.archived()) {
      return;
    }
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set(this.invalidSummary());
      return;
    }
    if (
      this.form.controls.isActive.value &&
      !this.variants.some((r) => r.controls.isActive.value)
    ) {
      this.formError.set(
        'Proizvod koji je u prodaji mora imati bar jedno pakovanje u prodaji. Uključite neko pakovanje ili isključite prodaju proizvoda.',
      );
      return;
    }
    if (this.isNew()) {
      this.create();
    } else {
      this.update();
    }
  }

  private invalidSummary(): string {
    if (this.form.controls.variants.hasError('duplicateSku')) {
      const sku = String(this.form.controls.variants.getError('duplicateSku'));
      return `Šifra „${sku}“ je upotrebljena za više pakovanja. Svako pakovanje mora imati svoju šifru.`;
    }
    return 'Proverite označena polja.';
  }

  private create(): void {
    const body = createProductRequest(this.form, { slugEdited: this.editSlug() });
    this.saving.set(true);
    this.productsApi
      .create(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => {
          this.form.markAsPristine();
          this.saving.set(false);
          this.snackBar.open(
            `Proizvod „${product.name}“ je sačuvan. Sada možete dodati fotografije.`,
            'U redu',
            { duration: 6000 },
          );
          void this.router.navigate(['/proizvodi', product.id], {
            replaceUrl: true,
            fragment: 'fotografije',
          });
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.showError(asApiError(error), this.form);
        },
      });
  }

  /** The step sequence described on the class; see there. */
  private update(): void {
    const product = this.product();
    if (!product) {
      return;
    }
    const steps: Observable<AdminProduct>[] = [];
    if (productFieldsDirty(this.form)) {
      steps.push(
        defer(() =>
          this.productsApi.update(
            product.id,
            updateProductRequest(this.form, this.version() ?? product.version, {
              slugEdited: this.editSlug(),
            }),
          ),
        ).pipe(
          tap({
            next: (saved) => {
              this.applyProduct(saved);
              this.form.patchValue(productValues(saved), { emitEvent: false });
              markProductFieldsPristine(this.form);
              this.editSlug.set(false);
            },
            error: (error: unknown) => this.showError(asApiError(error), this.form),
          }),
        ),
      );
    }
    this.variants.forEach((row, index) => {
      const id = row.controls.id.value;
      if (id && row.dirty) {
        steps.push(
          this.variantStep(row, () =>
            this.productsApi.updateVariant(product.id, id, variantRequest(row, index)),
          ),
        );
      } else if (!id) {
        steps.push(
          this.variantStep(row, () =>
            this.productsApi.addVariant(product.id, createVariantRequest(row, index)),
          ),
        );
      }
    });
    if (steps.length === 0) {
      this.form.markAsPristine();
      this.snackBar.open('Nema izmena za čuvanje.', 'U redu', { duration: 3000 });
      return;
    }
    this.saving.set(true);
    concat(...steps)
      .pipe(last(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.snackBar.open(`Izmene proizvoda „${saved.name}“ su sačuvane.`, 'U redu', {
            duration: 4000,
          });
        },
        error: () => this.saving.set(false),
      });
  }

  /** One variant request; on success the row takes the saved values (and id, for a new one). */
  private variantStep(
    row: VariantForm,
    request: () => Observable<AdminProduct>,
  ): Observable<AdminProduct> {
    return defer(() => {
      const knownIds = new Set(this.product()?.variants.map((v) => v.id) ?? []);
      return request().pipe(
        tap({
          next: (saved) => {
            const id = row.controls.id.value ?? saved.variants.find((v) => !knownIds.has(v.id))?.id;
            const variant = saved.variants.find((v) => v.id === id);
            this.applyProduct(saved);
            if (variant) {
              row.reset(variantValues(variant), { emitEvent: false });
            } else {
              row.markAsPristine();
            }
          },
          error: (error: unknown) => this.showError(asApiError(error), row),
        }),
      );
    });
  }

  /** Puts server errors on the right fields and a plain explanation above the form. */
  private showError(error: ApiError, target: ProductForm | VariantForm): void {
    if (error.code === CONCURRENT_EDIT) {
      this.conflict.set(true);
      this.formError.set(null);
      return;
    }
    // 409 SLUG_TAKEN / SKU_TAKEN carry an `errors` map like a validation error: `slug`, `sku`
    // (product base SKU, or the SKU of the variant in `target`) and `variants[i].sku` (index in
    // the create request, which is the form order).
    if (error.code === 'SLUG_TAKEN') {
      this.editSlug.set(true);
    }
    const unmatched = applyServerErrors(target, error);
    const where =
      target === this.form ? '' : ` (pakovanje „${(target as VariantForm).controls.name.value}“)`;
    this.formError.set(
      unmatched.length > 0
        ? unmatched.join(' ')
        : error.isValidation
          ? `Proverite označena polja${where}.`
          : `${error.detail}${where}`,
    );
  }

  /** Discards local edits and loads the product as it is now on the server. */
  reload(): void {
    this.fetch();
  }

  protected archive(): void {
    const product = this.product();
    if (!product) {
      return;
    }
    const unsaved = this.form.dirty ? ['Izmene koje niste sačuvali biće odbačene.'] : [];
    this.confirm
      .ask({
        title: `Arhivirati proizvod „${product.name}“?`,
        message: [
          'Proizvod se sklanja iz prodavnice i sa glavnog spiska proizvoda. Podaci, fotografije i istorija zaliha ostaju sačuvani.',
          'Arhivirani proizvod možete kasnije vratiti (na spisku proizvoda uključite „Prikaži samo arhivirane“).',
          ...unsaved,
        ],
        confirmLabel: 'Arhiviraj proizvod',
        tone: 'danger',
      })
      .pipe(
        filter(Boolean),
        tap(() => this.busy.set(true)),
        switchMap(() => this.productsApi.archive(product.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (archived) => {
          this.busy.set(false);
          this.resetForm(archived);
          this.snackBar.open(`Proizvod „${archived.name}“ je arhiviran.`, 'U redu', {
            duration: 5000,
          });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 8000 });
        },
      });
  }

  protected restore(): void {
    const product = this.product();
    if (!product) {
      return;
    }
    this.confirm
      .ask({
        title: `Vratiti proizvod „${product.name}“?`,
        message:
          'Proizvod se vraća na spisak proizvoda. U prodavnici se prikazuje ako je uključeno „Proizvod je u prodaji“.',
        confirmLabel: 'Vrati proizvod',
      })
      .pipe(
        filter(Boolean),
        tap(() => this.busy.set(true)),
        switchMap(() => this.productsApi.restore(product.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (restored) => {
          this.busy.set(false);
          this.resetForm(restored);
          this.snackBar.open(`Proizvod „${restored.name}“ je vraćen.`, 'U redu', {
            duration: 5000,
          });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.snackBar.open(asApiError(error).detail, 'U redu', { duration: 10000 });
        },
      });
  }
}
