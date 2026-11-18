// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer to an option a command does not take: the options the
 * command takes, and the command as meant when the option points at one of
 * them. Every command gets it, except the theme editor commands, which have
 * their own reader.
 *
 * @input the Commander command that refused the option, Commander's message,
 *   and the words of the run after the program name
 * @output the message and the suggestions the parse error prints
 * @position packages/cli/clients/cli/lib — read by json-shim.mjs
 */

import {
  formatCliCommand,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';
import {
  helpBase,
  optionAvailable,
  servedSubcommands,
} from './base-gate.mjs';

/**
 * The part of a Commander option this module reads.
 * @typedef {{long?: string, short?: string, hidden?: boolean, required?: boolean, optional?: boolean, mandatory?: boolean, defaultValue?: unknown, argChoices?: string[]}} OptionLike
 */

/**
 * The part of a Commander command this module reads.
 * @typedef {{name(): string, parent?: CommandLike | null, options?: readonly OptionLike[], commands?: readonly CommandLike[], _hidden?: boolean}} CommandLike
 */

/**
 * The words that name a command below the program: `['theme', 'build']`.
 * @param {CommandLike} cmd
 * @returns {string[]}
 */
function pathOf(cmd) {
  /** @type {string[]} */
  const words = [];
  for (let node = cmd; node?.parent; node = node.parent) {
    words.unshift(node.name());
  }
  return words;
}

/**
 * The options a run of the command reads that `keep` accepts: its own and
 * those of the groups above it, because Commander also reads a group's
 * option after the subcommand (`astryx component Button --json`).
 * @param {CommandLike} cmd
 * @param {(option: OptionLike) => boolean} keep
 * @returns {OptionLike[]}
 */
export function optionsInReach(cmd, keep) {
  /** @type {OptionLike[]} */
  const options = [];
  for (
    let node = /** @type {CommandLike | null | undefined} */ (cmd);
    node;
    node = node.parent
  ) {
    // Commander keeps the help option apart from the others.
    const help = /** @type {any} */ (node)._getHelpOption?.();
    const base = helpBase();
    const served = /** @param {OptionLike} o */ o =>
      optionAvailable(/** @type {any} */ (node), /** @type {any} */ (o), base);
    options.push(
      ...[...(node.options ?? []), ...(help ? [help] : [])].filter(
        o => keep(o) && served(o),
      ),
    );
  }
  return options;
}

/**
 * Whether an option takes a value.
 * @param {OptionLike} option
 */
function takesValue(option) {
  return Boolean(option.required || option.optional);
}

/**
 * A list in prose: `a`, `a and b`, `a, b and c`.
 * @param {string[]} items
 */
function prose(items) {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : items.join('');
}

/**
 * What the stray option meant, or null. Rules, in order: its value names an
 * option that takes no value (`--format json` is `--json`); its name is a
 * value that exactly one option accepts (`--full` is `--detail full`);
 * Commander suggests exactly one near name (`--prop` is `--props`); its name
 * is an option's name with more words after it (`--props-only` is
 * `--props`); its name is one of the command's subcommands (`theme --list`
 * is `theme list`).
 * @param {{name: string, value: string | null, attached: boolean}} given the
 *   stray option's name (dashes and any `=value` removed), its value (the
 *   `=value` part, else the next word when that word is not an option), and
 *   whether that value was written with `=`
 * @param {OptionLike[]} options the options a run of the command offers
 * @param {CommandLike[]} subcommands
 * @param {string | null} similar the one near name Commander suggests
 * @returns {{words: string[], usesValue: boolean} | {subcommand: CommandLike} | null}
 */
function meant(given, options, subcommands, similar) {
  const {name, value, attached} = given;
  if (value != null) {
    const named = options.filter(
      o => !takesValue(o) && o.long === `--${value.toLowerCase()}`,
    );
    if (named.length === 1)
      return {words: [/** @type {string} */ (named[0].long)], usesValue: true};
  }
  const choosing = options.filter(o => (o.argChoices ?? []).includes(name));
  if (choosing.length === 1 && !attached)
    return {
      words: [/** @type {string} */ (choosing[0].long), name],
      usesValue: false,
    };
  /** @param {OptionLike} option */
  const instead = option => {
    const long = /** @type {string} */ (option.long);
    // An option with set values takes only one of them (`--domain
    // component` is not `--detail component`).
    if (
      option.argChoices?.length &&
      (value == null || !option.argChoices.includes(value))
    )
      return null;
    // An option that needs a value is named only with the value the call
    // gave after the stray word.
    if (!attached)
      return option.required && value == null
        ? null
        : {words: [long], usesValue: false};
    return takesValue(option)
      ? {words: [`${long}=${value}`], usesValue: true}
      : null;
  };
  const near = similar ? options.find(o => o.long === similar) : undefined;
  if (near) return instead(near);
  const longer = options.filter(o => `--${name}`.startsWith(`${o.long}-`));
  if (longer.length === 1) return instead(longer[0]);
  const subcommand = subcommands.find(c => c.name() === name);
  return subcommand && !attached ? {subcommand} : null;
}

/**
 * The first option word in `words` that no option in `options` is, or null.
 * The words after `--` are arguments, never options.
 * @param {string[]} words
 * @param {OptionLike[]} options
 * @returns {string | null}
 */
function firstStray(words, options) {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === '--') return null;
    if (!word.startsWith('-') || word === '-') continue;
    const flag = word.split('=')[0];
    const option = options.find(o => o.long === flag || o.short === flag);
    if (!option) return word;
    const next = words[i + 1];
    if (
      takesValue(option) &&
      !word.includes('=') &&
      (option.required || (next != null && !next.startsWith('-')))
    )
      i += 1;
  }
  return null;
}

