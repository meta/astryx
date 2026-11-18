// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Positive-evidence checks for the app theme record.
 *
 * Each AST-050 check has its own stable result. Missing app-theme state is
 * informational. A check passes only after its specific evidence is read.
 */

import {
  STYLESHEET_FILE,
  isOtherLanguageStylesheet,
} from '../../foundation/fs/stylesheet-file.mjs';
import * as path from 'node:path';
import {babelParse as parse} from '../../foundation/runtime/lazy-dependencies.mjs';
import {
  postcss,
  selectorParser,
} from '../../foundation/runtime/lazy-dependencies.mjs';
import {
  UNREAD_HREF,
  linksPackageStylesheet,
  stylesheetLinkHrefs,
} from './built-checks.mjs';
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
  doctorColorReaders,
  doctorOutermostElements,
  doctorPackageStylesheets,
  doctorResolveLocalModule,
  doctorRendersElement,
  doctorStylesheetImports,
  findDoctorInstalledPackage,
  fontServiceFamilies,
  realDoctorFile,
  isLocalThemeOwner,
  listDoctorThemePackages,
  doctorRootConfigStrings,
  doctorResolvePackageEntry,
  walkProjectSourceFiles,
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
import {settingIssueLocation} from '../theme/build/setting-effects.mjs';
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
  ['theme-setting-effects', 'Theme settings that show'],
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
 * The string values a source file holds, object keys included, read from its
 * syntax tree, so a commented-out copy never counts. A config names a plugin
 * package this way (`plugins: {'@acme/postcss': {}}`).
 * @param {string} source
 * @returns {Set<string>}
 */
export function stringValues(source) {
  const values = new Set();
  walkAst(parseModule(source), node => {
    if (node.type === 'StringLiteral') values.add(node.value);
    if (
      node.type === 'TemplateLiteral' &&
      node.expressions?.length === 0 &&
      typeof node.quasis?.[0]?.value?.cooked === 'string'
    ) {
      values.add(node.quasis[0].value.cooked);
    }
  });
  return values;
}

/**
 * The module specifiers a source file imports, re-exports, or loads with
 * `import()` or `require()`, read from its syntax tree, so a commented-out
 * or quoted copy never counts.
 * @param {string} source
 * @param {{runtimeOnly?: boolean}} [options] - skip type-only imports and
 *   re-exports, which the build erases
 */
export function moduleSpecifiers(source, options = {}) {
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

/**
 * A known font service's stylesheet URL, whose `family=` names the families
 * it loads (Google Fonts, and Bunny Fonts, which serves the same API).
 */
const FONT_SERVICE_HREF =
  /^(?:https?:)?\/\/fonts\.(?:googleapis\.com|bunny\.net)\/css2?\?/iu;

/** The app's page files a font `<link>` goes in, in the order frameworks keep them. */
const PAGE_HEAD_FILES = [
  'index.html',
  'public/index.html',
  'src/index.html',
  ...[
    'app/layout',
    'src/app/layout',
    'pages/_document',
    'src/pages/_document',
  ].flatMap(file =>
    ['.tsx', '.jsx', '.js', '.mjs', '.ts'].map(ext => `${file}${ext}`),
  ),
];

/**
 * The font families the app's page head loads through a font service
 * `<link>`, and the page file that holds its head (the first of the page
 * files that exists), relative to the project.
 * @param {string} projectDir
 * @returns {{families: Set<string>, head: string | null}}
 */
function pageFontLinks(projectDir) {
  /** @type {Set<string>} */
  const families = new Set();
  /** @type {string | null} */
  let head = null;
  for (const name of PAGE_HEAD_FILES) {
    const file = path.join(projectDir, name);
    const source = readTextFileIfExists(file);
    if (source == null) continue;
    head ??= name;
    const hrefs = /\.html?$/i.test(name)
      ? stylesheetLinkHrefs(source)
      : jsxStylesheetHrefs(source);
    for (const href of hrefs) {
      if (!FONT_SERVICE_HREF.test(href)) continue;
      for (const family of fontServiceFamilies(href)) families.add(family);
    }
  }
  return {families, head};
}

/**
 * The `href` of every stylesheet `<link>` a layout module renders, read from
 * its syntax tree, so a link in any comment never counts. Only string
 * attribute values are read; a `rel` must be the word `stylesheet`.
 * @param {string} source
 * @returns {string[]}
 */
function jsxStylesheetHrefs(source) {
  let ast;
  try {
    ast = parseModule(source);
  } catch {
    return [];
  }
  /** @param {any} attribute @returns {string | null} */
  const text = attribute => {
    const v = attribute?.value;
    if (v?.type === 'StringLiteral') return v.value;
    const e = v?.type === 'JSXExpressionContainer' ? v.expression : null;
    if (e?.type === 'StringLiteral') return e.value;
    if (e?.type === 'TemplateLiteral' && !e.expressions.length)
      return e.quasis[0]?.value?.cooked ?? null;
    return null;
  };
  /** @type {string[]} */
  const out = [];
  walkAst(ast, node => {
    if (
      node.type !== 'JSXOpeningElement' ||
      node.name?.type !== 'JSXIdentifier' ||
      node.name.name !== 'link'
    )
      return;
    /** @param {string} name */
    const attr = name =>
      text(
        (node.attributes ?? []).find(
          (/** @type {any} */ a) =>
            a.type === 'JSXAttribute' && a.name?.name === name,
        ),
      );
    const rel = attr('rel');
    const href = attr('href');
    if (
      href &&
      rel &&
      rel.split(/\s+/u).some(word => /^stylesheet$/iu.test(word))
    )
      out.push(href);
  });
  return out;
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
 * descriptors. This is a migration notice, not one of the eleven setup checks.
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
 * The fix line for a project with no installed theme: the install guidance
 * its integrations give, else the install command in the project's package
 * manager, or `npm install` with a note when its lockfiles disagree.
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
 * Run all twelve app-theme checks.
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
          // Each cause the findings hold is named: a theme can have both.
          message: `Theme "${slug}" from ${owner}: its built module loads, but ${[
            ...(unshipped.some(
              finding => finding.code === 'relative_import_not_shipped',
            )
              ? ['it or its stylesheet names a file the package does not ship']
              : []),
            ...(unshipped.some(
              finding => finding.code === 'built_module_imports_typescript',
            )
              ? ['it imports TypeScript source']
              : []),
          ].join(
            ', and ',
          )}, so an app's bundler cannot build it: ${unshipped.map(finding => finding.message).join(' ')}`,
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
  /**
   * What each local theme's build check says does not show as written (the
   * `settingIssues` of `theme build --check`), and whether the checks ran.
   * @type {Array<{slug: string, issues: Array<{message: string, fix: string, line: number | null, file?: string}>}>}
   */
  const settingIssuesByTheme = [];
  /** The local themes whose build check returned a receipt. @type {Set<string>} */
  const settingsChecked = new Set();
  /** Why a local theme's build check did not run, by its slug. @type {Map<string, string>} */
  const uncheckedWhy = new Map();
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
    for (const theme of localThemes)
      uncheckedWhy.set(theme.slug, "the project's Core isn't installed");
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
          if (receipt?.type === 'theme.build.check') {
            settingsChecked.add(theme.slug);
            const issues = /** @type {any} */ (receipt).data.settingIssues;
            if (Array.isArray(issues) && issues.length > 0)
              settingIssuesByTheme.push({slug: theme.slug, issues});
          }
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
            uncheckedWhy.set(theme.slug, 'it sets a private variable');
            continue;
          }
          const missing = missingThemePackage(error);
          // What the build said: the first line of its refusal.
          const said = String(
            /** @type {any} */ (error)?.message ?? error,
          ).split('\n')[0];
          uncheckedWhy.set(
            theme.slug,
            missing
              ? `it imports ${missing}, which the project lacks`
              : `the build refused it: ${said.replace(/\.$/, '')}`,
          );
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
              install?.installGuidance ??
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

  // Each setting of an added local theme the browser does not show as
  // written, as its build check reports it: a warning with the theme, the
  // setting and the fix, never a failure (the theme builds as before). It
  // passes only when every local theme's build check ran.
  const settingIssueCount = settingIssuesByTheme.reduce(
    (n, t) => n + t.issues.length,
    0,
  );
  // Each local theme whose build check did not run, with why (the cause
  // the freshness check names).
  const unchecked = localThemes
    .map(theme => theme.slug)
    .filter(slug => !settingsChecked.has(slug))
    .map(
      slug =>
        `${slug} (${uncheckedWhy.get(slug) ?? 'its build check returned no result'})`,
    );
  const uncheckedNote =
    unchecked.length > 0
      ? `Not checked, because ${unchecked.length === 1 ? 'its build check' : 'their build checks'} did not run: ${unchecked.join('; ')}.`
      : '';
  checks.push(
    settingIssueCount > 0
      ? {
          id: 'theme-setting-effects',
          label: 'Theme settings that show',
          status: 'warn',
          message: `${settingIssueCount} ${settingIssueCount === 1 ? 'setting does' : 'settings do'} not show as written: ${settingIssuesByTheme
            .flatMap(t =>
              t.issues.map(
                i => `${t.slug}: ${i.message}${settingIssueLocation(i)}`,
              ),
            )
            .join('; ')}.${uncheckedNote ? ` ${uncheckedNote}` : ''}`,
          fix: `${settingIssuesByTheme
            .flatMap(t => t.issues.map(i => `${t.slug}: ${i.fix}`))
            .join('; ')}.`,
        }
      : incompleteResolution || unchecked.length > 0
        ? {
            id: 'theme-setting-effects',
            label: 'Theme settings that show',
            status: 'info',
            message: incompleteResolution
              ? 'Could not check that each local theme setting shows until every local output resolves.'
              : uncheckedNote,
          }
        : {
            id: 'theme-setting-effects',
            label: 'Theme settings that show',
            status: 'pass',
            message:
              localThemes.length > 0
                ? 'Every setting of the added local themes shows as written.'
                : 'No added local themes to check.',
          },
  );

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
  // A font service stylesheet the app links in its page head (the setup a
  // theme's README gives) loads its families for every added theme.
  const pageFonts = pageFontLinks(state.projectDir);
  for (const family of pageFonts.families) moduleLoaded.add(family);
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
        `Add the theme's font <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…"> to the <head> of ${pageFonts.head ?? "the app's HTML page (index.html, or the root layout)"}, as the theme's README gives it, or install a package version that exports <slug>.fonts.css (or fonts.css for a single-theme package).`,
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

  const pageCheck = oneModePageCheck(
    state.projectDir,
    resolved.find(theme => theme.slug === state.defaultSlug) ?? null,
    await doctorColorReaders(),
    // (The registered themes' own stylesheets set tokens in their scope and
    // paint no host page.)
    new Set(
      resolved.flatMap(theme => [
        theme.stylesheet,
        ...(theme.fontStylesheet ? [theme.fontStylesheet] : []),
      ]),
    ),
  );
  if (pageCheck) checks.push(pageCheck);

  const migration = unmigratedCopyCheck(state.projectDir);
  if (migration) checks.push(migration);
  return checks;
}

