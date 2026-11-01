// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file score-ledger.test.mjs
 * Unit tests for the component score ledger — chiefly the ratchet, whose whole
 * job is to fail on a regression this diff caused and on nothing else.
 *
 * The behaviours pinned here are the ones a contributor feels:
 *   - an unaudited component never blocks;
 *   - debt already on the row never blocks;
 *   - a new BLOCK blocks even when the total went up;
 *   - a rubric-version change is `incomparable`, not a failure;
 *   - an unreadable ledger passes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import http from 'node:http';

import {describe, it, expect} from 'vitest';

import {
  AUDIT_PROMPT,
  SCORES_PAGE_URL,
  SECTION_WEIGHTS,
  SECTION_IDS,
  applyScorecard,
  auditModePolicy,
  blockLink,
  buildQueue,
  buildRoster,
  buildStats,
  commitMessage,
  compareEntry,
  flatPackageComponents,
  gradeFor,
  isComponentDirectory,
  issueBody,
  listComponents,
  LEDGER_FETCH_TIMEOUT_MS,
  loadLedger,
  repoFromWikiRemote,
  resolveName,
  runRatchet,
  weakestSection,
  wikiCommitUrl,
} from './score-ledger.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** A minimal audited entry. */
const entry = (over = {}) => ({
  component: 'Button',
  package: 'core',
  status: 'audited',
  score: 70,
  grade: 'C',
  sections: {},
  blocks: {count: 0, open: []},
  distinct_defects: 1,
  fixes: null,
  nits: null,
  lastAudited: '2026-08-01',
  rubricVersion: '1.2',
  mode: 'O',
  commit: 'abc1234567',
  evidence: [],
  ...over,
});

const withBlocks = (...blocks) => ({
  count: blocks.length,
  open: blocks.map(b => (typeof b === 'string' ? {id: b, summary: b, issue: null} : b)),
});

// ---------------------------------------------------------------------------

describe('the ratchet', () => {
  it('passes an unaudited component — no baseline, judged on merits', () => {
    const r = compareEntry('Toast', null, null);
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/unaudited/);
    // Nothing that reads as an accusation against the pull request.
    expect(r.reason).not.toMatch(/BLOCK|fail|regress/i);
  });

  it('passes when only the head is unaudited', () => {
    expect(compareEntry('Button', entry(), null).verdict).toBe('pass');
  });

  it('passes the first audit — there is nothing to ratchet against', () => {
    const r = compareEntry('Button', null, entry({score: 41}));
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/first audit/);
  });

  it('passes known debt that did not change', () => {
    const base = entry({score: 62.6, blocks: withBlocks('A11', 'T6')});
    const head = entry({score: 62.6, blocks: withBlocks('A11', 'T6')});
    const r = compareEntry('Button', base, head);
    expect(r.verdict).toBe('pass');
    expect(r.reason).toBe('unchanged');
    expect(r.newBlocks).toEqual([]);
  });

  it('passes an improvement', () => {
    const r = compareEntry(
      'Button',
      entry({score: 62.6, blocks: withBlocks('A11')}),
      entry({score: 75, blocks: withBlocks('A11')}),
    );
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/improved 62\.6 -> 75/);
  });

  it('fails a score decrease', () => {
    const r = compareEntry('Button', entry({score: 70}), entry({score: 69.9}));
    expect(r.verdict).toBe('fail');
    expect(r.reason).toBe('score decreased 70 -> 69.9');
  });

  it('fails a new BLOCK even when the score went UP', () => {
    const r = compareEntry(
      'Button',
      entry({score: 62.6, blocks: withBlocks('A11')}),
      entry({
        score: 88,
        grade: 'C',
        blocks: withBlocks('A11', {id: 'T6', summary: 'elevation is unthemeable', issue: 99}),
      }),
    );
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/new BLOCK: T6/);
    expect(r.newBlocks.map(b => b.id)).toEqual(['T6']);
  });

  it('names only the NEW BLOCK, never the inherited ones', () => {
    const r = compareEntry(
      'SideNav',
      entry({blocks: withBlocks('A13', 'I2')}),
      entry({blocks: withBlocks('A13', 'I2', 'D13')}),
    );
    expect(r.reason).toContain('D13');
    expect(r.reason).not.toContain('A13');
    expect(r.reason).not.toContain('I2');
  });

  it('fails when the BLOCK count rises with no named id — the count is the authority', () => {
    const r = compareEntry(
      'Tooltip',
      entry({blocks: {count: 4, open: [{id: 'A8', summary: 'no touch path', issue: 3885}]}}),
      entry({blocks: {count: 5, open: [{id: 'A8', summary: 'no touch path', issue: 3885}]}}),
    );
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/count rose 4 -> 5/);
  });

  it('reports `incomparable` on a rubric-version change and does NOT fail', () => {
    const r = compareEntry(
      'Button',
      entry({score: 62.6, rubricVersion: '1.1'}),
      entry({score: 41, rubricVersion: '1.2'}),
    );
    expect(r.verdict).toBe('incomparable');
    expect(r.verdict).not.toBe('fail');
    expect(r.reason).toMatch(/incomparable — rubric version changed \(1\.1 -> 1\.2\)/);
    expect(r.reason).toMatch(/re-audit/);
  });

  it('does not fail on a version change even when a new BLOCK appears — the scales differ', () => {
    const r = compareEntry(
      'Button',
      entry({rubricVersion: '1.1', blocks: withBlocks('A11')}),
      entry({rubricVersion: '1.2', blocks: withBlocks('A11', 'D13')}),
    );
    expect(r.verdict).toBe('incomparable');
  });

  it('runRatchet fails the run when any component regressed', () => {
    const base = {components: [entry({component: 'Button'}), entry({component: 'Badge'})]};
    const head = {
      components: [entry({component: 'Button'}), entry({component: 'Badge', score: 10})],
    };
    const {results, failed} = runRatchet(['Button', 'Badge'], base, head);
    expect(failed).toBe(true);
    expect(results.find(r => r.component === 'Button').verdict).toBe('pass');
    expect(results.find(r => r.component === 'Badge').verdict).toBe('fail');
  });

  it('runRatchet passes when a touched component is absent from both ledgers', () => {
    const {failed, results} = runRatchet(['Toast'], {components: []}, {components: []});
    expect(failed).toBe(false);
    expect(results[0].verdict).toBe('pass');
  });
});

