// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every command that runs reports what it answered with.
 *
 * The contract is enforced twice, on purpose, because it has two holes and they
 * are different shapes:
 *
 *   1. A command registered through `defineCommand` cannot forget: its action's
 *      RETURN TYPE is `CommandResult`, so a missing or wrong descriptor is a
 *      typecheck failure before the code ever runs. That is the real gate.
 *   2. A command registered by hand — `program.command(...).action(...)` —
 *      bypasses the converter and therefore bypasses the type. Nothing about
 *      such a command looks wrong; it simply reports nothing, forever, and the
 *      only symptom is a column of nulls in somebody's query months later.
 *
 * This file is the second gate. It walks the ASSEMBLED program — the same one
 * the binary runs — and requires every command that can execute to be on the
 * reporting path. A new command fails here until someone makes a deliberate
 * choice about what it answers with.
 *
 * @input the assembled Commander program
 * @output a failure naming any command that would run unreported
 * @position packages/cli/clients/cli — command coverage
 */

import {describe, it, expect} from 'vitest';
import {program} from './index.mjs';
import {reportsResult, reportsResultVia} from './lib/define-command.mjs';

/**
 * Commands with no action of their own: bare `astryx layout` prints its
 * subcommand list and does nothing else, so there is no run to report on.
 *
 * Pinned as a SET rather than skipped silently — if a command joins this list,
 * that is a real change to what the CLI does and it should be read, not
 * absorbed. (`theme` is deliberately NOT here: it HAS an action — the one that
 * rejects an unknown subcommand — so it goes through the converter like any
 * other. Its bare form prints help and never returns from that action, which
 * the recorder covers where help is recorded, not here.)
 */
const NO_ACTION_OF_THEIR_OWN = [];

/**
 * Commands that record for themselves instead of returning a descriptor.
 *
 * Empty: every command, `manifest` and the hidden `postinstall` hook included,
 * registers through defineCommand. The mark is a hatch, and a hatch nobody
 * watches is a hole: this list is the watch. The root program is checked
 * separately below.
 * @type {string[]}
 */
const RECORD_FOR_THEMSELVES = [];

/**
 * Every command in the program, depth first, with its fully qualified name.
 * @param {import('commander').Command} parent
 * @param {string} [prefix]
 * @returns {Array<{name: string, command: import('commander').Command}>}
 */
function allCommands(parent, prefix = '') {
  /** @type {Array<{name: string, command: import('commander').Command}>} */
  const found = [];
  for (const command of parent.commands) {
    const name = prefix ? `${prefix} ${command.name()}` : command.name();
    found.push({name, command});
    found.push(...allCommands(command, name));
  }
  return found;
}

/** @param {import('commander').Command} command */
const runs = command =>
  typeof (/** @type {any} */ (command)._actionHandler) === 'function';

describe('every command reports what it answered with', () => {
  const commands = allCommands(program);

  it('walks the real program', () => {
    // A walk that finds nothing would pass every assertion below it. Guard the
    // guard: this is the whole CLI, so the count is in the dozens.
    expect(commands.length).toBeGreaterThan(20);
  });

  it('covers every command that can run', () => {
    const unreported = commands
      .filter(({command}) => runs(command) && !reportsResult(command))
      .map(({name}) => name);
    expect(unreported, unreported.length
      ? `these commands run without reporting a result — return a CommandResult ` +
        `from the action (see foundation/debug/command-result.mjs), or register ` +
        `through defineCommand: ${unreported.join(', ')}`
      : '',
    ).toEqual([]);
  });

  it('covers the root program itself', () => {
    // Bare `astryx` prints help; `astryx --json` prints the manifest. Both are
    // runs, so both are reported.
    expect(reportsResult(program)).toBe(true);
  });

  it('pins the commands allowed to record for themselves', () => {
    // Everything else must go through the converter, where the return type is
    // what makes the report unforgettable. Marking a hand-written command
    // reporting nothing would otherwise pass every check in this file.
    const manual = commands
      .filter(({command}) => reportsResultVia(command) === 'manual')
      .map(({name}) => name)
      .sort();
    const unexpected = manual.filter(
      name => !RECORD_FOR_THEMSELVES.includes(name),
    );
    // Two very different causes, and the message has to name both: someone
    // used the hatch instead of the contract, OR one of the real command
    // MODULES failed to import and left its fallback stub in its place (the
    // stub carries the mark, so it lands here). The second is a broken CLI,
    // not a broken test.
    expect(manual, unexpected.length
      ? `unexpected commands recording for themselves: ${unexpected.join(', ')} ` +
        `— either a hand-registered command is using markReportsResult instead ` +
        `of returning a CommandResult, or that command's module failed to load ` +
        `and left its fallback stub behind (run \`astryx <name>\` to see the ` +
        `import error)`
      : '',
    ).toEqual([...RECORD_FOR_THEMSELVES].sort());
  });

  it('pins the commands that have no action at all', () => {
    const actionless = commands
      .filter(({command}) => !runs(command))
      .map(({name}) => name)
      .sort();
    expect(actionless).toEqual([...NO_ACTION_OF_THEIR_OWN].sort());
  });
});
