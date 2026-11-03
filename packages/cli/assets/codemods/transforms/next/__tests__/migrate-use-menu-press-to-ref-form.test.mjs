// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-use-menu-press-to-ref-form.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

const TODO = 'TODO(astryx upgrade): useMenuPress({menuRef, ...}) is deprecated';

describe('migrate-use-menu-press-to-ref-form', () => {
  it('moves the menu ref first and drops the spreads the ref form no longer returns', async () => {
    const output = flat(
      await applyTransform(`import {useMenuPress} from '@astryxdesign/core';
function Menu() {
  const menuPress = useMenuPress({menuRef: listRef, triggerRef, itemSelector: '[role="menuitem"]', onActivate});
  return (
    <>
      <button ref={triggerRef} {...menuPress.triggerProps} onClick={() => menuPress.isTriggerClickFromPress()} />
      <ul ref={listRef} role="menu" {...menuPress.menuProps} />
    </>
  );
}`),
    );
    expect(output).toContain(
      'useMenuPress(listRef, { triggerRef, itemSelector: \'[role="menuitem"]\', onActivate })',
    );
    expect(output).not.toContain('menuProps');
    expect(output).not.toContain('triggerProps');
    expect(output).toContain('menuPress.isTriggerClickFromPress()');
    expect(output).toContain('<ul ref={listRef} role="menu" />');
    expect(output).not.toContain('TODO');
  });

  it('drops destructured spreads, keeps the other reads, and drops an emptied pattern', async () => {
    const output = flat(
      await applyTransform(`import * as Core from '@astryxdesign/core';
function A() {
  const {menuProps, triggerProps, cancel} = Core.useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
  return <><b ref={triggerRef} {...triggerProps} /><i ref={menuRef} {...menuProps} onBlur={cancel} /></>;
}
function B() {
  const {menuProps} = Core.useMenuPress({menuRef, itemSelector: ITEM});
  return <i ref={menuRef} {...menuProps} />;
}`),
    );
    expect(output).toContain(
      'const { cancel } = Core.useMenuPress(menuRef, { triggerRef, itemSelector: ITEM });',
    );
    expect(output).toContain(
      '<b ref={triggerRef} /><i ref={menuRef} onBlur={cancel} />',
    );
    expect(output).toContain(
      'Core.useMenuPress(menuRef, { itemSelector: ITEM }); return <i ref={menuRef} />;',
    );
    expect(output).not.toContain('menuProps');
  });

  it('leaves a TODO, and the call, where it cannot prove the result', async () => {
    const cases = [
      // Options that are not an object literal.
      `const press = useMenuPress(options);`,
      // Options that spread.
      `const press = useMenuPress({...shared, menuRef, itemSelector: ITEM});`,
      // No menu ref.
      `const press = useMenuPress({itemSelector: ITEM});`,
      // A read of menuProps other than its spread.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
const down = press.menuProps.onPointerDown;`,
      // The return used whole.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
track(press);`,
      // The menu props spread on an element that is not the menu.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
const el = <div ref={otherRef} {...press.menuProps} />;`,
      // A trigger that the old call reached only through its spread: a release
      // on it closed the menu, and as triggerRef it would not.
      `const trigger = useRef(null);
const press = useMenuPress({menuRef: refs.menu, itemSelector: ITEM});
return <><button ref={trigger} {...press.triggerProps} /><div ref={refs.menu} {...press.menuProps} /></>;`,
      // The trigger props spread on an element without a ref.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
const el = <button {...press.triggerProps} />;`,
      // The trigger props spread on an element that is not the trigger.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
const el = <button ref={otherRef} {...press.triggerProps} />;`,
      // The trigger props spread on a component element, which may drop the
      // handlers or give its ref to an imperative handle.
      `const trigger = useRef(null);
const press = useMenuPress({menuRef, itemSelector: ITEM});
return <><MyButton ref={trigger} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><MyButton ref={triggerRef} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger with a menu rendered only while open.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
const el = <>{open && <ul ref={menuRef} {...press.menuProps} />}</>;`,
      // A trigger and no menu the codemod can see.
      `useMenuPress({menuRef, triggerRef, itemSelector: ITEM});`,
      // An unused result: the old call spread no menuProps, so it ran no press.
      `useMenuPress({menuRef, itemSelector: ITEM, isEnabled});`,
      // A result read only for cancel: no menuProps spread either.
      `const {cancel} = useMenuPress({menuRef, itemSelector: ITEM});
return <i ref={menuRef} onBlur={cancel} />;`,
      // A trigger whose menu sits behind an early return.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
if (!open) return <b ref={triggerRef} {...press.triggerProps} />;
return <><b ref={triggerRef} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger that a component element mounts, which it may do in a
      // later commit, when the ref form does not read the trigger's ref.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><Tooltip><b ref={triggerRef} {...press.triggerProps} /></Tooltip><ul ref={menuRef} {...press.menuProps} /></>;`,
      `const trigger = useRef(null);
const press = useMenuPress({menuRef, itemSelector: ITEM});
return <><Tooltip><b ref={trigger} {...press.triggerProps} /></Tooltip><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger that a render callback mounts.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><Slot render={() => <b ref={triggerRef} {...press.triggerProps} />} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger whose menu renders in a render callback.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <Popover render={() => <ul ref={menuRef} {...press.menuProps} />} />;`,
      // A trigger whose menu is a child of a component element, which may hold
      // it back while closed.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><b ref={triggerRef} {...press.triggerProps} /><Popover isOpen={open}><ul ref={menuRef} {...press.menuProps} /></Popover></>;`,
      // A trigger whose menu is a JSX element passed as a prop.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <Popover content={<ul ref={menuRef} {...press.menuProps} />} />;`,
      // No trigger, and a menu that a component element mounts: it may do so
      // in a commit of its own.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <Popper open><ul ref={menuRef} {...press.menuProps} /></Popper>;`,
      // No trigger, and a menu passed as a prop.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <Popover content={<ul ref={menuRef} {...press.menuProps} />} />;`,
      // A menu element with its own press-down handler: the old spread and it
      // overrode each other by order, and the ref form runs both.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} onPointerDown={onDown} {...press.menuProps} />;`,
      // A menu element with another spread, which may carry a handler.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} {...rest} {...press.menuProps} />;`,
      // A trigger with its own context-menu handler after the spread.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><b ref={triggerRef} {...press.triggerProps} onContextMenu={onMenu} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger with its own press-down handler before the spread.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><b ref={triggerRef} onPointerDown={onDown} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger passed without its props spread: the old call gave it no
      // press, and the ref form would add one.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><b ref={triggerRef} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // A trigger whose menu spread sits on a component element, which may
      // mount its DOM only while open.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><b ref={triggerRef} {...press.triggerProps} /><Popover ref={menuRef} isOpen={open} {...press.menuProps} /></>;`,
      // No trigger, and the menu spread on a component element.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <List ref={menuRef} {...press.menuProps} />;`,
      // A trigger reached only through the spread whose ref is not provably a
      // ref object: a state setter, a member, and a merged ref.
      `const [anchor, setAnchor] = useState(null);
const press = useMenuPress({menuRef, itemSelector: ITEM});
return <><b ref={setAnchor} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <><b ref={refs.setReference} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      `const merged = useMergedRefs(local, forwarded);
const press = useMenuPress({menuRef, itemSelector: ITEM});
return <><b ref={merged} {...press.triggerProps} /><ul ref={menuRef} {...press.menuProps} /></>;`,
      // No trigger, and a menu in a render callback.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <Popover render={() => <ul ref={menuRef} {...press.menuProps} />} />;`,
      // A row that handles its own press-down. Its stop ran before the old
      // spread's handler; the ref form's own listener runs first.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} {...press.menuProps}><li role="menuitem" onPointerDown={stop}>A</li></ul>;`,
      // The same under the trigger.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <><button ref={triggerRef} {...press.triggerProps}><i onPointerDown={stop} /></button><ul ref={menuRef} {...press.menuProps} /></>;`,
      // Rows the codemod cannot read: the caller's children,
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} {...press.menuProps}>{children}</ul>;`,
      // a row component,
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} {...press.menuProps}><Row /></ul>;`,
      // and a row that spreads props.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
return <ul ref={menuRef} {...press.menuProps}><li {...rowProps}>A</li></ul>;`,
    ];
    for (const body of cases) {
      const source = `import {useMenuPress} from '@astryxdesign/core';
function A() {
${body}
}`;
      const output = await applyTransform(source);
      expect(output).toContain(TODO);
      // The call keeps its options form.
      expect(output).toContain(body.split('\n')[0]);
      const second = await applyTransform(output);
      expect(second).toBe(output);
    }
  });

  it('still rewrites a menu whose rows set other handlers', async () => {
    const output = flat(
      await applyTransform(`import {useMenuPress} from '@astryxdesign/core';
function A() {
  const press = useMenuPress({menuRef, itemSelector: ITEM});
  return <ul ref={menuRef} {...press.menuProps}><li role="menuitem" onClick={pick} onPointerUp={up}>A</li></ul>;
}`),
    );
    expect(output).toContain('useMenuPress(menuRef, { itemSelector: ITEM })');
    expect(output).not.toContain('menuProps');
    expect(output).not.toContain('TODO');
  });

  it('rewrites a menu without a trigger that its component renders only while open', async () => {
    const output = flat(
      await applyTransform(`import {useMenuPress} from '@astryxdesign/core';
function Menu() {
  const press = useMenuPress({menuRef, itemSelector: ITEM});
  return <div>{open ? <ul ref={menuRef} {...press.menuProps} /> : null}{open && <i />}</div>;
}`),
    );
    expect(output).toContain('useMenuPress(menuRef, { itemSelector: ITEM });');
    expect(output).toContain('<ul ref={menuRef} />');
    expect(output).not.toContain('TODO');
  });

  it('leaves the ref form, other hooks of the same name, and type-only imports alone', async () => {
    const source = `import {useMenuPress} from '@astryxdesign/core';
import {useMenuPress as localPress} from './local';
import type {UseMenuPressOptions} from '@astryxdesign/core';
function A() {
  useMenuPress(menuRef, {itemSelector: ITEM});
  localPress({menuRef, itemSelector: ITEM});
}`;
    expect(await applyTransform(source)).toBe(source);
  });

  it("drops a redundant forward of a trigger's handlers only beside a spread of the trigger props", async () => {
    const output = flat(
      await applyTransform(`import {DropdownMenu, type DropdownMenuTriggerProps} from '@astryxdesign/core';
const a = <DropdownMenu renderTrigger={props => <MyButton {...props} onPointerDown={props.onPointerDown} onContextMenu={props.onContextMenu} />} />;
function Trigger(props: DropdownMenuTriggerProps) {
  return <MyButton {...props} onPointerDown={props.onPointerDown} />;
}`),
    );
    expect(output).not.toContain('onPointerDown');
    expect(output).not.toContain('onContextMenu');
    expect(output).toContain(
      'renderTrigger={props => <MyButton {...props} />}',
    );
    expect(output).toContain('return <MyButton {...props} />;');
    expect(output).not.toContain('TODO');
  });

  it('drops a forward that a spread of the trigger props passes again, past another spread', async () => {
    const output = flat(
      await applyTransform(`import {DropdownMenu} from '@astryxdesign/core';
const a = <DropdownMenu renderTrigger={p => <MyButton {...tip} {...p} onPointerDown={p.onPointerDown} />} />;
const b = <DropdownMenu renderTrigger={p => <MyButton onContextMenu={p.onContextMenu} {...tip} {...p} />} />;`),
    );
    expect(output).toContain(
      'renderTrigger={p => <MyButton {...tip} {...p} />}',
    );
    expect(output).not.toContain('onPointerDown');
    expect(output).not.toContain('onContextMenu');
    expect(output).not.toContain('TODO');
  });

  it('still rewrites a trigger that its component renders behind a condition', async () => {
    const output =
      await applyTransform(`import {useMenuPress} from '@astryxdesign/core';
function A() {
const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <>{open && <b ref={triggerRef} {...press.triggerProps} />}<ul ref={menuRef} {...press.menuProps} /></>;
}`);
    expect(output).not.toContain('TODO');
    expect(flat(output)).toContain(
      'useMenuPress(menuRef, { triggerRef, itemSelector: ITEM })',
    );
    expect(output).not.toContain('triggerProps');
  });

  it('leaves every other forward of the trigger handlers as it is, with no TODO', async () => {
    const cases = [
      // Another spread stands between the props spread and the forward, so
      // the forward is what overrides that spread's handler.
      `const a = <DropdownMenu renderTrigger={p => <MyButton {...p} {...tooltipProps} onPointerDown={p.onPointerDown} />} />;`,
      // The element does not take the trigger's ref.
      `const a = <DropdownMenu renderTrigger={p => <MyButton id={p.id} onPointerDown={p.onPointerDown} />} />;`,
      // A composed handler.
      `const a = <DropdownMenu renderTrigger={p => <MyButton {...p} onPointerDown={e => { p.onPointerDown(e); mine(e); }} />} />;`,
      // A destructured handler passed elsewhere.
      `const a = <DropdownMenu renderTrigger={({onContextMenu, ...rest}) => <MyButton {...rest} menu={onContextMenu} />} />;`,
      // A destructured handler: the rest does not carry it.
      `const a = <DropdownMenu renderTrigger={({onPointerDown, ...rest}) => <MyButton {...rest} onPointerDown={onPointerDown} />} />;`,
      // The element takes the ref but spreads nothing.
      `const a = <DropdownMenu renderTrigger={p => <MyButton ref={p.ref} id={p.id} onPointerDown={p.onPointerDown} />} />;`,
    ];
    for (const body of cases) {
      const source = `import {DropdownMenu} from '@astryxdesign/core';
${body}`;
      expect(await applyTransform(source)).toBe(source);
    }
  });

  it('changes nothing on a second run', async () => {
    const once =
      await applyTransform(`import {useMenuPress, DropdownMenu} from '@astryxdesign/core';
function Menu() {
  const press = useMenuPress({menuRef, itemSelector: ITEM});
  return <><DropdownMenu renderTrigger={p => <b {...p} onPointerDown={p.onPointerDown} />} /><i ref={menuRef} {...press.menuProps} /></>;
}`);
    expect(once).not.toContain('menuProps');
    expect(await applyTransform(once)).toBe(once);
  });
});
