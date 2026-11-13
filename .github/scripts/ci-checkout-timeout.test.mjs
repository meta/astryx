// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every checkout step in ci.yml has its own 5-minute bound. A checkout that
 * hangs in the git service then fails by name in minutes, instead of using up
 * the job's whole time before any code runs. The bound is for the tool alone:
 * it lowers no test budget.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);

/** Every checkout step, named by its job and position. */
const checkouts = Object.entries(ci.jobs).flatMap(([job, spec]) =>
  /** @type {any} */ (spec.steps ?? [])
    .map((/** @type {any} */ step, /** @type {number} */ i) => ({
      job,
      where: `${job} step ${i + 1}${step.name ? ` (${step.name})` : ''}`,
      step,
    }))
    .filter((/** @type {any} */ {step}) =>
      String(step.uses ?? '').startsWith('actions/checkout@'),
    ),
);

// Full-history checkouts take longer: release-bump took up to 143 s in recent
// runs, and release-merge-back fetches the same history. release-authority
// keeps no step bound: the release lanes read its failure as a refused
// authority, while its job time already bounds a stalled checkout.
const BOUND = {'release-bump': 10, 'release-merge-back': 10};
const UNBOUNDED = new Set(['release-authority']);

describe('ci.yml checkout steps', () => {
  it('exist', () => {
    expect(checkouts.length).toBeGreaterThan(0);
  });

  it('each stop after 5 minutes, or the bound their job names', () => {
    const wrong = checkouts
      .filter(({job, step}) =>
        UNBOUNDED.has(job)
          ? step['timeout-minutes'] !== undefined
          : step['timeout-minutes'] !== (BOUND[job] ?? 5),
      )
      .map(({where}) => where);
    expect(wrong).toEqual([]);
  });
});
