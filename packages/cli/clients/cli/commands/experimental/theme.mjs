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

const PREFIX = 'astryx experimental theme';
const EDITOR = `${PREFIX} editor`;
/** The lookup command, named once: its CommandDoc's last word. */
const HOW = `${EDITOR} ${howDoc.name.split(' ').pop()}`;

/**
 * Commands in a line, with the run prefix this project uses.
 * @param {string} line
 */
const cmd = line =>
  line.split(PREFIX).join(`${getCliInvocation()} experimental theme`);

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
    return cliError(err.message, {
      suggestions: err.suggestions,
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
  print([...notCheckedLine(result), ...render(result)]);
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
 * @returns {Record<string, string>}
 */
function newSettings(o) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const opt of newDoc.options ?? []) {
    if (opt.param !== 'options.settings') continue;
    const name = opt.flag.split(' ')[0].slice(2);
    const value = o[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    if (value != null) out[name] = String(value);
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
  if (d.kind === 'question' && !d.results.length)
    return [
      `No match for "${d.subject}". Name the part (header, nav links, card, button, banner, input...) and what to change (text color, background, gradient, corners, border, shadow, spacing, bold).`,
      ...project(d),
      `Tip: ${HOW} --list parts`,
    ];
  return project(d);
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
  const word = rest.find(w => typeof w === 'string' && w.startsWith('--'));
  if (word == null) return null;
  return cliError(
    `unknown option '${word}': only the thing a change names may start with -- (a design token such as --color-accent).`,
    {
      suggestions: [
        {name: `${EDITOR} ${command} --help`, reason: 'every option it takes'},
      ],
      code: ERROR_CODES.ERR_INVALID_OPTION,
    },
  );
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

/**
 * A command group: bare, it prints its help; with an unknown word, the
 * unknown-subcommand error with every subcommand as a suggestion.
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
      if (extras.length > 0) {
        return cliError(
          `unknown subcommand '${doc.name} ${String(extras[0])}'`,
          {
            suggestions: (cmd.commands ?? []).map(command => ({
              name: command.name(),
              reason: 'available subcommand',
            })),
            code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
          },
        );
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
      action: (/** @type {string} */ name, /** @type {any} */ o) =>
        run(
          program,
          () =>
            themeEditNew(name, {
              cwd: process.cwd(),
              like: o.like,
              png: o.png ?? false,
              settings: newSettings(o),
            }),
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
      action: (/** @type {string} */ name, /** @type {any} */ o) =>
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
              top: o.top == null ? undefined : Number(o.top),
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
    }),
    previewAppDoc,
  );

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
                  `Tip: ${PREFIX} preview add`,
                ],
          r =>
            resultSet({
              count: r.data.pages.length,
              resultKind: 'mixed',
              empty: r.data.pages.length === 0,
            }),
        ),
    }),
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
    }),
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
              `Usage: ${HOW} [<part|setting|"question"|picture.png>] [--at x,y] [--list dials|tokens|parts|groups|properties [filter]]`,
              '',
              'Examples:',
              ...(howDoc.examples ?? []).flatMap(e => [
                `  # ${e.label}`,
                `  ${e.cli}`,
              ]),
            ]);
          return NO_RESULT_SET;
        }
        const stray = strayOption('how', words.slice(1));
        if (stray) return stray;
        // A number after a picture is how many colors to list.
        const count =
          words.length === 2 &&
          /\.png$/i.test(words[0]) &&
          /^\d+$/.test(words[1])
            ? Number(words[1])
            : undefined;
        // --list is a switch, as everywhere in the CLI: the first word is
        // what to list, and the rest filters it.
        const subject = o.list
          ? words.slice(1).join(' ')
          : count == null
            ? words.join(' ')
            : words[0];
        return run(
          program,
          () =>
            themeEditHow(subject, {
              cwd: process.cwd(),
              list: o.list ? (words[0] ?? '') : undefined,
              at: o.at ?? [],
              count,
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
    {group: 'experimental theme', build: 'compile'},
  );
}
