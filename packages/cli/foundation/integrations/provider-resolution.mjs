// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Provider resolution — one resolver and one package identity for every
 * path that decides which integration package contributes under a provider ID.
 *
 * Project resolves configured, then autolinked, then local packages here.
 * `upgrade` resolves the same set plus its own candidates here, under the
 * codemod policy. `markProviderConflicts` is a wrapper over the same conflict
 * pass. Besides the resolved list, every resolution returns a ledger with
 * exactly one outcome for every package directory it was handed, so no
 * candidate can leave the list without a record.
 *
 * Identity is the real package directory. `name@version` labels an entry for
 * display. It also decides whether two DIFFERENT directories hold one published
 * package (an npm alias installed as a copy), because precedence has always
 * treated those as one package, but it never keys the ledger.
 *
 * @input Candidates in precedence order, each a loaded integration record or a
 *   load failure, tagged with the source that reached it; a policy.
 * @output The resolved LoadedIntegration list, and the ledger keyed by real
 *   package directory.
 * @position foundation/integrations — the only place precedence is decided;
 *   callers load packages, this module picks winners.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * @typedef {import('./integrations.mjs').LoadedIntegration} LoadedIntegration
 */

/**
 * Where a candidate came from. Precedence follows candidate order; the source
 * selects which rules apply.
 *   - `configured`: named by astryx.config; listed even when its manifest fails
 *   - `autolinked`: a declared dependency that ships one root manifest
 *   - `local`: the package being authored, loaded from its working bytes
 *   - `installed`: codemod policy — the installed copy of a package being
 *     authored that lists itself
 *   - `extra`: codemod policy — a package named with `upgrade --integration`
 * @typedef {'configured' | 'autolinked' | 'local' | 'installed' | 'extra'} CandidateSource
 */

/**
 * One package reached by one input. A candidate without `integration` failed
 * to load (`error`) or reached a directory an earlier candidate already
 * reached (`repeat`).
 * @typedef {object} ProviderCandidate
 * @property {CandidateSource} source
 * @property {LoadedIntegration} [integration]
 * @property {string} [spec] the input that reached the package
 * @property {string} [packageDir] required when `integration` is absent
 * @property {string} [error] why loading threw
 * @property {boolean} [repeat] another input for a directory already reached
 */

/**
 * @typedef {'contributes' | 'set-aside' | 'load-failed' | 'alias-of'} ProviderOutcome
 */

/**
 * Why a package is set aside.
 *   - `claimed-earlier`: a package earlier in precedence claims its provider ID
 *   - `authored-claims`: the package being authored claims its provider ID
 *   - `replaced-by-authored`: it is the installed copy of the package being
 *     authored, whose working bytes are used instead
 *   - `installed-stands-in`: codemod policy — the package being authored is
 *     represented by its installed copy
 * @typedef {'claimed-earlier' | 'authored-claims' | 'replaced-by-authored' | 'installed-stands-in'} SetAsideReason
 */

/**
 * The one outcome for one real package directory.
 * @typedef {object} ProviderLedgerEntry
 * @property {string} key real package directory
 * @property {string} label `name@version`, for display only
 * @property {ProviderOutcome} outcome
 * @property {ProviderCandidate} candidate the candidate this outcome belongs to
 * @property {ProviderCandidate[]} refs every candidate that reached this
 *   directory, in order
 * @property {string} [providerId]
 * @property {string} [winner] set-aside: key of the package used instead
 * @property {SetAsideReason} [reason] set-aside: why
 * @property {string} [aliasOf] alias-of: key of the package this one repeats
 * @property {LoadedIntegration} [integration] the record this package left in
 *   the resolved list, when it left one
 * @property {string} [error] load-failed: the load error
 */

/** @typedef {Map<string, ProviderLedgerEntry>} ProviderLedger */

