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

import {writeThemeTemplate} from '../theme/template/template.mjs';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as edit from './_edit.mjs';
import {themeCacheRoot} from './_project.mjs';
import * as preview from './_preview-app.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  findAstryxProject,
  findPackageRoot,
} from '../../foundation/fs/paths.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {withFolderLock} from '../../foundation/release/folder-lock.mjs';
import {
  getCliInvocation,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {DIALS, LIKE, P} from './_tables.mjs';
import {setLine} from './_check.mjs';
import {colorProblem} from './_color.mjs';
import {SHOWCASE_GROUPS} from './_preview.mjs';
import {camel, typedThemeName} from './_settings.mjs';
import {LOCAL_THEME_ROOT} from '../../foundation/config/theme-state.mjs';

export {parsePoints} from './_how.mjs';
export {newFlagList} from './_edit.mjs';
import {themeEditHow as howAt} from './_how.mjs';

/**
 * `how`, run at the project root like the other editor commands, so a
 * subfolder finds the app's themes. A picture named from the subfolder
 * keeps pointing where it was named.
 * @param {string} subject
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  const from = options.cwd ?? process.cwd();
  const o = atRoot(options);
  /** A file named from the subfolder, as a path from anywhere. @param {unknown} name */
  const here = name =>
    typeof name === 'string' &&
    name !== '' &&
    !path.isAbsolute(name) &&
    path.resolve(from) !== o.cwd &&
    fs.existsSync(path.resolve(from, name)) &&
    fs.statSync(path.resolve(from, name)).isFile()
      ? path.resolve(from, name)
      : name;
  // The CLI passes the words as typed: the first may be that picture too.
  const words = o.words?.length
    ? [String(here(o.words[0])), ...o.words.slice(1)]
    : o.words;
  return howAt(/** @type {string} */ (here(subject)), {
    ...o,
    ...(words ? {words} : {}),
  });
}

/** The built-in themes a theme can build on (`--like`). */
export const builtInThemes = () => [...LIKE];

/** The sections `show --section` takes. */
export const showSections = () => [...SHOWCASE_GROUPS];

/**
 * Whether a value fits what a dial takes, read from the dial's own list of
 * values: a named rung in any case, or a value of the kind it names (a size,
 * a color, a number). `set` still checks the value in full.
 * @param {string} dial
 * @param {string} value
 */
