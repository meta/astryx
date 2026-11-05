// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

import {
  CLI_COMMANDS,
  findRunnerCommands,
  runnerCommandsIn,
} from './runner-commands.mjs';

const COMMAND_DOCS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../clients/cli/commands',
);

describe('runnerCommandsIn', () => {
  it('finds an Astryx command after a project runner, with the bare command', () => {
    expect(runnerCommandsIn('Run `pnpm exec astryx docs theme`.')).toEqual([
      {written: 'pnpm exec astryx docs', bare: 'astryx docs', download: false},
    ]);
    expect(runnerCommandsIn('yarn astryx component Button')).toEqual([
      {
        written: 'yarn astryx component',
        bare: 'astryx component',
        download: false,
      },
    ]);
  });

  it('always flags the unscoped name after a download runner, even alone', () => {
    expect(runnerCommandsIn('npx astryx doctor; or `bunx astryx`')).toEqual([
      {written: 'npx astryx doctor', bare: 'astryx doctor', download: true},
      {written: 'bunx astryx', bare: 'astryx', download: true},
    ]);
  });

  it('leaves the scoped package, a project runner named alone, and other tools', () => {
    expect(
      runnerCommandsIn(
        'Install with `npx @astryxdesign/cli init`. Run it through Yarn (`yarn astryx`). Format with `npx prettier --write`. `npx astryx-tools init`.',
      ),
    ).toEqual([]);
  });

  it('flags `bun x`, a versioned name, and a name that ends a sentence', () => {
    expect(
      runnerCommandsIn(
        'Run `bun x astryx doctor`, `npx astryx@latest init` or `npx astryx@0.7.1 docs`. Or just npx astryx.',
      ),
    ).toEqual([
      {written: 'bun x astryx doctor', bare: 'astryx doctor', download: true},
      {
        written: 'npx astryx@latest init',
        bare: 'astryx init',
        download: true,
      },
      {written: 'npx astryx@0.7.1 docs', bare: 'astryx docs', download: true},
      {written: 'npx astryx', bare: 'astryx', download: true},
    ]);
    expect(
      runnerCommandsIn('Edit astryx.config, not npx astryx.config.'),
    ).toEqual([]);
  });

  it('reads a runner and its command within one line, and needs a CLI command after a project runner', () => {
    expect(
      runnerCommandsIn(
        'Through Yarn, yarn astryx runs the copy in node_modules.\n```\npnpm astryx\nyarn astryx\n```',
      ),
    ).toEqual([]);
    expect(runnerCommandsIn('npx astryx runs an unrelated package')).toEqual([
      {written: 'npx astryx', bare: 'astryx', download: true},
    ]);
    expect(runnerCommandsIn('pnpm\nastryx docs')).toEqual([]);
    expect(
      runnerCommandsIn('Run `npx -y astryx doctor` or `npx --yes astryx`.'),
    ).toEqual([
      {written: 'npx -y astryx doctor', bare: 'astryx doctor', download: true},
      {written: 'npx --yes astryx', bare: 'astryx', download: true},
    ]);
  });
});

describe('findRunnerCommands', () => {
  it('reads a topic that refers back to itself once, without crashing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-self-'));
    const file = path.join(dir, 'acme-setup.doc.mjs');
    fs.writeFileSync(
      file,
      [
        'const section = {',
        "  title: 'Overview',",
        "  content: [{type: 'prose', text: 'Run `yarn astryx docs` first.'}],",
        '};',
        "const doc = {type: 'generic', name: 'acme-setup', sections: [section]};",
        'section.self = section;',
        'doc.again = doc;',
        'export default doc;',
        '',
      ].join('\n'),
    );

    const found = await findRunnerCommands({
      records: [{name: 'acme-setup', path: file}],
    });

    expect(
      found.map(({command, section, line}) => ({command, section, line})),
    ).toEqual([{command: 'yarn astryx docs', section: 'Overview', line: 3}]);
  });
});

describe('CLI_COMMANDS', () => {
  it('names every top-level command the CLI documents, and nothing else', () => {
    const documented = fs
      .readdirSync(COMMAND_DOCS)
      .filter(file => file.endsWith('.doc.mjs'))
      .map(file => file.slice(0, -'.doc.mjs'.length))
      .filter(name => !name.includes('-') || name === 'gap-report')
      // The experimental group is no stable command, so a runner note never
      // names it (spec:AST-084 FR0).
      .filter(name => name !== 'experimental');
    expect([...CLI_COMMANDS].sort()).toEqual(
      [...new Set([...documented, 'help'])].sort(),
    );
  });
});
