import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiBadge } from './badge';
import { UiButton } from './button';
import { UiCard, UiCardTitle } from './card';
import { UiFormField, UiInput } from './form-field';
import { UiSpinner } from './spinner';
import { UiEmptyState, UiErrorState, UiLoadingState } from './states';
import { validationMessage } from './validation-messages';

async function render<T>(component: new () => T): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const el = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement => {
  const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  if (!found) {
    throw new Error(`Element not found: ${selector}`);
  }
  return found;
};

describe('UiButton', () => {
  @Component({
    imports: [UiButton],
    template: `
      <button
        uiButton
        type="button"
        [variant]="variant()"
        [loading]="loading()"
        [disabled]="disabled()"
        (click)="clicks.set(clicks() + 1)"
      >
        Sačuvaj
      </button>
      <a uiButton variant="secondary" size="lg" href="/prodavnica">Prodavnica</a>
    `,
  })
  class Host {
    variant = signal<'primary' | 'danger'>('primary');
    loading = signal(false);
    disabled = signal(false);
    clicks = signal(0);
  }

  it('renders content with variant and size classes on native elements', async () => {
    const fixture = await render(Host);
    const button = el(fixture, 'button');
    expect(button.textContent).toContain('Sačuvaj');
    expect(button.className).toContain('bg-olive-700');
    expect(button.className).toContain('min-h-11');
    const link = el(fixture, 'a');
    expect(link.className).toContain('border-olive-400');
    expect(link.className).toContain('min-h-13');
    expect(link.getAttribute('href')).toBe('/prodavnica');
  });

  it('switches variant', async () => {
    const fixture = await render(Host);
    fixture.componentInstance.variant.set('danger');
    fixture.detectChanges();
    expect(el(fixture, 'button').className).toContain('bg-danger-600');
  });

  it('emits clicks when active', async () => {
    const fixture = await render(Host);
    el(fixture, 'button').click();
    expect(fixture.componentInstance.clicks()).toBe(1);
  });

  it('shows a spinner, sets aria-busy and blocks clicks while loading', async () => {
    const fixture = await render(Host);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    const button = el(fixture, 'button') as HTMLButtonElement;
    expect(button.querySelector('ui-spinner')).not.toBeNull();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(0);
  });

  it('is disabled through the disabled input', async () => {
    const fixture = await render(Host);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    const button = el(fixture, 'button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.querySelector('ui-spinner')).toBeNull();
  });
});

describe('UiSpinner', () => {
  @Component({
    imports: [UiSpinner],
    template: `<ui-spinner id="a" /><ui-spinner id="b" label="" size="lg" />`,
  })
  class Host {}

  it('is announced as a status with a Serbian label by default', async () => {
    const fixture = await render(Host);
    const spinner = el(fixture, '#a');
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.textContent).toContain('Učitavanje');
    expect(spinner.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is decorative without a label', async () => {
    const fixture = await render(Host);
    const spinner = el(fixture, '#b');
    expect(spinner.getAttribute('role')).toBeNull();
    expect(spinner.textContent?.trim()).toBe('');
    expect(spinner.querySelector('svg')?.getAttribute('class')).toContain('size-9');
  });
});

describe('UiFormField + UiInput', () => {
  @Component({
    imports: [ReactiveFormsModule, UiFormField, UiInput],
    template: `
      <form [formGroup]="form">
        <ui-form-field
          label="E-adresa"
          hint="Koristimo je samo za prijavu."
          [messages]="{ email: 'Proverite e-adresu.' }"
        >
          <input uiInput type="email" formControlName="email" />
        </ui-form-field>
        <ui-form-field label="Napomena">
          <textarea uiInput formControlName="note"></textarea>
        </ui-form-field>
      </form>
    `,
  })
  class Host {
    form = new FormGroup({
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      note: new FormControl('', { nonNullable: true }),
    });
  }

  it('links label, hint and control', async () => {
    const fixture = await render(Host);
    const input = el(fixture, 'input');
    const label = el(fixture, 'label');
    expect(input.id).toMatch(/^ui-field-\d+$/);
    expect(label.getAttribute('for')).toBe(input.id);
    const hint = el(fixture, `#${input.id}-hint`);
    expect(hint.textContent).toContain('Koristimo je samo za prijavu.');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('marks required controls and leaves optional ones unmarked', async () => {
    const fixture = await render(Host);
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('label');
    expect(labels[0]?.textContent).toContain('*');
    expect(labels[1]?.textContent).not.toContain('*');
    expect(el(fixture, 'input').getAttribute('aria-required')).toBe('true');
  });

  it('does not show an error before the control is touched', async () => {
    const fixture = await render(Host);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the default Serbian error after touch and links it to the control', async () => {
    const fixture = await render(Host);
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    const input = el(fixture, 'input');
    const error = el(fixture, '[role="alert"]');
    expect(error.textContent).toContain('Ovo polje je obavezno.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(input.className).toContain('border-danger-600');
  });

  it('uses message overrides and clears the error when the value becomes valid', async () => {
    const fixture = await render(Host);
    const control = fixture.componentInstance.form.controls.email;
    control.setValue('nije-adresa');
    control.markAsDirty();
    fixture.detectChanges();
    expect(el(fixture, '[role="alert"]').textContent).toContain('Proverite e-adresu.');

    control.setValue('ana@example.com');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    expect(el(fixture, 'input').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('validationMessage', () => {
  it('returns null without errors', () => {
    expect(validationMessage(null)).toBeNull();
    expect(validationMessage({})).toBeNull();
  });

  it('formats built-in validator payloads', () => {
    expect(validationMessage({ minlength: { requiredLength: 8, actualLength: 3 } })).toBe(
      'Najmanji broj znakova: 8.',
    );
    expect(validationMessage({ max: { max: 99, actual: 120 } })).toBe(
      'Najveća dozvoljena vrednost: 99.',
    );
  });

  it('falls back to a string error value and then to a generic message', () => {
    expect(validationMessage({ passwordMismatch: 'Lozinke se ne poklapaju.' })).toBe(
      'Lozinke se ne poklapaju.',
    );
    expect(validationMessage({ custom: true })).toBe('Vrednost nije ispravna.');
  });
});

describe('UiCard', () => {
  @Component({
    imports: [UiCard, UiCardTitle],
    template: `
      <ui-card id="a"
        ><h2 uiCardTitle>Naslov</h2>
        <p>Sadržaj</p></ui-card
      >
      <ui-card id="b" padding="none" tone="muted">Bez razmaka</ui-card>
    `,
  })
  class Host {}

  it('projects content with default surface and padding', async () => {
    const fixture = await render(Host);
    const card = el(fixture, '#a');
    expect(card.textContent).toContain('Sadržaj');
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('p-6');
    expect(el(fixture, 'h2').className).toContain('font-serif');
  });

  it('supports tone and padding variants', async () => {
    const fixture = await render(Host);
    const card = el(fixture, '#b');
    expect(card.className).toContain('bg-sage-50');
    expect(card.className).not.toContain('p-6');
  });
});

describe('UiBadge', () => {
  @Component({
    imports: [UiBadge],
    template: `<ui-badge id="a">Nacrt</ui-badge><ui-badge id="b" tone="danger">Otkazano</ui-badge>`,
  })
  class Host {}

  it('renders tones', async () => {
    const fixture = await render(Host);
    expect(el(fixture, '#a').className).toContain('bg-cream-200');
    expect(el(fixture, '#b').className).toContain('text-danger-700');
    expect(el(fixture, '#b').textContent).toContain('Otkazano');
  });
});

describe('state components', () => {
  @Component({
    imports: [UiLoadingState, UiEmptyState, UiErrorState],
    template: `
      <ui-loading-state />
      <ui-empty-state title="Korpa je prazna" description="Dodajte proizvode."
        ><a href="/">Početna</a></ui-empty-state
      >
      <ui-error-state
        id="e1"
        message="Server nije dostupan."
        (retry)="retries.set(retries() + 1)"
      />
      <ui-error-state id="e2" [retryable]="false" />
    `,
  })
  class Host {
    retries = signal(0);
  }

  it('loading state is a polite status with a Serbian label', async () => {
    const fixture = await render(Host);
    const loading = el(fixture, 'ui-loading-state');
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.getAttribute('aria-live')).toBe('polite');
    expect(loading.textContent).toContain('Učitavanje');
  });

  it('empty state shows title, description and projected action', async () => {
    const fixture = await render(Host);
    const empty = el(fixture, 'ui-empty-state');
    expect(empty.textContent).toContain('Korpa je prazna');
    expect(empty.textContent).toContain('Dodajte proizvode.');
    expect(empty.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('error state is an alert and emits retry', async () => {
    const fixture = await render(Host);
    const error = el(fixture, '#e1');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Došlo je do greške');
    expect(error.textContent).toContain('Server nije dostupan.');
    el(fixture, '#e1 button').click();
    expect(fixture.componentInstance.retries()).toBe(1);
  });

  it('error state hides the retry button when retrying cannot help', async () => {
    const fixture = await render(Host);
    expect(el(fixture, '#e2').querySelector('button')).toBeNull();
  });
});
