#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown scorecard for one package's RTL audit report.
 * @input --report <rtl-audit-report.json> --scope <audited components label>,
 *   including any declared D1 exclusions.
 * @output The job-summary section on stdout, with review-facing exclusion
 *   disclosure.
 * @position Shared by the pr-rtl package legs and the sharded-package merge
 *   job, so a joined report reads exactly like a single run's.
 */

import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const reportPath = arg('report') ?? 'rtl-audit-report.json';
const scope = arg('scope') ?? '';
const markdownCell = value =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
    .trim();

const lines = [
  '## RTL semantic audit',
  '',
  `Audit scope: **${scope}**. The unfiltered sweep runs for release-check on every push to main.`,
  '',
  'Relationship-based (LTR vs RTL in the same run) — no golden screenshots. **Soft-gated** pending a stability window.',
  '',
];
if (!fs.existsSync(reportPath)) {
  lines.push('_No report produced — audit errored before writing output._');
} else {
  const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const a = r.autoDiscovery;
  const known = new Set(r.knownNotRtl || []);
  const out = [];
  out.push(
    '### Auto-discovery (D1 icon-mirror, one representative story per scoped component)',
  );
  out.push('');
  out.push(
    `**${a.pass} pass · ${a.fail} not-RTL · ${a.na} N-A** (of ${a.total} scoped components). Surprises (not pre-labelled): **${a.surprises.length}**${a.surprises.length ? ': ' + a.surprises.join(', ') : ''}.`,
  );
  out.push('');
  const fails = a.results.filter(
    x => x.verdict === 'fail' || x.verdict === 'ERROR',
  );
  if (fails.length) {
    out.push('| Component | D1 | Label | Detail |');
    out.push('|-----------|----|-------|--------|');
    for (const c of fails) {
      const label = known.has(c.component) ? 'known-not-rtl' : '⚠️ surprise';
      out.push(
        `| ${c.component} | ${c.verdict} | ${label} | ${(c.notes || []).join('; ')} |`,
      );
    }
  } else {
    out.push('_No not-RTL findings._');
  }
  out.push('');
  const passes = a.results
    .filter(x => x.verdict === 'pass')
    .map(x => x.component);
  out.push(`RTL-ready (D1 pass): ${passes.join(', ') || '—'}.`);
  out.push('');
  const declaredD1Exclusions = r.declaredD1Exclusions ?? [];
  out.push('### Declared D1 exclusions (human review required)');
  out.push('');
  if (declaredD1Exclusions.length > 0) {
    out.push('| Component | Story | Dimension | Rationale |');
    out.push('|-----------|-------|-----------|-----------|');
    for (const exclusion of declaredD1Exclusions) {
      out.push(
        `| ${markdownCell(exclusion.component)} | ${markdownCell(exclusion.storyId)} | ${markdownCell(exclusion.dimension)} | ${markdownCell(exclusion.reason)} |`,
      );
    }
  } else {
    out.push('_No declared D1 exclusions in this audit scope._');
  }
  out.push('');
  const pm = r.positionalMirror;
  if (pm) {
    out.push('### Positional-mirror (D5, all scoped stories)');
    out.push('');
    out.push(
      'Catches a logical anchor (insetInlineStart/End) paired with an UNFLIPPED physical transform (translate/translateX) → element lands on the wrong side in RTL. Lint can\u2019t see this (each prop is individually fine). Tolerance ' +
        pm.tolerancePx +
        'px, degenerate-parent guard (<8px) applied.',
    );
    out.push('');
    out.push(
      `**${pm.pass} pass · ${pm.fail} FAIL · ${pm.na} N-A** (of ${pm.total} scoped stories scanned).`,
    );
    out.push('');
    const pmFails = pm.results.filter(
      x => x.verdict === 'fail' || x.verdict === 'ERROR',
    );
    if (pmFails.length) {
      out.push(
        '| Story | Element | LTR relCenterX | RTL relCenterX | \u0394 (px) |',
      );
      out.push(
        '|-------|---------|----------------|----------------|--------|',
      );
      for (const c of pmFails) {
        for (const f of c.fails || []) {
          out.push(
            `| ${c.storyId} | \`${f.cls || f.tag}\` | ${f.ltrRelCenterX} | ${f.rtlRelCenterX} (exp ~${f.expectedRtlCenterX}) | ${f.delta} |`,
          );
        }
        if (!(c.fails || []).length)
          out.push(
            `| ${c.storyId} | (error) | — | — | ${(c.notes || []).join('; ')} |`,
          );
      }
      out.push('');
    } else {
      out.push('_No positional-mirror FAILs._');
      out.push('');
    }
  }
  const decorations = r.directionalDecorations;
  if (decorations) {
    out.push('### Contextual directional decorations (D6, all stories)');
    out.push('');
    out.push(
      `**${decorations.pass} pass · ${decorations.fail} FAIL · ${decorations.na} N-A** (of ${decorations.total} stories scanned).`,
    );
    out.push('');
    const decorationFails = decorations.results.filter(
      x => x.verdict === 'fail' || x.verdict === 'ERROR',
    );
    if (decorationFails.length) {
      out.push('| Story | D6 | Detail |');
      out.push('|-------|----|--------|');
      for (const c of decorationFails)
        out.push(
          `| ${c.storyId} | ${c.verdict} | ${(c.notes || []).join('; ')} |`,
        );
    } else {
      out.push('_No directional-decoration FAILs._');
    }
    out.push('');
  }
  const coverage = r.coverage;
  if (coverage) {
    out.push('### Applicability coverage');
    out.push('');
    out.push(
      `**${coverage.measured} measured · ${coverage.verifiedNa} verified N-A · ${coverage.gaps} coverage gap · ${coverage.staleVerifiedNa} stale verified N-A.**`,
    );
    out.push('');
    const gaps = coverage.results.filter(
      x => x.status === 'coverage-gap' || x.status === 'stale-verified-na',
    );
    if (gaps.length) {
      out.push('| Component | Status | Detail |');
      out.push('|-----------|--------|--------|');
      for (const c of gaps)
        out.push(
          `| ${c.component} | ${c.status} | ${c.note || c.reason || 'unexplained all-N/A result'} |`,
        );
      out.push('');
    }
  }
  out.push('### Curated precision (D2 order / D3 behavior / D4 overlay)');
  out.push('');
  out.push('| Component | Rollup | Dimensions |');
  out.push('|-----------|--------|------------|');
  for (const c of r.curated.results) {
    const dims =
      Object.entries(c.dims)
        .map(([k, v]) => k + ':' + v)
        .join(', ') || '—';
    out.push(`| ${c.component} | ${c.rollup} | ${dims} |`);
  }
  lines.push(...out);
}
console.log(lines.join('\n'));