/**
 * Whether the first word that is not an option names one of the program's
 * commands. The value of an option that takes one is not that word.
 * @param {string[]} words
 * @param {CommandLike} program
 */
function startsWithCommand(words, program) {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === '--') return false;
    if (word.startsWith('-')) {
      const option = (program.options ?? []).find(
        o => o.long === word.split('=')[0] || o.short === word,
      );
      if (option?.required && !word.includes('=')) i += 1;
      continue;
    }
    return (program.commands ?? []).some(c => c.name() === word);
  }
  return true;
}

/**
 * The words with a subcommand placed right after the command's own words, or
 * null when those words are not at the start of the run in order.
 * @param {string[]} words
 * @param {string[]} path
 * @param {string} subcommand
 * @returns {string[] | null}
 */
function withSubcommand(words, path, subcommand) {
  let from = 0;
  for (const part of path) {
    const at = words.indexOf(part, from);
    if (at < 0) return null;
    from = at + 1;
  }
  return [...words.slice(0, from), subcommand, ...words.slice(from)];
}

/**
 * The run as meant, as the words to run, or null: the stray option replaced
 * by the option it points at (or the subcommand it names), every other word
 * as given. Null when nothing points, or when another word is still not an
 * option that command takes, because that line would fail again.
 * @param {CommandLike} cmd
 * @param {string[]} path
 * @param {string} stray the option as Commander names it
 * @param {string} message Commander's message
 * @param {string[]} words
 * @param {OptionLike[]} offered
 * @returns {string[] | null}
 */
function runAsMeant(cmd, path, stray, message, words, offered) {
  const at = words.indexOf(stray);
  const end = words.indexOf('--');
  if (at < 0 || (end >= 0 && at > end)) return null;
  const attached = stray.startsWith('--') && stray.includes('=');
  const next = words[at + 1];
  const value = attached
    ? stray.slice(stray.indexOf('=') + 1)
    : next != null && !next.startsWith('-')
      ? next
      : null;
  const name = stray.replace(/^--?/, '').split('=')[0].toLowerCase();
  const similar = /\(Did you mean (--[\w-]+)\?\)/.exec(message)?.[1] ?? null;
  const subcommands = servedSubcommands(cmd);
  const found = meant({name, value, attached}, offered, subcommands, similar);
  if (!found) return null;
  /** @param {OptionLike} o */
  const any = o => Boolean(o.long || o.short);
  if ('subcommand' in found) {
    const words2 = withSubcommand(
      [...words.slice(0, at), ...words.slice(at + 1)],
      path,
      found.subcommand.name(),
    );
    return words2 &&
      firstStray(words2, optionsInReach(found.subcommand, any)) == null
      ? words2
      : null;
  }
  const span = found.usesValue && !attached ? 2 : 1;
  const rest = [...words.slice(0, at), ...words.slice(at + span)];
  // On the program itself, a word that names no command is an unknown
  // command, which that line would still report.
  if (path.length === 0 && !startsWithCommand(rest, cmd)) return null;
  // An option the run already gives is not given twice
  // (`--json component Dialog --format json`).
  const given = rest.some(
    w =>
      w === found.words[0] || w.startsWith(`${found.words[0].split('=')[0]}=`),
  );
  const added = given ? [] : found.words;
  const words2 = [...words.slice(0, at), ...added, ...words.slice(at + span)];
  return firstStray(words2, optionsInReach(cmd, any)) == null ? words2 : null;
}

