// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-props-'));

// A family member's read keeps its own entry under `components`; its props
// print once, under `## Props`.
describe('a family member read prints its props once', () => {
  it.each(['VStack', 'HStack'])('%s --detail full', async name => {
    const run = await runCli(['component', name, '--detail', 'full'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.match(/^- `gap`: /gm)).toHaveLength(1);
    expect(run.stdout).toContain('## Props');
    // The member's own description still prints under its heading.
    expect(run.stdout).toMatch(new RegExp(`^### ${name}\\n\\n\\S`, 'm'));
    expect(run.stdout).not.toContain(`component ${name}\` for props`);
  });

  it('keeps the member entry and its props in the JSON', async () => {
    const run = await runCli(['component', 'VStack', '--json'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    const {data} = JSON.parse(run.stdout);
    expect(data.components.map((/** @type {any} */ c) => c.name)).toEqual([
      'VStack',
    ]);
    expect(data.components[0].props).toEqual(data.props);
    const full = await runCli(
      ['component', 'VStack', '--detail', 'full', '--json'],
      {cwd},
    );
    expect(full.stdout).toBe(run.stdout);
  });

  // Each field of the JSON shows in exactly one place in the text.
  it.each(['VStack', 'HStack'])(
    'prints each JSON field of %s exactly once at --detail full',
    async name => {
      const json = await runCli(['component', name, '--json'], {cwd});
      const text = await runCli(['component', name, '--detail', 'full'], {
        cwd,
      });
      expect(text.status, text.stderr).toBe(0);
      const {data} = JSON.parse(json.stdout);
      const lines = text.stdout.split('\n');
      /** @param {(line: string) => boolean} match */
      const count = match => lines.filter(match).length;
      /** @type {string[]} */
      const missed = [];
      /** @param {string} field @param {(line: string) => boolean} match */
      const once = (field, match) => {
        const n = count(match);
        if (n !== 1) missed.push(`${field}: ${n}`);
      };
      once('name', l => l === `# ${data.name}`);
      for (const p of data.props) {
        once(`props.${p.name}`, l =>
          l.startsWith(`- \`${p.name}\`: \`${p.type}\``),
        );
      }
      for (const c of data.components) {
        once(`components.${c.name}`, l => l === `### ${c.name}`);
        once(`components.${c.name}.description`, l => l === c.description);
      }
      for (const a of data.usage?.anatomy ?? []) {
        once(`usage.anatomy.${a.name}`, l => l.startsWith(`| ${a.name} |`));
      }
      for (const bp of data.usage?.bestPractices ?? []) {
        once('usage.bestPractices', l => l === `- ${bp.description}`);
      }
      expect(missed).toEqual([]);
    },
  );
});
