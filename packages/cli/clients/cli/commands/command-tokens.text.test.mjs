// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A command a component doc writes with a `{@command …}` token prints, in
 * text, with the command name the picker chooses for the project, and in
 * JSON as the bare `astryx …` command (spec:AST-081 FR5). Component docs
 * follow the same rule as `astryx docs`; a verbatim block, such as a
 * template's source, keeps its bytes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';
import {runWithCliDoor} from '../../../foundation/env/cli-command.mjs';

vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

/** The command name the fixture's integration declares for running the CLI. */
const RUN = 'acme astryx';

/** @type {string} */
let dir;

beforeAll(() => {
  // Under the repository so the project resolves the workspace's Core.
  dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-command-tokens-'));
  const pkg = path.join(dir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
  fs.mkdirSync(path.join(pkg, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@acme/kit': '1.0.0'}}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({
      cliCommand: RUN,
      components: './components',
      templates: './templates',
    })};\n`,
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'AcmeCard.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeCard',
      displayName: 'AcmeCard',
      import: '@acme/kit/components/AcmeCard',
      usage: {description: 'A card. Read {@command docs icons} first.'},
      props: [
        {
          name: 'tone',
          type: 'string',
          description: 'Its tone. {@command docs tokens} lists them.',
        },
      ],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'AcmeCard.tsx'),
    'export function AcmeCard() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkg, 'templates', 'acme-board.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'page',
      name: 'acme-board',
      category: 'Acme - Pages',
      description: 'A board.',
    })};\n`,
  );
  fs.writeFileSync(
    path.join(pkg, 'templates', 'acme-board.tsx'),
    '// Run `astryx docs icons` for icons.\nexport default function Page() { return null; }\n',
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('component docs', () => {
  for (const detail of ['full', 'compact', 'brief']) {
    it(`text at --detail ${detail} prints the command with the picked name`, async () => {
      const r = await runCli(
        ['component', 'AcmeCard', '--detail', detail],
        dir,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toContain(`\`${RUN} docs icons\``);
      expect(r.stdout).not.toContain('`astryx docs icons`');
    });
  }

  it('text from --props prints the command with the picked name', async () => {
    const r = await runCli(['component', 'AcmeCard', '--props'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`\`${RUN} docs tokens\``);
  });

  it("a bare command in a Core prop description shows with the host's command", async () => {
    // A project with no integration that declares its own command, so the
    // host's door names the command.
    const plain = path.join(dir, 'plain');
    fs.mkdirSync(plain, {recursive: true});
    fs.writeFileSync(path.join(plain, 'package.json'), '{"name": "plain"}');
    const r = await runWithCliDoor('host astryx', () =>
      runCli(['component', 'CheckboxInput', '--props'], plain),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('See `host astryx docs icons`');
  });

  it('JSON keeps the bare command', async () => {
    const r = await runCli(['component', 'AcmeCard', '--json'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('`astryx docs icons`');
    expect(r.stdout).not.toContain(RUN);
  });
});

describe('a verbatim block', () => {
  it("a template's source prints as written", async () => {
    const r = await runCli(['template', 'acme-board'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('// Run `astryx docs icons` for icons.');
  });
});
