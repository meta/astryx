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
import {emit, text} from '../../formatters/index.mjs';
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
import {doc as paletteDoc} from '../experimental-theme-palette.doc.mjs';
import {doc as paletteGenerateDoc} from '../experimental-theme-palette-generate.doc.mjs';
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

/** Print lines as one block. @param {string[]} lines */
const print = lines => emit(text(lines.map(cmd).join('\n')));

/**
 * Run one API call: errors become the CLI error envelope, results go to
 * JSON or to `render`.
 * @template T
 * @param {import('commander').Command} program
 * @param {() => Promise<T>} call
 * @param {(result: T) => string[]} render
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
  print(render(result));
  return answered;
}

/** @param {{pictures: string[], pictureProblem: string | null}} d */
const pictureLines = d => [
  ...(d.pictures.length ? [`  pictures: ${d.pictures.join(', ')}`] : []),
  ...(d.pictureProblem ? [`  pictures: none. ${d.pictureProblem}`] : []),
];

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
 * The receipt of a set or unset.
 * @param {import('../../../../api/theme-edit/theme-edit.type.mjs').ThemeEditChangeResponse} r
 */
function changeLines(r) {
  const d = r.data;
  const s = d.setting;
  /** @type {string[]} */
  const lines = [];
  if (d.was != null)
    lines.push(`[ok] ${d.theme}: ${s.thing} ${d.was} -> ${s.value}`);
  else
    lines.push(
      `[ok] ${d.theme}: ${d.action === 'set' ? describe(s) : `undid ${describe(s)}: back to the base theme's value`}${d.replaced ? ` (was ${d.replaced.value})` : ''}`,
    );
  if (d.family)
    lines.push(
      `  applied to the ${d.family.name} family: ${d.family.members.join(', ')}${d.family.onlyHint && s.on && !s.only ? ` (add --only to style just ${s.on})` : ''}`,
    );
  for (const n of d.notes) lines.push(`  note: ${n}`);
  if (d.changedTokens.length) {
    lines.push(
      `  resolved changes (${d.changedTokens.length}):`,
      ...d.changedTokens.slice(0, 8).map(c => `    ${c}`),
    );
    if (d.changedTokens.length > 8)
      lines.push(`    ... ${d.changedTokens.length - 8} more (--json for all)`);
  }
  if (d.styled.length) {
    lines.push(
      `  styled (${d.styled.length}):`,
      ...d.styled.slice(0, 8).map(c => `    ${c}`),
    );
    if (d.styled.length > 8)
      lines.push(`    ... ${d.styled.length - 8} more (--json for all)`);
  }
  if (!d.changedTokens.length && !d.styled.length && d.was == null)
    lines.push('  no visible change: the theme already looked this way');
  for (const k of d.kept)
    lines.push(`  kept (a part setting beats the whole-theme dial): ${k}`);
  if (d.lifted.length) {
    const keys = [
      ...new Set(d.lifted.map(x => x.split(' ').slice(0, 2).join(' '))),
    ];
    lines.push(
      `  also applied to ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ` and ${keys.length - 6} more` : ''}: the base theme styles those separately, so the plain setting alone would lose there`,
    );
  }
  for (const w of d.warnings) lines.push(`  build: ${w}`);
  for (const p of d.problems) lines.push(`  contrast: ${p}`);
  lines.push(`  preview: ${d.preview}`, ...pictureLines(d));
  return lines;
}

/**
 * The text of a lookup answer, by its kind.
 * @param {any} d
 * @returns {string[]}
 */
