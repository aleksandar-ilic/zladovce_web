import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { ApiError } from '@zladovce/api';
import { imageSrc, imageSrcset } from './images';
import { compactParams, readEnum, readFlag, readPositiveInt, readUuid } from './list-query';
import { normalizeHref, richTextToPlain, safeHref, sanitizeRichText } from './rich-text';
import { applyServerErrors, fieldPath } from './server-errors';

const validation = (errors: Record<string, string[]>, code = 'VALIDATION_FAILED') =>
  new ApiError({
    status: 400,
    code,
    title: 'Neispravni podaci',
    detail: 'Proverite podatke.',
    errors,
  });

describe('fieldPath', () => {
  it('splits nested API paths into form path segments', () => {
    expect(fieldPath('name')).toEqual(['name']);
    expect(fieldPath('variants[0].discountPrice')).toEqual(['variants', 0, 'discountPrice']);
    expect(fieldPath('Variants[12].RegularPrice')).toEqual(['variants', 12, 'regularPrice']);
    expect(fieldPath('items[1][2].x')).toEqual(['items', 1, 2, 'x']);
  });
});

describe('applyServerErrors', () => {
  function form() {
    return new FormGroup({
      name: new FormControl(''),
      variants: new FormArray([
        new FormGroup({ sku: new FormControl('A'), discountPrice: new FormControl(5) }),
        new FormGroup({ sku: new FormControl('B'), discountPrice: new FormControl(7) }),
      ]),
    });
  }

  it('puts messages on top-level and nested form-array controls and marks them touched', () => {
    const f = form();
    const unmatched = applyServerErrors(
      f,
      validation({
        name: ['Naziv je obavezan.'],
        'variants[1].discountPrice': ['Akcijska cena mora biti niža od redovne cene.'],
        'variants[0].sku': ['Šifra nije ispravna.', 'Najviše 64 znaka.'],
      }),
    );
    expect(unmatched).toEqual([]);
    expect(f.controls.name.errors).toEqual({ server: 'Naziv je obavezan.' });
    expect(f.controls.name.touched).toBe(true);
    const second = f.controls.variants.at(1).controls.discountPrice;
    expect(second.errors).toEqual({ server: 'Akcijska cena mora biti niža od redovne cene.' });
    expect(second.touched).toBe(true);
    expect(f.controls.variants.at(0).controls.sku.errors).toEqual({
      server: 'Šifra nije ispravna. Najviše 64 znaka.',
    });
    expect(f.controls.variants.at(0).controls.discountPrice.errors).toBeNull();
  });

  it('returns messages that match no control, and honours aliases', () => {
    const f = new FormGroup({ amount: new FormControl(1) });
    const unmatched = applyServerErrors(
      f,
      validation({ quantityDelta: ['Ne može biti nula.'], '': ['Opšta greška.'], other: ['X'] }),
      { aliases: { quantityDelta: 'amount' } },
    );
    expect(f.controls.amount.errors).toEqual({ server: 'Ne može biti nula.' });
    expect(unmatched).toEqual(['Opšta greška.', 'X']);
  });

  it('clears the server error when the value changes', () => {
    const f = form();
    applyServerErrors(f, validation({ name: ['Zauzeto.'] }));
    f.controls.name.setValue('Novi naziv');
    expect(f.controls.name.errors).toBeNull();
  });

  it('puts a 409 SKU_TAKEN on the variant named by its errors key', () => {
    const f = new FormGroup({
      sku: new FormControl('DZEM'),
      variants: new FormArray([
        new FormGroup({ sku: new FormControl('DZEM-370G') }),
        new FormGroup({ sku: new FormControl('DZEM-720G') }),
      ]),
    });
    const conflict = new ApiError({
      status: 409,
      code: 'SKU_TAKEN',
      title: 'Konflikt',
      detail: 'Šifra (SKU) „DZEM-720G“ se već koristi.',
      errors: { 'variants[1].sku': ['Šifra (SKU) „DZEM-720G“ se već koristi.'] },
    });
    const unmatched = applyServerErrors(f, conflict);
    expect(unmatched).toEqual([]);
    expect(f.controls.sku.errors).toBeNull();
    expect(f.controls.variants.at(0).controls.sku.errors).toBeNull();
    expect(f.controls.variants.at(1).controls.sku.errors?.['server']).toContain('se već koristi');
  });
});