/**
 * @typedef {object} ProviderPolicy
 * @property {boolean} [codemods] upgrade's codemod rule. Candidates are an
 *   already resolved Project list plus `installed` and `extra` candidates. The
 *   installed copy stands in for a package being authored that lists itself or
 *   is named as an extra, and an extra stands in for the autolinked package it
 *   repeats. Autolinked and local packages still claim provider IDs, but they
 *   are not listed: upgrade has never run their codemods.
 * @property {ProviderLedger} [prior] the ledger this resolution builds on. A
 *   record it already set aside keeps that winner, and its entries this
 *   resolution never reaches are carried over unchanged.
 */

/**
 * @typedef {object} CandidateState
 * @property {ProviderCandidate} candidate
 * @property {LoadedIntegration | undefined} record
 * @property {string} key
 * @property {ProviderOutcome} [outcome]
 * @property {CandidateState} [winner]
 * @property {SetAsideReason} [reason]
 * @property {CandidateState} [aliasOf]
 * @property {LoadedIntegration} [listed]
 */

/**
 * @typedef {object} Slot
 * @property {CandidateState} state
 * @property {LoadedIntegration} record
 */

/** Lower wins when several candidates reach one directory. */
const OUTCOME_RANK = /** @type {const} */ ({
  contributes: 0,
  'set-aside': 1,
  'load-failed': 2,
  'alias-of': 3,
});

/**
 * The identity of a package directory: its real path, so every symlinked
 * spelling of one pnpm store entry is one package.
 * @param {string} packageDir
 * @returns {string}
 */
export function packageKey(packageDir) {
  try {
    return fs.realpathSync(packageDir);
  } catch {
    return path.resolve(packageDir);
  }
}

/**
 * @param {ProviderCandidate} candidate
 * @param {number} index
 * @returns {string}
 */
function candidateKey(candidate, index) {
  const dir = candidate.integration?.__packageDir ?? candidate.packageDir;
  // Only a hand-built record lacks a directory; it is its own package.
  return typeof dir === 'string' && dir.length > 0
    ? packageKey(dir)
    : `#${index}`;
}

/**
 * Whether an entry contributes under its provider ID: it has one, its manifest
 * loaded, and it has not already been set aside.
 * @param {LoadedIntegration | undefined} integration
 * @returns {boolean}
 */
function claimsProvider(integration) {
  return (
    integration?.providerId != null &&
    integration.__loadError == null &&
    integration.__providerConflict == null
  );
}

/**
 * The display label of a package: `name@version`, plus the spec that reached
 * it when that differs from the name.
 * @param {LoadedIntegration} integration
 * @returns {string}
 */
function describeIntegration(integration) {
  const id = integration.version
    ? `${integration.name}@${integration.version}`
    : integration.name;
  return integration.__spec && integration.__spec !== integration.name
    ? `${id} (from "${integration.__spec}")`
    : id;
}

/**
 * An inert record for a package whose provider ID is already claimed. It keeps
 * the package's identity and location for reporting, and drops every
 * contribution root and handler.
 * @param {LoadedIntegration} integration
 * @param {LoadedIntegration} claimant
 * @returns {LoadedIntegration}
 */
function providerConflict(integration, claimant) {
  const providerId =
    /** @type {import('../../authoring/identity/type').ProviderId} */ (
      integration.providerId
    );
  const winner = describeIntegration(claimant);
  const setAside = describeIntegration(integration);
  const reason = claimant.__local
    ? 'is the package being authored, so it is used'
    : 'loads first and is used';
  return {
    name: integration.name,
    providerId,
    version: integration.version,
    __spec: integration.__spec,
    __packageDir: integration.__packageDir,
    __manifestFile: integration.__manifestFile,
    ...(integration.__local ? {__local: true} : {}),
    ...(integration.__autolinked
      ? {__autolinked: true, __dependencyField: integration.__dependencyField}
      : {}),
    __providerConflict: {
      providerId,
      claimedBy: claimant.name,
      message:
        `${setAside} and ${winner} both claim provider ID "${providerId}". ` +
        `${winner} ${reason}; ${setAside} contributes nothing ` +
        'until one package changes its providerId.',
    },
  };
}

