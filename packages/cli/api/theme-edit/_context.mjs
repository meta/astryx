// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What every theme-edit operation shares: the project check, the
 * loaded project with its part data and compiler, pictures, font
 * notes, the styles a change wrote, and the preview after a change.
 *
 * @position api/theme-edit — imported only by the adapter's operation helpers
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AstryxError} from '../error.mjs';
import {
  EDITOR_STAMP,
  withPngText,
  decodePng,
  encodePng,
  cutTall,
} from './_png.mjs';
import {
  findDeclaredWorkspaceRoot,
  findNodeModulesPackage,
  homeFolder,
} from '../../foundation/fs/paths.mjs';
import {
  detectPackageManager,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {
  CLOSEST_OPEN_FONT,
  FONT_ROLES,
  FONTS,
  OPEN_FONTS,
  appleFaceGeneric,
  isDesktopFamily,
  oneSystemOf,
  P,
  SYSTEM_FONTS,
} from './_tables.mjs';
import {makeCompiler} from './_compiler.mjs';
import {openProject, installLine} from './_project.mjs';
import {addCensusStates, partData} from './_parts.mjs';
import {writeWhole} from './_palette.mjs';
import {
  assetRef,
  CSS_URL,
  cssUrlRef,
} from '../../foundation/render/render-page.mjs';
import {MAX_ASSET_BYTES} from '../../foundation/render/assets.mjs';
import {typoNear} from './_normal.mjs';
import {
  fontOf,
  ownTokenEntries,
  builtFontFamilies,
  builtFontWeights,
  fontPackages,
  fontsourceSuggestion,
  modesOf,
  refuse,
  editorWrote,
  editorRecorded,
  recordWritten,
  themeFiles,
  refuseThemesNotFolder,
  shown,
  OPEN_SECTION,
} from './_settings.mjs';
import {
  SHOWCASE_GROUPS,
  copyFontsCss,
  fontPackageSheets,
  fontPackageWeights,
  shownWeight,
  baseFontsSheet,
  newPictureRun,
  renderPreview,
  renderSheet,
  screenshots,
  pageInTheWay,
  inTheWayPhrase,
} from './_preview.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  customPropertyValues,
  fontKey,
  importedFontFamilies,
} from '../../foundation/fonts/font-stylesheet.mjs';
import {
  hasGenericFamily,
  namedFontFamilies,
} from '../theme/build/font-warning.mjs';

const E = ERROR_CODES;

/**
 * Refuse outside a project: a theme is written into an app, and every check
 * reads the app's own Core.
 * @param {string} cwd
 */
export function requireProject(cwd) {
  // One rule: the app is the nearest folder at or above cwd whose
  // package.json lists @astryxdesign/core.
  const app = coreApp(cwd);
  if (!app) refuseNoApp(cwd);
  // Yarn Plug'n'Play has no node_modules for the editor to read Core from:
  // its .pnp.cjs sits at the app or at the workspace root above it.
  if (pnpAbove(app))
    throw new AstryxError(
      "This app uses Yarn Plug'n'Play, which astryx experimental theme does not support: it reads the installed Core from node_modules. Set `nodeLinker: node-modules` in .yarnrc.yml and run yarn install. Nothing was written.",
      [
        {
          name: 'yarn config set nodeLinker node-modules',
          reason: 'do this first, then yarn install',
        },
      ],
      E.ERR_PROJECT_REQUIRED,
    );
  if (findNodeModulesPackage(app, '@astryxdesign/core')) return;
  // The app lists Core but it is not installed.
  throw new AstryxError(
    `${path.relative(path.resolve(cwd), app) || 'This app'}'s package.json lists @astryxdesign/core, but it is not installed. astryx experimental theme checks every change against the installed Core: install the app's packages, then run the command again. Nothing was written.`,
    [{name: installAll(app), reason: 'do this first, in the app'}],
    E.ERR_PROJECT_REQUIRED,
  );
}

/**
 * The project, its part data and the compiler. When the components cannot
 * be rendered, the part data is empty and `unchecked` says why: changes are
 * then saved without the checks that need it, and say so.
 * @param {string} cwd
 */
export async function context(cwd) {
  requireProject(cwd);
  refuseThemesNotFolder(cwd);
  const project = await openProject(cwd);
  /** @type {import('./_parts.mjs').PartData} */
  let parts;
  /** @type {string | null} */
  let unchecked = null;
  /** @type {string | null} the render error's code */
  let uncheckedCode = null;
  try {
    parts = await partData(project);
    addCensusStates(project, parts);
  } catch (e) {
    if (!isRenderFailure(e)) throw e;
    unchecked = renderCause(project, /** @type {Error} */ (e).message);
    uncheckedCode = /** @type {any} */ (e).code ?? null;
    parts = {
      censusKey: '',
      coreKey: project.coreKey,
      map: {},
      pairs: [],
      rendered: 0,
      items: 0,
    };
  }
  return {
    project,
    C: makeCompiler(project, parts),
    parts,
    unchecked,
    uncheckedCode,
    derived: await derivedVars(project.coreDir),
    /**
     * The pictures the running command takes after its build (its --png),
     * so the build names as removed only the ones it does not take again.
     * @type {{sheet: string | null} | null}
     */
    takesPictures: null,
  };
}

/**
 * Core's registry of the variables a part's plain border-radius or padding
 * also writes (a card's inner corners), or empty on a Core without it.
 * @param {string} coreDir
 * @returns {Promise<Record<string, Array<{property: string, vars?: string[], replaces?: boolean, expand?: string}>>>}
 */
async function derivedVars(coreDir) {
  const file = path.join(coreDir, 'dist', 'theme', 'derivedVarRegistry.js');
  if (!fs.existsSync(file)) return {};
  try {
    const mod = await import(pathToFileURL(file).href);
    return mod.derivedVarRegistry ?? {};
  } catch {
    return {};
  }
}

/** @param {unknown} e */
const isRenderFailure = e =>
  e instanceof AstryxError &&
  (e.code === E.ERR_RENDER_FAILED ||
    e.code === E.ERR_RENDER_MISSING_DEPENDENCY ||
    e.code === E.ERR_RENDER_ASSET_TOO_LARGE);

/**
 * The app a folder belongs to: the nearest folder at or above it whose
 * package.json lists @astryxdesign/core (dependencies, devDependencies or
 * peerDependencies), never the home folder; null when there is none.
 * @param {string} cwd
 * @returns {string | null}
 */
