// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the upgrade.run leaf — the --path scan dir must be
 * confined to cwd (upgrade rewrites source in place with --apply, so an escaping
 * or out-of-tree path must be rejected), the receipt must say whether that
 * dir existed at all, a run from any folder in a project upgrades that
 * project (the nearest folder whose package.json declares Astryx, never the
 * home folder) and names files relative to the folder it ran in, and the
 * target Core is the project's own.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {upgrade} from '../upgrade.mjs';
import {relativeToOrigin} from '../_adapter.mjs';
import {logger} from '../../logger.mjs';
import {generateCompressedIndex} from '../../../foundation/agent-docs/agent-docs.mjs';

const SLOW = 30_000;

/**
 * Run `fn` with `home` as the home folder.
 * @template T
 * @param {string} home @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withHome(home, fn) {
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
}

function seedProject(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'x', version: '1.0.0', dependencies: {'@astryxdesign/core': '0.1.8'}}),
  );
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.1.8'}));
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'const x = 1;\n');
}

describe('upgrade.run — --path confinement', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-path-'));
    seedProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('accepts a normal in-tree --path (dry run)', async () => {
    const res = await upgrade({from: '0.0.1', path: 'src'}, {cwd: dir});
    expect(res.type).toBe('upgrade.run');
  }, SLOW);

  it('rejects a ../-escaping --path with ERR_PATH_TRAVERSAL', async () => {
    await expect(
      upgrade({from: '0.0.1', path: '../../../../etc'}, {cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects an absolute --path outside cwd with ERR_PATH_TRAVERSAL', async () => {
    await expect(
      upgrade({from: '0.0.1', path: os.tmpdir()}, {cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);
});

describe('upgrade.run — sourcePathFound', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-srcpath-'));
    seedProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  // The receipt for a project whose source lives somewhere other than ./src was
  // byte-identical to a fully migrated one: exit 0, filesChanged 0, errors [].
  // The only signal was a human log line --json suppresses by design.
  it('reports false when the resolved source directory is missing, and still counts nothing', async () => {
    fs.rmSync(path.join(dir, 'src'), {recursive: true, force: true});
    fs.mkdirSync(path.join(dir, 'app'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'app', 'index.ts'), 'const x = 1;\n');

    const res = await upgrade({from: '0.0.1', apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(false);
    expect(res.data.filesChanged).toBe(0);
    expect(res.data.errors).toEqual([]);
  }, SLOW);

  it('reports true for a source directory that exists', async () => {
    const res = await upgrade({from: '0.0.1', apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(true);
  }, SLOW);

  it('follows --path, so the right directory under another name reports true', async () => {
    fs.rmSync(path.join(dir, 'src'), {recursive: true, force: true});
    fs.mkdirSync(path.join(dir, 'app'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'app', 'index.ts'), 'const x = 1;\n');

    const res = await upgrade({from: '0.0.1', path: 'app'}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(true);
  }, SLOW);
});

/** Core 0.7.0 renamed this prop; its codemod renames it on Typeahead. */
const OLD_PROP_SOURCE =
  "import {Typeahead} from '@astryxdesign/core';\n" +
  'export const App = () => <Typeahead label="Fruit" emptySearchResultsText="None" />;\n';

/**
 * A project with Core 0.7.0 installed and src/App.tsx using a prop that 0.7.0
 * renamed.
 * @param {string} dir
 */
function seedOldPropProject(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}),
  );
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.7.0'}));
  fs.mkdirSync(path.join(dir, 'src', 'l1', 'l2'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), OLD_PROP_SOURCE);
}

