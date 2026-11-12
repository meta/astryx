// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared data and write adapter for app-theme commands.
 *
 * Keeps the historical synchronous bundled-theme helper, resolves project-aware
 * source themes, loads recorded built artifacts through the shared runtime
 * loader, reads static generated-module state, and applies each add/remove/use
 * regeneration through the shared atomic write transaction.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {
  findCarriedCoreDir,
  findPackageRoot,
  projectWritePath,
  requireCoreDir,
} from '../../foundation/fs/paths.mjs';
import {tryLock, userCacheDir} from '../../foundation/release/cache.mjs';
import {Project} from '../../foundation/config/project.mjs';
import {
  BUNDLED_THEME_PACKAGE,
  THEMES_DIR,
  THEME_SLUG_RE,
  discoverBundledThemes,
  discoverIntegrationThemes,
  discoverUnmigratedThemeCopies,
  themeImportPackage,
} from '../../foundation/discovery/theme-discovery.mjs';
import {
  ThemeImportError,
  resolveThemeImports,
} from '../../foundation/discovery/theme-imports.mjs';
import {
  findThemeProject,
  editorThemeRecord,
  isLocalThemeOwner,
  LOCAL_THEME_ROOT,
  ThemeStateError,
  planThemeAppWrite,
  readThemeState,
} from '../../foundation/config/theme-state.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {stripCopyrightHeader} from '../../foundation/text/copyright-header.mjs';
import {loadIntegrations} from '../../foundation/integrations/integrations.mjs';
import {importThemeArtifact} from '../../foundation/fs/module-loader.mjs';
import {applyWrites} from '../integration/add-helpers.mjs';
import {forkFileNames, renamedEntry} from './_fork.mjs';
import {
  formatCliCommand,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {fsErrorMessage} from '../../foundation/fs/fs-error.mjs';
import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';

export {BUNDLED_THEME_PACKAGE, THEMES_DIR};

/**
 * Package written to the generated app record for one discovered theme.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 */
export function themeRecordOwner(theme) {
  return themeImportPackage(theme);
}

/**
 * Whether `--package <name>` selects a theme. It takes either name the CLI
 * shows for it: the package that provides it (`@astryxdesign/cli` for a
 * bundled theme) or the package the app imports it from, which the record
 * holds (`@astryxdesign/theme-butter`).
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string | undefined} name
 */
export function themeInPackage(theme, name) {
  return (
    name == null || theme.package === name || themeImportPackage(theme) === name
  );
}

/**
 * A bundled theme entry kept for the historical public `listThemes()` helper.
 * @typedef {Pick<import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme, 'slug' | 'displayName' | 'description' | 'maintained' | 'entry' | 'exportName' | 'files'>} BundledTheme
 */

/**
 * The themes bundled in this CLI build. Kept synchronous for compatibility with
 * programmatic callers that use this low-level helper directly.
 * @returns {BundledTheme[]}
 */
export function listThemes() {
  return availableBundledThemes().map(theme => ({
    slug: theme.slug,
    displayName: theme.displayName,
    description: theme.description,
    maintained: theme.maintained,
    entry: theme.entry,
    exportName: theme.exportName,
    files: theme.files,
  }));
}

/** @returns {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} */
function availableBundledThemes() {
  try {
    return discoverBundledThemes();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_NO_SOURCE);
  }
}

/**
 * Load available themes with any package-owned integration issues found while
 * discovering them. The issue set lets a package-scoped lookup distinguish an
 * absent theme from an installed package whose theme descriptors are broken.
 * @param {string} cwd
 * @param {{includeLocal?: boolean}} [options]
 * @returns {Promise<{themes: import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[], issues: Array<import('../../foundation/integrations/issue').AstryxIntegrationIssue & {package: string}>, skipped: SkippedLocalTheme[]}>}
 */
async function availableThemeState(cwd, {includeLocal = true} = {}) {
  let project;
  try {
    project = await Project.load(cwd);
  } catch {
    return {themes: availableBundledThemes(), issues: [], skipped: []};
  }
  try {
    // One broken local folder must not hide every other theme: it is
    // skipped with its reason, and only a lookup of that slug fails.
    const themes = await project.themes({includeLocal, skipBrokenLocal: true});
    return {
      themes,
      issues: await project.issues(),
      skipped: project.skippedLocalThemes(),
    };
  } catch (error) {
    throw asThemeError(error);
  }
}

/**
 * A local theme folder that failed validation and was left out.
 * @typedef {{slug: string, path: string, reason: string}} SkippedLocalTheme
 */

/**
 * Available themes, and the local folders left out because they are broken.
 * @param {string} [cwd]
 * @returns {Promise<{themes: import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[], skipped: SkippedLocalTheme[]}>}
 */
export async function listAvailableThemeState(cwd = process.cwd()) {
  const {themes, skipped} = await availableThemeState(cwd);
  return {themes, skipped};
}

/**
 * Bundled themes plus local and installed integration themes available to the
 * project.
 * @param {string} [cwd]
 * @param {{includeLocal?: boolean}} [options]
 * @returns {Promise<import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]>}
 */
export async function listAvailableThemes(cwd = process.cwd(), options = {}) {
  const {themes, skipped} = await availableThemeState(cwd, options);
  skippedLocalThemesOf.set(themes, skipped);
  return themes;
}

/**
 * The broken local folders left out of each list `listAvailableThemes`
 * returned, so a recorded theme that is only broken reports its reason.
 * @type {WeakMap<object, SkippedLocalTheme[]>}
 */
