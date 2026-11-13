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
import {
  getCliInvocation,
  commandInFolder,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';
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
import {cliError, themeGroupUnknownSubcommand} from '../lib/cli-error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {themeAdd} from '../../../api/theme/add/add.mjs';
import {themeRemove} from '../../../api/theme/remove/remove.mjs';
import {themeUse} from '../../../api/theme/use/use.mjs';
import {themeEject} from '../../../api/theme/eject/eject.mjs';
import {
  OUTSIDE_PROJECT_WARNING,
  themeTemplate,
} from '../../../api/theme/template/template.mjs';
import {findPackageRoot} from '../../../foundation/fs/paths.mjs';
import {
  themeListAvailable,
  themeListCopySources,
} from '../../../api/theme/list/list.mjs';
import {
  normalizeTargetFilter,
  themeTargets,
} from '../../../api/theme/targets/targets.mjs';
import {
  serializePaletteCandidate,
  themePaletteGenerate,
} from '../../../api/theme/palette/generate/generate.mjs';
import {
  printBatchTrailer,
  printCompactTrailer,
  setEditorFolderListener,
  themeBuildFamily,
  themeBuildForReport,
  themeBuildWithHandOff,
  themeSourceFiles,
  themeSourceGuesses,
  buildSuggestion,
  generatedSourceCommand,
  writeDeferredBuildOutputs,
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
 * The words a theme command is run with: `theme build` here, and the copies
 * under `experimental theme`, where `build` is called `compile`. The actions
 * and API calls are the same; only these words and the docs differ.
 * @typedef {object} ThemeCommandWords
 * @property {string} group - The group's command path: `theme` or `experimental theme`.
 * @property {string} build - The build subcommand's name: `build` or `compile`.
 * @property {(err: import('../../../api/error.mjs').AstryxError, cwd: string) => import('../../../api/error.mjs').AstryxError | null} [explain] - A clearer refusal for this group, or null.
 * @property {(files: string[], options: {cwd: string, check?: boolean, family?: boolean, iconsSpecifier?: string, out?: string}) => Promise<import('../../../api/error.mjs').AstryxError | null>} [preflight] - A refusal before a build starts, or null.
 * @property {(files: string[], options: {cwd: string}) => Promise<() => Promise<void>>} [hold] - Locks held while a build or check runs; resolves to their release.
 * @property {(file: string, cwd: string, opts: {check: boolean}) => Record<string, unknown> | null} [extraData] - Fields a group adds to a build's result data (the editor's `appCopyStale`).
 * @property {(file: string, cwd: string) => ((family: string) => boolean) | null} [loadedFonts] - Font families the app loads for a theme file that the file itself cannot say, so the build does not name them as unloaded.
 * @property {(file: string, cwd: string) => {name: string, reason: string} | null} [missingSource] - For a source file that is not there, this group's way to write it again, or null.
 * @property {(options: {targetPath?: string, overwrite?: boolean, cwd?: string}) => import('../../../api/theme/theme.type.mjs').ThemeTemplateResponse} [template] - This group's template write, in place of `themeTemplate`.
 */

/** @type {ThemeCommandWords} */
const THEME_WORDS = {group: 'theme', build: 'build'};

/**
 * Text as the group that ran the command words it: under `experimental
 * theme`, the commands it names are that group's own (`build` is `compile`
 * there). Only a command the CLI wrote is reworded: one after the CLI's
 * name, or in backticks; text a person typed (a path, a name) stays as
 * typed. Under `theme`, the text is unchanged.
 * @param {string} text
 * @param {ThemeCommandWords} words
 */
function inGroupWords(text, words) {
  if (words.group === THEME_WORDS.group) return text;
  // An argument the person typed can hold the same words (a filter of
  // `astryx theme list`); it is echoed as typed. Only an argument with a
  // space or a backtick can match, and it is set aside only where the CLI
  // echoes it: in double quotes, or as the argument after a subcommand.
  const typed = [...new Set(process.argv.slice(2))]
    .filter(arg => /[\s`]/.test(arg))
    .sort((a, b) => b.length - a.length);
  /** @type {string[]} */
  const kept = [];
  let masked = String(text);
  for (const arg of typed) {
    const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked.replace(
      new RegExp(
        `(?<="|\\b(?:add|use|remove|eject|targets|template|build|compile) )${escaped}(?="|\`|\\s|$)`,
        'g',
      ),
      () => `\uE000${kept.push(arg) - 1}\uE001`,
    );
  }
  return masked
    .replace(
      /((?:\bastryx|@astryxdesign\/cli@[\w.-]+) |`)theme (add|use|remove|list|build|eject|template|targets)\b/g,
      (_, lead, sub) =>
        `${lead}${words.group} ${sub === 'build' ? words.build : sub}`,
    )
    .replace(/\uE000(\d+)\uE001/g, (_, i) => kept[Number(i)]);
}

/**
 * A theme app result with its notes in the words of the group that ran it.
 * @template {{data: {notes?: string[]}}} R
 * @param {R} result
 * @param {ThemeCommandWords} words
 * @returns {R}
 */
function inGroupNotes(result, words) {
  if (!result?.data?.notes || words.group === THEME_WORDS.group) return result;
  return {
    ...result,
    data: {
      ...result.data,
      notes: result.data.notes.map(n => inGroupWords(n, words)),
    },
  };
}

/**
 * A theme API refusal as the group that ran it words it: under
 * `experimental theme`, the commands it names are that group's own (`build`
 * is `compile` there). Under `theme`, the text is unchanged.
 * A refusal that names no command gets `fallback`: a command of the same
 * group that works whatever went wrong.
 * @param {import('../../../api/error.mjs').AstryxError} err
 * @param {ThemeCommandWords} [words]
 * @param {Array<{name: string, reason: string}>} [fallback]
 */
function themeError(err, words = THEME_WORDS, fallback = []) {
  err = words.explain?.(err, process.cwd()) ?? err;
  /** @param {string} text */
  const local = text => inGroupWords(text, words);
  const given = err.suggestions || [];
  return cliError(local(err.message), {
    suggestions: (given.length > 0 ? given : fallback).map(x => ({
      ...x,
      name: local(x.name),
      ...(x.reason ? {reason: local(x.reason)} : {}),
    })),
    code: err.code,
  });
}

/**
 * A command of this CLI as this project runs it, each argument quoted for the
 * shell.
 * @param {ThemeCommandWords} words
 * @param {string} sub the subcommand, such as `list` or the build word
 * @param {string[]} [args]
 * @param {string} reason
 * @returns {{name: string, reason: string}}
 */
function themeCommand(words, sub, args = [], reason = '') {
  return {
    name: [
      getCliInvocation(process.cwd()),
      words.group,
      sub,
      ...args.map(arg => quoteCommandArgument(arg)),
    ].join(' '),
    reason,
  };
}

/**
 * The message type a `theme build` child sends its watcher in place of a
 * warning a build prints once per invocation (the --out editor-folder
 * warning), so a watch session prints it once, not on every rebuild.
 */
const WATCH_WARNING = 'astryx.theme.build.warning';

/**
 * The `argv0` a watcher starts each `theme build` child with. With the IPC
 * channel it marks the child as the watcher's own, so a CLI run another way
 * with an IPC channel (forked by a tool or test runner) still prints.
 */
const WATCH_CHILD_ARGV0 = 'astryx-theme-watch';

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
 * @param {ThemeCommandWords} [words]
 * @param {(message: unknown) => void} [onMessage] - Receives what the child
 *   hands over the channel (WATCH_WARNING messages).
 * @returns {Promise<number>}
 */
function runThemeBuildOnceChild(
  file,
  options,
  onSpawn,
  words = THEME_WORDS,
  onMessage,
) {
  const cliBin = resolveCliBin();
  const command = [...words.group.split(' '), words.build];
  // A detail level the user chose applies to every rebuild.
  const args = options.detail
    ? [cliBin, '--detail', options.detail, ...command, file]
    : [cliBin, ...command, file];
  if (options.out) args.push('--out', options.out);
  if (options.iconsSpecifier)
    args.push('--icons-specifier', options.iconsSpecifier);
  return new Promise((/** @type {(code: number) => void} */ resolve) => {
    // The IPC channel and argv0 tell the child it builds for this watcher: it
    // hands its once-per-invocation warnings over the channel instead of
    // printing them.
    const child = spawn(process.execPath, args, {
      argv0: WATCH_CHILD_ARGV0,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: process.env,
    });
    child.on('message', message => onMessage?.(message));
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
 * @param {ThemeCommandWords} [words]
 * @returns {Promise<void>} Resolves when the watcher is stopped (Ctrl-C).
 */
async function runThemeBuildWatch(entries, options, words = THEME_WORDS) {
  const rel = (/** @type {string} */ filePath) =>
    path.relative(process.cwd(), filePath);
  const watchingLine = `\nWatching ${entries
    .map(e => rel(e.filePath))
    .join(', ')} for changes — press Ctrl-C to stop.`;

  // A warning a build prints once per invocation is printed at most once
  // per watch session (spec:AST-017 FR29a), not on every rebuild.
  /** @type {Set<string>} each warning once, whichever build printed it */
  const warned = new Set();
  // Watch never runs under --json, so the logger prints (cli-surface INV12).
  logger.setSilent(false);
  const onMessage = (/** @type {unknown} */ message) => {
    const m = /** @type {{type?: unknown, text?: unknown}} */ (message);
    if (m?.type !== WATCH_WARNING || typeof m.text !== 'string') return;
    if (warned.has(m.text)) return;
    warned.add(m.text);
    logger.warn(m.text);
  };

  // Initial build.
  for (const entry of entries) {
    await runThemeBuildOnceChild(
      entry.file,
      options,
      undefined,
      words,
      onMessage,
    );
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
    const done = runThemeBuildOnceChild(
      entry.file,
      options,
      child => {
        rebuildChild = child;
      },
      words,
      onMessage,
    );
    rebuildDone = done.then(() => {});
    await done;
    rebuildChild = null;
    rebuildDone = null;
    building = false;
    // A stop during this build has already ended the watch.
    if (stopped) return;
    // The rebuilt source may import other files now.
    watchSourceFiles(entry);
    emit(text(watchingLine));
    const next = queued.values().next();
    if (!next.done) {
      queued.delete(next.value);
      rebuild(next.value);
    }
  };

  // A theme is its source and the local files it imports (an ejected fork's
  // palettes, a split theme); a change to any of them rebuilds it. Some
  // editors replace a file (rename) rather than write in place, which can drop
  // a file watch, so each containing folder is watched and filtered by name.
  /** @type {Map<{file: string, filePath: string}, Set<string>>} */
  const sourceFiles = new Map();
  /** @type {Map<string, import('node:fs').FSWatcher>} */
  const folderWatchers = new Map();
  /** @param {{file: string, filePath: string}} entry */
  const changed = entry => {
    clearTimeout(debounces.get(entry.filePath));
    // Debounce: editors often emit several events per save.
    debounces.set(
      entry.filePath,
      setTimeout(() => rebuild(entry), 100),
    );
  };
  /** @param {string} dir */
  const watchFolder = dir => {
    if (folderWatchers.has(dir)) return;
    folderWatchers.set(
      dir,
      fs.watch(dir, (_eventType, name) => {
        const file = name ? path.join(dir, name.toString()) : null;
        for (const [entry, files] of sourceFiles) {
          if (
            file
              ? files.has(file)
              : [...files].some(f => path.dirname(f) === dir)
          ) {
            changed(entry);
          }
        }
      }),
    );
  };
  /** @param {{file: string, filePath: string}} entry */
  function watchSourceFiles(entry) {
    const files = new Set(themeSourceFiles(entry.filePath));
    files.add(path.resolve(entry.filePath));
    sourceFiles.set(entry, files);
    for (const file of files) {
      try {
        watchFolder(path.dirname(file));
      } catch {
        // A folder that went away is watched again after the next build.
      }
    }
  }
  for (const entry of entries) watchSourceFiles(entry);

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
      for (const w of folderWatchers.values()) w.close();
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
 * @param {ThemeCommandWords} [words]
 */
function printThemeAddList(themes, words = THEME_WORDS) {
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
    text(themeNextSteps(run, words)),
    more,
  );
}

/**
 * What to do with a listed theme. Outside a project there is no app to add one
 * to, so only the fork step is named (spec AST-081 FR3).
 * @param {string} run the CLI invocation
 * @param {ThemeCommandWords} [words]
 * @returns {string}
 */
function themeNextSteps(run, words = THEME_WORDS) {
  const fork = `Fork source: ${run} ${words.group} eject <slug> [target-path]`;
  return isOutsideProject()
    ? fork
    : `Import one: ${run} ${words.group} add <slug> [--package <package>]\n${fork}`;
}

/**
 * Print every field in the `theme.list` entries. Duplicate slugs stay separate
 * because each record names its owner.
 * @param {import('../../../api/theme/theme.type.mjs').ThemeListEntry[]} themes
 * @param {import('../../../api/theme/theme.type.mjs').ThemeUnmigratedCopy[]} [unmigratedCopies]
 * @param {ThemeCommandWords} [words]
 * @param {Array<{slug: string, path: string, reason: string}>} [skippedThemes]
 */
function printThemeList(
  themes,
  unmigratedCopies = [],
  words = THEME_WORDS,
  skippedThemes = [],
) {
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
      text(themeNextSteps(run, words)),
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
  if (skippedThemes.length > 0) {
    emit(
      section(
        'Skipped local themes',
        `${skippedThemes.length} broken, not listed`,
      ),
      records(skippedThemes, {
        fields: ['slug', 'path', 'reason'],
        layout: 'stacked',
      }),
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
  for (const note of result.data.notes ?? []) emit(text(`[note] ${note}`));
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
 * The base the experimental theme editor can start an ejected theme from,
 * by the editor's own check: the theme's slug when it is a built-in base the
 * editor knows (LIKE) and its package is installed where the command runs
 * (baseInstalled), else neutral. Loaded only for an eject.
 * @param {{slug?: string | null}} data
 * @param {string} cwd
 * @returns {Promise<string>}
 */
export async function editorBaseFor(data, cwd) {
  if (!data.slug) return 'neutral';
  const {editorBaseIn} = await import('../../../api/theme-edit/_adapter.mjs');
  return editorBaseIn(data.slug, cwd);
}

/**
 * Print every field in a source-fork receipt.
 * @param {import('../../../api/theme/theme.type.mjs').ThemeEjectResponse} result
 * @param {ThemeCommandWords} [words]
 * @param {string} [like] the base the theme editor line starts from
 */
function printThemeEject(result, words = THEME_WORDS, like = 'neutral') {
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
        'missingPackages',
      ],
      layout: 'stacked',
    }),
    ...(data.missingPackages.length > 0
      ? [
          text(
            data.installCommand
              ? `The fork imports packages this app lacks. Install them first: ${data.installCommand}`
              : `The fork imports packages this app lacks: ${data.missingPackages.join(', ')}. Install them first.`,
          ),
        ]
      : []),
    text(
      `This is a local fork. Build it with ${buildStep(getCliInvocation(), words, path.join(data.outputDir, data.entry))}.`,
    ),
    // One theme-only line (AST-017 FR27): the editor builds only on an
    // Astryx theme package, so a theme from another package starts from
    // neutral.
    text(
      `To make or change a theme: the experimental theme editor, ${getCliInvocation()} experimental theme editor new <name> --like ${like}.`,
    ),
  );
}

/**
 * The build command for a theme file a command just wrote, as it works from
 * the current folder: a build writes its outputs beside the source and only
 * inside the folder it runs from, so a file above that folder is built from
 * the project root (`cd ../.. && … theme build theme.template.ts`).
 * @param {string} invocation
 * @param {{group: string, build: string}} words
 * @param {string} file relative to the current folder
 */
function buildStep(invocation, words, file) {
  const cwd = process.cwd();
  const abs = path.resolve(cwd, file);
  const rel = path.relative(cwd, abs);
  const posix = (/** @type {string} */ p) => p.split(path.sep).join('/');
  if (!rel.startsWith('..'))
    return `${invocation} ${words.group} ${words.build} ${quoteCommandArgument(posix(rel))}`;
  const root = findPackageRoot(path.dirname(abs)) ?? path.dirname(abs);
  // The shell's own form of "in that folder" (PowerShell has no &&).
  return commandInFolder(
    posix(path.relative(cwd, root)),
    `${invocation} ${words.group} ${words.build} ${quoteCommandArgument(posix(path.relative(root, abs)))}`,
  );
}

/**
 * The CommandDocs one copy of the theme subcommands is built from.
 * @typedef {object} ThemeCommandDocs
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} [palette] - With `paletteGenerate`; a copy without them has no palette commands.
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} [paletteGenerate]
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} build
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} list
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} add
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} remove
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} use
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} eject
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} template
 * @property {import('@astryxdesign/cli/authoring').CommandDoc} targets
 */

/** @type {ThemeCommandDocs} */
const THEME_DOCS = {
  palette: themePaletteGroup,
  paletteGenerate: themePaletteGenerateCommand,
  build: themeBuildCommand,
  list: themeListCommand,
  add: themeAddCommand,
  remove: themeRemoveCommand,
  use: themeUseCommand,
  eject: themeEjectCommand,
  template: themeTemplateCommand,
  targets: themeTargetsCommand,
};

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
        const {message, suggestions} = themeGroupUnknownSubcommand(
          'theme',
          String(extras[0]),
          (theme.commands || []).map(c => c.name()),
          theme,
        );
        return cliError(message, {
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

  registerThemeSubcommands(theme, program, THEME_DOCS, THEME_WORDS);
}

/**
 * Register the theme subcommands under a group: palette (generate) when its
 * docs are given, build, list, add, remove, use, eject, template and targets. `astryx theme` and the
 * copies under `astryx experimental theme` share these actions and their API
 * calls; `docs` and `words` give each copy its own names.
 * @param {import('commander').Command} theme the group to register under
 * @param {import('commander').Command} program the root program
 * @param {ThemeCommandDocs} docs
 * @param {ThemeCommandWords} words
 */
export function registerThemeSubcommands(theme, program, docs, words) {
  if (docs.palette && docs.paletteGenerate)
    registerPaletteCommands(
      theme,
      program,
      docs.palette,
      docs.paletteGenerate,
      words,
    );
  registerThemeCommands(theme, program, docs, words);
}

/**
 * Register `palette` and `palette generate` under a theme group.
 * @param {import('commander').Command} theme
 * @param {import('commander').Command} program
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} paletteDoc
 * @param {import('@astryxdesign/cli/authoring').CommandDoc} generateDoc
 * @param {ThemeCommandWords} words
 */
function registerPaletteCommands(
  theme,
  program,
  paletteDoc,
  generateDoc,
  words,
) {
  const palette = defineCommand(theme, paletteDoc, {
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
          `unknown subcommand '${words.group} palette ${String(extras[0])}'`,
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

  defineCommand(palette, generateDoc, {
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
        return themeError(err, words);
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
        // One theme-only line (AST-017 FR27).
        text(
          `To make or change a theme: the experimental theme editor makes the palettes from one color, ${getCliInvocation(process.cwd())} experimental theme editor set <name> accent <color>.`,
        ),
      );
      return NO_RESULT_SET;
    },
  });
}

/**
 * Register build, list, add, remove, use, eject, template and targets.
 * @param {import('commander').Command} theme
 * @param {import('commander').Command} program
 * @param {ThemeCommandDocs} docs
 * @param {ThemeCommandWords} words
 */
function registerThemeCommands(theme, program, docs, words) {
  const buildCli = defineCommand(theme, docs.build, {
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
        const guesses = looksGlobby
          ? []
          : themeSourceGuesses(entry.file, process.cwd());
        // An editor theme's own source, deleted by hand: the editor writes
        // it again.
        const rewrite = looksGlobby
          ? null
          : (words.missingSource?.(entry.file, process.cwd()) ?? null);
        // A file another command generates, gone from a folder whose other
        // files carry that command's mark: that command writes it again; a
        // blank theme template is no way back.
        const by =
          rewrite || looksGlobby
            ? null
            : generatedSourceCommand(entry.filePath);
        if (by)
          return cliError(
            `File not found: ${entry.filePath}. It is a generated file: the files beside it are written by ${by}, so rebuild it with the command that made it.`,
            {
              code: ERROR_CODES.ERR_FILE_NOT_FOUND,
              suggestions: /^astryx(\s|$)/.test(by)
                ? [
                    {
                      name: `${getCliInvocation(process.cwd())} ${by.replace(/^astryx\s*/, '')}`.trim(),
                      reason: 'the command that writes these files',
                    },
                  ]
                : [],
            },
          );
        return cliError(`File not found: ${entry.filePath}`, {
          code: ERROR_CODES.ERR_FILE_NOT_FOUND,
          suggestions: rewrite
            ? [rewrite]
            : looksGlobby
              ? [
                  {
                    // The pattern stays unquoted: the shell expands it.
                    // The caller's mode follows it, quoted, and a family
                    // run stays one.
                    name: buildSuggestion(
                      entry.file,
                      options,
                      process.cwd(),
                      words,
                      {
                        glob: true,
                        family: Boolean(options.family),
                        ...(options.family && options.familyKey
                          ? {familyKey: String(options.familyKey)}
                          : {}),
                      },
                    ),
                    reason:
                      'globs are expanded by your shell; pass the pattern unquoted, or list the files',
                  },
                ]
              : guesses.length > 0
                ? guesses.map(guess => ({
                    // The same build of that source: a --check stays a check.
                    name: buildSuggestion(guess, options, process.cwd(), words),
                    reason: 'a theme source that exists',
                  }))
                : [
                    themeCommand(
                      words,
                      'template',
                      ['theme.template.ts'],
                      'start a theme source from the annotated template',
                    ),
                  ],
        });
      }

      /**
       * This build again without some of its options, as the way out of a
       * refusal about how they combine.
       * @param {Array<'out' | 'watch' | 'check' | 'family'>} drop
       * @param {string} reason
       * @param {string[]} [only] the files to build, when not all of them
       */
      const buildWithout = (drop, reason, only = files) =>
        themeCommand(
          words,
          words.build,
          [
            ...(options.family && !drop.includes('family')
              ? ['--family', ...only, '--family-key', String(options.familyKey)]
              : only),
            ...(options.out && !drop.includes('out')
              ? ['--out', options.out]
              : []),
            ...(options.check && !drop.includes('check') ? ['--check'] : []),
            ...(options.watch && !drop.includes('watch') ? ['--watch'] : []),
            ...(options.iconsSpecifier
              ? ['--icons-specifier', options.iconsSpecifier]
              : []),
          ],
          reason,
        );

      // A refusal from the build that names no command: without --out the
      // outputs go beside the source; otherwise the annotated template shows
      // a theme source that builds.
      const buildFallback = options.out
        ? [buildWithout(['out'], 'write the outputs beside the source')]
        : [
            themeCommand(
              words,
              'template',
              ['theme.template.ts'],
              'an annotated theme source that builds, to compare with',
            ),
          ];

      // One file passed twice would build twice and report two themes.
      const seenFiles = new Set();
      for (const entry of entries) {
        const key = fs.realpathSync(entry.filePath);
        if (seenFiles.has(key)) {
          const once = entries
            .filter(
              (other, index) =>
                entries.findIndex(
                  first =>
                    fs.realpathSync(first.filePath) ===
                    fs.realpathSync(other.filePath),
                ) === index,
            )
            .map(other => other.file);
          return cliError(
            `${entry.file} is given more than once. Select each theme file once.`,
            {
              code: ERROR_CODES.ERR_THEME_INVALID,
              suggestions: [buildWithout([], 'each file once', once)],
            },
          );
        }
        seenFiles.add(key);
      }

      // Family mode is a thin orchestration branch over the existing build API.
      // Its key is required exactly with --family, and options that describe one
      // standalone output or a long-running loop remain intentionally separate.
      if (Boolean(options.family) !== Boolean(options.familyKey)) {
        return cliError(
          options.family
            ? '--family requires --family-key <key>'
            : '--family-key requires --family',
          {
            code: ERROR_CODES.ERR_THEME_INVALID,
            suggestions: [
              {
                ...themeCommand(
                  words,
                  words.build,
                  [
                    ...files,
                    // --out names one output, so it goes with one file only.
                    ...(options.out && files.length === 1
                      ? ['--out', options.out]
                      : []),
                    ...(options.iconsSpecifier
                      ? ['--icons-specifier', options.iconsSpecifier]
                      : []),
                    ...(options.check ? ['--check'] : []),
                  ],
                  'build each theme on its own',
                ),
              },
            ],
          },
        );
      }
      if (options.family && options.out) {
        return cliError('--family cannot be combined with --out', {
          code: ERROR_CODES.ERR_THEME_INVALID,
          suggestions: [
            buildWithout(['out'], 'family outputs go beside the family root'),
          ],
        });
      }
      if (options.family && options.watch) {
        return cliError('--family cannot be combined with --watch', {
          code: ERROR_CODES.ERR_THEME_INVALID,
          suggestions: [buildWithout(['watch'], 'build the family once')],
        });
      }

      // --check and --watch are mutually exclusive: check is a one-shot,
      // exit-coded verification; watch is a long-running rebuild loop.
      if (options.check && options.watch) {
        return cliError('--check cannot be combined with --watch', {
          code: ERROR_CODES.ERR_THEME_INVALID,
          suggestions: [buildWithout(['watch'], 'check once')],
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
          {
            code: ERROR_CODES.ERR_THEME_INVALID,
            suggestions: [
              buildWithout(
                ['out'],
                'each theme writes <name>.css next to its source',
              ),
            ],
          },
        );
      }

      // Watch mode: run an initial build, then rebuild on every change to the
      // theme file. Watch is a human-interactive, long-running mode — it is not
      // supported in --json (machine) mode, which expects a single envelope.
      if (options.watch) {
        if (json) {
          return cliError('--watch is not supported with --json', {
            code: ERROR_CODES.ERR_THEME_INVALID,
            suggestions: [
              buildWithout(['watch'], 'build once, with a JSON result'),
            ],
          });
        }
        await runThemeBuildWatch(entries, {...options, detail}, words);
        return NO_RESULT_SET;
      }

      // Non-watch: delegate to the API compiler, once per theme, in argument
      // order. Enable human output unless in --json mode (log → stdout via
      // humanLog, warn/error → stderr). The "Building theme from" line, the
      // [ok]/[warn] lines, and the install instructions are all emitted from
      // inside themeBuild via the shared logger.
      logger.setSilent(json);
      // Started by a watcher (runThemeBuildWatch): hand the editor-folder
      // warning to it, and let the channel not keep this build alive.
      const watchChild =
        typeof process.send === 'function' &&
        process.argv0 === WATCH_CHILD_ARGV0;
      if (watchChild) {
        process.channel?.unref();
        setEditorFolderListener(warning => {
          // Held open until the message is out, then let go again.
          process.channel?.ref();
          process.send?.({type: WATCH_WARNING, text: warning}, () =>
            process.channel?.unref(),
          );
        });
      }

      const refused = await words.preflight?.(files, {
        cwd: process.cwd(),
        check: options.check,
        family: Boolean(options.family),
        iconsSpecifier: options.iconsSpecifier,
        out: options.out,
      });
      if (refused) return themeError(refused, words, buildFallback);

      if (options.family) {
        try {
          const result = await themeBuildFamily(
            files,
            {
              familyKey: /** @type {string} */ (options.familyKey),
              check: options.check,
              iconsSpecifier: options.iconsSpecifier,
            },
            {cwd: process.cwd()},
            {commandWords: words},
          );
          if (json) jsonOut(result);
          if (
            result.type === 'theme.build.check' &&
            !(
              /** @type {import('../../../api/theme/theme.type.mjs').ThemeBuildCheckResponse} */ (
                result
              ).data.upToDate
            )
          ) {
            process.exitCode = 1;
          }
          return NO_RESULT_SET;
        } catch (e) {
          const err =
            /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
          return themeError(err, words, [
            buildWithout(['family'], 'build each theme on its own'),
          ]);
        }
      }

      // --json and --check keep their own output at every detail level.
      const report = !json && !options.check && (entries.length > 1 || compact);
      /** @type {import('../../../api/theme/build/build.mjs').ThemeBuildTrailer[]} */
      const trailers = [];

      /** @type {Array<{file: string, receipt: import('../../../api/theme/theme.type.mjs').ThemeBuildResponse | import('../../../api/theme/theme.type.mjs').ThemeBuildCheckResponse | null}>} */
      const results = [];
      let stale = false;
      // A batch builds every theme first and then writes them in order, so
      // two themes that build the same files are refused before either
      // writes. Any other failure writes the themes built before it, as a
      // shell loop under `set -e` would have, and stops.
      const deferred = !options.check && entries.length > 1;
      // Each built theme keeps its writes and what it prints together; what
      // it prints waits until its outputs are written, so no `[ok]` line
      // names a file that is never written.
      /** @type {Array<{writes: Array<Array<{dest: string, content: string}>>, lines: Array<() => void>}>} */
      const built = [];
      const publish = () => {
        for (const theme of built.splice(0)) {
          writeDeferredBuildOutputs(theme.writes);
          for (const show of theme.lines) show();
        }
      };
      const writeFailed = (/** @type {unknown} */ error) =>
        themeError(
          /** @type {import('../../../api/error.mjs').AstryxError} */ (error),
          words,
          [
            buildWithout(
              [],
              'run the same build again once the files can be written',
            ),
          ],
        );
      /** @type {Map<string, string>} */
      const claimedOutputs = new Map();
      for (const entry of entries) {
        /** @type {Array<() => void>} */
        const lines = [];
        /** @type {Array<Array<{dest: string, content: string}>>} */
        const writes = [];
        const log = logger.log;
        const warn = logger.warn;
        // A group may know fonts the app loads that the theme file cannot
        // say (the editor's app copy stylesheet): those are not named as
        // unloaded, in the notices, the trailer or the full help.
        const loads = words.loadedFonts?.(entry.file, process.cwd()) ?? null;
        /** @param {string} msg */
        const namesOnlyLoaded = msg => {
          // The families the notice names: on its first line, after the
          // theme's own name.
          const line =
            msg
              .split('\n')
              .find(l => /not load/.test(l))
              ?.replace(/^.*?(names fonts it does not load:|Font )/, '') ?? '';
          const fonts = [...line.matchAll(/"([^"]+)"/g)].map(m => m[1]);
          return (
            Boolean(loads) && fonts.length > 0 && fonts.every(f => loads?.(f))
          );
        };
        if (loads && !deferred) {
          logger.log = (/** @type {string | undefined} */ message) => {
            if (
              typeof message === 'string' &&
              /names fonts it does not load|named by this theme but not loaded/.test(
                message,
              ) &&
              namesOnlyLoaded(message)
            )
              return;
            log.call(logger, message);
          };
        }
        if (deferred) {
          logger.log = (/** @type {string | undefined} */ message) => {
            lines.push(() => log.call(logger, message));
          };
          logger.warn = (/** @type {string | undefined} */ message) => {
            lines.push(() => warn.call(logger, message));
          };
        }
        try {
          const buildOptions = {
            out: options.out,
            check: options.check,
            iconsSpecifier: options.iconsSpecifier,
          };
          /** @type {import('../../../api/theme/build/build.mjs').ThemeBuildHandOff} */
          const handOff = {
            claimedOutputs,
            deferredWrites: deferred ? writes : undefined,
            commandWords: words,
          };
          let result;
          if (report) {
            const built = await themeBuildForReport(
              entry.file,
              buildOptions,
              {cwd: process.cwd()},
              {compact},
              handOff,
            );
            result = built.receipt;
            if (loads && built.trailer) {
              const named = (/** @type {string} */ msg) =>
                built.trailer?.unloadedFonts.some(
                  (/** @type {string} */ f) =>
                    loads(f) && msg.includes(`"${f}"`),
                ) ?? false;
              built.trailer.fontNotices = built.trailer.fontNotices.filter(
                (/** @type {string} */ m) => !named(m),
              );
              built.trailer.unloadedFonts = built.trailer.unloadedFonts.filter(
                (/** @type {string} */ f) => !loads(f),
              );
            }
            if (built.trailer) trailers.push(built.trailer);
            if (compact && result?.type === 'theme.build') {
              const {outputs, sizeKB, tokenCount, componentCount} = result.data;
              const show = () =>
                emit(
                  text(
                    `[ok] ${outputs.css} (${sizeKB} KB, ${tokenCount} token overrides, ${componentCount} component overrides)`,
                  ),
                );
              if (deferred) lines.push(show);
              else show();
            }
          } else {
            result = await themeBuildWithHandOff(
              entry.file,
              buildOptions,
              {cwd: process.cwd()},
              handOff,
            );
          }
          logger.log = log;
          logger.warn = warn;
          const data = /** @type {any} */ (result)?.data;
          if (loads && data && Array.isArray(data.notices))
            data.notices = data.notices.filter(
              (/** @type {string} */ m) =>
                !(
                  /named by this theme but not loaded/.test(m) &&
                  namesOnlyLoaded(m)
                ),
            );
          // A group may add to a build's result (the editor's app copy note).
          const extra = words.extraData?.(entry.file, process.cwd(), {
            check: Boolean(options.check),
          });
          if (extra && result?.data) Object.assign(result.data, extra);
          results.push({file: entry.file, receipt: result ?? null});
          if (deferred) built.push({writes, lines});
          if (
            options.check &&
            result &&
            result.type === 'theme.build.check' &&
            !result.data.upToDate
          ) {
            stale = true;
          }
        } catch (e) {
          logger.log = log;
          logger.warn = warn;
          const err =
            /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
          // Stop at the first failure, as a shell loop under `set -e` does.
          // With several themes in flight the message alone rarely says which
          // one broke, so name it. Themes already written keep their install
          // and font guidance.
          if (/** @type {any} */ (err).outputCollision) {
            // Nothing is written, so only this theme's warnings are shown.
            for (const show of lines) show();
            return themeError(err, words, [
              buildWithout([], 'build the first theme on its own', [
                entries[0].file,
              ]),
            ]);
          }
          if (deferred) {
            try {
              publish();
            } catch (writeError) {
              return writeFailed(writeError);
            }
            // The failing theme's warnings, such as a missing package, say
            // why it failed.
            for (const show of lines) show();
          }
          if (report && compact) printCompactTrailer(trailers);
          else if (report) printBatchTrailer(trailers);
          if (entries.length > 1) err.message = `${entry.file}: ${err.message}`;
          return themeError(err, words, buildFallback);
        }
      }
      if (deferred) {
        try {
          publish();
        } catch (e) {
          return writeFailed(e);
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

      // Stale --check output is a failure after its receipt has been emitted.
      if (options.check && stale) {
        process.exitCode = 1;
      }

      // Compiling a theme writes CSS; `--check` compares what is on disk. Both
      // are effects — the receipt (and the exit code) carry the outcome.
      return NO_RESULT_SET;
    },
  });
  // A group may hold locks while a build or check runs (the editor's theme
  // lock), so it never reads a change half written.
  if (words.hold) {
    /** @type {(() => Promise<void>) | undefined} */
    let release;
    buildCli.hook('preAction', async (_, cmd) => {
      // Under --watch each rebuild runs on its own and takes the locks
      // itself; holding them for the whole watch would block every one.
      if (cmd.opts().watch) return;
      release = await words.hold?.(cmd.args, {cwd: process.cwd()});
    });
    buildCli.hook('postAction', async () => {
      await release?.();
      release = undefined;
    });
  }

  const listCli = defineCommand(theme, docs.list, {
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
        return themeError(err, words, [
          options.package
            ? themeCommand(words, 'list', [], 'every theme, from every package')
            : {
                name: `${getCliInvocation(process.cwd())} doctor`,
                reason: 'names the integration or theme that is broken',
              },
        ]);
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

      printThemeList(
        result.data,
        result.meta?.unmigratedCopies,
        words,
        result.meta?.skippedThemes,
      );
      return answered;
    },
  });

  const themeAddCli = defineCommand(theme, docs.add, {
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
        return themeError(err, words, [
          themeCommand(words, 'list', [], 'the themes you can add'),
        ]);
      }

      await warnOnThemeIntegrationIssues(json);
      const answered =
        result.type === 'theme.list'
          ? resultSet({count: result.data.length, resultKind: 'theme'})
          : NO_RESULT_SET;

      if (result.type !== 'theme.list')
        result = /** @type {any} */ (
          inGroupNotes(/** @type {any} */ (result), words)
        );
      if (json) {
        jsonOut(result);
        return answered;
      }
      if (result.type === 'theme.list') {
        printThemeAddList(result.data, words);
        return answered;
      }
      printThemeApp(result);
      return answered;
    },
  });
  // Reject the removed target-path argument in Commander's standard parse path.
  themeAddCli.allowExcessArguments(false);

  const removeCli = defineCommand(theme, docs.remove, {
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
        return themeError(err, words, [
          themeCommand(words, 'list', [], 'the themes this app has added'),
        ]);
      }
      await warnOnThemeIntegrationIssues(json);
      result = inGroupNotes(result, words);
      if (json) jsonOut(result);
      else printThemeApp(result);
      return NO_RESULT_SET;
    },
  });

  const useCli = defineCommand(theme, docs.use, {
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
        return themeError(err, words, [
          themeCommand(words, 'list', [], 'the themes this app has added'),
        ]);
      }
      await warnOnThemeIntegrationIssues(json);
      result = inGroupNotes(result, words);
      if (json) jsonOut(result);
      else printThemeApp(result);
      return NO_RESULT_SET;
    },
  });

  const ejectCli = defineCommand(theme, docs.eject, {
    fn: themeEjectFn,
    action: async (
      /** @type {string} */ slug,
      /** @type {string | undefined} */ targetPath,
      /** @type {{overwrite?: boolean, package?: string}} */ options,
    ) => {
      const json = program.opts().json || false;
      /** @type {import('../../../api/theme/theme.type.mjs').ThemeEjectResponse} */
      let result;
      // Eject's warnings go to stderr in text mode; the logger is silent
      // under --json (cli-surface INV12).
      logger.setSilent(json);
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
        return themeError(err, words, [
          themeCommand(words, 'list', [], 'the themes you can fork'),
        ]);
      }
      await warnOnThemeIntegrationIssues(json);
      if (json) jsonOut(result);
      else
        printThemeEject(
          result,
          words,
          await editorBaseFor(result.data, process.cwd()),
        );
      return NO_RESULT_SET;
    },
  });

  const templateCli = defineCommand(theme, docs.template, {
    fn: themeTemplateFn,
    action: (
      /** @type {string | undefined} */ targetPath,
      /** @type {{overwrite?: boolean}} */ options,
    ) => {
      const json = program.opts().json || false;

      /** @type {import('../../../api/theme/theme.type.mjs').ThemeTemplateResponse} */
      let result;
      try {
        // The experimental command passes its own write, which protects
        // only the editor's own files.
        result = (words.template ?? themeTemplate)({
          targetPath,
          overwrite: options.overwrite,
          cwd: process.cwd(),
        });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return themeError(err, words, [
          // No path: the template at the project root, from any folder.
          themeCommand(
            words,
            'template',
            [],
            'write the template at the project root',
          ),
        ]);
      }

      // Outside a project the template is written here, with one warning
      // on stderr when a file was written; the logger is silent under --json
      // (cli-surface INV12).
      logger.setSilent(json);
      if (result.data.written && !findPackageRoot(process.cwd()))
        logger.warn(OUTSIDE_PROJECT_WARNING);
      // Writes a starter theme file, or declines to overwrite one.
      if (json) {
        jsonOut(result);
        return NO_RESULT_SET;
      }

      const invocation = getCliInvocation(process.cwd());
      if (!result.data.written) {
        const {overwritable, alternative} = result.data;
        emit(
          text(`[skip] ${result.data.path} already exists — left as is.`),
          ...(overwritable === false && alternative
            ? [
                text(
                  'It is not a theme template that --overwrite may replace. Write the template to a new file:',
                ),
                code(
                  `${invocation} ${words.group} template ${quoteCommandArgument(alternative)}`,
                ),
              ]
            : [text(`Pass --overwrite to replace it with a fresh copy.`)]),
        );
        return NO_RESULT_SET;
      }
      emit(
        text(`[ok] Wrote ${result.data.path}`),
        text(
          'It documents every defineTheme field, the token families, and the component override syntax. ' +
            'Copy what you need into your own theme file, then delete it.',
        ),
        code(buildStep(invocation, words, result.data.path)),
      );
      return NO_RESULT_SET;
    },
  });

  const targetsCli = defineCommand(theme, docs.targets, {
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
        return themeError(err, words, [
          themeCommand(words, 'targets', [], 'every theming target'),
        ]);
      }

      // A filter is a substring search with an exact-name fast path (see
      // api/theme/targets), so the mere presence of one proves nothing: `theme
      // targets a` matches everything. A direct match is the filter naming ONE
      // component and getting only that component's targets back — which is
      // exactly the exact-name branch, read off the answer.
      const matched = new Set(
        result.data.targets.map(target => target.component.toLowerCase()),
      );
      const needle = normalizeTargetFilter(filter);
      const answered = resultSet({
        count: result.data.targets.length,
        resultKind: 'theme',
        // Falsy, not just null: the api treats an empty filter as no filter
        // at all, so recording one as a match that missed would invent a
        // failed lookup out of a run that never looked anything up.
        directMatch: !needle
          ? undefined
          : matched.size === 1 && matched.has(needle),
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
  // A stray word is refused rather than dropped: `theme use neutral dark`
  // must not report a success that ignored "dark".
  for (const cli of [
    listCli,
    removeCli,
    useCli,
    ejectCli,
    templateCli,
    targetsCli,
  ]) {
    cli.allowExcessArguments(false);
  }
}
