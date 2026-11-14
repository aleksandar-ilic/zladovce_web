import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from '@zladovce/auth';
import { unsavedChangesGuard } from './shared/unsaved-changes';

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
        path: 'porudzbine',
        title: 'Porudžbine – Zladovce administracija',
        loadComponent: () => import('./features/orders/orders.page').then((m) => m.OrdersPage),
      },
      {
        path: 'porudzbine/:id',
        title: 'Porudžbina – Zladovce administracija',
        loadComponent: () =>
          import('./features/orders/order-detail.page').then((m) => m.OrderDetailPage),
      },
      {
        path: 'proizvodi',
        title: 'Proizvodi – Zladovce administracija',
        loadComponent: () =>
          import('./features/products/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'proizvodi/novi',
        title: 'Novi proizvod – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/products/product-form.page').then((m) => m.ProductFormPage),
      },
      {
        path: 'proizvodi/:id',
        title: 'Izmena proizvoda – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/products/product-form.page').then((m) => m.ProductFormPage),
      },
      {
        path: 'kategorije',
        title: 'Kategorije – Zladovce administracija',
        loadComponent: () =>
          import('./features/categories/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'kategorije/nova',
        title: 'Nova kategorija – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/categories/category-form.page').then((m) => m.CategoryFormPage),
      },
      {
        path: 'kategorije/:id',
        title: 'Izmena kategorije – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/categories/category-form.page').then((m) => m.CategoryFormPage),
      },
      {
        path: 'zalihe',
        title: 'Zalihe – Zladovce administracija',
        loadComponent: () =>
          import('./features/inventory/inventory.page').then((m) => m.InventoryPage),
      },
      {
        path: 'kuriri',
        title: 'Kurirske službe – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        loadComponent: () =>
          import('./features/couriers/couriers.page').then((m) => m.CouriersPage),
      },
      {
        path: 'podesavanja',
        title: 'Podešavanja prodavnice – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
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
