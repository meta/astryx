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

export {themeEditHow, parsePoints} from './_how.mjs';
export const {themeEditPreviewApp} = preview;

/**
 * The project a command acts on: the nearest folder at or above `cwd` whose
 * package.json depends on Core, else `cwd` itself. Run from a subfolder of
 * an app, a command still finds the app's themes; it never moves to a
 * folder that does not declare Core.
 * @param {string} cwd
 */
export function projectRoot(cwd) {
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    const pkg = path.join(d, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (
          json.dependencies?.['@astryxdesign/core'] ||
          json.devDependencies?.['@astryxdesign/core']
        )
          return d;
      } catch {
        // A damaged package.json is not the project.
      }
    }
    if (path.dirname(d) === d) return path.resolve(cwd);
  }
}

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run `fn` holding a lock named `name` for the project at `root`, so two
 * commands on one theme (or one preview) run one after the other: each one
 * reads what the other wrote. The lock is a file in the system temp folder,
 * never in the project; one older than two minutes is left over from a stopped command and is taken over.
 * @template T
 * @param {string} root
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withLock(root, name, fn) {
  const dir = path.join(os.tmpdir(), 'astryx-theme-locks');
  fs.mkdirSync(dir, {recursive: true});
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const file = path.join(dir, `${key}-${name}.lock`);
  for (let waited = 0; ; waited += 50) {
    try {
      fs.writeFileSync(file, String(process.pid), {flag: 'wx'});
      break;
    } catch (e) {
      if (/** @type {any} */ (e).code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > 120_000) fs.rmSync(file);
      } catch {
        // Released meanwhile.
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
  const release = () => fs.rmSync(file, {force: true});
  process.once('exit', release);
  try {
    return await fn();
  } finally {
    release();
    process.removeListener('exit', release);
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
