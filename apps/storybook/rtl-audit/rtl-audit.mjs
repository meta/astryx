#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rtl-audit.mjs
 * @description RTL semantic audit. Grades component stories against the astryx
 *   RTL contract by comparing their LTR vs RTL render in the SAME run
 *   (relationship-based, no golden screenshots). Two layers:
 *     (A) AUTO-DISCOVERY — runs over EVERY `core-*` and `lab-*` story with zero
 *         curated selectors, so a NEW component that ships without RTL handling
 *         is caught automatically. Three auto passes:
 *           - D1 (icon-mirror): directional SVG icons must flip/swap under RTL.
 *           - D5 (positional-mirror): an absolutely/fixed-positioned element
 *             with a LOGICAL anchor (insetInlineStart/End) + an UNFLIPPED
 *             PHYSICAL transform (translate/translateX) lands on the WRONG SIDE
 *             in RTL. Lint can't see this — each prop is individually fine; the
 *             bug is their interaction at layout time. We assert each candidate's
 *             RTL center mirrors its LTR center about the offsetParent center.
 *           - D6 (directional-decoration): single-glyph, aria-hidden decorations
 *             in repeated-item or between-sibling contexts mirror exactly once.
 *     (B) CURATED PRECISION — targets.json entries add D2 (order-flip),
 *         D3 (behavior-flip), D4 (overlay-side), D7 (coarse native size/alignment),
 *         D8 (logical inline-edge mirroring), and D9 (logical grouped corners):
 *         the geometry/behavior dims that genuinely need hand-written selectors.
 *     (C) APPLICABILITY: every component is measured, explicitly verified N/A,
 *         or reported as a coverage gap. An all-N/A result is never called clean.
 * @input --storybook-dir <path> --output <file> [--targets <path>]
 *   [--verified-not-applicable <path>] [--filter <csv>] [--packages <csv>]
 *   [--auto-only] [--curated-only]
 *   [--shard <i>/<n> --shard-output <file>] audit every n-th planned item and
 *   write only those cards; [--merge-shards <dir>] build the report from a
 *   complete shard set without a browser (rtl-audit-shards.mjs).
 * @output JSON scorecard: D1/D5/D6 auto verdicts, curated D2/D3/D4/D7/D8/D9
 *   results, exact planned/completed scan counts, a component coverage
 *   rollup, and the worker pages replaced after a failed story
 *   (`pageRecoveries`). Mirrors the pr-a11y accessibility-audit harness.
 * @position internal test harness; run by the soft-gated `pr-rtl` CI job and
 *   locally via `pnpm -F @astryxdesign/storybook rtl-audit`.
 *
 * D1 icon-mirror is asserted DIRECTLY off the DOM, never via pixel-diffing:
 * the shared `rtlStyles.mirror` style applies scaleX(-1) via `:is([dir="rtl"] *)`.
 * We read the icon wrapper's computed `transform` and assert it is a
 * horizontal-flip matrix (matrix(-1,0,0,1,...)) under RTL and identity/none
 * under LTR. Name-swap components (which swap chevronLeft<->chevronRight) are
 * ALSO caught by auto-discovery: the LTR glyph is a left-chevron and the RTL
 * glyph is a right-chevron, i.e. the rendered directional path changes.
 */

import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import componentPackages from '../../../scripts/component-packages.cjs';
import {
  AUDITED_PACKAGE_NAMES,
  AUDITED_STORY_PREFIXES,
  buildAuditedComponentRoster,
  buildComponentCoverage,
  buildStoryComponentRoutes,
  classifyLogicalGroupedCorners,
  classifyLogicalInlinePair,
  collectDirectionalDecorations,
  componentFromTarget,
  evaluateDirectionalDecorations,
  filterStoryRoutesByPackages,
} from './rtl-audit-coverage.mjs';
import {
  createCuratedPages,
  createPagePool,
  mapPool,
  runSteps,
} from './rtl-audit-pool.mjs';
import {
  mergeRtlShards,
  parseShard,
  readShardFiles,
  readStorybookSha,
  shardFile,
  shardPositions,
} from './rtl-audit-shards.mjs';

const {
  componentPackage,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = componentPackages;

const args = process.argv.slice(2);
const getArg = name => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
};
const hasFlag = name => args.includes(`--${name}`);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '../../..');
const DIST = getArg('storybook-dir') || 'apps/storybook/dist';
const OUT = getArg('output') || 'rtl-audit-report.json';
const TARGETS_PATH = getArg('targets') || path.join(HERE, 'targets.json');
const VERIFIED_NA_PATH =
  getArg('verified-not-applicable') ||
  path.join(HERE, 'verified-not-applicable.json');
const FILTER = (getArg('filter') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const PACKAGE_FILTER = (getArg('packages') || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const invalidPackages = PACKAGE_FILTER.filter(
  packageName => !AUDITED_PACKAGE_NAMES.includes(packageName),
);
if (invalidPackages.length > 0) {
  throw new Error(`unknown audited package(s): ${invalidPackages.join(', ')}`);
}
const ACTIVE_PACKAGE_NAMES = PACKAGE_FILTER.length > 0
  ? PACKAGE_FILTER
  : AUDITED_PACKAGE_NAMES;
const AUTO_ONLY = hasFlag('auto-only');
const CURATED_ONLY = hasFlag('curated-only');
// Story-id prefixes the auto-discovery layer sweeps come from the same
// canonical package registry used for source discovery below.
const AUDITED_STORY_PREFIX = new RegExp(`^(?:${AUDITED_STORY_PREFIXES.join('|')})`);
// Worker pool size. Each worker holds one Playwright page at a time; stories
// are independent, and the run is dominated by page-load latency rather than
// CPU. A worker whose story fails gets a fresh page before its next story
// (rtl-audit-pool.mjs), so one unusable page cannot fail the stories after it.
// Defaults to 1 (serial) so the per-PR job's behaviour is unchanged while the
// suite is still soft-gated; rtl-weekly.yml opts into 4 for the full sweep.
const CONCURRENCY = Math.max(1, Number(getArg('concurrency') || process.env.RTL_CONCURRENCY || 1));
// D5 positional-mirror reveal: opening interaction-gated surfaces on EVERY core
// story (1365 stories) is expensive and, at that scale, a flake/timeout risk
// during the soft-gate window. The fully-validated bug class (Avatar status-dot,
// sticky shadow, ResizeHandle, Carousel pill) lives in STATIC elements, so the
// default D5 pass scans the rendered story WITHOUT the reveal step (fast, no
// per-story popover waits). Overlay coverage — scanning positioned elements that
// only mount inside an opened popover/dialog — is available via --pm-reveal and
// is validated (DateInput popover elements mirror), but stays opt-in until the
// stability window promotes it. See README "D5 positional-mirror".
const PM_REVEAL = hasFlag('pm-reveal');
// A sharded audit: each `--shard i/n` job audits every n-th D1 target, story
// and curated target and writes only those cards (`--shard-output`);
// `--merge-shards` then builds the report from the complete set, exactly as
// one run would, without opening a browser.
const SHARD = getArg('shard') === null ? null : parseShard(getArg('shard'));
const SHARD_OUTPUT = getArg('shard-output');
const MERGE_SHARDS = getArg('merge-shards');
if ((SHARD === null) !== (SHARD_OUTPUT === null)) {
  throw new Error('--shard and --shard-output must be given together');
}
if (SHARD !== null && MERGE_SHARDS !== null) {
  throw new Error('--shard and --merge-shards cannot be combined');
}

// ---------------------------------------------------------------------------
// static file server (same shape as accessibility-audit.js)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.map': 'application/json', '.ico': 'image/x-icon',
};
function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const fp = path.resolve(path.join(root, u));
      if (!fp.startsWith(path.resolve(root))) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      fs.readFile(fp, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, {'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream'});
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port}));
  });
}

const storyUrl = (port, id, rtl, args = {}) => {
  const argQuery = Object.entries(args)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  const argsParam = argQuery ? `&args=${encodeURIComponent(argQuery)}` : '';
  return `http://127.0.0.1:${port}/iframe.html?id=${id}&viewMode=story${rtl ? '&globals=direction:rtl' : ''}${argsParam}`;
};

