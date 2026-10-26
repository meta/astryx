#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sync-exports.js
 * @description Auto-generates the "exports" map in packages/core/package.json
 *   from the source tree. Ensures every component with src/Component/index.ts
 *   has correct export entries with source, types, and default conditions.
 *
 * Usage:
 *   node scripts/sync-exports.js          # Update package.json in place
 *   node scripts/sync-exports.js --check  # Exit 1 if package.json is stale
 *
 * The "source" export condition follows the convention used by Parcel, webpack,
 * and other bundlers for pointing to unbuilt TypeScript source files. This
 * enables monorepo consumers to resolve imports to source without post-import
 * transforms.
 *
 * Condition ordering matters — Node.js resolves top-to-bottom:
 *   1. "source"  — for bundlers configured with the "source" condition
 *   2. "types"   — for TypeScript
 *   3. "default" — for all JS consumers (ESM-only)
 */

const fs = require('node:fs');
const path = require('node:path');

const CORE_DIR = path.resolve(__dirname, '..', 'packages', 'core');
const SRC_DIR = path.join(CORE_DIR, 'src');
const PKG_PATH = path.join(CORE_DIR, 'package.json');

const CHECK_MODE = process.argv.includes('--check');

/**
 * Directories that are exported as subpath modules but aren't components.
 * These use the same pattern (source/types/import/require) but are listed
 * separately for clarity.
 */
const UTILITY_DIRS = new Set(['hooks', 'theme', 'utils']);

/**
 * Internal directories that have an index.ts but should NOT be
 * publicly exported. These are shared implementation details
 * consumed by other components via relative imports.
 */
const INTERNAL_DIRS = new Set(['NavItem']);

/**
 * Additional exports that can't be auto-discovered from directory structure.
 * These are maintained manually here as the single source of truth.
 */
