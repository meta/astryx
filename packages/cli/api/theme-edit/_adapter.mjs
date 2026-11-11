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
import {findAstryxProject} from '../../foundation/fs/paths.mjs';
import {q} from './_settings.mjs';

export {themeEditHow, parsePoints} from './_how.mjs';
export const {themeEditPreviewApp} = preview;

/**
 * The project a command acts on: the nearest folder at or above `cwd` with a
 * package.json. Run from a subfolder of an app, a command still finds the
 * app's themes; it never walks past the nearest package into another
 * project; a folder with Core installed counts as one. That package must
 * name Core (in any dependency list) or hold editor themes; a package that
 * does not, inside a project that does, is refused with the folder to run
 * from. Otherwise, `cwd` itself.
 * @param {string} cwd
 */
export function projectRoot(cwd) {
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    const pkg = path.join(dir, 'package.json');
    // A folder with Core installed is a project, with or without a
    // package.json of its own.
    if (
      !fs.existsSync(pkg) &&
      fs.existsSync(
        path.join(dir, 'node_modules', '@astryxdesign', 'core', 'package.json'),
      )
    )
      return dir;
    if (fs.existsSync(pkg)) {
      /** @type {any} */
      let json;
      try {
        json = JSON.parse(fs.readFileSync(pkg, 'utf8').replace(/^\uFEFF/, ''));
      } catch {
        throw new AstryxError(
          `${path.relative(start, pkg) || 'package.json'} is not valid JSON, so the app it belongs to is unknown. Fix it, then run the command again. Nothing was written.`,
          [],
          ERROR_CODES.ERR_PROJECT_REQUIRED,
        );
      }
      if (usesCore(dir, json)) return dir;
      const parent =
        path.dirname(dir) === dir ? null : findAstryxProject(path.dirname(dir));
      if (parent)
        throw new AstryxError(
          `${path.relative(start, pkg) || 'package.json'} is a package that does not use @astryxdesign/core; the app that does is ${path.relative(start, parent) || '.'}. Run the command from there, so the theme lands in that app. Nothing was written.`,
          [
            {
              name: `cd ${q(path.relative(start, parent))}`,
              reason: 'do this first',
            },
          ],
          ERROR_CODES.ERR_PROJECT_REQUIRED,
        );
      return start;
    }
    if (path.dirname(dir) === dir) return start;
  }
}

/**
 * Whether the package in `dir` uses Core: it names it in a dependency list
 * (peer included), or already holds editor themes.
 * @param {string} dir
 * @param {any} json its package.json
 */
function usesCore(dir, json) {
  const core = '@astryxdesign/core';
  if (
    ['dependencies', 'devDependencies', 'peerDependencies'].some(
      k => json?.[k]?.[core] != null,
    )
  )
    return true;
  const themes = path.join(dir, 'themes');
  return (
    fs.existsSync(themes) &&
    fs
      .readdirSync(themes)
      .some(t => fs.existsSync(path.join(themes, t, `${t}.settings.json`)))
  );
}

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Where a project's locks are: in its own `node_modules/.cache` (shared by
 * every shell, outside the source tree), else in a temp folder of this
 * user's own (made private), when node_modules cannot be written.
 * @param {string} root
 */
function lockDir(root) {
  const own = path.join(
    root,
    'node_modules',
    '.cache',
    'astryx-theme',
    'locks',
  );
  try {
    if (fs.existsSync(path.join(root, 'node_modules'))) {
      fs.mkdirSync(own, {recursive: true});
      fs.accessSync(own, fs.constants.W_OK);
      return own;
    }
  } catch {
    // Read-only: the temp folder below.
  }
  const user =
    typeof process.getuid === 'function'
      ? String(process.getuid())
      : os.userInfo().username;
  const dir = path.join(os.tmpdir(), `astryx-theme-locks-${user}`);
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  fs.chmodSync(dir, 0o700);
  return dir;
}

/**
 * Whether a lock was left by a command that is no longer running on this
 * machine. A lock from another machine (a shared folder) is taken over
 * only after ten minutes.
 * @param {string} file
 */
function stale(file) {
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (lock.host !== os.hostname())
      return Date.now() - Number(lock.started) > 600_000;
    process.kill(Number(lock.pid), 0);
    return false;
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    // ESRCH: no such process. EPERM: another user's live process.
    if (code === 'ESRCH') return true;
    if (code === 'EPERM') return false;
    // A lock that cannot be read is being written now, or was left by a
    // command stopped while writing it.
    try {
      return Date.now() - fs.statSync(file).mtimeMs > 1000;
    } catch {
      return true;
    }
  }
}

