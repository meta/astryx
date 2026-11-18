// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A component read carries the types its props name that Core itself
 * declares, read from Core's published declaration files (`types` on
 * `component.detail`, on `component.detail.props` beside `data`, and on each
 * batch row), and a piece imported from another entry names it. A hook read,
 * by `hook` or by `component`, carries the types its API names. A read whose
 * props name no Core type has neither field. Core's declarations exist once
 * Core is built, as it is before the CLI's tests run in CI.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {component} from './component.mjs';
import {hook} from '../hook/hook.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const cwd = REPO;
const SLOW = 30_000;
const BUILT = fs.existsSync(
  path.join(REPO, 'packages', 'core', 'dist', 'Typeahead', 'index.d.ts'),
);

describe.skipIf(!BUILT)('component types from Core declarations', () => {
  it(
    'lists the Core types Typeahead props name, with their entry and members',
    async () => {
      const r = /** @type {any} */ (await component('Typeahead', {cwd}));
      const names = r.data.types.map((/** @type {any} */ t) => t.name);
      expect(names).toContain('SearchSource');
      expect(names).toContain('IconType');
      // Types from React, the DOM and StyleX are not Core's.
      for (const name of ['ReactNode', 'CSSProperties', 'StyleXStyles', 'T']) {
        expect(names).not.toContain(name);
      }
      const source = r.data.types.find(
        (/** @type {any} */ t) => t.name === 'SearchSource',
      );
      expect(source.import).toBe(
        "import type { SearchSource } from '@astryxdesign/core/Typeahead';",
      );
      expect(source.members).toContainEqual(
        expect.objectContaining({name: 'search', optional: false}),
      );
      const icon = r.data.types.find(
        (/** @type {any} */ t) => t.name === 'IconType',
      );
      expect(icon.import).toBe(
        "import type { IconType } from '@astryxdesign/core/Icon';",
      );
    },
    SLOW,
  );

  it(
    'gives --props the same types beside data, and a batch row the same read',
    async () => {
      const detail = /** @type {any} */ (await component('Typeahead', {cwd}));
      const props = /** @type {any} */ (
        await component('Typeahead', {cwd, props: true})
      );
      expect(props.type).toBe('component.detail.props');
      expect(Array.isArray(props.data)).toBe(true);
      expect(props.types).toEqual(detail.data.types);
      const batch = /** @type {any} */ (
        await component(['Typeahead', 'Badge'], {cwd})
      );
      expect(batch.data.results[0].result.data.types).toEqual(
        detail.data.types,
      );
      expect('types' in batch.data.results[1].result.data).toBe(false);
    },
    SLOW,
  );

  it(
    'names the entry of a piece imported from another one',
    async () => {
      const r = /** @type {any} */ (await component('Layout', {cwd}));
      const card = r.data.components.find(
        (/** @type {any} */ c) => c.name === 'Card',
      );
      expect(card.import).toBe('@astryxdesign/core/Card');
      const header = r.data.components.find(
        (/** @type {any} */ c) => c.name === 'LayoutHeader',
      );
      expect('import' in header).toBe(false);
    },
    SLOW,
  );

  it(
    'adds no field to a read whose props name no Core type',
    async () => {
      for (const name of ['Badge', 'Divider', 'EmptyState']) {
        const r = /** @type {any} */ (await component(name, {cwd}));
        expect('types' in r.data).toBe(false);
        for (const piece of r.data.components ?? []) {
          expect('import' in piece).toBe(false);
        }
        const props = /** @type {any} */ (
          await component(name, {cwd, props: true})
        );
        expect(Object.keys(props)).toEqual(['type', 'package', 'data']);
      }
    },
    SLOW,
  );

  it(
    'leaves out a brand and a callback-only type, and keeps a string union whole',
    async () => {
      const table = /** @type {any} */ (await component('Table', {cwd}));
      const names = table.data.types.map((/** @type {any} */ t) => t.name);
      expect(names).toContain('TableColumn');
      expect(names).not.toContain('TableVirtualizationCapability');
      const icon = /** @type {any} */ (await component('Icon', {cwd}));
      const iconName = icon.data.types.find(
        (/** @type {any} */ t) => t.name === 'IconName',
      );
      expect(iconName.text.endsWith(' ...')).toBe(false);
      expect(iconName.text).toContain("'close'");
    },
    SLOW,
  );

  it(
    'gives a hook read the types its API names, by hook and by component',
    async () => {
      const read = /** @type {any} */ (await hook('useToast', {cwd}));
      expect(read.type).toBe('hook.detail');
      const names = read.data.types.map((/** @type {any} */ t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['ToastOptions', 'ShowToastFn']),
      );
      const params = /** @type {any} */ (
        await hook('useToast', {cwd, params: true})
      );
      expect(params.types).toEqual(read.data.types);
      const asComponent = /** @type {any} */ (
        await component('useToast', {cwd})
      );
      expect(asComponent.data.types).toEqual(read.data.types);
    },
    SLOW,
  );
});
