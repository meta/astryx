// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Multi-selector component lookup contract: one ordered batch envelope,
 * complete per-selector states, unchanged single-selector responses, and matching
 * text/JSON exit behavior.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {
  component,
  COMPONENT_BATCH_SELECTOR_LIMIT,
} from '../../../api/component/component.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const SLOW = 60_000;

describe('component() batch lookup', () => {
  it(
    'keeps one found row per selector, in order, including duplicates',
    async () => {
      const result = await component(['Button', 'Badge', 'Button'], {
        cwd: REPO_ROOT,
        detail: 'brief',
      });

      expect(result.type).toBe('component.batch');
      expect(result.data.count).toBe(3);
      expect(result.data.results.map(row => row.selector)).toEqual([
        'Button',
        'Badge',
        'Button',
      ]);
      expect(result.data.results.map(row => row.status)).toEqual([
        'found',
        'found',
        'found',
      ]);
      expect(
        result.data.results.map(row =>
          row.status === 'found' ? row.result.type : null,
        ),
      ).toEqual(['component.detail', 'component.detail', 'component.detail']);
    },
    SLOW,
  );

  it(
    'applies every focused projection to each found row',
    async () => {
      const projections = [
        {options: {props: true}, expectedType: 'component.detail.props'},
        {options: {source: true}, expectedType: 'component.detail.source'},
        {options: {showcase: true}, expectedType: 'component.detail.showcase'},
        {options: {blocks: true}, expectedType: 'component.detail.blocks'},
      ];
      for (const projection of projections) {
        const result = await component(['Button', 'Card'], {
          cwd: REPO_ROOT,
          ...projection.options,
        });
        expect(result.type).toBe('component.batch');
        expect(
          result.data.results.map(row =>
            row.status === 'found' ? row.result.type : null,
          ),
        ).toEqual([projection.expectedType, projection.expectedType]);
      }
    },
    SLOW,
  );

  it(
    'uses input shape to distinguish catalog, single, and batch calls',
    async () => {
      expect((await component(undefined, {cwd: REPO_ROOT})).type).toBe(
        'component.list',
      );
      expect((await component('Button', {cwd: REPO_ROOT})).type).toBe(
        'component.detail',
      );

      const emptyBatch = await component([], {cwd: REPO_ROOT});
      expect(emptyBatch).toEqual({
        type: 'component.batch',
        data: {count: 0, results: []},
      });
      expect(
        await component([], {
          cwd: REPO_ROOT,
          list: true,
          category: 'Form',
        }),
      ).toEqual(emptyBatch);

      const oneRowBatch = await component(['Button'], {
        cwd: REPO_ROOT,
        detail: 'brief',
      });
      expect(oneRowBatch).toMatchObject({
        type: 'component.batch',
        data: {
          count: 1,
          results: [
            {
              selector: 'Button',
              status: 'found',
              result: {type: 'component.detail'},
            },
          ],
        },
      });
    },
    SLOW,
  );

  it('rejects an oversized array before component resolution starts', async () => {
    const selectors = Array.from(
      {length: COMPONENT_BATCH_SELECTOR_LIMIT + 1},
      () => 'Button',
    );
    await expect(
      component(selectors, {
        cwd: path.join(REPO_ROOT, 'missing-batch-cwd'),
      }),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: `Component batch accepts at most ${COMPONENT_BATCH_SELECTOR_LIMIT} selectors; received ${selectors.length}`,
    });
  });

  it(
    'keeps receipt invariants across a deterministic selector chaos matrix',
    async () => {
      const found = new Set(['Button', 'Card']);
      const selectorCases = [
        [],
        ['Button'],
        ['ZzzNope99'],
        ['Button', 'Button'],
        ['ZzzNope98', 'ZzzNope99'],
        ['Button', 'ZzzNope99', 'Card'],
        ['ZzzNope99', 'Button', 'ZzzNope99', 'Button'],
        ['Card', 'Button', 'Card', 'ZzzNope98', 'Button'],
      ];

      for (const selectors of selectorCases) {
        const result = await component(selectors, {
          cwd: REPO_ROOT,
          detail: 'brief',
        });
        expect(result.type).toBe('component.batch');
        expect(result.data.count).toBe(selectors.length);
        expect(result.data.results.map(row => row.selector)).toEqual(selectors);
        expect(result.data.results.map(row => row.status)).toEqual(
          selectors.map(selector =>
            found.has(selector) ? 'found' : 'not_found',
          ),
        );
        for (const row of result.data.results) {
          if (row.status === 'found') {
            expect(row.result.type).toBe('component.detail');
          } else {
            expect(row.code).toBe('ERR_UNKNOWN_COMPONENT');
          }
        }
      }
    },
    SLOW,
  );

  it(
    'composes every detail and language control over a batch',
    async () => {
      /** @type {Array<{detail?: 'full'|'compact'|'brief'; lang?: string; zh?: boolean; dense?: boolean}>} */
      const controls = [
        {detail: 'brief'},
        {detail: 'compact'},
        {detail: 'full'},
        {lang: 'en'},
        {lang: 'dense'},
        {zh: true},
        {dense: true},
      ];
      for (const control of controls) {
        const result = await component(['Button', 'Card'], {
          cwd: REPO_ROOT,
          ...control,
        });
        expect(result.type).toBe('component.batch');
        expect(result.data.results).toHaveLength(2);
        expect(
          result.data.results.every(
            row =>
              row.status === 'found' && row.result.type === 'component.detail',
          ),
        ).toBe(true);
      }
    },
    SLOW,
  );
});

