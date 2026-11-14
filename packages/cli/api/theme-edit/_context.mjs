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
import {EDITOR_STAMP, withPngText} from './_png.mjs';
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
  isDesktopFamily,
  oneSystemOf,
  P,
  SYSTEM_FONTS,
} from './_tables.mjs';
import {makeCompiler} from './_compiler.mjs';
import {openProject, installLine} from './_project.mjs';
import {partData} from './_parts.mjs';
import {writeWhole} from './_palette.mjs';
import {
  fontOf,
  builtFontFamilies,
  fontPackages,
  fontsourcePackageOf,
  modesOf,
  nearest,
  refuse,
  editorWrote,
  recordWritten,
  themeFiles,
  refuseThemesNotFolder,
  shown,
} from './_settings.mjs';
import {
  SHOWCASE_GROUPS,
  newPictureRun,
  renderPreview,
  screenshot,
} from './_preview.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

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
  } catch (e) {
    if (!isRenderFailure(e)) throw e;
    unchecked = renderCause(project, /** @type {Error} */ (e).message);
    uncheckedCode = /** @type {any} */ (e).code ?? null;
    parts = {
      version: 0,
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
    e.code === E.ERR_RENDER_MISSING_DEPENDENCY);

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
  return app && core && app !== core
    ? `${message} The likely cause: two copies of React, the app's (${app}) and the one Core resolves (${core}). Make Core resolve the app's React.`
    : message;
}

/**
 * The "saved, not checked" report of a change, or null when it was checked.
 * @param {string | null} cause
 */
const notChecked = cause =>
  cause ? {code: E.ERR_THEME_NOT_CHECKED, cause} : null;

/**
 * Pictures of HTML files, on request.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Array<{html: string, png: string}>} shots
 * @param {Array<'light' | 'dark'>} modes
 * @returns {Promise<{files: string[], problem: string | null}>}
 */
