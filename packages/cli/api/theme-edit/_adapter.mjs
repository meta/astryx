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
import {buildSuggestion} from '../theme/build/build.mjs';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import * as edit from './_edit.mjs';
import {baseInstalled, themeCacheRoot} from './_project.mjs';
import * as preview from './_preview-app.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {findPackageRoot} from '../../foundation/fs/paths.mjs';
import {context, coreApp} from './_context.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {withFolderLock} from '../../foundation/release/folder-lock.mjs';
import {
  getCliInvocation,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';
import {LIKE, P} from './_tables.mjs';

/** The preview command, as a person runs it. */
const PREVIEW_WORDS = P.replace(/ editor$/, ' preview');
import {setLine} from './_check.mjs';
import {
  SHOWCASE_GROUPS,
  appCopyBehind,
  appCopyStale,
  copyFontsCss,
  takeFirstAppCopy,
  writeAppCopy,
  writeAppCopyAt,
} from './_preview.mjs';
import {humanWarn} from '../../foundation/response/json.mjs';
import {
  buildColorModes,
  camel,
  folderIsEmpty,
  loadTheme,
  setAfterBuild,
  editedThemes,
  themeFiles,
  typedThemeName,
} from './_settings.mjs';

// Every build of a theme writes its app copy (src/themes/<theme>/).
setAfterBuild(writeAppCopy);
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

/**
 * The base the editor can start a theme from in a project: `slug` when it
 * is a built-in base installed there (the check `new --like` makes), else
 * neutral.
 * @param {string | null | undefined} slug
 * @param {string} cwd
 * @returns {string}
 */
export const editorBaseIn = (slug, cwd) =>
  slug && LIKE.includes(slug) && baseInstalled(cwd, slug) ? slug : 'neutral';

/** The sections `show --section` takes. */
export const showSections = () => [...SHOWCASE_GROUPS];

export {dialValueFits} from './_settings.mjs';

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
  // One rule: the nearest folder at or above cwd whose package.json lists
  // @astryxdesign/core.
  const project = coreApp(start);
  const pkg = findPackageRoot(start);
  const inReach = (/** @type {string} */ dir) =>
    project ? !path.relative(project, dir).startsWith('..') : true;
  if (pkg && inReach(pkg) && pkg !== project) {
    const file = path.join(pkg, 'package.json');
    /** @type {any} */
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      // Name the file and what the parser says is wrong, with its place.
      const rel = path.relative(start, file) || 'package.json';
      const why = String(/** @type {Error} */ (e).message ?? '').replace(
        /^Unexpected token.*?, /,
        '',
      );
      throw new AstryxError(
        `${rel} is not valid JSON (${why}), so the app it belongs to is unknown. Fix it, then run the command again. Nothing was written.`,
        [
          {
            name: `\${EDITOR:-vi} ${quoteCommandArgument(rel)}`,
            reason: 'open the file and fix it',
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
  /**
   * Lines that name project files inside them: `see`, a picture note, the
   * in-app preview's stale entries. Every project path in them (a theme
   * file, an in-app preview folder) is made absolute, one style per line.
   */
  const PROSE = new Set(['see', 'pictureProblem', 'previewStale']);
  /** A project-relative path that names a file or folder there. @param {string} p */
  const inRoot = p => {
    const bare = p.replace(/\/+$/, '');
    return (
      Boolean(bare) &&
      !path.isAbsolute(bare) &&
      !bare.startsWith('.') &&
      fs.existsSync(path.join(root, bare))
    );
  };
  /** @param {any} v @param {string} [key] @returns {any} */
  const map = (v, key) =>
    typeof v === 'string'
      ? // A path alone; a line that starts with one is read as prose below.
        /^themes\/\S*$/.test(v) && !(key && PROSE.has(key))
        ? path.join(root, v)
        : key && PROSE.has(key)
          ? v.replace(
              /(^|[\s(,])((?:themes|src|app)\/[^\s,;)]*)/g,
              (all, before, file) =>
                /^themes\//.test(file) || inRoot(file)
                  ? `${before}${path.join(root, file)}`
                  : all,
            )
          : v
      : Array.isArray(v)
        ? v.map(x => map(x, key))
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, map(x, k)]),
            )
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
  stopTold(
    `a preview change stopped part way is finished by the next ${PREVIEW_WORDS} add, and one written in full stands (${PREVIEW_WORDS} list says which)`,
    () =>
      inProject(options, 'preview', o =>
        preview.themeEditPreviewAdd(description, withThemeLock(o)),
      ),
  );

/**
 * Run a preview command with a stop (Ctrl-C, SIGTERM) heard for its whole
 * run, and after it: the stop ends the process as stopped, with one line
 * saying where the change stands (a change stopped part way is finished by
 * the next preview command), never an ok with exit 0.
 * @template T
 * @param {string} where where the change stands, and what finishes it
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function stopTold(where, fn) {
  const on = (/** @type {NodeJS.Signals} */ sig) => {
    process.removeListener('SIGINT', on);
    process.removeListener('SIGTERM', on);
    process.stderr.write(`Stopped: ${where}.\n`);
    // With no other listener (a lock's, which ends the process itself),
    // the stop ends it here.
    if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
  };
  process.on('SIGINT', on);
  process.on('SIGTERM', on);
  try {
    const r = await fn();
    // A turn of the event loop, so a stop that came while the work ran
    // without a pause is heard now, before the result is printed.
    await new Promise(resolve => setImmediate(resolve));
    return r;
  } finally {
    process.removeListener('SIGINT', on);
    process.removeListener('SIGTERM', on);
  }
}
/**
 * `preview app` runs from the project root, with `dir` kept pointing where
 * it was given. With a theme it holds that theme's lock, since it may build
 * the theme and copies its files: a `set` beside it waits.
 * @type {typeof preview.themeEditPreviewApp}
 */
