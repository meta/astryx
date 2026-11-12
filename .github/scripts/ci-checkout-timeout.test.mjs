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
  /** @type {any} */ ((spec).steps ?? [])
    .map((/** @type {any} */ step, /** @type {number} */ i) => ({
      where: `${job} step ${i + 1}${step.name ? ` (${step.name})` : ''}`,
      step,
    }))
    .filter((/** @type {any} */ {step}) =>
      String(step.uses ?? '').startsWith('actions/checkout@'),
    ),
);

describe('ci.yml checkout steps', () => {
  it('exist', () => {
    expect(checkouts.length).toBeGreaterThan(0);
  });

  it('each stop after 5 minutes', () => {
    const unbounded = checkouts
      .filter(({step}) => step['timeout-minutes'] !== 5)
      .map(({where}) => where);
    expect(unbounded).toEqual([]);
  });
});
