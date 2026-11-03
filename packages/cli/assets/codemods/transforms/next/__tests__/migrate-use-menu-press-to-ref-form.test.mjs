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
const TRIGGER_TODO =
  "TODO(astryx upgrade): the trigger props' onPointerDown and onContextMenu";

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

  it("passes the trigger's own ref as triggerRef when the press reached it only through the spread", async () => {
    const output = flat(
      await applyTransform(`import {useMenuPress as usePress} from '@astryxdesign/core';
function Menu() {
  const press = usePress({menuRef: refs.menu, itemSelector: ITEM});
  return (
    <>
      <button ref={refs.trigger} {...press.triggerProps} />
      <div ref={refs.menu} {...press.menuProps} />
    </>
  );
}`),
    );
    expect(output).toContain(
      'usePress(refs.menu, { itemSelector: ITEM, triggerRef: refs.trigger })',
    );
    expect(output).toContain('<button ref={refs.trigger} />');
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
      // The trigger props spread on an element without a ref.
      `const press = useMenuPress({menuRef, itemSelector: ITEM});
const el = <button {...press.triggerProps} />;`,
      // The trigger props spread on an element that is not the trigger.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
const el = <button ref={otherRef} {...press.triggerProps} />;`,
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
      // A trigger whose menu renders in a render callback.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <Popover render={() => <ul ref={menuRef} {...press.menuProps} />} />;`,
      // A trigger whose menu is a JSX element passed as a prop.
      `const press = useMenuPress({menuRef, triggerRef, itemSelector: ITEM});
return <Popover content={<ul ref={menuRef} {...press.menuProps} />} />;`,
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

  it("drops a forward of a trigger's deprecated handlers only beside a spread of the trigger props", async () => {
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

  it('leaves a TODO, and the forward, where it cannot prove the trigger keeps the press', async () => {
    const cases = [
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
      const output = await applyTransform(source);
      expect(output).toContain(TRIGGER_TODO);
      expect(output).toMatch(/onPointerDown|onContextMenu/);
      const second = await applyTransform(output);
      expect(second).toBe(output);
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
