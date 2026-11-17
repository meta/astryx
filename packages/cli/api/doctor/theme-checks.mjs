// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Positive-evidence checks for the app theme record.
 *
 * Each AST-050 check has its own stable result. Missing app-theme state is
 * informational. A check passes only after its specific evidence is read.
 */

import * as path from 'node:path';
import {babelParse as parse} from '../../foundation/runtime/lazy-dependencies.mjs';
import {postcss} from '../../foundation/runtime/lazy-dependencies.mjs';
import {
  addMatchingCore,
  collectUnloadedFonts,
  fontPackagesInstallLine,
  discoverDoctorThemes,
  themeIdentifier,
  discoverDoctorUnmigratedCopies,
  corePeerRange,
  findDoctorCoreDir,
  doctorElementPropOrigins,
  doctorRendersElement,
  doctorStylesheetImports,
  findDoctorInstalledPackage,
  fontServiceFamilies,
  realDoctorFile,
  isLocalThemeOwner,
  listDoctorThemePackages,
  listProjectSourceFiles,
  planThemeAppWrite,
  readPackageJson,
  readTextFile,
  readTextFileIfExists,
  readThemeState,
  resolveDoctorThemeImports,
  resolveRecordedTheme,
  resolveThemeModule,
  SOURCE_EXTENSIONS,
  doctorStylesheetImportFile,
  fileMark,
  generatedSourceCommand,
  isPrivateVarRefusal,
  missingThemePackage,
  dependencyInstallFor,
  coreAddCommand,
  packageInstallCommand,
  packageInstallStep,
  themeBuild,
  themeRecordOwner,
  themeShippedImportFindings,
  validateThemePrivateInputs,
} from './_adapter.mjs';
import {
  getCliInvocation,
  formatCliCommand,
} from '../../foundation/env/package-manager.mjs';
import {logger} from '../logger.mjs';

/** @typedef {import('./doctor.mjs').DoctorCheck} DoctorCheck */
/** @typedef {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} DiscoveredTheme */
/** @typedef {import('../../foundation/config/theme-state.mjs').ResolvedAppTheme} ResolvedAppTheme */

const CHECKS = [
  ['theme-owners', 'Theme owners and built imports'],
  ['theme-module', 'Generated theme module'],
  ['theme-module-import', 'App imports the theme module'],
  ['theme-stylesheet-imports', 'Built theme stylesheet imports'],
  ['theme-local-builds', 'Local theme build freshness'],
  ['theme-private-variables', 'Private theme variables'],
  ['theme-core-peers', 'Theme Core peer compatibility'],
  ['theme-default', 'Default added theme'],
  ['theme-fonts', 'Theme font loading'],
  ['theme-global-rules', 'Cross-theme global CSS rules'],
];

const APP_THEME_CHECK_IDS = new Set(CHECKS.map(([id]) => id));

/**
 * @param {string} message
 * @param {Error|null} [moduleError]
 * @returns {DoctorCheck[]}
 */
function unavailableChecks(message, moduleError = null) {
  return CHECKS.map(([id, label]) => ({
    id,
    label,
    status: moduleError && id === 'theme-module' ? 'fail' : 'info',
    message:
      moduleError && id === 'theme-module' ? moduleError.message : message,
    ...(moduleError && id === 'theme-module'
      ? {
          fix: `Keep one CLI-generated astryx-themes.ts or astryx-themes.js file, then run \`${formatCliCommand('theme add <slug>')}\`.`,
        }
      : {}),
  }));
}

/** @param {string} value */
function projectPath(value) {
  return value.split(path.sep).join('/');
}

/** @param {string} root @param {string} file */
function relative(root, file) {
  return projectPath(path.relative(root, file));
}

/**
 * The concrete command that revalidates one recorded theme after its source or
 * package is corrected.
 * @param {string} projectDir
 * @param {string} run
 * @param {DiscoveredTheme[]} available
 * @param {string} slug
 * @param {string} owner
 */
function refreshThemeCommand(projectDir, run, available, slug, owner) {
  const theme = available.find(
    candidate =>
      candidate.slug === slug && themeRecordOwner(candidate) === owner,
  );
  if (!isLocalThemeOwner(owner)) {
    // A theme package the project lists but has not installed, as in a fresh
    // clone, comes from installing the project's dependencies, at the version
    // it lists; its theme is added already.
    const install = findDoctorInstalledPackage(projectDir, owner)
      ? null
      : dependencyInstallFor(projectDir, owner);
    if (install) return install;
    // The package is added the way the project adds it, at the release its
    // Core peer needs, then the theme again; by its owner only when another
    // package owns the same slug. The recorded owner counts even when it is
    // not installed, so a bundled theme with the same slug still needs it.
    const owners = new Set([
      owner,
      ...available
        .filter(candidate => candidate.slug === slug)
        .map(themeRecordOwner),
    ]);
    const add =
      owners.size > 1
        ? `${run} theme add ${slug} --package ${owner}`
        : `${run} theme add ${slug}`;
    return `${addMatchingCore(projectDir, owner)}; ${add}`;
  }
  const source = theme
    ? relative(projectDir, path.join(theme.sourceDir, theme.entry))
    : projectPath(path.join(owner, slug, `${themeIdentifier(slug)}Theme.ts`));
  // A source another command generates (its leading comment carries that
  // command's mark), or a missing one that command writes: the fix is that
  // command, which writes the source and its outputs together.
  const by = generatedSourceCommand(path.resolve(projectDir, source));
  if (by)
    return /^astryx\s/.test(by)
      ? `${run} ${by.replace(/^astryx\s+/, '')}; ${run} theme add ${slug}`
      : `Rebuild ${projectPath(path.dirname(source))}/ with ${by}, then run ${run} theme add ${slug}`;
  return `${run} theme build ${source}; ${run} theme add ${slug}`;
}

/** @param {string} source */
function parseModule(source) {
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes'],
  });
}

/** @param {unknown} value @param {(node: any) => void} visit */
function walkAst(value, visit) {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walkAst(item, visit);
    return;
  }
  const node = /** @type {Record<string, unknown>} */ (value);
  if (typeof node.type === 'string') visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    walkAst(child, visit);
  }
}

/**
 * @param {string} source
 * @param {{runtimeOnly?: boolean}} [options] - skip type-only imports and
 *   re-exports, which the build erases
 */
function moduleSpecifiers(source, options = {}) {
  const values = new Set();
  walkAst(parseModule(source), node => {
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
      ].includes(node.type) &&
      typeof node.source?.value === 'string' &&
      !(
        options.runtimeOnly &&
        (node.importKind === 'type' || node.exportKind === 'type')
      )
    ) {
      values.add(node.source.value);
    }
    if (
      node.type === 'ImportExpression' &&
      typeof node.source?.value === 'string'
    ) {
      values.add(node.source.value);
    }
    if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' || node.callee?.name === 'require') &&
      typeof node.arguments?.[0]?.value === 'string'
    ) {
      values.add(node.arguments[0].value);
    }
  });
  return values;
}

/** @param {string} specifier @param {string} fromFile @param {string} target */
function specifierTargets(specifier, fromFile, target) {
  if (!specifier.startsWith('.')) return false;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map(extension => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map(extension =>
      path.join(base, `index${extension}`),
    ),
  ];
  return candidates.some(
    candidate => path.resolve(candidate) === path.resolve(target),
  );
}

/** @param {string} root @param {string} generatedModule */
function sourceImportEvidence(root, generatedModule) {
  let parseFailures = 0;
  for (const file of listProjectSourceFiles(root, generatedModule)) {
    try {
      const source = readTextFile(file);
      if (
        [...moduleSpecifiers(source)].some(specifier =>
          specifierTargets(specifier, file, generatedModule),
        )
      ) {
        return {found: true, parseFailures};
      }
    } catch {
      parseFailures += 1;
    }
  }
  return {found: false, parseFailures};
}

/**
 * Whether the file's leading comment says the CLI generated it: a theme
 * build, or a file of the theme editor (its settings module, its app copy).
 * @param {string} source
 */
function generatedThemeFile(source) {
  return fileMark(source) != null;
}

/**
 * The specifiers a file imports only to extend a theme: every binding of
 * the import is used solely as the `extends` value of a `defineTheme({...})`
 * call. Any other use of a binding (a switcher, a render, a re-export) keeps
 * the import, and so does a second import of the same specifier.
 * @param {any} ast
 * @returns {Set<string>}
 */
