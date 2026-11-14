// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for inherited-shots.mjs: which changed visual shots another
 * pull request's run also showed, and when the record names the introducer.
 */

import {describe, expect, it} from 'vitest';

import {
  MAX_CALLS,
  changedImages,
  lookupSummary,
  markInherited,
} from './inherited-shots.mjs';

const H = c => c.repeat(64);
const KEY = 'core-bottomsheet--text-only__neutral-dark';
const OTHER = 'core-button--default__neutral-light';

/** A report whose run captured `shots` ({key: hash}) and changed `changed` keys. */
const report = (shots, changed) => ({
  verdict: {changes: changed.map(key => ({key, diffPixels: 100}))},
  manifest: {
    shots: Object.fromEntries(
      Object.entries(shots).map(([k, h]) => [k, {sha256: h}]),
    ),
  },
});

/** Fake GitHub reads that count every call. */
function fakeGitHub({reports, contents, pulls}) {
  const calls = {list: 0, read: 0, pull: 0};
  return {
    calls,
    total: () => calls.list + calls.read + calls.pull,
    listReports: async () => {
      calls.list += 1;
      return reports;
    },
    readReport: async id => {
      calls.read += 1;
      return contents[id] ?? null;
    },
    pullFor: async sha => {
      calls.pull += 1;
      return pulls[sha] ?? null;
    },
  };
}

const mine = () => report({[KEY]: H('a'), [OTHER]: H('b')}, [KEY, OTHER]);