describe('a component is a package AND a name', () => {
  const duplicateRoster = [
    {component: 'Shared', package: 'core'},
    {component: 'Shared', package: 'lab'},
  ];

  it('resolves a name that exists in two packages to both components', () => {
    const matches = resolveName('Shared', duplicateRoster);
    expect(matches.map(m => m.package).sort()).toEqual(['core', 'lab']);
  });

  it('keeps the two apart in the ratchet — a lab score cannot fail a core PR', () => {
    const base = {
      components: [
        entry({component: 'Shared', package: 'core', score: 80, grade: 'B'}),
        entry({component: 'Shared', package: 'lab', score: 80, grade: 'B'}),
      ],
    };
    const head = {
      components: [
        entry({component: 'Shared', package: 'core', score: 80, grade: 'B'}),
        entry({component: 'Shared', package: 'lab', score: 40, grade: 'F'}),
      ],
    };
    const {results} = runRatchet(['Shared'], base, head, duplicateRoster);
    expect(results.map(r => r.component).sort()).toEqual(['core/Shared', 'lab/Shared']);
    expect(results.find(r => r.component === 'core/Shared').verdict).toBe('pass');
    expect(results.find(r => r.component === 'lab/Shared').verdict).toBe('fail');
  });

  it('gives each roster row a package-qualified id', () => {
    const roster = buildRoster({components: []}, [
      {component: 'Chat', package: 'core'},
      {component: 'Chat', package: 'lab'},
    ]);
    expect(roster.map(r => r.id)).toEqual(['core/Chat', 'lab/Chat']);
  });
});

describe('loadLedger never throws', () => {
  it('reports an unreadable path instead of throwing, so CI can pass with a warning', async () => {
    const {ledger, error} = await loadLedger('/nonexistent/component-scores.json');
    expect(ledger).toBeNull();
    expect(error).toMatch(/component-scores\.json/);
  });

  it('rejects JSON that is not a ledger', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'l.json');
    fs.writeFileSync(file, JSON.stringify({nope: true}));
    const {ledger, error} = await loadLedger(file);
    expect(ledger).toBeNull();
    expect(error).toMatch(/missing a `components` array/);
  });

  it('reads a real ledger', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'l.json');
    fs.writeFileSync(file, JSON.stringify({ledgerVersion: 1, components: [entry()]}));
    const {ledger, error} = await loadLedger(file);
    expect(error).toBeNull();
    expect(ledger.components).toHaveLength(1);
  });
});

