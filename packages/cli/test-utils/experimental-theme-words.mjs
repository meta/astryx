// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Run a stable `astryx theme` suite against the experimental copies of
 *   the theme commands. `astryx experimental theme` carries a copy of every
 *   `astryx theme` command with the same function, flags and output; only
 *   the words differ (`theme build` is `experimental theme compile`).
 * @input A suite's CLI arguments and the result it got.
 * @output The same arguments with the experimental words, and a result whose
 *   text names the stable words again, so the suite's own assertions hold.
 * @position Test support for the experimental-theme-*.test.mjs suites, which
 *   mock runCli with these two functions and import the stable suites.
 */

/** The global options that take a value as the next word. */
const VALUE_OPTIONS = new Set(['--lang', '--detail']);

/**
 * Where the command word is: the first word that is not a global option or
 * the value of one (`full` in `--detail full`), or -1.
 * @param {string[]} args
 */
function commandIndex(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (VALUE_OPTIONS.has(args[i])) i += 1;
    else if (!args[i].startsWith('-')) return i;
  }
  return -1;
}

/**
 * The experimental words for one CLI call: `theme build ...` becomes
 * `experimental theme compile ...`, any other `theme <x> ...` becomes
 * `experimental theme <x> ...`. Global flags before the command stay.
 * `theme palette ...` stays as it is: the experimental group makes colors
 * through `editor set` and has no copy of the palette commands.
 * @param {string[]} args
 * @returns {string[]}
 */
export function toExperimental(args) {
  const i = commandIndex(args);
  if (i < 0 || args[i] !== 'theme' || args[i + 1] === 'palette') return args;
  const sub = args[i + 1] === 'build' ? 'compile' : args[i + 1];
  return [
    ...args.slice(0, i),
    'experimental',
    'theme',
    ...(sub == null ? [] : [sub]),
    ...args.slice(i + 2),
  ];
}

/**
 * Text from an experimental run, with the stable words.
 * @param {string} text
 * @returns {string}
 */
export function toStableText(text) {
  return String(text ?? '')
    .replaceAll('experimental theme compile', 'theme build')
    .replaceAll('experimental-theme-compile', 'theme-build')
    .replaceAll('experimental theme', 'theme')
    .replaceAll('experimental-theme-', 'theme-');
}

/**
 * A runCli result with the stable words in its output.
 * @template {{stdout?: string, stderr?: string}} R
 * @param {R} result
 * @returns {R}
 */
export function toStableResult(result) {
  return {
    ...result,
    ...(result.stdout != null ? {stdout: toStableText(result.stdout)} : {}),
    ...(result.stderr != null ? {stderr: toStableText(result.stderr)} : {}),
  };
}
