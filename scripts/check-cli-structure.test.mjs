// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `pnpm check:cli-structure` is the evidence cli-surface INV6 names for
 * the command layout, so it must fail when a command's file or CommandDoc is
 * missing or sits at the wrong path.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {checkCommandLayout} from './check-cli-structure.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

/**
 * A CLI tree with an index.mjs registry. `docs` maps a command name to its
 * subcommand names; each becomes a CommandDoc at its INV6 path.
 *
 * @param {{
 *   registry?: Record<string, string>,
 *   inline?: string[],
 *   files?: string[],
 *   docs?: Record<string, string[]>,
 *   extraDocs?: Record<string, string>,
 * }} tree
 * @returns {string} the tree's `packages/cli` equivalent
 */
function cliTree({
  registry = {},
  inline = [],
  files = [],
  docs = {},
  extraDocs = {},
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-structure-'));
  roots.push(root);
  const commands = path.join(root, 'clients/cli/commands');
  fs.mkdirSync(commands, {recursive: true});
  const entries = Object.entries(registry)
    .map(
      ([name, file]) => `  {name: '${name}', path: '${file}', register: 'r'},`,
    )
    .join('\n');
  const calls = inline.map(name => `program.command('${name}');`).join('\n');
  fs.writeFileSync(
    path.join(root, 'clients/cli/index.mjs'),
    `const commands = [\n${entries}\n];\n${calls}\n`,
  );
  for (const file of files) {
    const target = path.join(root, 'clients/cli', file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, 'export {};\n');
  }
  const writeDoc = (/** @type {string} */ file, /** @type {object} */ doc) => {
    fs.mkdirSync(path.dirname(path.join(commands, file)), {recursive: true});
    fs.writeFileSync(
      path.join(commands, file),
      `export const doc = ${JSON.stringify(doc)};\n`,
    );
  };
  for (const [name, subcommands] of Object.entries(docs)) {
    writeDoc(`${name.replaceAll(' ', '-')}.doc.mjs`, {
      type: 'command',
      name,
      subcommands,
    });
  }
  for (const [file, name] of Object.entries(extraDocs)) {
    writeDoc(file, {type: 'command', name});
  }
  return root;
}

/** A conforming tree: a flat command, and a group with nested subcommands. */
const CONFORMING = {
  registry: {
    alpha: './commands/alpha.mjs',
    beta: './commands/beta/index.mjs',
  },
  files: ['commands/alpha.mjs', 'commands/beta/index.mjs'],
  docs: {
    alpha: [],
    beta: ['one'],
    'beta one': ['deep'],
    'beta one deep': [],
  },
};

describe('checkCommandLayout', () => {
  it('accepts commands, groups, and nested subcommands at their INV6 paths', async () => {
    const {errors, commands} = await checkCommandLayout(cliTree(CONFORMING));
    expect(errors).toEqual([]);
    expect(commands).toBe(4);
  });

  it('fails when a command has no CommandDoc', async () => {
    const docs = {...CONFORMING.docs};
    delete docs['beta one deep'];
    const {errors} = await checkCommandLayout(cliTree({...CONFORMING, docs}));
    expect(errors).toEqual([
      'command "beta one deep" has no CommandDoc at clients/cli/commands/beta-one-deep.doc.mjs',
    ]);
  });

  it('fails when a command is registered from another file', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({
        ...CONFORMING,
        registry: {...CONFORMING.registry, alpha: './commands/build-alpha.mjs'},
        files: [...CONFORMING.files, 'commands/build-alpha.mjs'],
      }),
    );
    expect(errors).toEqual([
      'command "alpha" is registered from clients/cli/commands/build-alpha.mjs, not clients/cli/commands/alpha.mjs',
    ]);
  });

  it('names the folder form too when a group is registered from another file', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({
        ...CONFORMING,
        registry: {...CONFORMING.registry, beta: './commands/build-beta.mjs'},
        files: [...CONFORMING.files, 'commands/build-beta.mjs'],
      }),
    );
    expect(errors).toEqual([
      'command "beta" is registered from clients/cli/commands/build-beta.mjs, not clients/cli/commands/beta.mjs or clients/cli/commands/beta/index.mjs',
    ]);
  });

  it('fails when a command with no subcommands uses the folder form', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({
        ...CONFORMING,
        registry: {...CONFORMING.registry, alpha: './commands/alpha/index.mjs'},
        files: ['commands/alpha/index.mjs', 'commands/beta/index.mjs'],
      }),
    );
    expect(errors).toEqual([
      'command "alpha" is registered from clients/cli/commands/alpha/index.mjs, but only a group (a CommandDoc that lists subcommands) uses a folder; move it to clients/cli/commands/alpha.mjs',
    ]);
  });

  it('accepts a group in a flat file', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({
        ...CONFORMING,
        registry: {...CONFORMING.registry, beta: './commands/beta.mjs'},
        files: ['commands/alpha.mjs', 'commands/beta.mjs'],
      }),
    );
    expect(errors).toEqual([]);
  });

  it('fails when the registered file is missing', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({...CONFORMING, files: ['commands/beta/index.mjs']}),
    );
    expect(errors).toEqual([
      'command "alpha" is registered from clients/cli/commands/alpha.mjs, which does not exist',
    ]);
  });

  it('fails when a command is registered by hand in index.mjs', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({
        ...CONFORMING,
        inline: ['gamma'],
        docs: {...CONFORMING.docs, gamma: []},
      }),
    );
    expect(errors).toEqual([
      'command "gamma" is registered in clients/cli/index.mjs, not in its own clients/cli/commands/gamma.mjs',
    ]);
  });

  it('fails when a CommandDoc documents a different command', async () => {
    const tree = cliTree(CONFORMING);
    fs.writeFileSync(
      path.join(tree, 'clients/cli/commands/beta-one.doc.mjs'),
      `export const doc = ${JSON.stringify({type: 'command', name: 'beta uno'})};\n`,
    );
    const {errors} = await checkCommandLayout(tree);
    expect(errors).toEqual([
      'clients/cli/commands/beta-one.doc.mjs documents "beta uno", not "beta one"',
      'clients/cli/commands/beta-one-deep.doc.mjs is not the CommandDoc of any registered command',
    ]);
  });

  it('fails when a CommandDoc sits at no registered command path', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({...CONFORMING, extraDocs: {'beta_two.doc.mjs': 'beta two'}}),
    );
    expect(errors).toEqual([
      'clients/cli/commands/beta_two.doc.mjs is not the CommandDoc of any registered command',
    ]);
  });

  it('fails when a CommandDoc sits inside a group folder', async () => {
    const {errors} = await checkCommandLayout(
      cliTree({...CONFORMING, extraDocs: {'beta/beta-one.doc.mjs': 'beta one'}}),
    );
    expect(errors).toEqual([
      'clients/cli/commands/beta/beta-one.doc.mjs is not the CommandDoc of any registered command',
    ]);
  });

  it('fails when index.mjs has no command registry', async () => {
    const tree = cliTree(CONFORMING);
    fs.writeFileSync(path.join(tree, 'clients/cli/index.mjs'), 'export {};\n');
    const {errors} = await checkCommandLayout(tree);
    expect(errors[0]).toBe(
      'found no `commands` registry in clients/cli/index.mjs — has it moved? Update this check.',
    );
  });
});

describe('the repository', () => {
  it('puts every command and CommandDoc at its INV6 path', async () => {
    const {errors, commands} = await checkCommandLayout(
      path.join(REPO_ROOT, 'packages/cli'),
    );
    expect(commands).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('passes pnpm check:cli-structure', () => {
    const res = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts/check-cli-structure.mjs')],
      {encoding: 'utf8'},
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/\d+ command\(s\) checked for INV6/);
  });
});
