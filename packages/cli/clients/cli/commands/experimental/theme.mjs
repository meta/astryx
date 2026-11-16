// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme` — the `editor` group makes and changes a
 * theme one checked change at a time; beside it sit experimental copies of
 * the theme commands. Experimental (spec:AST-017 FR27): it is registered only
 * under the `experimental` group.
 *
 * The command surface comes from the colocated CommandDocs via
 * `defineCommand`; this file reads flags, calls the theme-edit API, and
 * prints its receipt.
 *
 * Usage:
 *   astryx experimental theme editor new brand --like neutral
 *   astryx experimental theme editor set brand corners pill
 *   astryx experimental theme editor how "white text in the banner"
 */

import {getCliInvocation} from '../../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../../foundation/response/json.mjs';
import {levenshteinDistance} from '../../../../foundation/text/levenshtein.mjs';
import {NO_RESULT_SET, resultSet} from '../../../../foundation/debug/index.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {
  emit,
  list,
  record,
  records,
  section,
  text,
} from '../../formatters/index.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {
  editorMissingArgument,
  setFreeArgument,
  setEditorThemeList,
  setUnknownOptionReader,
} from '../../lib/json-shim.mjs';
import {AstryxError} from '../../../../api/error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {
  themeEditHow,
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewList,
  themeEditPreviewRemove,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from '../../../../api/theme-edit/theme-edit.mjs';
import {
  builtInThemes,
  dialValueFits,
  modeDialValue,
  newFlagList,
  editorCheckedLine,
  editorCheckedNewLines,
  editorCheckedShowLines,
  splitCommand,
  booleanWord,
  editorCompileProblem,
  editorFollowCompile,
  editorThemesAt,
  editorFreeName,
  editorNameOk,
  editorFreeAppFolder,
  typoNear,
  typoOf,
  editorAfterBuild,
  editorFontHelp,
  editorInstall,
  editorSourcePath,
  editorBuildExtra,
  editorLoadedFonts,
  editorColorModes,
  editorThemeHold,
  editorThemeRefusal,
  editorMissingSource,
  editorThemeTemplate,
  showSections,
  describe,
  namesSetting,
  needsPart,
} from '../../../../api/theme-edit/_adapter.mjs';
import {registerThemeSubcommands} from '../theme.mjs';
import {doc as groupDoc} from '../experimental-theme.doc.mjs';
import {doc as editorDoc} from '../experimental-theme-editor.doc.mjs';
import {doc as newDoc} from '../experimental-theme-editor-new.doc.mjs';
import {doc as setDoc} from '../experimental-theme-editor-set.doc.mjs';
import {doc as showDoc} from '../experimental-theme-editor-show.doc.mjs';
import {doc as undoDoc} from '../experimental-theme-editor-undo.doc.mjs';
import {doc as previewDoc} from '../experimental-theme-preview.doc.mjs';
import {doc as previewAddDoc} from '../experimental-theme-preview-add.doc.mjs';
import {doc as previewAppDoc} from '../experimental-theme-preview-app.doc.mjs';
import {doc as previewListDoc} from '../experimental-theme-preview-list.doc.mjs';
import {doc as previewRemoveDoc} from '../experimental-theme-preview-remove.doc.mjs';
import {doc as howDoc} from '../experimental-theme-editor-how.doc.mjs';
import {doc as compileDoc} from '../experimental-theme-compile.doc.mjs';
import {doc as listDoc} from '../experimental-theme-list.doc.mjs';
import {doc as addDoc} from '../experimental-theme-add.doc.mjs';
import {doc as removeDoc} from '../experimental-theme-remove.doc.mjs';
import {doc as useDoc} from '../experimental-theme-use.doc.mjs';
import {doc as ejectDoc} from '../experimental-theme-eject.doc.mjs';
import {doc as templateDoc} from '../experimental-theme-template.doc.mjs';
import {doc as targetsDoc} from '../experimental-theme-targets.doc.mjs';
import {doc as newFn} from '../../../../api/theme-edit/themeEditNew.doc.mjs';
import {doc as setFn} from '../../../../api/theme-edit/themeEditSet.doc.mjs';
import {doc as showFn} from '../../../../api/theme-edit/themeEditShow.doc.mjs';
import {doc as undoFn} from '../../../../api/theme-edit/themeEditUndo.doc.mjs';
import {doc as previewAddFn} from '../../../../api/theme-edit/themeEditPreviewAdd.doc.mjs';
import {doc as previewAppFn} from '../../../../api/theme-edit/themeEditPreviewApp.doc.mjs';
import {doc as previewListFn} from '../../../../api/theme-edit/themeEditPreviewList.doc.mjs';
import {doc as previewRemoveFn} from '../../../../api/theme-edit/themeEditPreviewRemove.doc.mjs';
import {doc as howFn} from '../../../../api/theme-edit/themeEditHow.doc.mjs';
import {quoteCommandArgument} from '../../../../foundation/env/package-manager.mjs';
import {
  commandAvailable,
  exampleAvailable,
  helpBase,
} from '../../lib/base-gate.mjs';

const PREFIX = 'astryx experimental theme';
const EDITOR = `${PREFIX} editor`;
/** The lookup command, named once: its CommandDoc's last word. */
const HOW = `${EDITOR} ${howDoc.name.split(' ').pop()}`;

/**
 * Commands in a line, with the run prefix this project uses.
 * @param {string} line
 */
const cmd = line => {
  const stem = `${getCliInvocation()} experimental theme`;
  // A line that already starts its commands this way (how's answers do,
  // in JSON too) keeps them.
  return line
    .split(stem)
    .map(part => part.split(PREFIX).join(stem))
    .join(stem);
};
/** The project's invocation of a command line (cmd, under a name an action's own `cmd` parameter does not hide). */

/**
 * Print blocks, a blank line between them, with this project's run prefix
 * in every command.
 * @param {Array<string | import('../../formatters/index.mjs').Block>} blocks
 */
const print = blocks => emit(...blocks.map(b => text(cmd(String(b)))));

/** @param {unknown} v */
const isEmptyValue = v =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * One value as record text: an array comma-joined, an object as
 * `key: value` pairs, and an empty value as `none`, so every JSON key shows.
 * @param {unknown} v
 * @returns {string}
 */
function shownValue(v) {
  if (isEmptyValue(v)) return 'none';
  if (Array.isArray(v))
    return (
      v
        .map(x => (x && typeof x === 'object' ? shownValue(x) : String(x)))
        .join(', ') || 'none'
    );
  if (typeof v === 'object')
    return Object.entries(/** @type {Record<string, unknown>} */ (v))
      .map(([k, x]) => `${k}: ${shownValue(x)}`)
      .join('; ');
  return String(v);
}

/**
 * One object as record fields: a nested object's own fields join the
 * record, so every label is a JSON key.
 * @param {Record<string, unknown>} o
 * @returns {Record<string, string>}
 */
function flatRecord(o) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v) && !v.length) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.entries(/** @type {Record<string, unknown>} */ (v));
      // A map of objects keeps one field per entry, so no entry overwrites
      // another.
      if (
        inner.some(([, x]) => x && typeof x === 'object' && !Array.isArray(x))
      )
        for (const [name, x] of inner) out[name] = shownValue(x);
      else
        Object.assign(
          out,
          flatRecord(/** @type {Record<string, unknown>} */ (v)),
        );
    } else out[k] = shownValue(v);
  }
  return out;
}

/**
 * The text projection of an envelope's data, with field names that match
 * its JSON keys: plain fields in one record; a long list, a list of objects,
 * or an object as a section of its own.
 * @param {Record<string, unknown>} data
 * @returns {Array<string | import('../../formatters/index.mjs').Block>}
 */
function project(data) {
  /** @type {Record<string, string>} */
  const plain = {};
  /** @type {Array<string | import('../../formatters/index.mjs').Block>} */
  const parts = [];
  for (const [k, v] of Object.entries(data)) {
    // An empty list has no field in the JSON projection, so none here.
    if (Array.isArray(v) && !v.length) continue;
    if (isEmptyValue(v) || (v !== null && typeof v !== 'object')) {
      plain[k] = shownValue(v);
    } else if (Array.isArray(v) && typeof v[0] !== 'object') {
      const joined = v.join(', ');
      if (v.length <= 3 && joined.length <= 80) plain[k] = joined;
      else parts.push(section(`${k}:`), list(v.map(String)));
    } else if (Array.isArray(v)) {
      const items = /** @type {Record<string, unknown>[]} */ (v).map(
        flatRecord,
      );
      // Short items print one per line; items with prose print as records.
      const prose = items.some(o => Object.values(o).some(x => x.length > 100));
      parts.push(
        section(`${k}:`),
        records(items, prose ? {} : {layout: 'inline'}),
      );
    } else {
      const entries = Object.entries(
        /** @type {Record<string, unknown>} */ (v),
      );
      if (
        entries.every(
          ([, x]) =>
            x === null ||
            typeof x !== 'object' ||
            (Array.isArray(x) && typeof x[0] !== 'object'),
        )
      )
        parts.push(
          section(`${k}:`),
          record(flatRecord(Object.fromEntries(entries))),
        );
      else {
        // Plain fields of a mixed object print first, as `<key> <field>`.
        /** @type {Record<string, string>} */
        const head = {};
        /** @type {Array<string | import('../../formatters/index.mjs').Block>} */
        const nested = [];
        for (const [name, x] of entries) {
          if (Array.isArray(x) && !x.length) continue;
          if (x === null || typeof x !== 'object')
            head[`${k} ${name}`] = shownValue(x);
          else if (Array.isArray(x) && typeof x[0] !== 'object') {
            const joined = x.join(', ');
            if (x.length <= 3 && joined.length <= 80)
              head[`${k} ${name}`] = joined;
            else nested.push(section(`${k} ${name}:`), list(x.map(String)));
          } else {
            const items = Array.isArray(x) ? x : [x];
            nested.push(
              section(`${k} ${name}:`),
              records(
                /** @type {Record<string, unknown>[]} */ (items).map(
                  flatRecord,
                ),
              ),
            );
          }
        }
        if (Object.keys(head).length) parts.push(record(head));
        parts.push(...nested);
      }
    }
  }
  return [record(plain), ...parts];
}

/**
 * A result whose change was saved but not checked leads with a warning
 * line naming the cause.
 * @param {unknown} result
 * @returns {string[]}
 */
function notCheckedLine(result) {
  const n = /** @type {any} */ (result)?.data?.notChecked;
  return n ? [`[warn] saved, not checked (${n.code}): ${n.cause}`] : [];
}

/**
 * Text with C0 control characters and DEL shown as escapes (\u001b), so
 * text a person typed cannot move the cursor or recolor the terminal.
 * @param {string} text
 */
const escapeControls = text =>
  String(text).replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b-\u001f\u007f]/g,
    c => `\\u${`000${c.charCodeAt(0).toString(16)}`.slice(-4)}`,
  );

/**
 * Run one API call: errors become the CLI error envelope, results go to
 * JSON or to `render`.
 * @template T
 * @param {import('commander').Command} program
 * @param {() => Promise<T>} call
 * @param {(result: T) => Array<string | import('../../formatters/index.mjs').Block>} render
 * @param {(result: T) => import('../../../../foundation/debug/command-result.mjs').CommandResult} [answer]
 */
async function run(program, call, render, answer) {
  const json = program.opts().json || false;
  /** @type {T} */
  let result;
  try {
    result = await call();
  } catch (e) {
    const err = /** @type {import('../../../../api/error.mjs').AstryxError} */ (
      e
    );
    // Suggested commands start the way this project runs the CLI, in JSON
    // as in text. Echoed user text never drives the terminal: control
    // characters print as escapes.
    return cliError(escapeControls(err.message), {
      suggestions: err.suggestions?.map(x => ({
        ...x,
        name: escapeControls(cmd(x.name)),
      })),
      code: err.code ?? ERROR_CODES.ERR_UNKNOWN,
    });
  }
  const answered = answer
    ? answer(result)
    : resultSet({count: 1, resultKind: 'mixed', directMatch: true});
  if (json) {
    jsonOut(/** @type {any} */ (result));
    return answered;
  }
  // --detail compact|brief (and --dense) print a change's status line
  // alone; an answer (how, show, list) is the answer, and prints whole.
  const o = program.opts();
  const change = ['themeEdit.set', 'themeEdit.undo', 'themeEdit.new'].includes(
    /** @type {any} */ (result)?.type,
  );
  const short =
    change &&
    (o.detail === 'compact' ||
      o.detail === 'brief' ||
      o.dense ||
      o.lang === 'dense');
  const lines = [...notCheckedLine(result), ...render(result)];
  print(short ? lines.slice(0, notCheckedLine(result).length + 1) : lines);
  return answered;
}