describe('sanitizeRichText', () => {
  it('keeps the allowed subset', () => {
    const html =
      '<h2>Sastav</h2><p><strong>Šljive</strong> i <em>šećer</em>, <u>bez</u> <s>konzervansa</s>.</p>' +
      '<ul><li>Jedan</li></ul><ol><li>Dva</li></ol><blockquote>Citat</blockquote><hr>' +
      '<p><a href="https://zladovce.com" title="Sajt">veza</a><br>red</p><h3>A</h3><h4>B</h4>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('normalises browser markup and drops everything else', () => {
    expect(sanitizeRichText('<div><b>Jako</b> i <i>koso</i></div>')).toBe(
      '<p><strong>Jako</strong> i <em>koso</em></p>',
    );
    expect(sanitizeRichText('<p style="color:red" class="x" onclick="alert(1)">Tekst</p>')).toBe(
      '<p>Tekst</p>',
    );
    expect(sanitizeRichText('<p>A<script>alert(1)</script><img src=x onerror=alert(1)>B</p>')).toBe(
      '<p>AB</p>',
    );
    expect(sanitizeRichText('<p><span style="font-weight:bold">raspakuj</span></p>')).toBe(
      '<p>raspakuj</p>',
    );
    expect(sanitizeRichText('<h1>Veliki</h1>')).toBe('<h2>Veliki</h2>');
  });

  it('removes unsafe links but keeps their text', () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">klik</a></p>')).toBe('<p>klik</p>');
    expect(sanitizeRichText('<p><a href="/kontakt" target="_blank">kontakt</a></p>')).toBe(
      '<p><a href="/kontakt">kontakt</a></p>',
    );
  });

  it('wraps loose text in paragraphs and trims blank ones at the ends', () => {
    expect(sanitizeRichText('Samo tekst')).toBe('<p>Samo tekst</p>');
    expect(sanitizeRichText('<p><br></p><p>Sredina</p><p>&nbsp;</p>')).toBe('<p>Sredina</p>');
    expect(sanitizeRichText('<div><ul><li>a</li></ul></div>')).toBe('<ul><li>a</li></ul>');
  });

  it('gives an empty string for an empty editor', () => {
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText('<p><br></p>')).toBe('');
    expect(richTextToPlain('<p>Džem&nbsp;od <strong>šljiva</strong></p>')).toBe('Džem od šljiva');
  });

  it('checks and completes link addresses', () => {
    expect(safeHref('https://a.rs')).toBe('https://a.rs');
    expect(safeHref('mailto:x@y.rs')).toBe('mailto:x@y.rs');
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(normalizeHref('zladovce.com/o-nama')).toBe('https://zladovce.com/o-nama');
    expect(normalizeHref('info@zladovce.com')).toBe('mailto:info@zladovce.com');
    expect(normalizeHref('javascript:alert(1)')).toBeNull();
    expect(normalizeHref('  ')).toBeNull();
  });
});

describe('image renditions', () => {
  const image = { baseUrl: 'http://localhost:9000/b/media/products/1', widths: [1600, 400, 800] };

  it('builds srcset from baseUrl and widths', () => {
    expect(imageSrcset(image)).toBe(
      'http://localhost:9000/b/media/products/1/400.webp 400w, ' +
        'http://localhost:9000/b/media/products/1/800.webp 800w, ' +
        'http://localhost:9000/b/media/products/1/1600.webp 1600w',
    );
    expect(imageSrc(image, 500)).toBe('http://localhost:9000/b/media/products/1/800.webp');
    expect(imageSrc(image, 5000)).toBe('http://localhost:9000/b/media/products/1/1600.webp');
    expect(imageSrc({ baseUrl: 'x', widths: [] })).toBe('');
  });
});

describe('list query helpers', () => {
  it('reads query parameters defensively', () => {
    expect(readEnum({ s: 'low' }, 's', ['ok', 'low'] as const)).toBe('low');
    expect(readEnum({ s: 'bad' }, 's', ['ok', 'low'] as const)).toBeUndefined();
    expect(readPositiveInt({ p: '3' }, 'p', 1)).toBe(3);
    expect(readPositiveInt({ p: '-1' }, 'p', 1)).toBe(1);
    expect(readPositiveInt({ p: 'x' }, 'p', 1)).toBe(1);
    expect(readPositiveInt({ p: '500' }, 'p', 1, 100)).toBe(100);
    expect(readFlag({ a: 'true' }, 'a')).toBe(true);
    expect(readFlag({}, 'a')).toBe(false);
    expect(readUuid({ c: '6f1c2c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f' }, 'c')).toBeDefined();
    expect(readUuid({ c: 'nije-id' }, 'c')).toBeUndefined();
  });

  it('leaves defaults and empty values out of the URL', () => {
    expect(
      compactParams(
        { q: '', sort: 'newest', page: 2, archived: false, status: 'low' },
        { sort: 'newest', page: 1 },
      ),
    ).toEqual({ q: null, sort: null, page: '2', archived: null, status: 'low' });
  });
});
