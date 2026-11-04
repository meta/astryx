// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx integration check`: every source check in one command, the
 * summary, exit codes with and without `--strict`, and the `--strict`
 * failures, in text and JSON alike.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {discoverCoreTemplates} from '../../../foundation/discovery/template-adapter.mjs';

/** @type {string} */
let tmpDir;

beforeEach(() => {
  // Under the repository, so the components check resolves Core.
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-integration-check-cli-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * A package whose one page template takes a Core template's id: one warning
 * (`templates` conflict). The doc matches TemplateDoc, so no other check
 * warns about it.
 * @param {{id: string, replaces?: string, extraManifest?: string, dir?: string}} options
 */
function writePackage({id, replaces, extraManifest = '', dir = tmpDir}) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    `export default {templates: './templates'${extraManifest}};\n`,
  );
  fs.mkdirSync(path.join(dir, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'templates', `${id}.doc.mjs`),
    `export default {type: 'page', name: 'Integration template', displayName: 'Integration template', description: 'fixture'${replaces == null ? '' : `, replaces: ${JSON.stringify(replaces)}`}};\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'templates', `${id}.tsx`),
    'export default function Fixture() { return null; }\n',
  );
}

async function coreTemplateId() {
  const core = (await discoverCoreTemplates()).find(
    template => template.type === 'page',
  );
  expect(core).toBeDefined();
  return /** @type {{dirName: string}} */ (core).dirName;
}

describe('astryx integration check', () => {
  it('runs validate, components, templates, and docs in order, then a summary, and exits 0 on a warning', async () => {
    writePackage({id: await coreTemplateId()});

    const run = await runCli(['integration', 'check'], tmpDir);

    const order = [
      'Validating integration: @acme/widgets@1.2.3',
      'Checking integration components: @acme/widgets@1.2.3',
      'Checking integration templates: @acme/widgets@1.2.3',
      'Checking integration docs: @acme/widgets@1.2.3',
      'Integration check: @acme/widgets@1.2.3',
    ].map(line => run.stdout.indexOf(line));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(run.stdout).toContain('Consider renaming');
    expect(run.stdout).not.toContain('Failing under --strict');
    expect(run.stdout).toContain(
      '[ok] 0 errors, 1 warning, 0 skipped. No check failed;',
    );
    // Each check's output stands apart from the next.
    const lines = run.stdout.split('\n');
    for (const header of [
      'Checking integration components:',
      'Checking integration templates:',
      'Checking integration docs:',
    ]) {
      expect(lines[lines.findIndex(line => line.includes(header)) - 1]).toBe(
        '',
      );
    }
    expect(run.status).toBe(0);
  });

  it('--strict lists the warning again as an error, after the checks, and exits 1', async () => {
    const id = await coreTemplateId();
    writePackage({id});

    const run = await runCli(['integration', 'check', '--strict'], tmpDir);

    expect(run.stdout).toContain(
      'Integration check: @acme/widgets@1.2.3 (strict)',
    );
    const block = run.stdout.indexOf('Failing under --strict');
    expect(block).toBeGreaterThan(
      run.stdout.indexOf('Checking integration docs:'),
    );
    expect(run.stdout.slice(block)).toMatch(
      /severity: \[fail\]\ncheck: +templates\ncode: +template_id_conflict\n/,
    );
    expect(run.stdout).toContain(
      '[fail] 0 errors, 1 warning, 0 skipped. --strict fails on every warning and on skipped work;',
    );
    expect(run.status).toBe(1);
  });

  it('--strict prints each finding once: its message above, its code in the failing list', async () => {
    const id = await coreTemplateId();
    writePackage({id});

    const run = await runCli(['integration', 'check', '--strict'], tmpDir);
    const json = await runCli(
      ['integration', 'check', '--strict', '--json'],
      tmpDir,
    );
    const [failure] = JSON.parse(json.stdout.trim()).data.failures;

    expect(run.stdout.split(failure.message).length - 1).toBe(1);
    expect(
      run.stdout.slice(run.stdout.indexOf('Failing under --strict')),
    ).toContain('template_id_conflict');
  });

  it('--json carries each check with its own envelope, the --strict failures, and exits as the text does', async () => {
    const id = await coreTemplateId();
    writePackage({id});

    const run = await runCli(
      ['integration', 'check', '--strict', '--json'],
      tmpDir,
    );

    const parsed = JSON.parse(run.stdout.trim());
    expect(parsed.type).toBe('integration.check');
    expect(parsed.data).toMatchObject({
      validated: true,
      name: '@acme/widgets',
      version: '1.2.3',
      strict: true,
      errors: 0,
      warnings: 1,
      skipped: [],
      failed: true,
    });
    expect(parsed.data.checks.map(check => check.check)).toEqual([
      'validate',
      'components',
      'templates',
      'docs',
    ]);
    const templates = parsed.data.checks[2];
    expect(templates).toMatchObject({
      check: 'templates',
      errors: 0,
      warnings: 1,
      skipped: [],
      failed: false,
      response: {
        type: 'integration.template-conflicts',
        data: {conflicts: [expect.objectContaining({id, severity: 'warning'})]},
      },
    });
    expect(parsed.data.failures).toEqual([
      {
        check: 'templates',
        severity: 'error',
        code: 'template_id_conflict',
        message: templates.response.data.conflicts[0].message,
      },
    ]);
    expect(run.status).toBe(1);
  });

  it('exits 1 without --strict when one check fails on its own, and lists no failures', async () => {
    writePackage({id: 'acme-app-shell', replaces: 'missing-core-shell'});

    const text = await runCli(['integration', 'check'], tmpDir);
    const json = await runCli(['integration', 'check', '--json'], tmpDir);

    expect(text.stdout).toContain('missing_template_replacement_target');
    expect(text.stdout).toMatch(
      /\[fail\] [1-9]\d* errors?, .*Address the items marked \[fail\] above\./,
    );
    expect(text.stdout).not.toContain('Failing under --strict');
    expect(JSON.parse(json.stdout.trim()).data).toMatchObject({
      strict: false,
      failures: [],
      failed: true,
    });
    expect(text.status).toBe(1);
    expect(json.status).toBe(1);
  });

  it('counts a package with no manifest as skipped work: exit 0, and 1 with --strict', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/plain', version: '1.0.0'}),
    );

    const loose = await runCli(['integration', 'check'], tmpDir);
    expect(loose.stdout).toContain(
      "Nothing was checked: no astryx.integration.* found next to package.json. Run this command in an integration package's folder.",
    );
    // One cause, however many checks it stops: counted once.
    expect(loose.stdout).toContain('[ok] 0 errors, 0 warnings, 1 skipped.');
    expect(loose.status).toBe(0);

    const strict = await runCli(
      ['integration', 'check', '--strict', '--json'],
      tmpDir,
    );
    const {data} = JSON.parse(strict.stdout.trim());
    expect(data).toMatchObject({validated: false, errors: 0, failed: true});
    // One cause, however many checks it stops: listed once.
    expect(data.failures).toEqual([
      {
        check: 'validate',
        severity: 'error',
        code: 'missing_manifest',
        message:
          'No astryx.integration.* found next to package.json, so nothing was checked.',
      },
    ]);
    expect(strict.status).toBe(1);
  });

  it('exits 1 for no package.json, as validate does', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-pkg-'));
    try {
      const run = await runCli(['integration', 'check'], empty);
      expect(run.stdout).toContain(
        'Nothing was checked: no package.json found.',
      );
      expect(run.stdout).toContain('Integration check: (no package.json)');
      expect(run.stdout).toContain(
        '[fail] 1 error, 0 warnings, 0 skipped. No package.json was found here, so nothing was checked.',
      );
      expect(run.stdout).not.toContain('marked [fail] above');
      expect(run.status).toBe(1);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('states in its help that it is the CI check, the line to add, and what --strict promises', async () => {
    const run = await runCli(['integration', 'check', '--help'], tmpDir);

    expect(run.stdout).toContain(
      "The CI check for an integration package's own build",
    );
    expect(run.stdout).toContain(
      '"typecheck": "tsc --noEmit && astryx integration check --strict"',
    );
    expect(run.stdout).toContain(
      'A new check or failure code joins only in a minor release, named in the release notes; until then, a malformed `cliCommand` is reported as a note (`invalid_cli_command`) that fails nothing.',
    );
    expect(run.stdout).toContain('integration verify');
    expect(run.stdout).toContain('against the package in the current folder');
    expect(run.stdout).not.toContain('[package]');
  });

  it('reports a malformed cliCommand as a note beside the issues, which --strict does not fail', async () => {
    // A unique template id, so nothing else warns.
    writePackage({
      id: 'acme-notes-only-fixture',
      extraManifest: ", cliCommand: ' acme astryx\\n'",
    });

    const json = await runCli(
      ['--json', 'integration', 'check', '--strict'],
      tmpDir,
    );
    const envelope = JSON.parse(json.stdout);
    const validate = envelope.data.checks[0].response.data;
    expect(validate.issues.map((/** @type {any} */ i) => i.code)).not.toContain(
      'invalid_cli_command',
    );
    expect(validate.notes).toEqual([
      {code: 'invalid_cli_command', message: expect.any(String), next: true},
    ]);
    expect(envelope.data.failed).toBe(false);
    expect(json.status).toBe(0);

    const text = await runCli(['integration', 'check'], tmpDir);
    expect(
      text.stdout
        .split('\n')
        .filter(line => line.startsWith('note (invalid_cli_command): ')),
    ).toHaveLength(1);
  });

  it('--next counts next notes as warnings, and --strict --next fails on them', async () => {
    writePackage({
      id: 'acme-next-fixture',
      extraManifest: ", cliCommand: ' acme astryx\\n'",
    });

    const plain = JSON.parse(
      (await runCli(['--json', 'integration', 'check'], tmpDir)).stdout,
    ).data;
    expect(plain).toMatchObject({next: false, upcoming: 1, warnings: 0});

    const next = await runCli(['--json', 'integration', 'check', '--next'], tmpDir);
    const nextData = JSON.parse(next.stdout).data;
    expect(nextData).toMatchObject({next: true, upcoming: 1, warnings: 1, failed: false});
    expect(nextData.checks[0].warnings).toBe(1);
    expect(next.status).toBe(0);

    const strict = await runCli(
      ['--json', 'integration', 'check', '--strict', '--next'],
      tmpDir,
    );
    const strictData = JSON.parse(strict.stdout).data;
    expect(strictData.failed).toBe(true);
    expect(strictData.failures).toContainEqual(
      expect.objectContaining({check: 'validate', code: 'invalid_cli_command'}),
    );
    expect(strict.status).toBe(1);

    const text = await runCli(['integration', 'check', '--next'], tmpDir);
    expect(text.stdout).toContain('note (invalid_cli_command): [next minor] ');
    expect(text.stdout).toContain('(next)');
  });

  it('takes no package name: one passed is an error, not a check of the current folder', async () => {
    writePackage({id: 'acme-page'});

    const run = await runCli(['integration', 'check', '@acme/widgets'], tmpDir);

    expect(run.stderr).toContain('too many arguments');
    expect(run.stdout).not.toContain('Integration check:');
    expect(run.status).toBe(1);
  });
});

describe('a copied passage', () => {
  const passage =
    'Themes cannot style the layer that holds a menu or a popover, so a menu ' +
    'keeps the default surface color until the next release adds a token for it.';

  function writeCopiedDocs() {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    for (const name of ['acme-setup', 'acme-menus']) {
      const doc = {
        type: 'generic',
        name,
        title: 'Fixture',
        description: 'Fixture topic.',
        sections: [
          {title: 'Overview', content: [{type: 'prose', text: passage}]},
        ],
      };
      fs.writeFileSync(
        path.join(tmpDir, 'docs', `${name}.doc.mjs`),
        `export default ${JSON.stringify(doc)};\n`,
      );
    }
  }

  it('keeps doctor integration docs at exit 0, and fails integration check --strict', async () => {
    writeCopiedDocs();

    const doctor = await runCli(['doctor', 'integration', 'docs'], tmpDir);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('1 copied passage(s)');

    const loose = await runCli(['integration', 'check'], tmpDir);
    expect(loose.status).toBe(0);

    const strict = await runCli(['integration', 'check', '--strict'], tmpDir);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain('copied_passage');
  });
});

describe('a padding phrase', () => {
  it('keeps doctor integration docs at exit 0, and fails integration check --strict', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {
          title: 'Overview',
          content: [{type: 'prose', text: 'In order to start, run the setup.'}],
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc)};\n`,
    );

    const doctor = await runCli(['doctor', 'integration', 'docs'], tmpDir);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('1 fluff finding(s)');

    const strict = await runCli(['integration', 'check', '--strict'], tmpDir);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain('doc_fluff');
  });
});

