// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration tests for the --detail level contract on list views.
 *
 * Spawns the CLI as a subprocess against the real monorepo core dir and
 * asserts the documented size ordering for both `component --list` and
 * `hook --list`:
 *
 *   brief  (names only)              <  smallest
 *   compact (name + 1-line desc)     <  middle
 *   full   (dense per-entry docs)       largest
 *
 * All three levels must produce DISTINCT output. This guards against the
 * historically-inverted behavior where `brief` was densest and `full`
 * duplicated `compact`.
 */

import {describe, it, expect, beforeAll} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root holds packages/core, which findCoreDir() walks up to locate.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

async function listOutputs(cmd) {
  const brief = (await runCli([cmd, '--list', '--detail', 'brief'], REPO_ROOT)).stdout;
  const compact = (await runCli([cmd, '--list', '--detail', 'compact'], REPO_ROOT)).stdout;
  const full = (await runCli([cmd, '--list', '--detail', 'full'], REPO_ROOT)).stdout;
  return {brief, compact, full};
}

describe('--detail level ordering: component --list', () => {
  let brief, compact, full;
  beforeAll(async () => {
    ({brief, compact, full} = await listOutputs('component'));
  }, 60_000);

  it('produces strictly increasing output size: brief < compact < full', () => {
    expect(brief.length).toBeGreaterThan(0);
    expect(compact.length).toBeGreaterThan(brief.length);
    expect(full.length).toBeGreaterThan(compact.length);
  });

  it('produces three distinct outputs', () => {
    expect(brief).not.toEqual(compact);
    expect(compact).not.toEqual(full);
    expect(brief).not.toEqual(full);
  });

  it('brief is names-only (no targets, import hints, or prose descriptions)', () => {
    expect(brief).not.toMatch(/Targets:/);
    expect(brief).not.toMatch(/<- from/);
    // Names only — should contain XDS component names but no " — " desc separator.
    expect(brief).toMatch(/Button/);
    expect(brief).not.toMatch(/ \u2014 /);
  });

  it('compact has descriptions (records expose a description field)', () => {
    // Migrated to the shared formatter kit: compact renders one record per entry
    // (name/import/description) rather than a single em-dash-joined line.
    expect(compact).toMatch(/^description:/m);
  });

  it('full has dense per-entry docs (props, targets, and import hints)', () => {
    expect(full).toMatch(/Targets:/);
    expect(full).toMatch(/<- from/);
    // Prop name lists appear in the dense brief-all rendering.
    expect(full).toMatch(/children/);
  });

  it('--json list emits one component.list type across all detail levels, tagged by data.detail', async () => {
    const names = JSON.parse((await runCli(['component', '--list', '--json'], REPO_ROOT)).stdout);
    expect(names.type).toBe('component.list');
    expect(names.apiVersion).toBe(1);
    expect(names.data.detail).toBe('names');
    expect(typeof names.data.components).toBe('object');

    const compact = JSON.parse((await runCli(['component', '--list', '--detail', 'compact', '--json'], REPO_ROOT)).stdout);
    expect(compact.type).toBe('component.list');
    expect(compact.data.detail).toBe('compact');
    expect(typeof compact.data.components).toBe('object');

    const full = JSON.parse((await runCli(['component', '--list', '--detail', 'full', '--json'], REPO_ROOT)).stdout);
    expect(full.type).toBe('component.list');
    expect(full.data.detail).toBe('full');
    expect(typeof full.data.components).toBe('object');
  }, 60_000);
});

describe('--detail level ordering: hook --list', () => {
  let brief, compact, full;
  beforeAll(async () => {
    ({brief, compact, full} = await listOutputs('hook'));
  }, 60_000);

  it('produces strictly increasing output size: brief < compact < full', () => {
    expect(brief.length).toBeGreaterThan(0);
    expect(compact.length).toBeGreaterThan(brief.length);
    expect(full.length).toBeGreaterThan(compact.length);
  });

  it('produces three distinct outputs', () => {
    expect(brief).not.toEqual(compact);
    expect(compact).not.toEqual(full);
    expect(brief).not.toEqual(full);
  });

  it('brief is names-only (no param tables or import blocks)', () => {
    expect(brief).not.toMatch(/\| Param \|/);
    expect(brief).not.toMatch(/## Parameters/);
    expect(brief).not.toMatch(/import \{/);
    expect(brief).toMatch(/use[A-Z]/);
    expect(brief).not.toMatch(/ \u2014 /);
  });

  it('compact has per-hook descriptions (records with a description field)', () => {
    expect(compact).toMatch(/description:/);
  });

  it('full has dense docs (param tables and import statements)', () => {
    expect(full).toMatch(/\| Param \|/);
    expect(full).toMatch(/import \{/);
  });

  it('--json list emits one hook.list type across all detail levels, tagged by data.detail', async () => {
    const names = JSON.parse((await runCli(['hook', '--list', '--json'], REPO_ROOT)).stdout);
    expect(names.type).toBe('hook.list');
    expect(names.apiVersion).toBe(1);
    expect(names.data.detail).toBe('names');
    expect(typeof names.data.components).toBe('object');

    const compact = JSON.parse((await runCli(['hook', '--list', '--detail', 'compact', '--json'], REPO_ROOT)).stdout);
    expect(compact.type).toBe('hook.list');
    expect(compact.data.detail).toBe('compact');
    expect(typeof compact.data.components).toBe('object');

    const full = JSON.parse((await runCli(['hook', '--list', '--detail', 'full', '--json'], REPO_ROOT)).stdout);
    expect(full.type).toBe('hook.list');
    expect(full.data.detail).toBe('full');
    expect(typeof full.data.components).toBe('object');
  }, 60_000);
});