const STATIC_EXPORTS = {
  './reset.css': {
    types: './src/reset.css.d.ts',
    default: './src/reset.css',
  },
  './astryx.css': {
    types: './src/astryx.css.d.ts',
    default: './dist/astryx.css',
  },
  './tailwind-theme.css': {
    types: './src/tailwind-theme.css.d.ts',
    default: './src/tailwind-theme.css',
  },
  './BaseProps': {
    source: './src/BaseProps.ts',
    types: './dist/BaseProps.d.ts',
    default: './dist/BaseProps.js',
  },
  './naming': {
    source: './src/naming.ts',
    types: './dist/naming.d.ts',
    default: './dist/naming.js',
  },
  './theme/tokens': {
    source: './src/theme/tokens.ts',
    types: './dist/theme/tokens.d.ts',
    default: './dist/theme/tokens.js',
  },
  './theme/tokens.stylex': {
    source: './src/theme/tokens.stylex.ts',
    types: './dist/theme/tokens.stylex.d.ts',
    default: './dist/theme/tokens.stylex.js',
  },
  './theme/dataTokens.stylex': {
    source: './src/theme/dataTokens.stylex.ts',
    types: './dist/theme/dataTokens.stylex.d.ts',
    default: './dist/theme/dataTokens.stylex.js',
  },
  './theme/syntax': {
    source: './src/theme/syntax/index.ts',
    types: './dist/theme/syntax/index.d.ts',
    default: './dist/theme/syntax/index.js',
  },
  // Cross-directory .stylex modules that swizzled components import. Each is
  // an explicit public subpath so the StyleX compiler can resolve the deep
  // import rewriteImports emits (see api/swizzle/copy/copy.mjs). No wildcard —
  // a future cross-directory .stylex import needs a deliberate entry here.
  // Precedent: ./theme/tokens.stylex and ./theme/dataTokens.stylex above.
  './DateInput/tokens.stylex': {
    source: './src/DateInput/tokens.stylex.ts',
    types: './dist/DateInput/tokens.stylex.d.ts',
    default: './dist/DateInput/tokens.stylex.js',
  },
  './Icon/IconSize.stylex': {
    source: './src/Icon/IconSize.stylex.ts',
    types: './dist/Icon/IconSize.stylex.d.ts',
    default: './dist/Icon/IconSize.stylex.js',
  },
  './Indicator/indicator.markers.stylex': {
    source: './src/Indicator/indicator.markers.stylex.ts',
    types: './dist/Indicator/indicator.markers.stylex.d.ts',
    default: './dist/Indicator/indicator.markers.stylex.js',
  },
  './Layer/layerAnimations.stylex': {
    source: './src/Layer/layerAnimations.stylex.ts',
    types: './dist/Layer/layerAnimations.stylex.d.ts',
    default: './dist/Layer/layerAnimations.stylex.js',
  },
  './Layer/layerTextReset.stylex': {
    source: './src/Layer/layerTextReset.stylex.ts',
    types: './dist/Layer/layerTextReset.stylex.d.ts',
    default: './dist/Layer/layerTextReset.stylex.js',
  },
  './Layer/layerViewportInset.stylex': {
    source: './src/Layer/layerViewportInset.stylex.ts',
    types: './dist/Layer/layerViewportInset.stylex.d.ts',
    default: './dist/Layer/layerViewportInset.stylex.js',
  },
  './Layout/container.stylex': {
    source: './src/Layout/container.stylex.ts',
    types: './dist/Layout/container.stylex.d.ts',
    default: './dist/Layout/container.stylex.js',
  },
  './Layout/edgeCompensation.stylex': {
    source: './src/Layout/edgeCompensation.stylex.ts',
    types: './dist/Layout/edgeCompensation.stylex.d.ts',
    default: './dist/Layout/edgeCompensation.stylex.js',
  },
  './Layout/padding.stylex': {
    source: './src/Layout/padding.stylex.ts',
    types: './dist/Layout/padding.stylex.d.ts',
    default: './dist/Layout/padding.stylex.js',
  },
  './NavItem/navItemStyles.stylex': {
    source: './src/NavItem/navItemStyles.stylex.ts',
    types: './dist/NavItem/navItemStyles.stylex.d.ts',
    default: './dist/NavItem/navItemStyles.stylex.js',
  },
  './Selector/selectorPresentation.stylex': {
    source: './src/Selector/selectorPresentation.stylex.ts',
    types: './dist/Selector/selectorPresentation.stylex.d.ts',
    default: './dist/Selector/selectorPresentation.stylex.js',
  },
  './Stack/stack.stylex': {
    source: './src/Stack/stack.stylex.ts',
    types: './dist/Stack/stack.stylex.d.ts',
    default: './dist/Stack/stack.stylex.js',
  },
  './Stack/stackItem.stylex': {
    source: './src/Stack/stackItem.stylex.ts',
    types: './dist/Stack/stackItem.stylex.d.ts',
    default: './dist/Stack/stackItem.stylex.js',
  },
  './Text/text.stylex': {
    source: './src/Text/text.stylex.ts',
    types: './dist/Text/text.stylex.d.ts',
    default: './dist/Text/text.stylex.js',
  },
  './utils/focusOutline.stylex': {
    source: './src/utils/focusOutline.stylex.ts',
    types: './dist/utils/focusOutline.stylex.d.ts',
    default: './dist/utils/focusOutline.stylex.js',
  },
  './utils/interactionOverlay.stylex': {
    source: './src/utils/interactionOverlay.stylex.ts',
    types: './dist/utils/interactionOverlay.stylex.d.ts',
    default: './dist/utils/interactionOverlay.stylex.js',
  },
  './docs.mjs': './docs.mjs',
  './groups.doc.mjs': './groups.doc.mjs',
  // Rich authoring catalogs keep their existing JSON paths. Generated string
  // maps are additive runtime imports for applications that want no translator
  // metadata in their bundles.
  './locales/*.json': './locales/*.json',
  './locales/*.generated.js': {
    source: './src/i18n/generated-locales/*.generated.ts',
    types: './dist/i18n/generated-locales/*.generated.d.ts',
    default: './dist/i18n/generated-locales/*.generated.js',
  },
};

/**
 * Nested modules backed by an index.ts entry point. `Markdown/plugin-renderer`
 * is client-only (its entry starts with 'use client'); the plugin protocol and
 * parser entries stay server-safe (spec:AST-064 DEC-6).
 */
const DIRECTORY_MODULE_SUBPATH_EXPORTS = [
  'Markdown/plugins',
  'Markdown/plugin-renderer',
  'Markdown/parser',
];

const UTIL_SUBPATH_DIRS = [
  'Calendar',
  'Markdown',
  'PowerSearch',
  'Resizable',
  'Selector',
  'Table',
  'Typeahead',
];

/**
 * Optional module subpath exports.
 *
 * Separately imported modules that deliberately stay out of their component's
 * own entry point, so a bundle that never imports the subpath never pulls the
 * module in. Unlike `UTIL_SUBPATH_DIRS` these are not server-safe re-exports
 * of an existing component — each one is its own opt-in module.
 *
 * `Markdown/remark` is the limited Remark compatibility adapter
 * (`module:Markdown/remark`, `spec:AST-036` FR24).
 */
