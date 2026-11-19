// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file End-to-end protection and regeneration behavior for `astryx upgrade`.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'astryx.mjs',
);
let root;

function write(relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
  return file;
}

function run(args) {
  const result = spawnSync(
    process.execPath,
    [CLI, '--json', 'upgrade', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: {...process.env, FORCE_COLOR: '0', CI: ''},
    },
  );
  return {...result, envelope: JSON.parse(result.stdout)};
}

function seed({hook = false} = {}) {
  write('package.json', JSON.stringify({name: 'consumer', private: true}));
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
  );
  write('.gitattributes', 'generated/** linguist-generated=true\n');
  const source =
    "import {useResizable} from '@astryxdesign/core';\n" +
    'export const usePanel = () => useResizable({minSizePx: 200});\n';
  write('src/owned.tsx', source);
  write('generated/panel.tsx', `// @generated\n${source}`);
  write(
    'astryx.config.mjs',
    hook
      ? `export default {hooks: {postCodemod: [{name: 'regenerate', buildCommand: () => ({command: process.execPath, args: ['-e', ${JSON.stringify("const fs=require('node:fs');const p='generated/panel.tsx';const s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,s.replaceAll('minSizePx','minSize')); ")} ]})}]}};\n`
      : 'export default {};\n',
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-protected-upgrade-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

const ARGS = [
  '--from',
  '0.5.0',
  '--codemod',
  'rename-resizable-pixel-bounds',
  '--path',
  '.',
];

describe('upgrade protected-file contract', () => {
  it('reports the same protected candidate in dry-run and apply while retaining owned edits', () => {
    seed();

    const dry = run(ARGS);
    expect(dry.status).toBe(1);
    expect(dry.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTED',
        modifiedFiles: ['src/owned.tsx'],
        protectedFiles: [
          {
            file: 'generated/panel.tsx',
            reasons: ['generated'],
            declarations: expect.arrayContaining([
              'linguist-generated in .gitattributes:1',
              '@generated in the leading comment block',
            ]),
          },
        ],
      },
    });
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSizePx',
    );

    const applied = run([...ARGS, '--apply']);
    expect(applied.status).toBe(1);
    expect(applied.envelope.data.protectedFiles).toEqual(
      dry.envelope.data.protectedFiles,
    );
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
    expect(
      fs.readFileSync(path.join(root, 'generated/panel.tsx'), 'utf8'),
    ).toContain('minSizePx');
  });

  it('preserves a protected config migration when strict config loading fails', () => {
    write('package.json', JSON.stringify({name: 'consumer', private: true}));
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    write(
      'astryx.config.mjs',
      `// @generated\nexport default {layout: {components: {KpiCard: '@/KpiCard'}}};\n`,
    );
    write('src/index.ts', 'export {};\n');

    const result = run([
      '--from',
      '0.1.2',
      '--codemod',
      'migrate-layout-components-to-experimental',
      '--path',
      'src',
      '--apply',
    ]);

    expect(result.status).toBe(1);
    expect(result.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTED',
        protectedFiles: [expect.objectContaining({file: 'astryx.config.mjs'})],
      },
    });
    expect(
      fs.readFileSync(path.join(root, 'astryx.config.mjs'), 'utf8'),
    ).toContain('layout');
  });

  it('fails before writes when a protection declaration cannot be parsed', () => {
    seed();
    write('.hgignore', 'syntax: regexp\n[bad\n');

    const result = run([...ARGS, '--apply']);

    expect(result.status).toBe(1);
    expect(result.envelope).toMatchObject({
      code: 'ERR_CODEMOD_PROTECTION_SOURCE',
    });
    expect(result.envelope.error).toContain('.hgignore');
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSizePx',
    );
  });

  it('preserves protected-file facts when regeneration fails', () => {
    seed();
    write(
      'astryx.config.mjs',
      `export default {hooks: {postCodemod: [{name: 'regenerate', buildCommand: () => ({command: process.execPath, args: ['-e', 'process.exit(7)']})}]}};\n`,
    );

    const applied = run([...ARGS, '--apply']);

    expect(applied.status).toBe(1);
    expect(applied.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTED',
        protectedFiles: [
          expect.objectContaining({file: 'generated/panel.tsx'}),
        ],
        errors: [
          expect.objectContaining({
            codemod: 'post-codemod-hook',
            error: expect.stringContaining('Post-codemod hook failed'),
          }),
        ],
      },
    });
  });

  it('keeps the error and adds the receipt when a hook leaves a protection declaration unreadable', () => {
    seed();
    write(
      'astryx.config.mjs',
      `export default {hooks: {postCodemod: [{name: 'regenerate', buildCommand: () => ({command: process.execPath, args: ['-e', ${JSON.stringify("require('node:fs').writeFileSync('.hgignore', 'syntax: regexp\\n[bad\\n')")}]})}]}};\n`,
    );

    const applied = run([...ARGS, '--apply']);

    expect(applied.status).toBe(1);
    expect(applied.envelope).not.toHaveProperty('type');
    expect(applied.envelope).toMatchObject({
      code: 'ERR_CODEMOD_PROTECTION_SOURCE',
      error: expect.stringContaining('.hgignore'),
      receipt: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTION_SOURCE',
        modifiedFiles: ['src/owned.tsx'],
        protectedFiles: [
          expect.objectContaining({file: 'generated/panel.tsx'}),
        ],
        errors: [expect.objectContaining({codemod: 'file-protection'})],
      },
    });
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
  });

  it('runs declared regeneration and clears a generated-file block after reevaluation', () => {
    seed({hook: true});

    const applied = run([...ARGS, '--apply']);

    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: true,
        modifiedFiles: ['src/owned.tsx', 'generated/panel.tsx'],
        protectedFiles: [],
        declinedCandidates: [],
      },
    });
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
    expect(
      fs.readFileSync(path.join(root, 'generated/panel.tsx'), 'utf8'),
    ).toContain('minSize: 200');

    const second = run([...ARGS, '--apply']);
    expect(second.status, second.stderr).toBe(0);
    expect(second.envelope.data.complete).toBe(true);
    expect(second.envelope.data.filesChanged).toBe(0);
  });

  it('skips a vendored file that does not parse and completes the upgrade', () => {
    seed();
    write('.gitattributes', 'vendor/** linguist-vendored\n');
    const bundle =
      "/* minified */ import {useResizable} from '@astryxdesign/core';\n" +
      'export const x = useResizable({minSizePx: 200;\n';
    write('vendor/bundle.js', bundle);
    rmGenerated();

    const applied = run([...ARGS, '--apply']);

    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: true,
        modifiedFiles: ['src/owned.tsx'],
        protectedFiles: [],
        declinedCandidates: [
          {
            file: 'vendor/bundle.js',
            location: '2:46',
            reason:
              'unparseable protected file (vendored): Unexpected token, expected ","',
          },
        ],
      },
    });
    expect(applied.envelope.data.errors ?? []).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'src/owned.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
    expect(fs.readFileSync(path.join(root, 'vendor/bundle.js'), 'utf8')).toBe(
      bundle,
    );

    const text = spawnSync(process.execPath, [CLI, 'upgrade', ...ARGS], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: {...process.env, FORCE_COLOR: '0', CI: ''},
    });
    expect(text.status, text.stderr).toBe(0);
    expect(`${text.stdout}${text.stderr}`).toContain(
      '1 protected file was skipped because it does not parse',
    );
    const declinedLine = `${text.stdout}${text.stderr}`
      .split('\n')
      .find(line => line.includes('vendor/bundle.js:2:46'));
    expect(declinedLine).toMatch(/^ {2}vendor\/bundle\.js:2:46 - /);
    // cli-surface output is plain ASCII.
    expect(declinedLine).toMatch(/^[\x20-\x7e]*$/);
  });

  it('still fails when an owned file does not parse', () => {
    seed();
    write(
      'lib/broken.js',
      "import {useResizable} from '@astryxdesign/core';\n" +
        'export const x = useResizable({minSizePx: 200;\n',
    );
    rmGenerated();

    const applied = run([...ARGS, '--apply']);

    expect(applied.status).toBe(1);
    expect(applied.envelope).toMatchObject({code: 'ERR_CODEMOD_FAILED'});
  });

  it('reports a stylesheet the 0.6 and 0.7 theme codemods both need once, as protected', () => {
    write('package.json', JSON.stringify({name: 'consumer', private: true}));
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    write('.gitattributes', 'vendor/** linguist-vendored\n');
    write('vendor/bundle.css', 'a:: { color: red; }\n');

    const result = run(['--from', '0.5.4', '--path', '.']);
    const text = spawnSync(
      process.execPath,
      [CLI, 'upgrade', '--from', '0.5.4', '--path', '.'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000,
        env: {...process.env, FORCE_COLOR: '0', CI: ''},
      },
    );
    const output = `${text.stdout}${text.stderr}`;
    expect(text.status).toBe(1);
    expect(output).toContain('ERR_CODEMOD_PROTECTED');
    expect(output).toMatch(/^ {2}vendor\/bundle\.css — /m);
    expect(output).not.toContain('skipped because');
    expect(output).not.toContain('unparseable protected file');

    expect(result.status).toBe(1);
    expect(result.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTED',
        protectedFiles: [expect.objectContaining({file: 'vendor/bundle.css'})],
        declinedCandidates: [],
      },
    });
  });

  it('lists a generated file the hook regenerates into bytes that do not parse', () => {
    seed();
    const broken =
      "// @generated\nimport {useResizable} from '@astryxdesign/core';\n" +
      'export const usePanel = () => useResizable({minSizePx: 200;\n';
    write(
      'astryx.config.mjs',
      `export default {hooks: {postCodemod: [{name: 'regenerate', buildCommand: () => ({command: process.execPath, args: ['-e', ${JSON.stringify(`require('node:fs').writeFileSync('generated/panel.tsx', ${JSON.stringify(broken)})`)}]})}]}};\n`,
    );

    const applied = run([...ARGS, '--apply']);

    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.envelope).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: true,
        protectedFiles: [],
        declinedCandidates: [
          {
            file: 'generated/panel.tsx',
            location: expect.stringMatching(/^3:\d+$/),
            reason: expect.stringMatching(
              /^unparseable protected file \(generated\): /,
            ),
          },
        ],
      },
    });
    expect(
      fs.readFileSync(path.join(root, 'generated/panel.tsx'), 'utf8'),
    ).toBe(broken);
  });
});

function rmGenerated() {
  fs.rmSync(path.join(root, 'generated'), {recursive: true, force: true});
}
