// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused unit and integration tests for the template score ledger.
 * @input The template-score-ledger module, the checked-in template roster, and
 *   temporary local wiki repositories.
 * @output Assertions for schema validation, recording, reporting, and safe
 *   concurrent publication.
 * @position Regression coverage for scripts/template-score-ledger.mjs.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import {TEMPLATE_RUBRIC} from '../packages/cli/assets/docs/tree/template-grading-rubric.doc.mjs';

import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LEDGER_FILENAME,
  TEMPLATE_LEDGER_URL,
  WIKI_BRANCH,
  WIKI_REMOTE,
  applyScorecard,
  buildQueue,
  buildRoster,
  buildStats,
  commitMessage,
  ensureWikiClone,
  listTemplates,
  templateGrade,
  validateLedger,
} from './template-score-ledger.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'template-score-ledger.mjs');

const categoriesForScore = score => {
  let remaining = score;
  return Object.fromEntries(
    TEMPLATE_CATEGORIES.map(category => {
      const points = Math.min(category.max, Math.max(0, remaining));
      remaining -= points;
      return [category.id, {score: points, status: 'published'}];
    }),
  );
};

const audit = (overrides = {}) => {
  const score = overrides.score ?? 81;
  return {
    id: 'page/centered-hero',
    score,
    grade: templateGrade(score),
    status: 'current',
    lastAudited: '2026-08-11',
    commit: 'abc1234567',
    rubricVersion: '1',
    categories: categoriesForScore(score),
    findings: ['One raw wrapper remains.'],
    topFixes: ['Replace the wrapper with Stack.'],
    evidence: [{label: 'Rendered audit', href: 'https://example.com/audit'}],
    notes: 'Audited at HEAD.',
    ...overrides,
  };
};

const scorecard = (overrides = {}) => {
  const score = overrides.score ?? 81;
  return {
    score,
    lastAudited: '2026-08-11',
    commit: 'abc1234567',
    rubricVersion: '1',
    categories: categoriesForScore(score),
    findings: ['One raw wrapper remains.'],
    topFixes: ['Replace the wrapper with Stack.'],
    evidence: [{label: 'Rendered audit'}],
    notes: 'Audited at HEAD.',
    ...overrides,
  };
};

const ledgerWith = (...templates) => ({
  ledgerVersion: 1,
  rubricVersion: '1',
  updated: '2026-08-11',
  templates,
});

describe('the public ledger contract', () => {
  it('uses the one wiki file and branch shared by every write path', () => {
    expect(TEMPLATE_LEDGER_FILENAME).toBe('template-scores.json');
    expect(TEMPLATE_LEDGER_URL).toBe(
      'https://raw.githubusercontent.com/wiki/meta/astryx/template-scores.json',
    );
    expect(WIKI_REMOTE).toBe('https://github.com/meta/astryx.wiki.git');
    expect(WIKI_BRANCH).toBe('master');
    expect(ensureWikiClone).toBeTypeOf('function');
  });

  it('uses the rubric grade boundaries', () => {
    expect(TEMPLATE_RUBRIC.version).toBe('1.4');
    expect(
      [100, 90, 89.9, 75, 74.9, 60, 59.9, 40, 39.9, 0].map(templateGrade),
    ).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
  });

  it('reads category ids and weights from the shipped rubric doc', () => {
    expect(TEMPLATE_CATEGORIES).toEqual(
      TEMPLATE_RUBRIC.categories.map(({id, title, max}) => ({id, title, max})),
    );
  });

  it('carries the complete 100-point category vocabulary', () => {
    expect(TEMPLATE_CATEGORIES.map(category => category.id)).toEqual([
      'component_purity',
      'icon_purity',
      'custom_css',
      'layout_structure',
      'doc_metadata',
      'image_handling',
      'code_quality',
    ]);
    expect(
      TEMPLATE_CATEGORIES.reduce((sum, category) => sum + category.max, 0),
    ).toBe(100);
  });
});

