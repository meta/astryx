// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every bundled theme draws every shared icon name.
 *
 * `spec:AST-032` FR6: the default registry, each bundled theme, and each CLI
 * theme template supply `upload` artwork in their own style. `IconRegistry`
 * requires every shared `IconName`. This test verifies at runtime that every
 * bundled theme package exports a complete registry with no missing entries.
 * The CLI templates are byte-pinned copies of these sources
 * (`check-cli-theme-bundle.test.mjs`), so checking the packages covers both.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {defaultIcons} from '../packages/core/src/Icon/defaultIcons.tsx';
import {listThemeSlugs} from './generate-cli-themes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_ROOT = path.resolve(__dirname, '..', 'packages', 'themes');

// Namespaced extension keys (`numberInput:stepperDown`) are component-owned
// defaults, not shared names a theme registry is expected to draw.
const sharedIconNames = Object.keys(defaultIcons)
  .filter(name => !name.includes(':'))
  .sort();

async function loadIconRegistry(slug) {
  const module = await import(path.join(THEMES_ROOT, slug, 'src', 'icons.tsx'));
  const registries = Object.entries(module).filter(([name]) =>
    name.endsWith('IconRegistry'),
  );
  expect(registries, `${slug}/src/icons.tsx exports one registry`).toHaveLength(
    1,
  );
  return registries[0][1];
}

describe('bundled theme icon coverage', () => {
  const slugs = listThemeSlugs(THEMES_ROOT);

  it('finds the bundled themes and the shared names to check', () => {
    expect(slugs.length).toBeGreaterThan(0);
    expect(sharedIconNames).toContain('upload');
  });

  for (const slug of slugs) {
    it(`${slug} draws every shared icon name`, async () => {
      const registry = await loadIconRegistry(slug);
      const missing = sharedIconNames.filter(name => registry[name] == null);

      expect(missing).toEqual([]);
    });
  }
});
