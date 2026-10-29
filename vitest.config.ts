// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest.config.ts
 * @input Uses vitest/config, @vitejs/plugin-react
 * @output Vitest configuration with jsdom, coverage, test setup, and the two
 *   test projects (`ui`, `node`)
 * @position Root test config and the actual test entry point. The two projects
 *   under `test.projects` decide which files run where via their per-project
 *   include lists. The root-level `test` options (globals, environment,
 *   coverage, setupFiles, pool sizing) are inherited by projects that set
 *   `extends: true`; the `node` project deliberately does NOT extend, so it
 *   runs in a plain node environment without the jsdom/StyleX overhead.
 *
 *   (Migrated from the removed `vitest.workspace.ts` for Vitest 4, which
 *   dropped the standalone workspace file in favor of inline `test.projects`.)
 *
 * SYNC: When modified, update this header and root README.md
 */

import path from 'node:path';
import {configDefaults, defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import stylexResolution from './scripts/stylex-module-resolution.cjs';

const rootDir = path.resolve(__dirname, '.');
const coreSrc = path.resolve(__dirname, 'packages/core/src');

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            '@stylexjs/babel-plugin',
            {
              dev: true,
              enableDebugDataProp: false,
              runtimeInjection: true,
              genConditionalClasses: true,
              treeshakeCompensation: true,
              aliases: {
                '@astryxdesign/core/*': [
                  path.join(rootDir, 'packages/core/src/*'),
                ],
                '@astryxdesign/core': [path.join(rootDir, 'packages/core/src')],
              },
              unstable_moduleResolution:
                stylexResolution.stylexModuleResolution,
            },
          ],
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      // Map @astryxdesign/core subpath imports to source for lab package tests.
      // Must use regex to match subpaths like @astryxdesign/core/Dialog, @astryxdesign/core/theme/tokens.stylex
      // while not breaking core's own relative imports.
      {
        find: /^@astryxdesign\/core\/(.*)$/,
        replacement: path.join(coreSrc, '$1'),
      },
      // Map the bare specifier to source too (charts package tests import
      // runtime components like Text/VisuallyHidden from the package root).
      {
        find: /^@astryxdesign\/core$/,
        replacement: path.join(coreSrc, 'index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', '**/index.ts'],
    },
    setupFiles: ['./internal/test-utils/src/setup.ts'],
    globalSetup: ['./internal/test-utils/src/globalSetup.ts'],
    // Increase worker heap to prevent OOM crashes on memory-heavy test files
    // (e.g. Chat composer tests with contentEditable + popover portals in
    // jsdom). Vitest 4 removed `poolOptions`; per-worker argv is now top-level.
    execArgv: ['--max-old-space-size=4096'],
    // Test projects (migrated from vitest.workspace.ts). Partitioning rule
    // (nothing can fall through):
    //   - `ui`   = packages/core + packages/lab + packages/charts + packages/richtext
    //              + packages/vega — need jsdom, the StyleX babel
    //              transform, and the jest-dom setup; inherit all of that from
    //              the root config via `extends: true`.
    //   - `node` = everything else (CLI, build tooling, scripts, internal
    //              utils, and app-level suites that need no DOM) — no DOM, no
    //              StyleX/babel transform, no jest-dom
    //              matchers. Deliberately does NOT extend the root config so it
    //              runs in a plain node environment and skips the per-file jsdom
    //              instantiation that dominated these files' runtime. A new
    //              package lands in `node` by default; if its tests need the DOM
    //              they fail loudly there — move it into the `ui` include list.
    //
    // An app or package that carries its OWN vitest config is invisible to both
    // projects, so its tests belong to no CI job: `pnpm test` runs this file and
    // nothing else. Add the suite to an include list here instead of giving it a
    // second config to be run by.
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          // A jsdom component suite can cost ~1.8s p95 per test where a
          // comparable file costs ~80ms, so the 5s default leaves almost no
          // headroom: on a busy machine slow-but-correct runs flake
          // non-deterministically (every failure was "timed out in 5000ms",
          // never a wrong value). Same budget as `node`, for the same reason.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          include: [
            'packages/core/src/**/*.test.{ts,tsx,mjs}',
            'packages/lab/src/**/*.test.{ts,tsx,mjs}',
            'packages/charts/src/**/*.test.{ts,tsx,mjs}',
            'packages/richtext/src/**/*.test.{ts,tsx,mjs}',
            'packages/vega/src/**/*.test.{ts,tsx,mjs}',
          ],
        },
      },
      {
        // forks pool (vitest default) is required here: several CLI tests call
        // process.chdir(), which worker threads do not support.
        // This project does NOT extend the root config, so it carries its own
        // `resolve` — the root's aliases do not reach it.
        resolve: {
          alias: [
            // Theme packages resolve to `dist/`, which no test run builds. The
            // sandbox palette suite reads their palettes as a reference corpus,
            // so point the BARE specifier at the authored source. Subpath
            // imports (`/built`, `/theme.css`) are untouched and still need a
            // real build.
            {
              find: /^@astryxdesign\/theme-([a-z0-9-]+)$/,
              replacement: path.join(
                rootDir,
                'packages/themes/$1/src/source.ts',
              ),
            },
          ],
        },
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          // Prebuilt and plain-data modules load as Node loads them for the
          // CLI, not through Vite's transform, which would otherwise inline
          // every file: Core's built bundle (the workspace link resolves it
          // outside node_modules; the theme build imports its root entry, all
          // of Core and React: 0.9 s natively, 4.5 s inlined) and the
          // `.doc.mjs` documentation modules the docs catalog imports by the
          // hundred (doctor's first case: 0.7 s natively, 4.7 s inlined).
          // Both grow several times over on a loaded box. Mocks keep working
          // from inlined callers.
          server: {
            deps: {external: [/\/packages\/core\/dist\//, /\.doc\.mjs$/]},
          },
          // Several CLI suites spawn a fresh `node bin/astryx.mjs` per assertion
          // (real process boundary). Under the forks pool these cold-starts can
          // run long on a busy box; the 5s default testTimeout then flakes
          // non-deterministically (every failure was "timed out in 5000ms").
          // Give spawn-backed tests + their fixture hooks a real budget so a
          // slow-but-correct run never trips the timeout. (The other half of the
          // fix was removing a full `pnpm build` that scripts/build-css.test ran
          // in-suite, which hogged every core and starved these — see that file.)
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Build @astryxdesign/core once before workers fork. The build-theme
          // suites need a compiled core; doing it here (not per-suite in
          // parallel workers) avoids concurrent clean-and-build collisions that
          // flake under Vitest 4's reworked pool.
          globalSetup: ['./vitest.global-setup.node.mjs'],
          include: [
            'packages/**/src/**/*.test.{ts,tsx,mjs}',
            // The CLI dissolved its src/ wrapper (pillars live at the package
            // root), so collect its colocated tests wherever they now live.
            'packages/cli/**/*.test.{ts,tsx,mjs}',
            'internal/**/*.test.{ts,tsx,mjs}',
            'scripts/**/*.test.{ts,tsx,mjs}',
            '.github/scripts/**/*.test.{ts,tsx,mjs}',
            // Storybook config invariants (no DOM needed) — e.g. the
            // workspace source-alias guard in .storybook/main.test.ts.
            'apps/storybook/.storybook/**/*.test.{ts,tsx,mjs}',
            // Sandbox page logic (palette generation, colour maths) — pure
            // modules with no DOM, so they run here rather than in `ui`.
            'apps/sandbox/src/**/*.test.{ts,tsx,mjs}',
          ],
          exclude: [
            ...configDefaults.exclude,
            'packages/core/**',
            'packages/lab/**',
            'packages/charts/**',
            'packages/richtext/**',
            'packages/vega/**',
          ],
        },
      },
    ],
  },
});