/**
 * `name@version`, the display label of a package.
 * @param {LoadedIntegration} integration
 * @returns {string}
 */
function packageLabel(integration) {
  return integration.version
    ? `${integration.name}@${integration.version}`
    : integration.name;
}

/**
 * One published package at one version. Two directories that share it hold
 * the same package; it never keys the ledger.
 * @param {LoadedIntegration} integration
 * @returns {string}
 */
function publishedIdentity(integration) {
  return `${integration.name}\u0000${integration.version ?? ''}`;
}

/**
 * @param {CandidateState} state
 * @param {ProviderOutcome} outcome
 * @param {Partial<Pick<CandidateState, 'winner' | 'reason' | 'aliasOf' | 'listed'>>} [detail]
 */
function settle(state, outcome, detail = {}) {
  state.outcome = outcome;
  state.winner = detail.winner;
  state.reason = detail.reason;
  state.aliasOf = detail.aliasOf;
  state.listed = detail.listed;
}

/**
 * Project precedence: configured packages in config order, then autolinked
 * packages that do not repeat one already loaded, then the package being
 * authored, which replaces the first entry with its name.
 * @param {CandidateState[]} states
 * @returns {Slot[]}
 */
function assembleProject(states) {
  /** @type {Slot[]} */
  const slots = [];
  // Published identities of configured entries and of kept autolinked ones.
  /** @type {Map<string, CandidateState>} */
  const loaded = new Map();
  for (const state of states) {
    const {candidate, record} = state;
    if (candidate.repeat) {
      settle(state, 'alias-of');
      continue;
    }
    if (candidate.source === 'autolinked') {
      // A dependency the project never named cannot fail its load, so a
      // broken one is recorded here and listed nowhere.
      if (record == null || record.__loadError != null) {
        settle(state, 'load-failed');
        continue;
      }
      const repeated = loaded.get(publishedIdentity(record));
      if (repeated != null) {
        settle(state, 'alias-of', {aliasOf: repeated});
        continue;
      }
      loaded.set(publishedIdentity(record), state);
      slots.push({state, record});
      continue;
    }
    if (candidate.source === 'local' && record != null) {
      const replaced = slots.findIndex(
        slot => slot.record?.name === record.name,
      );
      if (replaced === -1) {
        slots.push({state, record});
      } else {
        settle(slots[replaced].state, 'set-aside', {
          winner: state,
          reason: 'replaced-by-authored',
        });
        slots[replaced] = {state, record};
      }
      continue;
    }
    if (record != null && typeof record === 'object') {
      const identity = publishedIdentity(record);
      if (!loaded.has(identity)) loaded.set(identity, state);
    }
    slots.push({state, record: /** @type {LoadedIntegration} */ (record)});
  }
  return slots;
}

/**
 * Upgrade precedence under the codemod policy, over an already resolved
 * Project list: configured packages (the installed copy in place of a package
 * being authored that lists itself), then claimants, then extras.
 * @param {CandidateState[]} states
 * @returns {{slots: Slot[], claimants: CandidateState[]}}
 */
