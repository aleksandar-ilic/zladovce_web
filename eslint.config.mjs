// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

/**
 * Import boundaries (ARCHITECTURE.md A5):
 *  - apps/storefront never imports @zladovce/auth (nor Angular Material, which is admin only)
 *  - apps never import each other
 *  - libs never import apps
 *  - libraries are reached only through their public entry point @zladovce/<lib>
 */
const boundary = (group, message) => ({ group, message });

const noAppsFromLibs = boundary(['**/apps/**', '**/storefront/src/**', '**/admin/src/**'], 'Biblioteke ne smeju da uvoze aplikacije.');
const noDeepAliasImports = boundary(
  ['@zladovce/*/*'],
  'Biblioteke se uvoze samo preko javnog ulaza @zladovce/<lib>.',
);
const noRelativeLibImports = boundary(
  ['**/libs/**'],
  'Aplikacije uvoze biblioteke samo preko alijasa @zladovce/<lib>.',
);

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.angular/**',
      'node_modules/**',
      'coverage/**',
      'libs/models/src/generated/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['sf', 'adm', 'ui', 'auth'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: ['element', 'attribute'], prefix: ['sf', 'adm', 'ui'], style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['apps/storefront/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            boundary(
              ['@zladovce/auth', '@zladovce/auth/**', '**/libs/auth/**'],
              'Prodavnica ne sme da uvozi @zladovce/auth (samo administracija).',
            ),
            boundary(['**/apps/admin/**', '**/admin/src/**'], 'Aplikacije ne smeju da uvoze jedna drugu.'),
            boundary(
              ['@angular/material', '@angular/material/**'],
              'Angular Material se koristi samo u administraciji.',
            ),
            noDeepAliasImports,
            noRelativeLibImports,
          ],
        },
      ],
    },
  },
  {
    files: ['apps/admin/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            boundary(['**/apps/storefront/**', '**/storefront/src/**'], 'Aplikacije ne smeju da uvoze jedna drugu.'),
            noDeepAliasImports,
            noRelativeLibImports,
          ],
        },
      ],
    },
  },
  {
    // Only the admin app and libs/auth itself may depend on the auth library.
    files: ['libs/**/*.ts'],
    ignores: ['libs/auth/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            noAppsFromLibs,
            noDeepAliasImports,
            boundary(
              ['@zladovce/auth', '**/libs/auth/**', '**/auth/src/**'],
              'Samo administracija koristi @zladovce/auth.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['libs/auth/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noAppsFromLibs, noDeepAliasImports] }],
    },
  },
);
