// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every option an icon CommandDoc declares reaches the API function it
 * names (spec:AST-042 FR1, architecture:cli-surface INV6): for each icon
 * command and each of its options, the CLI runs with that option, and the
 * test asserts the function received the parameter the option's `param`
 * names. The API functions are replaced by recorders, so nothing is read or
 * written. `--set` on a subcommand is also given before the subcommand's own
 * arguments and after them, since `experimental icon` declares `--set` too.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as iconCommand} from './experimental-icon.doc.mjs';
import {doc as addCommand} from './experimental-icon-add.doc.mjs';
import {doc as mapCommand} from './experimental-icon-map.doc.mjs';
import {doc as useCommand} from './experimental-icon-use.doc.mjs';
import {doc as newSetCommand} from './experimental-icon-new-set.doc.mjs';
import {doc as newDefinitionCommand} from './experimental-icon-new-definition.doc.mjs';

const calls = vi.hoisted(
  () => /** @type {Array<{fn: string, args: unknown[]}>} */ ([]),
);

/**
 * A recorder for one API function: it records its arguments and fails, so
 * the CLI prints an error and renders no result.
 * @param {string} fn
 */
function recorder(fn) {
  return async (/** @type {unknown[]} */ ...args) => {
    calls.push({fn, args});
    throw Object.assign(new Error('recorded'), {code: 'ERR_NOT_FOUND'});
  };
}

vi.mock('../../../api/icon/icon.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  icon: recorder('icon'),
}));
vi.mock('../../../api/icon/add/add.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  iconAdd: recorder('iconAdd'),
}));
vi.mock('../../../api/icon/map/map.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  iconMap: recorder('iconMap'),
}));
vi.mock('../../../api/icon/use/use.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  iconUse: recorder('iconUse'),
}));
vi.mock('../../../api/icon/new-set/new-set.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  iconNewSet: recorder('iconNewSet'),
}));
vi.mock(
  '../../../api/icon/new-definition/new-definition.mjs',
  async importOriginal => ({
    .../** @type {object} */ (await importOriginal()),
    iconNewDefinition: recorder('iconNewDefinition'),
  }),
);

beforeEach(() => {
  calls.length = 0;
});

/** @type {Array<[string, any, string]>} the command, its doc, its function */
const COMMANDS = [
  ['experimental icon', iconCommand, 'icon'],
  ['experimental icon add', addCommand, 'iconAdd'],
  ['experimental icon map', mapCommand, 'iconMap'],
  ['experimental icon use', useCommand, 'iconUse'],
  ['experimental icon new-set', newSetCommand, 'iconNewSet'],
  [
    'experimental icon new-definition',
    newDefinitionCommand,
    'iconNewDefinition',
  ],
];

/**
 * The words that run one command with one option: the command, its required
 * arguments, and the option (with a value when it takes one).
 * @param {string} name
 * @param {any} command
 * @param {any} option
 * @param {'after' | 'before'} [where] the option after the arguments, or
 *   before them
 */
function argv(name, command, option, where = 'after') {
  const required = (command.args ?? [])
    .filter((/** @type {any} */ arg) => arg.required === true)
    .map(() => 'glyphs');
  const [flag, value] = option.flag.split(/\s+/u);
  const given = value ? [flag, flag === '--limit' ? '3' : 'glyphs'] : [flag];
  return [
    ...name.split(' '),
    ...(where === 'before' ? [...given, ...required] : [...required, ...given]),
  ];
}

/**
 * The options object the recorded call passed (its last argument).
 * @param {string} fn
 * @returns {Record<string, unknown>}
 */
function received(fn) {
  const call = calls.find(each => each.fn === fn);
  if (!call) throw new Error(`${fn} was not called`);
  return /** @type {Record<string, unknown>} */ (call.args.at(-1));
}

describe.each(COMMANDS)('%s', (name, command, fn) => {
  const options = command.options ?? [];
  if (options.length === 0) {
    it('declares no option', () => {
      expect(options).toEqual([]);
    });
    return;
  }
  it.each(options.map((/** @type {any} */ option) => [option.flag, option]))(
    '%s reaches the API',
    async (_flag, option) => {
      await runCli(argv(name, command, option), {cwd: process.cwd()});
      const key = option.param.replace(/^options\./u, '');
      const value = received(fn)[key];
      expect(value, `${option.flag} -> ${option.param}`).not.toBeUndefined();
      expect(value, `${option.flag} -> ${option.param}`).not.toBe(false);
    },
  );
});

describe('--set on a subcommand, which experimental icon declares too', () => {
  it.each([
    ['experimental icon add', addCommand, 'iconAdd'],
    ['experimental icon map', mapCommand, 'iconMap'],
    [
      'experimental icon new-definition',
      newDefinitionCommand,
      'iconNewDefinition',
    ],
  ])(
    '%s takes --set before or after its arguments',
    async (name, command, fn) => {
      const option = command.options.find((/** @type {any} */ each) =>
        each.flag.startsWith('--set '),
      );
      for (const where of /** @type {const} */ (['after', 'before'])) {
        calls.length = 0;
        await runCli(argv(name, command, option, where), {cwd: process.cwd()});
        expect(received(fn).set, where).toBe('glyphs');
      }
    },
  );
});
