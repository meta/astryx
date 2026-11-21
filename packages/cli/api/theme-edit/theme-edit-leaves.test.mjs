// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme-edit leaves are thin: each public function hands its
 * arguments to the adapter unchanged, defaults `options` to an empty object,
 * and returns the adapter's answer (or its failure) untouched. The work is
 * tested through the adapter; this checks the wiring, and that
 * `theme-edit.mjs` re-exports every leaf.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

const adapter = vi.hoisted(() => ({
  themeEditNew: vi.fn(),
  themeEditSet: vi.fn(),
  themeEditUndo: vi.fn(),
  themeEditShow: vi.fn(),
  themeEditPreviewAdd: vi.fn(),
  themeEditPreviewApp: vi.fn(),
  themeEditPreviewList: vi.fn(),
  themeEditPreviewRemove: vi.fn(),
  themeEditHow: vi.fn(),
  parsePoints: vi.fn(),
}));

vi.mock('./_adapter.mjs', () => adapter);

const api = await import('./theme-edit.mjs');

beforeEach(() => {
  for (const fn of Object.values(adapter)) {
    fn.mockReset();
    fn.mockResolvedValue({type: 'stub', data: {}});
  }
});

/**
 * Each leaf: its exported name, the arguments a caller passes, and which of
 * those arguments is the options bag that defaults to `{}` when omitted.
 * @type {Array<{name: keyof typeof adapter, args: unknown[], optionsAt: number}>}
 */
const LEAVES = [
  {name: 'themeEditNew', args: ['brand'], optionsAt: 1},
  {name: 'themeEditSet', args: ['brand', 'corners', 'pill'], optionsAt: 3},
  {name: 'themeEditUndo', args: ['brand'], optionsAt: 1},
  {name: 'themeEditShow', args: ['brand'], optionsAt: 1},
  {name: 'themeEditPreviewAdd', args: ['a sales dashboard'], optionsAt: 1},
  {name: 'themeEditPreviewApp', args: ['theme-app'], optionsAt: 1},
  {name: 'themeEditPreviewRemove', args: ['components'], optionsAt: 1},
  {name: 'themeEditHow', args: ['banner'], optionsAt: 1},
];

describe('theme-edit leaves', () => {
  for (const {name, args, optionsAt} of LEAVES) {
    describe(name, () => {
      const leaf = /** @type {(...a: unknown[]) => Promise<unknown>} */ (
        /** @type {any} */ (api)[name]
      );

      it('defaults the options to an empty object', async () => {
        await leaf(...args);
        expect(adapter[name]).toHaveBeenCalledTimes(1);
        expect(adapter[name]).toHaveBeenCalledWith(
          ...args,
          ...Array(optionsAt - args.length).fill(undefined),
          {},
        );
      });

      it("passes the caller's options through untouched", async () => {
        const options = {cwd: '/somewhere', json: true};
        await leaf(
          ...args,
          ...Array(optionsAt - args.length).fill(undefined),
          options,
        );
        const call = adapter[name].mock.calls[0];
        expect(call[optionsAt]).toBe(options);
        expect(call.slice(0, args.length)).toEqual(args);
      });

      it("returns the adapter's response as is", async () => {
        const response = {type: `${name}.result`, data: {ok: true}};
        adapter[name].mockResolvedValueOnce(response);
        await expect(leaf(...args)).resolves.toBe(response);
      });

      it("lets the adapter's failure through", async () => {
        const failure = new Error('refused');
        adapter[name].mockRejectedValueOnce(failure);
        await expect(leaf(...args)).rejects.toBe(failure);
      });
    });
  }

  describe('themeEditUndo', () => {
    it('forwards `thing` so one setting can be undone', async () => {
      await api.themeEditUndo('brand', {thing: 'corners'});
      expect(adapter.themeEditUndo).toHaveBeenCalledWith('brand', {
        thing: 'corners',
      });
    });
  });

  describe('themeEditPreviewList', () => {
    it('has no subject: only the options, defaulting to {}', async () => {
      await api.themeEditPreviewList();
      expect(adapter.themeEditPreviewList).toHaveBeenCalledWith({});
      const options = {cwd: '/somewhere'};
      await api.themeEditPreviewList(options);
      expect(adapter.themeEditPreviewList.mock.calls[1][0]).toBe(options);
    });
  });

  describe('themeEditPreviewRemove', () => {
    it('removes the whole preview when no page is named', async () => {
      await api.themeEditPreviewRemove();
      expect(adapter.themeEditPreviewRemove).toHaveBeenCalledWith(
        undefined,
        {},
      );
    });
  });
});

describe('theme-edit.mjs', () => {
  it('exports exactly the nine public leaves', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'themeEditHow',
        'themeEditNew',
        'themeEditPreviewAdd',
        'themeEditPreviewApp',
        'themeEditPreviewList',
        'themeEditPreviewRemove',
        'themeEditSet',
        'themeEditShow',
        'themeEditUndo',
      ].sort(),
    );
    for (const fn of Object.values(api)) expect(typeof fn).toBe('function');
  });
});
