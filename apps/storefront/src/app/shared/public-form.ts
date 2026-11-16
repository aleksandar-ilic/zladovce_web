import { DestroyRef, signal } from '@angular/core';
import { ApiError } from '@zladovce/api';
import { waitText } from '../features/checkout/checkout-form';

/** Why a public form (newsletter, contact) was not accepted, in words for the visitor. */
export interface FormProblem {
  kind: 'validation' | 'rateLimited' | 'notConfigured' | 'network' | 'other';
  title: string;
  message: string;
}

export function formProblem(error: ApiError): FormProblem {
  if (error.status === 429) {
    return {
      kind: 'rateLimited',
      title: 'Previše pokušaja u kratkom roku',
      message: `Sa jednog uređaja se može poslati samo nekoliko zahteva za redom. Sačekajte oko ${waitText(error.retryAfterSeconds)} i pokušajte ponovo.`,
    };
  }
  if (error.status === 0) {
    return {
      kind: 'network',
      title: 'Nema veze sa serverom',
      message: 'Slanje trenutno nije moguće. Proverite internet vezu i pokušajte ponovo.',
    };
  }
  if (error.status === 400) {
    return {
      kind: 'validation',
      title: 'Proverite unete podatke',
      message: error.isValidation ? 'Ispravite označena polja.' : error.detail,
    };
  }
  return { kind: 'other', title: 'Slanje nije uspelo', message: error.detail };
}

/**
 * Keeps a submit button disabled for the `Retry-After` time of a 429 (1 s – 1 h; 60 s when
 * the server gave none).
 */
export class SubmitBlock {
  private readonly until = signal<number | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly blocked = () => this.until() !== null;

  constructor(destroyRef: DestroyRef) {
    destroyRef.onDestroy(() => this.clear());
  }

  block(seconds: number | null): void {
    const wait = Math.min(Math.max(seconds ?? 60, 1), 3600);
    this.clear();
    this.until.set(Date.now() + wait * 1000);
    this.timer = setTimeout(() => this.until.set(null), wait * 1000);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** Visually hidden, unfocusable honeypot field (`website`); people never fill it, bots do. */
export const HONEYPOT_CLASS = 'absolute -left-[10000px] top-auto size-px overflow-hidden';
