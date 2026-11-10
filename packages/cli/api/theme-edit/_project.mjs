// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The project `astryx experimental theme` works in: its installed
 * Core (the theme module, its token defaults and groups, its theming
 * targets and component docs), the cache folder, and the built-in themes it
 * can build on. Everything is read from the installed packages, so the
 * checks always match the Core the app runs.
 *
 * @position api/theme-edit — the subject's access to installed packages
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {loadComponentDoc} from '../../foundation/discovery/component-loader.mjs';
import {collectThemingTargets} from '../../foundation/discovery/theming-targets.mjs';
import {resolveImportPath} from '../../foundation/discovery/component-discovery.mjs';
import {detectPackageManager} from '../../foundation/env/package-manager.mjs';

/**
 * @typedef {object} ThemeProject
 * @property {string} cwd
 * @property {string} coreDir - The folder of the installed Core package.
 * @property {string} coreVersion
 * @property {string} coreKey - The Core version plus a fingerprint of its stylesheet.
 * @property {string} cacheDir - node_modules/.cache/astryx-theme/<coreKey>
 * @property {any} core - Core's theme module.
 * @property {NodeJS.Require} req - Resolves packages from the project.
 * @property {import('../../foundation/discovery/theming-targets.mjs').ThemingTarget[]} targets
 * @property {Map<string, import('../../foundation/discovery/theming-targets.mjs').ThemingTarget>} target
 * @property {Record<string, ComponentInfo>} components
 */

/**
 * @typedef {object} ComponentInfo
 * @property {string} importPath
 * @property {string} category - The doc's category, such as Action or Overlay.
 * @property {unknown} defaults - Playground defaults, or null.
 * @property {Array<{className: string, values: Record<string, string[]>}>} targets
 */

/** @type {Map<string, ThemeProject>} */
const projects = new Map();

/** Bump when the shape of the cached component docs changes. */
const DOCS_VERSION = 1;

/**
 * The nearest folder at or above `dir` that holds node_modules.
 * @param {string} dir
 * @returns {string | null}
 */
function nodeModulesRoot(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'node_modules'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/**
 * The install line for packages, in the project's package manager.
 * @param {string} cwd
 * @param {string[]} packages
 */
export function installLine(cwd, packages) {
  const pm = detectPackageManager(cwd);
  return `${pm === 'npm' || pm === 'npx' ? 'npm install' : `${pm} add`} ${packages.join(' ')}`;
}

/** @param {string} type @returns {string[]} */
const literals = type =>
  [...String(type ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);

/**
 * Every component doc under Core's src folder: playground defaults and the
 * variant values of each theming target.
 * @param {string} coreDir
 * @returns {Promise<Record<string, ComponentInfo>>}
 */
async function readComponents(coreDir) {
  /** @type {Record<string, ComponentInfo>} */
  const out = {};
  /** @param {string} dir */
  const scan = async dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__')
          await scan(full);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;
      /** @type {any} */
      let doc;
      try {
        doc = await loadComponentDoc(full);
      } catch {
        continue;
      }
      if (!doc || typeof doc.name !== 'string') continue;
      /** @type {Record<string, any>} */
      const props = Object.fromEntries(
        (Array.isArray(doc.props) ? doc.props : []).map(
          (/** @type {any} */ p) => [p.name, p],
        ),
      );
      out[doc.name] = {
        importPath: resolveImportPath(coreDir, doc.name),
        category: typeof doc.category === 'string' ? doc.category : '',
        defaults: doc.playground?.defaults ?? null,
        targets: (doc.theming?.targets ?? []).map((/** @type {any} */ t) => ({
          className: t.className,
          values: Object.fromEntries(
            (t.visualProps ?? []).map((/** @type {string} */ v) => {
              const p = props[v];
              const vals = p
                ? literals(p.type).length
                  ? literals(p.type)
                  : p.type === 'boolean'
                    ? ['true', 'false']
                    : []
                : [];
              return [v, vals];
            }),
          ),
        })),
      };
    }
  };
  const src = path.join(coreDir, 'src');
  if (fs.existsSync(src)) await scan(src);
  return out;
}

/**
 * The project in `cwd`. Refuses when Core is not installed there, since the
 * generated theme imports it.
 * @param {string} cwd
 * @returns {Promise<ThemeProject>}
 */
