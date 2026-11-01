// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme command — Commander wiring for `astryx theme` (build/list/add).
 *
 * Thin CLI wrapper. The `build` compiler lives in the programmatic API
 * (../../api/theme/build/build.mjs); `list`/`add` delegate to the
 * ../../api/theme/list/list.mjs and ../../api/theme/add/add.mjs leaves. This
 * file only parses options, injects a logger, renders human output, maps
 * AstryxError → cliError, and turns reported private-variable errors into exit 1
 * after preserving the build output. Watch mode (a human-interactive,
 * long-running loop) stays here because it re-invokes `theme build` as a child
 * process.
 *
 * The command surface (group + subcommand descriptions, args, flags) is sourced
 * from the colocated CommandDocs via `defineCommand`; this file supplies only
 * the actions (and the group's unknown-subcommand guard).
 *
 * Usage:
 *   astryx theme build ./src/themes/ocean.ts
 *   astryx theme build ./src/themes/ocean.ts --out ./dist/ocean.css
 *   astryx theme build ./src/themes/*.ts
 *   astryx theme build --family ./src/themes/ocean.ts ./src/themes/ocean-calm.ts --family-key ocean-family
 *
 * Ordinary builds take one or more theme files. Each is compiled by the same
 * single-file API call, in argument order, in one process — so the outputs are
 * byte-identical to running the CLI once per theme, and the first failure stops
 * the run exactly as a shell loop under `set -e` would. Family mode delegates
 * the selected files once to the API's in-memory family orchestration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {
  emit,
  section,
  text,
  record,
  records,
  code,
  list,
} from '../formatters/index.mjs';
import {logger} from '../../../api/logger.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {themeAdd} from '../../../api/theme/add/add.mjs';
import {themeRemove} from '../../../api/theme/remove/remove.mjs';
import {themeUse} from '../../../api/theme/use/use.mjs';
import {themeEject} from '../../../api/theme/eject/eject.mjs';
import {themeTemplate} from '../../../api/theme/template/template.mjs';
import {
  themeListAvailable,
  themeListCopySources,
} from '../../../api/theme/list/list.mjs';
import {themeTargets} from '../../../api/theme/targets/targets.mjs';
import {
  serializePaletteCandidate,
  themePaletteGenerate,
} from '../../../api/theme/palette/generate/generate.mjs';
import {
  printBatchTrailer,
  printCompactTrailer,
  themeBuild,
  themeBuildFamily,
  themeBuildForReport,
} from '../../../api/theme/build/build.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {NO_RESULT_SET, resultSet} from '../../../foundation/debug/index.mjs';
import {doc as themeGroup} from './theme.doc.mjs';
import {doc as themeBuildCommand} from './theme-build.doc.mjs';
import {doc as themeListCommand} from './theme-list.doc.mjs';
import {doc as themeAddCommand} from './theme-add.doc.mjs';
import {doc as themeRemoveCommand} from './theme-remove.doc.mjs';
import {doc as themeUseCommand} from './theme-use.doc.mjs';
import {doc as themeEjectCommand} from './theme-eject.doc.mjs';
import {doc as themeTemplateCommand} from './theme-template.doc.mjs';
import {doc as themeTargetsCommand} from './theme-targets.doc.mjs';
import {doc as themePaletteGroup} from './theme-palette.doc.mjs';
import {doc as themePaletteGenerateCommand} from './theme-palette-generate.doc.mjs';
import {doc as themeBuildFn} from '../../../api/theme/themeBuild.doc.mjs';
import {doc as themeListFn} from '../../../api/theme/themeListAvailable.doc.mjs';
import {doc as themeAddFn} from '../../../api/theme/themeAdd.doc.mjs';
import {doc as themeRemoveFn} from '../../../api/theme/themeRemove.doc.mjs';
import {doc as themeUseFn} from '../../../api/theme/themeUse.doc.mjs';
import {doc as themeEjectFn} from '../../../api/theme/themeEject.doc.mjs';
import {doc as themeTemplateFn} from '../../../api/theme/themeTemplate.doc.mjs';
import {doc as themeTargetsFn} from '../../../api/theme/themeTargets.doc.mjs';
import {doc as themePaletteGenerateFn} from '../../../api/theme/themePaletteGenerate.doc.mjs';

/**
 * Path to this CLI's real entry (clients/cli/bin/astryx.mjs), resolved from
 * this module's location (clients/cli/commands/theme.mjs → ../bin/
 * astryx.mjs). Used to re-invoke `theme build` as a child process in watch mode.
 */
function resolveCliBin() {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(commandsDir, '../bin/astryx.mjs');
}

/**
 * Run a single `theme build` as a child process, reusing the exact
 * single-build code path (and its error handling) rather than duplicating it.
 * Resolves with the child's exit code; never rejects.
 *
 * @param {string} file - The theme file argument, as the user passed it.
 * @param {{out?: string, iconsSpecifier?: string, detail?: string}} options -
 *   Parsed command options that affect generated output, plus the detail
 *   level the user chose.
 * @param {(child: import('node:child_process').ChildProcess) => void} [onSpawn] -
 *   Receives the child, so a watcher that stops can stop it too.
 * @returns {Promise<number>}
 */
function runThemeBuildOnceChild(file, options, onSpawn) {
  const cliBin = resolveCliBin();
  // A detail level the user chose applies to every rebuild.
  const args = options.detail
    ? [cliBin, '--detail', options.detail, 'theme', 'build', file]
    : [cliBin, 'theme', 'build', file];
  if (options.out) args.push('--out', options.out);
  if (options.iconsSpecifier)
    args.push('--icons-specifier', options.iconsSpecifier);
  return new Promise((/** @type {(code: number) => void} */ resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
    });
    onSpawn?.(child);
    child.on('close', code => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

/**
 * Watch theme files and rebuild on change. Runs an initial build of each, then
 * rebuilds (debounced) the file that changed, until interrupted with Ctrl-C.
 * Rebuilds are serialized: one at a time, in the order the changes arrived, so
 * the log stays readable. Each rebuild runs in a child process so a build error
 * (which the single-build path reports via a hard exit) is contained and the
 * watcher keeps running. Stopping ends the watch at once: queued changes are
 * dropped, the signal reaches a rebuild in progress, as Ctrl-C in a terminal
 * reaches the whole process group, and "Stopped watching." is the last line.
 *
 * @param {Array<{file: string, filePath: string}>} entries - The theme file
 *   arguments as the user passed them, with their resolved absolute paths.
 * @param {{out?: string, iconsSpecifier?: string, detail?: string}} options - Parsed command options, plus the detail level the user chose.
 * @returns {Promise<void>} Resolves when the watcher is stopped (Ctrl-C).
 */
async function runThemeBuildWatch(entries, options) {
  const rel = (/** @type {string} */ filePath) =>
    path.relative(process.cwd(), filePath);
  const watchingLine = `\nWatching ${entries
    .map(e => rel(e.filePath))
    .join(', ')} for changes — press Ctrl-C to stop.`;

  // Initial build.
  for (const entry of entries) {
    await runThemeBuildOnceChild(entry.file, options);
  }

  let building = false;
  let stopped = false;
  /** @type {import('node:child_process').ChildProcess | null} */
  let rebuildChild = null;
  /** @type {Promise<void> | null} */
  let rebuildDone = null;
  /** @type {Set<{file: string, filePath: string}>} */
  const queued = new Set();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const debounces = new Map();

  /** @param {{file: string, filePath: string}} entry */
  const rebuild = async entry => {
    if (stopped) return;
    if (building) {
      // Coalesce changes that land mid-build into a single follow-up run.
      queued.add(entry);
      return;
    }
    building = true;
    emit(text(`\nChange detected — rebuilding ${rel(entry.filePath)}...`));
    const done = runThemeBuildOnceChild(entry.file, options, child => {
      rebuildChild = child;
    });
    rebuildDone = done.then(() => {});
    await done;
    rebuildChild = null;
    rebuildDone = null;
    building = false;
    // A stop during this build has already ended the watch.
    if (stopped) return;
    emit(text(watchingLine));
    const next = queued.values().next();
    if (!next.done) {
      queued.delete(next.value);
      rebuild(next.value);
    }
  };

  // Some editors replace the file (rename) rather than writing in place, which
  // can drop the watch. Watch the containing directory and filter to our file
  // so edits survive atomic-save/rename.
  const watchers = entries.map(entry => {
    const baseName = path.basename(entry.filePath);
    return fs.watch(path.dirname(entry.filePath), (_eventType, changed) => {
      if (changed && changed !== baseName) return;
      clearTimeout(debounces.get(entry.filePath));
      // Debounce: editors often emit several events per save.
      debounces.set(
        entry.filePath,
        setTimeout(() => rebuild(entry), 100),
      );
    });
  });

  // Announce readiness only AFTER fs.watch is armed — the log is the "safe to
  // edit" signal (tests and humans rely on it), so printing it before the watch
  // is registered would race: a change in that gap is silently missed.
  emit(text(watchingLine));

  await new Promise((/** @type {(value?: void) => void} */ resolve) => {
    let stopping = false;
    /** @param {NodeJS.Signals} signal */
    const stop = async signal => {
      // A second interrupt while stopping (a terminal's Ctrl-C and the same
      // signal passed on by the copy that started the run) changes nothing.
      if (stopping) return;
      stopping = true;
      stopped = true;
      queued.clear();
      for (const d of debounces.values()) clearTimeout(d);
      for (const w of watchers) w.close();
      // A rebuild in progress would otherwise keep the process alive after
      // "Stopped watching.". In a terminal, Ctrl-C already reached it.
      rebuildChild?.kill(signal);
      await rebuildDone;
      emit(text('\nStopped watching.'));
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

/**
 * Print the standard integration issue nudge without changing command results.
 * @param {boolean} json
 */
async function warnOnThemeIntegrationIssues(json) {
  try {
    const project = await Project.load(process.cwd());
    await project.themes();
    await warnOnIntegrationIssues(project, {json});
  } catch {
    // Never let the nudge break the command.
  }
}

/**
 * Print cleanup-stage `theme add --list`. Its JSON stays the released
 * `theme.list`; its text names the cleanup commands (AST-050 FR12).
 * @param {import('../../../api/theme/theme.type.mjs').ThemeListEntry[]} themes
 */
function printThemeAddList(themes) {
  const run = getCliInvocation();
  // `theme list` shows what this project can add now. Themes in packages it
  // has not installed are `discover`'s.
  const more = text(
    `More themes in packages you could add: ${run} discover theme`,
  );
  if (themes.length === 0) {
    emit(text('No themes are available in this project.'), more);
    return;
  }
  emit(
    section('Themes'),
    list(
      themes.map(theme => {
        const status = theme.maintained ? 'maintained' : 'example';
        const head = `${theme.slug} (${status}, ${theme.package})`;
        return theme.description ? [head, theme.description] : head;
      }),
    ),
    text(themeNextSteps(run)),
    more,
  );
}

/**
 * What to do with a listed theme. Outside a project there is no app to add one
 * to, so only the fork step is named (spec AST-081 FR3).
 * @param {string} run the CLI invocation
 * @returns {string}
 */
function themeNextSteps(run) {
  const fork = `Fork source: ${run} theme eject <slug> [target-path]`;
  return isOutsideProject()
    ? fork
    : `Import one: ${run} theme add <slug> [--package <package>]\n${fork}`;
}

/**
 * Print every field in the `theme.list` entries. Duplicate slugs stay separate
 * because each record names its owner.
 * @param {import('../../../api/theme/theme.type.mjs').ThemeListEntry[]} themes
 * @param {import('../../../api/theme/theme.type.mjs').ThemeUnmigratedCopy[]} [unmigratedCopies]
 */
function printThemeList(themes, unmigratedCopies = []) {
  const run = getCliInvocation();
  const more = text(
    `More themes in packages you could add: ${run} discover theme`,
  );
  if (themes.length === 0) {
    emit(text('No themes are available in this project.'), more);
  } else {
    emit(
      section('Themes', `${themes.length} available`),
      records(themes, {
        fields: [
          'slug',
          'displayName',
          'description',
          'maintained',
          'package',
          'source',
          'added',
          'default',
        ],
        layout: 'stacked',
        format: {
          maintained: (/** @type {boolean} */ value) => (value ? 'yes' : 'no'),
          added: (/** @type {boolean} */ value) => (value ? 'yes' : 'no'),
          default: (/** @type {boolean} */ value) => (value ? 'yes' : 'no'),
        },
      }),
      text(themeNextSteps(run)),
      more,
    );
  }
  if (unmigratedCopies.length > 0) {
    emit(
      section(
        'Unmigrated theme copies',
        `${unmigratedCopies.length} not listed as themes`,
      ),
      records(unmigratedCopies, {
        fields: ['slug', 'path', 'source', 'descriptor'],
        layout: 'stacked',
      }),
      text(`Migrate them: ${unmigratedCopies[0].upgradeCommand}`),
    );
  }
}

/**
 * Print every `theme.app` receipt field and the one-time app wiring on the first
 * add.
 * @param {import('../../../api/theme/theme.type.mjs').ThemeAppResponse} result
 */
function printThemeApp(result) {
  const {themes, default: defaultSlug, modulePath, change} = result.data;
  if (result.package !== undefined) emit(record({package: result.package}));
  emit(
    section('App themes', `${themes.length} added`),
    records(themes, {
      fields: [
        'slug',
        'owner',
        'module',
        'stylesheet',
        'fontStylesheet',
        'source',
      ],
      layout: 'stacked',
    }),
    records(
      [
        {
          default: defaultSlug,
          modulePath,
          action: change.action,
          slug: change.slug,
          changed: change.changed,
          firstAdd: change.firstAdd,
        },
      ],
      {
        fields: [
          'default',
          'modulePath',
          'action',
          'slug',
          'changed',
          'firstAdd',
        ],
        layout: 'stacked',
      },
    ),
  );
  if (!change.firstAdd) return;
  const stem = path.basename(modulePath, path.extname(modulePath));
  emit(
    text('Wire the generated module once in the app root:'),
    code(
      "import {Theme} from '@astryxdesign/core/theme';\n" +
        `import {themes, defaultThemeSlug} from './${stem}';\n\n` +
        '<Theme theme={themes[defaultThemeSlug]}>\n  <App />\n</Theme>',
    ),
  );
}

/**
 * Print every field in a source-fork receipt.
 * @param {import('../../../api/theme/theme.type.mjs').ThemeEjectResponse} result
 */
function printThemeEject(result) {
  const {data} = result;
  emit(
    section('Ejected theme'),
    records([data], {
      fields: [
        'slug',
        'displayName',
        'maintained',
        'package',
        'outputDir',
        'entry',
        'exportName',
        'files',
      ],
      layout: 'stacked',
    }),
    text(
      `This is a local fork. Build it with ${getCliInvocation()} theme build ${path.join(data.outputDir, data.entry)}.`,
    ),
  );
}

/**
 * @param {import('commander').Command} program
 */
export function registerTheme(program) {
  const theme = defineCommand(program, themeGroup, {
    action: (
      /** @type {unknown} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) => {
      // Parent group has no default behaviour. If the user passed an
      // unknown subcommand (e.g. `astryx theme bogus`), Commander hands it to
      // us as a positional in cmd.args — exit 1 with a clear error.
      const extras = (cmd && cmd.args) || [];
      if (extras.length > 0) {
        const unknown = String(extras[0]);
        const known = (theme.commands || []).map(c => c.name());
        const suggestions = known.map(name => ({
          name,
          reason: 'available subcommand',
        }));
        return cliError(`unknown subcommand 'theme ${unknown}'`, {
          suggestions,
          code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
        });
      }
      // Bare `astryx theme` — show the subcommand list. Exit 0 (help is success).
      theme.help();
      return NO_RESULT_SET;
    },
  });

  // Theming questions are asked at `theme`, but per-component overrides live
  // under `component`. Without this pointer the group reads as a build-tool
  // menu, and the component targets are unreachable from the noun the user
  // started at.
  theme.addHelpText(
    'after',
    `\nComponent style overrides:\n` +
      `  ${getCliInvocation()} theme targets            Every themeable class, with its props and states\n` +
      `  ${getCliInvocation()} component <Name>         One component's theming table\n` +
      `  ${getCliInvocation()} docs theme               How component overrides work\n`,
  );

  const palette = defineCommand(theme, themePaletteGroup, {
    action: (
      /** @type {unknown} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) => {
      const extras = cmd?.args ?? [];
      if (extras.length > 0) {
        const suggestions = (palette.commands ?? []).map(command => ({
          name: command.name(),
          reason: 'available subcommand',
        }));
        return cliError(
          `unknown subcommand 'theme palette ${String(extras[0])}'`,
          {
            suggestions,
            code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
          },
        );
      }
      palette.help();
      return NO_RESULT_SET;
    },
  });

  defineCommand(palette, themePaletteGenerateCommand, {
    fn: themePaletteGenerateFn,
    action: (
      /** @type {string} */ configPath,
      /** @type {{out?: string, preview?: string, overwrite?: boolean}} */ options,
    ) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemePaletteGenerateResponse} */
      let result;
      try {
        result = themePaletteGenerate(configPath, options, {
          cwd: process.cwd(),
        });
      } catch (error) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (error);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      // Generating a palette computes and writes candidate files; the numbers
      // that matter (families, stops, modes) are the receipt's, not a match set.
      if (json) {
        jsonOut(result);
        return NO_RESULT_SET;
      }
      if (!result.data.output && !result.data.preview) {
        emit(
          section(
            'Palette candidate',
            `${result.data.familyCount} families, ${result.data.stopCount} stops, ${result.data.modes.join(', ')}`,
          ),
          code(serializePaletteCandidate(result.data.candidate).trimEnd()),
        );
        return NO_RESULT_SET;
      }
      if (!result.data.written) {
        emit(
          text(
            '[skip] One or more requested palette outputs already exist — left as is.',
          ),
          text('Pass --overwrite to replace both generated candidate files.'),
        );
        return NO_RESULT_SET;
      }
      emit(
        ...(result.data.output
          ? [text(`[ok] Wrote ${result.data.output}`)]
          : []),
        ...(result.data.receipt
          ? [text(`[ok] Wrote ${result.data.receipt}`)]
          : []),
        ...(result.data.preview
          ? [text(`[ok] Wrote ${result.data.preview}`)]
          : []),
        text(
          'Review and edit the candidate before adopting it as theme-owned palette data.',
        ),
      );
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeBuildCommand, {
    fn: themeBuildFn,
    action: async (
      /** @type {string[]} */ files,
      /** @type {{out?: string, watch?: boolean, check?: boolean, iconsSpecifier?: string, family?: boolean, familyKey?: string}} */ options,
    ) => {
      const json = program.opts().json || false;
      // The report is one line per theme unless the user asks for
      // `--detail full`, which prints the install example and the font
      // guidance: once for one theme, as it always has, and once for the whole
      // batch rather than per theme.
      const detailChosen = program.getOptionValueSource('detail') !== 'default';
      const detail = detailChosen ? program.opts().detail : undefined;
      const compact = detail !== 'full';
      const entries = files.map(file => ({
        file,
        filePath: path.resolve(process.cwd(), file),
      }));

      for (const entry of entries) {
        if (fs.existsSync(entry.filePath)) continue;
        // A quoted glob reaches us unexpanded: say so rather than reporting a
        // literal `themes/*.ts` as a missing file.
        const looksGlobby = /[*?[\]{}]/.test(entry.file);
        return cliError(`File not found: ${entry.filePath}`, {
          code: ERROR_CODES.ERR_FILE_NOT_FOUND,
          suggestions: looksGlobby
            ? [
                {
                  name: `astryx theme build ${entry.file.replace(/['"]/g, '')}`,
                  reason:
                    'globs are expanded by your shell; pass the pattern unquoted, or list the files',
                },
              ]
            : undefined,
        });
      }

      // Family mode is a thin orchestration branch over the existing build API.
      // Its key is required exactly with --family, and options that describe one
      // standalone output or a long-running loop remain intentionally separate.
      if (Boolean(options.family) !== Boolean(options.familyKey)) {
        return cliError(
          options.family
            ? '--family requires --family-key <key>'
            : '--family-key requires --family',
          {code: ERROR_CODES.ERR_THEME_INVALID},
        );
      }
      if (options.family && options.out) {
        return cliError('--family cannot be combined with --out', {
          code: ERROR_CODES.ERR_THEME_INVALID,
        });
      }
      if (options.family && options.watch) {
        return cliError('--family cannot be combined with --watch', {
          code: ERROR_CODES.ERR_THEME_INVALID,
        });
      }

      // --check and --watch are mutually exclusive: check is a one-shot,
      // exit-coded verification; watch is a long-running rebuild loop.
      if (options.check && options.watch) {
        return cliError('--check cannot be combined with --watch', {
          code: ERROR_CODES.ERR_THEME_INVALID,
        });
      }

      // --out names one output file, so it cannot describe N themes. Without
      // it each theme writes `<theme name>.css` beside its source, which is
      // what a multi-theme build wants anyway.
      if (options.out && entries.length > 1) {
        return cliError(
          `--out takes a single output path and ${entries.length} theme files were given. ` +
            'Build them without --out (each theme writes <name>.css next to its source), ' +
            'or run one invocation per theme.',
          {code: ERROR_CODES.ERR_THEME_INVALID},
        );
      }

      // Watch mode: run an initial build, then rebuild on every change to the
      // theme file. Watch is a human-interactive, long-running mode — it is not
      // supported in --json (machine) mode, which expects a single envelope.
      if (options.watch) {
        if (json) {
          return cliError('--watch is not supported with --json', {
            code: ERROR_CODES.ERR_THEME_INVALID,
          });
        }
        await runThemeBuildWatch(entries, {...options, detail});
        return NO_RESULT_SET;
      }

      // Non-watch: delegate to the API compiler, once per theme, in argument
      // order. Enable human output unless in --json mode (log → stdout via
      // humanLog, warn/error → stderr). The "Building theme from" line, the
      // [ok]/[warn] lines, and the install instructions are all emitted from
      // inside themeBuild via the shared logger.
      logger.setSilent(json);
      let privateVarError = false;
      const onPrivateVarError = () => {
        privateVarError = true;
      };

      if (options.family) {
        try {
          const result = await themeBuildFamily(
            files,
            {
              familyKey: /** @type {string} */ (options.familyKey),
              check: options.check,
              iconsSpecifier: options.iconsSpecifier,
              __onPrivateVarError: onPrivateVarError,
            },
            {cwd: process.cwd()},
          );
          if (json) jsonOut(result);
          if (
            privateVarError ||
            (result.type === 'theme.build.check' && !result.data.upToDate)
          ) {
            process.exitCode = 1;
          }
          return NO_RESULT_SET;
        } catch (e) {
          const err =
            /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
          return cliError(err.message, {
            suggestions: err.suggestions,
            code: err.code,
          });
        }
      }

      // --json and --check keep their own output at every detail level.
      const report = !json && !options.check && (entries.length > 1 || compact);
      /** @type {import('../../../api/theme/build/build.mjs').ThemeBuildTrailer[]} */
      const trailers = [];

      /** @type {Array<{file: string, receipt: import('../../../api/theme/theme.type.mjs').ThemeBuildResponse | import('../../../api/theme/theme.type.mjs').ThemeBuildCheckResponse | null}>} */
      const results = [];
      let stale = false;
      for (const entry of entries) {
        try {
          const buildOptions = {
            out: options.out,
            check: options.check,
            iconsSpecifier: options.iconsSpecifier,
            __onPrivateVarError: onPrivateVarError,
          };
          let result;
          if (report) {
            const built = await themeBuildForReport(
              entry.file,
              buildOptions,
              {cwd: process.cwd()},
              {compact},
            );
            result = built.receipt;
            if (built.trailer) trailers.push(built.trailer);
            if (compact && result?.type === 'theme.build') {
              const {outputs, sizeKB, tokenCount, componentCount} = result.data;
              emit(
                text(
                  `[ok] ${outputs.css} (${sizeKB} KB, ${tokenCount} token overrides, ${componentCount} component overrides)`,
                ),
              );
            }
          } else {
            result = await themeBuild(entry.file, buildOptions, {
              cwd: process.cwd(),
            });
          }
          results.push({file: entry.file, receipt: result ?? null});
          if (
            options.check &&
            result &&
            result.type === 'theme.build.check' &&
            !result.data.upToDate
          ) {
            stale = true;
          }
        } catch (e) {
          const err =
            /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
          // Stop at the first failure, as a shell loop under `set -e` does.
          // With several themes in flight the message alone rarely says which
          // one broke, so name it. Themes already written keep their install
          // and font guidance.
          if (report && compact) printCompactTrailer(trailers);
          else if (report) printBatchTrailer(trailers);
          return cliError(
            entries.length > 1 ? `${entry.file}: ${err.message}` : err.message,
            {suggestions: err.suggestions, code: err.code},
          );
        }
      }

      if (json) {
        // One theme keeps the single-envelope contract it has always had; a
        // batch gets its own discriminant rather than N envelopes on stdout.
        if (entries.length === 1) {
          if (results[0].receipt) jsonOut(results[0].receipt);
        } else {
          /** @type {import('../../../api/theme/theme.type.mjs').ThemeBuildBatchResponse} */
          const batch = {
            type: 'theme.build.batch',
            data: {count: results.length, results},
          };
          jsonOut(batch);
        }
      } else {
        if (report && compact) {
          printCompactTrailer(trailers, {hint: !detailChosen});
        } else if (report) {
          printBatchTrailer(trailers);
        }
      }
      if (!json && entries.length > 1) {
        emit(
          text(
            options.check
              ? `\n${stale ? '[fail]' : '[ok]'} Checked ${entries.length} themes.`
              : `\n[ok] Built ${entries.length} themes.`,
          ),
        );
      }

      // Private-variable diagnostics are build failures even though the released
      // output and generated files stay unchanged. Stale --check output is also
      // a failure after its receipt has been emitted.
      if (privateVarError || (options.check && stale)) {
        process.exitCode = 1;
      }

      // Compiling a theme writes CSS; `--check` compares what is on disk. Both
      // are effects — the receipt (and the exit code) carry the outcome.
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeListCommand, {
    fn: themeListFn,
    action: async (/** @type {{package?: string}} */ options) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeListResponse} */
      let result;
      try {
        result = await themeListAvailable({
          cwd: process.cwd(),
          package: options.package,
        });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      await warnOnThemeIntegrationIssues(json);
      const answered = resultSet({
        count: result.data.length,
        resultKind: 'theme',
      });
      if (json) {
        jsonOut(result);
        return answered;
      }

      printThemeList(result.data, result.meta?.unmigratedCopies);
      return answered;
    },
  });

  const themeAddCli = defineCommand(theme, themeAddCommand, {
    fn: themeAddFn,
    action: async (
      /** @type {string | undefined} */ slug,
      /** @type {{list?: boolean, import?: boolean, package?: string}} */ options,
    ) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeListResponse | import('../../../api/theme/theme.type.mjs').ThemeAppResponse} */
      let result;
      try {
        result =
          options.list || !slug
            ? await themeListCopySources({
                cwd: process.cwd(),
                package: options.package,
              })
            : await themeAdd(slug, {
                import: options.import,
                cwd: process.cwd(),
                package: options.package,
              });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      await warnOnThemeIntegrationIssues(json);
      const answered =
        result.type === 'theme.list'
          ? resultSet({count: result.data.length, resultKind: 'theme'})
          : NO_RESULT_SET;

      if (json) {
        jsonOut(result);
        return answered;
      }
      if (result.type === 'theme.list') {
        printThemeAddList(result.data);
        return answered;
      }
      printThemeApp(result);
      return answered;
    },
  });
  // Reject the removed target-path argument in Commander's standard parse path.
  themeAddCli.allowExcessArguments(false);

  defineCommand(theme, themeRemoveCommand, {
    fn: themeRemoveFn,
    action: async (/** @type {string} */ slug) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeAppResponse} */
      let result;
      try {
        result = await themeRemove(slug, {cwd: process.cwd()});
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }
      await warnOnThemeIntegrationIssues(json);
      if (json) jsonOut(result);
      else printThemeApp(result);
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeUseCommand, {
    fn: themeUseFn,
    action: async (/** @type {string} */ slug) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeAppResponse} */
      let result;
      try {
        result = await themeUse(slug, {cwd: process.cwd()});
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }
      await warnOnThemeIntegrationIssues(json);
      if (json) jsonOut(result);
      else printThemeApp(result);
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeEjectCommand, {
    fn: themeEjectFn,
    action: async (
      /** @type {string} */ slug,
      /** @type {string | undefined} */ targetPath,
      /** @type {{overwrite?: boolean, package?: string}} */ options,
    ) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeEjectResponse} */
      let result;
      try {
        result = await themeEject(slug, {
          targetPath,
          overwrite: options.overwrite,
          cwd: process.cwd(),
          package: options.package,
        });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }
      await warnOnThemeIntegrationIssues(json);
      if (json) jsonOut(result);
      else printThemeEject(result);
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeTemplateCommand, {
    fn: themeTemplateFn,
    action: (
      /** @type {string | undefined} */ targetPath,
      /** @type {{overwrite?: boolean}} */ options,
    ) => {
      const json = program.opts().json || false;

      /** @type {import('../../../api/theme/theme.type.mjs').ThemeTemplateResponse} */
      let result;
      try {
        result = themeTemplate({
          targetPath,
          overwrite: options.overwrite,
          cwd: process.cwd(),
        });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      // Writes a starter theme file, or declines to overwrite one.
      if (json) {
        jsonOut(result);
        return NO_RESULT_SET;
      }

      const invocation = getCliInvocation(process.cwd());
      if (!result.data.written) {
        emit(
          text(`[skip] ${result.data.path} already exists — left as is.`),
          text(`Pass --overwrite to replace it with a fresh copy.`),
        );
        return NO_RESULT_SET;
      }
      emit(
        text(`[ok] Wrote ${result.data.path}`),
        text(
          'It documents every defineTheme field, the token families, and the component override syntax. ' +
            'Copy what you need into your own theme file, then delete it.',
        ),
        code(`${invocation} theme build ${result.data.path}`),
      );
      return NO_RESULT_SET;
    },
  });

  defineCommand(theme, themeTargetsCommand, {
    fn: themeTargetsFn,
    action: async (/** @type {string | undefined} */ filter) => {
      const json = program.opts().json || false;

      /** @type {import('../../../api/theme/theme.type.mjs').ThemeTargetsResponse} */
      let result;
      try {
        result = await themeTargets(filter, {cwd: process.cwd()});
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      // A filter is a substring search with an exact-name fast path (see
      // api/theme/targets), so the mere presence of one proves nothing: `theme
      // targets a` matches everything. A direct match is the filter naming ONE
      // component and getting only that component's targets back — which is
      // exactly the exact-name branch, read off the answer.
      const matched = new Set(
        result.data.targets.map(target => target.component.toLowerCase()),
      );
      const answered = resultSet({
        count: result.data.targets.length,
        resultKind: 'theme',
        // Falsy, not just null: the api treats an empty filter as no filter
        // at all, so recording one as a match that missed would invent a
        // failed lookup out of a run that never looked anything up.
        directMatch: !filter
          ? undefined
          : matched.size === 1 && matched.has(String(filter).toLowerCase()),
      });
      if (json) {
        jsonOut(result);
        return answered;
      }

      const run = getCliInvocation();
      const {targets, componentCount} = result.data;
      emit(
        section(
          'Theming targets',
          `${targets.length} across ${componentCount} component${componentCount === 1 ? '' : 's'}\n(key - component - props - states - className)`,
        ),
        records(targets, {
          fields: ['key', 'component', 'props', 'states', 'className'],
          layout: 'inline',
        }),
        text(
          [
            `Each key goes under \`components\` in defineTheme; it paints \`.astryx-<key>\`.`,
            `Props take a value (\`variant:secondary\`); states are written bare (\`checked\`).`,
            `One component in full: ${run} component <Name>`,
          ].join('\n'),
        ),
      );
      return answered;
    },
  });
}