/**
 * Options a command no longer takes, which older docs and agents still pass:
 * each answers what to do instead, not only that it is unknown.
 * @type {Record<string, Record<string, string>>}
 */
const REMOVED_OPTIONS = {
  'experimental export': {
    '--static': "--static is no longer an option: every render carries the page's script now. Drop the flag and run the command again.",
    '--interactive':
      "--interactive is no longer an option: every render carries the page's script now. Drop the flag and run the command again.",
  },
};

/**
 * The answer to an option a command does not take.
 *
 * The message names the options the command takes, and a group's
 * subcommands. The first suggestion is the run as meant, when the option
 * points at one the command takes ({@link runAsMeant}); the last is the
 * command's help.
 *
 * @param {CommandLike} cmd the command Commander refused the option for
 * @param {string} message Commander's message, without its `error: ` prefix
 * @param {string[]} words the words of the run after the program name
 * @param {{jsonSupported?: (path: string) => boolean}} [context] whether a
 *   command, by its words (`theme build`), answers `--json`
 * @returns {{message: string, suggestions: Array<{name: string, reason: string}>} | undefined}
 *   undefined when the message names no option
 */
export function strayOptionAnswer(
  cmd,
  message,
  words,
  {jsonSupported = () => true} = {},
) {
  const stray = /unknown option '([^']+)'/.exec(message)?.[1];
  if (!stray) return undefined;
  const path = pathOf(cmd);
  const removed = REMOVED_OPTIONS[path.join(' ')]?.[stray.split('=')[0]];
  if (removed) {
    const run = words.filter(word => word.split('=')[0] !== stray.split('=')[0]);
    return {
      message: removed,
      suggestions: [
        {
          name: formatCliCommand(run.map(w => quoteCommandArgument(w)).join(' ')),
          reason: 'the same command without the flag',
        },
      ],
    };
  }
  const json = path.length === 0 || jsonSupported(path.join(' '));
  const offered = optionsInReach(
    cmd,
    o =>
      !o.hidden &&
      Boolean(o.long) &&
      o.long !== '--help' &&
      (o.long !== '--json' || json),
  );
  const base = helpBase();
  const own = (cmd.options ?? [])
    .filter(
      o =>
        !o.hidden &&
        o.long &&
        o.long !== '--help' &&
        optionAvailable(/** @type {any} */ (cmd), /** @type {any} */ (o), base),
    )
    .map(o => /** @type {string} */ (o.long));
  if (json && !own.includes('--json') && offered.some(o => o.long === '--json'))
    own.push('--json');
  const subcommands = path.length
    ? servedSubcommands(cmd).map(c => c.name())
    : [];
  const label = path.length ? path.join(' ') : 'astryx';
  const takes = [
    own.length ? prose(own) : '',
    subcommands.length ? `a subcommand: ${subcommands.join(', ')}` : '',
  ].filter(Boolean);
  const sentence = takes.length
    ? `${label} takes ${takes.join(', or ')}`
    : `${label} takes no options`;

  /** @type {Array<{name: string, reason: string}>} */
  const suggestions = [];
  const meantRun = runAsMeant(cmd, path, stray, message, words, offered);
  // Only a run that parses: a line that fails again names nothing that works.
  const run = meantRun && runParses(rootOf(cmd), meantRun) ? meantRun : null;
  if (run)
    suggestions.push({
      name: formatCliCommand(run.map(w => quoteCommandArgument(w)).join(' ')),
      reason: 'do this instead',
    });
  suggestions.push({
    name: formatCliCommand([...path, '--help'].join(' ')),
    reason: 'every option it takes',
  });
  // Commander's near name, when no run can carry it (it needs a value the
  // call did not give).
  const similar = /\(Did you mean (--[\w-]+)\?\)/.exec(message)?.[1];
  const near = !run && similar ? ` Did you mean ${similar}?` : '';
  return {
    message: `unknown option '${stray}': ${sentence}.${near}`,
    suggestions,
  };
}