export async function openProject(cwd) {
  const key = path.resolve(cwd);
  const known = projects.get(key);
  if (known) return known;
  const req = createRequire(path.join(key, 'noop.js'));
  /** @type {string} */
  let themeFile;
  try {
    themeFile = req.resolve('@astryxdesign/core/theme');
  } catch {
    throw new AstryxError(
      '@astryxdesign/core is not installed here. astryx experimental theme writes a theme that imports it, and checks every change against it, so run it in an app that has Core installed.',
      [
        {
          name: installLine(key, ['@astryxdesign/core']),
          reason: 'install Core',
        },
      ],
      ERROR_CODES.ERR_PROJECT_REQUIRED,
    );
  }
  let coreDir = path.dirname(themeFile);
  while (
    !fs.existsSync(path.join(coreDir, 'package.json')) &&
    path.dirname(coreDir) !== coreDir
  )
    coreDir = path.dirname(coreDir);
  const coreVersion =
    JSON.parse(fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'))
      .version ?? '0.0.0';
  let fingerprint = 'nocss';
  try {
    fingerprint = createHash('sha256')
      .update(fs.readFileSync(req.resolve('@astryxdesign/core/astryx.css')))
      .digest('hex')
      .slice(0, 12);
  } catch {
    // No stylesheet: the part data is empty, and the version alone keys it.
  }
  const coreKey = `${coreVersion}-${fingerprint}`;
  const root = nodeModulesRoot(key) ?? key;
  const core = await import(pathToFileURL(themeFile).href);
  const cacheDir = path.join(
    root,
    'node_modules',
    '.cache',
    'astryx-theme',
    coreKey,
  );
  // Reading every component doc takes a second; it is fixed per Core install.
  const docsFile = path.join(cacheDir, 'docs.json');
  /** @type {{version: number, targets: ThemeProject['targets'], components: ThemeProject['components']} | null} */
  let docs = null;
  try {
    const cached = JSON.parse(fs.readFileSync(docsFile, 'utf8'));
    if (cached.version === DOCS_VERSION) docs = cached;
  } catch {
    // Not cached yet.
  }
  if (!docs) {
    docs = {
      version: DOCS_VERSION,
      targets: await collectThemingTargets(path.join(coreDir, 'src')),
      components: await readComponents(coreDir),
    };
    try {
      fs.mkdirSync(cacheDir, {recursive: true});
      fs.writeFileSync(docsFile, JSON.stringify(docs));
    } catch {
      // A read-only node_modules: read the docs again next time.
    }
  }
  const {targets, components} = docs;
  const project = {
    cwd: key,
    coreDir,
    coreVersion,
    coreKey,
    cacheDir,
    core,
    req,
    targets,
    target: new Map(targets.map(t => [t.key, t])),
    components,
  };
  projects.set(key, project);
  return project;
}

/**
 * The module a component (or a sub-component) is imported from, or null
 * when Core has no module for it.
 * @param {ThemeProject} project
 * @param {string} name
 * @returns {string | null}
 */
export function importPathOf(project, name) {
  const spec =
    project.components[name]?.importPath ??
    resolveImportPath(project.coreDir, name);
  return spec && spec !== '@astryxdesign/core' ? spec : null;
}

/**
 * The built-in theme package for a base, or a refusal naming its install line.
 * @param {ThemeProject} project
 * @param {string} like
 * @returns {string} the resolved built module
 */
export function baseThemeFile(project, like) {
  const pkg = `@astryxdesign/theme-${like}`;
  try {
    return project.req.resolve(`${pkg}/built`);
  } catch {
    throw new AstryxError(
      `The ${like} theme is not installed, so a theme cannot build on it. Install ${pkg}, or build on no theme. Nothing was changed.`,
      [{name: installLine(project.cwd, [pkg]), reason: 'install it'}],
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }
}

/**
 * Resolved tokens of the base theme in both modes.
 * @param {ThemeProject} project
 * @param {string | undefined} like
 * @returns {Promise<{light: Record<string, string>, dark: Record<string, string>}>}
 */
export async function baseResolved(project, like) {
  const {core} = project;
  let theme = core.defineTheme({name: 'astryx-defaults'});
  if (like) {
    const m = await import(pathToFileURL(baseThemeFile(project, like)).href);
    theme =
      m[`${like}Theme`] ??
      Object.values(m).find(
        v => v && typeof v === 'object' && typeof v.name === 'string',
      );
  }
  return {
    light: core.resolveThemeTokens(theme, {mode: 'light'}),
    dark: core.resolveThemeTokens(theme, {mode: 'dark'}),
  };
}
