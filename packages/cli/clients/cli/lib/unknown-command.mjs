// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer to a word the CLI has no command for. It names the
 * command the run meant when the words point at one: a whole command passed
 * as one word, another command line's word order (a verb before its group),
 * a word from the table in other-cli-words.mjs, a command's plural, an option
 * some commands take, a command deeper in the tree, or a name another command
 * reads. Otherwise it names the commands with a near name, else every
 * command. It only suggests: it runs nothing, and it names no experimental
 * command except the ones spec:AST-017 FR27's shareable-page exception lets a
 * share word or a way-back word name.
 *
 * @input the program and the words of the run after the program name
 * @output the message and the suggestions the unknown-command error prints
 * @position packages/cli/clients/cli/lib — read by the program's own action
 *   in index.mjs and by stray-option.mjs
 */

import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';
import {quoteCommandArgument} from '../../../foundation/env/package-manager.mjs';
import {optionsInReach, runParses} from './stray-option.mjs';
import {
  ADD_WORDS as ADD_TABLE,
  JOB_WORDS,
  LIST_WORDS as LIST_TABLE,
  PATH_OPTIONS as PATH_TABLE,
  PROPS_WORDS as PROPS_TABLE,
  READ_WORDS as READ_TABLE,
  SOURCE_WORDS as SOURCE_TABLE,
} from './other-cli-words.mjs';
import {
  helpBase,
  optionAvailable,
  servedSubcommands,
} from './base-gate.mjs';

/**
 * The part of a Commander option this module reads.
 * @typedef {{long?: string, short?: string, required?: boolean, optional?: boolean, hidden?: boolean}} OptionLike
 */

/**
 * The part of a Commander command this module reads.
 * @typedef {{name(): string, commands?: readonly CommandLike[], options?: readonly OptionLike[], registeredArguments?: ReadonlyArray<{variadic?: boolean, name?: () => string}>, _hidden?: boolean}} CommandLike
 */

/**
 * A name another command reads: the command and the entry's name.
 * @typedef {(name: string) => Promise<{command: string, name: string} | null>} FindEntry
 */

/**
 * The commands below `cmd` that people and agents see, `help` aside: the
 * run's base serves each one.
 * @param {CommandLike} cmd
 * @returns {CommandLike[]}
 */
function visible(cmd) {
  return servedSubcommands(cmd);
}

/**
 * Whether the run's base serves the command at `words` below `program`:
 * each word names a command people and agents see.
 * @param {CommandLike} program
 * @param {string[]} words
 * @returns {boolean}
 */
function served(program, words) {
  /** @type {CommandLike | undefined} */
  let node = program;
  for (const word of words) {
    node = node && visible(node).find(c => c.name() === word);
    if (!node) return false;
  }
  return true;
}

/**
 * Whether `cmd` offers the long option `long` to people and agents: listed,
 * and served by the run's base.
 * @param {CommandLike} cmd
 * @param {string} long
 * @returns {boolean}
 */
function offers(cmd, long) {
  const base = helpBase();
  return (cmd.options ?? []).some(
    o =>
      o.long === long &&
      !o.hidden &&
      optionAvailable(/** @type {any} */ (cmd), /** @type {any} */ (o), base),
  );
}

/**
 * The experimental commands a stable answer may name (spec:AST-017 FR27, the
 * shareable-page exception: the command that writes a page as one HTML file,
 * and the one that turns that file back into its page), with the words people
 * and agents type when they mean each one. The reason says the command is experimental.
 */
const NAMED_EXPERIMENTAL = [
  {
    words: ['experimental', 'export'],
    asks: [
      'export',
      'render',
      'share',
      'bundle',
      'snapshot',
      'standalone',
    ],
    reason:
      'the command is experimental export (experimental): one self-contained HTML file from a page built with Astryx components',
  },
  {
    words: ['experimental', 'import'],
    asks: ['import', 'back', 'restore', 'unrender', 'reverse'],
    reason:
      'the command is experimental import (experimental): a file experimental export wrote, back into its page',
  },
];

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
      // A stable answer names no experimental command by its place in the
      // tree: the experimental group is the one entry point stable output
      // shows. FR27's shareable-page exception is the word table below.
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
 * The words of one table in other-cli-words.mjs, as a set.
 * @param {readonly {word: string}[]} table
 * @returns {Set<string>}
 */