export function coreApp(cwd) {
  const home = homeFolder();
  let dir = path.resolve(cwd);
  // An installed package is never the app: resume above the outermost
  // node_modules.
  const nm = dir.split(path.sep).indexOf('node_modules');
  if (nm > 0) dir = dir.split(path.sep).slice(0, nm).join(path.sep) || path.sep;
  // A repository below the home folder is its own project: the home folder
  // is the app only when the search did not come up out of another repo.
  let crossedRepo = false;
  for (;;) {
    const listsCore = usesCore(readJson(path.join(dir, 'package.json')));
    if (home && dir === home) return listsCore && !crossedRepo ? dir : null;
    if (listsCore) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) crossedRepo = true;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Whether a Yarn Plug'n'Play loader (.pnp.cjs) is at the app folder or above
 * it, up to its workspace root (or, outside a workspace, the repository
 * root).
 * @param {string} app
 */
function pnpAbove(app) {
  const root = findDeclaredWorkspaceRoot(app);
  for (let dir = app; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.pnp.cjs'))) return true;
    if (dir === root || (!root && fs.existsSync(path.join(dir, '.git'))))
      return false;
    if (path.dirname(dir) === dir) return false;
  }
}

/**
 * The command that installs an app's packages, in its package manager.
 * @param {string} dir
 */
function installAll(dir) {
  const pm = detectPackageManager(dir);
  return pm === 'npm' || pm === 'npx' ? 'npm install' : `${pm} install`;
}

/**
 * Refuse a folder no app above lists Core for: say where Core resolves
 * from (when it does) and, inside a workspace, name the folders below its
 * root whose package.json lists Core, each with the `cd` to run from.
 * @param {string} cwd
 * @returns {never}
 */
function refuseNoApp(cwd) {
  const start = path.resolve(cwd);
  // A repository inside a home-folder app (a submodule, a vendored clone) is
  // its own project: name the app above instead of claiming there is none.
  const home = homeFolder();
  if (
    home &&
    !path.relative(home, start).startsWith('..') &&
    usesCore(readJson(path.join(home, 'package.json')))
  ) {
    const rel = path.relative(start, home) || '.';
    throw new AstryxError(
      `This folder is inside its own repository, below the app at ${rel} (your home folder): the theme editor does not reach out of a repository into an app around it. Run the command from the app. Nothing was written.`,
      [
        {
          name: `cd ${quoteCommandArgument(rel)}`,
          reason: 'run the command from the app',
        },
      ],
      E.ERR_PROJECT_REQUIRED,
    );
  }
  // Where Core resolves from: the nearest node_modules above that holds it.
  const resolved =
    findNodeModulesPackage(start, '@astryxdesign/core')?.packageDir ?? null;
  const root = findDeclaredWorkspaceRoot(start);
  const where = resolved
    ? ` @astryxdesign/core resolves from ${path.relative(start, resolved) || '.'}, but the theme editor needs the app's package.json to list it.`
    : '';
  if (root) {
    const apps = appsBelow(root)
      .map(a => path.relative(start, a) || '.')
      .sort();
    throw new AstryxError(
      `${path.relative(start, root) || 'This folder'} is a workspace root${root === start ? '' : ` (${path.relative(root, start)} is not an app that uses @astryxdesign/core)`}, not an app: a theme belongs in an app whose package.json lists @astryxdesign/core.${where}${apps.length ? ` The workspace's apps that use it: ${apps.join(', ')}.` : ''} Run the command from the app that uses it. Nothing was written.`,
      apps.slice(0, 4).map(a => ({
        name: `cd ${quoteCommandArgument(a.startsWith('-') ? `./${a}` : a)}`,
        reason: 'run the command from this app',
      })),
      E.ERR_PROJECT_REQUIRED,
    );
  }
  if (fs.existsSync(path.join(start, 'package.json')) || resolved)
    throw new AstryxError(
      `${fs.existsSync(path.join(start, 'package.json')) ? '@astryxdesign/core is not installed in this app (package.json here does not use it).' : 'No package.json at or above this folder lists @astryxdesign/core.'}${where} astryx experimental theme checks every change against the installed Core: install it, or run the command from the package that uses it. Nothing was written.`,
      [
        {
          name: installLine(start, ['@astryxdesign/core']),
          reason: 'do this first',
        },
      ],
      E.ERR_PROJECT_REQUIRED,
    );
  throw new AstryxError(
    'No package.json found. astryx experimental theme works inside an app project, which it writes the theme into and whose installed Core it checks every change against. Nothing was written.',
    [
      {
        name: 'npm init -y',
        reason: 'make a package.json here, then install @astryxdesign/core',
      },
    ],
    E.ERR_PROJECT_REQUIRED,
  );
}

/**
 * The folders below a workspace root, up to three levels deep (node_modules
 * and dot folders skipped), whose package.json lists Core.
 * @param {string} root
 * @returns {string[]}
 */
function appsBelow(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    if (depth > 6) return;
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        !e.isDirectory() ||
        e.name === 'node_modules' ||
        e.name.startsWith('.')
      )
        continue;
      const sub = path.join(dir, e.name);
      if (usesCore(readJson(path.join(sub, 'package.json')))) out.push(sub);
      walk(sub, depth + 1);
    }
  };
  walk(root, 1);
  return out;
}

/** @param {string} file */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

/** Whether a package.json lists @astryxdesign/core itself. */
function usesCore(/** @type {any} */ json) {
  if (!json || typeof json !== 'object') return false;
  return ['dependencies', 'devDependencies', 'peerDependencies'].some(
    k =>
      json[k] != null &&
      typeof json[k] === 'object' &&
      !Array.isArray(json[k]) &&
      Object.prototype.hasOwnProperty.call(json[k], '@astryxdesign/core'),
  );
}

/**
 * Why the components did not render, with the likely cause: two copies of
 * React (the app's and the one Core resolves) break every hook.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} message
 */
export function renderCause(project, message) {
  const two = reactCopies(project);
  return two
    ? `${message} The likely cause: two copies of React, the app's (${two.app}) and the one Core resolves (${two.core}). Make Core resolve the app's React.`
    : message;
}

/**
 * The two copies of React a render saw, when the app's and the one Core
 * resolves differ; else null.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {{app: string, core: string} | null}
 */
export function reactCopies(project) {
  /** @param {(id: string) => string} resolve */
  const reactOf = resolve => {
    try {
      return fs.realpathSync(path.dirname(resolve('react/package.json')));
    } catch {
      return null;
    }
  };
  const app = reactOf(project.req.resolve);
  let core = null;
  try {
    // Core's exports keep its package.json private: its folder is found by
    // walking up from the entry the app resolves.
    let dir = path.dirname(project.req.resolve('@astryxdesign/core'));
    while (!fs.existsSync(path.join(dir, 'package.json'))) {
      const up = path.dirname(dir);
      if (up === dir) throw new Error('no package.json');
      dir = up;
    }
    core = reactOf(createRequire(path.join(dir, 'package.json')).resolve);
  } catch {
    // No Core package file: nothing to compare.
  }
  return app && core && app !== core ? {app, core} : null;
}

/**
 * The "saved, not checked" report of a change, or null when it was checked.
 * @param {string | null} cause
 */
const notChecked = cause =>
  cause ? {code: E.ERR_THEME_NOT_CHECKED, cause} : null;

/** The sample page, as a note about its pictures names it. */
export const SAMPLE_PAGE_NAME = 'the sample page';

/**
 * Text one page's pictures draw cut short in one part, as the browser
 * measured it: the page and its picture, the part (null when the text sits
 * in none), its texts, the one mode it was cut in when only one was, and
 * whether every text is drawn whole once the part keeps its width
 * (`flex-shrink: 0`, applied in the page and measured). `broken`: the
 * texts are words drawn broken across two lines inside the word, not cut.
 * @typedef {{page: string, file: string, part: string | null, texts: string[], only: 'light' | 'dark' | null, whole: boolean, broken?: boolean}} CutShort
 */

/** The texts named, the first six and how many more. @param {string[]} texts */
const someTexts = texts =>
  `${texts
    .slice(0, 6)
    .map(t => JSON.stringify(t))
    .join(', ')}${texts.length > 6 ? `, and ${texts.length - 6} more` : ''}`;

/**
 * The note for text a page's pictures draw cut short.
 * @param {CutShort} c
 */
export function cutShortNote(c) {
  const n = c.texts.length;
  const what = c.part
    ? `${c.part} label${n === 1 ? '' : 's'}`
    : `text${n === 1 ? '' : 's'}`;
  if (c.broken)
    return `${c.page} (${c.file}) breaks ${n} word${n === 1 ? '' : 's'} across lines inside the word${c.part ? ` in the ${c.part}` : ''}${c.only ? ` in ${c.only} mode only` : ''} (${someTexts(c.texts)}); the word is wider than the space ${c.part ? `the ${c.part}` : 'its box'} has`;
  return `${c.page} (${c.file}) draws ${n} ${what} cut short${c.only ? ` in ${c.only} mode only` : ''} (${someTexts(c.texts)}); the text no longer fits ${c.part ? `the ${c.part}` : 'its box'}`;
}

/**
 * The problem for text a page's pictures draw cut short, with the line that
 * keeps it whole: the part keeps its width (`flex-shrink 0` on it), offered
 * only when the browser measured every text whole with it; else no line,
 * and that the line was measured and does not.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {CutShort} c
 * @returns {{problem: string, fix: string | null}}
 */
export function cutShortProblem(ctx, slug, c) {
  const label = c.part ? `${c.part} labels` : 'text';
  const problem = c.broken
    ? `words broken across lines inside the word${c.part ? ` in the ${c.part}` : ''} in ${c.page}'s pictures (${c.file}${c.only ? `, ${c.only} mode` : ''}): ${someTexts(c.texts)}`
    : `${label} cut short in ${c.page}'s pictures (${c.file}${c.only ? `, ${c.only} mode` : ''}): ${someTexts(c.texts)}`;
  if (c.part && c.whole && ctx.project.target.has(c.part))
    return {problem, fix: `${P} set ${slug} flex-shrink 0 --on ${c.part}`};
  return {
    problem: c.part
      ? `${problem}; keeping the ${c.part}'s width (flex-shrink 0) was measured and does not draw them whole there, so no one line fixes it`
      : problem,
    fix: null,
  };
}

