// Copyright (c) Meta Platforms, Inc. and affiliates.

import {defineConfig} from 'eslint/config';
import {includeIgnoreFile} from '@eslint/compat';
import path from 'node:path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import reactCompiler from 'eslint-plugin-react-compiler';
import astryxPlugin from './internal/eslint-plugin-astryx/index.js';

/* global process */

/**
 * Astryx ESLint Configuration
 *
 * Two-tier linting philosophy:
 * - CI/Agents: Strict mode (errors) - Set ASTRYX_STRICT_LINT=1 or CI=true
 * - Humans: Recommended mode (warnings) - Default for local development
 *
 * Usage:
 *   pnpm lint                    # Human mode (warnings)
 *   ASTRYX_STRICT_LINT=1 pnpm lint  # Strict mode (errors)
 *   CI=true pnpm lint            # Also triggers strict mode
 */

const isStrictMode =
  process.env.ASTRYX_STRICT_LINT === '1' || process.env.CI === 'true';
const astryxConfig = isStrictMode
  ? astryxPlugin.configs.strict
  : astryxPlugin.configs.recommended;
const reactSeverity = isStrictMode ? 'error' : 'warn';

// The internal plugin is plain untyped JS (kept out of the lint/type surface),
// so its inferred shape doesn't satisfy ESLint's strict `Plugin` type. One
// localized assertion here keeps every `plugins` entry below type-checked.
const astryxEslintPlugin = /** @type {import('eslint').ESLint.Plugin} */ (
  /** @type {unknown} */ (astryxPlugin)
);

/**
 * Reuse a `.gitignore` as lint ignores, so generated and vendored files are
 * never linted. Without this, anything git ignores but that exists on disk
 * gets linted the moment you generate it — e.g. `apps/docsite/public/monaco`
 * (25MB of minified Monaco + the TS compiler, copied in by
 * `scripts/copy-vendor.mjs`) produced ~23.5k errors for anyone who had run
 * the docsite. CI never saw it: it lints a fresh checkout, where the
 * generated files don't exist yet.
 *
 * Patterns in a nested `.gitignore` are relative to that file, so each one
 * needs its directory as `basePath`.
 */
const gitignoreDirs = [
  'apps/docsite',
  'apps/sandbox',
  'apps/template-viewer',
  'internal/vibe-tests',
  'packages/build',
  'packages/cli',
];

const gitignores = [
  includeIgnoreFile(
    path.join(import.meta.dirname, '.gitignore'),
    'root .gitignore',
  ),
  ...gitignoreDirs.map(dir => ({
    basePath: dir,
    ...includeIgnoreFile(
      path.join(import.meta.dirname, dir, '.gitignore'),
      `${dir}/.gitignore`,
    ),
  })),
];

// typescript-eslint ≥8.62 types its presets with loose cross-version
// "compatibility" shapes (`CompatibleConfig` = `{name?, rules?: object}`);
// normalize back to ESLint's own config type for `defineConfig`.
const tseslintRecommended = /** @type {import('eslint').Linter.Config[]} */ (
  tseslint.configs.recommended
);

const ZOD_SEALED = {
  name: 'zod',
  message:
    'zod is sealed behind the authoring/ parsers. Validate at the load boundary (parseDoc/parseConfig/parseIntegration) and pass typed data inward.',
};

// Doc merging, section keys and token-reference linking belong to the doc
// compiler (packages/cli/foundation/doc-compiler). The import scan in its
// tests enforces the same list and also catches a dynamic import().
/** @param {string[]} [allowed] compiler functions the file may call */
const docCompilerOnly = (allowed = []) =>
  [
    {
      group: ['**/foundation/discovery/docs-discovery.mjs'],
      importNames: ['mergeTopic'],
    },
    {
      group: ['**/foundation/discovery/docs-section-key.mjs'],
      importNames: ['withSectionKeys'],
    },
    {
      group: ['**/foundation/doc-compiler/compile.mjs'],
      importNames: [
        'lowerReferenceTopic',
        'linkReferenceTopic',
        'linkReferenceSection',
        'lowerDoc',
      ].filter(name => !allowed.includes(name)),
    },
  ]
    .filter(pattern => pattern.importNames.length > 0)
    .map(pattern => ({
      ...pattern,
      message:
        'Doc merging, section keys and token-reference linking belong to the doc compiler. Read compiled nodes through api/docs/_adapter.mjs and foundation/doc-compiler/lenses.mjs.',
    }));