function wordsOf(table) {
  return new Set(table.map(entry => entry.word));
}

const LIST_WORDS = wordsOf(LIST_TABLE);
const READ_WORDS = wordsOf(READ_TABLE);
const ADD_WORDS = wordsOf(ADD_TABLE);
const SOURCE_WORDS = wordsOf(SOURCE_TABLE);
const PROPS_WORDS = wordsOf(PROPS_TABLE);
const PATH_OPTIONS = wordsOf(PATH_TABLE);

/** Words that ask to run the command after them (`add template settings`). */
const RUN_WORDS = new Set([...READ_WORDS, ...ADD_WORDS]);

/**
 * Whether a word names an input to fill (`<old-version>`), not a value.
 * @param {string} word
 * @returns {boolean}
 */
function isPlaceholder(word) {
  return /^<[^<>\s]+>$/.test(word);
}

/** Template kinds a list asks for by a plural (`list pages`). */
const TEMPLATE_KINDS = /** @type {Record<string, string>} */ ({
  pages: 'page',
  blocks: 'block',
});

/**
 * The words a command takes from another command line's run: the options in
 * its reach (its own and the program's) with their values, as many other
 * words as it takes arguments, and the value of an option in
 * {@link PATH_OPTIONS} as the `path` argument when the command takes one.
 * Other options and their values are left out.
 * @param {CommandLike} cmd
 * @param {string[]} words
 * @returns {string[]}
 */
function fitWords(cmd, words) {
  /** @type {string[]} */
  const options = [];
  /** @type {string[]} */
  const args = [];
  /** @type {string[]} */
  const paths = [];
  const declared = cmd.registeredArguments ?? [];
  const takesPath = declared.some(a => a.name?.() === 'path');
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word.startsWith('-')) {
      args.push(word);
      continue;
    }
    const [flag, inline] = word.split(/=(.*)/s);
    const next = words[i + 1];
    const nextIsValue =
      inline === undefined && next !== undefined && !next.startsWith('-');
    const option = optionsInReach(
      /** @type {any} */ (cmd),
      (/** @type {OptionLike} */ o) => !o.hidden,
    ).find(o => o.long === flag || o.short === flag);
    if (option) {
      options.push(word);
      if ((option.required || option.optional) && nextIsValue) {
        options.push(next);
        i += 1;
      }
      continue;
    }
    if (PATH_OPTIONS.has(flag) && takesPath) {
      const value = inline ?? (nextIsValue ? next : undefined);
      if (value !== undefined) paths.push(value);
    }
    if (nextIsValue) i += 1;
  }
  const given = [...args, ...paths];
  const kept = declared.some(a => a.variadic)
    ? given
    : given.slice(0, declared.length);
  return [...kept, ...options];
}

/**
 * A job's run with its inputs filled from the words typed: an option's
 * placeholder takes the value typed for that option, and an argument's
 * placeholder takes the next word typed that is no option. A placeholder
 * nothing fills stays, so the run names the input it needs. The words left
 * over follow the run.
 * @param {readonly string[]} template the run, with placeholders
 * @param {string[]} words the words typed, fitted to the command
 * @returns {string[]}
 */
function filled(template, words) {
  const left = [...words];
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < template.length; i += 1) {
    const part = template[i];
    const value = template[i + 1];
    if (part.startsWith('-') && value !== undefined && isPlaceholder(value)) {
      const at = left.findIndex(w => w === part || w.startsWith(`${part}=`));
      if (at === -1) out.push(part, value);
      else if (left[at].includes('=')) out.push(...left.splice(at, 1));
      else out.push(...left.splice(at, 2));
      i += 1;
      continue;
    }
    if (isPlaceholder(part)) {
      const at = left.findIndex(w => !w.startsWith('-'));
      out.push(at === -1 ? part : left.splice(at, 1)[0]);
      continue;
    }
    out.push(part);
  }
  return [...out, ...left];
}