/**
 * Pictures of HTML files, on request. A shot with a `name` is a page laid
 * out so its text fits in the base theme (the sample page): the text its
 * pictures draw cut short, as the browser measured it, comes back in
 * `cutShort`, one entry for each part on each page ({@link cutShortNote},
 * {@link cutShortProblem}). The sheets (the open
 * states among them) have no name: their cells are narrow, and the full
 * sheet cuts long labels short in every theme.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Array<{html: string, png: string, name?: string, most?: number}>} shots
 *   `most`: the tallest the page's picture may be; a taller one is cut into
 *   pictures that tall, in order ({@link pagesOfPicture})
 * @param {Array<'light' | 'dark'>} modes
 * @returns {Promise<{files: string[], problem: string | null, cutShort: CutShort[]}>}
 */
export async function pictures(project, shots, modes) {
  /** @type {string[]} */
  const files = [];
  /**
   * The text drawn cut short, by page, then by part: its texts, the modes
   * it was drawn so in, whether keeping the part's width draws every one
   * whole, and the page's picture.
   * Keyed by part, and apart for words broken across lines.
   * @type {Map<string, {file: string, parts: Map<string, {part: string, broken: boolean, texts: Set<string>, modes: Set<'light' | 'dark'>, whole: boolean}>}>}
   */
  const cut = new Map();
  /** One entry for each part on each page, from what was measured. */
  const cutShortNotes = () =>
    [...cut].flatMap(([name, page]) =>
      [...page.parts.values()].map(
        ({part, broken, texts, modes: drawnIn, whole}) =>
          /** @type {CutShort} */ ({
            page: name,
            file: page.file,
            part: part || null,
            texts: [...texts],
            only:
              modes.length > 1 && drawnIn.size === 1 ? [...drawnIn][0] : null,
            whole,
            ...(broken ? {broken: true} : {}),
          }),
      ),
    );
  /** What a later browser's success says of an earlier one. @type {string[]} */
  const notes = [];
  /** One run for every picture: a browser that failed is not tried again. */
  const run = newPictureRun();
  /** @param {string} png @param {'light' | 'dark'} m */
  const outOf = (png, m) =>
    modes.length > 1 && m === 'dark' ? png.replace(/\.png$/, '-dark.png') : png;
  /** The theme a picture's folder is, when it is a theme folder. @param {string} out */
  const themeOf = out => {
    const slug = path.basename(path.dirname(out));
    return path.resolve(path.dirname(out)) ===
      path.resolve(themeFiles(project.cwd, slug).dir)
      ? slug
      : null;
  };
  /** A link at a path, whether or not what it points to is there. @param {string} p */
  const isLink = p => {
    try {
      return Boolean(
        fs.lstatSync(p, {throwIfNoEntry: false})?.isSymbolicLink(),
      );
    } catch {
      return false;
    }
  };
  // A picture is written only over a picture the editor took, unchanged
  // since: a file of the user's by that name (a screenshot of the same
  // size included) blocks every picture, and is named. A link at a
  // picture's name (to a file or to nothing) is never written through or
  // replaced: that one picture is skipped and named, the others are taken.
  const blocked = shots
    .flatMap(({png}) => modes.map(m => outOf(png, m)))
    .filter(out => {
      const slug = themeOf(out);
      return (
        Boolean(slug) &&
        !isLink(out) &&
        fs.existsSync(out) &&
        !editorWrote(project.cwd, /** @type {string} */ (slug), out)
      );
    });
  // The record of the editor's pictures is a plain file, or none yet.
  // Something else at its name (a pipe, a folder) is left as it is and
  // named, and no picture is taken: a picture the record cannot hold would
  // read as a file of yours on the next run.
  for (const slug of new Set(shots.map(s => themeOf(s.png)))) {
    if (!slug) continue;
    const record = themeFiles(project.cwd, slug).pictures;
    const st = fs.lstatSync(record, {throwIfNoEntry: false});
    if (st && !st.isFile())
      return {
        files,
        cutShort: [],
        problem: `${inTheWayPhrase(path.relative(project.cwd, record), st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'folder' : 'other', "the record of the editor's pictures")}, so no picture was taken and it is left as it is; move ${st.isSymbolicLink() ? 'the link' : 'it'}, then run the command again`,
      };
  }
  /** Pictures skipped for a link at their name. @type {string[]} */
  const linked = [];
  if (blocked.length)
    return {
      files,
      cutShort: [],
      problem: `${blocked.map(f => path.relative(project.cwd, f)).join(', ')} ${blocked.length === 1 ? 'is a file' : 'are files'} the editor did not write (or changed since it did), so no picture was taken and ${blocked.length === 1 ? 'it is' : 'they are'} left as ${blocked.length === 1 ? 'it is' : 'they are'}`,
    };
  /** The pictures to take, each with where it goes. @type {Array<{html: string, out: string, part: string, m: 'light' | 'dark', name?: string, most?: number}>} */
  const jobs = [];
  for (const {html, png, name, most} of shots) {
    for (const m of modes) {
      const out = outOf(png, m);
      if (isLink(out)) {
        linked.push(out);
        continue;
      }
      // Taken under a name of its own and moved into place once whole: a
      // run stopped while the browser runs leaves no picture at the real
      // name (one the next run would read as a file of yours). A part left
      // by a run stopped before is cleared.
      const part = path.join(
        path.dirname(out),
        `.${path.basename(out, '.png')}.part-${process.pid}.png`,
      );
      for (const n of fs.existsSync(path.dirname(out))
        ? fs.readdirSync(path.dirname(out))
        : [])
        if (n.startsWith(`.${path.basename(out, '.png')}.part-`)) {
          // Only a file is a part: a folder by that name is left alone.
          const p = path.join(path.dirname(out), n);
          try {
            if (fs.lstatSync(p).isFile()) fs.rmSync(p, {force: true});
          } catch {
            // Gone already.
          }
        }
      // A folder (or anything else) where this run's part goes: no
      // picture, the path named, never a crash after a saved change.
      if (fs.existsSync(part) && !fs.lstatSync(part).isFile())
        return {
          files,
          cutShort: cutShortNotes(),
          problem: `${path.relative(project.cwd, part)} is a folder, where --png writes a picture before moving it into place, so no picture was taken; move it out of ${path.relative(project.cwd, path.dirname(out))}/`,
        };
      // A folder it cannot write gets no picture: named before the browser
      // starts, never read as a browser that failed.
      try {
        fs.accessSync(path.dirname(out), fs.constants.W_OK);
      } catch (e) {
        return {
          files,
          cutShort: cutShortNotes(),
          problem: `${path.relative(project.cwd, path.dirname(out))}/ cannot be written (${/** @type {any} */ (e)?.code ?? 'no access'}), so no picture was taken; fix its permissions, then run the command again`,
        };
      }
      jobs.push({html, out, part, m, name, most});
    }
  }
  // Every picture with one browser, then each put in place in order.
  const results = await screenshots(
    project,
    jobs.map(j => ({html: j.html, png: j.part, mode: j.m})),
    run,
  );
  for (const [i, {out, part, m, name, most}] of jobs.entries()) {
    {
      const r = results[i];
      if (!r?.ok) {
        for (const j of jobs.slice(i)) fs.rmSync(j.part, {force: true});
        // Said for the whole run: the pictures taken before this one stand,
        // and this one and every one after it were not taken.
        const all = shots.flatMap(s => modes.map(mm => outOf(s.png, mm)));
        const missed = all
          .slice(all.indexOf(out))
          .map(f => path.relative(project.cwd, f).split(path.sep).join('/'));
        return {
          files,
          cutShort: cutShortNotes(),
          problem: files.length
            ? `${files.join(', ')} ${files.length === 1 ? 'was' : 'were'} taken, but ${missed.join(', ')} ${missed.length === 1 ? 'was' : 'were'} not: ${r?.reason ?? 'the browser stopped first'}`
            : `No picture was taken: ${r?.reason ?? 'the browser stopped first'}`,
        };
      }
      try {
        fs.renameSync(part, out);
      } catch (e) {
        for (const j of jobs.slice(i)) fs.rmSync(j.part, {force: true});
        return {
          files,
          cutShort: cutShortNotes(),
          problem: `the picture could not be moved into ${path.relative(project.cwd, out)} (${/** @type {any} */ (e)?.code ?? e})`,
        };
      }
      r.file = path.relative(project.cwd, out).split(path.sep).join('/');
      files.push(r.file);
      // A picture in a theme folder is recorded as the editor's, so a later
      // change removes it and never a picture of the user's.
      const slug = themeOf(out);
      if (slug) {
        // Stamped with the editor's mark and the theme, then recorded.
        try {
          fs.writeFileSync(
            out,
            withPngText(fs.readFileSync(out), EDITOR_STAMP, slug),
          );
        } catch {
          // An unstamped picture is still recorded below.
        }
        recordWritten(project.cwd, slug, [out]);
        if (most) {
          const cut = pagesOfPicture(project.cwd, slug, out, most);
          if (cut.problem) notes.push(cut.problem);
          else if (cut.files.length) {
            files.pop();
            files.push(...cut.files);
            r.file = cut.files[0];
          }
        }
      }
      for (const n of r.notes ?? []) if (!notes.includes(n)) notes.push(n);
      // What the browser measured on a page laid out to fit, kept by page
      // and part; nothing when its script measured nothing.
      if (name && r.cutShort?.length) {
        const page = cut.get(name) ?? {file: r.file, parts: new Map()};
        cut.set(name, page);
        for (const {part, text, whole, broken} of r.cutShort) {
          const key = `${part ?? ''}${broken ? '\0broken' : ''}`;
          const at = page.parts.get(key) ?? {
            part: part ?? '',
            broken: Boolean(broken),
            texts: new Set(),
            modes: new Set(),
            whole: true,
          };
          page.parts.set(key, at);
          at.texts.add(text);
          at.modes.add(m);
          at.whole &&= whole;
        }
      }
    }
  }
  if (linked.length) {
    const rels = linked.map(f =>
      path.relative(project.cwd, f).split(path.sep).join('/'),
    );
    const target = (/** @type {string} */ f) => {
      try {
        const to = fs.readlinkSync(f);
        return fs.existsSync(f)
          ? ` (to ${to})`
          : ` (to ${to}, which does not exist)`;
      } catch {
        return '';
      }
    };
    notes.unshift(
      `${linked.map((f, i) => `${rels[i]}${target(f)}`).join(', ')} ${linked.length === 1 ? 'is a link' : 'are links'}, and a picture is never written through or over a link, so ${linked.length === 1 ? 'that picture was' : 'those pictures were'} not taken${files.length ? `; ${files.join(', ')} ${files.length === 1 ? 'was' : 'were'} taken` : ''}`,
    );
  }
  return {
    files,
    // Pictures were taken; a note says why an earlier browser did not, and
    // which pictures a link at their name kept out.
    problem: notes.join('; ') || null,
    cutShort: cutShortNotes(),
  };
}