describe('inherited visual changes', () => {
  it('reads only well-formed image hashes of changed shots', () => {
    expect([
      ...changedImages(
        report({[KEY]: H('a'), [OTHER]: 'not-a-hash'}, [KEY, OTHER]),
      ),
    ]).toEqual([[KEY, H('a')]]);
  });

  it('names the introducer when its run showed the change, it merged before every other run that showed it, and a run before its merge had the shot unchanged', async () => {
    const gh = fakeGitHub({
      reports: [
        {
          id: 3,
          createdAt: '2026-11-12T10:00:00Z',
          headRef: 'later',
          headSha: 'c3',
        },
        {
          id: 2,
          createdAt: '2026-11-08T12:00:00Z',
          headRef: 'witness',
          headSha: 'c2',
        },
        {
          id: 1,
          createdAt: '2026-11-08T11:00:00Z',
          headRef: 'introducer',
          headSha: 'c1',
        },
      ],
      contents: {
        1: report({[KEY]: H('a')}, [KEY]),
        2: report({[KEY]: H('0')}, []),
        3: report({[KEY]: H('a')}, [KEY]),
      },
      pulls: {c1: {number: 8558, mergedAt: '2026-11-08T13:15:00Z'}},
    });
    const {verdict, manifest} = mine();
    await markInherited({verdict, manifest, headRef: 'this', ...gh});
    expect(verdict.changes.find(c => c.key === KEY).inherited).toEqual({
      pr: 8558,
    });
    expect(
      verdict.changes.find(c => c.key === OTHER).inherited,
    ).toBeUndefined();
  });

  it('says the introducer is not recorded when no run had the shot unchanged before that merge', async () => {
    const gh = fakeGitHub({
      reports: [
        {
          id: 3,
          createdAt: '2026-11-12T10:00:00Z',
          headRef: 'later',
          headSha: 'c3',
        },
        {
          id: 1,
          createdAt: '2026-11-08T11:00:00Z',
          headRef: 'first',
          headSha: 'c1',
        },
      ],
      contents: {
        1: report({[KEY]: H('a')}, [KEY]),
        3: report({[KEY]: H('a')}, [KEY]),
      },
      pulls: {c1: {number: 10767, mergedAt: '2026-11-09T10:23:00Z'}},
    });
    const {verdict, manifest} = mine();
    await markInherited({verdict, manifest, headRef: 'this', ...gh});
    expect(verdict.changes[0].inherited).toEqual({pr: null});
  });

  it('never names a pull request that only inherited the change (the introducer skipped its visual check)', async () => {
    // The earliest report is an inheritor's; another inheritor's run showed the
    // change before that one merged, so it cannot have introduced it.
    const gh = fakeGitHub({
      reports: [
        {
          id: 2,
          createdAt: '2026-11-09T09:00:00Z',
          headRef: 'second',
          headSha: 'c2',
        },
        {
          id: 1,
          createdAt: '2026-11-09T08:00:00Z',
          headRef: 'first',
          headSha: 'c1',
        },
      ],
      contents: {
        1: report({[KEY]: H('a')}, [KEY]),
        2: report({[KEY]: H('a')}, [KEY]),
      },
      pulls: {c1: {number: 10767, mergedAt: '2026-11-09T10:23:00Z'}},
    });
    const {verdict, manifest} = mine();
    await markInherited({verdict, manifest, headRef: 'this', ...gh});
    expect(verdict.changes[0].inherited).toEqual({pr: null});
  });

  it('does not mark a shot whose image differs from every other run, nor count this pull request’s own runs', async () => {
    const gh = fakeGitHub({
      reports: [
        {
          id: 2,
          createdAt: '2026-11-12T10:00:00Z',
          headRef: 'this',
          headSha: 'own',
        },
        {
          id: 1,
          createdAt: '2026-11-11T10:00:00Z',
          headRef: 'other',
          headSha: 'c1',
        },
      ],
      contents: {
        1: report({[KEY]: H('c')}, [KEY]),
        2: report({[KEY]: H('a')}, [KEY]),
      },
      pulls: {},
    });
    const {verdict, manifest} = mine();
    await markInherited({verdict, manifest, headRef: 'this', ...gh});
    expect(
      verdict.changes.every(change => change.inherited === undefined),
    ).toBe(true);
    expect(verdict.inheritedNotChecked).toBeUndefined();
    expect(gh.calls.read).toBe(1);
  });

  it(`spends at most ${MAX_CALLS} API calls, and counts the shots it could not check`, async () => {
    const reports = Array.from({length: 60}, (_, i) => ({
      id: i,
      createdAt: `2026-11-1${String(i).padStart(2, '0')}T00:00:00Z`,
      headRef: `branch-${i}`,
      headSha: `c${i}`,
    }));
    const contents = Object.fromEntries(
      reports.map(r => [r.id, report({}, [])]),
    );
    const gh = fakeGitHub({reports, contents, pulls: {}});
    const {verdict, manifest} = mine();
    await markInherited({verdict, manifest, headRef: 'this', ...gh});
    expect(gh.total()).toBeLessThanOrEqual(MAX_CALLS);
    expect(verdict.inheritedNotChecked).toBe(2);
  });

  it('makes a failed lookup visible: it marks nothing and records the reason for the comment and the step summary', async () => {
    const gh = fakeGitHub({
      reports: [
        {id: 2, createdAt: '2026-11-12T10:00:00Z', headRef: 'b', headSha: 'c2'},
        {id: 1, createdAt: '2026-11-11T10:00:00Z', headRef: 'a', headSha: 'c1'},
      ],
      contents: {2: report({[KEY]: H('a')}, [KEY])},
      pulls: {},
    });
    const readReport = async id => {
      if (id === 1)
        throw new Error('/actions/artifacts/1/zip: HTTP 502\nretry');
      return gh.readReport(id);
    };
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      ...gh,
      readReport,
    });
    expect(verdict.inheritedLookupFailed).toBe(
      '/actions/artifacts/1/zip: HTTP 502 retry',
    );
    expect(
      verdict.changes.every(change => change.inherited === undefined),
    ).toBe(true);
    expect(lookupSummary(verdict)).toBe(
      'inheritance lookup failed: /actions/artifacts/1/zip: HTTP 502 retry\n',
    );
  });

  it('records a failed artifact list the same way', async () => {
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      listReports: async () => {
        throw new Error('HTTP 403');
      },
      readReport: async () => null,
      pullFor: async () => null,
    });
    expect(verdict.inheritedLookupFailed).toBe('HTTP 403');
  });

  it('makes no call when nothing changed', async () => {
    const gh = fakeGitHub({reports: [], contents: {}, pulls: {}});
    const verdict = {changes: []};
    await markInherited({
      verdict,
      manifest: {shots: {}},
      headRef: 'this',
      ...gh,
    });
    expect(gh.total()).toBe(0);
  });
});
