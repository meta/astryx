// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The provider ledger property: over seeded, generated projects, the
 * real Project.load and the real `upgrade` context account for every candidate
 * exactly once, and agree on the winner of every provider ID except where the
 * codemod policy says otherwise.
 *
 * The expected candidates come from the scenario description, never from the
 * resolver. Fixtures live under the system temp folder, so TMPDIR chooses the
 * filesystem that takes each seed's writes and removals.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  expectedProjectInputs,
  generateScenario,
  isRunnable,
  writeScenario,
} from '../../test-utils/provider-scenarios.mjs';
import {requireNatively} from '../../test-utils/native-require.mjs';

// The code under test loads natively, so each seed's fixture modules load as
// Node loads them, not as one Vitest request each.
const require = requireNatively(import.meta.url);
/** @type {typeof import('../config/project.mjs')} */
const {Project, providerLedgerOf} = require('../config/project.mjs');
/** @type {typeof import('../../api/upgrade/_adapter.mjs')} */
const {loadProjectContext} = require('../../api/upgrade/_adapter.mjs');

// 200 seeds keep this near 4 s; any seed range must hold.
const SEEDS = Array.from({length: 200}, (_, index) => index + 1);
const OUTCOMES = ['contributes', 'set-aside', 'load-failed', 'alias-of'];

/** @type {string} */
let root;
/** @type {string} */
let originalCwd;

beforeAll(() => {
  originalCwd = process.cwd();
  root = fs.mkdtempSync(path.join(os.tmpdir(), '.astryx-provider-ledger-'));
});

// Only a seed that failed before removing its folder leaves one here.
afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, {recursive: true, force: true});
});

/**
 * The contributing package for each provider ID. Fails when two contribute
 * under one ID.
 * @param {Map<string, any>} ledger
 * @returns {Map<string, any>}
 */
function winners(ledger) {
  /** @type {Map<string, any>} */
  const byProvider = new Map();
  for (const entry of ledger.values()) {
    if (entry.outcome !== 'contributes' || entry.providerId == null) continue;
    expect(byProvider.has(entry.providerId)).toBe(false);
    byProvider.set(entry.providerId, entry);
  }
  return byProvider;
}

/**
 * Assert the ledger records one outcome for exactly the given inputs.
 * @param {Map<string, any>} ledger
 * @param {Array<{source: string, spec: string, key: string}>} inputs
 */
function expectAccounted(ledger, inputs) {
  const refs = [...ledger.values()].flatMap(entry =>
    entry.refs.map(ref => ({entry, ref})),
  );
  for (const input of inputs) {
    const holders = refs.filter(
      ({ref}) => ref.source === input.source && ref.spec === input.spec,
    );
    expect(holders.map(({entry}) => entry.key)).toEqual([input.key]);
  }
  expect(refs).toHaveLength(inputs.length);
  expect(new Set(ledger.keys())).toEqual(
    new Set(inputs.map(input => input.key)),
  );
  for (const [key, entry] of ledger) {
    expect(entry.key).toBe(key);
    expect(OUTCOMES).toContain(entry.outcome);
    if (entry.outcome === 'set-aside') {
      expect(ledger.has(entry.winner)).toBe(true);
      expect(entry.reason).toEqual(expect.any(String));
    }
    if (entry.outcome === 'alias-of') {
      expect(ledger.has(entry.aliasOf)).toBe(true);
    }
  }
}