/**
 * A picture taller than `most` cut into pictures at most that tall, in
 * order (`sheet-inputs-1.png`, `-2` …), each cut where the page shows
 * between two parts ({@link cutTall}), stamped and recorded as the
 * editor's, the tall one removed; pictures cut from it before and no
 * longer made are removed too. A file of yours at a cut picture's name is
 * never written over: the tall picture stays, and the note names it.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} out the picture just taken
 * @param {number} most
 * @returns {{files: string[], problem: string | null}} the pictures, as
 *   shown, when it was cut; none when it fits
 */
function pagesOfPicture(cwd, slug, out, most) {
  const dir = path.dirname(out);
  const base = path.basename(out, '.png');
  const rel = (/** @type {string} */ f) =>
    path.relative(cwd, f).split(path.sep).join('/');
  let pieces;
  try {
    pieces = cutTall(decodePng(fs.readFileSync(out)), most);
  } catch {
    return {files: [], problem: null};
  }
  const named = new RegExp(
    `^${base.replace(/[^a-z0-9-]/gi, '\\$&')}-(\\d+)\\.png$`,
  );
  const before = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter(n => named.test(n))
    .map(n => path.join(dir, n));
  const mine = before.filter(f => !editorRecorded(cwd, slug, f));
  const names =
    pieces.length > 1
      ? pieces.map((_, i) => path.join(dir, `${base}-${i + 1}.png`))
      : [];
  const inWay = mine.filter(f => names.includes(f));
  if (inWay.length)
    return {
      files: [],
      problem: `${inWay.map(rel).join(', ')} ${inWay.length === 1 ? 'is a file' : 'are files'} the editor did not write, so ${rel(out)} was not cut into pictures of at most ${most}px and stays whole`,
    };
  for (const f of before) if (!mine.includes(f)) fs.rmSync(f, {force: true});
  if (!names.length) return {files: [], problem: null};
  pieces.forEach((pic, i) =>
    writeWhole(names[i], withPngText(encodePng(pic), EDITOR_STAMP, slug)),
  );
  recordWritten(cwd, slug, names);
  fs.rmSync(out, {force: true});
  return {files: names.map(rel), problem: null};
}

/**
 * The families the theme's build writes that no package loads: not a
 * system or desktop font, not loaded by a font stylesheet the app copy
 * imports (the base's fonts included), and none of `packages` (the font
 * packages that load it where the fonts go: the project's, or a new app's).
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Array<{family: string}>} packages
 * @returns {string[]}
 */
export function familiesNothingLoads(ctx, data, packages) {
  const built = builtFontFamilies(ctx, data.name);
  /** @type {Set<string>} */
  const loaded = new Set();
  for (const spec of copyFontsCss(ctx, data.name, data))
    for (const f of importedFontFamilies(spec, ctx.project.cwd)) loaded.add(f);
  return [...(built?.values() ?? [])].filter(family => {
    const key = fontKey(family);
    return !(
      loaded.has(key) ||
      packages.some(x => fontKey(x.family) === key) ||
      isDesktopFamily(family) ||
      oneSystemOf(family) ||
      appleFaceGeneric(family)
    );
  });
}

/**
 * What the previews (preview.html, sheet.html and their pictures) cannot
 * show of the images and files the theme's built stylesheet names: a
 * remote file (a page opened from disk loads no network), a file that is
 * not there, one that is not a regular file, and one too large to carry.
 * Read from the built stylesheet with the renderer's own reader, so a
 * preview rendered before says it too.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @returns {string[]}
 */
export function themeImageNotes(ctx, slug) {
  const file = themeFiles(ctx.project.cwd, slug).css;
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const at = {dir: path.dirname(file), root: ctx.project.cwd};
  const where = shown(ctx.project.cwd, at.dir);
  /** @type {Map<string, string>} */
  const notes = new Map();
  for (const m of css.matchAll(new RegExp(CSS_URL.source, 'g'))) {
    const named = assetRef(cssUrlRef(m), at);
    if (!named || notes.has(named.ref)) continue;
    if (named.kind === 'remote')
      notes.set(
        named.ref,
        `${named.ref} is loaded from the network: the app loads it, but the previews (preview.html, sheet.html and their pictures) cannot, and show the theme without it.`,
      );
    else if (named.kind === 'missing')
      notes.set(
        named.ref,
        `${named.ref} was not found beside the theme (${where}/), so neither the previews nor the app show it.`,
      );
    else if (named.kind === 'not-file')
      notes.set(
        named.ref,
        `${named.ref} is not a regular file (a pipe, a device or a folder), so the previews do not read it and show the theme without it.`,
      );
    else if (named.kind === 'unreadable')
      notes.set(
        named.ref,
        `${shown(ctx.project.cwd, named.file)} cannot be read (no permission), so the previews show the theme without it; make it readable (chmod u+r) to show it.`,
      );
    else {
      const bytes = fs.statSync(named.file).size;
      if (bytes > MAX_ASSET_BYTES)
        notes.set(
          named.ref,
          `${shown(ctx.project.cwd, named.file)} is ${(bytes / 1048576).toFixed(1)} MB, more than the ${MAX_ASSET_BYTES / 1048576} MB a preview page carries per file; a smaller copy shows in the previews too.`,
        );
    }
  }
  return [...notes.values()];
}