describe('upgrade.run — a run from a subfolder upgrades the project', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-scope-'));
    seedOldPropProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  const appSource = () => fs.readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf-8');

  it.each([['src', 'App.tsx'], ['src/l1/l2', '../../App.tsx']])(
    'scans the project src by default when run from %s',
    async (folder, reported) => {
      const res = await upgrade({from: '0.6.8', apply: true}, {cwd: path.join(dir, folder)});

      expect(res.type).toBe('upgrade.run');
      expect(res.data.sourcePathFound).toBe(true);
      expect(res.data.filesChanged).toBe(1);
      expect(res.data.modifiedFiles).toEqual([reported]);
      expect(appSource()).toContain('emptySearchText="None"');
    },
    SLOW,
  );

  it('reads a path you name relative to the folder you ran in', async () => {
    const res = await upgrade({from: '0.6.8', path: '../..', apply: true}, {cwd: path.join(dir, 'src', 'l1', 'l2')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.filesChanged).toBe(1);
    expect(appSource()).toContain('emptySearchText="None"');
  }, SLOW);

  it('still rejects a path outside the project', async () => {
    await expect(
      upgrade({from: '0.6.8', path: '../../..'}, {cwd: path.join(dir, 'src', 'l1')}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(appSource()).toBe(OLD_PROP_SOURCE);
  }, SLOW);

  it("refreshes the agent docs at the project root, not the folder it ran in", async () => {
    fs.writeFileSync(
      path.join(dir, 'AGENTS.md'),
      `# Agents\n\n${generateCompressedIndex('0.6.8')}\n`,
    );

    const res = await upgrade({from: '0.6.8', apply: true}, {cwd: path.join(dir, 'src', 'l1')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.agentDocs.action).toBe('refreshed');
    expect(res.data.agentDocs.files).toEqual(['../../AGENTS.md']);
    expect(fs.existsSync(path.join(dir, 'src', 'l1', 'AGENTS.md'))).toBe(false);
  }, SLOW);
});

describe('upgrade.run — the result names files relative to the folder it ran in', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-receipt-'));
    seedOldPropProject(dir);
    fs.writeFileSync(path.join(dir, 'src', 'Generated.tsx'), `// @generated\n${OLD_PROP_SOURCE}`);
    fs.writeFileSync(path.join(dir, 'src', 'Vendored.tsx'), OLD_PROP_SOURCE);
    fs.writeFileSync(path.join(dir, '.gitattributes'), 'src/Vendored.tsx linguist-generated\n');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `# Agents\n\n${generateCompressedIndex('0.6.8')}\n`);
    fs.mkdirSync(path.join(dir, 'frontend'), {recursive: true});
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it.each([
    ['frontend', '../'],
    ['.', ''],
  ])('from %s, every file path resolves from that folder', async (folder, up) => {
    const cwd = path.join(dir, folder);

    const res = await upgrade({from: '0.6.8'}, {cwd});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.modifiedFiles).toEqual([`${up}src/App.tsx`]);
    expect(res.data.protectedFiles.map(item => item.file)).toEqual([
      `${up}src/Generated.tsx`,
      `${up}src/Vendored.tsx`,
    ]);
    for (const file of [...res.data.modifiedFiles, ...res.data.protectedFiles.map(item => item.file)]) {
      expect(fs.existsSync(path.join(cwd, file))).toBe(true);
    }
    // The file a declaration names resolves from that folder too.
    const vendored = res.data.protectedFiles.find(item => item.file.endsWith('Vendored.tsx'));
    expect(vendored?.declarations).toEqual([`linguist-generated in ${up}.gitattributes:1`]);
    expect(fs.existsSync(path.join(cwd, `${up}.gitattributes`))).toBe(true);
  }, SLOW);

  it('leaves a result from a run at the project root as it is', () => {
    const result = {type: 'upgrade.run', data: {modifiedFiles: ['src/App.tsx']}};

    expect(relativeToOrigin(result, {cwd: dir})).toBe(result);
  });

  it('rewrites every project-relative path and passes the copied-composition summary through', () => {
    const registryCompositions = {items: [{item: 'example', path: 'components/Example.tsx', files: []}]};
    const result = relativeToOrigin(
      {
        type: 'upgrade.run',
        data: {
          agentDocs: {status: 'stale', files: ['AGENTS.md']},
          modifiedFiles: ['src/App.tsx'],
          protectedFiles: [
            {
              file: 'src/Generated.tsx',
              codemods: ['a'],
              declarations: [
                '@generated marker',
                'excluded by .gitignore',
                'excluded by src/.hgignore:3',
                'linguist-generated in .gitattributes:1',
                'symbolic link at src/linked',
                'installed dependency metadata node_modules/x',
              ],
            },
          ],
          declinedCandidates: [{file: 'src/Loose.tsx', reason: 'unproven'}],
          errors: [{file: '.', codemod: 'post-codemod-hook', error: 'failed'}],
          registryCompositions,
        },
      },
      {cwd: dir, origin: path.join(dir, 'apps', 'web')},
    );

    expect(result.data).toEqual({
      agentDocs: {status: 'stale', files: ['../../AGENTS.md']},
      modifiedFiles: ['../../src/App.tsx'],
      protectedFiles: [
        {
          file: '../../src/Generated.tsx',
          codemods: ['a'],
          declarations: [
            '@generated marker',
            'excluded by ../../.gitignore',
            'excluded by ../../src/.hgignore:3',
            'linguist-generated in ../../.gitattributes:1',
            'symbolic link at ../../src/linked',
            'installed dependency metadata node_modules/x',
          ],
        },
      ],
      declinedCandidates: [{file: '../../src/Loose.tsx', reason: 'unproven'}],
      errors: [{file: '../..', codemod: 'post-codemod-hook', error: 'failed'}],
      registryCompositions,
    });
  });
});

