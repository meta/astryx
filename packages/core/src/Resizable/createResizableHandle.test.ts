// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizableHandle.test.ts
 * @input vitest (jsdom), createResizable on plain elements
 * @output Checks the factory on a handle: the separator it makes, the pointer
 *   drag and its capture, bounds and snap points, right-to-left and reversal,
 *   the keyboard, collapse, collapsedLabel, disabled input, saving through a
 *   drag, and a destroy that leaves nothing behind
 * @position Unit tests for createResizable.ts's element path
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createResizable,
  type CreateResizableOptions,
  type ResizableController,
} from './createResizable';

const controllers: ResizableController[] = [];

function create(
  handle: HTMLElement | null,
  options?: CreateResizableOptions,
): ResizableController {
  const controller = createResizable(handle, options);
  controllers.push(controller);
  return controller;
}

/** A plain element that records pointer capture, as jsdom does not. */
function makeHandle(): {handle: HTMLElement; captured: () => number | null} {
  const handle = document.createElement('div');
  document.body.append(handle);
  let captured: number | null = null;
  handle.setPointerCapture = (id: number) => {
    captured = id;
  };
  handle.releasePointerCapture = (id: number) => {
    if (captured === id) {
      captured = null;
    }
  };
  handle.hasPointerCapture = (id: number) => captured === id;
  return {handle, captured: () => captured};
}

function pointer(
  target: Element,
  type: string,
  {x = 0, y = 0, id = 1}: {x?: number; y?: number; id?: number} = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  });
  target.dispatchEvent(event);
  return event;
}