function extendOnlySpecifiers(ast) {
  /** @type {Map<string, string>} binding -> specifier */
  const bindings = new Map();
  /** @type {Map<string, number>} */
  const importsOf = new Map();
  for (const node of ast.program?.body ?? []) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type')
      continue;
    const from = node.source.value;
    importsOf.set(from, (importsOf.get(from) ?? 0) + 1);
    for (const s of node.specifiers ?? []) bindings.set(s.local.name, from);
  }
  /** @type {Map<string, {extends: number, other: number}>} */
  const uses = new Map();
  /**
   * @param {any} node
   * @param {any} parent
   * @param {any} grand
   * @param {any} great
   */
  const visit = (node, parent, grand, great) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, parent, grand, great);
      return;
    }
    if (
      node.type === 'Identifier' &&
      bindings.has(node.name) &&
      ![
        'ImportSpecifier',
        'ImportDefaultSpecifier',
        'ImportNamespaceSpecifier',
      ].includes(parent?.type) &&
      !(
        parent?.type === 'ObjectProperty' &&
        parent.key === node &&
        !parent.computed &&
        parent.value !== node
      )
    ) {
      const u = uses.get(node.name) ?? {extends: 0, other: 0};
      // The `extends` of a `defineTheme({...})` call, as the check reads a
      // theme's base everywhere else.
      const asExtends = definedThemeBase(great) === node;
      if (asExtends) u.extends++;
      else u.other++;
      uses.set(node.name, u);
    }
    if (typeof node.type !== 'string') return;
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
      visit(child, node, parent, grand);
    }
  };
  visit(ast.program, null, null, null);
  // Every other way the file loads a module (`import()`, `require()`,
  // `export … from`): a specifier loaded so is not only extended.
  /** @type {Set<string>} */
  const loadedOtherwise = new Set();
  walkAst(ast.program, node => {
    if (
      ['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) &&
      typeof node.source?.value === 'string'
    )
      loadedOtherwise.add(node.source.value);
    if (
      node.type === 'ImportExpression' &&
      typeof node.source?.value === 'string'
    )
      loadedOtherwise.add(node.source.value);
    if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' || node.callee?.name === 'require') &&
      typeof node.arguments?.[0]?.value === 'string'
    )
      loadedOtherwise.add(node.arguments[0].value);
  });
  /** @type {Map<string, boolean>} */
  const only = new Map();
  for (const [name, from] of bindings) {
    const u = uses.get(name) ?? {extends: 0, other: 0};
    const ok = u.extends > 0 && u.other === 0;
    only.set(from, (only.get(from) ?? true) && ok);
  }
  return new Set(
    [...only]
      .filter(
        ([from, ok]) =>
          ok && importsOf.get(from) === 1 && !loadedOtherwise.has(from),
      )
      .map(([from]) => from),
  );
}

/**
 * Find a source file that imports one added built module without its paired CSS.
 * @param {string} root
 * @param {string} generatedModule
 * @param {ResolvedAppTheme[]} themes
 */
function themeImportPairEvidence(root, generatedModule, themes) {
  const files = [
    generatedModule,
    ...listProjectSourceFiles(root, generatedModule),
  ];
  const unpaired = [];
  const unproven = [];
  for (const file of files) {
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    // A file the CLI generates (a theme build, the editor's files) only
    // extends another theme's module, never renders it. The app's theme
    // module stays checked.
    if (file !== generatedModule && generatedThemeFile(source)) continue;
    const candidates = themes.filter(theme =>
      source.includes(
        theme.source === 'local'
          ? path.basename(theme.moduleFile)
          : theme.module,
      ),
    );
    if (candidates.length === 0) continue;
    let specifiers;
    try {
      specifiers = moduleSpecifiers(source);
      // An import used only as a theme's `extends` (a theme source) does not
      // render that theme: its stylesheet is not asked for.
      if (file !== generatedModule)
        for (const from of extendOnlySpecifiers(parseModule(source)))
          specifiers.delete(from);
    } catch {
      unproven.push(relative(root, file));
      continue;
    }
    for (const theme of candidates) {
      const importsModule = [...specifiers].some(specifier =>
        theme.source === 'local'
          ? specifierTargets(specifier, file, theme.moduleFile)
          : specifier === theme.module,
      );
      if (!importsModule) continue;
      const importsStylesheet = [...specifiers].some(specifier =>
        theme.source === 'local'
          ? specifierTargets(specifier, file, theme.stylesheetFile)
          : specifier === theme.stylesheet,
      );
      if (!importsStylesheet) {
        unpaired.push({
          slug: theme.slug,
          file: relative(root, file),
          stylesheet: theme.stylesheet || relative(root, theme.stylesheetFile),
        });
      }
    }
  }
  return {unpaired, unproven};
}

/** @param {string} value */
function normalizeFontName(value) {
  return value
    .trim()
    .replace(/^(['"])(.*)\1$/u, '$2')
    .replace(/\s+/gu, ' ');
}

/** @param {string[]} files */
function namedThemeFonts(files) {
  const names = new Map();
  for (const file of files) {
    const source = readTextFileIfExists(file);
    if (source == null) continue;
    try {
      walkAst(parseModule(source), node => {
        if (node.type !== 'ObjectProperty' && node.type !== 'Property') return;
        const key = node.key?.name ?? node.key?.value;
        const value = node.value?.value;
        if (typeof key !== 'string' || typeof value !== 'string') return;
        /** @type {string[]} */
        let found = [];
        if (key.startsWith('--font-family-')) {
          found = collectUnloadedFonts({tokens: {[key]: value}});
        } else if (key === 'family') {
          found = collectUnloadedFonts({typography: {body: {family: value}}});
        } else if (key === 'fontFamily') {
          found = collectUnloadedFonts({
            components: {probe: {base: {fontFamily: value}}},
          });
        }
        for (const name of found) {
          const normalized = name.toLowerCase();
          if (!names.has(normalized)) names.set(normalized, name);
        }
      });
    } catch {
      // The source-to-built checks report parse or build problems separately.
    }
  }
  return new Set(names.values());
}

/**
 * The families a font stylesheet loads with `@font-face`, following its
 * local `@import`s (a relative file, or a package's stylesheet such as
 * `@fontsource/inter/index.css`), and the families the `family` parameters
 * of a font service URL it imports name; `external` when it imports a URL
 * (http, https, `//`), which may load families doctor cannot read.
 * @param {string} css
 * @param {string} [file] the stylesheet's path, to resolve local imports
 * @param {Set<string>} [seen]
 */
function fontStylesheetEvidence(css, file, seen = new Set()) {
  const loaded = new Set();
  let external = false;
  let unread = false;
  const root = postcss().parse(css);
  root.walkAtRules(atRule => {
    if (atRule.name.toLowerCase() === 'import') {
      const spec = [...doctorStylesheetImports(`@import ${atRule.params};`)][0];
      if (!spec || /^(?:https?:)?\/\//i.test(spec)) {
        // A family the request names counts as loaded, as an @font-face rule
        // does: the stylesheet asks the service for it.
        for (const family of fontServiceFamilies(spec ?? '')) {
          loaded.add(family);
        }
        external = true;
        return;
      }
      const target = file ? doctorStylesheetImportFile(spec, file) : null;
      if (!target) {
        // A local import doctor cannot follow may load the font: it
        // cannot prove it either way.
        unread = true;
        return;
      }
      if (seen.has(target)) return;
      if (seen.size > 20) {
        // Past the limit doctor follows, the rest is not proven either way.
        unread = true;
        return;
      }
      seen.add(target);
      try {
        const inner = fontStylesheetEvidence(
          readTextFile(target),
          target,
          seen,
        );
        for (const name of inner.loaded) loaded.add(name);
        external ||= inner.external;
        unread ||= inner.unread;
      } catch {
        unread = true;
      }
      return;
    }
    if (atRule.name.toLowerCase() !== 'font-face') return;
    atRule.walkDecls(/^font-family$/iu, declaration => {
      loaded.add(normalizeFontName(declaration.value).toLowerCase());
    });
  });
  return {loaded, external, unread};
}

/** @param {import('postcss').Rule} rule @param {string} slug */
function scopedToTheme(rule, slug) {
  const needles = [
    `[data-astryx-theme="${slug}"]`,
    `[data-astryx-theme='${slug}']`,
  ];
  if (needles.some(needle => rule.selector.includes(needle))) return true;
  /** @type {import('postcss').Node|undefined} */
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule') {
      const atRule = /** @type {import('postcss').AtRule} */ (parent);
      const params = atRule.params;
      if (needles.some(needle => String(params).includes(needle))) return true;
    }
    parent = parent.parent;
  }
  return false;
}

/** @param {string} css @param {string} slug */
function globalRules(css, slug) {
  const rules = new Map();
  const root = postcss().parse(css);
  root.walkRules(rule => {
    if (scopedToTheme(rule, slug)) return;
    /** @type {import('postcss').Node|undefined} */
    let parent = rule.parent;
    while (parent) {
      if (
        parent.type === 'atrule' &&
        /keyframes$/iu.test(
          /** @type {import('postcss').AtRule} */ (parent).name,
        )
      )
        return;
      parent = parent.parent;
    }
    /** @type {string[]} */
    const declarations = [];
    rule.walkDecls(declaration => {
      declarations.push(
        `${declaration.prop.trim()}:${declaration.value.trim()}${declaration.important ? '!important' : ''}`,
      );
    });
    rules.set(rule.selector.trim(), declarations.sort().join(';'));
  });
  return rules;
}

/**
 * Report source copies made by the released `theme add` before it copied
 * descriptors. This is a migration notice, not one of the ten setup checks.
 * @param {string} projectDir
 * @returns {DoctorCheck|null}
 */
function unmigratedCopyCheck(projectDir) {
  const copies = discoverDoctorUnmigratedCopies(projectDir);
  if (copies.length === 0) return null;
  const shown = copies
    .map(copy => relative(projectDir, copy.sourceDir))
    .join(', ');
  const command = `${getCliInvocation(projectDir)} upgrade --from 0.6.4 --path . --apply`;
  return {
    id: 'theme-unmigrated-copies',
    label: 'Earlier copied themes',
    status: 'warn',
    message: `${copies.length} source theme copy or copies are not managed themes yet: ${shown}.`,
    fix: `Write their missing descriptors with \`${command}\`.`,
  };
}

/**
 * Whether the app's package.json names a theme in `astryx.theme`.
 * @param {string} cwd
 */
function appPackageNamesTheme(cwd) {
  let state;
  try {
    state = readThemeState(cwd);
  } catch {
    return false;
  }
  const pkg = readPackageJson(state.packageFile);
  return Boolean(pkg?.astryx?.theme);
}

/**
 * Whether one import specifier names a theme's built module or stylesheet.
 * @param {string} specifier
 * @param {string} file - the importing file
 * @param {ResolvedAppTheme} theme
 */
function importsTheme(specifier, file, theme) {
  if (theme.source === 'local') {
    return (
      specifierTargets(specifier, file, theme.moduleFile) ||
      specifierTargets(specifier, file, theme.stylesheetFile)
    );
  }
  return specifier === theme.module || specifier === theme.stylesheet;
}

const CORE_THEME_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/theme',
]);

