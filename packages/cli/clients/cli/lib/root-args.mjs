// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read a run's arguments the way Commander reads the root's options,
 * before it parses: which word names the command, and what value each root
 * option was given.
 * @input the arguments after `astryx`, and the root's options
 * @output scanRootArgs()
 * @position clients/cli/lib — the one walk over the root's options
 */

/**
 * @typedef {object} RootOptionShape
 * @property {string} [long]
 * @property {string} [short]
 * @property {boolean} [required] takes a value
 * @property {boolean} [optional] takes a value when one follows
 */

/**
 * @typedef {object} RootArgs
 * @property {string | undefined} operand the first word that is not an
 *   option or an option's value
 * @property {Map<string, string | true>} values each given root option by its
 *   long flag, with its value, or true for a flag
 * @property {boolean} printsVersion `--version` was given
 * @property {boolean} stopped the walk met a word Commander does not dispatch
 *   by name: an unknown flag, `--`, or a value given to a flag that takes none
 */

/**
 * Walk the arguments as Commander reads the root's options.
 * @param {string[]} argv the arguments after `astryx`
 * @param {readonly RootOptionShape[]} options the root's options
 * @param {{unknown?: 'stop' | 'skip', pastOperand?: boolean}} [mode]
 *   `unknown: 'skip'` reads an unknown flag as one that takes no value and
 *   `--` as the end of options; `pastOperand` keeps reading root options
 *   after the operand
 * @returns {RootArgs}
 */
export function scanRootArgs(argv, options, {unknown = 'stop', pastOperand = false} = {}) {
  /** @type {RootArgs} */
  const result = {operand: undefined, values: new Map(), printsVersion: false, stopped: false};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Commander reads a lone `-` as an operand, as it reads any word.
    if (arg.length < 2 || arg[0] !== '-') {
      result.operand ??= arg;
      if (!pastOperand) break;
      continue;
    }
    if (arg === '--' && unknown === 'skip') {
      result.operand ??= argv[i + 1];
      break;
    }
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const option = options.find(o => o.long === flag || o.short === flag);
    const takesValue = Boolean(option?.required || option?.optional);
    if (option == null || (equals !== -1 && !takesValue)) {
      if (unknown === 'stop') {
        result.stopped = true;
        break;
      }
      continue;
    }
    /** @type {string | true} */
    let value = true;
    const next = argv[i + 1];
    if (equals !== -1) value = arg.slice(equals + 1);
    else if (option.required && next != null) value = argv[++i];
    else if (option.optional && next != null && !(next.length > 1 && next[0] === '-')) {
      value = argv[++i];
    }
    if (option.long) result.values.set(option.long, value);
    if (option.long === '--version') result.printsVersion = true;
  }
  return result;
}
