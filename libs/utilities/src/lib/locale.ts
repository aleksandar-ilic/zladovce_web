import { registerLocaleData } from '@angular/common';
import localeSrLatn from '@angular/common/locales/sr-Latn';
import localeSrLatnExtra from '@angular/common/locales/extra/sr-Latn';
import { EnvironmentProviders, LOCALE_ID, makeEnvironmentProviders } from '@angular/core';
import { SERBIAN_LOCALE } from './format-date';

/**
 * Registers Serbian Latin locale data under `sr-Latn-RS` and makes it the application locale,
 * so Angular's own pipes (date, number, currency) also produce Serbian output.
 */
export function provideSerbianLocale(): EnvironmentProviders {
  registerLocaleData(localeSrLatn, SERBIAN_LOCALE, localeSrLatnExtra);
  return makeEnvironmentProviders([{ provide: LOCALE_ID, useValue: SERBIAN_LOCALE }]);
}
