import { AdminEmailItem, EmailOutboxStatus, EmailTemplate } from '@zladovce/models';
import { UiBadgeTone } from '@zladovce/ui';

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  OrderReceived: 'Porudžbina primljena',
  OrderAccepted: 'Porudžbina prihvaćena',
  OrderPreparing: 'Porudžbina se priprema',
  OrderShipped: 'Porudžbina poslata',
  OrderDelivered: 'Porudžbina isporučena',
  OrderCancelled: 'Porudžbina otkazana',
  NewsletterConfirm: 'Potvrda prijave na newsletter',
  ContactMessage: 'Poruka sa kontakt forme',
};

export const EMAIL_STATUS_LABELS: Record<EmailOutboxStatus, string> = {
  Pending: 'Čeka slanje',
  Processing: 'Šalje se',
  Sent: 'Poslato',
  Dead: 'Neuspešno',
};

export const EMAIL_STATUS_TONES: Record<EmailOutboxStatus, UiBadgeTone> = {
  Pending: 'warning',
  Processing: 'info',
  Sent: 'success',
  Dead: 'danger',
};

/** Every status, in the order of an email's life (filters). */
export const EMAIL_STATUSES: readonly EmailOutboxStatus[] = [
  'Pending',
  'Processing',
  'Sent',
  'Dead',
];

export function emailTemplateLabel(item: Pick<AdminEmailItem, 'template' | 'isResent'>): string {
  const label = EMAIL_TEMPLATE_LABELS[item.template] ?? item.template;
  return item.isResent ? `${label} (ponovo poslato)` : label;
}

export function isEmailStatus(value: unknown): value is EmailOutboxStatus {
  return typeof value === 'string' && (EMAIL_STATUSES as readonly string[]).includes(value);
}

/**
 * The technical error of a failed send (`lastError`: exception type, SMTP status or SES code)
 * in plain words for the shop. The original text is shown next to it for support.
 */
export function emailErrorText(error: string | null | undefined): string {
  if (!error) {
    return '';
  }
  if (/time ?out|timed out/i.test(error)) {
    return 'Servis za slanje e-pošte nije odgovorio na vreme.';
  }
  if (
    /\b(535|530)\b|auth|credential|AccessDenied|InvalidClientToken|SignatureDoesNotMatch/i.test(
      error,
    )
  ) {
    return 'Prijava na servis za slanje e-pošte nije uspela (podešavanje servera).';
  }
  if (
    /\b(550|551|553|554)\b|mailbox|recipient|MessageRejected|MailFromDomainNotVerified|address/i.test(
      error,
    )
  ) {
    return 'Adresa primaoca je odbijena. Proverite e-adresu kupca.';
  }
  if (
    /\b(421|450|451|452|454)\b|throttl|TooManyRequests|LimitExceeded|SendingPaused|quota/i.test(
      error,
    )
  ) {
    return 'Servis za slanje e-pošte je privremeno ograničio slanje.';
  }
  if (/refused|socket|connect|unreachable|host|network|dns|resolve/i.test(error)) {
    return 'Server za slanje e-pošte nije bio dostupan.';
  }
  return 'Slanje nije uspelo.';
}

/** Serbian plural: `pluralSr(n, 'e-poruka', 'e-poruke', 'e-poruka')`. */
export function pluralSr(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  if (last === 1 && !teen) {
    return one;
  }
  return last >= 2 && last <= 4 && !teen ? few : many;
}

/** "1 neposlata e-poruka", "3 neposlate e-poruke", "5 neposlatih e-poruka". */
export function deadEmailsText(count: number): string {
  return `${count} ${pluralSr(count, 'neposlata e-poruka', 'neposlate e-poruke', 'neposlatih e-poruka')}`;
}
