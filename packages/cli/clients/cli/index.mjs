// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Astryx CLI — Commander program setup
 *
 * Registers all commands via lazy loading. If one command fails to load
 * (bad import, syntax error), the other commands still work.
 *
 * The program is built by {@link createProgram} — a factory so tests can drive
 * a FRESH program in-process (via parseAsync) instead of spawning `node
 * bin/astryx.mjs` per assertion. `bin/astryx.mjs` and legacy importers use the
 * eager {@link program} singleton, which is just `await createProgram()`.
 */

import {Command, Option} from 'commander';
import {fileURLToPath} from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {formatCliCommand, getCliInvocation, quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {hasRecordedProject} from '../../foundation/env/cli-command.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {API_VERSION, setJsonMode} from '../../foundation/response/json.mjs';
import {answeredBy, runChoice} from '../../foundation/release/run-context.mjs';
import {cliInstallAdvice, installFolder} from '../../foundation/release/notices.mjs';
import {buildManifest} from './lib/manifest.mjs';
import {cliError} from './lib/cli-error.mjs';
import {section, text, records} from './formatters/index.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';
import {installJsonShim} from './lib/json-shim.mjs';
import {markReportsResult} from './lib/define-command.mjs';
import {
  agentDocsTargetDir,
  assertAgentDocsTarget,
  isAstryxInitialized,
  isAstryxPromptInReach,
} from '../../foundation/agent-docs/agent-docs.mjs';
import {CLI_ROOT} from '../../foundation/fs/paths.mjs';
import {setupNudge} from '../../foundation/agent-docs/agent-doc-state.mjs';
import * as debug from '../../foundation/debug/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json so it stays in sync
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));

// Start the debug recorder before anything can exit. Allocation only — no
// filesystem, no environment probe, no config — and it must run ahead of the
// --version preflight below so even that early exit is recorded. The env
// probe is deferred to delivery. See foundation/debug.
debug.begin({cliVersion: pkg.version});

/**
 * Intercept `astryx --version --json` (or `-V --json`) before Commander
 * processes the version flag and exits. Commander's built-in version handler
 * prints the raw version string and calls process.exit, bypassing our hooks —
 * so the only correct place to JSON-ify it is ahead of the parse.
 *
 * The bin calls this AFTER the project's debug handler is loaded, not at import
 * time: this path exits the process itself, so running it any earlier meant the
 * one invocation that took it was the only invocation nothing was ever recorded
 * for. Guarded on argv, so it is a no-op for every other run and for tests that
 * import this module.
 *
 * @param {string[]} [argv] arguments after the binary.
 * @returns {void}
 */
export function handleVersionJsonPreflight(argv = process.argv.slice(2)) {
  if (!(argv.includes('--version') || argv.includes('-V'))) return;
  if (!argv.includes('--json')) return;
  process.__xdsJsonHandled = true;
  // Printing the version is not a lookup — the same answer every time — so it
  // reports the same shape Commander's own `--version` path does.
  debug.recordCommandResult(debug.NO_RESULT_SET);
  debug.setOutcome('ok', {exitCode: 0});
  console.log(JSON.stringify({apiVersion: API_VERSION, type: 'version', data: {version: pkg.version}, meta: {answeredBy: answeredBy()}}, null, 2));
  process.exit(0);
}

/**
 * Allowlist of fully-qualified command names that natively support --json.
 * Subcommands are listed by their full path (parent + leaf), e.g. "theme build".
 *
 * Commands NOT in this set will be rejected by the preAction hook below
 * BEFORE any side effects can run. This protects users from partial state
 * (e.g. files written, then --json error printed) on commands that don't
 * yet support structured output.
 */
export const JSON_SUPPORTED = new Set([
  'init',
  'component',
  'docs',
  'blog',
  'discover',
  'search',
  'experimental icon',
  'experimental icon add',
  'experimental icon map',
  'experimental icon use',
  'experimental icon new-set',
  'experimental icon new-definition',
  'experimental render',
  'build',
  'swizzle',
  'gap-report',
  'template',
  'hook',
  'theme build',
  'theme list',
  'theme add',
  'theme remove',
  'theme use',
  'theme eject',
  'theme template',
  'theme targets',
  'theme palette generate',
  'integration add',
  'integration check',
  'integration verify',
  'integration pack',
  'upgrade',
  'manifest',
  'doctor',
  'doctor integration validate',
  'doctor integration templates',
  'doctor integration components',
  'doctor integration docs',
]);

