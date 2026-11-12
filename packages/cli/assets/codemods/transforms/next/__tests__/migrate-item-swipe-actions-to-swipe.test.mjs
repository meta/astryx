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

/** The output parses as TSX, and a second run changes nothing. */
async function expectStable(output) {
  expect(await applyTransform(output)).toBe(output);
  const jscodeshift = (await import('jscodeshift')).default;
  expect(() => jscodeshift.withParser('tsx')(output)).not.toThrow();
}

describe('migrate-item-swipe-actions-to-swipe', () => {
  it('rewrites an inline swipeActions object into one swipe defined at module scope, naming each entry with no id after its label, and merging swipeBehavior in place', async () => {
    const raw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}, {id: 'remove', label: 'Delete', onActivate: remove}]}} swipeBehavior="commit" />;`);
    const output = flat(raw);
    expect(output).not.toContain('swipeActions=');
    expect(output).not.toContain('swipeBehavior=');
    expect(output).toContain(
      "import { createSwipe } from '@astryxdesign/core/Swipe';",
    );
    expect(output).toMatch(
      /const archiveRemoveSwipe = createSwipe\(\{ ?trailing: \[\{ id: 'archive', label: 'Archive', onActivate: archive \}, \{id: 'remove', label: 'Delete', onActivate: remove\}\], swipeBehavior: 'commit' ?\}\);/,
    );
    expect(output).toContain('<Item label="A" swipe={archiveRemoveSwipe} />');
    expect(output.indexOf('const archiveRemoveSwipe')).toBeLessThan(
      output.indexOf('const a ='),
    );
    await expectStable(raw);
  });

  it('drops a static swipeBehavior="reveal", the default', async () => {
    const output = flat(
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
const a = <ListItem label="A" swipeBehavior="reveal" swipeActions={{leading: [{label: 'Read', onActivate: read}]}} />;`),
    );
    expect(output).toMatch(
      /const readSwipe = createSwipe\(\{ ?leading: \[\{ id: 'read', label: 'Read', onActivate: read \}\] ?\}\);/,
    );
    expect(output).toContain('swipe={readSwipe}');
    expect(output).not.toContain('reveal');
  });

  it('reports a value whose entries it cannot see, leaving it unchanged, once', async () => {
    const source = `import {Item, ListItem} from '@astryxdesign/core';
const a = <Item label="A" swipeActions={actions} />;
const b = <ListItem label="B" swipeActions={row.actions} swipeBehavior={mode} />;
const c = <Item label="C" swipeActions={actionsFor(row)} />;
const d = <Item label="D" swipeActions={{...base, trailing: [{label: 'Archive', onActivate: archive}]}} />;
const e = <Item label="E" swipeActions={{trailing: [archive]}} />;
const f = <Item label="F" swipeActions={{trailing: entries}} />;
const g = <Item label="G" swipeActions={isOn && {trailing: [{label: 'Archive', onActivate: archive}]}} />;`;
    const once = await applyTransform(source);
    expect(once).not.toContain('@astryxdesign/core/Swipe');
    expect(once.match(/swipeActions=/g)).toHaveLength(7);
    expect(
      once.match(/does not show every entry as an object literal/g),
    ).toHaveLength(7);
    expect(await applyTransform(once)).toBe(once);
  });

  it('follows aliases and namespace imports, gives two rows with the same actions one definition, and leaves other libraries alone', async () => {
    const output = flat(
      await applyTransform(`import {Item as Row} from '@astryxdesign/core/Item';
import * as Core from '@astryxdesign/core';
import {Item} from 'other-library';
const a = <Row label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const b = <Core.ListItem label="B" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const c = <Item label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`),
    );
    expect(output.match(/= createSwipe\(/g)).toHaveLength(1);
    expect(output.match(/swipe=\{archiveSwipe\}/g)).toHaveLength(2);
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
    expect(reused).toMatch(
      /const archiveSwipe = make\(\{ ?trailing: \[\{ id: 'archive', label: 'Archive', onActivate: archive \}\] ?\}\);/,
    );
    expect(reused).toContain('swipe={archiveSwipe}');
    expect(reused.match(/import/g)).toHaveLength(2);
    const aliased = flat(
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const createSwipe = () => null;
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`),
    );
    expect(aliased).toContain(
      "import { createSwipe as createSwipe2 } from '@astryxdesign/core/Swipe';",
    );
    expect(aliased).toContain('const archiveSwipe = createSwipe2({');
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

  it('reports nothing on a row that spreads a local object literal with no swipe props, and migrates it', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
function Rows() {
  const slots = {label: 'A', description: 'B', startContent: <span />};
  return (
    <>
      <Item {...slots} />
      <Item {...slots} marker={marker} swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />
    </>
  );
}`;
    const output = flat(await applyTransform(source));
    expect(output).not.toContain('TODO');
    expect(output).toContain('<Item {...slots} />');
    expect(output).toContain(
      '<Item {...slots} marker={marker} swipe={archiveSwipe} />',
    );
    const unproven =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
function Rows({extra}) {
  const slots = {label: 'A', ...extra};
  return <Item {...slots} />;
}`);
    expect(unproven).toContain('spreads props that may carry them');
  });

  it('defines the swipe in useMemo when a handler reads the component state, with a useState setter left out of its dependencies', async () => {
    const raw = await applyTransform(`import {useState} from 'react';
import {ListItem} from '@astryxdesign/core/List';
export function Inbox({onDelete}) {
  const [rows, setRows] = useState([]);
  return <ListItem label="A" swipeActions={{trailing: [{label: 'Delete', onActivate: () => { onDelete(); setRows([]); }}]}} />;
}`);
    const output = flat(raw);
    expect(output).toMatch(/import \{ ?useState, useMemo ?\} from 'react';/);
    expect(output).toMatch(
      /const deleteSwipe = useMemo\(\(\) => createSwipe\(\{ ?trailing: \[\{ id: 'delete', label: 'Delete', onActivate: \(\) => \{ onDelete\(\); setRows\(\[\]\); \} \}\] ?\}\), \[onDelete\]\);/,
    );
    expect(output).toContain('<ListItem label="A" swipe={deleteSwipe} />');
    expect(output.indexOf('useState([])')).toBeLessThan(
      output.indexOf('const deleteSwipe'),
    );
    expect(output.indexOf('const deleteSwipe')).toBeLessThan(
      output.indexOf('return <ListItem'),
    );
    await expectStable(raw);
  });

  it('names each id after its static label, unique across the swipe; then after its handler; and otherwise keeps a positional id and leaves a TODO', async () => {
    const raw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{leading: [{label: 'Mark as read', onActivate: markRead}], trailing: [{label: 'Delete', onActivate: remove}, {label: 'Delete', onActivate: removeAll}, {label: t('archive'), onActivate: handleArchive}, {label: t('x'), onActivate: () => {}}]}} />;`);
    const output = flat(raw);
    expect(output).toContain("id: 'mark-as-read'");
    expect(output).toContain("id: 'delete'");
    expect(output).toContain("id: 'delete-2'");
    expect(output).toContain("id: 'archive'");
    expect(output).toContain("id: 'trailing-3'");
    expect(output).toContain(
      'a row keys its swipe on the ids (AST-057 DEC-10)',
    );
    expect(output).toContain('swipe={rowSwipe}');
    await expectStable(raw);
  });

  it('hoists each object of a conditional value, leaving the condition on the row', async () => {
    const output = flat(
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
const a = <ListItem label="A" swipeActions={isPlain ? undefined : {trailing: [{label: 'Delete', onActivate: remove}]}} />;`),
    );
    expect(output).toMatch(
      /const deleteSwipe = createSwipe\(\{ ?trailing: \[\{ id: 'delete', label: 'Delete', onActivate: remove \}\] ?\}\);/,
    );
    expect(output).toContain('swipe={isPlain ? undefined : deleteSwipe}');
  });

  it("reads the row from onActivate's itemKey when a handler closes over the ListItem's own itemKey, so one swipe serves every row", async () => {
    const raw = await applyTransform(`import {useState} from 'react';
import {List, ListItem} from '@astryxdesign/core/List';
function Rows() {
  const [rows, setRows] = useState(['a', 'b']);
  return (
    <List>
      {rows.map(label => (
        <ListItem key={label} itemKey={label} label={label} swipeActions={label === 'a' ? undefined : {trailing: [{label: 'Delete', onActivate: () => setRows(current => current.filter(row => row !== label))}]}} />
      ))}
    </List>
  );
}`);
    const output = flat(raw);
    expect(output).toMatch(
      /const deleteSwipe = useMemo\(\(\) => createSwipe\(\{ ?trailing: \[\{ id: 'delete', label: 'Delete', onActivate: \(\{ ?itemKey ?\}\) => setRows\(current => current\.filter\(row => row !== itemKey\)\) \}\] ?\}\), \[\]\);/,
    );
    expect(output).toContain("swipe={label === 'a' ? undefined : deleteSwipe}");
    await expectStable(raw);
  });

  it('leaves createSwipe on the row with a TODO when a handler reads a value it cannot move: a map row with no itemKey, or this', async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
function Rows({rows, remove}) {
  return (
    <List>
      {rows.map(row => (
        <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Archive', onActivate: () => remove(row.id)}]}} />
      ))}
    </List>
  );
}
class Old extends Component {
  render() {
    return <ListItem label="A" swipeActions={{trailing: [{label: 'Delete', onActivate: this.remove}]}} />;
  }
}`);
    const output = flat(raw);
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(2);
    expect(output.match(/define this swipe once/g)).toHaveLength(2);
    expect(output).toContain("id: 'archive'");
    expect(output).toContain("id: 'delete'");
    expect(output).not.toMatch(/useMemo\(|import \{[^}]*useMemo/);
    await expectStable(raw);
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
    await expectStable(once);
  });
});
