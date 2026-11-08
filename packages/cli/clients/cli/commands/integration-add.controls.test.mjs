// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createProgram} from '../index.mjs';
import {buildManifest} from '../lib/manifest.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as fnDoc} from '../../../api/integration/integrationAdd.doc.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-integration-add-controls-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify({name: '@acme/widgets', version: '1.0.0'})}\n`,
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** What each `integration add` control must define on the discovery surfaces. */
const DEFINITIONS = {
  name: [
    'PascalCase for component',
    'lowercase kebab-case for template, codemod, and theme',
    'letters, digits, _ and - for doc',
    'literal guidance line for agent-doc',
  ],
  '--type <type>': ['page (default) or block', 'only valid for template'],
  '--replaces <topic>': ['only valid for doc', 'not with --extends'],
  '--extends <topic>': ['only valid for doc', 'not with --replaces'],
  '--to <version>': ['Exact semver', 'required for codemod and only valid there'],
};

describe('integration add control definitions', () => {
  it('defines accepted values, defaults, and interactions in help', async () => {
    const program = await createProgram();
    const add = program.commands
      .find(command => command.name() === 'integration')
      ?.commands.find(command => command.name() === 'add');
    const help = add?.helpInformation() ?? '';

    for (const phrases of Object.values(DEFINITIONS)) {
      for (const phrase of phrases) expect(help).toContain(phrase);
    }
  });

  it('defines the same controls in the manifest', async () => {
    const manifest = buildManifest(await createProgram());
    const add = manifest.commands
      .find(command => command.name === 'integration')
      ?.subcommands?.find(command => command.name === 'integration add');
    /** @type {Record<string, string>} */
    const described = {};
    for (const arg of add?.arguments ?? []) described[arg.name] = arg.description;
    for (const option of add?.options ?? []) {
      described[option.flag] = option.description;
    }

    for (const [control, phrases] of Object.entries(DEFINITIONS)) {
      for (const phrase of phrases) {
        expect(described[control], control).toContain(phrase);
      }
    }
  });

  it('defines the same controls for integrationAdd()', () => {
    /** @param {string} name */
    const param = name => fnDoc.params?.find(item => item.name === name);

    for (const phrase of DEFINITIONS.name.slice(0, 3)) {
      expect(param('name')?.description).toContain(phrase);
    }
    expect(param('options.templateType')?.default).toBe("'page'");
    expect(param('options.replaces')?.description).toContain(
      'not with options.extends',
    );
    expect(param('options.extends')?.description).toContain(
      'not with options.replaces',
    );
    expect(param('options.to')?.description).toContain('Exact target semver');
    expect(param('options.to')?.description).toContain('only valid there');
  });

  it('behaves as the definitions say', async () => {
    const both = await runCli(
      [
        'integration',
        'add',
        'doc',
        'acme-guide',
        '--replaces',
        'getting-started',
        '--extends',
        'theme',
        '--json',
      ],
      tmpDir,
    );
    expect(both.status).toBe(1);
    expect(JSON.parse(both.stdout).code).toBe('ERR_INVALID_ARGUMENT');

    const looseVersion = await runCli(
      ['integration', 'add', 'codemod', 'rename-prop', '--to', '1.2', '--json'],
      tmpDir,
    );
    expect(looseVersion.status).toBe(1);
    expect(JSON.parse(looseVersion.stdout).code).toBe('ERR_INVALID_ARGUMENT');

    const typeElsewhere = await runCli(
      ['integration', 'add', 'component', 'AcmeWidget', '--type', 'page', '--json'],
      tmpDir,
    );
    expect(typeElsewhere.status).toBe(1);
    expect(JSON.parse(typeElsewhere.stdout).code).toBe('ERR_INVALID_ARGUMENT');

    const page = await runCli(
      ['integration', 'add', 'template', 'acme-page', '--json'],
      tmpDir,
    );
    expect(page.status).toBe(0);
    expect(
      fs.readFileSync(path.join(tmpDir, 'templates', 'acme-page.doc.mjs'), 'utf-8'),
    ).toContain("type: 'page'");
  });
});