const skippedLocalThemesOf = new WeakMap();

/**
 * The error for a local theme folder that fails validation.
 * @param {SkippedLocalTheme} broken
 */
function brokenLocalThemeError(broken) {
  return new AstryxError(
    `Local theme "${broken.slug}" in ${broken.path} is broken: ${broken.reason}`,
    [
      {
        name: formatCliCommand('theme list'),
        reason: 'the themes that load, and the broken folders it skips',
      },
    ],
    ERROR_CODES.ERR_THEME_INVALID,
  );
}

/**
 * A slug that is not in the app's record. When a theme by that name is
 * available, the refusal names `theme add`; otherwise `theme list`, since
 * adding it would fail too.
 * @param {string} slug
 * @param {{projectDir: string}} state
 */
async function notAddedError(slug, state) {
  let match;
  try {
    match = await findTheme(slug, {cwd: state.projectDir});
  } catch (error) {
    // More than one package provides the slug: adding it names one.
    if (
      error instanceof AstryxError &&
      error.code === ERROR_CODES.ERR_AMBIGUOUS_THEME
    ) {
      return new AstryxError(
        `Theme "${slug}" is not added, and more than one package provides it. Add it from one of them with --package first.`,
        error.suggestions,
        ERROR_CODES.ERR_UNKNOWN_THEME,
      );
    }
    throw error;
  }
  const list = {
    name: formatCliCommand('theme list', state.projectDir),
    reason: 'the themes you can add',
  };
  if (!match) {
    return new AstryxError(
      `Theme "${slug}" is not added, and no theme by that name is available. Run \`${list.name}\` for the themes you can add.`,
      [list],
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }
  const add = formatCliCommand(`theme add ${match.slug}`, state.projectDir);
  return new AstryxError(
    `Theme "${slug}" is not added. Run \`${add}\` first.`,
    [{name: add, reason: 'add it to the app'}],
    ERROR_CODES.ERR_UNKNOWN_THEME,
  );
}

/** @param {unknown} error */
function isMissingThemeArtifact(error) {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ERR_THEME_ARTIFACT_NOT_FOUND'
  );
}

/** @param {unknown} error */
function isMalformedThemeArtifact(error) {
  return (
    error instanceof Error &&
    (error.name === 'ParseError' ||
      error.name === 'SyntaxError' ||
      error.message.startsWith('ParseError:') ||
      error.message.startsWith('SyntaxError:'))
  );
}

/** @param {string} specifier @param {string} cwd */
async function tryRecordedThemeArtifact(specifier, cwd) {
  try {
    return {
      module: await importThemeArtifact(specifier, cwd),
      missing: false,
      problem: null,
    };
  } catch (error) {
    if (isMissingThemeArtifact(error)) {
      return {module: null, missing: true, problem: null};
    }
    if (!isMalformedThemeArtifact(error)) throw error;
    const malformed = /** @type {Error} */ (error);
    const detail =
      malformed.message.split('\n', 1)[0]?.trim() || malformed.name;
    return {
      module: null,
      missing: false,
      problem: `could not load the recorded theme artifact "${specifier}": ${detail}`,
    };
  }
}

/**
 * Load one built theme named by the generated app record. Callers choose how to
 * present missing, ambiguous, or malformed results; unrelated loader failures
 * propagate. A missing generated module is reported as `configured: false` so
 * the released package-field path can remain separate.
 *
 * @param {string} cwd
 * @param {string} [requestedSlug] defaults to the record's default
 * @returns {Promise<{configured: boolean, slug: string|null, owner: string|null, module: Record<string, unknown>|null, specifier: string, missing?: boolean, problem: string|null}>}
 */
export async function resolveRecordedTheme(cwd, requestedSlug) {
  let state;
  try {
    state = readThemeState(cwd);
  } catch {
    return {
      configured: false,
      slug: null,
      owner: null,
      module: null,
      specifier: 'generated theme record',
      problem: null,
    };
  }
  if (!state.configured) {
    return {
      configured: false,
      slug: null,
      owner: null,
      module: null,
      specifier: 'generated theme record',
      problem: null,
    };
  }

  const slug = requestedSlug ?? state.defaultSlug;
  if (slug == null) {
    return {
      configured: true,
      slug: null,
      owner: null,
      module: null,
      specifier: 'generated theme record',
      problem: 'the generated theme record has no default theme',
    };
  }
  const owner = state.themes[slug];
  if (typeof owner !== 'string') {
    return {
      configured: true,
      slug,
      owner: null,
      module: null,
      specifier: `generated theme record (${slug})`,
      problem: `theme "${slug}" is not present in the generated theme record`,
    };
  }

  if (isLocalThemeOwner(owner)) {
    const specifier = path.join(state.projectDir, owner, slug, `${slug}.js`);
    const loaded = await tryRecordedThemeArtifact(specifier, state.projectDir);
    return {configured: true, slug, owner, ...loaded, specifier};
  }

  const perThemeSpecifier = `${owner}/themes/${slug}`;
  const perTheme = await tryRecordedThemeArtifact(
    perThemeSpecifier,
    state.projectDir,
  );
  if (perTheme.module || perTheme.problem) {
    return {
      configured: true,
      slug,
      owner,
      ...perTheme,
      specifier: perThemeSpecifier,
    };
  }

  let ownerThemeCount = null;
  try {
    const integrations = await loadIntegrations([owner], {
      cwd: state.projectDir,
      resolveProviders: false,
    });
    const integration = integrations.find(
      candidate => candidate.name === owner,
    );
    if (integration && !integration.__loadError) {
      ownerThemeCount = (await discoverIntegrationThemes(integration)).length;
    }
  } catch {
    // Bundled standalone theme packages have no integration manifest.
  }
  if (ownerThemeCount == null) {
    try {
      const available = await listAvailableThemes(state.projectDir);
      ownerThemeCount = available.filter(
        theme => themeImportPackage(theme) === owner,
      ).length;
    } catch {
      // An unavailable package cannot safely use the ambiguous shorthand.
    }
  }
  if (ownerThemeCount != null && ownerThemeCount > 1) {
    return {
      configured: true,
      slug,
      owner,
      module: null,
      specifier: perThemeSpecifier,
      problem: `theme "${slug}" is recorded from multi-theme package ${owner}, but ${perThemeSpecifier} does not resolve. Refusing to load ${owner}/built or the package root because either could be a different theme`,
    };
  }
  if (ownerThemeCount === 1) {
    for (const specifier of [`${owner}/built`, owner]) {
      const loaded = await tryRecordedThemeArtifact(
        specifier,
        state.projectDir,
      );
      if (loaded.module || loaded.problem) {
        return {configured: true, slug, owner, ...loaded, specifier};
      }
    }
  }
  return {
    configured: true,
    slug,
    owner,
    module: null,
    specifier: perThemeSpecifier,
    problem: null,
  };
}

