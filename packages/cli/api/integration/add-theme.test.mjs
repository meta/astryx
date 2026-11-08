// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT, findInstalledPackage} from '../../foundation/fs/paths.mjs';
import {integrationAddTheme} from './add-theme.mjs';
import {validateLocalIntegration} from './validate-integration.mjs';

let tmpDir;

function setup({
  manifest = 'export default {};\n',
  files = ['dist'],
  includeFiles = true,
} = {}) {
  /** @type {{name: string, version: string, files?: string[]}} */
  const pkg = {name: '@acme/themes', version: '1.0.0'};
  if (includeFiles) pkg.files = files;
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(tmpDir, 'astryx.integration.mjs'), manifest);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-add-theme-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integrationAddTheme', () => {
  it('writes a typed same-stem descriptor and source with no central catalog', async () => {
    setup();
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});

    expect(result).toEqual({
      type: 'integration.add',
      data: {
        kind: 'theme',
        name: 'ocean',
        root: {path: './themes', created: true},
        manifest: 'astryx.integration.mjs',
        files: [
          'themes/ocean/oceanTheme.ts',
          'themes/ocean/oceanTheme.doc.mjs',
          'package.json',
          'astryx.integration.mjs',
        ],
        written: true,
        dryRun: false,
      },
    });
    expect(
      fs.readFileSync(path.join(tmpDir, 'themes/ocean/oceanTheme.ts'), 'utf-8'),
    ).toContain('export const oceanTheme = defineTheme');

    const descriptor = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.doc.mjs'),
      'utf-8',
    );
    expect(descriptor).toContain("@astryxdesign/cli/authoring').ThemeDoc");
    expect(descriptor).toContain("type: 'theme'");
    expect(descriptor).toContain("name: 'ocean'");
    expect(fs.existsSync(path.join(tmpDir, 'themes/manifest.json'))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toContain("themes: './themes'");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toEqual(['dist', 'themes', 'astryx.integration.mjs']);
    expect(pkg.exports).toMatchObject({
      './themes/ocean': './themes/ocean/ocean.js',
      './themes/ocean.css': './themes/ocean/ocean.css',
    });
    expect((await validateLocalIntegration(tmpDir)).issues).toEqual([]);
  });

  it('declares the optional CLI peer that reads typed theme descriptors', async () => {
    setup({includeFiles: false});
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});
    expect(result.data.files).toContain('package.json');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.peerDependencies).toEqual({'@astryxdesign/cli': '>=0.6.4'});
    expect(pkg.peerDependenciesMeta).toEqual({
      '@astryxdesign/cli': {optional: true},
    });
  });

  it('keeps a CLI peer that already reads typed theme descriptors', async () => {
    const pkg = {
      name: '@acme/themes',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '^0.7.2'},
    };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      `${JSON.stringify(pkg, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});
    expect(result.data.files).toContain('package.json');
    expect(
      JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8')),
    ).toMatchObject({
      ...pkg,
      exports: {
        './themes/ocean': './themes/ocean/ocean.js',
        './themes/ocean.css': './themes/ocean/ocean.css',
      },
    });
  });

  it('dry-runs the identical receipt without writing anything', async () => {
    setup();
    const beforeManifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    const result = await integrationAddTheme('ocean', {
      cwd: tmpDir,
      dryRun: true,
    });

    expect(result.data.written).toBe(false);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.root).toEqual({path: './themes', created: true});
    expect(result.data.files).toContain('themes/ocean/oceanTheme.ts');
    expect(result.data.files).toContain('themes/ocean/oceanTheme.doc.mjs');
    expect(fs.existsSync(path.join(tmpDir, 'themes'))).toBe(false);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(beforeManifest);
  });

  it('creates theme exports even when the package has no files allowlist', async () => {
    setup({includeFiles: false});
    await integrationAddTheme('ocean', {cwd: tmpDir});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg).not.toHaveProperty('files');
    expect(pkg.exports).toEqual({
      './themes/ocean': './themes/ocean/ocean.js',
      './themes/ocean.css': './themes/ocean/ocean.css',
    });
  });

  it('uses an author-declared custom root without rewriting it', async () => {
    setup({
      manifest: `export default {themes: './src/themes'};\n`,
      files: undefined,
    });
    fs.mkdirSync(path.join(tmpDir, 'src/themes'), {recursive: true});
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});

    expect(result.data.root).toEqual({path: './src/themes', created: false});
    expect(result.data.files).not.toContain('astryx.integration.mjs');
    expect(
      fs.existsSync(path.join(tmpDir, 'src/themes/ocean/oceanTheme.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, 'src/themes/ocean/oceanTheme.doc.mjs')),
    ).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'))
        .exports,
    ).toEqual({
      './themes/ocean': './src/themes/ocean/ocean.js',
      './themes/ocean.css': './src/themes/ocean/ocean.css',
    });
  });

  it('keeps generated theme CSS side-effectful', async () => {
    setup();
    const packageFile = path.join(tmpDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
    pkg.sideEffects = false;
    fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    await integrationAddTheme('ocean', {cwd: tmpDir});

    expect(
      JSON.parse(fs.readFileSync(packageFile, 'utf-8')).sideEffects,
    ).toEqual(['**/*.css']);
  });

  it('adds one export pair per theme without touching the manifest again', async () => {
    setup({manifest: "export default {themes: './themes'};\n"});
    await integrationAddTheme('ocean', {cwd: tmpDir});
    const manifestBefore = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );

    const result = await integrationAddTheme('reef', {cwd: tmpDir});

    expect(result.data.files).toEqual([
      'themes/reef/reefTheme.ts',
      'themes/reef/reefTheme.doc.mjs',
      'package.json',
    ]);
    expect(fs.readdirSync(path.join(tmpDir, 'themes')).sort()).toEqual([
      'ocean',
      'reef',
    ]);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(manifestBefore);
    expect(
      JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'))
        .exports,
    ).toEqual({
      './themes/ocean': './themes/ocean/ocean.js',
      './themes/ocean.css': './themes/ocean/ocean.css',
      './themes/reef': './themes/reef/reef.js',
      './themes/reef.css': './themes/reef/reef.css',
    });
  });

  it('refuses an obsolete central catalog without changing its bytes', async () => {
    setup();
    fs.mkdirSync(path.join(tmpDir, 'themes'));
    const catalog = path.join(tmpDir, 'themes', 'manifest.json');
    fs.writeFileSync(catalog, '{"version":1}\n');

    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.readFileSync(catalog, 'utf-8')).toBe('{"version":1}\n');
    expect(fs.existsSync(path.join(tmpDir, 'themes', 'ocean'))).toBe(false);
  });

  it('refuses an invalid existing descriptor without changing it', async () => {
    setup();
    const existing = path.join(tmpDir, 'themes', 'forest');
    fs.mkdirSync(existing, {recursive: true});
    const descriptor = path.join(existing, 'forestTheme.doc.mjs');
    fs.writeFileSync(descriptor, 'export default {type: "theme"};\n');
    fs.writeFileSync(
      path.join(existing, 'forestTheme.ts'),
      'export const forestTheme = {};\n',
    );

    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.readFileSync(descriptor, 'utf-8')).toBe(
      'export default {type: "theme"};\n',
    );
    expect(fs.existsSync(path.join(tmpDir, 'themes', 'ocean'))).toBe(false);
  });

  it('refuses a duplicate valid theme directory', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir});
    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
  });

  it('refuses an existing invalid theme directory', async () => {
    setup();
    fs.mkdirSync(path.join(tmpDir, 'themes', 'ocean'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'themes', 'ocean', 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );
    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
  });

  it.each([
    ['an empty folder', []],
    ['a folder holding .gitkeep', ['.gitkeep']],
    ['a folder holding NOTES.md', ['NOTES.md']],
  ])('fills %s', async (_, files) => {
    setup();
    const dir = path.join(tmpDir, 'themes', 'ocean');
    fs.mkdirSync(dir, {recursive: true});
    for (const file of files) fs.writeFileSync(path.join(dir, file), 'x\n');
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});
    expect(result.data.written).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual(
      [...files, 'oceanTheme.doc.mjs', 'oceanTheme.ts'].sort(),
    );
  });

  it('refuses to overwrite a file it would write', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir});
    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir}),
    ).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
      message:
        'Refusing to overwrite existing file themes/ocean/oceanTheme.ts.',
    });
  });

  it.each(['../ocean', 'Ocean', 'ocean theme', '.ocean'])(
    'refuses unsafe or noncanonical name %s',
    async name => {
      setup();
      await expect(
        integrationAddTheme(name, {cwd: tmpDir}),
      ).rejects.toMatchObject({
        code: 'ERR_INVALID_ARGUMENT',
      });
    },
  );

  it('creates the integration manifest on the first add', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'plain', files: []}),
    );
    const result = await integrationAddTheme('ocean', {cwd: tmpDir});

    expect(result.data.manifest).toBe('astryx.integration.mjs');
    expect(
      result.data.files.filter(file => file === result.data.manifest),
    ).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toContain("themes: './themes'");
    expect(
      JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'))
        .files,
    ).toEqual(['themes', 'astryx.integration.mjs']);
  });

  it('plans manifest creation without writing it under dry-run', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"plain"}\n');
    const result = await integrationAddTheme('ocean', {
      cwd: tmpDir,
      dryRun: true,
    });
    expect(result.data.files).toContain('astryx.integration.mjs');
    expect(fs.existsSync(path.join(tmpDir, 'astryx.integration.mjs'))).toBe(
      false,
    );
  });
});

describe('integrationAddTheme --from', () => {
  it('forks a bundled theme into the integration package', async () => {
    setup();
    const result = await integrationAddTheme('ocean', {
      cwd: tmpDir,
      from: 'neutral',
    });

    expect(result.type).toBe('integration.add');
    expect(result.data.kind).toBe('theme');
    expect(result.data.name).toBe('ocean');
    expect(result.data.from).toBe('neutral');
    expect(result.data.written).toBe(true);
    expect(result.data.dryRun).toBe(false);
    expect(result.data.root).toEqual({path: './themes', created: true});

    // The entry file must exist with the new export name.
    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.ts'),
      'utf-8',
    );
    expect(entry).toContain('oceanTheme');
    expect(entry).toContain("name: 'ocean'");
    // It must NOT contain the original theme identifier as a prefix.
    expect(entry).not.toMatch(/\bneutralTheme\b/);
    expect(entry).not.toMatch(/\bneutralPalettes\b/);
    expect(entry).not.toMatch(/\bneutralSyntax\b/);
    expect(entry).toContain('defineTheme');

    // A fresh descriptor, not copied from the base.
    const descriptor = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.doc.mjs'),
      'utf-8',
    );
    expect(descriptor).toContain("name: 'ocean'");
    expect(descriptor).toContain("@astryxdesign/cli/authoring').ThemeDoc");
    expect(descriptor).toContain('maintained: true');
    expect(result.data.files).toContain('package.json');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.exports).toMatchObject({
      './themes/ocean': './themes/ocean/ocean.js',
      './themes/ocean.css': './themes/ocean/ocean.css',
    });

    // The theme must validate.
    expect((await validateLocalIntegration(tmpDir)).issues).toEqual([]);
  });

  it('renames palette and support files from the base theme', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});

    const themeDir = path.join(tmpDir, 'themes/ocean');
    const files = fs.readdirSync(themeDir).sort();
    // neutralPalettes.ts → oceanPalettes.ts, etc.
    expect(files).toContain('oceanTheme.ts');
    expect(files).toContain('oceanTheme.doc.mjs');
    expect(files).toContain('oceanPalettes.ts');
    expect(files).toContain('oceanPaletteRefs.generated.ts');
    expect(files).toContain('icons.tsx');
    // Must not contain any file starting with 'neutral'.
    expect(files.filter(f => f.startsWith('neutral'))).toEqual([]);
  });

  it('rewrites import paths inside forked files', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});

    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.ts'),
      'utf-8',
    );
    // Import references must use the new identifier.
    expect(entry).toContain('./oceanPaletteRefs.generated');
    expect(entry).not.toContain('./neutralPaletteRefs.generated');
    // The icon registry import must also be renamed.
    expect(entry).toContain('oceanIconRegistry');
    expect(entry).not.toContain('neutralIconRegistry');
  });

  it('rewrites CSS custom properties scoped to the base theme', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});

    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.ts'),
      'utf-8',
    );
    expect(entry).toContain('--astryx-theme-ocean-');
    expect(entry).not.toContain('--astryx-theme-neutral-');
  });

  it('rewrites the syntax theme name', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});

    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.ts'),
      'utf-8',
    );
    expect(entry).toContain("'astryx-ocean'");
    expect(entry).not.toContain("'astryx-neutral'");
  });

  it('strips the copyright header from forked files', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});

    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/ocean/oceanTheme.ts'),
      'utf-8',
    );
    expect(entry).not.toContain('Copyright (c) Meta Platforms');
  });

  it('includes data.from in the receipt only when --from is used', async () => {
    setup();
    const blank = await integrationAddTheme('plain', {cwd: tmpDir});
    expect(blank.data).not.toHaveProperty('from');

    const forked = await integrationAddTheme('ocean', {
      cwd: tmpDir,
      from: 'neutral',
    });
    expect(forked.data.from).toBe('neutral');
  });

  it('refuses to fork a theme into itself', async () => {
    setup();
    await expect(
      integrationAddTheme('neutral', {cwd: tmpDir, from: 'neutral'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('refuses an unknown base theme with a helpful suggestion list', async () => {
    setup();
    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir, from: 'nonexistent'}),
    ).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_THEME',
      message: expect.stringContaining('nonexistent'),
    });
  });

  it('dry-runs with --from without writing anything', async () => {
    setup();
    const result = await integrationAddTheme('ocean', {
      cwd: tmpDir,
      from: 'neutral',
      dryRun: true,
    });

    expect(result.data.written).toBe(false);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.from).toBe('neutral');
    expect(result.data.files).toContain('themes/ocean/oceanTheme.ts');
    expect(result.data.files).toContain('themes/ocean/oceanTheme.doc.mjs');
    expect(fs.existsSync(path.join(tmpDir, 'themes'))).toBe(false);
  });

  it('refuses to overwrite when the target already exists', async () => {
    setup();
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});
    await expect(
      integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
  });

  it('declares the npm packages the forked files import, at the range the bundled themes use', async () => {
    setup({includeFiles: false});
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    const cli = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
    );
    // The copied icons.tsx imports lucide-react; Core and React are every
    // app's own, so the fork does not declare them.
    expect(pkg.dependencies).toEqual({
      'lucide-react': cli.devDependencies['lucide-react'],
    });
    expect(pkg.peerDependencies).toEqual({'@astryxdesign/cli': '>=0.6.4'});
  });

  it('keeps a dependency the package already declares', async () => {
    setup({includeFiles: false});
    const file = path.join(tmpDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    fs.writeFileSync(
      file,
      `${JSON.stringify({...pkg, dependencies: {'lucide-react': '^1.0.0'}}, null, 2)}\n`,
    );
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).dependencies).toEqual({
      'lucide-react': '^1.0.0',
    });
  });

  it('declares nothing for a fork of a theme the package owns', async () => {
    setup({includeFiles: false});
    await integrationAddTheme('base', {cwd: tmpDir});
    await integrationAddTheme('variant', {cwd: tmpDir, from: 'base'});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies).toBeUndefined();
  });

  it('builds a forked neutral theme once the package installs what --from declared', async () => {
    setup({includeFiles: false});
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    // Install exactly what the package declares, plus what every Astryx
    // project has: Core and React.
    for (const name of [
      ...Object.keys(pkg.dependencies ?? {}),
      '@astryxdesign/core',
      'react',
    ]) {
      const installed = findInstalledPackage(CLI_ROOT, name);
      expect(installed, name).not.toBeNull();
      const link = path.join(tmpDir, 'node_modules', ...name.split('/'));
      fs.mkdirSync(path.dirname(link), {recursive: true});
      fs.symlinkSync(
        fs.realpathSync(/** @type {string} */ (installed)),
        link,
        'dir',
      );
    }
    // A separate process without NODE_PATH, so only what the package
    // installed can resolve.
    let status = 0;
    let output = '';
    try {
      execFileSync(
        process.execPath,
        [
          path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs'),
          'theme',
          'build',
          'themes/ocean/oceanTheme.ts',
        ],
        {
          cwd: tmpDir,
          env: {...process.env, NODE_PATH: ''},
          encoding: 'utf-8',
          stdio: 'pipe',
        },
      );
    } catch (error) {
      const failure = /** @type {any} */ (error);
      status = failure.status ?? 1;
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    }
    expect({status, output: status === 0 ? '' : output}).toEqual({
      status: 0,
      output: '',
    });
    expect(fs.existsSync(path.join(tmpDir, 'themes/ocean/ocean.css'))).toBe(
      true,
    );
  });

  it('works with different bundled themes', async () => {
    setup();
    const result = await integrationAddTheme('dusk', {
      cwd: tmpDir,
      from: 'gothic',
    });

    expect(result.data.from).toBe('gothic');
    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/dusk/duskTheme.ts'),
      'utf-8',
    );
    expect(entry).toContain('duskTheme');
    expect(entry).toContain("name: 'dusk'");
    expect(entry).not.toMatch(/\bgothicTheme\b/);
    expect((await validateLocalIntegration(tmpDir)).issues).toEqual([]);
  });

  it('forks from a theme the package already owns', async () => {
    setup();
    // First, add a blank theme.
    await integrationAddTheme('base', {cwd: tmpDir});
    // Then fork it.
    const result = await integrationAddTheme('variant', {
      cwd: tmpDir,
      from: 'base',
    });

    expect(result.data.from).toBe('base');
    const entry = fs.readFileSync(
      path.join(tmpDir, 'themes/variant/variantTheme.ts'),
      'utf-8',
    );
    expect(entry).toContain('variantTheme');
    expect(entry).toContain("name: 'variant'");
    expect((await validateLocalIntegration(tmpDir)).issues).toEqual([]);
  });

  it('declares the optional CLI peer that reads typed theme descriptors', async () => {
    setup({includeFiles: false});
    await integrationAddTheme('ocean', {cwd: tmpDir, from: 'neutral'});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.peerDependencies).toEqual({'@astryxdesign/cli': '>=0.6.4'});
    expect(pkg.peerDependenciesMeta).toEqual({
      '@astryxdesign/cli': {optional: true},
    });
  });
});