/**
 * The flags of a change, from Commander's options.
 * @param {any} o
 */
const changeOptions = o => ({
  cwd: process.cwd(),
  on: o.on,
  // (--when given for several props, a ghost small button: all at once,
  // joined as Core's own keys join them.)
  when: flagValues('when').length > 1 ? flagValues('when').join('+') : o.when,
  state: o.state,
  mode: o.mode,
  only: o.only ?? false,
  png: o.png ?? false,
});

/**
 * The dial settings `new` takes as flags, by dial name: every option of its
 * CommandDoc that `set` would take as a dial.
 * @param {any} o
 * @returns {Record<string, string | string[]>}
 */
function newSettings(o, themeName = '<theme>') {
  /** @type {Record<string, string | string[]>} */
  const out = {};
  // --like given two values is refused like a dial given two.
  const likes = flagValues('like');
  if (new Set(likes).size > 1) {
    // The suggestion keeps the first built-in theme given, or drops --like.
    const like = likes
      .map(l => l.toLowerCase())
      .find(l => builtInThemes().includes(l));
    throw new AstryxError(
      `--like was given twice (${likes.join(', ')}); give it once. Nothing was changed.`,
      [
        {
          name: cmd(`${EDITOR} new ${themeName}${newFlagLine({...o, like})}`),
          reason: like
            ? 'do this instead: the first built-in theme given'
            : 'do this instead: none of them is a built-in theme',
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  for (const opt of newDoc.options ?? []) {
    if (opt.param !== 'options.settings') continue;
    const flag = opt.flag.split(' ')[0].slice(2);
    const key = flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = o[key];
    if (value == null) continue;
    // A flag given twice: headings takes one value per axis (a weight and a
    // tracking); any other flag given two different values is refused.
    const all = flagValues(flag);
    if (flag === 'headings' && all.length > 1) out[flag] = all;
    else if (new Set(all).size > 1) {
      // Each value as the dial reads it (`--mode light` is light-only); a
      // light and a dark mode together are both modes, the default.
      const read = all.map(v =>
        dialValueFits(flag, v) ? v : flag === 'mode' ? modeDialValue(v) : null,
      );
      const bothModes =
        flag === 'mode' &&
        read.includes('light-only') &&
        read.includes('dark-only');
      // The suggestion keeps the first value the dial takes, or drops it.
      const fits = bothModes ? undefined : (read.find(Boolean) ?? undefined);
      throw new AstryxError(
        `--${flag} was given twice (${all.join(', ')}); give it once. Nothing was changed.`,
        [
          {
            name: cmd(
              `${EDITOR} new ${themeName}${newFlagLine({...o, [key]: fits})}`,
            ),
            reason: bothModes
              ? 'do this instead: a light and a dark mode together are both modes, the default'
              : fits
                ? 'do this instead: the first value it takes'
                : `do this instead: none of them is a value --${flag} takes`,
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    } else out[flag] = String(value);
  }
  return out;
}

/**
 * The settings flags of options as commander read them (camelCase keys),
 * by the flag name `new` takes.
 * @param {Record<string, any>} o
 * @returns {Record<string, string | string[]>}
 */
function newSettingsGiven(o) {
  /** @type {Record<string, string | string[]>} */
  const settings = {};
  for (const opt of newDoc.options ?? []) {
    if (opt.param !== 'options.settings') continue;
    const flag = opt.flag.split(' ')[0].slice(2);
    const value = o[flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    if (value != null) settings[flag] = value;
  }
  return settings;
}

/**
 * The options a `new` was given, as flags for a suggested command, so a
 * corrected command makes the theme that was asked for.
 * @param {any} o
 * @returns {string}
 */
function newFlagLine(o) {
  const settings = newSettingsGiven(o);
  const parts = newFlagList(
    o.like == null ? undefined : String(o.like),
    settings,
    Boolean(o.png),
  );
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/**
 * The options of a preview command as the one option reader reads them
 * ({@link optionsAsWritten}): a typed dash (`—template`, `−−path`), other
 * letters or a typo of an option it takes is that option, refused with
 * the command as meant. Commander reads a word that starts with a typed
 * dash as a word of the command, so it is read here. Null when every
 * option is written as the command takes it.
 * @param {string} command `add` or `app` under preview
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @returns {null}
 */
function previewOptionsRead(command, doc) {
  const head = `${PREFIX} preview ${command}`;
  const read = optionsAsWritten(command, doc, {group: 'preview', head});
  if (!read) return null;
  throw new AstryxError(
    `${read.why}.`,
    [
      ...(read.line ? [{name: cmd(read.line), reason: 'do this instead'}] : []),
      {name: cmd(`${head} --help`), reason: 'every option it takes'},
    ],
    ERROR_CODES.ERR_INVALID_OPTION,
  );
}

/**
 * Refuse a preview flag given twice with different values: the command
 * would keep only the last one without a word. Undefined when each is
 * given once.
 * @param {string} command the preview subcommand, for the suggestion
 * @param {string[]} flags
 * @returns {undefined}
 */
function previewFlagsOnce(command, flags) {
  for (const flag of flags) {
    const all = flagValues(flag);
    if (new Set(all).size > 1)
      throw new AstryxError(
        `--${flag} was given twice (${all.join(', ')}); give it once. Nothing was changed.`,
        [
          {
            name: cmd(`${PREFIX} preview ${command} --help`),
            reason: 'every option it takes',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
  }
  return undefined;
}

/**
 * Every value one flag was given on the command line, in order.
 * @param {string} name
 * @returns {string[]}
 */
function flagValues(name) {
  const argv = process.argv;
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') break;
    if (argv[i] === `--${name}` && i + 1 < argv.length) out.push(argv[++i]);
    else if (argv[i].startsWith(`--${name}=`))
      out.push(argv[i].slice(name.length + 3));
  }
  return out;
}

/**
 * The other values an undo removed with the one named, for a setting listed
 * more than once by hand (` and red, listed twice`), or nothing.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeData} d
 */
function alsoRemovedText(d) {
  const also = d.alsoRemoved ?? [];
  if (!also.length) return '';
  return ` and ${also.map(x => JSON.stringify(x.value)).join(', ')} (it was listed ${also.length === 1 ? 'twice' : `${also.length + 1} times`})`;
}

/**
 * The receipt of a change: a status line, then the change data.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeResponse} r
 */
function changeBlocks(r) {
  const d = r.data;
  // The status line names the value as saved, with a quote or space mark
  // the text output would fold written as its CSS escape (\201C), so the
  // text and the JSON name the same value.
  // A value saved as no text (none at all) is named by describe as such.
  const s = {
    ...d.setting,
    value:
      typeof d.setting.value !== 'string'
        ? d.setting.value
        : d.setting.value.replace(
            /[\u00A0\u00AB\u00BB\u2000-\u200B\u2018-\u201F\u2039\u203A\u202F\u3000\u300C-\u300F]/g,
            c => `\\${c.codePointAt(0)?.toString(16).toUpperCase()} `,
          ),
  };
  // A change that leaves the setting as it was says so, never "x -> x".
  const unchanged = /** @type {any} */ (d.notes ?? []).some(
    (/** @type {string} */ n) => n.startsWith('no change: '),
  );
  // A dial step on a part (`corners large --on card`) says what it drew
  // there, when that is a value or two: a part's own scale can give a step
  // another size than the dial's help names for the whole theme.
  const stepOn = d.action === 'set' && s.source === 'dial' ? s.on : null;
  const drawnOn = stepOn
    ? /** @type {string[]} */ (/** @type {any} */ (d).styled ?? [])
        .filter(x => x.startsWith(`${stepOn}: `))
        .map(x => x.slice(stepOn.length + 2))
    : [];
  const drawnAs = drawnOn.length <= 2 ? drawnOn : [];
  const done =
    unchanged && d.action === 'set'
      ? `[ok] ${d.theme}: ${describe(s)} was already set; nothing changed`
      : d.was != null
        ? `[ok] ${d.theme}: ${s.thing} ${d.was} -> ${s.value}`
        : `[ok] ${d.theme}: ${d.action === 'set' ? `${describe(s)}${drawnAs.length ? ` (drawn as ${drawnAs.join(', ')})` : ''}` : `removed ${describe(s)}${alsoRemovedText(d)}; now ${/** @type {any} */ (d).now ?? "the base theme's value"} applies`}`;
  // A problem the change made leads the result, right under the status
  // line, which counts them: a tail-cut or head-cut output still shows it.
  // What a whole-theme change leaves out comes next, with the lines that
  // reach it, before the rest a head-cut output drops.
  const {
    newProblems = [],
    leftOut = [],
    fontNotLoaded = [],
    missed: _missed,
    missedParts: _missedParts,
    missedOn: _missedOn,
    ...rest
  } = /** @type {any} */ (d);
  const status = newProblems.length
    ? `${done}, but it made ${newProblems.length} new problem${newProblems.length > 1 ? 's' : ''}:`
    : done;
  // On undo, `setting` and `removed` both name the setting removed, as in
  // the JSON; the status line says the base theme's value is back.
  return [
    status,
    ...(newProblems.length ? problemList(newProblems) : []),
    ...(fontNotLoaded.length
      ? [
          list(
            fontNotLoaded.map(
              (/** @type {{family: string, run: string[]}} */ x) => [
                `${x.family} is not installed, so the pictures and the app draw the next font in the stack until it is`,
                ...x.run,
              ],
            ),
          ),
        ]
      : []),
    ...(leftOut.length
      ? [
          list(
            leftOut.map((/** @type {{note: string, run: string[]}} */ x) => [
              x.note,
              ...x.run,
            ]),
          ),
        ]
      : []),
    ...missedLine(d),
    ...changeFields(rest),
  ];
}

/**
 * The parts the theme's own changes still do not reach, counted and
 * named, near the top of a change or a new theme, so a head of the
 * output keeps it; show names the first ones with their lines, and show
 * --json lists each.
 * @param {{missed?: number, missedParts?: number, missedOn?: string[]}} d
 */
function missedLine(d) {
  const {missed = 0, missedParts = missed, missedOn = []} = d;
  if (!missed) return [];
  return [
    record({
      missed: `${missed} miss${missed > 1 ? 'es' : ''} on ${missedParts} part${missedParts > 1 ? 's' : ''} the theme's changes did not reach${missedOn.length ? ` (${missedOn.join(', ')})` : ''}: show lists the first with their lines; show --json lists each`,
    }),
  ];
}

/**
 * Problems, one to an item: what is wrong, then the command that fixes it.
 * @param {Array<{problem: string, fix: string | null}>} problems
 */
function problemList(problems) {
  return cappedList(
    problems.map(p => (p.fix ? [p.problem, `fix: ${p.fix}`] : p.problem)),
    'every one, each with its fix',
  );
}

/** How many problems the text shows before it counts the rest. */
const PROBLEMS_SHOWN = 8;

/**
 * A list the text cuts after the first few, counting the rest; the JSON has
 * every item.
 * @param {Array<string | string[]>} items
 * @param {string} [jsonHas] What the JSON holds for each item.
 */
function cappedList(items, jsonHas = 'every one') {
  const rest = items.length - PROBLEMS_SHOWN;
  return [
    list(items.slice(0, PROBLEMS_SHOWN)),
    ...(rest > 0 ? [`and ${rest} more (--json lists ${jsonHas})`] : []),
  ];
}

/**
 * The plain fields of a change's data, with its problems as a cut list.
 * @param {Record<string, unknown>} data
 */
function changeFields(data) {
  const {problems, ...rest} = /** @type {any} */ (data);
  return [
    ...project(rest),
    ...(Array.isArray(problems) && problems.length
      ? [section('problems:'), ...cappedList(problems)]
      : []),
  ];
}

/**
 * The text of `show`: the theme, then each color with its seed and the shade
 * each token uses, the notes on moved shades, and the generated files last.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditShowResponse['data']} d
 */
function showBlocks(d) {
  const {
    settings,
    colors,
    colorNotes,
    colorFiles,
    unreached,
    missed = [],
    // Every problem is in the open problems at the end, with its fix.
    problems: _problems,
    openProblems = [],
    // The pictures to open: the first line and the last, so a head or a
    // tail of the output keeps it.
    look,
    ...rest
  } = d;
  const [head, ...others] = project(/** @type {any} */ (rest));
  const lookLine = look ? record({look}) : [];
  return [
    lookLine,
    head,
    // Each setting as named fields: its whole scope, the parts it reaches,
    // and what a stronger setting hides of it.
    ...(settings.length
      ? [section('settings:'), records(settings.map(s => flatRecord(s)))]
      : []),
    ...others,
    ...(colors.length
      ? [
          section('colors:'),
          ...colors.flatMap(c => [
            record({color: c.color, seed: c.seed}),
            record(c.tokens),
          ]),
        ]
      : []),
    ...(colorNotes.length ? [section('colorNotes:'), list(colorNotes)] : []),
    // What the theme's own changes did not reach, counted, six with the
    // line that reaches each; the other parts on the base's look are
    // counted, and listed in the JSON. Just before the generated files
    // (which stay last, before the closing look line), so a tail of the
    // output keeps them.
    ...(missed.length
      ? [
          section(
            `missed (${missed.length} miss${missed.length > 1 ? 'es' : ''} on ${new Set(missed.map(m => m.part)).size} part${new Set(missed.map(m => m.part)).size > 1 ? 's' : ''} the theme's own changes did not reach; each line reaches one):`,
          ),
          // Each part and why, then the line that reaches it.
          missed
            .slice(0, 6)
            .map(
              m =>
                `- ${m.part}${m.state ? ` (${m.state})` : ''}: ${m.why}\n  line: ${cmd(m.line)}`,
            )
            .join('\n'),
        ]
      : []),
    ...(() => {
      // The rest, each said for what it is: the misses beyond the six shown
      // (a border, a shadow, a pill, a state), and the parts with no miss
      // whose fill or text color is still the base's (unreached).
      const hidden = missed.slice(6);
      const missedNames = new Set(missed.map(m => m.part));
      const still = (unreached ?? []).filter(p => !missedNames.has(p)).length;
      const hiddenParts = new Set(hidden.map(m => m.part)).size;
      const said = [
        hidden.length
          ? `${hidden.length} more miss${hidden.length > 1 ? 'es' : ''} (on ${hiddenParts} part${hiddenParts > 1 ? 's' : ''})`
          : '',
        still
          ? `${still} more part${still > 1 ? 's' : ''} whose fill or text color is still the base's`
          : '',
      ].filter(Boolean);
      return said.length
        ? [
            record({
              unreached: `${said.join(', and ')} (show --json lists each)`,
            }),
          ]
        : [];
    })(),
    colorFiles
      ? [section('colorFiles:'), record(colorFiles)]
      : record({colorFiles: 'none'}),
    // Last, so the end of the output names what the theme still gets wrong
    // (none, as an empty list in the JSON, prints nothing).
    openProblems.length
      ? [
          section(
            `openProblems: ${openProblems.length} the theme has now${(() => {
              const fixable = openProblems.filter(
                (/** @type {any} */ p) => p.fix,
              ).length;
              return fixable === openProblems.length
                ? '; each fix line fixes one'
                : fixable
                  ? `; ${fixable} with a fix line that fixes it, the rest with none (no one line fixes those alone)`
                  : '; none has a fix line (no one line fixes these alone)';
            })()}`,
          ),
          ...problemList(openProblems),
        ]
      : [],
    lookLine,
  ].flat();
}

/**
 * The text of a lookup answer: the answer data, lists one item per line.
 * @param {any} d
 */
function lookupBlocks(d) {
  // Echoed user text never drives the terminal: control characters print
  // as escapes.
  const safe = (/** @type {unknown} */ v) =>
    typeof v === 'string'
      ? v.replace(
          /\p{Cc}/gu,
          c => `\\x${(c.charCodeAt(0) + 0x100).toString(16).slice(1)}`,
        )
      : v;
  /** @type {Record<string, unknown>} */
  const shown = {};
  for (const [k, v] of Object.entries(d)) shown[k] = safe(v);
  const {
    hint,
    run: next,
    results,
    examples,
    refused,
    points,
    items,
    ...rest
  } = /** @type {any} */ (shown);
  // Commands print one to a line and are never wrapped, so a line pasted
  // into a shell runs exactly one whole command; a sequence is one line.
  /** @param {string[]} cmds @param {boolean} [sequence] */
  const commandLines = (cmds, sequence) =>
    sequence && cmds.length > 1
      ? [cmds.join(' && '), 'sequence: run as one line, in this order']
      : cmds;
  /** @param {Array<{command: string, why: string}>} refusedList */
  const refusedLines = refusedList =>
    refusedList.flatMap(r => [`x ${r.command}`, `  not run: ${r.why}`]);
  /** @type {Array<string | import('../../formatters/index.mjs').Block>} */
  const blocks = [...(hint ? [String(hint)] : []), ...project(rest)];
  if (Array.isArray(results) && results.length)
    blocks.push(
      section('results:'),
      list(
        results.map((/** @type {any} */ r) => [
          String(r.text),
          ...commandLines(r.commands ?? [], r.sequence),
          ...refusedLines(r.refused ?? []),
        ]),
      ),
    );
  if (Array.isArray(examples) && examples.length)
    blocks.push(section('examples:'), list(commandLines(examples)));
  if (Array.isArray(refused) && refused.length)
    blocks.push(
      section('refused:'),
      list(refused.map((/** @type {any} */ r) => refusedLines([r]))),
    );
  if (Array.isArray(points) && points.length)
    blocks.push(
      section('points:'),
      records(
        points.map((/** @type {any} */ x) => ({
          at: x.at,
          color: x.color,
          alpha: x.alpha,
        })),
      ),
    );
  if (Array.isArray(items) && items.length) {
    if (items.some((/** @type {any} */ x) => Array.isArray(x.examples)))
      blocks.push(
        section('items:'),
        list(
          items.map((/** @type {any} */ x) => [
            `${x.name}  ${x.values}`,
            `help: ${x.help}`,
            ...commandLines(x.examples),
          ]),
        ),
      );
    else blocks.push(...project({items}).slice(1));
  }
  if (Array.isArray(next) && next.length)
    blocks.push(`Tip: ${next.map(String).join(', or ')}`);
  return blocks;
}

/**
 * Refuse an option the command does not have. Set, undo and how take
 * unknown options so a design token (`--color-accent`) can be the thing
 * they name; a `--` word anywhere else is a mistyped option.
 * @param {string} command the subcommand, for the suggestion
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc the command's doc, which lists its options
 * @param {Array<string | undefined>} rest the operands after the thing
 * @returns {ReturnType<typeof cliError> | null}
 */
function strayOption(command, doc, rest) {
  // A scope flag given twice would keep only the last one without a word.
  // (--when takes one value per prop: those are joined, all at once.)
  for (const flag of ['on', 'when', 'state', 'mode']) {
    const all = flagValues(flag);
    const props = all.map(w => String(w).split(':')[0].trim().toLowerCase());
    if (flag === 'when' && new Set(props).size === all.length) continue;
    if (new Set(all).size > 1)
      return cliError(
        `--${flag} was given twice (${all.join(', ')}); give it once.`,
        {
          suggestions: [
            {
              name: cmd(`${EDITOR} ${command} --help`),
              reason: 'every option it takes',
            },
          ],
          code: ERROR_CODES.ERR_INVALID_ARGUMENT,
        },
      );
  }
  // A value pasted with a token's label (`'--color-accent: #e11d48'`) is
  // a value, read by the label reader, not an option.
  const word = rest.find(
    w =>
      typeof w === 'string' &&
      w.startsWith('--') &&
      !/^--[a-z0-9-]+\s*:\s*\S/i.test(w),
  );
  if (word == null) return null;
  // An option the command takes, after the POSIX "--": every word after it
  // is a value, so the option was not read. The line without the "--" is
  // the one meant.
  const argv = process.argv;
  const dashes = argv.indexOf('--', argv.indexOf(command) + 1);
  const takes = (doc.options ?? []).flatMap(o =>
    String(o.flag)
      .split(/[\s,]+/)
      .filter(w => w.startsWith('--')),
  );
  if (dashes >= 0 && takes.includes(word) && argv.indexOf(word) > dashes) {
    const words = argv
      .slice(argv.indexOf(command) + 1)
      .filter((w, i) => i !== dashes - argv.indexOf(command) - 1);
    return cliError(
      `every word after "--" is a value, so ${word} after it is not read as the option ${command} takes; write the line without the "--" (a value that starts with a dash, such as -0.5px, needs none). Nothing was changed.`,
      {
        suggestions: [
          {
            name: cmd(
              `${EDITOR} ${command} ${words.map(w => (/^--[a-z]/.test(w) && takes.includes(w) ? w : quoteCommandArgument(w))).join(' ')}`,
            ),
            reason: 'do this instead',
          },
        ],
        code: ERROR_CODES.ERR_INVALID_ARGUMENT,
      },
    );
  }
  return strayRefusal(command, doc, `${EDITOR} ${command}`, {
    option: word,
    note: 'a design token (such as --color-accent) is the thing a change names, before its value',
  });
}

/**
 * What a theme command answers for an option it does not take, or for
 * words past what it takes: the one stray reader every editor and preview
 * command uses. It names the options the command takes; it offers the same
 * command without the stray words only when that is safe to run
 * (`safeLine`: show reads and changes nothing; a preview remove without its
 * option would remove the whole preview), and always the command's help.
 * @param {string} command the command's words after the group (`set`, `preview remove`)
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc the command's doc, which lists its options
 * @param {string} head the command line's start, as the project runs it
 * @param {{option?: string, extra?: string[], note?: string}} stray an option it does not take, or words past what it takes, and a sentence about them
 * @param {string | null} [safeLine] the command without them, when it is safe to run
 * @returns {{message: string, suggestions: Array<{name: string, reason: string}>, code: string}}
 */
function strayAnswer(command, doc, head, stray, safeLine = null) {
  const takes = [
    ...(doc.options ?? []).flatMap(o =>
      String(o.flag)
        .split(/[\s,]+/)
        .filter(w => w.startsWith('--')),
    ),
    '--json',
  ].filter((w, i, all) => all.indexOf(w) === i);
  const list =
    takes.length > 1
      ? `${takes.slice(0, -1).join(', ')} and ${takes.at(-1)}`
      : takes.join('');
  const message = stray.option
    ? `unknown option '${stray.option}': ${command} takes ${list}${stray.note ? `; ${stray.note}` : ''}.`
    : `${command} does not take "${(stray.extra ?? []).join(' ')}"${stray.note ? `; ${stray.note}` : ''}.`;
  return {
    message,
    suggestions: [
      ...(safeLine ? [{name: cmd(safeLine), reason: 'do this instead'}] : []),
      {
        name: cmd(`${head} --help`),
        reason: stray.option ? 'every option it takes' : 'what it takes',
      },
    ],
    code: stray.option
      ? ERROR_CODES.ERR_INVALID_OPTION
      : ERROR_CODES.ERR_INVALID_ARGUMENT,
  };
}

/**
 * {@link strayAnswer} as the refusal the command prints.
 * @param {string} command
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @param {string} head
 * @param {{option?: string, extra?: string[], note?: string}} stray
 * @param {string | null} [safeLine]
 */
function strayRefusal(command, doc, head, stray, safeLine = null) {
  const a = strayAnswer(command, doc, head, stray, safeLine);
  return cliError(a.message, {suggestions: a.suggestions, code: a.code});
}

/**
 * Read the options of an editor command as written, the one reading every
 * editor command gives them: an option in other letters, with one dash or
 * a typed dash (`--On`, `-only`, `\u2014only`) or within the one typo limit
 * of an option the command takes (`--olny`) is that option; a boolean
 * option written with a value (`--png=false`, `--only true`) takes none,
 * and its value is read by the one yes/no reader (booleanWord). Null when
 * every option is written as the command takes it; else the reason, and
 * the command as meant (the option as the command takes it; a boolean as
 * itself for yes, left out for no), or no command when a boolean's value
 * reads as neither.
 * @param {string} command the subcommand (`set`, `undo`, `new`, `show`, how's word; `add` under preview)
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc the command's doc, which lists its options
 * @param {{group: string, head: string}} [where] the group word the subcommand follows (`editor`, `preview`) and the command line's start
 * @returns {{why: string, line: string | null} | null}
 */
function optionsAsWritten(
  command,
  doc,
  where = {group: 'editor', head: `${EDITOR} ${command}`},
) {
  const flags = (doc.options ?? []).map(opt => String(opt.flag));
  const names = (/** @type {(f: string) => boolean} */ keep) =>
    flags
      .filter(keep)
      .flatMap(f => f.split(/[\s,]+/).filter(w => w.startsWith('--')));
  const booleans = ['--json', ...names(f => !/[<[]/.test(f))];
  const all = [...booleans, ...names(f => /[<[]/.test(f))];
  // The options that must have a value (`--section <name>`).
  const valued = names(f => /</.test(f));
  /** The option a word names, as the command takes it, or null. @param {string} word */
  const meant = word => {
    const w = word.toLowerCase();
    if (all.includes(`--${w}`)) return `--${w}`;
    const near = all.filter(o => typoNear(w, o.slice(2)));
    return near.length === 1 ? near[0] : null;
  };
  // Any run of up to three hyphens and dash-like characters (an en or em
  // dash, a minus sign, a non-breaking hyphen: `-—on`, `−−on`) is the
  // option's dashes, as normalizeEntry reads a token's.
  const optionShape =
    /^([-\u2010-\u2015\u2212\ufe58\ufe63\uff0d]{1,3})([A-Za-z][A-Za-z-]*)(?:=(.*))?$/;
  const argv = process.argv;
  const at = argv.indexOf(command, argv.indexOf(where.group) + 1);
  if (at < 0) return null;
  /** @type {string[]} */
  const words = [];
  /** @type {string | null} */
  let why = null;
  let unread = false;
  for (let i = at + 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      words.push(...argv.slice(i));
      break;
    }
    const m = optionShape.exec(a);
    const flag = m ? meant(m[2]) : null;
    if (!m || !flag) {
      if (a !== '--json') words.push(a);
      continue;
    }
    const written = m[3] == null ? `${m[1]}${m[2]}` : a.split('=')[0];
    if (written !== flag)
      why ??= `unknown option '${written}' (did you mean ${flag}?)`;
    const next = argv[i + 1];
    if (booleans.includes(flag)) {
      // A value after a boolean option, joined by `=` or as the next word
      // when that word is a yes or a no.
      const value = m[3] ?? (booleanWord(next) != null ? String(next) : null);
      if (value != null) {
        if (m[3] == null) i += 1;
        const read = booleanWord(value);
        const shown = m[3] == null ? `${a} ${value}` : a;
        if (read == null) unread = true;
        why ??=
          read == null
            ? `${flag} takes no value ("${shown}"), and "${value}" reads as neither yes nor no: give ${flag} alone for yes, or leave it out`
            : `${flag} takes no value ("${shown}"): give it alone for yes, or leave it out`;
        if (read === true && flag !== '--json' && !words.includes(flag))
          words.push(flag);
        continue;
      }
      // A yes/no option given twice is one option.
      if (flag !== '--json' && !words.includes(flag)) words.push(flag);
      // A word right after a mistyped yes/no option that reads as neither
      // (`--olny dark`) is no value of it: the line leaves it out, and says
      // so, never gluing it onto the setting's value.
      if (written !== flag && next != null && !/^-/.test(next)) {
        i += 1;
        why = `${why}; "${next}" after it is no value of ${flag}, so the line leaves it out`;
      }
      continue;
    }
    // An option that takes a value, given none, is left out of the line. A
    // next word that starts with a dash is its value unless it names an
    // option the command takes (`--font -apple-system`, `--text-size -1`).
    // A word written as a long option (`--path`, `--color-accent`) is never
    // a value either: no value an option takes starts with two dashes.
    const opt = next == null ? null : optionShape.exec(next);
    const nextIsOption =
      next === '--' ||
      /^--[A-Za-z]/.test(next ?? '') ||
      Boolean(opt && meant(opt[2]));
    if (m[3] == null && (next == null || nextIsOption)) {
      if (valued.includes(flag)) {
        why ??= `${flag} was given no value`;
        // Leaving out an option that narrows what the command acts on
        // would widen it: that line is never offered.
        if (NARROWING_OPTIONS.includes(flag.slice(2))) unread = true;
      }
      continue;
    }
    words.push(flag);
    if (m[3] != null) words.push(m[3]);
    else if (/^-/.test(next)) {
      words.push(next);
      i += 1;
    }
  }
  if (!why) return null;
  return {
    why,
    line: unread
      ? null
      : `${where.head} ${words.map(w => (/^--[a-z]/.test(w) && all.includes(w) ? w : quoteCommandArgument(w))).join(' ')}`.trim(),
  };
}

/**
 * An option a theme command does not take, or one written with no value,
 * as the one option reader reads it (the json shim asks, for the options
 * commander refuses): the option meant, or the command without the empty
 * option, with the command that works, else what the command takes and its
 * help. Undefined for any other command.
 * Each offered command is checked as that command checks it (set and undo
 * by their own checks, new by new's, show's section by show's), so a line
 * offered is one that works; leaving out an option that narrows what the
 * command acts on (--on, --when, --state, --mode, --path, --like, --theme)
 * would widen it, so that line is never offered.
 * @param {any} c the command commander refused
 * @param {string} [code] commander's code for the refusal
 * @returns {Promise<{message: string, suggestions: Array<{name: string, reason: string}>} | undefined> | undefined}
 */
function unknownThemeOption(c, code = 'commander.unknownOption') {
  const sub = c?.name?.();
  const group = c?.parent?.name?.();
  const doc =
    group === 'preview'
      ? /** @type {Record<string, import('@astryxdesign/cli/authoring').CommandDoc>} */ ({
          add: previewAddDoc,
          app: previewAppDoc,
          list: previewListDoc,
          remove: previewRemoveDoc,
        })[sub]
      : group === 'editor'
        ? /** @type {Record<string, import('@astryxdesign/cli/authoring').CommandDoc>} */ ({
            new: newDoc,
            set: setDoc,
            show: showDoc,
            undo: undoDoc,
            how: howDoc,
          })[sub]
        : undefined;
  if (!doc) return undefined;
  return themeOptionAnswer(c, code, sub, group, doc);
}

/**
 * The commands that carry out a line the option reader built, each checked
 * as its own command checks it: set and undo by their checks (a repair
 * folded in), new by new's (its own repairs offered), show's --section by
 * show's; none when the command refuses it with no repair.
 * @param {string} group
 * @param {string} sub
 * @param {string} line
 * @returns {Promise<Array<{name: string, reason: string}>>}
 */
async function checkedOptionLines(group, sub, line) {
  const cwd = process.cwd();
  const offer = (/** @type {string} */ l) => [
    {name: cmd(l), reason: 'do this instead'},
  ];
  if (group === 'editor' && (sub === 'set' || sub === 'undo')) {
    const checked = await editorCheckedLine(sub, line, cwd);
    return checked ? offer(checked) : [];
  }
  if (group === 'editor' && sub === 'new') {
    const words = splitCommand(line.slice(`${EDITOR} new `.length)) ?? [];
    const [name, ...rest] = words;
    /** @type {Record<string, string | string[]>} */
    const settings = {};
    let like;
    let png = false;
    for (let i = 0; i < rest.length; i += 1) {
      const m = /^--([a-z-]+)$/.exec(rest[i]);
      if (!m) continue;
      if (m[1] === 'png') png = true;
      else if (rest[i + 1] != null) {
        const v = rest[(i += 1)];
        if (m[1] === 'like') like = v;
        else
          settings[m[1]] =
            settings[m[1]] == null ? v : [...[settings[m[1]]].flat(), v];
      }
    }
    const lines = await editorCheckedNewLines(line, name, {
      cwd,
      ...(like != null ? {like} : {}),
      settings,
      png,
    });
    return lines.map(x => ({
      name: cmd(x.name),
      reason: x.reason ?? 'do this instead',
    }));
  }
  if (group === 'editor' && sub === 'show') {
    const lines = editorCheckedShowLines(line);
    return lines.map(x => ({
      name: cmd(x.name),
      reason: x.reason ?? 'do this instead',
    }));
  }
  return offer(line);
}

/** Options whose absence widens what a command acts on, or changes it. */
const NARROWING_OPTIONS = Object.freeze([
  'on',
  'when',
  'state',
  'mode',
  'path',
  'like',
  'theme',
]);

/**
 * {@link unknownThemeOption}'s answer for a theme command.
 * @param {any} c
 * @param {string} code
 * @param {string} sub
 * @param {string} group
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @returns {Promise<{message: string, suggestions: Array<{name: string, reason: string}>} | undefined>}
 */
async function themeOptionAnswer(c, code, sub, group, doc) {
  const head = `${group === 'preview' ? `${PREFIX} preview` : EDITOR} ${sub}`;
  const help = {name: cmd(`${head} --help`), reason: 'every option it takes'};
  const read = optionsAsWritten(sub, doc, {group, head});
  // An option given no value is left out of the offered command, unless
  // leaving it out widens what the command acts on (a set without its part
  // styles the whole theme; a preview remove without its page removes the
  // whole preview).
  const valued = (doc.options ?? [])
    .filter(o => /</.test(String(o.flag)))
    .flatMap(o =>
      String(o.flag)
        .split(/[\s,]+/)
        .filter(w => w.startsWith('--'))
        .map(w => w.slice(2)),
    );
  const argv = process.argv;
  const at = argv.indexOf(sub, argv.indexOf(group) + 1);
  const emptied = argv
    .slice(at + 1)
    .filter(
      (w, i, rest) =>
        /^--[a-z-]+$/.test(w) &&
        valued.includes(w.slice(2)) &&
        (rest[i + 1] == null || rest[i + 1].startsWith('-')),
    )
    .map(w => w.slice(2));
  const widens =
    code === 'commander.optionMissingArgument' &&
    (emptied.some(o => NARROWING_OPTIONS.includes(o)) ||
      (group === 'preview' && sub === 'remove'));
  if (read) {
    const lines =
      read.line && !widens
        ? await checkedOptionLines(group, sub, read.line)
        : [];
    return {message: `${read.why}.`, suggestions: [...lines, help]};
  }
  if (code === 'commander.excessArguments' && group === 'preview')
    return previewExtraWords(sub, doc, head);
  if (code !== 'commander.unknownOption' || group !== 'preview')
    return undefined;
  const takes = (doc.options ?? []).flatMap(o =>
    String(o.flag)
      .split(/[\s,]+/)
      .filter(w => w.startsWith('--')),
  );
  const from = argv.indexOf(sub, argv.indexOf('preview') + 1);
  const stray = argv
    .slice(from + 1)
    .find(
      (w, i, rest) =>
        w.startsWith('-') &&
        !rest.slice(0, i).includes('--') &&
        ![...takes, '--json', '--help', '-h'].includes(w.split('=')[0]),
    );
  // A folder name that starts with "-" reads as an option: it goes after
  // --, and that line is the safe one.
  const folder =
    sub === 'app' && stray && /^-[^-]/.test(stray) && stray.length > 2;
  const a = strayAnswer(
    `preview ${sub}`,
    doc,
    head,
    {
      option: stray ?? '',
      ...(folder
        ? {note: 'a folder name that starts with "-" goes after --'}
        : {}),
    },
    folder ? `${head} -- ${stray}` : null,
  );
  return {message: a.message, suggestions: a.suggestions};
}

/**
 * The refusal of options not written as the command takes them, with the
 * command as meant when there is one.
 * @param {string} command
 * @param {{why: string, line: string | null, lines?: Array<{name: string, reason: string}>}} read
 *   `lines`: the commands that carry out the line, checked
 */
function optionsRefusal(command, read) {
  return cliError(`${read.why}.`, {
    suggestions: [
      ...(read.lines ??
        (read.line ? [{name: cmd(read.line), reason: 'do this instead'}] : [])),
      {
        name: cmd(`${EDITOR} ${command} --help`),
        reason: 'every option it takes',
      },
    ],
    code: ERROR_CODES.ERR_INVALID_OPTION,
  });
}

/**
 * {@link optionsAsWritten} as a refusal, or null.
 * @param {string} command
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 */
function readOptions(command, doc) {
  const read = optionsAsWritten(command, doc);
  return read ? optionsRefusal(command, read) : null;
}

/**
 * {@link readOptions} with its line checked as every offered line is, by
 * the command's own checks (set and undo with a repair folded in, new with
 * new's repairs, show's section by show's): a line the command refuses with
 * no repair is not offered.
 * @param {string} command
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 */
async function readOptionsChecked(command, doc) {
  const read = optionsAsWritten(command, doc);
  if (!read) return null;
  const lines = read.line
    ? await checkedOptionLines('editor', command, read.line)
    : [];
  return optionsRefusal(command, {...read, lines});
}

/**
 * Words past what a preview command takes (`preview list overview`,
 * `preview remove colors components`, `preview app my app`), through the
 * one stray reader: the same command without them when that is safe to run
 * (list reads only; app with the words as one folder name, which a
 * folder with a space needs quoted, refused when the folder is not free),
 * never for remove, whose first word alone would remove a page not meant;
 * and always the command's help.
 * @param {string} sub `app`, `list` or `remove`
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @param {string} head the command line's start, as the project runs it
 */
function previewExtraWords(sub, doc, head) {
  const valued = new Set(
    (doc.options ?? [])
      .filter(o => /</.test(String(o.flag)))
      .flatMap(o =>
        String(o.flag)
          .split(/[\s,]+/)
          .filter(w => w.startsWith('-')),
      ),
  );
  const argv = process.argv;
  const from = argv.indexOf(sub, argv.indexOf('preview') + 1);
  /** @type {string[]} */
  const words = [];
  /** @type {string[]} */
  const options = [];
  for (let i = from + 1; from >= 0 && i < argv.length; i++) {
    const w = argv[i];
    if (w === '--') {
      words.push(...argv.slice(i + 1));
      break;
    }
    if (w.startsWith('-')) {
      if (w === '--json') continue;
      options.push(w);
      if (
        valued.has(w.split('=')[0]) &&
        !w.includes('=') &&
        i + 1 < argv.length
      )
        options.push(quoteCommandArgument(argv[++i]));
      continue;
    }
    words.push(w);
  }
  const takes = sub === 'list' ? 0 : 1;
  const extra = words.slice(takes);
  const flags = options.length ? ` ${options.join(' ')}` : '';
  const safe =
    sub === 'list'
      ? `${head}${flags}`
      : sub === 'app' && words.length
        ? `${head} ${quoteCommandArgument(words.join(' '))}${flags}`
        : null;
  const a = strayAnswer(
    `preview ${sub}`,
    doc,
    head,
    {
      extra,
      note:
        sub === 'list'
          ? 'it takes no words'
          : sub === 'app'
            ? 'it takes one folder: a folder name with a space goes in quotes'
            : 'it takes one page; remove pages one at a time',
    },
    safe,
  );
  return {message: a.message, suggestions: a.suggestions};
}

/**
 * Refuse an option `show` does not take with a show that works: the same
 * show without it, and its help (an option the one reader names, and one
 * written with a value, are read first by {@link readOptions}). Null when
 * there is none.
 * @param {string} name
 * @param {unknown[]} rest the words after the theme
 * @param {{png?: boolean, section?: string}} o the options read
 */
function showStray(name, rest, o) {
  // The theme typed as an option (`show --theme t`), as set and undo read
  // it: the show on that theme, never its help alone.
  const asOption = /^--?(?:theme|name)$/i.test(String(name));
  if (asOption && rest.length) {
    const theme = String(rest[0]);
    return strayRefusal(
      'show',
      showDoc,
      `${EDITOR} show`,
      {
        option: String(name),
        note: "the theme is show's first word",
      },
      `${EDITOR} show ${quoteCommandArgument(theme)}${o.section ? ` --section ${o.section}` : ''}${o.png ? ' --png' : ''}`,
    );
  }
  const stray = rest.map(String).find(w => w.startsWith('-'));
  if (stray == null) return null;
  // An option the one reader names never comes here (readOptions reads
  // it first): this one is none show takes, so the show it offers leaves it
  // out and names no guess.
  return strayRefusal(
    'show',
    showDoc,
    `${EDITOR} show`,
    {option: stray},
    `${EDITOR} show ${name}${o.section ? ` --section ${o.section}` : ''}${o.png ? ' --png' : ''}`,
  );
}

/**
 * A refusal for words after what a command takes, which would otherwise be
 * dropped without a word (the one stray reader); null when there are none.
 * @param {string} command
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @param {string[]} extra
 */
function extraWords(command, doc, extra) {
  if (!extra.length) return null;
  return strayRefusal(command, doc, `${EDITOR} ${command}`, {extra});
}

/**
 * Help that explains exactly what a subcommand does: its whole description
 * under the usage line, while the group's list keeps the one-line summary.
 * Token names start with `--`, so set and unset take unknown options as
 * operands.
 * @param {import('commander').Command} c
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @param {{tokens?: boolean}} [options]
 */
function explained(c, doc, {tokens = false} = {}) {
  c.summary(c.description());
  c.description(`[experimental] ${doc.description ?? doc.summary ?? ''}`);
  if (tokens) c.allowUnknownOption(true);
  return c;
}

/** Old and sibling names, and where each now is. */
const MOVED = /** @type {Record<string, Record<string, string>>} */ ({
  theme: {
    build: 'compile',
    set: 'editor set',
    undo: 'editor undo',
    show: 'editor show',
    new: 'editor new',
    how: 'editor how',
    explain: 'editor how',
    reset: 'editor undo',
    palette: 'editor set',
    help: '--help',
  },
  editor: {explain: 'how', reset: 'undo', help: '--help', palette: 'set'},
  preview: {help: '--help'},
});

/**
 * A command group: bare, it prints its help (in JSON too, as the root
 * does); with an unknown word, the unknown-subcommand error, leading with
 * where a moved name now is, then the nearest subcommands.
 * @param {import('commander').Command} parent
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} doc
 * @returns {import('commander').Command}
 */
function defineGroup(parent, doc) {
  /** @type {import('commander').Command} */
  const cmd = defineCommand(parent, doc, {
    action: (
      /** @type {unknown} */ _options,
      /** @type {import('commander').Command} */ c,
    ) => {
      const extras = c?.args ?? [];
      const words = [];
      for (let x = cmd; x && x.parent; x = x.parent) words.unshift(x.name());
      const here = `${getCliInvocation()} ${words.join(' ')}`;
      if (extras.length > 0) {
        const word = String(extras[0]).toLowerCase();
        const group = doc.name.split(' ').at(-1) ?? '';
        const ranked = (cmd.commands ?? [])
          .filter(command => commandAvailable(command, helpBase()))
          .map(command => command.name())
          .sort(
            (a, b) =>
              levenshteinDistance(word, a) - levenshteinDistance(word, b),
          );
        // A typo of a subcommand (lst, remve) is that subcommand; any
        // other word after `preview` that names an editor theme here asks
        // for that theme's pages.
        const typo = typoOf(word, ranked[0] ?? '') ? ranked[0] : null;
        const moved =
          MOVED[group]?.[word] ??
          (typo
            ? null
            : group === 'preview' &&
                editorThemesAt(process.cwd()).includes(word)
              ? `add --theme ${word}`
              : null);
        return cliError(
          `unknown subcommand '${doc.name} ${String(extras[0])}'${moved ? `; it is ${here} ${moved}` : ''}`,
          {
            suggestions: [
              ...(moved
                ? [{name: `${here} ${moved}`, reason: 'do this instead'}]
                : []),
              ...ranked.map(name => ({
                name: `${here} ${name}`,
                reason: 'available subcommand',
              })),
            ],
            code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
          },
        );
      }
      if (c?.optsWithGlobals?.().json) {
        jsonOut(
          /** @type {any} */ ({
            type: 'help',
            data: {
              command: words.join(' '),
              commands: (cmd.commands ?? [])
                .filter(command => commandAvailable(command, helpBase()))
                .map(command => ({
                name: command.name(),
                summary: command.summary() || command.description(),
              })),
            },
          }),
        );
        return NO_RESULT_SET;
      }
      cmd.help();
      return NO_RESULT_SET;
    },
  });
  return cmd;
}

/**
 * A preview command's result, once it is in: this client owns its process,
 * so a stop that lands while the result is printed is held, and a printed
 * ok never ends with exit 130. The API itself leaves no listener behind.
 * @template T
 * @param {Promise<T>} result
 * @returns {Promise<T>}
 */
async function resultStands(result) {
  const r = await result;
  for (const sig of /** @type {const} */ (['SIGINT', 'SIGTERM']))
    if (!process.listeners(sig).includes(heldStop)) process.on(sig, heldStop);
  return r;
}

/** A stop after a preview command finished: its result stands. */
function heldStop() {}

/**
 * Register `theme` and its subcommands under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalTheme(group, program) {
  // A command run with no theme names the app's only theme.
  setEditorThemeList(editorThemesAt);
  setFreeArgument((cwd, words) =>
    words === 'experimental theme editor new'
      ? {
          word: editorFreeName(cwd, 'my-theme'),
          reason: 'a name for the new theme',
        }
      : words === 'experimental theme preview app'
        ? {
            word: quoteCommandArgument(editorFreeAppFolder(cwd)),
            reason: 'a folder for the new app, free here',
          }
        : null,
  );
  setUnknownOptionReader(unknownThemeOption);
  const theme = defineGroup(group, groupDoc);
  explained(theme, groupDoc);
  // The run's base may not serve a line's command; help then leaves it out.
  const overrides = [
    ['experimental theme targets', `  ${getCliInvocation()} experimental theme targets          Every themeable class, with its props and states\n`],
    ['experimental theme editor how', `  ${getCliInvocation()} experimental theme editor how <part>  What one part reads, and the commands that change it\n`],
    ['component <Name>', `  ${getCliInvocation()} component <Name>                    One component's theming table\n`],
  ];
  theme.addHelpText(
    'after',
    () =>
      `\nComponent style overrides:\n` +
      overrides
        .filter(([cli]) => exampleAvailable(program, cli, helpBase()))
        .map(([, line]) => line)
        .join(''),
  );

  const editor = defineGroup(theme, editorDoc);
  explained(editor, editorDoc);

  const newCli = explained(
    defineCommand(editor, newDoc, {
      fn: newFn,
      action: async (
        /** @type {string} */ name,
        /** @type {any} */ o,
        /** @type {any} */ cmd,
      ) =>
        // An option given a value is refused before the run, as for every
        // other editor command: a refusal inside run is thrown, never
        // printed there.
        (await readOptionsChecked('new', newDoc)) ??
        run(
          program,
          async () => {
            // An option new does not take (--force, --dry-run, -t) is refused
            // with new's help, as every editor command's unknown option is.
            const takes = new Set(
              (newDoc.options ?? []).flatMap(opt =>
                String(opt.flag)
                  .split(/[\s,]+/)
                  .filter(w => w.startsWith('-'))
                  .map(w => w.replace(/[<[].*$/, '')),
              ),
            );
            const stray = (cmd?.args ?? [])
              .slice(1)
              .map(String)
              .find(
                (/** @type {string} */ w) =>
                  /^-/.test(w) && !takes.has(w.split('=')[0]),
              );
            if (stray)
              throw new AstryxError(
                `unknown option '${stray}'.`,
                [
                  {
                    name: `${EDITOR} new --help`,
                    reason: 'every option it takes',
                  },
                ],
                ERROR_CODES.ERR_INVALID_OPTION,
              );
            // A word after the name is never dropped without a word.
            const extra = (cmd?.args ?? []).slice(1);
            // The only word given straight after a dial's value (`new --font
            // Open Sans`) is more of that value, and no name was given: the
            // value whole, with a free name, checked as new checks it.
            {
              const argv = process.argv;
              const from = argv.indexOf('new', argv.indexOf('editor') + 1);
              const at = argv.indexOf(String(name), from + 1);
              const before = argv[at - 2];
              const dial = (newDoc.options ?? []).find(
                opt =>
                  opt.param === 'options.settings' &&
                  String(opt.flag).split(' ')[0] === before,
              );
              const key = String(before ?? '')
                .slice(2)
                .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              // Read so only when the word cannot be the name, or the value
              // alone is no value of the dial (`--accent dark blue`).
              if (
                !extra.length &&
                from >= 0 &&
                at > from + 2 &&
                dial &&
                !argv.slice(from + 1, at).includes('--') &&
                (!editorNameOk(String(name)) ||
                  !dialValueFits(before.slice(2), String(o[key])))
              ) {
                const given = {...o, [key]: `${o[key]} ${name}`};
                const free = editorFreeName(process.cwd(), 'my-theme');
                throw new AstryxError(
                  `new takes <theme>, and was given none: "${name}" is more of ${before}'s value. A value of more than one word goes in quotes. Nothing was changed.`,
                  await editorCheckedNewLines(
                    `${EDITOR} new ${free}${newFlagLine(given)}`,
                    free,
                    {
                      cwd: process.cwd(),
                      like: given.like,
                      png: given.png ?? false,
                      settings: newSettingsGiven(given),
                    },
                  ),
                  ERROR_CODES.ERR_MISSING_ARGUMENT,
                );
              }
            }
            if (extra.length) {
              // Words after `--` that are `--<option> <value>` pairs new
              // takes become options; the other words were most likely
              // part of the name. The options given stay in the suggestion.
              /** @type {Record<string, any>} */
              const given = {...o};
              /** @type {string[]} */
              const words = [];
              // Each word in the order typed: one that follows a dial's
              // value with no option between is more of that value, read as
              // set reads it (`--font Open Sans` is the family Open Sans,
              // `--mode Dark Only` the mode dark-only), while a word is left
              // for the name or the name was typed already; a base name
              // (--like) takes one word, and a word after it is a word of the
              // name.
              const valueFlags = new Set(
                (newDoc.options ?? [])
                  .filter(opt => /</.test(String(opt.flag)))
                  .map(opt => String(opt.flag).split(' ')[0]),
              );
              const dialFlags = new Set(
                (newDoc.options ?? [])
                  .filter(opt => opt.param === 'options.settings')
                  .map(opt => String(opt.flag).split(' ')[0]),
              );
              const camel = (/** @type {string} */ f) =>
                f.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              const argv = process.argv;
              const from = argv.indexOf('new', argv.indexOf('editor') + 1);
              /** @type {string | null} */
              let open = null;
              let named = false;
              /** The word typed as the name, where it is not the first. @type {string | null} */
              let nameWord = null;
              /** The words read as more of a value. @type {string[]} */
              const intoValues = [];
              /**
               * Whether a word is left for the name after argv[i]: a later
               * word that is no option's value (`--font Open Sans --like
               * neutral my-theme` leaves my-theme). The last such word is
               * the name.
               * @param {number} i
               */
              const wordLeft = i => {
                for (let j = i + 1; j < argv.length; j++) {
                  const x = argv[j];
                  if (x === '--') return false;
                  if (x.startsWith('-')) {
                    if (valueFlags.has(x.split('=')[0]) && !x.includes('='))
                      j += 1;
                    continue;
                  }
                  return true;
                }
                return false;
              };
              /** Words typed straight after an option's value, past the name. @type {Set<string>} */
              const afterValue = new Set();
              /** An option's value before words that may be extra. @type {Record<string, string>} */
              const extendedFrom = {};
              /** The option the name was typed with (`--theme`), if any. @type {string | null} */
              let nameOption = null;
              for (let i = from + 1; from >= 0 && i < argv.length; i++) {
                const w = argv[i];
                if (w === '--') {
                  // After `--`, `--<option> <value>` pairs new takes.
                  for (let j = i + 1; j < argv.length; j++) {
                    const x = argv[j];
                    if (x.startsWith('--')) {
                      if (argv[j + 1] != null && given[camel(x)] == null)
                        given[camel(x)] = argv[++j];
                    } else words.push(x);
                  }
                  break;
                }
                if (w.startsWith('-')) {
                  const flag = w.split('=')[0];
                  // The name typed as an option (`--theme t2`, `--name t2`):
                  // new takes it as its first word.
                  if (/^--?(theme|name)$/i.test(flag)) {
                    nameOption = flag;
                    open = null;
                    continue;
                  }
                  if (valueFlags.has(flag) && !w.includes('=')) i += 1;
                  open = dialFlags.has(flag) ? camel(flag) : null;
                  continue;
                }
                // Words straight after an option's value are more of it
                // while a later word is left for the name; the name ends the
                // value, and a word after the name is never more of it.
                if (open && !named && wordLeft(i)) {
                  const had = given[open];
                  given[open] = Array.isArray(had)
                    ? [...had.slice(0, -1), `${had.at(-1)} ${w}`]
                    : `${had} ${w}`;
                  intoValues.push(w);
                  continue;
                }
                if (!named) {
                  named = true;
                  if (w !== String(name)) nameWord = w;
                  open = null;
                  continue;
                }
                // After the name, a word is more of an open value only for a
                // dial whose values are words (a font family, a headings
                // style) or a value not finished yet (`rgb(1,`, `Inter,`); a
                // setting's word starts its own setting (`--accent red
                // corners pill`, `--corners pill padding 8px`), read below,
                // and any other word is extra (`--accent red foo`).
                if (open) {
                  const bare = w.toLowerCase().replace(/[:=]+$/, '');
                  const had = String(
                    Array.isArray(given[open])
                      ? given[open].at(-1)
                      : given[open],
                  );
                  const unfinished =
                    (had.match(/\(/g) ?? []).length >
                      (had.match(/\)/g) ?? []).length || /,\s*$/.test(had);
                  if (
                    dialFlags.has(`--${bare}`) ||
                    /^(like|base)$/.test(bare) ||
                    namesSetting(bare)
                  ) {
                    open = null;
                    afterValue.add(w);
                  } else if (!(
                    unfinished || ['font', 'headings'].includes(open)
                  )) {
                    // A word that may be more of the value (`dark blue`)
                    // or extra (`red foo`): the line with it, and if that
                    // line leaves the option out, the value before it.
                    const key = /** @type {string} */ (open);
                    if (!(key in extendedFrom)) extendedFrom[key] = had;
                    afterValue.add(w);
                  }
                }
                if (open) {
                  const had = given[open];
                  given[open] = Array.isArray(had)
                    ? [...had.slice(0, -1), `${had.at(-1)} ${w}`]
                    : `${had} ${w}`;
                  intoValues.push(w);
                  continue;
                }
                words.push(w);
              }
              /** Settings set gives after the theme is made. @type {Array<[string, string]>} */
              const later = [];
              // Settings typed after the name, in any form set reads (`accent
              // red`, `red accent`, `corners=pill`, `like: neutral`, `corners:
              // pill; accent: red`, `'accent red, corners pill'`, a pasted
              // JSON object): each is its option (`--accent red`, `--like
              // neutral`), never part of the name. A dial's value runs to the
              // next setting.
              {
                // A dial word as set reads it: with its colon or equals sign
                // apart from the value (`accent:`), in other letters, or
                // with a typo (`cornres`, the one typo limit); `like` and
                // `base` are the base (--like).
                const dialOf = (/** @type {string} */ w) => {
                  const word = String(w)
                    .trim()
                    .toLowerCase()
                    .replace(/[:=]+$/, '')
                    // A key in quotes (`"like"`, `'accent'`) is that key.
                    .replace(/^(["'])(.*)\1$/, '$2');
                  if (!/^[a-z][a-z-]*$/.test(word)) return null;
                  if (word === 'like' || word === 'base') return 'like';
                  if (dialFlags.has(`--${word}`)) return camel(`--${word}`);
                  const near = [...dialFlags].filter(f =>
                    typoOf(word, f.slice(2)),
                  );
                  return near.length === 1 ? camel(near[0]) : null;
                };
                /** The flag word a dial word reads as. @param {string} w */
                const dialName = w =>
                  String(dialOf(w)).replace(
                    /[A-Z]/g,
                    c => `-${c.toLowerCase()}`,
                  );
                /**
                 * A key, a value or a word without the quotes around it
                 * (`"accent"`, `'base neutral'`); a text that holds a quote
                 * of its own (`"like": "neutral"`) keeps them, since its
                 * ends are two quotes, not one pair.
                 * @param {string} x
                 */
                const unquote = x => {
                  const t = String(x).trim();
                  const m = /^(["'])([\s\S]*)\1$/.exec(t);
                  return m && !m[2].includes(m[1]) ? m[2] : t;
                };
                /**
                 * The settings one typed word holds, each `[dial, value]`: a
                 * JSON object, `key=value` or `key: value` pairs, or `dial
                 * value` items, apart at `;` or `,`; null when it holds none.
                 * @param {string} rawWord
                 * @returns {Array<[string, string]> | null}
                 */
                const pairsIn = (/** @type {string} */ rawWord) => {
                  // A word with its own quotes around it (`'base neutral'`,
                  // `"accent"`) is that word, as the shell would have given
                  // it: the quotes are no part of a name.
                  const w = unquote(rawWord);
                  /** @type {unknown} */
                  let json;
                  try {
                    json = /^\s*\{/.test(w) ? JSON.parse(w) : undefined;
                  } catch {
                    json = undefined;
                  }
                  const entries =
                    json && typeof json === 'object' && !Array.isArray(json)
                      ? Object.entries(json)
                      : [];
                  if (entries.length)
                    return entries.every(
                      ([k]) => dialOf(k) || namesSetting(unquote(k)),
                    )
                      ? entries.map(([k, v]) => [k, String(v)])
                      : null;
                  // `key=value`, `key: value`, keys and values in quotes or
                  // not (`"like": "neutral"`), in either order (`red=accent`,
                  // `stone=like`), as set reads a pair swapped; `like` is
                  // never a value (`neutral=like` is the base neutral).
                  // Pairs apart at `;`, or at a comma when a key comes next
                  // (`like: neutral, corners: pill`); a comma inside a value
                  // (`font: Inter, Arial`) is the value's.
                  const byColon = w
                    .split(/\s*;\s*|\s*,\s*(?=["']?[a-z][a-z-]*["']?\s*[=:])/i)
                    .map(x =>
                      /^((["'])[a-z-]+\2|[a-z0-9#(][^=:]*?)\s*[=:]\s*(.+)$/i.exec(
                        x.trim(),
                      ),
                    );
                  /** @type {Array<[string, string]>} */
                  const read = [];
                  // (No pair at all: the `dial value` items below.)
                  for (const m of byColon.some(Boolean) ? byColon : []) {
                    if (!m) return null;
                    const [k, v] = [unquote(m[1]), unquote(m[3])];
                    if (dialOf(v) === 'like' && !dialOf(k)?.startsWith('like'))
                      read.push([v, k]);
                    else if (dialOf(k) || namesSetting(k)) read.push([k, v]);
                    else if (dialOf(v) && !/\s/.test(v)) read.push([v, k]);
                    else return null;
                  }
                  if (read.length) return read;
                  // `'accent red'`, `'accent red, corners pill'`, `'base
                  // neutral'`.
                  if (!/\s/.test(w.trim())) return null;
                  const items = w
                    .split(/\s*[;,]\s*/)
                    .map(x => x.trim().split(/\s+/))
                    .filter(x => x[0]);
                  return items.length &&
                    items.every(
                      x =>
                        x.length > 1 &&
                        (dialOf(x[0]) || namesSetting(unquote(x[0]))),
                    )
                    ? items.map(x => [unquote(x[0]), x.slice(1).join(' ')])
                    : null;
                };
                /** @type {string[]} */
                const kept = [];
                /** @type {Array<[string, string]>} */
                const pairs = [];
                /** The pasted pair a later word continues, or -1. */
                let pasted = -1;
                for (const w of words) {
                  const found = pairsIn(w);
                  if (found) {
                    pairs.push(...found);
                    // A value typed on across words (`font=Inter, Arial`)
                    // runs to the next setting, as `font Inter, Arial` does.
                    pasted = /^\s*\{/.test(w) ? -1 : pairs.length - 1;
                    continue;
                  }
                  if (pasted >= 0 && !dialOf(w) && !namesSetting(w)) {
                    pairs[pasted][1] = `${pairs[pasted][1]} ${w}`;
                    continue;
                  }
                  pasted = -1;
                  // A word quoted on its own (`"accent"`) keeps no quotes.
                  kept.push(unquote(w));
                }
                // `accent red`: a dial word, and its value up to the next
                // setting; `red accent`: a value, then the dial it is for (as
                // set reads the two swapped); a dial word with no value is
                // never a word of the name.
                /** @type {string[]} */
                const rest = [];
                /** @type {string[]} */
                const bare = [];
                const isSetting = (/** @type {string} */ w) =>
                  Boolean(dialOf(w)) ||
                  namesSetting(String(w).replace(/[:=]+$/, ''));
                for (let i = 0; i < kept.length; i++) {
                  // The base takes the one word after it (`like neutral`,
                  // whose base shares its name with a dial).
                  if (dialOf(kept[i]) === 'like' && kept[i + 1] != null) {
                    pairs.push([kept[i], kept[i + 1]]);
                    i += 1;
                    continue;
                  }
                  const builtIn = (/** @type {string} */ w) =>
                    builtInThemes().includes(String(w).toLowerCase());
                  // A built-in theme's name is the base, whatever word is
                  // beside it (`theme neutral`, `neutral stone`): the base
                  // reader below takes it, never a dial of the same name.
                  if (builtIn(kept[i])) {
                    rest.push(kept[i]);
                    continue;
                  }
                  if (dialOf(kept[i])) {
                    const value = [];
                    let j = i + 1;
                    while (
                      j < kept.length &&
                      !isSetting(kept[j]) &&
                      !builtIn(kept[j])
                    )
                      value.push(kept[j++]);
                    if (value.length) pairs.push([kept[i], value.join(' ')]);
                    else bare.push(kept[i]);
                    i = j - 1;
                    continue;
                  }
                  if (
                    !isSetting(kept[i]) &&
                    kept[i + 1] != null &&
                    dialOf(kept[i + 1]) &&
                    !builtIn(kept[i + 1]) &&
                    (kept[i + 2] == null || isSetting(kept[i + 2]))
                  ) {
                    pairs.push([kept[i + 1], kept[i]]);
                    i += 1;
                    continue;
                  }
                  rest.push(kept[i]);
                }
                for (const [k, v] of pairs) {
                  // A setting new has no option for (`padding: 8px`) is a
                  // set after the theme is made, as the space form is.
                  if (!dialOf(k)) {
                    later.push([unquote(k), v]);
                    intoValues.push(`${unquote(k)} ${v}`);
                    continue;
                  }
                  const key = /** @type {string} */ (dialOf(k));
                  if (given[key] == null) given[key] = v;
                  intoValues.push(`${dialName(k)} ${v}`);
                }
                intoValues.push(...bare);
                // A setting new takes no option for (`padding 8px`): set
                // gives it after the theme is made, never a word of the name.
                const named = [];
                for (let i = 0; i < rest.length; i++) {
                  const thing = rest[i].replace(/[:=]+$/, '');
                  // (A built-in theme's name is the base, read below.)
                  if (
                    namesSetting(thing) &&
                    !builtInThemes().includes(thing.toLowerCase()) &&
                    rest[i + 1] != null
                  ) {
                    const value = [];
                    let j = i + 1;
                    while (j < rest.length && !isSetting(rest[j]))
                      value.push(rest[j++]);
                    later.push([thing, value.join(' ')]);
                    intoValues.push(`${thing} ${value.join(' ')}`);
                    i = j - 1;
                    continue;
                  }
                  // A word typed after an option's value that no reading
                  // takes is extra, never a word of the name.
                  if (afterValue.has(rest[i])) {
                    intoValues.push(rest[i]);
                    continue;
                  }
                  named.push(rest[i]);
                }
                words.splice(0, words.length, ...named);
              }
              // A built-in theme among the words (after a `like` word, or
              // typed as the name with the real name after it) is the base,
              // as --like; every other word is part of the name.
              const all = [nameWord ?? String(name), ...words];
              const baseAt = all.findIndex(
                (w, i) =>
                  builtInThemes().includes(w.toLowerCase()) &&
                  (i > 0 || all.length > 1),
              );
              if (baseAt >= 0 && given.like == null)
                given.like = all[baseAt].toLowerCase();
              // (`base stone` and `theme stone` are the base as `like
              // stone` is; a second base typed is no word of the name.)
              const nameWords = all.filter(
                (w, i) =>
                  i !== baseAt &&
                  !(
                    baseAt >= 0 &&
                    /^(like|base|theme)[:=]?$/i.test(w) &&
                    i === baseAt - 1
                  ) &&
                  !(
                    baseAt >= 0 &&
                    i > baseAt &&
                    builtInThemes().includes(w.toLowerCase())
                  ),
              );
              const fixed = nameWords
                .join('-')
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-');
              // The line is checked as every new line is offered.
              const read = Object.keys(given).some(k => given[k] !== o[k]);
              const linesFor = () =>
                editorCheckedNewLines(
                  `${EDITOR} new ${quoteCommandArgument(fixed)}${newFlagLine(given)}`,
                  fixed,
                  {
                    cwd: process.cwd(),
                    like: given.like,
                    png: given.png ?? false,
                    settings: newSettingsGiven(given),
                  },
                );
              let lines = await linesFor();
              // A value a later word made one no reading takes (`--accent
              // red foo`): the value before it, the word extra.
              const lost = Object.keys(extendedFrom).filter(
                k =>
                  !lines.some(x =>
                    x.name.includes(
                      ` --${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} `,
                    ),
                  ),
              );
              if (lost.length) {
                for (const k of lost) given[k] = extendedFrom[k];
                lines = await linesFor();
              }
              throw new AstryxError(
                // (Only the name typed as an option, nothing extra: say that.)
                nameOption &&
                  !(nameWord ? [...intoValues, ...words] : extra).join('')
                  ? `${nameOption} is no option of new: the theme name is new's first word. Nothing was changed.`
                  : `new takes one theme name; "${(nameWord ? [...intoValues, ...words] : extra).join(' ')}" is extra.${read ? ' A value of more than one word goes in quotes.' : ''} For a base theme, use --like. Nothing was changed.`,
                [
                  ...lines,
                  // A CSS property is written on a part: the ask that
                  // names the parts, never a set line set itself refuses.
                  ...later.map(([thing, value]) =>
                    needsPart(thing)
                      ? {
                          name: `${HOW} ${quoteCommandArgument(`${value} ${thing}`)}`,
                          reason: `then this: new takes no ${thing}, and set writes it on a part (--on)`,
                        }
                      : {
                          name: `${EDITOR} set ${quoteCommandArgument(fixed)} ${quoteCommandArgument(thing)} ${quoteCommandArgument(value)}`,
                          reason: `then this: new takes no ${thing}; set gives it`,
                        },
                  ),
                ],
                ERROR_CODES.ERR_INVALID_ARGUMENT,
              );
            }
            return themeEditNew(name, {
              cwd: process.cwd(),
              like: o.like,
              png: o.png ?? false,
              settings: newSettings(o, name),
            });
          },
          r => [
            `[ok] made theme "${r.data.theme}"${r.data.like ? ` on top of ${r.data.like}` : ''}`,
            ...missedLine(/** @type {any} */ (r.data)),
            ...changeFields(
              /** @type {any} */ (
                (({missed: _m, missedParts: _p, missedOn: _o, ...x}) => x)(
                  /** @type {any} */ (r.data),
                )
              ),
            ),
            `Tip: ${EDITOR} set ${r.data.theme} <thing> <value>, or ${HOW} "<what you want>"`,
            `Look at it after each change (this changes nothing in your app): ${EDITOR} show ${r.data.theme} --png writes themes/${r.data.theme}/preview.png (a sample page), sheet-overlays.png (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, open) and a picture of each family of components the theme sets a part of (sheet-actions.png, the buttons, while it sets none) from real components, and --section <family> --png pictures any other family (actions, inputs, selection, navigation, feedback, data, containers); open the family pictures, preview.png and sheet-overlays.png and check them against the request`,
          ],
        ),
    }),
    newDoc,
  );
  // new refuses an option it does not take itself, naming its help.
  newCli.allowUnknownOption();

  explained(
    defineCommand(editor, setDoc, {
      fn: setFn,
      action: (
        /** @type {string} */ name,
        /** @type {string} */ thing,
        /** @type {string[]} */ value,
        /** @type {any} */ o,
      ) => {
        // A declaration pasted as one argument (`--color-accent: #e11d48`,
        // or `--color-accent:#e11d48`) is the token and its value; with no
        // value otherwise, the missing-argument error the parser gives.
        // A pasted JSON object of settings goes to the editor whole, which
        // gives one set line per entry.
        if (!value.length && /^\s*\{/.test(thing)) value = [''];
        // Several pasted lines in one argument, each a declaration or the
        // editor's own printed or change line, go to the editor whole: its
        // entry reader reads each line.
        if (!value.length) {
          const lines = thing.split(/\r?\n/).filter(l => l.trim());
          if (lines.length > 1 && lines.every(l => /[:=]|->|\u2192/.test(l)))
            value = [''];
        }
        if (!value.length) {
          // Any thing, a token or a dial, with `:` or `=` (`accent: red`,
          // `--color-accent=#e11d48`).
          // A thing and its value in one word (`'corners pill'`) are the
          // same as given apart.
          // A declaration goes to the editor whole: its one reader splits
          // it, and reads the scope of the editor's own printed line
          // (`corners = pill (whole theme)`).
          if (/^(\S+?)\s*[:=]\s*(.+?);?\s*$/.test(thing)) value = [''];
          else {
            const pasted = /^\s*(\S+)\s+(.+?)\s*$/.exec(thing);
            if (!pasted)
              return missingSetValue(
                editor.commands.find(c => c.name() === 'set'),
              );
            thing = pasted[1];
            value = [pasted[2]];
          }
        }
        return (async () =>
          (await readOptionsChecked('set', setDoc)) ??
          // A token typed after its value (`set t 4px --radius-element`)
          // is no option: the set reads the two in the other order.
          (value.length === 1 &&
          /^--[a-z0-9-]+$/i.test(value[0]) &&
          !thing.startsWith('-')
            ? null
            : strayOption('set', setDoc, value)) ??
          run(
            program,
            () => themeEditSet(name, thing, value.join(' '), changeOptions(o)),
            changeBlocks,
          ))();
      },
    }),
    setDoc,
    {tokens: true},
  );

  explained(
    defineCommand(editor, showDoc, {
      fn: showFn,
      action: async (
        /** @type {string} */ name,
        /** @type {any} */ o,
        /** @type {any} */ c,
      ) =>
        (await readOptionsChecked('show', showDoc)) ??
        showStray(name, (c?.args ?? []).slice(1), o) ??
        extraWords('show', showDoc, (c?.args ?? []).slice(1)) ??
        // The sheet is limited to one section (the docs say so): a second
        // --section is refused, never kept over the first in silence.
        (new Set(flagValues('section')).size > 1
          ? cliError(
              `--section limits the sheet to one section, and was given ${flagValues('section').length} (${flagValues('section').join(', ')}); give one, or none for the whole sheet.`,
              {
                suggestions: [
                  {
                    // The first section given that `show` takes, else the
                    // whole sheet.
                    name: cmd(
                      `${EDITOR} show ${name}${(sec => (sec ? ` --section ${sec}` : ''))(flagValues('section').find(v => showSections().includes(v)))}`,
                    ),
                    reason: 'do this instead',
                  },
                ],
                code: ERROR_CODES.ERR_INVALID_ARGUMENT,
              },
            )
          : null) ??
        run(
          program,
          () =>
            themeEditShow(name, {
              cwd: process.cwd(),
              png: o.png ?? false,
              section: o.section,
            }),
          r => showBlocks(r.data),
        ),
    }),
    showDoc,
    // An unknown option reaches the action, which names a show that works.
    {tokens: true},
  );

  explained(
    defineCommand(editor, undoDoc, {
      fn: undoFn,
      action: (
        /** @type {string} */ name,
        /** @type {string | undefined} */ thing,
        /** @type {string | undefined} */ which,
        /** @type {any} */ o,
        /** @type {import('commander').Command} */ c,
      ) =>
        (async () => {
          // "undo t accent, corners and spacing" unquoted: the words make one
          // list of settings, read as the quoted list is.
          const words = [thing, which, ...(c?.args ?? []).slice(3)].filter(
            w => typeof w === 'string',
          );
          // Three or more bare words that each name a setting are a list
          // too (`undo t accent corners spacing`); a setting with a value of
          // several words (`font Inter Tight`) is not.
          // Commas or "and" make a list only when each item starts with a
          // setting's name: a value with commas typed unquoted, as set takes
          // it (`border-color rgb(1, 2, 3)`, `font Inter, Arial`), is that
          // setting's value.
          const items = words
            .map(String)
            .join(' ')
            .split(/\s*,\s*|\s+and\s+/)
            .filter(Boolean);
          const listed =
            words.length > 1 &&
            ((words.some(
              (w, i) => /,$/.test(String(w)) || (i > 0 && w === 'and'),
            ) &&
              items.length > 1 &&
              items.every(item => namesSetting(item.split(/\s+/)[0]))) ||
              (words.length > 2 &&
                words.every(w => namesSetting(String(w))))) &&
            !words.some(w => String(w).startsWith('-'));
          const list = listed ? words.join(' ') : null;
          // Otherwise the words after the thing are its value, typed
          // unquoted as set takes it (`undo t padding 4px 8px --on card`).
          const value =
            which == null
              ? undefined
              : [which, ...(c?.args ?? []).slice(3)].map(String).join(' ');
          return (
            (await readOptionsChecked('undo', undoDoc)) ??
            (list
              ? null
              : strayOption('undo', undoDoc, [
                  which,
                  ...(c?.args ?? []).slice(3),
                ])) ??
            run(
              program,
              () =>
                themeEditUndo(name, {
                  ...changeOptions(o),
                  ...(list != null
                    ? {thing: list}
                    : thing == null
                      ? {}
                      : {thing, value}),
                }),
              r =>
                r.data.action === 'step'
                  ? [
                      // What was undone is in the headline, so a tail of
                      // the output keeps it.
                      ...(() => {
                        const {newProblems = [], ...rest} = /** @type {any} */ (
                          r.data
                        );
                        return [
                          `[ok] ${rest.theme}: undid ${rest.undid ?? 'the last change'}${rest.refusedBefore ? ` (${rest.refusedBefore})` : ''}${newProblems.length ? `, but it made ${newProblems.length} new problem${newProblems.length > 1 ? 's' : ''}:` : ''}`,
                          ...(newProblems.length
                            ? problemList(newProblems)
                            : []),
                          ...changeFields(rest),
                        ];
                      })(),
                    ]
                  : changeBlocks(
                      /** @type {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeResponse} */ (
                        r
                      ),
                    ),
            )
          );
        })(),
    }),
    undoDoc,
    {tokens: true},
  );

  const preview = defineGroup(theme, previewDoc);
  explained(preview, previewDoc);

  explained(
    defineCommand(preview, previewAddDoc, {
      fn: previewAddFn,
      action: (
        /** @type {string[] | string | undefined} */ words,
        /** @type {any} */ o,
      ) =>
        run(
          program,
          () =>
            previewFlagsOnce('add', ['theme', 'template', 'top', 'path']) ??
            previewOptionsRead('add', previewAddDoc) ??
            resultStands(
              themeEditPreviewAdd([words ?? []].flat().join(' ') || undefined, {
                cwd: process.cwd(),
                theme: o.theme,
                template: o.template,
                top: o.top,
                path: o.path,
              }),
            ),
          r => {
            const {matched, skipped, ...rest} = r.data;
            return [
              `[ok] theme preview in ${r.data.folder}: ${
                [
                  ...(r.data.added.length
                    ? [`added ${r.data.added.join(', ')}`]
                    : []),
                  ...(r.data.refreshed.length
                    ? [
                        `${r.data.refreshed.join(', ')} ${r.data.refreshed.length > 1 ? 'were' : 'was'} there already and ${r.data.refreshed.length > 1 ? 'are' : 'is'} written again`,
                      ]
                    : []),
                ].join('; ') || 'pages refreshed'
              }`,
              ...project(/** @type {any} */ (rest)),
              ...(matched.length
                ? [section('matched:'), records(matched)]
                : []),
              ...(skipped.length
                ? [
                    section('skipped:'),
                    records(skipped.map(s => flatRecord(s))),
                  ]
                : []),
            ];
          },
        ),
    }),
    previewAddDoc,
  );

  explained(
    defineCommand(preview, previewAppDoc, {
      fn: previewAppFn,
      action: (/** @type {string} */ dir, /** @type {any} */ o) =>
        run(
          program,
          () =>
            previewFlagsOnce('app', ['theme']) ??
            previewOptionsRead('app', previewAppDoc) ??
            resultStands(
              themeEditPreviewApp(dir, {
                cwd: process.cwd(),
                theme: o.theme,
              }),
            ),
          r => [
            `[ok] new app in ${r.data.folder} with the theme preview`,
            ...project(/** @type {any} */ (r.data)),
          ],
        ),
    }).allowExcessArguments(false),
    previewAppDoc,
  );

  explained(
    defineCommand(preview, previewListDoc, {
      fn: previewListFn,
      action: (/** @type {any} */ o) =>
        run(
          program,
          () =>
            previewFlagsOnce('list', ['path']) ??
            themeEditPreviewList({cwd: process.cwd(), path: o.path}),
          r =>
            r.data.folder
              ? project(
                  /** @type {any} */ ({
                    ...r.data,
                    // A page whose file is gone says so in words.
                    pages: r.data.pages.map(({missing, ...p}) =>
                      missing ? {...p, file: 'missing'} : p,
                    ),
                  }),
                )
              : [
                  ...project(/** @type {any} */ (r.data)),
                  // A folder add refuses has a note that says why instead.
                  ...(r.data.notes.some(
                    n =>
                      n.includes(' refuses this folder') ||
                      n.startsWith('no preview here; '),
                  )
                    ? []
                    : [
                        `Tip: ${PREFIX} preview add${o.path == null ? '' : ` --path ${quoteCommandArgument(String(o.path))}`}`,
                      ]),
                ],
          r =>
            resultSet({
              count: r.data.pages.length,
              resultKind: 'mixed',
              empty: r.data.pages.length === 0,
            }),
        ),
    }).allowExcessArguments(false),
    previewListDoc,
  );

  explained(
    defineCommand(preview, previewRemoveDoc, {
      fn: previewRemoveFn,
      action: (/** @type {string | undefined} */ page, /** @type {any} */ o) =>
        run(
          program,
          () =>
            previewFlagsOnce('remove', ['path']) ??
            resultStands(
              themeEditPreviewRemove(page, {cwd: process.cwd(), path: o.path}),
            ),
          r => [
            // The headline says what happened: a page still listed, or a
            // preview nothing was removed from, was not removed.
            r.data.pages.some(
              p => p.toLowerCase() === String(page ?? '').toLowerCase(),
            )
              ? `[ok] nothing was removed: ${page} stays in the theme preview`
              : r.data.pages.length
                ? `[ok] removed ${page} from the theme preview`
                : r.data.removed.length
                  ? `[ok] removed the theme preview in ${r.data.folder}`
                  : `[ok] nothing was removed: the theme preview in ${r.data.folder} stays`,
            ...project(/** @type {any} */ (r.data)),
          ],
        ),
    }).allowExcessArguments(false),
    previewRemoveDoc,
  );

  explained(
    defineCommand(editor, howDoc, {
      fn: howFn,
      action: async (/** @type {string[]} */ words, /** @type {any} */ o) => {
        if (!words.length && !o.list && !(o.at ?? []).length) {
          const c = editor.commands.find(
            x => x.name() === howDoc.name.split(' ').pop(),
          );
          // In JSON mode outputHelp prints the help envelope.
          if (program.opts().json) c?.outputHelp();
          else
            print([
              `Usage: ${HOW} [<part|setting|"question"|picture.png>] [--theme <name>] [--at x,y] [--list dials|tokens|parts|groups|properties [filter]]`,
              '',
              'Examples:',
              ...(howDoc.examples ?? []).flatMap(e => [
                `  # ${e.label}`,
                `  ${e.cli}`,
              ]),
            ]);
          return NO_RESULT_SET;
        }
        // `--list=tokens` and a second --list are mistakes of form.
        /** @type {string[]} */
        const raw = /** @type {any} */ (program).rawArgs ?? process.argv;
        const listFlags = raw.filter(
          w => w === '--list' || w.startsWith('--list='),
        );
        const themeFlags = raw.filter(
          w => w === '--theme' || w.startsWith('--theme='),
        );
        if (themeFlags.length > 1)
          return cliError('--theme is given twice; give it once.', {
            suggestions: [
              {name: cmd(`${HOW} --help`), reason: 'give --theme once'},
            ],
            code: ERROR_CODES.ERR_INVALID_ARGUMENT,
          });
        if (listFlags.length > 1)
          return cliError('--list is given twice; give it once.', {
            suggestions: [
              {
                name: cmd(`${HOW} --list tokens accent`),
                reason: 'one list, then the filter',
              },
            ],
            code: ERROR_CODES.ERR_INVALID_ARGUMENT,
          });
        let list = o.list;
        let rest = [...words];
        const eq = rest.find(w => w.startsWith('--list='));
        if (eq) {
          list = true;
          rest = [eq.slice('--list='.length), ...rest.filter(w => w !== eq)];
        }
        if (list) {
          // The kind is the first word that names one ("accent --list
          // tokens" too); the other words filter, and may start with --.
          const kinds =
            /^(dials?|tokens?|parts?|groups?|propert(y|ies)|kinds?)$/i;
          const at = rest.findIndex(w => kinds.test(w));
          const kind = at >= 0 ? rest[at] : (rest[0] ?? '');
          const filter = (
            at >= 0 ? rest.filter((_, i) => i !== at) : rest.slice(1)
          )
            .filter(w => w !== '--')
            .join(' ');
          return run(
            program,
            () =>
              themeEditHow(filter, {
                cwd: process.cwd(),
                list: kind,
                at: o.at ?? [],
                theme: o.theme,
              }),
            r => lookupBlocks(/** @type {any} */ (r.data)),
            r => {
              const n = /** @type {any} */ (r.data).items.length;
              return resultSet({count: n, resultKind: 'mixed', empty: n === 0});
            },
          );
        }
        // The API decides what the words are (a picture and a count, or a
        // question); a picture is told by its extension here only to keep
        // option words after it for the count.
        const picture = /\.png$/i.test(rest[0] ?? '');
        const stray = picture
          ? null
          : (readOptions(howDoc.name.split(' ').pop() ?? 'how', howDoc) ??
            strayOption('how', howDoc, rest.slice(1)));
        if (stray) return stray;
        return run(
          program,
          () =>
            themeEditHow(rest.join(' '), {
              cwd: process.cwd(),
              at: o.at ?? [],
              words: rest,
              theme: o.theme,
            }),
          r => lookupBlocks(/** @type {any} */ (r.data)),
          r => {
            const d = /** @type {any} */ (r.data);
            const n =
              d.kind === 'list'
                ? d.items.length
                : d.kind === 'question'
                  ? d.results.length
                  : 1;
            return resultSet({count: n, resultKind: 'mixed', empty: n === 0});
          },
        );
      },
    }),
    howDoc,
    {tokens: true},
  );

  registerThemeSubcommands(
    theme,
    program,
    {
      build: compileDoc,
      list: listDoc,
      add: addDoc,
      remove: removeDoc,
      use: useDoc,
      eject: ejectDoc,
      template: templateDoc,
      targets: targetsDoc,
    },
    {
      group: 'experimental theme',
      build: 'compile',
      explain: editorThemeRefusal,
      preflight: editorCompileProblem,
      follow: editorFollowCompile,
      missingSource: editorMissingSource,
      template: editorThemeTemplate,
      hold: editorThemeHold,
      loadedFonts: editorLoadedFonts,
      extraData: editorBuildExtra,
      afterBuild: editorAfterBuild,
      sourcePath: editorSourcePath,
      fontHelp: editorFontHelp,
      install: editorInstall,
      colorModes: editorColorModes,
    },
  );
}

/**
 * The error for `set` given a theme and a thing but no value: the parser's
 * missing-argument report, from the one builder it uses.
 * @param {any} cmd the set command
 * @returns {never}
 */
function missingSetValue(cmd) {
  const {message, suggestions} = editorMissingArgument(
    cmd,
    ['theme', 'thing', 'value'],
    'value',
  );
  return cliError(message, {
    code: ERROR_CODES.ERR_MISSING_ARGUMENT,
    suggestions,
  });
}