async function settle(page) {
  // Wait for the story to render (load event + fonts), but do NOT block on
  // `networkidle` — some stories keep long-lived connections open and would
  // stall the whole run. Wait for Storybook to mount the story root, then use
  // a short fixed settle for fonts, direction globals, and layout to apply.
  await page.waitForLoadState('load').catch(() => {});
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached', timeout: 10000})
    .catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page
    .addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}',
    })
    .catch(() => {});
  await page.waitForTimeout(200);
}

async function doSetup(page, t) {
  if (t?.setup?.args) {
    await page
      .waitForFunction(() => window.__STORYBOOK_ADDONS_CHANNEL__ != null)
      .catch(() => {});
    await page
      .evaluate(
        ({storyId, updatedArgs}) => {
          window.__STORYBOOK_ADDONS_CHANNEL__?.emit('updateStoryArgs', {
            storyId,
            updatedArgs,
          });
        },
        {storyId: t.storyId, updatedArgs: t.setup.args},
      )
      .catch(() => {});
    await page.waitForTimeout(250);
  }
  if (t?.setup?.click) {
    for (const sel of [].concat(t.setup.click)) {
      await page.locator(sel).first().click({timeout: 2500}).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

// Reveal interaction-gated content (popovers, dialogs, menus, comboboxes) so
// directional icons that live inside a closed disclosure surface actually
// render before we scan. Many directional glyphs live here — e.g. the Calendar
// nav chevrons inside a DateInput popover, which are mounted-but-0x0 (and thus
// unmirrorable) until the popover opens. Without this, a closed story would
// false-flag those chevrons as not-RTL even though they mirror correctly once
// shown.
//
// Fully defensive: every action is time-boxed and swallowed, so stories with no
// disclosure surfaces (the vast majority) are untouched and never hang. We only
// open triggers that ARE currently collapsed (aria-expanded="false" /
// combobox / aria-haspopup) and stop as soon as popover/dialog content appears.
const REVEAL_TRIGGERS = [
  '[aria-haspopup="dialog"][aria-expanded="false"]',
  '[aria-haspopup="menu"][aria-expanded="false"]',
  '[aria-haspopup="listbox"][aria-expanded="false"]',
  '[role="combobox"][aria-expanded="false"]',
  'button[aria-expanded="false"][aria-haspopup]',
];
const REVEALED_CONTENT = '[role="dialog"], [role="menu"], [role="listbox"], [popover], [data-radix-popper-content-wrapper]';

async function revealInteractionGated(page) {
  try {
    // Find the first currently-collapsed disclosure trigger.
    let clicked = false;
    for (const sel of REVEAL_TRIGGERS) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0) {
        await loc.click({timeout: 1500}).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) return false;
    // Wait briefly for revealed content to mount; don't fail if it doesn't.
    await page
      .locator(REVEALED_CONTENT)
      .first()
      .waitFor({state: 'visible', timeout: 1500})
      .catch(() => {});
    await page.waitForTimeout(250);
    return true;
  } catch {
    return false;
  }
}

async function boxOf(page, sel, nth = 0) {
  const loc = page.locator(sel).nth(nth);
  await loc.waitFor({state: 'visible', timeout: 2500}).catch(() => {});
  if ((await loc.count()) === 0) return null;
  const b = await loc.first().boundingBox().catch(() => null);
  return b ? {cx: b.x + b.width / 2, cy: b.y + b.height / 2, ...b} : null;
}

// A transform is a pure horizontal flip iff it reads matrix(-1, 0, 0, 1, tx, ty).
function isFlipMatrix(transform) {
  if (!transform || transform === 'none') return false;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return false;
  const [a, b, c, d] = m[1].split(',').map(v => parseFloat(v.trim()));
  return Math.abs(a + 1) < 0.01 && Math.abs(b) < 0.01 && Math.abs(c) < 0.01 && Math.abs(d - 1) < 0.01;
}
// Is `rtl` the mirror of `ltr`? i.e. rtl == scaleX(-1) . ltr, comparing the
// linear part only (translation does not affect mirroring). Pre-multiplying by
// scaleX(-1) negates the top row of the 2x2, so [a,b,c,d] -> [-a, b, -c, d]
// in CSS's column-major matrix(a,b,c,d) ordering.
function isMirrorOf(rtl, ltr) {
  if (!Array.isArray(rtl)) return false;
  const base = Array.isArray(ltr) ? ltr : [1, 0, 0, 1];
  const expected = [-base[0], base[1], -base[2], base[3]];
  return expected.every((v, i) => Math.abs(v - rtl[i]) < 0.01);
}

function isIdentityTransform(transform) {
  if (!transform || transform === 'none') return true;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return true;
  const [a, b, c, d] = m[1].split(',').map(v => parseFloat(v.trim()));
  return Math.abs(a - 1) < 0.01 && Math.abs(b) < 0.01 && Math.abs(c) < 0.01 && Math.abs(d - 1) < 0.01;
}

async function wrapperTransform(page, sel) {
  const loc = page.locator(sel).first();
  if ((await loc.count()) === 0) return null;
  return loc.evaluate(el => getComputedStyle(el).transform).catch(() => null);
}
async function iconPath(page, sel) {
  const loc = page.locator(`${sel} svg path`).first();
  if ((await loc.count()) === 0) return null;
  return loc.evaluate(el => el.getAttribute('d')).catch(() => null);
}

// ===========================================================================
// AUTO-DISCOVERY: detect directional icons generically, in-page
// ===========================================================================
// The detector runs inside the page. It classifies each icon-bearing SVG as
// LEFT / RIGHT / NON-DIRECTIONAL using (1) lucide class names, (2) the fallback
// registry path signatures, and (3) the enclosing button's aria-label context.
// Vertical glyphs (up/down chevrons, vertical carets) are explicitly excluded.
// Ambiguous glyphs are treated as NON-DIRECTIONAL (err toward not flagging).
const DETECTOR = /* js */ `
(() => {
  // Known directional path signatures (whitespace-normalized, lowercased).
  const LEFT_PATHS = new Set([
    'm15 6l-6 6 6 6',        // core defaultIcons chevronLeft
    'm15 18-6-6 6-6',        // lucide chevron-left
    'm11 17-5-5 5-5m6 10-5-5 5-5', // lucide chevrons-left
    'm12 19-7-7 7-7m8 14-7-7 7-7', // arrow-big style (rare)
  ]);
  const RIGHT_PATHS = new Set([
    'm9 6l6 6-6 6',          // core defaultIcons chevronRight
    'm9 18 6-6-6-6',         // lucide chevron-right
    'm13 17 5-5-5-5m-6 10 5-5-5-5', // lucide chevrons-right
  ]);
  const norm = d => (d || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  // lucide class -> direction (only L/R; up/down/vertical excluded)
  function dirFromClass(cls) {
    const c = (cls || '').toLowerCase();
    if (/lucide-(chevron|chevrons|arrow|arrow-big|caret|caret-left|circle-arrow|corner|move|square-arrow|square-chevron|chevron-first|arrow-left-to-line)?-?left\\b/.test(c)) return 'left';
    if (/lucide-(chevron|chevrons|arrow|arrow-big|caret|caret-right|circle-arrow|corner|move|square-arrow|square-chevron|chevron-last|arrow-right-to-line)?-?right\\b/.test(c)) return 'right';
    if (/left/.test(c) && /lucide/.test(c) && !/(up|down|top|bottom|vertical)/.test(c)) return 'left';
    if (/right/.test(c) && /lucide/.test(c) && !/(up|down|top|bottom|vertical)/.test(c)) return 'right';
    return null;
  }
  function dirFromAria(label) {
    const l = (label || '').toLowerCase();
    if (/\\b(previous|prev|back|scroll left|go left|collapse sidebar|expand row|expand group)\\b/.test(l)) return 'ctx';
    if (/\\b(next|forward|scroll right|go right)\\b/.test(l)) return 'ctx';
    return null;
  }
  // Compose the transforms from the icon up through its ancestors into one 2x2
  // matrix (the linear part; translation is irrelevant to mirroring).
  //
  // We deliberately do NOT hunt for a single element whose transform is a pure
  // flip. A mirror may be folded into the same declaration as a state rotation
  // (transform: scaleX(-1) rotate(90deg)) because both are the one transform
  // property, so on one element the later value would otherwise win. That
  // composition renders identically to the older nested-element form, but no
  // individual element then reads as a flip. Comparing the COMPOSED matrix
  // against its LTR counterpart tests the contract (is the glyph mirrored?)
  // instead of the DOM shape that happens to implement it.
  function composedMatrixFor(iconEl) {
    let acc = [1, 0, 0, 1];
    const mul = (m, n) => [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
    ];
    let el = iconEl;
    let steps = 0;
    while (el && steps < 6) {
      const tf = getComputedStyle(el).transform;
      if (tf && tf !== 'none') {
        const m = tf.match(/matrix\\(([^)]+)\\)/);
        if (m) {
          const p = m[1].split(',').map(v => parseFloat(v.trim()));
          // Ancestor transforms apply outermost-last: parent then child.
          acc = mul([p[0], p[1], p[2], p[3]], acc);
        }
      }
      el = el.parentElement;
      steps++;
    }
    return acc;
  }
  const svgs = Array.from(document.querySelectorAll('svg'));
  const found = [];
  const seenPaths = new Set();
  for (const svg of svgs) {
    // classify
    const pathEls = Array.from(svg.querySelectorAll('path'));
    const dcat = pathEls.map(p => norm(p.getAttribute('d'))).join('|');
    let dir = null;
    // 1) path signature
    for (const p of pathEls) {
      const nd = norm(p.getAttribute('d'));
      if (LEFT_PATHS.has(nd)) { dir = 'left'; break; }
      if (RIGHT_PATHS.has(nd)) { dir = 'right'; break; }
    }
    // 2) lucide class on svg
    if (!dir) dir = dirFromClass(svg.getAttribute('class'));
    if (!dir) {
      // some icon spans put the lucide class on the wrapping span
      const wrapCls = (svg.closest('[class*=lucide]')?.getAttribute('class')) || '';
      dir = dirFromClass(wrapCls);
    }
    if (!dir) continue; // non-directional -> skip
    // Skip icons that are not actually rendered (0x0 box): they are hidden
    // inside a collapsed disclosure surface (popover/menu) that our reveal
    // step could not open, so their mirror transform can't be evaluated. Such
    // an icon must NOT count as a directional finding — otherwise a closed
    // popover would false-flag it as not-RTL. If reveal opened the surface the
    // icon has a real box and IS scanned.
    const box = svg.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    // dedupe by (direction + path signature) so a repeated glyph (e.g. many
    // tree rows) is reported once
    const key = dir + '::' + dcat;
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    const btn = svg.closest('button,[role=button],a');
    const aria = btn ? (btn.getAttribute('aria-label') || '') : '';
    const matrix = composedMatrixFor(svg);
    const flip =
      Math.abs(matrix[0] + 1) < 0.01 && Math.abs(matrix[1]) < 0.01 &&
      Math.abs(matrix[2]) < 0.01 && Math.abs(matrix[3] - 1) < 0.01;
    found.push({dir, aria: aria.slice(0, 40), pathSig: dcat.slice(0, 40), matrix, flip});
  }
  return found;
})()
`;

async function detectDirectionalIcons(page) {
  return page.evaluate(DETECTOR).catch(() => []);
}

async function detectDirectionalDecorations(page) {
  return page.evaluate(collectDirectionalDecorations).catch(() => []);
}

// D6 contextual directional decorations: every story, because contextual
// separators often live outside a component's default story. The verdict comes
// from one LTR and (only when LTR found a candidate) one RTL measurement taken
// by measureAutoStory() below.
function decorationCard(component, storyId, ltr, rtl) {
  const card = {component, storyId, dim: 'D6-decoration', verdict: 'N-A', notes: [], decorations: 0, results: []};
  if (ltr.decorations.length === 0) {
    if (ltr.revealed) card.notes.push('opened an interaction-gated surface before scanning');
    card.notes.push('no contextual directional decorations');
    return card;
  }
  const evaluated = evaluateDirectionalDecorations(ltr.decorations, rtl.decorations);
  card.verdict = evaluated.verdict;
  card.notes.push(...evaluated.notes);
  card.results = evaluated.results;
  card.decorations = Math.max(ltr.decorations.length, rtl.decorations.length);
  if (ltr.revealed || rtl.revealed) card.notes.unshift('opened an interaction-gated surface before scanning');
  return card;
}

// ===========================================================================
// AUTO-DISCOVERY: D5 positional-mirror
// ===========================================================================
// Catches a bug class that D1 (icon-mirror) and the `@astryx/no-physical-
// properties` lint BOTH miss: an element positioned with a LOGICAL anchor
// (insetInlineStart/End, which DOES flip under RTL) paired with an UNFLIPPED
// PHYSICAL transform (translate/translateX in a `matrix()`, which does NOT
// flip). The physical translate over/under-shifts the box relative to its
// mirrored anchor, so the element lands on the WRONG SIDE in RTL. Lint can't
// see this: each property is individually "fine" (a logical inset is
// encouraged; a transform is not a physical *inset* prop) — the bug is the
// *interaction* of the two at layout time, which only a rendered LTR-vs-RTL
// geometry comparison reveals.
//
// Detector (in-page): find every `position: absolute|fixed` element whose
// computed transform has a non-zero horizontal translate component (matrix()
// e-value / matrix3d 12th), and record its center-X relative to its
// offsetParent. We then assert the RTL center mirrors the LTR center about the
// parent's horizontal center: rtl_relCenterX ≈ parentW − ltr_relCenterX.
//
// MANDATORY degenerate-parent guard: skip any candidate whose offsetParent is
// < 8px wide. A ~1px-wide parent (e.g. the ResizeHandle divider) makes the
// mirror target ≈ its own coordinate, producing a spurious "already mirrored"
// or "wildly off" reading that is pure noise — the spike's single false
// positive came from exactly this, and the guard removes it.
const PM_DETECTOR = /* js */ `
(() => {
  function parseMatrixX(t) {
    if (!t || t === 'none') return null;
    let m = t.match(/^matrix\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return p[4]; } // e
    m = t.match(/^matrix3d\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return p[12]; }
    return null;
  }
  const out = [];
  let idx = 0;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
    const tx = parseMatrixX(cs.transform);
    if (tx === null || Math.abs(tx) < 0.5) continue; // needs a horizontal translate
    const parent = el.offsetParent || el.parentElement;
    if (!parent) continue;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    // MANDATORY degenerate-parent guard: a sub-8px parent makes the mirror
    // target meaningless (self-referential) -> pure noise. Skip it.
    if (pr.width < 8) continue;
    // Skip 0x0 (unrendered / collapsed) candidates: no meaningful geometry.
    if (er.width < 1 && er.height < 1) continue;
    // Full-span guard: an element whose own width ≈ its parent width spans the
    // ENTIRE parent (it occupies both halves), so "which side it lands on" is
    // undefined — it cannot exhibit the wrong-side bug this dimension targets.
    // These are hit-areas / full-width bars that are anchored inset:0/0 and
    // carry a purely-visual centering translate (e.g. the useResizable vertical
    // divider hit-area: a 1134px-wide bar in a 1134px parent, translated left by
    // half its width so its geometric CENTER sits at the parent's left edge —
    // relCenterX≈0 in BOTH directions, which the center guard misses because the
    // center is at the edge while the body fills the parent). A REAL wrong-side
    // bug (Avatar status-dot, ResizeHandle pill) is a SMALL element (width ≪
    // parent) sitting at one edge, so it is unaffected. Threshold: element width
    // ≥ 90% of parent width.
    if (er.width >= pr.width * 0.9) continue;
    const relCenterX = (er.left + er.width / 2) - pr.left;
    // Centered-element guard: an element horizontally centered in its parent
    // mirrors to ITSELF (expected == actual), so it can never exhibit the
    // "wrong side" bug this dimension targets. Skipping it removes benign
    // noise: e.g. a VERTICAL Slider thumb is X-centered (insetInlineStart:50%
    // + translateX) and any residual few-to-tens-of-px asymmetry from a
    // physical centering translate that lacks an RTL flip is cosmetically
    // irrelevant on a vertical control and NOT a wrong-side error — but would
    // otherwise false-flag. A real wrong-side bug (Avatar status-dot) sits at
    // the parent EDGE, far from center, so it is unaffected. Threshold: within
    // 5% of parent width of the parent's horizontal center.
    if (Math.abs(relCenterX - pr.width / 2) < pr.width * 0.05) continue;
    out.push({
      idx: idx++,
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString().slice(0, 48)) || '',
      parentW: pr.width,
      relCenterX,
    });
  }
  return out;
})()
`;

async function detectPositioned(page) {
  return page.evaluate(PM_DETECTOR).catch(() => []);
}

// Auto-discovery D5 for one story: compare LTR vs RTL positioned-element
// centers about their offsetParent. With --pm-reveal the measurement follows
// the reveal step, so interaction-gated positioned elements
// (dialogs/popovers/menus) are covered, not just static ones.
const PM_TOL = Number(process.env.PM_TOL || 3); // px tolerance (signal gap was ~10x)

function positionalCard(component, storyId, ltrMeasure, rtlMeasure) {
  const card = {component, storyId, dim: 'D5-positional', verdict: 'N-A', notes: [], candidates: 0, fails: []};
  const ltr = ltrMeasure.positioned;
  const revealedL = PM_REVEAL && ltrMeasure.revealed;

  // Short-circuit before the RTL navigation: with no LTR candidate there is
  // nothing to measure an RTL center against, so the second load can't change
  // the verdict. Most stories have zero candidates, so this is most of D5's
  // cost. Checking `ltr && rtl` here instead would report a vacuous "pass" —
  // the compare loop runs min(ltr, rtl) = 0 times and never sets anyFail.
  if (ltr.length === 0) {
    if (revealedL) card.notes.push('opened an interaction-gated surface before scanning');
    card.notes.push('no logical-anchor + physical-transform candidates in LTR');
    return card;
  }

  const rtl = rtlMeasure.positioned;
  const revealedR = PM_REVEAL && rtlMeasure.revealed;
  if (revealedL || revealedR) card.notes.push('opened an interaction-gated surface before scanning');

  // Same reasoning in the other direction: zero comparisons is not a pass.
  if (rtl.length === 0) {
    card.candidates = ltr.length;
    card.notes.push(
      `${ltr.length} candidate(s) in LTR but none in RTL — nothing to compare (not evaluated)`,
    );
    return card;
  }
  card.candidates = Math.max(ltr.length, rtl.length);

  // Pair LTR<->RTL candidates by DOM index (stable across directions in all
  // tested stories). Assert the RTL center mirrors the LTR center about the
  // parent's horizontal center.
  const n = Math.min(ltr.length, rtl.length);
  let anyFail = false;
  const perEl = [];
  for (let i = 0; i < n; i++) {
    const L = ltr[i], R = rtl[i];
    const expectedRtlCX = L.parentW - L.relCenterX; // mirror about parent center
    const delta = Math.abs(R.relCenterX - expectedRtlCX);
    const mirrored = delta <= PM_TOL;
    if (!mirrored) {
      anyFail = true;
      card.fails.push({
        cls: L.cls,
        tag: L.tag,
        parentW: Math.round(L.parentW),
        ltrRelCenterX: Math.round(L.relCenterX * 10) / 10,
        rtlRelCenterX: Math.round(R.relCenterX * 10) / 10,
        expectedRtlCenterX: Math.round(expectedRtlCX * 10) / 10,
        delta: Math.round(delta * 10) / 10,
      });
    }
    perEl.push({idx: i, cls: L.cls, delta: Math.round(delta * 10) / 10, mirrored});
  }
  card.perEl = perEl;
  if (anyFail) {
    card.verdict = 'fail';
    card.notes.push(
      `positioned element(s) land on the wrong side in RTL: ` +
        card.fails
          .map(f => `${f.cls || f.tag} (LTR cx ${f.ltrRelCenterX} → RTL cx ${f.rtlRelCenterX}, expected ~${f.expectedRtlCenterX}, Δ${f.delta}px)`)
          .join('; '),
    );
  } else {
    card.verdict = 'pass';
    card.notes.push(`every positioned candidate mirrors about its parent center (≤${PM_TOL}px)`);
  }
  return card;
}

// D5 and D6 both scan every audited story from the same LTR render, so one
// LTR load serves both. Each dimension still reads the page at the point it
// always did: D5 before the reveal step (unless --pm-reveal), D6 after it. The
// RTL load runs only when either dimension found an LTR candidate, which is
// when each of them used to load RTL on its own.
async function measureAutoStory(page, port, storyId, rtl, {positioned, decorations}) {
  await page.goto(storyUrl(port, storyId, rtl), {waitUntil: 'domcontentloaded'});
  await settle(page);
  const measure = {positioned: [], decorations: [], revealed: false};
  if (positioned && !PM_REVEAL) measure.positioned = await detectPositioned(page);
  if (decorations || (positioned && PM_REVEAL)) {
    measure.revealed = await revealInteractionGated(page);
  }
  if (positioned && PM_REVEAL) measure.positioned = await detectPositioned(page);
  if (decorations) measure.decorations = await detectDirectionalDecorations(page);
  return measure;
}

async function autoPositionalAndDecorations(page, port, storyId, component) {
  const ltr = await measureAutoStory(page, port, storyId, false, {positioned: true, decorations: true});
  const needPositioned = ltr.positioned.length > 0;
  const needDecorations = ltr.decorations.length > 0;
  const rtl = needPositioned || needDecorations
    ? await measureAutoStory(page, port, storyId, true, {positioned: needPositioned, decorations: needDecorations})
    : null;
  return {
    positional: positionalCard(component, storyId, ltr, rtl),
    decoration: decorationCard(component, storyId, ltr, rtl),
  };
}

// Auto-discovery D1 for one story: compare LTR vs RTL directional-icon flip.
async function autoD1(page, port, storyId, component) {
  const card = {component, storyId, dim: 'D1', verdict: 'N-A', notes: [], icons: 0};
  await page.goto(storyUrl(port, storyId, false), {waitUntil: 'domcontentloaded'});
  await settle(page);
  const revealedL = await revealInteractionGated(page);
  const ltr = await detectDirectionalIcons(page);
  await page.goto(storyUrl(port, storyId, true), {waitUntil: 'domcontentloaded'});
  await settle(page);
  const revealedR = await revealInteractionGated(page);
  const rtl = await detectDirectionalIcons(page);
  if (revealedL || revealedR) card.notes.push('opened an interaction-gated surface before scanning');

  if (ltr.length === 0 && rtl.length === 0) {
    card.verdict = 'N-A';
    card.notes.push('no directional icons');
    return card;
  }
  card.icons = Math.max(ltr.length, rtl.length);

  // Pair LTR<->RTL directional icons by aria-context (fallback: positional
  // index) and evaluate EACH pair, so a two-button name-swap (prev/next) is
  // seen per-button rather than washed out by a global multiset.
  const keyOf = (i, idx) => (i.aria && i.aria.trim() ? 'aria:' + i.aria.trim() : 'idx:' + idx);
  const ltrBy = new Map();
  ltr.forEach((i, idx) => ltrBy.set(keyOf(i, idx), i));
  const rtlBy = new Map();
  rtl.forEach((i, idx) => rtlBy.set(keyOf(i, idx), i));
  const keys = new Set([...ltrBy.keys(), ...rtlBy.keys()]);

  let anyMirrored = false; // at least one directional icon is handled (flip or swap)
  let anyUnhandled = false; // at least one directional icon neither flips nor swaps
  let anyDoubleFlip = false;
  const perIcon = [];
  for (const k of keys) {
    const L = ltrBy.get(k), R = rtlBy.get(k);
    // transform-mirror: the glyph's COMPOSED transform under RTL equals its LTR
    // transform pre-multiplied by scaleX(-1). This is the general form of "the
    // glyph is mirrored", and it holds whether the mirror lives on its own
    // element or is folded into the same declaration as a state rotation:
    //   collapsed: scaleX(-1) . identity      = matrix(-1, 0, 0,  1)
    //   expanded:  scaleX(-1) . rotate(90deg) = matrix( 0, 1, 1,  0)
    // The older check demanded a pure flip matrix, which the second case never
    // produces even though it renders correctly.
    const mirrored = R && isMirrorOf(R.matrix, L?.matrix);
    // name-swap: the rendered glyph direction changed left<->right for this icon
    const swapped = L && R && L.dir !== R.dir && L.dir !== null && R.dir !== null;
    // double-flip: flip present in BOTH dirs -> nets to no visible mirror
    // A glyph flipped in BOTH directions nets to no visible mirror. Only a
    // concern when the two are actually equal — a composed mirror has a
    // different RTL matrix and is caught by `mirrored` above.
    const doubleFlip =
      L && R && L.flip && R.flip &&
      L.matrix.every((v, i) => Math.abs(v - R.matrix[i]) < 0.01);
    if (mirrored || swapped) anyMirrored = true;
    else if (doubleFlip) { anyDoubleFlip = true; anyUnhandled = true; }
    else anyUnhandled = true;
    perIcon.push({icon: k, ltrDir: L?.dir, rtlDir: R?.dir, ltrMatrix: L?.matrix, rtlMatrix: R?.matrix, mirrored: !!mirrored, swapped: !!swapped});
  }

  // A component is RTL-ready for D1 iff EVERY directional icon is handled
  // (flips or swaps) and none double-flips. Any unhandled directional icon =>
  // not-RTL (the "shipped without RTL handling" signal).
  if (!anyUnhandled && anyMirrored) {
    card.verdict = 'pass';
    card.notes.push('every directional icon mirrors (transform-flip and/or name-swap)');
  } else if (anyDoubleFlip) {
    card.verdict = 'fail';
    card.notes.push('double-flip: a directional icon is flipped in BOTH LTR and RTL (nets to no mirror)');
  } else {
    card.verdict = 'fail';
    const bad = perIcon.filter(p => !p.mirrored && !p.swapped).map(p => p.icon);
    card.notes.push(`directional glyph never mirrors: ${bad.join(', ')}`);
  }
  card.perIcon = perIcon;
  card._ltr = ltr;
  card._rtl = rtl;
  return card;
}

// ===========================================================================
// CURATED precision dims (D2/D3/D4/D7/D8/D9) — hand selectors from targets.json
// ===========================================================================
async function checkD2(page, port, t, card) {
  const {prev, next} = t.selectors;
  await page.goto(storyUrl(port, t.storyId, false), {waitUntil: 'domcontentloaded'});
  await settle(page); await doSetup(page, t);
  const pL = await boxOf(page, prev), nL = await boxOf(page, next);
  await page.goto(storyUrl(port, t.storyId, true), {waitUntil: 'domcontentloaded'});
  await settle(page); await doSetup(page, t);
  const pR = await boxOf(page, prev), nR = await boxOf(page, next);
  if (!pL || !nL || !pR || !nR) { card.dims.D2 = 'N-A'; card.notes.push('D2: prev/next not found'); return; }
  const ltrOk = pL.cx < nL.cx, rtlOk = pR.cx > nR.cx;
  card.dims.D2 = ltrOk && rtlOk ? 'pass' : ltrOk || rtlOk ? 'partial' : 'fail';
  card.notes.push(`D2 prev/next cx: LTR ${pL.cx.toFixed(0)}<${nL.cx.toFixed(0)}=${ltrOk}; RTL ${pR.cx.toFixed(0)}>${nR.cx.toFixed(0)}=${rtlOk}`);
}
async function checkD3Scroll(page, port, t, card) {
  const {scroller, nextButton} = t.selectors;
  const run = async rtl => {
    await page.goto(storyUrl(port, t.storyId, rtl), {waitUntil: 'domcontentloaded'});
    await settle(page); await doSetup(page, t);
    const before = await page.locator(scroller).first().evaluate(el => el.scrollLeft).catch(() => null);
    await page.locator(nextButton).first().click({timeout: 2500}).catch(() => {});
    await page.waitForTimeout(500);
    const after = await page.locator(scroller).first().evaluate(el => el.scrollLeft).catch(() => null);
    return before == null || after == null ? null : after - before;
  };
  const dL = await run(false), dR = await run(true);
  if (dL == null || dR == null) { card.dims.D3 = 'N-A'; card.notes.push('D3: scroller/next not found'); return; }
  const ltrOk = dL > 1, rtlOk = dR < -1;
  card.dims.D3 = ltrOk && rtlOk ? 'pass' : ltrOk || rtlOk ? 'partial' : 'fail';
  card.notes.push(`D3 scroll delta on next: LTR ${dL.toFixed(0)} (>0=${ltrOk}); RTL ${dR.toFixed(0)} (<0=${rtlOk})`);
}
async function checkD4(page, port, t, card) {
  const {overlay, overlayRoot} = t.selectors;
  await page.goto(storyUrl(port, t.storyId, false), {waitUntil: 'domcontentloaded'});
  await settle(page); await doSetup(page, t);
  const oL = await boxOf(page, overlay), rL = await boxOf(page, overlayRoot || 'body');
  await page.goto(storyUrl(port, t.storyId, true), {waitUntil: 'domcontentloaded'});
  await settle(page); await doSetup(page, t);
  const oR = await boxOf(page, overlay), rR = await boxOf(page, overlayRoot || 'body');
  if (!oL || !rL || !oR || !rR) { card.dims.D4 = 'N-A'; card.notes.push('D4: overlay/root not found'); return; }
  const sideL = (oL.cx - rL.x) / rL.width, sideR = (oR.cx - rR.x) / rR.width;
  const flipped = sideL < 0.5 !== sideR < 0.5 && Math.abs(sideR - (1 - sideL)) < 0.25;
  card.dims.D4 = flipped ? 'pass' : Math.abs(sideR - sideL) < 0.05 ? 'fail' : 'partial';
  card.notes.push(`D4 overlay side frac: LTR ${sideL.toFixed(2)} RTL ${sideR.toFixed(2)} flipped=${flipped}`);
}

async function checkD7CoarseHit(page, port, t, card) {
  const wrapperSel = t.selectors?.wrapperSelector;
  const sizes = t.sizes || ['md'];
  const minimumTargetSize = t.minimumTargetSize;
  if (!['width', 'height'].every(axis =>
    Number.isFinite(minimumTargetSize?.[axis]) && minimumTargetSize[axis] > 0,
  )) {
    throw new Error('D7 requires positive minimumTargetSize width and height from the owning target contract');
  }

  const testDir = async (rtl, size) => {
    const inputSel = t.selectors?.inputSelectorBySize?.[size] ||
      t.selectors?.inputSelector || 'input[type="checkbox"], input[type="radio"]';
    await page.goto(storyUrl(port, t.storyId, rtl, {size}), {waitUntil: 'domcontentloaded'});
    await settle(page);
    await doSetup(page, t);

    return page.evaluate(({inputSel, wrapperSel, size, rtl, minimumTargetSize}) => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const touchPoints = navigator.maxTouchPoints;
      const inputs = Array.from(document.querySelectorAll(inputSel));
      if (inputs.length === 0) return {coarse, touchPoints, size, rtl, count: 0, allHitsOk: false};

      let allHitsOk = true;
      let count = 0;
      const centers = [];
      for (const input of inputs) {
        const wrapper = wrapperSel ? input.closest(wrapperSel) : input.parentElement;
        if (!wrapper) continue;
        const b = wrapper.getBoundingClientRect();
        const inputBox = input.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const isHit = hit === input || input.contains(hit);
        const isCentered = Math.abs(inputBox.x + inputBox.width / 2 - cx) < 0.5 &&
          Math.abs(inputBox.y + inputBox.height / 2 - cy) < 0.5;
        const meetsMinimum = inputBox.width >= minimumTargetSize.width &&
          inputBox.height >= minimumTargetSize.height;
        if (!isHit || !isCentered || !meetsMinimum) allHitsOk = false;
        centers.push({
          wrapper: {x: b.x, y: b.y, width: b.width, height: b.height},
          native: {x: inputBox.x, y: inputBox.y, width: inputBox.width, height: inputBox.height},
          hit: isHit,
          centered: isCentered,
          meetsMinimum,
        });
        count++;
      }
      return {coarse, touchPoints, size, rtl, count, allHitsOk, centers};
    }, {inputSel, wrapperSel, size, rtl, minimumTargetSize}).catch(() => null);
  };

  const results = [];
  for (const size of sizes) {
    results.push(await testDir(false, size));
    results.push(await testDir(true, size));
  }

  if (results.some(result => result === null || !result.coarse || result.touchPoints < 1 || result.count === 0)) {
    card.dims.D7 = 'N-A';
    card.notes.push('D7: coarse-pointer context or input/wrapper targets not verified');
    return;
  }

  card.coarseHits = {minimumTargetSize, results};
  const pass = results.every(result => result.allHitsOk);
  card.dims.D7 = pass ? 'pass' : 'fail';
  const formatTarget = target => {
    const {width, height} = target.wrapper;
    const cx = target.wrapper.x + width / 2;
    const cy = target.wrapper.y + height / 2;
    return `wrapper ${width}x${height}@(${cx.toFixed(0)},${cy.toFixed(0)}) native ${target.native.width}x${target.native.height} hit=${target.hit} centered=${target.centered} size=${target.meetsMinimum}`;
  };
  card.notes.push(`D7 coarse native target (minimum ${minimumTargetSize.width}x${minimumTargetSize.height}): ${results.map(result => `${result.rtl ? 'RTL' : 'LTR'} ${result.size}:${result.centers.map(formatTarget).join(',')}`).join('; ')}`);
}

async function measureLogicalInlineSubject(page, subject) {
  const subjects = page.locator(subject);
  const count = await subjects.count();
  if (count !== 1) return {count, visible: false};
  return subjects.first().evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const number = value => Number.parseFloat(value);
    const visible = typeof element.checkVisibility === 'function'
      ? element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})
      : style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    return {
      count: 1, visible, width: rect.width, height: rect.height,
      direction: style.direction,
      writingMode: style.writingMode,
      inlineStart: number(style.paddingInlineStart),
      inlineEnd: number(style.paddingInlineEnd),
      top: number(style.paddingTop), right: number(style.paddingRight),
      bottom: number(style.paddingBottom), left: number(style.paddingLeft),
    };
  }).catch(() => null);
}

