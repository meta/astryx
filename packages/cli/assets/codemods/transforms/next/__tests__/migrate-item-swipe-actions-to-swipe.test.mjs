// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-item-swipe-actions-to-swipe.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

describe('migrate-item-swipe-actions-to-swipe', () => {
  it('rewrites an inline swipeActions object, giving each entry with no id one from its side and place, and merging swipeBehavior in place', async () => {
    const output = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}, {id: 'remove', label: 'Delete', onActivate: remove}]}} swipeBehavior="commit" />;`),
    );
    expect(output).not.toContain('swipeActions=');
    expect(output).not.toContain('swipeBehavior=');
    expect(output).toContain(
      "import { createSwipe } from '@astryxdesign/core/Swipe';",
    );
    expect(output).toMatch(
      /swipe=\{createSwipe\(\{ trailing: \[\{ id: 'trailing-0', label: 'Archive', onActivate: archive \}, \{id: 'remove', label: 'Delete', onActivate: remove\}\], swipeBehavior: 'commit' \}\)\}/,
    );
  });

  it('drops a static swipeBehavior="reveal", the default', async () => {
    const output = flat(
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
const a = <ListItem label="A" swipeBehavior="reveal" swipeActions={{leading: [{label: 'Read', onActivate: read}]}} />;`),
    );
    expect(output).toContain(
      "swipe={createSwipe({leading: [{ id: 'leading-0', label: 'Read', onActivate: read }]})}",
    );
    expect(output).not.toContain('reveal');
  });

  it('reports a value whose entries it cannot see, leaving it unchanged, once', async () => {
    const source = `import {Item, ListItem} from '@astryxdesign/core';
const a = <Item label="A" swipeActions={actions} />;
const b = <ListItem label="B" swipeActions={row.actions} swipeBehavior={mode} />;
const c = <Item label="C" swipeActions={actionsFor(row)} />;
const d = <Item label="D" swipeActions={{...base, trailing: [{label: 'Archive', onActivate: archive}]}} />;
const e = <Item label="E" swipeActions={{trailing: [archive]}} />;
const f = <Item label="F" swipeActions={{trailing: entries}} />;`;
    const once = await applyTransform(source);
    expect(once).not.toContain('@astryxdesign/core/Swipe');
    expect(once.match(/swipeActions=/g)).toHaveLength(6);
    expect(
      once.match(/does not show every entry as an object literal/g),
    ).toHaveLength(6);
    expect(await applyTransform(once)).toBe(once);
  });

  it('follows aliases and namespace imports, and leaves other libraries alone', async () => {
    const output = flat(
      await applyTransform(`import {Item as Row} from '@astryxdesign/core/Item';
import * as Core from '@astryxdesign/core';
import {Item} from 'other-library';
const a = <Row label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const b = <Core.ListItem label="B" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const c = <Item label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`),
    );
    expect(output.match(/swipe=\{createSwipe/g)).toHaveLength(2);
    expect(output).toContain(
      `<Item label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />`,
    );
  });

  it('reuses an existing createSwipe import, and takes a free alias when the name is taken', async () => {
    const reused = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
import {createSwipe as make} from '@astryxdesign/core/Swipe';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`),
    );
    expect(reused).toContain(
      "swipe={make({trailing: [{ id: 'trailing-0', label: 'Archive', onActivate: archive }]})}",
    );
    expect(reused.match(/import/g)).toHaveLength(2);
    const aliased = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const createSwipe = () => null;
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`),
    );
    expect(aliased).toContain(
      "import { createSwipe as createSwipe2 } from '@astryxdesign/core/Swipe';",
    );
    expect(aliased).toContain('swipe={createSwipe2({');
  });

  it('removes the deprecated props from a row that already sets swipe, and a lone swipeBehavior', async () => {
    const output = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipe={swipe} swipeActions={old} swipeBehavior="commit" />;
const b = <Item label="B" swipeBehavior="commit" />;`),
    );
    expect(output).toContain('<Item label="A" swipe={swipe} />');
    expect(output).toContain('<Item label="B" />');
  });

  it('reports a row that spreads props, leaving it unchanged, once', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const b = <Item label="B" {...rest} swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const c = <Item label="C" {...rest} />;`;
    const once = await applyTransform(source);
    expect(once).toContain(
      "swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}}",
    );
    expect(once.match(/spreads props that may carry them/g)).toHaveLength(2);
    expect(await applyTransform(once)).toBe(once);
  });

  it('leaves the ItemSwipe* types as they are: two are deprecated with the props, and two stay supported', async () => {
    const source = `import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
import type {ItemSwipeActions, ItemSwipeActionVariant, ItemSwipeBehavior as Mode} from '@astryxdesign/core';
const archive: ItemSwipeAction = {label: 'Archive', onActivate: () => {}};
function rows(actions: ItemSwipeActions, variant: ItemSwipeActionVariant, mode: Mode) {}`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('changes nothing in a file with no deprecated swipe props', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipe={swipe} />;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('is idempotent, and its output parses', async () => {
    const once =
      await applyTransform(`import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} swipeBehavior="commit" />;`);
    expect(await applyTransform(once)).toBe(once);
    const jscodeshift = (await import('jscodeshift')).default;
    expect(() => jscodeshift.withParser('tsx')(once)).not.toThrow();
  });
});