function assembleCodemods(states) {
  const configured = states.filter(
    state => state.candidate.source === 'configured' && !state.candidate.repeat,
  );
  const installed = states.filter(
    state => state.candidate.source === 'installed',
  );
  const extras = states.filter(state => state.candidate.source === 'extra');
  const local = states.find(
    state => state.record?.__local && !state.candidate.repeat,
  );
  const selfListed = local != null && configured.includes(local);

  /** @type {CandidateState[]} */
  const participants = [...configured];
  if (local != null && selfListed && installed.length > 0) {
    participants.splice(participants.indexOf(local), 1, ...installed);
    settle(local, 'set-aside', {
      winner: installed[0],
      reason: 'installed-stands-in',
    });
  }
  const namedLocal =
    local == null
      ? undefined
      : extras.find(extra => extra.record?.name === local.record?.name);
  const localStandsIn = local != null && (selfListed || namedLocal != null);
  if (local != null && !selfListed && namedLocal != null) {
    settle(local, 'set-aside', {
      winner: namedLocal,
      reason: 'installed-stands-in',
    });
  }

  /** @type {Map<string, CandidateState>} */
  const extraIdentities = new Map();
  for (const extra of extras) {
    if (extra.record == null) continue;
    const identity = publishedIdentity(extra.record);
    if (!extraIdentities.has(identity)) extraIdentities.set(identity, extra);
  }
  /** @type {CandidateState[]} */
  const claimants = [];
  for (const state of states) {
    const {candidate, record} = state;
    if (candidate.repeat || record == null) continue;
    const claimant =
      candidate.source === 'autolinked' ||
      (candidate.source === 'local' && !localStandsIn);
    if (!claimant) continue;
    const named = extraIdentities.get(publishedIdentity(record));
    if (named != null) {
      settle(state, 'alias-of', {aliasOf: named});
      continue;
    }
    claimants.push(state);
  }

  for (const state of states) {
    if (state.candidate.repeat) settle(state, 'alias-of');
  }

  const slots = [...participants, ...claimants, ...extras].map(state => ({
    state,
    record: /** @type {LoadedIntegration} */ (state.record),
  }));
  return {slots, claimants};
}

/**
 * The provider-ID pass over assembled entries. The package being authored
 * claims first; everything else claims in order. A later claimant that is the
 * same published package as the winner is the same package reached twice and
 * loads once; any other later claimant becomes an inert conflict record.
 * @param {Slot[]} slots
 * @returns {LoadedIntegration[]}
 */
function markConflicts(slots) {
  /** @type {Map<string, Slot>} */
  const claims = new Map();
  for (const slot of slots) {
    if (slot.record?.__local && claimsProvider(slot.record)) {
      const providerId = /** @type {string} */ (slot.record.providerId);
      if (!claims.has(providerId)) claims.set(providerId, slot);
    }
  }
  /** @type {LoadedIntegration[]} */
  const resolved = [];
  for (const slot of slots) {
    const {state, record} = slot;
    if (!claimsProvider(record)) {
      resolved.push(record);
      if (record?.__providerConflict != null) {
        settle(state, 'set-aside', {listed: record});
      } else if (record == null || record.__loadError != null) {
        settle(state, 'load-failed', {listed: record});
      } else {
        settle(state, 'contributes', {listed: record});
      }
      continue;
    }
    const providerId = /** @type {string} */ (record.providerId);
    const claimant = claims.get(providerId);
    if (claimant == null) {
      claims.set(providerId, slot);
      resolved.push(record);
      settle(state, 'contributes', {listed: record});
    } else if (claimant.record === record) {
      resolved.push(record);
      settle(state, 'contributes', {listed: record});
    } else if (
      claimant.record.name !== record.name ||
      claimant.record.version !== record.version
    ) {
      const conflict = providerConflict(record, claimant.record);
      resolved.push(conflict);
      settle(state, 'set-aside', {
        winner: claimant.state,
        reason: claimant.record.__local ? 'authored-claims' : 'claimed-earlier',
        listed: conflict,
      });
    } else {
      settle(state, 'alias-of', {aliasOf: claimant.state});
    }
  }
  return resolved;
}

/**
 * Fold candidate outcomes into one entry per real package directory. A
 * directory reached by several candidates keeps the strongest outcome among
 * them; every candidate stays listed in `refs`.
 * @param {CandidateState[]} states
 * @param {ProviderLedger | undefined} prior
 * @param {Set<LoadedIntegration>} listed records in the final list
 * @returns {ProviderLedger}
 */