function key(
  target: Element,
  name: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function drag(target: Element, from: number, to: number) {
  pointer(target, 'pointerdown', {x: from});
  pointer(target, 'pointermove', {x: to});
  pointer(target, 'pointerup', {x: to});
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.destroy();
  }
  document.body.innerHTML = '';
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createResizable on a plain element', () => {
  it('makes a plain element a window splitter: role, orientation, its value and a tab stop', () => {
    const {handle} = makeHandle();
    create(handle, {defaultSize: 200, minSize: 100, maxSize: 400});
    expect(handle.getAttribute('role')).toBe('separator');
    // A horizontal region resizes along the inline axis: a vertical splitter.
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('200');
    expect(handle.getAttribute('aria-valuemin')).toBe('100');
    expect(handle.getAttribute('aria-valuemax')).toBe('400');
    expect(handle.tabIndex).toBe(0);
  });

  it('keeps a role, a name and a tab stop the element already has', () => {
    const {handle} = makeHandle();
    handle.setAttribute('aria-label', 'Sidebar width');
    handle.tabIndex = -1;
    create(handle, {defaultSize: 200, label: 'Ignored'});
    expect(handle.getAttribute('aria-label')).toBe('Sidebar width');
    expect(handle.tabIndex).toBe(-1);
  });

  it('names the element with `label` when it has no name', () => {
    const {handle} = makeHandle();
    create(handle, {defaultSize: 200, label: 'Sidebar width'});
    expect(handle.getAttribute('aria-label')).toBe('Sidebar width');
  });

  it('resizes on a pointer drag, reporting each size, and holds the pointer for the whole drag', () => {
    const {handle, captured} = makeHandle();
    const onSizeChange = vi.fn();
    const resizable = create(handle, {
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      onSizeChange,
    });
    pointer(handle, 'pointerdown', {x: 10});
    expect(captured()).toBe(1);
    pointer(handle, 'pointermove', {x: 60});
    expect(onSizeChange).toHaveBeenLastCalledWith(250);
    expect(resizable.size).toBe(250);
    expect(handle.getAttribute('aria-valuenow')).toBe('250');
    pointer(handle, 'pointerup', {x: 60});
    expect(captured()).toBeNull();
  });

  it('marks the element while a drag is in flight', () => {
    const {handle} = makeHandle();
    create(handle, {defaultSize: 200});
    pointer(handle, 'pointerdown', {x: 0});
    expect(handle.hasAttribute('data-resizing')).toBe(true);
    pointer(handle, 'pointerup', {x: 0});
    expect(handle.hasAttribute('data-resizing')).toBe(false);
  });

  it('clamps a drag to its bounds, and rests only on a snap point when it has them', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
    });
    drag(handle, 0, 500);
    expect(resizable.size).toBe(400);
    drag(handle, 0, -500);
    expect(resizable.size).toBe(100);

    const snapped = makeHandle();
    const snapping = create(snapped.handle, {
      defaultSize: 150,
      minSize: 100,
      maxSize: 400,
      snaps: [150, 300],
    });
    drag(snapped.handle, 0, 100);
    expect(snapping.size).toBe(300);
  });

  it('follows the pointer under right-to-left, and a reversed handle grows the other way', () => {
    const {handle} = makeHandle();
    handle.style.direction = 'rtl';
    const rtl = create(handle, {defaultSize: 200, minSize: 100, maxSize: 400});
    drag(handle, 0, 50);
    expect(rtl.size).toBe(150);

    const reversed = makeHandle();
    const end = create(reversed.handle, {
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      isReversed: true,
    });
    drag(reversed.handle, 0, 50);
    expect(end.size).toBe(150);
  });

  it('resizes from the keyboard: arrows step 10, Shift steps 50, Home and End reach the bounds', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
    });
    expect(key(handle, 'ArrowRight').defaultPrevented).toBe(true);
    expect(resizable.size).toBe(210);
    key(handle, 'ArrowLeft', {shiftKey: true});
    expect(resizable.size).toBe(160);
    key(handle, 'End');
    expect(resizable.size).toBe(400);
    key(handle, 'Home');
    expect(resizable.size).toBe(100);
  });

  it('announces collapsedLabel while collapsed instead of the catalog message, and takes a new one through update()', () => {
    const {handle} = makeHandle();
    const options = {
      defaultSize: 200,
      collapsible: true,
      collapsedLabel: 'Sidebar hidden',
    };
    const resizable = create(handle, options);
    resizable.collapse();
    expect(handle.getAttribute('aria-valuetext')).toBe('Sidebar hidden');
    resizable.update({...options, collapsedLabel: 'Panneau masqué'});
    expect(handle.getAttribute('aria-valuetext')).toBe('Panneau masqué');
    // Left out, it is the shipped English catalog's message again.
    resizable.update({defaultSize: 200, collapsible: true});
    expect(handle.getAttribute('aria-valuetext')).toBe('Collapsed');
  });

  it('collapses a collapsible region on Enter and on a double-click, and restores its size', () => {
    const {handle} = makeHandle();
    const onCollapseChange = vi.fn();
    const resizable = create(handle, {
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      collapsible: true,
      onCollapseChange,
    });
    key(handle, 'Enter');
    expect(resizable.isCollapsed).toBe(true);
    expect(resizable.size).toBe(0);
    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    // A collapsed pane announces its minimum and says it is collapsed.
    expect(handle.getAttribute('aria-valuenow')).toBe('100');
    expect(handle.getAttribute('aria-valuetext')).toBe('Collapsed');
    key(handle, 'Enter');
    expect(resizable.isCollapsed).toBe(false);
    expect(resizable.size).toBe(200);
    expect(handle.hasAttribute('aria-valuetext')).toBe(false);

    handle.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(resizable.isCollapsed).toBe(true);
    handle.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(resizable.size).toBe(200);
  });

  it('collapses a collapsible region dragged under its collapse size', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {
      defaultSize: 200,
      minSize: 100,
      collapsible: true,
      collapsedSize: 40,
    });
    drag(handle, 200, 20);
    expect(resizable.isCollapsed).toBe(true);
    expect(resizable.size).toBe(0);
  });

  it('ignores pointer and keyboard input while disabled, says so, and keeps its tab stop, as ResizeHandle does', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {defaultSize: 200, isDisabled: true});
    expect(handle.getAttribute('aria-disabled')).toBe('true');
    expect(handle.tabIndex).toBe(0);
    drag(handle, 0, 80);
    key(handle, 'ArrowRight');
    expect(resizable.size).toBe(200);
  });

  it('holds the pointer for a handle in another document, such as an iframe, and puts the drag cursor on the page', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument as Document;
    const handle = frameDocument.createElement('div');
    frameDocument.body.append(handle);
    let captured: number | null = null;
    handle.setPointerCapture = (id: number) => {
      captured = id;
    };
    handle.releasePointerCapture = (id: number) => {
      if (captured === id) {
        captured = null;
      }
    };
    handle.hasPointerCapture = (id: number) => captured === id;
    const sizes: number[] = [];
    create(handle, {defaultSize: 200, onSizeChange: size => sizes.push(size)});
    pointer(handle, 'pointerdown', {x: 0});
    expect(captured).toBe(1);
    expect(document.body.style.cursor).toBe('col-resize');
    pointer(handle, 'pointermove', {x: 30});
    pointer(handle, 'pointerup', {x: 30});
    expect(sizes.at(-1)).toBe(230);
    expect(captured).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('takes new options with update()', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {
      defaultSize: 300,
      minSize: 100,
      maxSize: 400,
    });
    resizable.update({defaultSize: 300, minSize: 100, maxSize: 250});
    expect(resizable.size).toBe(250);
    expect(handle.getAttribute('aria-valuemax')).toBe('250');
  });

  it('takes the full set of options in update(): the region keeps its size and collapse state, and an option left out returns to its default', () => {
    const {handle} = makeHandle();
    const options = {
      defaultSize: 300,
      minSize: 200,
      maxSize: 400,
      collapsible: true,
      label: 'Sidebar width',
    };
    const resizable = create(handle, options);
    resizable.resize(350);
    resizable.collapse();
    resizable.update({...options, isDisabled: true});
    expect(resizable.isCollapsed).toBe(true);
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-label')).toBe('Sidebar width');
    expect(handle.getAttribute('aria-disabled')).toBe('true');
    resizable.update(options);
    resizable.expand();
    expect(resizable.size).toBe(350);
    // Left out, as on a new render: the bounds and the name return to their
    // defaults, and a region that cannot collapse is open.
    resizable.update({defaultSize: 300});
    expect(handle.getAttribute('aria-valuemin')).toBe('50');
    expect(handle.getAttribute('aria-label')).toBe('Resize handle');
  });

  it('resizes a vertical region from vertical moves and the up and down arrows', () => {
    const {handle} = makeHandle();
    const resizable = create(handle, {
      direction: 'vertical',
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
    });
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
    pointer(handle, 'pointerdown', {y: 0});
    pointer(handle, 'pointermove', {y: 30});
    pointer(handle, 'pointerup', {y: 30});
    expect(resizable.size).toBe(230);
    key(handle, 'ArrowUp');
    expect(resizable.size).toBe(220);
  });
});

