// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file i18n-english-fallback.mjs
 * @input packages/core/src modules and the English runtime catalog
 * @output Derived per-module English fallback maps under
 *   packages/core/src/i18n/generated-english/, plus the wiring checks that keep
 *   every Core module's keys reachable through its own map
 * @position Used by scripts/generate-i18n-runtime.mjs, the derived-sources step
 *   that runs before install, build, test, Storybook, docsite, and sandbox.
 *
 * A Core module that names catalog keys imports the English for exactly those
 * keys from its own generated map and registers it at module scope:
 *
 *   import english from '../i18n/generated-english/Button/Button.generated';
 *   registerEnglishFallback(english);
 *
 * A component's bundle therefore carries the English for the keys its modules
 * name, not the whole catalog. The resolver reads the registered English, so a
 * key resolves wherever the module that names it is loaded, including a key a
 * helper module looks up with a translator another module created.
 *
 * Public paths that resolve any Astryx key (the public `useTranslator`, the
 * public context export, and operator labels whose keys callers supply)
 * register the whole catalog through `registerFullEnglishFallback()`. Only the
 * modules in FULL_FALLBACK_MODULES may do that, and no other Core module may
 * import the public `useTranslator` or the public context export.
 *
 * A key reference is any string literal in a module that equals a catalog key.
 * That is wider than the translator call sites check-i18n-catalog verifies, so
 * keys kept in local maps (`new Map([['ctrl', '@astryx.kbd.key.control']])`)
 * are included too.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

export const CORE_SRC_DIR = path.join(REPO_ROOT, 'packages', 'core', 'src');
export const ENGLISH_FALLBACK_DIRNAME = 'generated-english';
export const ENGLISH_FALLBACK_DIR = path.join(
  CORE_SRC_DIR,
  'i18n',
  ENGLISH_FALLBACK_DIRNAME,
);

/** The one module that imports the whole generated English catalog. */
export const FULL_CATALOG_MODULE = 'i18n/fullEnglishFallback.ts';

/**
 * Modules that register the whole English catalog, each because callers can
 * hand it an arbitrary Astryx key.
 */
export const FULL_FALLBACK_MODULES = Object.freeze([
  // The public hook: application code may translate any Astryx key.
  'i18n/useTranslator.ts',
  // The public context export: application code may read `translate` from it.
  'i18n/publicContext.ts',
  // A caller-defined PowerSearch operator may name any Astryx key in `i18nKey`.
  'PowerSearch/resolveOperatorLabel.ts',
]);

/**
 * Whether a path under packages/core/src (POSIX separators) ships in the
 * package build. Mirrors the build's ignore list: tests, stories, docs, perf
 * fixtures, and declarations never ship, and generated catalogs are data.
 */
export function isShippedSourceModule(relPath) {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  return (
    /\.tsx?$/.test(name) &&
    !name.endsWith('.d.ts') &&
    !name.includes('.test.') &&
    !name.includes('.stories.') &&
    !name.includes('.perf.') &&
    !relPath.split('/').includes('__tests__') &&
    !relPath.startsWith('i18n/generated-locales/') &&
    !relPath.startsWith(`i18n/${ENGLISH_FALLBACK_DIRNAME}/`)
  );
}

function listSourceModules(srcDir) {
  const results = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      const rel = path.relative(srcDir, full).split(path.sep).join('/');
      if (entry.isFile() && isShippedSourceModule(rel)) results.push(rel);
    }
  };
  visit(srcDir);
  return results.sort();
}

/** Every string literal in `sourceText` that is a key of `catalog`. */
export function collectCatalogKeys(sourceText, fileName, catalog) {
  if (!sourceText.includes('@astryx.')) return [];
  const ts = require('typescript');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const keys = new Set();
  const visit = node => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      Object.hasOwn(catalog, node.text)
    ) {
      keys.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...keys].sort();
}

/**
 * Map each shipped Core module that names catalog keys to those keys.
 * @returns {Map<string, string[]>} module path (relative to src) → keys
 */
export function collectEnglishFallbackSlices(
  englishCatalog,
  srcDir = CORE_SRC_DIR,
) {
  const slices = new Map();
  for (const rel of listSourceModules(srcDir)) {
    const text = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const keys = collectCatalogKeys(text, rel, englishCatalog);
    if (keys.length > 0) slices.set(rel, keys);
  }
  return slices;
}

function stripExtension(rel) {
  return rel.replace(/\.tsx?$/, '');
}

/** The generated map's path relative to its directory, e.g. `Button/Button.generated.ts`. */
export function getSliceModuleName(sourceRel) {
  return `${stripExtension(sourceRel)}.generated.ts`;
}