async function verifyD8BrowserContract(page) {
  await page.setContent(`
    <div id="d8-horizontal" dir="ltr" style="box-sizing:border-box;width:160px;height:40px;padding-block:4px 12px;padding-inline-start:8px;padding-inline-end:24px">horizontal</div>
    <div id="d8-vertical" dir="ltr" style="box-sizing:border-box;width:160px;height:80px;writing-mode:vertical-rl;padding-block:4px 12px;padding-inline-start:8px;padding-inline-end:24px">vertical</div>
  `);
  const verifyPair = async subject => {
    const ltr = await measureLogicalInlineSubject(page, subject);
    await page.locator(subject).evaluate(element => { element.dir = 'rtl'; });
    const rtl = await measureLogicalInlineSubject(page, subject);
    return {ltr, rtl, result: classifyLogicalInlinePair(ltr, rtl)};
  };
  const horizontal = await verifyPair('#d8-horizontal');
  const vertical = await verifyPair('#d8-vertical');
  await page.locator('#d8-horizontal').evaluate(element => { element.style.display = 'none'; });
  const hidden = await measureLogicalInlineSubject(page, '#d8-horizontal');
  const hiddenVerdict = classifyLogicalInlinePair(hidden, hidden);
  if (
    horizontal.result.verdict !== 'pass' ||
    vertical.result.verdict !== 'pass' ||
    hiddenVerdict.verdict !== 'fail'
  ) {
    throw new Error(
      `D8 browser contract failed: ${JSON.stringify({horizontal, vertical, hidden: {measurement: hidden, result: hiddenVerdict}})}`,
    );
  }
  return {
    horizontal,
    vertical,
    hidden: {measurement: hidden, result: hiddenVerdict},
  };
}