describe('provider ledger over generated projects', () => {
  it('accounts for every candidate once and agrees across Project and upgrade', async () => {
    const coverage = {
      scenarios: 0,
      setAside: 0,
      aliasOf: 0,
      loadFailed: 0,
      replaced: 0,
      agreed: 0,
      standIn: 0,
      extraReordered: 0,
    };

    for (const seed of SEEDS) {
      const scenario = generateScenario(seed);
      if (!isRunnable(scenario)) continue;
      coverage.scenarios++;
      const dir = path.join(root, `seed-${seed}`);
      fs.mkdirSync(dir);
      writeScenario(dir, scenario);
      const context = `seed ${seed}: ${JSON.stringify(scenario)}`;

      const project = await Project.load(dir, {fresh: true});
      const ledger = providerLedgerOf(project);
      const inputs = expectedProjectInputs(dir, scenario);
      try {
        expectAccounted(ledger, inputs);

        // Nothing leaves the list without a recorded reason.
        const listed = new Set(project.loadedIntegrations);
        for (const integration of project.loadedIntegrations) {
          expect(ledger.has(fs.realpathSync(integration.__packageDir))).toBe(
            true,
          );
        }
        for (const entry of ledger.values()) {
          if (entry.integration != null) {
            expect(listed.has(entry.integration)).toBe(true);
            continue;
          }
          expect(entry.outcome).not.toBe('contributes');
          if (entry.outcome === 'set-aside') {
            expect(entry.reason).toBe('replaced-by-authored');
          }
          if (entry.outcome === 'load-failed') {
            expect(entry.error).toEqual(expect.any(String));
          }
        }
      } catch (error) {
        throw new Error(`${context}\n${error}`, {cause: error});
      }

      for (const entry of ledger.values()) {
        if (entry.outcome === 'set-aside') coverage.setAside++;
        if (entry.outcome === 'alias-of') coverage.aliasOf++;
        if (entry.outcome === 'load-failed') coverage.loadFailed++;
        if (entry.reason === 'replaced-by-authored') coverage.replaced++;
      }

      // `--integration` specs resolve from the process cwd.
      process.chdir(dir);
      const upgrade = await loadProjectContext(dir, scenario.extras);
      process.chdir(originalCwd);

      const modules = path.join(dir, 'node_modules');
      /** @param {string} spec */
      const installedKey = spec =>
        fs.realpathSync(path.join(modules, ...spec.split('/')));
      /** @param {string} spec */
      const installedName = spec =>
        JSON.parse(
          fs.readFileSync(
            path.join(modules, ...spec.split('/'), 'package.json'),
            'utf8',
          ),
        ).name;
      const configured = new Set(scenario.config ?? []);
      const extras = [...new Set(scenario.extras)].filter(
        spec => !configured.has(spec),
      );
      const {local} = scenario;
      const localKey = fs.realpathSync(dir);
      const selfListed = local != null && configured.has(local.name);
      // The codemod policy: the installed copy stands in for the package being
      // authored when it lists itself or is named with --integration.
      const localStandsIn =
        local != null &&
        (selfListed || extras.some(spec => installedName(spec) === local.name));

      try {
        // Upgrade accounts for everything Project did, plus its own inputs.
        expectAccounted(upgrade.ledger, [
          ...inputs,
          ...(selfListed
            ? [
                {
                  source: 'installed',
                  spec: local.name,
                  key: installedKey(local.name),
                },
              ]
            : []),
          ...extras.map(spec => ({
            source: 'extra',
            spec,
            key: installedKey(spec),
          })),
        ]);
      } catch (error) {
        throw new Error(`${context}\n${error}`, {cause: error});
      }

      const projectWinners = winners(ledger);
      const upgradeWinners = winners(upgrade.ledger);
      for (const providerId of new Set([
        ...projectWinners.keys(),
        ...upgradeWinners.keys(),
      ])) {
        const inProject = projectWinners.get(providerId);
        const inUpgrade = upgradeWinners.get(providerId);
        const same =
          inProject != null &&
          inUpgrade != null &&
          (inProject.key === inUpgrade.key ||
            upgrade.ledger.get(inProject.key)?.aliasOf === inUpgrade.key);
        if (same) {
          coverage.agreed++;
          continue;
        }
        // The one documented exception, asserted explicitly: an installed
        // copy took the authored package's place, so either upgrade's winner
        // is an installed copy of that package, or Project's winner is the
        // authored package it replaced.
        const upgradeName =
          inUpgrade?.integration?.name ??
          inUpgrade?.candidate.integration?.name;
        const standInWins =
          localStandsIn && inUpgrade != null && upgradeName === local?.name;
        const localReplaced =
          localStandsIn && inProject != null && inProject.key === localKey;
        // Project never saw an extra, so an ID only an extra claims has no
        // Project winner to agree with.
        const extraOnly =
          inProject == null && inUpgrade?.candidate.source === 'extra';
        // Known disagreement, pinned by the `it.fails` repros in
        // api/upgrade/provider-agreement.test.mjs: upgrade replaces an
        // autolinked winner with any extra of the same name@version, from
        // any directory, and orders it with the extras. Another extra can
        // then win, or nothing does, in upgrade only.
        const projectWinnerInUpgrade =
          inProject == null ? undefined : upgrade.ledger.get(inProject.key);
        const repeatedByExtra =
          projectWinnerInUpgrade != null &&
          (projectWinnerInUpgrade.refs.some(ref => ref.source === 'extra') ||
            (projectWinnerInUpgrade.outcome === 'alias-of' &&
              upgrade.ledger
                .get(projectWinnerInUpgrade.aliasOf)
                ?.refs.some(ref => ref.source === 'extra')));
        const extraReordered =
          inProject?.candidate.source === 'autolinked' && repeatedByExtra;
        if (extraReordered) {
          coverage.extraReordered++;
          continue;
        }
        expect(
          standInWins || localReplaced || extraOnly,
          `${context}\nprovider ${providerId}: Project ${inProject?.label ?? 'none'} vs upgrade ${inUpgrade?.label ?? 'none'}`,
        ).toBe(true);
        if (standInWins || localReplaced) coverage.standIn++;
      }
      // The seed's folder is read, so it goes now: inside this case's budget,
      // not with every other seed's folder at once after the file.
      fs.rmSync(dir, {recursive: true, force: true});
    }

    // The generator must keep reaching every shape, or the property is vacuous.
    expect(coverage.scenarios).toBeGreaterThanOrEqual(190);
    expect(coverage.setAside).toBeGreaterThan(0);
    expect(coverage.aliasOf).toBeGreaterThan(0);
    expect(coverage.loadFailed).toBeGreaterThan(0);
    expect(coverage.replaced).toBeGreaterThan(0);
    expect(coverage.agreed).toBeGreaterThan(0);
    expect(coverage.standIn).toBeGreaterThan(0);
  }, 120_000);
});