/**
 * The base a `defineTheme({extends: base})` call extends, for
 * {@link doctorElementPropOrigins}: a theme made that way stands for its base.
 * @param {any} init
 * @returns {any}
 */
function definedThemeBase(init) {
  if (
    init?.type !== 'CallExpression' ||
    init.callee?.type !== 'Identifier' ||
    init.callee.name !== 'defineTheme'
  ) {
    return null;
  }
  const options = init.arguments?.[0];
  if (options?.type !== 'ObjectExpression') return null;
  const base = options.properties.find(
    (/** @type {any} */ property) =>
      property.type === 'ObjectProperty' &&
      !property.computed &&
      (property.key?.name ?? property.key?.value) === 'extends',
  );
  return base?.value ?? null;
}

/**
 * The themes the app wires itself, without a generated theme module or a
 * package.json `astryx.theme`. A theme is wired when the app's own source
 * imports its built module or stylesheet ({@link resolveDoctorThemeImports}
 * names them: the imports `theme add` writes), or when the app passes it to
 * Core's `Theme`: {@link doctorElementPropOrigins} follows the `theme` value through
 * module-scope aliases, `defineTheme({extends})`, re-exports and installed
 * packages to where it is declared, which must be inside an installed theme
 * package or be a local theme's built module. Only themes the app can load
 * count: a theme whose package is not installed is never wired. A `theme`
 * value whose origin is anything else (a prop, a function result, a lookup)
 * is reported as unconfirmed, never as missing. The scan reads app source only
 * (no dependencies, build output, links or type-only imports) within the
 * bounded source walk, and executes nothing.
 *
 * A package theme whose integration names the provider component that wires
 * its themes (its manifest's `themeProvider`) is wired when the app renders
 * that component (`wiredBy`): the theme whose stylesheet the app imports
 * (its export, or a stylesheet of the package that is that theme's file),
 * or the integration's only theme. A rendered provider with several themes
 * and no stylesheet to tell them apart is unconfirmed, with the themes it
 * may wire and the package's stylesheets the app imports.
 * @param {string} cwd
 * @returns {Promise<{
 *   wired: Array<{slug: string, owner: string, file: string, wiredBy?: string}>,
 *   unconfirmed: Array<{file: string, wiredBy?: string, themes?: string[], stylesheets?: string[]}>,
 * }>}
 */
