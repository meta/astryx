// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generate-score-ledger.mjs
 * @description Generates apps/sandbox/src/generated/componentScores.ts — the
 *   ROSTER of public components (read from every component-bearing package in
 *   scripts/component-packages.cjs by the canonical predicate in
 *   scripts/score-ledger.mjs) plus a build-time SNAPSHOT of the wiki ledger.
 * @input Registered component-package source roots and the wiki ledger over the
 *   network.
 * @output src/generated/componentScores.ts
 * @position Sandbox build step, run by `pnpm generate`.
 *
 *   The two halves come from different places on purpose. The roster is the
 *   packages: a component added today shows up as TBD tomorrow with nobody
 *   maintaining a list. The scores are the wiki: an auditor records one with a
 *   wiki push and no pull request.
 *
 *   The snapshot exists only so the page is never blank, and so the page still
 *   works when the wiki is unreachable. The page re-fetches the same URL
 *   client-side at runtime, so a score recorded after this build shows up
 *   without a rebuild — and the page labels which of the two you are reading.
 *   If the fetch here fails — offline build, wiki down — the snapshot is null
 *   and the page relies on the live fetch alone; it never fails the build.
 *
 * SYNC: When the ledger schema changes, update scripts/score-ledger.mjs and the
 *   Component-Audit-Rubric wiki page too.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  AUDIT_PROMPT,
  DEFAULT_LEDGER_URL,
  DEFAULT_REPO,
  LEDGER_FETCH_TIMEOUT_MS,
  SECTION_TITLES,
  SECTION_WEIGHTS,
  isBlocksShape,
  isEvidenceItem,
  listComponents,
} from '../../../scripts/score-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'componentScores.ts');

const roster = listComponents(REPO_ROOT);

/**
 * The fields `LedgerEntry` below declares. The ledger is wiki-authored — an
 * auditor records a score with a wiki push and no pull request — so a new key
 * can appear in it at any time, with no review and no commit in this repo.
 * Inlining such a key verbatim emits a literal TypeScript rejects, which reds
 * every build in the repo until someone edits the wiki back (a `regression`
 * key did exactly that on 2026-08-11).
 *
 * So the snapshot carries only known fields. The page's runtime fetch reads
 * the raw ledger and is unaffected; the snapshot is a fallback, and a fallback
 * missing a field the wiki added an hour ago is a far smaller problem than a
 * repo that cannot build. Add the key here and to `LedgerEntry` to adopt it.
 */
const KNOWN_ENTRY_KEYS = new Set([
  'component',
  'package',
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
  'regression',
]);

/**
 * Known keys whose declared type is more than `unknown`, and the predicate that
 * decides whether the wiki's value matches. Surviving KNOWN_ENTRY_KEYS is not
 * enough: a declared key holding the WRONG SHAPE emits a literal tsc rejects
 * just as an undeclared key does. `evidence` written as an array of bare
 * strings did that on 2026-08-14, three days after the `regression` key, the
 * same repo-wide red one layer down.
 */
const ENTRY_KEY_SHAPES = {
  evidence: {check: value => Array.isArray(value) && value.every(isEvidenceItem)},
  // `blocks` is a REQUIRED field of LedgerEntry, so dropping a malformed one
  // trades one tsc error for another. A bare array is the shape that has
  // actually occurred and it is losslessly repairable, so repair it.
  blocks: {
    check: isBlocksShape,
    repair: value =>
      Array.isArray(value) ? {count: value.length, open: value} : {count: 0, open: []},
  },
};

/**
 * The fields `LedgerSection` declares. `pruneEntry` guards the TOP level of an
 * entry, but a section object is inlined whole, so an undeclared key one level
 * down reds every build exactly as `regression` did at the top level — a
 * `changedFrom` note recorded on 2026-08-23 did precisely that. Prune here too.
 */
const KNOWN_SECTION_KEYS = new Set([
  'score',
  'weight',
  'state',
  'note',
  'blocks',
  'changedFrom',
]);

