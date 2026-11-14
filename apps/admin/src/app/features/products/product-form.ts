import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  AdminProduct,
  AdminVariant,
  CreateProductRequest,
  CreateVariantRequest,
  MeasurementUnit,
  UpdateProductRequest,
  VariantRequest,
} from '@zladovce/models';
import { formatUnitAmount, notBlank } from '@zladovce/shared';
import { slugify } from '@zladovce/utilities';
import { SLUG_PATTERN } from '../../shared/patterns';

/** Same rule as the API: starts with a letter or digit, then letters, digits, `.`, `_`, `-`. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const SKU_MESSAGE =
  'Šifra sme da sadrži slova bez kvačica, cifre, tačku, crticu i donju crtu (na primer DZEM-370G).';
export const MAX_VARIANTS = 50;
export const MAX_PRICE = 9_999_999_999.99;
export const MAX_UNIT_AMOUNT = 9_999_999.999;
export const MAX_STOCK = 1_000_000;

export type VariantForm = FormGroup<{
  /** Null for a variant that is not saved yet. */
  id: FormControl<string | null>;
  name: FormControl<string>;
  sku: FormControl<string>;
  unitAmount: FormControl<number | null>;
  measurementUnit: FormControl<MeasurementUnit>;
  regularPrice: FormControl<number | null>;
  discountPrice: FormControl<number | null>;
  isActive: FormControl<boolean>;
  /** Only sent for new variants; existing stock changes through Zalihe. */
  initialStock: FormControl<number | null>;
  lowStockThreshold: FormControl<number | null>;
}>;

export type ProductForm = FormGroup<{
  categoryId: FormControl<string>;
  name: FormControl<string>;
  slug: FormControl<string>;
  sku: FormControl<string>;
  shortDescription: FormControl<string>;
  description: FormControl<string>;
  isActive: FormControl<boolean>;
  isFeatured: FormControl<boolean>;
  seoTitle: FormControl<string>;
  seoDescription: FormControl<string>;
  variants: FormArray<VariantForm>;
}>;

/** Product-level controls (everything except the variants), sent together by PUT /products/{id}. */
export const PRODUCT_FIELDS = [
  'categoryId',
  'name',
  'slug',
  'sku',
  'shortDescription',
  'description',
  'isActive',
  'isFeatured',
  'seoTitle',
  'seoDescription',
] as const;

/** At most `decimals` decimal places. */
export function maxDecimals(decimals: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    const factor = 10 ** decimals;
    return Math.abs(Math.round(value * factor) - value * factor) < 1e-6
      ? null
      : { decimals: { max: decimals } };
  };
}

export const wholeNumber: ValidatorFn = (control) => {
  const value: unknown = control.value;
  return typeof value === 'number' && !Number.isInteger(value) ? { wholeNumber: true } : null;
};

/** Required only while the variant is not saved yet (opening stock and threshold). */
export const requiredWhileNew: ValidatorFn = (control) => {
  const id: unknown = control.parent?.get('id')?.value;
  return id === null && (control.value === null || control.value === '')
    ? { required: true }
    : null;
};

/** Value must be above zero. */
export const positive: ValidatorFn = (control) => {
  const value: unknown = control.value;
  return typeof value === 'number' && value <= 0 ? { positive: true } : null;
};

/**
 * On the discount price control: when set, it must be lower than the regular price of the
 * same variant. The error sits on the discount field so it shows right under it.
 */
export const discountBelowRegular: ValidatorFn = (control) => {
  const discount: unknown = control.value;
  const regular: unknown = control.parent?.get('regularPrice')?.value;
  if (typeof discount !== 'number' || typeof regular !== 'number') {
    return null;
  }
  return discount < regular ? null : { discountNotLower: true };
};

/** On the variants array: no SKU used twice. */
export const uniqueVariantSkus: ValidatorFn = (control) => {
  const array = control as FormArray<VariantForm>;
  const seen = new Set<string>();
  for (const row of array.controls) {
    const sku = row.controls.sku.value.trim().toUpperCase();
    if (sku === '') {
      continue;
    }
    if (seen.has(sku)) {
      return { duplicateSku: sku };
    }
    seen.add(sku);
  }
  return null;
};

