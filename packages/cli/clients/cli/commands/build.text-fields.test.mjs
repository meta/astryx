// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `build "<idea>"` text output names only fields the `build.kit`
 * envelope carries — on the kit itself or on its entries.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

// Run against the monorepo root so @astryxdesign/core is discoverable.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SLOW = 60_000;

describe('build kit text fields mirror the JSON keys', () => {
  it('prints no field the envelope lacks', async () => {
    const json = await runCli(['build', 'analytics dashboard', '--json', '--verbose'], REPO);
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    const keys = new Set([
      ...Object.keys(data),
      ...Object.keys(data.start ?? {}),
      ...(data.start?.alternatives ?? []).flatMap(a => Object.keys(a)),
      ...[...data.pages, ...data.blocks, ...data.domain].flatMap(e => Object.keys(e)),
    ]);

    const human = await runCli(['build', 'analytics dashboard', '--verbose'], REPO);
    expect(human.status).toBe(0);
    const fields = [
      ...new Set(
        human.stdout
          .split('\n')
          .map(line => /^([A-Za-z]+):\s/.exec(line)?.[1])
          .filter(Boolean),
      ),
    ];
    expect(fields).toContain('frame');
    // The start is printed as a record, so its fields are checked too.
    expect(fields).toContain('command');
    expect(fields).toContain('displayName');
    for (const field of fields) expect(keys).toContain(field);
  }, SLOW);

  it('leads with the start, then the alternatives, blocks and components', async () => {
    const human = await runCli(['build', 'analytics dashboard'], REPO);
    expect(human.status).toBe(0);
    const headings = human.stdout
      .split('\n')
      .filter(line => /^(TEMPLATE|OTHER TEMPLATES|BLOCKS|COMPONENTS)$/.test(line));
    expect(headings).toEqual(['TEMPLATE', 'OTHER TEMPLATES', 'BLOCKS', 'COMPONENTS']);
    // A builder changing a page they already have keeps it.
    expect(human.stdout).toContain(
      'Changing a page you already have? Keep it, and use only the blocks and components.',
    );
  }, SLOW);

  it("shortens the start's description by default and prints it whole under --verbose", async () => {
    const json = await runCli(['build', 'quarterly revenue dashboard', '--json'], REPO);
    const {start} = JSON.parse(json.stdout).data;
    const first = start.description.slice(0, start.description.indexOf('. ') + 1);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(start.description.length);
    const line = out => out.split('\n').find(l => l.startsWith('description:'));
    const brief = await runCli(['build', 'quarterly revenue dashboard'], REPO);
    expect(line(brief.stdout)).toBe(`description: ${first}`);
    const whole = await runCli(['build', 'quarterly revenue dashboard', '--verbose'], REPO);
    expect(whole.stdout).toContain(start.description);
  }, SLOW);

  it("names search's page matches in the default text", async () => {
    const json = await runCli(['build', 'contact form', '--json'], REPO);
    const {data} = JSON.parse(json.stdout);
    expect(data.pages.length).toBeGreaterThan(0);
    const human = await runCli(['build', 'contact form'], REPO);
    expect(human.stdout).toContain(
      `Keyword search matched these page templates: ${data.pages.map(p => `${p.name} (${p.package})`).join(', ')}.`,
    );
  }, SLOW);
});
