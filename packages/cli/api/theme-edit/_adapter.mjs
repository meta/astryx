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

export {themeEditHow, parsePoints} from './_how.mjs';
export const {themeEditPreviewApp} = preview;

/**
 * The project a command acts on: the Astryx project at or above `cwd` (the
 * same walk `upgrade` uses), else `cwd` itself. Run from a subfolder of an
 * app, a command still finds the app's themes.
 * @param {string} cwd
 */
export function projectRoot(cwd) {
  return findAstryxProject(cwd) ?? path.resolve(cwd);
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
