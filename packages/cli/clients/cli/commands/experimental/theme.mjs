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
  newFlagList,
  editorCompileProblem,
  editorThemeHold,
  editorThemeRefusal,
  showSections,
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

/** @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditSetting} s */
function describe(s) {
  const where = s.on
    ? ` on ${s.on}${s.only ? ' only' : ''}${s.when ? ` when ${s.when}` : ''}${s.state ? ` :${s.state}` : ''}`
    : ' (whole theme)';
  return `${s.thing} = ${s.value}${where}${s.mode ? ` [${s.mode} only]` : ''}`;
}

/**
 * The flags of a change, from Commander's options.
 * @param {any} o
 */
const changeOptions = o => ({
  cwd: process.cwd(),
  on: o.on,
  when: o.when,
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
      // The suggestion keeps the first value the dial takes, or drops it.
      const fits = all.find(v => dialValueFits(flag, v));
      throw new AstryxError(
        `--${flag} was given twice (${all.join(', ')}); give it once. Nothing was changed.`,
        [
          {
            name: cmd(
              `${EDITOR} new ${themeName}${newFlagLine({...o, [key]: fits})}`,
            ),
            reason: fits
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
 * The options a `new` was given, as flags for a suggested command, so a
 * corrected command makes the theme that was asked for.
 * @param {any} o
 * @returns {string}
 */
function newFlagLine(o) {
  /** @type {Record<string, string | string[]>} */
  const settings = {};
  for (const opt of newDoc.options ?? []) {
    if (opt.param !== 'options.settings') continue;
    const flag = opt.flag.split(' ')[0].slice(2);
    const value = o[flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    if (value != null) settings[flag] = value;
  }
  const parts = newFlagList(
    o.like == null ? undefined : String(o.like),
    settings,
    Boolean(o.png),
  );
  return parts.length ? ` ${parts.join(' ')}` : '';
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
 * The receipt of a change: a status line, then the change data.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeResponse} r
 */
function changeBlocks(r) {
  const d = r.data;
  const s = d.setting;
  const status =
    d.was != null
      ? `[ok] ${d.theme}: ${s.thing} ${d.was} -> ${s.value}`
      : `[ok] ${d.theme}: ${d.action === 'set' ? describe(s) : `removed ${describe(s)}; now ${/** @type {any} */ (d).now ?? "the base theme's value"} applies`}`;
  // On undo, `setting` and `removed` both name the setting removed, as in
  // the JSON; the status line says the base theme's value is back.
  return [status, ...project(/** @type {any} */ (d))];
}

/**
 * The text of `show`: the theme, then each color with its seed and the shade
 * each token uses, the notes on moved shades, and the generated files last.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditShowResponse['data']} d
 */
function showBlocks(d) {
  const {settings, colors, colorNotes, colorFiles, ...rest} = d;
  const [head, ...others] = project(/** @type {any} */ (rest));
  return [
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
    colorFiles
      ? [section('colorFiles:'), record(colorFiles)]
      : record({colorFiles: 'none'}),
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
 * @param {Array<string | undefined>} rest the operands after the thing
 * @returns {ReturnType<typeof cliError> | null}
 */
function strayOption(command, rest) {
  // A scope flag given twice would keep only the last one without a word.
  for (const flag of ['on', 'when', 'state', 'mode']) {
    const all = flagValues(flag);
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
  const word = rest.find(w => typeof w === 'string' && w.startsWith('--'));
  if (word == null) return null;
  return cliError(
    `unknown option '${word}': only the thing a change names may start with -- (a design token such as --color-accent).`,
    {
      suggestions: [
        {
          name: cmd(`${EDITOR} ${command} --help`),
          reason: 'every option it takes',
        },
      ],
      code: ERROR_CODES.ERR_INVALID_OPTION,
    },
  );
}

/**
 * A refusal for words after what a command takes, which would otherwise be
 * dropped without a word; null when there are none.
 * @param {string} command
 * @param {string[]} extra
 */
function extraWords(command, extra) {
  if (!extra.length) return null;
  return cliError(`${command} does not take "${extra.join(' ')}".`, {
    suggestions: [
      {name: cmd(`${EDITOR} ${command} --help`), reason: 'what it takes'},
    ],
    code: ERROR_CODES.ERR_INVALID_ARGUMENT,
  });
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
        const moved =
          MOVED[group]?.[word] ??
          // `preview <theme>`: the pages for a theme.
          (group === 'preview' && /^[a-z][a-z0-9-]*$/.test(word)
            ? `add --theme ${word}`
            : null);
        const ranked = (cmd.commands ?? [])
          .map(command => command.name())
          .sort(
            (a, b) =>
              levenshteinDistance(word, a) - levenshteinDistance(word, b),
          );
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
              commands: (cmd.commands ?? []).map(command => ({
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
 * Register `theme` and its subcommands under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalTheme(group, program) {
  const theme = defineGroup(group, groupDoc);
  explained(theme, groupDoc);
  theme.addHelpText(
    'after',
    `\nComponent style overrides:\n` +
      `  ${getCliInvocation()} experimental theme targets          Every themeable class, with its props and states\n` +
      `  ${getCliInvocation()} experimental theme editor how <part>  What one part reads, and the commands that change it\n` +
      `  ${getCliInvocation()} component <Name>                    One component's theming table\n`,
  );

  const editor = defineGroup(theme, editorDoc);
  explained(editor, editorDoc);

  explained(
    defineCommand(editor, newDoc, {
      fn: newFn,
      action: (
        /** @type {string} */ name,
        /** @type {any} */ o,
        /** @type {any} */ cmd,
      ) =>
        run(
          program,
          () => {
            // A word after the name is never dropped without a word.
            const extra = (cmd?.args ?? []).slice(1);
            if (extra.length) {
              // Words after `--` that are `--<option> <value>` pairs new
              // takes become options; the other words were most likely
              // part of the name. The options given stay in the suggestion.
              /** @type {Record<string, unknown>} */
              const given = {...o};
              /** @type {string[]} */
              const words = [];
              for (let i = 0; i < extra.length; i++) {
                const w = String(extra[i]);
                if (w.startsWith('--')) {
                  const key = w
                    .slice(2)
                    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                  if (extra[i + 1] != null && given[key] == null)
                    given[key] = extra[++i];
                  continue;
                }
                words.push(w);
              }
              const builtIn =
                words.length && builtInThemes().includes(words[0]);
              if (builtIn && given.like == null) given.like = words[0];
              const fixed = builtIn
                ? name
                : [name, ...words]
                    .join('-')
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, '-');
              throw new AstryxError(
                `new takes one theme name; "${extra.join(' ')}" is extra. For a base theme, use --like. Nothing was changed.`,
                [
                  {
                    name: `${EDITOR} new ${quoteCommandArgument(fixed)}${newFlagLine(given)}`,
                    reason: 'do this instead',
                  },
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
            ...project(/** @type {any} */ (r.data)),
            `Tip: ${EDITOR} set ${r.data.theme} <thing> <value>, or ${HOW} "<what you want>"`,
          ],
        ),
    }),
    newDoc,
  );

  explained(
    defineCommand(editor, setDoc, {
      fn: setFn,
      action: (
        /** @type {string} */ name,
        /** @type {string} */ thing,
        /** @type {string[]} */ value,
        /** @type {any} */ o,
      ) =>
        strayOption('set', value) ??
        run(
          program,
          () => themeEditSet(name, thing, value.join(' '), changeOptions(o)),
          changeBlocks,
        ),
    }),
    setDoc,
    {tokens: true},
  );

  explained(
    defineCommand(editor, showDoc, {
      fn: showFn,
      action: (
        /** @type {string} */ name,
        /** @type {any} */ o,
        /** @type {any} */ c,
      ) =>
        extraWords('show', (c?.args ?? []).slice(1)) ??
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
        strayOption('undo', [which, ...(c?.args ?? []).slice(3)]) ??
        extraWords('undo', (c?.args ?? []).slice(3)) ??
        run(
          program,
          () =>
            themeEditUndo(name, {
              ...changeOptions(o),
              ...(thing == null ? {} : {thing, value: which}),
            }),
          r =>
            r.data.action === 'step'
              ? [
                  `[ok] ${r.data.theme}: undid the last change`,
                  ...project(/** @type {any} */ (r.data)),
                ]
              : changeBlocks(
                  /** @type {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeResponse} */ (
                    r
                  ),
                ),
        ),
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
            themeEditPreviewAdd([words ?? []].flat().join(' ') || undefined, {
              cwd: process.cwd(),
              theme: o.theme,
              template: o.template,
              top: o.top,
              path: o.path,
            }),
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
            themeEditPreviewApp(dir, {
              cwd: process.cwd(),
              theme: o.theme,
            }),
          r => [
            `[ok] new app in ${r.data.folder} with the theme preview`,
            ...project(/** @type {any} */ (r.data)),
          ],
        ),
    }).allowExcessArguments(false),
    previewAppDoc,
  );
  {
    // A folder name that starts with "-" reads as an option: say how to
    // pass it.
    const app = /** @type {any} */ (
      preview.commands.find(
        (/** @type {any} */ x) =>
          x.name() === previewAppDoc.name.split(' ').pop(),
      )
    );
    const unknown = app?.unknownOption?.bind(app);
    if (app && unknown)
      app.unknownOption = (/** @type {string} */ flag) =>
        /^-[^-]/.test(flag) && flag.length > 2
          ? app.error(
              `error: unknown option '${flag}'. A folder name that starts with "-" goes after --: ${PREFIX} preview app -- ${flag}`,
              {code: 'commander.unknownOption'},
            )
          : unknown(flag);
  }

  explained(
    defineCommand(preview, previewListDoc, {
      fn: previewListFn,
      action: (/** @type {any} */ o) =>
        run(
          program,
          () => themeEditPreviewList({cwd: process.cwd(), path: o.path}),
          r =>
            r.data.folder
              ? project(/** @type {any} */ (r.data))
              : [
                  ...project(/** @type {any} */ (r.data)),
                  `Tip: ${PREFIX} preview add${o.path == null ? '' : ` --path ${quoteCommandArgument(String(o.path))}`}`,
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
            themeEditPreviewRemove(page, {cwd: process.cwd(), path: o.path}),
          r => [
            r.data.pages.length
              ? `[ok] removed ${page} from the theme preview`
              : `[ok] removed the theme preview in ${r.data.folder}`,
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
        const stray = picture ? null : strayOption('how', rest.slice(1));
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
      hold: editorThemeHold,
    },
  );
}