/**
 * Source copies made by the released `theme add` before local descriptors.
 * @param {string} cwd
 */
export function listUnmigratedThemeCopies(cwd) {
  return discoverUnmigratedThemeCopies(cwd);
}

/** @param {string} slug */
function defaultEjectTarget(slug) {
  return path.join('src', 'themes', slug);
}

/**
 * Strip repository boilerplate from UTF-8 text while preserving binary bytes.
 * @param {Buffer} bytes
 * @returns {Buffer|string}
 */
function scaffoldContents(bytes) {
  const text = bytes.toString('utf-8');
  return Buffer.from(text, 'utf-8').equals(bytes)
    ? stripCopyrightHeader(text)
    : bytes;
}

/**
 * Describe an ejected theme as a new, unmaintained local fork.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string} [name] the fork's name: the folder it takes in the local
 *   themes root, which discovery reads as the theme's name
 */
function localThemeDescriptor(theme, name = theme.slug) {
  return `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {
  type: 'theme',
  name: ${JSON.stringify(name)},
  displayName: ${JSON.stringify(theme.displayName)},
  description: ${JSON.stringify(theme.description)},
  maintained: false,
};
`;
}

/**
 * Refuse a fork folder that already belongs to something else. `--overwrite`
 * replaces the files of a re-fork of the SAME theme. It never writes into a
 * theme that the theme editor made (its `palette.config.json` is the editor's
 * state), and never mixes two forks, whose shared file names (`icons.tsx`,
 * `palette.config.json`) would break the first one.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string} dir
 * @param {string} cwd
 * @param {string} projectDir the project root the default target is in
 * @param {string[]} [forkNames] the fork's own file names, when they differ
 */
