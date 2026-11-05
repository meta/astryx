// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drift guard for the bundled CLI themes.
 *
 * `scripts/generate-cli-themes.mjs` copies each public theme's source,
 * strongly typed same-stem descriptor, and supported authoring artifacts into
 * the CLI bundle. This test pins every copied byte and rejects the obsolete
 * central catalog. When a theme changes, run `pnpm bundle:cli-themes` and commit
 * the regenerated bundle.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {discoverBundledThemes} from '../packages/cli/foundation/discovery/theme-discovery.mjs';
import {listThemeSlugs} from './generate-cli-themes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const THEMES_SRC_ROOT = path.join(REPO_ROOT, 'packages', 'themes');
const CLI_THEMES_OUT = path.join(
  REPO_ROOT,
  'packages',
  'cli',
  'assets',
  'templates',
  'themes',
);

const toIdentifier = slug =>
  slug.replace(/-([a-z])/g, (_, character) => character.toUpperCase());

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf-8'));

/** @param {string} directory @param {string} [prefix] */
function filesUnder(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(full, relative));
    else if (entry.isFile()) files.push(relative.split(path.sep).join('/'));
  }
  return files.sort();
}

/** Public theme packages: a source theme in a package that is not private. */
function themeSlugs() {
  if (!fs.existsSync(THEMES_SRC_ROOT)) return [];
  return fs
    .readdirSync(THEMES_SRC_ROOT, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(slug => {
      const stem = `${toIdentifier(slug)}Theme`;
      const source = path.join(THEMES_SRC_ROOT, slug, 'src', `${stem}.ts`);
      if (!fs.existsSync(source)) return false;
      const pkg = path.join(THEMES_SRC_ROOT, slug, 'package.json');
      return !fs.existsSync(pkg) || readJSON(pkg).private !== true;
    })
    .sort();
}

/** @param {string} slug */
function expectedFiles(slug) {
  const id = toIdentifier(slug);
  const sourceDir = path.join(THEMES_SRC_ROOT, slug, 'src');
  const candidates = [
    {source: path.join(sourceDir, `${id}Theme.ts`), output: `${id}Theme.ts`},
    {
      source: path.join(sourceDir, `${id}Theme.doc.mjs`),
      output: `${id}Theme.doc.mjs`,
    },
    {source: path.join(sourceDir, 'icons.tsx'), output: 'icons.tsx'},
    {
      source: path.join(sourceDir, `${id}Palettes.ts`),
      output: `${id}Palettes.ts`,
    },
    {
      source: path.join(sourceDir, `${id}Palettes.generated.ts`),
      output: `${id}Palettes.generated.ts`,
    },
    {
      source: path.join(sourceDir, `${id}PaletteRefs.generated.ts`),
      output: `${id}PaletteRefs.generated.ts`,
    },
    {
      source: path.join(sourceDir, `${id}Palettes.generated.receipt.json`),
      output: `${id}Palettes.generated.receipt.json`,
    },
    {
      source: path.join(THEMES_SRC_ROOT, slug, 'palette.config.json'),
      output: 'palette.config.json',
    },
  ];
  return candidates.filter(file => fs.existsSync(file.source));
}

/** Theme dirs that exist but must never reach the CLI tarball. */
function privateThemeSlugs() {
  if (!fs.existsSync(THEMES_SRC_ROOT)) return [];
  return fs
    .readdirSync(THEMES_SRC_ROOT, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(slug => {
      const pkg = path.join(THEMES_SRC_ROOT, slug, 'package.json');
      return fs.existsSync(pkg) && readJSON(pkg).private === true;
    })
    .sort();
}

describe('CLI theme bundle is in sync with source', () => {
  const slugs = themeSlugs();

  it('discovers at least one theme to check', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it('every public theme package descriptor reads back through the CLI', () => {
    expect(() => listThemeSlugs()).not.toThrow();
  });

  it('the generator runs when its path goes through a symlinked directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-gen-'));
    try {
      const repo = path.join(root, 'repo');
      const cli = path.join(repo, 'packages', 'cli');
      fs.mkdirSync(path.join(repo, 'scripts'), {recursive: true});
      fs.mkdirSync(cli, {recursive: true});
      fs.copyFileSync(
        path.join(__dirname, 'generate-cli-themes.mjs'),
        path.join(repo, 'scripts', 'generate-cli-themes.mjs'),
      );
      for (const dir of ['authoring', 'foundation']) {
        fs.symlinkSync(
          path.join(REPO_ROOT, 'packages', 'cli', dir),
          path.join(cli, dir),
        );
      }
      const src = path.join(repo, 'packages', 'themes', 'ocean', 'src');
      fs.mkdirSync(src, {recursive: true});
      fs.writeFileSync(
        path.join(src, '..', 'package.json'),
        JSON.stringify({name: '@acme/theme-ocean'}),
      );
      fs.writeFileSync(
        path.join(src, 'oceanTheme.ts'),
        'export const oceanTheme = {};\n',
      );
      fs.writeFileSync(
        path.join(src, 'oceanTheme.doc.mjs'),
        "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: true};\n",
      );
      fs.symlinkSync(repo, path.join(root, 'link'));
      const run = spawnSync(
        process.execPath,
        [path.join(root, 'link', 'scripts', 'generate-cli-themes.mjs')],
        {cwd: path.parse(root).root, encoding: 'utf-8'},
      );
      expect(run.status, run.stderr).toBe(0);
      expect(
        fs.readdirSync(
          path.join(cli, 'assets', 'templates', 'themes', 'ocean'),
        ),
      ).toEqual(['oceanTheme.doc.mjs', 'oceanTheme.ts']);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('every public theme package ships its same-stem descriptor', () => {
    const missing = slugs.filter(slug => {
      const stem = `${toIdentifier(slug)}Theme`;
      return !fs.existsSync(
        path.join(THEMES_SRC_ROOT, slug, 'src', `${stem}.doc.mjs`),
      );
    });
    expect(missing, 'packages/themes/<slug> without a descriptor').toEqual([]);
  });

  it('the generator refuses a public theme package with no descriptor', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-src-'));
    try {
      for (const [slug, pkg] of [
        ['ocean', {name: '@acme/theme-ocean'}],
        ['probe', {name: '@acme/theme-probe', private: true}],
      ]) {
        fs.mkdirSync(path.join(root, slug, 'src'), {recursive: true});
        fs.writeFileSync(
          path.join(root, slug, 'package.json'),
          JSON.stringify(pkg),
        );
        fs.writeFileSync(
          path.join(root, slug, 'src', `${slug}Theme.ts`),
          `export const ${slug}Theme = {};\n`,
        );
      }
      expect(() => listThemeSlugs(root)).toThrow(
        `Theme package @acme/theme-ocean (${path.basename(root)}/ocean) has src/oceanTheme.ts but no src/oceanTheme.doc.mjs descriptor, so it cannot be bundled.`,
      );
      const descriptor = path.join(root, 'ocean', 'src', 'oceanTheme.doc.mjs');
      const named = `Theme package @acme/theme-ocean (${path.basename(root)}/ocean) descriptor src/oceanTheme.doc.mjs`;
      fs.writeFileSync(descriptor, 'export default {};\n');
      expect(() => listThemeSlugs(root)).toThrow(
        `${named} must declare its public ThemeDoc type from @astryxdesign/cli/authoring.`,
      );
      const typed = (/** @type {string} */ name) =>
        `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${name}', displayName: 'Ocean', description: 'Blue.', maintained: true};\n`;
      fs.writeFileSync(descriptor, typed('sea'));
      expect(() => listThemeSlugs(root)).toThrow(
        `${named} names "sea", but the package folder is "ocean".`,
      );
      fs.writeFileSync(descriptor, typed('ocean'));
      expect(listThemeSlugs(root)).toEqual(['ocean']);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  for (const slug of slugs) {
    it(`${slug}: bundled directory matches source (run \`pnpm bundle:cli-themes\`)`, () => {
      const bundledDir = path.join(CLI_THEMES_OUT, slug);
      const expected = expectedFiles(slug);
      expect(filesUnder(bundledDir)).toEqual(
        expected.map(file => file.output).sort(),
      );
      for (const file of expected) {
        expect(fs.readFileSync(path.join(bundledDir, file.output))).toEqual(
          fs.readFileSync(file.source),
        );
      }
    });
  }

  for (const slug of privateThemeSlugs()) {
    it(`${slug}: private theme package is not shipped to CLI users`, () => {
      expect(
        fs.existsSync(path.join(CLI_THEMES_OUT, slug)),
        `packages/themes/${slug} is private but is bundled into the CLI — ` +
          'it would be offered by `astryx theme add`',
      ).toBe(false);
    });
  }

  it('theme eject copies each bundled theme in bundle order, with its descriptor', () => {
    const discovered = new Map(
      discoverBundledThemes().map(theme => [theme.slug, theme.files]),
    );
    for (const slug of slugs) {
      expect(discovered.get(slug), slug).toEqual(
        expectedFiles(slug).map(file => file.output),
      );
    }
  });

  it('bundles exactly the discovered themes and no central catalog', () => {
    const bundled = fs
      .readdirSync(CLI_THEMES_OUT, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    expect(bundled).toEqual(slugs);
    expect(fs.existsSync(path.join(CLI_THEMES_OUT, 'manifest.json'))).toBe(
      false,
    );
  });
});