describe('createResizable on a plain element: persistence', () => {
  it('saves its size once, when a drag ends, and a new factory on the same key restores it', () => {
    const {handle} = makeHandle();
    create(handle, {defaultSize: 200, autoSaveId: 'sidebar'});
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    pointer(handle, 'pointerdown', {x: 0});
    pointer(handle, 'pointermove', {x: 20});
    pointer(handle, 'pointermove', {x: 40});
    pointer(handle, 'pointermove', {x: 60});
    expect(setItem).not.toHaveBeenCalled();
    pointer(handle, 'pointerup', {x: 60});
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(localStorage.getItem('astryx-resizable:sidebar') ?? ''),
    ).toEqual({
      size: 260,
      isCollapsed: false,
    });

    const next = makeHandle();
    expect(
      create(next.handle, {defaultSize: 200, autoSaveId: 'sidebar'}).size,
    ).toBe(260);
  });

  it('a drag the browser cancels ends there: the pointer is freed and the size it reached is saved once', () => {
    const {handle, captured} = makeHandle();
    const resizable = create(handle, {defaultSize: 200, autoSaveId: 'pane'});
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    pointer(handle, 'pointerdown', {x: 0});
    pointer(handle, 'pointermove', {x: 30});
    pointer(handle, 'pointercancel', {x: 30});
    expect(captured()).toBeNull();
    expect(resizable.size).toBe(230);
    expect(document.body.style.cursor).toBe('');
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe('createResizable on a plain element: destroy', () => {
  /** Live listeners added through `target`, by type. */
  function trackListeners(target: EventTarget): Map<string, number> {
    const live = new Map<string, number>();
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        live.set(type, (live.get(type) ?? 0) + 1);
        add(type, listener, options);
      },
    );
    vi.spyOn(target, 'removeEventListener').mockImplementation(
      (type, listener, options) => {
        live.set(type, (live.get(type) ?? 0) - 1);
        remove(type, listener, options);
      },
    );
    return live;
  }

  function expectNone(live: Map<string, number>) {
    for (const [type, count] of live) {
      expect({type, count: Math.max(count, 0)}).toEqual({type, count: 0});
    }
  }

  it('leaves no listener, capture, attribute or body style behind, even mid-drag', () => {
    const {handle, captured} = makeHandle();
    const before = handle.outerHTML;
    const onHandle = trackListeners(handle);
    const onDocument = trackListeners(document);
    const onWindow = trackListeners(window);
    const onSizeChange = vi.fn();
    const resizable = createResizable(handle, {
      defaultSize: 200,
      autoSaveId: 'mid-drag',
      onSizeChange,
    });
    pointer(handle, 'pointerdown', {x: 0});
    pointer(handle, 'pointermove', {x: 25});
    expect(document.body.style.cursor).not.toBe('');
    onSizeChange.mockClear();

    resizable.destroy();
    expectNone(onHandle);
    expectNone(onDocument);
    expectNone(onWindow);
    expect(captured()).toBeNull();
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(handle.outerHTML).toBe(before);
    // The size the interrupted drag reached is kept.
    expect(
      JSON.parse(localStorage.getItem('astryx-resizable:mid-drag') ?? ''),
    ).toEqual({size: 225, isCollapsed: false});
    // Nothing answers afterwards, and a second destroy does nothing.
    pointer(handle, 'pointermove', {x: 90});
    key(handle, 'ArrowRight');
    expect(onSizeChange).not.toHaveBeenCalled();
    resizable.destroy();
  });
});
