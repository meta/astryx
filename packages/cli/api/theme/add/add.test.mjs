// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {themeAdd} from './add.mjs';
import {themeEject} from '../eject/eject.mjs';
import {
  THEME_MODULE_MARKER,
  parseThemeModuleRecord,
} from '../../../foundation/config/theme-state.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';

let tmpDir;

function installTheme(
  slug = 'ocean',
  packageName = '@acme/themes',
  options = {},
) {
  const packageDir = path.join(
    tmpDir,
    'node_modules',
    ...packageName.split('/'),
  );
  const sourceDir = path.join(packageDir, 'themes', slug);
  const exportName = `${slug}Theme`;
  fs.mkdirSync(sourceDir, {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      type: 'module',
      exports: {
        [`./themes/${slug}`]: `./dist/${slug}.js`,
        [`./themes/${slug}.css`]: `./dist/${slug}.css`,
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  fs.writeFileSync(
    path.join(sourceDir, `${exportName}.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: true};\n`,
  );
  fs.writeFileSync(
    path.join(sourceDir, `${exportName}.ts`),
    `export const ${exportName} = {};\n`,
  );
  if (!options.missingBuilt) {
    fs.writeFileSync(
      path.join(packageDir, `dist/${slug}.js`),
      `export const ${exportName} = {name: '${slug}', __built: true};\n`,
    );
    fs.writeFileSync(
      path.join(packageDir, `dist/${slug}.css`),
      `[data-astryx-theme="${slug}"] {}\n`,
    );
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
  );
  pkg.dependencies[packageName] = '^1.0.0';
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg)}\n`,
  );
}

function installBuiltThemePackage(slug) {
  const packageName = `@astryxdesign/theme-${slug}`;
  const packageDir = path.join(
    tmpDir,
    'node_modules',
    ...packageName.split('/'),
  );
  const exportName = `${slug}Theme`;
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      type: 'module',
      exports: {
        './built': './dist/built.js',
        './theme.css': './dist/theme.css',
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/built.js'),
    `export const ${exportName} = {name: '${slug}', __built: true};\n`,
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/theme.css'),
    `[data-astryx-theme="${slug}"] {}\n`,
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
  );
  pkg.dependencies[packageName] = '^1.0.0';
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg)}\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-theme-add-app-'));
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {}}),
  );
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('themeAdd', () => {
  it('records and imports a built package theme by default without copying source', async () => {
    installTheme();
    const packageBefore = fs.readFileSync(
      path.join(tmpDir, 'package.json'),
      'utf-8',
    );

    const result = await themeAdd('ocean', {
      cwd: tmpDir,
      package: '@acme/themes',
    });

    expect(result).toMatchObject({
      type: 'theme.app',
      data: {
        default: 'ocean',
        modulePath: 'src/astryx-themes.ts',
        change: {action: 'add', slug: 'ocean', changed: true},
        themes: [
          {
            slug: 'ocean',
            owner: '@acme/themes',
            module: '@acme/themes/themes/ocean',
            stylesheet: '@acme/themes/themes/ocean.css',
            source: 'package',
          },
        ],
      },
    });
    expect(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8')).toBe(
      packageBefore,
    );
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/ocean'))).toBe(false);
    const module = fs.readFileSync(
      path.join(tmpDir, 'src/astryx-themes.ts'),
      'utf-8',
    );
    expect(module).toContain(THEME_MODULE_MARKER);
    expect(module).toContain('from "@acme/themes/themes/ocean"');
    expect(module).toContain('import "@acme/themes/themes/ocean.css"');
    expect(parseThemeModuleRecord(module)).toEqual({
      themes: {ocean: '@acme/themes'},
      defaultSlug: 'ocean',
    });
  });

  it('accepts import as a no-op and preserves the same theme.app behavior', async () => {
    installTheme();

    const first = await themeAdd('ocean', {
      cwd: tmpDir,
      import: true,
      package: '@acme/themes',
    });
    expect(first.type).toBe('theme.app');
    expect(first.data.change).toMatchObject({action: 'add', changed: true});

    const moduleFile = path.join(tmpDir, 'src/astryx-themes.ts');
    fs.appendFileSync(moduleFile, '\n// hand edit\n');
    const repeated = await themeAdd('ocean', {
      cwd: tmpDir,
      package: '@acme/themes',
    });

    expect(repeated.type).toBe('theme.app');
    expect(repeated.data.change.changed).toBe(false);
    expect(fs.readFileSync(moduleFile, 'utf-8')).not.toContain('hand edit');
  });

  it.each([
    ['a target path', {targetPath: 'src/brand'}],
    ['overwrite true', {overwrite: true}],
  ])(
    'rejects removed copy option %s before writing',
    async (_label, copyOption) => {
      installTheme();

      await expect(
        themeAdd('ocean', {
          cwd: tmpDir,
          package: '@acme/themes',
          ...copyOption,
        }),
      ).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining('themeEject'),
      });
      expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tmpDir, 'src/brand'))).toBe(false);
    },
  );

  it('accepts overwrite false as a compatibility no-op', async () => {
    installTheme();

    const result = await themeAdd('ocean', {
      cwd: tmpDir,
      package: '@acme/themes',
      overwrite: false,
    });

    expect(result.type).toBe('theme.app');
    expect(result.data.change).toMatchObject({action: 'add', changed: true});
    expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/ocean'))).toBe(false);
  });

  it('accepts the import package it records as --package for a bundled theme', async () => {
    installBuiltThemePackage('neutral');
    const result = await themeAdd('neutral', {
      cwd: tmpDir,
      package: '@astryxdesign/theme-neutral',
    });
    expect(result.data.themes).toEqual([
      expect.objectContaining({
        slug: 'neutral',
        owner: '@astryxdesign/theme-neutral',
      }),
    ]);
  });

  it('names the install and then the add for a bundled theme whose package is missing', async () => {
    const app = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-theme-add-bare-'),
    );
    try {
      fs.mkdirSync(path.join(app, 'src'));
      fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}\n');
      await expect(themeAdd('butter', {cwd: app})).rejects.toMatchObject({
        message: expect.stringContaining(
          'The app imports butter from it, so install it, then add the theme',
        ),
        suggestions: [
          {name: expect.stringMatching(/@astryxdesign\/theme-butter$/)},
          {name: expect.stringMatching(/ theme add butter$/)},
        ],
      });
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('keeps the released CLI selector while recording the import package', async () => {
    installBuiltThemePackage('neutral');
    const result = await themeAdd('neutral', {
      cwd: tmpDir,
      package: '@astryxdesign/cli',
    });

    expect(result.data.themes).toEqual([
      expect.objectContaining({
        slug: 'neutral',
        owner: '@astryxdesign/theme-neutral',
        module: '@astryxdesign/theme-neutral/built',
        stylesheet: '@astryxdesign/theme-neutral/theme.css',
        source: 'bundled',
      }),
    ]);
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(tmpDir, 'src/astryx-themes.ts'), 'utf-8'),
      ),
    ).toEqual({
      themes: {neutral: '@astryxdesign/theme-neutral'},
      defaultSlug: 'neutral',
    });
  });

  it('fails before writing when the selected module path is authored', async () => {
    installTheme();
    const moduleFile = path.join(tmpDir, 'src/astryx-themes.ts');
    fs.writeFileSync(moduleFile, 'export const mine = true;\n');

    await expect(
      themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.readFileSync(moduleFile, 'utf-8')).toBe(
      'export const mine = true;\n',
    );
  });

  it('uses a JavaScript module at the project root when there is no src', async () => {
    fs.rmSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.rmSync(path.join(tmpDir, 'tsconfig.json'));
    installTheme();

    const result = await themeAdd('ocean', {
      cwd: tmpDir,
      package: '@acme/themes',
    });

    expect(result.data.modulePath).toBe('astryx-themes.js');
    expect(fs.existsSync(path.join(tmpDir, 'astryx-themes.js'))).toBe(true);
  });

  it('prefers a built local theme and switches the recorded owner', async () => {
    installTheme();
    await themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'});
    await themeEject('ocean', {cwd: tmpDir, package: '@acme/themes'});
    const localDir = path.join(tmpDir, 'src', 'themes', 'ocean');
    fs.writeFileSync(
      path.join(localDir, 'ocean.js'),
      'export const oceanTheme = {name: "local-ocean", __built: true};\n',
    );
    fs.writeFileSync(path.join(localDir, 'ocean.css'), '/* local css */\n');

    const result = await themeAdd('ocean', {cwd: tmpDir});

    expect(result).toMatchObject({
      type: 'theme.app',
      data: {
        change: {action: 'add', slug: 'ocean', changed: true},
        themes: [
          {
            slug: 'ocean',
            owner: './src/themes',
            module: './themes/ocean/ocean.js',
            stylesheet: './themes/ocean/ocean.css',
            source: 'local',
          },
        ],
      },
    });
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(tmpDir, 'src/astryx-themes.ts'), 'utf-8'),
      ),
    ).toEqual({
      themes: {ocean: './src/themes'},
      defaultSlug: 'ocean',
    });
  });

  it('ignores an unmigrated local copy without changing it', async () => {
    const copyDir = path.join(tmpDir, 'src', 'themes', 'ocean');
    fs.mkdirSync(copyDir, {recursive: true});
    const source = 'export const oceanTheme = {name: "copied"};\n';
    fs.writeFileSync(path.join(copyDir, 'oceanTheme.ts'), source);
    installTheme();

    const result = await themeAdd('ocean', {
      cwd: tmpDir,
      package: '@acme/themes',
    });

    expect(result.data.themes).toEqual([
      expect.objectContaining({slug: 'ocean', owner: '@acme/themes'}),
    ]);
    expect(fs.readFileSync(path.join(copyDir, 'oceanTheme.ts'), 'utf-8')).toBe(
      source,
    );
    expect(fs.existsSync(path.join(copyDir, 'oceanTheme.doc.mjs'))).toBe(false);
  });

  it('never falls back to package source when built exports are missing', async () => {
    installTheme('ocean', '@acme/themes', {missingBuilt: true});

    await expect(
      themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'}),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringMatching(
        /no resolvable built module and stylesheet/i,
      ),
    });
    expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(
      false,
    );
  });

  it('says which owner it chose when a local theme shadows a package theme', async () => {
    installTheme();
    await themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'});
    await themeEject('ocean', {cwd: tmpDir, package: '@acme/themes'});
    const localDir = path.join(tmpDir, 'src', 'themes', 'ocean');
    fs.writeFileSync(
      path.join(localDir, 'ocean.js'),
      'export const oceanTheme = {name: "ocean"};\n',
    );
    fs.writeFileSync(path.join(localDir, 'ocean.css'), '/* local css */\n');

    const result = await themeAdd('ocean', {cwd: tmpDir});

    expect(result.data.notes).toEqual([
      '"ocean" now comes from ./src/themes (local theme), replacing @acme/themes.',
      expect.stringMatching(
        /^Chose \.\/src\/themes \(local theme\) for "ocean"\. To use the one from @acme\/themes instead: `.* theme add ocean --package @acme\/themes`\.$/,
      ),
    ]);
  });

  it('keeps both changes when two adds run at once', async () => {
    installTheme('ocean', '@acme/ocean');
    installTheme('reef', '@acme/reef');

    await Promise.all([
      themeAdd('ocean', {cwd: tmpDir}),
      themeAdd('reef', {cwd: tmpDir}),
    ]);

    const record = parseThemeModuleRecord(
      fs.readFileSync(path.join(tmpDir, 'src/astryx-themes.ts'), 'utf-8'),
    );
    expect(Object.keys(record.themes).sort()).toEqual(['ocean', 'reef']);
  });

  it('reports a lock it cannot take as ERR_WRITE_FAILED and writes nothing', async () => {
    installTheme();
    const blocker = path.join(tmpDir, 'not-a-folder');
    fs.writeFileSync(blocker, '');
    const saved = {
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      HOME: process.env.HOME,
    };
    process.env.XDG_CACHE_HOME = blocker;
    process.env.HOME = blocker;
    try {
      await expect(themeAdd('ocean', {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_WRITE_FAILED',
        message: expect.stringMatching(/^Could not take the lock /),
      });
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(
      false,
    );
  });

  it('skips a broken local theme folder for every other theme, and names it when asked for', async () => {
    installTheme();
    const broken = path.join(tmpDir, 'src', 'themes', 'mine');
    fs.mkdirSync(broken, {recursive: true});
    fs.writeFileSync(
      path.join(broken, 'mineTheme.ts'),
      'export const mineTheme = {};\n',
    );
    fs.writeFileSync(
      path.join(broken, 'mineTheme.doc.mjs'),
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'other', displayName: 'x', description: 'x', maintained: false};\n",
    );

    await expect(themeAdd('ocean', {cwd: tmpDir})).resolves.toMatchObject({
      type: 'theme.app',
    });
    await expect(themeAdd('mine', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringMatching(
        /^Local theme "mine" in src\/themes\/mine is broken: /,
      ),
    });
  });

  it('names how to rebuild a module whose record header is damaged, theme by theme', async () => {
    installTheme();
    await themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'});
    const moduleFile = path.join(tmpDir, 'src/astryx-themes.ts');
    fs.writeFileSync(
      moduleFile,
      fs
        .readFileSync(moduleFile, 'utf-8')
        .split('\n')
        .filter(line => !line.includes('@astryx-theme-record'))
        .join('\n'),
    );
    await expect(themeAdd('ocean', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining(
        'Delete src/astryx-themes.ts, then add its themes again',
      ),
      suggestions: [{name: expect.stringMatching(/ theme add ocean$/)}],
    });
  });

  it('names theme use with an added theme when the record default is not added', async () => {
    installTheme();
    await themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'});
    const moduleFile = path.join(tmpDir, 'src/astryx-themes.ts');
    fs.writeFileSync(
      moduleFile,
      fs
        .readFileSync(moduleFile, 'utf-8')
        .replace('"defaultThemeSlug":"ocean"', '"defaultThemeSlug":"zzz"'),
    );
    await expect(themeAdd('ocean', {cwd: tmpDir})).rejects.toMatchObject({
      message: expect.stringContaining(' theme use ocean`'),
      suggestions: [{name: expect.stringMatching(/ theme use ocean$/)}],
    });
  });

  it('refuses a folder where the generated module goes, in plain words', async () => {
    installTheme();
    fs.mkdirSync(path.join(tmpDir, 'src/astryx-themes.ts'));
    await expect(
      themeAdd('ocean', {cwd: tmpDir, package: '@acme/themes'}),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message:
        'src/astryx-themes.ts is a folder, where the generated theme module goes. Move or delete that folder, then run the same command again.',
    });
  });
});