describe('strict ledger validation', () => {
  it('returns a valid ledger', () => {
    const ledger = ledgerWith(audit());
    expect(validateLedger(ledger)).toBe(ledger);
  });

  it('rejects unknown top-level, row, category, and category-detail fields', () => {
    expect(() => validateLedger({...ledgerWith(), typo: true})).toThrow(
      /unknown.*typo/i,
    );
    expect(() => validateLedger(ledgerWith(audit({socre: 81})))).toThrow(
      /unknown.*socre/i,
    );
    expect(() =>
      validateLedger(
        ledgerWith(
          audit({
            categories: {component_purty: {score: 26, status: 'published'}},
          }),
        ),
      ),
    ).toThrow(/unknown category.*component_purty/i);
    expect(() =>
      validateLedger(
        ledgerWith(
          audit({
            categories: {
              component_purity: {score: 26, status: 'published', points: 30},
            },
          }),
        ),
      ),
    ).toThrow(/unknown.*points/i);
  });

  it('rejects malformed and duplicate template ids', () => {
    expect(() =>
      validateLedger(ledgerWith(audit({id: 'pages/centered-hero'}))),
    ).toThrow(/invalid template id/i);
    expect(() => validateLedger(ledgerWith(audit(), audit()))).toThrow(
      /duplicate.*id/i,
    );
  });

  it('rejects a grade that contradicts the score', () => {
    expect(() =>
      validateLedger(ledgerWith(audit({score: 89, grade: 'A'}))),
    ).toThrow(/grade.*contradicts.*score|expected B/i);
  });

  it('requires every current category and an exact category total', () => {
    expect(() =>
      validateLedger(
        ledgerWith(
          audit({
            categories: {component_purity: {score: 26, status: 'published'}},
          }),
        ),
      ),
    ).toThrow(/all seven categories|missing/i);
    expect(() =>
      validateLedger(ledgerWith(audit({categories: categoriesForScore(80)}))),
    ).toThrow(/total 80.*overall score 81/i);
    expect(
      validateLedger(
        ledgerWith(
          audit({
            status: 'historical',
            categories: {component_purity: {score: 26, status: 'published'}},
          }),
        ),
      ).templates[0].status,
    ).toBe('historical');
  });

  it('rejects invalid category status and points outside the category maximum', () => {
    expect(() =>
      validateLedger(
        ledgerWith(
          audit({
            categories: {component_purity: {score: 26, status: 'estimated'}},
          }),
        ),
      ),
    ).toThrow(/category.*status|estimated/i);
    expect(() =>
      validateLedger(
        ledgerWith(
          audit({
            categories: {image_handling: {score: 6, status: 'published'}},
          }),
        ),
      ),
    ).toThrow(/image_handling.*5|maximum.*5/i);
  });

  it('requires the arrays and evidence shape instead of coercing them', () => {
    expect(() => validateLedger(ledgerWith(audit({findings: 'none'})))).toThrow(
      /findings/i,
    );
    expect(() =>
      validateLedger(
        ledgerWith(audit({evidence: [{href: 'https://example.com'}]})),
      ),
    ).toThrow(/evidence.*label|label/i);
  });
});

