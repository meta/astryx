// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The no-query `build` playbook is data. `--json` carries every step,
 * rule and command; the text output is rendered from those values and shows
 * nothing the envelope lacks.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {program} from '../program.mjs';

// Run against the monorepo root so @astryxdesign/core is discoverable.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SLOW = 30_000;

/** @param {string} s */
const ascii = s => s.replace(/[\u2014\u2013]/g, '-');

describe('build playbook: text is a projection of the JSON', () => {
  it('prints exactly the commands, steps and rules the envelope carries', async () => {
    const json = await runCli(['build', '--json'], REPO);
    expect(json.status).toBe(0);
    const {type, data} = JSON.parse(json.stdout);
    expect(type).toBe('build.help');
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.rules.length).toBeGreaterThan(0);

    const human = await runCli(['build'], REPO);
    expect(human.status).toBe(0);
    const out = human.stdout;

    expect(out).toContain(ascii(data.title));
    for (const step of data.steps) {
      expect(out).toContain(ascii(step.title));
      if (step.returns) expect(out).toContain(ascii(step.returns));
    }
    for (const rule of data.rules) expect(out).toContain(ascii(rule));

    /** @type {Array<{command: string, purpose?: string}>} */
    const commands = [
      ...data.steps.flatMap((/** @type {any} */ s) => s.commands),
      ...data.related,
    ];
    // Each command is one record whose field names are the JSON keys:
    // `command:` (run with the caller's invocation), then `purpose:`.
    const printed = out
      .split('\n')
      .filter(line => line.startsWith('command: '))
      .map(line => line.slice('command: '.length).trim());
    expect(printed).toHaveLength(commands.length);
    commands.forEach(({command, purpose}, i) => {
      expect(printed[i].endsWith(` ${command}`)).toBe(true);
      if (purpose) expect(out).toContain(`purpose: ${ascii(purpose)}`);
    });
    // No column the handler drew itself.
    expect(out).not.toMatch(/ {2,}# /);
  }, SLOW);

  it('names only commands this CLI registers', async () => {
    const {stdout} = await runCli(['build', '--json'], REPO);
    const {data} = JSON.parse(stdout);
    const registered = new Set(program.commands.map(c => c.name()));
    const commands = [
      ...data.steps.flatMap((/** @type {any} */ s) => s.commands),
      ...data.related,
    ];
    expect(commands.length).toBeGreaterThan(0);
    for (const {command} of commands) {
      expect(registered.has(command.split(' ')[0])).toBe(true);
    }
  }, SLOW);
});
