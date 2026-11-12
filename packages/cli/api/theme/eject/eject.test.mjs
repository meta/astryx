// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Direct-API tests for the `theme eject` leaf. Copies real bundled themes
 * into a tmp cwd and asserts the receipt + on-disk effects, plus the guard rails
 * (unknown slug, no-overwrite, path traversal). Uses the maintained `neutral`
 * theme so the fixture stays stable.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {themeEject} from './eject.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-themeeject-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('themeEject (api/theme/eject)', () => {
  it('keeps the released CLI package selector while ejecting bundled source', async () => {
    const result = await themeEject('neutral', {
      cwd: tmpDir,
      package: '@astryxdesign/cli',
    });
    expect(result.type).toBe('theme.eject');
    expect(result.data.slug).toBe('neutral');
    expect(result.data.package).toBe('@astryxdesign/cli');
    expect(result.data.outputDir).toBe(path.join('src', 'themes', 'neutral'));
    // The complete local theme shape includes its same-stem descriptor.
    expect(result.data.files).toEqual([
      'neutralTheme.ts',
      'neutralTheme.doc.mjs',
      'icons.tsx',
      'neutralPalettes.ts',
      'neutralPalettes.generated.ts',
      'neutralPaletteRefs.generated.ts',
      'neutralPalettes.generated.receipt.json',
      'palette.config.json',
    ]);
    expect(
      fs.readdirSync(path.join(tmpDir, 'src', 'themes', 'neutral')).sort(),
    ).toEqual([...result.data.files].sort());
    for (const f of result.data.files) {
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'themes', 'neutral', f)),
      ).toBe(true);
    }
    expect(
      fs.readFileSync(
        path.join(
          tmpDir,
          result.data.outputDir,
          'neutralTheme.doc.mjs',
        ),
        'utf-8',
      ),
    ).toContain('maintained: false');
  });

  it('copies every relative import required by the scaffolded theme', async () => {
    const result = await themeEject('neutral', {cwd: tmpDir});
    const outputDir = path.join(tmpDir, result.data.outputDir);
    const relativeImports = /from\s+['"](\.\.?\/[^'"]+)['"]/g;

    for (const file of result.data.files) {
      if (!/\.(?:ts|tsx|mjs)$/.test(file)) continue;
      const source = fs.readFileSync(path.join(outputDir, file), 'utf-8');
      for (const [, specifier] of source.matchAll(relativeImports)) {
        const imported = path.resolve(outputDir, path.dirname(file), specifier);
        expect(
          fs.existsSync(imported) ||
            fs.existsSync(`${imported}.ts`) ||
            fs.existsSync(`${imported}.tsx`) ||
            fs.existsSync(`${imported}.mjs`),
        ).toBe(true);
      }
    }
  });

  it('strips the Meta copyright header from copied files', async () => {
    const result = await themeEject('neutral', {cwd: tmpDir});
    const first = path.join(
      tmpDir,
      result.data.outputDir,
      result.data.files[0],
    );
    expect(fs.readFileSync(first, 'utf-8')).not.toMatch(
      /Copyright \(c\) Meta Platforms/,
    );
  });

  it('resolves the slug case-insensitively', async () => {
    const result = await themeEject('Neutral', {cwd: tmpDir});
    expect(result.data.slug).toBe('neutral');
  });

  it('honors an explicit target path (within cwd)', async () => {
    const result = await themeEject('neutral', {
      cwd: tmpDir,
      targetPath: 'themes/mine',
    });
    expect(result.data.outputDir).toBe(path.join('themes', 'mine'));
    expect(
      fs.existsSync(path.join(tmpDir, 'themes', 'mine', result.data.files[0])),
    ).toBe(true);
  });

  it('throws ERR_UNKNOWN_THEME for an unknown slug (with suggestions)', async () => {
    await expect(
      themeEject('does-not-exist', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_UNKNOWN_THEME'});
  });

  it('refuses to overwrite existing files without overwrite', async () => {
    await themeEject('neutral', {cwd: tmpDir});
    await expect(themeEject('neutral', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
    });
  });

  it('replaces files when overwrite is set', async () => {
    await themeEject('neutral', {cwd: tmpDir});
    const result = await themeEject('neutral', {cwd: tmpDir, overwrite: true});
    expect(result.type).toBe('theme.eject');
  });

  it('rejects a target path that escapes cwd', async () => {
    await expect(
      themeEject('neutral', {cwd: tmpDir, targetPath: '../escape'}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  });

  it('surfaces ERR_WRITE_FAILED (not a raw errno) when the target path is an existing file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'blocker'), 'x');
    await expect(
      themeEject('neutral', {cwd: tmpDir, targetPath: 'blocker'}),
    ).rejects.toMatchObject({code: 'ERR_WRITE_FAILED'});
  });

  it('surfaces ERR_WRITE_FAILED when an ancestor of the default dir is a file', async () => {
    // A file named `src` blocks mkdir of src/themes/neutral (ENOTDIR).
    fs.writeFileSync(path.join(tmpDir, 'src'), 'x');
    await expect(themeEject('neutral', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
    });
  });

  it('ejects into an existing empty target directory', async () => {
    fs.mkdirSync(path.join(tmpDir, 'mydir'));
    const r = await themeEject('neutral', {cwd: tmpDir, targetPath: 'mydir'});
    expect(r.data.outputDir).toBe('mydir');
  });

  it('refuses a folder the theme editor made, even with overwrite', async () => {
    const dir = path.join(tmpDir, 'themes', 't');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 't.settings.json'), '{}\n');
    fs.writeFileSync(path.join(dir, 'palette.config.json'), '{"mine":true}\n');

    await expect(
      themeEject('neutral', {
        cwd: tmpDir,
        targetPath: 'themes/t',
        overwrite: true,
      }),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(
      fs.readFileSync(path.join(dir, 'palette.config.json'), 'utf-8'),
    ).toBe('{"mine":true}\n');
  });

  it('refuses to mix two forks in one folder, even with overwrite', async () => {
    await themeEject('neutral', {cwd: tmpDir});
    const dir = path.join(tmpDir, 'src', 'themes', 'neutral');
    const icons = fs.readFileSync(path.join(dir, 'icons.tsx'), 'utf-8');

    await expect(
      themeEject('butter', {
        cwd: tmpDir,
        targetPath: 'src/themes/neutral',
        overwrite: true,
      }),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.readFileSync(path.join(dir, 'icons.tsx'), 'utf-8')).toBe(icons);
    expect(fs.existsSync(path.join(dir, 'butterTheme.ts'))).toBe(false);
  });

  it('still re-forks the same theme with overwrite', async () => {
    await themeEject('neutral', {cwd: tmpDir});
    const result = await themeEject('neutral', {cwd: tmpDir, overwrite: true});
    expect(result.data.slug).toBe('neutral');
  });

  it('names the packages the fork imports that the app lacks, with an install command', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
    );
    const result = await themeEject('neutral', {cwd: tmpDir});
    expect(result.data.missingPackages).toEqual(['lucide-react']);
    expect(result.data.installCommand).toMatch(/^npm install lucide-react/);

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'lucide-react': '*'}}),
    );
    const again = await themeEject('neutral', {cwd: tmpDir, overwrite: true});
    expect(again.data.missingPackages).toEqual([]);
    expect(again.data.installCommand).toBeNull();
  });

  it('reports a file in the way of the fork folder with a registered code', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}\n');
    await expect(
      themeEject('neutral', {cwd: tmpDir, targetPath: 'package.json'}),
    ).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
      message: expect.not.stringMatching(/EEXIST|ENOTDIR/),
    });
  });

  it('forks into the project root from a subfolder, and reports the path from the working folder', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});

    const result = await themeEject('neutral', {cwd: sub});

    expect(result.data.outputDir).toBe(path.join('..', 'themes', 'neutral'));
    expect(
      fs.existsSync(path.join(tmpDir, 'src/themes/neutral/neutralTheme.ts')),
    ).toBe(true);
    expect(fs.existsSync(path.join(sub, 'src'))).toBe(false);
  });

  it('reads a relative path from the working folder and keeps it inside the project', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});

    const result = await themeEject('neutral', {
      cwd: sub,
      targetPath: '../../custom/n',
    });
    expect(result.data.outputDir).toBe(path.join('..', '..', 'custom', 'n'));
    expect(fs.existsSync(path.join(tmpDir, 'custom/n/neutralTheme.ts'))).toBe(
      true,
    );

    await expect(
      themeEject('neutral', {cwd: sub, targetPath: '../../../outside'}),
    ).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
      message: expect.stringContaining('"../../../outside"'),
    });
  });

  it('names another target, not the same command, when the default folder from a subfolder is taken', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    await themeEject('neutral', {cwd: tmpDir});

    let error;
    try {
      await themeEject('butter', {
        cwd: sub,
        targetPath: '../themes/neutral',
        overwrite: true,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(error.suggestions?.[0]?.name).toMatch(/ theme eject butter$/);

    const dir = path.join(tmpDir, 'src', 'themes', 'butter');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'butter.settings.json'), '{}\n');
    let atDefault;
    try {
      await themeEject('butter', {cwd: sub, overwrite: true});
    } catch (caught) {
      atDefault = caught;
    }
    expect(atDefault).toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(atDefault.suggestions).toBeUndefined();
  });
});