function buildLedger(states, prior, listed) {
  /** @type {Map<string, CandidateState>} */
  const chosen = new Map();
  /** @type {Map<string, ProviderCandidate[]>} */
  const refs = new Map();
  for (const state of states) {
    const current = chosen.get(state.key);
    const outcome = state.outcome ?? 'load-failed';
    if (
      current == null ||
      OUTCOME_RANK[outcome] < OUTCOME_RANK[current.outcome ?? 'load-failed']
    ) {
      chosen.set(state.key, state);
    }
    const list = refs.get(state.key) ?? [];
    list.push(state.candidate);
    refs.set(state.key, list);
  }

  /** @type {ProviderLedger} */
  const ledger = new Map();
  for (const [key, state] of chosen) {
    const {candidate, record} = state;
    const outcome = state.outcome ?? 'load-failed';
    const previous = prior?.get(key);
    /** @type {ProviderLedgerEntry} */
    const entry = {
      key,
      label:
        record != null && typeof record === 'object' && record.name
          ? packageLabel(record)
          : (candidate.spec ?? key),
      outcome,
      candidate,
      // A resolution on top of a prior ledger re-reads that ledger's records;
      // only its own new inputs join the inputs already recorded there.
      refs:
        previous == null
          ? (refs.get(key) ?? [candidate])
          : [
              ...previous.refs,
              ...(refs.get(key) ?? []).filter(
                ref => ref.source === 'installed' || ref.source === 'extra',
              ),
            ],
    };
    if (record?.providerId != null) entry.providerId = record.providerId;
    if (outcome === 'set-aside') {
      const winner = state.winner?.key ?? previous?.winner;
      if (winner != null) entry.winner = winner;
      const reason = state.reason ?? previous?.reason;
      if (reason != null) entry.reason = reason;
    }
    if (outcome === 'alias-of') entry.aliasOf = state.aliasOf?.key ?? key;
    if (state.listed != null && listed.has(state.listed)) {
      entry.integration = state.listed;
    }
    const error = record?.__loadError ?? candidate.error;
    if (outcome === 'load-failed' && error != null) entry.error = error;
    ledger.set(key, entry);
  }
  for (const [key, entry] of prior ?? []) {
    if (!ledger.has(key)) ledger.set(key, entry);
  }
  return ledger;
}

/**
 * Resolve provider identity over candidates in precedence order.
 *
 * Returns the resolved integration list every command reads, and a ledger
 * with one outcome for every real package directory among the candidates:
 * `contributes`, `set-aside` (with the winner and a reason), `load-failed`, or
 * `alias-of` (the same published package already loaded from another
 * directory, or another input for a directory already reached).
 *
 * @param {ProviderCandidate[]} candidates in precedence order
 * @param {ProviderPolicy} [policy]
 * @returns {{integrations: LoadedIntegration[], ledger: ProviderLedger}}
 */
export function resolveProviders(candidates, policy = {}) {
  /** @type {CandidateState[]} */
  const states = candidates.map((candidate, index) => ({
    candidate,
    record: candidate.integration,
    key: candidateKey(candidate, index),
  }));

  /** @type {LoadedIntegration[]} */
  let integrations;
  if (policy.codemods) {
    const {slots, claimants} = assembleCodemods(states);
    const resolved = markConflicts(slots);
    // Claimants leave by package directory: the pass can hand one back as a
    // new conflict record, and upgrade must not report a package every other
    // command uses as set aside.
    const claimantDirs = new Set(
      claimants.map(state => state.record?.__packageDir),
    );
    integrations = resolved.filter(
      integration =>
        integration.__packageDir == null ||
        !claimantDirs.has(integration.__packageDir),
    );
  } else {
    integrations = markConflicts(assembleProject(states));
  }

  const ledger = buildLedger(states, policy.prior, new Set(integrations));
  return {integrations, ledger};
}