describe('scorecard application', () => {
  it('derives grade and defaults optional current-audit fields', () => {
    const row = applyScorecard(
      null,
      {
        score: 92,
        lastAudited: '2026-08-12',
        commit: 'def1234567',
        rubricVersion: '1',
        categories: categoriesForScore(92),
      },
      {id: 'block/PowerSearchShowcase'},
    );
    expect(row).toEqual({
      id: 'block/PowerSearchShowcase',
      score: 92,
      grade: 'A',
      status: 'current',
      lastAudited: '2026-08-12',
      commit: 'def1234567',
      rubricVersion: '1',
      categories: categoriesForScore(92),
      findings: [],
      topFixes: [],
      evidence: [],
      notes: '',
    });
  });

  it('replaces a historical payload and re-derives the grade', () => {
    const row = applyScorecard(
      audit({
        score: 95,
        recordedGrade: 'Legacy A',
        pr: 42,
        findings: ['Stale historical finding.'],
      }),
      scorecard({score: 65}),
      {id: 'page/centered-hero'},
    );
    expect(row.grade).toBe('C');
    expect(row.findings).toEqual(['One raw wrapper remains.']);
    expect(row).not.toHaveProperty('recordedGrade');
    expect(row).not.toHaveProperty('pr');
  });

  it('rejects unknown fields, contradictory grades, and missing required provenance', () => {
    expect(() =>
      applyScorecard(null, scorecard({socre: 81}), {id: 'page/centered-hero'}),
    ).toThrow(/unknown.*socre/i);
    expect(() =>
      applyScorecard(null, scorecard({grade: 'A'}), {id: 'page/centered-hero'}),
    ).toThrow(/grade.*contradicts.*score|expected B/i);
    for (const field of ['score', 'lastAudited', 'commit', 'rubricVersion']) {
      const partial = scorecard();
      delete partial[field];
      expect(
        () => applyScorecard(null, partial, {id: 'page/centered-hero'}),
        field,
      ).toThrow(new RegExp(field, 'i'));
    }
  });
});

describe('template ids, roster, queue, and stats', () => {
  it('discovers sorted, unique page and block ids with their code and docs', () => {
    const templates = listTemplates(REPO_ROOT);
    const ids = templates.map(template => template.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('page/centered-hero');
    expect(ids).toContain('block/PowerSearchShowcase');
    expect(ids.every(id => /^(page|block)\/[^/]+$/.test(id))).toBe(true);

    expect(
      templates.find(template => template.id === 'page/centered-hero'),
    ).toMatchObject({
      type: 'page',
      slug: 'centered-hero',
      codePath: expect.stringMatching(/centered-hero\/page\.tsx$/),
      docPath: expect.stringMatching(/centered-hero\/template\.doc\.mjs$/),
    });
    expect(
      templates.find(template => template.id === 'block/PowerSearchShowcase'),
    ).toMatchObject({
      type: 'block',
      slug: 'PowerSearchShowcase',
      codePath: expect.stringMatching(/PowerSearch\/PowerSearchShowcase\.tsx$/),
      docPath: expect.stringMatching(
        /PowerSearch\/PowerSearchShowcase\.doc\.mjs$/,
      ),
    });
  });

  const templates = [
    {
      id: 'block/AlphaShowcase',
      type: 'block',
      slug: 'AlphaShowcase',
      codePath: '/tmp/AlphaShowcase.tsx',
      docPath: '/tmp/AlphaShowcase.doc.mjs',
    },
    {
      id: 'page/zeta',
      type: 'page',
      slug: 'zeta',
      codePath: '/tmp/zeta/page.tsx',
      docPath: '/tmp/zeta/template.doc.mjs',
    },
    {
      id: 'page/beta',
      type: 'page',
      slug: 'beta',
      codePath: '/tmp/beta/page.tsx',
      docPath: '/tmp/beta/template.doc.mjs',
    },
  ];
  const ledger = ledgerWith(
    audit({id: 'page/zeta', lastAudited: '2026-07-01'}),
    audit({id: 'page/beta', score: 42, grade: 'D', lastAudited: '2026-06-01'}),
    audit({id: 'page/deleted', score: 95, grade: 'A'}),
  );

  it('joins live templates to scores and preserves orphan rows for cleanup', () => {
    const roster = buildRoster(ledger, templates);
    expect(roster.find(row => row.id === 'block/AlphaShowcase')).toMatchObject({
      live: true,
      audit: null,
    });
    expect(roster.find(row => row.id === 'page/zeta').audit.score).toBe(81);
    expect(roster.find(row => row.id === 'page/deleted').live).toBe(false);
  });

  it('queues unaudited templates first, then oldest audits, and honours the limit', () => {
    const queue = buildQueue(buildRoster(ledger, templates));
    expect(queue[0]).toMatchObject({
      id: 'block/AlphaShowcase',
      why: 'never audited',
    });
    expect(queue.slice(1, 3).map(row => row.id)).toEqual([
      'page/beta',
      'page/zeta',
    ]);
    expect(buildQueue(buildRoster(ledger, templates), 2)).toHaveLength(2);
  });

  it('summarises coverage, grades, and page/block coverage', () => {
    const stats = buildStats(buildRoster(ledger, templates));
    expect(stats).toMatchObject({
      total: 3,
      audited: 2,
      unaudited: 1,
      percentAudited: expect.closeTo(66.7, 1),
      grades: {A: 0, B: 1, C: 0, D: 1, F: 0},
      byType: {
        page: {total: 2, audited: 2},
        block: {total: 1, audited: 0},
      },
    });
  });
});

describe('commit messages', () => {
  it('names the full id, derived grade, score, and rubric version', () => {
    expect(commitMessage(audit()).subject).toBe(
      'template scores: page/centered-hero B (81.0), rubric 1',
    );
  });

  it('keeps an allowed regression reason in the commit body, not the row schema', () => {
    const row = audit({score: 75, grade: 'B'});
    const message = commitMessage(row, {
      regression: {
        reason: 're-audited after the rubric tightened',
        from: 95,
      },
    });
    expect(message.body).toContain(
      'Regression allowed: re-audited after the rubric tightened',
    );
    expect(message.body).toMatch(/95\.0.*75\.0/s);
    expect(row).not.toHaveProperty('regression');
  });
});

const git = (cwd, ...argv) =>
  execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

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
  } catch (error) {
    return {
      code: error.status ?? 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function identify(directory) {
  git(directory, 'config', 'user.name', 'Template Ledger Test');
  git(directory, 'config', 'user.email', 'template-ledger-test@example.com');
}

function makeWiki(seedLedger) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'template-ledger-wiki-'));
  const bare = path.join(root, 'wiki.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');

  git(root, 'init', '--bare', '--initial-branch=master', bare);
  git(root, 'clone', bare, seed);
  identify(seed);
  fs.writeFileSync(
    path.join(seed, TEMPLATE_LEDGER_FILENAME),
    `${JSON.stringify(seedLedger, null, 2)}\n`,
  );
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'seed');
  git(seed, 'push', 'origin', WIKI_BRANCH);

  git(root, 'clone', '--depth', '1', `file://${bare}`, clone);
  identify(clone);
  return {
    root,
    bare,
    clone,
    ledger: path.join(clone, TEMPLATE_LEDGER_FILENAME),
  };
}

