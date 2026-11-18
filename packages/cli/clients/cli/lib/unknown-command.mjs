// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer to a word the CLI has no command for. It names the
 * command the run meant when the words point at one: a whole command passed
 * as one word, a command's plural, an option some commands take, a command
 * deeper in the tree, or a name another command reads. Otherwise it names
 * the commands with a near name, else every command.
 *
 * @input the program and the words of the run after the program name
 * @output the message and the suggestions the unknown-command error prints
 * @position packages/cli/clients/cli/lib — read by the program's own action
 *   in index.mjs and by stray-option.mjs
 */

import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';
import {quoteCommandArgument} from '../../../foundation/env/package-manager.mjs';
import {runParses} from './stray-option.mjs';

/**
 * The part of a Commander option this module reads.
 * @typedef {{long?: string, short?: string, required?: boolean, hidden?: boolean}} OptionLike
 */

/**
 * The part of a Commander command this module reads.
 * @typedef {{name(): string, commands?: readonly CommandLike[], options?: readonly OptionLike[], registeredArguments?: ReadonlyArray<{variadic?: boolean}>, _hidden?: boolean}} CommandLike
 */

/**
 * A name another command reads: the command and the entry's name.
 * @typedef {(name: string) => Promise<{command: string, name: string} | null>} FindEntry
 */

/**
 * The commands below `cmd` that people and agents see, `help` aside.
 * @param {CommandLike} cmd
 * @returns {CommandLike[]}
 */
function visible(cmd) {
  return (cmd.commands ?? []).filter(c => !c._hidden && c.name() !== 'help');
}

/**
 * Every visible command in the tree, by its words: `[['theme', 'build'], …]`.
 * @param {CommandLike} program
 * @returns {Array<{words: string[], cmd: CommandLike}>}
 */
function everyCommand(program) {
  /** @type {Array<{words: string[], cmd: CommandLike}>} */
  const all = [];
  /** @param {CommandLike} node @param {string[]} words */
  const walk = (node, words) => {
    for (const child of visible(node)) {
      // A stable answer names no experimental command: without the opt-in,
      // the experimental group is the one entry point stable output shows.
      if (words.length === 0 && child.name() === 'experimental') continue;
      const path = [...words, child.name()];
      all.push({words: path, cmd: child});
      walk(child, path);
    }
  };
  walk(program, []);
  return all;
}

/**
 * The first word that is not an option or the value of one of the program's
 * options, with the words before and after it.
 * @param {string[]} words
 * @param {CommandLike} program
 * @returns {{word: string, before: string[], after: string[]} | null}
 */
export function firstWord(words, program) {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    // After `--`, the next word is the word, even one that starts with `-`.
    if (word === '--')
      return i + 1 < words.length
        ? {
            word: words[i + 1],
            before: words.slice(0, i),
            after: words.slice(i + 2),
          }
        : null;
    if (word.startsWith('-')) {
      const option = (program.options ?? []).find(
        o => o.long === word.split('=')[0] || o.short === word,
      );
      if (option?.required && !word.includes('=')) i += 1;
      continue;
    }
    return {word, before: words.slice(0, i), after: words.slice(i + 1)};
  }
  return null;
}

/**
 * The options the program lists in its help, its help option included.
 * @param {CommandLike} program
 * @returns {readonly OptionLike[]}
 */
function programOptions(program) {
  const help = /** @type {any} */ (program).createHelp?.();
  return help ? help.visibleOptions(program) : (program.options ?? []);
}

/**
 * The word and its singular, lower case: `components` is also `component`.
 * @param {string} word
 * @returns {string[]}
 */
function spellings(word) {
  const lower = word.toLowerCase();
  return lower.length > 3 && lower.endsWith('s')
    ? [lower, lower.slice(0, -1)]
    : [lower];
}

/**
 * Whether a command takes these words as its arguments: as many as it
 * declares, or any number for a variadic one. A group takes a word only when
 * the word is one of its subcommands.
 * @param {CommandLike} cmd
 * @param {string[]} words the words of the run after the command's own
 */