export const themeEditPreviewApp = async (dir, options = {}) => {
  const from = options.cwd ?? process.cwd();
  return fromHere(
    await stopTold(
      `the new app may be part made; ${PREVIEW_WORDS} app with a new folder name makes a whole one`,
      () =>
        inProject(
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
        ),
    ),
    from,
  );
};
/**
 * A new app's folder and its open line, as they work from where the command
 * ran (`cd ../../theme-app` from src/app), not from the project root.
 * @template T
 * @param {T} r
 * @param {string} from
 * @returns {T}
 */
function fromHere(r, from) {
  const d = /** @type {any} */ (r)?.data;
  if (!d || typeof d.folder !== 'string') return r;
  const root = projectRoot(from);
  if (!root || path.resolve(from) === root) return r;
  const here = path.relative(from, path.join(root, d.folder)) || '.';
  const shown = here.split(path.sep).join('/');
  const cdArg = quoteCommandArgument(
    shown.startsWith('-') ? `./${shown}` : shown,
  );
  return /** @type {T} */ ({
    ...r,
    data: {
      ...d,
      folder: shown,
      ...(typeof d.open === 'string'
        ? {open: d.open.replace(/^cd \S+ &&/, `cd ${cdArg} &&`)}
        : {}),
    },
  });
}
/** @type {typeof preview.themeEditPreviewList} */
export const themeEditPreviewList = (options = {}) =>
  inProject(options, null, async o => preview.themeEditPreviewList(o));
