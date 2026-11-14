// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for inherited-shots.mjs: which changed visual shots came from
 * main, and what a shot says when the record does not prove it.
 */

import {describe, expect, it} from 'vitest';

import {
  MAX_CALLS,
  changedImages,
  lookupSummary,
  markInherited,
} from './inherited-shots.mjs';

const H = c => c.repeat(64);
const S = c => c.repeat(40);
const KEY = 'core-bottomsheet--text-only__neutral-dark';
const OTHER = 'core-button--default__neutral-light';
const HEAD = S('e');
const BASE = S('b');

/** A report whose run captured `shots` ({key: hash}) and changed `changed` keys. */
const report = (shots, changed) => ({
  verdict: {changes: changed.map(key => ({key, diffPixels: 100}))},
  manifest: {
    shots: Object.fromEntries(
      Object.entries(shots).map(([k, h]) => [k, {sha256: h}]),
    ),
  },
});

/** This run's verdict and manifest: two changed shots, tested on BASE. */
const mine = () => {
  const {verdict, manifest} = report({[KEY]: H('a'), [OTHER]: H('b')}, [
    KEY,
    OTHER,
  ]);
  verdict.context = {baseSha: BASE};
  return {verdict, manifest};
};

/**
 * Fake GitHub reads that count every call. `pulls` maps a head commit to its
 * pull request; `ancestry` lists "ancestor>descendant" pairs that hold.
 */
function fakeGitHub({reports, contents = {}, pulls = {}, ancestry = []}) {
  const calls = {list: 0, read: 0, pull: 0, compare: 0};
  return {
    calls,
    total: () => calls.list + calls.read + calls.pull + calls.compare,
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
    contains: async (ancestor, descendant) => {
      calls.compare += 1;
      return ancestry.includes(`${ancestor}>${descendant}`);
    },
  };
}

const merged = mergeSha => ({
  number: 8558,
  mergedAt: '2026-11-08T13:15:00Z',
  mergeSha,
});
const one = {
  id: 1,
  createdAt: '2026-11-12T10:00:00Z',
  headRef: 'other',
  headSha: S('1'),
};

