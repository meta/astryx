// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * When npm cannot list a package's files, `template_asset_not_packed` still
 * reports an asset no `files` entry can reach and lists every other asset as
 * not checked (architecture:cli-surface INV35), never passing it silently.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {Command} from 'commander';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../foundation/release/cache.mjs', () => ({
  npmCommand: () => {
    throw new Error('npm is not installed');
  },
}));

const {validateIntegration} = await import('./validate-integration.mjs');
const {integrationCheck} = await import('./check/check.mjs');
const {registerDoctor} = await import('../../clients/cli/commands/doctor.mjs');

/** @type {string} */
let dir;

/** @param {Record<string, string>} files */
function write(files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
}

/** @param {string[]} files */
function packageWith(files) {
  write({
    'package.json': JSON.stringify({
      name: '@acme/kit',
      version: '1.0.0',
      files,
    }),
    'astryx.integration.mjs': "export default {templates: './templates'};\n",
    'templates/img/hero.png': 'png',
    'assets/cat.png': 'png',
    'templates/card.doc.mjs':
      "export default {type: 'block', name: 'card', displayName: 'Card', description: 'A block.'};\n",
    'templates/card.tsx': [
      "const hero = new URL('./img/hero.png', import.meta.url);",
      "const cat = new URL('../assets/cat.png', import.meta.url);",
      'export default () => null;',
      '',
    ].join('\n'),
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-npm-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('template assets when npm gives no answer', () => {
  it('reports an asset no entry can reach and lists the others as not checked', async () => {
    packageWith(['templates', '!templates/img']);
    const {data} = await validateIntegration(undefined, {cwd: dir});
    const notes = (data.notes ?? []).filter(
      note => note.code === 'template_asset_not_packed',
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('loads assets/cat.png');
    expect(data.exampleAssets).toEqual({
      status: 'checked',
      findings: [],
      unchecked: [
        {
          file: 'templates/card.tsx',
          asset: 'templates/img/hero.png',
          reason: 'npm was not found, and a `files` entry may reach it',
        },
      ],
    });

    const check = await integrationCheck({cwd: dir});
    expect(check.data.unchecked).toBeGreaterThanOrEqual(1);
  });

  it('lists an asset not checked when there is no files field but an ignore file', async () => {
    packageWith(['templates']);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    delete pkg.files;
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(dir, '.npmignore'), 'templates/img\n');
    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(
      data.exampleAssets?.unchecked.map(each => each.asset).sort(),
    ).toEqual(['assets/cat.png', 'templates/img/hero.png']);
    expect(
      data.exampleAssets?.unchecked.every(each =>
        each.reason.includes('.npmignore may drop it'),
      ),
    ).toBe(true);
  });

  it('shows the assets it could not check in text output', async () => {
    packageWith(['templates', '!templates/img']);
    /** @type {string[]} */
    const lines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '));
    });
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const program = new Command();
      program.exitOverride();
      program.option('--json', 'Output as typed JSON');
      registerDoctor(program);
      await program.parseAsync([
        'node',
        'astryx',
        'doctor',
        'integration',
        'validate',
      ]);
    } finally {
      process.chdir(previous);
      vi.restoreAllMocks();
    }
    const out = lines.join('\n');
    expect(out).toContain('Template assets not checked: 1');
    expect(out).toContain('templates/img/hero.png');
  });
});
