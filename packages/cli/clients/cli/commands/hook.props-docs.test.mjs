// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A hook documented with `props` (its options) and no `params` or
 * `returns`, such as the Table plugin hooks, prints every field of its
 * `hook.detail` JSON in the text, and its short and brief reads match the
 * component read of the same doc.
 */

import {afterAll, describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-hook-props-'));
afterAll(() => fs.rmSync(cwd, {recursive: true, force: true}));

/** The first line of a text, trimmed. @param {string} text */
const firstLine = text => text.trim().split('\n')[0].trim();

/** Every hook whose doc lists props and no params or returns. */
async function propsShapedHooks() {
  const list = await runCli(['hook', '--list', '--detail', 'full', '--json'], {
    cwd,
  });
  const groups = JSON.parse(list.stdout).data.components;
  return Object.values(groups)
    .flat()
    .filter(
      (/** @type {any} */ h) =>
        Array.isArray(h.props) && !('params' in h) && !('returns' in h),
    )
    .map((/** @type {any} */ h) => h.name);
}

describe('a hook documented with props', () => {
  it('prints every JSON field in the text', async () => {
    const names = await propsShapedHooks();
    expect(names).toContain('useTableSelectionState');
    /** @type {string[]} */
    const missed = [];
    for (const name of names) {
      const json = await runCli(['hook', name, '--json'], {cwd});
      const {data} = JSON.parse(json.stdout);
      const run = await runCli(['hook', name], {cwd});
      expect(run.status, run.stderr).toBe(0);
      const out = run.stdout;
      /** @param {string} field @param {string} text */
      const has = (field, text) => {
        if (!out.includes(text)) missed.push(`${name} ${field}`);
      };
      has('name', `# ${data.name}`);
      has('displayName', data.displayName);
      if (data.subComponentOf)
        has('subComponentOf', `subComponentOf: ${data.subComponentOf}`);
      has('description', firstLine(data.description));
      if (data.usage?.description)
        has('usage.description', firstLine(data.usage.description));
      for (const p of data.props) has(`props.${p.name}`, `- \`${p.name}\`: `);
      for (const ex of data.examples ?? []) {
        const label = ex.label ?? ex.title;
        if (label) has(`examples.${label}`, label);
        has('examples.code', firstLine(ex.code));
      }
    }
    expect(missed).toEqual([]);
  }, 120_000);

  it.each(['compact', 'brief'])(
    '--detail %s prints what the component read prints, for every such hook',
    async detail => {
      // The prop lines and the indented brief lines are the same; the
      // component read adds its import, and each read names its own full read.
      const lines = (/** @type {string} */ t) =>
        t.split('\n').filter(l => l.startsWith('- `') || l.startsWith('  '));
      /** @type {string[]} */
      const differ = [];
      for (const name of await propsShapedHooks()) {
        const hook = await runCli(['hook', name, '--detail', detail], {cwd});
        const component = await runCli(
          ['component', name, '--detail', detail],
          {cwd},
        );
        expect(hook.status, hook.stderr).toBe(0);
        if (lines(hook.stdout).length === 0) differ.push(`${name}: empty`);
        if (
          JSON.stringify(lines(hook.stdout)) !==
          JSON.stringify(lines(component.stdout))
        )
          differ.push(name);
      }
      expect(differ).toEqual([]);
    },
    120_000,
  );

  it('lists such a hook with its props in the full list', async () => {
    const run = await runCli(['hook', '--list', '--detail', 'full'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('# useTableSelectionState');
    expect(run.stdout).toContain('- `selectedKeys`: ');
  });

  it('prints the same JSON bytes at every detail level', async () => {
    const base = await runCli(['hook', 'useTableSelectionState', '--json'], {
      cwd,
    });
    for (const level of ['full', 'compact', 'brief']) {
      const run = await runCli(
        ['hook', 'useTableSelectionState', '--detail', level, '--json'],
        {cwd},
      );
      expect(run.stdout).toBe(base.stdout);
    }
  });
});