export function dialValueFits(dial, value) {
  const spec = DIALS[/** @type {keyof typeof DIALS} */ (dial)]?.values;
  if (!spec) return false;
  const v = String(value).trim();
  if (v === '') return false;
  return spec.split('|').some(option => {
    if (!option.startsWith('<') && !option.startsWith('"'))
      return option === v.toLowerCase();
    if (option.startsWith('"')) return true;
    if (option.includes('size')) return /^\d*\.?\d+(px|rem|em)$/.test(v);
    // A color by the editor's own color check (a bare word only when it
    // names a color).
    if (option === '<color>') return colorProblem(v) == null;
    if (option === '<0-100>') return /^\d{1,3}$/.test(v) && Number(v) <= 100;
    if (option === '<number>') return /^\d*\.?\d+$/.test(v);
    return false;
  });
}

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
        [
          {
            name: runLine(start, 'doctor'),
            reason: 'names the file and what is wrong in it',
          },
        ],
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
  const cache = themeCacheRoot(root);
  if (!cache) return null;
  const dir = path.join(cache, 'locks');
  try {
    fs.mkdirSync(dir, {recursive: true});
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch (e) {
    throw new AstryxError(
      `Could not write ${path.relative(root, dir)} (${/** @type {any} */ (e).code ?? String(e)}), where the lock that keeps two commands on one theme apart is kept. Fix its permission, then run the command again. Nothing was changed.`,
      [
        {
          name: `ls -ld ${quoteCommandArgument(dir)}`,
          reason: 'see who owns the lock folder',
        },
      ],
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
 * @param {string | null} [again] the command's own words after the CLI
 *   name, to suggest running it again (never the host process's argv: an
 *   API caller is not a CLI run)
 * @returns {Promise<T>}
 */
async function withLock(root, name, fn, bestEffort = false, again = null) {
  // A preview command, which holds the preview lock, suggests the list of
  // previews (what the other command may be changing).
  again ??= name === 'preview' ? 'experimental theme preview list' : null;
  /** @type {string | null} */
  let dir;
  try {
    dir = lockDir(root);
  } catch (e) {
    if (bestEffort) return fn(false);
    throw e;
  }
  if (!dir) return fn(true);
  // The lock is named for the project as seen from the lock folder (which
  // lives in the project's own node_modules), not by the path this command
  // was given: one project reached through two paths (a bind mount, a
  // devcontainer) has one lock.
  /** @param {string} p */
  const real = p => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const key = createHash('sha256')
    .update(path.relative(real(dir), real(root)).split(path.sep).join('/'))
    .digest('hex')
    .slice(0, 16);
  const lock = path.join(dir, `${key}-${name}.lock`);
  // The release cache's lock, held with its lease while the command runs
  // (foundation/release/folder-lock.mjs). A lock naming this pid is never
  // taken over on that ground alone: two containers on one checkout can
  // both be pid 1.
  let started = false;
  try {
    return await withFolderLock(
      lock,
      async () => {
        started = true;
        return fn(true);
      },
      {
        onBusy: (o, held) => {
          throw new AstryxError(
            `Another command has been changing ${name.replace(/^theme-/, '')} for 30 seconds${o ? ` (process ${o.pid} on ${o.host}${held != null ? `, holding it ${held} s` : ''})` : ''}. Nothing was changed; run this command again once the other one ends. If no astryx command is running, the lock is left from one that stopped: remove the folder ${lock}.`,
            // Every editor command (show too) takes this lock, so none of
            // them works meanwhile: this same command, once the other ends.
            again
              ? [
                  {
                    name: runLine(root, again),
                    reason: 'run it again once the other command ends',
                  },
                ]
              : [],
            ERROR_CODES.ERR_THEME_BUSY,
          );
        },
      },
    );
  } catch (e) {
    if (e instanceof AstryxError) throw e;
    const code = /** @type {any} */ (e)?.code;
    if (!started) {
      if (bestEffort) return fn(false);
      throw new AstryxError(
        `Could not take the lock ${lock} (${code ?? String(e)}). Nothing was changed; fix the folder, then run the command again.`,
        [
          {
            name: `ls -ld ${quoteCommandArgument(path.dirname(lock))}`,
            reason: 'see who owns the lock folder',
          },
        ],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
    // A folder that cannot be written (no permission, a full or read-only
    // disk) is a documented refusal, not a crash.
    if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'EIO'].includes(code))
      throw new AstryxError(
        `Could not write ${path.relative(root, /** @type {any} */ (e).path ?? '') || 'the theme files'}: ${code === 'ENOSPC' ? 'the disk is full' : code === 'EROFS' ? 'the disk is read-only' : code === 'EIO' ? 'the disk could not be read or written' : 'no permission'}. ${code === 'EROFS' ? 'Make the folder writable' : code === 'EIO' ? 'Check the disk' : 'Free the space or fix the permission'}, then run the command again; a refused change is undone.`,
        [
          {
            name: `ls -ld ${quoteCommandArgument(path.dirname(/** @type {any} */ (e).path ?? path.join(root, 'themes', 'x')))}`,
            reason: 'see who owns the folder and whether it is writable',
          },
        ],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    throw e;
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
 * @param {boolean} [bestEffort]
 * @param {string | null} [again] the command's own words, for a busy lock
 * @returns {Promise<T>}
 */
async function inProject(options, lock, fn, bestEffort = false, again = null) {
  const from = options.cwd ?? process.cwd();
  const o = atRoot(options);
  try {
    // Without the lock (it cannot be taken), a read-only command writes
    // nothing.
    const r = lock
      ? await withLock(
          o.cwd,
          lock,
          locked => fn(locked ? o : {...o, readOnly: true}),
          bestEffort,
          again,
        )
      : await fn(o);
    return absolute(r, o.cwd, from);
  } catch (e) {
    throw fromCaller(e, o.cwd, from);
  }
}

/**
 * A refusal whose suggested preview commands name folders as the person
 * types them where they ran the command: a `--path` and a `preview app`
 * folder, read from the project root, are written from the caller's
 * folder.
 * @param {any} e
 * @param {string} root
 * @param {string} from
 */
function fromCaller(e, root, from) {
  if (path.resolve(from) === root || !Array.isArray(e?.suggestions)) return e;
  const ARG = String.raw`('(?:[^']|'\\'')*'|"[^"]*"|[^\s'"]+)`;
  /** @param {string} v */
  const unquote = v =>
    v.startsWith("'")
      ? v.slice(1, -1).replace(/'\\''/g, "'")
      : v.startsWith('"')
        ? v.slice(1, -1)
        : v;
  /** @param {string} v */
  const rel = v =>
    /^<.*>$/.test(v)
      ? v
      : quoteCommandArgument(
          path.relative(path.resolve(from), path.resolve(root, unquote(v))) ||
            '.',
        );
  for (const s of e.suggestions) {
    if (typeof s?.name !== 'string') continue;
    if (!s.name.startsWith('astryx experimental theme preview ')) continue;
    s.name = s.name
      .replace(
        new RegExp(`(--path )${ARG}`, 'g'),
        (
          /** @type {string} */ _m,
          /** @type {string} */ flag,
          /** @type {string} */ v,
        ) => flag + rel(v),
      )
      .replace(
        new RegExp(`^(astryx experimental theme preview app )${ARG}`),
        (
          /** @type {string} */ _m,
          /** @type {string} */ cmd,
          /** @type {string} */ v,
        ) => cmd + rel(v),
      );
  }
  return e;
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

/**
 * A command's own words after the CLI name, from what it was called with,
 * every option kept: set and undo as `set` writes them (scope flags and
 * --only), new with --like and each dial, --png where given.
 * @param {string} line a command as the editor writes one (`astryx …`)
 * @param {{png?: boolean}} [o]
 */
const words = (line, o = {}) =>
  `${line.replace(/^astryx /, '').trimEnd()}${o.png ? ' --png' : ''}`;

/** @type {typeof edit.themeEditNew} */
export const themeEditNew = (name, options = {}) =>
  inProject(
    options,
    lockName(name),
    o => edit.themeEditNew(name, o),
    false,
    words(
      `${P} new ${quoteCommandArgument(name)} ${edit
        .newFlagList(
          options.like,
          options.settings ?? {},
          /** @type {boolean} */ (options.png),
        )
        .join(' ')}`,
    ),
  );
/** @type {typeof edit.themeEditSet} */
export const themeEditSet = (theme, thing, value, options = {}) =>
  inProject(
    options,
    lockName(theme),
    o => edit.themeEditSet(theme, thing, value, o),
    false,
    words(setLine(theme, thing, value, options), options),
  );
/** @type {typeof edit.themeEditUndo} */
export const themeEditUndo = (theme, options = {}) =>
  inProject(
    options,
    lockName(theme),
    o => edit.themeEditUndo(theme, o),
    false,
    words(
      options.thing
        ? setLine(
            theme,
            options.thing,
            /** @type {string} */ (options.value ?? ''),
            options,
            true,
          )
        : `${P} undo ${theme}`,
      options,
    ),
  );
/** @type {typeof edit.themeEditShow} */
export const themeEditShow = (theme, options = {}) =>
  inProject(
    options,
    lockName(theme),
    o => edit.themeEditShow(theme, o),
    true,
    words(
      `${P} show ${theme}${options.section ? ` --section ${quoteCommandArgument(String(options.section))}` : ''}`,
      options,
    ),
  );
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
 * The editor theme a path or a name names, with its project, or null: a
 * name is a theme in `root`'s themes/ folder; a path is one in the themes/
 * folder of the project the file belongs to (found from the file, so a
 * path from another folder still names it, and a `src/themes/<slug>` fork
 * does not).
 * @param {string} root
 * @param {string} word a path or a name
 * @returns {{root: string, slug: string} | null}
 */
function editorThemeAt(root, word) {
  const has = (/** @type {string} */ r, /** @type {string} */ slug) =>
    fs.existsSync(path.join(r, 'themes', slug, `${slug}.settings.json`));
  if (/^[a-z][a-z0-9-]*$/.test(word))
    return has(root, word) ? {root, slug: word} : null;
  // Through a link, the real path decides (a linked theme folder is the
  // same folder).
  /** @type {string} */
  let abs = path.resolve(root, word);
  try {
    abs = fs.realpathSync(abs);
  } catch {
    try {
      abs = path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
    } catch {
      // Not there: the path as given.
    }
  }
  // The folder above the last themes/<slug>/ in the path, when that folder
  // is a project's root (src/themes/<slug> is not: its project is above).
  const m = /^(.*)[\\/]themes[\\/]([a-z][a-z0-9-]*)(?:[\\/]|$)/.exec(abs);
  if (!m || !has(m[1], m[2])) return null;
  /** @type {string} */
  let top;
  try {
    top = projectRoot(m[1]);
  } catch {
    top = m[1];
  }
  return path.resolve(top) === path.resolve(m[1])
    ? {root: m[1], slug: m[2]}
    : null;
}

/**
 * Whether a file in an editor theme's folder is one of the editor's own
 * (its theme source or settings), which the editor guards; another file
 * there (a template written into the folder) is compiled as any file.
 * @param {string} slug
 * @param {string} file
 */
function editorOwnFile(slug, file) {
  return [
    `${slug}.theme.ts`,
    `${slug}.settings.ts`,
    `${slug}.settings.json`,
  ].includes(path.basename(file));
}

/**
 * The editor theme a path or name names in `root`, or null.
 * @param {string} root
 * @param {string} word
 */
function editorThemeOf(root, word) {
  return editorThemeAt(root, word)?.slug ?? null;
}

/**
 * A suggested command, started the way this project runs the CLI.
 * @param {string} cwd
 * @param {string} rest the words after `astryx`
 */
function runLine(cwd, rest) {
  return `${getCliInvocation(cwd)} ${rest}`;
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
  // A refused compile ends here: its theme locks go now, not at exit.
  void releaseCompileHold?.();
  if (
    err.code !== ERROR_CODES.ERR_UNKNOWN_THEME &&
    !/unknown theme|is not added|not a theme package/i.test(err.message)
  )
    return null;
  const root = projectRoot(cwd);
  // The name as typed, read the way the editor reads a theme name: a path
  // to its folder or a file in it, in any case, names the theme.
  const named = /"([^"]+)"|'([^']+)'/.exec(err.message);
  const word = named ? typedThemeName(named[1] ?? named[2]) : '';
  const slug = word ? editorThemeOf(root, word) : null;
  if (!slug) return null;
  // A local theme of that name (a fork in the app's own themes folder) is
  // one the stable commands take: their own message stands.
  if (fs.existsSync(path.join(root, LOCAL_THEME_ROOT, slug))) return null;
  const id = `${camel(slug)}Theme`;
  const key = /^[a-z][a-z0-9]*$/i.test(slug) ? slug : JSON.stringify(slug);
  // The paths from the folder of the app's generated themes module (where
  // a file that merges themes sits), else from the app root.
  const generated = path.join(root, 'src', 'astryx-themes.ts');
  const from = fs.existsSync(generated) ? path.dirname(generated) : root;
  let rel = path
    .relative(from, path.join(root, 'themes', slug))
    .split(path.sep)
    .join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const where =
    from === root
      ? 'in a file of your own at the app root'
      : `in a file of your own beside ${path.relative(root, generated).split(path.sep).join('/')} (from another folder, change the paths to match)`;
  return new AstryxError(
    `${slug} is a theme the editor made (themes/${slug}/), not a theme package, so list, add, use, remove and eject do not take it. To use it, import its module and its stylesheet ${where} (import {${id}} from '${rel}/${slug}.js'; import '${rel}/${slug}.css';) and merge it into the themes there ({...themes, ${key}: ${id}}); do not add it to src/astryx-themes.ts, which add, use and remove write again. Change it with the editor.`,
    [
      {
        name: runLine(cwd, `experimental theme editor show ${slug}`),
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
  const cwdRoot = projectRoot(cwd);
  for (const file of files) {
    const at = editorThemeAt(cwdRoot, path.resolve(cwd, file));
    if (!at || !editorOwnFile(at.slug, file)) continue;
    const {root, slug} = at;
    const source = `themes/${slug}/${slug}.theme.ts`;
    // An editor theme is built from its project's root, as every editor
    // command runs there: from a subfolder the build would write outside
    // its working folder. The run names the root.
    if (path.resolve(cwd) !== path.resolve(root))
      return new AstryxError(
        `${slug} is a theme the editor made; compile it from the app root (${path.relative(cwd, root) || '.'}), where the editor builds it.`,
        [
          {
            name: `cd ${quoteCommandArgument(path.relative(cwd, root) || '.')} && ${runLine(root, `experimental theme compile ${source}${check ? ' --check' : ''}`)}`,
            reason: 'do this instead',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    if (/\.settings\.(ts|json)$/.test(file))
      return new AstryxError(
        `${file} is the editor's own settings for ${slug}, not a theme source; compile the theme source.`,
        [
          {
            name: runLine(
              cwd,
              `experimental theme compile ${quoteCommandArgument(path.relative(cwd, path.join(root, source)) || source)}`,
            ),
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
            name: runLine(
              cwd,
              `experimental theme compile ${quoteCommandArgument(path.relative(cwd, path.join(root, source)) || source)}`,
            ),
            reason: 'do this instead',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    {
      // A check waits for a change in progress, so it never reads one half
      // written. A plain compile builds the theme source, which reads the
      // generated settings: when those no longer match the settings, it
      // would report ok without them.
      // `compile` holds the lock already while it runs (editorThemeHold).
      /** @type {string | null} */
      let why;
      try {
        why = COMPILE_HELD.has(`${root}\0${slug}`)
          ? await edit.editorStale(root, slug)
          : await withLock(root, lockName(slug), () =>
              edit.editorStale(root, slug),
            );
      } catch (e) {
        // A settings file damaged by hand is refused like any refusal,
        // never as a raw error.
        if (e instanceof AstryxError) return e;
        throw e;
      }
      // An own change to the theme source is what compile builds (and what
      // --check compares): never a reason to refuse it.
      if (
        why &&
        /\.theme\.ts (or a module it imports )?changed since the last build$/.test(
          why,
        )
      )
        why = null;
      // A missing built output is one compile writes itself.
      if (
        why &&
        !check &&
        /^[^/]+\.(css|js|d\.ts|css\.d\.ts) was missing$/.test(why)
      )
        why = null;
      if (why && !check)
        return new AstryxError(
          `${slug}'s generated settings do not match its settings (${why}), so compile would build the old ones. The editor builds it from its settings.`,
          [
            {
              name: runLine(cwd, `experimental theme editor show ${slug}`),
              reason: 'do this instead',
            },
          ],
          ERROR_CODES.ERR_THEME_INVALID,
        );
      if (why)
        return new AstryxError(
          `${slug} is not up to date: ${why}. The editor builds it again from its settings.`,
          [
            {
              name: runLine(cwd, `experimental theme editor show ${slug}`),
              reason: 'build it again',
            },
          ],
          ERROR_CODES.ERR_THEME_INVALID,
        );
    }
  }
  return null;
}

/** The editor themes a running `compile` holds the lock of, by project and name. */
const COMPILE_HELD = new Set();

/** @type {(() => Promise<void>) | null} The release of the running compile's hold. */
let releaseCompileHold = null;

/**
 * Hold the theme lock of every editor theme among the files while
 * `compile` builds or checks them, so it never reads a change half
 * written. Resolves to the release.
 * @param {string[]} files
 * @param {{cwd: string}} options
 * @returns {Promise<() => Promise<void>>}
 */
export async function editorThemeHold(files, {cwd}) {
  // Two compiles of one theme in one process: the second waits for the
  // lock like any other command.
  const cwdRoot = projectRoot(cwd);
  const found = new Map();
  for (const f of files) {
    const at = editorThemeAt(cwdRoot, path.resolve(cwd, f));
    if (at && editorOwnFile(at.slug, f))
      found.set(`${at.root}\0${at.slug}`, at);
  }
  const themes = [...found.keys()].sort().map(k => found.get(k));
  /** @type {Array<() => Promise<void>>} */
  const releases = [];
  const releaseAll = async () => {
    if (releaseCompileHold === releaseAll) releaseCompileHold = null;
    for (const r of releases.splice(0).reverse()) await r();
  };
  releaseCompileHold = releaseAll;
  for (const {
    root,
    slug,
  } of /** @type {Array<{root: string, slug: string}>} */ (themes)) {
    /** @type {() => void} */
    let release = () => {};
    const held = new Promise(r => {
      release = () => r(undefined);
    });
    /** @type {(e?: unknown) => void} */
    let ready = () => {};
    const got = new Promise(r => {
      ready = r;
    });
    const key = `${root}\0${slug}`;
    const done = withLock(root, lockName(slug), async () => {
      COMPILE_HELD.add(key);
      ready();
      try {
        await held;
      } finally {
        COMPILE_HELD.delete(key);
      }
    }).catch(e => ready(e));
    const err = await got;
    if (err) {
      await releaseAll();
      throw err;
    }
    releases.push(async () => {
      release();
      await done;
    });
  }
  return releaseAll;
}

/**
 * `theme template` for the experimental command: in a folder the theme
 * editor made, only the editor's own files are protected.
 * @param {{targetPath?: string, overwrite?: boolean, cwd?: string}} options
 * @returns {import('../theme/theme.type.mjs').ThemeTemplateResponse}
 */
export function editorThemeTemplate(options) {
  return writeThemeTemplate(options, true);
}