/**
 * Compute the fully qualified command name, e.g. "theme build" or "swizzle".
 * @param {import('commander').Command} actionCommand
 * @param {import('commander').Command} root the root program
 * @returns {string}
 */
function fullCommandName(actionCommand, root) {
  const parts = [];
  /** @type {import('commander').Command | null} */
  let cmd = actionCommand;
  while (cmd && cmd !== root) {
    parts.unshift(cmd.name());
    cmd = cmd.parent;
  }
  return parts.join(' ');
}

/**
 * Load the handlers that will receive this run, before Commander parses.
 *
 * Called from the bin BEFORE Commander parses, not from a hook. Most commands
 * never touch `astryx.config` on their own, and parse errors and `--help`
 * short-circuit before any hook runs — so anywhere later would leave exactly
 * the failures you most want reported with nowhere to report them.
 *
 * The gate before the load is the point. `Project.load` EVALUATES the config
 * module and loads every integration it names, and before this feature most
 * commands did neither: running a project's own code on `astryx --version`,
 * for a project that never asked for any of this, is not a cost the feature
 * gets to impose. So the file is read as text first and only loaded if it
 * mentions something that could produce a handler. A project with no config
 * pays one `existsSync` walk; a project with a config that mentions neither
 * pays one small `readFile`.
 *
 * TWO words open the gate, because there are two places a handler can come
 * from. `debug` is the project's own. `integrations` is the other: an
 * integration contributes a handler as a `debug` named export from its
 * manifest, so a config that lists integrations may have one even though the
 * word `debug` appears nowhere in it — which is the shape of essentially every
 * app that installs an integration. Without the second word this feature would
 * reach only the commands that happen to load a Project for their own reasons
 * (`component`, `search`, `docs`, `template`, `doctor`, …) and would miss
 * `--version`, `--help`, `theme *`, `blog`, and every parse error.
 *
 * Measured cost of that second word, on an integration whose manifest is
 * TypeScript (the expensive case — jiti): ~50ms added to `astryx --version`,
 * and nothing at all to a command that was going to load the project anyway.
 * It is paid only by projects that declare integrations.
 *
 * The text test is deliberately loose — any occurrence, comments included —
 * because a false positive costs one config load the CLI used to do anyway,
 * while a false negative silently records nothing. The one shape it cannot
 * see is a config that never spells either word, e.g. spreading in an object
 * from another module; that is documented on the `debug` config key.
 *
 * @returns {Promise<void>}
 */
export async function loadProjectDebugHandler() {
  try {
    const {findConfigPath, Project} = await import(
      '../../foundation/config/project.mjs'
    );
    const configPath = findConfigPath(process.cwd());
    if (!configPath) return;
    const text = fs.readFileSync(configPath, 'utf-8');
    if (!text.includes('debug') && !text.includes('integrations')) {
      debug.noteConfigGateSkipped();
      return;
    }
    await Project.load(process.cwd());
  } catch {
    // A broken config is the command's problem to report, not ours.
  }
}

/**
 * Load the project's integrations before a help run, so help prints commands
 * with the `cliCommand` they declare (spec:AST-081 FR5). Help is printed while
 * Commander parses, before any hook, so the preAction load cannot reach it.
 * `Project.load` reads astryx.config and each integration's manifest; it does
 * no discovery. Skipped when the debug preload already loaded the project, and
 * outside a package. Called from the bin before Commander parses.
 *
 * @param {string[]} [argv] arguments after the binary.
 * @returns {Promise<void>}
 */
export async function loadProjectForHelp(argv = process.argv.slice(2)) {
  const help =
    argv.includes('--help') || argv.includes('-h') || argv[0] === 'help';
  if (!help) return;
  try {
    const cwd = process.cwd();
    if (hasRecordedProject(cwd)) return;
    const {Project} = await import('../../foundation/config/project.mjs');
    await Project.load(cwd);
  } catch {
    // Help prints with the package-manager guess.
  }
}

