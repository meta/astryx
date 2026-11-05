// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Real package-boundary coverage for integration authoring. Authors a
 * provider through the CLI, packs it, installs the tarball into a separate
 * no-config consumer, then exercises packed docs, codemods, built themes, and
 * explicit source ejection.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runCli} from '../../../test-utils/run-cli.mjs';

let rootDir;
const CLI_BIN = path.join(
  process.cwd(),
  'packages',
  'cli',
  'clients',
  'cli',
  'bin',
  'astryx.mjs',
);

function parseEnvelope(stdout) {
  return JSON.parse(stdout.trim());
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runCliProcess(args, cwd) {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: process.env,
  });
  if (result.error) throw result.error;
  return result;
}

function runNpm(args, cwd) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
      npm_config_cache: path.join(rootDir, '.npm-cache'),
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `npm ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

afterEach(() => {
  if (rootDir) fs.rmSync(rootDir, {recursive: true, force: true});
  rootDir = undefined;
});

describe('integration authoring across a real npm package boundary', () => {
  it('authors, packs, installs, upgrades, and builds contributed source', async () => {
    rootDir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-theme-provider-consumer-'),
    );
    const providerDir = path.join(rootDir, 'provider');
    const consumerDir = path.join(rootDir, 'consumer');
    const packDir = path.join(rootDir, 'packed');
    const coreVersion = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'packages', 'core', 'package.json'),
        'utf-8',
      ),
    ).version;
    fs.mkdirSync(providerDir);
    fs.mkdirSync(consumerDir);
    fs.mkdirSync(packDir);

    writeJson(path.join(providerDir, 'package.json'), {
      name: '@acme/brand-integration',
      version: '1.0.0',
      type: 'module',
      files: ['README.md'],
    });
    fs.writeFileSync(
      path.join(providerDir, 'README.md'),
      '# Acme brand integration\n',
    );

    for (const [kind, name] of [
      ['theme', 'ocean'],
      ['doc', 'brand-theme'],
      ['doc', 'theme-migration'],
    ]) {
      const added = await runCli(
        ['integration', 'add', kind, name, '--json'],
        providerDir,
      );
      expect(added.status, added.stderr).toBe(0);
      expect(parseEnvelope(added.stdout)).toMatchObject({
        type: 'integration.add',
        data: {kind, name, written: true, dryRun: false},
      });
    }

    const codemodName = 'packed-proof';
    const codemodAdded = await runCli(
      [
        'integration',
        'add',
        'codemod',
        codemodName,
        '--to',
        coreVersion,
        '--json',
      ],
      providerDir,
    );
    expect(codemodAdded.status, codemodAdded.stderr).toBe(0);
    expect(parseEnvelope(codemodAdded.stdout)).toMatchObject({
      type: 'integration.add',
      data: {kind: 'codemod', name: codemodName, written: true},
    });
    const providerCodemod = path.join(
      providerDir,
      'codemods',
      coreVersion,
      `${codemodName}.mjs`,
    );
    fs.writeFileSync(
      providerCodemod,
      `export default {
  type: 'code',
  title: 'Packed proof',
  transform(file) {
    return file.source.replace(/old-token/g, 'new-token');
  },
};
`,
    );

    const themeDir = path.join(providerDir, 'themes', 'ocean');
    const paletteConfig = path.join(providerDir, 'palette.config.json');
    writeJson(paletteConfig, {
      modeStrategy: 'light-and-dark',
      stops: [20, 50, 80],
      families: [{id: 'blue', seed: '#0074e2'}],
    });
    const paletteOutput = path.join(
      'themes',
      'ocean',
      'tokens',
      'ocean.palette.ts',
    );
    const generatedPalette = await runCli(
      [
        'theme',
        'palette',
        'generate',
        'palette.config.json',
        '--out',
        paletteOutput,
        '--json',
      ],
      providerDir,
    );
    expect(generatedPalette.status, generatedPalette.stderr).toBe(0);
    expect(parseEnvelope(generatedPalette.stdout)).toMatchObject({
      type: 'theme.palette.generate',
      data: {
        output: paletteOutput,
        receipt: path.join(
          'themes',
          'ocean',
          'tokens',
          'ocean.palette.receipt.json',
        ),
        written: true,
      },
    });

    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.ts'),
      `import {defineTheme} from '@astryxdesign/core/theme';
import {palette} from './tokens/ocean.palette';