/**
 * The program a command belongs to.
 * @param {CommandLike} cmd
 * @returns {CommandLike}
 */
function rootOf(cmd) {
  let node = cmd;
  while (node.parent) node = node.parent;
  return node;
}

/**
 * Whether a run's words parse: every option word is an option of the
 * command reached at that word (or of a group above it), and the command the
 * words name takes the words left as its arguments, its required arguments
 * and required options among them. A group the run stops at does not parse,
 * since it runs no command; the program parses with its own options and no
 * word; a help run parses.
 * @param {CommandLike} program
 * @param {string[]} words the words of the run after the program name
 * @returns {boolean}
 */
export function runParses(program, words) {
  let cmd = program;
  /** @type {string[]} */
  const args = [];
  /** @param {OptionLike} o */
  const any = o => Boolean(o.long || o.short);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === '--') {
      args.push(...words.slice(i + 1));
      break;
    }
    if (word.startsWith('-') && word !== '-') {
      const flag = word.split('=')[0];
      const option = optionsInReach(cmd, any).find(
        o => o.long === flag || o.short === flag,
      );
      if (!option) return false;
      const next = words[i + 1];
      // An option that needs a value has none when no word follows it, or
      // when an option does: the program reads its own options first.
      if (
        option.required &&
        !word.includes('=') &&
        (next == null || (next.startsWith('-') && next !== '-'))
      )
        return false;
      if (
        takesValue(option) &&
        !word.includes('=') &&
        (option.required || (next != null && !next.startsWith('-')))
      )
        i += 1;
      continue;
    }
    const sub =
      args.length === 0
        ? (cmd.commands ?? []).find(c => !c._hidden && c.name() === word)
        : undefined;
    if (sub) cmd = sub;
    else args.push(word);
  }
  // The program itself runs only with no word: its options alone
  // (`astryx --help`).
  if (cmd === program) return args.length === 0;
  // A help run prints the help whatever else it lacks.
  if (words.includes('--help') || words.includes('-h')) return true;
  const declared = /** @type {any} */ (cmd).registeredArguments ?? [];
  const groupOnly =
    (cmd.commands ?? []).some(c => !c._hidden) && declared.length === 0;
  if (groupOnly) return false;
  // Every required argument and every required option is given.
  const required = declared.filter((/** @type {any} */ a) => a.required);
  const given = (/** @type {OptionLike} */ o) =>
    words.some(
      w =>
        w === o.long ||
        w === o.short ||
        (o.long != null && w.startsWith(`${o.long}=`)),
    );
  const mandatory = (cmd.options ?? []).filter(
    o => o.mandatory && o.defaultValue === undefined,
  );
  if (args.length < required.length || !mandatory.every(given)) return false;
  return (
    declared.some((/** @type {any} */ a) => a.variadic) ||
    args.length <= declared.length
  );
}

/**
 * The run's words with a stray option taken out: replaced by the option its
 * value names when one of `options` is that option (`--format json` is
 * `--json`), else the option word alone left out.
 * @param {string[]} words
 * @param {string} stray the option as Commander names it
 * @param {OptionLike[]} options
 * @returns {string[]}
 */
export function withoutStray(words, stray, options) {
  const at = words.indexOf(stray);
  if (at < 0) return words;
  const attached = stray.startsWith('--') && stray.includes('=');
  const next = words[at + 1];
  const value = attached
    ? stray.slice(stray.indexOf('=') + 1)
    : next != null && !next.startsWith('-')
      ? next
      : null;
  const named =
    value != null
      ? options.find(
          o => !takesValue(o) && o.long === `--${value.toLowerCase()}`,
        )
      : undefined;
  // The option the value names, once: a run that already gives it keeps
  // its own.
  if (named)
    return [
      ...words.slice(0, at),
      ...(words.includes(/** @type {string} */ (named.long))
        ? []
        : [/** @type {string} */ (named.long)]),
      ...words.slice(at + (attached ? 1 : 2)),
    ];
  return [...words.slice(0, at), ...words.slice(at + 1)];
}