const readLedger = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const remoteLedger = bare =>
  JSON.parse(git(bare, 'show', `${WIKI_BRANCH}:${TEMPLATE_LEDGER_FILENAME}`));

describe('--record', () => {
  it('records an id from stdin into a local ledger', () => {
    const wiki = makeWiki(ledgerWith());
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
      ],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code, result.out).toBe(0);
    expect(readLedger(wiki.ledger).templates).toContainEqual(
      audit({evidence: [{label: 'Rendered audit'}]}),
    );
  });

  it('refuses a score regression and leaves the ledger byte-for-byte unchanged', () => {
    const wiki = makeWiki(ledgerWith(audit({score: 95, grade: 'A'})));
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
      ],
      {input: JSON.stringify(scorecard({score: 75}))},
    );
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/refus|regress|decreas/i);
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it('allows a reasoned regression without adding an out-of-schema field', () => {
    const wiki = makeWiki(ledgerWith(audit({score: 95, grade: 'A'})));
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--allow-regression',
        'rubric tightened after screenshot review',
      ],
      {input: JSON.stringify(scorecard({score: 75}))},
    );
    expect(result.code, result.out).toBe(0);
    const row = readLedger(wiki.ledger).templates[0];
    expect(row).toMatchObject({score: 75, grade: 'B'});
    expect(row).not.toHaveProperty('regression');
  });

  it('rejects a bare --allow-regression because the explanation is required', () => {
    const wiki = makeWiki(ledgerWith(audit({score: 95, grade: 'A'})));
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--allow-regression',
      ],
      {input: JSON.stringify(scorecard({score: 75}))},
    );
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/needs? a reason/i);
  });

  it('--dry-run prints the diff and commit message without changing the file', () => {
    const wiki = makeWiki(ledgerWith());
    const before = fs.readFileSync(wiki.ledger, 'utf8');
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--dry-run',
      ],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code, result.out).toBe(0);
    expect(result.out).toContain('--- a/template-scores.json');
    expect(result.out).toContain('+      "id": "page/centered-hero"');
    expect(result.out).toContain(
      'template scores: page/centered-hero B (81.0), rubric 1',
    );
    expect(result.out).toMatch(/nothing written/i);
    expect(fs.readFileSync(wiki.ledger, 'utf8')).toBe(before);
  });

  it('refuses to create a partial ledger at a nonexistent local path', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'template-ledger-missing-'),
    );
    const ledger = path.join(root, TEMPLATE_LEDGER_FILENAME);
    const result = cli(
      ['--record', 'page/centered-hero', '--from', '-', '--ledger', ledger],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/refusing to create a partial one-row ledger/i);
    expect(fs.existsSync(ledger)).toBe(false);
  });
});