function lookupLines(d) {
  if (d.kind === 'question') {
    if (!d.results.length) {
      return [
        `No match for "${d.subject}". Name the part (header, nav links, card, button, banner, input...) and what to change (text color, background, gradient, corners, border, shadow, spacing, bold). Or: ${HOW} --list parts`,
      ];
    }
    return [
      `"${d.subject}" -> parts: ${d.understood.parts.join(', ') || 'whole theme'}; aspects: ${d.understood.aspects.join(', ') || '?'}`,
      ...d.results.flatMap((/** @type {any} */ x) => [
        `  ${x.text}`,
        ...x.commands.map((/** @type {string} */ c) => `    ${c}`),
      ]),
    ];
  }
  if (d.kind === 'aspect')
    return [
      `${d.subject} for the whole theme:`,
      ...d.results.flatMap((/** @type {any} */ x) => [
        `  ${x.text}`,
        ...x.commands.map((/** @type {string} */ c) => `    ${c}`),
      ]),
    ];
  if (d.kind === 'picture') {
    if (d.points)
      return [
        `colors in ${d.file} (${d.width}x${d.height}) at:`,
        ...d.points.map(
          (/** @type {any} */ c) =>
            `  (${c.at})  ${c.color ?? 'outside the picture'}`,
        ),
      ];
    return [
      `main colors in ${d.file} (${d.width}x${d.height}; share of the picture, where):`,
      ...d.colors.map(
        (/** @type {any} */ c) => `  ${c.color}  ${c.share}%  ${c.where}`,
      ),
    ];
  }
  if (d.kind === 'list') {
    const items = /** @type {any[]} */ (d.items);
    if (d.list === 'dials')
      return items.flatMap(x => [
        `${x.name}: ${x.values}`,
        `  ${x.help}`,
        ...x.examples.map((/** @type {string} */ e) => `  e.g. ${e}`),
      ]);
    if (d.list === 'families')
      return items.map(
        x =>
          `${x.name}: ${x.members.join(', ')}${x.spreads ? '  (styling one styles all; --only to opt out)' : '  (--on the family styles all)'}`,
      );
    if (d.list === 'properties')
      return [
        ...items.map(x => x.name),
        ...(d.common
          ? [
              `(the common ones; any standard CSS property works: ${HOW} <filter> --list properties)`,
            ]
          : []),
      ];
    if (d.list === 'tokens')
      return items.map(
        x =>
          `${x.name}  [${x.type}] default ${x.default}; read by ${x.readBy} parts`,
      );
    return [
      ...items.map(
        x =>
          `${x.name}  (${x.component})${x.family ? ` [${x.family}]` : ''}${Object.entries(
            /** @type {Record<string, string[]>} */ (x.variants),
          )
            .map(
              ([p, v]) => `  --when ${p}:${v.length ? v.join('|') : '<value>'}`,
            )
            .join(
              '',
            )}${x.states.length ? `  --state ${x.states.join('|')}` : ''}${x.recorded ? '' : '  (no compiled record: changes on it are not checked)'}`,
      ),
      `What a part reads: ${HOW} <part>`,
    ];
  }
  return d.lines;
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
            }),
          r => [
            `[ok] made theme "${r.data.theme}"${r.data.like ? ` on top of ${r.data.like}` : ''}: ${r.data.files.settings} (owned by this command) -> ${r.data.files.source} -> ${r.data.files.css}`,
            ...r.data.problems.map(p => `  contrast: ${p}`),
            `  preview: ${r.data.preview}`,
            ...pictureLines(r.data),
            `  next: ${EDITOR} set ${r.data.theme} <thing> <value>   (${HOW} "<what you want>")`,
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
          changeLines,
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
              group: o.group,
            }),
          r => {
            const d = r.data;
            const modes =
              d.mode === 'light-only'
                ? ['light']
                : d.mode === 'dark-only'
                  ? ['dark']
                  : ['light', 'dark'];
            return [
              `theme "${d.theme}"${d.like ? ` (on top of ${d.like})` : ''}, mode ${d.mode}, ${d.settings.length} settings:`,
              ...d.settings.map(
                (s, i) =>
                  `  ${i + 1}. [${s.source}] ${describe(s)}${s.parts.length > 1 ? `  -> ${s.parts.length} parts` : ''}`,
              ),
              `key values (${modes.join(' / ')}):`,
              ...Object.entries(d.resolved).map(
                ([k, v]) =>
                  `  ${k}: ${modes.map(m => v[m] ?? '-').join(' / ')}`,
              ),
              ...(d.problems.length
                ? d.problems.map(p => `contrast: ${p}`)
                : ['problems: none caused by this theme']),
              ...d.notes.map(n => `note: ${n}`),
              `preview (sample app page): ${d.preview}`,
              `every component (theme-building page, ${d.sheetComponents} components): ${d.sheet}`,
              ...d.skipped.map(x => `  left out: ${x}`),
              ...pictureLines(d),
            ];
          },
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
                  `[ok] ${r.data.theme}: undid the last change${r.data.undone.length ? `: ${r.data.undone.join('; ')}` : ''}`,
                  `  now ${r.data.settings} settings; ${r.data.stepsLeft} earlier change${r.data.stepsLeft === 1 ? '' : 's'} can still be undone`,
                  `  preview: ${r.data.preview}`,
                  ...pictureLines(r.data),
                ]
              : changeLines(
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
          r => [
            `[ok] theme preview in ${r.data.folder}: ${r.data.added.length ? `added ${r.data.added.join(', ')}` : 'pages refreshed'}; pages: ${r.data.pages.join(', ')}`,
            `  theme: ${r.data.theme ?? "the app's own"}`,
            ...r.data.notes.map(n => `  note: ${n}`),
            `  open: ${r.data.open}`,
          ],
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
              overwrite: o.overwrite ?? false,
            }),
          r => [
            `[ok] new app in ${r.data.folder} (${r.data.files.length} files) with the theme preview; pages: ${r.data.pages.join(', ')}`,
            `  theme: ${r.data.theme ?? "the app's own neutral theme"}`,
            ...r.data.notes.map(n => `  note: ${n}`),
            `  open: ${r.data.open}`,
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
              ? [
                  `theme preview in ${r.data.folder} (theme: ${r.data.theme ?? "the app's own"}):`,
                  ...r.data.pages.map(p => `  ${p.id}  ${p.label}`),
                ]
              : [`no theme preview yet: ${PREFIX} preview add`],
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
              ? `[ok] removed ${page} from the theme preview; pages: ${r.data.pages.join(', ')}`
              : `[ok] removed the theme preview in ${r.data.folder}`,
            ...r.data.removed.map(f => `  deleted ${f}`),
          ],
        ),
    }),
    previewRemoveDoc,
  );

  explained(
    defineCommand(editor, howDoc, {
      fn: howFn,
      action: async (/** @type {string[]} */ words, /** @type {any} */ o) => {
        if (!words.length && o.list == null && !(o.at ?? []).length) {
          const c = editor.commands.find(
            x => x.name() === howDoc.name.split(' ').pop(),
          );
          // In JSON mode outputHelp prints the help envelope.
          if (program.opts().json) c?.outputHelp();
          else
            print([
              `Usage: ${HOW} [<part|setting|"question"|picture.png>] [--at x,y] [--list dials|tokens|parts|families|properties]`,
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
        const subject = count == null ? words.join(' ') : words[0];
        return run(
          program,
          () =>
            themeEditHow(subject, {
              cwd: process.cwd(),
              list: o.list,
              at: o.at ?? [],
              count,
            }),
          r => lookupLines(/** @type {any} */ (r.data)),
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
      palette: paletteDoc,
      paletteGenerate: paletteGenerateDoc,
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