/** @type {typeof preview.themeEditPreviewRemove} */
export const themeEditPreviewRemove = (page, options = {}) =>
  stopTold(
    `a removal stopped part way is finished by the next ${PREVIEW_WORDS} remove, and one made in full stands (${PREVIEW_WORDS} list says which)`,
    () =>
      inProject(options, 'preview', o =>
        preview.themeEditPreviewRemove(page, withThemeLock(o)),
      ),
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
  // A refused compile ends here: its theme locks go now, not at exit, and
  // it writes no app copy (from build files it refused).
  void releaseCompileHold?.(true);
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
  // The command that refused: list, add, use, remove or eject.
  const verb =
    process.argv
      .slice(2)
      .find(a => ['list', 'add', 'use', 'remove', 'eject'].includes(a)) ?? null;
  // eject copies a theme package's source into the app; an editor theme's
  // source is the app's already.
  if (verb === 'eject')
    return new AstryxError(
      `${slug} is a theme the editor made: its source is yours already, themes/${slug}/${slug}.theme.ts (your edits there survive every change), and the editor changes the rest. eject copies a theme package's source into the app, so it has nothing to do for ${slug}.`,
      [
        {
          name: runLine(cwd, `experimental theme editor show ${slug}`),
          reason: 'the theme as it is now',
        },
      ],
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  const copyThere = !folderIsEmpty(path.join(root, LOCAL_THEME_ROOT, slug));
  // A path to the theme ("themes/d", "src/themes/d"): the commands take its
  // name.
  const typed = named ? (named[1] ?? named[2]) : '';
  if (copyThere && verb && typed !== slug)
    return new AstryxError(
      `"${typed}" is ${/[\\/]|\.[a-z]+$/i.test(typed) ? 'a path' : "not the theme's name"}; the theme commands take the theme's name: ${slug}.`,
      [
        {
          name: runLine(cwd, `theme ${verb} ${slug}`),
          reason: 'the same, by name',
        },
      ],
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  // A local theme of that name (a fork in the app's own themes folder) is
  // one the stable commands take: their own message stands.
  // A folder of only system files (or empty) holds no theme: as absent.
  if (copyThere) return null;
  // No app copy yet (a theme made before the editor wrote one, or the
  // copy removed): the next build writes it, then the same steps every
  // place gives (`wiring` of new and show).
  // A one-mode theme's mode is a step too, as in `wiring`.
  /** @type {'light' | 'dark' | 'system'} */
  let mode = 'system';
  try {
    const m = JSON.parse(
      fs.readFileSync(
        path.join(root, 'themes', slug, `${slug}.settings.json`),
        'utf8',
      ),
    ).mode;
    if (m === 'light-only') mode = 'light';
    else if (m === 'dark-only') mode = 'dark';
  } catch {
    // Settings that do not read: both modes.
  }
  const steps = preview.addWiring(root, slug, mode);
  return new AstryxError(
    `${slug} is a theme the editor made (themes/${slug}/), and it has no app copy yet: list, add, use, remove and eject take the copy every build of it writes in src/themes/${slug}/, a standard local theme. Build it once, then: ${steps.join('; ')}.`,
    [
      {
        name: runLine(cwd, `experimental theme editor show ${slug}`),
        reason: `builds it and writes its app copy, src/themes/${slug}/`,
      },
      {
        name: runLine(cwd, `theme add ${slug}`),
        reason: 'then adds it to the app',
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
 * @param {{cwd: string, check?: boolean, family?: boolean, iconsSpecifier?: string, out?: string}} options
 *   `check`, `out` and `iconsSpecifier` are kept in every compile a refusal
 *   suggests
 * @returns {Promise<AstryxError | null>}
 */
export async function editorCompileProblem(
  files,
  {cwd, check, family, iconsSpecifier, out},
) {
  const cwdRoot = projectRoot(cwd);
  const COMPILE = {group: 'experimental theme', build: 'compile'};
  /**
   * The compile of `source` (from `from`) with the caller's mode: a check
   * stays a check, and --out names the same file from there.
   * @param {string} source @param {string} from
   */
  const compileLine = (source, from) =>
    buildSuggestion(
      source,
      {
        check,
        iconsSpecifier,
        out: out
          ? path.relative(from, path.resolve(cwd, out)) || out
          : undefined,
      },
      from,
      COMPILE,
    );
  // An --out into an editor theme's app copy folder: the copy refresh would
  // write the theme's own build over it.
  if (out) {
    // Any --out in the copy folder, the folder itself too, in any case.
    const rel = path
      .relative(cwdRoot, path.resolve(cwd, out))
      .split(path.sep)
      .filter(Boolean)
      .map(x => x.toLowerCase());
    if (
      rel[0] === 'src' &&
      rel[1] === 'themes' &&
      rel.length >= 3 &&
      fs.existsSync(themeFiles(cwdRoot, rel[2]).settings)
    ) {
      const t = rel[2];
      return new AstryxError(
        `--out ${out} is in ${t}'s app copy (src/themes/${t}/), which the editor writes after every build of themes/${t}/; write the build somewhere else.`,
        [
          {
            // The same compile without --out: it builds into themes/<t>/,
            // and the copy follows.
            name: buildSuggestion(
              files.length === 1 ? files[0] : `themes/${t}/${t}.theme.ts`,
              {check, iconsSpecifier},
              cwd,
              COMPILE,
            ),
            reason: 'do this instead',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
  for (const file of files) {
    const abs = path.resolve(cwd, file);
    const relParts = path.relative(cwdRoot, abs).split(path.sep);
    // The app's theme module `theme add` writes: not a theme source.
    if (relParts.join('/') === 'src/astryx-themes.ts')
      return new AstryxError(
        `${file} is the app's theme module (\`theme add\` writes it), not a theme source; compile the editor theme instead.`,
        editedThemes(cwdRoot)
          .slice(0, 3)
          .map(t => ({
            name: compileLine(`themes/${t}/${t}.theme.ts`, cwdRoot),
            reason: 'do this instead',
          })),
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    // A file of an editor theme's app copy (src/themes/<t>/): the copy
    // is written from themes/<t>/, so that is what compiles.
    if (
      relParts[0] === 'src' &&
      relParts[1] === 'themes' &&
      (relParts.length === 3 || relParts.length === 4) &&
      fs.existsSync(themeFiles(cwdRoot, relParts[2]).settings)
    ) {
      const t = relParts[2];
      const own = `themes/${t}/${t}.theme.ts`;
      if (path.resolve(cwd) !== path.resolve(cwdRoot))
        return new AstryxError(
          `${t} is a theme the editor made; compile it from the app root (${path.relative(cwd, cwdRoot) || '.'}), where the editor builds it.`,
          [
            {
              name: `cd ${quoteCommandArgument(path.relative(cwd, cwdRoot) || '.')} && ${compileLine(own, cwdRoot)}`,
              reason: 'do this instead',
            },
          ],
          ERROR_CODES.ERR_INVALID_ARGUMENT,
        );
      // Its source too: a compile of the copy builds neither the theme
      // nor a current copy.
      return new AstryxError(
        `${file} is ${relParts.length === 3 ? '' : 'part of '}${t}'s app copy, which the editor writes from themes/${t}/ after every build; compile the theme itself.`,
        [
          {name: compileLine(own, cwd), reason: 'do this instead'},
          {
            name: runLine(cwdRoot, `experimental theme editor show ${t}`),
            reason: 'writes the app copy again from the theme',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const at = editorThemeAt(cwdRoot, abs);
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
            name: `cd ${quoteCommandArgument(path.relative(cwd, root) || '.')} && ${compileLine(source, root)}`,
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
            name: compileLine(
              path.relative(cwd, path.join(root, source)) || source,
              cwd,
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
            name: compileLine(
              path.relative(cwd, path.join(root, source)) || source,
              cwd,
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
      // Saved settings the editor no longer accepts: show refuses them too,
      // so the refusal names the undo that removes each.
      if (why) {
        const stored = await edit.editorStoredRefusal(root, slug);
        if (stored) return stored;
      }
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
      // A [light, dark] pair on a token that is not a color, however the
      // file writes it: what the theme builds now is read (never written
      // beside it), as the editor's own build reads it.
      if (path.basename(file) === `${slug}.theme.ts`) {
        const pairs = await edit.editorPairRefusal(root, slug);
        if (pairs) return pairs;
        // A token value the file gives that set refuses ships as it is.
        const values = await edit.editorOwnTokenRefusal(root, slug);
        if (values) return values;
      }
    }
  }
  return null;
}

/** The editor themes a running `compile` holds the lock of, by project and name. */
const COMPILE_HELD = new Set();

/** @type {((refused?: boolean) => Promise<void>) | null} The release of the running compile's hold; `refused`: it wrote nothing, so no app copy either. */
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
    // The app copy's source (src/themes/<t>/<t>Theme.ts) of an editor
    // theme: built under the theme's lock, so it never lands between a
    // change's two writes.
    const copy = appCopyTheme(cwdRoot, path.resolve(cwd, f));
    if (copy) found.set(`${copy.root}\0${copy.slug}`, copy);
  }
  const themes = [...found.keys()].sort().map(k => found.get(k));
  /** @type {Array<{copy: (refused: boolean) => boolean, finish: (later: boolean) => Promise<void>}>} */
  const releases = [];
  // Every theme's copy is written first, at once (a refusal ends the run
  // without waiting), then each lock goes.
  const releaseAll = async (refused = false) => {
    if (releaseCompileHold === releaseAll) releaseCompileHold = null;
    const items = releases.splice(0);
    const later = items.map(x => x.copy(refused));
    for (const [i, x] of [...items.entries()].reverse())
      await x.finish(later[i]);
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
    // When the lock was taken, and the context a copy write needs (its
    // font stylesheets), ready before the build so the copy is written at
    // once when the run ends.
    const heldAt = Date.now() - 1;
    /** @type {any} */
    let copyCtx = null;
    try {
      copyCtx = await context(root);
    } catch {
      copyCtx = null;
    }
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
    releases.push({
      // A compile that wrote the build refreshes the app's copy too
      // (src/themes/<theme>/), under the same lock; a check writes
      // nothing. Each theme's copy follows its own build: a theme this run
      // built (its build now matches its settings) gets its copy, whatever
      // a later theme did; one that was refused or failed keeps its copy.
      // True when the copy still needs its font stylesheet from the
      // theme's settings (written in finish).
      copy: (/** @type {boolean} */ refused) => {
        if (process.argv.includes('--check')) return false;
        // This run built the theme: its outputs were written since the
        // lock was taken, or the run ended well. A refused or failed
        // compile writes no copy.
        const f = themeFiles(root, slug);
        const written = [f.css, f.js].some(x => {
          try {
            return fs.statSync(x).mtimeMs >= heldAt;
          } catch {
            return false;
          }
        });
        if (!written && (refused || (process.exitCode ?? 0) !== 0))
          return false;
        try {
          // From what was just built, its font stylesheets from the fonts
          // the theme loads now.
          if (copyCtx) writeAppCopy(copyCtx, slug, loadTheme(root, slug));
          else writeAppCopyAt(root, slug, null);
        } catch {
          try {
            writeAppCopyAt(root, slug, null);
          } catch {
            // A theme that does not load keeps its copy as it was.
          }
        }
        return false;
      },
      finish: async () => {
        if (!process.argv.includes('--check')) {
          // The first write of the app copy is named once (the compile's
          // own JSON envelope is the stable command's).
          const wrote = takeFirstAppCopy(root, slug);
          if (wrote)
            humanWarn(
              `wrote ${slug}'s app copy, a local theme \`theme add ${slug}\` takes, written again after every build: ${wrote.join(', ')}`,
            );
          // A copy a file or a link keeps behind, or one that could not be
          // written, is said, as set and show say it.
          const stale = appCopyStale(root, slug).appCopyStale;
          if (stale) humanWarn(stale);
        }
        release();
        await done;
      },
    });
  }
  return releaseAll;
}

/**
 * The editor theme whose app copy source a file is
 * (`src/themes/<t>/<t>Theme.ts`, with themes/<t>/ an editor theme), or
 * null.
 * @param {string} root the project root
 * @param {string} file absolute
 * @returns {{root: string, slug: string} | null}
 */
function appCopyTheme(root, file) {
  const rel = path.relative(root, file).split(path.sep);
  if (rel.length !== 4 || rel[0] !== 'src' || rel[1] !== 'themes') return null;
  const slug = rel[2];
  if (rel[3] !== `${camel(slug)}Theme.ts`) return null;
  return fs.existsSync(themeFiles(root, slug).settings) ? {root, slug} : null;
}

/**
 * For `compile` of an editor theme: `appCopyStale` for its result data when
 * the app copy is behind (the same line set and show give); null for any
 * other file or a current copy.
 * @param {string} file the path as given
 * @param {string} cwd
 * @param {{check: boolean, upToDate?: boolean}} opts `upToDate`: the
 *   check's own verdict on the theme's outputs
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function editorBuildExtra(file, cwd, opts) {
  const root = projectRoot(cwd);
  const abs = path.resolve(cwd, file);
  const own = editorThemeAt(root, abs);
  const slug =
    appCopyTheme(root, abs)?.slug ??
    (own && editorOwnFile(own.slug, file) ? own.slug : null);
  if (!slug) return null;
  if (opts.check) {
    // A theme output that is stale is the check's own finding (it names
    // the file); the copy is compared only with a current build.
    if (opts.upToDate === false) return null;
    /** @type {string[] | null} */
    let fonts;
    try {
      fonts = copyFontsCss(await context(root), slug, loadTheme(root, slug));
    } catch {
      fonts = null;
    }
    const behind = appCopyBehind(root, slug, fonts);
    return behind
      ? {
          upToDate: false,
          code: 'ERR_THEME_STALE',
          appCopyStale: `${slug}'s app copy in src/themes/${slug}/ is not up to date: ${behind}. ${runLine(root, `experimental theme editor show ${slug}`)} writes it again`,
        }
      : null;
  }
  const stale = appCopyStale(root, slug).appCopyStale;
  return stale ? {appCopyStale: stale} : null;
}

/**
 * For `compile` of an editor theme's own source (themes/<t>/<t>.theme.ts):
 * the one color mode a light-only or dark-only theme has, which its source
 * cannot say, for the build to write into the built module. Null for any
 * other file (the app copy's source re-exports it from its build).
 * @param {string} file the path as given
 * @param {string} cwd
 * @returns {['light'] | ['dark'] | null}
 */
export function editorColorModes(file, cwd) {
  const root = projectRoot(cwd);
  const at = editorThemeAt(root, path.resolve(cwd, file));
  if (!at || path.basename(file) !== `${at.slug}.theme.ts`) return null;
  return buildColorModes(at.root, at.slug);
}

/**
 * For `compile` of an editor theme (themes/<t>/ or its app copy's source):
 * whether a font family is loaded by the app copy's font stylesheet
 * (src/themes/<t>/<t>.fonts.css: an @fontsource package by its name, a
 * stylesheet by the `family=` it requests), so the build's "named but not
 * loaded" notice leaves it out. Null for any other file.
 * @param {string} file the path as given
 * @param {string} cwd
 * @returns {((family: string) => boolean) | null}
 */
export function editorLoadedFonts(file, cwd) {
  const root = projectRoot(cwd);
  const abs = path.resolve(cwd, file);
  const slug =
    appCopyTheme(root, abs)?.slug ??
    (editorThemeAt(root, abs) &&
    editorOwnFile(editorThemeAt(root, abs)?.slug ?? '', file)
      ? editorThemeAt(root, abs)?.slug
      : null);
  if (!slug) return null;
  /** @param {string} s */
  const key = s =>
    String(s)
      .replace(/["']/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  /** @type {Set<string>} */
  const loaded = new Set();
  /** @type {string} */
  let text;
  try {
    text = fs.readFileSync(
      path.join(root, 'src', 'themes', slug, `${slug}.fonts.css`),
      'utf8',
    );
  } catch {
    return null;
  }
  const req = createRequire(path.join(root, 'package.json'));
  for (const m of text.matchAll(/@import\s+"([^"]+)"/g)) {
    const spec = m[1];
    const pkg = /^@fontsource(?:-variable)?\/([^/]+)/.exec(spec);
    if (pkg) {
      loaded.add(key(pkg[1]));
      continue;
    }
    try {
      const css = fs.readFileSync(req.resolve(spec), 'utf8');
      for (const f of css.matchAll(/family=([^:&'")]+)/g))
        loaded.add(key(decodeURIComponent(f[1].replace(/\+/g, ' '))));
    } catch {
      // A stylesheet that cannot be read loads nothing known here.
    }
  }
  return family => loaded.has(key(family));
}

/**
 * For `compile` of a file that is not there: when it is an editor theme's
 * own source (`themes/<t>/<t>.theme.ts` beside its settings), the command
 * that writes it again; null otherwise.
 * @param {string} file the path as given
 * @param {string} cwd
 * @returns {{name: string, reason: string} | null}
 */
export function editorMissingSource(file, cwd) {
  // The app copy's source of an editor theme, its folder gone: the editor
  // writes it again.
  const copy = appCopyTheme(projectRoot(cwd), path.resolve(cwd, file));
  if (copy)
    return {
      name: runLine(cwd, `experimental theme editor show ${copy.slug}`),
      reason: `the editor writes ${copy.slug}'s app copy in src/themes/${copy.slug}/ again`,
    };
  const at = editorThemeAt(projectRoot(cwd), path.resolve(cwd, file));
  if (!at || path.basename(file) !== `${at.slug}.theme.ts`) return null;
  return {
    name: runLine(cwd, `experimental theme editor show ${at.slug}`),
    reason: `the editor writes ${at.slug}.theme.ts again from its settings`,
  };
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
