// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  themeList,
  themeListAvailable,
  themeListCopySources,
} from './list.mjs';
import {renderThemeModule} from '../../../foundation/config/theme-state.mjs';

let tmpDir;

function installThemeIntegration(packageName = '@acme/themes', slug = 'ocean') {
  const packageDir = path.join(
    tmpDir,
    'node_modules',
    ...packageName.split('/'),
  );
  const themeDir = path.join(packageDir, 'themes', slug);
  const stem = `${slug.replace(/-([a-z0-9])/gu, (_, character) => character.toUpperCase())}Theme`;
  fs.mkdirSync(themeDir, {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: packageName, version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    `export default {themes: './themes'};
`,
  );
  fs.writeFileSync(
    path.join(themeDir, `${stem}.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {type: 'theme', name: '${slug}', displayName: 'Ocean', description: 'Blue and calm.', maintained: true};
`,
  );
  fs.writeFileSync(
    path.join(themeDir, `${stem}.ts`),
    `export const ${stem} = {};
`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-theme-list-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      dependencies: {'@acme/themes': '^1.0.0'},
    }),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('themeList (bundled compatibility API)', () => {
  it('stays synchronous and preserves the original entry shape', () => {
    const result = themeList();
    expect(result.type).toBe('theme.list');
    expect(result.data.length).toBeGreaterThan(0);
    expect(Object.keys(result.data[0]).sort()).toEqual([
      'description',
      'displayName',
      'maintained',
      'slug',
    ]);
  });
});

describe('themeListCopySources (theme add --list compatibility API)', () => {
  it('keeps the released fields and excludes local app themes', async () => {
    installThemeIntegration();
    const localDir = path.join(tmpDir, 'src', 'themes', 'local-only');
    fs.mkdirSync(localDir, {recursive: true});
    fs.writeFileSync(
      path.join(localDir, 'localOnlyTheme.doc.mjs'),
      "export default {type:'theme',name:'local-only',displayName:'Local only',description:'App theme.',maintained:false};\n",
    );
    fs.writeFileSync(
      path.join(localDir, 'localOnlyTheme.ts'),
      'export const localOnlyTheme = {};\n',
    );

    const result = await themeListCopySources({cwd: tmpDir});

    expect(result.type).toBe('theme.list');
    expect(result.data).toContainEqual({
      slug: 'ocean',
      displayName: 'Ocean',
      description: 'Blue and calm.',
      maintained: true,
      package: '@acme/themes',
    });
    expect(result.data.some(theme => theme.slug === 'local-only')).toBe(false);
    expect(Object.keys(result.data[0] ?? {}).sort()).toEqual([
      'description',
      'displayName',
      'maintained',
      'package',
      'slug',
    ]);
  });
});

describe('themeListAvailable (project-aware API)', () => {
  it('returns bundled themes with the released selector package', async () => {
    const result = await themeListAvailable({cwd: tmpDir});
    expect(result.type).toBe('theme.list');
    expect(result.data.length).toBeGreaterThan(0);
    expect(
      result.data.some(
        theme =>
          theme.source === 'bundled' && theme.package === '@astryxdesign/cli',
      ),
    ).toBe(true);
  });

  it('surfaces a maintained installed integration theme', async () => {
    installThemeIntegration();
    const result = await themeListAvailable({cwd: tmpDir});
    expect(result.data).toContainEqual({
      slug: 'ocean',
      displayName: 'Ocean',
      description: 'Blue and calm.',
      maintained: true,
      package: '@acme/themes',
      added: false,
      default: false,
      source: 'package',
    });
  });

  it('filters by exact owner package', async () => {
    installThemeIntegration();
    const result = await themeListAvailable({
      cwd: tmpDir,
      package: '@acme/themes',
    });
    expect(result.data).toEqual([
      {
        slug: 'ocean',
        displayName: 'Ocean',
        description: 'Blue and calm.',
        maintained: true,
        package: '@acme/themes',
        added: false,
        default: false,
        source: 'package',
      },
    ]);
  });

  it('shows same-slug local and package themes with independent app fields', async () => {
    installThemeIntegration('@acme/themes', 'sea-glass');
    const localDir = path.join(tmpDir, 'src', 'themes', 'sea-glass');
    fs.mkdirSync(localDir, {recursive: true});
    fs.writeFileSync(
      path.join(localDir, 'seaGlassTheme.doc.mjs'),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type:'theme',name:'sea-glass',displayName:'Local Sea Glass',description:'Local fork.',maintained:false};\n`,
    );
    fs.writeFileSync(
      path.join(localDir, 'seaGlassTheme.ts'),
      'export const seaGlassTheme = {};\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'astryx-themes.js'),
      renderThemeModule(
        [
          {
            slug: 'sea-glass',
            owner: '@acme/themes',
            exportName: 'seaGlassTheme',
            module: '@acme/themes/themes/sea-glass',
            stylesheet: '@acme/themes/themes/sea-glass.css',
            moduleFile: '',
            stylesheetFile: '',
            source: 'package',
          },
        ],
        'sea-glass',
        false,
      ),
    );

    const result = await themeListAvailable({cwd: tmpDir});
    const matches = result.data.filter(theme => theme.slug === 'sea-glass');

    expect(matches).toEqual([
      expect.objectContaining({
        package: './src/themes',
        source: 'local',
        added: false,
        default: false,
      }),
      expect.objectContaining({
        package: '@acme/themes',
        source: 'package',
        added: true,
        default: true,
      }),
    ]);
  });

  it('reports a released descriptor-less copy without listing it as a theme', async () => {
    const copyDir = path.join(tmpDir, 'src', 'themes', 'ocean');
    fs.mkdirSync(copyDir, {recursive: true});
    fs.writeFileSync(
      path.join(copyDir, 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );

    const result = await themeListAvailable({cwd: tmpDir});

    expect(
      result.data.some(
        theme => theme.slug === 'ocean' && theme.source === 'local',
      ),
    ).toBe(false);
    expect(result.meta?.unmigratedCopies).toEqual([
      {
        slug: 'ocean',
        path: 'src/themes/ocean',
        source: 'src/themes/ocean/oceanTheme.ts',
        descriptor: 'src/themes/ocean/oceanTheme.doc.mjs',
        upgradeCommand: expect.stringContaining(
          'upgrade --from 0.6.4 --path . --apply',
        ),
      },
    ]);
  });

  it('always discovers local themes under src/themes, not a root themes folder', async () => {
    const rootTheme = path.join(tmpDir, 'themes', 'ocean');
    fs.mkdirSync(rootTheme, {recursive: true});
    fs.writeFileSync(
      path.join(rootTheme, 'oceanTheme.doc.mjs'),
      "export default {type:'theme',name:'ocean',displayName:'Wrong root',description:'',maintained:false};\n",
    );
    fs.writeFileSync(
      path.join(rootTheme, 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );

    const result = await themeListAvailable({cwd: tmpDir});

    expect(
      result.data.some(
        theme => theme.slug === 'ocean' && theme.source === 'local',
      ),
    ).toBe(false);
  });

  it('projects only public list fields', async () => {
    const [first] = (await themeListAvailable({cwd: tmpDir})).data;
    expect(Object.keys(first ?? {}).sort()).toEqual([
      'added',
      'default',
      'description',
      'displayName',
      'maintained',
      'package',
      'slug',
      'source',
    ]);
  });
});
