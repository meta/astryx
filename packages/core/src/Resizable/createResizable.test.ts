// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.test.ts
 * @input vitest (jsdom), createResizable with its internal channel, a stubbed
 *   ResizeObserver for a percentage basis
 * @output Checks the non-React resize region: collapse, expand and resize on
 *   request, a gesture through its model, bounds and snap points, a
 *   percentage basis, saving, update(), subscribe() and destroy
 * @position Unit tests for createResizable.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createResizable,
  readResizableInternals,
  type CreateResizableOptions,
  type ResizableController,
} from './createResizable';
import type {ResizeGestureModel} from './resizeGesture';

const controllers: ResizableController[] = [];

function create(options?: CreateResizableOptions): ResizableController {
  const controller = createResizable(null, options);
  controllers.push(controller);
  return controller;
}

/** The region's side of a gesture, as a ResizeHandle drives it. */
function modelOf(resizable: ResizableController): ResizeGestureModel {
  const model = readResizableInternals(resizable)?.model;
  if (model == null) {
    throw new Error('no internal channel');
  }
  return model;
}

/** What the region reports to a React form: its bounds included. */
function snapshotOf(resizable: ResizableController) {
  return readResizableInternals(resizable)?.snapshot();
}

/** A whole gesture through the model: a start, each move, and the end. */
function drag(resizable: ResizableController, ...deltas: number[]): void {
  const model = modelOf(resizable);
  model.start();
  for (const delta of deltas) {
    model.move(delta);
  }
  model.end();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.destroy();
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createResizable without React', () => {
  it('answers collapse, expand, resize and subscribe, and touches no element', () => {
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const onSizeChange = vi.fn();
    const resizable = create({
      defaultSize: 200,
      collapsible: true,
      onSizeChange,
    });
    const listener = vi.fn();
    resizable.subscribe(listener);
    resizable.collapse();
    expect(resizable.isCollapsed).toBe(true);
    expect(resizable.size).toBe(0);
    resizable.expand();
    expect(resizable.size).toBe(200);
    resizable.resize(260);
    expect(resizable.size).toBe(260);
    expect(onSizeChange).toHaveBeenLastCalledWith(260);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(added).not.toHaveBeenCalled();
  });

  it('collapses, expands and resizes on request, reporting each change', () => {
    const onSizeChange = vi.fn();
    const onCollapseChange = vi.fn();
    const resizable = create({
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      collapsible: true,
      onSizeChange,
      onCollapseChange,
    });
    resizable.resize(320);
    expect(resizable.size).toBe(320);
    expect(onSizeChange).toHaveBeenLastCalledWith(320);
    resizable.collapse();
    expect(resizable.isCollapsed).toBe(true);
    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    resizable.expand();
    expect(resizable.size).toBe(320);
    expect(onCollapseChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a collapse it does not make when the caller controls the collapse state', () => {
    const onCollapseChange = vi.fn();
    const resizable = create({
      defaultSize: 200,
      collapsible: true,
      isCollapsed: false,
      onCollapseChange,
    });
    resizable.collapse();
    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    expect(resizable.isCollapsed).toBe(false);
    resizable.update({
      defaultSize: 200,
      collapsible: true,
      isCollapsed: true,
      onCollapseChange,
    });
    expect(resizable.isCollapsed).toBe(true);
  });

  it('resizes through its model, clamped to its bounds, and rests only on a snap point when it has them', () => {
    const onSizeChange = vi.fn();
    const resizable = create({
      defaultSize: 200,
      minSize: 100,
      maxSize: 400,
      onSizeChange,
    });
    drag(resizable, 40);
    expect(resizable.size).toBe(240);
    expect(onSizeChange).toHaveBeenLastCalledWith(240);
    drag(resizable, 500);
    expect(resizable.size).toBe(400);
    drag(resizable, -500);
    expect(resizable.size).toBe(100);

    const snapping = create({
      defaultSize: 150,
      minSize: 100,
      maxSize: 400,
      snaps: [150, 300],
    });
    drag(snapping, 100);
    expect(snapping.size).toBe(300);
  });

  it('collapses a collapsible region dragged under its collapse size, and a drag reopens it', () => {
    const onCollapseChange = vi.fn();
    const resizable = create({
      defaultSize: 200,
      minSize: 100,
      collapsible: true,
      collapsedSize: 40,
      onCollapseChange,
    });
    drag(resizable, -180);
    expect(resizable.isCollapsed).toBe(true);
    expect(resizable.size).toBe(0);
    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    drag(resizable, 150);
    expect(resizable.isCollapsed).toBe(false);
    expect(resizable.size).toBe(150);
    expect(onCollapseChange).toHaveBeenLastCalledWith(false);
  });

  it('takes new options with update()', () => {
    const resizable = create({defaultSize: 300, minSize: 100, maxSize: 400});
    resizable.update({defaultSize: 300, minSize: 100, maxSize: 250});
    expect(resizable.size).toBe(250);
    expect(snapshotOf(resizable)?.maxPx).toBe(250);
  });

  it('takes the full set of options in update(): the region keeps its size and collapse state, and an option left out returns to its default', () => {
    const options = {
      defaultSize: 300,
      minSize: 200,
      maxSize: 400,
      collapsible: true,
    };
    const resizable = create(options);
    resizable.resize(350);
    resizable.collapse();
    resizable.update({...options, maxSize: 380});
    expect(resizable.isCollapsed).toBe(true);
    expect(snapshotOf(resizable)?.minPx).toBe(200);
    resizable.update(options);
    resizable.expand();
    expect(resizable.size).toBe(350);
    // Left out, as on a new render: the bounds return to their defaults.
    resizable.update({defaultSize: 300});
    expect(snapshotOf(resizable)?.minPx).toBe(50);
    expect(resizable.size).toBe(350);
  });

  it('calls subscribers after every change to its size or collapse state', () => {
    const resizable = create({defaultSize: 200, collapsible: true});
    const listener = vi.fn();
    const unsubscribe = resizable.subscribe(listener);
    drag(resizable, 10);
    expect(listener).toHaveBeenCalledTimes(1);
    resizable.collapse();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    resizable.expand();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('createResizable: a percentage basis', () => {
  // jsdom lays nothing out and ships no ResizeObserver.
  class StubResizeObserver {
    static instances: StubResizeObserver[] = [];
    callback: ResizeObserverCallback;
    targets: Element[] = [];
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      StubResizeObserver.instances.push(this);
    }
    observe(el: Element) {
      this.targets.push(el);
    }
    unobserve(el: Element) {
      this.targets = this.targets.filter(t => t !== el);
    }
    disconnect() {
      this.targets = [];
    }
    static resizeAll(inlineSize: number) {
      for (const o of StubResizeObserver.instances) {
        o.callback(
          o.targets.map(
            target =>
              ({
                target,
                contentBoxSize: [{inlineSize, blockSize: 300}],
              }) as unknown as ResizeObserverEntry,
          ),
          o,
        );
      }
    }
  }

  let width = 1000;

  beforeEach(() => {
    width = 1000;
    StubResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    // The first measurement reads the content box from the element.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      direction: 'ltr',
    } as CSSStyleDeclaration);
  });

  function makeContainer(): {current: HTMLElement} {
    const node = document.createElement('div');
    document.body.append(node);
    Object.defineProperty(node, 'clientWidth', {get: () => width});
    Object.defineProperty(node, 'clientHeight', {get: () => 300});
    return {current: node};
  }

  it('resolves a percentage against the container it is given', () => {
    const resizable = create({
      containerRef: makeContainer(),
      defaultSize: '30%',
      maxSize: '50%',
    });
    expect(resizable.size).toBe(300);
    expect(snapshotOf(resizable)?.maxPx).toBe(500);
    // A percentage bound follows its basis and clamps the selection.
    width = 400;
    StubResizeObserver.resizeAll(400);
    expect(resizable.size).toBe(200);
  });

  it('tells subscribers about a correction its basis makes, and reports no interaction for it', () => {
    width = 0;
    const onSizeChange = vi.fn();
    const resizable = create({
      containerRef: makeContainer(),
      defaultSize: '25%',
      onSizeChange,
    });
    const listener = vi.fn();
    resizable.subscribe(listener);
    width = 800;
    StubResizeObserver.resizeAll(800);
    expect(resizable.size).toBe(200);
    expect(listener).toHaveBeenCalled();
    expect(onSizeChange).not.toHaveBeenCalled();
  });
});

describe('createResizable: persistence', () => {
  it('saves its size once, when a gesture ends, and a new factory on the same key restores it', () => {
    const resizable = create({defaultSize: 200, autoSaveId: 'sidebar'});
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const model = modelOf(resizable);
    model.start();
    model.move(20);
    model.move(40);
    model.move(60);
    expect(setItem).not.toHaveBeenCalled();
    model.end();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(localStorage.getItem('astryx-resizable:sidebar') ?? ''),
    ).toEqual({size: 260, isCollapsed: false});
    expect(create({defaultSize: 200, autoSaveId: 'sidebar'}).size).toBe(260);
  });

  it('a cancelled gesture is still over: the size it reached is saved once', () => {
    const resizable = create({defaultSize: 200, autoSaveId: 'pane'});
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const model = modelOf(resizable);
    model.start();
    model.move(30);
    model.cancel();
    expect(resizable.size).toBe(230);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe('createResizable: destroy', () => {
  it('ends a gesture in flight and keeps the size it reached, then answers nothing', () => {
    const onSizeChange = vi.fn();
    const resizable = createResizable(null, {
      defaultSize: 200,
      autoSaveId: 'mid-gesture',
      onSizeChange,
    });
    const model = modelOf(resizable);
    model.start();
    model.move(25);
    onSizeChange.mockClear();

    resizable.destroy();
    expect(
      JSON.parse(localStorage.getItem('astryx-resizable:mid-gesture') ?? ''),
    ).toEqual({size: 225, isCollapsed: false});
    // Nothing answers afterwards, and a second destroy does nothing.
    resizable.resize(300);
    resizable.collapse();
    expect(onSizeChange).not.toHaveBeenCalled();
    resizable.destroy();
  });

  it('stops observing its container', () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect() {}
      },
    );
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperty(container, 'clientWidth', {get: () => 600});
    const resizable = createResizable(null, {
      containerRef: {current: container},
      maxSize: '50%',
    });
    expect(observe).toHaveBeenCalledWith(container);
    resizable.destroy();
    expect(unobserve).toHaveBeenCalledWith(container);
  });
});
