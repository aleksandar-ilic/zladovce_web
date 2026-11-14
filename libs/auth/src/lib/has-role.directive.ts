import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from './auth.service';
import { hasRole, RoleRequirement } from './roles';

/**
 * Renders its content only for administrators holding one of the given roles:
 *
 *   <a *authHasRole="'Owner'" routerLink="/podesavanja">Podešavanja</a>
 *   <section *authHasRole="['Owner', 'Staff']">…</section>
 *
 * Convenience only – the API enforces permissions.
 */
@Directive({ selector: '[authHasRole]' })
export class HasRoleDirective {
  readonly authHasRole = input.required<RoleRequirement>();

  private readonly auth = inject(AuthService);
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private visible = false;

  constructor() {
    effect(() => {
      const allowed = hasRole(this.auth.user(), this.authHasRole());
      if (allowed === this.visible) {
        return;
      }
      this.visible = allowed;
      if (allowed) {
        this.container.createEmbeddedView(this.template);
      } else {
        this.container.clear();
      }
    });
  }
}