/** Serbian texts for the validators above (used with validationMessage). */
export const PRODUCT_MESSAGES = {
  pattern: SKU_MESSAGE,
  decimals: (e: unknown) =>
    (e as { max?: number } | null)?.max === 3
      ? 'Količina može imati najviše tri decimale.'
      : 'Cena može imati najviše dve decimale.',
  wholeNumber: 'Unesite ceo broj.',
  positive: 'Vrednost mora biti veća od nule.',
  discountNotLower: 'Akcijska cena mora biti niža od redovne cene.',
};

export function variantForm(
  fb: FormBuilder,
  variant: AdminVariant | null = null,
  defaults: Partial<{ measurementUnit: MeasurementUnit }> = {},
): VariantForm {
  const nn = fb.nonNullable;
  const group: VariantForm = nn.group({
    id: fb.control<string | null>(variant?.id ?? null),
    name: nn.control(variant?.name ?? '', [
      Validators.required,
      notBlank,
      Validators.maxLength(120),
    ]),
    sku: nn.control(variant?.sku ?? '', [
      Validators.required,
      Validators.maxLength(64),
      Validators.pattern(SKU_PATTERN),
    ]),
    unitAmount: fb.control<number | null>(variant?.unitAmount ?? null, [
      Validators.required,
      positive,
      Validators.max(MAX_UNIT_AMOUNT),
      maxDecimals(3),
    ]),
    measurementUnit: nn.control<MeasurementUnit>(
      variant?.measurementUnit ?? defaults.measurementUnit ?? 'g',
      [Validators.required],
    ),
    regularPrice: fb.control<number | null>(variant?.regularPrice ?? null, [
      Validators.required,
      positive,
      Validators.max(MAX_PRICE),
      maxDecimals(2),
    ]),
    discountPrice: fb.control<number | null>(variant?.discountPrice ?? null, [
      positive,
      maxDecimals(2),
      discountBelowRegular,
    ]),
    isActive: nn.control(variant?.isActive ?? true),
    initialStock: fb.control<number | null>(variant ? null : 0, [
      requiredWhileNew,
      Validators.min(0),
      Validators.max(MAX_STOCK),
      wholeNumber,
    ]),
    lowStockThreshold: fb.control<number | null>(variant ? variant.lowStockThreshold : 3, [
      requiredWhileNew,
      Validators.min(0),
      Validators.max(MAX_STOCK),
      wholeNumber,
    ]),
  });
  // The discount rule depends on the regular price: re-check it when that changes.
  group.controls.regularPrice.valueChanges.subscribe(() =>
    group.controls.discountPrice.updateValueAndValidity({ emitEvent: false }),
  );
  return group;
}

export function productForm(fb: FormBuilder, product: AdminProduct | null = null): ProductForm {
  const nn = fb.nonNullable;
  const variants = product
    ? [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => variantForm(fb, v))
    : [variantForm(fb)];
  return nn.group({
    categoryId: nn.control(product?.category.id ?? '', [Validators.required]),
    name: nn.control(product?.name ?? '', [
      Validators.required,
      notBlank,
      Validators.maxLength(200),
    ]),
    slug: nn.control(product?.slug ?? '', [
      Validators.pattern(SLUG_PATTERN),
      Validators.maxLength(120),
    ]),
    sku: nn.control(product?.sku ?? '', [
      Validators.required,
      Validators.maxLength(64),
      Validators.pattern(SKU_PATTERN),
    ]),
    shortDescription: nn.control(product?.shortDescription ?? '', [Validators.maxLength(500)]),
    description: nn.control(product?.description ?? '', [Validators.maxLength(20_000)]),
    isActive: nn.control(product?.isActive ?? true),
    isFeatured: nn.control(product?.isFeatured ?? false),
    seoTitle: nn.control(product?.seoTitle ?? '', [Validators.maxLength(120)]),
    seoDescription: nn.control(product?.seoDescription ?? '', [Validators.maxLength(320)]),
    variants: fb.array(variants, [Validators.required, uniqueVariantSkus]),
  });
}

