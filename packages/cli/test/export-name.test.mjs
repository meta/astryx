// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The command that writes a page as one HTML file is `experimental
 * export`. No published file, help, docs page, or written file names the old
 * name `experimental render`, and the old name fails and names the new one;
 * it is no alias.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {publishedFiles} from '../scripts/published-files.mjs';
import {runCli} from '../test-utils/run-cli.mjs';

// Also across a comment line break (`experimental` / ` * render`).
const OLD = /experimental(?:[ \-/]|\s*\n\s*(?:\*|\/\/)?\s*)render\b/u;

describe('experimental export is the name', () => {
  it('no published file names experimental render', () => {
    const named = publishedFiles(CLI_ROOT).filter(
      rel =>
        !rel.endsWith('CHANGELOG.md') &&
        OLD.test(fs.readFileSync(path.join(CLI_ROOT, rel), 'utf8')),
    );
    expect(named).toEqual([]);
  });

  it.each([
    [['experimental', '--help']],
    [['experimental', 'export', '--help']],
    [['docs', 'cli/experimental/share-a-page', '--full']],
    [['docs', 'cli/experimental/export-pages', '--full']],
    [['docs', 'cli/commands/experimental-export']],
  ])('`astryx %s` names experimental export, never render', async args => {
    const {status, stdout} = await runCli(args);
    expect(status).toBe(0);
    expect(stdout).toMatch(/experimental export/u);
    expect(stdout).not.toMatch(OLD);
  });

  it('the old name fails and names the new one', async () => {
    const {status, stdout, stderr} = await runCli([
      'experimental',
      'render',
      'page.tsx',
    ]);
    expect(status).toBe(1);
    expect(stdout + stderr).toMatch(
      /experimental render is now experimental export/u,
    );
    expect(stdout + stderr).toMatch(/experimental export page\.tsx/u);
  });

  it('the moved error keeps the options before it and quotes each word', async () => {
    const {status, stdout} = await runCli([
      '--json',
      '--base',
      '@astryxdesign/core',
      'experimental',
      'render',
      'my page.tsx',
      '--out',
      'my page.html',
    ]);
    expect(status).toBe(1);
    expect(JSON.parse(stdout).suggestions[0].name).toBe(
      "astryx --json --base @astryxdesign/core experimental export 'my page.tsx' --out 'my page.html'",
    );
  });

  it('help for the old name answers the moved error', async () => {
    const {status, stdout, stderr} = await runCli([
      'help',
      'experimental',
      'render',
    ]);
    expect(status).toBe(1);
    expect(stdout + stderr).toMatch(/is now experimental export/u);
  });

  it.each([[[]], [['--json']]])(
    'an unknown experimental word never lists the old name (%j)',
    async flags => {
      for (const word of ['rendr', 'nope']) {
        const {stdout, stderr} = await runCli([...flags, 'experimental', word]);
        expect(stdout + stderr).toMatch(/experimental export/u);
        expect(stdout + stderr).not.toMatch(OLD);
      }
    },
  );

  it.each(['render', 'export', 'share', 'bundle', 'snapshot', 'standalone'])(
    'an unknown `astryx %s page.tsx` suggests experimental export page.tsx',
    async word => {
      // A real page, so a run of the command would write page.html.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-word-'));
      fs.writeFileSync(
        path.join(dir, 'page.tsx'),
        'export default function Page() { return null; }\n',
      );
      try {
        const {status, stdout, stderr} = await runCli([word, 'page.tsx'], {
          cwd: dir,
        });
        expect(status).toBe(1);
        expect(stdout + stderr).toMatch(/experimental export page\.tsx/u);
        expect(stdout + stderr).toMatch(/\(experimental\)/u);
        expect(fs.existsSync(path.join(dir, 'page.html'))).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
  );
});
