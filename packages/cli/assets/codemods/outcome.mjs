// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod outcomes that are not failures.
 *
 * A core transform throws one of these, instead of a plain Error, when a file
 * needs a change the codemod cannot make itself:
 *
 * - `ManualMigrationRequired`: a person must migrate the code (the codemod can
 *   identify it but has no safe rewrite). Reported in the upgrade receipt's
 *   `declinedCandidates`; it does not fail the run.
 * - `RegenerationRequired`: a generated file is out of date and its generator
 *   must rebuild it. Reported in `regenerate` with the command that does; the
 *   run is incomplete until it is rebuilt.
 *
 * Anything else a transform throws is still a codemod failure. The upgrade
 * leaf (`api/upgrade/_adapter.mjs` `withCodemodOutcomes`) catches these around
 * each core transform, so the codemod runners never see them.
 *
 * @input A message, and the source line or regeneration commands
 * @output Error subclasses tagged with a stable outcome kind
 * @position Shared by core codemod transforms and the upgrade leaf
 */

const OUTCOME = Symbol.for('astryx.codemod.outcome');

/** A person must migrate this code; the codemod has no safe rewrite. */
export class ManualMigrationRequired extends Error {
  /**
   * @param {string} message What to change, and how.
   * @param {{line?: number | null}} [options] 1-based source line, when known.
   */
  constructor(message, {line} = {}) {
    super(message);
    this.name = 'ManualMigrationRequired';
    /** @type {number | undefined} */
    this.line = typeof line === 'number' ? line : undefined;
    Object.defineProperty(this, OUTCOME, {value: 'manual'});
  }
}

/** A generated file is out of date; its generator must rebuild it. */
export class RegenerationRequired extends Error {
  /**
   * @param {string} message Why the file is out of date.
   * @param {{commands: string[]}} options Commands that rebuild it.
   */
  constructor(message, {commands}) {
    super(message);
    this.name = 'RegenerationRequired';
    /** @type {string[]} */
    this.commands = [...commands];
    Object.defineProperty(this, OUTCOME, {value: 'regenerate'});
  }
}

/**
 * The outcome a thrown value reports, or null for an ordinary failure.
 * @param {unknown} err
 * @returns {{kind: 'manual', message: string, line?: number} | {kind: 'regenerate', message: string, commands: string[]} | null}
 */
export function codemodOutcome(err) {
  if (!err || typeof err !== 'object') return null;
  const kind = /** @type {any} */ (err)[OUTCOME];
  const message = /** @type {Error} */ (err).message;
  if (kind === 'manual') {
    const line = /** @type {ManualMigrationRequired} */ (err).line;
    return {kind, message, ...(typeof line === 'number' ? {line} : {})};
  }
  if (kind === 'regenerate') {
    const commands = /** @type {RegenerationRequired} */ (err).commands;
    return {
      kind,
      message,
      commands: Array.isArray(commands) ? [...commands] : [],
    };
  }
  return null;
}