export async function pictures(project, shots, modes) {
  /** @type {string[]} */
  const files = [];
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
  // A picture is written only over a picture the editor took, unchanged
  // since: a file of the user's by that name (a screenshot of the same
  // size included) blocks every picture, and is named.
  const blocked = shots
    .flatMap(({png}) => modes.map(m => outOf(png, m)))
    .filter(out => {
      const slug = themeOf(out);
      return (
        Boolean(slug) &&
        fs.existsSync(out) &&
        !editorWrote(project.cwd, /** @type {string} */ (slug), out)
      );
    });
  if (blocked.length)
    return {
      files,
      problem: `${blocked.map(f => path.relative(project.cwd, f)).join(', ')} ${blocked.length === 1 ? 'is a file' : 'are files'} the editor did not write (or changed since it did), so no picture was taken and ${blocked.length === 1 ? 'it is' : 'they are'} left as ${blocked.length === 1 ? 'it is' : 'they are'}`,
    };
  for (const {html, png} of shots) {
    for (const m of modes) {
      const out = outOf(png, m);
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
          problem: `${path.relative(project.cwd, part)} is a folder, where --png writes a picture before moving it into place, so no picture was taken; move it out of ${path.relative(project.cwd, path.dirname(out))}/`,
        };
      // A folder it cannot write gets no picture: named before the browser
      // starts, never read as a browser that failed.
      try {
        fs.accessSync(path.dirname(out), fs.constants.W_OK);
      } catch (e) {
        return {
          files,
          problem: `${path.relative(project.cwd, path.dirname(out))}/ cannot be written (${/** @type {any} */ (e)?.code ?? 'no access'}), so no picture was taken; fix its permissions, then run the command again`,
        };
      }
      const r = await screenshot(project, html, part, m, run);
      if (!r.ok) {
        fs.rmSync(part, {force: true});
        return {files, problem: r.reason};
      }
      try {
        fs.renameSync(part, out);
      } catch (e) {
        fs.rmSync(part, {force: true});
        return {
          files,
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
      }
      if (r.note && !notes.includes(r.note)) notes.push(r.note);
    }
  }
  return {
    files,
    // Pictures were taken; a note says why an earlier browser did not.
    problem: notes.join('; ') || null,
  };
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
        ? `${family} is installed (${pkg}), so the previews load it; the app loads it with one import: import '${pkg}';`
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
      presetFamily(fontOf(s.value).family)
    )
      continue;
    const family = fontOf(s.value).family.replace(/["']/g, '').toLowerCase();
    const near = CLOSEST_OPEN_FONT[family];
    const named = fontOf(s.value).family.replace(/^["']|["']$/g, '');
    const system = oneSystemOf(named);
    const on = s.on ? ` --on ${s.on}` : '';
    if (system) {
      // A system font, on one system: the others show the next font.
      const next =
        fontOf(s.value).fallbacks.split(',')[0]?.trim() || 'system-ui';
      notes.push(
        /^(-apple-system|blinkmacsystemfont)$/.test(family)
          ? `"${named}" names the macOS interface font, which only macOS has: other systems show the next font in the stack (${next}). The system preset gives each system its own interface font: ${P} set ${data.name} font system${on}`
          : `"${named}" ships only on ${system}: other systems show the next font in the stack (${next}).${near ? ` The closest open font, which loads everywhere, is ${near}: ${P} set ${data.name} font ${near}${on}` : ''}`,
      );
      continue;
    }
    notes.push(
      `"${named}" is not a system font and no package loads it: the app must load it, or it falls back. If Fontsource publishes it, ${installLine(ctx.project.cwd, [fontsourcePackageOf(named)])} installs its package, which the previews and the app copy then load.${near ? ` The closest open font is ${near}: ${P} set ${data.name} font ${near}${s.on ? ` --on ${s.on}` : ''}` : ''}`,
    );
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
        // A block (a state, `:hover`) lists each property it changes.
        if (
          (y[prop] && typeof y[prop] === 'object') ||
          (x[prop] && typeof x[prop] === 'object')
        ) {
          const xs = x[prop] ?? {};
          const ys = y[prop] ?? {};
          for (const p of new Set([...Object.keys(xs), ...Object.keys(ys)]))
            if (
              JSON.stringify(xs[p]) !== JSON.stringify(ys[p]) &&
              !repeatsBase(xs[p], ys[p], shown?.[p])
            )
              out.push(
                `${where} ${prop}: ${cssName(p)} ${ys[p] === undefined ? '(removed)' : String(ys[p])}`,
              );
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
 * Previews after a change: the sample page always, pictures on request.
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
  // The sheet of every component is made by show only: after a change it
  // says, at its top, that it shows the theme as it was.
  const sheetStale = markSheetStale(f.sheet, slug, ctx.project.cwd);
  // Section sheets the editor made (they carry its stamp) go out of date the
  // same way; any other file is left as it is.
  const sectionsStale = (
    fs.existsSync(f.dir) ? fs.readdirSync(f.dir) : []
  ).filter(n => {
    if (!/^sheet-[a-z-]+\.html$/.test(n)) return false;
    const file = path.join(f.dir, n);
    try {
      if (!SHEET_STAMP.test(fs.readFileSync(file, 'utf8'))) return false;
    } catch {
      return false;
    }
    return markSheetStale(file, slug, ctx.project.cwd);
  });
  const shots =
    png && preview
      ? await pictures(
          ctx.project,
          [{html: f.preview, png: f.previewPng}],
          modesOf(data),
        )
      : {files: [], problem: null};
  return {
    preview,
    pictures: shots.files,
    pictureProblem: shots.problem,
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
 * @returns {string | undefined}
 */
export function checkSection(section, theme = 'my') {
  if (section === '')
    refuse(E.ERR_MISSING_ARGUMENT, '--section was given no value.', {
      run: [`${P} show ${theme} --section ${SHOWCASE_GROUPS[0]}`],
    });
  const s = section?.toLowerCase();
  if (s != null && !SHOWCASE_GROUPS.includes(s))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--section takes ${SHOWCASE_GROUPS.join(', ')}, not "${section}".`,
      {
        didYouMean: nearest(s, SHOWCASE_GROUPS),
        run: [
          `${P} show ${theme} --section ${nearest(s, SHOWCASE_GROUPS)[0] ?? SHOWCASE_GROUPS[0]}`,
        ],
      },
    );
  return s;
}
