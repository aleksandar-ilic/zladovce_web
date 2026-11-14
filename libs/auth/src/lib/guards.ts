import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminRole } from '@zladovce/models';
import { AuthService } from './auth.service';
import { AUTH_ROUTES } from './provide-auth';
import { hasRole } from './roles';

/** Only same-app paths are accepted as a return target (no open redirect through `returnUrl`). */
export function safeReturnUrl(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : fallback;
}

/**
 * Allows signed-in administrators; everyone else goes to the sign-in page, which returns
 * them to the requested URL afterwards.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const routes = inject(AUTH_ROUTES);
  if (await auth.restore()) {
    return true;
  }
  const returnUrl = state.url && state.url !== routes.home ? state.url : null;
  return router.createUrlTree([routes.signIn], { queryParams: returnUrl ? { returnUrl } : {} });
};

/** For the sign-in page: an administrator who is already signed in goes straight to the app. */
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const routes = inject(AUTH_ROUTES);
  if (await auth.restore()) {
    return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl'), routes.home));
  }
  return true;
};

/**
 * Allows administrators holding one of `roles`; others are sent to the home page.
 * Use after `authGuard` (e.g. on a child route of the guarded shell):
 *
 *   { path: 'podesavanja', canActivate: [roleGuard('Owner')], loadComponent: … }
 */
export function roleGuard(...roles: AdminRole[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const routes = inject(AUTH_ROUTES);
    if (!(await auth.restore())) {
      return router.createUrlTree([routes.signIn]);
    }
    const user = await auth.loadProfile();
    if (!auth.isSignedIn()) {
      return router.createUrlTree([routes.signIn]);
    }
    return hasRole(user, roles) ? true : router.createUrlTree([routes.home]);
  };
}
