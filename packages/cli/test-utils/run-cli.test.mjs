// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file runCli builds the program a run of the bin builds (run.mjs passes its
 * arguments to createProgram), so a test drives the commands a user's run
 * loads, and no more.
 */

import {describe, expect, it, vi} from 'vitest';

const built = vi.hoisted(() => ({names: /** @type {string[][]} */ ([])}));

vi.mock('../clients/cli/index.mjs', async importOriginal => {
  /** @type {typeof import('../clients/cli/index.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    /** @param {Parameters<typeof original.createProgram>[0]} options */
    createProgram: async options => {
      const program = await original.createProgram(options);
      built.names.push(program.commands.map(command => command.name()));
      return program;
    },
  };
});

const {createProgram} = await import('../clients/cli/index.mjs');
const {runCli} = await import('./run-cli.mjs');

describe('runCli', () => {
  it('builds the commands a run of the bin builds for the same arguments', async () => {
    for (const argv of [
      ['search', 'zzqq'],
      ['--json', 'docs'],
      ['--detail', 'brief', 'component', 'Button'],
      ['--version'],
      ['--help'],
      ['help', 'docs'],
      ['no-such-command'],
    ]) {
      built.names.length = 0;
      await runCli(argv);
      const [helper, bin] = [
        built.names[0],
        (await createProgram({argv})).commands.map(command => command.name()),
      ];
      expect(helper, argv.join(' ')).toEqual(bin);
    }
  });
});
