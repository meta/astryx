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
import * as path from 'node:path';
import {warnOnIntegrationIssues} from './integration-warnings.mjs';

let tmpDir;
let errSpy;
let errLines;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-warn-it-'));
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
});
