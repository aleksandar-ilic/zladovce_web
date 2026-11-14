import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AbstractControl, NgControl, Validators } from '@angular/forms';
import { validationMessage, ValidationMessages } from './validation-messages';

let nextFieldId = 0;

const INPUT_BASE =
  'block w-full rounded-md border bg-white px-3.5 py-2.5 text-base text-ink-900 ' +
  'placeholder:text-ink-500 transition-colors duration-150 ' +
  'focus:outline-2 focus:outline-offset-0 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-ink-500';
const INPUT_VALID =
  'border-sage-400 hover:border-sage-600 focus:border-olive-700 focus:outline-olive-700';
const INPUT_INVALID = 'border-danger-600 focus:border-danger-600 focus:outline-danger-600';

/**
 * Wraps one form control with a label, an optional hint and the validation error.
 * The error is shown once the control is invalid and was touched or changed.
 *
 *   <ui-form-field label="E-adresa" hint="Koristimo je samo za potvrdu porudžbine.">
 *     <input uiInput type="email" formControlName="email" autocomplete="email" />
 *   </ui-form-field>
 *
 * Label, hint and error are linked to the control (for / aria-describedby / aria-invalid).
 */
@Component({
  selector: 'ui-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [for]="inputId" class="block text-sm font-semibold text-ink-900">
      {{ label() }}
      @if (required()) {
        <span class="text-danger-600" aria-hidden="true">*</span>
      }
    </label>
    <div class="mt-1.5">
      <ng-content />
    </div>
    @if (errorMessage(); as message) {
      <p [id]="errorId" class="mt-1.5 text-sm font-medium text-danger-700" role="alert">
        {{ message }}
      </p>
    } @else if (hint()) {
      <p [id]="hintId" class="mt-1.5 text-sm text-ink-500">{{ hint() }}</p>
    }
  `,
})
export class UiFormField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  /** Messages per validator key; they override the built-in Serbian defaults. */
  readonly messages = input<ValidationMessages>({});

  readonly inputId = `ui-field-${nextFieldId++}`;
  readonly errorId = `${this.inputId}-error`;
  readonly hintId = `${this.inputId}-hint`;

  private readonly ngControl = contentChild(NgControl);
  /** Bumped on every control event; forms are not signal based, so this bridges them. */
  private readonly controlEvents = signal(0);

  private readonly control = computed<AbstractControl | null>(() => {
    this.controlEvents();
    return this.ngControl()?.control ?? null;
  });

  readonly errorMessage = computed(() => {
    this.controlEvents();
    const control = this.control();
    if (!control || !control.invalid || !(control.touched || control.dirty)) {
      return null;
    }
    return validationMessage(control.errors, this.messages());
  });

  readonly required = computed(() => {
    this.controlEvents();
    return this.control()?.hasValidator(Validators.required) ?? false;
  });

  /** Id of the element currently describing the control, if any. */
  readonly describedBy = computed(() => {
    if (this.errorMessage()) {
      return this.errorId;
    }
    return this.hint() ? this.hintId : null;
  });

  constructor() {
    effect((onCleanup) => {
      const control = this.ngControl()?.control;
      if (!control) {
        return;
      }
      const subscription = control.events.subscribe(() => this.controlEvents.update((n) => n + 1));
      onCleanup(() => subscription.unsubscribe());
    });
  }
}

/**
 * Brand styling for native form controls. Inside `ui-form-field` it also receives the id and
 * ARIA attributes that link it to the label and messages.
 */
@Directive({
  selector: 'input[uiInput], textarea[uiInput], select[uiInput]',
  host: {
    '[class]': 'classes()',
    '[attr.id]': 'field?.inputId',
    '[attr.aria-describedby]': 'field?.describedBy()',
    '[attr.aria-invalid]': 'invalid() ? "true" : null',
    '[attr.aria-required]': 'field?.required() ? "true" : null',
  },
})
export class UiInput {
  protected readonly field = inject(UiFormField, { optional: true });

  protected readonly invalid = computed(() => !!this.field?.errorMessage());
  protected readonly classes = computed(
    () => `${INPUT_BASE} ${this.invalid() ? INPUT_INVALID : INPUT_VALID}`,
  );
}