function takesWords(cmd, words) {
  const given = words.filter(w => !w.startsWith('-'));
  const declared = cmd.registeredArguments ?? [];
  if (declared.some(a => a.variadic)) return true;
  if (given.length <= declared.length) return true;
  return visible(cmd).some(c => c.name() === given[0]);
}

/**
 * The near command names Commander's own rule accepts: at most three edits,
 * and more than 40% of the longer name left the same. Best first, three at
 * most.
 * @param {string} word
 * @param {string[]} names
 * @returns {string[]}
 */
function nearNames(word, names) {
  const typed = word.toLowerCase();
  return names
    .map(name => {
      const distance = levenshteinDistance(typed, name.toLowerCase());
      const length = Math.max(typed.length, name.length);
      return {name, distance, similarity: (length - distance) / length};
    })
    .filter(s => s.distance <= 3 && s.similarity > 0.4)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(s => s.name);
}

/**
 * The commands the words point at, as runs (`astryx …`), best first, with
 * the reason each is offered; empty when they point at none. Rules, in
 * order: the word is an option of the program written after `--`
 * (`astryx -- --help`); the word holds a whole command (`"component Table"`
 * passed as one word); the word, or its singular, is a command
 * (`components Button`), and a group named alone is its list (`themes` is
 * `theme list`); the word is an option commands take (`list components` is
 * `component --list`); the word, or its singular, is a command deeper in
 * the tree (`verify` is `integration verify`, `themes` is `theme list`), or its hyphenated parts name that command (`validate-integration`
 * is `doctor integration validate`); the next word, else the word itself,
 * is a name another command reads (`info Text` is `component Text`).
 * @param {{word: string, before: string[], after: string[]}} run the word,
 *   and the words of the run before and after it
 * @param {CommandLike} program
 * @param {FindEntry} findEntry
 * @returns {Promise<Array<{words: string[], reason: string}>>}
 */
async function pointed({word, before, after: rest}, program, findEntry) {
  const top = visible(program);
  const topNames = top.map(c => c.name());
  /** @param {string[]} parts @param {string} reason */
  const run = (parts, reason) => ({words: [...before, ...parts], reason});
  // An option written after `--`, where it reads as a word
  // (`astryx -- --help`).
  if (
    word.startsWith('-') &&
    programOptions(program).some(o => o.long === word || o.short === word)
  )
    return [run([word, ...rest], `${word} is an option of the program`)];
  const parts = word.trim().split(/\s+/);
  if (parts.length > 1 && topNames.includes(parts[0]))
    return [
      run([...parts, ...rest], 'the words of one command, passed as one word'),
    ];
  const named = top.find(c => spellings(word).includes(c.name()));
  if (named && takesWords(named, rest)) {
    const listing = visible(named).find(c => c.name() === 'list');
    // A group named alone runs no command: a plural asks for its list.
    if (visible(named).length > 0 && rest.length === 0)
      return [
        listing
          ? run([named.name(), 'list'], `the command is ${named.name()} list`)
          : run([named.name(), '--help'], `the commands of ${named.name()}`),
      ];
    return [run([named.name(), ...rest], `the command is ${named.name()}`)];
  }

  const option = `--${word.toLowerCase()}`;
  const taking = top.filter(c =>
    (c.options ?? []).some(o => o.long === option && !o.hidden),
  );
  if (taking.length > 0) {
    const [object, ...after] = rest;
    const meant =
      object && !object.startsWith('-')
        ? taking.find(c => spellings(object).includes(c.name()))
        : undefined;
    if (meant)
      return [
        run(
          [meant.name(), option, ...after],
          `${option} is an option of ${meant.name()}`,
        ),
      ];
    if (rest.length === 0)
      return taking
        .slice(0, 3)
        .map(c =>
          run([c.name(), option], `${option} is an option of ${c.name()}`),
        );
  }

  const all = everyCommand(program).filter(c => takesWords(c.cmd, rest));
  const pieces = word.toLowerCase().split(/[-_]/).filter(Boolean);
  // A deeper command the word names; for a hyphenated word, a command whose
  // words hold every part (`verify-integration` is `integration verify`),
  // else a command one part names (`run-verify` is `integration verify`).
  const nested = [
    ...all.filter(
      c => c.words.length > 1 && spellings(word).includes(c.cmd.name()),
    ),
    ...(pieces.length > 1
      ? all.filter(c => pieces.every(p => c.words.includes(p)))
      : []),
    ...(pieces.length > 1
      ? all.filter(c => pieces.some(p => spellings(p).includes(c.cmd.name())))
      : []),
  ].filter((c, i, list) => list.findIndex(o => o.cmd === c.cmd) === i);
  // A plural named alone asks for a list: the command's own `--list`, when
  // it has one.
  const plural = rest.length === 0 && spellings(word).length > 1;
  /** @param {{words: string[], cmd: CommandLike}} c */
  const listing = c =>
    plural && (c.cmd.options ?? []).some(o => o.long === '--list')
      ? ['--list']
      : [];
  // A command that needs words the run did not give is named by its help
  // (`eject` is `theme eject --help`).
  /** @param {{words: string[], cmd: CommandLike}} c */
  const asRun = c => {
    const words = [...c.words, ...listing(c), ...rest];
    return run(
      runParses(program, [...before, ...words])
        ? words
        : [...c.words, '--help'],
      `the command is ${c.words.join(' ')}`,
    );
  };
  if (nested.length > 0) return nested.slice(0, 3).map(asRun);

  // A name another command reads: the next word (`info Text`), else the
  // word itself (`astryx tokens`).
  const [object, ...after] = rest;
  if (object && !object.startsWith('-')) {
    const entry = await findEntry(object).catch(() => null);
    if (entry && topNames.includes(entry.command))
      return [
        run(
          [entry.command, entry.name, ...after],
          `${entry.name} is read by ${entry.command}`,
        ),
      ];
  } else {
    const entry = await findEntry(word).catch(() => null);
    if (entry && topNames.includes(entry.command))
      return [
        run(
          [entry.command, entry.name, ...rest],
          `${entry.name} is read by ${entry.command}`,
        ),
      ];
  }
  return [];
}

