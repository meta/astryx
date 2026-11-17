// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A template doc that writes a command with a `{@command …}` token never
 * prints that token: `astryx template`, `astryx build` and `astryx search`
 * show the command with the project's command name in text and as the bare
 * `astryx …` command in JSON (spec:AST-081 FR5). A template's source prints
 * byte for byte.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';

vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

/** The command name the fixture's integration declares for running the CLI. */
const RUN = 'acme astryx';
const PAGE = 'Zebra roster board: read {@command docs icons} first.';
const BLOCK = 'Zebra roster strip: read {@command docs icons} first.';
const SOURCE =
  '// Run `astryx docs icons` for icons.\nexport default function Page() { return null; }\n';

/** @type {string} */
let dir;

beforeAll(() => {
  // Under the repository so the project resolves the workspace's Core.
  dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-template-doc-tokens-'));
  const pkg = path.join(dir, 'node_modules', '@acme', 'kit');
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
    `export default ${JSON.stringify({cliCommand: RUN, templates: './templates'})};\n`,
  );
  for (const [name, type, description] of [
    ['zebra-roster', 'page', PAGE],
    ['ZebraStrip', 'block', BLOCK],
  ]) {
    fs.writeFileSync(
      path.join(pkg, 'templates', `${name}.doc.mjs`),
      `export default ${JSON.stringify({
        type,
        name,
        category: 'Acme',
        description,
        keywords: ['zebra', 'roster'],
      })};\n`,
    );
    fs.writeFileSync(path.join(pkg, 'templates', `${name}.tsx`), SOURCE);
  }
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} out */
function expectText(out) {
  expect(out).toContain(
    `Zebra roster board: read \`${RUN} docs icons\` first.`,
  );
  expect(out).not.toContain('{@command');
}

/** @param {string} out */
function expectJson(out) {
  expect(out).toContain('Zebra roster board: read `astryx docs icons` first.');
  expect(out).not.toContain('{@command');
  expect(out).not.toContain(RUN);
}

describe('astryx template', () => {
  it('the list, in text and JSON', async () => {
    const text = await runCli(['template', '--list'], dir);
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(['template', '--list', '--json'], dir);
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });

  it('the skeleton, in text and JSON', async () => {
    const text = await runCli(['template', 'zebra-roster', '--skeleton'], dir);
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(
      ['template', 'zebra-roster', '--skeleton', '--json'],
      dir,
    );
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });

  it('the source prints byte for byte', async () => {
    const r = await runCli(['template', 'zebra-roster'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(SOURCE.trimEnd());
    const json = await runCli(['template', 'zebra-roster', '--json'], dir);
    expect(JSON.parse(json.stdout).data.source).toBe(SOURCE);
  });
});

describe('astryx build', () => {
  it('names the template with its rendered description', async () => {
    const text = await runCli(['build', 'zebra roster board'], dir);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('zebra-roster');
    expect(text.stdout).not.toContain('{@command');
    expect(text.stdout).toContain(`\`${RUN} docs icons\``);
    const verbose = await runCli(
      ['build', 'zebra roster board', '--verbose'],
      dir,
    );
    expect(verbose.code).toBe(0);
    expectText(verbose.stdout);
    expect(verbose.stdout).not.toContain('`astryx docs icons`');
    const json = await runCli(['build', 'zebra roster board', '--json'], dir);
    expect(json.code).toBe(0);
    expect(json.stdout).toContain('zebra-roster');
    expect(json.stdout).not.toContain('{@command');
    expect(json.stdout).not.toContain(RUN);
  });
});

describe('astryx search', () => {
  it('a template hit, in text and JSON', async () => {
    const text = await runCli(
      ['search', 'zebra roster', '--type', 'template', '--verbose'],
      dir,
    );
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(
      ['search', 'zebra roster', '--type', 'template', '--json'],
      dir,
    );
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });
});