/**
 * Run `fn` holding a lock named `name` for the project at `root`, so two
 * commands on one theme (or one preview) run one after the other: each one
 * reads what the other wrote. The lock is a file in the project's
 * node_modules/.cache (or a private temp folder); a lock left by a command
 * that is no longer running is taken over.
 * @template T
 * @param {string} root
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withLock(root, name, fn) {
  const dir = lockDir(root);
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const file = path.join(dir, `${key}-${name}.lock`);
  const owner = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    started: Date.now(),
    token: Math.random().toString(36).slice(2),
  });
  try {
    for (let waited = 0; ; waited += 50) {
      try {
        fs.writeFileSync(file, owner, {flag: 'wx', mode: 0o600});
        break;
      } catch (e) {
        if (/** @type {any} */ (e).code !== 'EEXIST') throw e;
        if (stale(file)) {
          fs.rmSync(file, {force: true});
          continue;
        }
        if (waited > 30_000)
          throw new AstryxError(
            `Another command is changing ${name.replace(/^theme-/, '')} and did not finish within 30 seconds. Nothing was changed; run this command again.`,
            [],
            ERROR_CODES.ERR_THEME_BUSY,
          );
        await sleep(50);
      }
    }
  } catch (e) {
    if (e instanceof AstryxError) throw e;
    throw new AstryxError(
      `Could not take the lock that keeps two commands on one theme apart (${/** @type {any} */ (e).code ?? String(e)} in ${dir}). Nothing was changed; check that folder, then run the command again.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  // Only this command's own lock is removed, never one another command took.
  const release = () => {
    try {
      if (fs.readFileSync(file, 'utf8') === owner) fs.rmSync(file);
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
    return await fn();
  } finally {
    release();
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
  sweepLeftovers(cwd);
  return {
    ...options,
    cwd,
    ...(options.path != null && options.path !== ''
      ? {path: path.relative(cwd, path.resolve(from, options.path)) || '.'}
      : {}),
  };
}

/**
 * Remove what commands that are no longer running left behind: render
 * folders, load copies and half-written files, each named with the process
 * id that made it.
 * @param {string} root
 */
function sweepLeftovers(root) {
  const dead = (/** @type {string} */ pid) => {
    if (Number(pid) === process.pid) return false;
    try {
      process.kill(Number(pid), 0);
      return false;
    } catch (e) {
      return /** @type {any} */ (e)?.code === 'ESRCH';
    }
  };
  /** @param {string} dir @param {RegExp} pattern */
  const sweep = (dir, pattern) => {
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const m = pattern.exec(name);
      const pid = m?.[1] ?? m?.[2];
      if (pid && dead(pid))
        fs.rmSync(path.join(dir, name), {recursive: true, force: true});
    }
  };
  try {
    const themes = path.join(root, 'themes');
    sweep(themes, /^\.astryx-render-(\d+)-/);
    for (const t of fs.existsSync(themes) ? fs.readdirSync(themes) : [])
      sweep(path.join(themes, t), /(?:\.load-(\d+)-|\.(\d+)\.tmp$)/);
    const cache = path.join(root, 'node_modules', '.cache', 'astryx-theme');
    for (const v of fs.existsSync(cache) ? fs.readdirSync(cache) : [])
      sweep(path.join(cache, v), /\.load-(\d+)-/);
  } catch {
    // A leftover that cannot be removed is no reason to refuse a command.
  }
}

/** @param {any} name */
const lockName = name =>
  `theme-${String(name ?? '')
    .replace(/[^a-z0-9-]/gi, '_')
    .slice(0, 80)}`;

/** @type {typeof edit.themeEditNew} */
export const themeEditNew = (name, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, lockName(name), () => edit.themeEditNew(name, o));
};
/** @type {typeof edit.themeEditSet} */
export const themeEditSet = (theme, thing, value, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, lockName(theme), () =>
    edit.themeEditSet(theme, thing, value, o),
  );
};
/** @type {typeof edit.themeEditUndo} */
export const themeEditUndo = (theme, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, lockName(theme), () => edit.themeEditUndo(theme, o));
};
/** @type {typeof edit.themeEditShow} */
export const themeEditShow = (theme, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, lockName(theme), () => edit.themeEditShow(theme, o));
};
/** @type {typeof preview.themeEditPreviewAdd} */
export const themeEditPreviewAdd = (description, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, 'preview', () =>
    preview.themeEditPreviewAdd(description, o),
  );
};
/** @type {typeof preview.themeEditPreviewList} */
export const themeEditPreviewList = (options = {}) =>
  preview.themeEditPreviewList(atRoot(options));
/** @type {typeof preview.themeEditPreviewRemove} */
export const themeEditPreviewRemove = (page, options = {}) => {
  const o = atRoot(options);
  return withLock(o.cwd, 'preview', () =>
    preview.themeEditPreviewRemove(page, o),
  );
};