describe('--record --push', () => {
  it('commits and pushes the single ledger file', () => {
    const wiki = makeWiki(ledgerWith());
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--push',
      ],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code, result.out).toBe(0);
    expect(remoteLedger(wiki.bare).templates.map(row => row.id)).toEqual([
      'page/centered-hero',
    ]);
    expect(git(wiki.clone, 'log', '-1', '--format=%s')).toBe(
      'template scores: page/centered-hero B (81.0), rubric 1',
    );
  });

  it('refuses to commit without a configured git identity', () => {
    const wiki = makeWiki(ledgerWith());
    git(wiki.clone, 'config', '--unset', 'user.name');
    git(wiki.clone, 'config', '--unset', 'user.email');
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--push',
      ],
      {
        input: JSON.stringify(scorecard()),
        env: {GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null'},
      },
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain('no git identity');
  });

  it('refuses to sweep unrelated wiki changes into the ledger commit', () => {
    const wiki = makeWiki(ledgerWith());
    fs.writeFileSync(
      path.join(wiki.clone, 'Home.md'),
      'unfinished wiki edit\n',
    );
    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--push',
      ],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain('unrelated changes');
  });

  it('re-applies onto the winner and preserves both records after a push race', () => {
    const wiki = makeWiki(ledgerWith());
    const competing = ledgerWith(
      audit({
        id: 'block/PowerSearchShowcase',
        score: 92,
        grade: 'A',
        lastAudited: '2026-08-10',
      }),
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
        `blob=$(git hash-object -w -- ${JSON.stringify(competingFile).slice(1, -1)})`,
        'git read-tree master',
        'git update-index --add --cacheinfo 100644,$blob,template-scores.json',
        'tree=$(git write-tree)',
        'commit=$(git commit-tree $tree -p master -m "template scores: block/PowerSearchShowcase A (92.0), rubric 1")',
        'git update-ref refs/heads/master $commit',
        'echo "rejected: non-fast-forward (simulated race)" >&2',
        'exit 1',
      ].join('\n'),
    );
    fs.chmodSync(hook, 0o755);

    const result = cli(
      [
        '--record',
        'page/centered-hero',
        '--from',
        '-',
        '--ledger',
        wiki.ledger,
        '--push',
      ],
      {input: JSON.stringify(scorecard())},
    );
    expect(result.code, result.out).toBe(0);
    expect(result.out).toMatch(/retrying once|re-applying/i);
    expect(
      remoteLedger(wiki.bare)
        .templates.map(row => row.id)
        .sort(),
    ).toEqual(['block/PowerSearchShowcase', 'page/centered-hero']);
  });
});
