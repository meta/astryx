// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Each checkout step in ci.yml has its own time bound. A shallow checkout
 * stops after 5 minutes (4 in a job of 10 minutes) and is tried once more,
 * and the job stops with "checkout failed twice" when both tries failed, so a
 * fetch that hangs in the git service costs one retry instead of the job. A
 * checkout in a job capped at 8 minutes or less stops after 3 minutes, and a
 * full-history checkout after the bound its job names; neither has room for a
 * second try. The bounds are for the tool alone: they lower no test budget.
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

/** A job whose own time is 8 minutes or less. */
const shortJob = (/** @type {string} */ job) => {
  const cap = ci.jobs[job]['timeout-minutes'];
  return typeof cap === 'number' && cap <= 8;
};

/** The bound of each try of a checkout that is tried twice in this job. */
const retryBound = (/** @type {string} */ job) => {
  const cap = ci.jobs[job]['timeout-minutes'];
  return typeof cap === 'number' && cap <= 10 ? Math.floor((cap - 1) / 2) : 5;
};

/** A step condition without its `${{ }}`: the second try and the stop carry it over. */
const unwrap = (/** @type {unknown} */ condition) =>
  condition == null
    ? ''
    : String(condition)
        .replace(/^\$\{\{\s*/, '')
        .replace(/\s*\}\}$/, '');

/** A checkout tried twice: neither a short job's nor a full-history one. */
const retried = (/** @type {string} */ job) =>
  !UNBOUNDED.has(job) && BOUND[job] === undefined && !shortJob(job);

describe('ci.yml checkout steps', () => {
  it('exist', () => {
    expect(checkouts.length).toBeGreaterThan(0);
  });

  it('each stop after their bound: 5 minutes a try, 3 in a short job, or the bound their job names', () => {
    const wrong = checkouts
      .filter(({job, step}) =>
        UNBOUNDED.has(job)
          ? step['timeout-minutes'] !== undefined
          : step['timeout-minutes'] !==
            (BOUND[job] ?? (shortJob(job) ? 3 : retryBound(job))),
      )
      .map(({where}) => where);
    expect(wrong).toEqual([]);
  });

  it('each stop before their job does', () => {
    const late = checkouts
      .filter(({job, step}) => {
        const cap = ci.jobs[job]['timeout-minutes'];
        return (
          typeof cap === 'number' &&
          step['timeout-minutes'] !== undefined &&
          step['timeout-minutes'] >= cap
        );
      })
      .map(({where}) => where);
    expect(late).toEqual([]);
  });

  it('each try once more after a failure, and the job stops when both failed', () => {
    const wrong = [];
    for (const [job, spec] of Object.entries(ci.jobs)) {
      if (!retried(job)) continue;
      const steps = /** @type {any[]} */ (spec.steps ?? []);
      steps.forEach((step, i) => {
        if (!String(step.uses ?? '').startsWith('actions/checkout@')) return;
        if (String(step.id ?? '').endsWith('_again')) return;
        const where = `${job} step ${i + 1}`;
        const again = steps[i + 1];
        const stop = steps[i + 2];
        const id = step.id;
        const ok =
          typeof id === 'string' &&
          step['continue-on-error'] === true &&
          again?.id === `${id}_again` &&
          again.uses === step.uses &&
          JSON.stringify(again.with) === JSON.stringify(step.with) &&
          again['continue-on-error'] === true &&
          again['timeout-minutes'] === step['timeout-minutes'] &&
          String(again.if).endsWith(
            `steps.${id}.outcome != 'success' && steps.${id}.outcome != 'skipped'`,
          ) &&
          String(again.if).includes(unwrap(step.if)) &&
          stop?.name === 'Stop when the checkout failed twice' &&
          String(stop.if).endsWith(
            `steps.${id}.outcome != 'success' && steps.${id}.outcome != 'skipped' && steps.${id}_again.outcome != 'success'`,
          ) &&
          String(stop.if).includes(unwrap(step.if)) &&
          /checkout failed twice/.test(stop.run) &&
          /exit 1\s*$/.test(stop.run);
        if (!ok) wrong.push(where);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('end both tries before their job does', () => {
    const late = checkouts
      .filter(({job, step}) => {
        const cap = ci.jobs[job]['timeout-minutes'];
        return (
          retried(job) &&
          typeof cap === 'number' &&
          2 * step['timeout-minutes'] >= cap
        );
      })
      .map(({where}) => where);
    expect(late).toEqual([]);
  });

  it('give every step id once in a job', () => {
    const dup = Object.entries(ci.jobs).flatMap(([job, spec]) => {
      const ids = /** @type {any[]} */ (spec.steps ?? [])
        .map(step => step.id)
        .filter(Boolean);
      return ids
        .filter((id, i) => ids.indexOf(id) !== i)
        .map(id => `${job}: ${id}`);
    });
    expect(dup).toEqual([]);
  });
});