async function checkD8LogicalInline(page, port, t, card) {
  const subject = t.selectors?.subject;
  if (!subject) { card.dims.D8 = 'N-A'; card.notes.push('D8: no subject selector configured'); return; }
  const run = async rtl => {
    await page.goto(storyUrl(port, t.storyId, rtl), {waitUntil: 'domcontentloaded'});
    await settle(page); await doSetup(page, t);
    return measureLogicalInlineSubject(page, subject);
  };
  const ltr = await run(false), rtl = await run(true);
  if (ltr == null || rtl == null) { card.dims.D8 = 'N-A'; card.notes.push('D8: logical inline-edge subject was not measurable'); return; }
  const result = classifyLogicalInlinePair(ltr, rtl);
  card.dims.D8 = result.verdict;
  const formatPhysical = measurement =>
    `${measurement.top}/${measurement.right}/${measurement.bottom}/${measurement.left}px`;
  card.notes.push(
    `D8 logical inline edges: ${result.reason}; writing-mode ${ltr.writingMode}; ` +
    `LTR start/end ${ltr.inlineStart}/${ltr.inlineEnd}px T/R/B/L ${formatPhysical(ltr)}; ` +
    `RTL start/end ${rtl.inlineStart}/${rtl.inlineEnd}px T/R/B/L ${formatPhysical(rtl)}`,
  );
}