describe('the ledger fetch is bounded', () => {
  /**
   * The failure that matters is not an error — a 404 already resolves to
   * `{ledger: null}` — but a STALL: a connection that is accepted and then
   * goes quiet. A bare fetch() inherits undici's defaults, whose headers
   * timeout is minutes, which would hang a sandbox build rather than fall
   * through to the snapshot-less path.
   */
  it('gives up on a server that accepts the connection and never answers', async () => {
    const sockets = new Set();
    const server = http.createServer(() => {
      // Deliberately never respond.
    });
    server.on('connection', s => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/component-scores.json`;

    try {
      const started = Date.now();
      const {ledger, error} = await loadLedger(url, {timeoutMs: 250});
      const elapsed = Date.now() - started;

      expect(ledger).toBeNull();
      expect(error).toContain('no response within 250ms');
      // The point of the test: it came back, and quickly.
      expect(elapsed).toBeLessThan(3000);
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('defaults to a bounded timeout rather than undici\'s minutes', () => {
    expect(LEDGER_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(LEDGER_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('the canonical component predicate', () => {
  const coreSrc = path.join(REPO_ROOT, 'packages/core/src');

  it('accepts a real component directory', () => {
    expect(isComponentDirectory(coreSrc, 'Button')).toBe(true);
    expect(isComponentDirectory(coreSrc, 'Badge')).toBe(true);
  });

  it('rejects the infrastructure directories', () => {
    for (const dir of ['hooks', 'theme', 'utils', 'i18n', '__tests__']) {
      expect(isComponentDirectory(coreSrc, dir), dir).toBe(false);
    }
  });

  it('rejects a styles-only directory (NavItem)', () => {
    expect(isComponentDirectory(coreSrc, 'NavItem')).toBe(false);
  });

  it('rejects context-only directories that render nothing', () => {
    expect(isComponentDirectory(coreSrc, 'SizeContext')).toBe(false);
    expect(isComponentDirectory(coreSrc, 'InteractiveRoleContext')).toBe(false);
  });

  it('rejects a directory that does not exist', () => {
    expect(isComponentDirectory(coreSrc, 'NotAThing')).toBe(false);
  });

  it('lists all covered packages, sorted, with no infrastructure', () => {
    const all = listComponents(REPO_ROOT);
    const names = all.map(c => c.component);
    expect(names).toContain('Button');
    expect(names).toContain('Stepper');
    expect(names).toContain('ChatComposerTokenElement');
    expect(names).toContain('ContextMenuItem');
    expect(names).toContain('TransferListSelector');
    expect(names).toContain('TourStep');
    expect(names).not.toContain('hooks');
    expect(names).not.toContain('NavItem');
    expect(names).not.toContain('Chat');
    expect(names).not.toContain('Indicator');
    expect(names).not.toContain('Layer');
    expect(names).not.toContain('NavMenu');
    expect(names).not.toContain('Resizable');
    expect(names).not.toContain('ContextMenuItemProps');
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(new Set(all.map(c => c.package))).toEqual(
      new Set(['charts', 'core', 'lab', 'richtext', 'vega']),
    );
  });

  it('covers every public component in flat component packages', () => {
    const byPackage = new Map();
    for (const item of listComponents(REPO_ROOT)) {
      const names = byPackage.get(item.package) ?? [];
      names.push(item.component);
      byPackage.set(item.package, names);
    }
    expect(byPackage.get('charts')).toEqual([
      'Chart',
      'ChartAxis',
      'ChartGrid',
      'ChartLegend',
      'ChartSwatch',
      'ChartTooltip',
    ]);
    expect(byPackage.get('richtext')).toEqual([
      'RichTextEditor',
      'RichTextEditorAutoLinkPlugin',
      'RichTextEditorToolbar',
      'RichTextView',
    ]);
    expect(byPackage.get('vega')).toEqual(['VegaChart']);
  });
});

describe('the flat-package component predicate', () => {
  const richtextSrc = path.join(REPO_ROOT, 'packages/richtext/src');

  it('keeps public exported components and drops private helpers', () => {
    const names = flatPackageComponents(richtextSrc);
    expect(names).toEqual([
      'RichTextEditor',
      'RichTextEditorAutoLinkPlugin',
      'RichTextEditorToolbar',
      'RichTextView',
    ]);
    expect(names).not.toContain('LexicalErrorBoundary');
  });

  it('returns nothing for a src dir that does not exist', () => {
    expect(flatPackageComponents(path.join(REPO_ROOT, 'packages/nope/src'))).toEqual([]);
  });
});

describe('grades', () => {
  it('bands by score', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(60)).toBe('D');
    expect(gradeFor(59.9)).toBe('F');
    expect(gradeFor(null)).toBeNull();
  });

  it('caps at C when any BLOCK is open, whatever the arithmetic says', () => {
    expect(gradeFor(95, 1)).toBe('C');
    expect(gradeFor(85, 3)).toBe('C');
    expect(gradeFor(65, 1)).toBe('D');
    expect(gradeFor(40, 9)).toBe('F');
  });
});

describe('the section vocabulary matches the rubric', () => {
  it('weights sum to 100', () => {
    expect(Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('carries all eleven rubric sections', () => {
    expect(SECTION_IDS).toEqual([
      'a11y',
      'theming',
      'api',
      'behavior',
      'design_objective',
      'design_rendered',
      'testing',
      'code_health',
      'docs',
      'i18n_rtl',
      'responsive',
    ]);
  });

  it('reads the weakest SCORED section, ignoring unmeasured ones', () => {
    const e = entry({
      sections: {
        a11y: {score: 1, weight: 16, state: 'unpublished'},
        design_objective: {score: 4, weight: 6, state: 'scored'},
        design_rendered: {score: 2, weight: 4, state: 'scored'},
        testing: {score: 0, weight: 8, state: 'not_measured'},
      },
    });
    expect(weakestSection(e)).toEqual({id: 'design_rendered', score: 2});
  });
});

describe('roster, queue and stats', () => {
  const roster = [
    {component: 'Alpha', package: 'core', live: true, entry: null},
    {
      component: 'Beta',
      package: 'core',
      live: true,
      entry: entry({component: 'Beta', score: 80, grade: 'B', lastAudited: '2026-07-01'}),
    },
    {
      component: 'Gamma',
      package: 'lab',
      live: true,
      entry: entry({
        component: 'Gamma',
        score: 50,
        grade: 'F',
        lastAudited: '2026-06-01',
        blocks: withBlocks('A1', 'A2'),
      }),
    },
    {component: 'Zeta', package: 'lab', live: true, entry: null},
  ];

  it('queues never-audited components first, alphabetically', () => {
    const q = buildQueue(roster);
    expect(q.slice(0, 2).map(e => e.component)).toEqual(['Alpha', 'Zeta']);
    expect(q[0].why).toBe('never audited');
  });

  it('then queues audited components oldest-first', () => {
    const q = buildQueue(roster);
    expect(q.slice(2).map(e => e.component)).toEqual(['Gamma', 'Beta']);
  });

  it('honours --limit', () => {
    expect(buildQueue(roster, 3)).toHaveLength(3);
  });

  it('joins the live roster with the ledger and flags orphan rows', () => {
    const ledger = {
      components: [entry({component: 'Beta'}), entry({component: 'Deleted'})],
    };
    const joined = buildRoster(ledger, [
      {component: 'Alpha', package: 'core'},
      {component: 'Beta', package: 'core'},
    ]);
    expect(joined.map(r => r.component)).toEqual(['Alpha', 'Beta', 'Deleted']);
    expect(joined.find(r => r.component === 'Alpha').entry).toBeNull();
    expect(joined.find(r => r.component === 'Deleted').live).toBe(false);
  });

  it('summarises coverage, grades and open BLOCKs', () => {
    const s = buildStats(roster);
    expect(s.total).toBe(4);
    expect(s.audited).toBe(2);
    expect(s.unaudited).toBe(2);
    expect(s.percentAudited).toBe(50);
    expect(s.grades).toMatchObject({B: 1, F: 1});
    expect(s.openBlocks).toBe(2);
    expect(s.componentsWithBlocks).toBe(1);
    expect(s.oldestAudit).toBe('2026-06-01');
    expect(s.byPackage.core).toEqual({total: 2, audited: 1});
  });
});

describe('recording a scorecard', () => {
  const card = {
    score: 74.2,
    lastAudited: '2026-08-10',
    rubricVersion: '1.2',
    mode: 'O',
    commit: 'dccdabea0b',
    blocks: {count: 1, open: [{id: 'A18', summary: 'baseline entries silence axe'}]},
  };

  it('derives the grade, applying the open-BLOCK cap', () => {
    const e = applyScorecard(null, card, {component: 'Badge', pkg: 'core'});
    expect(e.grade).toBe('C');
    expect(e.status).toBe('audited');
    expect(e.package).toBe('core');
  });

  it('normalises a BLOCK with no issue to `issue: null` rather than dropping it', () => {
    const e = applyScorecard(null, card, {component: 'Badge', pkg: 'core'});
    expect(e.blocks.open[0].issue).toBeNull();
  });

  it('rejects a grade that contradicts the score', () => {
    expect(() =>
      applyScorecard(null, {...card, grade: 'A'}, {component: 'Badge', pkg: 'core'}),
    ).toThrow(/contradicts score/);
  });

  it('rejects an unknown field rather than storing it silently', () => {
    expect(() =>
      applyScorecard(null, {...card, sore: 74}, {component: 'Badge', pkg: 'core'}),
    ).toThrow(/unknown scorecard field\(s\): sore/);
  });

  it('rejects an unknown section id and an unknown section state', () => {
    expect(() =>
      applyScorecard(null, {...card, sections: {a11yy: {score: 3}}}, {component: 'B', pkg: 'core'}),
    ).toThrow(/unknown section id/);
    expect(() =>
      applyScorecard(
        null,
        {...card, sections: {a11y: {score: 3, state: 'vibes'}}},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/unknown section state/);
  });

  it('fills each section weight from the rubric', () => {
    const e = applyScorecard(
      null,
      {...card, sections: {a11y: {score: 3, state: 'scored'}}},
      {component: 'B', pkg: 'core'},
    );
    expect(e.sections.a11y.weight).toBe(16);
  });

  it('rejects more listed BLOCKs than the count claims', () => {
    expect(() =>
      applyScorecard(
        null,
        {...card, blocks: {count: 1, open: [{id: 'A1', summary: 'x'}, {id: 'A2', summary: 'y'}]}},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/BLOCKs listed but blocks.count is 1/);
  });

  it('rejects blocks written as a bare array, which silently zeroes the BLOCK count', () => {
    expect(() =>
      applyScorecard(
        null,
        {...card, blocks: [{id: 'A5', summary: 'x'}, {id: 'A6', summary: 'y'}]},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/blocks must be \{count, open: \[\.\.\.\]\}/);
  });

  it('does not let a bare-array blocks slip the open-BLOCK grade cap', () => {
    // The reason this shape is worth an error rather than a repair: an A-range
    // score with open BLOCKs is capped at C, and a bare array reads as zero
    // open BLOCKs, so the row would record A.
    expect(gradeFor(91, 3)).toBe('C');
    expect(() =>
      applyScorecard(
        null,
        {...card, score: 91, blocks: [{id: 'A5', summary: 'x'}]},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/blocks must be/);
  });

  it('rejects a blocks object missing count or open', () => {
    for (const blocks of [{open: []}, {count: 0}, {count: '0', open: []}, null, 'none']) {
      expect(() =>
        applyScorecard(null, {...card, blocks}, {component: 'B', pkg: 'core'}),
      ).toThrow(/blocks must be/);
    }
  });

  it('refuses to store an unaudited row — an unaudited component simply has none', () => {
    expect(() =>
      applyScorecard(null, {...card, status: 'unaudited'}, {component: 'B', pkg: 'core'}),
    ).toThrow(/audited components only/);
  });

  it('rejects evidence written as bare strings, which reds every build in the repo', () => {
    expect(() =>
      applyScorecard(
        null,
        {...card, evidence: ['33 before and 33 after screenshots']},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/evidence must be an array of \{label, path\?, note\?\} objects/);
  });

  it('rejects an evidence item with no label, or a stray key, or a non-string value', () => {
    for (const evidence of [
      [{note: 'no label'}],
      [{label: 'ok', paths: '/x'}],
      [{label: 'ok', path: 42}],
      [{label: 12}],
      ['a', {label: 'ok'}],
      'not an array',
    ]) {
      expect(() =>
        applyScorecard(null, {...card, evidence}, {component: 'B', pkg: 'core'}),
      ).toThrow(/evidence must be/);
    }
  });

  it('accepts the declared evidence shape, with path and note optional', () => {
    const e = applyScorecard(
      null,
      {
        ...card,
        evidence: [
          {label: 'bare label'},
          {label: 'with a path', path: 'packages/core/src/Badge/Badge.tsx'},
          {label: 'with both', path: 'https://example.com/x.png', note: 'measured'},
        ],
      },
      {component: 'B', pkg: 'core'},
    );
    expect(e.evidence).toHaveLength(3);
  });

  it('requires the rubric version, the date and the mode', () => {
    for (const field of ['rubricVersion', 'lastAudited', 'mode']) {
      const partial = {...card};
      delete partial[field];
      expect(() =>
        applyScorecard(null, partial, {component: 'B', pkg: 'core'}),
        field,
      ).toThrow(new RegExp(field));
    }
  });
});

describe('audit mode contract', () => {
  const modeCard = {
    score: 74.2,
    lastAudited: '2026-09-07',
    rubricVersion: '1.15.3',
    mode: 'O',
    commit: 'dccdabea0b',
    blocks: {count: 0, open: []},
  };

  it('normalizes canonical and legacy mode spellings', () => {
    expect(auditModePolicy('N')).toMatchObject({code: 'N', filesBlockIssues: false});
    expect(auditModePolicy('nightly')).toMatchObject({code: 'N'});
    expect(auditModePolicy('grading')).toMatchObject({code: 'O', filesBlockIssues: true});
    expect(auditModePolicy('promotion')).toMatchObject({code: 'P', filesBlockIssues: true});
    expect(auditModePolicy('review')).toMatchObject({code: 'R', filesBlockIssues: false});
    expect(auditModePolicy('invented')).toBeNull();
  });

  it('rejects an unknown scorecard mode and stores aliases canonically', () => {
    const legacy = applyScorecard(
      null,
      {...modeCard, mode: 'nightly'},
      {component: 'B', pkg: 'core'},
    );
    expect(legacy.mode).toBe('N');
    expect(() =>
      applyScorecard(
        null,
        {...modeCard, mode: 'automatic'},
        {component: 'B', pkg: 'core'},
      ),
    ).toThrow(/mode must be N .* O .* P .* R/);
  });

  it('starts local, follows linked authority, and applies rubric procedure last', () => {
    const component = AUDIT_PROMPT.indexOf(
      '1. start from the nearest current component contract',
    );
    const modules = AUDIT_PROMPT.indexOf('applicable current\n   public module contract');
    const familyDesign = AUDIT_PROMPT.indexOf(
      '2. follow their applicable links to current family and design requirements',
    );
    const architectureSystem = AUDIT_PROMPT.indexOf(
      '3. follow referenced current architecture and system decisions',
    );
    const objective = AUDIT_PROMPT.indexOf('applicable objective standards');
    const rubric = AUDIT_PROMPT.indexOf('4. apply the rubric procedure last');

    for (const marker of [
      component,
      modules,
      familyDesign,
      architectureSystem,
      objective,
      rubric,
    ]) {
      expect(marker).toBeGreaterThan(-1);
    }
    expect(component).toBeLessThan(familyDesign);
    expect(modules).toBeLessThan(familyDesign);
    expect(familyDesign).toBeLessThan(architectureSystem);
    expect(architectureSystem).toBeLessThan(objective);
    expect(objective).toBeLessThan(rubric);
    expect(AUDIT_PROMPT).toContain('do not scan global authority first');
    expect(AUDIT_PROMPT).not.toContain(
      'current global authority and objective standards',
    );
    expect(AUDIT_PROMPT).toContain('optional context, never\npolicy');
  });

  it('preserves all four mode lifecycles without cross-filing issues', () => {
    expect(AUDIT_PROMPT).toContain('<AuditMode: N|O|P|R>');
    expect(AUDIT_PROMPT).toContain('record only the post-fix ledger result');
    expect(AUDIT_PROMPT).toContain('file no ordinary\n  per-finding issues');
    expect(AUDIT_PROMPT).toContain('one issue per open BLOCK');
    expect(AUDIT_PROMPT).toContain(
      'R — review: put findings on the pull request or in its review',
    );
    expect(AUDIT_PROMPT).toContain(
      'File no ordinary\n  per-BLOCK issues and do not apply the whole-component ledger lifecycle',
    );
  });

  it('keeps backfills observational and routes unresolved judgment to the owner', () => {
    expect(AUDIT_PROMPT).toContain('A backfill is observational\nonly');
    expect(AUDIT_PROMPT).toContain(
      'must not add, improve,\nremove, reinterpret, or otherwise change product meaning',
    );
    expect(AUDIT_PROMPT).toContain('A conflict between current records');
    for (const boundary of [
      'new API meaning or\nshape',
      'defaults',
      'compatibility or migration promises',
      'ownership boundaries',
      'subjective design judgment',
      'stops remediation and routes to the owning human',
    ]) {
      expect(AUDIT_PROMPT).toContain(boundary);
    }
  });

  it('keeps audit storage split and invalidates only linked affected scores', () => {
    const ledger = AUDIT_PROMPT.indexOf(
      'The wiki ledger stores current post-fix\nscores and unresolved findings',
    );
    const pullRequest = AUDIT_PROMPT.indexOf(
      "The pull request stores the run's reviewable\nevidence",
    );
    const report = AUDIT_PROMPT.indexOf(
      'The trusted exact-head report belongs in trusted PR/check metadata',
    );
    const specs = AUDIT_PROMPT.indexOf(
      'Component and module specs store durable product behavior only',
    );
    expect(ledger).toBeGreaterThan(-1);
    expect(ledger).toBeLessThan(pullRequest);
    expect(pullRequest).toBeLessThan(report);
    expect(report).toBeLessThan(specs);
    expect(AUDIT_PROMPT).toContain(
      'do not put audit\nscores, run inventories, screenshots, findings, or eligibility data in them',
    );
    expect(AUDIT_PROMPT).toContain(
      'Authority changes invalidate linked affected scores on the existing scale',
    );
    expect(AUDIT_PROMPT).toContain(
      'a\ncomponent or module change invalidates that component',
    );
    expect(AUDIT_PROMPT).toContain(
      'an applicable family\nor global-authority change invalidates every linked component',
    );
    expect(AUDIT_PROMPT).toContain(
      'Do not bump the\nrubric version unless scoring methodology, weights, severities, or evidence\ntreatment changes',
    );
  });

  it('pins behavior remediation and emits the agreed fail-closed report fields', () => {
    expect(AUDIT_PROMPT).toContain(
      'mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/tdd/SKILL.md',
    );
    expect(AUDIT_PROMPT).toContain('Prove red before production changes');
    for (const field of [
      '"schemaVersion"',
      '"component"',
      '"package"',
      '"auditMode"',
      '"rubricVersion"',
      '"heads"',
      '"repository"',
      '"componentContract"',
      '"inventory"',
      '"unresolvedGaps"',
      '"objective"',
      '"manual"',
      '"remediations"',
      '"beforeEvidence"',
      '"afterEvidence"',
      '"approvals"',
      '"checks"',
      '"eligibility"',
      '"reasons"',
    ]) {
      expect(AUDIT_PROMPT).toContain(field);
    }
    expect(AUDIT_PROMPT).toContain('manual-review-only');
    expect(AUDIT_PROMPT).toContain('Do not enable auto-merge');
    expect(AUDIT_PROMPT).toContain('does\nnot activate auto-merge');
  });
});

describe('issue plumbing', () => {
  it('links a filed BLOCK and says so when one is not filed', () => {
    expect(blockLink({id: 'A8', summary: 'x', issue: 3885})).toContain(
      'https://github.com/meta/astryx/issues/3885',
    );
    expect(blockLink({id: 'A8', summary: 'x', issue: null})).toContain('no issue filed');
  });

  it('writes an issue body that stands on its own', () => {
    const body = issueBody(
      'Button',
      entry({mode: 'O', rubricVersion: '1.2', commit: 'dccdabea0b', score: 62.6, grade: 'D'}),
      {
        id: 'T6',
        section: '§2 Theming & token integrity',
        summary: 'elevation is absent from themeProps',
        evidence: 'Button.tsx',
        fix: 'add elevation to the themeProps call on the painting element',
      },
    );
    expect(body).toContain('`T6`');
    expect(body).toContain('§2 Theming & token integrity');
    expect(body).toContain('rubric **v1.2**');
    expect(body).toContain('Component-Audit-Rubric');
    // The row is readable on the sandbox page, never on a generated wiki table.
    expect(body).toContain(SCORES_PAGE_URL);
    expect(body).not.toContain('wiki/Component-Scores');
    expect(body).toContain('Button.tsx');
    expect(body).toContain('Closing protocol');
    expect(body).toContain("If the recorded score doesn't move");
  });
});

// ---------------------------------------------------------------------------
// The write path: --record, --dry-run and --push
//
// These drive the real CLI against a real git remote in a temp dir. The push
// path is the whole point of the tool — an audit that isn't recorded didn't
// happen — so it is tested end to end rather than mocked, including the case
// two agents race to record at the same moment.
// ---------------------------------------------------------------------------

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'score-ledger.mjs');

const git = (cwd, ...argv) =>
  execFileSync('git', argv, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

/** Run the CLI and capture everything, exit code included. */
function cli(argv, {cwd = REPO_ROOT, input, env} = {}) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...argv], {
      cwd,
      input,
      encoding: 'utf8',
      env: {...process.env, ...env},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {code: 0, out};
  } catch (e) {
    return {code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}`};
  }
}

const ledgerWith = (...components) => ({
  ledgerVersion: 1,
  rubricVersion: '1.2',
  updated: '2026-08-01',
  components,
});

/** A scorecard the validator accepts. */
const scorecard = (over = {}) => ({
  status: 'audited',
  score: 81,
  sections: {a11y: {score: 4, state: 'scored'}},
  blocks: {count: 0, open: []},
  distinct_defects: 2,
  lastAudited: '2026-08-11',
  rubricVersion: '1.2',
  mode: 'O',
  commit: 'abc1234567',
  ...over,
});

/**
 * A bare repo standing in for the wiki, plus a working clone of it. The clone
 * is shallow and pushes over file://, exactly as `ensureWikiClone` produces.
 */
function makeWiki(seedLedger) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'score-ledger-wiki-'));
  const bare = path.join(root, 'wiki.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');

  git(root, 'init', '--bare', '--initial-branch=master', bare);
  git(root, 'clone', bare, seed);
  identify(seed);
  fs.writeFileSync(
    path.join(seed, 'component-scores.json'),
    `${JSON.stringify(seedLedger, null, 2)}\n`,
  );
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'seed');
  git(seed, 'push', 'origin', 'master');

  git(root, 'clone', '--depth', '1', `file://${bare}`, clone);
  identify(clone);
  return {root, bare, clone, ledger: path.join(clone, 'component-scores.json')};
}