/**
 * The commands words from another command line point at, as runs, best
 * first; empty when they point at none. Rules, in order: a verb before its
 * group (`add theme matcha` is `theme add matcha`, `list themes` is `theme
 * list`); a list of template kinds (`list pages` is `template --list --type
 * page`); a word that asks to run the command after it (`add template
 * settings --out <path>` is `template settings <path>`); a verb that copies a
 * component's source (`eject button` is `swizzle Button`); `add` and the name
 * of a component, template, hook or docs topic (`add button` is `swizzle
 * Button`, then `component Button`); a word that asks for a component's props
 * (`props Card` is `component Card --props`); a word other command lines use
 * for a job one command here does ({@link JOB_WORDS}: `migrate` is `upgrade
 * --from <old-version>`).
 * @param {{word: string, before: string[], after: string[]}} run
 * @param {CommandLike} program
 * @param {FindEntry} findEntry
 * @returns {Promise<Array<{words: string[], reason: string}>>}
 */
async function otherCliWords({word, before, after: rest}, program, findEntry) {
  // No rule here reads the experimental group: a stable answer names an
  // experimental command only through FR27's shareable-page word table.
  const top = visible(program).filter(c => c.name() !== 'experimental');
  /** @param {string} name */
  const command = name => top.find(c => c.name() === name);
  /** @param {string[]} parts @param {string} reason */
  const run = (parts, reason) => ({words: [...before, ...parts], reason});
  const verb = word.toLowerCase();
  const [object, ...after] = rest;
  const objectWord =
    object !== undefined && !object.startsWith('-') ? object : undefined;

  if (objectWord) {
    const group = top.find(c => spellings(objectWord).includes(c.name()));
    const sub =
      group && visible(group).find(c => spellings(verb).includes(c.name()));
    if (group && sub)
      return [
        run(
          [group.name(), sub.name(), ...fitWords(sub, after)],
          `the command is ${group.name()} ${sub.name()}`,
        ),
      ];
    const kind = TEMPLATE_KINDS[objectWord.toLowerCase()];
    const template = command('template');
    if (LIST_WORDS.has(verb) && kind && template && offers(template, '--list'))
      return [
        run(
          ['template', '--list', '--type', kind, ...fitWords(template, after)],
          `template --list lists the ${objectWord.toLowerCase()}`,
        ),
      ];
    const commandNamed = top.find(
      c =>
        spellings(objectWord).includes(c.name()) &&
        takesWords(c, fitWords(c, after)),
    );
    if (RUN_WORDS.has(verb) && commandNamed)
      return [
        run(
          [commandNamed.name(), ...fitWords(commandNamed, after)],
          `the command is ${commandNamed.name()}`,
        ),
      ];
  }

  const entryOf = async (/** @type {string} */ name) =>
    findEntry(name).catch(() => null);
  if (
    objectWord &&
    (SOURCE_WORDS.has(verb) || ADD_WORDS.has(verb) || PROPS_WORDS.has(verb))
  ) {
    const entry = await entryOf(objectWord);
    const swizzle = command('swizzle');
    const component = command('component');
    if (entry?.command === 'component' && component) {
      if (PROPS_WORDS.has(verb))
        return [
          run(
            ['component', entry.name, '--props', ...fitWords(component, after)],
            `the props of ${entry.name}`,
          ),
        ];
      /** @type {Array<{words: string[], reason: string}>} */
      const runs = [];
      if (swizzle)
        runs.push(
          run(
            ['swizzle', entry.name, ...fitWords(swizzle, after)],
            "swizzle copies a component's source into the project",
          ),
        );
      if (ADD_WORDS.has(verb))
        runs.push(
          run(
            ['component', entry.name, ...fitWords(component, after)],
            `${entry.name} ships in the package: import it`,
          ),
        );
      if (runs.length > 0) return runs;
    }
    const reader = entry && command(entry.command);
    if (ADD_WORDS.has(verb) && entry && reader)
      return [
        run(
          [entry.command, entry.name, ...fitWords(reader, after)],
          `${entry.name} is read by ${entry.command}`,
        ),
      ];
  }

  const job = JOB_WORDS.find(entry => entry.word === verb);
  const target = job && command(job.run[0]);
  if (!job || !target) return [];
  // A list word, or a word that names a command, names what the job is
  // about, not an input (`browse integrations` is `discover`).
  const inputs = rest.filter(
    w =>
      !LIST_WORDS.has(w.toLowerCase()) &&
      !top.some(c => spellings(w).includes(c.name())),
  );
  const fitted = fitWords(target, inputs);
  const unneeded = fitted.some(w =>
    (job.notNeededWith ?? []).includes(w.split('=')[0]),
  );
  const template = unneeded
    ? job.run.filter(
        (part, i) =>
          !isPlaceholder(part) && !isPlaceholder(job.run[i + 1] ?? ''),
      )
    : job.run;
  return [run(filled(template, fitted), job.reason)];
}

