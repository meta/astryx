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
import {archive, remove} from './actions';
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
    const raw =
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
import {read} from './actions';
const a = <ListItem label="A" swipeBehavior="reveal" swipeActions={{leading: [{label: 'Read', onActivate: read}]}} />;`);
    const output = flat(raw);
    expect(output).toMatch(
      /const readSwipe = createSwipe\(\{ ?leading: \[\{ id: 'read', label: 'Read', onActivate: read \}\] ?\}\);/,
    );
    expect(output).toContain('swipe={readSwipe}');
    expect(output).not.toContain('reveal');
    await expectStable(raw);
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
    await expectStable(once);
  });

  it('follows aliases and namespace imports, gives two rows with the same actions one definition, and leaves other libraries alone', async () => {
    const raw =
      await applyTransform(`import {Item as Row} from '@astryxdesign/core/Item';
import * as Core from '@astryxdesign/core';
import {Item} from 'other-library';
import {archive} from './actions';
const a = <Row label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const b = <Core.ListItem label="B" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
const c = <Item label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`);
    const output = flat(raw);
    expect(output.match(/= createSwipe\(/g)).toHaveLength(1);
    expect(output.match(/swipe=\{archiveSwipe\}/g)).toHaveLength(2);
    expect(output).toContain(
      `<Item label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />`,
    );
    await expectStable(raw);
  });

  it('reuses an existing createSwipe import, and takes a free alias when the name is taken', async () => {
    const reusedRaw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
import {createSwipe as make} from '@astryxdesign/core/Swipe';
import {archive} from './actions';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`);
    const reused = flat(reusedRaw);
    expect(reused).toMatch(
      /const archiveSwipe = make\(\{ ?trailing: \[\{ id: 'archive', label: 'Archive', onActivate: archive \}\] ?\}\);/,
    );
    expect(reused).toContain('swipe={archiveSwipe}');
    expect(reused.match(/import/g)).toHaveLength(3);
    await expectStable(reusedRaw);
    const aliasedRaw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