describe('astryx component batch lookup', () => {
  it('documents variadic selector grammar in --help', async () => {
    const run = await runCli(['component', '--help'], REPO_ROOT);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain(
      'Usage: astryx component [options] [names...]',
    );
    expect(run.stdout).toContain('@scope/package@version/Name');
    expect(run.stdout).toContain('Two or more return one ordered batch');
    expect(run.stdout).toContain('At most 100 selectors');
  });

  it(
    'keeps catalog and single-result CLI envelopes at zero and one selectors',
    async () => {
      const catalog = await runCli(['--json', 'component'], REPO_ROOT);
      expect(catalog.code).toBe(0);
      expect(JSON.parse(catalog.stdout).type).toBe('component.list');

      const single = await runCli(
        ['--json', '--detail', 'brief', 'component', 'Button'],
        REPO_ROOT,
      );
      expect(single.code).toBe(0);
      expect(JSON.parse(single.stdout).type).toBe('component.detail');
    },
    SLOW,
  );

  it(
    'emits one component.batch JSON envelope for several found selectors',
    async () => {
      const run = await runCli(
        ['--json', '--detail', 'brief', 'component', 'Button', 'Badge'],
        REPO_ROOT,
      );
      expect(run.code).toBe(0);
      const envelope = JSON.parse(run.stdout);
      expect(envelope.type).toBe('component.batch');
      expect(envelope.data.count).toBe(2);
      expect(envelope.data.results.map(row => row.selector)).toEqual([
        'Button',
        'Badge',
      ]);
      expect(envelope.data.results.every(row => row.status === 'found')).toBe(
        true,
      );
    },
    SLOW,
  );

  it(
    'rejects an oversized batch before emitting JSON or text results',
    async () => {
      const selectors = Array.from(
        {length: COMPONENT_BATCH_SELECTOR_LIMIT + 1},
        () => 'Button',
      );
      const json = await runCli(
        ['--json', 'component', ...selectors],
        REPO_ROOT,
      );
      expect(json.code).toBe(1);
      expect(JSON.parse(json.stdout)).toMatchObject({
        code: 'ERR_INVALID_ARGUMENT',
        error: `Component batch accepts at most ${COMPONENT_BATCH_SELECTOR_LIMIT} selectors; received ${selectors.length}`,
      });
      expect(JSON.parse(json.stdout).type).toBeUndefined();

      const text = await runCli(['component', ...selectors], REPO_ROOT);
      expect(text.code).toBe(1);
      expect(text.stdout + text.stderr).toContain(
        `accepts at most ${COMPONENT_BATCH_SELECTOR_LIMIT} selectors`,
      );
    },
    SLOW,
  );

  it(
    'emits every row and exits 1 when one selector is not found',
    async () => {
      const run = await runCli(
        ['--json', '--detail', 'brief', 'component', 'Button', 'ZzzNope99'],
        REPO_ROOT,
      );
      expect(run.code).toBe(1);
      const envelope = JSON.parse(run.stdout);
      expect(envelope.type).toBe('component.batch');
      expect(envelope.data.results).toMatchObject([
        {selector: 'Button', status: 'found'},
        {
          selector: 'ZzzNope99',
          status: 'not_found',
          code: 'ERR_UNKNOWN_COMPONENT',
        },
      ]);
    },
    SLOW,
  );

  it(
    'emits every failed row and exits 1 when no selector resolves',
    async () => {
      const run = await runCli(
        ['--json', 'component', 'ZzzNope98', 'ZzzNope99'],
        REPO_ROOT,
      );
      expect(run.code).toBe(1);
      const envelope = JSON.parse(run.stdout);
      expect(envelope.type).toBe('component.batch');
      expect(envelope.data.count).toBe(2);
      expect(envelope.data.results).toMatchObject([
        {selector: 'ZzzNope98', status: 'not_found'},
        {selector: 'ZzzNope99', status: 'not_found'},
      ]);
    },
    SLOW,
  );

  it(
    'projects every row in text and keeps the same failing exit status',
    async () => {
      const run = await runCli(
        ['--detail', 'brief', 'component', 'Button', 'ZzzNope99'],
        REPO_ROOT,
      );
      expect(run.code).toBe(1);
      expect(run.stdout).toContain('count: 2');
      expect(run.stdout).toMatch(/selector: Button\nstatus:\s+found/);
      expect(run.stdout).toMatch(
        /selector: ZzzNope99\nstatus:\s+not_found\ncode:\s+ERR_UNKNOWN_COMPONENT/,
      );
    },
    SLOW,
  );
});
