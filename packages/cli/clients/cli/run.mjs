// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One run of the CLI, after the Node version gate: choose who answers
 * the folder, hand the run off when that is another release (spec AST-081
 * FR2, FR9), then dispatch the command.
 *
 * @input The arguments after `astryx`, read from `process.argv`; the CLI
 *   package root; and, for a run a programmatic host started, the reason the
 *   host declined the project's own CLI.
 * @output The command's effects. The run owns the process: its exit status is
 *   `process.exitCode`, unless a hand-off or a failure exits the process.
 * @position clients/cli — called by `bin/astryx.mjs` and by the host entry
 *   (`host/index.mjs`).
 */

/**
 * Run the CLI once in this process.
 *
 * Every import here is dynamic: modules that load `styleText` must load only
 * after the bin's Node version gate, and the release choice must run before
 * the command modules load, so a run handed to another release loads none of
 * them.
 *
 * @param {{cliRoot: string, argv: string[], declinedProjectCli?: string}} input
 * @returns {Promise<import('../../host/index.js').HostedCliResult | undefined>}
 *   resolves when the command has finished; with another release's result
 *   when, in a hosted run, that release's host entry answered
 */
export async function runCli({cliRoot, argv, declinedProjectCli}) {
  // A folder deleted under the shell (another terminal, `git clean`): every
  // command reads the working folder first, so say so once, plainly, in
  // text and in --json, instead of a stack trace.
  try {
    process.cwd();
  } catch (e) {
    if (/** @type {any} */ (e)?.code !== 'ENOENT') throw e;
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    let up = process.env.PWD ? path.dirname(process.env.PWD) : null;
    while (up && !fs.existsSync(up) && path.dirname(up) !== up)
      up = path.dirname(up);
    const cd = up && fs.existsSync(up) ? up : '~';
    // Help, the version and docs read no folder: run them from an existing
    // one.
    const first = argv.find(a => !a.startsWith('-'));
    if (
      argv.length === 0 ||
      argv.some(a => ['--help', '-h', '--version', '-V'].includes(a)) ||
      first === 'docs' ||
      first === 'help'
    ) {
      process.chdir(cd === '~' ? os.homedir() : cd);
      return runCli({cliRoot, argv, declinedProjectCli});
    }
    const message =
      'The current folder no longer exists (it was deleted or moved). Nothing was written. cd to an existing folder and run the command again.';
    const {quoteCommandArgument} =
      await import('../../foundation/env/package-manager.mjs');
    const suggestions = [
      {
        name: `cd ${cd === '~' ? cd : quoteCommandArgument(cd)}`,
        reason: 'an existing folder',
      },
    ];
    if (argv.includes('--json')) {
      const {toErrorEnvelope} =
        await import('../../foundation/response/json.mjs');
      fs.writeSync(
        1,
        `${JSON.stringify(toErrorEnvelope(message, suggestions, 'ERR_PROJECT_REQUIRED'), null, 2)}\n`,
      );
    } else {
      fs.writeSync(2, `Error: ${message}\n  ${suggestions[0].name}\n`);
    }
    process.exitCode = 1;
    return undefined;
  }
  const {startRun} = await import('../../foundation/release/handoff.mjs');
  const answered = await startRun({cliRoot, argv, declinedProjectCli});
  if (answered) return answered;

  const {
    createProgram,
    loadProjectDebugHandler,
    loadProjectForHelp,
    handleVersionJsonPreflight,
  } = await import('./index.mjs');
  // Only the commands these arguments need load, before anything below runs,
  // as the full program did.
  const program = await createProgram({argv: process.argv.slice(2)});
  const {isJsonMode, toErrorEnvelope} =
    await import('../../foundation/response/json.mjs');
  const {handleCommanderError} = await import('./lib/json-shim.mjs');
  const {setOutcome} = await import('../../foundation/debug/index.mjs');

  /**
   * Top-level error boundary (contract guarantee #4): an uncaught throw must
   * never reach a --json consumer as a raw stack trace. If we're in JSON mode,
   * convert it to the contract's error envelope on stdout and exit 1;
   * otherwise preserve the normal human-facing behavior.
   *
   * We detect JSON mode two ways: the global flag (set once root options are
   * parsed) and a raw argv check, since a throw can occur during
   * parsing/command load — before the preAction hook engages the flag.
   */
  function inJsonMode() {
    return isJsonMode() || process.argv.slice(2).includes('--json');
  }

  /** @param {unknown} err */
  function handleFatal(err) {
    // CommanderError (parse errors, --help, unknown command) routes
    // through the JSON shim so that a --json consumer always gets a
    // valid envelope and the right exit code. handleCommanderError
    // calls process.exit when it owns the error.
    if (handleCommanderError(err)) return;

    // Anything still here is an uncaught throw or an unhandled rejection —
    // a bug rather than a user error, and the class of failure most worth
    // having a record of.
    setOutcome('fatal', {exitCode: 1, error: err});

    if (inJsonMode()) {
      // Only emit if a command didn't already produce an envelope.
      if (!process.__xdsJsonHandled) {
        process.__xdsJsonHandled = true;
        console.log(JSON.stringify(toErrorEnvelope(err), null, 2));
      }
      process.exit(1);
    }
    // Human mode: preserve Commander/Node default-ish behavior.
    console.error(
      err instanceof Error ? err.stack || err.message : String(err),
    );
    process.exit(1);
  }

  process.on('unhandledRejection', handleFatal);
  process.on('uncaughtException', handleFatal);

  // Pick up the project's `debug` function before parsing, so parse errors
  // and `--help` — which short-circuit before any hook runs — are reported
  // too.
  await loadProjectDebugHandler();
  // Help prints its commands while Commander parses, so a help run reads the
  // project's declared `cliCommand` here.
  await loadProjectForHelp();

  // `--version --json` answers and exits without Commander, so it runs here —
  // after the handler exists, or the run would go unrecorded.
  handleVersionJsonPreflight();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    handleFatal(err);
  }
}