async function measureGroupedCorners(page, group) {
  return page.evaluate(({first, middle, last}) => {
    const selectors = [first, middle, last];
    const boxes = selectors.map(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length !== 1) return null;
      const element = elements[0];
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const number = value => Number.parseFloat(value);
      const visible = typeof element.checkVisibility === 'function'
        ? element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})
        : style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
      return {
        visible, width: rect.width, height: rect.height,
        direction: style.direction, writingMode: style.writingMode,
        corners: {
          topLeft: number(style.borderTopLeftRadius),
          topRight: number(style.borderTopRightRadius),
          bottomRight: number(style.borderBottomRightRadius),
          bottomLeft: number(style.borderBottomLeftRadius),
        },
      };
    });
    return {
      direction: boxes.find(Boolean)?.direction ?? null,
      writingMode: boxes.find(Boolean)?.writingMode ?? null,
      boxes,
    };
  }, group).catch(() => null);
}

async function checkD9GroupedCorners(page, port, t, card) {
  const groups = t.selectors?.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    card.dims.D9 = 'N-A';
    card.notes.push('D9: no grouped-corner selectors configured');
    return;
  }
  const run = async rtl => {
    await page.goto(storyUrl(port, t.storyId, rtl), {waitUntil: 'domcontentloaded'});
    await settle(page); await doSetup(page, t);
    return Promise.all(groups.map(group => measureGroupedCorners(page, group)));
  };
  const ltr = await run(false), rtl = await run(true);
  const results = groups.map((group, index) => ({
    name: group.name,
    logicalSide: group.logicalSide,
    ...classifyLogicalGroupedCorners(ltr[index], rtl[index], group.logicalSide),
  }));
  card.dims.D9 = results.every(result => result.verdict === 'pass') ? 'pass' : 'fail';
  card.notes.push(...results.map(result => `D9 ${result.name ?? result.logicalSide}: ${result.reason}`));
  card.groupedCorners = results;
}

