// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Positive-evidence checks for the app theme record.
 *
 * Each AST-050 check has its own stable result. Missing app-theme state is
 * informational. A check passes only after its specific evidence is read.
 */

import * as path from 'node:path';
import {parse} from '@babel/parser';
import postcss from 'postcss';
import {
  collectUnloadedFonts,
  discoverDoctorThemes,
  discoverDoctorUnmigratedCopies,
  findDoctorCoreDir,
  findDoctorInstalledPackage,
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
  themeBuild,
  themeRecordOwner,
  validateThemePrivateInputs,
} from './_adapter.mjs';
import {
  getCliInvocation,
  formatCliCommand,
} from '../../foundation/env/package-manager.mjs';
import {satisfiesRange} from '../../foundation/env/semver.mjs';
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
    const selector = theme?.package ?? owner;
    return `npm install ${owner}@latest; ${run} theme add ${slug} --package ${selector}`;
  }
  const source = theme
    ? relative(projectDir, path.join(theme.sourceDir, theme.entry))
    : projectPath(path.join(owner, slug, `${slug}Theme.ts`));
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

/** @param {string} source */
function moduleSpecifiers(source) {
  const values = new Set();
  walkAst(parseModule(source), node => {
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
      ].includes(node.type) &&
      typeof node.source?.value === 'string'
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

/** @param {string} css */
function fontStylesheetEvidence(css) {
  const loaded = new Set();
  let external = false;
  const root = postcss.parse(css);
  root.walkAtRules(atRule => {
    if (atRule.name.toLowerCase() === 'import') external = true;
    if (atRule.name.toLowerCase() !== 'font-face') return;
    atRule.walkDecls(/^font-family$/iu, declaration => {
      loaded.add(normalizeFontName(declaration.value).toLowerCase());
    });
  });
  return {loaded, external};
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
  const root = postcss.parse(css);
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
 * The `themes` check that every released doctor report carries. Its id is
 * stable, so it stays beside the app-theme checks. Without a generated theme
 * module it reports what it always has: whether an `@astryxdesign/theme-*`
 * package is installed, and whether the app's package.json names a theme in
 * `astryx.theme`. With a generated module it reports the overall result of the
 * app-theme checks.
 * @param {string} cwd
 * @param {DoctorCheck[]} appChecks - the checks {@link checkAppThemes} returned
 * @returns {DoctorCheck}
 */
export function checkThemes(cwd, appChecks) {
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
  if (packages.length === 0) {
    return {
      id: 'themes',
      label,
      status: 'warn',
      message: 'No @astryxdesign/theme-* packages are installed.',
      fix: `Install a theme, e.g. \`npm install @astryxdesign/theme-neutral\`, then add it to the app with \`${run} theme add neutral\`.`,
    };
  }
  const names = packages.join(', ');
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
      fix: `${run} theme add <slug>`,
    });
  } else if (resolutionProblems.length > 0) {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'fail',
      message: resolutionProblems.map(problem => problem.message).join(' '),
      fix: resolutionProblems
        .map(problem =>
          refreshThemeCommand(
            state.projectDir,
            run,
            available,
            problem.slug,
            problem.owner,
          ),
        )
        .join(' '),
    });
  } else {
    checks.push({
      id: 'theme-owners',
      label: 'Theme owners and built imports',
      status: 'pass',
      message: `${resolved.length} added theme${resolved.length === 1 ? '' : 's'} resolve to built modules and stylesheets, and every built module loads.`,
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
          const receipt = await themeBuild(
            path.join(availableTheme.sourceDir, availableTheme.entry),
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
        } catch {
          stale.push(theme.slug);
        }
      }
    } finally {
      logger.setSilent(previousSilent);
    }
    checks.push(
      stale.length > 0
        ? {
            id: 'theme-local-builds',
            label: 'Local theme build freshness',
            status: 'fail',
            message: `Local theme outputs are missing or stale: ${stale.join(', ')}.`,
            fix: stale
              .map(slug =>
                refreshThemeCommand(
                  state.projectDir,
                  run,
                  available,
                  slug,
                  state.themes[slug],
                ),
              )
              .join(' '),
          }
        : {
            id: 'theme-local-builds',
            label: 'Local theme build freshness',
            status: 'pass',
            message: 'Every added local theme output matches its source.',
          },
    );
  }

  const privateProblems = [];
  for (const theme of resolved) {
    const availableTheme = available.find(
      candidate =>
        candidate.slug === theme.slug &&
        themeRecordOwner(candidate) === theme.owner,
    );
    if (!availableTheme) continue;
    try {
      const errors = await validateThemePrivateInputs(
        path.join(availableTheme.sourceDir, availableTheme.entry),
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
    const range = pkg?.peerDependencies?.['@astryxdesign/core'];
    if (
      !coreVersion ||
      typeof range !== 'string' ||
      !satisfiesRange(coreVersion, range)
    ) {
      peerProblems.push({
        slug,
        owner,
        range: typeof range === 'string' ? range : null,
        message: `${slug}: ${owner} requires ${typeof range === 'string' ? range : 'an undeclared Core range'}, installed ${coreVersion ?? 'none'}`,
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
                  ? `npm install '@astryxdesign/core@${problem.range}'; ${run} doctor`
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
  const missingFontWarnings = [];
  let generatedImports = null;
  try {
    generatedImports = moduleSpecifiers(currentModule);
  } catch {
    // The generated-module check owns the parse failure. This check stays
    // evidence-driven and refuses to pass without readable imports.
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
    const names = namedThemeFonts(files);
    if (names.size === 0) continue;
    const importedTheme =
      prepared?.entries.find(entry => entry.slug === theme.slug) ?? theme;
    if (!theme.fontStylesheetFile || !importedTheme.fontStylesheet) {
      const problem = {
        theme,
        message: `${[...names].join(', ')} (font stylesheet is not imported)`,
      };
      missingFontWarnings.push(problem);
      continue;
    }
    if (!generatedImports?.has(importedTheme.fontStylesheet)) {
      fontFailures.push({
        theme,
        message: `${[...names].join(', ')} (font stylesheet is not imported)`,
      });
      continue;
    }
    try {
      const evidence = fontStylesheetEvidence(
        readTextFile(theme.fontStylesheetFile),
      );
      const missing = [...names].filter(
        name => !evidence.loaded.has(name.toLowerCase()),
      );
      if (missing.length === 0) continue;
      if (evidence.external) {
        externalFontWarnings.push(`${theme.slug}: ${missing.join(', ')}`);
      } else {
        fontFailures.push({theme, message: missing.join(', ')});
      }
    } catch {
      fontFailures.push({
        theme,
        message: 'font stylesheet could not be parsed',
      });
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
  if (externalFontWarnings.length > 0) {
    fontWarningMessages.push(
      `External font imports prevent proof for ${externalFontWarnings.join('; ')}.`,
    );
    fontWarningFixes.push(
      'Confirm the font service stylesheet loads each named family.',
    );
  }
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
            fix: `Add the missing font stylesheet export or local <slug>.fonts.css, then ${fontFailures
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
                'Every named non-system font has a local @font-face loader.',
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