/**
 * A fixed CSS color's lightness side, in any syntax the shared color parser
 * reads (hex, rgb(), hsl(), oklch(), …): true for a light color, false for a
 * dark one, null for a value with no fixed color.
 * @param {string} value
 * @param {Awaited<ReturnType<typeof doctorColorReaders>>} readers
 * @returns {boolean | null}
 */
function lightSide(value, readers) {
  const rgb = readers.parseColor(value);
  return rgb ? readers.luminance(readers.hex(rgb)) > 0.18 : null;
}

/**
 * Whether a project file, by its path inside the project, is a story or a
 * test: a `*.stories.*`, `*.story.*`, `*.test.*` or `*.spec.*` module, or one
 * in a `__tests__`, `__stories__` or `stories` folder.
 * @param {string} rel
 */
function storyOrTest(rel) {
  return (
    /\.(?:stories|story|test|spec)\.\w+$/u.test(rel) ||
    /(?:^|[\\/])(?:__tests__|__stories__|stories)[\\/]/u.test(rel)
  );
}

/**
 * Whether a relative specifier a project file names is a stylesheet the
 * page sweep does not read: "read" means in the walked file set, so one
 * outside the project, under a folder the walk skips (`node_modules`, a
 * build output) or behind a link is not.
 * @param {string} spec
 * @param {{file: string, projectDir: string, walked: Set<string>}} where
 */
function leavesProject(spec, where) {
  if (!spec.startsWith('.')) return false;
  return !where.walked.has(path.resolve(path.dirname(where.file), spec));
}

/**
 * A stylesheet a page links: one doctor does not read (a CDN or package
 * sheet) may paint the page; Astryx's own, the registered themes', a font
 * service's and the project's own files (read by the sweep) do not.
 * @param {string} href
 * @param {Set<string>} themeStylesheets
 * @param {{file: string, projectDir: string, walked: Set<string>}} [where] the file that links
 *   it, inside its project: a relative path out of the project is not read
 * @returns {PageVerdict}
 */
