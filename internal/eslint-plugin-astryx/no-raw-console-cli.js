// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-console-cli.js
 * @description Enforce the CLI's output funnels so `--json` stdout stays clean
 * and human output stays consistent (#2467).
 *
 * Two bans:
 *
 * 1. Bare `console.log` in ANY CLI runtime file. The machine-readable JSON
 *    output owns stdout in `--json` mode; a stray `console.log` corrupts it.
 *      Banned:   console.log(...)
 *      Allowed:  console.error / console.warn (stderr — never corrupts JSON)
 *
 * 2. `humanLog(...)` / `humanWarn(...)` in COMMAND files
 *    (clients/cli/commands/**). Command human output must go through the single
 *    formatter sink `emit(...)` (clients/cli/formatters) so every command renders
 *    consistently; errors/warnings go through `cliError()` (stderr). `humanLog`
 *    is now an internal primitive used only by `emit` and the shared `logger` —
 *    commands should never call it directly.
 *
 * The console.log autofix rewrites `console.log(` → `humanLog(` for non-command
 * files (the logger/formatters/etc.). There is no autofix for ban #2: moving a
 * command to `emit` isn't a mechanical rename (emit takes Blocks, not strings).
 *
 * Files that legitimately write raw stdout or own the funnels are exempt from
 * ban #1:
 *   - packages/cli/foundation/response/json.mjs (defines humanLog / jsonOut)
 *   - packages/cli/clients/cli/index.mjs      (wiring / banner)
 *   - packages/cli/clients/cli/bin/astryx.mjs (entrypoint / Node gate)
 *   - packages/cli/clients/cli/run.mjs        (one run / error boundary)
 */

const EXEMPT_SUFFIXES = [
  'packages/cli/foundation/response/json.mjs',
  'packages/cli/clients/cli/index.mjs',
  'packages/cli/clients/cli/bin/astryx.mjs',
  'packages/cli/clients/cli/run.mjs',
];

// Command files must funnel human output through emit(); humanLog/humanWarn are
// off-limits there (they remain available to the sink implementers: the logger,
// the formatters, and cli-error, none of which live under commands/).
const COMMANDS_DIR = 'clients/cli/commands/';

function normalize(filename) {
  // Normalize Windows separators so path matching is platform-agnostic.
  return filename.replace(/\\/g, '/');
}

function isExempt(filename) {
  const normalized = normalize(filename);
  return EXEMPT_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce CLI output funnels: no console.log anywhere; no humanLog/humanWarn in command files (use emit)',
      category: 'Astryx Conventions',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      noRawConsoleLog:
        'Do not use console.log in CLI runtime code — it writes raw stdout and ' +
        'can corrupt --json output. Use humanLog() (from lib/json.mjs), or ' +
        'console.error/console.warn for stderr.',
      noHumanLogInCommand:
        'Do not call {{name}}() in a command file — human stdout must go through ' +
        'emit() (clients/cli/formatters), and errors/warnings through cliError(). ' +
        'humanLog/humanWarn are internal primitives for the logger and formatters.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExempt(filename)) {
      return {};
    }
    const inCommands = normalize(filename).includes(COMMANDS_DIR);

    return {
      CallExpression(node) {
        const callee = node.callee;

        // Ban #1: console.log (all CLI runtime files).
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'console' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'log'
        ) {
          context.report({
            node: callee,
            messageId: 'noRawConsoleLog',
            fix(fixer) {
              // console.log -> humanLog (rename the call; import is the
              // author's responsibility).
              return fixer.replaceText(callee, 'humanLog');
            },
          });
          return;
        }

        // Ban #2: humanLog/humanWarn inside command files.
        if (
          inCommands &&
          callee.type === 'Identifier' &&
          (callee.name === 'humanLog' || callee.name === 'humanWarn')
        ) {
          context.report({
            node: callee,
            messageId: 'noHumanLogInCommand',
            data: {name: callee.name},
          });
        }
      },
    };
  },
};

export default rule;
