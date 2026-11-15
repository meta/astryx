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
import {
  collectThemingTargets,
  collectThemingVars,
} from '../../foundation/discovery/theming-targets.mjs';
import {parse as parseModule} from '@babel/parser';
import {resolveImportPath} from '../../foundation/discovery/component-discovery.mjs';
import {detectPackageManager} from '../../foundation/env/package-manager.mjs';
import {
  findInstalledPackage,
  findProjectCoreDir,
} from '../../foundation/fs/paths.mjs';
import {
  oncePerListing,
  withListingCache,
} from '../../foundation/fs/listing-cache.mjs';

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
 * @property {import('../../foundation/discovery/theming-targets.mjs').ThemingVar[]} vars - The public custom properties Core's components read.
 * @property {InputFields | null} inputFields - The fields Core's theme input takes, read from its type declarations; null when they are not installed.
 */

/**
 * The fields Core's `defineTheme()` input takes, read from the type
 * declarations of the installed Core, so the editor names a misspelled
 * field by the fields that Core has.
 * @typedef {object} InputFields
 * @property {string[]} theme - A theme input's fields (and a defined theme's, which a spread carries).
 * @property {string[]} surface - An `onDark`/`onLight` block's fields.
 * @property {string[]} typography - The typography block's fields.
 * @property {string[]} role - A typography role's fields.
 * @property {string[]} scale - The type scale's fields.
 * @property {string[]} levels - The heading levels a role's `weights` takes.
 */

/**
 * @typedef {object} ComponentInfo
 * @property {string} importPath
 * @property {string} category - The doc's category, such as Action or Overlay.
 * @property {string} description - What the doc says the component is.
 * @property {unknown} defaults - Playground defaults, or null.
 * @property {{component: string, props: Record<string, unknown>} | null} wrapper - The parent the playground renders it in, or null.
 * @property {boolean} opens - An overlay its playground shows in place: the pages render it open.
 * @property {boolean} overlay - Its playground opens it over the whole page, so a page of components leaves it out.
 * @property {string | null} subComponentOf - The component it is a part of, or null.
 * @property {string[]} keywords - The doc's search keywords.
 * @property {Record<string, {type: string, required: boolean, default: string | null, slots: Array<{__element: string, props?: Record<string, unknown>, children?: unknown}>}>} props - Each prop's declared type, whether it is required, its documented default (as the doc writes it), and the elements the doc suggests for it.
 * @property {Array<{className: string, states: string[], values: Record<string, string[]>}>} targets
 */

/** @type {Map<string, ThemeProject>} */
const projects = new Map();

/** Bump when the shape of the cached component docs changes. */
const DOCS_VERSION = 8;

/**
 * The theme editor's cache folder for a project: the `.cache/astryx-theme`
 * of the node_modules that holds the Core the command reads (the
 * project's own, or a workspace root's). The locks and the part-data cache
 * both live here, so one command never finds two answers. Null without
 * Core.
 * @param {string} dir
 * @returns {string | null}
 */
export function themeCacheRoot(dir) {
  const core = findProjectCoreDir(dir);
  if (!core) return null;
  // Core read from source (a fork of the design system, packages/core) is
  // in no node_modules: the cache goes in the project's own node_modules,
  // never in a source folder.
  const modules = path.dirname(path.dirname(core));
  if (
    path.basename(path.dirname(core)) === '@astryxdesign' &&
    path.basename(modules) === 'node_modules'
  )
    return path.join(modules, '.cache', 'astryx-theme');
  const own = nodeModulesRoot(dir);
  return own ? path.join(own, 'node_modules', '.cache', 'astryx-theme') : null;
}

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

/**
 * The project's package manager command that lists every installed copy of
 * a package and what pulled each in.
 * @param {string} cwd
 * @param {string} pkg
 */
export function copiesLine(cwd, pkg) {
  const pm = detectPackageManager(cwd);
  return pm === 'npm' || pm === 'npx'
    ? `npm ls ${pkg} --all`
    : pm === 'bun'
      ? `bun pm ls --all | grep ${pkg}@`
      : `${pm} why ${pkg}`;
}