export async function themeImportWiring(cwd) {
  const none = {wired: [], unconfirmed: []};
  let state;
  try {
    state = readThemeState(cwd);
  } catch {
    return none;
  }
  // A generated module or `astryx.theme` already decides the result.
  if (state.configured || appPackageNamesTheme(cwd)) return none;
  const projectDir = state.projectDir;
  /** @type {DiscoveredTheme[]} */
  let available;
  try {
    available = await discoverDoctorThemes(projectDir);
  } catch {
    return none;
  }
  const ownerCounts = new Map();
  for (const theme of available) {
    const owner = themeRecordOwner(theme);
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  /** @type {Map<string, string | null>} */
  const installedDirs = new Map();
  const installedDir = (/** @type {string} */ owner) => {
    if (!installedDirs.has(owner)) {
      const dir = findDoctorInstalledPackage(projectDir, owner);
      installedDirs.set(owner, dir ? realDoctorFile(dir) : null);
    }
    return installedDirs.get(owner) ?? null;
  };
  // Only themes the app can load: local themes, and package themes whose
  // package is installed (discovery also lists the CLI's bundled themes).
  /** @type {ResolvedAppTheme[]} */
  const themes = [];
  /**
   * The provider component each package theme's integration wires its themes
   * with, by theme.
   * @type {Map<ResolvedAppTheme, {export: string, from: string}>}
   */
  const providerOf = new Map();
  /**
   * The folder each such theme's descriptor is in, links resolved.
   * @type {Map<ResolvedAppTheme, string>}
   */
  const folderOf = new Map();
  for (const theme of available) {
    let resolved;
    try {
      resolved = resolveDoctorThemeImports(theme, {
        cwd: projectDir,
        ownerThemeCount: ownerCounts.get(themeRecordOwner(theme)) ?? 1,
      });
    } catch {
      // A theme without built imports cannot be wired by importing them.
      continue;
    }
    if (resolved.source === 'local' || installedDir(resolved.owner)) {
      themes.push(resolved);
      if (theme.provider) {
        providerOf.set(resolved, theme.provider);
        folderOf.set(
          resolved,
          realDoctorFile(theme.sourceDir) ?? theme.sourceDir,
        );
      }
    }
  }
  if (themes.length === 0) return none;
  /** The providers the themes name, once each, with the themes each wires. */
  /** @type {Map<string, {provider: {export: string, from: string}, themes: ResolvedAppTheme[], file: string | null, stylesheets: Array<{spec: string, target: string | null}>}>} */
  const providers = new Map();
  for (const [theme, provider] of providerOf) {
    const key = `${provider.export}\u0000${provider.from}`;
    const entry = providers.get(key) ?? {
      provider,
      themes: [],
      file: null,
      stylesheets: [],
    };
    entry.themes.push(theme);
    providers.set(key, entry);
  }
  /**
   * The theme a `Theme` value's origin is, or null.
   * @param {{file: string, name: string} | null} origin
   */
  const themeAt = origin => {
    const file = origin ? realDoctorFile(origin.file) : null;
    if (!origin || !file) return null;
    const local = themes.find(
      theme =>
        theme.source === 'local' && realDoctorFile(theme.moduleFile) === file,
    );
    if (local) return local;
    const owned = themes.filter(theme => {
      const dir = theme.source === 'local' ? null : installedDir(theme.owner);
      return dir != null && file.startsWith(`${dir}${path.sep}`);
    });
    const named = owned.filter(theme => theme.exportName === origin.name);
    if (named.length === 1) return named[0];
    return owned.length === 1 ? owned[0] : null;
  };
  /** @type {Map<string, {slug: string, owner: string, file: string, wiredBy?: string}>} */
  const wired = new Map();
  const keyOf = (/** @type {ResolvedAppTheme} */ theme) =>
    `${theme.owner}\u0000${theme.slug}`;
  /** @type {Set<string>} */
  const unconfirmed = new Set();
  /** @type {Array<{file: string, wiredBy: string, themes: string[], stylesheets: string[]}>} */
  const unconfirmedProviders = [];
  for (const file of listProjectSourceFiles(projectDir, '', {
    stylesheets: true,
  })) {
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    // A file the CLI generates (a theme build, the editor's files) imports
    // its base to extend it, never to render it: it wires nothing.
    if (generatedThemeFile(source)) continue;
    const shown = relative(projectDir, file);
    for (const entry of providers.values()) {
      if (
        entry.file == null &&
        path.extname(file) !== '.css' &&
        source.includes(entry.provider.export) &&
        source.includes(entry.provider.from) &&
        doctorRendersElement(file, {
          sources: new Set([entry.provider.from]),
          name: entry.provider.export,
        })
      )
        entry.file = shown;
      // A stylesheet the app imports from the provider's package: the
      // package's theme stylesheet, wherever the package keeps it.
      for (const owner of new Set(entry.themes.map(theme => theme.owner))) {
        // Only text that names the package and a stylesheet is parsed.
        if (!source.includes(`${owner}/`) || !source.includes('.css')) continue;
        let specifiers;
        try {
          specifiers =
            path.extname(file) === '.css'
              ? doctorStylesheetImports(source)
              : moduleSpecifiers(source, {runtimeOnly: true});
        } catch {
          continue;
        }
        for (const spec of specifiers)
          if (spec.startsWith(`${owner}/`) && /\.css$/u.test(spec))
            entry.stylesheets.push({
              spec,
              target: doctorStylesheetImportFile(spec, file),
            });
      }
    }
    const candidates = themes.filter(
      theme =>
        !wired.has(keyOf(theme)) &&
        (theme.source === 'local'
          ? source.includes(path.basename(theme.moduleFile)) ||
            source.includes(path.basename(theme.stylesheetFile))
          : source.includes(theme.module) || source.includes(theme.stylesheet)),
    );
    if (candidates.length > 0) {
      let specifiers;
      try {
        specifiers =
          path.extname(file) === '.css'
            ? doctorStylesheetImports(source)
            : moduleSpecifiers(source, {runtimeOnly: true});
        // An import used only as a theme's `extends` (a theme source such
        // as the editor's) renders nothing.
        if (path.extname(file) !== '.css')
          for (const from of extendOnlySpecifiers(parseModule(source)))
            specifiers.delete(from);
      } catch {
        specifiers = new Set();
      }
      for (const theme of candidates) {
        if ([...specifiers].some(spec => importsTheme(spec, file, theme))) {
          wired.set(keyOf(theme), {
            slug: theme.slug,
            owner: theme.owner,
            file: shown,
          });
        }
      }
    }
    if (path.extname(file) === '.css' || !source.includes('theme=')) continue;
    for (const origin of doctorElementPropOrigins(file, {
      sources: CORE_THEME_SOURCES,
      name: 'Theme',
      prop: 'theme',
      unwrap: definedThemeBase,
    })) {
      const theme = themeAt(origin);
      if (!theme) {
        unconfirmed.add(shown);
      } else if (!wired.has(keyOf(theme))) {
        wired.set(keyOf(theme), {
          slug: theme.slug,
          owner: theme.owner,
          file: shown,
        });
      }
    }
  }
  // A rendered provider wires its integration's theme: the one whose
  // stylesheet the app imports (its export, or any stylesheet of the
  // package that is that theme's file), or the only one it has. With
  // several and no stylesheet to tell them apart, which one it wires is not
  // known.
  for (const {
    provider,
    themes: owned,
    file,
    stylesheets,
  } of providers.values()) {
    if (file == null) continue;
    const wiredBy = `${provider.export} from ${provider.from}`;
    const files = new Set(
      stylesheets.flatMap(x =>
        x.target ? [realDoctorFile(x.target) ?? x.target] : [],
      ),
    );
    // A stylesheet of the package is a theme's when it is that theme's
    // stylesheet export, a file inside that theme's own folder, or a file
    // that stylesheet imports; it names a theme only when one theme claims
    // it.
    /** The files a theme's own stylesheet is or imports. @param {ResolvedAppTheme} theme */
    const ownFiles = theme => {
      const sheet = theme.stylesheetFile;
      const real = realDoctorFile(sheet) ?? sheet;
      const css = readTextFileIfExists(sheet) ?? '';
      return [
        real,
        ...[...doctorStylesheetImports(css)].flatMap(spec => {
          const target = doctorStylesheetImportFile(spec, sheet);
          return target ? [realDoctorFile(target) ?? target] : [];
        }),
      ];
    };
    const claims = new Map(
      owned.map(theme => {
        const folder = folderOf.get(theme);
        const own = new Set(ownFiles(theme));
        return [
          theme,
          [...files].filter(
            f =>
              own.has(f) ||
              (folder != null && f.startsWith(`${folder}${path.sep}`)),
          ),
        ];
      }),
    );
    const claimedBy = (/** @type {string} */ f) =>
      owned.filter(theme => claims.get(theme)?.includes(f));
    const imported = owned.filter(
      theme =>
        wired.has(keyOf(theme)) ||
        (claims.get(theme) ?? []).some(f => claimedBy(f).length === 1),
    );
    if (imported.length > 0) {
      for (const theme of imported)
        wired.set(keyOf(theme), {
          slug: theme.slug,
          owner: theme.owner,
          file,
          wiredBy,
        });
    } else if (owned.length === 1) {
      wired.set(keyOf(owned[0]), {
        slug: owned[0].slug,
        owner: owned[0].owner,
        file,
        wiredBy,
      });
    } else {
      unconfirmedProviders.push({
        file,
        wiredBy,
        themes: owned.map(theme => theme.slug),
        stylesheets: [...new Set(stylesheets.map(x => x.spec))],
      });
    }
  }
  // In discovery order, so the report does not depend on the file walk.
  return {
    wired: themes.flatMap(theme => {
      const found = wired.get(keyOf(theme));
      return found ? [/** @type {any} */ (found)] : [];
    }),
    unconfirmed: [
      ...[...unconfirmed].sort().map(file => ({file})),
      ...unconfirmedProviders,
    ],
  };
}

/**
 * The fix line for a project with no installed theme: the install command in
 * the project's package manager, or `npm install` with a note when its
 * lockfiles disagree.
 * @param {string} cwd
 * @param {string} run the CLI invocation stem
 * @returns {string}
 */
function themeInstallFix(cwd, run) {
  const {line, note} = packageInstallStep(['@astryxdesign/theme-neutral'], cwd);
  return `Install a theme, e.g. \`${line}\`${note ? ` (${note})` : ''}, then add it to the app with \`${run} theme add neutral\`.`;
}

/**
 * The pass message's list of themes wired by import, each with the file that
 * imports it.
 * @param {Array<{slug: string, file: string, wiredBy?: string}>} wired
 */
function wiredByImportList(wired) {
  const shown = wired
    .slice(0, 5)
    .map(({slug, file, wiredBy}) =>
      wiredBy
        ? `${slug} (wired by ${wiredBy} in ${file})`
        : `${slug} (${file})`,
    );
  const more = wired.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

/**
 * The `themes` check that every released doctor report carries. Its id is
 * stable, so it stays beside the app-theme checks. Without a generated theme
 * module it reports what it always has: whether an `@astryxdesign/theme-*`
 * package is installed, and whether the app's package.json names a theme in
 * `astryx.theme`, or else whether the app's own source imports a theme's built
 * module or stylesheet ({@link themeImportWiring}). With a generated module it
 * reports the overall result of the app-theme checks.
 * @param {string} cwd
 * @param {DoctorCheck[]} appChecks - the checks {@link checkAppThemes} returned
 * @param {{wired: Array<{slug: string, file: string, wiredBy?: string}>, unconfirmed: Array<{file: string, wiredBy?: string, themes?: string[], stylesheets?: string[]}>}} [wiring] -
 *   what {@link themeImportWiring} returned
 * @returns {DoctorCheck}
 */
export function checkThemes(
  cwd,
  appChecks,
  wiring = {wired: [], unconfirmed: []},
) {
  const wiredByImport = wiring.wired;
  const label = 'Theme packages';
  const managed = appChecks.some(
    check => APP_THEME_CHECK_IDS.has(check.id) && check.status !== 'info',
  );
  if (managed) {
    // A check passes only on its own evidence, so the rollup passes only when
    // every check it summarizes passed. An `info` result here means a check
    // could not prove its evidence.
    const needsWork = appChecks.filter(
      check => check.status === 'fail' || check.status === 'warn',
    );
    const unproven = appChecks.filter(check => check.status === 'info');
    if (needsWork.length > 0) {
      const ids = needsWork.map(check => check.id).join(', ');
      return {
        id: 'themes',
        label,
        status: needsWork.some(check => check.status === 'fail')
          ? 'fail'
          : 'warn',
        message:
          needsWork.length === 1
            ? `One theme check needs attention: ${ids}.`
            : `${needsWork.length} theme checks need attention: ${ids}.`,
        fix:
          needsWork.length === 1
            ? `Follow the fix on the ${ids} check.`
            : `Follow the fix on each of these checks: ${ids}.`,
      };
    }
    if (unproven.length > 0) {
      const ids = unproven.map(check => check.id).join(', ');
      return {
        id: 'themes',
        label,
        status: 'info',
        message:
          unproven.length === 1
            ? `One theme check could not prove its result: ${ids}.`
            : `${unproven.length} theme checks could not prove their results: ${ids}.`,
        fix:
          unproven.length === 1
            ? `See the ${ids} check.`
            : `See each of these checks: ${ids}.`,
      };
    }
    return {
      id: 'themes',
      label,
      status: 'pass',
      message:
        'App themes come from the generated theme module, and every theme check passes.',
    };
  }

  const run = getCliInvocation(cwd);
  const packages = listDoctorThemePackages(cwd);
  // A rendered provider that wires one of several themes, none of them told
  // apart by an imported stylesheet: a theme is wired, but which one is not
  // known.
  const providerUnknown = wiring.unconfirmed.filter(entry => entry.wiredBy);
  const traceUnknown = wiring.unconfirmed.filter(entry => !entry.wiredBy);
  if (
    wiredByImport.length === 0 &&
    providerUnknown.length > 0 &&
    !appPackageNamesTheme(cwd)
  ) {
    // Which stylesheet of the package the app imports is named, never
    // called missing: doctor only cannot match it to one theme.
    const shown = providerUnknown
      .map(entry =>
        entry.stylesheets?.length
          ? `${entry.file} renders ${entry.wiredBy}, which wires one of ${(entry.themes ?? []).join(', ')}, and the app imports ${entry.stylesheets.join(', ')} from that package; doctor could not tell which of those themes ${entry.stylesheets.length > 1 ? 'they are' : 'it is'}`
          : `${entry.file} renders ${entry.wiredBy}, which wires one of ${(entry.themes ?? []).join(', ')}; doctor could not tell which, because the app imports none of their stylesheets`,
      )
      .join('; ');
    return {
      id: 'themes',
      label,
      status: 'info',
      message: `${shown}.`,
    };
  }
  if (packages.length === 0 && wiredByImport.length > 0) {
    return {
      id: 'themes',
      label,
      status: 'pass',
      message: `Themes wired by import: ${wiredByImportList(wiredByImport)}.`,
    };
  }
  if (packages.length === 0) {
    return {
      id: 'themes',
      label,
      status: 'warn',
      message: 'No @astryxdesign/theme-* packages are installed.',
      fix: themeInstallFix(cwd, run),
    };
  }
  const names = packages.join(', ');
  if (!appPackageNamesTheme(cwd) && wiredByImport.length > 0) {
    return {
      id: 'themes',
      label,
      status: 'pass',
      message: `Theme package(s) installed (${names}); wired by import: ${wiredByImportList(wiredByImport)}.`,
    };
  }
  if (!appPackageNamesTheme(cwd) && traceUnknown.length > 0) {
    const files = traceUnknown.map(({file}) => file).join(', ');
    return {
      id: 'themes',
      label,
      status: 'info',
      message: `Theme package(s) installed (${names}); ${files} pass${traceUnknown.length === 1 ? 'es' : ''} a theme to Theme that doctor could not trace to a theme import, so it could not confirm which theme is wired.`,
      fix: `If no theme is applied, add one with \`${run} theme add <slug>\`.`,
    };
  }
  if (!appPackageNamesTheme(cwd)) {
    return {
      id: 'themes',
      label,
      status: 'warn',
      message: `Theme package(s) installed (${names}) but no theme appears wired.`,
      fix: `Add one to the app with \`${run} theme add <slug>\`.`,
    };
  }
  return {
    id: 'themes',
    label,
    status: 'pass',
    message: `Theme package(s) installed (${names}); wired via package.json astryx.theme.`,
  };
}

/**
 * The app-theme checks with what the wiring scan found: an app with no
 * generated theme module whose theme its integration's provider wires is
 * themed, so the `theme-management` check says so and offers no `theme add`.
 * @param {DoctorCheck[]} appChecks - the checks {@link checkAppThemes} returned
 * @param {{wired: Array<{slug: string, file: string, wiredBy?: string}>}} wiring -
 *   what {@link themeImportWiring} returned
 * @returns {DoctorCheck[]}
 */
export function withProviderWiring(appChecks, wiring) {
  const byProvider = wiring.wired.filter(entry => entry.wiredBy);
  if (byProvider.length === 0) return appChecks;
  const shown = byProvider
    .map(entry => `${entry.slug} is wired by ${entry.wiredBy} in ${entry.file}`)
    .join('; ');
  return appChecks.map(check => {
    if (check.id !== 'theme-management') return check;
    const {fix: _fix, ...rest} = check;
    return {
      ...rest,
      message: `The CLI manages no themes: ${shown}, the provider its package wires its themes with.`,
    };
  });
}

/**
 * The theme input the private-variable check reads. A bundled theme is a copy
 * of its package's source. When the project installs that package, the check
 * reads the package's own copy: the app uses that package, and the copy's
 * imports, such as the theme's icon library, resolve from the package in every
 * install layout. Yarn Plug'n'Play refuses the CLI's copy an import of a
 * package the CLI does not depend on.
 * @param {DiscoveredTheme} theme the discovered theme
 * @param {string} owner the package that the app's theme record names
 * @param {string} projectDir
 * @returns {string}
 */
function privateInputFile(theme, owner, projectDir) {
  const own = path.join(theme.sourceDir, theme.entry);
  if (theme.source !== 'bundled') return own;
  const packageDir = findDoctorInstalledPackage(projectDir, owner);
  const installed = packageDir
    ? path.join(packageDir, 'src', theme.entry)
    : null;
  // The path as found, not its real path: Yarn gives a package with peer
  // dependencies a path of its own, and resolves its imports only from there.
  return installed && realDoctorFile(installed) ? installed : own;
}

/**
 * Run all ten app-theme checks.
 * @param {string} cwd
 * @returns {Promise<DoctorCheck[]>}
 */
export async function checkAppThemes(cwd) {
  let state;
  try {
    state = readThemeState(cwd);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (/No package\.json found/u.test(err.message)) {
      return unavailableChecks('No app theme record found.');
    }
    return unavailableChecks(
      'Skipped because the generated theme module could not be read.',
      err,
    );
  }

  if (!state.configured) {
    try {
      resolveThemeModule(state.projectDir, {forWrite: true});
    } catch (error) {
      return unavailableChecks(
        'Skipped because the generated theme module is unavailable.',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    const run = getCliInvocation(state.projectDir);
    /** @type {DoctorCheck[]} */
    const report = [
      {
        id: 'theme-management',
        label: 'CLI-managed app themes',
        status: 'info',
        message: state.legacyTheme
          ? `The CLI manages no themes. The released package.json astryx.theme value ${JSON.stringify(state.legacyTheme)} remains active.`
          : 'The CLI manages no themes because this project has no generated theme module.',
        fix: `Start managing app themes with \`${run} theme add <slug>\`.`,
      },
    ];
    const migration = unmigratedCopyCheck(state.projectDir);
    if (migration) report.push(migration);
    return report;
  }

  const run = getCliInvocation(state.projectDir);
  const ownerEntries = Object.entries(state.themes);
  /** @type {DiscoveredTheme[]} */
  let available = [];
  let discoveryError = null;
  try {
    available = await discoverDoctorThemes(state.projectDir);
  } catch (error) {
    discoveryError = error instanceof Error ? error : new Error(String(error));
  }

  /** @type {ResolvedAppTheme[]} */
  const resolved = [];
  /** @type {Array<{slug: string, owner: string, message: string}>} */
  const resolutionProblems = [];
  /**
   * Added package themes whose module loads but names a file the package
   * does not ship.
   * @type {Array<{slug: string, owner: string, message: string}>}
   */
  const unshippedImports = [];
  const ownerCounts = new Map();
  for (const theme of available) {
    const owner = themeRecordOwner(theme);
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  if (!discoveryError) {
    for (const [slug, owner] of ownerEntries) {
      const theme = available.find(
        candidate =>
          candidate.slug === slug && themeRecordOwner(candidate) === owner,
      );
      if (!theme) {
        resolutionProblems.push({
          slug,
          owner,
          message: `Theme "${slug}" from ${owner} is unavailable.`,
        });
        continue;
      }
      /** @type {ResolvedAppTheme} */
      let resolvedTheme;
      try {
        resolvedTheme = resolveDoctorThemeImports(theme, {
          cwd: state.projectDir,
          ownerThemeCount: ownerCounts.get(owner) ?? 1,
        });
      } catch (error) {
        resolutionProblems.push({
          slug,
          owner,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      try {
        const loaded = await resolveRecordedTheme(state.projectDir, slug);
        if (!loaded.module) {
          resolutionProblems.push({
            slug,
            owner,
            message: `Theme "${slug}" from ${owner} could not load its built module: ${loaded.problem ?? `${loaded.specifier} does not resolve`}.`,
          });
          continue;
        }
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message.split('\n', 1)[0]?.trim() || error.name
            : String(error);
        resolutionProblems.push({
          slug,
          owner,
          message: `Theme "${slug}" from ${owner} could not load its built module: ${detail}.`,
        });
        continue;
      }
      // Loading the module in Node does not prove an app can build it: a
      // stylesheet loads as an empty module, so its imports are never read.
      // A relative import that names no file the package ships is a warning:
      // the module itself loads.
      const unshipped = themeShippedImportFindings(resolvedTheme);
      if (unshipped.length > 0) {
        unshippedImports.push({
          slug,
          owner,
          message: `Theme "${slug}" from ${owner}: its built module loads, but ${unshipped.some(finding => finding.code === 'relative_import_not_shipped') ? 'it or its stylesheet names a file the package does not ship' : 'it imports TypeScript source'}, so an app's bundler cannot build it: ${unshipped.map(finding => finding.message).join(' ')}`,
        });
      }
      resolved.push(resolvedTheme);
    }
  }

  const incompleteResolution =
    discoveryError != null ||
    resolutionProblems.length > 0 ||
    resolved.length !== ownerEntries.length;

  /** @type {ReturnType<typeof planThemeAppWrite>|null} */
  let prepared = null;
  if (
    !discoveryError &&
    resolutionProblems.length === 0 &&
    resolved.length === ownerEntries.length &&
    state.defaultSlug != null &&
    Object.hasOwn(state.themes, state.defaultSlug)
  ) {
    try {
      prepared = planThemeAppWrite(
        state,
        state.themes,
        state.defaultSlug,
        resolved,
      );
    } catch {
      prepared = null;
    }
  }

  /** @type {DoctorCheck[]} */
  const checks = [];

  if (ownerEntries.length === 0) {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'fail',
      message: 'The generated record has no added themes.',
      fix: `${run} theme add <slug>`,
    });
  } else if (discoveryError) {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'fail',
      message: discoveryError.message,
      // The added theme the broken folder holds, by its name.
      fix: (() => {
        const named = ownerEntries.find(([slug]) =>
          new RegExp(
            `(^|[\\s/"'(])${slug.replace(/[-]/g, '\\-')}([\\s/"').,:]|$)`,
          ).test(discoveryError.message),
        )?.[0];
        if (!named)
          return 'Fix or move what the message names, then run doctor again.';
        // A theme another command generates: that command writes it again
        // (its fix is no `theme build`).
        const owner = String(state.themes[named]);
        const fix = isLocalThemeOwner(owner)
          ? refreshThemeCommand(state.projectDir, run, [], named, owner)
          : null;
        return fix && !fix.includes(' theme build ')
          ? fix
          : `Fix or move what the message names, then run ${run} theme add ${named}`;
      })(),
    });
  } else if (resolutionProblems.length > 0) {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'fail',
      // Themes that one step fixes, such as installing the project's
      // dependencies, say it once.
      message: [
        ...new Set(
          resolutionProblems.map(problem =>
            // A theme another command generates is not rebuilt with `theme
            // build`: its fix names that command, so its message does not.
            refreshThemeCommand(
              state.projectDir,
              run,
              available,
              problem.slug,
              problem.owner,
            ).includes(' theme build ')
              ? problem.message
              : problem.message
                  .replace(/\s*Run `[^`]*theme build[^`]*` and try again\./, '')
                  .replace(/\s*Rebuild it with `[^`]*theme build[^`]*`\.?/, ''),
          ),
        ),
      ].join(' '),
      fix: [
        ...new Set(
          resolutionProblems.map(problem =>
            refreshThemeCommand(
              state.projectDir,
              run,
              available,
              problem.slug,
              problem.owner,
            ),
          ),
        ),
      ].join('; '),
    });
  } else if (unshippedImports.length > 0) {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'warn',
      message: unshippedImports.map(each => each.message).join(' '),
      fix: `Install a release of ${[...new Set(unshippedImports.map(each => each.owner))].join(', ')} that ships every file its built module imports, as JavaScript, or ask its owner to publish one.`,
    });
  } else {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'pass',
      message: `${resolved.length} added theme${resolved.length === 1 ? '' : 's'} resolve to built modules and stylesheets, every built module loads, and every relative import of a package theme names a file its package ships.`,
    });
  }

  const currentModule = state.module.expectedOriginal?.toString('utf-8') ?? '';
  if (!prepared) {
    checks.push({
      id: 'theme-module',
      label: 'Generated theme module',
      status: 'info',
      message:
        'Could not regenerate the module until its owners, imports, and default are valid.',
    });
  } else if (currentModule !== prepared.moduleContents) {
    checks.push({
      id: 'theme-module',
      label: 'Generated theme module',
      status: 'fail',
      message: `${state.module.path} differs from the exact module generated from its own record.`,
      fix: `${run} theme use ${state.defaultSlug}`,
    });
  } else {
    checks.push({
      id: 'theme-module',
      label: 'Generated theme module',
      status: 'pass',
      message: `${state.module.path} has the generated marker and exactly matches its record.`,
    });
  }

  const importEvidence = sourceImportEvidence(
    state.projectDir,
    state.module.file,
  );
  if (importEvidence.found) {
    checks.push({
      id: 'theme-module-import',
      label: 'App imports the theme module',
      status: 'pass',
      message: `Project source imports ${state.module.path}.`,
    });
  } else {
    checks.push({
      id: 'theme-module-import',
      label: 'App imports the theme module',
      status: 'warn',
      message: `Could not prove that project source imports ${state.module.path}${importEvidence.parseFailures ? `; ${importEvidence.parseFailures} source file(s) could not be parsed` : ''}.`,
      fix: `Import {themes, defaultThemeSlug} from the generated module and {Theme} from '@astryxdesign/core/theme', then render <Theme theme={themes[defaultThemeSlug]}>.`,
    });
  }

  if (discoveryError || resolutionProblems.length > 0) {
    checks.push({
      id: 'theme-stylesheet-imports',
      label: 'Built theme stylesheet imports',
      status: 'info',
      message:
        'Could not prove module and stylesheet pairs until every built import resolves.',
    });
  } else {
    const pairEvidence = themeImportPairEvidence(
      state.projectDir,
      state.module.file,
      prepared?.entries ?? resolved,
    );
    if (pairEvidence.unpaired.length > 0) {
      checks.push({
        id: 'theme-stylesheet-imports',
        label: 'Built theme stylesheet imports',
        status: 'fail',
        message: pairEvidence.unpaired
          .map(
            problem =>
              `${problem.file} imports ${problem.slug} without ${problem.stylesheet}`,
          )
          .join('; '),
        fix: `Import the named stylesheet beside each built module, then run ${run} theme use ${state.defaultSlug}.`,
      });
    } else if (pairEvidence.unproven.length > 0) {
      checks.push({
        id: 'theme-stylesheet-imports',
        label: 'Built theme stylesheet imports',
        status: 'info',
        message: `Could not parse theme imports in ${pairEvidence.unproven.join(', ')}.`,
      });
    } else {
      checks.push({
        id: 'theme-stylesheet-imports',
        label: 'Built theme stylesheet imports',
        status: 'pass',
        message:
          'Every added built module import is paired with its stylesheet import.',
      });
    }
  }

  const localThemes = resolved.filter(theme => theme.source === 'local');
  if (incompleteResolution) {
    checks.push({
      id: 'theme-local-builds',
      label: 'Local theme build freshness',
      status: 'info',
      message:
        'Could not check local build freshness until every local output resolves.',
    });
  } else if (localThemes.length > 0 && !findDoctorCoreDir(state.projectDir)) {
    // A build reads Core, and doctor reads only the Core the project
    // installed, never the one the answering copy carries (spec AST-081 FR3).
    checks.push({
      id: 'theme-local-builds',
      label: 'Local theme build freshness',
      status: 'info',
      message:
        "The project's Core isn't installed, so local theme builds were not checked. Install the project's dependencies, then run doctor again.",
    });
  } else if (localThemes.length === 0) {
    checks.push({
      id: 'theme-local-builds',
      label: 'Local theme build freshness',
      status: 'pass',
      message: 'No added local themes need a freshness check.',
    });
  } else {
    const stale = [];
    /** Local themes the build refused for a private var: not checked. */
    /** @type {string[]} */
    const refused = [];
    /** @type {Map<string, string[]>} theme slugs by the package they import and the app lacks */
    const missingPackages = new Map();
    const previousSilent = logger.silent;
    logger.setSilent(true);
    try {
      for (const theme of localThemes) {
        const availableTheme = available.find(
          candidate =>
            candidate.slug === theme.slug &&
            themeRecordOwner(candidate) === theme.owner,
        );
        if (!availableTheme) continue;
        try {
          const sourceFile = path.join(
            availableTheme.sourceDir,
            availableTheme.entry,
          );
          // Every added local theme is compared, a copy another command
          // generates included; only its fix names that command.
          const receipt = await themeBuild(
            sourceFile,
            {check: true},
            {cwd: state.projectDir, projectCore: true},
          );
          if (
            receipt == null ||
            receipt.type !== 'theme.build.check' ||
            !receipt.data.upToDate
          ) {
            stale.push(theme.slug);
          }
        } catch (error) {
          // A theme that sets a private var is the "Private theme
          // variables" check's to report, not a stale output.
          if (isPrivateVarRefusal(error)) {
            refused.push(theme.slug);
            continue;
          }
          const missing = missingThemePackage(error);
          if (missing) {
            missingPackages.set(missing, [
              ...(missingPackages.get(missing) ?? []),
              theme.slug,
            ]);
          } else {
            stale.push(theme.slug);
          }
        }
      }
    } finally {
      logger.setSilent(previousSilent);
    }
    const packages = [...missingPackages.keys()];
    const install =
      packages.length > 0
        ? packageInstallCommand(packages, state.projectDir)
        : null;
    const refresh = stale.map(slug =>
      refreshThemeCommand(
        state.projectDir,
        run,
        available,
        slug,
        state.themes[slug],
      ),
    );
    checks.push(
      packages.length > 0
        ? {
            id: 'theme-local-builds',
            label: 'Local theme build freshness',
            status: 'fail',
            message: `Local themes import packages the app does not have installed, so they cannot build: ${[
              ...missingPackages,
            ]
              .map(([pkg, slugs]) => `${pkg} (${slugs.join(', ')})`)
              .join(
                '; ',
              )}.${stale.length > 0 ? ` Local theme outputs are also missing or stale: ${stale.join(', ')}.` : ''}${refused.length > 0 ? ` Not checked (a private theme variable; see theme-private-variables): ${refused.join(', ')}.` : ''}`,
            fix: [
              install?.installCommand ??
                install?.noCommandReason ??
                `Install ${packages.join(', ')}.`,
              ...refresh,
            ].join(' '),
          }
        : stale.length > 0
          ? {
              id: 'theme-local-builds',
              label: 'Local theme build freshness',
              status: 'fail',
              message: `Local theme outputs are missing or stale: ${stale.join(', ')}.${refused.length > 0 ? ` Not checked (a private theme variable; see theme-private-variables): ${refused.join(', ')}.` : ''}`,
              fix: refresh.join(' '),
            }
          : refused.length > 0
            ? {
                // Not a pass: the build refused these, so their outputs
                // were never compared with their sources.
                id: 'theme-local-builds',
                label: 'Local theme build freshness',
                status: 'info',
                message: `Not checked: ${refused.join(', ')} ${refused.length === 1 ? 'sets' : 'set'} a private theme variable, so the build refuses ${refused.length === 1 ? 'it' : 'them'} and ${refused.length === 1 ? 'its' : 'their'} outputs were not compared with ${refused.length === 1 ? 'its source' : 'their sources'}.`,
                fix: 'Follow the fix on the theme-private-variables check, then run doctor again.',
              }
            : {
                id: 'theme-local-builds',
                label: 'Local theme build freshness',
                status: 'pass',
                message: 'Every added local theme output matches its source.',
              },
    );
  }

  // The inputs load with Core, and doctor reads only the Core the project
  // installed, never the one the answering copy carries.
  const privateCoreMissing =
    !incompleteResolution &&
    resolved.length > 0 &&
    !findDoctorCoreDir(state.projectDir);
  const privateProblems = [];
  for (const theme of privateCoreMissing ? [] : resolved) {
    const availableTheme = available.find(
      candidate =>
        candidate.slug === theme.slug &&
        themeRecordOwner(candidate) === theme.owner,
    );
    if (!availableTheme) continue;
    try {
      const errors = await validateThemePrivateInputs(
        privateInputFile(availableTheme, theme.owner, state.projectDir),
        {cwd: state.projectDir},
      );
      if (errors.length > 0) {
        privateProblems.push({theme, message: errors.join('; ')});
      }
    } catch (error) {
      privateProblems.push({
        theme,
        message: `input could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  checks.push(
    incompleteResolution
      ? {
          id: 'theme-private-variables',
          label: 'Private theme variables',
          status: 'info',
          message:
            'Could not inspect every theme input until built imports resolve.',
        }
      : privateCoreMissing
        ? {
            id: 'theme-private-variables',
            label: 'Private theme variables',
            status: 'info',
            message:
              "The project's Core isn't installed, so theme inputs were not checked for private variables. Install the project's dependencies, then run doctor again.",
          }
        : privateProblems.length > 0
          ? {
              id: 'theme-private-variables',
              label: 'Private theme variables',
              status: 'fail',
              message: `Added theme inputs set private --_* variables directly (${privateProblems
                .map(problem => `${problem.theme.slug}: ${problem.message}`)
                .join('; ')}).`,
              fix: `Remove the direct private input keys, then ${privateProblems
                .map(problem =>
                  refreshThemeCommand(
                    state.projectDir,
                    run,
                    available,
                    problem.theme.slug,
                    problem.theme.owner,
                  ),
                )
                .join(' ')}`,
            }
          : {
              id: 'theme-private-variables',
              label: 'Private theme variables',
              status: 'pass',
              message:
                'No added theme input sets a private --_* variable directly.',
            },
  );

  const coreDir = findDoctorCoreDir(state.projectDir);
  const coreVersion = coreDir
    ? readPackageVersion(path.join(coreDir, 'package.json'))
    : null;
  const peerProblems = [];
  for (const [slug, owner] of ownerEntries) {
    if (isLocalThemeOwner(owner)) continue;
    const packageDir = findDoctorInstalledPackage(state.projectDir, owner);
    const pkg = packageDir
      ? readPackageJson(path.join(packageDir, 'package.json'))
      : null;
    const {range, accepts} = corePeerRange(pkg, coreVersion);
    if (!accepts) {
      peerProblems.push({
        slug,
        owner,
        range,
        message: `${slug}: ${owner} requires ${range ?? 'an undeclared Core range'}, installed ${coreVersion ?? 'none'}`,
      });
    }
  }
  checks.push(
    incompleteResolution
      ? {
          id: 'theme-core-peers',
          label: 'Theme Core peer compatibility',
          status: 'info',
          message:
            'Could not prove Core peer compatibility until every added theme resolves.',
        }
      : peerProblems.length > 0
        ? {
            id: 'theme-core-peers',
            label: 'Theme Core peer compatibility',
            status: 'fail',
            message: peerProblems.map(problem => problem.message).join('; '),
            fix: peerProblems
              .map(problem =>
                problem.range
                  ? `${coreAddCommand(state.projectDir, problem.range)}; ${run} doctor`
                  : refreshThemeCommand(
                      state.projectDir,
                      run,
                      available,
                      problem.slug,
                      problem.owner,
                    ),
              )
              .join(' '),
          }
        : {
            id: 'theme-core-peers',
            label: 'Theme Core peer compatibility',
            status: 'pass',
            message:
              'Every added package theme accepts the installed @astryxdesign/core version.',
          },
  );

  const validDefault =
    state.defaultSlug != null && Object.hasOwn(state.themes, state.defaultSlug);
  checks.push(
    validDefault
      ? {
          id: 'theme-default',
          label: 'Default added theme',
          status: 'pass',
          message: `Default theme "${state.defaultSlug}" is added.`,
        }
      : {
          id: 'theme-default',
          label: 'Default added theme',
          status: 'fail',
          message: `Default theme "${state.defaultSlug ?? ''}" is not one of the added themes.`,
          fix:
            ownerEntries.length > 0
              ? `${run} theme use ${ownerEntries[0][0]}`
              : `${run} theme add <slug>`,
        },
  );

  const fontFailures = [];
  const externalFontWarnings = [];
  /** Families behind a local font import doctor could not follow. */
  const unreadFontWarnings = [];
  const missingFontWarnings = [];
  let generatedImports = null;
  try {
    generatedImports = moduleSpecifiers(currentModule);
  } catch {
    // The generated-module check owns the parse failure. This check stays
    // evidence-driven and refuses to pass without readable imports.
  }
  /** @param {(typeof resolved)[number]} theme */
  const importedEntry = theme =>
    prepared?.entries.find(entry => entry.slug === theme.slug) ?? theme;
  // A family that any font stylesheet the module imports loads is loaded for
  // every added theme: a theme that extends another, such as a local fork of
  // neutral, names the families its parent's stylesheet loads.
  const moduleLoaded = new Set();
  /**
   * What each imported font stylesheet loads, by its theme; null for one that
   * cannot be parsed, which the theme's own pass below reports.
   * @type {Map<(typeof resolved)[number], ReturnType<typeof fontStylesheetEvidence> | null>}
   */
  const importedEvidence = new Map();
  for (const theme of resolved) {
    const {fontStylesheet} = importedEntry(theme);
    if (!theme.fontStylesheetFile || !fontStylesheet) continue;
    if (!generatedImports?.has(fontStylesheet)) continue;
    try {
      const evidence = fontStylesheetEvidence(
        readTextFile(theme.fontStylesheetFile),
        theme.fontStylesheetFile,
      );
      importedEvidence.set(theme, evidence);
      for (const family of evidence.loaded) moduleLoaded.add(family);
    } catch {
      importedEvidence.set(theme, null);
    }
  }
  for (const theme of resolved) {
    const availableTheme = available.find(
      candidate =>
        candidate.slug === theme.slug &&
        themeRecordOwner(candidate) === theme.owner,
    );
    const files = [theme.moduleFile];
    if (availableTheme) {
      files.push(path.join(availableTheme.sourceDir, availableTheme.entry));
    }
    const named = namedThemeFonts(files);
    if (named.size === 0) continue;
    if (importedEvidence.get(theme) === null) {
      fontFailures.push({
        theme,
        message: 'font stylesheet could not be parsed',
      });
      continue;
    }
    const names = [...named].filter(
      name => !moduleLoaded.has(name.toLowerCase()),
    );
    if (names.length === 0) continue;
    const importedTheme = importedEntry(theme);
    if (!theme.fontStylesheetFile || !importedTheme.fontStylesheet) {
      const problem = {
        theme,
        message: `${names.join(', ')} (font stylesheet is not imported)`,
      };
      missingFontWarnings.push(problem);
      continue;
    }
    if (!generatedImports?.has(importedTheme.fontStylesheet)) {
      fontFailures.push({
        theme,
        message: `${names.join(', ')} (font stylesheet is not imported)`,
      });
      continue;
    }
    const evidence = importedEvidence.get(theme);
    if (!evidence) continue;
    const missing = names.filter(
      name => !evidence.loaded.has(name.toLowerCase()),
    );
    if (missing.length === 0) continue;
    if (evidence.external) {
      externalFontWarnings.push(`${theme.slug}: ${missing.join(', ')}`);
    } else if (evidence.unread) {
      unreadFontWarnings.push(`${theme.slug}: ${missing.join(', ')}`);
    } else {
      fontFailures.push({theme, message: missing.join(', '), missing});
    }
  }
  const fontWarningMessages = [];
  const fontWarningFixes = [];
  if (missingFontWarnings.length > 0) {
    fontWarningMessages.push(
      `Added themes name font families but import no font stylesheet (${missingFontWarnings
        .map(problem => `${problem.theme.slug}: ${problem.message}`)
        .join('; ')}).`,
    );
    const localWarnings = missingFontWarnings.filter(
      problem => problem.theme.source === 'local',
    );
    const packageWarnings = missingFontWarnings.filter(
      problem => problem.theme.source !== 'local',
    );
    if (localWarnings.length > 0) {
      fontWarningFixes.push(
        `Add <slug>.fonts.css beside each built local theme output, then ${localWarnings
          .map(problem => `${run} theme add ${problem.theme.slug}`)
          .join('; ')}.`,
      );
    }
    if (packageWarnings.length > 0) {
      fontWarningFixes.push(
        'Load the named package fonts in app HTML, or install a package version that exports <slug>.fonts.css (or fonts.css for a single-theme package).',
      );
    }
  }
  if (unreadFontWarnings.length > 0) {
    fontWarningMessages.push(
      `Font imports doctor could not follow prevent proof for ${unreadFontWarnings.join('; ')}.`,
    );
  }
  if (externalFontWarnings.length > 0) {
    fontWarningMessages.push(
      `External font imports prevent proof for ${externalFontWarnings.join('; ')}.`,
    );
    fontWarningFixes.push(
      'Confirm the font service stylesheet loads each named family.',
    );
  }
  // A family with no loader in a stylesheet the app imports loads once
  // the package that loads it is installed and the theme's stylesheet is
  // written again, so the fix names that package when a known one loads
  // it; a self-hosted family keeps the stylesheet step.
  const fontInstall = fontFailures.some(f => f.missing)
    ? await fontPackagesInstallLine(
        state.projectDir,
        fontFailures.flatMap(f => f.missing ?? []),
      )
    : {line: null, coversAll: false};
  checks.push(
    incompleteResolution
      ? {
          id: 'theme-fonts',
          label: 'Theme font loading',
          status: 'info',
          message:
            'Could not prove font loading until every added theme resolves.',
        }
      : fontFailures.length > 0
        ? {
            id: 'theme-fonts',
            label: 'Theme font loading',
            status: 'fail',
            message: `Named font families have no proven loader (${fontFailures
              .map(problem => `${problem.theme.slug}: ${problem.message}`)
              .join('; ')}).`,
            fix: `${
              fontInstall.line &&
              fontInstall.coversAll &&
              fontFailures.every(f => f.missing)
                ? `Install the packages that load them (${fontInstall.line})`
                : `Add the missing font stylesheet export or local <slug>.fonts.css${fontInstall.line ? ` (${fontInstall.line} installs the packages that load the open fonts among them)` : ''}`
            }, then ${fontFailures
              .map(problem =>
                refreshThemeCommand(
                  state.projectDir,
                  run,
                  available,
                  problem.theme.slug,
                  problem.theme.owner,
                ),
              )
              .join(' ')}`,
          }
        : fontWarningMessages.length > 0
          ? {
              id: 'theme-fonts',
              label: 'Theme font loading',
              status: 'warn',
              message: fontWarningMessages.join(' '),
              fix: fontWarningFixes.join(' '),
            }
          : {
              id: 'theme-fonts',
              label: 'Theme font loading',
              status: 'pass',
              message:
                'Every named non-system font is loaded by an @font-face rule or a font service URL that names it.',
            },
  );

  const globalBySelector = new Map();
  const globalProblems = [];
  for (const theme of resolved) {
    try {
      for (const [selector, declarations] of globalRules(
        readTextFile(theme.stylesheetFile),
        theme.slug,
      )) {
        const prior = globalBySelector.get(selector);
        if (prior && prior.declarations !== declarations) {
          globalProblems.push({
            message: `${selector}: ${prior.theme.slug}, ${theme.slug}`,
            themes: [prior.theme, theme],
          });
        } else if (!prior) {
          globalBySelector.set(selector, {theme, declarations});
        }
      }
    } catch {
      globalProblems.push({
        message: `${theme.slug}: stylesheet could not be parsed`,
        themes: [theme],
      });
    }
  }
  /** @type {Map<string, ResolvedAppTheme>} */
  const globalRepairThemes = new Map();
  for (const problem of globalProblems) {
    for (const theme of problem.themes) {
      globalRepairThemes.set(`${theme.owner}\u0000${theme.slug}`, theme);
    }
  }
  checks.push(
    incompleteResolution
      ? {
          id: 'theme-global-rules',
          label: 'Cross-theme global CSS rules',
          status: 'info',
          message:
            'Could not compare global CSS until every added stylesheet resolves.',
        }
      : globalProblems.length > 0
        ? {
            id: 'theme-global-rules',
            label: 'Cross-theme global CSS rules',
            status: 'fail',
            message: `Added themes write different global rules for the same selector (${globalProblems
              .map(problem => problem.message)
              .join('; ')}).`,
            fix: `Scope each conflicting rule under its [data-astryx-theme] selector, then ${[
              ...globalRepairThemes.values(),
            ]
              .map(theme =>
                refreshThemeCommand(
                  state.projectDir,
                  run,
                  available,
                  theme.slug,
                  theme.owner,
                ),
              )
              .join(' ')}`,
          }
        : {
            id: 'theme-global-rules',
            label: 'Cross-theme global CSS rules',
            status: 'pass',
            message:
              'No added themes write different rules for the same selector outside their own scope.',
          },
  );

  const migration = unmigratedCopyCheck(state.projectDir);
  if (migration) checks.push(migration);
  return checks;
}

/** @param {string} file */
function readPackageVersion(file) {
  const pkg = readPackageJson(file);
  return typeof pkg?.version === 'string' ? pkg.version : null;
}