function identify(dir) {
  git(dir, 'config', 'user.name', 'Ledger Test');
  git(dir, 'config', 'user.email', 'ledger-test@example.com');
}

const readLedger = file => JSON.parse(fs.readFileSync(file, 'utf8'));

/** What the remote actually holds, which is the only thing that counts. */
const remoteLedger = bare =>
  JSON.parse(git(bare, 'show', 'master:component-scores.json'));

describe('the commit message', () => {
  it('names the component, the grade, the score and the rubric version', () => {
    expect(commitMessage(entry({score: 62.6, grade: 'D'})).subject).toBe(
      'scores: Button D (62.6), rubric 1.2',
    );
  });

  it('qualifies an ambiguous name with its package — Chat is two components', () => {
    const {subject} = commitMessage(
      entry({component: 'Chat', package: 'lab', score: 70, grade: 'C'}),
      {ambiguous: true},
    );
    expect(subject).toBe('scores: lab/Chat C (70.0), rubric 1.2');
  });

  it('puts the regression reason in the body, with the numbers it moved from', () => {
    const {subject, body} = commitMessage(entry({score: 55, grade: 'F'}), {
      regression: {reason: 'rescored under a stricter reading of A8', from: {score: 70, blocks: 1}},
    });
    expect(subject).toBe('scores: Button F (55.0), rubric 1.2');
    expect(body).toContain('Regression allowed: rescored under a stricter reading of A8');
    expect(body).toContain('Score 70.0 → 55.0');
  });
});

