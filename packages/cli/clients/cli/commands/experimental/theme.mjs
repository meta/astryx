// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme` — make and change a theme one checked
 * change at a time. Experimental (spec:AST-017 FR27): it is registered only
 * under the `experimental` group.
 *
 * The command surface comes from the colocated CommandDocs via
 * `defineCommand`; this file reads flags, calls the theme-edit API, and
 * prints its receipt.
 *
 * Usage:
 *   astryx experimental theme new brand --like neutral
 *   astryx experimental theme set brand corners pill
 *   astryx experimental theme explain "white text in the banner"
 */

import {getCliInvocation} from '../../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../../foundation/response/json.mjs';
import {NO_RESULT_SET, resultSet} from '../../../../foundation/debug/index.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {emit, text} from '../../formatters/index.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {
  themeEditExplain,
  themeEditNew,
  themeEditPreview,
  themeEditReset,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from '../../../../api/theme-edit/theme-edit.mjs';
import {registerThemeSubcommands} from '../theme.mjs';
import {doc as groupDoc} from '../experimental-theme.doc.mjs';
import {doc as newDoc} from '../experimental-theme-new.doc.mjs';
import {doc as setDoc} from '../experimental-theme-set.doc.mjs';
import {doc as resetDoc} from '../experimental-theme-reset.doc.mjs';
import {doc as showDoc} from '../experimental-theme-show.doc.mjs';
import {doc as undoDoc} from '../experimental-theme-undo.doc.mjs';
import {doc as previewDoc} from '../experimental-theme-preview.doc.mjs';
import {doc as explainDoc} from '../experimental-theme-explain.doc.mjs';
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
import {doc as resetFn} from '../../../../api/theme-edit/themeEditReset.doc.mjs';
import {doc as showFn} from '../../../../api/theme-edit/themeEditShow.doc.mjs';
import {doc as undoFn} from '../../../../api/theme-edit/themeEditUndo.doc.mjs';
import {doc as previewFn} from '../../../../api/theme-edit/themeEditPreview.doc.mjs';
import {doc as explainFn} from '../../../../api/theme-edit/themeEditExplain.doc.mjs';

const PREFIX = 'astryx experimental theme';

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
      `[ok] ${d.theme}: ${d.action === 'set' ? describe(s) : `reset ${describe(s)} to the base theme's value`}${d.replaced ? ` (was ${d.replaced.value})` : ''}`,
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
 * The text of an explain answer, by its kind.
 * @param {any} d
 * @returns {string[]}
 */
function explainLines(d) {
  if (d.kind === 'question') {
    if (!d.results.length) {
      return [
        `No match for "${d.subject}". Name the part (header, nav links, card, button, banner, input...) and what to change (text color, background, gradient, corners, border, shadow, spacing, bold). Or: ${PREFIX} explain --list parts`,
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
              `(the common ones; any standard CSS property works: ${PREFIX} explain <filter> --list properties)`,
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
      `What a part reads: ${PREFIX} explain <part>`,
    ];
  }
  return d.lines;
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
 * Register `theme` and its subcommands under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalTheme(group, program) {
  /** @type {import('commander').Command} */
  const theme = defineCommand(group, groupDoc, {
    action: (
      /** @type {unknown} */ _options,
      /** @type {import('commander').Command} */ c,
    ) => {
      const extras = c?.args ?? [];
      if (extras.length > 0) {
        return cliError(
          `unknown subcommand 'experimental theme ${String(extras[0])}'`,
          {
            suggestions: (theme.commands ?? []).map(command => ({
              name: command.name(),
              reason: 'available subcommand',
            })),
            code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
          },
        );
      }
      theme.help();
      return NO_RESULT_SET;
    },
  });
  explained(theme, groupDoc);
  theme.addHelpText(
    'after',
    `\nComponent style overrides:\n` +
      `  ${getCliInvocation()} experimental theme targets      Every themeable class, with its props and states\n` +
      `  ${getCliInvocation()} experimental theme explain <part>  What one part reads, and the commands that change it\n` +
      `  ${getCliInvocation()} component <Name>                One component's theming table\n`,
  );

  explained(
    defineCommand(theme, newDoc, {
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
            `  next: ${PREFIX} set ${r.data.theme} <thing> <value>   (${PREFIX} explain "<what you want>")`,
          ],
        ),
    }),
    newDoc,
  );

  explained(
    defineCommand(theme, setDoc, {
      fn: setFn,
      action: (
        /** @type {string} */ name,
        /** @type {string} */ thing,
        /** @type {string[]} */ value,
        /** @type {any} */ o,
      ) =>
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
    defineCommand(theme, resetDoc, {
      fn: resetFn,
      action: (
        /** @type {string} */ name,
        /** @type {string} */ thing,
        /** @type {string | undefined} */ which,
        /** @type {any} */ o,
      ) =>
        run(
          program,
          () =>
            themeEditReset(name, thing, {...changeOptions(o), value: which}),
          changeLines,
        ),
    }),
    resetDoc,
    {tokens: true},
  );

  explained(
    defineCommand(theme, showDoc, {
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
    defineCommand(theme, undoDoc, {
      fn: undoFn,
      action: (/** @type {string} */ name, /** @type {any} */ o) =>
        run(
          program,
          () => themeEditUndo(name, {cwd: process.cwd(), png: o.png ?? false}),
          r => [
            `[ok] ${r.data.theme}: undid the last change${r.data.undone.length ? `: ${r.data.undone.join('; ')}` : ''}`,
            `  now ${r.data.settings} settings; ${r.data.stepsLeft} earlier change${r.data.stepsLeft === 1 ? '' : 's'} can still be undone`,
            `  preview: ${r.data.preview}`,
            ...pictureLines(r.data),
          ],
        ),
    }),
    undoDoc,
  );

  explained(
    defineCommand(theme, previewDoc, {
      fn: previewFn,
      action: (/** @type {string} */ name, /** @type {any} */ o) =>
        run(
          program,
          () =>
            themeEditPreview(name, {
              cwd: process.cwd(),
              write: o.write,
              group: o.group,
              png: o.png ?? false,
            }),
          r => [
            r.data.mode === 'page'
              ? `[ok] wrote the theme-building page for ${r.data.theme} into the app (${r.data.components} components): ${r.data.files.join(', ')}. Serve it from a route to build the theme in the browser.`
              : `[ok] rendered the theme-building page for ${r.data.theme} (${r.data.components} components): ${r.data.html}`,
            ...r.data.skipped.map(x => `  left out: ${x}`),
            ...pictureLines(r.data),
          ],
        ),
    }),
    previewDoc,
  );

  explained(
    defineCommand(theme, explainDoc, {
      fn: explainFn,
      action: (/** @type {string[]} */ words, /** @type {any} */ o) => {
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
            themeEditExplain(subject, {
              cwd: process.cwd(),
              list: o.list,
              at: o.at ?? [],
              count,
            }),
          r => explainLines(/** @type {any} */ (r.data)),
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
    explainDoc,
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
