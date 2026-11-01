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
  it('rewrites an inline swipeActions object, merging swipeBehavior in place', async () => {
    const output = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [archive]}} swipeBehavior="commit" />;`),
    );
    expect(output).not.toContain('swipeActions=');
    expect(output).not.toContain('swipeBehavior=');
    expect(output).toContain(
      "import { createSwipe } from '@astryxdesign/core/Swipe';",
    );
    expect(output).toContain(
      "swipe={createSwipe({ trailing: [archive], swipeBehavior: 'commit' })}",
    );
  });

  it('drops a static swipeBehavior="reveal", the default', async () => {
    const output = flat(
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
const a = <ListItem label="A" swipeBehavior="reveal" swipeActions={{leading: [read]}} />;`),
    );
    expect(output).toContain('swipe={createSwipe({leading: [read]})}');
    expect(output).not.toContain('reveal');
  });

  it('guards a name, which may be undefined, and spreads it beside a swipeBehavior expression', async () => {
    const output = flat(
      await applyTransform(`import {Item, ListItem} from '@astryxdesign/core';
const a = <Item label="A" swipeActions={actions} />;
const b = <ListItem label="B" swipeActions={row.actions} swipeBehavior={mode} />;`),
    );
    expect(output).toContain(
      'swipe={actions ? createSwipe(actions) : undefined}',
    );
    expect(output).toContain(
      'swipe={row.actions ? createSwipe({ ...row.actions, swipeBehavior: mode }) : undefined}',
    );
  });

  it('follows aliases and namespace imports, and leaves other libraries alone', async () => {
    const output = flat(
      await applyTransform(`import {Item as Row} from '@astryxdesign/core/Item';
import * as Core from '@astryxdesign/core';
import {Item} from 'other-library';
const a = <Row label="A" swipeActions={{trailing: [archive]}} />;
const b = <Core.ListItem label="B" swipeActions={{trailing: [archive]}} />;
const c = <Item label="C" swipeActions={{trailing: [archive]}} />;`),
    );
    expect(output.match(/swipe=\{createSwipe/g)).toHaveLength(2);
    expect(output).toContain(
      '<Item label="C" swipeActions={{trailing: [archive]}} />',
    );
  });

  it('reuses an existing createSwipe import, and takes a free alias when the name is taken', async () => {
    const reused = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
import {createSwipe as make} from '@astryxdesign/core/Swipe';
const a = <Item label="A" swipeActions={{trailing: [archive]}} />;`),
    );
    expect(reused).toContain('swipe={make({trailing: [archive]})}');
    expect(reused.match(/import/g)).toHaveLength(2);
    const aliased = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const createSwipe = () => null;
const a = <Item label="A" swipeActions={{trailing: [archive]}} />;`),
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

  it('reports a computed value and a row that spreads props, leaving them unchanged, once', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={actionsFor(row)} />;
const b = <Item label="B" {...rest} swipeActions={{trailing: [archive]}} />;
const c = <Item label="C" {...rest} />;`;
    const once = await applyTransform(source);
    expect(once).toContain('swipeActions={actionsFor(row)}');
    expect(once).toContain('swipeActions={{trailing: [archive]}}');
    expect(once.match(/this swipeActions value is computed/g)).toHaveLength(1);
    expect(once.match(/spreads props that may carry them/g)).toHaveLength(2);
    expect(await applyTransform(once)).toBe(once);
  });

  it('renames the four types, importing them from the Swipe entry when theirs lacks them', async () => {
    const output = flat(
      await applyTransform(`import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
import type {ItemSwipeActions, ItemSwipeBehavior as Mode} from '@astryxdesign/core';
const archive: ItemSwipeAction = {label: 'Archive', onActivate: () => {}};
function rows(actions: ItemSwipeActions, mode: Mode) {}`),
    );
    expect(output).toContain("import { Item } from '@astryxdesign/core/Item';");
    expect(output).toContain(
      "import type {CreateSwipeOptions, SwipeBehavior as Mode} from '@astryxdesign/core';",
    );
    expect(output).toContain(
      "import { type SwipeAction } from '@astryxdesign/core/Swipe';",
    );
    expect(output).toContain('const archive: SwipeAction =');
    expect(output).toContain('actions: CreateSwipeOptions, mode: Mode');
  });

  it('reports code that mutates the leading or trailing array of a value it retypes as CreateSwipeOptions, once', async () => {
    const source = `import {Item, type ItemSwipeActions} from '@astryxdesign/core/Item';
import type {ItemSwipeActions as Acts} from '@astryxdesign/core';
const opts: ItemSwipeActions = {trailing: [archive]};
opts.trailing.push(remove);
function edit(actions: Acts, entry: unknown) {
  actions.leading[0] = entry;
  actions.trailing.sort();
}
const kept: ItemSwipeActions = {leading: [read]};
const copy = [...kept.leading, remove];
const other = {leading: [read]};
other.leading.push(remove);`;
    const once = await applyTransform(source);
    expect(once.match(/leading and trailing are readonly/g)).toHaveLength(3);
    expect(flat(once)).toContain(
      'readonly SwipeAction[]; this mutates one. Build a new array instead',
    );
    expect(once).toContain('const copy = [...kept.leading, remove];');
    expect(await applyTransform(once)).toBe(once);
  });

  it('changes nothing in a file with no deprecated swipe props or types', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipe={swipe} />;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('is idempotent', async () => {
    const once =
      await applyTransform(`import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [archive]}} swipeBehavior="commit" />;`);
    expect(await applyTransform(once)).toBe(once);
    const jscodeshift = (await import('jscodeshift')).default;
    expect(() => jscodeshift.withParser('tsx')(once)).not.toThrow();
  });
});
