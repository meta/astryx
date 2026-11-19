// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The words from other command lines that the unknown-command answer
 * reads. Each entry names the word and the common tool that uses it.
 *
 * An entry is added only with evidence that coding agents or people type
 * the word at astryx. A word is never the name of an astryx command, or the
 * plural of one: that command answers the word itself. The unknown-command
 * tests check both rules against the real program.
 *
 * @input none
 * @output the word tables `unknown-command.mjs` reads
 * @position packages/cli/clients/cli/lib — data for unknown-command.mjs
 */

/**
 * A word and the tool that uses it.
 * @typedef {{word: string, usedBy: string}} ToolWord
 */

/**
 * A word for a job one astryx command does. `run` is the run that does the
 * job. A word in angle brackets (`<old-version>`) names an input the run
 * needs, which the words typed fill when they hold it. `notNeededWith` names
 * the options that make those inputs unneeded: the run leaves them out when
 * the words typed hold one of these options.
 * @typedef {ToolWord & {run: readonly string[], reason: string, notNeededWith?: readonly string[]}} JobWord
 */

/**
 * Words that ask a command for its whole list (`templates list`).
 * @type {readonly ToolWord[]}
 */
export const LIST_WORDS = [{word: 'list', usedBy: 'npm (`npm list`)'}];

/**
 * Words that only ask to read what the next word names (`show component
 * Button`, `templates view settings`).
 * @type {readonly ToolWord[]}
 */
export const READ_WORDS = [
  {word: 'info', usedBy: 'npm (`npm info`)'},
  {word: 'view', usedBy: 'npm (`npm view`)'},
  {word: 'show', usedBy: 'npm (`npm show`)'},
  {word: 'describe', usedBy: 'kubectl (`kubectl describe`)'},
];

/**
 * Verbs that put a component or a page into a project (`add button`).
 * @type {readonly ToolWord[]}
 */
export const ADD_WORDS = [{word: 'add', usedBy: 'shadcn (`shadcn add`)'}];

/**
 * Verbs that copy a component's source into a project (`eject button`).
 * @type {readonly ToolWord[]}
 */
export const SOURCE_WORDS = [
  {word: 'eject', usedBy: 'Create React App (`npm run eject`)'},
];

/**
 * Words that ask for a component's props (`props Card`).
 * @type {readonly ToolWord[]}
 */
export const PROPS_WORDS = [
  {word: 'props', usedBy: 'React, which names the inputs of a component props'},
];

/**
 * Options for where a file goes. A command with a `path` argument takes
 * their value as that argument.
 * @type {readonly ToolWord[]}
 */
export const PATH_OPTIONS = [
  {word: '--path', usedBy: 'shadcn (`shadcn add --path`)'},
  {word: '--out', usedBy: 'TypeScript (`tsc --out`)'},
];

/**
 * Words for a job one astryx command does, with the run that does it.
 * @type {readonly JobWord[]}
 */
export const JOB_WORDS = [
  {
    word: 'migrate',
    usedBy: 'Prisma, Django and Rails (`migrate`)',
    run: ['upgrade', '--from', '<old-version>'],
    notNeededWith: ['--list', '--registry'],
    reason: 'upgrade runs the codemods for a new version',
  },
  {
    word: 'browse',
    usedBy: 'GitHub CLI (`gh extension browse`)',
    run: ['discover'],
    reason: 'discover lists the integrations you can add',
  },
];