import {archive} from './actions';
const createSwipe = () => null;
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;`);
    const aliased = flat(aliasedRaw);
    expect(aliased).toContain(
      "import { createSwipe as createSwipe2 } from '@astryxdesign/core/Swipe';",
    );
    expect(aliased).toContain('const archiveSwipe = createSwipe2({');
    await expectStable(aliasedRaw);
  });

  it('removes the deprecated props from a row that already sets swipe, and a lone swipeBehavior', async () => {
    const raw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipe={swipe} swipeActions={old} swipeBehavior="commit" />;
const b = <Item label="B" swipeBehavior="commit" />;`);
    const output = flat(raw);
    expect(output).toContain('<Item label="A" swipe={swipe} />');
    expect(output).toContain('<Item label="B" />');
    await expectStable(raw);
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
    await expectStable(once);
  });

  it('reports nothing on a row that spreads a local object literal with no swipe props, and migrates it', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
import {archive} from './actions';
function Rows() {
  const slots = {label: 'A', description: 'B', startContent: <span />};
  return (
    <>
      <Item {...slots} />
      <Item {...slots} marker={marker} swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />
    </>
  );
}`;
    const raw = await applyTransform(source);
    const output = flat(raw);
    expect(output).not.toContain('TODO');
    expect(output).toContain('<Item {...slots} />');
    expect(output).toContain(
      '<Item {...slots} marker={marker} swipe={archiveSwipe} />',
    );
    await expectStable(raw);
    const unproven =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
function Rows({extra}) {
  const slots = {label: 'A', ...extra};
  return <Item {...slots} />;
}`);
    expect(unproven).toContain('spreads props that may carry them');
  });

  it("reports nothing on a row that spreads what an array literal's map callback takes, when every element gives it an object literal with no swipe props", async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const rows = (
  [
    ['Rest', {}],
    ['Selected', {isSelected: true}],
  ] as const
).map(([label, state]) => <Item key={label} {...state} label={label} />);
const items = [{label: 'A'}, {label: 'B', isDisabled: true}].map(props => (
  <Item key={props.label} {...props} />
));`;
    expect(await applyTransform(source)).toBe(source);
    await expectStable(source);
    const unproven =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
const rows = [
  ['Rest', {}],
  ['Mail', {swipeActions: mailActions}],
].map(([label, state]) => <Item key={label} {...state} label={label} />);`);
    expect(unproven).toContain('spreads props that may carry them');
    await expectStable(unproven);
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
import {markRead, remove, removeAll, handleArchive} from './actions';
import {t} from './i18n';
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
    // The `t(…)` labels run at render, so the swipe stays on the row.
    expect(output).toContain('swipe={createSwipe({');
    expect(output).toContain('an Item passes no itemKey to onActivate');
    await expectStable(raw);
  });

  it('hoists each object of a conditional value, leaving the condition on the row', async () => {
    const raw =
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
import {remove} from './actions';
const a = <ListItem label="A" swipeActions={isPlain ? undefined : {trailing: [{label: 'Delete', onActivate: remove}]}} />;`);
    const output = flat(raw);
    expect(output).toMatch(
      /const deleteSwipe = createSwipe\(\{ ?trailing: \[\{ id: 'delete', label: 'Delete', onActivate: remove \}\] ?\}\);/,
    );
    expect(output).toContain('swipe={isPlain ? undefined : deleteSwipe}');
    await expectStable(raw);
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

  it('treats only a memo(…) or forwardRef(…) function as a component: a map or useCallback callback with a capitalized name keeps createSwipe on the row', async () => {
    const raw =
      await applyTransform(`import {memo, forwardRef, useCallback} from 'react';
import {List, ListItem} from '@astryxdesign/core/List';
function Rows({rows}) {
  const Mapped = rows.map(row => <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: row.label, onActivate: row.remove}]}} />);
  const RenderRow = useCallback(row => <ListItem label={row.label} swipeActions={{trailing: [{label: row.label, onActivate: row.archive}]}} />, []);
  return <List>{Mapped}{rows.map(RenderRow)}</List>;
}
const Memoized = memo(({row}) => <ListItem label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: row.remove}]}} />);
const Forwarded = forwardRef(({row}, ref) => <ListItem ref={ref} label={row.label} swipeActions={{trailing: [{label: 'Archive', onActivate: row.archive}]}} />);`);
    const output = flat(raw);
    // Two callbacks keep the call on the row: a hook there would run per row.
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(2);
    expect(output.match(/define this swipe once/g)).toHaveLength(2);
    expect(output).not.toMatch(/Mapped = rows\.map\(row => \{/);
    // memo(…) and forwardRef(…) wrap components, which may call useMemo.
    expect(output).toMatch(
      /const Memoized = memo\(\(\{ ?row ?\}\) => \{ const deleteSwipe = useMemo\(\(\) => createSwipe\(/,
    );
    expect(output).toMatch(
      /const Forwarded = forwardRef\(\(\{ ?row ?\}, ref\) => \{ const archiveSwipe = useMemo\(\(\) => createSwipe\(/,
    );
    await expectStable(raw);
  });

  it("keeps a handler's closure when it passes the row's key on, not compares it, since itemKey may be undefined", async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
function Rows({rows, remove}) {
  return (
    <List>
      {rows.map(row => (
        <ListItem key={row.id} itemKey={row.id} label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: () => remove(row.id)}]}} />
      ))}
    </List>
  );
}`);
    const output = flat(raw);
    expect(output).not.toContain('itemKey }) =>');
    expect(output).toContain('onActivate: () => remove(row.id)');
    expect(output).toContain('swipe={createSwipe({');
    expect(output).toContain(
      'read the row from the itemKey that onActivate receives',
    );
    await expectStable(raw);
  });

  it('defines a swipe at module scope only when every value outside a handler is fixed at import: a literal, a JSX element, an import or a module const', async () => {
    const raw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
import * as actions from './actions';
import {ArchiveIcon} from './icons';
import {t} from './i18n';
const LABEL = 'Delete';
const fixed = <Item label="A" swipeActions={{trailing: [{label: LABEL, icon: <ArchiveIcon />, onActivate: actions.remove}]}} />;
const call = <Item label="B" swipeActions={{trailing: [{label: t('archive'), onActivate: actions.archive}]}} />;
const constructed = <Item label="C" swipeActions={{trailing: [{label: 'Snooze', isDisabled: new Date().getHours() > 20, onActivate: actions.snooze}]}} />;
const global = <Item label="D" swipeActions={{trailing: [{label: 'Wide', isDisabled: window.innerWidth < 600, onActivate: actions.archive}]}} />;
const handler = <Item label="E" swipeActions={{trailing: [{label: 'Log', onActivate: () => console.log(window.location.href)}]}} />;`);
    const output = flat(raw);
    // A literal, a module const, a JSX element and a namespace import's
    // member are fixed at import, and a handler's body runs on activation.
    expect(output).toMatch(/const removeSwipe = createSwipe\(/);
    expect(output).toContain('<Item label="A" swipe={removeSwipe} />');
    expect(output).toMatch(/const logSwipe = createSwipe\(/);
    expect(output).toContain('<Item label="E" swipe={logSwipe} />');
    // A call, a construction and a global read run at render.
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(3);
    expect(
      output.match(/an Item passes no itemKey to onActivate/g),
    ).toHaveLength(3);
    await expectStable(raw);
  });

  it("defines a swipe in useMemo only when every value outside a handler stays the same there: a call on one of the owner's locals is a dependency, and any other call, construction or global read stays on the row", async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
import {useTranslation} from './i18n-hooks';
import {t} from './i18n';
function Imported({id, remove}) {
  return <ListItem itemKey={id} label="A" swipeActions={{trailing: [{label: t('archive'), onActivate: () => remove(id)}]}} />;
}
function Hooked({id, remove}) {
  const {t: translate} = useTranslation();
  return <ListItem itemKey={id} label="B" swipeActions={{trailing: [{label: translate('archive'), onActivate: () => remove(id)}]}} />;
}
function Timed({id, remove}) {
  return <ListItem itemKey={id} label="C" swipeActions={{trailing: [{label: 'Snooze', isDisabled: new Date().getHours() > 20, onActivate: () => remove(id)}]}} />;
}
function Sized({id, remove}) {
  return <ListItem itemKey={id} label="D" swipeActions={{trailing: [{label: 'Wide', isDisabled: window.innerWidth < 600, onActivate: () => remove(id)}]}} />;
}`);
    const output = flat(raw);
    // The hook's translate is a local, so it is a dependency of the memo.
    expect(output).toMatch(
      /const removeSwipe = useMemo\(\(\) => createSwipe\(\{ ?trailing: \[\{ id: 'remove', label: translate\('archive'\), onActivate: \(\) => remove\(id\) \}\] ?\}\), \[translate, remove, id\]\);/,
    );
    // An imported t, a new Date() and window run or read at render.
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(3);
    expect(output).toContain("label: t('archive')");
    expect(output.match(/useMemo\(/g)).toHaveLength(1);
    await expectStable(raw);
  });

  it("defines a swipe before a hoisted function's first possible call: after the last binding it reads, so code above that calls the function finds it", async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
import {remove} from './actions';
const items = rows.map(renderRow);
function renderRow(row) {
  return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: remove}]}} />;
}
export function Rows({rows, archive}) {
  const list = rows.map(renderItem);
  function renderItem(row) {
    return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
  }
  return <List>{list}</List>;
}`);
    const output = flat(raw);
    expect(output).not.toContain('TODO');
    // At module scope, after the imports and before the call above renderRow.
    expect(output.indexOf('const deleteSwipe = createSwipe(')).toBeGreaterThan(
      output.indexOf("from './actions';"),
    );
    expect(output.indexOf('const deleteSwipe = createSwipe(')).toBeLessThan(
      output.indexOf('const items = rows.map(renderRow)'),
    );
    // In the component, at the top of its body, before the call above renderItem.
    expect(output).toMatch(
      /export function Rows\(\{ ?rows, archive ?\}\) \{ const archiveSwipe = useMemo\(\(\) => createSwipe\([^;]*\), \[archive\]\); const list = rows\.map\(renderItem\);/,
    );
    await expectStable(raw);
  });

  it("keeps a hoisted function's row working when a binding its definition needs sits below a call: at module scope a handler's read does not move it, and in a component createSwipe stays on the row", async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
import {makeApi, useRemove} from './api';
const items = rows.map(renderRow);
const api = makeApi();
function renderRow(row) {
  return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Archive', onActivate: () => api.archive()}]}} />;
}
export function Rows({rows}) {
  const list = rows.map(renderItem);
  const remove = useRemove();
  function renderItem(row) {
    return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: () => remove()}]}} />;
  }
  return <List>{list}</List>;
}`);
    const output = flat(raw);
    // The handler reads api when the action fires, after the module ran.
    expect(output.indexOf('const archiveSwipe = createSwipe(')).toBeGreaterThan(
      output.indexOf("from './api';"),
    );
    expect(output.indexOf('const archiveSwipe = createSwipe(')).toBeLessThan(
      output.indexOf('const items = rows.map(renderRow)'),
    );
    // useMemo would read remove at once, below the call to renderItem.
    expect(output).not.toMatch(/= useMemo\(/);
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(1);
    expect(output).toMatch(/const remove = useRemove\(\);.*TODO/);
    await expectStable(raw);
  });

  it("gives a hoisted function's row its own definition when the same options were defined below a call to it", async () => {
    const raw =
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
import {archive} from './actions';
const items = rows.map(renderRow);
const first = <ListItem label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
function renderRow(row) {
  return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />;
}`);
    const output = flat(raw);
    const names = [
      ...output.matchAll(/const (archiveSwipe\d*) = createSwipe\(/g),
    ].map(match => match[1]);
    expect(names).toHaveLength(2);
    // The first definition in the file sits above the call, and renderRow uses it.
    expect(output.indexOf(`const ${names[0]} =`)).toBeLessThan(
      output.indexOf('const items = rows.map(renderRow)'),
    );
    expect(output).toMatch(
      new RegExp(`function renderRow\\(row\\) \\{.*swipe=\\{${names[0]}\\}`),
    );
    await expectStable(raw);
  });

  it("checks every function in the options but an entry's onActivate: a render-time callback that calls an imported t, or a ref's current, keeps createSwipe on the row", async () => {
    const raw = await applyTransform(`import {useRef} from 'react';
import {ListItem} from '@astryxdesign/core/List';
import {t} from './i18n';
function Tagged({tags, remove}) {
  return <ListItem label="A" swipeActions={{trailing: [{label: tags.map(tag => t(tag)).join(', '), onActivate: remove}]}} />;
}
function Reffed({remove}) {
  const labelRef = useRef('Delete');
  return <ListItem label="B" swipeActions={{trailing: [{label: labelRef.current, onActivate: remove}]}} />;
}
function Mapped({tags, remove}) {
  return <ListItem label="C" swipeActions={{trailing: [{label: tags.map(tag => tag.toUpperCase()).join(', '), onActivate: remove}]}} />;
}`);
    const output = flat(raw);
    // The imported t and the ref's current run or read at render.
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(2);
    // A callback's own parameter is part of the value; tags is a dependency.
    expect(output).toMatch(
      /function Mapped\(\{ ?tags, remove ?\}\) \{ const removeSwipe = useMemo\(\(\) => createSwipe\([^;]*\), \[tags, remove\]\);/,
    );
    await expectStable(raw);
  });

  it('shares one definition between rows when no local their options read is written after its declaration; a let reassigned between them keeps createSwipe on each row', async () => {
    const raw =
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
function Reassigned({remove}) {
  let label = 'Delete';
  const first = <ListItem label="A" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  label = 'Remove';
  const second = <ListItem label="B" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  return <>{first}{second}</>;
}
function Constant({remove}) {
  const label = 'Delete';
  const first = <ListItem label="A" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  const second = <ListItem label="B" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  return <>{first}{second}</>;
}`);
    const output = flat(raw);
    const reassigned = output.slice(
      output.indexOf('function Reassigned'),
      output.indexOf('function Constant'),
    );
    const constant = output.slice(output.indexOf('function Constant'));
    expect(reassigned).not.toMatch(/= useMemo\(/);
    expect(reassigned.match(/swipe=\{createSwipe\(/g)).toHaveLength(2);
    expect(reassigned).toContain('TODO');
    expect(constant.match(/= useMemo\(/g)).toHaveLength(1);
    await expectStable(raw);
  });

  /** Each row stays inline with a TODO: no definition, which would keep a stale value. */
  const expectInlineWithTodo = (/** @type {string} */ output, rows) => {
    expect(output).not.toMatch(/= useMemo\(/);
    expect(output.match(/swipe=\{createSwipe\(/g)).toHaveLength(rows);
    expect(output).toContain('TODO');
  };

  it('keeps createSwipe on the row with a TODO when a let its options read is reassigned above a hoisted function', async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
function Rows({rows, isAlt, remove}) {
  let label = 'Delete';
  if (isAlt) label = 'Remove';
  function renderRow(row) {
    return <ListItem key={row.id} label={row.label} swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  }
  return <List>{rows.map(renderRow)}</List>;
}`);
    expectInlineWithTodo(flat(raw), 1);
    await expectStable(raw);
  });

  it('keeps createSwipe on the row with a TODO when a let its options read is reassigned in a loop before each row', async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
function Rows({items, remove}) {
  const rows = [];
  let label;
  for (const item of items) {
    label = item.name;
    rows.push(<ListItem key={item.id} label={item.name} swipeActions={{trailing: [{label, onActivate: remove}]}} />);
  }
  return <List>{rows}</List>;
}`);
    expectInlineWithTodo(flat(raw), 1);
    await expectStable(raw);
  });

  it('keeps createSwipe on each row with a TODO when a parameter its options read is reassigned between two rows', async () => {
    const raw =
      await applyTransform(`import {ListItem} from '@astryxdesign/core/List';
function Rows({label, remove}) {
  const first = <ListItem label="A" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  label = label + '!';
  const second = <ListItem label="B" swipeActions={{trailing: [{label, onActivate: remove}]}} />;
  return <>{first}{second}</>;
}`);
    expectInlineWithTodo(flat(raw), 2);
    await expectStable(raw);
  });

  it('gives an Item row its own TODO: an Item passes no itemKey to onActivate', async () => {
    const raw =
      await applyTransform(`import {Item} from '@astryxdesign/core/Item';
function Rows({rows, remove}) {
  return rows.map(row => <Item key={row.id} label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: () => remove(row.id)}]}} />);
}`);
    const output = flat(raw);
    expect(output).toContain('swipe={createSwipe({');
    expect(output).toContain('an Item passes no itemKey to onActivate');
    expect(output).not.toContain('read the row from the itemKey');
    await expectStable(raw);
  });

  it('defines every swipe of an arrow component with an expression body in the one block it makes, sharing identical options, conditional branches included', async () => {
    const raw =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
const Rows = ({flag, archive, remove}) => (
  <List>
    <ListItem label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />
    <ListItem label="B" swipeActions={flag ? {trailing: [{label: 'Delete', onActivate: remove}]} : {leading: [{label: 'Read', onActivate: archive}]}} />
    <ListItem label="C" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} />
  </List>
);`);
    const output = flat(raw);
    expect(output).not.toContain('TODO');
    expect(output.match(/= useMemo\(/g)).toHaveLength(3);
    expect(output.match(/swipe=\{archiveSwipe\}/g)).toHaveLength(2);
    expect(output).toContain('swipe={flag ? deleteSwipe : readSwipe}');
    expect(output).toMatch(
      /const Rows = \(\{ ?flag, archive, remove ?\}\) => \{ const archiveSwipe = useMemo/,
    );
    await expectStable(raw);
  });

  it('leaves the ItemSwipe* types as they are: two are deprecated with the props, and two stay supported', async () => {
    const source = `import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
import type {ItemSwipeActions, ItemSwipeActionVariant, ItemSwipeBehavior as Mode} from '@astryxdesign/core';
const archive: ItemSwipeAction = {label: 'Archive', onActivate: () => {}};
function rows(actions: ItemSwipeActions, variant: ItemSwipeActionVariant, mode: Mode) {}`;
    expect(await applyTransform(source)).toBe(source);
    await expectStable(source);
  });

  it('changes nothing in a file with no deprecated swipe props', async () => {
    const source = `import {Item} from '@astryxdesign/core/Item';
const a = <Item label="A" swipe={swipe} />;`;
    expect(await applyTransform(source)).toBe(source);
    await expectStable(source);
  });

  it('is idempotent, and its output parses', async () => {
    const once =
      await applyTransform(`import {Item, type ItemSwipeAction} from '@astryxdesign/core/Item';
const a = <Item label="A" swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}} swipeBehavior="commit" />;`);
    await expectStable(once);
  });
});
