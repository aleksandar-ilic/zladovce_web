import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { validationMessage } from '@zladovce/ui';
import {
  createProductRequest,
  PRODUCT_MESSAGES,
  productFieldsDirty,
  productForm,
  SKU_PATTERN,
  suggestProductSku,
  suggestVariantName,
  suggestVariantSku,
  updateProductRequest,
  variantForm,
} from './product-form';
import { PRODUCT } from '../../testing/fixtures';

const fb = () => TestBed.inject(FormBuilder);

describe('product form', () => {
  it('starts a new product with one empty package that asks for opening stock', () => {
    const form = productForm(fb());
    expect(form.controls.variants.length).toBe(1);
    const row = form.controls.variants.at(0);
    expect(row.controls.id.value).toBeNull();
    expect(row.controls.initialStock.value).toBe(0);
    expect(row.controls.lowStockThreshold.value).toBe(3);
    expect(form.controls.isActive.value).toBe(true);
    expect(form.valid).toBe(false);
    expect(form.controls.name.hasError('required')).toBe(true);
    expect(form.controls.categoryId.hasError('required')).toBe(true);
  });

  it('builds one row per saved variant, in sort order, without stock fields to send', () => {
    const second = { ...PRODUCT.variants[0]!, id: 'b', name: '720 g', sortOrder: 1, sku: 'X-720' };
    const form = productForm(fb(), { ...PRODUCT, variants: [second, PRODUCT.variants[0]!] });
    expect(form.controls.variants.controls.map((r) => r.controls.name.value)).toEqual([
      '370 g',
      '720 g',
    ]);
    expect(form.controls.variants.at(0).controls.initialStock.value).toBeNull();
    expect(form.valid).toBe(true);
  });

  it('validates the SKU pattern like the API', () => {
    expect(SKU_PATTERN.test('DZEM-370G')).toBe(true);
    expect(SKU_PATTERN.test('a.b_c-1')).toBe(true);
    expect(SKU_PATTERN.test('-DZEM')).toBe(false);
    expect(SKU_PATTERN.test('DŽEM')).toBe(false);
    expect(SKU_PATTERN.test('DZEM 370')).toBe(false);

    const row = variantForm(fb());
    row.controls.sku.setValue('ŠLJIVA 1');
    expect(validationMessage(row.controls.sku.errors, PRODUCT_MESSAGES)).toContain(
      'slova bez kvačica',
    );
  });

  it('requires the discount price to be lower than the regular price, and re-checks when the regular price changes', () => {
    const row = variantForm(fb());
    row.controls.regularPrice.setValue(650);
    row.controls.discountPrice.setValue(650);
    expect(row.controls.discountPrice.hasError('discountNotLower')).toBe(true);
    expect(validationMessage(row.controls.discountPrice.errors, PRODUCT_MESSAGES)).toBe(
      'Akcijska cena mora biti niža od redovne cene.',
    );
    row.controls.regularPrice.setValue(700);
    expect(row.controls.discountPrice.valid).toBe(true);
    row.controls.discountPrice.setValue(null);
    expect(row.controls.discountPrice.valid).toBe(true);
  });

  it('checks prices, amounts and stock numbers', () => {
    const row = variantForm(fb());
    row.controls.regularPrice.setValue(0);
    expect(row.controls.regularPrice.hasError('positive')).toBe(true);
    row.controls.regularPrice.setValue(10.555);
    expect(validationMessage(row.controls.regularPrice.errors, PRODUCT_MESSAGES)).toBe(
      'Cena može imati najviše dve decimale.',
    );
    row.controls.unitAmount.setValue(0.3333);
    expect(validationMessage(row.controls.unitAmount.errors, PRODUCT_MESSAGES)).toBe(
      'Količina može imati najviše tri decimale.',
    );
    row.controls.unitAmount.setValue(0.5);
    expect(row.controls.unitAmount.valid).toBe(true);
    row.controls.initialStock.setValue(2.5);
    expect(row.controls.initialStock.hasError('wholeNumber')).toBe(true);
    row.controls.initialStock.setValue(-1);
    expect(row.controls.initialStock.hasError('min')).toBe(true);
    row.controls.initialStock.setValue(null);
    expect(row.controls.initialStock.hasError('required')).toBe(true);
  });

  it('refuses the same SKU on two packages and needs at least one package', () => {
    const form = productForm(fb());
    form.controls.variants.push(variantForm(fb()));
    form.controls.variants.at(0).controls.sku.setValue('dzem-1');
    form.controls.variants.at(1).controls.sku.setValue('DZEM-1');
    expect(form.controls.variants.getError('duplicateSku')).toBe('DZEM-1');
    form.controls.variants.at(1).controls.sku.setValue('DZEM-2');
    expect(form.controls.variants.hasError('duplicateSku')).toBe(false);
    form.controls.variants.clear();
    expect(form.controls.variants.hasError('required')).toBe(true);
  });

  it('builds the create request with all variants, opening stock and thresholds', () => {
    const form = productForm(fb());
    form.patchValue({
      categoryId: PRODUCT.category.id,
      name: '  Džem od šljiva ',
      sku: 'DZEM-SLJIVA',
      shortDescription: 'Domaći.',
      description: '<p>Opis</p>',
      slug: 'ne-salje-se',
    });
    form.controls.variants.at(0).patchValue({
      name: '370 g',
      sku: 'DZEM-SLJIVA-370G',
      unitAmount: 370,
      measurementUnit: 'g',
      regularPrice: 650,
      discountPrice: 590,
      initialStock: 24,
      lowStockThreshold: 5,
    });
    const second = variantForm(fb());
    second.patchValue({
      name: '720 g',
      sku: 'DZEM-SLJIVA-720G',
      unitAmount: 720,
      regularPrice: 1100,
      isActive: false,
    });
    form.controls.variants.push(second);
    expect(form.valid).toBe(true);

    expect(createProductRequest(form, { slugEdited: false })).toEqual({
      categoryId: PRODUCT.category.id,
      name: 'Džem od šljiva',
      slug: null,
      shortDescription: 'Domaći.',
      description: '<p>Opis</p>',
      sku: 'DZEM-SLJIVA',
      isActive: true,
      isFeatured: false,
      seoTitle: null,
      seoDescription: null,
      variants: [
        {
          name: '370 g',
          sku: 'DZEM-SLJIVA-370G',
          unitAmount: 370,
          measurementUnit: 'g',
          regularPrice: 650,
          discountPrice: 590,
          isActive: true,
          sortOrder: 0,
          initialStock: 24,
          lowStockThreshold: 5,
        },
        {
          name: '720 g',
          sku: 'DZEM-SLJIVA-720G',
          unitAmount: 720,
          measurementUnit: 'g',
          regularPrice: 1100,
          discountPrice: null,
          isActive: false,
          sortOrder: 1,
          initialStock: 0,
          lowStockThreshold: 3,
        },
      ],
    });
    expect(createProductRequest(form, { slugEdited: true }).slug).toBe('ne-salje-se');
  });

  it('sends every product field and the version on update, and knows when product fields changed', () => {
    const form = productForm(fb(), PRODUCT);
    expect(productFieldsDirty(form)).toBe(false);
    form.controls.variants.at(0).controls.regularPrice.markAsDirty();
    expect(productFieldsDirty(form)).toBe(false);
    form.controls.isFeatured.setValue(true);
    form.controls.isFeatured.markAsDirty();
    expect(productFieldsDirty(form)).toBe(true);
    expect(updateProductRequest(form, 205, { slugEdited: false })).toEqual({
      version: 205,
      categoryId: PRODUCT.category.id,
      name: PRODUCT.name,
      slug: null,
      shortDescription: PRODUCT.shortDescription,
      description: PRODUCT.description,
      sku: PRODUCT.sku,
      isActive: true,
      isFeatured: true,
      seoTitle: null,
      seoDescription: null,
    });
  });

  it('suggests SKUs and package names', () => {
    expect(suggestProductSku('Džem od šljiva')).toBe('DZEM-OD-SLJIVA');
    expect(suggestVariantSku('DZEM', 370, 'g')).toBe('DZEM-370G');
    expect(suggestVariantSku('SOK', 0.5, 'l')).toBe('SOK-0.5L');
    expect(suggestVariantSku('', 370, 'g')).toBe('');
    expect(suggestVariantName(370, 'g')).toBe('370 g');
    expect(suggestVariantName(0.5, 'l')).toBe('0,5 l');
    expect(suggestVariantName(1500, 'g')).toBe('1.500 g');
    expect(suggestVariantName(null, 'g')).toBe('');
  });
});