/** The specifier `sourceRel` imports its generated map with. */
export function getSliceImportSpecifier(sourceRel) {
  const fromDir = path.posix.dirname(sourceRel);
  const target = path.posix.join(
    'i18n',
    ENGLISH_FALLBACK_DIRNAME,
    stripExtension(sourceRel) + '.generated',
  );
  const relative = path.posix.relative(fromDir, target);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

export function renderEnglishFallbackModule(englishCatalog, keys, sourceRel) {
  const slice = Object.fromEntries(keys.map(key => [key, englishCatalog[key]]));
  return (
    `// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n` +
    `/**\n` +
    ` * @generated by scripts/generate-i18n-runtime.mjs from packages/core/locales/en.json,\n` +
    ` * holding the English for the catalog keys named in packages/core/src/${sourceRel}.\n` +
    ` * Do not edit by hand. Run \`pnpm generate:i18n-runtime\` instead.\n` +
    ` */\n\n` +
    `const english: Readonly<Record<string, string>> = ${JSON.stringify(slice, null, 2)};\n\n` +
    `export default english;\n`
  );
}

const SLICE_IMPORT_PATTERN = new RegExp(
  String.raw`^import\s+(\w+)\s+from\s+'([^']*\/${ENGLISH_FALLBACK_DIRNAME}\/[^']+)';`,
  'gm',
);
const FULL_CATALOG_IMPORT_PATTERN = /generated-locales\/en\.generated['"]/;
const FULL_FALLBACK_CALL_PATTERN = /^registerFullEnglishFallback\(\);$/m;
// A value import of the public hook or the public context export, from the
// i18n barrel or their modules. Both carry the whole catalog.
const PUBLIC_TRANSLATOR_IMPORT_PATTERN =
  /^import\s*\{[^}]*\buseTranslator\b[^}]*\}\s*from\s*'(?:\.\.?\/)+i18n(?:\/index|\/useTranslator)?';/m;
const PUBLIC_CONTEXT_IMPORT_PATTERN =
  /^import\s*\{[^}]*\bInternationalizationContext\b[^}]*\}\s*from\s*'(?:\.\.?\/)+i18n(?:\/index|\/publicContext)?';/m;

/**
 * Wiring problems: a module that names keys without importing and registering
 * its own generated map, a module importing another module's map or a map it
 * no longer needs, or a full-catalog path outside the allowed modules.
 */
export function findWiringProblems(slices, srcDir = CORE_SRC_DIR) {
  const problems = [];
  for (const rel of listSourceModules(srcDir)) {
    const text = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const imports = [...text.matchAll(SLICE_IMPORT_PATTERN)];
    const expected = getSliceImportSpecifier(rel);
    if (!rel.startsWith('i18n/')) {
      if (PUBLIC_TRANSLATOR_IMPORT_PATTERN.test(text)) {
        problems.push(
          `${rel}: imports the public useTranslator, which carries the whole ` +
            `catalog; use useComponentTranslator`,
        );
      }
      if (PUBLIC_CONTEXT_IMPORT_PATTERN.test(text)) {
        problems.push(
          `${rel}: imports the public InternationalizationContext export, which ` +
            `carries the whole catalog; import i18n/InternationalizationContext`,
        );
      }
    }
    if (slices.has(rel)) {
      const own = imports.find(([, , specifier]) => specifier === expected);
      if (own === undefined) {
        problems.push(
          `${rel}: names catalog keys but does not import its English fallback ` +
            `(import english from '${expected}';)`,
        );
      } else if (
        !new RegExp(
          String.raw`^registerEnglishFallback\(${own[1]}\);$`,
          'm',
        ).test(text)
      ) {
        problems.push(
          `${rel}: imports its English fallback but does not register it at ` +
            `module scope (registerEnglishFallback(${own[1]});)`,
        );
      }
    }
    for (const [, , specifier] of imports) {
      if (!slices.has(rel) || specifier !== expected) {
        problems.push(
          `${rel}: imports '${specifier}', which is not its own English fallback`,
        );
      }
    }
    if (rel !== FULL_CATALOG_MODULE && FULL_CATALOG_IMPORT_PATTERN.test(text)) {
      problems.push(
        `${rel}: imports the whole English catalog; use its own generated ` +
          `English fallback instead`,
      );
    }
    if (
      !FULL_FALLBACK_MODULES.includes(rel) &&
      FULL_FALLBACK_CALL_PATTERN.test(text)
    ) {
      problems.push(
        `${rel}: registers the whole English catalog but is not a public path ` +
          `that resolves arbitrary keys (FULL_FALLBACK_MODULES)`,
      );
    }
  }
  for (const rel of FULL_FALLBACK_MODULES) {
    const file = path.join(srcDir, rel);
    if (
      !fs.existsSync(file) ||
      !FULL_FALLBACK_CALL_PATTERN.test(fs.readFileSync(file, 'utf8'))
    ) {
      problems.push(
        `${rel}: must register the whole English catalog at module scope ` +
          `(registerFullEnglishFallback();)`,
      );
    }
  }
  return problems;
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return true;
}

function removeStaleSlices(dir, expected, base = dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += removeStaleSlices(full, expected, base);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      continue;
    }
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (!expected.has(rel)) {
      fs.rmSync(full);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Write one English fallback map per Core module that names catalog keys and
 * remove maps whose module no longer does.
 */
export function writeEnglishFallbackSlices(
  englishCatalog,
  slices,
  outDir = ENGLISH_FALLBACK_DIR,
) {
  const expected = new Set(
    [...slices.keys()].map(sourceRel => getSliceModuleName(sourceRel)),
  );
  const removed = removeStaleSlices(outDir, expected);
  let changed = 0;
  for (const [sourceRel, keys] of slices) {
    const output = renderEnglishFallbackModule(englishCatalog, keys, sourceRel);
    if (
      writeIfChanged(path.join(outDir, getSliceModuleName(sourceRel)), output)
    )
      changed += 1;
  }
  return {changed, removed};
}