describe('wiki URLs', () => {
  it('reads the repo out of a wiki remote, https or ssh', () => {
    expect(repoFromWikiRemote('https://github.com/meta/astryx.wiki.git')).toBe(
      'meta/astryx',
    );
    expect(repoFromWikiRemote('git@github.com:meta/astryx.wiki.git')).toBe('meta/astryx');
  });

  it('builds a commit URL GitHub actually serves', () => {
    expect(wikiCommitUrl('deadbeef')).toBe(
      'https://github.com/meta/astryx/wiki/_compare/deadbeef',
    );
  });
});

describe('--record', () => {
  it('reads the scorecard from stdin with --from -, so an agent needs no temp file', () => {
    const wiki = makeWiki(ledgerWith());
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(0);
    const row = readLedger(wiki.ledger).components.find(c => c.component === 'Button');
    expect(row).toMatchObject({package: 'core', grade: 'B', score: 81});
  });

  it('refuses a regression, and writes nothing at all', () => {
    const seeded = ledgerWith(entry({score: 90, grade: 'A'}));
    const wiki = makeWiki(seeded);
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(scorecard({score: 70})),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('refusing');
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it('records the reason on the row when a regression is allowed', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 90, grade: 'A'})));
    const r = cli([
      '--record', 'Button',
      '--from', '-',
      '--ledger', wiki.ledger,
      '--allow-regression', 'rescored under v1.2 §5 split',
    ], {input: JSON.stringify(scorecard({score: 70}))});
    expect(r.code).toBe(0);
    const row = readLedger(wiki.ledger).components.find(c => c.component === 'Button');
    expect(row.regression.reason).toBe('rescored under v1.2 §5 split');
    expect(row.regression.from).toEqual({score: 90, blocks: 0});
  });

  /**
   * `rubricVersion` is the one field the writer controls, and `compareEntry`
   * calls a version change `incomparable` rather than `fail`. Without this the
   * guard is bypassed by editing that string: a real 74.2 was overwritten with
   * a 30 and pushed, in exactly this way, while testing.
   */
  it('still demands a reason when the rubric version changed and the numbers fell', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 74.2, grade: 'C', rubricVersion: '1.1'})));
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(scorecard({score: 30, rubricVersion: '1.2'})),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('refusing');
    expect(r.out).toContain('the numbers went down');
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it('lets a rubric-version RE-SCORE through when the reason is given', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 74.2, grade: 'C', rubricVersion: '1.1'})));
    const r = cli([
      '--record', 'Button', '--from', '-', '--ledger', wiki.ledger,
      '--allow-regression', 're-audited under v1.2, which splits §5',
    ], {input: JSON.stringify(scorecard({score: 30, rubricVersion: '1.2'}))});
    expect(r.code).toBe(0);
    const row = readLedger(wiki.ledger).components.find(c => c.component === 'Button');
    expect(row.regression.from).toEqual({score: 74.2, blocks: 0});
  });

  it('does not demand a reason when a version change IMPROVES the numbers', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 60, grade: 'D', rubricVersion: '1.1'})));
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(scorecard({score: 81, rubricVersion: '1.2'})),
    });
    expect(r.code).toBe(0);
    const row = readLedger(wiki.ledger).components.find(c => c.component === 'Button');
    expect(row.regression).toBeUndefined();
  });

  it('rejects a bare --allow-regression — the reason is the point', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 90, grade: 'A'})));
    const r = cli([
      '--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--allow-regression',
    ], {input: JSON.stringify(scorecard({score: 70}))});
    expect(r.code).toBe(1);
    expect(r.out).toContain('needs a reason');
  });

  it('--dry-run prints the diff and the commit message and changes nothing', () => {
    const wiki = makeWiki(ledgerWith());
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--dry-run'], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('--- a/component-scores.json');
    expect(r.out).toContain('+      "component": "Button"');
    expect(r.out).toContain('scores: Button B (81.0), rubric 1.2');
    expect(r.out).toContain('nothing written');
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it('without --push or --ledger it says how to write, rather than guessing', () => {
    const r = cli(['--record', 'Button', '--from', '-'], {input: JSON.stringify(scorecard())});
    expect(r.code).toBe(1);
    expect(r.out).toContain('--push');
  });

  it('keeps Night Watch BLOCKs on the ledger without a filing warning', () => {
    const wiki = makeWiki(ledgerWith());
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(
        scorecard({
          mode: 'N',
          blocks: withBlocks({id: 'A8', summary: 'touch path is missing'}),
        }),
      ),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('Night Watch mode keeps 1 unresolved BLOCK');
    expect(r.out).not.toContain('::warning::');
    expect(r.out).not.toContain('File them');
  });

  it.each(['O', 'P'])('warns mode %s to file each unlinked BLOCK', mode => {
    const wiki = makeWiki(ledgerWith());
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(
        scorecard({
          mode,
          blocks: withBlocks({id: 'A8', summary: 'touch path is missing'}),
        }),
      ),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('::warning::score-ledger');
    expect(r.out).toContain('--file-issues Button --push');
  });
});

