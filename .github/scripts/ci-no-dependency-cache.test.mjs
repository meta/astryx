// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: CI jobs install dependencies without the Actions cache.
 * @input .github/actions/setup/action.yml and every workflow under .github/workflows
 * @output Each setup-node use and actions/cache use against the no-cache rule
 * @position Node contract for the repository's Actions cache egress
 *
 * The pnpm store is ~245 MB and nearly every job restored it, so one pull
 * request run pulled several GB from the Actions cache. That hit the cache's
 * egress limit; a refused or throttled restore then stalled job setup for up to
 * ten minutes, pushing jobs past their time budget. A cold `pnpm install` from
 * the registry takes about 13 s, so jobs install without a dependency cache.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = rel => yaml.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const workflowDir = path.join(root, '.github/workflows');
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map(name => `.github/workflows/${name}`);

/** Every step of every job in a workflow, or of a composite action. */
function stepsOf(doc) {
  if (doc.runs?.steps) {
    return doc.runs.steps;
  }
  return Object.values(doc.jobs ?? {}).flatMap(job => job.steps ?? []);
}

const sources = ['.github/actions/setup/action.yml', ...workflowFiles];

describe('dependency cache', () => {
  it('turns off setup-node package caching in the shared setup action', () => {
    const setupNode = stepsOf(read('.github/actions/setup/action.yml')).find(
      step => String(step.uses ?? '').startsWith('actions/setup-node@'),
    );
    expect(setupNode).toBeDefined();
    expect(setupNode.with?.cache).toBeUndefined();
    expect(setupNode.with?.['package-manager-cache']).toBe(false);
  });

  it.each(sources)('%s restores no dependency cache', rel => {
    for (const step of stepsOf(read(rel))) {
      const uses = String(step.uses ?? '');
      if (uses.startsWith('actions/setup-node@')) {
        expect(step.with?.cache, `${rel}: setup-node cache`).toBeUndefined();
      }
      expect(
        uses.startsWith('actions/cache@') ||
          uses.startsWith('actions/cache/restore@'),
        `${rel}: actions/cache step`,
      ).toBe(false);
    }
  });
});