/**
 * The answer to a word the CLI has no command for: `unknown command
 * '<word>'`, with the runs the words point at ({@link pointed}), else the
 * commands with a near name, else every command. Suggestion names are bare
 * `astryx …` runs or command names, as cliError prints them.
 * @param {CommandLike} program
 * @param {string[]} words the words of the run after the program name
 * @param {{findEntry?: FindEntry}} [context] `findEntry` finds which lookup
 *   command reads a name; without it, no name points at a command
 * @returns {Promise<{word: string, message: string, suggestions: Array<{name: string, reason: string}>} | null>}
 *   null when no word names a command
 */
export async function unknownCommandAnswer(
  program,
  words,
  {findEntry = async () => null} = {},
) {
  const first = firstWord(words, program);
  if (!first) return null;
  const {word} = first;
  const message = `unknown command '${word}'`;
  // Only runs that parse: a line that fails again names nothing that works.
  const runs = (await pointed(first, program, findEntry))
    .filter(r => runParses(program, r.words))
    .map(r => ({
      name: ['astryx', ...r.words.map(w => quoteCommandArgument(w))].join(' '),
      reason: r.reason,
    }));
  if (runs.length > 0) return {word, message, suggestions: runs};
  const names = visible(program).map(c => c.name());
  const near = nearNames(word, names);
  return {
    word,
    message,
    suggestions:
      near.length > 0
        ? near.map(name => ({name, reason: 'did you mean this?'}))
        : names.map(name => ({name, reason: 'available command'})),
  };
}

/**
 * Which lookup command reads `name` in the project the run is in, from the
 * lookups' shared other-command hint (foundation/suggest/other-command.mjs),
 * loaded only when an unknown command needs it. Null when no command reads
 * it, or when the check fails.
 * @type {FindEntry}
 */
export async function findEntry(name) {
  const {findOtherCommand} =
    await import('../../../foundation/suggest/other-command.mjs');
  const found = await findOtherCommand(name, {cwd: process.cwd()});
  // The hint's own options (`--json`) are left out: the run keeps the
  // options the reader gave.
  const words = (found?.hint.name.split(' ') ?? []).filter(
    w => !w.startsWith('-'),
  );
  return words.length >= 3
    ? {command: words[1], name: words.slice(2).join(' ')}
    : null;
}
