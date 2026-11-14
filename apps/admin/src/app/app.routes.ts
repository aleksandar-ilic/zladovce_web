import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@zladovce/auth';

/**
 * Admin routes. Everything except the sign-in page lives inside the guarded shell.
 * New features are added as lazy children of the shell route (above the catch-all) and get
 * a menu entry in core/navigation.ts. Owner-only routes add `canActivate: [roleGuard('Owner')]`.
 */
export const routes: Routes = [
  {
    path: 'prijava',
    title: 'Prijava – Zladovce administracija',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/sign-in/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Kontrolna tabla – Zladovce administracija',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: '**',
        title: 'Stranica nije pronađena – Zladovce administracija',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
