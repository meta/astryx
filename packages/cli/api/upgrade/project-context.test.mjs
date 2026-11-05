// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `loadProjectContext` agrees with Project on provider identity, so
 * `astryx upgrade` never runs codemods from a package Project set aside.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadProjectContext, selectIntegrationCodemodsFor} from './_adapter.mjs';

let tmpDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-upgrade-context-'));
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Install an integration package that ships one 0.2.0 codemod.
 * @param {string} name
 * @param {string} version
 * @param {Record<string, unknown>} [manifest]
 */
function installWithCodemod(name, version, manifest = {}) {
  const pkgDir = path.join(tmpDir, 'node_modules', ...name.split('/'));
  const codemodDir = path.join(pkgDir, 'codemods', '0.2.0');
  fs.mkdirSync(codemodDir, {recursive: true});
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({name, version}));
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({codemods: './codemods', ...manifest})};\n`,
  );
  fs.writeFileSync(
    path.join(codemodDir, 'rename.mjs'),
    "export default {type: 'code', title: 'Rename', transform: file => file.source};\n",
  );
}

/** @param {string[]} integrations */
function configure(integrations) {
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default ${JSON.stringify({integrations})};\n`,
  );
}

describe('loadProjectContext provider identity', () => {
  it('keeps codemods from a configured package the authored package sets aside', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    configure(['@acme/widgets']);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/renamed', version: '2.0.0-dev'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {providerId: '@acme/widgets'};\n",
    );

    const {integrations} = await loadProjectContext(tmpDir);
    expect(
      integrations.map(integration => [
        integration.name,
        Boolean(integration.__providerConflict),
      ]),
    ).toEqual([['@acme/widgets', true]]);
    expect(
      await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0'),
    ).toEqual([]);
  });

  it('still selects codemods from a configured package nothing else claims', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    configure(['@acme/widgets']);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));

    const {integrations} = await loadProjectContext(tmpDir);
    const selected = await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0');
    expect(selected.map(entry => entry.version)).toEqual(['0.2.0']);
  });

  it('sets aside an --integration extra that claims a configured provider ID', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    installWithCodemod('@acme/other', '1.0.0', {providerId: '@acme/widgets'});
    configure(['@acme/widgets']);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));
    // `--integration` specs resolve from the process cwd, as they always have.
    process.chdir(tmpDir);

    const {integrations} = await loadProjectContext(tmpDir, ['@acme/other']);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([
      ['@acme/widgets', null],
      ['@acme/other', '@acme/widgets'],
    ]);
  });

  it('runs the installed copy of a package that lists itself, not its work in progress', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    configure(['@acme/widgets']);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '3.0.0-dev'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {codemods: './codemods'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'codemods', '0.2.0'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'codemods', '0.2.0', 'local-wip.mjs'),
      "export default {type: 'code', title: 'Local WIP', transform: file => file.source};\n",
    );

    const {integrations} = await loadProjectContext(tmpDir);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.version,
        Boolean(integration.__local),
        Boolean(integration.__providerConflict),
      ]),
    ).toEqual([['@acme/widgets', '1.0.0', false, false]]);
    const selected = JSON.stringify(
      await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0'),
    );
    expect(selected).toContain('rename');
    expect(selected).not.toContain('local-wip');
  });

  it('runs the installed copy when the authored package is named with --integration', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    configure([]);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '3.0.0-dev'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {codemods: './codemods'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'codemods', '0.2.0'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'codemods', '0.2.0', 'local-wip.mjs'),
      "export default {type: 'code', title: 'Local WIP', transform: file => file.source};\n",
    );
    process.chdir(tmpDir);

    const {integrations} = await loadProjectContext(tmpDir, ['@acme/widgets']);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.version,
        Boolean(integration.__local),
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([['@acme/widgets', '1.0.0', false, null]]);
    const selected = JSON.stringify(
      await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0'),
    );
    expect(selected).toContain('rename');
    expect(selected).not.toContain('local-wip');
  });

  it("sets aside an --integration extra that claims an autolinked package's ID", async () => {
    installWithCodemod('@acme/a', '1.0.0');
    installWithCodemod('@acme/b', '1.0.0', {providerId: '@acme/a'});
    configure([]);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer', dependencies: {'@acme/a': '1.0.0'}}),
    );
    process.chdir(tmpDir);

    const {integrations} = await loadProjectContext(tmpDir, ['@acme/b']);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([['@acme/b', '@acme/a']]);
    expect(
      await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0'),
    ).toEqual([]);
  });

  it('runs an autolinked package the user names with --integration', async () => {
    installWithCodemod('@acme/a', '1.0.0');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer', dependencies: {'@acme/a': '1.0.0'}}),
    );
    process.chdir(tmpDir);

    const {integrations} = await loadProjectContext(tmpDir, ['@acme/a']);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([['@acme/a', null]]);
    const selected = await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0');
    expect(selected.map(entry => entry.version)).toEqual(['0.2.0']);
  });

  it('never reports a claimant that every other command uses as set aside', async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    installWithCodemod('@acme/renamed', '2.0.0', {providerId: '@acme/widgets'});
    configure(['@acme/widgets']);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: '@acme/widgets',
        version: '3.0.0-dev',
        dependencies: {'@acme/renamed': '2.0.0'},
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {providerId: '@acme/widgets-next'};\n",
    );

    const {integrations} = await loadProjectContext(tmpDir);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.version,
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([['@acme/widgets', '1.0.0', null]]);
  });

  it("sets aside an --integration extra that claims the authored package's ID", async () => {
    installWithCodemod('@acme/widgets', '1.0.0');
    configure([]);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/renamed', version: '2.0.0-dev'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {providerId: '@acme/widgets'};\n",
    );
    process.chdir(tmpDir);

    const {integrations} = await loadProjectContext(tmpDir, ['@acme/widgets']);
    expect(
      integrations.map(integration => [
        integration.name,
        integration.__providerConflict?.claimedBy ?? null,
      ]),
    ).toEqual([['@acme/widgets', '@acme/renamed']]);
    expect(
      await selectIntegrationCodemodsFor(integrations, '0.1.0', '0.3.0'),
    ).toEqual([]);
  });
});
