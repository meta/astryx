// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {integrationPackCheck} from './pack-check.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-pack-check-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {Record<string, string>} scripts */
function writeThemePackage(scripts) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@acme/widgets',
        version: '1.0.0',
        files: ['astryx.integration.mjs', 'themes'],
        peerDependencies: {'@astryxdesign/cli': '>=0.7.0'},
        peerDependenciesMeta: {'@astryxdesign/cli': {optional: true}},
        exports: {
          './themes/ocean': './themes/ocean/ocean.js',
          './themes/ocean.css': './themes/ocean/ocean.css',
        },
        scripts,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  const root = path.join(tmpDir, 'themes');
  fs.mkdirSync(path.join(root, 'ocean'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'ocean', 'oceanTheme.ts'),
    "import {defineTheme} from '@astryxdesign/core/theme';\n\nexport const oceanTheme = defineTheme({name: 'ocean'});\n",
  );
  fs.writeFileSync(
    path.join(root, 'ocean', 'oceanTheme.doc.mjs'),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};
`,
  );
  const built = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), 'packages/cli/clients/cli/bin/astryx.mjs'),
      'theme',
      'build',
      'themes/ocean/oceanTheme.ts',
    ],
    {cwd: tmpDir, encoding: 'utf-8', timeout: 30_000},
  );
  if (built.status !== 0) {
    throw new Error(
      `Could not build the theme fixture: ${built.stderr || built.stdout}`,
    );
  }
}

describe('integrationPackCheck with lifecycle script output', () => {
  it('checks the tarball when lifecycle scripts print to stdout', async () => {
    writeThemePackage({
      prepack: 'node -e "console.log(\'building the package\')"',
      prepare: 'node -e "console.log(\'preparing\')"',
      postpack: 'node -e "console.log(\'packed\')"',
    });

    const result = await integrationPackCheck({cwd: tmpDir});

    expect(result.data.issues).toEqual([]);
    expect(result.data.packable).toBe(true);
    expect(result.data.tarball?.filename).toBe('acme-widgets-1.0.0.tgz');
    expect(result.data.contributions.packed).toEqual(
      result.data.contributions.local,
    );
  });

  it('still runs a chatty lifecycle script and compares what it packed', async () => {
    const renameTheme = [
      "console.log('renaming ocean to storm')",
      "const fs=require('fs')",
      "fs.renameSync('themes/ocean','themes/storm')",
      "const p='themes/storm/oceanTheme.doc.mjs'",
      "let x=fs.readFileSync(p,'utf8')",
      "x=x.replace(/name: 'ocean'/, 'name: '+String.fromCharCode(39)+'storm'+String.fromCharCode(39))",
      'fs.writeFileSync(p,x)',
    ].join(';');
    writeThemePackage({prepack: `node -e "${renameTheme}"`});

    const result = await integrationPackCheck({cwd: tmpDir});
    const codes = result.data.issues.map(issue => issue.code);

    expect(codes).not.toContain('pack_failed');
    expect(codes).toContain('identity_not_packed');
    expect(codes).toContain('packed_identity_unexpected');
    expect(result.data.packable).toBe(false);
  });

  it('keeps a failing lifecycle script output in the pack_failed issue', async () => {
    writeThemePackage({
      prepack: 'node -e "console.error(\'prepack exploded\'); process.exit(3)"',
    });

    const result = await integrationPackCheck({cwd: tmpDir});
    const failure = result.data.issues.find(
      issue => issue.code === 'pack_failed',
    );

    expect(result.data.packable).toBe(false);
    expect(failure?.message).toContain('npm pack failed (exit 3)');
    expect(failure?.message).toContain('prepack exploded');
  });

  it.skipIf(process.platform === 'win32')(
    'packs with npm itself when an earlier npm on the PATH refuses every command',
    async () => {
      writeThemePackage({});
      const refusing = path.join(tmpDir, '.refusing-bin');
      fs.mkdirSync(refusing);
      fs.writeFileSync(
        path.join(refusing, 'npm'),
        "#!/bin/sh\necho 'npm commands are not allowed on this machine'\nexit 1\n",
        {mode: 0o755},
      );
      vi.stubEnv('PATH', `${refusing}${path.delimiter}${process.env.PATH}`);
      try {
        const result = await integrationPackCheck({cwd: tmpDir});

        expect(result.data.issues).toEqual([]);
        expect(result.data.packable).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
});