/**
 * The commands the words point at, as runs (`astryx …`), best first, with
 * the reason each is offered; empty when they point at none. Rules, in
 * order: the word is an option of the program written after `--`
 * (`astryx -- --help`); the word holds a whole command (`"component Table"`
 * passed as one word); the words come from another command line (see
 * {@link otherCliWords}: `add theme matcha` is `theme add matcha`); the
 * word, or its singular, is a command (`components Button`), a group named
 * alone is its list (`themes` is `theme list`), and a list word or a read
 * word after it asks for its list or the name after it (`templates list` is
 * `template --list`, `templates view settings` is `template settings`); the
 * word is an option commands take (`list components` is `component --list`);
 * the word, or its singular, is a command deeper in
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
  // A borrowed run that does not parse leaves the word to the rules below
  // (`info theme` names a group alone, so it is `component Theme`).
  const borrowed = (
    await otherCliWords({word, before, after: rest}, program, findEntry)
  ).filter(r => runParses(program, r.words));
  if (borrowed.length > 0) return borrowed;
  const named = top.find(c => spellings(word).includes(c.name()));
  const [next, ...more] = rest;
  const nextIsSub =
    named !== undefined &&
    next !== undefined &&
    visible(named).some(c => c.name() === next);
  // A list word after the command asks for its list (`templates list`); a
  // group without a list answers with its commands.
  if (
    named &&
    next !== undefined &&
    !nextIsSub &&
    LIST_WORDS.has(next.toLowerCase())
  ) {
    if (offers(named, '--list'))
      return [
        run(
          [named.name(), '--list', ...more],
          `${named.name()} --list lists them`,
        ),
      ];
    if (visible(named).length > 0)
      return [
        run([named.name(), '--help'], `the commands of ${named.name()}`),
      ];
  }
  if (named && takesWords(named, rest)) {
    // A read word after the command only asks to read the name after it
    // (`templates view settings`).
    if (
      next !== undefined &&
      !nextIsSub &&
      READ_WORDS.has(next.toLowerCase()) &&
      more.some(w => !w.startsWith('-'))
    )
      return [run([named.name(), ...more], `the command is ${named.name()}`)];
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
  const taking = top.filter(c => offers(c, option));
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
    plural && offers(c.cmd, '--list')
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

  // An experimental command a stable answer may name, asked for by a word
  // that means it (`share page.tsx` is `experimental export page.tsx`).
  // A share word before a name another command reads (`export Button`)
  // leaves that name to the lookup below, and a base that does not serve the
  // command gets no suggestion of it.
  const asked = NAMED_EXPERIMENTAL.find(e =>
    spellings(word).some(w => e.asks.includes(w)),
  );
  const readName =
    asked && rest[0] && !rest[0].startsWith('-')
      ? await findEntry(rest[0]).catch(() => null)
      : null;
  if (
    asked &&
    !(readName && topNames.includes(readName.command)) &&
    served(program, asked.words) &&
    runParses(program, [...before, ...asked.words])
  ) {
    // `render experimental page.tsx` already named the group: drop that
    // one word, never a later `experimental` (a `--title` value, say).
    const carried = rest[0] === asked.words[0] ? rest.slice(1) : rest;
    return [
      run(
        runParses(program, [...before, ...asked.words, ...carried])
          ? [...asked.words, ...carried]
          : [...asked.words, '--help'],
        asked.reason,
      ),
    ];
  }

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
      name: [
        'astryx',
        ...r.words.map(w => (isPlaceholder(w) ? w : quoteCommandArgument(w))),
      ].join(' '),
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