// `pages` is the curated page pair (rtl-audit-pool.mjs). A dim that throws is
// recorded as an ERROR, and the page it ran on is replaced before the next dim.
async function scoreCurated(pages, port, t) {
  const card = {component: t.component, storyId: t.storyId, dims: {}, notes: []};
  await runSteps(t.dims, pages, {
    pageFor: dim => (dim === 'D7' ? 'coarse' : 'main'),
    run: async (dim, page) => {
      if (dim === 'D2') await checkD2(page, port, t, card);
      else if (dim === 'D3') await checkD3Scroll(page, port, t, card);
      else if (dim === 'D4') await checkD4(page, port, t, card);
      else if (dim === 'D7') await checkD7CoarseHit(page, port, t, card);
      else if (dim === 'D8') await checkD8LogicalInline(page, port, t, card);
      else if (dim === 'D9') await checkD9GroupedCorners(page, port, t, card);
      // D1 is handled by auto-discovery; ignore any stray D1 in curated entries.
    },
    onError: (dim, e) => {
      card.dims[dim] = 'ERROR';
      card.notes.push(`${dim} threw: ${String(e).slice(0, 160)}`);
    },
    describe: dim => ({phase: 'curated', storyId: t.storyId, dim}),
  });
  const vals = Object.entries(card.dims).filter(([, v]) => v !== 'N-A');
  const anyFail = vals.some(([, v]) => v === 'fail' || v === 'ERROR');
  const allPass = vals.length > 0 && vals.every(([, v]) => v === 'pass');
  card.rollup = vals.length === 0 ? 'N-A' : allPass ? 'RTL-ready' : anyFail ? 'not-RTL' : 'partial';
  return card;
}