function assertEjectTargetFree(theme, dir, cwd, projectDir, forkNames = []) {
  /** @type {string[]} */
  let entries;
  try {
    if (!fs.statSync(dir).isDirectory()) return;
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const rel = path.relative(cwd, dir) || '.';
  const isDefault =
    path.resolve(projectDir, defaultEjectTarget(theme.slug)) ===
    path.resolve(dir);
  const suggestion = isDefault
    ? undefined
    : [
        {
          name: formatCliCommand(`theme eject ${theme.slug}`, cwd),
          reason: `fork into ${defaultEjectTarget(theme.slug).split(path.sep).join('/')}`,
        },
      ];
  const editorRecord = editorThemeRecord(dir);
  if (editorRecord) {
    throw new AstryxError(
      `${rel} holds a theme made by the theme editor (${editorRecord}). Eject does not write into it, even with --overwrite.`,
      suggestion,
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }
  const ownFiles = new Set(
    [...theme.files, ...forkNames].map(name => path.basename(name)),
  );
  for (const name of entries) {
    const otherDescriptor =
      name.endsWith('.doc.mjs') && !ownFiles.has(name)
        ? themeDescriptorName(path.join(dir, name))
        : null;
    const otherEntry =
      /Theme\.(?:ts|tsx|mts)$/.test(name) && !ownFiles.has(name);
    // A fork in the local themes root carries its folder's name.
    if (
      (otherDescriptor &&
        otherDescriptor !== theme.slug &&
        otherDescriptor !== path.basename(dir)) ||
      otherEntry
    ) {
      throw new AstryxError(
        `${rel} holds another theme (${name}). Eject does not mix two themes in one folder, even with --overwrite.`,
        suggestion,
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
  }
}

/**
 * Refuse a fork target that `theme list` and `theme add` would then misread:
 * the local themes folder itself, where every theme has its own folder, or a
 * folder in it named after another theme the project can use.
 * @param {string} slug
 * @param {string} dir absolute target
 * @param {string} projectDir
 * @param {string} cwd
 * @param {Set<string>} takenSlugs the slugs of the themes the project can use
 * @param {boolean} [sameFork] whether the folder holds no fork or a fork of
 *   this theme
 */
function assertEjectTargetPlace(
  slug,
  dir,
  projectDir,
  cwd,
  takenSlugs,
  sameFork = true,
) {
  const themesRoot = path.resolve(projectDir, LOCAL_THEME_ROOT);
  const resolved = path.resolve(dir);
  const own = defaultEjectTarget(slug).split(path.sep).join('/');
  const suggestion = [
    {
      name: formatCliCommand(`theme eject ${slug}`, cwd),
      reason: `fork into ${own}`,
    },
  ];
  if (resolved === themesRoot) {
    throw new AstryxError(
      `${path.relative(cwd, dir) || '.'} is the folder that holds the local themes, each in its own folder. Fork ${slug} into ${own}.`,
      suggestion,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  // A fork may take a new name; only another theme's name is refused.
  const name = path.basename(resolved);
  // The theme of that name may be the one in this very folder (a re-fork,
  // which the folder checks decide).
  const ownFolder = () => {
    try {
      return fs
        .readdirSync(resolved)
        .some(
          file =>
            file.endsWith('.doc.mjs') &&
            themeDescriptorName(path.join(resolved, file)) === name,
        );
    } catch {
      return false;
    }
  };
  if (
    path.dirname(resolved) === themesRoot &&
    name !== slug &&
    takenSlugs.has(name) &&
    !(sameFork && ownFolder())
  ) {
    throw new AstryxError(
      `${path.relative(cwd, dir)} is named after the theme ${name}, and a local theme's folder carries its name. Fork ${slug} into ${own}, or into a folder with a new name.`,
      suggestion,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

/**
 * Whether a folder holds no fork, or a fork of `theme`: its descriptor
 * carries the theme's display name, as eject writes it.
 * @param {string} dir
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 */
function holdsForkOf(dir, theme) {
  let docs;
  try {
    docs = fs.readdirSync(dir).filter(file => file.endsWith('.doc.mjs'));
  } catch {
    return true;
  }
  return docs.every(file => {
    try {
      const text = fs.readFileSync(path.join(dir, file), 'utf-8');
      return (
        /\bdisplayName:\s*(['"])(.*?)\1/.exec(text)?.[2] === theme.displayName
      );
    } catch {
      return false;
    }
  });
}

/**
 * The `name` of a theme descriptor, read as text so a broken file cannot run.
 * @param {string} file
 * @returns {string | null}
 */
function themeDescriptorName(file) {
  try {
    const text = fs.readFileSync(file, 'utf-8');
    if (!/type:\s*['"]theme['"]/.test(text)) return null;
    return /\bname:\s*['"]([^'"]+)['"]/.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Publish one theme's complete source inventory as an atomic local fork.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {{cwd: string, targetPath?: string, overwrite?: boolean, takenSlugs?: Set<string>}} options
 *   `takenSlugs`: the slugs of the themes the project can use, which a fork's
 *   new folder name may not take
 * @returns {{outputDir: string, files: string[]}} the project-relative output
 *   directory and the files written, named as the fork names them
 */
export function ejectThemeFiles(
  theme,
  {cwd, targetPath: typedPath, overwrite = false, takenSlugs = new Set()},
) {
  // The fork lands in the project, as list and add read it: the default root
  // is the project's, and a relative [path] is read from the working folder
  // but must stay inside the project.
  // Read as every theme command reads a path it writes; a backslash
  // separates folders on every platform.
  const {
    projectDir,
    typed: targetPath,
    relative: target,
  } = projectWritePath(
    cwd,
    typedPath || undefined,
    defaultEjectTarget(theme.slug),
  );
  let resolvedDir;
  try {
    resolvedDir = assertWithin(target, projectDir, {
      label: 'theme target path',
    });
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        targetPath
          ? error.message.replace(`"${target}"`, `"${targetPath}"`)
          : error.message,
        [
          {
            name: formatCliCommand(`theme eject ${theme.slug}`, cwd),
            reason: `fork into ${defaultEjectTarget(theme.slug).split(path.sep).join('/')}`,
          },
        ],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }

  // A fork in the local themes root is named after its folder, as `theme
  // list` and `theme add` read it; elsewhere it keeps the theme's name.
  const inThemesRoot =
    path.dirname(path.resolve(resolvedDir)) ===
    path.resolve(projectDir, LOCAL_THEME_ROOT);
  const forkName = inThemesRoot ? path.basename(resolvedDir) : theme.slug;
  if (inThemesRoot && !THEME_SLUG_RE.test(forkName)) {
    throw new AstryxError(
      `A local theme's folder is its name, which is lowercase kebab-case starting with a letter; ${forkName} is not.`,
      [
        {
          name: formatCliCommand(`theme eject ${theme.slug}`, cwd),
          reason: `fork into ${defaultEjectTarget(theme.slug).split(path.sep).join('/')}`,
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  const names = forkFileNames(theme, forkName);
  let writes;
  try {
    writes = theme.files.map((src, index) => ({
      name: names[index],
      src: path.join(theme.sourceDir, src),
      dest: assertWithin(names[index], resolvedDir, {
        label: `theme destination for ${names[index]}`,
      }),
    }));
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }

  for (const write of writes) {
    if (!fs.existsSync(write.src)) {
      throw new AstryxError(
        `Theme "${theme.slug}" is missing bundled file "${write.name}". ` +
          'Re-run `node scripts/generate-cli-themes.mjs` to rebuild the bundle.',
        undefined,
        ERROR_CODES.ERR_NO_SOURCE,
      );
    }
  }

  // The fork's own names count as its files only in a folder that holds
  // no fork or a fork of this theme.
  const sameFork = holdsForkOf(resolvedDir, theme);
  assertEjectTargetFree(
    theme,
    resolvedDir,
    cwd,
    projectDir,
    sameFork ? names : [],
  );
  assertEjectTargetPlace(
    theme.slug,
    resolvedDir,
    projectDir,
    cwd,
    takenSlugs,
    sameFork,
  );
  if (!overwrite) {
    const existing = writes.find(write => fs.existsSync(write.dest));
    if (existing) {
      const rel = path.relative(cwd, existing.dest) || existing.dest;
      throw new AstryxError(
        `Refusing to overwrite existing file ${rel}. ` +
          'Re-run with --overwrite (or -f) to replace it.',
        [
          {
            name: formatCliCommand(
              [
                'theme eject',
                theme.slug,
                ...(targetPath ? [quoteCommandArgument(targetPath)] : []),
                ...(theme.source === 'bundled'
                  ? []
                  : ['--package', quoteCommandArgument(theme.package)]),
                '--overwrite',
              ].join(' '),
              cwd,
            ),
            reason: 'replace the earlier fork of this theme',
          },
        ],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
  }

  // A fork under another name renames its entry first, so an entry that
  // names no theme is refused before any folder is made.
  const entrySrc = path.resolve(theme.sourceDir, theme.files[0]);
  const renamed =
    forkName !== theme.slug
      ? renamedEntry(
          String(scaffoldContents(fs.readFileSync(entrySrc))),
          theme,
          forkName,
        )
      : null;
  try {
    fs.mkdirSync(resolvedDir, {recursive: true});
    const plans = writes.map(write => {
      fs.mkdirSync(path.dirname(write.dest), {recursive: true});
      const dest = assertWithin(write.name, resolvedDir, {
        label: `theme destination for ${write.name}`,
      });
      return {
        path: dest,
        contents:
          path.resolve(write.src) === path.resolve(theme.docPath)
            ? localThemeDescriptor(theme, forkName)
            : renamed != null && path.resolve(write.src) === entrySrc
              ? renamed
              : scaffoldContents(fs.readFileSync(write.src)),
        createOnly: !overwrite,
      };
    });
    applyWrites(plans);
  } catch (error) {
    if (error instanceof AstryxError) throw error;
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    const message =
      fsErrorMessage(error, path.relative(cwd, resolvedDir) || '.') ??
      `Failed to write theme files: ${error instanceof Error ? error.message : String(error)}`;
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_WRITE_FAILED);
  }

  return {outputDir: path.relative(cwd, resolvedDir) || '.', files: names};
}

/**
 * The packages the fork imports that the app does not declare. A fork that
 * imports a missing package (bundled icon sets use `lucide-react`) fails to
 * build, so the receipt names them with an install command.
 * @param {string} outputDir fork folder, relative to cwd
 * @param {string[]} files
 * @param {string} cwd
 */
export function forkNeeds(outputDir, files, cwd) {
  const source = files
    .filter(name => /\.(?:[cm]?[jt]sx?)$/.test(name))
    .map(name => {
      try {
        return fs.readFileSync(path.resolve(cwd, outputDir, name), 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
  const {missingPackages, installCommand} = analyzeTemplateNeeds(
    source,
    findPackageRoot(cwd) ?? path.resolve(cwd),
  );
  return {missingPackages, installCommand};
}

/** @param {unknown} error */
function asThemeError(error) {
  if (error instanceof AstryxError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof ThemeStateError &&
    message.startsWith('Refusing to replace')
      ? ERROR_CODES.ERR_FILE_EXISTS
      : ERROR_CODES.ERR_THEME_INVALID;
  const suggestions =
    error instanceof ThemeStateError || error instanceof ThemeImportError
      ? error.suggestions
      : undefined;
  return new AstryxError(message, suggestions, code);
}

/**
 * Resolve an available theme by case-insensitive slug and optional owner package.
 * Without an explicit package, a local theme shadows package themes that share
 * its slug. Other duplicate slugs fail closed until the caller selects an owner.
 * @param {string} [slug]
 * @param {{cwd?: string, package?: string, includeLocal?: boolean, command?: string}} [options]
 *   `command`: the command a refusal suggests running with `--package`,
 *   `theme add` by default
 * @returns {Promise<import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme | undefined>}
 */
export async function findTheme(slug, options = {}) {
  if (!slug) return undefined;
  const {themes, issues, skipped} = await availableThemeState(
    options.cwd ?? process.cwd(),
    {includeLocal: options.includeLocal},
  );
  const normalized = String(slug).toLowerCase();
  const matches = themes.filter(
    theme =>
      theme.slug.toLowerCase() === normalized &&
      themeInPackage(theme, options.package),
  );
  const broken = skipped.find(entry => entry.slug.toLowerCase() === normalized);
  if (
    matches.length === 0 &&
    broken &&
    (options.package == null || options.package === LOCAL_THEME_ROOT)
  ) {
    throw brokenLocalThemeError(broken);
  }
  if (matches.length === 0 && options.package != null) {
    const packageIssue = issues.find(
      issue => issue.package === options.package && issue.severity === 'error',
    );
    if (packageIssue) {
      throw new AstryxError(
        `Theme package "${options.package}" is installed but unavailable: ${packageIssue.message}`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
  }
  if (matches.length > 1 && options.package == null) {
    const local = matches.find(theme => theme.source === 'local');
    if (local) return local;
  }
  if (matches.length > 1) {
    throw new AstryxError(
      `Theme "${slug}" is provided by more than one package. Select one with --package.`,
      matches.map(theme => ({
        name: formatCliCommand(
          `${options.command ?? 'theme add'} ${theme.slug} --package ${quoteCommandArgument(theme.package)}`,
          options.cwd ?? process.cwd(),
        ),
        reason:
          theme.source === 'bundled'
            ? 'bundled theme'
            : theme.source === 'local'
              ? 'local theme'
              : `provided by ${theme.package}`,
      })),
      ERROR_CODES.ERR_AMBIGUOUS_THEME,
    );
  }
  return matches[0];
}

/**
 * Runnable `<command> <slug>` suggestions for an unknown slug, closest names
 * first; `--package` is named only where packages share a slug.
 * @param {string} command such as `theme add`
 * @param {string} slug what the person typed
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} available
 * @param {string} cwd
 * @returns {Array<{theme: import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme, name: string}>}
 */
export function themeCommandsFor(command, slug, available, cwd) {
  const needle = String(slug).toLowerCase();
  const shared = (/** @type {string} */ other) =>
    available.filter(theme => theme.slug === other).length > 1;
  return [...available]
    .sort(
      (a, b) =>
        levenshteinDistance(needle, a.slug.toLowerCase()) -
          levenshteinDistance(needle, b.slug.toLowerCase()) ||
        a.slug.localeCompare(b.slug),
    )
    .slice(0, 5)
    .map(theme => ({
      theme,
      name: formatCliCommand(
        `${command} ${theme.slug}${shared(theme.slug) ? ` --package ${quoteCommandArgument(theme.package)}` : ''}`,
        cwd,
      ),
    }));
}

/**
 * Read the generated module's app-theme record with stable CLI errors.
 * @param {string} [cwd]
 */
export function readAppThemeState(cwd = process.cwd()) {
  try {
    return readThemeState(cwd);
  } catch (error) {
    throw asThemeError(error);
  }
}

/**
 * Read the app state needed by a list operation. Outside a package project,
 * bundled themes remain listable and there is no generated app state.
 * @param {string} [cwd]
 * @returns {Pick<ReturnType<typeof readThemeState>, 'projectDir' | 'themes' | 'defaultSlug'>}
 */
export function readThemeListState(cwd = process.cwd()) {
  let projectDir;
  try {
    ({projectDir} = findThemeProject(cwd));
  } catch (error) {
    if (error instanceof ThemeStateError) {
      return {
        projectDir: path.resolve(cwd),
        themes: {},
        defaultSlug: null,
      };
    }
    throw asThemeError(error);
  }
  return readAppThemeState(projectDir);
}

/**
 * Resolve every recorded owner to built import metadata, in record order.
 * @param {ReturnType<typeof readThemeState>} state
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} available
 */
export function resolveRecordedThemes(state, available) {
  /** @type {Map<string, number>} */
  const ownerCounts = new Map();
  for (const theme of available) {
    const owner = themeImportPackage(theme);
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  return Object.entries(state.themes).map(([slug, owner]) => {
    const theme = available.find(
      candidate =>
        candidate.slug === slug && themeImportPackage(candidate) === owner,
    );
    const broken = isLocalThemeOwner(owner)
      ? skippedLocalThemesOf.get(available)?.find(entry => entry.slug === slug)
      : undefined;
    if (!theme && broken) throw brokenLocalThemeError(broken);
    if (!theme) {
      throw new AstryxError(
        `Added theme "${slug}" from ${owner} is unavailable. Reinstall the package or restore the local theme, or drop it with \`${formatCliCommand(`theme remove ${slug}`, state.projectDir)}\`.`,
        [
          {
            name: formatCliCommand(`theme remove ${slug}`, state.projectDir),
            reason: 'drop it from the app',
          },
        ],
        ERROR_CODES.ERR_UNKNOWN_THEME,
      );
    }
    try {
      return resolveThemeImports(theme, {
        cwd: state.projectDir,
        ownerThemeCount: ownerCounts.get(owner) ?? 1,
      });
    } catch (error) {
      if (error instanceof ThemeImportError) throw asThemeError(error);
      throw error;
    }
  });
}

/**
 * Resolve the current generated-module state without changing it.
 * @param {string} [cwd]
 */
export async function resolveThemeApp(cwd = process.cwd()) {
  const state = readAppThemeState(cwd);
  const available = await listAvailableThemes(state.projectDir);
  const entries = state.configured
    ? resolveRecordedThemes(state, available)
    : [];
  return {state, available, entries};
}

/**
 * @param {ReturnType<typeof readThemeState>} state
 * @param {Record<string, string>} themes
 * @param {string} defaultSlug
 * @param {'add'|'remove'|'use'} action
 * @param {string} slug
 * @param {boolean} changed
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} available
 * @param {string[]} [notes] what the command did beyond its change
 * @returns {Promise<import('./theme.type.mjs').ThemeAppResponse>}
 */
async function writeThemeApp(
  state,
  themes,
  defaultSlug,
  action,
  slug,
  changed,
  available,
  notes = [],
) {
  // A recorded theme whose folder or package is gone would make every later
  // add, use and remove fail, and the record is generated, so it cannot be
  // fixed by hand. Leave it out and say so. A theme that is only broken or
  // not installed yet stays, and its refusal says how to fix it.
  const kept = {...themes};
  for (const [recorded, owner] of Object.entries(themes)) {
    if (
      recorded === defaultSlug ||
      isRecordedThemeAvailable(recorded, owner, available) ||
      !isRecordedThemeGone(recorded, owner, state.projectDir)
    )
      continue;
    delete kept[recorded];
    notes.push(
      `Removed "${recorded}" from the app themes: ${owner} no longer provides it. Restore it, then run \`${formatCliCommand(`theme add ${recorded}`, state.projectDir)}\` to add it again.`,
    );
  }
  themes = kept;
  const finalState = {...state, themes, defaultSlug, configured: true};
  const resolved = resolveRecordedThemes(finalState, available);
  let prepared;
  try {
    prepared = planThemeAppWrite(finalState, themes, defaultSlug, resolved);
  } catch (error) {
    throw asThemeError(error);
  }
  try {
    applyWrites([prepared.plan]);
  } catch (error) {
    if (error instanceof AstryxError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(
      `Failed to write the generated theme module: ${message}`,
      undefined,
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  // A result about the one theme `theme add` just added names the npm package
  // that owns it (cli-surface INV28). A local theme has no package to name, and
  // remove and use report the whole record rather than one added theme.
  const added =
    action === 'add'
      ? prepared.entries.find(theme => theme.slug === slug)
      : undefined;
  return {
    type: 'theme.app',
    ...(added && added.source !== 'local' ? {package: added.owner} : {}),
    data: {
      themes: prepared.entries.map(theme => ({
        slug: theme.slug,
        owner: theme.owner,
        module: theme.module,
        stylesheet: theme.stylesheet,
        ...(theme.fontStylesheet ? {fontStylesheet: theme.fontStylesheet} : {}),
        source: theme.source,
      })),
      default: defaultSlug,
      modulePath: prepared.module.path,
      change: {
        action,
        slug,
        changed,
        firstAdd: action === 'add' && !state.configured,
      },
      ...(notes.length > 0 ? {notes} : {}),
    },
  };
}

/**
 * @param {string} slug
 * @param {string} owner
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} available
 */
function isRecordedThemeAvailable(slug, owner, available) {
  return available.some(
    theme => theme.slug === slug && themeImportPackage(theme) === owner,
  );
}

/**
 * Is a recorded theme's source gone, not just broken? A local theme is gone
 * when its folder is; a package theme when the app neither declares the
 * package nor can resolve it.
 * @param {string} slug
 * @param {string} owner
 * @param {string} projectDir
 */
function isRecordedThemeGone(slug, owner, projectDir) {
  if (isLocalThemeOwner(owner)) {
    return !fs.existsSync(path.resolve(projectDir, owner, slug));
  }
  let declared = false;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
    );
    declared = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ].some(deps => deps != null && Object.hasOwn(deps, owner));
  } catch {
    // An unreadable package.json declares nothing.
  }
  if (declared) return false;
  try {
    createRequire(path.join(projectDir, 'package.json')).resolve(
      `${owner}/package.json`,
    );
    return false;
  } catch (error) {
    // A package whose exports hide package.json is still installed.
    return (
      /** @type {NodeJS.ErrnoException} */ (error).code !==
      'ERR_PACKAGE_PATH_NOT_EXPORTED'
    );
  }
}

/** How long a theme command waits for another one changing the same app. */
const THEME_APP_LOCK_WAIT_MS = 15_000;

/**
 * Run one read-modify-write of the app theme record at a time per project.
 * Two commands at once would each read the old record, and the second write
 * would drop the first one's change. The lock folder lives in the per-user
 * cache folder, so nothing is left in the project.
 * @template T
 * @param {string} cwd
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withThemeAppLock(cwd, fn) {
  let projectDir;
  try {
    ({projectDir} = findThemeProject(cwd));
  } catch {
    // Outside a project the command refuses before it writes anything.
    return fn();
  }
  const key = crypto
    .createHash('sha256')
    .update(fs.realpathSync(projectDir))
    .digest('hex')
    .slice(0, 24);
  const lockDir = path.join(userCacheDir(), 'theme-app-locks', key);
  const lockFailed = (/** @type {unknown} */ error) =>
    new AstryxError(
      `Could not take the lock that keeps two theme commands from changing this app's themes at once (${lockDir}): ${error instanceof Error ? error.message : String(error)}. Check that the folder can be written, then run this command again.`,
      undefined,
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  const deadline = Date.now() + THEME_APP_LOCK_WAIT_MS;
  for (;;) {
    let taken;
    try {
      taken = tryLock(lockDir);
    } catch (error) {
      throw lockFailed(error);
    }
    if (taken) break;
    if (Date.now() > deadline) {
      throw new AstryxError(
        "Another theme command is changing this app's themes. Run this command again when it ends.",
        undefined,
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  try {
    return await fn();
  } finally {
    try {
      fs.rmSync(lockDir, {recursive: true, force: true});
    } catch {
      // A lock left behind expires: tryLock takes over a lock whose holder is gone.
    }
  }
}

/**
 * Add one available built theme to the app record.
 * @param {string} slug
 * @param {{cwd?: string, package?: string}} [options]
 * @returns {Promise<import('./theme.type.mjs').ThemeAppResponse>}
 */
export async function addThemeToApp(slug, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  return withThemeAppLock(cwd, () => addThemeToAppLocked(slug, cwd, options));
}

/**
 * @param {string} slug
 * @param {string} cwd
 * @param {{package?: string}} options
 */
async function addThemeToAppLocked(slug, cwd, options) {
  const match = await findTheme(slug, {cwd, package: options.package});
  if (!match) {
    const available = await listAvailableThemes(cwd);
    throw new AstryxError(
      `Unknown theme "${slug}"${options.package ? ` in package "${options.package}"` : ''}.`,
      themeCommandsFor('theme add', slug, available, cwd).map(
        ({theme, name}) => ({
          name,
          reason:
            theme.source === 'bundled'
              ? 'bundled theme'
              : theme.source === 'local'
                ? 'local theme'
                : `provided by ${theme.package}`,
        }),
      ),
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }
  const state = readAppThemeState(cwd);
  const available = await listAvailableThemes(state.projectDir);
  const owner = themeImportPackage(match);
  /** @type {string[]} */
  const notes = [];
  const previous = state.themes[match.slug];
  if (previous != null && previous !== owner) {
    notes.push(
      `"${match.slug}" now comes from ${owner}${match.source === 'local' ? ' (local theme)' : ''}, replacing ${previous}.`,
    );
  }
  if (options.package == null) {
    // A local theme shadows a package theme with the same slug; say which
    // one this add chose, and how to pick the other.
    const others = available.filter(
      theme => theme.slug === match.slug && themeImportPackage(theme) !== owner,
    );
    for (const other of others) {
      notes.push(
        `Chose ${owner}${match.source === 'local' ? ' (local theme)' : ''} for "${match.slug}". To use the one from ${other.package} instead: \`${formatCliCommand(`theme add ${match.slug} --package ${other.package}`, state.projectDir)}\`.`,
      );
    }
  }
  const themes = {...state.themes, [match.slug]: owner};
  const changed = previous !== owner;
  const defaultSlug =
    state.configured && state.defaultSlug != null
      ? state.defaultSlug
      : match.slug;
  return writeThemeApp(
    state,
    themes,
    defaultSlug,
    'add',
    match.slug,
    changed,
    available,
    notes,
  );
}

/**
 * Canonical recorded slug for a case-insensitive command lookup.
 * @param {ReturnType<typeof readThemeState>} state
 * @param {string} slug
 */
function recordedThemeSlug(state, slug) {
  const needle = slug.toLowerCase();
  return Object.keys(state.themes).find(
    candidate => candidate.toLowerCase() === needle,
  );
}

/**
 * Remove one non-default theme from the app record.
 * @param {string} slug
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('./theme.type.mjs').ThemeAppResponse>}
 */
export async function removeThemeFromApp(slug, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  return withThemeAppLock(cwd, () => removeThemeFromAppLocked(slug, cwd));
}

/** @param {string} slug @param {string} cwd */
async function removeThemeFromAppLocked(slug, cwd) {
  const state = readAppThemeState(cwd);
  const recordedSlug = recordedThemeSlug(state, slug);
  if (!state.configured || recordedSlug == null) {
    throw await notAddedError(slug, state);
  }
  if (state.defaultSlug === recordedSlug) {
    const others = Object.keys(state.themes).filter(
      other => other !== recordedSlug,
    );
    const uses = others.slice(0, 3).map(other => ({
      name: formatCliCommand(`theme use ${other}`, state.projectDir),
      reason: `make ${other} the default`,
    }));
    throw new AstryxError(
      uses.length > 0
        ? `Theme "${recordedSlug}" is the default. Run \`${uses[0].name}\` before removing it.`
        : `Theme "${recordedSlug}" is the default and the only added theme. Add another theme and make it the default before removing it.`,
      uses.length > 0
        ? uses
        : [
            {
              name: formatCliCommand('theme list', state.projectDir),
              reason: 'the themes you can add',
            },
          ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const themes = {...state.themes};
  delete themes[recordedSlug];
  if (state.defaultSlug == null) {
    throw new AstryxError(
      `The generated theme module has no default theme. Run \`${formatCliCommand(`theme use ${Object.keys(themes)[0] ?? recordedSlug}`, state.projectDir)}\` first.`,
      [
        {
          name: formatCliCommand(
            `theme use ${Object.keys(themes)[0] ?? recordedSlug}`,
            state.projectDir,
          ),
          reason: 'choose a default',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const available = await listAvailableThemes(state.projectDir);
  return writeThemeApp(
    state,
    themes,
    state.defaultSlug,
    'remove',
    recordedSlug,
    true,
    available,
  );
}

/**
 * Select one added theme as the app default.
 * @param {string} slug
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('./theme.type.mjs').ThemeAppResponse>}
 */
export async function useThemeInApp(slug, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  return withThemeAppLock(cwd, () => useThemeInAppLocked(slug, cwd));
}

/** @param {string} slug @param {string} cwd */
async function useThemeInAppLocked(slug, cwd) {
  const state = readAppThemeState(cwd);
  const recordedSlug = recordedThemeSlug(state, slug);
  if (!state.configured || recordedSlug == null) {
    throw await notAddedError(slug, state);
  }
  const available = await listAvailableThemes(state.projectDir);
  return writeThemeApp(
    state,
    state.themes,
    recordedSlug,
    'use',
    recordedSlug,
    state.defaultSlug !== recordedSlug,
    available,
  );
}

/**
 * The Core theme targets are read from: the project's, else the release's
 * own, installed into the per-user cache first when needed (a network install
 * and an npm subprocess; spec AST-081 FR3). Throws as requireCoreDir does.
 * @param {string} cwd
 * @returns {string}
 */
export function requireThemeCoreDir(cwd) {
  return requireCoreDir(cwd);
}

/**
 * The Core a theme build reads outside a project: the one the answering copy
 * carries, installed into the per-user cache first when needed (a network
 * install and an npm subprocess; spec AST-081 FR3); null when there is none.
 * @param {string} cwd
 * @returns {string | null}
 */
export function fetchCarriedThemeCoreDir(cwd) {
  return findCarriedCoreDir(cwd, {fetch: true});
}
