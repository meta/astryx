// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Component replacement in text mode (spec:AST-035 FR11, FR13, FR15;
 * architecture:cli-surface INV28): what a person sees from the real CLI for a
 * replaced Core component, at every detail level, single, batch, and list,
 * plus the help that documents it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {COMPONENT_REPLACES_CLI} from '../../../foundation/integrations/cli-requirement.mjs';

vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

const FLOOR = {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`};

let tmpDir;

/**
 * @param {string} name
 * @param {Array<{name: string, replaces?: string}>} components
 * @param {Record<string, string>} [peers]
 */
function writeIntegration(name, components, peers) {
  const pkgDir = path.join(tmpDir, 'node_modules', ...name.split('/'));
  const componentsDir = path.join(pkgDir, 'components');
  fs.mkdirSync(componentsDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      ...(peers ? {peerDependencies: peers} : {}),
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  for (const component of components) {
    fs.writeFileSync(
      path.join(componentsDir, `${component.name}.doc.mjs`),
      `export default ${JSON.stringify({
        type: 'component',
        name: component.name,
        displayName: component.name,
        ...(component.replaces ? {replaces: component.replaces} : {}),
        import: `${name}/components/${component.name}`,
        usage: {description: `${component.name} for Acme apps.`},
        props: [],
      })};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component.name}.tsx`),
      `export function ${component.name}() { return null; }\n`,
    );
  }
}

beforeAll(() => {
  // Under the repository so the project resolves the workspace's Core.
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-component-replacement-text-'),
  );
  writeIntegration(
    '@acme/nav',
    [{name: 'AcmeSideNav', replaces: 'SideNav'}],
    FLOOR,
  );
  writeIntegration('@acme/old', [{name: 'OldTopNav', replaces: 'TopNav'}]);
  writeIntegration(
    '@acme/bad',
    [{name: 'BadThing', replaces: 'NoSuchComponent'}],
    FLOOR,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      version: '1.0.0',
      dependencies: {
        '@acme/nav': '1.0.0',
        '@acme/old': '1.0.0',
        '@acme/bad': '1.0.0',
      },
    }),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

const IMPORT =
  "import { AcmeSideNav } from '@acme/nav/components/AcmeSideNav';";

describe('component detail text', () => {
  it('prints the replacement at full detail, naming its package', async () => {
    const run = await runCli(['component', 'SideNav'], {cwd: tmpDir});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('package: @acme/nav');
    expect(run.stdout).toContain('# AcmeSideNav');
  });

  it('imports the export the package has at compact detail', async () => {
    const run = await runCli(['component', 'SideNav', '--detail', 'compact'], {
      cwd: tmpDir,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(IMPORT);
    expect(run.stdout).not.toContain('import { SideNav }');
  });

  it('names the export the package has at brief detail', async () => {
    const run = await runCli(['component', 'SideNav', '--detail', 'brief'], {
      cwd: tmpDir,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(
      /^AcmeSideNav {2}<- from '@acme\/nav\/components\/AcmeSideNav'/m,
    );
    expect(run.stdout).not.toMatch(/^SideNav {2}<- from '@acme/m);
  });

  it('answers to the Core name qualified by the replacing package', async () => {
    const run = await runCli(
      ['component', '@acme/nav/SideNav', '--detail', 'compact'],
      {
        cwd: tmpDir,
      },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(IMPORT);
  });

  it('keeps the Core original behind --package @astryxdesign/core', async () => {
    const run = await runCli(
      [
        'component',
        'SideNav',
        '--package',
        '@astryxdesign/core',
        '--detail',
        'compact',
      ],
      {cwd: tmpDir},
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('package: @astryxdesign/core');
    expect(run.stdout).toContain("from '@astryxdesign/core/SideNav'");
  });
});

describe('component batch text', () => {
  it.each(['compact', 'brief'])(
    'uses the replacement export at %s detail',
    async detail => {
      const run = await runCli(
        ['component', 'SideNav', 'Button', '--detail', detail],
        {
          cwd: tmpDir,
        },
      );
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('AcmeSideNav');
      expect(run.stdout).toContain("'@acme/nav/components/AcmeSideNav'");
      expect(run.stdout).not.toContain('import { SideNav }');
      expect(run.stdout).not.toMatch(/^SideNav {2}<- from '@acme/m);
    },
  );
});

describe('component list text', () => {
  it('lists the replacement once, with its package, at brief detail', async () => {
    const run = await runCli(['component', '--list'], {cwd: tmpDir});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('name:   AcmeSideNav');
    expect(run.stdout).toContain(
      '@acme/nav/components/AcmeSideNav  [@acme/nav]',
    );
    expect(run.stdout.match(/name: {3}AcmeSideNav\n/g)).toHaveLength(1);
    expect(run.stdout).not.toMatch(/name: {3}SideNav\n/);
  });

  it('names the replacement package at compact detail', async () => {
    const run = await runCli(['component', '--list', '--detail', 'compact'], {
      cwd: tmpDir,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      '@acme/nav/components/AcmeSideNav  [@acme/nav]',
    );
    expect(run.stdout).not.toMatch(/name: +SideNav\n/);
  });

  it('prints the replacement in the Core slot at full detail', async () => {
    const run = await runCli(['component', '--list', '--detail', 'full'], {
      cwd: tmpDir,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(
      /^AcmeSideNav {2}<- from '@acme\/nav\/components\/AcmeSideNav' {2}\[@acme\/nav\]$/m,
    );
    expect(run.stdout).not.toMatch(/^SideNav[( ]/m);
  });

  it.each(['brief', 'compact', 'full'])(
    'keeps the replacement in its category at %s detail',
    async detail => {
      const run = await runCli(
        ['component', '--category', 'Navigation', '--detail', detail],
        {cwd: tmpDir},
      );
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('AcmeSideNav');
    },
  );

  it('prints only the requested category at full detail', async () => {
    const layout = await runCli(
      ['component', '--list', '--category', 'Layout', '--detail', 'full'],
      {cwd: tmpDir},
    );
    expect(layout.status, layout.stderr).toBe(0);
    expect(layout.stdout.match(/^## .+$/gm)).toEqual(['## Layout']);
    expect(layout.stdout).not.toContain('@astryxdesign/core/SideNav');
    expect(layout.stdout).not.toContain('AcmeSideNav');

    const navigation = await runCli(
      ['component', '--list', '--category', 'Navigation', '--detail', 'full'],
      {cwd: tmpDir},
    );
    expect(navigation.status, navigation.stderr).toBe(0);
    expect(navigation.stdout.match(/^## .+$/gm)).toEqual(['## Navigation']);
    expect(navigation.stdout).toMatch(
      /^AcmeSideNav {2}<- from '@acme\/nav\/components\/AcmeSideNav' {2}\[@acme\/nav\]$/m,
    );
    expect(navigation.stdout).not.toMatch(/^SideNav[( ]/m);
  });

  it.each(['brief', 'compact'])(
    'prints only the requested category at %s detail',
    async detail => {
      const layout = await runCli(
        ['component', '--category', 'Layout', '--detail', detail],
        {cwd: tmpDir},
      );
      expect(layout.status, layout.stderr).toBe(0);
      expect(layout.stdout).not.toContain('@astryxdesign/core/SideNav');
      expect(layout.stdout).not.toContain('AcmeSideNav');

      const navigation = await runCli(
        ['component', '--category', 'Navigation', '--detail', detail],
        {cwd: tmpDir},
      );
      expect(navigation.status, navigation.stderr).toBe(0);
      expect(navigation.stdout).toContain(
        '@acme/nav/components/AcmeSideNav  [@acme/nav]',
      );
      expect(navigation.stdout).not.toMatch(/^name: +SideNav$/m);
    },
  );
});

describe('help documents the replacement', () => {
  it.each([
    [
      ['component', '--help'],
      ['replaced by an integration component', '--package @astryxdesign/core'],
    ],
    [
      ['swizzle', '--help'],
      ['replaces', '--package @astryxdesign/core', '--list'],
    ],
    [
      ['gap-report', '--help'],
      ['the integration whose component replaces the named Core component'],
    ],
    [
      ['doctor', 'integration', 'components', '--help'],
      ['replaces', 'an invalid replaces'],
    ],
  ])('%s', async (args, needles) => {
    const run = await runCli(/** @type {string[]} */ (args), {cwd: tmpDir});
    const help = run.stdout + run.stderr;
    for (const needle of needles) expect(help).toContain(needle);
  });
});

describe('doctor integration components text and exit codes', () => {
  it('exits 1 for an invalid replaces in a package with the floor', async () => {
    const run = await runCli(
      ['doctor', 'integration', 'components', '@acme/bad'],
      {
        cwd: tmpDir,
      },
    );
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('missing_component_replacement_target');
  });

  it('warns and exits 0 for a package without the floor', async () => {
    const run = await runCli(
      ['doctor', 'integration', 'components', '@acme/old'],
      {
        cwd: tmpDir,
      },
    );
    expect(run.status, run.stdout).toBe(0);
    expect(run.stdout).toContain('inactive_component_replacement');
    expect(run.stdout).toContain(`">=${COMPONENT_REPLACES_CLI}"`);
  });
});