/** Drop keys `LedgerEntry` doesn't declare, or whose shape it rejects. */
const droppedKeys = new Set();
const malformedKeys = new Set();

/** Prune each section object to the keys `LedgerSection` declares. */
function pruneSections(sections) {
  if (sections == null || typeof sections !== 'object' || Array.isArray(sections)) {
    return sections;
  }
  const kept = {};
  for (const [id, section] of Object.entries(sections)) {
    if (section == null || typeof section !== 'object' || Array.isArray(section)) {
      kept[id] = section;
      continue;
    }
    const kept_section = {};
    for (const [k, v] of Object.entries(section)) {
      if (KNOWN_SECTION_KEYS.has(k)) kept_section[k] = v;
      else droppedKeys.add(`sections.*.${k}`);
    }
    kept[id] = kept_section;
  }
  return kept;
}

function pruneEntry(entry) {
  const kept = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!KNOWN_ENTRY_KEYS.has(k)) {
      droppedKeys.add(k);
      continue;
    }
    const shape = ENTRY_KEY_SHAPES[k];
    if (shape && !shape.check(v)) {
      malformedKeys.add(`${entry.component ?? '?'}.${k}`);
      if (shape.repair) kept[k] = shape.repair(v);
      continue;
    }
    kept[k] = k === 'sections' ? pruneSections(v) : v;
  }
  return kept;
}

let snapshot = null;
let snapshotFetchedAt = null;
try {
  // Bounded on purpose. A 404 or a refused connection lands in the catch
  // immediately, but a STALLED connection would not: a bare fetch inherits
  // undici's defaults, whose headers timeout is measured in minutes. This step
  // is on the critical path of every sandbox build, including the stable
  // /sandbox/ deploy from main, so "never fail the build over this" has to
  // cover hanging too — five seconds is generous for one small static file.
  const res = await fetch(DEFAULT_LEDGER_URL, {
    redirect: 'follow',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = JSON.parse(await res.text());
  if (!Array.isArray(parsed.components)) throw new Error('missing a components array');
  snapshot = {...parsed, components: parsed.components.map(pruneEntry)};
  snapshotFetchedAt = new Date().toISOString();
  console.log(
    `componentScores: snapshot of ${parsed.components.length} audited component(s) from the wiki`,
  );
} catch (e) {
  // Never fail the build over this — and never hang it either. The page
  // fetches the same URL at runtime and says which copy it is showing.
  const why = e.name === 'TimeoutError' ? 'no response within 5000ms' : e.message;
  console.warn(
    `componentScores: could not snapshot the ledger (${why}) — the page will rely on its runtime fetch.`,
  );
}

if (droppedKeys.size > 0) {
  console.warn(
    `componentScores: the wiki ledger carries ${droppedKeys.size} field(s) LedgerEntry does not declare ` +
      `(${[...droppedKeys].sort().join(', ')}) — dropped from the snapshot. ` +
      `Add them to LedgerEntry/LedgerSection and the matching KNOWN_*_KEYS set to surface them.`,
  );
}

if (malformedKeys.size > 0) {
  console.warn(
    `componentScores: the wiki ledger holds ${malformedKeys.size} field(s) whose shape LedgerEntry rejects ` +
      `(${[...malformedKeys].sort().join(', ')}) — repaired or dropped in the snapshot. ` +
      `Fix the row in the wiki; the page's runtime fetch still reads it as written.`,
  );
}

const banner = `// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * GENERATED FILE — do not edit.
 * Regenerate: node apps/sandbox/scripts/generate-score-ledger.mjs
 *
 * \`roster\` is read from every component-bearing package registered in
 * scripts/component-packages.cjs. \`snapshot\` is a build-time copy of the wiki
 * ledger, used only
 * until the page's runtime fetch of LEDGER_URL resolves.
 */
`;

const source = `${banner}
export interface LedgerBlock {
  /** Rubric rule id, e.g. \`A8\` or \`T6\`. */
  id: string;
  summary: string;
  section?: string;
  evidence?: string;
  /** The \`hardening\` issue filed for this BLOCK, or null if none is filed. */
  issue: number | null;
}

export interface LedgerSection {
  score: number | null;
  weight: number;
  state: 'scored' | 'limited' | 'not_measured' | 'na' | 'unpublished';
  note?: string | null;
  /** Why this section's score changed from an earlier draft of the same audit. */
  changedFrom?: string | null;
  blocks?: LedgerBlock[];
}

export interface LedgerEntry {
  component: string;
  package: string;
  status: 'audited';
  score: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  sections: Record<string, LedgerSection>;
  blocks: {count: number; open: LedgerBlock[]};
  distinct_defects: number | null;
  fixes: number | null;
  nits: number | null;
  lastAudited: string | null;
  rubricVersion: string | null;
  mode: string | null;
  commit: string | null;
  evidence?: Array<{label: string; path?: string; note?: string}>;
  notes?: string;
  /** Set when a re-audit scored lower than the row it replaced, or when it
   *  records a BLOCK the previous passes missed — why the drop is not a new
   *  defect, and what it was before. */
  regression?: {
    reason: string;
    from: {score: number | null; blocks: number};
    recordedAt: string;
  };
}

export interface Ledger {
  ledgerVersion: number;
  rubricVersion: string;
  updated: string;
  about?: string;
  caveats?: string[];
  components: LedgerEntry[];
}

export interface RosterEntry {
  component: string;
  package: string;
}

/** The wiki ledger, fetched client-side so the page never needs a rebuild. */
export const LEDGER_URL = ${JSON.stringify(DEFAULT_LEDGER_URL)};

/**
 * How long the page waits for that fetch before falling back to the snapshot.
 * Shared with the CLI so there is one number: a stalled connection never
 * rejects on its own, and a page stuck on "checking" is the same dishonesty
 * the freshness indicator exists to prevent.
 */
export const LEDGER_FETCH_TIMEOUT_MS = ${JSON.stringify(LEDGER_FETCH_TIMEOUT_MS)};

/** Where audit issues live. */
export const REPO = ${JSON.stringify(DEFAULT_REPO)};

export const RUBRIC_URL = ${JSON.stringify(
  `https://github.com/${DEFAULT_REPO}/wiki/Component-Audit-Rubric`,
)};