const FILE_MODULE_SUBPATH_EXPORTS = [
  // One opt-in module per CodeBlock language (`component:CodeBlock` FR13).
  'CodeBlock/languages/dockerfile',
  'CodeBlock/languages/graphql',
  'CodeBlock/languages/java',
  'CodeBlock/languages/lua',
  'CodeBlock/languages/objective-c',
  'CodeBlock/languages/powershell',
  'CodeBlock/languages/ruby',
  'CodeBlock/languages/thrift',
  'CodeBlock/languages/toml',
  'Markdown/remark',
];

/**
 * Discover all exportable directories under src/.
 * A directory is exportable if it contains an index.ts file.
 */
function discoverExportDirs() {
  const entries = fs.readdirSync(SRC_DIR, {withFileTypes: true});
  const dirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (INTERNAL_DIRS.has(entry.name)) continue;

    const indexPath = path.join(SRC_DIR, entry.name, 'index.ts');
    if (fs.existsSync(indexPath)) {
      dirs.push(entry.name);
    }
  }

  return dirs.sort();
}

/**
 * Generate the export entry for a directory.
 * Condition order: source → types → default
 */
function makeExportEntry(dirName) {
  return {
    source: `./src/${dirName}/index.ts`,
    types: `./dist/${dirName}/index.d.ts`,
    default: `./dist/${dirName}/index.js`,
  };
}

/**
 * Build the complete exports map.
 */
function buildExports() {
  const exports = {};

  // Root export
  exports['.'] = {
    source: './src/index.ts',
    types: './dist/index.d.ts',
    default: './dist/index.js',
  };

  // Static exports (CSS, markdown, etc.)
  for (const [key, value] of Object.entries(STATIC_EXPORTS)) {
    exports[key] = value;
  }

  // Auto-discovered directories
  const dirs = discoverExportDirs();
  for (const dir of dirs) {
    const key = `./${dir}`;
    // Skip if already covered by static exports
    if (exports[key]) continue;
    exports[key] = makeExportEntry(dir);
  }

  // Explicit nested module entry points.
  for (const modulePath of DIRECTORY_MODULE_SUBPATH_EXPORTS) {
    exports[`./${modulePath}`] = {
      source: `./src/${modulePath}/index.ts`,
      types: `./dist/${modulePath}/index.d.ts`,
      default: `./dist/${modulePath}/index.js`,
    };
  }

  // Server-safe utility subpath exports
  for (const dir of UTIL_SUBPATH_DIRS) {
    exports[`./${dir}/utils`] = {
      source: `./src/${dir}/utils.ts`,
      types: `./dist/${dir}/utils.d.ts`,
      default: `./dist/${dir}/utils.js`,
    };
  }

  // Optional, separately imported module subpaths
  for (const subpath of FILE_MODULE_SUBPATH_EXPORTS) {
    exports[`./${subpath}`] = {
      source: `./src/${subpath}.ts`,
      types: `./dist/${subpath}.d.ts`,
      default: `./dist/${subpath}.js`,
    };
  }

  return exports;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const newExports = buildExports();

  if (CHECK_MODE) {
    const currentStr = JSON.stringify(pkg.exports, null, 2);
    const newStr = JSON.stringify(newExports, null, 2);

    if (currentStr === newStr) {
      console.log('✓ package.json exports are up to date');
      process.exit(0);
    } else {
      console.error('✗ package.json exports are stale!');
      console.error('');
      console.error('Run `node scripts/sync-exports.js` to update.');
      console.error('');

      // Show what changed
      const currentKeys = new Set(Object.keys(pkg.exports));
      const newKeys = new Set(Object.keys(newExports));

      for (const key of newKeys) {
        if (!currentKeys.has(key)) {
          console.error(`  + ${key} (missing from package.json)`);
        }
      }
      for (const key of currentKeys) {
        if (!newKeys.has(key)) {
          console.error(`  - ${key} (in package.json but not in src/)`);
        }
      }
      for (const key of newKeys) {
        if (
          currentKeys.has(key) &&
          JSON.stringify(pkg.exports[key]) !== JSON.stringify(newExports[key])
        ) {
          console.error(`  ~ ${key} (conditions differ)`);
        }
      }

      process.exit(1);
    }
  }

  // Write mode
  pkg.exports = newExports;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

  const dirs = discoverExportDirs();
  console.log(
    `✓ Synced ${Object.keys(newExports).length} exports (${dirs.length} components/modules)`,
  );
}

main();