describe('--file-issues audit modes', () => {
  it.each([
    ['N', 'Night Watch files no ordinary per-finding issues'],
    ['R', 'Only grading (O) and promotion (P)'],
  ])('refuses mode %s before filing or changing the ledger', (mode, reason) => {
    const seeded = ledgerWith(
      entry({mode, blocks: withBlocks({id: 'A8', summary: 'touch path is missing'})}),
    );
    const wiki = makeWiki(seeded);
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const r = cli([
      '--file-issues',
      'Button',
      '--ledger',
      wiki.ledger,
      '--dry-run',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(reason);
    expect(r.out).not.toContain('would file');
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it.each(['O', 'P'])('allows mode %s to preview one issue per open BLOCK', mode => {
    const wiki = makeWiki(
      ledgerWith(
        entry({mode, blocks: withBlocks({id: 'A8', summary: 'touch path is missing'})}),
      ),
    );
    const r = cli([
      '--file-issues',
      'Button',
      '--ledger',
      wiki.ledger,
      '--dry-run',
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--- would file ---');
    expect(r.out).toContain('[audit] Button: touch path is missing');
  });
});

describe('--record --push', () => {
  it('commits and pushes in one command, and prints the commit URL', () => {
    const wiki = makeWiki(ledgerWith());
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push'], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('/wiki/_compare/');
    expect(remoteLedger(wiki.bare).components.map(c => c.component)).toEqual(['Button']);
    expect(git(wiki.clone, 'log', '-1', '--format=%s')).toBe(
      'scores: Button B (81.0), rubric 1.2',
    );
  });

  it('pushes nothing when the apply is not clean', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 90, grade: 'A'})));
    const head = git(wiki.bare, 'rev-parse', 'master');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push'], {
      input: JSON.stringify(scorecard({score: 70})),
    });
    expect(r.code).toBe(1);
    expect(git(wiki.bare, 'rev-parse', 'master')).toBe(head);
  });

  it('carries the regression reason into the commit message', () => {
    const wiki = makeWiki(ledgerWith(entry({score: 90, grade: 'A'})));
    const r = cli([
      '--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push',
      '--allow-regression', 'A8 was scored too kindly in the calibration pass',
    ], {input: JSON.stringify(scorecard({score: 70}))});
    expect(r.code).toBe(0);
    const message = git(wiki.clone, 'log', '-1', '--format=%B');
    expect(message).toContain('scores: Button C (70.0), rubric 1.2');
    expect(message).toContain('A8 was scored too kindly in the calibration pass');
  });

  it('refuses to commit with no git identity', () => {
    const wiki = makeWiki(ledgerWith());
    git(wiki.clone, 'config', '--unset', 'user.name');
    git(wiki.clone, 'config', '--unset', 'user.email');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push'], {
      input: JSON.stringify(scorecard()),
      env: {GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null'},
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('no git identity');
  });

  it('refuses to sweep unrelated wiki edits into the commit', () => {
    const wiki = makeWiki(ledgerWith());
    fs.writeFileSync(path.join(wiki.clone, 'Home.md'), 'half-finished edit\n');
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push'], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('unrelated changes');
  });

  /**
   * The concurrency case, for real. An `update` hook on the remote lands a
   * competing record and rejects the first push; the tool must re-apply onto
   * what the other agent wrote instead of overwriting it. Both rows survive.
   */
  it('re-applies onto the winner and keeps both records when two agents race', () => {
    const wiki = makeWiki(ledgerWith());
    const competing = ledgerWith(
      entry({component: 'Badge', score: 74.2, grade: 'C', lastAudited: '2026-08-09'}),
    );
    const competingFile = path.join(wiki.root, 'competing.json');
    fs.writeFileSync(competingFile, `${JSON.stringify(competing, null, 2)}\n`);

    const hook = path.join(wiki.bare, 'hooks', 'update');
    fs.writeFileSync(
      hook,
      [
        '#!/bin/sh',
        'set -e',
        'marker="$(git rev-parse --git-dir)/raced"',
        '[ -f "$marker" ] && exit 0',
        'touch "$marker"',
        'export GIT_AUTHOR_NAME="Other Agent" GIT_AUTHOR_EMAIL="other@example.com"',
        'export GIT_COMMITTER_NAME="Other Agent" GIT_COMMITTER_EMAIL="other@example.com"',
        'GIT_INDEX_FILE="$(mktemp)"; export GIT_INDEX_FILE',
        'git read-tree master',
        `blob=$(git hash-object -w -- ${JSON.stringify(competingFile).slice(1, -1)})`,
        'git update-index --add --cacheinfo 100644,$blob,component-scores.json',
        'tree=$(git write-tree)',
        'commit=$(git commit-tree $tree -p master -m "scores: Badge C (74.2), rubric 1.2")',
        'git update-ref refs/heads/master $commit',
        'echo "rejected: non-fast-forward (simulated race)" >&2',
        'exit 1',
      ].join('\n'),
    );
    fs.chmodSync(hook, 0o755);

    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger, '--push'], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('retrying once');
    expect(remoteLedger(wiki.bare).components.map(c => c.component).sort()).toEqual([
      'Badge',
      'Button',
    ]);
  });
});

describe('the generated table is gone', () => {
  it('--report is not a subcommand any more', () => {
    const r = cli(['--report']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Usage:');
    expect(r.out).not.toContain('--report');
  });

  it('recording writes the JSON and nothing beside it', () => {
    const wiki = makeWiki(ledgerWith());
    const r = cli(['--record', 'Button', '--from', '-', '--ledger', wiki.ledger], {
      input: JSON.stringify(scorecard()),
    });
    expect(r.code).toBe(0);
    expect(fs.readdirSync(wiki.clone).filter(f => f !== '.git')).toEqual([
      'component-scores.json',
    ]);
  });
});
