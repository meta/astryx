// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover --components` does what its doc says.
 *
 * The flag only lifts the package list's component summary (the first 10
 * names plus "+N more") so every component prints. It changes nothing in
 * `--json`, whose entries always carry the full array.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc} from './discover.doc.mjs';
import {doc as discoverFn} from '../../../api/discover/discover.doc.mjs';

const NAMES = Array.from({length: 12}, (_, i) => `Part${String(i).padStart(2, '0')}`);

let tmpDir;
let project;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-components-'));
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
    JSON.stringify({name: '@test/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default {components: './components'};\n`,
  );
  for (const name of NAMES) {
    fs.writeFileSync(
      path.join(pkgDir, 'components', `${name}.doc.mjs`),
      `export const docs = {name: '${name}', usage: {description: 'A part.'}};\n`,
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

/** @param {string} stdout */
function componentsLine(stdout) {
  return stdout.split('\n').find(line => line.startsWith('components:'));
}

describe('astryx discover --components', () => {
  it('lists every component where the default list shows the first 10', async () => {
    const summary = await runCli(['discover'], {cwd: project});
    const full = await runCli(['discover', '--components'], {cwd: project});

    expect(componentsLine(summary.stdout)).toMatch(
      new RegExp(`${NAMES[9]}, \\+2 more$`),
    );
    expect(componentsLine(full.stdout)).toMatch(new RegExp(`${NAMES.join(', ')}$`));
  });

  it('leaves the --json response unchanged', async () => {
    const plain = await runCli(['discover', '--json'], {cwd: project});
    const flagged = await runCli(['discover', '--components', '--json'], {
      cwd: project,
    });

    expect(JSON.parse(flagged.stdout)).toEqual(JSON.parse(plain.stdout));
  });

  it('is documented as that behavior, with an example', () => {
    const option = doc.options?.find(o => o.flag === '--components');
    const param = discoverFn.params?.find(p => p.name === 'options.components');

    for (const description of [option?.description, param?.description]) {
      expect(description).toMatch(/every component/i);
      expect(description).toMatch(/first 10/);
      expect(description).not.toMatch(/components only/i);
    }
    expect(doc.examples?.some(e => /\s--components\b/.test(e.cli))).toBe(true);
  });
});
