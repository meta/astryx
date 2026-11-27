// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for RTL verified-N/A receipt drift.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {buildComponentCoverage} from '../../apps/storybook/rtl-audit/rtl-audit-coverage.mjs';
import {
  fileReceipt,
  receiptDrift,
} from '../../apps/storybook/rtl-audit/verified-na-receipts.mjs';

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function checkout(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-receipts-'));
  dirs.push(root);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

const receiptOf = content =>
  `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;

describe('fileReceipt', () => {
  it('hashes a file, and answers null for a missing one', () => {
    const root = checkout({'packages/core/src/Dot/Dot.tsx': 'dot'});
    expect(fileReceipt(root, 'packages/core/src/Dot/Dot.tsx')).toBe(
      receiptOf('dot'),
    );
    expect(fileReceipt(root, 'packages/core/src/Dot/Gone.tsx')).toBeNull();
  });

  it('refuses a path that leaves the repository', () => {
    const root = checkout({'a.txt': 'a'});
    expect(() => fileReceipt(root, '../outside.txt')).toThrow(
      /leaves the repository/,
    );
  });
});

describe('receiptDrift', () => {
  const files = {
    'packages/core/src/Dot/Dot.tsx': 'dot source',
    'apps/storybook/stories/Dot.stories.tsx': 'dot stories',
  };

  it('reports nothing when every receipt matches', () => {
    const root = checkout(files);
    const drift = receiptDrift({
      projectRoot: root,
      verifiedNa: [
        {
          component: 'core/Dot',
          reason: 'r',
          evidence: Object.fromEntries(
            Object.entries(files).map(([file, content]) => [
              file,
              receiptOf(content),
            ]),
          ),
        },
      ],
    });
    expect(drift).toEqual({checked: 1, withoutEvidence: 0, drifted: []});
  });

  it('separates changed, missing and malformed receipts', () => {
    const root = checkout(files);
    const drift = receiptDrift({
      projectRoot: root,
      verifiedNa: [
        {
          component: 'core/Dot',
          reason: 'r',
          evidence: {
            'packages/core/src/Dot/Dot.tsx': receiptOf('older source'),
            'packages/core/src/Dot/index.ts': receiptOf('index'),
            'apps/storybook/stories/Dot.stories.tsx': 'sha256:short',
            '../outside.tsx': receiptOf('x'),
          },
        },
        {component: 'core/Plain', reason: 'r'},
        {component: 'core/Odd', reason: 'r', evidence: ['not', 'a', 'map']},
      ],
    });
    expect(drift.checked).toBe(2);
    expect(drift.withoutEvidence).toBe(1);
    expect(drift.drifted).toEqual([
      {
        component: 'core/Dot',
        changed: ['packages/core/src/Dot/Dot.tsx'],
        missing: ['packages/core/src/Dot/index.ts'],
        malformed: ['apps/storybook/stories/Dot.stories.tsx', '../outside.tsx'],
      },
      {
        component: 'core/Odd',
        changed: [],
        missing: [],
        malformed: ['evidence is not a path-to-receipt map'],
      },
    ]);
  });

  it('checks only the components in scope, case-insensitively', () => {
    const root = checkout(files);
    const verifiedNa = [
      {component: 'core/Dot', reason: 'r', evidence: {'a.tsx': receiptOf('a')}},
      {
        component: 'core/Other',
        reason: 'r',
        evidence: {'b.tsx': receiptOf('b')},
      },
    ];
    const drift = receiptDrift({
      projectRoot: root,
      verifiedNa,
      components: ['core/DOT'],
    });
    expect(drift.checked).toBe(1);
    expect(drift.drifted.map(entry => entry.component)).toEqual(['core/Dot']);
  });

  it('reports a malformed receipt without changing coverage status', () => {
    const root = checkout(files);
    const verifiedNa = [
      {
        component: 'core/Dot',
        reason: 'One clipped element with no direction-sensitive behavior.',
        evidence: {'packages/core/src/Dot/Dot.tsx': 'not-a-receipt'},
      },
    ];
    const coverage = buildComponentCoverage({
      components: ['core/Dot'],
      verifiedNa,
    });
    const drift = receiptDrift({
      projectRoot: root,
      verifiedNa,
      components: ['core/Dot'],
    });
    expect(coverage.results[0].status).toBe('verified-na');
    expect(drift.drifted).toEqual([
      {
        component: 'core/Dot',
        changed: [],
        missing: [],
        malformed: ['packages/core/src/Dot/Dot.tsx'],
      },
    ]);
  });
});

describe('receiptDrift on an unreadable registry shape', () => {
  it('skips entries it cannot read instead of throwing', () => {
    const root = checkout({});
    for (const verifiedNa of [null, {}, [null, 5, {component: 7}]]) {
      expect(receiptDrift({projectRoot: root, verifiedNa})).toEqual({
        checked: 0,
        withoutEvidence: 0,
        drifted: [],
      });
    }
  });
});

describe('RTL scorecard receipt drift section', () => {
  const SCRIPT = path.resolve('.github/scripts/rtl-scorecard-summary.mjs');

  function summarize(receiptDriftSection) {
    const dir = checkout({});
    const reportPath = path.join(dir, 'report.json');
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        autoDiscovery: {
          total: 0,
          pass: 0,
          fail: 0,
          na: 0,
          surprises: [],
          results: [],
        },
        curated: {results: []},
        receiptDrift: receiptDriftSection,
      }),
    );
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--report', reportPath, '--scope', 'core/Dot'],
      {encoding: 'utf8'},
    );
    expect(result.status).toBe(0);
    return result.stdout;
  }

  it('lists drifted declarations without changing coverage', () => {
    const out = summarize({
      checked: 2,
      withoutEvidence: 0,
      drifted: [
        {
          component: 'core/Dot',
          changed: ['packages/core/src/Dot/Dot.tsx'],
          missing: [],
          malformed: [],
        },
      ],
    });
    expect(out).toContain('### Receipt drift (informational)');
    expect(out).toContain('1 of 2 receipted verified-N/A declarations');
    expect(out).toContain('| core/Dot | packages/core/src/Dot/Dot.tsx |  |  |');
  });

  it('omits the section when nothing drifted', () => {
    expect(
      summarize({checked: 1, withoutEvidence: 0, drifted: []}),
    ).not.toContain('Receipt drift');
  });
});
