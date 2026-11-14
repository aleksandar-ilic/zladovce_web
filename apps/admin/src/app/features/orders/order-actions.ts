import { AdminOrderDetail, AllowedStatusTransition, OrderStatus } from '@zladovce/models';
import { orderStatusLabel, STOCK_RETURN_TEXT } from '@zladovce/shared';

/** How a status change looks on the order page: the positive next step is the primary button. */
export type OrderActionKind = 'primary' | 'secondary' | 'danger';

export interface OrderAction {
  transition: AllowedStatusTransition;
  /** Button text: "Prihvati porudžbinu". */
  label: string;
  kind: OrderActionKind;
  /** Title of the confirmation dialog. */
  title: string;
  /** Plain explanation shown in the dialog. */
  explanation: string;
  /** What happens to the stock, when anything happens (null when the admin chooses). */
  stockText: string | null;
}

interface ActionText {
  label: string;
  kind: OrderActionKind;
  title: string;
  explanation: string;
}

const TEXTS: Partial<Record<OrderStatus, ActionText>> = {
  Accepted: {
    label: 'Prihvati porudžbinu',
    kind: 'primary',
    title: 'Prihvatiti porudžbinu?',
    explanation: 'Potvrđujete kupcu da ste porudžbinu primili i da ćete je poslati.',
  },
  Preparing: {
    label: 'Počni pripremu',
    kind: 'primary',
    title: 'Početi pripremu?',
    explanation: 'Porudžbina prelazi u „U pripremi“: pakujete proizvode za slanje.',
  },
  Shipped: {
    label: 'Označi kao poslato',
    kind: 'primary',
    title: 'Označiti porudžbinu kao poslatu?',
    explanation:
      'Upišite kojom kurirskom službom je paket poslat. Broj pošiljke možete dodati i kasnije.',
  },
  Delivered: {
    label: 'Označi kao isporučeno',
    kind: 'primary',
    title: 'Označiti porudžbinu kao isporučenu?',
    explanation: 'Kupac je preuzeo paket. Posle toga možete da evidentirate naplatu od kurira.',
  },
  DeliveryFailed: {
    label: 'Neuspešna isporuka',
    kind: 'secondary',
    title: 'Isporuka nije uspela?',
    explanation:
      'Kurir nije uspeo da preda paket (kupac nije bio dostupan ili je odbio paket). Posle toga paket možete poslati ponovo ili otkazati porudžbinu.',
  },
  Cancelled: {
    label: 'Otkaži porudžbinu',
    kind: 'danger',
    title: 'Otkazati porudžbinu?',
    explanation: 'Porudžbina se otkazuje i više se ne može vratiti u obradu.',
  },
  Rejected: {
    label: 'Odbij porudžbinu',
    kind: 'danger',
    title: 'Odbiti porudžbinu?',
    explanation:
      'Porudžbinu ne prihvatate (na primer: netačni podaci ili nije moguće poslati). Ovo se ne može poništiti.',
  },
};

const ORDER: Record<OrderActionKind, number> = { primary: 0, secondary: 1, danger: 2 };

/** One action per allowed next status, positive steps first, destructive ones last. */
export function orderActions(
  order: Pick<AdminOrderDetail, 'status' | 'allowedNextStatuses'>,
): OrderAction[] {
  return order.allowedNextStatuses
    .map((transition): OrderAction => {
      const text = TEXTS[transition.status] ?? {
        label: `Promeni u „${orderStatusLabel(transition.status)}“`,
        kind: 'secondary' as const,
        title: `Promeniti status u „${orderStatusLabel(transition.status)}“?`,
        explanation: '',
      };
      const again = transition.status === 'Shipped' && order.status === 'DeliveryFailed';
      return {
        transition,
        ...text,
        label: again ? 'Pošalji ponovo' : text.label,
        title: again ? 'Poslati paket ponovo?' : text.title,
        explanation: again
          ? 'Za novi pokušaj dostave upisuje se nova pošiljka (kurirska služba, broj pošiljke).'
          : text.explanation,
        stockText:
          transition.stockReturn === 'AdminChoice'
            ? null
            : STOCK_RETURN_TEXT[transition.stockReturn],
      };
    })
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/** Next step in words for the order page ("Sledeći korak: …"), or null for final statuses. */
export function nextStepHint(
  order: Pick<AdminOrderDetail, 'status' | 'allowedNextStatuses'>,
): string | null {
  switch (order.status) {
    case 'Received':
      return 'Nova porudžbina. Proverite podatke i prihvatite je (ili odbijte).';
    case 'Accepted':
      return 'Kada počnete da pakujete, izaberite „Počni pripremu“.';
    case 'Preparing':
      return 'Kada predate paket kuriru, izaberite „Označi kao poslato“ i upišite kurirsku službu.';
    case 'Shipped':
      return 'Kada kupac preuzme paket, izaberite „Označi kao isporučeno“.';
    case 'DeliveryFailed':
      return 'Dogovorite se sa kupcem: pošaljite paket ponovo ili otkažite porudžbinu.';
    default:
      return null;
  }
}
