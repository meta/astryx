#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file score-ledger.mjs
 * @description The component score ledger — read, record, queue and ratchet the
 *   per-component audit scores produced by the Component Audit Rubric.
 * @input Subcommand flags (see USAGE below) plus `--ledger <path|url>`.
 * @output Human-readable summaries on stdout, an updated ledger JSON with
 *   `--record` (pushed to the wiki with `--push`), and a non-zero exit from
 *   `--check` when the ratchet trips.
 * @position Standalone CLI, and the module every other surface imports.
 *
 *   Two halves, deliberately separate:
 *     - the ROSTER (which components exist) is derived from the packages here,
 *       by the canonical predicate below — rubric decision #15;
 *     - the SCORES live in the wiki, in `component-scores.json`, because
 *       recording a score must not require a pull request.
 *   A component with no ledger entry is unaudited. Nothing has to maintain a
 *   list of unaudited components: the roster is the packages.
 *
 *   `component-scores.json` is the ONLY stored form of the ledger. There is no
 *   generated Markdown table: a second copy of the same numbers goes stale the
 *   moment the JSON changes without a regeneration, and a stale score that
 *   looks current is worse than one you have to click through for. The single
 *   view is the sandbox page, which fetches this JSON at runtime.
 *
 * SYNC: When the schema changes, update the Component-Audit-Rubric wiki page
 *   and apps/sandbox/scripts/generate-score-ledger.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {
  COMPONENT_PACKAGES,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = require('./component-packages.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The one stored form of the ledger, at the root of the wiki repo. */
export const LEDGER_FILENAME = 'component-scores.json';

/** Where the scores live when no `--ledger` is given. */
export const DEFAULT_LEDGER_URL =
  'https://raw.githubusercontent.com/wiki/meta/astryx/component-scores.json';

/** The wiki repo the ledger lives in — what `--push` clones. */
export const WIKI_REMOTE = 'https://github.com/meta/astryx.wiki.git';

/** The wiki's default branch. Not `main`. */
export const WIKI_BRANCH = 'master';

/**
 * The one place the ledger is readable by a human: the sandbox page, which
 * fetches the JSON at runtime. The Vercel project deploys current `main` to the
 * stable unversioned path; `/pr/<n>/` paths are PR previews and must never be
 * linked from anything durable.
 */
export const SCORES_PAGE_URL =
  'https://astryx.atmeta.com/sandbox/pages/component-scores/';

const USAGE = `
Usage: node scripts/score-ledger.mjs <subcommand> [options]

Subcommands
  --check                 Ratchet / standing report for the components a PR touches.
  --queue                 The auditor's work queue: unaudited first, then
                          oldest-audited, then lowest-scoring.
  --stats                 Distribution summary on the terminal.
  --record <Component>    Write one component's scorecard into the ledger.
  --file-issues <Component>
                          Grading/promotion only: file one GitHub issue per open
                          BLOCK that has none, via gh, and write the numbers back.
                          Night Watch and review modes are refused.

Options
  --ledger <path|url>       Ledger source. Default: the wiki raw URL.
                            --record needs a local path, or --push.
  --base-ledger <path|url>  Baseline ledger for --check; enables the ratchet.
  --components <a,b,c>      --check: components to check.
  --analysis <file>         --check: analysis.json from .github/scripts/analyze-pr.js.
  --limit <n>               --queue: how many rows (default 5).
  --package <name>          --record: package, if the predicate cannot resolve it.
  --from <file|->           --record: scorecard JSON ('-' reads stdin).
  --allow-regression <why>  --record: permit a score drop or a new BLOCK.
  --push                    --record/--file-issues: clone the wiki, apply, commit
                            and push. Without --ledger it uses a cached shallow
                            clone; the commit message names the component, the
                            grade and the rubric version.
  --dry-run                 --record: print the diff and the commit message and
                            push nothing. --file-issues: print the issues,
                            create nothing.
  --repo <owner/name>       --file-issues: default meta/astryx.
  --json                    Machine-readable output where it applies.
`.trim();

// ---------------------------------------------------------------------------
// The rubric's vocabulary. These ids, weights and bands are the rubric's, not
// this script's — changing one here changes what the ledger claims to measure.
// ---------------------------------------------------------------------------

/** Section id -> weight, summing to 100. Rubric §2, "Overall grade". */
export const SECTION_WEIGHTS = Object.freeze({
  a11y: 16,
  theming: 14,
  api: 14,
  behavior: 12,
  design_objective: 6,
  design_rendered: 4,
  testing: 8,
  code_health: 8,
  docs: 8,
  i18n_rtl: 5,
  responsive: 5,
});

/** Section id -> the rubric's own heading. */
export const SECTION_TITLES = Object.freeze({
  a11y: '§1 Accessibility & operable paths',
  theming: '§2 Theming & token integrity',
  api: '§3 Public API contract',
  behavior: '§4 Behavior correctness & states',
  design_objective: '§5a Design conventions — objective',
  design_rendered: '§5b Design conventions — rendered',
  testing: '§6 Testing & verification',
  code_health: '§7 Code health (React & DOM)',
  docs: '§8 Docs, Storybook & docsite',
  i18n_rtl: '§9 i18n & RTL',
  responsive: '§10 Responsive & touch',
});

export const SECTION_IDS = Object.freeze(Object.keys(SECTION_WEIGHTS));

/**
 * Section states.
 *   scored       — a number was produced from evidence.
 *   limited      — fewer than 1/3 of the section's items gave a non-vacuous
 *                  verdict; reported for information, weight redistributed.
 *   not_measured — nobody looked (the §5b screenshot gate). Never 0.
 *   na           — structurally inapplicable, with a reason.
 *   unpublished  — the section WAS audited and is inside `score`, but the audit
 *                  of record published only the total. Not one of the rubric's
 *                  four states: it exists for the seeded rows, whose calibration
 *                  record reported totals only. Inventing the per-section split
 *                  would be fabrication, and `not_measured` would be a lie in
 *                  the other direction — it would claim nobody looked.
 */
export const SECTION_STATES = Object.freeze([
  'scored',
  'limited',
  'not_measured',
  'na',
  'unpublished',
]);

/**
 * Audit modes and the lifecycle each mode owns. Legacy word aliases remain
 * readable because the wiki ledger already contains them; every new scorecard
 * is normalized to the one-letter rubric code.
 */
export const AUDIT_MODES = Object.freeze({
  N: Object.freeze({
    code: 'N',
    label: 'Night Watch',
    aliases: Object.freeze(['n', 'nightly', 'night-watch', 'night watch']),
    filesBlockIssues: false,
  }),
  O: Object.freeze({
    code: 'O',
    label: 'grading',
    aliases: Object.freeze(['o', 'grading', 'on-demand', 'on demand']),
    filesBlockIssues: true,
  }),
  P: Object.freeze({
    code: 'P',
    label: 'promotion',
    aliases: Object.freeze(['p', 'promotion']),
    filesBlockIssues: true,
  }),
  R: Object.freeze({
    code: 'R',
    label: 'review',
    aliases: Object.freeze(['r', 'review']),
    filesBlockIssues: false,
  }),
});

const AUDIT_MODE_BY_ALIAS = new Map(
  Object.values(AUDIT_MODES).flatMap(policy =>
    policy.aliases.map(alias => [alias, policy]),
  ),
);

/** Resolve a scorecard or legacy ledger mode to its lifecycle policy. */
export function auditModePolicy(mode) {
  return typeof mode === 'string'
    ? (AUDIT_MODE_BY_ALIAS.get(mode.trim().toLowerCase()) ?? null)
    : null;
}

/** Rubric §2 grade bands. */
export const GRADE_BANDS = Object.freeze([
  {grade: 'A', min: 90},
  {grade: 'B', min: 80},
  {grade: 'C', min: 70},
  {grade: 'D', min: 60},
  {grade: 'F', min: 0},
]);

/**
 * Letter for a score. Any open BLOCK caps the overall grade at C regardless of
 * arithmetic (rubric §2, grade table).
 */
export function gradeFor(score, openBlocks = 0) {
  if (typeof score !== 'number') return null;
  const band = GRADE_BANDS.find(b => score >= b.min);
  const letter = band ? band.grade : 'F';
  if (openBlocks > 0 && (letter === 'A' || letter === 'B')) return 'C';
  return letter;
}

// ---------------------------------------------------------------------------
// The canonical component predicate — rubric decision #15.
//
// "Any sweep over packages/core/src/*/ also hits hooks, theme, utils, i18n,
//  __tests__, SizeContext, InteractiveRoleContext, NavItem. Ship one canonical
//  predicate so all four modes agree on the denominator."
//
// This is that predicate. It is structural, not a name list, so a new
// context-only or styles-only directory is excluded the day it lands.
// ---------------------------------------------------------------------------

/** Directories under a package src that are infrastructure, never components. */
export const NON_COMPONENT_DIRS = Object.freeze(
  new Set(['hooks', 'theme', 'utils', 'i18n', '__tests__']),
);

/** A file that renders: PascalCase `.tsx`, not a test, story, doc or perf file. */
const RENDERING_FILE = /^[A-Z][A-Za-z0-9]*\.tsx$/;

/**
 * Packages the ledger covers, with the src dir the predicate sweeps and how
 * that src is laid out.
 *
 *   - `nested` (core, lab): one directory per component, `<Name>/<Name>.tsx`.
 *     The directory is the unit; `isComponentDirectory` filters out the
 *     styles-only and context-only ones.
 *   - `flat` (charts, richtext, vega): public component modules live directly
 *     under `src/` and are identified from matching named exports in `src/index.ts`.
 *
 * Add a component-bearing package to `scripts/component-packages.cjs`; the audit
 * roster and component-spec path validation consume that one registry.
 */
export const LEDGER_PACKAGES = COMPONENT_PACKAGES;

/** The covered package names, for human-facing CLI messages. */
const LEDGER_PACKAGE_NAMES = LEDGER_PACKAGES.map(p => p.name);

/**
 * Is `dirName`, directly under `srcDir`, a component directory?
 *
 * This is the predicate for the `nested` packages (core, lab), where one
 * directory holds one component. Flat packages (richtext) have no such
 * directory — see `flatPackageComponents`.
 *
 * A component directory:
 *   1. is not one of the infrastructure directories (hooks/theme/utils/i18n/__tests__);
 *   2. is PascalCase — infrastructure is lowercase by convention;
 *   3. contains at least one top-level PascalCase `.tsx` file, i.e. something
 *      that actually renders.
 *
 * Rule 3 does the real work. It excludes:
 *   - `NavItem`      — only `navItemStyles.stylex.ts`, a shared style module;
 *   - `SizeContext` and `InteractiveRoleContext` — `.ts` context modules with a
 *     `.test.tsx` but nothing that renders.
 * It deliberately does NOT require `index.ts` or a `.doc.mjs`: an unexported or
 * undocumented component is still a component, and the ledger's job is to say
 * so rather than to hide it.
 *
 * @param {string} srcDir absolute path to `packages/<pkg>/src`
 * @param {string} dirName the directory entry name
 * @returns {boolean}
 */
export function isComponentDirectory(srcDir, dirName) {
  if (NON_COMPONENT_DIRS.has(dirName)) return false;
  if (!/^[A-Z]/.test(dirName)) return false;
  let entries;
  try {
    entries = fs.readdirSync(path.join(srcDir, dirName), {withFileTypes: true});
  } catch {
    return false;
  }
  return entries.some(e => e.isFile() && RENDERING_FILE.test(e.name));
}

/**
 * Public component names in a flat package. Matching named exports from
 * `src/index.ts` define the boundary; private rendering helpers and TSX context
 * modules that export only hooks stay out.
 *
 * @param {string} srcDir absolute path to `packages/<pkg>/src`
 * @param {string} [repoRoot]
 * @returns {string[]} public component names
 */
export function flatPackageComponents(srcDir, repoRoot = ROOT) {
  const packageConfig = COMPONENT_PACKAGES.find(
    pkg => path.resolve(repoRoot, pkg.src) === path.resolve(srcDir),
  );
  return packageConfig
    ? flatPackageComponentNames(repoRoot, packageConfig)
    : [];
}

/**
 * Every component in the covered packages, sorted by name. This is the ledger's
 * denominator: it is read from the packages, never from a checked-in list.
 * @param {string} [repoRoot]
 * @returns {{component: string, package: string}[]}
 */
export function listComponents(repoRoot = ROOT) {
  const out = [];
  for (const pkg of LEDGER_PACKAGES) {
    const srcDir = path.join(repoRoot, pkg.src);
    const components =
      pkg.layout === 'flat'
        ? flatPackageComponents(srcDir, repoRoot)
        : nestedPackageComponentNames(repoRoot, pkg);
    for (const component of components) {
      out.push({component, package: pkg.name});
    }
  }
  return out.sort(
    (a, b) =>
      a.component.localeCompare(b.component) ||
      a.package.localeCompare(b.package),
  );
}

// ---------------------------------------------------------------------------
// Ledger IO
// ---------------------------------------------------------------------------

const isUrl = source => /^https?:\/\//.test(source);

/**
 * How long to wait for the wiki before giving up on it.
 *
 * A bare `fetch()` inherits undici's defaults, whose headers timeout is
 * measured in minutes. The failure this guards is not an error — a 404 or a
 * refused connection already lands in the catch below — but a STALL: a
 * connection that opens and then goes quiet. Unbounded, that hangs a CI build
 * or a terminal instead of falling through to the path that already handles
 * "no ledger". Generous for a static file of a few tens of KB.
 */
export const LEDGER_FETCH_TIMEOUT_MS = 10_000;

/**
 * Read a ledger from a path or an http(s) URL.
 * Never throws: a fetch, timeout or parse failure resolves to
 * `{ledger: null, error}` so a caller in CI can degrade to a warning instead of
 * failing a pull request on network flake or on the wiki being momentarily
 * unavailable.
 */
export async function loadLedger(
  source,
  {timeoutMs = LEDGER_FETCH_TIMEOUT_MS} = {},
) {
  try {
    let text;
    if (isUrl(source)) {
      const res = await fetch(source, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      text = await res.text();
    } else {
      text = fs.readFileSync(source, 'utf8');
    }
    const ledger = JSON.parse(text);
    if (!ledger || !Array.isArray(ledger.components)) {
      throw new Error('not a ledger: missing a `components` array');
    }
    return {ledger, error: null};
  } catch (error) {
    // `AbortSignal.timeout` rejects with a TimeoutError whose message is just
    // "The operation was aborted" — say what actually happened instead.
    const message =
      error.name === 'TimeoutError'
        ? `no response within ${timeoutMs}ms`
        : error.message;
    return {ledger: null, error: `${source}: ${message}`};
  }
}

/**
 * A component's identity is its package AND its name: `Chat` exists in both
 * `core` and `lab`, so a name-keyed ledger silently conflates two different
 * components — and would ratchet one against the other.
 */
export const entryId = e => `${e.package || 'unknown'}/${e.component}`;

/**
 * Index a ledger by `package/Component`, with a secondary multimap by bare
 * name for callers (analyze-pr.js, `--record <Component>`) that only have one.
 * @returns {{byId: Map<string, object>, byName: Map<string, object[]>}}
 */
export function indexLedger(ledger) {
  const byId = new Map();
  const byName = new Map();
  for (const entry of ledger.components) {
    byId.set(entryId(entry), entry);
    const list = byName.get(entry.component) || [];
    list.push(entry);
    byName.set(entry.component, list);
  }
  return {byId, byName};
}

/**
 * Resolve a bare component name against the live roster. A name that exists in
 * two packages resolves to two components — the caller must handle both, not
 * pick one.
 */
export function resolveName(name, components = listComponents()) {
  return components.filter(c => c.component === name);
}

/**
 * Join the live roster with the ledger.
 * Every live component gets a row; `entry` is null when nobody has audited it.
 * A ledger row with no live component is surfaced too (`live: false`) rather
 * than silently dropped — that is how a rename or deletion shows up.
 */
export function buildRoster(ledger, components = listComponents()) {
  const {byId} = indexLedger(ledger);
  const roster = components.map(c => ({
    id: `${c.package}/${c.component}`,
    component: c.component,
    package: c.package,
    live: true,
    entry: byId.get(`${c.package}/${c.component}`) || null,
  }));
  const liveIds = new Set(roster.map(r => r.id));
  for (const entry of ledger.components) {
    if (liveIds.has(entryId(entry))) continue;
    roster.push({
      id: entryId(entry),
      component: entry.component,
      package: entry.package || 'unknown',
      live: false,
      entry,
    });
  }
  return roster.sort(
    (a, b) =>
      a.component.localeCompare(b.component) ||
      a.package.localeCompare(b.package),
  );
}

/** Normalize one section entry, filling the rubric weight and defaults. */
export function readSection(entry, id) {
  const raw = (entry && entry.sections && entry.sections[id]) || null;
  return {
    score: raw && raw.score !== undefined ? raw.score : null,
    weight: raw && raw.weight !== undefined ? raw.weight : SECTION_WEIGHTS[id],
    state: raw && raw.state ? raw.state : 'not_measured',
    blocks: (raw && raw.blocks) || [],
    note: (raw && raw.note) || null,
  };
}

export const openBlockCount = entry =>
  entry && entry.blocks && typeof entry.blocks.count === 'number'
    ? entry.blocks.count
    : 0;

export const blockList = entry =>
  (entry && entry.blocks && entry.blocks.open) || [];

const isAudited = entry => !!entry && entry.status === 'audited';

/** The repo that carries audit issues. */
export const DEFAULT_REPO = 'meta/astryx';

/** `A8` -> ``[`A8`](https://github.com/…/issues/123)`` when the BLOCK is filed. */
export function blockLink(block, repo = DEFAULT_REPO) {
  const label = `\`${block.id}\``;
  return block.issue
    ? `${label} ([#${block.issue}](https://github.com/${repo}/issues/${block.issue}))`
    : `${label} (no issue filed)`;
}

/** Open BLOCKs that have been filed as issues, as `#123` links. */
export function issueLinks(entry, repo = DEFAULT_REPO) {
  return blockList(entry)
    .filter(b => b.issue)
    .map(b => `[#${b.issue}](https://github.com/${repo}/issues/${b.issue})`);
}

// ---------------------------------------------------------------------------
// --check — the ratchet
// ---------------------------------------------------------------------------

/**
 * Compare one component's proposed entry against its baseline entry.
 *
 * The rules, in the order they are applied:
 *   1. No head entry, or head is `unaudited`  -> pass. There is no baseline;
 *      the first audit sets it. A PR is NEVER blocked for touching a component
 *      nobody has audited.
 *   2. No base entry, or base is `unaudited`  -> pass, "first audit".
 *   3. `rubricVersion` differs                -> `incomparable`. The two numbers
 *      came off different scales, so the delta is meaningless. This does NOT
 *      fail; it asks for a re-audit under the head version.
 *   4. A new BLOCK appears                    -> fail, even if the score is flat
 *      or higher. A BLOCK is categorically different from points. A rise in
 *      `blocks.count` with no new id counts as a new BLOCK.
 *   5. Score decreased                        -> fail.
 *   6. Otherwise                              -> pass.
 */
export function compareEntry(component, baseEntry, headEntry) {
  const result = {
    component,
    verdict: 'pass',
    reason: '',
    baseScore: baseEntry ? (baseEntry.score ?? null) : null,
    headScore: headEntry ? (headEntry.score ?? null) : null,
    baseBlocks: openBlockCount(baseEntry),
    headBlocks: openBlockCount(headEntry),
    newBlocks: [],
  };

  if (!isAudited(headEntry)) {
    result.reason = headEntry
      ? 'unaudited — no baseline, the first audit sets it'
      : 'not in the ledger — unaudited, no baseline';
    return result;
  }
  if (!isAudited(baseEntry)) {
    result.reason = 'first audit — no prior score to ratchet against';
    return result;
  }

  if ((baseEntry.rubricVersion || null) !== (headEntry.rubricVersion || null)) {
    result.verdict = 'incomparable';
    result.reason =
      'incomparable — rubric version changed ' +
      `(${baseEntry.rubricVersion || 'none'} -> ${headEntry.rubricVersion || 'none'}); ` +
      `re-audit this entry under ${headEntry.rubricVersion || 'the new version'}`;
    return result;
  }

  const baseIds = new Set(blockList(baseEntry).map(b => b.id));
  const newBlocks = blockList(headEntry).filter(b => !baseIds.has(b.id));
  result.newBlocks = newBlocks;

  // A count that rises without a named id is still a new BLOCK: an entry may
  // name only a subset of its BLOCKs, so the count is the authority.
  const countRose = result.headBlocks > result.baseBlocks;

  if (newBlocks.length > 0 || countRose) {
    result.verdict = 'fail';
    result.reason = newBlocks.length
      ? `new BLOCK: ${newBlocks.map(b => `${b.id} (${b.summary})`).join('; ')}`
      : `open BLOCK count rose ${result.baseBlocks} -> ${result.headBlocks}`;
    return result;
  }

  if (
    typeof result.headScore === 'number' &&
    typeof result.baseScore === 'number' &&
    result.headScore < result.baseScore
  ) {
    result.verdict = 'fail';
    result.reason = `score decreased ${result.baseScore} -> ${result.headScore}`;
    return result;
  }

  result.reason =
    typeof result.headScore === 'number' &&
    typeof result.baseScore === 'number' &&
    result.headScore > result.baseScore
      ? `improved ${result.baseScore} -> ${result.headScore}`
      : 'unchanged';
  return result;
}

/**
 * Run the ratchet over a set of components, given as bare names or as
 * `{component, package}` pairs. A bare name that exists in two packages yields
 * one result per package rather than an arbitrary pick.
 */
export function runRatchet(components, baseLedger, headLedger, roster = null) {
  const base = baseLedger
    ? indexLedger(baseLedger)
    : {byId: new Map(), byName: new Map()};
  const head = indexLedger(headLedger);
  const live = roster || listComponents();

  const targets = [];
  for (const item of components) {
    if (typeof item === 'object') {
      targets.push(item);
      continue;
    }
    const matches = resolveName(item, live);
    if (matches.length > 0) {
      targets.push(...matches);
      continue;
    }
    // Not a live component. It may still have a ledger row (a rename, say);
    // otherwise check it as an unknown, which passes.
    const rows = head.byName.get(item) || [];
    if (rows.length > 0)
      targets.push(...rows.map(e => ({component: item, package: e.package})));
    else targets.push({component: item, package: null});
  }

  const seen = new Set();
  const results = [];
  for (const t of targets) {
    const id = `${t.package || 'unknown'}/${t.component}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = resolveName(t.component, live).length > 1 ? id : t.component;
    results.push(
      compareEntry(label, base.byId.get(id) || null, head.byId.get(id) || null),
    );
  }
  return {results, failed: results.some(r => r.verdict === 'fail')};
}

/**
 * Standing for one component when there is no baseline to compare against:
 * where it sits today, and whether this change just made its audit stale.
 */
export function standingFor(component, entry, repo = DEFAULT_REPO) {
  if (!isAudited(entry)) {
    return {
      component,
      status: 'unaudited',
      verdict: 'no baseline — judged on merits',
      line: null,
    };
  }
  const blocks = openBlockCount(entry);
  const links = issueLinks(entry, repo);
  return {
    component,
    status: 'audited',
    verdict: 'known debt, unchanged',
    score: entry.score,
    grade: entry.grade,
    blocks,
    line:
      `**${entry.grade}** ${fmtScore(entry.score)} · ` +
      (blocks === 0
        ? 'no open BLOCKs'
        : `${blocks} recorded BLOCK${blocks === 1 ? '' : 's'}` +
          (links.length ? ` (${links.join(', ')})` : '')) +
      ` · audited ${entry.lastAudited} under rubric v${entry.rubricVersion}`,
  };
}

// ---------------------------------------------------------------------------
// --queue
// ---------------------------------------------------------------------------

/**
 * The auditor's work queue: unaudited first (alphabetical), then audited
 * oldest-first, then lowest-scoring. Coverage grows before anything is
 * re-audited, and the weakest components come back around soonest.
 */
export function buildQueue(roster, limit = Infinity) {
  const unaudited = roster
    .filter(r => r.live && !isAudited(r.entry))
    .sort((a, b) => a.component.localeCompare(b.component))
    .map(r => ({
      component: r.component,
      package: r.package,
      why: 'never audited',
    }));

  const audited = roster
    .filter(r => isAudited(r.entry))
    .sort((a, b) => {
      const byDate = String(a.entry.lastAudited || '').localeCompare(
        String(b.entry.lastAudited || ''),
      );
      if (byDate !== 0) return byDate;
      const as = a.entry.score ?? Infinity;
      const bs = b.entry.score ?? Infinity;
      if (as !== bs) return as - bs;
      return a.component.localeCompare(b.component);
    })
    .map(r => ({
      component: r.component,
      package: r.package,
      why:
        `audited ${r.entry.lastAudited} · ${r.entry.grade} ${fmtScore(r.entry.score)} · ` +
        `${openBlockCount(r.entry)} open BLOCK${openBlockCount(r.entry) === 1 ? '' : 's'}` +
        (r.live ? '' : ' · NO LONGER IN THE PACKAGES'),
    }));

  return [...unaudited, ...audited].slice(0, limit);
}

// ---------------------------------------------------------------------------
// --stats
// ---------------------------------------------------------------------------

export function buildStats(roster) {
  const live = roster.filter(r => r.live);
  const audited = roster.filter(r => isAudited(r.entry));
  const grades = {A: 0, B: 0, C: 0, D: 0, F: 0};
  for (const r of audited) if (r.entry.grade in grades) grades[r.entry.grade]++;

  const sections = {};
  for (const id of SECTION_IDS) {
    const states = {
      scored: 0,
      limited: 0,
      not_measured: 0,
      na: 0,
      unpublished: 0,
    };
    const scores = [];
    for (const r of audited) {
      const s = readSection(r.entry, id);
      if (s.state in states) states[s.state]++;
      if (s.state === 'scored' && typeof s.score === 'number')
        scores.push(s.score);
    }
    sections[id] = {
      weight: SECTION_WEIGHTS[id],
      states,
      mean: scores.length
        ? Math.round(
            (scores.reduce((a, b) => a + b, 0) / scores.length) * 100,
          ) / 100
        : null,
      n: scores.length,
    };
  }

  const dates = audited
    .map(r => r.entry.lastAudited)
    .filter(Boolean)
    .sort();
  const scores = audited
    .map(r => r.entry.score)
    .filter(n => typeof n === 'number');

  return {
    total: live.length,
    audited: audited.length,
    unaudited: live.length - audited.filter(r => r.live).length,
    percentAudited: live.length
      ? Math.round((audited.filter(r => r.live).length / live.length) * 1000) /
        10
      : 0,
    byPackage: LEDGER_PACKAGES.reduce((acc, p) => {
      const inPkg = live.filter(r => r.package === p.name);
      acc[p.name] = {
        total: inPkg.length,
        audited: inPkg.filter(r => isAudited(r.entry)).length,
      };
      return acc;
    }, {}),
    grades,
    openBlocks: audited.reduce((sum, r) => sum + openBlockCount(r.entry), 0),
    componentsWithBlocks: audited.filter(r => openBlockCount(r.entry) > 0)
      .length,
    meanScore: scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
        10
      : null,
    oldestAudit: dates[0] || null,
    newestAudit: dates[dates.length - 1] || null,
    rubricVersions: [
      ...new Set(audited.map(r => r.entry.rubricVersion).filter(Boolean)),
    ].sort(),
    orphanRows: roster.filter(r => !r.live).map(r => r.component),
    sections,
  };
}

// ---------------------------------------------------------------------------
// Small shared formatters
// ---------------------------------------------------------------------------

/** The lowest `scored` section — the one an auditor should attack next. */
export function weakestSection(entry) {
  let worst = null;
  for (const id of SECTION_IDS) {
    const s = readSection(entry, id);
    if (s.state !== 'scored' || typeof s.score !== 'number') continue;
    if (!worst || s.score < worst.score) worst = {id, score: s.score};
  }
  return worst;
}

function fmtScore(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—';
}

/**
 * The paste-to-an-agent request for an audit. One string, exported so the
 * sandbox page and the CLI cannot drift.
 */
export const AUDIT_PROMPT = `Audit the Astryx component <Component> in <AuditMode: N|O|P|R> mode against the Component Audit Rubric:
https://github.com/meta/astryx/wiki/Component-Audit-Rubric

Preserve the selected mode. Assemble the applicable authority before applying
the rubric procedure, in this order:

1. start from the nearest current component contract and every applicable current
   public module contract;
2. follow their applicable links to current family and design requirements;
3. follow referenced current architecture and system decisions, and apply
   applicable objective standards; then
4. apply the rubric procedure last, mapping each applicable requirement to one
   section and one evidence result.

Follow only links needed for this component; do not scan global authority first.
Only records with \`authority: current\` are policy. If a component or module
contract is missing or incomplete, continue from the other applicable current
authority and checkable evidence. You may prepare a draft observational contract
using the existing template and approval flow, but it is optional context, never
policy, and never clears a finding or blocks grading. A backfill is observational
only: it may describe verified shipped behavior, but it must not add, improve,
remove, reinterpret, or otherwise change product meaning.

A conflict between current records, or any question requiring new API meaning or
shape, defaults, compatibility or migration promises, ownership boundaries, or
subjective design judgment, stops remediation and routes to the owning human.
Do not use local implementation or a draft to settle it.

In N, O, and P, grade the whole component, not a diff. Work every section, cite
the rule id for each finding (A8, T6, P2 …), and build a closed inventory from
public exports and types, documented concepts and variants, publicly reachable
states and transitions, and reachable implementation branches. Map each row to
source, existing tests, consumer docs, rendered evidence, applicable current
authority or objective standards, and any conflict or gap. Capture every visible
state in light and dark by driving a real browser against Storybook. If required
evidence is unavailable, use the rubric's \`not_measured\` behavior; never guess
or score it zero. In R, judge the pull-request change and report findings on that
change rather than grading inherited component debt.

Mode lifecycle:

- N — Night Watch: record only the post-fix ledger result and file no ordinary
  per-finding issues. You may batch only tests, stable visual coverage, doc-drift
  fixes, and implementation fixes whose required outcome is already settled by
  current authority or an objective standard. Before any behavior remediation,
  load and follow Matt Pocock's pinned public TDD skill:
  https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/tdd/SKILL.md
  Prove red before production changes and implement one minimal vertical slice
  through an established public seam. Every Night Watch PR remains
  manual-review-only until \`spec:AST-029\` is \`phase: shipped\` and a trusted
  exact-head eligibility check is active. Do not enable auto-merge.
- O — grading: record the audit, then file one issue per open BLOCK.
- P — promotion: apply the promotion rider, record the audit, then file one issue
  per open BLOCK.
- R — review: put findings on the pull request or in its review. File no ordinary
  per-BLOCK issues and do not apply the whole-component ledger lifecycle.

Keep audit data with its existing owner. The wiki ledger stores current post-fix
scores and unresolved findings. The pull request stores the run's reviewable
evidence. The trusted exact-head report belongs in trusted PR/check metadata.
Component and module specs store durable product behavior only; do not put audit
scores, run inventories, screenshots, findings, or eligibility data in them.

Authority changes invalidate linked affected scores on the existing scale: a
component or module change invalidates that component, and an applicable family
or global-authority change invalidates every linked component. Do not bump the
rubric version unless scoring methodology, weights, severities, or evidence
treatment changes.

For N, O, and P, record the selected mode per the rubric's "Recording an audit"
section:

  <your scorecard JSON> | node scripts/score-ledger.mjs --record <Component> \\
    --from - --push

For O and P, follow that successful record with:

  node scripts/score-ledger.mjs --file-issues <Component> --push

For N, include this versioned machine-readable eligibility report in the audit
output even though it is not yet a trusted status input:

  {
    "schemaVersion": 1,
    "component": "<Component>",
    "package": "<package>",
    "auditMode": "N",
    "rubricVersion": "<version>",
    "heads": {"repository": "<sha>", "componentContract": "<sha-or-null>"},
    "inventory": {"closed": false, "gaps": []},
    "unresolvedGaps": {"objective": [], "manual": []},
    "remediations": [
      {"ruleId": "<id>", "beforeEvidence": [], "afterEvidence": []}
    ],
    "approvals": [{"name": "<approval>", "state": "<state>"}],
    "checks": [{"name": "<check>", "state": "<state>"}],
    "eligibility": {"eligible": false, "reasons": []}
  }

Fail closed: missing, stale, inconsistent, or unresolved evidence keeps
\`eligibility.eligible\` false and the PR open for human review. This report does
not activate auto-merge or create an \`audit-eligibility\` status.

Only record what you actually measured.`;

// ---------------------------------------------------------------------------
// --push — the wiki write path
//
// CI cannot write this ledger: scoring is judgment, so the writer is always a
// human or an agent running an audit. A write path that takes six steps gets
// skipped, and the rubric says an audit that isn't recorded didn't happen — so
// recording has to be ONE command.
// ---------------------------------------------------------------------------

/** The reused shallow clone. One per user, not one per run. */
export const WIKI_CACHE_DIR = path.join(
  os.tmpdir(),
  'astryx-score-ledger-wiki',
);

function git(cwd, ...argv) {
  return execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(cwd, ...argv) {
  try {
    return {ok: true, out: git(cwd, ...argv)};
  } catch (e) {
    const out = `${e.stdout || ''}\n${e.stderr || ''}`.trim();
    return {ok: false, out: out || e.message};
  }
}

/**
 * A shallow clone of the wiki, cached between runs so recording a score is not
 * a fresh clone every time.
 *
 * It is hard-reset to the remote tip before it is handed back. A working copy
 * left dirty by a crashed run must never ride along on the next agent's commit
 * — the cache is an optimisation, never a state carrier.
 */
export function ensureWikiClone(dir = WIKI_CACHE_DIR, remote = WIKI_REMOTE) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    git(dir, 'remote', 'set-url', 'origin', remote);
    git(dir, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
  } else {
    fs.rmSync(dir, {recursive: true, force: true});
    git(
      os.tmpdir(),
      'clone',
      '--depth',
      '1',
      '--branch',
      WIKI_BRANCH,
      remote,
      dir,
    );
  }
  git(dir, 'checkout', '-B', WIKI_BRANCH, `origin/${WIKI_BRANCH}`);
  git(dir, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
  git(dir, 'clean', '-fd');
  return dir;
}

/** The repo a wiki remote belongs to, for building URLs. */
export function repoFromWikiRemote(remote = WIKI_REMOTE) {
  const m = /github\.com[/:]([^/]+)\/(.+?)\.wiki(\.git)?$/.exec(remote);
  return m ? `${m[1]}/${m[2]}` : DEFAULT_REPO;
}

/** GitHub renders a single wiki commit at `/wiki/_compare/<sha>`. */
export function wikiCommitUrl(sha, remote = WIKI_REMOTE) {
  return `https://github.com/${repoFromWikiRemote(remote)}/wiki/_compare/${sha}`;
}

/**
 * The commit message for a recorded score. Cindy's format, with the package
 * added only when the bare name is ambiguous — `Chat` exists in core and lab,
 * and a message that does not say which one is a message you cannot read back.
 */
export function commitMessage(
  entry,
  {regression = null, ambiguous = false} = {},
) {
  const name = ambiguous
    ? `${entry.package}/${entry.component}`
    : entry.component;
  const subject =
    `scores: ${name} ${entry.grade} (${fmtScore(entry.score)}), ` +
    `rubric ${entry.rubricVersion}`;
  if (!regression) return {subject, body: ''};
  const body = [
    `Regression allowed: ${regression.reason}`,
    '',
    `Score ${fmtScore(regression.from.score)} → ${fmtScore(entry.score)}, ` +
      `open BLOCKs ${regression.from.blocks} → ${openBlockCount(entry)}.`,
  ].join('\n');
  return {subject, body};
}

/** A unified diff of two in-memory versions, so --dry-run touches no file. */
function unifiedDiff(before, after, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'score-ledger-diff-'));
  try {
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    fs.writeFileSync(a, before);
    fs.writeFileSync(b, after);
    try {
      execFileSync(
        'diff',
        ['-u', '--label', `a/${label}`, '--label', `b/${label}`, a, b],
        {
          encoding: 'utf8',
        },
      );
      return '';
    } catch (e) {
      // `diff` exits 1 when the files differ. That is the expected path.
      if (e.status === 1) return String(e.stdout);
      throw e;
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/** Refuse to commit on behalf of nobody. A public repo keeps real authorship. */
function requireGitIdentity(dir) {
  const name = tryGit(dir, 'config', 'user.name');
  const email = tryGit(dir, 'config', 'user.email');
  if (!name.ok || !name.out || !email.ok || !email.out) {
    throw new Error(
      'no git identity configured — set user.name and user.email before --push. ' +
        'The wiki is public and the commit is attributed to whoever pushes it.',
    );
  }
}

/**
 * Commit the applied ledger and push it, re-applying rather than forcing when
 * another agent got there first.
 *
 * Several agents can record concurrently. Rebasing one JSON edit onto another
 * conflicts far more often than it merges, so a non-fast-forward is not fought:
 * the local commit is thrown away, the tree is reset to the remote tip, and
 * `apply` runs again against what the other agent actually recorded. That is
 * the only correct answer — the second writer has to be ratcheted against the
 * first writer's numbers, not against the ones they started from.
 *
 * `apply` re-reads the ledger from disk and returns the text to write, so the
 * retry is a real re-evaluation and not a replay of a stale result.
 */
function commitAndPush(dir, file, apply, {attempts = 2} = {}) {
  // Resolve both sides: on macOS the temp dir is a symlink, so the path git
  // reports for the work tree and the path we were handed disagree, and the
  // ledger looks like a file outside the repo.
  const root = fs.realpathSync(dir);
  const target = fs.realpathSync(file);
  requireGitIdentity(root);
  const rel = path.relative(root, target) || path.basename(target);
  let lastFailure = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const applied = apply();
    fs.writeFileSync(target, applied.text);

    // `git status --porcelain` is not safe to parse here: the leading status
    // column is whitespace for an unstaged edit, and trimming it shifts the
    // path. Ask for paths directly instead.
    const dirtyOthers = [
      ...git(root, 'diff', '--name-only', 'HEAD').split('\n'),
      ...git(root, 'ls-files', '--others', '--exclude-standard').split('\n'),
    ]
      .filter(Boolean)
      .filter(p => p !== rel);
    if (dirtyOthers.length) {
      throw new Error(
        `the wiki working copy has unrelated changes (${dirtyOthers.join(', ')}) — ` +
          'refusing to push them. Clean the clone and re-run.',
      );
    }

    git(root, 'add', '--', rel);
    const {subject, body} = applied.message;
    const commitArgs = ['commit', '-m', subject];
    if (body) commitArgs.push('-m', body);
    const committed = tryGit(root, ...commitArgs);
    if (!committed.ok) {
      throw new Error(`could not commit the ledger: ${committed.out}`);
    }

    const pulled = tryGit(root, 'pull', '--rebase', 'origin', WIKI_BRANCH);
    if (!pulled.ok) {
      // A conflicted rebase means someone else edited the same rows. Abort and
      // re-apply onto their version rather than resolving JSON by hand.
      tryGit(root, 'rebase', '--abort');
      lastFailure = pulled.out;
      if (attempt < attempts) {
        console.log(
          'score-ledger: the wiki moved under us — re-applying onto the new tip.',
        );
        git(root, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
        git(root, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
        continue;
      }
      break;
    }

    const pushed = tryGit(root, 'push', 'origin', `HEAD:${WIKI_BRANCH}`);
    if (pushed.ok) {
      const sha = git(root, 'rev-parse', 'HEAD');
      return {sha, url: wikiCommitUrl(sha), applied};
    }
    lastFailure = pushed.out;
    const raced = /non-fast-forward|fetch first|rejected|stale info/i.test(
      pushed.out,
    );
    if (!raced || attempt >= attempts) break;
    console.log(
      'score-ledger: push rejected as non-fast-forward — re-applying and retrying once.',
    );
    git(root, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
    git(root, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
  }

  throw new Error(
    `could not push the ledger after ${attempts} attempt(s): ${lastFailure}\n` +
      'Nothing was published. If this is an auth failure, run `gh auth setup-git`.',
  );
}

// ---------------------------------------------------------------------------
// --record
// ---------------------------------------------------------------------------

const SCORECARD_FIELDS = new Set([
  'status',
  'score',
  'grade',
  'sections',
  'blocks',
  'distinct_defects',
  'fixes',
  'nits',
  'lastAudited',
  'rubricVersion',
  'mode',
  'commit',
  'evidence',
  'notes',
]);

const EVIDENCE_FIELDS = new Set(['label', 'path', 'note']);

/**
 * Does one `evidence` entry match the shape the sandbox's `LedgerEntry`
 * declares? Exported because the sandbox generator enforces the same shape on
 * the way out of the wiki, and one definition beats two that drift.
 */
export function isEvidenceItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.label !== 'string') return false;
  return Object.entries(item).every(
    ([k, v]) =>
      EVIDENCE_FIELDS.has(k) &&
      (v === undefined || v === null || typeof v === 'string'),
  );
}

/**
 * Does `blocks` match the declared `{count, open}` shape? A bare array reads
 * as zero open BLOCKs to `openBlockCount` and `blockList`, so it does not
 * merely break the sandbox build: it skips the open-BLOCK grade cap and blinds
 * the ratchet to every BLOCK in it.
 */
export function isBlocksShape(blocks) {
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks))
    return false;
  return typeof blocks.count === 'number' && Array.isArray(blocks.open);
}

/**
 * Merge a scorecard into a ledger entry and validate it.
 * Unknown keys are rejected rather than silently stored — a typo in a field
 * name would otherwise produce a row that reads fine and measures nothing.
 */
export function applyScorecard(existing, scorecard, {component, pkg}) {
  const unknown = Object.keys(scorecard).filter(k => !SCORECARD_FIELDS.has(k));
  if (unknown.length) {
    throw new Error(`unknown scorecard field(s): ${unknown.join(', ')}`);
  }
  const next = {
    component,
    package: (existing && existing.package) || pkg,
    status: 'audited',
    score: null,
    grade: null,
    sections: {},
    blocks: {count: 0, open: []},
    distinct_defects: null,
    fixes: null,
    nits: null,
    lastAudited: null,
    rubricVersion: null,
    mode: null,
    commit: null,
    evidence: [],
    ...(existing || {}),
    ...scorecard,
  };
  if (!next.package)
    throw new Error(`${component}: no package — pass --package`);
  // Checked before the grade, because a bare array (the shape a scorecard
  // naturally takes if you think of blocks as a list) reads as zero open
  // BLOCKs to `openBlockCount`. Left unchecked it does three things at once:
  // the open-BLOCK grade cap never applies, the ratchet sees no BLOCKs to
  // compare, and the sandbox inlines a literal tsc rejects, which breaks
  // every Sandbox build, each pull request's preview included (#5033).
  if (!isBlocksShape(next.blocks)) {
    throw new Error(
      `${component}: blocks must be {count, open: [...]} — a bare array reads as ` +
        'zero open BLOCKs, which skips the grade cap and blinds the ratchet',
    );
  }
  if (next.status !== 'audited') {
    throw new Error(
      `${component}: the ledger holds audited components only — an unaudited component ` +
        'simply has no row. Remove the entry instead.',
    );
  }
  if (typeof next.score !== 'number') {
    throw new Error(`${component}: an audited entry needs a numeric score`);
  }
  const expected = gradeFor(next.score, openBlockCount(next));
  // `grade` is derived from `score`, so it must never be inherited across a
  // re-record: a scorecard that lowers the score without restating the grade
  // would otherwise carry the old letter forward and fail as a contradiction.
  if (!('grade' in scorecard)) next.grade = null;
  if (!next.grade) next.grade = expected;
  if (next.grade !== expected) {
    throw new Error(
      `${component}: grade ${next.grade} contradicts score ${next.score} with ` +
        `${openBlockCount(next)} open BLOCK(s) — expected ${expected} ` +
        '(any open BLOCK caps the grade at C)',
    );
  }
  if (!next.rubricVersion)
    throw new Error(`${component}: rubricVersion is required`);
  if (!next.lastAudited)
    throw new Error(`${component}: lastAudited is required`);
  const mode = auditModePolicy(next.mode);
  if (!mode) {
    throw new Error(
      `${component}: mode must be N (Night Watch), O (grading), P (promotion), ` +
        'or R (review)',
    );
  }
  next.mode = mode.code;
  for (const [id, section] of Object.entries(next.sections || {})) {
    if (!(id in SECTION_WEIGHTS)) {
      throw new Error(`${component}: unknown section id "${id}"`);
    }
    if (section.state && !SECTION_STATES.includes(section.state)) {
      throw new Error(`${component}: unknown section state "${section.state}"`);
    }
    if (section.weight === undefined) section.weight = SECTION_WEIGHTS[id];
  }
  for (const b of blockList(next)) {
    if (!b || typeof b.id !== 'string' || typeof b.summary !== 'string') {
      throw new Error(
        `${component}: every BLOCK needs {id, summary} (issue optional)`,
      );
    }
    if (
      b.issue !== undefined &&
      b.issue !== null &&
      !Number.isInteger(b.issue)
    ) {
      throw new Error(
        `${component}: BLOCK ${b.id} issue must be an integer or null`,
      );
    }
    if (b.issue === undefined) b.issue = null;
  }
  if (blockList(next).length > openBlockCount(next)) {
    throw new Error(
      `${component}: ${blockList(next).length} BLOCKs listed but blocks.count is ` +
        `${openBlockCount(next)}`,
    );
  }
  // The sandbox inlines this row into a typed literal at build time, so a bad
  // shape here is not one broken row: it breaks the Sandbox build for every
  // open PR at once, with no commit responsible (#4924).
  if (!Array.isArray(next.evidence) || !next.evidence.every(isEvidenceItem)) {
    throw new Error(
      `${component}: evidence must be an array of {label, path?, note?} objects — ` +
        'a bare string is the shape that reds every build in the repo',
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const flagValue = v => (typeof v === 'string' ? v : null);

function componentsFromArgs(args) {
  const known = new Set(listComponents().map(c => c.component));
  if (flagValue(args.components)) {
    return args.components
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (flagValue(args.analysis)) {
    const analysis = JSON.parse(fs.readFileSync(args.analysis, 'utf8'));
    const names = [
      ...(analysis.newComponents || []),
      ...(analysis.modifiedComponents || []),
    ];
    // analyze-pr.js has a looser notion of a component (it keeps NavItem,
    // SizeContext and InteractiveRoleContext, and it covers charts). Filter its
    // output through the canonical predicate so the ledger's denominator stays
    // the rubric's.
    return [...new Set(names)].filter(n => known.has(n)).sort();
  }
  return [];
}

async function cmdCheck(args) {
  const components = componentsFromArgs(args);
  if (components.length === 0) {
    console.log(
      `score-ledger: this change touches no component in packages/{${LEDGER_PACKAGE_NAMES.join(',')}}/src — nothing to check.`,
    );
    return 0;
  }

  const {ledger, error} = await loadLedger(
    flagValue(args.ledger) || DEFAULT_LEDGER_URL,
  );
  if (!ledger) {
    // Never fail a pull request because the ledger could not be read. The
    // ledger lives in the wiki; a fetch failure is infrastructure, not a
    // regression.
    console.log(
      `::warning::score-ledger: could not read the ledger (${error}) — skipping the check.`,
    );
    return 0;
  }

  let baseLedger = null;
  if (flagValue(args['base-ledger'])) {
    const loaded = await loadLedger(args['base-ledger']);
    if (!loaded.ledger) {
      console.log(
        `::warning::score-ledger: could not read the base ledger (${loaded.error}) — ` +
          'reporting standing only.',
      );
    } else {
      baseLedger = loaded.ledger;
    }
  }

  const lines = [];
  let exitCode = 0;

  if (baseLedger) {
    const {results, failed} = runRatchet(components, baseLedger, ledger);
    lines.push('## Component score ratchet', '');
    lines.push('| Component | Base | Head | Verdict | Detail |');
    lines.push('|---|---|---|---|---|');
    for (const r of results) {
      const icon =
        r.verdict === 'fail'
          ? '🔴 fail'
          : r.verdict === 'incomparable'
            ? '⚠️ incomparable'
            : '✅ pass';
      lines.push(
        `| ${r.component} | ${fmtScore(r.baseScore)} (${r.baseBlocks} BLOCK) | ` +
          `${fmtScore(r.headScore)} (${r.headBlocks} BLOCK) | ${icon} | ${r.reason} |`,
      );
    }
    lines.push('');
    for (const r of results) {
      if (r.verdict === 'fail') {
        lines.push(
          `🔴 **${r.component}: ${r.reason}.** Score ${fmtScore(r.baseScore)} → ` +
            `${fmtScore(r.headScore)}, open BLOCKs ${r.baseBlocks} → ${r.headBlocks}.`,
        );
      } else if (r.verdict === 'incomparable') {
        lines.push(`⚠️ **${r.component}: ${r.reason}.**`);
      }
    }
    exitCode = failed ? 1 : 0;
  } else {
    // No baseline to ratchet against: the ledger lives in the wiki and a pull
    // request cannot change it. Mode R judges the diff, not the component, so
    // this branch reports and never fails — and it stays quiet about debt the
    // contributor inherited.
    const {byId} = indexLedger(ledger);
    const live = listComponents();
    const standings = components.flatMap(name => {
      const matches = resolveName(name, live);
      const targets = matches.length
        ? matches
        : [{component: name, package: null}];
      return targets.map(t => {
        const label =
          matches.length > 1 ? `${t.package}/${t.component}` : t.component;
        return standingFor(
          label,
          byId.get(`${t.package}/${t.component}`) || null,
        );
      });
    });
    const audited = standings.filter(s => s.status === 'audited');
    if (audited.length === 0) {
      console.log(
        `score-ledger: ${components.length} component(s) touched, none with a recorded audit — ` +
          'no baseline, judged on merits. Nothing to report.',
      );
      return 0;
    }
    lines.push('## Component scores — recorded baselines', '');
    lines.push(
      'For information. These are **recorded baselines, not findings against this pull ' +
        'request** — the ledger lives in the wiki, so a PR cannot change it, and nothing here ' +
        'blocks. A check only ever fails on a regression this diff caused: a new BLOCK, or a ' +
        'lower score. Anything already on the row is known debt with its own issue.',
    );
    lines.push('');
    lines.push('| Component | Recorded | Status |');
    lines.push('|---|---|---|');
    for (const st of audited) {
      lines.push(`| ${st.component} | ${st.line} | known debt, unchanged |`);
    }
    const unaudited = standings.filter(s => s.status !== 'audited');
    if (unaudited.length) {
      lines.push('');
      lines.push(
        `${unaudited.length} other component${unaudited.length === 1 ? '' : 's'} in this diff ` +
          `${unaudited.length === 1 ? 'has' : 'have'} no audit on record — no baseline, judged on ` +
          `merits. See [the component scores page](${SCORES_PAGE_URL}) to request one.`,
      );
    }
    lines.push('');
  }

  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
  return exitCode;
}

async function withLedger(args, fn) {
  const source = flagValue(args.ledger) || DEFAULT_LEDGER_URL;
  const {ledger, error} = await loadLedger(source);
  if (!ledger) {
    console.error(`score-ledger: ${error}`);
    return 1;
  }
  return fn(ledger, buildRoster(ledger));
}

async function cmdQueue(args) {
  return withLedger(args, (ledger, roster) => {
    const limit = flagValue(args.limit) ? Number(args.limit) : 5;
    const queue = buildQueue(roster, limit);
    if (args.json) {
      console.log(JSON.stringify(queue, null, 2));
      return 0;
    }
    console.log(`Audit queue — next ${queue.length}:`);
    for (const [i, e] of queue.entries()) {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${e.component} (${e.package}) — ${e.why}`,
      );
    }
    return 0;
  });
}

async function cmdStats(args) {
  return withLedger(args, (ledger, roster) => {
    const stats = buildStats(roster);
    if (args.json) {
      console.log(JSON.stringify(stats, null, 2));
      return 0;
    }
    const g = stats.grades;
    console.log(
      `Component score ledger — v${ledger.ledgerVersion}, current rubric v${ledger.rubricVersion}`,
    );
    console.log('');
    console.log(
      `  Components:    ${stats.total}  (${stats.audited} audited, ${stats.unaudited} unaudited — ${stats.percentAudited}%)`,
    );
    console.log(
      '                 ' +
        LEDGER_PACKAGE_NAMES.map(
          name =>
            `${name} ${stats.byPackage[name].audited}/${stats.byPackage[name].total}`,
        ).join(' · '),
    );
    console.log(
      `  Grades:        A ${g.A} · B ${g.B} · C ${g.C} · D ${g.D} · F ${g.F}`,
    );
    console.log(`  Mean score:    ${fmtScore(stats.meanScore)} (audited only)`);
    console.log(
      `  Open BLOCKs:   ${stats.openBlocks} across ${stats.componentsWithBlocks} components`,
    );
    console.log(
      `  Audit dates:   oldest ${stats.oldestAudit || '—'} · newest ${stats.newestAudit || '—'}`,
    );
    console.log(`  Rubric vers.:  ${stats.rubricVersions.join(', ') || '—'}`);
    if (stats.orphanRows.length) {
      console.log(
        `  Orphan rows:   ${stats.orphanRows.join(', ')} (no live component)`,
      );
    }
    console.log('');
    console.log('  Sections (audited rows only)');
    for (const id of SECTION_IDS) {
      const s = stats.sections[id];
      const st = s.states;
      console.log(
        `    ${SECTION_TITLES[id].padEnd(38)} w${String(s.weight).padStart(2)}  ` +
          `mean ${s.mean === null ? '   —' : s.mean.toFixed(2)} (n=${s.n})  ` +
          `scored ${st.scored} · limited ${st.limited} · not_measured ${st.not_measured} · ` +
          `na ${st.na} · unpublished ${st.unpublished}`,
      );
    }
    return 0;
  });
}

/**
 * Record one component's scorecard.
 *
 * The whole point of `--push` is that this is ONE command: resolve the
 * component, clone or refresh the wiki, apply the scorecard under the ratchet,
 * commit, rebase onto whatever landed meanwhile, push, and print where it went.
 * Nothing is pushed unless the apply came out clean.
 */
async function cmdRecord(args) {
  const component = flagValue(args.record);
  if (!component) {
    console.error(
      'score-ledger --record <Component>: the component name is required',
    );
    return 1;
  }

  // Read the scorecard exactly once: stdin cannot be read twice, and the push
  // retry re-applies this same scorecard onto a newer ledger.
  const src = flagValue(args.from);
  if (!src) {
    console.error(
      'score-ledger --record: --from <scorecard.json|-> is required',
    );
    return 1;
  }
  let scorecard;
  try {
    const text =
      src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
    scorecard = JSON.parse(text);
  } catch (e) {
    console.error(
      `score-ledger --record: could not read a scorecard from ${src === '-' ? 'stdin' : src} — ${e.message}`,
    );
    return 1;
  }

  const matches = resolveName(component);
  const ambiguous = matches.length > 1;
  if (ambiguous && !flagValue(args.package)) {
    console.error(
      `score-ledger --record: ${component} exists in ${matches.map(m => m.package).join(' and ')} — ` +
        'pass --package to say which one.',
    );
    return 1;
  }
  const live = matches[0];
  if (!live) {
    console.log(
      `score-ledger: warning — ${component} is not a component in ` +
        `packages/{${LEDGER_PACKAGE_NAMES.join(',')}}/src under the canonical predicate. Recording anyway.`,
    );
  }
  const pkg = flagValue(args.package) || (live && live.package) || null;
  if (!pkg) {
    console.error(
      `score-ledger --record: cannot resolve a package for ${component} — pass --package <${LEDGER_PACKAGE_NAMES.join('|')}>.`,
    );
    return 1;
  }

  if (args['allow-regression'] === true) {
    console.error(
      'score-ledger --record: --allow-regression needs a reason — --allow-regression "<why>". ' +
        'It is recorded on the row and in the commit message.',
    );
    return 1;
  }

  // Where the file is. --push (and --dry-run, which needs a baseline to diff
  // against) will fetch the wiki for you; without either you point at your own
  // clone, as before.
  const push = Boolean(args.push);
  const dryRun = Boolean(args['dry-run']);
  let ledgerPath = flagValue(args.ledger);
  let repoDir = null;
  if (ledgerPath && isUrl(ledgerPath)) {
    console.error(
      'score-ledger --record: --ledger must be a local path — recording writes the file. ' +
        'Drop it and pass --push to have the wiki cloned for you.',
    );
    return 1;
  }
  try {
    if (!ledgerPath) {
      if (!push && !dryRun) {
        console.error(
          'score-ledger --record: pass --push (clone the wiki, apply, commit and push) or ' +
            '--ledger <path> pointing at component-scores.json in your own clone.',
        );
        return 1;
      }
      repoDir = ensureWikiClone();
      ledgerPath = path.join(repoDir, LEDGER_FILENAME);
      console.log(
        `score-ledger: wiki clone at ${repoDir} (${WIKI_REMOTE}, ${WIKI_BRANCH})`,
      );
    } else if (push) {
      const top = tryGit(
        path.dirname(path.resolve(ledgerPath)),
        'rev-parse',
        '--show-toplevel',
      );
      if (!top.ok) {
        console.error(
          `score-ledger --record: --push needs ${ledgerPath} to live in a git clone of the wiki ` +
            `(${top.out}). Drop --ledger to use the cached clone instead.`,
        );
        return 1;
      }
      repoDir = top.out;
    }
  } catch (e) {
    console.error(
      `score-ledger --record: could not prepare the wiki clone — ${e.message}`,
    );
    return 1;
  }

  /**
   * Apply the scorecard to whatever is on disk RIGHT NOW and return the text to
   * write. Re-run on a push race so the ratchet judges this audit against the
   * numbers the other writer just published, not the ones we started from.
   */
  const applyOnce = () => {
    const raw = fs.readFileSync(ledgerPath, 'utf8');
    const ledger = JSON.parse(raw);
    if (!Array.isArray(ledger.components)) {
      throw new Error(`${ledgerPath} is not a ledger — no components array`);
    }
    const before = indexLedger(ledger).byId.get(`${pkg}/${component}`) || null;
    const after = applyScorecard(before, scorecard, {component, pkg});

    // The wiki takes no pull request, so the ratchet has to bite here.
    //
    // `incomparable` (the rubric version changed) is the right verdict for a
    // PR-time check — an author must not be failed for a rubric change they had
    // nothing to do with. At RECORD time it is not: it would let any score be
    // written over any other simply by bumping `rubricVersion`, which is the
    // one field the writer controls. So a record that moves the numbers the
    // wrong way needs its reason stated whether or not the scales match; the
    // verdict just changes what the reason has to explain.
    const verdict = compareEntry(component, before, after);
    const movedBackwards =
      before != null &&
      isAudited(before) &&
      (openBlockCount(after) > openBlockCount(before) ||
        (typeof before.score === 'number' &&
          typeof after.score === 'number' &&
          after.score < before.score));
    const needsReason = verdict.verdict === 'fail' || movedBackwards;

    let regression = null;
    if (needsReason) {
      if (!args['allow-regression']) {
        const why =
          verdict.verdict === 'fail'
            ? verdict.reason
            : `${verdict.reason}, and the numbers went down ` +
              `(${fmtScore(before.score)} → ${fmtScore(after.score)}, open BLOCKs ` +
              `${openBlockCount(before)} → ${openBlockCount(after)})`;
        throw new Error(
          `refusing — ${why}. If the regression is real and intended, re-run with ` +
            '--allow-regression "<why>": the reason is recorded on the row and in the commit ' +
            'message.',
        );
      }
      regression = {
        reason: String(args['allow-regression']),
        from: {
          score: before.score,
          blocks: openBlockCount(before),
        },
        recordedAt: new Date().toISOString().slice(0, 10),
      };
      after.regression = regression;
    }

    const idx = ledger.components.findIndex(e => entryId(e) === entryId(after));
    if (idx === -1) ledger.components.push(after);
    else ledger.components[idx] = after;
    ledger.components.sort(
      (a, b) =>
        a.component.localeCompare(b.component) ||
        String(a.package).localeCompare(String(b.package)),
    );
    ledger.updated = new Date().toISOString().slice(0, 10);

    return {
      before,
      after,
      verdict,
      regression,
      raw,
      text: `${JSON.stringify(ledger, null, 2)}\n`,
      message: commitMessage(after, {regression, ambiguous}),
    };
  };

  let applied;
  try {
    applied = applyOnce();
  } catch (e) {
    // Guard rail: an apply that did not come out clean never reaches git.
    console.error(`score-ledger --record: ${e.message}`);
    return 1;
  }

  if (dryRun) {
    const diff = unifiedDiff(applied.raw, applied.text, LEDGER_FILENAME);
    console.log(
      diff || `(${LEDGER_FILENAME} is already exactly this — no change)`,
    );
    console.log('--- commit message ---');
    console.log(applied.message.subject);
    if (applied.message.body) console.log(`\n${applied.message.body}`);
    console.log('----------------------');
    console.log(
      'score-ledger: --dry-run — nothing written, nothing committed, nothing pushed.',
    );
    warnOnRecord(component, applied);
    return 0;
  }

  if (push) {
    let result;
    try {
      result = commitAndPush(repoDir, ledgerPath, applyOnce);
    } catch (e) {
      console.error(`score-ledger --record: ${e.message}`);
      return 1;
    }
    applied = result.applied;
    console.log(
      `score-ledger: recorded ${component} — ${applied.after.grade} ${applied.after.score} ` +
        `(${applied.verdict.reason || 'new entry'}) and pushed ${result.sha.slice(0, 10)}`,
    );
    console.log(`  commit: ${result.url}`);
    console.log(`  live on: ${SCORES_PAGE_URL}`);
  } else {
    fs.writeFileSync(ledgerPath, applied.text);
    console.log(
      `score-ledger: recorded ${component} — ${applied.after.grade} ${applied.after.score} ` +
        `(${applied.verdict.reason || 'new entry'}) in ${ledgerPath}`,
    );
    console.log(
      'score-ledger: not published — commit and push the wiki yourself, or re-run with --push.',
    );
  }

  warnOnRecord(component, applied);
  return 0;
}

/**
 * Everything worth saying about a row that was just written. Warnings, never
 * failures: the score is recorded either way, and an auditor who is told what
 * is missing fixes it far more often than one whose write was rejected.
 */
function warnOnRecord(component, {before, after}) {
  // Grading and promotion own per-BLOCK issues. Night Watch deliberately keeps
  // ordinary findings on the post-fix ledger row, and review findings belong to
  // the pull request, so neither mode receives a contradictory filing warning.
  const mode = auditModePolicy(after.mode);
  const unfiled = blockList(after).filter(b => !b.issue);
  if (unfiled.length && mode?.filesBlockIssues) {
    console.log(
      `::warning::score-ledger: ${unfiled.length} BLOCK(s) on ${component} have no issue ` +
        `(${unfiled.map(b => b.id).join(', ')}). File them — ` +
        `node scripts/score-ledger.mjs --file-issues ${component} --push`,
    );
  } else if (unfiled.length && mode?.code === 'N') {
    console.log(
      `score-ledger: Night Watch mode keeps ${unfiled.length} unresolved BLOCK(s) on the ` +
        'post-fix ledger row; no ordinary per-finding issues are filed.',
    );
  }
  const unattributed = openBlockCount(after) - blockList(after).length;
  if (unattributed > 0) {
    console.log(
      `::warning::score-ledger: ${component} counts ${openBlockCount(after)} open BLOCKs but ` +
        `names ${blockList(after).length}. An unnamed BLOCK cannot be filed, linked, or closed.`,
    );
  }
  // "A resolved BLOCK that leaves the recorded score unchanged means either the
  // fix or the audit is wrong" — rubric, Closing the loop.
  if (
    before &&
    isAudited(before) &&
    openBlockCount(after) < openBlockCount(before) &&
    after.score === before.score &&
    before.rubricVersion === after.rubricVersion
  ) {
    console.log(
      `::warning::score-ledger: ${component} cleared ` +
        `${openBlockCount(before) - openBlockCount(after)} BLOCK(s) but the score did not move ` +
        `(${fmtScore(before.score)}). Clearing a BLOCK lifts that section's ceiling — either the ` +
        'fix or the audit is wrong. Re-check before you push.',
    );
  }
}

/**
 * The body of an audit issue. Everything whoever picks it up needs, because
 * they will not have the audit open: the ledger row, the rule and section, the
 * rubric version, the evidence, the fix — and the closing protocol.
 */
export function issueBody(component, entry, block, repo = DEFAULT_REPO) {
  const section = block.section ? ` (${block.section})` : '';
  return [
    `Found by a component audit of **${component}**, mode ${entry.mode}, ` +
      `rubric **v${entry.rubricVersion}**, at commit \`${entry.commit || 'unknown'}\`.`,
    '',
    `- **Rule:** \`${block.id}\`${section} — see the [Component Audit Rubric]` +
      `(https://github.com/${repo}/wiki/Component-Audit-Rubric).`,
    `- **Ledger row:** [${component} on the component scores page](${SCORES_PAGE_URL}) — recorded ` +
      `${entry.grade} ${entry.score} with ${openBlockCount(entry)} open BLOCK(s).`,
    `- **Finding:** ${block.summary}`,
    block.evidence ? `- **Evidence:** ${block.evidence}` : null,
    block.fix ? `- **Fix:** ${block.fix}` : null,
    '',
    '### Closing protocol',
    '',
    'Resolving this requires:',
    '',
    `1. Re-run the audit for ${component} after the fix — the whole component, ` +
      'not the diff (the rubric\'s "Grading a whole component" section).',
    '2. Put the visual results in the PR description — before/after screenshots of the ' +
      'affected states. The rendered-design section is graded from those.',
    '3. Update the ledger with the new score and clear this BLOCK ' +
      `(\`<scorecard> | node scripts/score-ledger.mjs --record ${component} --from - --push\`).`,
    '4. Close this issue linking that PR.',
    '',
    "If the recorded score doesn't move, either the fix or the audit is wrong.",
  ]
    .filter(l => l !== null)
    .join('\n');
}

/**
 * File one `hardening` issue per unfiled BLOCK and write the numbers back.
 * Idempotent: a BLOCK that already carries an issue number is left alone, and a
 * linked issue that was closed while the BLOCK persists is reopened rather than
 * re-filed.
 *
 * This mutates the ledger too, so it takes the same `--push` write path — the
 * numbers are useless until they are on the row the page reads.
 */
async function cmdFileIssues(args) {
  const component = flagValue(args['file-issues']);
  if (!component) {
    console.error(
      'score-ledger --file-issues <Component>: the component name is required',
    );
    return 1;
  }
  const push = Boolean(args.push);
  let ledgerPath = flagValue(args.ledger);
  let repoDir = null;
  if (ledgerPath && isUrl(ledgerPath)) {
    console.error(
      'score-ledger --file-issues: --ledger must be a local path — it writes back.',
    );
    return 1;
  }
  try {
    if (!ledgerPath) {
      if (!push && !args['dry-run']) {
        console.error(
          'score-ledger --file-issues: pass --push (clone the wiki, file, commit and push) or ' +
            '--ledger <path> pointing at component-scores.json in your own clone.',
        );
        return 1;
      }
      repoDir = ensureWikiClone();
      ledgerPath = path.join(repoDir, LEDGER_FILENAME);
      console.log(
        `score-ledger: wiki clone at ${repoDir} (${WIKI_REMOTE}, ${WIKI_BRANCH})`,
      );
    } else if (push) {
      const top = tryGit(
        path.dirname(path.resolve(ledgerPath)),
        'rev-parse',
        '--show-toplevel',
      );
      if (!top.ok) {
        console.error(
          `score-ledger --file-issues: --push needs ${ledgerPath} to live in a git clone of the ` +
            `wiki (${top.out}).`,
        );
        return 1;
      }
      repoDir = top.out;
    }
  } catch (e) {
    console.error(
      `score-ledger --file-issues: could not prepare the wiki clone — ${e.message}`,
    );
    return 1;
  }

  const repo = flagValue(args.repo) || DEFAULT_REPO;
  const {ledger, error} = await loadLedger(ledgerPath);
  if (!ledger) {
    console.error(`score-ledger: ${error}`);
    return 1;
  }
  const matches = resolveName(component);
  const pkg =
    flagValue(args.package) ||
    (matches.length === 1 ? matches[0].package : null);
  if (!pkg) {
    console.error(
      `score-ledger --file-issues: pass --package for ${component} (it resolves to ` +
        `${matches.length} components).`,
    );
    return 1;
  }
  const entry = indexLedger(ledger).byId.get(`${pkg}/${component}`);
  if (!isAudited(entry)) {
    console.error(
      `score-ledger: ${component} has no audited row — record it first.`,
    );
    return 1;
  }
  const mode = auditModePolicy(entry.mode);
  if (!mode?.filesBlockIssues) {
    const detail =
      mode?.code === 'N'
        ? 'Night Watch files no ordinary per-finding issues; unresolved findings stay on the post-fix ledger row.'
        : 'Only grading (O) and promotion (P) audits file ordinary per-BLOCK issues.';
    console.error(`score-ledger --file-issues: ${detail}`);
    return 1;
  }

  const gh = (...argv) =>
    execFileSync('gh', argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  const filed = [];
  for (const block of blockList(entry)) {
    if (block.issue) {
      // Idempotent: never re-file. Reopen if the issue was closed while the
      // BLOCK is still on the row.
      if (args['dry-run']) {
        console.log(
          `  ${block.id}: already filed as #${block.issue} — skipping`,
        );
        continue;
      }
      try {
        const state = gh(
          'issue',
          'view',
          String(block.issue),
          '--repo',
          repo,
          '--json',
          'state',
          '--jq',
          '.state',
        );
        if (state === 'CLOSED') {
          gh(
            'issue',
            'reopen',
            String(block.issue),
            '--repo',
            repo,
            '--comment',
            `Reopening: \`${block.id}\` is still an open BLOCK on the ${component} ledger row.`,
          );
          console.log(`  ${block.id}: reopened #${block.issue}`);
        } else {
          console.log(`  ${block.id}: already filed as #${block.issue}`);
        }
      } catch (e) {
        console.log(
          `::warning::score-ledger: could not check issue #${block.issue}: ${e.message}`,
        );
      }
      continue;
    }
    const title = `[audit] ${component}: ${block.summary}`;
    const body = issueBody(component, entry, block, repo);
    if (args['dry-run']) {
      console.log(`\n--- would file ---\n${title}\n\n${body}\n`);
      continue;
    }
    const url = gh(
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      title,
      '--label',
      'hardening',
      '--body',
      body,
    );
    const number = Number(url.split('/').pop());
    if (!Number.isInteger(number)) {
      console.error(
        `score-ledger: could not parse an issue number out of "${url}"`,
      );
      return 1;
    }
    block.issue = number;
    filed.push({id: block.id, number});
    console.log(`  ${block.id}: filed #${number} — ${url}`);
  }

  if (!filed.length) {
    if (args['dry-run'])
      console.log('score-ledger: --dry-run — no issue was created.');
    return 0;
  }

  ledger.updated = new Date().toISOString().slice(0, 10);
  const subject =
    `scores: ${component} — link ${filed.length} audit issue` +
    `${filed.length === 1 ? '' : 's'} (${filed.map(f => `${f.id} #${f.number}`).join(', ')})`;

  if (!push) {
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    console.log(
      `score-ledger: wrote ${ledgerPath} — commit and push it, or re-run with --push.`,
    );
    return 0;
  }

  /**
   * Re-read and re-stamp, rather than replaying the text we computed above: on
   * a push race the tree is reset to someone else's newer ledger, and writing
   * our pre-race copy over it would silently drop their record. Stamping issue
   * numbers onto whatever is on disk merges cleanly by construction.
   */
  const applyIssueNumbers = () => {
    const fresh = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const row = indexLedger(fresh).byId.get(`${pkg}/${component}`);
    if (!isAudited(row)) {
      throw new Error(
        `${component} no longer has an audited row in the wiki ledger — not stamping issue ` +
          'numbers onto a row that moved out from under us.',
      );
    }
    const numbers = new Map(filed.map(f => [f.id, f.number]));
    for (const block of blockList(row)) {
      const n = numbers.get(block.id);
      if (n && !block.issue) block.issue = n;
    }
    fresh.updated = new Date().toISOString().slice(0, 10);
    return {
      text: `${JSON.stringify(fresh, null, 2)}\n`,
      message: {subject, body: ''},
    };
  };

  try {
    const result = commitAndPush(repoDir, ledgerPath, applyIssueNumbers);
    console.log(`score-ledger: pushed ${result.sha.slice(0, 10)}`);
    console.log(`  commit: ${result.url}`);
  } catch (e) {
    console.error(`score-ledger --file-issues: ${e.message}`);
    console.error(
      `The issues were filed (${filed.map(f => `#${f.number}`).join(', ')}) but the ledger was ` +
        'not pushed. Re-run with --push to link them — filing is idempotent.',
    );
    return 1;
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(USAGE);
    return 0;
  }
  if (args.check) return cmdCheck(args);
  if (args.queue) return cmdQueue(args);
  if (args.stats) return cmdStats(args);
  if (args.record) return cmdRecord(args);
  if (args['file-issues']) return cmdFileIssues(args);
  console.log(USAGE);
  return 1;
}

// Only run when invoked directly, so tests can import the pure functions.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().then(
    code => process.exit(code),
    err => {
      console.error(`score-ledger: ${err.message}`);
      process.exit(1);
    },
  );
}
