// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hermetic tests for the compact integration-issue nudge.
 *
 * Builds loaded-integration-shaped objects (as produced by
 * lib/integrations.mjs) with absolute contribution roots under the repo root
 * (process.cwd()) so any node_modules-style path stays within Vite's allowed
 * fs roots. We never load configs from /tmp. The helper is exercised directly;
 * stderr is captured to assert exactly one warning line per broken integration
 * and zero output in --json mode / for clean integrations.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {warnOnIntegrationIssues} from './integration-warnings.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

let tmpDir;
let errSpy;
let errLines;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-warn-it-'));
  errLines = [];
  errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errLines.push(args.join(' '));
  });
});

afterEach(() => {
  errSpy.mockRestore();
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Build a loaded-integration-shaped object. Roots are absolute (mirrors
 * loadIntegrations' resolveRoot).
 */
function loaded({
  name = '@acme/widgets',
  components,
  templates,
  codemods,
} = {}) {
  return {
    name,
    version: '1.0.0',
    components: components == null ? undefined : path.join(tmpDir, components),
    templates: templates == null ? undefined : path.join(tmpDir, templates),
    codemods: codemods == null ? undefined : path.join(tmpDir, codemods),
    __spec: name,
    __packageDir: tmpDir,
  };
}

describe('warnOnIntegrationIssues', () => {
  it('emits exactly one stderr line for an integration with issues', async () => {
    // Declared components root that does not exist on disk → missing_root.
    const integration = loaded({components: 'does-not-exist'});
    await warnOnIntegrationIssues([integration], {json: false});

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(
      /^Warning: @acme\/widgets has 1 integration issue\(s\)\. Run: .+ doctor integration validate @acme\/widgets$/,
    );
  });

  it('surfaces cross-package issues collected by Project', async () => {
    const project = {
      issues: async () => [
        {
          package: '@acme/later',
          code: 'ambiguous_template_replacement',
          severity: 'warning',
          message: 'Later configured replacement wins.',
        },
      ],
    };

    await warnOnIntegrationIssues(project, {json: false});

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(
      /^Warning: @acme\/later has 1 integration issue\(s\)\. Run: .+ doctor$/,
    );
  });

  it('emits nothing in --json mode (keeps stdout/JSON clean)', async () => {
    const integration = loaded({components: 'does-not-exist'});
    await warnOnIntegrationIssues([integration], {json: true});
    expect(errLines).toHaveLength(0);
  });

  it('warns for a manifest that failed to load, which declares no roots', async () => {
    // loadIntegrations records __loadError and no contribution roots, so every
    // on-disk check finds nothing — without the load error itself counting as
    // an issue, a stale manifest is silent everywhere.
    const integration = {
      ...loaded({name: '@acme/stale'}),
      __loadError: 'createIntegration is not a function',
    };
    await warnOnIntegrationIssues([integration], {json: false});

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(
      /^Warning: @acme\/stale has 1 integration issue\(s\)\. Run: .+ doctor integration validate @acme\/stale$/,
    );
  });

  it('emits nothing for an integration with no issues', async () => {
    // Existing components root with no broken contributions → no issues.
    const componentsRoot = path.join(tmpDir, 'components');
    fs.mkdirSync(componentsRoot, {recursive: true});
    const integration = loaded({components: 'components'});
    await warnOnIntegrationIssues([integration], {json: false});
    expect(errLines).toHaveLength(0);
  });

  it('emits nothing when there are no configured integrations', async () => {
    await warnOnIntegrationIssues([], {json: false});
    await warnOnIntegrationIssues(undefined, {json: false});
    expect(errLines).toHaveLength(0);
  });

  it('emits one line per broken integration', async () => {
    const a = loaded({name: '@acme/a', components: 'missing-a'});
    const b = loaded({name: '@acme/b', templates: 'missing-b'});
    await warnOnIntegrationIssues([a, b], {json: false});
    expect(errLines).toHaveLength(2);
    expect(errLines[0]).toContain('@acme/a');
    expect(errLines[1]).toContain('@acme/b');
  });

  it('never throws and never emits when a validator misbehaves', async () => {
    // A non-object entry must be skipped silently.
    await expect(
      warnOnIntegrationIssues([null, 'nope', 42], {json: false}),
    ).resolves.toBeUndefined();
    expect(errLines).toHaveLength(0);
  });

  it('prints the specific provider-conflict message via the array path', async () => {
    const conflict = {
      name: '@acme/charts',
      version: '2.0.0',
      __spec: '@acme/charts',
      __packageDir: tmpDir,
      __providerConflict: {
        providerId: '@acme/lab',
        claimedBy: '@acme/lab',
        message:
          '@acme/charts@2.0.0 and @acme/lab@1.0.0 both claim provider ID ' +
          '"@acme/lab". @acme/lab@1.0.0 loads first and is used; ' +
          '@acme/charts@2.0.0 contributes nothing until one package changes ' +
          'its providerId.',
      },
    };
    await warnOnIntegrationIssues([conflict], {json: false});

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toBe(`Warning: ${conflict.__providerConflict.message}`);
    // Must NOT print the generic validate pointer for a provider conflict.
    expect(errLines[0]).not.toContain('integration issue(s)');
  });

  it('prints the specific provider-conflict message via the Project path', async () => {
    const conflictMessage =
      '@acme/charts@2.0.0 and @acme/lab@1.0.0 both claim provider ID ' +
      '"@acme/lab". @acme/lab@1.0.0 loads first and is used; ' +
      '@acme/charts@2.0.0 contributes nothing until one package changes ' +
      'its providerId.';
    const project = {
      issues: async () => [
        {
          package: '@acme/charts@2.0.0',
          code: 'duplicate_provider',
          severity: 'warning',
          message: conflictMessage,
        },
      ],
    };

    await warnOnIntegrationIssues(project, {json: false});

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toBe(`Warning: ${conflictMessage}`);
    // Must NOT print the generic validate pointer for a provider conflict.
    expect(errLines[0]).not.toContain('integration issue(s)');
  });

  it('names an issue that compares with Core components itself outside a project, where doctor reads no Core', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-warn-out-'));
    const issues = [
      {
        package: '@acme/nav',
        code: 'missing_component_replacement_target',
        severity: 'error',
        message:
          'Component "AcmeNav" replaces "NoSuchNav", which is not a Core component.',
        needsCore: true,
      },
      {
        package: '@acme/nav',
        code: 'invalid_component_replacement',
        severity: 'error',
        message:
          'Component "SideNav" replaces "Button", but its own name is the Core component "SideNav".',
        needsCore: true,
      },
      {
        package: '@acme/pair',
        code: 'ambiguous_component_replacement',
        severity: 'error',
        message:
          '@acme/pair declares 2 components as replacements for Core component "Button".',
        needsCore: true,
      },
      {
        package: '@acme/odd',
        code: 'invalid_component_replacement',
        severity: 'error',
        message: 'Component "Odd" sets `replaces` to 5.',
      },
    ];
    try {
      await warnOnIntegrationIssues(
        {
          cwd: outside,
          // Installed for the computer: doctor names their other issues.
          loadedIntegrations: ['@acme/nav', '@acme/pair', '@acme/odd'].map(
            name => ({name, __computer: true}),
          ),
          issues: async () => issues,
        },
        {json: false},
      );
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }

    // The package is named unless the message already names it; one that
    // needs no Core, as a malformed `replaces`, still points to doctor.
    expect(errLines.slice(0, 3)).toEqual([
      `Warning: @acme/nav: ${issues[0].message}`,
      `Warning: @acme/nav: ${issues[1].message}`,
      `Warning: ${issues[2].message}`,
    ]);
    expect(errLines[3]).toMatch(
      /^Warning: @acme\/odd has 1 integration issue\(s\)\. Run: .+ doctor$/,
    );
    expect(errLines).toHaveLength(4);
  });

  it('points to doctor for that issue in a project with Core installed, where doctor reads that Core', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-warn-app-'));
    const issue = {
      package: '@acme/nav',
      code: 'missing_component_replacement_target',
      severity: 'error',
      message: 'Component "AcmeNav" replaces "NoSuchNav".',
      needsCore: true,
    };
    try {
      fs.writeFileSync(
        path.join(app, 'package.json'),
        JSON.stringify({dependencies: {'@astryxdesign/core': '1.0.0'}}),
      );
      const core = path.join(app, 'node_modules', '@astryxdesign', 'core');
      fs.mkdirSync(core, {recursive: true});
      fs.writeFileSync(
        path.join(core, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '1.0.0'}),
      );
      await warnOnIntegrationIssues(
        {cwd: app, issues: async () => [issue]},
        {json: false},
      );
      // The same project before its dependencies are installed: doctor reads
      // no Core there, so the line names the issue itself.
      fs.rmSync(path.join(app, 'node_modules'), {recursive: true, force: true});
      await warnOnIntegrationIssues(
        {cwd: app, issues: async () => [issue]},
        {json: false},
      );
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }

    expect(errLines).toHaveLength(2);
    expect(errLines[0]).toMatch(
      /^Warning: @acme\/nav has 1 integration issue\(s\)\. Run: .+ doctor$/,
    );
    expect(errLines[1]).toBe(`Warning: @acme/nav: ${issue.message}`);
  });

  it('outside a project, names its own check for an integration the folder loads itself, and prints a replacement finding that check does not show', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-warn-own-'));
    const replacement = {
      package: '@acme/own',
      code: 'missing_template_replacement_target',
      severity: 'error',
      message:
        'Template "acme-shell" replaces "no-such-template", which is not a Core template id.',
      needsCatalog: true,
    };
    try {
      await warnOnIntegrationIssues(
        {
          cwd: outside,
          loadedIntegrations: [
            {name: '@acme/own'},
            {name: '@acme/global', __computer: true},
          ],
          issues: async () => [
            {
              package: '@acme/own',
              code: 'source_without_component_doc',
              severity: 'warning',
              message: 'Component source "Odd.tsx" has no doc.',
            },
            replacement,
            {
              package: '@acme/global',
              code: 'source_without_component_doc',
              severity: 'warning',
              message: 'Component source "Other.tsx" has no doc.',
            },
            {
              package: '@acme/broken',
              code: 'integration_error',
              severity: 'error',
              message: 'boom',
            },
          ],
        },
        {json: false},
      );
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }

    // Doctor checks the computer there, so it names the issues of the one
    // installed for the computer that loads. The folder's own copy gets its
    // own check, and so does one installed for the computer that cannot load
    // because a package it imports is missing: it is not among the loaded
    // integrations, and only its load error is listed.
    expect(errLines).toHaveLength(4);
    expect(errLines[0]).toBe(`Warning: @acme/own: ${replacement.message}`);
    expect(errLines[1]).toMatch(
      /^Warning: @acme\/own has 1 integration issue\(s\)\. Run: .+ doctor integration validate @acme\/own$/,
    );
    expect(errLines[2]).toMatch(
      /^Warning: @acme\/global has 1 integration issue\(s\)\. Run: .+ doctor$/,
    );
    expect(errLines[3]).toMatch(
      /^Warning: @acme\/broken has 1 integration issue\(s\)\. Run: .+ doctor integration validate @acme\/broken$/,
    );
  });

  it('outside a project, names the check without a package for a local integration whose package.json has no name', async () => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-warn-nameless-'),
    );
    try {
      await warnOnIntegrationIssues(
        {
          cwd: outside,
          loadedIntegrations: [{name: '(local integration)', __local: true}],
          issues: async () => [
            {
              package: '(local integration)',
              code: 'source_without_component_doc',
              severity: 'warning',
              message: 'Component source "Odd.tsx" has no doc.',
            },
          ],
        },
        {json: false},
      );
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }

    // The label is no package name, and the shell would reject it: the
    // command validates the package in the folder instead.
    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(
      /^Warning: \(local integration\) has 1 integration issue\(s\)\. Run: .+ doctor integration validate$/,
    );
  });

  it('outside a project, keeps a configured entry that is not a bare package name in the command', async () => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-warn-entry-'),
    );
    try {
      await warnOnIntegrationIssues(
        {
          cwd: outside,
          loadedIntegrations: [{name: './widgets', __loadError: 'boom'}],
          issues: async () => [
            {
              package: './widgets',
              code: 'integration_error',
              severity: 'error',
              message: 'Invalid integration package name "./widgets".',
            },
          ],
        },
        {json: false},
      );
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }

    // validate reports what is wrong with the entry itself.
    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(
      /^Warning: \.\/widgets has 1 integration issue\(s\)\. Run: .+ doctor integration validate \.\/widgets$/,
    );
  });
});