/** @param {string} type @returns {string[]} */
export const literals = type =>
  [...String(type ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);

/**
 * The Core module a component's doc sits in, when that module exports the
 * component under its name: a part re-exported under a name of its own
 * (`DropdownMenuItem as ContextMenuItem` in ContextMenu) has no file named
 * for it, so the name alone does not find its module. Null otherwise.
 * @param {string} coreDir
 * @param {string} docFile
 * @param {string} name
 * @returns {string | null}
 */
function moduleOfDoc(coreDir, docFile, name) {
  const top = path
    .relative(path.join(coreDir, 'src'), docFile)
    .split(path.sep)[0];
  if (!top || top.startsWith('..')) return null;
  try {
    const exportsMap = JSON.parse(
      fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'),
    ).exports;
    if (!exportsMap || !Object.hasOwn(exportsMap, `./${top}`)) return null;
    const index = ['index.ts', 'index.tsx']
      .map(f => path.join(coreDir, 'src', top, f))
      .find(f => fs.existsSync(f));
    if (!index) return null;
    const text = fs.readFileSync(index, 'utf8');
    // Named in one of its export lists, as itself or as an alias.
    const named = [...text.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)].some(
      m =>
        m[1]
          .split(',')
          .map(x => x.trim().replace(/^type\s+/, ''))
          .some(x => x === name || new RegExp(`\\bas\\s+${name}$`).test(x)),
    );
    return named ? `@astryxdesign/core/${top}` : null;
  } catch {
    return null;
  }
}

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
      // A doc for several components lists each one's props under its own
      // entry.
      const mine = (Array.isArray(doc.components) ? doc.components : []).find(
        (/** @type {any} */ c) => c?.name === doc.name,
      );
      const own = Array.isArray(doc.props) ? doc.props : mine?.props;
      // Its playground too: the doc's, or its own entry's.
      const pg = doc.playground ?? mine?.playground;
      /** @type {Record<string, any>} */
      const props = Object.fromEntries(
        (Array.isArray(own) ? own : []).map((/** @type {any} */ p) => [
          p.name,
          p,
        ]),
      );
      out[doc.name] = {
        importPath:
          resolveImportPath(coreDir, doc.name) === '@astryxdesign/core'
            ? (moduleOfDoc(coreDir, full, doc.name) ?? '@astryxdesign/core')
            : resolveImportPath(coreDir, doc.name),
        category: typeof doc.category === 'string' ? doc.category : '',
        description: typeof doc.description === 'string' ? doc.description : '',
        defaults: pg?.defaults ?? null,
        wrapper:
          typeof pg?.wrapper?.component === 'string'
            ? {
                component: pg.wrapper.component,
                props: pg.wrapper.props ?? {},
              }
            : null,
        overlay: pg?.overlay === true,
        // An overlay with an open state, unless its playground opens it as
        // a real overlay over the page.
        opens:
          doc.category === 'Overlay' &&
          pg?.overlay !== true &&
          [doc, ...(Array.isArray(doc.components) ? doc.components : [])].some(
            (/** @type {any} */ d) =>
              Array.isArray(d?.props) &&
              d.props.some((/** @type {any} */ p) => p?.name === 'isOpen'),
          ),
        subComponentOf:
          typeof doc.subComponentOf === 'string' ? doc.subComponentOf : null,
        keywords: Array.isArray(doc.keywords) ? doc.keywords.map(String) : [],
        props: Object.fromEntries(
          Object.entries(props).map(([n, p]) => [
            n,
            {
              type: String(p.type ?? ''),
              required: p.required === true,
              default: typeof p.default === 'string' ? p.default : null,
              slots: Array.isArray(p.slotElements) ? p.slotElements : [],
            },
          ]),
        ),
        targets: (doc.theming?.targets ?? []).map((/** @type {any} */ t) => ({
          className: t.className,
          states: Array.isArray(t.states) ? t.states.map(String) : [],
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
  const core = await import(pathToFileURL(themeFile).href);
  const cacheDir = path.join(
    themeCacheRoot(key) ??
      path.join(
        nodeModulesRoot(key) ?? key,
        'node_modules',
        '.cache',
        'astryx-theme',
      ),
    coreKey,
  );
  // Reading every component doc takes a second; it is fixed per Core install.
  const docsFile = path.join(cacheDir, 'docs.json');
  /** @type {{version: number, targets: ThemeProject['targets'], components: ThemeProject['components'], vars: ThemeProject['vars']} | null} */
  let docs = null;
  try {
    const cached = JSON.parse(fs.readFileSync(docsFile, 'utf8'));
    if (cached.version === DOCS_VERSION) docs = cached;
  } catch {
    // Not cached yet.
  }
  if (!docs) {
    // Each component's import path walks Core's source tree. One listing
    // cache reads each folder once for all of them.
    docs = await withListingCache(async () => ({
      version: DOCS_VERSION,
      targets: await collectThemingTargets(path.join(coreDir, 'src')),
      vars: await collectThemingVars(path.join(coreDir, 'src')),
      components: await readComponents(coreDir),
    }));
    try {
      fs.mkdirSync(cacheDir, {recursive: true});
      fs.writeFileSync(docsFile, JSON.stringify(docs));
    } catch {
      // A read-only node_modules: read the docs again next time.
    }
  }
  const {targets, components, vars} = docs;
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
    vars,
    inputFields: readInputFields(path.dirname(themeFile)),
  };
  projects.set(key, project);
  return project;
}

/**
 * The fields Core's theme input takes, from the type declarations beside
 * its theme module; null when a declaration file is missing or does not
 * parse.
 * @param {string} themeDir the folder of Core's built theme module
 * @returns {InputFields | null}
 */
function readInputFields(themeDir) {
  /** @type {Map<string, any>} */
  const interfaces = new Map();
  for (const file of ['defineTheme.d.ts', 'onMediaTokens.d.ts', 'types.d.ts']) {
    /** @type {any} */
    let ast;
    try {
      ast = parseModule(fs.readFileSync(path.join(themeDir, file), 'utf8'), {
        sourceType: 'module',
        plugins: [['typescript', {dts: true}]],
      });
    } catch {
      return null;
    }
    for (const node of ast.program.body) {
      const decl =
        node.type === 'ExportNamedDeclaration' ? node.declaration : node;
      if (decl?.type === 'TSInterfaceDeclaration')
        interfaces.set(decl.id.name, decl.body.body);
    }
  }
  /** @param {any[] | undefined} members */
  const names = members =>
    (members ?? [])
      .filter(m => m.type === 'TSPropertySignature')
      .map(m => m.key?.name ?? m.key?.value)
      .filter(k => typeof k === 'string');
  /** @param {string} iface @param {string} name */
  const member = (iface, name) =>
    (interfaces.get(iface) ?? []).find(
      (/** @type {any} */ m) => (m.key?.name ?? m.key?.value) === name,
    );
  const theme = names(interfaces.get('DefineThemeInput'));
  const surface = names(interfaces.get('OnMediaOverrides'));
  const typography = names(interfaces.get('TypographyConfig'));
  const role = names(interfaces.get('TypographyRole'));
  if (!theme.length || !surface.length || !typography.length || !role.length)
    return null;
  const scaleType = member('TypographyConfig', 'scale')?.typeAnnotation
    ?.typeAnnotation;
  /** The numeric literals a type names (the levels of `Record<1 | 2, …>`). @param {any} node @returns {string[]} */
  const numbers = node => {
    if (!node || typeof node !== 'object') return [];
    if (
      node.type === 'TSLiteralType' &&
      node.literal?.type === 'NumericLiteral'
    )
      return [String(node.literal.value)];
    return Object.entries(node)
      .filter(([k]) => k !== 'loc' && k !== 'start' && k !== 'end')
      .flatMap(([, v]) => (Array.isArray(v) ? v.flatMap(numbers) : numbers(v)));
  };
  return {
    theme: [...new Set([...theme, ...names(interfaces.get('DefinedTheme'))])],
    surface,
    typography,
    role,
    scale: scaleType?.type === 'TSTypeLiteral' ? names(scaleType.members) : [],
    levels: numbers(member('TypographyRole', 'weights')?.typeAnnotation),
  };
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
    oncePerListing(`importPath ${project.coreDir} ${name}`, () =>
      resolveImportPath(project.coreDir, name),
    );
  return spec && spec !== '@astryxdesign/core' ? spec : null;
}

/**
 * The built module of a base's theme package, resolved the way the theme
 * resolves it: from the project (an open project, or its folder, relative
 * or not). Null when it is not installed there. The one base resolution:
 * `new`, `set base`, `how` and every suggestion ask this.
 *
 * Only the packages the project installs count, as the app's bundler reads
 * them: its node_modules folders, or Plug'n'Play. NODE_PATH and Node's global
 * folders do not: a base found only there would not build.
 * @param {ThemeProject | string} from
 * @param {string} like
 * @returns {string | null}
 */
export function baseModule(from, like) {
  const name = `@astryxdesign/theme-${like}`;
  const start = typeof from === 'string' ? path.resolve(from) : from.cwd;
  const pkg = findInstalledPackage(start, name, Infinity);
  return pkg == null ? null : builtModule(pkg, name);
}

/**
 * The `built` export of the package in `pkg`, or null. A file Node finds
 * anywhere else (it searches NODE_PATH after a miss) does not count.
 * @param {string} pkg
 * @param {string} name
 * @returns {string | null}
 */
function builtModule(pkg, name) {
  try {
    const file = createRequire(path.join(pkg, 'package.json')).resolve(
      `${name}/built`,
    );
    const root = fs.realpathSync(pkg) + path.sep;
    return fs.realpathSync(file).startsWith(root) ? file : null;
  } catch {
    return null;
  }
}

/**
 * Whether a package is installed for the app in `dir`, as the folder is
 * now: Node keeps a path it resolved once for the life of the process, so
 * the file it names is checked too (a package removed since, in a process
 * that runs several commands, is not installed).
 * @param {string} dir the app
 * @param {string} pkg
 */
export function packageInstalled(dir, pkg) {
  try {
    return fs.existsSync(
      createRequire(path.join(path.resolve(dir), 'noop.js')).resolve(
        `${pkg}/package.json`,
      ),
    );
  } catch {
    return false;
  }
}

/**
 * Whether a base's theme package is installed in the project.
 * @param {ThemeProject | string} from
 * @param {string} like
 */
export const baseInstalled = (from, like) => baseModule(from, like) != null;

/**
 * The built-in theme package for a base, or a refusal naming its install line.
 * @param {ThemeProject} project
 * @param {string} like
 * @returns {string} the resolved built module
 */
export function baseThemeFile(project, like) {
  const pkg = `@astryxdesign/theme-${like}`;
  const file = baseModule(project, like);
  if (file) return file;
  throw new AstryxError(
    `The ${like} theme is not installed, so a theme cannot build on it. Install ${pkg}, or build on no theme. Nothing was changed.`,
    [{name: installLine(project.cwd, [pkg]), reason: 'install it'}],
    ERROR_CODES.ERR_UNKNOWN_THEME,
  );
}

/**
 * Resolved tokens of the base theme in both modes.
 * @param {ThemeProject} project
 * @param {string | undefined} like
 * @returns {Promise<{light: Record<string, string>, dark: Record<string, string>, components: Record<string, any>}>}
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
  const out = {
    light: core.resolveThemeTokens(theme, {mode: 'light'}),
    dark: core.resolveThemeTokens(theme, {mode: 'dark'}),
    // The base theme's own part styles (neutral's pale destructive button),
    // which a one-mode setting keeps in the other mode.
    components: theme.components ?? {},
  };
  return out;
}