/** api/'s import rules, allowing the compiler functions one docs file calls. */
const apiImportRules = (/** @type {string[]} */ allowed = []) => [
  'error',
  {
    patterns: [
      {
        group: ['**/clients/**'],
        message:
          'api/ is the behavior source of truth and must not import clients/ (the CLI presentation layer). Return data in the { type, data } envelope and let the command handler render it.',
      },
      ...docCompilerOnly(allowed),
    ],
    paths: [ZOD_SEALED],
  },
];

export default defineConfig(
  js.configs.recommended,
  tseslintRecommended,
  ...gitignores,
  {
    ignores: [
      // dist/** and node_modules/** come from the .gitignore imports above.
      '.claude/**',
      '**/internal/eslint-plugin-astryx/**',
      '.github/scripts/**',
      'scripts/**',
      // Canonical consumer fixtures are validated and built in copied,
      // standalone sandboxes rather than linted as workspace source.
      'internal/vibe-tests/fixtures/**',
      // Changesets tooling (custom changelog module + config) is CommonJS
      // build/release glue, not shipped source — keep it out of the TS/ESM
      // lint pass (consistent with scripts/** above).
      '.changeset/**',
      // .mjs is ignored everywhere EXCEPT the CLI package, whose runtime is
      // entirely .mjs. The negations below opt packages/cli back into linting
      // (see the dedicated CLI block lower down). Scoped to packages/cli on
      // purpose — other packages' .mjs stay unlinted (#2468).
      '**/*.mjs',
      '!packages/cli/api/**/*.mjs',
      '!packages/cli/clients/cli/**/*.mjs',
      '!packages/cli/assets/codemods/**/*.mjs',
      '!packages/cli/authoring/**/*.mjs',
      '!packages/cli/lib/**/*.mjs',
      '!packages/cli/utils/**/*.mjs',
      '!packages/cli/foundation/**/*.mjs',
      '!packages/cli/clients/cli/bin/**/*.mjs',
      '**/*.test-violations.tsx',
      'apps/example-nextjs/*.js',
      // Generated declaration files (e.g. the CLI's `./api` type surface emitted
      // from JSDoc by `sync:api-types` at prepack). Like `**/*.d.ts`, these are
      // build artifacts — not hand-authored source to lint.
      '**/*.d.mts',
      '**/next-env.d.ts',
      '**/.next/**',
      'apps/example-nextjs-source/*.js',
      'apps/docsite/*.js',
      'apps/docsite/scripts/**',
      'apps/sandbox/*.js',
      'apps/sandbox/out/**',
      'packages/build/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': ['warn', {allow: ['warn', 'error']}],
      curly: 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {fixStyle: 'inline-type-imports'},
      ],
    },
  },
  // Type-aware linting for core. Keep this scoped: projectService has a
  // measurable startup cost, but catches async correctness issues syntax-only
  // lint cannot see.
  {
    files: ['packages/core/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/array-type': [
        reactSeverity,
        {default: 'array', readonly: 'generic'},
      ],
      '@typescript-eslint/await-thenable': reactSeverity,
      '@typescript-eslint/no-array-delete': reactSeverity,
      '@typescript-eslint/no-base-to-string': reactSeverity,
      '@typescript-eslint/no-duplicate-type-constituents': reactSeverity,
      '@typescript-eslint/no-dynamic-delete': reactSeverity,
      '@typescript-eslint/no-floating-promises': reactSeverity,
      '@typescript-eslint/no-for-in-array': reactSeverity,
      '@typescript-eslint/no-implied-eval': reactSeverity,
      '@typescript-eslint/no-import-type-side-effects': reactSeverity,
      '@typescript-eslint/no-invalid-void-type': reactSeverity,
      '@typescript-eslint/no-misused-promises': reactSeverity,
      '@typescript-eslint/no-unnecessary-type-conversion': reactSeverity,
      '@typescript-eslint/no-unnecessary-type-assertion': reactSeverity,
      '@typescript-eslint/no-useless-default-assignment': reactSeverity,
      '@typescript-eslint/no-redeclare': reactSeverity,
      '@typescript-eslint/only-throw-error': reactSeverity,
      '@typescript-eslint/prefer-includes': reactSeverity,
      '@typescript-eslint/prefer-string-starts-ends-with': reactSeverity,
      '@typescript-eslint/promise-function-async': [
        reactSeverity,
        {allowAny: false},
      ],
      '@typescript-eslint/require-array-sort-compare': reactSeverity,
      '@typescript-eslint/restrict-plus-operands': reactSeverity,
      '@typescript-eslint/restrict-template-expressions': reactSeverity,
      '@typescript-eslint/return-await': reactSeverity,
      '@typescript-eslint/switch-exhaustiveness-check': reactSeverity,
    },
  },
  // Core's internal subpaths (`@astryxdesign/core/internal/*`) and its
  // gesture, motion and touch-support source are for Core and Lab only.
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['packages/core/**', 'packages/lab/**', '**/dist/**'],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/no-core-internal-import': 'error',
    },
  },
  // Copyright header — all source files must have the Meta copyright notice
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', '**/dist/**'],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/copyright-header': 'error',
    },
  },
  // Table rows must sit inside a table section. `<table>` cannot contain a
  // `<tr>` directly: the HTML parser inserts an implied `<tbody>` when it
  // parses server-rendered markup and React does not when it renders on the
  // client, so the two trees mismatch on hydration (#5277). Repo-wide, not
  // core-only — the shape reached a shipped CLI page template, which consumers
  // copy into their own apps, and the @eslint-react DOM rules below are scoped
  // to packages/core/src.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', '**/dist/**'],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/require-table-section': 'error',
    },
  },
  // Locale-sensitive formatting in shipped packages must go through the
  // provider-aware locale utilities, never raw Intl — see the rule's own doc
  // comment and internal/eslint-plugin-astryx/README.md for the approved
  // infrastructure boundary. Lab adopts this gate when a component graduates.
  {
    files: [
      'packages/core/src/**/*.{ts,tsx}',
      'packages/charts/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
      'packages/vega/src/**/*.{ts,tsx}',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/no-raw-intl-locale': 'error',
    },
  },
  // Astryx design token enforcement - applies to core package (excluding theme files)
  {
    files: [
      'packages/core/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
    ],
    ignores: ['packages/core/src/theme/**'],
    ...astryxConfig,
    rules: {
      ...astryxConfig.rules,
      // Temporarily allow Children.* in files that need architectural fixes.
      // Tracked: OverflowList, MetadataList, Carousel need data-driven APIs.
      '@astryx/no-react-introspection': [
        'error',
        {
          allowFiles: [
            'OverflowList/OverflowList',
            'MetadataList/MetadataList',
            'Carousel/Carousel',
          ],
        },
      ],
      // announce() live-region messages are user-facing text; the rule checks
      // them as call arguments (callees defaults to ['announce']).
      '@astryx/no-hardcoded-i18n-string': isStrictMode ? 'error' : 'warn',
    },
  },
  // Temporary relationship-only exemption for the three known coarse-pointer
  // centering defects. Every other no-physical-properties check remains active.
  // Remove this block when #5170 lands.
  {
    files: [
      'packages/core/src/CheckboxInput/CheckboxInput.tsx',
      'packages/core/src/RadioList/RadioListItem.tsx',
      'packages/core/src/Switch/Switch.tsx',
    ],
    rules: {
      '@astryx/no-physical-properties': [
        'error',
        {allowLogicalCentering: true},
      ],
    },
  },
  // What a disabled control says to the pointer is a defect wherever it
  // ships, so these two rules reach past core: lab components are consumed
  // the same way, and lab is where the next core component comes from.
  {
    files: [
      'packages/lab/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/no-hover-on-disabled': 'error',
      '@astryx/disabled-cursor': 'error',
    },
  },
  // `light-dark()` is the theme layer's mechanism, and reaches lab for the
  // same reason the two rules above do: a component that hardcodes a
  // light/dark decision is unreachable by every theme, and lab is where the
  // next core component comes from. Core is covered by the token-enforcement
  // block above (which already excludes `packages/core/src/theme/**`) and is
  // clean, so it errors there. Lab warns for now: LogStream's `levelWarn`/
  // `levelError` are a WCAG contrast fix written per scheme, and moving them
  // to the theme layer means deciding which contrast-tuned status-text token
  // they should read — a token decision, not a mechanical one. Flip to
  // 'error' once that lands.
  {
    files: [
      'packages/lab/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/no-light-dark-outside-theme': 'warn',
    },
  },
  // A colour written into a component is the colour every theme gets — a theme
  // can retint any token a component reads, but it cannot reach inside a
  // literal. Core is covered by the token-enforcement block above (which
  // already excludes packages/core/src/theme/**); this reaches the other
  // packages that ship component styling, for the same reason the rules above
  // do. Warn everywhere for now: the 23 violations on main are 20 in lab
  // (LogStream's console palette, Sankey's var() fallbacks), 2 in core and 1
  // in charts, and each wants a token decision rather than a mechanical
  // substitution. Promote to 'error' per package as each reaches zero.
  {
    files: [
      'packages/lab/src/**/*.{ts,tsx}',
      'packages/charts/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
      'packages/vega/src/**/*.{ts,tsx}',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/no-raw-color': 'warn',
    },
  },
  // The i18n runtime itself defines the message strings the rest of the
  // package resolves against; a "hardcoded string" check against it would be
  // circular. Turn off @astryx/no-hardcoded-i18n-string just for this dir.
  {
    files: ['packages/core/src/i18n/**/*.{ts,tsx}'],
    rules: {
      '@astryx/no-hardcoded-i18n-string': 'off',
    },
  },
  // React bug-prevention rules - applies to core package
  // Uses @eslint-react for bugs that TypeScript alone cannot catch.
  // Children.*/cloneElement are already covered by @astryx/no-react-introspection.
  {
    files: [
      'packages/core/src/**/*.{ts,tsx}',
      'packages/richtext/src/**/*.{ts,tsx}',
    ],
    plugins: {
      ...eslintReact.configs.recommended.plugins,
      'react-compiler': reactCompiler,
    },
    rules: {
      // React Compiler compatibility
      'react-compiler/react-compiler': reactSeverity,
      // React fundamentals
      '@eslint-react/rules-of-hooks': reactSeverity,
      '@eslint-react/purity': reactSeverity,
      '@eslint-react/unsupported-syntax': reactSeverity,
      '@eslint-react/exhaustive-deps': reactSeverity,

      // Component structure bugs
      '@eslint-react/no-nested-component-definitions': reactSeverity,
      '@eslint-react/no-nested-lazy-component-declarations': reactSeverity,
      '@eslint-react/no-unstable-default-props': reactSeverity,
      '@eslint-react/no-unstable-context-value': reactSeverity,
      '@eslint-react/set-state-in-effect': reactSeverity,
      '@eslint-react/set-state-in-render': reactSeverity,
      '@eslint-react/no-missing-component-display-name': reactSeverity,

      // Hooks
      '@eslint-react/use-memo': reactSeverity,
      '@eslint-react/no-unnecessary-use-prefix': reactSeverity,
      '@eslint-react/no-create-ref': reactSeverity,
      '@eslint-react/no-forward-ref': reactSeverity,
      '@eslint-react/no-unused-state': reactSeverity,

      // DOM correctness
      '@eslint-react/dom-no-missing-button-type': reactSeverity,
      '@eslint-react/dom-no-missing-iframe-sandbox': reactSeverity,
      '@eslint-react/dom-no-void-elements-with-children': reactSeverity,
      '@eslint-react/dom-no-dangerously-set-innerhtml': reactSeverity,
      '@eslint-react/dom-no-dangerously-set-innerhtml-with-children':
        reactSeverity,
      '@eslint-react/dom-no-find-dom-node': reactSeverity,
      '@eslint-react/dom-no-flush-sync': reactSeverity,
      '@eslint-react/dom-no-script-url': reactSeverity,
      '@eslint-react/dom-no-string-style-prop': reactSeverity,
      '@eslint-react/dom-no-unsafe-target-blank': reactSeverity,
      '@eslint-react/dom-no-unknown-property': reactSeverity,

      // JSX correctness
      '@eslint-react/no-missing-key': reactSeverity,
      '@eslint-react/no-array-index-key': reactSeverity,
      '@eslint-react/jsx-no-comment-textnodes': reactSeverity,
      '@eslint-react/jsx-no-leaked-dollar': reactSeverity,
      '@eslint-react/jsx-no-children-prop': reactSeverity,
      '@eslint-react/jsx-no-children-prop-with-children': reactSeverity,
      '@eslint-react/jsx-no-key-after-spread': reactSeverity,
      '@eslint-react/jsx-no-leaked-semicolon': reactSeverity,
      '@eslint-react/jsx-no-useless-fragment': reactSeverity,

      // Naming conventions
      '@eslint-react/naming-convention-context-name': reactSeverity,
      '@eslint-react/naming-convention-ref-name': reactSeverity,

      // React 19 modernization
      '@eslint-react/no-context-provider': reactSeverity,
      '@eslint-react/no-use-context': reactSeverity,
      '@eslint-react/no-missing-context-display-name': reactSeverity,

      // Resource leak prevention
      '@eslint-react/web-api-no-leaked-event-listener': reactSeverity,
      '@eslint-react/web-api-no-leaked-interval': reactSeverity,
      '@eslint-react/web-api-no-leaked-timeout': reactSeverity,
      '@eslint-react/web-api-no-leaked-resize-observer': reactSeverity,
      '@eslint-react/web-api-no-leaked-fetch': reactSeverity,
    },
  },
  // App preview surfaces may embed local pages, but every iframe must be sandboxed.
  {
    files: ['apps/docsite/**/*.{ts,tsx}', 'apps/sandbox/**/*.{ts,tsx}'],
    plugins: {
      ...eslintReact.configs.recommended.plugins,
    },
    rules: {
      '@eslint-react/dom-no-missing-iframe-sandbox': reactSeverity,
    },
  },
  // Browser documentation/demo surfaces should avoid unsafe new-tab links.
  {
    files: [
      'apps/docsite/**/*.{ts,tsx}',
      'apps/sandbox/**/*.{ts,tsx}',
      'apps/storybook/**/*.{ts,tsx}',
    ],
    plugins: {
      ...eslintReact.configs.recommended.plugins,
    },
    rules: {
      '@eslint-react/dom-no-unsafe-target-blank': reactSeverity,
    },
  },
  // Test files — relax rules for test ergonomics (must be after React rules
  // block so it overrides react-compiler/react-compiler)
  {
    files: ['**/*.test.{ts,tsx}', '**/*.perf.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      'react-compiler/react-compiler': 'off',
      // Test harnesses wrap components in sized/positioned <div>s to set up a
      // scenario; that scaffolding is not shipped DOM.
      '@astryx/no-style-only-wrapper': 'off',
      // Reading `.type` off a rendered element is how a test asserts which
      // component a renderer chose. The rule exists to stop *shipped* code
      // branching on child identity; a test making that assertion is the
      // point, and has no data-driven API to prefer instead.
      '@astryx/no-react-introspection': 'off',
    },
  },
  // Non-production code — allow console.log for demos, tools, and examples
  {
    files: [
      'apps/storybook/stories/**/*.{ts,tsx}',
      'apps/docsite/src/generated/**/*.{ts,tsx}',
      'apps/sandbox/**/*.{ts,tsx}',
      'apps/example-*/**/*.{ts,tsx}',
      'internal/**/*.{ts,tsx}',
      'packages/cli/assets/templates/**/*.{ts,tsx}',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // CLI runtime (.mjs). The CLI ships as ESM Node modules and was never linted
  // (the global **/*.mjs ignore swallowed it; see #2468). This block gives the
  // .mjs sources a Node language environment and enforces the JSON-stdout
  // contract (#2467) at author time via @astryx/no-raw-console-cli.
  {
    files: [
      'packages/cli/api/**/*.mjs',
      'packages/cli/clients/cli/**/*.mjs',
      'packages/cli/assets/codemods/**/*.mjs',
      'packages/cli/authoring/**/*.mjs',
      'packages/cli/lib/**/*.mjs',
      'packages/cli/utils/**/*.mjs',
      'packages/cli/foundation/**/*.mjs',
      'packages/cli/clients/cli/bin/**/*.mjs',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    languageOptions: {
      sourceType: 'module',
      globals: {
        // Node globals (no `globals` package dependency in this repo).
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        queueMicrotask: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        structuredClone: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        ReadableStream: 'readonly',
        DOMException: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Bare console.log corrupts --json stdout. Route human chatter through
      // humanLog(); console.error/console.warn (stderr) stay allowed.
      '@astryx/no-raw-console-cli': 'error',
    },
  },
  // Copyright header for CLI .mjs sources (the main copyright block only
  // covers .ts/.tsx).
  {
    files: [
      'packages/cli/api/**/*.mjs',
      'packages/cli/clients/cli/**/*.mjs',
      'packages/cli/assets/codemods/**/*.mjs',
      'packages/cli/authoring/**/*.mjs',
      'packages/cli/lib/**/*.mjs',
      'packages/cli/utils/**/*.mjs',
      'packages/cli/foundation/**/*.mjs',
      'packages/cli/clients/cli/bin/**/*.mjs',
    ],
    plugins: {
      '@astryx': astryxEslintPlugin,
    },
    rules: {
      '@astryx/copyright-header': 'error',
    },
  },
  // ── CLI architecture invariants ────────────────────────────────────────
  // Enforces the layering documented in CONTRIBUTING > "Working on the astryx
  // CLI". Every rule below is already clean across packages/cli, so they are
  // errors: they exist to prevent regressions, not to flag a backlog.
  //
  // NOTE: flat config *overrides* (does not merge) a same-named rule, so the
  // `no-restricted-imports` blocks are kept disjoint — one per layer.

  // authoring/ is pure data contracts + sealed parsers: it sits below every
  // other layer and imports none of them.
  {
    files: ['packages/cli/authoring/**/*.mjs'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/**', '**/clients/**', '**/foundation/**'],
              message:
                'authoring/ is pure data contracts (types + sealed parsers) and must not import api/, clients/, or foundation/. Move shared behavior down into the contract, or invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  // api/ is the behavior source of truth — it must never reach up into the
  // CLI presentation layer (that's what keeps `astryx --json` and the imported
  // function returning identical data). It reads docs only as compiled nodes.
  {
    files: ['packages/cli/api/**/*.mjs'],
    rules: {'no-restricted-imports': apiImportRules()},
  },
  // The docs adapter and leaves are the only files that drive the doc
  // compiler. These overlap the api/ block on purpose: each repeats its rules
  // and allows only the compiler functions that file calls.
  {
    files: ['packages/cli/api/docs/_adapter.mjs'],
    rules: {
      'no-restricted-imports': apiImportRules([
        'lowerReferenceTopic',
        'linkReferenceTopic',
      ]),
    },
  },
  {
    files: ['packages/cli/api/docs/detail/detail.mjs'],
    rules: {'no-restricted-imports': apiImportRules(['linkReferenceTopic'])},
  },
  {
    files: ['packages/cli/api/docs/detail/section/section.mjs'],
    rules: {'no-restricted-imports': apiImportRules(['linkReferenceSection'])},
  },
  // Everything above the contracts consumes already-parsed, typed data.
  {
    files: ['packages/cli/clients/**/*.mjs'],
    rules: {
      'no-restricted-imports': [
        'error',
        {patterns: docCompilerOnly(), paths: [ZOD_SEALED]},
      ],
    },
  },
  // foundation/ is the bottom layer: cross-cutting infra that the layers above
  // build on. It must not reach back up into api/ or clients/. (It briefly did:
  // Project pulled template discovery out of api/template, whose adapter then
  // imported Project back — a cycle across the layer boundary. The adapter and
  // the contribution validators now live in foundation, where their callers are.)
  {
    files: ['packages/cli/foundation/**/*.mjs'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/**', '**/clients/**'],
              message:
                'foundation/ is the bottom layer and must not import api/ or clients/. If foundation needs it, it belongs in foundation — move it down rather than reaching up.',
            },
          ],
          paths: [
            {
              name: 'zod',
              message:
                'zod is sealed behind the authoring/ parsers. Validate at the load boundary (parseDoc/parseConfig/parseIntegration) and pass typed data inward.',
            },
          ],
        },
      ],
    },
  },
  // A command's --help and its manifest entry are generated from its colocated
  // CommandDoc via defineCommand. Registering straight onto Commander bypasses
  // the doc, so the docs silently stop describing the real CLI.
  {
    files: ['packages/cli/clients/cli/commands/**/*.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='command']",
          message:
            'Register commands with defineCommand(parent, doc, {fn, action}) so --help and the manifest come from the colocated CommandDoc. See CONTRIBUTING > Working on the astryx CLI.',
        },
      ],
    },
  },
  // ── INV23 + FR3: text-layout bans in command handlers ───────────────
  // Handlers must use the formatter kit (section, text, list, record,
  // records, code) rather than string padding or manual layout.
  // Extends the Commander-registration ban to the same file scope.
  {
    files: ['packages/cli/clients/cli/commands/**/*.mjs'],
    ignores: ['**/*.test.mjs', '**/*.doc.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='command']",
          message:
            'Register commands with defineCommand(parent, doc, {fn, action}) so --help and the manifest come from the colocated CommandDoc. See CONTRIBUTING > Working on the astryx CLI.',
        },
        {
          selector: "CallExpression[callee.property.name='padEnd']",
          message:
            'Use the formatter kit — record(), records({layout: "inline"}), list() — not .padEnd() (INV23, FR3). See architecture:cli-surface.',
        },
        {
          selector: "CallExpression[callee.property.name='padStart']",
          message:
            'Use the formatter kit — record(), records({layout: "inline"}), list() — not .padStart() (INV23, FR3). See architecture:cli-surface.',
        },
        {
          selector: "CallExpression[callee.property.name='repeat']",
          message:
            'Use the formatter kit — section(), text(), code() — not .repeat() for layout (INV23, FR3). See architecture:cli-surface.',
        },
        {
          selector: "NewExpression[callee.name='Block']",
          message:
            'Use the formatter kit constructors — section(), text(), list(), record(), records(), code() — not new Block() (INV23, FR3). See architecture:cli-surface.',
        },
      ],
    },
  },
  // Known gaps recorded in AST-042; remove an entry when the file is
  // fixed; do not add entries. check-cli-structure.mjs enforces the
  // exact-entry allowlist so a new text-layout violation in these files
  // still fails there.
  {
    files: [
      'packages/cli/clients/cli/commands/theme.mjs',
      'packages/cli/clients/cli/commands/docs.mjs',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='command']",
          message:
            'Register commands with defineCommand(parent, doc, {fn, action}) so --help and the manifest come from the colocated CommandDoc. See CONTRIBUTING > Working on the astryx CLI.',
        },
      ],
    },
  },
  // CLI tests — relax author-ergonomics rules (test files emit freely and may
  // keep intentionally-unused fixtures). Must come after the CLI block above.
  {
    files: ['packages/cli/**/*.test.mjs'],
    rules: {
      '@astryx/no-raw-console-cli': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Tests build fixtures directly against zod and Commander.
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  // richtext — the pre-existing backlog, held at `warn` while it is worked
  // off. Must come last so it overrides the blocks above.
  //
  // The package was outside these rules until now, so turning them on finds
  // drift that predates this scope change: four props missing `ref` and six
  // smaller API-shape items. Failing CI on work nobody has had the chance to
  // do would mean either reverting the scope or
  // landing a very large mixed change, so each one stays visible as a warning
  // and is tracked separately. Everything the package is ALREADY clean on —
  // the token and DOM rules, `no-classname-clobber`, `no-physical-properties`,
  // `disabled-cursor`, the rest of the React set — is enforced at full
  // strength, so new drift is an error from today.
  //
  // Remove an entry here as its backlog closes; the file is clean when the
  // block is empty.
  {
    files: ['packages/richtext/src/**/*.{ts,tsx}'],
    rules: {
      // React 19 ref-in-props migration for the editor's public props.
      '@astryx/require-ref-prop': 'warn',
      '@eslint-react/no-forward-ref': 'warn',
      '@eslint-react/naming-convention-ref-name': 'warn',
      // Public API shape, settled with the package's stable-API decision.
      '@astryx/require-base-props': 'warn',
      '@astryx/boolean-prop-naming': 'warn',
      '@eslint-react/no-unstable-default-props': 'warn',
    },
  },
);