describe('a stray doc pointer', () => {
  it('keeps doctor integration docs at exit 0, and fails integration check --strict', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {
          title: 'Overview',
          content: [
            {type: 'prose', text: 'The theme is in `astryx docs theme`.'},
          ],
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc)};\n`,
    );

    const doctor = await runCli(['doctor', 'integration', 'docs'], tmpDir);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('1 stray doc pointer(s)');
    expect(doctor.stdout).toContain('{@link @astryxdesign/cli:generic:theme}');

    const strict = await runCli(['integration', 'check', '--strict'], tmpDir);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain('stray_doc_pointer');
  });
});
describe('a command written with a runner', () => {
  it('is a note in doctor integration validate, and integration check --strict still passes', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {
          title: 'Overview',
          content: [{type: 'code', lang: 'bash', code: 'npx astryx doctor'}],
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc)};\n`,
    );

    const doctor = await runCli(['doctor', 'integration', 'validate'], tmpDir);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain(
      'note (runner_command): [next minor] docs/acme-setup.doc.mjs:',
    );
    expect(doctor.stdout).toContain('Write the token `{@command doctor}`');

    const strict = await runCli(
      ['--json', 'integration', 'check', '--strict'],
      tmpDir,
    );
    expect(strict.status).toBe(0);
    const validate = JSON.parse(strict.stdout).data.checks.find(
      (/** @type {any} */ each) => each.check === 'validate',
    ).response.data;
    expect(validate.notes.map((/** @type {any} */ note) => note.code)).toEqual([
      'runner_command',
    ]);
  });
});
