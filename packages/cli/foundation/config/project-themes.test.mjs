// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {Project} from './project.mjs';
import {BUNDLED_THEME_PACKAGE} from '../discovery/theme-discovery.mjs';

let tmpDir;

function installThemeIntegration(packageName, slug) {
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
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-project-themes-'));
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

describe('Project themes', () => {
  it('combines bundled and autolinked integration themes with owners', async () => {
    installThemeIntegration('@acme/themes', 'ocean');
    const project = await Project.load(tmpDir);
    const themes = await project.themes();

    expect(themes.some(theme => theme.package === BUNDLED_THEME_PACKAGE)).toBe(
      true,
    );
    expect(themes).toContainEqual(
      expect.objectContaining({
        slug: 'ocean',
        package: '@acme/themes',
        sourceDir: path.join(
          tmpDir,
          'node_modules',
          '@acme',
          'themes',
          'themes',
          'ocean',
        ),
      }),
    );
  });

  it('keeps duplicate slugs from different owners for scoped resolution', async () => {
    installThemeIntegration('@acme/themes', 'neutral');
    const project = await Project.load(tmpDir);
    const matches = (await project.themes()).filter(
      theme => theme.slug === 'neutral',
    );
    expect(matches.map(theme => theme.package)).toEqual([
      BUNDLED_THEME_PACKAGE,
      '@acme/themes',
    ]);
  });

  it('records an invalid integration theme descriptor as an issue', async () => {
    installThemeIntegration('@acme/themes', 'ocean');
    fs.rmSync(
      path.join(
        tmpDir,
        'node_modules',
        '@acme',
        'themes',
        'themes',
        'ocean',
        'oceanTheme.ts',
      ),
    );
    const project = await Project.load(tmpDir);
    const themes = await project.themes();

    expect(themes.some(theme => theme.package === '@acme/themes')).toBe(false);
    expect(await project.issues()).toContainEqual(
      expect.objectContaining({
        package: '@acme/themes',
        code: 'invalid_theme',
        severity: 'error',
      }),
    );
  });
});