/**
 * Hand the whole invocation to the debug recorder: which command ran, its
 * positional arguments by name, its options and where each value came from,
 * and the root-level flags.
 *
 * This lives in a `preAction` hook rather than in `defineCommand` because the
 * hook fires for EVERY action — including the four commands registered inline
 * below (root, manifest, postinstall, and the load-failure stub), which never
 * pass through the converter. One capture point, no coverage gaps.
 *
 * @param {import('commander').Command} actionCommand
 * @param {import('commander').Command} root
 */
function captureInvocation(actionCommand, root) {
  const name = fullCommandName(actionCommand, root);
  debug.setCommand(name);
  debug.setGlobalOptions(root.opts());

  // Only pay for these probes when something will actually read them. Both
  // touch the filesystem, and most commands never load a Project — which is
  // why recording them here rather than at the config boundary is what makes
  // them present at all.
  if (debug.isRecording()) {
    try {
      const cwd = process.cwd();
      debug.setProject({
        inProject: fs.existsSync(path.join(cwd, 'package.json')),
        initialized: isAstryxInitialized(cwd),
      });
    } catch {
      // Leave them null rather than failing the command.
    }
  }

  // Positional values arrive as a bare array; pair them with the declared
  // argument names so the log records `{component: 'XDSButton'}` rather than
  // an anonymous `['XDSButton']` nobody can query. `registeredArguments` is
  // Commander 12's accessor and `_args` the older internal — read both, as
  // lib/manifest.mjs does, so a Commander bump degrades to unnamed args
  // rather than losing them.
  const declared =
    /** @type {any} */ (actionCommand).registeredArguments ??
    /** @type {any} */ (actionCommand)._args ??
    [];
  const values = actionCommand.args ?? [];
  /** @type {Record<string, unknown>} */
  const args = {};
  declared.forEach((/** @type {any} */ arg, /** @type {number} */ i) => {
    const key = typeof arg?.name === 'function' ? arg.name() : `arg${i}`;
    if (values[i] !== undefined) args[key] = values[i];
  });
  // Anything Commander did not have a declaration for (extra positionals on
  // the root command, which is how an unknown command arrives here).
  if (values.length > declared.length) {
    args.extra = values.slice(declared.length);
  }
  debug.setArgs(args);

  /** @type {Record<string, string>} */
  const sources = {};
  const options = actionCommand.opts();
  for (const key of Object.keys(options)) {
    const source = actionCommand.getOptionValueSource?.(key);
    if (source) sources[key] = source;
  }
  debug.setOptions(options, sources);
}

/**
 * Command registry — each command is lazy-loaded so a broken command
 * doesn't take down the entire CLI.
 */
const commands = [
  {name: 'init', path: './commands/init.mjs', register: 'registerInit'},
  {name: 'component', path: './commands/component.mjs', register: 'registerComponent'},
  {name: 'docs', path: './commands/docs.mjs', register: 'registerDocs'},
  {name: 'blog', path: './commands/blog.mjs', register: 'registerBlog'},
  {name: 'swizzle', path: './commands/swizzle.mjs', register: 'registerSwizzle'},
  {name: 'gap-report', path: './commands/gap-report.mjs', register: 'registerGapReport'},
  // agent-docs folded into init — functions still importable from agent-docs.mjs
  {name: 'template', path: './commands/template.mjs', register: 'registerTemplate'},
  {name: 'upgrade', path: './commands/upgrade.mjs', register: 'registerUpgrade'},
  {name: 'theme', path: './commands/theme.mjs', register: 'registerTheme'},
  {name: 'integration', path: './commands/integration.mjs', register: 'registerIntegration'},
  {name: 'hook', path: './commands/hook.mjs', register: 'registerHook'},
  {name: 'discover', path: './commands/discover.mjs', register: 'registerDiscover'},
  {name: 'search', path: './commands/search.mjs', register: 'registerSearch'},
  {name: 'build', path: './commands/build.mjs', register: 'registerBuild'},
  {name: 'doctor', path: './commands/doctor.mjs', register: 'registerDoctor'},
  // Experimental commands (spec:AST-017 FR27): last, so every stable command
  // keeps its place in help.
  {
    name: 'experimental',
    path: './commands/experimental/index.mjs',
    register: 'registerExperimental',
  },
  // Registered after every other command: the manifest lists the commands in
  // registration order.
  {name: 'manifest', path: './commands/manifest.mjs', register: 'registerManifest'},
  {name: 'postinstall', path: './commands/postinstall.mjs', register: 'registerPostinstall'},
];

