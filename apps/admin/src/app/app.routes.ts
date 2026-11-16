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
        path: 'e-poruke',
        title: 'E-poruke – Zladovce administracija',
        loadComponent: () => import('./features/emails/emails.page').then((m) => m.EmailsPage),
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
        path: 'izvestaji',
        title: 'Izveštaji – Zladovce administracija',
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'troskovi',
        title: 'Troškovi – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        loadComponent: () =>
          import('./features/expenses/expenses.page').then((m) => m.ExpensesPage),
      },
      {
        path: 'poruke',
        title: 'Poruke kupaca – Zladovce administracija',
        loadComponent: () =>
          import('./features/messages/contact-messages.page').then((m) => m.ContactMessagesPage),
      },
      {
        path: 'blog',
        title: 'Blog – Zladovce administracija',
        loadComponent: () => import('./features/blog/blog-posts.page').then((m) => m.BlogPostsPage),
      },
      {
        path: 'blog/kategorije',
        title: 'Kategorije bloga – Zladovce administracija',
        loadComponent: () =>
          import('./features/blog/blog-categories.page').then((m) => m.BlogCategoriesPage),
      },
      {
        path: 'blog/nova',
        title: 'Nova objava – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/blog/blog-post-form.page').then((m) => m.BlogPostFormPage),
      },
      {
        path: 'blog/:id',
        title: 'Izmena objave – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/blog/blog-post-form.page').then((m) => m.BlogPostFormPage),
      },
      {
        path: 'sadrzaj',
        title: 'Sadržaj sajta – Zladovce administracija',
        loadComponent: () =>
          import('./features/content/cms-pages.page').then((m) => m.CmsPagesPage),
      },
      {
        path: 'sadrzaj/stranice/:key',
        title: 'Izmena stranice – Zladovce administracija',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/content/cms-page-form.page').then((m) => m.CmsPageFormPage),
      },
      {
        path: 'sadrzaj/pitanja',
        title: 'Česta pitanja – Zladovce administracija',
        loadComponent: () => import('./features/content/faq.page').then((m) => m.FaqPage),
      },
      {
        path: 'sadrzaj/utisci',
        title: 'Utisci kupaca – Zladovce administracija',
        loadComponent: () =>
          import('./features/content/testimonials.page').then((m) => m.TestimonialsPage),
      },
      {
        path: 'newsletter',
        title: 'Newsletter – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        loadComponent: () =>
          import('./features/newsletter/newsletter.page').then((m) => m.NewsletterPage),
      },
      {
        path: 'administratori',
        title: 'Administratori – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        loadComponent: () =>
          import('./features/admin-users/admin-users.page').then((m) => m.AdminUsersPage),
      },
      {
        path: 'dnevnik-izmena',
        title: 'Dnevnik izmena – Zladovce administracija',
        canActivate: [roleGuard('Owner')],
        loadComponent: () => import('./features/audit/audit-log.page').then((m) => m.AuditLogPage),
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