function linkedSheetVerdict(href, themeStylesheets, where) {
  if (href === UNREAD_HREF) return 'unknown';
  const value = href.replace(/[?#].*$/u, '');
  if (where && leavesProject(value, where)) return 'unknown';
  if (/^(?:https?:)?\/\/fonts\.(?:googleapis\.com|bunny\.net)\//i.test(value))
    return 'not';
  if (/@astryxdesign\//.test(value)) return 'not';
  if (
    [...themeStylesheets].some(sheet =>
      value.endsWith(sheet.replace(/^\.\//, '')),
    )
  )
    return 'not';
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return 'unknown';
  if (/(?:^|\/)node_modules\//.test(value)) return 'unknown';
  if (!where) return 'not';
  // (Read only when it is a file the sweep walked: a page's path is
  // relative to the page, or, from `/`, to the project or its public
  // folder.)
  return walkedSheet(value, where) ? 'not' : 'unknown';
}

/**
 * A stylesheet path a project file or config names, relative to the file or
 * to the project root: read when the sweep walked it, else may paint (a
 * package's, a URL, a file the walk skips).
 * @param {string} value
 * @param {{file: string, projectDir: string, walked: Set<string>}} where
 * @returns {PageVerdict}
 */
function stylesheetPathVerdict(value, where) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) {
    return /^(?:https?:)?\/\/fonts\.(?:googleapis\.com|bunny\.net)\//i.test(
      value,
    )
      ? 'not'
      : 'unknown';
  }
  const rooted = value.replace(/^\/+/, '');
  return walkedSheet(value, where) ||
    where.walked.has(path.resolve(where.projectDir, rooted))
    ? 'not'
    : 'unknown';
}

/**
 * Whether a stylesheet path a project file names is one of the files the
 * page sweep walked.
 * @param {string} value
 * @param {{file: string, projectDir: string, walked: Set<string>}} where
 */
function walkedSheet(value, where) {
  const candidates = value.startsWith('/')
    ? [
        path.join(where.projectDir, value),
        path.join(where.projectDir, 'public', value),
      ]
    : [path.resolve(path.dirname(where.file), value)];
  return candidates.some(c => where.walked.has(c));
}

/**
 * What a module does with the page apart from its root Theme: a package
 * stylesheet it imports (other than Astryx's own) may paint it; a `<body>`
 * or `<html>` element it renders paints it by its own attributes.
 * @param {string} source
 * @param {Set<string>} themeStylesheets the registered themes' stylesheets
 * @param {{file: string, projectDir: string, walked: Set<string>}} where the module, in its project
 * @returns {PageVerdict}
 */
function modulePageVerdict(source, themeStylesheets, where) {
  /** @type {PageVerdict[]} */
  const verdicts = [];
  let specs;
  try {
    specs = moduleSpecifiers(source);
  } catch {
    // (A module doctor cannot parse may load anything.)
    return 'unknown';
  }
  for (const raw of specs) {
    const spec = String(raw).replace(/[?#].*$/u, '');
    // (A package whose entry is a stylesheet, `@picocss/pico`: resolved
    // from the project, as the bundler does.)
    if (
      !/^[./]/.test(spec) &&
      !/^@astryxdesign\//.test(spec) &&
      !/\.[a-z]+$/i.test(spec) &&
      STYLESHEET_FILE.test(doctorResolvePackageEntry(where.projectDir, spec))
    ) {
      verdicts.push('unknown');
      continue;
    }
    if (
      STYLESHEET_FILE.test(spec) &&
      (spec.startsWith('.')
        ? leavesProject(spec, where)
        : spec.startsWith('/')
          ? !walkedSheet(spec, where)
          : !/^@astryxdesign\//.test(spec) && !themeStylesheets.has(spec))
    )
      verdicts.push('unknown');
  }
  for (const href of stylesheetLinkHrefs(source))
    verdicts.push(linkedSheetVerdict(href, themeStylesheets, where));
  if (PRELOADED_STYLE.test(source)) verdicts.push('unknown');
  // (A stylesheet path a module names as a string, a bundler's entry or a
  // config's list (`vite.config`, `webpack.config`): read when it is a file
  // the sweep walked, from the module or the project root; else it may
  // paint.)
  if (
    (
      source.match(/['"`][^'"`\n]*\.[a-z]+(?:[?#][^'"`\n]*)?['"`]/gi) ?? []
    ).some(quoted =>
      STYLESHEET_FILE.test(quoted.slice(1, -1).replace(/[?#].*$/u, '')),
    )
  )
    try {
      walkAst(parseModule(source), node => {
        // (A template with a value in it that names a stylesheet, a
        // `import(\`${kit}/base.css\`)`, is a sheet doctor cannot name.)
        if (node.type === 'TemplateLiteral' && node.expressions.length) {
          const joined = node.quasis
            .map((/** @type {any} */ q) => q.value?.cooked ?? '')
            .join('x')
            .replace(/[?#].*$/u, '');
          if (STYLESHEET_FILE.test(joined)) verdicts.push('unknown');
          return;
        }
        const text =
          node.type === 'StringLiteral'
            ? node.value
            : node.type === 'TemplateLiteral'
              ? (node.quasis[0]?.value?.cooked ?? '')
              : null;
        if (text == null) return;
        const value = text.replace(/[?#].*$/u, '');
        if (!STYLESHEET_FILE.test(value) || /\s/.test(value)) return;
        if (/^@astryxdesign\//.test(value) || themeStylesheets.has(value))
          return;
        verdicts.push(stylesheetPathVerdict(value, where));
      });
    } catch {
      verdicts.push('unknown');
    }
  // (A route's `links()` descriptors, as Remix and React Router write them:
  // a stylesheet entry's `href`, a string read like a <link>, anything else
  // unread.)
  if (/\brel\s*:\s*['"`]stylesheet['"`]/.test(source)) {
    try {
      walkAst(parseModule(source), node => {
        if (node.type !== 'ObjectExpression') return;
        /** @param {string} key */
        const prop = key =>
          node.properties.find(
            (/** @type {any} */ p) =>
              p.type === 'ObjectProperty' &&
              (p.key?.name ?? p.key?.value) === key,
          )?.value;
        const rel = prop('rel');
        if (rel?.type !== 'StringLiteral' || rel.value !== 'stylesheet') return;
        const href = prop('href');
        verdicts.push(
          href?.type === 'StringLiteral'
            ? linkedSheetVerdict(href.value, themeStylesheets, where)
            : href?.type === 'TemplateLiteral' && !href.expressions.length
              ? linkedSheetVerdict(
                  href.quasis[0]?.value?.cooked ?? '',
                  themeStylesheets,
                  where,
                )
              : 'unknown',
        );
      });
    } catch {
      verdicts.push('unknown');
    }
  }
  if (/<(?:body|html)\b/.test(source)) {
    try {
      walkAst(parseModule(source), node => {
        if (
          node.type === 'JSXOpeningElement' &&
          node.name?.type === 'JSXIdentifier' &&
          (node.name.name === 'body' || node.name.name === 'html')
        )
          verdicts.push(ownBackground(node));
      });
    } catch {
      verdicts.push('unknown');
    }
  }
  return combineVerdicts(verdicts);
}

/** The attribute Core's root `Theme` writes on `<html>`. */
const THEME_ROOT_ATTRIBUTE = 'data-astryx-theme';

/** Sub-blocks of at-rules CSS defines: `@font-feature-values` and page margins. */
const CSS_NESTED_AT_RULES = new Set([
  'swash',
  'annotation',
  'ornaments',
  'stylistic',
  'styleset',
  'character-variant',
  'historical-forms',
  'top-left-corner',
  'top-left',
  'top-center',
  'top-right',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'bottom-right-corner',
  'left-top',
  'left-middle',
  'left-bottom',
  'right-top',
  'right-middle',
  'right-bottom',
]);

/**
 * The full selectors of a postcss rule, its nesting resolved: a nested
 * rule's `&` is its parent's selector, and one without `&` is a descendant
 * of it.
 * @param {any} rule
 * @returns {string[]}
 */
function fullSelectors(rule) {
  /** @type {string[]} */
  let out = rule.selectors.map((/** @type {string} */ x) => x.trim());
  for (let p = rule.parent; p; p = p.parent) {
    if (p.type !== 'rule') continue;
    const parents = p.selectors.map((/** @type {string} */ x) => x.trim());
    out = parents.flatMap((/** @type {string} */ parent) =>
      out.map(child =>
        child.includes('&')
          ? child.replace(/&/g, parent)
          : `${parent} ${child}`,
      ),
    );
  }
  return out;
}

/**
 * What the project shows is on the elements that can be the page or cover
 * it: `<html>`, `<body>`, the mount node between them and the app, the
 * element the root `Theme` wraps and its direct children. A part of a
 * selector proves a rule cannot paint the page only when this census shows
 * it is on none of them. A facet doctor cannot read (a component child, a
 * class from an expression, a mount node no page shows) is open: nothing in
 * it proves.
 * @typedef {{tags: Set<string>, classes: Set<string>, ids: Set<string>,
 *   attrs: Set<string>, open: {tags: boolean, classes: boolean, ids: boolean,
 *   attrs: boolean}, mountKnown: boolean}} PageCensus
 */

/** @returns {PageCensus} */
function newPageCensus() {
  return {
    tags: new Set(['html', 'body']),
    classes: new Set(),
    ids: new Set(),
    // (What Core's root `Theme` and the page write on `<html>`.)
    attrs: new Set(['class', 'style', 'id', 'dir', 'lang', 'data-theme']),
    open: {tags: false, classes: false, ids: false, attrs: false},
    mountKnown: false,
  };
}

/** @param {PageCensus} census */
function openCensus(census) {
  census.open = {tags: true, classes: true, ids: true, attrs: true};
}

/**
 * Records a JSX opening element in the census: its tag, id, classes and
 * attribute names; what doctor cannot read opens that facet.
 * @param {any} opening
 * @param {PageCensus} census
 */
function censusJsxElement(opening, census) {
  const name = opening?.name;
  if (name?.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) {
    openCensus(census);
    return;
  }
  census.tags.add(name.name.toLowerCase());
  for (const a of opening.attributes ?? []) {
    if (a.type === 'JSXSpreadAttribute') {
      openCensus(census);
      continue;
    }
    const key = String(a.name?.name ?? '');
    const literal =
      a.value?.type === 'StringLiteral'
        ? a.value.value
        : a.value?.type === 'JSXExpressionContainer' &&
            a.value.expression?.type === 'StringLiteral'
          ? a.value.expression.value
          : null;
    if (key === 'className' || key === 'class') {
      if (literal == null) census.open.classes = true;
      else {
        for (const c of literal.split(/\s+/)) if (c) census.classes.add(c);
      }
    } else if (key === 'id') {
      if (literal == null) census.open.ids = true;
      else census.ids.add(literal);
    } else census.attrs.add(key === 'htmlFor' ? 'for' : key.toLowerCase());
  }
}

/**
 * Records an element and its direct JSX children in the census: a host
 * child by its own attributes, anything else (a component, an expression)
 * opens it.
 * @param {any} element a JSXElement
 * @param {PageCensus} census
 */
function censusJsxWithChildren(element, census) {
  censusJsxElement(element.openingElement, census);
  for (const c of element.children ?? []) {
    if (c.type === 'JSXText') continue;
    if (
      c.type === 'JSXExpressionContainer' &&
      c.expression?.type === 'JSXEmptyExpression'
    )
      continue;
    if (c.type === 'JSXElement') censusJsxElement(c.openingElement, census);
    else openCensus(census);
  }
}

/**
 * Records every element of a page file in the census (a page is the
 * shell: its `<html>`, `<body>` and mount node).
 * @param {string} html
 * @param {PageCensus} census
 */
function censusHtmlPage(html, census) {
  const text = html.replace(/<!--[\s\S]*?-->/g, ' ');
  if (/<body\b/i.test(text)) census.mountKnown = true;
  for (const tag of text.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    census.tags.add(tag[1].toLowerCase());
    for (const at of tag[2].matchAll(
      /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) {
      const key = at[1].toLowerCase();
      const value = at[2] ?? at[3] ?? at[4] ?? '';
      if (key === 'class') {
        for (const c of value.split(/\s+/)) if (c) census.classes.add(c);
      } else if (key === 'id') census.ids.add(value);
      else census.attrs.add(key);
    }
  }
}

/**
 * Records a module's JSX `<html>` and `<body>` (a Next.js layout) and the
 * body's direct children in the census.
 * @param {string} source
 * @param {PageCensus} census
 */
function censusJsxPage(source, census) {
  if (!/<(?:body|html)\b/.test(source)) return;
  let ast;
  try {
    ast = parseModule(source);
  } catch {
    return;
  }
  walkAst(ast, node => {
    if (node.type !== 'JSXElement') return;
    const name = node.openingElement?.name;
    if (name?.type !== 'JSXIdentifier') return;
    if (name.name === 'html') censusJsxElement(node.openingElement, census);
    if (name.name === 'body') {
      census.mountKnown = true;
      censusJsxWithChildren(node, census);
    }
  });
}

/** A pseudo-element that can be a full-viewport layer of the page. */
const PAGE_LAYER_PSEUDO_ELEMENT = /^::?(?:before|after)$/i;

/**
 * What each part of a selector is to the page: one entry per part of a
 * selector list (an `:is()`/`:where()` subject counts as a list), each read
 * as its own rule. A part paints the page only when every compound and any
 * `@scope` root are `html`, `body`, `:root` or this theme's own root
 * attribute, unnarrowed. A part cannot paint the page only when its subject
 * (the compound after the last combinator) carries something the census
 * shows is on none of the page's elements: a tag, a class, an id or an
 * attribute, or a pseudo-element that is no page layer (`::selection`).
 * Every other part may paint. In a CSS Modules file `:global(…)` is the
 * selector it holds.
 * @param {string} selector
 * @param {{themes: Set<string> | null, scope: 'page' | 'maybe' | 'none' | null,
 *   module?: boolean, census: PageCensus}} ctx the names this theme writes,
 *   what the nearest `@scope` root is, whether the stylesheet is a CSS
 *   Modules file, and the census
 * @returns {Array<'page' | 'maybe' | 'none'>}
 */
function selectorReach(selector, ctx) {
  // (In a plain stylesheet `:global(…)` is an unknown pseudo-class the
  // browser drops; a rule inside a `@scope` that starts with a combinator
  // is relative to the scope root.)
  let text = ctx.module
    ? selector.replace(/:global\(([^()]*)\)/g, '$1').replace(/:global\s+/g, '')
    : selector;
  if (ctx.scope != null && /^\s*[>+~]/.test(text)) text = `:scope ${text}`;
  let ast;
  try {
    ast = selectorParser()().astSync(text);
  } catch {
    return ['maybe'];
  }
  const {census} = ctx;
  /** @param {any} n */
  const pageAtom = n =>
    (n.type === 'tag' && /^(?:html|body)$/i.test(n.value)) ||
    (n.type === 'pseudo' && /^:root$/i.test(n.value)) ||
    (n.type === 'pseudo' &&
      /^:scope$/i.test(n.value) &&
      ctx.scope === 'page') ||
    (n.type === 'attribute' &&
      n.attribute === THEME_ROOT_ATTRIBUTE &&
      (n.value == null || (ctx.themes?.has(n.value) ?? false)));
  /** @param {any} n */
  const listPseudo = n =>
    n.type === 'pseudo' &&
    /^:(?:is|where|matches|-webkit-any|-moz-any)$/i.test(n.value);
  /**
   * Whether a node of a subject compound proves it is none of the page's
   * elements.
   * @param {any} n
   */
  const proves = n => {
    if (n.type === 'pseudo' && n.value.startsWith('::'))
      return !PAGE_LAYER_PSEUDO_ELEMENT.test(n.value);
    if (n.type === 'tag')
      return !census.open.tags && !census.tags.has(n.value.toLowerCase());
    if (n.type === 'class')
      return !census.open.classes && !census.classes.has(n.value);
    if (n.type === 'id') return !census.open.ids && !census.ids.has(n.value);
    if (n.type === 'attribute') {
      const key = String(n.attribute).toLowerCase();
      if (key.startsWith('data-astryx-')) return false;
      return !census.open.attrs && !census.attrs.has(key);
    }
    return false;
  };
  /** @type {Array<'page' | 'maybe' | 'none'>} */
  const parts = [];
  for (const sel of ast.nodes) {
    const nodes = /** @type {any[]} */ (sel.nodes).filter(
      n => n.type !== 'comment',
    );
    const lastComb = nodes.map(n => n.type).lastIndexOf('combinator');
    const subjectNodes = nodes.slice(lastComb + 1);
    // (An `:is()`/`:where()` subject is a list: each of its parts, after
    // what comes before it, is judged as its own rule.)
    if (subjectNodes.length === 1 && listPseudo(subjectNodes[0])) {
      const prefix = nodes
        .slice(0, lastComb + 1)
        .map(n => String(n))
        .join('');
      for (const inner of subjectNodes[0].nodes)
        parts.push(...selectorReach(`${prefix}${String(inner).trim()}`, ctx));
      continue;
    }
    // (Inside a `@scope` whose root is proven no page, nothing is.)
    if (ctx.scope === 'none') {
      parts.push('none');
      continue;
    }
    const before = nodes
      .slice(0, lastComb + 1)
      .filter(n => n.type !== 'combinator');
    if (subjectNodes.length && subjectNodes.every(pageAtom))
      parts.push(
        before.every(pageAtom) && (ctx.scope == null || ctx.scope === 'page')
          ? 'page'
          : 'maybe',
      );
    else if (subjectNodes.some(pageAtom)) parts.push('maybe');
    else parts.push(subjectNodes.some(proves) ? 'none' : 'maybe');
  }
  return parts;
}

/**
 * What each part of the rule a declaration (or an at-rule) sits in is to
 * the page, its nesting resolved and its nearest `@scope` root judged by
 * the same rule.
 * @param {any} node
 * @param {Set<string> | null} themes the names this theme writes
 * @param {PageCensus} census
 * @param {boolean} [module] whether the stylesheet is a CSS Modules file
 * @returns {Array<'page' | 'maybe' | 'none'>}
 */
function declReach(node, themes, census, module = false) {
  let rule = node.parent;
  while (rule && rule.type !== 'rule') rule = rule.parent;
  if (!rule) return [];
  /** @type {'page' | 'maybe' | 'none' | null} */
  let scope = null;
  for (let p = rule.parent; p && scope == null; p = p.parent)
    if (p.type === 'atrule' && p.name?.toLowerCase() === 'scope') {
      const root = /^\s*\(([^)]*)\)/.exec(String(p.params ?? ''))?.[1];
      const reaches = root
        ? selectorReach(root, {themes, scope: null, module, census})
        : [];
      scope =
        reaches.length && reaches.every(r => r === 'page')
          ? 'page'
          : reaches.length && reaches.every(r => r === 'none')
            ? 'none'
            : 'maybe';
    }
  return fullSelectors(rule).flatMap(selector =>
    selectorReach(selector, {themes, scope, module, census}),
  );
}

/**
 * Whether a declaration holds only under a condition: inside any at-rule
 * but `@layer` and `@scope` (read on its own): `@media`, `@supports`,
 * `@container`, `@document`, `@starting-style`, vendor forms included,
 * nested in a rule or around it.
 * @param {any} node
 */
function conditionalDecl(node) {
  for (let p = node.parent; p; p = p.parent)
    if (
      p.type === 'atrule' &&
      !/^(?:layer|scope)$/i.test(String(p.name ?? '').replace(/^-[a-z]+-/i, ''))
    )
      return true;
  return false;
}

/** The at-rules CSS itself defines (and `@apply`, read on its own). */
const CSS_AT_RULES = new Set([
  'apply',
  'charset',
  'container',
  'counter-style',
  'custom-media',
  'document',
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'import',
  'keyframes',
  'layer',
  'media',
  'namespace',
  'page',
  'position-try',
  'property',
  'scope',
  'starting-style',
  'supports',
  'view-transition',
]);

/** A `<link rel="preload" as="style">`, which a page turns into a stylesheet when it loads. */
const PRELOADED_STYLE =
  /<link\b(?=[^>]*\brel\s*=\s*\{?\s*["'`]?\s*preload\b)(?=[^>]*\bas\s*=\s*\{?\s*["'`]?\s*style\b)[^>]*>/i;

/**
 * The component and page-template languages whose files the sweep does not
 * parse: each may hold a `<style>`, a `<link>` or a load.
 */
const UNPARSED_COMPONENT_FILE =
  /\.(?:vue|svelte|astro|mdx|marko|riot|ejs|hbs|handlebars|mustache|njk|nunjucks|pug|jade|liquid|twig|erb|haml|slim)$/i;

/**
 * Script that styles the page or adds a sheet at run time: the document's
 * own elements styled or classed, an element it creates, a constructed
 * sheet, a rule it inserts. One pattern for a module and a page's inline
 * script.
 */
const RUNTIME_PAGE_STYLING =
  /\b(?:adoptedStyleSheets|CSSStyleSheet|insertRule|replaceSync)\b|\bdocument\.(?:body|documentElement)\b|\b(?:querySelector(?:All)?|closest)\(\s*['"`]\s*(?:html|body|:root)\b|\bgetElementsByTagName\(\s*['"`](?:html|body)['"`]|\bcreateElement\(\s*['"`](?:style|link)['"`]/;

/**
 * Whether a file may style the page in a way doctor does not read: a
 * preprocessor stylesheet, a page's `<style>` or a `<body>`/`<html>` style
 * or class, or a module with a CSS-in-JS global, a `<style>` it renders or
 * a script that styles the document. Comments are not read apart.
 * @param {string} source
 * @param {string} ext
 * @param {{file: string, projectDir: string, walked: Set<string>}} [where]
 *   the file, in its project: a preprocessor stylesheet that loads one the
 *   sweep did not walk (a package's, a URL) may paint the page
 */
function pageStyleUnread(source, ext, where) {
  const pageAndBackground =
    /(?:\bhtml\b|\bbody\b|:root)[\s\S]{0,400}?background|background[\s\S]{0,200}?(?:\bhtml\b|\bbody\b|:root)/i;
  if (isOtherLanguageStylesheet(`x${ext}`)) {
    if (pageAndBackground.test(source) || /@apply\b/.test(source)) return true;
    const text = source.replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/[^\n]*/g, ' ');
    // (Every item a load names: a comma list, quoted or not, a `url()`,
    // after a Less option (`(reference)`); `@use` and `@forward` name one
    // module, before their `as`/`with`/`show`/`hide`; a
    // `meta.load-css(…)` loads one more. Sass's own `sass:` modules load
    // nothing.)
    /** @param {string} item */
    const specOf = item => {
      const url = /^url\(\s*(['"]?)([^'")]*)\1\s*\)$/u.exec(item);
      const quoted = /^(['"])([^'"]*)\1$/u.exec(item);
      return url ? url[2] : quoted ? quoted[2] : item;
    };
    /** @type {string[]} */
    const specs = [];
    for (const m of text.matchAll(
      /@(use|forward|import|require)\s+([^;{}\n]+)/g,
    )) {
      const statement = m[2].replace(/^\([^)]*\)\s*/u, '').trim();
      const items =
        m[1] === 'use' || m[1] === 'forward'
          ? [statement.replace(/\s+(?:as|with|show|hide)\b[\s\S]*$/u, '')]
          : statement.split(/,(?![^(]*\))/);
      for (const raw of items) {
        const spec = specOf(
          raw
            .trim()
            .replace(/\s+(?:screen|print|all|only|not|and)\b[\s\S]*$/u, '')
            .trim(),
        );
        if (spec && !/^sass:/u.test(spec)) specs.push(spec);
      }
    }
    for (const m of text.matchAll(/\bload-css\(\s*((['"])[^'"]*\2|[^,)\s]+)/g))
      specs.push(specOf(m[1]));
    for (const spec of specs) {
      if (/^@astryxdesign\//.test(spec)) continue;
      if (
        /^(?:https?:)?\/\/fonts\.(?:googleapis\.com|bunny\.net)\//i.test(spec)
      )
        continue;
      if (!where || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(spec)) return true;
      // (A partial as Sass and Less find it: the path as said, with the
      // file's own kinds of extension, and Sass's leading underscore.)
      const base = path.resolve(path.dirname(where.file), spec);
      const dir = path.dirname(base);
      const name = path.basename(base);
      // (Any stylesheet language's extension, from the shared list.)
      const stems = [
        base,
        path.join(dir, `_${name}`),
        path.join(base, '_index'),
        path.join(base, 'index'),
      ];
      const found =
        where.walked.has(base) ||
        [...where.walked].some(
          f =>
            STYLESHEET_FILE.test(f) &&
            stems.some(
              stem =>
                f.startsWith(`${stem}.`) &&
                !f.slice(stem.length + 1).includes(path.sep),
            ),
        );
      if (!found) return true;
    }
    return false;
  }
  if (/^\.html?$/u.test(ext))
    return (
      /<style\b/i.test(source) ||
      /<(?:body|html)\b[^>]*\b(?:style|class)\s*=/i.test(source) ||
      PRELOADED_STYLE.test(source) ||
      [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some(m =>
        RUNTIME_PAGE_STYLING.test(m[1]),
      )
    );
  // (A module: a CSS-in-JS global, a <style> it renders, a script that
  // styles the document or adds a sheet at run time (an element it
  // creates, a constructed sheet, a rule it inserts), or a CSS generator's
  // base layer (Tailwind's `addBase`, UnoCSS's `preflights`).)
  return (
    /\b(?:createGlobalStyle|injectGlobal|globalStyle|globalCss|defineGlobalStyles|addBase|preflights)\b|:global\b|<Global\w*|<style\b/.test(
      source,
    ) || RUNTIME_PAGE_STYLING.test(source)
  );
}

/**
 * What a stylesheet's `html`, `body` and `:root` backgrounds do with the
 * page, read with postcss: `paints` when one uses `--color-background-body`,
 * `unknown` when one takes a value doctor cannot evaluate (another
 * variable), else `not`.
 * @param {string} css
 * @param {{file: string, projectDir: string, walked: Set<string>, themeStylesheets?: Set<string>, themeNames?: Set<string>, census?: PageCensus}} [where]
 *   the stylesheet, in its project: an `@import` out of the project is not
 *   read; one of the registered themes' stylesheets paints no host page
 * @returns {PageVerdict}
 */
function pageRuleVerdict(css, where) {
  let root;
  try {
    root = postcss().parse(css);
  } catch {
    return 'unknown';
  }
  /** @type {PageVerdict[]} */
  const verdicts = [];
  // (An at-rule CSS does not define, a generator's `@tailwind base` or
  // `@unocss`, writes rules doctor does not see.)
  root.walkAtRules(atRule => {
    // (A vendor-prefixed form, `@-moz-keyframes`, is that at-rule.)
    const name = atRule.name.toLowerCase().replace(/^-[a-z]+-/, '');
    if (!CSS_AT_RULES.has(name) && !CSS_NESTED_AT_RULES.has(name))
      verdicts.push('unknown');
  });
  const cssModule = /\.module\.[a-z]+$/i.test(where?.file ?? '');
  const census = where?.census ?? newPageCensus();
  if (!where?.census) openCensus(census);
  // (Each background declaration, read against the full selector of the
  // rule it sits in, nesting resolved, and the conditions around it.)
  root.walkDecls(/^background(?:-color|-image)?$/i, decl => {
    // (The page token by its exact name: `--color-background-body-alt` is
    // another token.)
    const paints = /var\(\s*--color-background-body\s*[,)]/.test(decl.value);
    // (Each part of the rule's selector is its own rule.)
    for (const reach of declReach(
      decl,
      where?.themeNames ?? null,
      census,
      cssModule,
    )) {
      if (reach === 'none') continue;
      if (reach === 'maybe' || conditionalDecl(decl)) {
        verdicts.push('unknown');
        continue;
      }
      verdicts.push(
        paints ? 'paints' : /var\(/.test(decl.value) ? 'unknown' : 'not',
      );
    }
  });
  // (An `@apply` in a rule that reaches the page writes what doctor does
  // not read.)
  root.walkAtRules('apply', atRule => {
    if (
      declReach(atRule, where?.themeNames ?? null, census, cssModule).some(
        r => r !== 'none',
      )
    )
      verdicts.push('unknown');
  });
  // (A stylesheet it imports from a package, other than Astryx's own, which
  // never paint the host page, or a font service's, is not read, and may
  // paint the page.)
  root.walkAtRules('import', atRule => {
    const spec = [...doctorStylesheetImports(`@import ${atRule.params};`)][0];
    if (!spec) {
      verdicts.push('unknown');
      return;
    }
    if (/^@astryxdesign\//.test(spec)) return;
    if (where?.themeStylesheets?.has(spec)) return;
    if (/^(?:https?:)?\/\/fonts\.(?:googleapis\.com|bunny\.net)\//i.test(spec))
      return;
    // (A path the sweep walked is read where it is; anything else, a
    // package, a URL, a file the walk skipped, may paint.)
    if (
      where &&
      /^[./]/.test(spec) &&
      !spec.startsWith('//') &&
      walkedSheet(spec.replace(/[?#].*$/u, ''), where)
    )
      return;
    if (!where && /^\.{1,2}\//.test(spec)) return;
    verdicts.push('unknown');
  });
  return combineVerdicts(verdicts);
}

/**
 * Whether a module's outermost Core `Theme` that takes the default theme
 * (`themes[defaultThemeSlug]`) is given a fixed mode:
 * a literal `light` or `dark`, or, for a theme whose one mode the module
 * records, its `themeModes[…]` entry, alone or with a fallback (`??
 * 'system'`, as `theme add` wires it). Theme marks the page with that mode,
 * and Core's reset gives it that color scheme. A Theme inside another Theme,
 * or another component's `mode`, does not count.
 * @param {string} file
 * @param {boolean} recorded whether the module records the theme's mode
 * @returns {'light' | 'dark' | 'recorded' | 'unknown' | null} the mode it
 *   is given; `unknown` for a value doctor cannot evaluate (a variable, a
 *   ternary, a hook's value, spread props)
 */
function rootThemeMode(file, recorded) {
  /** @param {any} e @returns {'light' | 'dark' | null} */
  const literal = e => {
    const text =
      e?.type === 'StringLiteral'
        ? e.value
        : e?.type === 'TemplateLiteral' && !e.expressions.length
          ? (e.quasis[0]?.value?.cooked ?? '')
          : '';
    return text === 'light' || text === 'dark' ? text : null;
  };
  /** @param {any} e */
  const themeModesEntry = e =>
    e?.type === 'MemberExpression' &&
    e.computed &&
    e.object?.type === 'Identifier' &&
    e.object.name === 'themeModes';
  /** @param {any} tag @param {string} name */
  const attribute = (tag, name) =>
    (tag.attributes ?? []).find(
      (/** @type {any} */ a) =>
        a.type === 'JSXAttribute' && a.name?.name === name,
    );
  // (The app's own root: the Theme given `themes[defaultThemeSlug]`, never
  // a section's Theme for one named theme.)
  /** @param {any} tag */
  const takesDefault = tag => {
    const e = attribute(tag, 'theme')?.value?.expression;
    return (
      e?.type === 'MemberExpression' &&
      e.computed &&
      e.object?.type === 'Identifier' &&
      e.object.name === 'themes' &&
      e.property?.type === 'Identifier' &&
      e.property.name === 'defaultThemeSlug'
    );
  };
  for (const element of doctorOutermostElements(file, {
    sources: CORE_THEME_SOURCES,
    name: 'Theme',
  })) {
    const tag = element.openingElement;
    if (!takesDefault(tag)) continue;
    const v = attribute(tag, 'mode')?.value;
    const fixed =
      v?.type === 'StringLiteral'
        ? literal(v)
        : v?.type === 'JSXExpressionContainer'
          ? literal(v.expression)
          : null;
    if (fixed) return fixed;
    const e = v?.type === 'JSXExpressionContainer' ? v.expression : null;
    const fromRecord =
      themeModesEntry(e) ||
      (e?.type === 'LogicalExpression' &&
        e.operator === '??' &&
        themeModesEntry(e.left));
    if (recorded && fromRecord) return 'recorded';
    // (A value doctor cannot evaluate may be the theme's mode.)
    if (
      (tag.attributes ?? []).some(
        (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
      ) ||
      (e &&
        !fromRecord &&
        e.type !== 'StringLiteral' &&
        !(e.type === 'TemplateLiteral' && !e.expressions.length))
    )
      return 'unknown';
  }
  return null;
}

/**
 * What an app's root element does with the page: `paints` when its own
 * background provably takes `--color-background-body`, `not` when its
 * background provably is something else or nothing, `unknown` when doctor
 * cannot read it (a class, StyleX, spread props, a computed style, or a
 * component it cannot follow).
 * @typedef {'paints' | 'not' | 'unknown'} PageVerdict
 */

/** @param {PageVerdict[]} verdicts @returns {PageVerdict} */
function combineVerdicts(verdicts) {
  if (verdicts.includes('paints')) return 'paints';
  if (verdicts.includes('unknown')) return 'unknown';
  return 'not';
}

/**
 * A JSX element's own attributes, for the page: its inline `style`
 * background read; a class, StyleX (`xstyle`), a spread, or a style doctor
 * cannot evaluate is `unknown`.
 * @param {any} opening a JSXOpeningElement
 * @returns {PageVerdict}
 */
function ownBackground(opening) {
  /** @type {PageVerdict} */
  let verdict = 'not';
  for (const a of opening?.attributes ?? []) {
    if (a.type === 'JSXSpreadAttribute') return 'unknown';
    const name = a.name?.name;
    if (name === 'className' || name === 'xstyle' || name === 'class')
      return 'unknown';
    if (name !== 'style') continue;
    const style =
      a.value?.type === 'JSXExpressionContainer' ? a.value.expression : null;
    if (style?.type !== 'ObjectExpression') return 'unknown';
    for (const p of style.properties) {
      if (p.type !== 'ObjectProperty' || p.computed) return 'unknown';
      const key = p.key?.name ?? p.key?.value;
      if (!/^background(?:Color|Image)?$/.test(String(key))) continue;
      const v = p.value;
      const text =
        v?.type === 'StringLiteral'
          ? v.value
          : v?.type === 'TemplateLiteral' && !v.expressions.length
            ? (v.quasis[0]?.value?.cooked ?? '')
            : null;
      if (text == null) return 'unknown';
      if (/var\(\s*--color-background-body\s*[,)]/.test(text))
        verdict = 'paints';
      else if (/var\(/.test(text)) return 'unknown';
    }
  }
  return verdict;
}

/**
 * The JSX each function a module declares returns, by the name it is
 * declared or exported under (`default` for a default export); `unknown`
 * when a function can return something other than JSX.
 * @param {any} ast
 * @returns {Map<string, any[] | 'unknown'>}
 */
function returnedJsx(ast) {
  /** @type {Map<string, any[] | 'unknown'>} */
  const out = new Map();
  /** @param {any} fn @returns {any[] | 'unknown'} */
  const roots = fn => {
    const isJsx = (/** @type {any} */ n) =>
      n?.type === 'JSXElement' || n?.type === 'JSXFragment';
    if (isJsx(fn.body)) return [fn.body];
    if (fn.body?.type !== 'BlockStatement') return 'unknown';
    /** @type {any[]} */
    const found = [];
    let other = false;
    // (Only the function's own returns: a helper declared inside it
    // returns for itself, not for the component.)
    /** @param {unknown} value */
    const visit = value => {
      if (value == null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      const node = /** @type {any} */ (value);
      if (/Function/.test(node.type ?? '')) return;
      if (node.type === 'ReturnStatement') {
        const arg =
          node.argument?.type === 'ParenthesizedExpression'
            ? node.argument.expression
            : node.argument;
        if (isJsx(arg)) found.push(arg);
        else other = true;
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
        visit(child);
      }
    };
    visit(fn.body.body);
    return other || !found.length ? 'unknown' : found;
  };
  /** @type {Map<string, string>} */
  const aliases = new Map();
  for (const node of ast.program.body) {
    const decl =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (decl?.type === 'FunctionDeclaration' && decl.id)
      out.set(decl.id.name, roots(decl));
    if (decl?.type === 'VariableDeclaration')
      for (const d of decl.declarations)
        if (
          d.id?.type === 'Identifier' &&
          /^(?:ArrowFunctionExpression|FunctionExpression)$/.test(
            d.init?.type ?? '',
          )
        )
          out.set(d.id.name, roots(d.init));
    if (node.type === 'ExportNamedDeclaration')
      for (const sp of node.specifiers ?? [])
        if (sp.local?.name)
          aliases.set(sp.exported?.name ?? sp.exported?.value, sp.local.name);
    if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration;
      if (/Function/.test(d?.type ?? '')) out.set('default', roots(d));
      else if (d?.type === 'Identifier') aliases.set('default', d.name);
    }
  }
  for (const [exported, local] of aliases) {
    const found = out.get(local);
    if (found) out.set(exported, found);
  }
  return out;
}

/**
 * What a root element does with the page (see PageVerdict): a host element
 * or a Core component by its own attributes (Core paints the page only
 * through AppShell); an app component by the JSX it returns, followed into
 * relative imports; a fragment by its elements; anything else `unknown`.
 * @param {any} node a JSXElement, JSXFragment or other JSX child
 * @param {{file: string, ast: any}} where the module the node is in
 * @param {number} depth
 * @param {PageCensus} [census] records the root element and its children
 * @returns {PageVerdict}
 */
function rootVerdict(node, where, depth, census) {
  if (depth > 6) return 'unknown';
  if (node?.type === 'JSXText') return 'not';
  if (node?.type === 'JSXFragment')
    return combineVerdicts(
      (node.children ?? []).map((/** @type {any} */ c) =>
        rootVerdict(c, where, depth, census),
      ),
    );
  if (node?.type !== 'JSXElement') return 'unknown';
  const name = node.openingElement?.name;
  if (name?.type !== 'JSXIdentifier') return 'unknown';
  if (/^[a-z]/.test(name.name)) {
    if (census) censusJsxWithChildren(node, census);
    return ownBackground(node.openingElement);
  }
  /** @type {{source: string, imported: string} | null} */
  let from = null;
  for (const n of where.ast.program.body)
    if (n.type === 'ImportDeclaration' && n.importKind !== 'type')
      for (const sp of n.specifiers ?? [])
        if (sp.local?.name === name.name)
          from = {
            source: n.source.value,
            imported:
              sp.type === 'ImportDefaultSpecifier'
                ? 'default'
                : (sp.imported?.name ?? sp.imported?.value),
          };
  if (from && /^@astryxdesign\/core(?:\/|$)/.test(from.source)) {
    if (from.imported === 'AppShell') return 'paints';
    // (A Core component renders elements of its own: the census cannot
    // name them.)
    if (census) openCensus(census);
    return ownBackground(node.openingElement);
  }
  if (from && !from.source.startsWith('.')) return 'unknown';
  // (An app component: what it returns decides, unless the element gives
  // it a class, StyleX or spread it may paint with.)
  const own = ownBackground(node.openingElement);
  if (own !== 'not') return own;
  let target = where;
  let wanted = name.name;
  if (from) {
    const resolved = doctorResolveLocalModule(from.source, where.file);
    if (!resolved) return 'unknown';
    try {
      target = {file: resolved, ast: parseModule(readTextFile(resolved))};
    } catch {
      return 'unknown';
    }
    wanted = from.imported;
  }
  const returned = returnedJsx(target.ast).get(wanted);
  if (!returned || returned === 'unknown') return 'unknown';
  return combineVerdicts(
    returned.map((/** @type {any} */ r) =>
      rootVerdict(r, target, depth + 1, census),
    ),
  );
}

/**
 * What the app's root element does with the page, from the outermost Core
 * Theme that takes `themes[defaultThemeSlug]` in a module: null when the
 * module renders none, else the verdict of what it wraps (the Theme's own
 * class, style or spread first).
 * @param {string} file
 * @param {PageCensus} [census] records the root element and its children
 * @returns {PageVerdict | null}
 */
function rootThemeVerdict(file, census) {
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(readTextFile(file));
  } catch {
    return null;
  }
  /** @type {PageVerdict[]} */
  const verdicts = [];
  for (const element of doctorOutermostElements(file, {
    sources: CORE_THEME_SOURCES,
    name: 'Theme',
  })) {
    const theme = (element.openingElement.attributes ?? []).find(
      (/** @type {any} */ a) =>
        a.type === 'JSXAttribute' && a.name?.name === 'theme',
    )?.value?.expression;
    if (!(
      theme?.type === 'MemberExpression' &&
      theme.computed &&
      theme.object?.name === 'themes' &&
      theme.property?.name === 'defaultThemeSlug'
    ))
      continue;
    const own = ownBackground({
      attributes: (element.openingElement.attributes ?? []).filter(
        (/** @type {any} */ a) =>
          a.type === 'JSXSpreadAttribute' ||
          !['theme', 'mode', 'children'].includes(a.name?.name),
      ),
    });
    const children = (element.children ?? []).filter(
      (/** @type {any} */ c) => c.type !== 'JSXText' || c.value.trim(),
    );
    verdicts.push(
      own !== 'not'
        ? own
        : combineVerdicts(
            children.map((/** @type {any} */ c) =>
              rootVerdict(c, {file, ast}, 0, census),
            ),
          ),
    );
  }
  return verdicts.length ? combineVerdicts(verdicts) : null;
}

/**
 * The two halves of a `light-dark(a, b)` value, split at its top-level
 * comma so functional colors (`oklch(…)`) stay whole; null for another value.
 * @param {string} value
 * @returns {[string, string] | null}
 */
function lightDarkHalves(value) {
  const m = /^\s*light-dark\(([\s\S]*)\)\s*$/.exec(value);
  if (!m) return null;
  let depth = 0;
  for (let i = 0; i < m[1].length; i++) {
    const ch = m[1][i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0)
      return [m[1].slice(0, i).trim(), m[1].slice(i + 1).trim()];
  }
  return null;
}

/**
 * The one mode a built theme's page color is drawn for, or null when its
 * page takes a light and a dark color (or the value cannot be read).
 * @param {string} css
 * @param {Awaited<ReturnType<typeof doctorColorReaders>>} readers
 * @returns {'light' | 'dark' | null}
 */
function oneModeOfPage(css, readers) {
  const value = /--color-background-body\s*:\s*([^;}]+)/.exec(css)?.[1];
  if (!value) return null;
  const sides = (lightDarkHalves(value) ?? [value]).map(side =>
    lightSide(side, readers),
  );
  if (sides.some(side => side == null)) return null;
  if (sides.some(side => side !== sides[0])) return null;
  return sides[0] ? 'light' : 'dark';
}

/**
 * The page color a theme's built stylesheet gives `--color-background-body`,
 * as written, or null.
 * @param {string} css
 */
function pageColorValue(css) {
  const v = /--color-background-body\s*:\s*([^;}]+)/.exec(css)?.[1];
  return v ? v.trim().toLowerCase().replace(/\s+/g, ' ') : null;
}

/**
 * The page colors the packages a local theme's built module imports its
 * base from give, read from each package's own stylesheets; empty for a
 * package theme (it is a base itself) or a base doctor cannot find.
 * @param {string} projectDir
 * @param {ResolvedAppTheme} theme
 * @returns {Set<string>}
 */
function basePageColors(projectDir, theme) {
  /** @type {Set<string>} */
  const out = new Set();
  if (theme.source !== 'local' || !theme.moduleFile) return out;
  let ast;
  try {
    ast = parseModule(readTextFile(theme.moduleFile));
  } catch {
    return out;
  }
  /** @type {Set<string>} */
  const packages = new Set();
  walkAst(ast, node => {
    const spec = node.type === 'ImportDeclaration' ? node.source?.value : null;
    if (typeof spec !== 'string' || spec.startsWith('.')) return;
    packages.add(
      spec
        .split('/')
        .slice(0, spec.startsWith('@') ? 2 : 1)
        .join('/'),
    );
  });
  for (const name of packages) {
    if (name === '@astryxdesign/core') continue;
    const dir = findDoctorInstalledPackage(projectDir, name);
    if (!dir) continue;
    for (const file of doctorPackageStylesheets(dir)) {
      try {
        const value = pageColorValue(readTextFile(file));
        if (value) out.add(value);
      } catch {
        // An unreadable stylesheet gives no base color.
      }
    }
  }
  return out;
}

/**
 * The first project file that loads a package stylesheet (`specifier`): a
 * stylesheet that `@import`s it, a module that imports it, or a page that
 * links it. Each is read as a syntax tree or its tags, so comments never
 * count. `unparsed` counts the modules naming it that do not parse.
 * @param {string} root
 * @param {string} specifier
 * @param {{skip?: (rel: string) => boolean}} [options] `skip`: project
 *   files (by their path inside the project) that do not count
 * @returns {{file: string | null, unparsed: number}}
 */
export function projectStylesheetLoad(root, specifier, options = {}) {
  const name = specifier.split('/').at(-1) ?? specifier;
  let unparsed = 0;
  for (const file of listProjectSourceFiles(root, '', {
    stylesheets: true,
    pages: true,
  })) {
    if (options.skip?.(path.relative(root, file))) continue;
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    if (!source.includes(name)) continue;
    if (file.endsWith('.css')) {
      if (doctorStylesheetImports(source).has(specifier))
        return {file, unparsed};
      continue;
    }
    if (/\.html?$/u.test(file)) {
      if (linksPackageStylesheet(source, specifier)) return {file, unparsed};
      continue;
    }
    try {
      if (moduleSpecifiers(source).has(specifier)) return {file, unparsed};
    } catch {
      unparsed += 1;
    }
  }
  return {file: null, unparsed};
}

/**
 * Whether the project loads Core's reset stylesheet: an app that does not
 * is embedded in a page it does not own (the guest setup), and paints no
 * page.
 * @param {string} projectDir
 */
function loadsCoreReset(projectDir) {
  return (
    // (A story or a test loads the reset for itself, not for the app.)
    projectStylesheetLoad(projectDir, '@astryxdesign/core/reset.css', {
      skip: storyOrTest,
    }).file != null
  );
}

/**
 * The default theme's page color shows only where something paints the
 * page: AppShell, or a global body rule that takes the page color. Astryx
 * never paints the host page, so doctor warns when nothing does and the
 * theme needs it: a theme drawn for one mode (in the other OS mode its text
 * lands on the browser's own page color; a root Theme given its mode also
 * keeps it readable), or a local theme that sets its own page color,
 * different from its base's (the color chosen never shows). An app that
 * loads no Core reset is embedded in a page it does not own, and gets no
 * finding.
 * @param {string} projectDir
 * @param {ResolvedAppTheme | null} theme
 * @param {Awaited<ReturnType<typeof doctorColorReaders>>} readers
 * @param {Set<string>} [themeStylesheets] the stylesheets the registered
 *   themes load, as the theme module imports them
 * @returns {DoctorCheck | null}
 */
function oneModePageCheck(
  projectDir,
  theme,
  readers,
  themeStylesheets = new Set(),
) {
  if (!theme?.stylesheetFile) return null;
  let mode;
  let value;
  /** The names the theme's own stylesheet scopes itself by, as `Theme` writes them. @type {Set<string>} */
  const themeNames = new Set();
  try {
    const css = readTextFile(theme.stylesheetFile);
    mode = oneModeOfPage(css, readers);
    value = pageColorValue(css);
    for (const m of css.matchAll(
      /\[\s*data-astryx-theme\s*=\s*(["']?)([^"'\]]+)\1\s*\]/g,
    ))
      themeNames.add(m[2]);
    // (The slug, only when the stylesheet names no theme of its own.)
    if (!themeNames.size) themeNames.add(theme.slug);
  } catch {
    return null;
  }
  const bases = mode ? new Set() : basePageColors(projectDir, theme);
  const own = !mode && value != null && bases.size > 0 && !bases.has(value);
  if (!mode && !own) return null;
  if (!loadsCoreReset(projectDir)) return null;
  // (Doctor warns only on proof that nothing paints the page: a root it
  // found, every part of it read as not the page color. Anything it cannot
  // read may paint, and the check stays silent.)
  let painted = false;
  let mayPaint = false;
  let foundRoot = false;
  /** @type {'light' | 'dark' | null} */
  let opposite = null;
  const walk = walkProjectSourceFiles(projectDir, '', {
    stylesheets: true,
    pages: true,
    styleSources: true,
    unparsed: UNPARSED_COMPONENT_FILE,
  });
  // (A project larger than the walk reads: what it left may paint.)
  if (!walk.complete) mayPaint = true;
  const walked = new Set(walk.files.map(f => path.resolve(f)));
  // (What the page's elements carry, read before any stylesheet is judged.)
  const census = newPageCensus();
  /** @type {Array<{file: string, source: string}>} */
  const stylesheets = [];
  // (A component language the sweep does not parse, a `.vue` or `.svelte`
  // file, may hold a `<style>` or a load.)
  if (walk.unparsed.some(file => !storyOrTest(path.relative(projectDir, file))))
    mayPaint = true;
  // (A project config that lists stylesheets, as `angular.json` does: each
  // read like a path a module names.)
  for (const {file, strings} of doctorRootConfigStrings(projectDir))
    for (const text of strings) {
      const value = text.replace(/[?#].*$/u, '');
      if (!STYLESHEET_FILE.test(value) || /^@astryxdesign\//.test(value))
        continue;
      if (
        stylesheetPathVerdict(value, {file, projectDir, walked}) === 'unknown'
      )
        mayPaint = true;
    }
  for (const file of walk.files) {
    // (A story or a test styles or renders for itself, not for the app;
    // read by its path inside the project.)
    if (storyOrTest(path.relative(projectDir, file))) continue;
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    if (generatedThemeFile(source)) continue;
    const ext = path.extname(file);
    // (Sources doctor does not read for the page: a preprocessor's
    // stylesheet, a page's own <style> or body style, a stylesheet or a
    // module that styles the page some other way. One that names the page
    // and a background may paint it.)
    if (
      ext !== '.css' &&
      pageStyleUnread(source, ext, {file, projectDir, walked})
    ) {
      mayPaint = true;
      continue;
    }
    // (A preprocessor stylesheet read above is no module.)
    if (isOtherLanguageStylesheet(`x${ext}`)) continue;
    if (/^\.html?$/u.test(ext)) {
      censusHtmlPage(source, census);
      if (
        stylesheetLinkHrefs(source).some(
          href =>
            linkedSheetVerdict(href, themeStylesheets, {
              file,
              projectDir,
              walked,
            }) === 'unknown',
        )
      )
        mayPaint = true;
      continue;
    }
    if (ext === '.css') {
      stylesheets.push({file, source});
      continue;
    }
    // (AppShell from the package or its own entry, as the templates
    // import it.)
    if (
      source.includes('AppShell') &&
      doctorRendersElement(file, {
        sources: new Set(['@astryxdesign/core', '@astryxdesign/core/AppShell']),
        name: 'AppShell',
      })
    ) {
      painted = true;
      break;
    }
    // (A module that imports a package's stylesheet, other than Astryx's
    // own, may paint the page with it; a <body> or <html> it renders, a
    // Next.js layout's, by its own attributes.)
    const moduleVerdict = modulePageVerdict(source, themeStylesheets, {
      file,
      projectDir,
      walked,
    });
    if (moduleVerdict === 'paints') {
      painted = true;
      break;
    }
    if (moduleVerdict === 'unknown') mayPaint = true;
    censusJsxPage(source, census);
    if (!/\bTheme\b/.test(source)) continue;
    const root = rootThemeVerdict(file, census);
    if (root === 'paints') {
      painted = true;
      break;
    }
    if (root) foundRoot = true;
    if (root === 'unknown') mayPaint = true;
    // (A root Theme given a fixed mode, the theme's recorded one
    // (`themeModes[…]`) or a literal `light` or `dark`: Theme marks the page
    // with that mode, and Core's reset gives it that color scheme, so a
    // one-mode theme's text stays readable in every OS mode. It paints no
    // page color, so it never shows a theme's own one.)
    if (!mode) continue;
    const given = rootThemeMode(file, Boolean(theme.mode));
    if (given === 'recorded' || given === mode) {
      painted = true;
      break;
    }
    if (given === 'unknown') {
      mayPaint = true;
      continue;
    }
    // (The other mode, said as a literal, gives the page that mode's color
    // scheme: the theme's text then sits on the wrong side.)
    if (given) opposite = given;
  }
  // (No page shell read: the mount node is unknown, so nothing proves a
  // rule is not it.)
  if (!census.mountKnown) openCensus(census);
  for (const {file, source} of painted ? [] : stylesheets) {
    const css = pageRuleVerdict(source, {
      file,
      projectDir,
      walked,
      themeStylesheets,
      themeNames,
      census,
    });
    if (css === 'paints') {
      painted = true;
      break;
    }
    if (css === 'unknown') mayPaint = true;
  }
  if (!painted && (mayPaint || !foundRoot)) return null;
  const label = 'Theme page color shown';
  const bodyRule =
    'add `body { background: var(--color-background-body) }` to global CSS (the purity check of `doctor --built` flags a stylesheet imported from component source, so prefer AppShell)';
  if (!mode)
    return painted
      ? {
          id: 'theme-page-color',
          label,
          status: 'pass',
          message: `${theme.slug} sets its own page color, and the app paints its page (AppShell, a body background of the page color, or the root element's own background).`,
        }
      : {
          id: 'theme-page-color',
          label,
          status: 'warn',
          message: `${theme.slug} sets its own page color (${value}), and nothing paints the app's page: no AppShell renders, no stylesheet gives the body the page color, and the root Theme's own element takes no page color. The page shows the browser's own color, not the theme's.`,
          fix: `Wrap the page in AppShell; if you can't, ${bodyRule}.`,
        };
  const other = mode === 'dark' ? 'light' : 'dark';
  return painted
    ? {
        id: 'theme-page-color',
        label,
        status: 'pass',
        message: `${theme.slug} is drawn for ${mode} mode, and the app paints its page (AppShell, a body background of the page color, or the theme's own mode on its root Theme).`,
      }
    : {
        id: 'theme-page-color',
        label,
        status: 'warn',
        message: opposite
          ? `${theme.slug} is drawn for ${mode} mode only, but the root Theme is given mode="${opposite}", so the page takes ${opposite} mode's color scheme and the theme's text sits on the wrong side of it. Nothing else paints the page (no AppShell, no body background of the page color).`
          : `${theme.slug} is drawn for ${mode} mode only, and nothing paints the app's page: no AppShell renders, no stylesheet gives the body the page color, and the root Theme is not given the theme's mode. In ${other} OS mode its text sits on the browser's own page color.`,
        fix: `Wrap the page in AppShell; if you can't, pass the theme's mode to the root Theme (${theme.mode ? 'mode={themeModes[defaultThemeSlug]}' : `mode="${mode}"`}), or ${bodyRule}.`,
      };
}

/** @param {string} file */
function readPackageVersion(file) {
  const pkg = readPackageJson(file);
  return typeof pkg?.version === 'string' ? pkg.version : null;
}