describe('inherited visual changes', () => {
  it('reads only well-formed image hashes of changed shots', () => {
    expect([
      ...changedImages(
        report({[KEY]: H('a'), [OTHER]: 'not-a-hash'}, [KEY, OTHER]),
      ),
    ]).toEqual([[KEY, H('a')]]);
  });

  it('says a shot came from main when a merged pull request showed the same image and its merge commit is in the tested base', async () => {
    const gh = fakeGitHub({
      reports: [one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: merged(S('c'))},
      ancestry: [`${S('c')}>${BASE}`],
    });
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(verdict.changes.find(c => c.key === KEY).inherited).toEqual({
      from: 'main',
    });
    expect(verdict.changes.find(c => c.key === OTHER).inherited).toEqual({
      found: false,
    });
    expect(verdict.inheritedChecked).toBe(1);
  });

  it('does not count a stacked or superseding branch whose head contains this one', async () => {
    const gh = fakeGitHub({
      reports: [one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: merged(S('c'))},
      ancestry: [`${S('c')}>${BASE}`, `${HEAD}>${S('1')}`],
    });
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    // Found with the same image, but not proven from main.
    expect(verdict.changes[0].inherited).toEqual({found: true});
  });

  it('does not count an unmerged pull request', async () => {
    const gh = fakeGitHub({
      reports: [one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: {number: 9, mergedAt: null, mergeSha: S('c')}},
      ancestry: [`${S('c')}>${BASE}`],
    });
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(verdict.changes[0].inherited).toEqual({found: true});
    expect(gh.calls.compare).toBe(0);
  });

  it('does not count a pull request merged after the base this run tested', async () => {
    const gh = fakeGitHub({
      reports: [one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: merged(S('c'))},
      ancestry: [],
    });
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(verdict.changes[0].inherited).toEqual({found: true});
  });

  it('says not found, never introduced here, when no report shows the same image, and does not count this pull request’s own runs', async () => {
    const gh = fakeGitHub({
      reports: [
        {
          id: 2,
          createdAt: '2026-11-12T10:00:00Z',
          headRef: 'this',
          headSha: HEAD,
        },
        {...one, id: 1},
      ],
      contents: {
        1: report({[KEY]: H('c')}, [KEY]),
        2: report({[KEY]: H('a')}, [KEY]),
      },
    });
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(verdict.changes.map(change => change.inherited)).toEqual([
      {found: false},
      {found: false},
    ]);
    expect(verdict.inheritedChecked).toBe(1);
    expect(gh.calls.pull).toBe(0);
  });

  it(`spends at most ${MAX_CALLS} API calls, and records how many reports it read`, async () => {
    const reports = Array.from({length: 60}, (_, i) => ({
      id: i,
      createdAt: `2026-11-13T00:${String(i).padStart(2, '0')}:00Z`,
      headRef: `branch-${i}`,
      headSha: S(String(i % 10)),
    }));
    const contents = Object.fromEntries(
      reports.map(r => [r.id, report({[KEY]: H('a')}, [KEY])]),
    );
    const pulls = Object.fromEntries(
      reports.map(r => [
        r.headSha,
        {number: 1, mergedAt: null, mergeSha: null},
      ]),
    );
    const gh = fakeGitHub({reports, contents, pulls});
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(gh.total()).toBeLessThanOrEqual(MAX_CALLS);
    expect(verdict.inheritedChecked).toBe(gh.calls.read);
    expect(verdict.changes[0].inherited).toEqual({found: true});
  });

  it('makes a failed lookup visible: it marks nothing and records the reason for the comment and the step summary', async () => {
    const gh = fakeGitHub({reports: [one]});
    const readReport = async () => {
      throw new Error('/actions/artifacts/1/zip: HTTP 502\nretry');
    };
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
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

  it('records a failed artifact list, and a report without a base commit, the same way', async () => {
    const list = mine();
    await markInherited({
      ...list,
      headRef: 'this',
      headSha: HEAD,
      ...fakeGitHub({reports: []}),
      listReports: async () => {
        throw new Error('HTTP 403');
      },
    });
    expect(list.verdict.inheritedLookupFailed).toBe('HTTP 403');
    const noBase = mine();
    delete noBase.verdict.context;
    await markInherited({
      ...noBase,
      headRef: 'this',
      headSha: HEAD,
      ...fakeGitHub({reports: []}),
    });
    expect(noBase.verdict.inheritedLookupFailed).toBe(
      'the report records no base commit',
    );
  });

  it('treats a head it cannot compare as containing this one, so it never proves the shot', async () => {
    const gh = fakeGitHub({
      reports: [one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: merged(S('c'))},
      ancestry: [`${S('c')}>${BASE}`],
    });
    const contains = async (ancestor, descendant) =>
      ancestor === HEAD ? null : gh.contains(ancestor, descendant);
    const {verdict, manifest} = mine();
    await markInherited({
      verdict,
      manifest,
      headRef: 'this',
      headSha: HEAD,
      ...gh,
      contains,
    });
    expect(verdict.changes[0].inherited).toEqual({found: true});
  });

  it('reads past one unreadable report, and fails visibly only when none could be opened', async () => {
    const two = {...one, id: 2, headRef: 'two', headSha: S('2')};
    const some = fakeGitHub({
      reports: [two, one],
      contents: {1: report({[KEY]: H('a')}, [KEY])},
      pulls: {[S('1')]: merged(S('c'))},
      ancestry: [`${S('c')}>${BASE}`],
    });
    const first = mine();
    await markInherited({...first, headRef: 'this', headSha: HEAD, ...some});
    expect(first.verdict.inheritedLookupFailed).toBeUndefined();
    expect(first.verdict.changes[0].inherited).toEqual({from: 'main'});
    const none = fakeGitHub({reports: [two, one]});
    const second = mine();
    await markInherited({...second, headRef: 'this', headSha: HEAD, ...none});
    expect(second.verdict.inheritedLookupFailed).toBe(
      'none of the 2 reports read could be opened',
    );
  });

  it('makes no call when nothing changed', async () => {
    const gh = fakeGitHub({reports: []});
    const verdict = {changes: [], context: {baseSha: BASE}};
    await markInherited({
      verdict,
      manifest: {shots: {}},
      headRef: 'this',
      headSha: HEAD,
      ...gh,
    });
    expect(gh.total()).toBe(0);
  });
});
