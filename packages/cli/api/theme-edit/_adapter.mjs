// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme-edit subject's adapter: the work behind `astryx experimental
 * theme editor` and `theme preview`, and the subject's only access to the
 * environment (files, the installed Core, the renderer). Each operation's
 * work is in an underscore helper that only this file imports; the leaves
 * call it.
 *
 *   themeEditNew('brand', {like: 'neutral'})           themeEdit.new
 *   themeEditSet('brand', 'corners', 'pill')            themeEdit.set
 *   themeEditUndo('brand')                              themeEdit.undo (one step)
 *   themeEditUndo('brand', {thing: 'corners'})          themeEdit.undo (one setting)
 *   themeEditShow('brand')                              themeEdit.show
 *   themeEditPreviewAdd('a sales dashboard')            themeEdit.previewAdd
 *   themeEditPreviewApp('theme-app')                    themeEdit.previewApp
 *   themeEditPreviewList()                              themeEdit.previewList
 *   themeEditPreviewRemove('components')                themeEdit.previewRemove
 *   themeEditHow('banner')                              themeEdit.how
 *   themeEditHow('white text in the banner')            themeEdit.how (a question)
 *   themeEditHow('target.png', {at: ['4,8']})           themeEdit.how (a picture)
 *   themeEditHow('accent', {list: 'tokens'})            themeEdit.how (a list)
 *
 * Every change is checked first against what the installed Core's parts
 * really read; a change that cannot take effect is refused and nothing is
 * written. An accepted change rebuilds the theme with the theme build and
 * writes a preview.
 *
 * @input a theme name and a change, a question, or a picture
 * @output themeEdit.* envelopes
 * @position api/theme-edit — adapter for api/theme-edit/theme-edit.mjs
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as edit from './_edit.mjs';
import * as preview from './_preview-app.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  findAstryxProject,
  findPackageRoot,
  findProjectCoreDir,
} from '../../foundation/fs/paths.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {tryLock} from '../../foundation/release/cache.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {LIKE} from './_tables.mjs';

export {themeEditHow, parsePoints} from './_how.mjs';

/** The built-in themes a theme can build on (`--like`). */
export const builtInThemes = () => [...LIKE];

/**
 * The project a command acts on: the Astryx project at or above `cwd`, found
 * as `upgrade` finds it (the nearest package that declares an Astryx package
 * in any dependency list; the search stops at a repository root and never
 * counts the home folder or above), else `cwd` itself. A package nearer
 * than that project that does not use Astryx is refused with the folder to
 * run from, and a nearest package.json that does not parse is never walked
 * past.
 * @param {string} cwd
 */
export function projectRoot(cwd) {
  const start = path.resolve(cwd);
  const project = findAstryxProject(start);
  const pkg = findPackageRoot(start);
  const inReach = (/** @type {string} */ dir) =>
    project ? !path.relative(project, dir).startsWith('..') : true;
  if (pkg && inReach(pkg) && pkg !== project) {
    const file = path.join(pkg, 'package.json');
    /** @type {any} */
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new AstryxError(
        `${path.relative(start, file) || 'package.json'} is not valid JSON, so the app it belongs to is unknown. Fix it, then run the command again. Nothing was written.`,
        [],
        ERROR_CODES.ERR_PROJECT_REQUIRED,
      );
    }
    // A package.json that only sets the module type (no name, no
    // dependencies) is a folder setting, not another package.
    const trivial =
      json?.name == null &&
      !['dependencies', 'devDependencies', 'peerDependencies'].some(
        k => json?.[k] != null,
      );
    if (project && !trivial)
      throw new AstryxError(
        `${path.relative(start, file) || 'package.json'} is a package that does not use Astryx; the app that does is ${path.relative(start, project) || '.'}. Run the command from there, so the theme lands in that app. Nothing was written.`,
        [
          {
            name: `cd ${quoteCommandArgument(path.relative(start, project))}`,
            reason: 'do this first',
          },
        ],
        ERROR_CODES.ERR_PROJECT_REQUIRED,
      );
  }
  return project ?? start;
}

/** The locks this process holds now. */
const HELD = new Set();

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Where a project's locks are: the `.cache` of the node_modules holding
 * the Core the command reads (the project's own, or a workspace root's), shared by
 * every shell and user that can change the project, outside the source
 * tree. Null outside a project or without Core (nothing can be written
 * then, so there is nothing to keep apart). A folder that
 * cannot be written is refused, naming it.
 * @param {string} root
 * @returns {string | null}
 */
function lockDir(root) {
  // The Core the command reads decides where; outside a project there is
  // none, and no lock.
  if (isOutsideProject(root)) return null;
  const core = findProjectCoreDir(root);
  if (!core) return null;
  const modules = path.dirname(path.dirname(core));
  const dir = path.join(modules, '.cache', 'astryx-theme', 'locks');
  try {
    fs.mkdirSync(dir, {recursive: true});
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch (e) {
    throw new AstryxError(
      `Could not write ${path.relative(root, dir)} (${/** @type {any} */ (e).code ?? String(e)}), where the lock that keeps two commands on one theme apart is kept. Fix its permission, then run the command again. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
}