/**
 * The open fonts a set's families name whose package is not installed, each
 * with the line that installs it: until then the pictures and the app draw
 * the next font in the stack.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Array<{family: string, run: string[]}>}
 */
export function fontsNotLoaded(ctx, data) {
  return fontPackages(ctx, data)
    .filter(p => !p.installed)
    .map(p => ({
      family: p.family,
      run: [installLine(ctx.project.cwd, [p.pkg])],
    }));
}

/**
 * Font notes for the families the theme builds: the import line for an
 * open font, the install line when its package is missing, and a warning
 * for a family no package loads, naming the closest open font.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
export function fontNotes(ctx, data) {
  /** @type {string[]} */
  const notes = [];
  const packages = fontPackages(ctx, data);
  // A family nothing loads, with the Fontsource package that would load
  // it, when Fontsource's naming gives one.
  /** @param {string} family */
  const unloadedNote = family => {
    const s = fontsourceSuggestion(family);
    return `"${family}" is not a system font and no package loads it: the app must load it, or it falls back.${s ? ` ${s.known ? '' : 'If Fontsource publishes it, '}${installLine(ctx.project.cwd, [s.pkg])} installs its package, which the previews and the app copy then load.` : ''}`;
  };
  for (const {pkg, family, installed} of packages) {
    const fallbacks =
      Object.values(OPEN_FONTS).find(f => f.pkg === pkg)?.fallbacks ?? '';
    const near = /monospace/.test(fallbacks)
      ? 'mono'
      : /serif/.test(fallbacks.replace('sans-serif', ''))
        ? 'serif'
        : 'system';
    notes.push(
      installed
        ? `${family} is installed (${pkg}), so the previews and the app copy load it, a stylesheet for each face the theme's weights show: ${fontPackageSheets(
            ctx,
            data.name,
            pkg,
          )
            .map(x => `import '${x}';`)
            .join(' ')}`
        : `${family} is not installed, so it does not load: the previews and the app show the next font in the stack. Install it: ${installLine(ctx.project.cwd, [pkg])}. Then the preview imports it on the next set or show, and the app imports it once: import '${pkg}'; Until then, the closest font that needs no install is ${near}: ${P} set ${data.name} font ${near}`,
    );
  }
  // A family the editor's own presets lead with, where the preset gets no
  // note (Comic Sans MS, of comic), is no more a font to load typed by name.
  const presetFamily = (/** @type {string} */ family) => {
    const f = family.replace(/["']/g, '').trim().toLowerCase();
    // A one-system font keeps its note, preset or not.
    if (oneSystemOf(family.replace(/["']/g, '').trim())) return false;
    return Object.entries(FONTS).some(
      ([k, [first]]) =>
        (SYSTEM_FONTS.includes(k) || k === 'comic' || k === 'rounded') &&
        first.replace(/["']/g, '').trim().toLowerCase() === f,
    );
  };
  // A font setting whose family the build no longer uses (the theme's own
  // source sets every place it went) gets no note: nothing shows it.
  const built = builtFontFamilies(ctx, data.name);
  // The families the base's own font stylesheet loads from a remote sheet:
  // named once below, as the app shows them, never as fonts nothing loads.
  const base = baseFontsSheet(ctx, data);
  const baseLoads = new Set(
    base?.remote.length ? base.families.map(f => fontKey(f)) : [],
  );
  for (const s of data.settings) {
    if (
      s.thing !== 'font' ||
      (built &&
        !built.has(
          fontOf(s.value).family.replace(/["']/g, '').trim().toLowerCase(),
        )) ||
      SYSTEM_FONTS.includes(s.value) ||
      isDesktopFamily(fontOf(s.value).family.replace(/["']/g, '')) ||
      OPEN_FONTS[s.value] ||
      fontOf(s.value).pkg ||
      packages.some(x => x.of === s) ||
      s.value === 'rounded' ||
      s.value === 'comic' ||
      presetFamily(fontOf(s.value).family) ||
      baseLoads.has(fontKey(fontOf(s.value).family))
    )
      continue;
    const family = fontOf(s.value).family.replace(/["']/g, '').toLowerCase();
    const near = CLOSEST_OPEN_FONT[family];
    const named = fontOf(s.value).family.replace(/^["']|["']$/g, '');
    const system = oneSystemOf(named);
    const on = s.on ? ` --on ${s.on}` : '';
    const generic = appleFaceGeneric(named);
    if (generic) {
      // Apple systems reach their interface faces only by a generic.
      const {fallbacks} = fontOf(s.value);
      const next = fallbacks.split(',')[0]?.trim() || 'system-ui';
      // The generic once: a stack that already holds it keeps one.
      const value = [
        ...new Set(
          [generic, ...fallbacks.split(',')].map(f => f.trim()).filter(Boolean),
        ),
      ].join(', ');
      notes.push(
        `"${named}" is an Apple interface face, which browsers do not reach by its name, so every system shows the next font in the stack (${next}). Apple systems show it for ${generic}: ${P} set ${data.name} font ${quoteCommandArgument(value)}${on}`,
      );
      continue;
    }
    if (system) {
      // A system font, on one system: the others show the next font.
      const next =
        fontOf(s.value).fallbacks.split(',')[0]?.trim() || 'system-ui';
      notes.push(
        /^(-apple-system|blinkmacsystemfont)$/.test(family)
          ? `"${named}" names the interface font of ${system}, and only there: other systems show the next font in the stack (${next}). The system preset gives each system its own interface font: ${P} set ${data.name} font system${on}`
          : `"${named}" ships only on ${system}: other systems show the next font in the stack (${next}).${near ? ` The closest open font, which loads everywhere, is ${near}: ${P} set ${data.name} font ${near}${on}` : ''}`,
      );
      continue;
    }
    notes.push(
      `${unloadedNote(named)}${near ? ` The closest open font is ${near}: ${P} set ${data.name} font ${near}${s.on ? ` --on ${s.on}` : ''}` : ''}`,
    );
  }
  // Every other family the build writes that nothing loads (a part's own
  // font, a font token, a family the theme's own source sets) is named
  // once, with the package that would load it: the same built families
  // the app copy and the previews load fonts for.
  const dialFamilies = new Set(
    data.settings
      .filter(s => s.thing === 'font')
      .map(s => fontKey(fontOf(s.value).family)),
  );
  // A base family the app loads from a remote stylesheet (a Google Fonts
  // import in the base's fonts.css) is not in the static previews: a page
  // opened from disk cannot load a remote stylesheet. Unless an installed
  // package loads it, the previews and pictures show the next font.
  if (base?.remote.length)
    for (const family of base.families) {
      if (built && !built.has(family.toLowerCase())) continue;
      if (
        packages.some(x => x.installed && fontKey(x.family) === fontKey(family))
      )
        continue;
      const s = fontsourceSuggestion(family);
      notes.push(
        `"${family}" comes from ${base.spec}, which loads it from ${new URL(base.remote[0], 'https://x').host}: the app shows it, but the previews (preview.html, sheet.html and their pictures) cannot load a remote stylesheet and show the next font in the stack.${s ? ` ${installLine(ctx.project.cwd, [s.pkg])} installs a copy the previews load too.` : ''}`,
      );
    }
  notes.push(...baseWeightNotes(ctx, data));
  for (const family of familiesNothingLoads(ctx, data, packages)) {
    if (dialFamilies.has(fontKey(family)) || baseLoads.has(fontKey(family)))
      continue;
    notes.push(unloadedNote(family));
  }
  notes.push(...loneFamilyNotes(ctx, data));
  return notes;
}

/** What each font role's family token sets, for a note. */
const ROLE_TEXT = /** @type {Record<string, string>} */ ({
  body: 'body text uses',
  heading: 'headings use',
  code: 'code uses',
});

/**
 * A note for each font role the theme's build gives one family and no
 * fallback at all (`--font-family-heading: Lora`, as Core builds a heading
 * family given no fallbacks of its own, or an exact token set so): text in
 * it has no font while that one loads, or if it is missing. The way to a
 * list is named where the family came from: the setting, run with a list
 * (the family's own open-font fallbacks, else the font dial's), or the
 * theme's own source.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
export function loneFamilyNotes(ctx, data) {
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(themeFiles(ctx.project.cwd, data.name).css, 'utf8');
  } catch {
    return [];
  }
  /** @type {string[]} */
  const notes = [];
  const own = customPropertyValues(css);
  for (const role of Object.keys(ROLE_TEXT)) {
    const token = `--font-family-${role}`;
    const value = own.get(token)?.at(-1);
    if (!value || /var\(/i.test(value) || hasGenericFamily(value)) continue;
    const named = namedFontFamilies(value);
    if (named.length !== 1) continue;
    const family = named[0].replace(/^["']|["']$/g, '');
    const fallbacks =
      Object.values(OPEN_FONTS).find(f => fontKey(f.family) === fontKey(family))
        ?.fallbacks ?? fontOf(family).fallbacks;
    const list = `${value.trim()}, ${fallbacks}`;
    const setting = data.settings.find(
      s => s.source === 'token' && s.thing === token && !s.on && !s.when,
    );
    const typography = ownTokenEntries(ctx.project.cwd, data.name).some(
      e => e.kind === 'typography' && e.key === `${role}.family`,
    );
    const fix = setting
      ? `give a list: ${P} set ${data.name} ${token} ${quoteCommandArgument(list)}`
      : typography
        ? `give typography.${role} its fallbacks in themes/${data.name}/${data.name}.theme.ts (such as fallbacks: '${fallbacks}')`
        : `give ${token} a list in themes/${data.name}/${data.name}.theme.ts (such as '${list}')`;
    notes.push(
      `${ROLE_TEXT[role]} only ${family}, with no fallback while it loads or if it is missing; to fall back, ${fix}`,
    );
  }
  return notes;
}

/**
 * A note for each weight the theme uses that a stylesheet loading one of
 * its families has no face for (it shows as the face CSS font matching
 * picks): the base theme's font stylesheet, unless an installed package
 * loads that family, and each installed font package with a stylesheet per
 * weight.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
export function baseWeightNotes(ctx, data) {
  /** @type {string[]} */
  const notes = [];
  const built = builtFontFamilies(ctx, data.name);
  const packages = fontPackages(ctx, data);
  /**
   * @param {string} family @param {string} by what loads it
   * @param {number[]} faces the weights it loads @param {string} fix
   */
  const gap = (family, by, faces, fix) => {
    // The weights text in this family uses: those set beside it, and the
    // ones every text reads (never a weight only another family uses).
    const used = builtFontWeights(ctx, data.name, family) ?? [];
    const missing = used.filter(w => !faces.includes(w));
    if (missing.length)
      notes.push(
        `${family} is loaded by ${by} at ${faces.join(', ')} only, so ${missing.map(w => `${w} shows as ${shownWeight(w, faces)}`).join(', ')}${fix}`,
      );
  };
  const base = baseFontsSheet(ctx, data);
  for (const [family, faces] of base?.weights ?? []) {
    if (built && !built.has(family.toLowerCase())) continue;
    if (
      packages.some(x => x.installed && fontKey(x.family) === fontKey(family))
    )
      continue;
    const s = fontsourceSuggestion(family);
    gap(
      family,
      /** @type {{spec: string}} */ (base).spec,
      faces,
      s
        ? `; ${installLine(ctx.project.cwd, [s.pkg])} loads every weight of it`
        : '',
    );
  }
  for (const {pkg, family, installed} of packages) {
    if (!installed || (built && !built.has(family.toLowerCase()))) continue;
    const faces = fontPackageWeights(ctx, pkg);
    if (faces) gap(family, pkg, faces, '');
  }
  return notes;
}

/**
 * What a change did to part styles (component settings), one line each.
 * @param {any} before
 * @param {any} after
 * @param {any} [base] the base theme, whose own values a write that repeats them does not change
 * @returns {string[]}
 */
export function styledChanges(before, after, base) {
  /** @type {string[]} */
  const out = [];
  /** A value as CSS reads it, for comparing. @param {any} v */
  const plain = v =>
    (Array.isArray(v) && v.length === 2
      ? `light-dark(${v[0]}, ${v[1]})`
      : String(v ?? '')
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const a = before?.components ?? {};
  const b = after?.components ?? {};
  for (const target of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const key of new Set([
      ...Object.keys(a[target] ?? {}),
      ...Object.keys(b[target] ?? {}),
    ])) {
      const x = a[target]?.[key] ?? {};
      const y = b[target]?.[key] ?? {};
      /** @param {string} p */
      const cssName = p =>
        p.startsWith('--')
          ? p
          : p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (JSON.stringify(x[prop]) === JSON.stringify(y[prop])) continue;
        const shown = base?.components?.[target]?.[key]?.[prop];
        /**
         * Whether a write only repeats what the base theme already shows
         * there, which changes nothing.
         * @param {any} was @param {any} now @param {any} baseValue
         */
        const repeatsBase = (was, now, baseValue) =>
          was === undefined &&
          baseValue !== undefined &&
          typeof baseValue !== 'object' &&
          plain(baseValue) === plain(now);
        const where = `${target}${key === 'base' ? '' : ` ${key}`}`;
        // A block (a state, `:hover`, a mode block, a state inside a mode
        // block) lists each property it changes, under its path.
        /**
         * @param {string} path @param {any} xs @param {any} ys @param {any} shownIn
         */
        const blockLines = (path, xs, ys, shownIn) => {
          for (const p of new Set([
            ...Object.keys(xs ?? {}),
            ...Object.keys(ys ?? {}),
          ])) {
            const was = xs?.[p];
            const now = ys?.[p];
            if (JSON.stringify(was) === JSON.stringify(now)) continue;
            if (
              (now && typeof now === 'object') ||
              (was && typeof was === 'object')
            ) {
              blockLines(`${path} ${p}`, was ?? {}, now ?? {}, shownIn?.[p]);
              continue;
            }
            if (repeatsBase(was, now, shownIn?.[p])) continue;
            out.push(
              `${where} ${path}: ${cssName(p)} ${now === undefined ? '(removed)' : String(now)}`,
            );
          }
        };
        if (
          (y[prop] && typeof y[prop] === 'object') ||
          (x[prop] && typeof x[prop] === 'object')
        ) {
          blockLines(prop, x[prop] ?? {}, y[prop] ?? {}, shown);
          continue;
        }
        if (repeatsBase(x[prop], y[prop], shown)) continue;
        out.push(
          `${where}: ${cssName(prop)} ${y[prop] === undefined ? '(removed)' : typeof y[prop] === 'string' ? y[prop] : JSON.stringify(y[prop])}`,
        );
      }
    }
  }
  const ta = JSON.stringify(before?.typography ?? {});
  const tb = JSON.stringify(after?.typography ?? {});
  if (ta !== tb) {
    for (const role of FONT_ROLES) {
      const x = after?.typography?.[role];
      if (
        JSON.stringify(before?.typography?.[role] ?? null) !==
        JSON.stringify(x ?? null)
      )
        out.push(
          `typography ${role}: ${
            x
              ? Object.entries(x)
                  .map(
                    ([k, v]) =>
                      `${k} ${
                        v && typeof v === 'object'
                          ? Object.entries(v)
                              .map(([a, b]) => `${a}: ${b}`)
                              .join(', ')
                          : v
                      }`,
                  )
                  .join('; ')
              : '(removed)'
          }`,
        );
    }
    if (
      JSON.stringify(before?.typography?.scale ?? null) !==
      JSON.stringify(after?.typography?.scale ?? null)
    )
      out.push(
        `typography scale: base ${after?.typography?.scale?.base ?? 'default'}`,
      );
  }
  return out;
}

/**
 * The line that says which pictures to open after a run that took them:
 * each family of components' first ({@link familyPages}), then the sample
 * page's and the open states' (every menu, tooltip, popover and list drawn
 * open), of the mode shown first (light when the theme has both). Null when
 * this run took none of them.
 * @param {string[]} files the pictures taken, as shown (`themes/t/preview.png`)
 * @returns {string | null}
 */
export function lookAtPictures(files) {
  /** @param {string} name */
  const one = name =>
    files.find(f => path.basename(f) === `${name}.png`) ??
    files.find(f => path.basename(f) === `${name}-dark.png`);
  const preview = one('preview');
  const open = one(`sheet-${OPEN_SECTION}`);
  // A family's picture, or the pictures cut from it, in order.
  /** @param {string} g @param {string} dark */
  const cuts = (g, dark) =>
    files.filter(f =>
      new RegExp(`^sheet-${g}${dark}(?:-\\d+)?\\.png$`).test(path.basename(f)),
    );
  /** @param {string} g */
  const pictured = g => (cuts(g, '').length ? cuts(g, '') : cuts(g, '-dark'));
  const families = FAMILY_SECTIONS.flatMap(pictured);
  const pages = pictured('pages');
  if (!preview && !open && !families.length && !pages.length) return null;
  const dark =
    files.some(f => /-dark\.png$/.test(f)) &&
    files.some(f => /(?<!-dark)\.png$/.test(f));
  return `open ${[
    // A family's own picture reads whole; the full sheet does not.
    ...(families.length
      ? [`${families.join(', ')} (one family of components each)`]
      : []),
    ...(pages.length
      ? [`${pages.join(', ')} (the sample app and each page template)`]
      : []),
    ...(preview
      ? [
          `${preview} (the sample page, a tooltip, a menu and a list drawn open below it)`,
        ]
      : []),
    ...(open
      ? [
          `${open} (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, drawn open)`,
        ]
      : []),
  ].join(' and ')}${dark ? '; the -dark pictures show the dark mode' : ''}`;
}

/**
 * The page of the theme's open states (every menu, tooltip, popover and
 * list drawn open: the overlays section of the sheet), made and stamped
 * with the build it shows, and where its picture goes. The sample page
 * (preview.png) has no overlay open, and the full sheet is too tall to
 * read whole, so `--png` takes this picture beside the sample page's.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<{html: string, png: string} | {problem: string}>} the
 *   page and its picture, or why neither is made: something of yours at the
 *   page's name (a file the editor did not write, a link, a folder) is never
 *   written over, as a picture of yours is not
 */
export async function openStatesPage(ctx, slug, data) {
  const f = themeFiles(ctx.project.cwd, slug);
  const html = path.join(f.dir, `sheet-${OPEN_SECTION}.html`);
  const png = path.join(f.dir, `sheet-${OPEN_SECTION}.png`);
  const shownHtml = shown(ctx.project.cwd, html);
  const skipped = `so ${shown(ctx.project.cwd, png)} (the open states) was not taken`;
  const inWay = pageInTheWay(html);
  if (inWay)
    return {
      problem: `${inTheWayPhrase(shownHtml, inWay, 'the open states page')}, ${skipped}; move ${inWay === 'link' ? 'the link' : 'it'}, then run ${P} show ${slug} --png`,
    };
  await renderSheet(ctx, slug, data, {group: OPEN_SECTION});
  stampSheet(html, slug, ctx.project.cwd);
  return {html, png};
}

/**
 * The tallest a family's picture is: a reader fits a picture to its width,
 * and a taller one comes out too small to read, so it is cut into pictures
 * this tall (`sheet-inputs-1.png`, `-2` …).
 */
export const FAMILY_PICTURE_HEIGHT = 1600;

/**
 * The family `show --png` pictures when the theme's settings set no part of
 * its own (a fresh theme, or only theme-wide settings): the buttons, an
 * overview of the theme's controls beside the sample page.
 */
export const FAMILY_OVERVIEW = 'actions';

/**
 * The families of components with a picture of their own beside the full
 * sheet, which is too tall to read whole: each section of the sheet but the
 * overlays (the open states page shows them) and the pages (the sample page
 * is preview.png).
 */
export const FAMILY_SECTIONS = Object.freeze(
  SHOWCASE_GROUPS.filter(g => g !== OPEN_SECTION && g !== 'pages'),
);

/**
 * The errors of a folder that cannot be written (no permission, read-only,
 * full): a page the pictures need that cannot be written there is the
 * pictures' problem, which the picture run names, never a refusal of the
 * command.
 */
export const UNWRITABLE = Object.freeze(['EACCES', 'EPERM', 'EROFS', 'ENOSPC']);

/**
 * One page for each family of components ({@link FAMILY_SECTIONS}), cut
 * from the full sheet just made, so each shows its family as the sheet
 * does, with no render of its own: the sheet's head and bar, then that
 * family's section. Each is written where `show --section <family>` writes
 * that family's sheet, and stamped with the build it shows. Something of
 * yours at a family page's name is never written over: that page is left
 * out and named.
 * @param {string} sheet the full sheet, as written
 * @param {string} slug
 * @param {string} cwd
 * @param {readonly string[]} [only] the families to make; every one by default
 * @returns {{pages: Array<{html: string, png: string, family: string}>, problems: string[]}}
 */
export function familyPages(sheet, slug, cwd, only = FAMILY_SECTIONS) {
  /** @type {Array<{html: string, png: string, family: string}>} */
  const pages = [];
  /** @type {string[]} */
  const problems = [];
  const text = fs.readFileSync(sheet, 'utf8').replace(SHEET_STAMP, '');
  // Each section of the sheet starts with its own marker, in order, and
  // holds no section of its own: one ends where the next starts, and the
  // last at the last section close.
  const starts = [
    ...text.matchAll(
      /<section\b[^>]*\sclass="[^"]*\bcs-family-([a-z-]+)\b[^"]*"[^>]*>/g,
    ),
  ].map(m => ({family: m[1], at: /** @type {number} */ (m.index)}));
  const close = text.lastIndexOf('</section>');
  if (!starts.length || close < 0) return {pages, problems};
  const end = close + '</section>'.length;
  const before = text.slice(0, starts[0].at);
  const after = text.slice(end);
  for (const [i, {family, at}] of starts.entries()) {
    if (!FAMILY_SECTIONS.includes(family) || !only.includes(family)) continue;
    const html = path.join(path.dirname(sheet), `sheet-${family}.html`);
    const png = path.join(path.dirname(sheet), `sheet-${family}.png`);
    const inWay = pageInTheWay(html);
    if (inWay) {
      problems.push(
        `${inTheWayPhrase(shown(cwd, html), inWay, `the ${family} sheet`)}, so ${shown(cwd, png)} was not taken; move ${inWay === 'link' ? 'the link' : 'it'}, then run ${P} show ${slug} --png`,
      );
      continue;
    }
    const head = before
      .replace('class="cs-page"', `class="cs-page cs-section-${family}"`)
      .replace(
        `<strong>${slug}: every component</strong>`,
        `<strong>${slug}: every component (${family})</strong>`,
      );
    try {
      writeWhole(
        html,
        `${head}${text.slice(at, starts[i + 1]?.at ?? end)}${after}`,
      );
      stampSheet(html, slug, cwd);
    } catch (e) {
      // A theme folder it cannot write: no family page, and the picture
      // run names the folder.
      if (UNWRITABLE.includes(/** @type {any} */ (e)?.code)) break;
      throw e;
    }
    pages.push({html, png, family});
  }
  return {pages, problems};
}

/**
 * Previews after a change: the sample page always; on request, pictures of
 * it and of the open states ({@link openStatesPage}).
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {boolean} png
 */
export async function previewAfter(ctx, slug, data, png) {
  /** @type {string | null} */
  let preview = null;
  let cause = ctx.unchecked ?? null;
  const f0 = themeFiles(ctx.project.cwd, slug);
  // Something of yours at preview.html (a file, a link, a pipe) is left as
  // it is: the sample page is not made, so the change is not rendered,
  // which the result says. (A folder there is named by the write that
  // fails, below.)
  const inWay = pageInTheWay(f0.preview);
  const previewInWay =
    inWay === 'file' || inWay === 'link' || inWay === 'other' ? inWay : null;
  if (previewInWay)
    cause ??= `${inTheWayPhrase(shown(ctx.project.cwd, f0.preview), previewInWay, 'the sample page')}, so the sample page was not made and the change was not rendered; move ${previewInWay === 'link' ? 'the link' : 'it'}, then run ${P} show ${slug}`;
  else
    try {
      preview = await renderPreview(ctx, slug, data);
    } catch (e) {
      // The change is already saved: any failure here leaves it unchecked.
      const code = /** @type {any} */ (e)?.code;
      cause ??= isRenderFailure(e)
        ? renderCause(ctx.project, /** @type {Error} */ (e).message)
        : ['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EIO'].includes(code)
          ? `preview.html could not be written (${code === 'ENOSPC' ? 'the disk is full' : code}), so it still shows the theme as it was`
          : // A folder (or another thing) where preview.html goes: the page
            // was rendered, and could not be written there.
            code === ERROR_CODES.ERR_WRITE_FAILED ||
              (fs.existsSync(f0.preview) && !fs.statSync(f0.preview).isFile())
            ? `preview.html could not be written (${shown(ctx.project.cwd, f0.preview)} is ${fs.existsSync(f0.preview) && fs.statSync(f0.preview).isDirectory() ? 'a folder' : 'in the way'}; move it, then run ${P} show ${slug}), so it still shows the theme as it was`
            : `checking it failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  const f = themeFiles(ctx.project.cwd, slug);
  /**
   * The pages photographed: the sample page, and with it the open states.
   * @type {Array<{html: string, png: string, name?: string}>}
   */
  const shotPages = [
    {html: f.preview, png: f.previewPng, name: SAMPLE_PAGE_NAME},
  ];
  /** Why the open states were not taken, said with the pictures. @type {string | null} */
  let openProblem = null;
  // Made before the sections are judged, so it is current, never marked.
  if (png && preview) {
    const open = await openStatesPage(ctx, slug, data).catch(e => {
      if (/** @type {any} */ (e)?.lockLost) throw e;
      return {
        problem: `the open states page could not be made (${e instanceof Error ? e.message.split('\n')[0] : String(e)}), so ${shown(ctx.project.cwd, path.join(f.dir, `sheet-${OPEN_SECTION}.png`))} was not taken`,
      };
    });
    if ('problem' in open) openProblem = open.problem;
    else shotPages.push(open);
  }
  // The sheet of every component is made by show only: after a change it
  // says, at its top, that it shows the theme as it was.
  const sheetStale = markSheetStale(f.sheet, slug, ctx.project.cwd);
  // Section sheets the editor made (they carry its stamp) go out of date the
  // same way; any other file is left as it is.
  const sectionsStale = (
    fs.existsSync(f.dir) ? fs.readdirSync(f.dir) : []
  ).filter(n => {
    if (!/^sheet-[a-z-]+\.html$/.test(n)) return false;
    return markSheetStale(path.join(f.dir, n), slug, ctx.project.cwd);
  });
  const shots =
    png && preview
      ? await pictures(ctx.project, shotPages, modesOf(data))
      : {files: [], problem: null, cutShort: []};
  return {
    preview,
    pictures: shots.files,
    // Text the sample page's pictures draw cut short: a note and a problem
    // of the change.
    cutShort: shots.cutShort,
    pictureProblem:
      [openProblem, shots.problem].filter(Boolean).join('; ') || null,
    notChecked: notChecked(cause),
    ...(sheetStale && !sectionsStale.length
      ? {
          sheetStale: `sheet.html shows ${slug} as it was before this change; ${P} show ${slug} makes it again`,
        }
      : sectionsStale.length
        ? {
            sheetStale: `${[...(sheetStale ? ['sheet.html'] : []), ...sectionsStale].join(', ')} show ${slug} as it was before this change; ${[
              ...(sheetStale
                ? [`${P} show ${slug} makes sheet.html again`]
                : []),
              ...sectionsStale.map(
                n =>
                  `${P} show ${slug} --section ${n.replace(/^sheet-|\.html$/g, '')} makes ${n} again`,
              ),
            ].join(', ')}`,
          }
        : {}),
  };
}

const STALE_MARK = '<!-- astryx: sheet older than the theme -->';

/** The build a full sheet was made from, recorded in the sheet. */
const SHEET_STAMP = /<!-- astryx: sheet of build ([0-9a-f]{16}) -->/;

/** @param {string} s */
const escapeForRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A hash of a theme's built stylesheet and module, or null when either is
 * missing.
 * @param {string} cwd
 * @param {string} slug
 */
function buildHash(cwd, slug) {
  const f = themeFiles(cwd, slug);
  try {
    return createHash('sha256')
      .update(fs.readFileSync(f.css))
      .update('\0')
      .update(fs.readFileSync(f.js))
      .digest('hex')
      .slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Record in a freshly made full sheet the build it shows.
 * @param {string} file
 * @param {string} slug
 * @param {string} cwd
 */
export function stampSheet(file, slug, cwd) {
  const hash = buildHash(cwd, slug);
  if (!hash) return;
  try {
    const html = fs.readFileSync(file, 'utf8').replace(SHEET_STAMP, '');
    // At the end: a comment before the doctype would put the page in
    // quirks mode.
    writeWhole(
      file,
      `${html.trimEnd()}\n<!-- astryx: sheet of build ${hash} -->\n`,
    );
  } catch (e) {
    if (/** @type {any} */ (e)?.lockLost) throw e;
  }
}

/**
 * Put a notice at the top of a sheet the last change made out of date
 * (once), or take it off a sheet made from the build there is now.
 * Returns whether the sheet is out of date.
 * @param {string} file
 * @param {string} slug
 * @param {string} cwd
 */
function markSheetStale(file, slug, cwd) {
  // Only the editor's own sheet: a file of yours there is never written.
  if (pageInTheWay(file) != null) return false;
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  // A sheet made from the build there is now (a change, then its undo)
  // shows the theme as it is: no banner, and the result says nothing.
  const made = SHEET_STAMP.exec(html)?.[1];
  if (made && made === buildHash(cwd, slug)) {
    if (html.includes(STALE_MARK)) {
      const clean = html.replace(
        new RegExp(`${escapeForRegExp(STALE_MARK)}<div[^>]*>[\\s\\S]*?</div>`),
        '',
      );
      try {
        writeWhole(file, clean);
      } catch (e) {
        if (/** @type {any} */ (e)?.lockLost) throw e;
      }
    }
    return false;
  }
  if (html.includes(STALE_MARK)) return true;
  // A section's sheet is made again by its own show.
  const section = /^sheet-([a-z-]+)\.html$/.exec(path.basename(file))?.[1];
  const again = `${P} show ${slug}${section ? ` --section ${section}` : ''}`;
  const banner = `${STALE_MARK}<div style="position:sticky;top:0;z-index:9999;padding:8px 12px;background:#fff3cd;color:#3d2c00;font:14px system-ui,sans-serif;border-bottom:1px solid #e0c870">This sheet shows ${slug} as it was before the last change. Run ${again} to make it again.</div>`;
  const at = html.search(/<body[^>]*>/i);
  const next =
    at < 0 ? banner + html : html.replace(/<body[^>]*>/i, m => `${m}${banner}`);
  try {
    // Fenced like every editor write under the theme lock.
    writeWhole(file, next);
  } catch (e) {
    if (/** @type {any} */ (e)?.lockLost) throw e;
    // Read-only: the note in the result still says so.
  }
  return true;
}

/**
 * The section of the sheet, in lower case, or undefined; a refusal for one
 * that is not a section.
 * @param {string | undefined} section
 * @param {string} [theme] the theme the suggestions name
 * @param {string} [rest] the command's other options as typed (` --png`):
 *   the offered command keeps them, with only the section fixed
 * @returns {string | undefined}
 */
export function checkSection(section, theme = 'my', rest = '') {
  // A section is offered only when one is within a typo of what was typed;
  // otherwise the way on is the whole sheet (show with no --section), with
  // the sections listed in the message. An option where the section
  // belongs (`--section --png`) was read as its value: it stays an option.
  const eaten =
    typeof section === 'string' && /^--[a-z][a-z-]*$/.test(section.trim())
      ? ` ${section.trim()}`
      : '';
  const show = `${P} show ${theme}${rest}${rest.includes(eaten) ? '' : eaten}`;
  if (section === '')
    refuse(
      E.ERR_MISSING_ARGUMENT,
      `--section was given no value; it takes ${SHOWCASE_GROUPS.join(', ')}, and show with no --section makes the whole sheet.`,
      {run: [show]},
    );
  const s = section?.toLowerCase();
  if (s != null && !SHOWCASE_GROUPS.includes(s)) {
    const near = SHOWCASE_GROUPS.filter(g => typoNear(s, g));
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--section takes ${SHOWCASE_GROUPS.join(', ')}, not "${section}"${near.length ? '' : '; show with no --section makes the whole sheet'}.`,
      {
        didYouMean: near,
        run: [near.length === 1 ? `${show} --section ${near[0]}` : show],
      },
    );
  }
  return s;
}
