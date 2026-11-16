import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AdminStoreSettings, UpdateStoreSettingsRequest } from '@zladovce/models';
import { emailAddressValidator, notBlank } from '@zladovce/shared';

export const MAX_OTHER_LINKS = 10;
export const MAX_AMOUNT = 9_999_999;

/** Empty, or a full https address of at most 500 characters (the API's rule). */
export const httpsUrlValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value: unknown = control.value;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const trimmed = value.trim();
  const message = {
    httpsUrl: 'Unesite punu adresu koja počinje sa https:// (najviše 500 znakova).',
  };
  if (trimmed.length > 500 || !/^https:\/\//i.test(trimmed)) {
    return message;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname.includes('.') ? null : message;
  } catch {
    return message;
  }
};

/** An amount in dinars with at most two decimals; `positive` refuses 0. */
export function amountValidator(positive: boolean): ValidatorFn {
  return (control) => {
    const value: unknown = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || (positive && amount === 0)) {
      return {
        amount: positive ? 'Iznos mora biti veći od nule.' : 'Iznos ne može biti negativan.',
      };
    }
    if (amount > MAX_AMOUNT) {
      return { amount: 'Iznos je prevelik.' };
    }
    return Math.round(amount * 100) / 100 === amount
      ? null
      : { amount: 'Iznos može imati najviše dve decimale.' };
  };
}

function linkGroup(fb: FormBuilder, label = '', url = '') {
  return fb.nonNullable.group({
    label: [label, [Validators.required, notBlank, Validators.maxLength(50)]],
    url: [url, [Validators.required, httpsUrlValidator]],
  });
}

/**
 * The settings form. Control names are the API member names, so validation errors
 * (`freeShippingThreshold`, `otherLinks[2].url`) land under the right field. A threshold that is
 * switched off ("Bez praga") disables its amount and is sent as null.
 */
export function createSettingsForm(fb: FormBuilder) {
  return fb.group({
    storeName: fb.nonNullable.control('', [
      Validators.required,
      notBlank,
      Validators.maxLength(100),
    ]),
    /**
     * Store logo, sent as `logoKey` (required member): the current key keeps the logo, null
     * removes it, an upload key (purpose `logo`) replaces it.
     */
    logoKey: fb.control<string | null>(null),
    contactEmail: fb.nonNullable.control('', [emailAddressValidator]),
    phone: fb.nonNullable.control('', [Validators.maxLength(50)]),
    businessAddress: fb.nonNullable.control('', [Validators.maxLength(300)]),
    shippingEnabled: fb.nonNullable.control(true),
    shippingPrice: fb.control<number | null>(0, [Validators.required, amountValidator(false)]),
    noFreeShippingThreshold: fb.nonNullable.control(true),
    freeShippingThreshold: fb.control<number | null>({ value: null, disabled: true }, [
      Validators.required,
      amountValidator(true),
    ]),
    noMinOrderAmount: fb.nonNullable.control(true),
    minOrderAmount: fb.control<number | null>({ value: null, disabled: true }, [
      Validators.required,
      amountValidator(true),
    ]),
    estimatedDeliveryText: fb.nonNullable.control('', [Validators.maxLength(200)]),
    deliveryInfo: fb.nonNullable.control('', [Validators.maxLength(4000)]),
    facebookUrl: fb.nonNullable.control('', [httpsUrlValidator]),
    instagramUrl: fb.nonNullable.control('', [httpsUrlValidator]),
    otherLinks: fb.array<ReturnType<typeof linkGroup>>([]),
    defaultSeoTitle: fb.nonNullable.control('', [Validators.maxLength(120)]),
    defaultSeoDescription: fb.nonNullable.control('', [Validators.maxLength(320)]),
  });
}

export type SettingsForm = ReturnType<typeof createSettingsForm>;

/** Enables or disables a threshold amount to match its "Bez praga" switch. */
export function syncThreshold(
  form: SettingsForm,
  which: 'freeShippingThreshold' | 'minOrderAmount',
): void {
  const off =
    which === 'freeShippingThreshold'
      ? form.controls.noFreeShippingThreshold.value
      : form.controls.noMinOrderAmount.value;
  const control = form.controls[which];
  if (off && control.enabled) {
    control.disable({ emitEvent: false });
  } else if (!off && control.disabled) {
    control.enable({ emitEvent: false });
  }
}

export function addLink(form: SettingsForm, fb: FormBuilder, label = '', url = ''): boolean {
  if (form.controls.otherLinks.length >= MAX_OTHER_LINKS) {
    return false;
  }
  form.controls.otherLinks.push(linkGroup(fb, label, url));
  return true;
}

/** Puts saved settings into the form (and marks it pristine). */
export function fillSettingsForm(
  form: SettingsForm,
  fb: FormBuilder,
  settings: AdminStoreSettings,
): void {
  const links = form.controls.otherLinks as FormArray;
  links.clear({ emitEvent: false });
  for (const link of settings.otherLinks) {
    links.push(linkGroup(fb, link.label ?? '', link.url ?? ''), { emitEvent: false });
  }
  form.reset({
    storeName: settings.storeName,
    logoKey: settings.logoKey,
    contactEmail: settings.contactEmail ?? '',
    phone: settings.phone ?? '',
    businessAddress: settings.businessAddress ?? '',
    shippingEnabled: settings.shippingEnabled,
    shippingPrice: settings.shippingPrice,
    noFreeShippingThreshold: settings.freeShippingThreshold === null,
    freeShippingThreshold: settings.freeShippingThreshold,
    noMinOrderAmount: settings.minOrderAmount === null,
    minOrderAmount: settings.minOrderAmount,
    estimatedDeliveryText: settings.estimatedDeliveryText ?? '',
    deliveryInfo: settings.deliveryInfo ?? '',
    facebookUrl: settings.facebookUrl ?? '',
    instagramUrl: settings.instagramUrl ?? '',
    otherLinks: settings.otherLinks.map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
    defaultSeoTitle: settings.defaultSeoTitle ?? '',
    defaultSeoDescription: settings.defaultSeoDescription ?? '',
  });
  syncThreshold(form, 'freeShippingThreshold');
  syncThreshold(form, 'minOrderAmount');
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

/** Every member is sent (the API requires them); empty texts and switched-off thresholds are null. */
export function settingsRequest(form: SettingsForm, version: number): UpdateStoreSettingsRequest {
  const v = form.getRawValue();
  return {
    version,
    storeName: v.storeName.trim(),
    logoKey: v.logoKey,
    contactEmail: text(v.contactEmail),
    phone: text(v.phone),
    businessAddress: text(v.businessAddress),
    shippingEnabled: v.shippingEnabled,
    shippingPrice: Number(v.shippingPrice ?? 0),
    freeShippingThreshold:
      v.noFreeShippingThreshold || v.freeShippingThreshold === null
        ? null
        : Number(v.freeShippingThreshold),
    minOrderAmount:
      v.noMinOrderAmount || v.minOrderAmount === null ? null : Number(v.minOrderAmount),
    estimatedDeliveryText: text(v.estimatedDeliveryText),
    deliveryInfo: text(v.deliveryInfo),
    facebookUrl: text(v.facebookUrl),
    instagramUrl: text(v.instagramUrl),
    otherLinks: v.otherLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
    defaultSeoTitle: text(v.defaultSeoTitle),
    defaultSeoDescription: text(v.defaultSeoDescription),
  };
}
