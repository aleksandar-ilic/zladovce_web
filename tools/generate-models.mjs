#!/usr/bin/env node
/**
 * Generates TypeScript types for the API contract from the backend OpenAPI document.
 * Not part of the build: run it by hand (npm run generate:models) after the backend
 * contract changes and commit the result.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The OpenAPI document lives in the API repository (zladovce_api/backend/openapi).
// ZLADOVCE_OPENAPI overrides the location; otherwise the two usual checkout layouts are tried.
const candidates = process.env.ZLADOVCE_OPENAPI
  ? [resolve(process.env.ZLADOVCE_OPENAPI)]
  : [
      resolve(root, '../zladovce_api/backend/openapi/zladovce-v1.json'), // repos cloned side by side
      resolve(root, '../backend/openapi/zladovce-v1.json'), // frontend/ inside the API checkout
    ];
const input = candidates.find((path) => existsSync(path));
const output = resolve(root, 'libs/models/src/generated/zladovce-v1.ts');
const generator = 'openapi-typescript@7';

if (!input) {
  console.error(
    [
      'generate:models: OpenAPI document not found. Looked in:',
      ...candidates.map((path) => `  ${path}`),
      '  Export it in the API repository (backend/scripts/generate-openapi.ps1),',
      '  or set ZLADOVCE_OPENAPI to its path, then run this script again.',
    ].join('\n'),
  );
  process.exit(1);
}

mkdirSync(dirname(output), { recursive: true });

// openapi-typescript is fetched on demand: its TypeScript peer range lags behind the
// version Angular requires, so it is intentionally not a workspace dependency.
const result = spawnSync(`npx --yes ${generator} "${input}" --output "${output}"`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error(`generate:models: ${generator} failed (exit code ${result.status ?? 'unknown'}).`);
  process.exit(result.status ?? 1);
}

console.log(`generate:models: wrote ${output}`);
