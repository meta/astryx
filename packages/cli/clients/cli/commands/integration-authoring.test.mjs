// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

let tmpDir;

function parseEnvelope(stdout) {
  return JSON.parse(stdout.trim());
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-integration-authoring-cli-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      files: [],
    })}\n`,
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration authoring CLI', () => {
  it('dry-runs and writes through the same generic add command', async () => {
    const planned = await runCli(
      ['integration', 'add', 'component', 'AcmeWidget', '--dry-run', '--json'],
      tmpDir,
    );
    expect(planned.status).toBe(0);
    const plan = parseEnvelope(planned.stdout);
    expect(plan).toMatchObject({
      type: 'integration.add',
      data: {
        kind: 'component',
        name: 'AcmeWidget',
        written: false,
        dryRun: true,
      },
    });
    expect(fs.existsSync(path.join(tmpDir, 'components'))).toBe(false);

    const written = await runCli(
      ['integration', 'add', 'component', 'AcmeWidget', '--json'],
      tmpDir,
    );
    expect(written.status).toBe(0);
    const receipt = parseEnvelope(written.stdout);
    expect(receipt).toMatchObject({
      type: 'integration.add',
      data: {
        kind: 'component',
        name: 'AcmeWidget',
        root: {path: './components', created: true},
        manifest: 'astryx.integration.mjs',
        written: true,
        dryRun: false,
      },
    });
    expect(receipt.data.files).toEqual(plan.data.files);
  });

  it('makes generated contributions visible without publishing or a config', async () => {
    for (const args of [
      ['component', 'AcmeWidget'],
      ['doc', 'local-guide'],
      ['template', 'local-page'],
      ['theme', 'ocean'],
    ]) {
      const added = await runCli(
        ['integration', 'add', ...args, '--json'],
        tmpDir,
      );
      expect(added.status).toBe(0);
    }

    const components = parseEnvelope(
      (await runCli(['component', '--list', '--json'], tmpDir)).stdout,
    );
    expect(
      Object.values(components.data.components)
        .flat()
        .some(
          component =>
            component.name === 'AcmeWidget' &&
            component.package === '@acme/widgets',
        ),
    ).toBe(true);

    const docs = parseEnvelope(
      (await runCli(['docs', 'local-guide', '--json'], tmpDir)).stdout,
    );
    expect(docs.data).toMatchObject({
      name: 'local-guide',
    });

    const templates = parseEnvelope(
      (await runCli(['template', '--list', '--json'], tmpDir)).stdout,
    );
    expect(templates.data).toContainEqual(
      expect.objectContaining({
        id: 'local-page',
        package: '@acme/widgets',
      }),
    );

    const themes = parseEnvelope(
      (await runCli(['theme', 'list', '--json'], tmpDir)).stdout,
    );
    expect(themes.data).toContainEqual(
      expect.objectContaining({slug: 'ocean', package: '@acme/widgets'}),
    );
  });

  it('pack-check rejects a generated component without an exports map (no-map false green)', async () => {
    const added = await runCli(
      ['integration', 'add', 'component', 'AcmeWidget', '--json'],
      tmpDir,
    );
    expect(added.status).toBe(0);

    const checked = await runCli(['integration', 'verify', '--json'], tmpDir);
    // Without an exports map, the extensionless import cannot resolve —
    // pack-check must fail, not false-green.
    expect(checked.status).not.toBe(0);
    const envelope = parseEnvelope(checked.stdout);
    expect(envelope).toMatchObject({
      type: 'integration.pack-check',
      data: {
        name: '@acme/widgets',
        packable: false,
      },
    });
    expect(envelope.data.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('AcmeWidget'),
      }),
    );
  });

  it("verify carries each issue's fix, file, and line in JSON and prints them in text", async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      `${JSON.stringify({
        name: '@acme/widgets',
        version: '1.0.0',
        files: ['astryx.integration.mjs', 'docs'],
      })}\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'deploying.doc.mjs'),
      "export const docs = {type: 'generic', name: 'deploying', title: 'Deploying', description: 'How to deploy.', sections: [{title: 'Overview', content: [{type: 'prose', text: 'Ship it.'}]}]};\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'ghost.doc.zh.mjs'),
      "export default {title: 'ghost'};\n",
    );

    const json = parseEnvelope(
      (await runCli(['integration', 'verify', '--json'], tmpDir)).stdout,
    );
    const orphans = json.data.issues.filter(issue =>
      issue.code.endsWith('orphan_doc_overlay'),
    );
    expect(orphans.map(issue => issue.code).sort()).toEqual([
      'orphan_doc_overlay',
      'packed_orphan_doc_overlay',
    ]);
    for (const issue of orphans) {
      expect(issue).toMatchObject({
        file: 'docs/ghost.doc.zh.mjs',
        line: 1,
        fix: expect.stringContaining('Delete docs/ghost.doc.zh.mjs'),
      });
    }

    const text = (await runCli(['integration', 'verify'], tmpDir)).stdout;
    expect(text).toContain('file: docs/ghost.doc.zh.mjs:1');
    expect(text).toContain(`fix: ${orphans[0].fix}`);
  });

  it('keeps `integration pack --check` as a deprecated alias of `integration verify`', async () => {
    // The old spelling runs the same check: the same JSON, the same exit code.
    const verify = await runCli(['integration', 'verify', '--json'], tmpDir);
    const old = await runCli(
      ['integration', 'pack', '--check', '--json'],
      tmpDir,
    );
    expect(old.status).toBe(verify.status);
    const verifyEnvelope = parseEnvelope(verify.stdout);
    const oldEnvelope = parseEnvelope(old.stdout);
    expect(oldEnvelope.type).toBe('integration.pack-check');
    expect(oldEnvelope.type).toBe(verifyEnvelope.type);
    expect(oldEnvelope.data.packable).toBe(verifyEnvelope.data.packable);
    expect(oldEnvelope.data.issues).toEqual(verifyEnvelope.data.issues);
    // The global flag may come first, as agents usually write it.
    const lead = await runCli(
      ['--json', 'integration', 'pack', '--check'],
      tmpDir,
    );
    expect(parseEnvelope(lead.stdout).type).toBe('integration.pack-check');
    // In text, it says to use the new name, on stderr, so stdout is the same.
    const text = await runCli(['integration', 'pack', '--check'], tmpDir);
    const verifyText = await runCli(['integration', 'verify'], tmpDir);
    expect(text.status).toBe(verifyText.status);
    expect(text.stdout).toBe(verifyText.stdout);
    expect(text.stderr).toContain('`integration pack --check` is deprecated');
    expect(text.stderr).toContain(' integration verify`');
    // Without --check it fails, as it did, and points only at the new name:
    // suggesting `--check` would send people to the deprecated spelling.
    const bare = await runCli(['integration', 'pack'], tmpDir);
    expect(bare.status).not.toBe(0);
    expect(bare.stderr).toContain(
      '`integration pack` is now `integration verify`',
    );
    expect(bare.stderr).toContain(' integration verify`');
    expect(bare.stderr).toContain('npm pack');
    expect(bare.stderr).not.toContain('--check');
    const bareJson = await runCli(['--json', 'integration', 'pack'], tmpDir);
    expect(parseEnvelope(bareJson.stdout)).toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      error: expect.stringContaining(' integration verify`'),
    });
    // Help lists it, marked deprecated: nothing is hidden.
    const help = await runCli(['integration', '--help'], tmpDir);
    expect(help.stdout).toMatch(
      /pack .*Deprecated: the old name of `integration verify`/,
    );
    // `verify` itself takes no --check.
    const flag = await runCli(['integration', 'verify', '--check'], tmpDir);
    expect(flag.status).not.toBe(0);
    expect(flag.stderr).toContain("unknown option '--check'");
    // An unknown subcommand with a flag names the subcommand, in text and JSON.
    const unknown = await runCli(['integration', 'bogus', '--check'], tmpDir);
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("unknown subcommand 'integration bogus'");
    expect(unknown.stderr).toMatch(/verify\s+\(available subcommand\)/);
    const unknownJson = await runCli(
      ['integration', 'bogus', '--check', '--json'],
      tmpDir,
    );
    expect(parseEnvelope(unknownJson.stdout)).toMatchObject({
      code: 'ERR_UNKNOWN_SUBCOMMAND',
      error: "unknown subcommand 'integration bogus'",
      suggestions: expect.arrayContaining([
        expect.objectContaining({name: 'verify'}),
      ]),
    });
    // A flag alone is an unknown option, not an unknown subcommand.
    const flagOnly = await runCli(['integration', '--bogus'], tmpDir);
    expect(flagOnly.status).not.toBe(0);
    expect(flagOnly.stderr).toContain("unknown option '--bogus'");
  });

  it('refuses kind-specific options on another kind', async () => {
    const result = await runCli(
      [
        'integration',
        'add',
        'component',
        'AcmeWidget',
        '--to',
        '1.0.0',
        '--json',
      ],
      tmpDir,
    );
    expect(result.status).not.toBe(0);
    expect(parseEnvelope(result.stdout)).toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      error: 'Option "to" does not apply to integration kind "component".',
    });
  });
});