export const oceanTheme = defineTheme({
  name: 'ocean',
  tokens: {'--color-accent': palette.blue.light[50]},
});
`,
    );
    const providerBuild = await runCli(
      ['theme', 'build', 'themes/ocean/oceanTheme.ts', '--json'],
      providerDir,
    );
    expect(providerBuild.status, providerBuild.stderr).toBe(0);
    expect(parseEnvelope(providerBuild.stdout)).toMatchObject({
      type: 'theme.build',
      data: {name: 'ocean'},
    });

    const providerPackage = JSON.parse(
      fs.readFileSync(path.join(providerDir, 'package.json'), 'utf-8'),
    );
    expect(providerPackage.files).toEqual([
      'README.md',
      'themes',
      'astryx.integration.mjs',
      'docs',
      'codemods',
    ]);

    const checked = await runCli(
      ['integration', 'verify', '--json'],
      providerDir,
    );
    expect(checked.status, checked.stderr).toBe(0);
    const checkReceipt = parseEnvelope(checked.stdout);
    expect(checkReceipt).toMatchObject({
      type: 'integration.pack-check',
      data: {
        name: '@acme/brand-integration',
        packable: true,
        contributions: {
          local: {
            themes: [{slug: 'ocean', exportName: 'oceanTheme'}],
            docs: ['brand-theme', 'theme-migration'],
            codemods: [{version: coreVersion, id: codemodName}],
          },
        },
      },
    });
    expect(checkReceipt.data.contributions.packed).toEqual(
      checkReceipt.data.contributions.local,
    );

    const packOutput = JSON.parse(
      runNpm(
        ['pack', '--json', '--silent', `--pack-destination=${packDir}`],
        providerDir,
      ),
    );
    const tarball = path.join(packDir, packOutput[0].filename);
    expect(fs.existsSync(tarball)).toBe(true);

    writeJson(path.join(consumerDir, 'package.json'), {
      name: 'theme-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
    });
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        tarball,
      ],
      consumerDir,
    );

    const alternateProviderDir = path.join(rootDir, 'alternate-provider');
    fs.mkdirSync(alternateProviderDir);
    writeJson(path.join(alternateProviderDir, 'package.json'), {
      name: '@acme/alternate-brand',
      version: '1.0.0',
      type: 'module',
      files: [],
    });
    const alternateAdded = await runCli(
      ['integration', 'add', 'theme', 'ocean', '--json'],
      alternateProviderDir,
    );
    expect(alternateAdded.status, alternateAdded.stderr).toBe(0);
    const alternatePack = JSON.parse(
      runNpm(
        ['pack', '--json', '--silent', `--pack-destination=${packDir}`],
        alternateProviderDir,
      ),
    );
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        path.join(packDir, alternatePack[0].filename),
      ],
      consumerDir,
    );

    const installedDir = path.join(
      consumerDir,
      'node_modules',
      '@acme',
      'brand-integration',
    );
    expect(fs.lstatSync(installedDir).isSymbolicLink()).toBe(false);
    const alternateInstalledDir = path.join(
      consumerDir,
      'node_modules',
      '@acme',
      'alternate-brand',
    );
    expect(fs.lstatSync(alternateInstalledDir).isSymbolicLink()).toBe(false);

    // The consumer installs both providers from tarballs. Link this checkout's
    // Core package as the consumer's normal app dependency so an ejected source
    // can build against the same peer it would get from `npm install @astryxdesign/core`.
    const coreScope = path.join(consumerDir, 'node_modules', '@astryxdesign');
    const coreLink = path.join(coreScope, 'core');
    fs.mkdirSync(coreScope, {recursive: true});
    fs.symlinkSync(
      path.join(process.cwd(), 'packages', 'core'),
      coreLink,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const consumerSource = path.join(consumerDir, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(consumerSource), {recursive: true});
    fs.writeFileSync(consumerSource, "export const value = 'old-token';\n");
    const dryRun = await runCli(
      [
        'upgrade',
        '--from',
        '0.0.0',
        '--integration',
        '@acme/brand-integration',
        '--path',
        'src',
        '--json',
      ],
      consumerDir,
    );
    expect(dryRun.status, `${dryRun.stdout}\n${dryRun.stderr}`).toBe(0);
    const dryRunReceipt = parseEnvelope(dryRun.stdout);
    expect(dryRunReceipt).toMatchObject({
      type: 'upgrade.run',
      data: {
        to: coreVersion,
        integrations: expect.arrayContaining(['@acme/brand-integration']),
        filesChanged: 1,
        transformsApplied: 1,
      },
    });
    expect(dryRunReceipt.data.codemods).toBeGreaterThan(0);
    expect(fs.readFileSync(consumerSource, 'utf-8')).toBe(
      "export const value = 'old-token';\n",
    );

    fs.rmSync(providerDir, {recursive: true, force: true});
    fs.rmSync(alternateProviderDir, {recursive: true, force: true});

    const consumerPackageFile = path.join(consumerDir, 'package.json');
    const consumerPackage = JSON.parse(
      fs.readFileSync(consumerPackageFile, 'utf-8'),
    );
    const providerSpec =
      consumerPackage.dependencies['@acme/brand-integration'];
    delete consumerPackage.dependencies['@acme/brand-integration'];
    writeJson(consumerPackageFile, consumerPackage);
    const undeclared = await runCli(
      ['theme', 'list', '--package', '@acme/brand-integration', '--json'],
      consumerDir,
    );
    expect(undeclared.status, undeclared.stderr).toBe(0);
    expect(parseEnvelope(undeclared.stdout).data).toEqual([]);

    consumerPackage.devDependencies = {
      '@acme/brand-integration': providerSpec,
    };
    writeJson(consumerPackageFile, consumerPackage);
    const devLinked = await runCli(
      ['theme', 'list', '--package', '@acme/brand-integration', '--json'],
      consumerDir,
    );
    expect(devLinked.status, devLinked.stderr).toBe(0);
    expect(parseEnvelope(devLinked.stdout).data).toContainEqual(
      expect.objectContaining({
        slug: 'ocean',
        package: '@acme/brand-integration',
      }),
    );

    delete consumerPackage.devDependencies;
    consumerPackage.optionalDependencies = {
      '@acme/brand-integration': providerSpec,
    };
    writeJson(consumerPackageFile, consumerPackage);
    const optionalLinked = await runCli(
      ['theme', 'list', '--package', '@acme/brand-integration', '--json'],
      consumerDir,
    );
    expect(optionalLinked.status, optionalLinked.stderr).toBe(0);
    expect(parseEnvelope(optionalLinked.stdout).data).toContainEqual(
      expect.objectContaining({
        slug: 'ocean',
        package: '@acme/brand-integration',
      }),
    );

    delete consumerPackage.optionalDependencies;
    consumerPackage.dependencies['@acme/brand-integration'] = providerSpec;
    writeJson(consumerPackageFile, consumerPackage);

    const listed = await runCli(['theme', 'list', '--json'], consumerDir);
    expect(listed.status, listed.stderr).toBe(0);
    expect(parseEnvelope(listed.stdout).data).toContainEqual(
      expect.objectContaining({
        slug: 'ocean',
        package: '@acme/brand-integration',
      }),
    );

    for (const topic of ['brand-theme', 'theme-migration']) {
      const guide = await runCli(['docs', topic, '--json'], consumerDir);
      expect(guide.status, guide.stderr).toBe(0);
      expect(parseEnvelope(guide.stdout).data).toMatchObject({name: topic});
    }

    const ambiguous = await runCli(
      ['theme', 'add', 'ocean', '--json'],
      consumerDir,
    );
    expect(ambiguous.status).not.toBe(0);
    expect(parseEnvelope(ambiguous.stdout)).toMatchObject({
      code: 'ERR_AMBIGUOUS_THEME',
    });

    const addedTheme = await runCli(
      [
        'theme',
        'add',
        'ocean',
        '--import',
        '--package',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(addedTheme.status, addedTheme.stderr).toBe(0);
    expect(parseEnvelope(addedTheme.stdout)).toMatchObject({
      type: 'theme.app',
      data: {
        default: 'ocean',
        change: {action: 'add', slug: 'ocean', changed: true},
        themes: [
          {
            slug: 'ocean',
            owner: '@acme/brand-integration',
            module: '@acme/brand-integration/themes/ocean',
            stylesheet: '@acme/brand-integration/themes/ocean.css',
          },
        ],
      },
    });
    const generatedModule = fs.readFileSync(
      path.join(consumerDir, 'src', 'astryx-themes.js'),
      'utf-8',
    );
    expect(generatedModule).toContain(
      'from "@acme/brand-integration/themes/ocean"',
    );
    expect(generatedModule).toContain(
      'import "@acme/brand-integration/themes/ocean.css"',
    );

    const target = path.join('src', 'themes', 'acme-ocean');
    const copied = await runCli(
      [
        'theme',
        'eject',
        'ocean',
        target,
        '--package',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(copied.status, copied.stderr).toBe(0);
    expect(parseEnvelope(copied.stdout)).toMatchObject({
      type: 'theme.eject',
      data: {
        slug: 'ocean',
        package: '@acme/brand-integration',
        outputDir: target,
        files: expect.arrayContaining([
          'oceanTheme.ts',
          'oceanTheme.doc.mjs',
          'tokens/ocean.palette.receipt.json',
          'tokens/ocean.palette.ts',
        ]),
      },
    });
    expect(
      fs.readFileSync(
        path.join(consumerDir, target, 'tokens', 'ocean.palette.ts'),
        'utf-8',
      ),
    ).toContain('export const palette');
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            consumerDir,
            target,
            'tokens',
            'ocean.palette.receipt.json',
          ),
          'utf-8',
        ),
      ).recipe,
    ).toBe('astryx-oklch-v1');

    const copiedEntry = path.join(target, 'oceanTheme.ts');
    const built = await runCli(
      ['theme', 'build', copiedEntry, '--json'],
      consumerDir,
    );
    expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
    const buildReceipt = parseEnvelope(built.stdout);
    expect(buildReceipt).toMatchObject({
      type: 'theme.build',
      data: {name: 'ocean'},
    });
    for (const output of Object.values(buildReceipt.data.outputs)) {
      expect(fs.existsSync(path.join(consumerDir, output))).toBe(true);
    }

    const duplicate = await runCli(
      [
        'theme',
        'eject',
        'ocean',
        target,
        '--package',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(duplicate.status).not.toBe(0);
    expect(parseEnvelope(duplicate.stdout)).toMatchObject({
      code: 'ERR_FILE_EXISTS',
    });
    const overwritten = await runCli(
      [
        'theme',
        'eject',
        'ocean',
        target,
        '--package',
        '@acme/brand-integration',
        '--overwrite',
        '--json',
      ],
      consumerDir,
    );
    expect(overwritten.status, overwritten.stderr).toBe(0);
    expect(parseEnvelope(overwritten.stdout).type).toBe('theme.eject');

    const installedCodemod = path.join(
      installedDir,
      'codemods',
      coreVersion,
      `${codemodName}.mjs`,
    );
    const validCodemod = fs.readFileSync(installedCodemod, 'utf-8');
    fs.writeFileSync(installedCodemod, "export default {not: 'a codemod'};\n");
    const invalidCodemod = runCliProcess(
      [
        'doctor',
        'integration',
        'validate',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(invalidCodemod.status).toBe(1);
    const invalidCodemodEnvelope = parseEnvelope(invalidCodemod.stdout);
    expect(invalidCodemodEnvelope).toMatchObject({
      type: 'integration.validate',
      data: {
        name: '@acme/brand-integration',
        issues: expect.arrayContaining([
          expect.objectContaining({code: 'invalid_codemod', severity: 'error'}),
        ]),
      },
    });

    fs.rmSync(path.join(installedDir, 'codemods'), {
      recursive: true,
      force: true,
    });
    const missingCodemods = runCliProcess(
      [
        'doctor',
        'integration',
        'validate',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(missingCodemods.status).toBe(1);
    const missingCodemodsEnvelope = parseEnvelope(missingCodemods.stdout);
    expect(missingCodemodsEnvelope).toMatchObject({
      type: 'integration.validate',
      data: {
        name: '@acme/brand-integration',
        issues: expect.arrayContaining([
          expect.objectContaining({code: 'missing_root', severity: 'error'}),
        ]),
      },
    });
    fs.mkdirSync(path.dirname(installedCodemod), {recursive: true});
    fs.writeFileSync(installedCodemod, validCodemod);

    fs.rmSync(
      path.join(installedDir, 'themes', 'ocean', 'tokens', 'ocean.palette.ts'),
    );
    const corruptedInstall = await runCli(
      [
        'theme',
        'eject',
        'ocean',
        'src/themes/corrupted',
        '--package',
        '@acme/brand-integration',
        '--json',
      ],
      consumerDir,
    );
    expect(corruptedInstall.status).not.toBe(0);
    expect(parseEnvelope(corruptedInstall.stdout)).toMatchObject({
      code: 'ERR_THEME_INVALID',
      error: expect.stringContaining('./tokens/ocean.palette'),
    });
  }, 120_000);
});