/**
 * Run `fn` holding a lock named `name` for the project at `root`, so two
 * commands on one theme (or one preview) run one after the other: each one
 * reads what the other wrote. The lock is a folder in the project's
 * node_modules/.cache; a lock left by a command that is no longer running
 * is taken over.
 * @template T
 * @param {string} root
 * @param {string} name
 * @param {(locked: boolean) => Promise<T>} fn called with whether the lock
 *   is held
 * @param {boolean} [bestEffort] a command that can run read-only runs
 *   without the lock when it cannot be taken (a read-only node_modules),
 *   told so, and then writes nothing
 * @returns {Promise<T>}
 */
async function withLock(root, name, fn, bestEffort = false) {
  /** @type {string | null} */
  let dir;
  try {
    dir = lockDir(root);
  } catch (e) {
    if (bestEffort) return fn(false);
    throw e;
  }
  if (!dir) return fn(true);
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const lock = path.join(dir, `${key}-${name}.lock`);
  const ownerFile = path.join(lock, 'owner.json');
  /** @returns {any} */
  const owner = () => {
    try {
      return JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    } catch {
      return null;
    }
  };
  // A lock naming this very pid on this computer, that this process does
  // not hold, is left from a process that had this pid before (a container
  // restarted) only when it was taken before this process started. Two
  // containers on one checkout can both be pid 1: a lock taken since this
  // process started is a live sibling's.
  const held = owner();
  const started = Date.now() - process.uptime() * 1000;
  if (
    held?.pid === process.pid &&
    held?.host === os.hostname() &&
    !HELD.has(lock) &&
    Number(held?.at) < started
  )
    fs.rmSync(lock, {recursive: true, force: true});
  /** @returns {number | null} seconds since the lock was taken or renewed */
  const age = () => {
    try {
      return Math.round((Date.now() - fs.statSync(lock).mtimeMs) / 1000);
    } catch {
      return null;
    }
  };
  try {
    // The release cache's lock: made with mkdir (one taker wins), and a
    // holder that stopped is taken over by a rename (one taker wins). The
    // wait is per holder: it starts again each time the lock changes hands.
    let holder = JSON.stringify(owner());
    for (let waited = 0; !tryLock(lock); waited += 50) {
      const now = JSON.stringify(owner());
      if (now !== holder) {
        holder = now;
        waited = 0;
      }
      if (waited > 30_000) {
        const o = owner();
        const held = age();
        throw new AstryxError(
          `Another command has been changing ${name.replace(/^theme-/, '')} for 30 seconds${o ? ` (process ${o.pid} on ${o.host}${held != null ? `, holding it ${held} s` : ''})` : ''}. Nothing was changed; run this command again. If no astryx command is running, the lock is left from one that stopped: remove the folder ${lock}.`,
          [],
          ERROR_CODES.ERR_THEME_BUSY,
        );
      }
      await sleep(50);
    }
  } catch (e) {
    if (e instanceof AstryxError) throw e;
    if (bestEffort) return fn(false);
    throw new AstryxError(
      `Could not take the lock ${lock} (${/** @type {any} */ (e).code ?? String(e)}). Nothing was changed; fix the folder, then run the command again.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  HELD.add(lock);
  const mine = fs.existsSync(ownerFile)
    ? fs.readFileSync(ownerFile, 'utf8')
    : null;
  // Only this command's own lock is removed, never one another took over.
  const release = () => {
    try {
      const now = fs.existsSync(ownerFile)
        ? fs.readFileSync(ownerFile, 'utf8')
        : null;
      if (now === mine) fs.rmSync(lock, {recursive: true, force: true});
    } catch {
      // Gone already.
    }
  };
  // Stopped by a signal, the lock still goes.
  const onSignal = (/** @type {NodeJS.Signals} */ sig) => {
    release();
    process.kill(process.pid, sig);
  };
  process.once('exit', release);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn(true);
  } catch (e) {
    // A folder that cannot be written (no permission, a full or read-only
    // disk) is a documented refusal, not a crash.
    const code = /** @type {any} */ (e)?.code;
    if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS'].includes(code))
      throw new AstryxError(
        `Could not write ${path.relative(root, /** @type {any} */ (e).path ?? '') || 'the theme files'}: ${code === 'ENOSPC' ? 'the disk is full' : code === 'EROFS' ? 'the disk is read-only' : 'no permission'}. Free the space or fix the permission, then run the command again; a refused change is undone.`,
        [],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    throw e;
  } finally {
    release();
    HELD.delete(lock);
    process.removeListener('exit', release);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

/**
 * Options with `cwd` moved to the project root, and a `--path` given from a
 * subfolder kept pointing where it was given.
 * @template {{cwd?: string, path?: string}} O
 * @param {O} options
 * @returns {O & {cwd: string}}
 */
function atRoot(options) {
  const from = options.cwd ?? process.cwd();
  const cwd = projectRoot(from);
  return {
    ...options,
    cwd,
    ...(options.path != null && options.path !== ''
      ? {path: path.relative(cwd, path.resolve(from, options.path)) || '.'}
      : {}),
  };
}

/** @param {any} name */
const lockName = name =>
  `theme-${String(name ?? '')
    .replace(/[^a-z0-9-]/gi, '_')
    .slice(0, 80)}`;

/**
 * A result whose theme paths read from the project root, made absolute when
 * the command ran in a folder below that root, so a path in the reply
 * points at the file wherever the person is.
 * @template T
 * @param {T} result
 * @param {string} root
 * @param {string} from
 * @returns {T}
 */
function absolute(result, root, from) {
  if (path.resolve(from) === root) return result;
  /** @param {any} v @returns {any} */
  const map = v =>
    typeof v === 'string'
      ? /^themes\//.test(v)
        ? path.join(root, v)
        : v
      : Array.isArray(v)
        ? v.map(map)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x)]))
          : v;
  return map(result);
}

/**
 * Run an editor command at the project root, holding `lock` when one is
 * named, with paths in the reply that work from where it ran.
 * @template {{cwd?: string, path?: string}} O
 * @template T
 * @param {O} options
 * @param {string | null} lock
 * @param {(o: O & {cwd: string}) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function inProject(options, lock, fn, bestEffort = false) {
  const from = options.cwd ?? process.cwd();
  const o = atRoot(options);
  // Without the lock (it cannot be taken), a read-only command writes
  // nothing.
  const r = lock
    ? await withLock(
        o.cwd,
        lock,
        locked => fn(locked ? o : {...o, readOnly: true}),
        bestEffort,
      )
    : await fn(o);
  return absolute(r, o.cwd, from);
}

/**
 * Options for a preview command, with a way to hold a theme's lock while
 * the preview builds that theme.
 * @template {{cwd: string}} O
 * @param {O} o
 * @returns {any}
 */
const withThemeLock = o => ({
  ...o,
  lockTheme: (
    /** @type {string} */ slug,
    /** @type {() => Promise<any>} */ fn,
  ) => withLock(o.cwd, lockName(slug), fn),
});

/** @type {typeof edit.themeEditNew} */
export const themeEditNew = (name, options = {}) =>
  inProject(options, lockName(name), o => edit.themeEditNew(name, o));
/** @type {typeof edit.themeEditSet} */
export const themeEditSet = (theme, thing, value, options = {}) =>
  inProject(options, lockName(theme), o =>
    edit.themeEditSet(theme, thing, value, o),
  );
/** @type {typeof edit.themeEditUndo} */
export const themeEditUndo = (theme, options = {}) =>
  inProject(options, lockName(theme), o => edit.themeEditUndo(theme, o));
/** @type {typeof edit.themeEditShow} */
export const themeEditShow = (theme, options = {}) =>
  inProject(options, lockName(theme), o => edit.themeEditShow(theme, o), true);
/** @type {typeof preview.themeEditPreviewAdd} */
export const themeEditPreviewAdd = (description, options = {}) =>
  inProject(options, 'preview', o =>
    preview.themeEditPreviewAdd(description, withThemeLock(o)),
  );
/**
 * `preview app` runs from the project root, with `dir` kept pointing where
 * it was given. With a theme it holds that theme's lock, since it may build
 * the theme and copies its files: a `set` beside it waits.
 * @type {typeof preview.themeEditPreviewApp}
 */
export const themeEditPreviewApp = (dir, options = {}) => {
  const from = options.cwd ?? process.cwd();
  return inProject(
    options,
    options.theme == null ? null : lockName(options.theme),
    o =>
      preview.themeEditPreviewApp(
        typeof dir === 'string' && dir.trim() && dir === dir.trim()
          ? path.relative(o.cwd, path.resolve(from, dir)) || '.'
          : dir,
        o,
      ),
    true,
  );
};
/** @type {typeof preview.themeEditPreviewList} */
export const themeEditPreviewList = (options = {}) =>
  inProject(options, null, async o => preview.themeEditPreviewList(o));
/** @type {typeof preview.themeEditPreviewRemove} */
export const themeEditPreviewRemove = (page, options = {}) =>
  inProject(options, 'preview', o =>
    preview.themeEditPreviewRemove(page, withThemeLock(o)),
  );

/**
 * The theme an editor theme path or name names, or null: `themes/<slug>/`
 * holding `<slug>.settings.json`.
 * @param {string} root
 * @param {string} word a path or a name
 */
function editorThemeOf(root, word) {
  const m = /(?:^|[\\/])themes[\\/]([a-z][a-z0-9-]*)(?:[\\/]|$)/.exec(word);
  const slug = m ? m[1] : /^[a-z][a-z0-9-]*$/.test(word) ? word : null;
  return slug &&
    fs.existsSync(path.join(root, 'themes', slug, `${slug}.settings.json`))
    ? slug
    : null;
}

/**
 * A clearer refusal for a theme the editor made, named to list, add, use,
 * remove or eject: those commands work on package themes, and the editor
 * theme is used by importing its module. Null for any other refusal.
 * @param {AstryxError} err
 * @param {string} cwd
 * @returns {AstryxError | null}
 */
export function editorThemeRefusal(err, cwd) {
  if (
    err.code !== ERROR_CODES.ERR_UNKNOWN_THEME &&
    !/unknown theme|is not added|not a theme package/i.test(err.message)
  )
    return null;
  const root = projectRoot(cwd);
  const named = /"([a-z][a-z0-9-]*)"|'([a-z][a-z0-9-]*)'/.exec(err.message);
  const slug = named ? editorThemeOf(root, named[1] ?? named[2]) : null;
  if (!slug) return null;
  return new AstryxError(
    `${slug} is a theme the editor made (themes/${slug}/), not a theme package, so list, add, use, remove and eject do not take it. Import its module (themes/${slug}/${slug}.js) where the app picks its theme, or change it with the editor.`,
    [
      {
        name: `astryx experimental theme editor show ${slug}`,
        reason: 'see the theme',
      },
    ],
    ERROR_CODES.ERR_UNKNOWN_THEME,
  );
}

/**
 * A refusal before `compile` runs on an editor theme's files, or null: the
 * editor's generated settings are not a theme source, `--family` does not
 * take an editor theme, and `--check` checks an editor theme by the editor's
 * own rules (waiting for a change in progress).
 * @param {string[]} files
 * @param {{cwd: string, check?: boolean, family?: boolean}} options
 * @returns {Promise<AstryxError | null>}
 */
export async function editorCompileProblem(files, {cwd, check, family}) {
  const root = projectRoot(cwd);
  for (const file of files) {
    const slug = editorThemeOf(root, path.resolve(cwd, file));
    if (!slug) continue;
    const source = `themes/${slug}/${slug}.theme.ts`;
    if (/\.settings\.(ts|json)$/.test(file))
      return new AstryxError(
        `${file} is the editor's own settings for ${slug}, not a theme source; compile the theme source.`,
        [
          {
            name: `astryx experimental theme compile ${quoteCommandArgument(source)}`,
            reason: 'do this instead',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    if (family)
      return new AstryxError(
        `${slug} is a theme the editor made; --family builds package theme families, not editor themes. Compile it on its own.`,
        [
          {
            name: `astryx experimental theme compile ${quoteCommandArgument(source)}`,
            reason: 'do this instead',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    if (check) {
      // A check waits for a change in progress, so it never reads one half
      // written.
      const why = await withLock(root, lockName(slug), () =>
        edit.editorStale(root, slug),
      );
      if (why)
        return new AstryxError(
          `${slug} is not up to date: ${why}. The editor builds it again from its settings.`,
          [
            {
              name: `astryx experimental theme editor show ${slug}`,
              reason: 'build it again',
            },
          ],
          ERROR_CODES.ERR_THEME_INVALID,
        );
    }
  }
  return null;
}
