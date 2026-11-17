// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental import` turns a file `experimental export` wrote
 * back into its page, as `export --reverse` does. Help, docs and the file's
 * own note lead with import; the old `render --reverse` line moves to import
 * in one step; and an unknown way-back word at the top level suggests it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {sourceBlock} from '../foundation/render/source-block.mjs';
import {runCli} from '../test-utils/run-cli.mjs';

const PAGE =
  'export default function Page() {\n  return <p>Back again</p>;\n}\n';

/** A rendered file with a page's embedded source, in a fresh folder. */
function renderedFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-import-'));
  fs.writeFileSync(
    path.join(dir, 'page.html'),
    `<body><p class="astryx-text">Back again</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from(PAGE)}])}</body>`,
  );
  return dir;
}

describe('experimental import', () => {
  it('fails on an HTML file no render wrote, with ERR_RENDER_NOT_ASTRYX, and writes nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-import-plain-'));
    fs.writeFileSync(
      path.join(dir, 'plain.html'),
      '<!doctype html><p>Just a page</p>\n',
    );
    const json = await runCli(
      ['--json', 'experimental', 'import', 'plain.html'],
      {cwd: dir},
    );
    expect(json.status).toBe(1);
    const answer = JSON.parse(json.stdout);
    expect(answer.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(answer.error).toContain('plain.html is not an Astryx page');
    const text = await runCli(['experimental', 'import', 'plain.html'], {
      cwd: dir,
    });
    expect(text.status).toBe(1);
    expect(text.stderr).toContain(`Error: ${answer.error}`);
    expect(fs.readdirSync(dir)).toEqual(['plain.html']);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('gives the page back as export --reverse does, with the same JSON', async () => {
    const dir = renderedFile();
    const imported = await runCli(
      ['--json', 'experimental', 'import', 'page.html', '--out', 'a/page.tsx'],
      {cwd: dir},
    );
    const reversed = await runCli(
      [
        '--json',
        'experimental',
        'export',
        '--reverse',
        'page.html',
        '--out',
        'b/page.tsx',
      ],
      {cwd: dir},
    );
    expect(imported.status).toBe(0);
    expect(reversed.status).toBe(0);
    const a = JSON.parse(imported.stdout);
    const b = JSON.parse(reversed.stdout);
    expect(a.type).toBe('render.reverse');
    // The same answer, but for the folder each was asked to write to.
    expect(JSON.stringify(a.data).replaceAll('a/page.tsx', 'x')).toBe(
      JSON.stringify(b.data).replaceAll('b/page.tsx', 'x'),
    );
    expect(fs.readFileSync(path.join(dir, 'a/page.tsx'), 'utf8')).toBe(PAGE);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it.each([
    [['experimental', 'export', '--help']],
    [['docs', 'cli/experimental/share-a-page', '--full']],
    [['docs', 'cli/experimental/export-pages', '--full']],
  ])('`astryx %s` gives the way back as experimental import', async args => {
    const {status, stdout} = await runCli(args);
    expect(status).toBe(0);
    expect(stdout).toMatch(/experimental import page\.html/u);
  });

  it('the old render --reverse line moves to import in one step, keeping its options', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'experimental',
      'render',
      '--reverse',
      'my page.html',
      '--out',
      'p.tsx',
    ]);
    expect(status).toBe(1);
    const answer = JSON.parse(stdout);
    expect(answer.error).toBe(
      'experimental render --reverse is now experimental import.',
    );
    expect(answer.suggestions[0].name).toBe(
      "astryx --json experimental import 'my page.html' --out p.tsx",
    );
  });

  it.each(['import', 'back', 'restore', 'unrender', 'reverse'])(
    'an unknown top-level %s suggests experimental import, and never runs it',
    async word => {
      const {status, stdout} = await runCli(['--json', word, 'page.html']);
      expect(status).toBe(1);
      const answer = JSON.parse(stdout);
      expect(answer.code).toBe('ERR_UNKNOWN_COMMAND');
      expect(answer.suggestions[0].name).toMatch(
        /experimental import page\.html$/u,
      );
      expect(answer.suggestions[0].reason).toMatch(/\(experimental\)/u);
    },
  );
});