// ---------------------------------------------------------------------------
function matchesFilter(component) {
  const normalized = component.toLowerCase();
  const name = normalized.split('/').at(-1) ?? normalized;
  return !FILTER.length || FILTER.includes(normalized) || FILTER.includes(name);
}

function belongsToActivePackage(route) {
  return filterStoryRoutesByPackages([route], ACTIVE_PACKAGE_NAMES).length === 1;
}

const runtime = {
  server: null,
  browser: null,
  pool: null,
  coarseContext: null,
};

async function cleanupRuntime() {
  await runtime.pool?.close();
  await runtime.coarseContext?.close().catch(() => {});
  await runtime.browser?.close().catch(() => {});
  if (runtime.server) {
    await new Promise(resolve => runtime.server.close(() => resolve()));
  }
}

(async () => {
  // A failed invocation must never leave an earlier successful report behind.
  fs.rmSync(OUT, {force: true});

  let entries;
  try {
    const index = JSON.parse(fs.readFileSync(path.join(DIST, 'index.json'), 'utf8'));
    entries = index.entries ?? index.stories;
  } catch (error) {
    throw new Error(`cannot read index.json: ${String(error).slice(0, 120)}`, {
      cause: error,
    });
  }
  if (entries == null || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('index.json does not contain a Storybook entries object');
  }

  let targets = [];
  try { targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8')); } catch {}

  const storyIds = Object.keys(entries).filter(
    id =>
      entries[id].type === 'story' &&
      AUDITED_STORY_PREFIX.test(id) &&
      !/--docs$/.test(id),
  );
  if (storyIds.length === 0) {
    throw new Error('index.json contains no runnable audited stories');
  }

  const publicComponentsByPackage = {};
  const sourceComponents = [];
  for (const packageName of AUDITED_PACKAGE_NAMES) {
    try {
      const pkg = componentPackage(packageName);
      if (!pkg) throw new Error('package is missing from component registry');
      const componentNames = pkg.layout === 'flat'
        ? flatPackageComponentNames(PROJECT_ROOT, pkg)
        : nestedPackageComponentNames(PROJECT_ROOT, pkg);
      publicComponentsByPackage[packageName] = componentNames;
      if (ACTIVE_PACKAGE_NAMES.includes(packageName)) {
        sourceComponents.push(
          ...componentNames.map(component => `${packageName}/${component}`),
        );
      }
    } catch (error) {
      console.error(`WARN: cannot discover ${packageName} component roster: ${String(error).slice(0, 120)}`);
    }
  }
  const storyRoutes = buildStoryComponentRoutes({
    stories: storyIds.map(id => ({id, title: entries[id].title})),
    targets,
    publicComponentsByPackage,
  }).filter(belongsToActivePackage);
  const scopedStoryRoutes = storyRoutes.filter(route => matchesFilter(route.component));
  if (scopedStoryRoutes.length === 0) {
    throw new Error(`no runnable stories resolved for ${ACTIVE_PACKAGE_NAMES.join(',')} scope`);
  }
  const auditedComponents = buildAuditedComponentRoster({
    sourceComponents,
    storyComponents: scopedStoryRoutes.map(route => route.component),
    filters: FILTER,
  });

  // The audit's plan: D1 runs one representative story per component (extra
  // stories add little D1 signal); D5 (positional-mirror) and D6 run over
  // EVERY story — a positioned bug can be story-specific (only a `withStatus`
  // variant mounts the offending element), so they do not collapse to one per
  // component; curated targets add the behaviour and geometry dims.
  const perComponent = new Map();
  for (const {component, id} of scopedStoryRoutes) {
    if (!perComponent.has(component)) perComponent.set(component, id);
  }
  const d1Targets = [...perComponent]
    .map(([component, id]) => ({comp: component, id}));
  const storyTargets = scopedStoryRoutes.map(({id, component}) => ({id, comp: component}));
  const curatedTargets = [];
  for (const t of targets) {
    const component = componentFromTarget(
      t,
      AUDITED_PACKAGE_NAMES,
      publicComponentsByPackage,
    );
    if (!belongsToActivePackage({component, id: t.storyId})) continue;
    if (!matchesFilter(component)) continue;
    if (!entries[t.storyId]) {
      curatedTargets.push({t, component, missing: true});
      continue;
    }
    // skip if the entry only had D1 (now covered by auto-discovery)
    const dims = (t.dims || []).filter(d => d !== 'D1');
    if (dims.length === 0) continue;
    curatedTargets.push({t, component, dims});
  }
  const plan = {
    d1: CURATED_ONLY ? [] : d1Targets.map(({comp, id}) => `${comp}::${id}`),
    stories: CURATED_ONLY ? [] : storyTargets.map(({comp, id}) => `${comp}::${id}`),
    curated: AUTO_ONLY
      ? []
      : curatedTargets.map(({t, component}) => `${component}::${t.storyId}`),
  };
  const storybookSha = readStorybookSha(DIST);
  /** Positions of `items` this run audits. */
  const mine = items =>
    SHARD === null
      ? items.map((_, position) => position)
      : shardPositions(items.length, SHARD);

  const autoResults = []; // D1 icon-mirror
  const pmResults = []; // D5 positional-mirror
  const decorationResults = []; // D6 contextual directional decoration
  const curatedResults = [];
  let d8BrowserContract;
  let pageRecoveries;

  if (MERGE_SHARDS !== null) {
    const merged = mergeRtlShards(readShardFiles(MERGE_SHARDS), {plan, storybookSha});
    autoResults.push(...merged.d1);
    pmResults.push(...merged.stories.map(cards => cards.positional));
    decorationResults.push(...merged.stories.map(cards => cards.decoration));
    curatedResults.push(...merged.curated);
    d8BrowserContract = merged.d8BrowserContract;
    pageRecoveries = merged.pageRecoveries;
    console.error(`MERGED ${MERGE_SHARDS}: ${autoResults.length} D1, ${pmResults.length} story, ${curatedResults.length} curated cards`);
  } else {
    const {server, port} = await serve(path.resolve(DIST));
    runtime.server = server;
    const browser = await chromium.launch();
    runtime.browser = browser;
    const pool = await createPagePool({
      size: CONCURRENCY,
      openPage: () =>
        browser.newPage({viewport: {width: 1100, height: 760}, deviceScaleFactor: 1}),
    });
    runtime.pool = pool;
    // Curated dims run serially on the first slot's current page.
    d8BrowserContract = await verifyD8BrowserContract(pool.first());
    const coarseContext = await browser.newContext({
      viewport: {width: 1100, height: 760},
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    runtime.coarseContext = coarseContext;
    const curatedPages = createCuratedPages({
      pool,
      coarsePage: await coarseContext.newPage(),
      openCoarsePage: () => coarseContext.newPage(),
    });

    // Cards by plan position, for a shard file.
    const shardCards = {d1: new Map(), stories: new Map(), curated: new Map()};

    // ---- (A) auto-discovery over every audited-package story ----
    if (!CURATED_ONLY) {
      const d1Positions = mine(d1Targets);
      const d1Cards = await mapPool(d1Positions.map(position => d1Targets[position]), pool, {
        scan: async ({comp, id}, workerPage) => {
          const card = await autoD1(workerPage, port, id, comp);
          if (card.verdict !== 'N-A') {
            console.error(`AUTO ${card.verdict.toUpperCase().padEnd(4)} ${comp.padEnd(24)} icons=${card.icons}`);
          }
          return card;
        },
        onError: ({comp, id}, e) => {
          console.error(`AUTO ERROR ${comp}: ${String(e).slice(0, 120)}`);
          return {component: comp, storyId: id, dim: 'D1', verdict: 'ERROR', notes: [String(e).slice(0, 160)], icons: 0};
        },
        describe: ({id}) => ({phase: 'D1', storyId: id}),
      });
      autoResults.push(...d1Cards);
      d1Positions.forEach((position, i) => shardCards.d1.set(position, d1Cards[i]));
      // D5 positional-mirror and D6 contextual decorations over every audited
      // story, sharing one LTR load per story (see measureAutoStory).
      const storyPositions = mine(storyTargets);
      const storyCards = await mapPool(storyPositions.map(position => storyTargets[position]), pool, {
        scan: async ({id, comp}, workerPage) => {
          const cards = await autoPositionalAndDecorations(workerPage, port, id, comp);
          if (cards.positional.verdict !== 'N-A') {
            console.error(`PM   ${cards.positional.verdict.toUpperCase().padEnd(4)} ${comp.padEnd(24)} ${id.padEnd(40)} cand=${cards.positional.candidates}`);
          }
          if (cards.decoration.verdict !== 'N-A') {
            console.error(`DEC  ${cards.decoration.verdict.toUpperCase().padEnd(4)} ${comp.padEnd(24)} ${id.padEnd(40)} glyphs=${cards.decoration.decorations}`);
          }
          return cards;
        },
        onError: ({id, comp}, e) => {
          console.error(`PM+DEC ERROR ${comp} ${id}: ${String(e).slice(0, 120)}`);
          const notes = [String(e).slice(0, 160)];
          return {
            positional: {component: comp, storyId: id, dim: 'D5-positional', verdict: 'ERROR', notes, candidates: 0, fails: []},
            decoration: {component: comp, storyId: id, dim: 'D6-decoration', verdict: 'ERROR', notes: [...notes], decorations: 0, results: []},
          };
        },
        describe: ({id}) => ({phase: 'D5+D6', storyId: id}),
      });
      pmResults.push(...storyCards.map(cards => cards.positional));
      decorationResults.push(...storyCards.map(cards => cards.decoration));
      storyPositions.forEach((position, i) => shardCards.stories.set(position, storyCards[i]));
    }

    // ---- (B) curated precision dims ----
    // Deliberately serial on one page: only a handful of targets, and these do
    // multi-step interactions (setup clicks, scroll assertions) where a shared
    // machine under load is more likely to change behaviour than to save time.
    if (!AUTO_ONLY) {
      for (const position of mine(curatedTargets)) {
        const {t, component, dims, missing} = curatedTargets[position];
        if (missing) {
          const card = {component, storyId: t.storyId, rollup: 'MISSING-STORY', dims: {}, notes: ['story not in index.json']};
          curatedResults.push(card);
          shardCards.curated.set(position, card);
          continue;
        }
        // scoreCurated records each dim's failure itself; what escapes it is a
        // page that could not be replaced, which ends the run.
        const card = await scoreCurated(curatedPages, port, {...t, component, dims});
        curatedResults.push(card);
        shardCards.curated.set(position, card);
        console.error(`CUR  ${card.rollup.padEnd(10)} ${component.padEnd(20)} ${JSON.stringify(card.dims)}`);
      }
    }
    pageRecoveries = pool.recoveries;

    if (SHARD !== null) {
      fs.writeFileSync(
        SHARD_OUTPUT,
        JSON.stringify(
          shardFile({
            plan,
            shard: SHARD,
            storybookSha,
            cards: shardCards,
            d8BrowserContract,
            pageRecoveries,
          }),
        ),
      );
      console.error(`WROTE ${SHARD_OUTPUT} (shard ${SHARD.index}/${SHARD.count})`);
      return;
    }
  }

  let verifiedNa = [];
  let verifiedNaError = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(VERIFIED_NA_PATH, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('verified-not-applicable registry must be a JSON array');
    verifiedNa = parsed;
  } catch (error) {
    verifiedNaError = String(error).slice(0, 200);
  }

  const coverage = buildComponentCoverage({
    components: auditedComponents,
    autoResults,
    positionalResults: pmResults,
    decorationResults,
    curatedResults,
    verifiedNa,
    // Partial modes intentionally omit dimensions, so they report but do not
    // enforce applicability gaps.
    enforced: !AUTO_ONLY && !CURATED_ONLY,
  });
  if (verifiedNaError) coverage.registryError = verifiedNaError;

  const autoFails = autoResults.filter(r => r.verdict === 'fail' || r.verdict === 'ERROR');
  // No allowlist: every not-RTL component is a surprise. The RTL migration is
  // complete, so any directional icon that fails to mirror is a real regression.
  const surprises = autoFails;
  const pmFails = pmResults.filter(r => r.verdict === 'fail' || r.verdict === 'ERROR');
  const decorationFails = decorationResults.filter(r => r.verdict === 'fail' || r.verdict === 'ERROR');
  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      packages: ACTIVE_PACKAGE_NAMES,
      filters: FILTER,
    },
    completion: {
      plannedComponentScans: new Set(scopedStoryRoutes.map(route => route.component)).size,
      completedComponentScans: autoResults.length,
      plannedStoryScans: scopedStoryRoutes.length,
      completedPositionalScans: pmResults.length,
      completedDecorationScans: decorationResults.length,
      plannedComponentIdentities: [
        ...new Set(scopedStoryRoutes.map(route => route.component)),
      ].sort(),
      completedComponentIdentities: autoResults.map(result => result.component).sort(),
      plannedD1Identities: d1Targets.map(target => `${target.comp}::${target.id}`).sort(),
      completedD1Identities: autoResults
        .map(result => `${result.component}::${result.storyId}`)
        .sort(),
      plannedStoryIdentities: scopedStoryRoutes
        .map(route => `${route.component}::${route.id}`)
        .sort(),
      completedPositionalIdentities: pmResults
        .map(result => `${result.component}::${result.storyId}`)
        .sort(),
      completedDecorationIdentities: decorationResults
        .map(result => `${result.component}::${result.storyId}`)
        .sort(),
    },
    dist: DIST,
    selfChecks: {d8LogicalInline: d8BrowserContract},
    // Worker pages replaced after a story failed on them. The failed story
    // keeps its ERROR result; the record shows the stories after it ran on a
    // fresh page.
    pageRecoveries,
    autoDiscovery: {
      total: autoResults.length,
      applicable: autoResults.filter(r => r.verdict !== 'N-A').length,
      pass: autoResults.filter(r => r.verdict === 'pass').length,
      fail: autoFails.length,
      na: autoResults.filter(r => r.verdict === 'N-A').length,
      surprises: surprises.map(r => r.component),
      results: autoResults,
    },
    positionalMirror: {
      total: pmResults.length,
      applicable: pmResults.filter(r => r.verdict !== 'N-A').length,
      pass: pmResults.filter(r => r.verdict === 'pass').length,
      fail: pmFails.length,
      na: pmResults.filter(r => r.verdict === 'N-A').length,
      tolerancePx: PM_TOL,
      // fails carry per-element cls + LTR/RTL relCenterX + delta (actionable).
      results: pmResults,
    },
    directionalDecorations: {
      total: decorationResults.length,
      applicable: decorationResults.filter(r => r.verdict !== 'N-A').length,
      pass: decorationResults.filter(r => r.verdict === 'pass').length,
      fail: decorationFails.length,
      na: decorationResults.filter(r => r.verdict === 'N-A').length,
      results: decorationResults,
    },
    curated: {results: curatedResults},
    coverage,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(`\nWROTE ${OUT}`);
  console.error(`AUTO: ${report.autoDiscovery.pass} pass / ${report.autoDiscovery.fail} fail (${surprises.length} surprise) / ${report.autoDiscovery.na} N-A`);
  console.error(`PM  : ${report.positionalMirror.pass} pass / ${report.positionalMirror.fail} fail / ${report.positionalMirror.na} N-A (tol ${PM_TOL}px)`);
  console.error(`DEC : ${report.directionalDecorations.pass} pass / ${report.directionalDecorations.fail} fail / ${report.directionalDecorations.na} N-A`);
  console.error(`POOL: ${pageRecoveries.length} page replacement(s) after a failed story`);
  console.error(`COV : ${coverage.measured} measured / ${coverage.verifiedNa} verified N-A / ${coverage.gaps} gap / ${coverage.staleVerifiedNa} stale`);
  // Non-zero exit only signals CI (which is soft/continue-on-error). Surface a
  // signal but never let it hard-block during the stability window.
  const anySignal =
    autoFails.length > 0 ||
    pmFails.length > 0 ||
    decorationFails.length > 0 ||
    (coverage.enforced && (coverage.gaps > 0 || coverage.staleVerifiedNa > 0 || coverage.registryError != null)) ||
    curatedResults.some(r => r.rollup === 'not-RTL' || r.rollup === 'ERROR' || r.rollup === 'MISSING-STORY');
  process.exitCode = anySignal ? 1 : 0;
})()
  .catch(error => {
    console.error(`FATAL: ${error.message}`);
    process.exitCode = 2;
  })
  .finally(cleanupRuntime);