/** Form values of a saved variant (to reset its row after saving). */
export function variantValues(variant: AdminVariant): VariantForm['value'] {
  return {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    unitAmount: variant.unitAmount,
    measurementUnit: variant.measurementUnit,
    regularPrice: variant.regularPrice,
    discountPrice: variant.discountPrice,
    isActive: variant.isActive,
    initialStock: null,
    lowStockThreshold: variant.lowStockThreshold,
  };
}

/** Form values of the product-level fields. */
export function productValues(product: AdminProduct): Partial<ProductForm['value']> {
  return {
    categoryId: product.category.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription,
    description: product.description,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
  };
}

const textOrNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export interface ProductRequestOptions {
  /** Send the slug only when the administrator chose to edit it; otherwise auto/keep. */
  slugEdited: boolean;
}

function productFields(form: ProductForm, options: ProductRequestOptions) {
  const v = form.getRawValue();
  return {
    categoryId: v.categoryId,
    name: v.name.trim(),
    slug: options.slugEdited ? textOrNull(v.slug) : null,
    shortDescription: v.shortDescription.trim(),
    description: v.description,
    sku: v.sku.trim(),
    isActive: v.isActive,
    isFeatured: v.isFeatured,
    seoTitle: textOrNull(v.seoTitle),
    seoDescription: textOrNull(v.seoDescription),
  };
}

/**
 * Every member the API requires (`discountPrice` and `isActive` included – a missing member is a
 * 400, never a default). Only called for a valid row, so the required numbers are set.
 */
export function variantRequest(row: VariantForm, sortOrder: number): VariantRequest {
  const v = row.getRawValue();
  return {
    name: v.name.trim(),
    sku: v.sku.trim(),
    unitAmount: v.unitAmount ?? 0,
    measurementUnit: v.measurementUnit,
    regularPrice: v.regularPrice ?? 0,
    discountPrice: v.discountPrice ?? null,
    isActive: v.isActive,
    sortOrder,
  };
}

export function createVariantRequest(row: VariantForm, sortOrder: number): CreateVariantRequest {
  const v = row.getRawValue();
  return {
    ...variantRequest(row, sortOrder),
    initialStock: v.initialStock ?? 0,
    lowStockThreshold: v.lowStockThreshold ?? 0,
  };
}

export function createProductRequest(
  form: ProductForm,
  options: ProductRequestOptions,
): CreateProductRequest {
  return {
    ...productFields(form, options),
    variants: form.controls.variants.controls.map((row, index) => createVariantRequest(row, index)),
  };
}

/** Every product field plus the version last read (the API requires all of them). */
export function updateProductRequest(
  form: ProductForm,
  version: number,
  options: ProductRequestOptions,
): UpdateProductRequest & { version: number } {
  return { version, ...productFields(form, options) };
}

/** True when any product-level control (not the variants) has unsaved changes. */
export function productFieldsDirty(form: ProductForm): boolean {
  return PRODUCT_FIELDS.some((name) => form.controls[name].dirty);
}

export function markProductFieldsPristine(form: ProductForm): void {
  for (const name of PRODUCT_FIELDS) {
    form.controls[name].markAsPristine();
  }
}

/** `DZEM-OD-SLJIVA` from the product name (suggested base SKU). */
export function suggestProductSku(name: string): string {
  return slugify(name).toUpperCase().slice(0, 50).replace(/-+$/, '');
}

/** `DZEM-OD-SLJIVA-370G` from the product SKU and the package size. */
export function suggestVariantSku(
  productSku: string,
  amount: number | null,
  unit: MeasurementUnit,
): string {
  const base = productSku.trim();
  if (!base || amount === null || !(amount > 0)) {
    return base;
  }
  const size = `${String(amount)}${unit}`.toUpperCase();
  return `${base}-${size}`.slice(0, 64);
}

/** `370 g` from the package size (suggested variant name). */
export function suggestVariantName(amount: number | null, unit: MeasurementUnit): string {
  return formatUnitAmount(amount, unit);
}