const SETUP_NUDGE_EXEMPT = new Set(['init', 'agent-docs']);

/**
 * Is `cwd` inside the CLI's own source checkout while the CLI runs from it?
 * An installed CLI always lives under `node_modules`; a CLI running from source
 * does not, and its checkout is the pnpm workspace that holds it. Developing
 * Astryx is not an app to set up, so the setup nudge stays quiet there.
 * @param {string} cwd
 * @returns {boolean}
 */
function inOwnSourceCheckout(cwd) {
  if (CLI_ROOT.split(path.sep).includes('node_modules')) return false;
  let checkout = CLI_ROOT;
  while (!fs.existsSync(path.join(checkout, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(checkout);
    if (parent === checkout) return false;
    checkout = parent;
  }
  const rel = path.relative(checkout, path.resolve(cwd));
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
/** An integration package's manifest: the package is not an app to set up. */
const INTEGRATION_MANIFEST_FILES = [
  'astryx.integration.ts',
  'astryx.integration.mjs',
  'astryx.integration.js',
];

/**
 * Build a fresh, fully-wired Astryx CLI program (root options, hooks, all
 * commands, manifest/postinstall, json-shim). Async because commands are
 * lazy-imported. Each call returns an independent Command so tests can
 * parseAsync repeatedly without commander state leaking between runs.
 *
 * @returns {Promise<import('commander').Command>}
 */
export async function createProgram() {
  const program = new Command();

  // Deterministic, single-line help. Commander wraps each option/command
  // description to a column width (80 when captured non-TTY), which splits long
  // descriptions like --json across several indented lines. Override `wrap` to a
  // no-op so every item stays on one line — matching the rest of the CLI's
  // plain, unwrapped, width-independent output. Set before subcommands are
  // registered so they inherit it via copyInheritedSettings.
  program.configureHelp({wrap: (str) => str});

  // Document the text-output contract in --help so agents know how to parse/grep
  // it (and when to reach for --json instead). Kept in sync with the formatter
  // kit in clients/cli/formatters.
  program.addHelpText(
    'after',
    // A function, so the example names the invocation when help is printed.
    () => '\n' +
      [
        section(
          'Output format',
          'Text mirrors --json (the machine-readable surface); it is built from these blocks:',
        ),
        records(
          [
            {
              block: 'Record',
              shape: 'aligned "key: value" lines = one item; records separated by a blank line',
            },
            {
              block: 'Section',
              shape: 'a header line (no "key:"), optional one-line subtitle, then its records/list',
            },
            {block: 'List', shape: '"- value" lines for a simple sequence of values'},
            {block: 'Text', shape: 'free-form prose / notes'},
            {block: 'Code', shape: 'a verbatim block (source, skeleton, or doc), emitted exactly'},
          ],
          {fields: ['block', 'shape']},
        ),
        text(
          `Grep a field across records, e.g.  ${formatCliCommand('search button')} | grep "^command:". ` +
            'Errors/warnings go to stderr; use --json for structured parsing.',
        ),
        text(
          "Global mode: in a project, the project's own CLI answers (this copy hands the run to it); a copy installed for the computer checks for updates once a day and keeps an agent skill in your home folder. " +
            `See ${formatCliCommand('docs global')}.`,
        ),
      ]
        .map(block => block.toString())
        .join('\n\n'),
  );

  program
    .name('astryx')
    .description('Design system CLI — components, themes, and tooling')
    .version(pkg.version)
    // These four change only the reads named in their text; every other
    // command ignores them.
    .option(
      '--zh',
      'Simplified Chinese for component reads and for docs topics that have a translation (English otherwise)',
    )
    .option('--dense', 'Token-efficient dense text for component <Name> and docs <topic> reads')
    .addOption(
      new Option(
        '--lang <locale>',
        'Language or format for component and docs reads: en (default), zh (as --zh), or dense (as --dense)',
      ).choices(['en', 'zh', 'dense']),
    )
    .addOption(
      new Option(
        '--detail <level>',
        'Detail level for component, hook, and docs tree reads (e.g. docs cli/commands/build), and for theme build reports. Lists default to brief; theme build prints one line per built theme unless full, which adds the install example and font recipe',
      )
        .choices(['full', 'compact', 'brief'])
        .default('full'),
    )
    .option(
      '--json',
      'Output as typed JSON. Success envelope: { apiVersion, type, package?, data, meta? }. Error envelope: { apiVersion, error, code, suggestions? }.',
    )
    .addHelpCommand('help', 'Show all commands')
    .action((options, cmd) => {
      // If Commander handed us a positional that didn't match any subcommand,
      // treat it as "unknown command" — exit 1 with a helpful suggestion.
      // This is the bare-invocation handler; if cmd.args has content here,
      // none of the registered subcommands matched.
      const extras = (cmd && cmd.args) || [];
      if (extras.length > 0) {
        const unknown = String(extras[0]);
        const known = (program.commands || [])
          .filter((c) => !(/** @type {any} */ (c)._hidden) && c.name() !== 'help')
          .map((c) => c.name());
        const close = known
          .map((name) => ({name, distance: levenshteinDistance(unknown.toLowerCase(), name.toLowerCase())}))
          .filter((s) => s.distance <= 3)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3)
          .map((s) => ({name: s.name, reason: 'did you mean this?'}));
        // If we have close matches, surface those. Otherwise list all known commands
        // so callers (including AI agents) can see what's available.
        const suggestions = close.length > 0
          ? close
          : known.map((name) => ({name, reason: 'available command'}));
        cliError(`unknown command '${unknown}'`, {suggestions, code: ERROR_CODES.ERR_UNKNOWN_COMMAND});
        return;
      }

      // `xds` (no subcommand) — print help, or emit a JSON envelope when --json.
      // Either way the run reports what it answered with, as every command
      // does: the manifest is a list of commands, help is an effect. The rest
      // of the CLI gets there through its action's return type — see
      // lib/define-command.mjs; the four commands registered by hand in this
      // file are the exceptions that report for themselves.
      if (program.opts().json) {
        // Emit the full capability manifest so an agent can drive the entire
        // CLI from one call — no need to scrape `--help` text. We derive this
        // from Commander metadata (commands, args, flags) and layer on the
        // JSON_SUPPORTED allowlist + per-command response types. See
        // lib/manifest.mjs.
        //
        // Backwards-compat: the envelope keeps `type: 'help'` and the original
        // shallow fields (`name`, `version`, `commands` as a string[] of names,
        // `jsonSupported`) that earlier consumers read. The richer, structured
        // surface is embedded under `data.manifest` (and is also available
        // standalone via `astryx manifest --json` as `type: 'manifest'`).
        process.__xdsJsonHandled = true;
        const manifest = buildManifest(program, {
          jsonSupported: JSON_SUPPORTED,
          version: pkg.version,
        });
        console.log(JSON.stringify({
          apiVersion: API_VERSION,
          type: 'help',
          data: {
            name: manifest.name,
            version: manifest.version,
            // Original flat list of command names (string[]) — kept for compat.
            commands: manifest.commands.map((c) => c.name),
            jsonSupported: manifest.jsonSupported,
            // Enriched, self-describing surface (the full manifest payload).
            manifest,
          },
          meta: {answeredBy: answeredBy()},
        }, null, 2));
        debug.recordCommandResult(
          debug.resultSet({
            count: manifest.commands.length,
            resultKind: 'command',
          }),
        );
        return;
      }
      debug.recordCommandResult(debug.NO_RESULT_SET);
      program.help();
    });
  markReportsResult(program);

  /**
   * Pre-action hook: gate --json BEFORE any command body runs.
   *
   * If --json is set on a command that is not on the JSON_SUPPORTED allowlist,
   * emit a structured error envelope and exit 1 — without running the command's
   * action (so no filesystem mutations, no interactive prompts, no spawned processes).
   *
   * This is the single source of truth for "command does not support --json".
   * Individual commands should NOT re-check this; they may assume that if their
   * action runs with --json, they are responsible for emitting an envelope on
   * every code path.
   */
  /**
   * Debug capture. Registered first so the invocation is on record before any
   * later hook can reject it, and inside a try/catch because a recording bug
   * must never be the reason a command fails.
   */
  program.hook('preAction', (thisCommand, actionCommand) => {
    try {
      captureInvocation(actionCommand, program);
    } catch {
      // Never let recording break the CLI.
    }
  });

  program.hook('preAction', (thisCommand, actionCommand) => {
    if (!program.opts().json) return;
    // Engage global JSON mode so humanLog()/humanWarn() across commands become
    // no-ops — stdout now carries only the JSON envelope.
    setJsonMode(true);
    // The root program's own action (no subcommand) is handled directly in
    // its action handler — let it through. fullCommandName is '' there.
    if (actionCommand === program) return;
    const fullName = fullCommandName(actionCommand, program);
    if (JSON_SUPPORTED.has(fullName)) return;
    process.__xdsJsonHandled = true;
    // A group given a word it does not have reports an unknown subcommand and
    // lists the ones it has, in JSON as in text, even when a flag follows it.
    const extras = actionCommand.commands.length > 0 ? actionCommand.args : [];
    const unknown = extras.find(arg => !String(arg).startsWith('-'));
    if (unknown != null) {
      cliError(`unknown subcommand '${fullName} ${unknown}'`, {
        code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
        suggestions: actionCommand.commands.map(child => ({
          name: child.name(),
          reason: 'available subcommand',
        })),
      });
    }
    debug.setOutcome('rejected', {
      exitCode: 1,
      code: ERROR_CODES.ERR_INVALID_OPTION,
    });
    console.log(JSON.stringify({
      apiVersion: API_VERSION,
      error: `JSON output is not supported for the '${fullName}' command`,
      code: ERROR_CODES.ERR_INVALID_OPTION,
    }, null, 2));
    process.exit(1);
  });

  /**
   * Belt-and-suspenders postAction: if a "supported" command somehow forgot
   * to emit a JSON envelope on a code path, surface that as a structured error
   * rather than silent stdout corruption. This should never fire in practice;
   * if it does, it's a bug in the command implementation.
   */
  program.hook('postAction', (thisCommand, actionCommand) => {
    if (!program.opts().json) return;
    if (process.__xdsJsonHandled) return;
    const fullName = fullCommandName(actionCommand, program);
    console.log(JSON.stringify({
      apiVersion: API_VERSION,
      error: `Internal: '${fullName}' completed without emitting a JSON envelope`,
      // `code` always appears on an error envelope so consumers can branch on
      // it unconditionally. This belt-and-suspenders path is an internal
      // condition, so it uses the generic ERR_UNKNOWN.
      code: ERROR_CODES.ERR_UNKNOWN,
    }, null, 2));
    process.exit(1);
  });

  /**
   * Load the project's integrations before any command runs, so every command
   * it prints starts with the `cliCommand` they declare (the picker reads them
   * synchronously; see foundation/env/cli-command.mjs). Skipped when this
   * process already loaded the project, such as the bin's debug preload. A
   * project that cannot load is the command's to report, never this hook's.
   */
  program.hook('preAction', async () => {
    try {
      const cwd = process.cwd();
      if (hasRecordedProject(cwd)) return;
      const {Project} = await import('../../foundation/config/project.mjs');
      await Project.load(cwd);
    } catch {
      // Best-effort: the picker falls back to its package-manager guess.
    }
  });

  /**
   * Enforcement layer 3 — setup nudge. If this project hasn't run `astryx init`
   * yet (no Astryx marker in any agent-doc file between the project and its
   * repository root — see isAstryxPromptInReach), remind the user/agent that
   * setup is missing.
   *
   * Uses `preAction` (not postAction) so it fires for EVERY valid command — even
   * ones whose action errors or calls process.exit (postAction is skipped then).
   *
   * Suppressed in --json: that is machine output with a strict clean stdout+stderr
   * contract (json-shim.test: "error envelopes have empty stderr"), and --json
   * consumers parse stdout, not stderr — a stderr nudge would not reach them anyway.
   * The core/cli postinstall layers already nudge at install time regardless of
   * --json; a machine-readable nudge could later be an envelope field. Also skipped
   * for the installer commands themselves, outside a project (no package.json,
   * or one that neither installs nor declares Astryx), and inside the CLI's own
   * source checkout when it runs from there.
   */
  program.hook('preAction', (thisCommand, actionCommand) => {
    try {
      if (program.opts().json) return; // machine mode — keep --json output clean
      if (SETUP_NUDGE_EXEMPT.has(actionCommand.name())) return;
      const cwd = process.cwd();
      if (!fs.existsSync(path.join(cwd, 'package.json'))) return; // not a project
      // A package.json that neither installs nor declares Astryx is outside a
      // project: `init` would set up a project the folder does not have
      // (spec AST-081 FR3).
      if (isOutsideProject(cwd)) return;
      // An integration package is not an app: `init` is not its next step.
      if (INTEGRATION_MANIFEST_FILES.some(file => fs.existsSync(path.join(cwd, file)))) return;
      if (inOwnSourceCheckout(cwd)) return; // developing Astryx itself, not an app
      if (isAstryxPromptInReach(cwd)) return; // already set up — stay quiet
      // Where init writes the docs, by init's own rule: the project root, which
      // can sit above a nested package such as functions/. Inside a git
      // repository the walk above already reaches it (the root never lies
      // above the repository root), so this changes nothing there; outside a
      // repository the walk checks only cwd, and this finds the root.
      if (isAstryxInitialized(agentDocsTargetDir(cwd))) return;
      // In the home folder, or at the top of a settings folder in it, init
      // writes no agent docs, so naming it would repeat on every command.
      try {
        assertAgentDocsTarget(agentDocsTargetDir(cwd));
      } catch {
        return;
      }
      // Same wording as the core/cli postinstall nudges. getCliInvocation()
      // renders the correct form for THIS project — an integration's cliCommand,
      // scoped `npx @astryxdesign/cli` one-off, or `<pm> astryx` when installed —
      // never npx with the unscoped name, which fetches an unrelated package.
      // A project with no CLI of its own, answered by another release than its
      // Core's: add the CLI at Core's version first, as the daily hint says,
      // then run that CLI's init (spec AST-081 FR2).
      // A folder that belongs to no project spec:AST-040 FR9 defines gets no
      // reminder, as outside a project.
      const target = installFolder(cwd);
      if (target == null) return;
      // From a folder inside the project whose package.json is not the
      // project's, init runs from the project's folder. Only `cd` comes
      // before it, so the command is the picker's for that folder, never the
      // bare `astryx` name a package runner would fetch from the registry
      // (spec AST-081 FR5).
      if (target.moved) {
        console.error(
          setupNudge(getCliInvocation(target.dir), {before: `cd ${quoteCommandArgument(target.dir)}`}).trimEnd(),
        );
        return;
      }
      const choice = runChoice(cwd);
      if (choice.copy === 'starting' && choice.coreVersion && choice.coreVersion !== choice.version) {
        // The daily hint's comparison and command: add the CLI at Core's
        // version, then run that CLI's init.
        const add = cliInstallAdvice({cwd, core: choice.coreVersion});
        if (add?.command) {
          console.error(
            setupNudge(getCliInvocation(add.root, {installed: true}), {before: add.command}).trimEnd(),
          );
          return;
        }
      }
      console.error(setupNudge(getCliInvocation(cwd)).trimEnd());
    } catch {
      // Never let the nudge break a command.
    }
  });

  for (const cmd of commands) {
    try {
      const mod = await import(cmd.path);
      mod[cmd.register](program, {jsonSupported: JSON_SUPPORTED, version: pkg.version});
    } catch (e) {
      // Command fails to load but CLI still works
      const reason = /** @type {any} */ (e).message;
      const stub = program
        .command(cmd.name)
        .description(`(failed to load: ${reason})`)
        .action(() => {
          // Nothing loaded, so nothing was answered — say that rather than
          // leaving the run's result unreported.
          debug.recordCommandResult(debug.NO_RESULT_SET);
          // cliError, so --json still gets its one envelope.
          cliError(`Command "${cmd.name}" failed to load: ${reason}`, {
            code: ERROR_CODES.ERR_UNKNOWN,
          });
        });
      markReportsResult(stub);
    }
  }

  // Install the JSON shim AFTER all commands are registered so we can
  // patch outputHelp on every command (root + subcommands). The shim
  // extends the --json contract to cover Commander's parse-time short
  // circuits (parse errors, unknown options, --help, unknown commands).
  // See packages/cli/lib/json-shim.mjs for the rationale.
  installJsonShim(program);

  return program;
}

/**
 * Eager singleton program for `bin/astryx.mjs` and legacy importers. Tests
 * should call {@link createProgram} to get an isolated instance.
 */
export const program = await createProgram();