/**
 * The ledger file in the wiki. It is the ONLY stored form of the scores —
 * there is no generated table page to link at, on purpose: a second copy goes
 * stale the moment the JSON changes without a regeneration.
 */
export const LEDGER_WIKI_URL = ${JSON.stringify(DEFAULT_LEDGER_URL)};

/** The paste-to-an-agent request for an audit. Shared with the CLI. */
export const AUDIT_PROMPT = ${JSON.stringify(AUDIT_PROMPT)};

export const SECTION_TITLES: Record<string, string> = ${JSON.stringify(SECTION_TITLES, null, 2)};

export const SECTION_WEIGHTS: Record<string, number> = ${JSON.stringify(SECTION_WEIGHTS, null, 2)};

/** Every component in the registered component-package source roots. */
export const roster: RosterEntry[] = ${JSON.stringify(roster, null, 2)};

/**
 * Build-time copy of the ledger, used ONLY until the runtime fetch resolves and
 * as the fallback when it fails. Null when the build could not reach the wiki.
 * The page says which of the two it is showing — a stale page that looks live
 * is worse than one that admits it.
 */
export const snapshot: Ledger | null = ${JSON.stringify(snapshot, null, 2)};

/** When the snapshot above was taken, so the fallback can date itself. */
export const snapshotFetchedAt: string | null = ${JSON.stringify(snapshotFetchedAt)};
`;

fs.mkdirSync(OUT_DIR, {recursive: true});
fs.writeFileSync(OUT_FILE, source);
console.log(
  `componentScores: wrote ${path.relative(REPO_ROOT, OUT_FILE)} — ${roster.length} components in the roster`,
);
