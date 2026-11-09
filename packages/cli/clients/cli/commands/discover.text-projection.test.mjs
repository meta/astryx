// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` text output projects every field of its JSON entry.
 *
 * The text views of `discover.list` and `discover.detail` are renderings of the
 * same entries `--json` returns, so each entry key must appear as a `key:` line
 * carrying the same value.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

let tmpDir;
let project;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-text-'));
  project = path.join(tmpDir, 'project');
  const pkgDir = path.join(project, 'node_modules', '@test', 'kit');
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'proj', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    `export default {integrations: ['@test/kit']};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@test/kit', version: '3.1.4'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default {components: './components'};\n`,
  );
  for (const name of ['Dial', 'Gauge']) {
    fs.writeFileSync(
      path.join(pkgDir, 'components', `${name}.doc.mjs`),
      `export const docs = {name: '${name}', usage: {description: 'A ${name}.'}};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', `${name}.tsx`),
      `export function ${name}() { return null; }\n`,
    );
  }
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {Record<string, unknown>} entry
 * @param {string} text
 */
function expectEveryField(entry, text) {
  const lines = text.split('\n');
  for (const [key, value] of Object.entries(entry)) {
    const rendered = Array.isArray(value) ? value.join(', ') : String(value);
    expect(lines).toContainEqual(
      expect.stringMatching(new RegExp(`^${key}:\\s+${escape(rendered)}$`)),
    );
  }
}

/** @param {string} s */
function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('astryx discover text output', () => {
  it('lists every field of each discover.list entry', async () => {
    const asJson = await runCli(['discover', '--json'], {cwd: project});
    const [entry] = JSON.parse(asJson.stdout).data;
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining(['name', 'category', 'components', 'version']),
    );

    const {status, stdout} = await runCli(['discover'], {cwd: project});

    expect(status).toBe(0);
    expectEveryField(entry, stdout);
  });

  it('shows every field of the discover.detail entry', async () => {
    const asJson = await runCli(['discover', '@test/kit', '--json'], {
      cwd: project,
    });
    const {data} = JSON.parse(asJson.stdout);

    const {status, stdout} = await runCli(['discover', '@test/kit'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expectEveryField(data, stdout);
  });
});