describe("upgrade.run — the target Core is the project's own", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-own-core-'));
    seedOldPropProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  /**
   * A project nested in `dir`, with src/App.tsx using the renamed prop.
   * @param {Record<string, string>} dependencies
   */
  function nestedProject(dependencies) {
    const nested = path.join(dir, 'apps', 'web');
    fs.mkdirSync(path.join(nested, 'src'), {recursive: true});
    fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({name: 'web', dependencies}));
    fs.writeFileSync(path.join(nested, 'src', 'App.tsx'), OLD_PROP_SOURCE);
    return nested;
  }

  it.each([
    ['declares no Astryx package', {}],
    ['declares a Core it has not installed', {'@astryxdesign/core': '0.6.8'}],
  ])(
    'does not upgrade a project that %s to the Core of the home folder above it',
    async (_label, dependencies) => {
      const nested = nestedProject(dependencies);

      await withHome(dir, () =>
        expect(
          upgrade({from: '0.6.8', apply: true}, {cwd: nested}),
        ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'}),
      );
      expect(fs.readFileSync(path.join(nested, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
      expect(fs.readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
    },
    SLOW,
  );

  it('names the folder it searched before stopping on a missing Core, from a subfolder (AST-040 FR12)', async () => {
    fs.rmSync(path.join(dir, 'node_modules'), {recursive: true, force: true});
    const sub = path.join(dir, 'src', 'l1');
    const log = vi.spyOn(logger, 'log');
    try {
      await expect(upgrade({from: '0.6.8'}, {cwd: sub})).rejects.toMatchObject({
        code: 'ERR_VERSION_DETECT',
      });
      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines).toContain('Project root: ../..');
      expect(lines.indexOf('Project root: ../..')).toBeLessThan(
        lines.indexOf('Aborted\n'),
      );
    } finally {
      log.mockRestore();
    }
  }, SLOW);

  it('does not upgrade a nested project that declares a Core it has not installed to the Core above it', async () => {
    const nested = nestedProject({'@astryxdesign/core': '0.6.8'});

    await expect(
      upgrade({from: '0.6.8', apply: true}, {cwd: nested}),
    ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'});
    expect(fs.readFileSync(path.join(nested, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);

  it.each([
    ['an override at the workspace root forces', {overrides: {'@astryxdesign/core': '0.7.0'}}, {'@astryxdesign/core': '~0.6.8'}],
    ['a resolution at the workspace root forces', {resolutions: {'@astryxdesign/core': '0.7.0'}}, {'@astryxdesign/core': '0.6.8'}],
    ['only a stale peer range names', {}, null],
    ['the member declares another version of, not yet installed', {}, {'@astryxdesign/core': '0.9.0'}],
  ])(
    'upgrades a workspace member to a hoisted Core that %s',
    async (_label, rootFields, dependencies) => {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: 'root', private: true, workspaces: ['apps/*'], ...rootFields}),
      );
      const member = dependencies
        ? nestedProject(dependencies)
        : nestedProject({});
      if (!dependencies) {
        fs.writeFileSync(
          path.join(member, 'package.json'),
          JSON.stringify({name: 'web', peerDependencies: {'@astryxdesign/core': '^0.6.8'}}),
        );
      }

      const res = await upgrade({from: '0.6.8', apply: true}, {cwd: member});

      expect(res.type).toBe('upgrade.run');
      expect(res.data.to).toBe('0.7.0');
      expect(res.data.modifiedFiles).toEqual(['src/App.tsx']);
      expect(fs.readFileSync(path.join(member, 'src', 'App.tsx'), 'utf-8')).toContain('emptySearchText="None"');
    },
    SLOW,
  );

  it('does not upgrade a project its workspace does not list to the hoisted Core', async () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'root', private: true, workspaces: ['packages/*']}),
    );
    const project = nestedProject({'@astryxdesign/core': '0.9.0'});

    await expect(
      upgrade({from: '0.6.8', apply: true}, {cwd: project}),
    ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'});
    expect(fs.readFileSync(path.join(project, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);

  it.each([[['apps/*']], [['{apps/*,tools/*}']]])('upgrades a member that declares no Astryx package, in its own src, when the workspace lists %j', async workspaces => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'root', private: true, workspaces, dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const member = nestedProject({});

    const res = await upgrade({from: '0.6.8', apply: true}, {cwd: path.join(member, 'src')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.modifiedFiles).toEqual(['App.tsx']);
    expect(fs.readFileSync(path.join(member, 'src', 'App.tsx'), 'utf-8')).toContain('emptySearchText="None"');
    expect(fs.readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);
});

describe('upgrade.run — the project is the nearest folder that declares Astryx', () => {
  let home;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-home-'));
  });
  afterEach(() => fs.rmSync(home, {recursive: true, force: true}));

  // Astryx installed in a home folder whose src holds loose files and another
  // project, run from a folder with no package.json.
  it('does not upgrade the home folder from a folder inside it', async () => {
    seedOldPropProject(home);
    fs.mkdirSync(path.join(home, 'src', 'repoA', 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(home, 'src', 'repoA', 'package.json'),
      JSON.stringify({name: 'repoA', dependencies: {'@astryxdesign/core': '0.6.8'}}),
    );
    fs.writeFileSync(path.join(home, 'src', 'repoA', 'src', 'a.tsx'), OLD_PROP_SOURCE);
    const desktop = path.join(home, 'Desktop');
    fs.mkdirSync(desktop, {recursive: true});

    await withHome(home, () =>
      expect(
        upgrade({from: '0.6.8', apply: true}, {cwd: desktop}),
      ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'}),
    );
    expect(fs.readFileSync(path.join(home, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
    expect(fs.readFileSync(path.join(home, 'src', 'repoA', 'src', 'a.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);

  // Installing Core does not make a folder a project.
  it('treats a folder that installs Core without declaring it as part of the project above it', async () => {
    seedOldPropProject(home);
    const tool = path.join(home, 'tools', 'codegen');
    const core = path.join(tool, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(tool, 'package.json'), JSON.stringify({name: 'codegen'}));
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.9.0'}));

    const res = await upgrade({from: '0.6.8', apply: true}, {cwd: tool});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.to).toBe('0.7.0');
    expect(res.data.modifiedFiles).toEqual(['../../src/App.tsx']);
  }, SLOW);

  it('names the project root and the folder it scans before a dry run in a folder that installs Core without declaring it', async () => {
    seedOldPropProject(home);
    const tool = path.join(home, 'tools', 'codegen');
    const core = path.join(tool, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(tool, 'package.json'), JSON.stringify({name: 'codegen'}));
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.9.0'}));
    const log = vi.spyOn(logger, 'log');
    try {
      const res = await upgrade({from: '0.6.8'}, {cwd: tool});

      expect(res.type).toBe('upgrade.run');
      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines).toContain('Project root: ../..');
      expect(lines).toContain(`Source folder: ${path.join('..', '..', 'src')}`);
      expect(fs.readFileSync(path.join(home, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
    } finally {
      log.mockRestore();
    }
  }, SLOW);

  it('upgrades the home folder as a folder outside any project, when run there', async () => {
    seedOldPropProject(home);

    const res = await withHome(home, () => upgrade({from: '0.6.8', apply: true}, {cwd: home}));

    expect(res.type).toBe('upgrade.run');
    expect(res.data.modifiedFiles).toEqual(['src/App.tsx']);
    expect(fs.readFileSync(path.join(home, 'src', 'App.tsx'), 'utf-8')).toContain('emptySearchText="None"');
  }, SLOW);

  it('does not leave a repository for the project around it', async () => {
    seedOldPropProject(home);
    const repo = path.join(home, 'vendor', 'repo');
    fs.mkdirSync(path.join(repo, '.git'), {recursive: true});
    fs.mkdirSync(path.join(repo, 'src'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({name: 'repo'}));
    fs.writeFileSync(path.join(repo, 'src', 'App.tsx'), OLD_PROP_SOURCE);

    await expect(
      upgrade({from: '0.6.8', apply: true}, {cwd: repo}),
    ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'});
    expect(fs.readFileSync(path.join(repo, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
    expect(fs.readFileSync(path.join(home, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);
});
