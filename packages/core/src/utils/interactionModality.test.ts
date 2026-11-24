// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionModality.test.ts
 * @input The interaction-modality utility loaded more than once
 * @output Verifies document-wide continuity, shared Shift-key modality policy,
 *   and a second document's separate value
 * @position Unit coverage for interactionModality.ts
 */

import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi, type MockInstance} from 'vitest';
import {renderHook} from '@testing-library/react';

const isolatedDocument = document.implementation.createHTMLDocument();

async function loadTracker() {
  vi.resetModules();
  return import('./interactionModality');
}

/** The rings come back at the start of the next frame. */
async function nextFrame(view: Window): Promise<void> {
  await new Promise<void>(resolve =>
    view.requestAnimationFrame(() => resolve()),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('interactionModality', () => {
  it.each(['Shift', 'Tab', 'ArrowRight'])(
    'counts %s with Shift held as keyboard input',
    async key => {
      const targetDocument = document.implementation.createHTMLDocument();
      vi.stubGlobal('document', targetDocument);
      const tracker = await loadTracker();
      tracker.__startInteractionModalityTrackingForTest();
      targetDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality()).toBe('pointer');

      targetDocument.dispatchEvent(
        new KeyboardEvent('keydown', {key, shiftKey: true}),
      );
      expect(tracker.getInteractionModality()).toBe('keyboard');
    },
  );

  it('does not touch the document when the module loads', async () => {
    vi.stubGlobal('document', isolatedDocument);
    const addEventListener = vi.spyOn(isolatedDocument, 'addEventListener');

    await loadTracker();

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('shares one listener pair and tracks input between consumers', async () => {
    vi.stubGlobal('document', isolatedDocument);
    const addEventListener = vi.spyOn(isolatedDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(
      isolatedDocument,
      'removeEventListener',
    );
    const firstModule = await loadTracker();
    const secondModule = await loadTracker();

    const firstConsumer =
      firstModule.__startInteractionModalityTrackingForTest();
    const secondConsumer =
      secondModule.__startInteractionModalityTrackingForTest();

    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1);

    isolatedDocument.dispatchEvent(new Event('pointerdown'));
    expect(secondModule.getInteractionModality()).toBe('pointer');

    firstConsumer();
    secondConsumer();
    isolatedDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(firstModule.getInteractionModality()).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    secondModule.__startInteractionModalityTrackingForTest()();
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1);
  });

  it("keeps a second document's input apart from the page's", async () => {
    const pageDocument = document.implementation.createHTMLDocument();
    const secondDocument = document.implementation.createHTMLDocument();
    vi.stubGlobal('document', pageDocument);
    const tracker = await loadTracker();
    tracker.__startInteractionModalityTrackingForTest();
    tracker.__trackInteractionModalityInForTest(secondDocument);

    pageDocument.dispatchEvent(new Event('pointerdown'));
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(tracker.getInteractionModality()).toBe('pointer');
    expect(tracker.getInteractionModality(pageDocument)).toBe('pointer');
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');

    secondDocument.dispatchEvent(new Event('pointerdown'));
    pageDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality()).toBe('keyboard');
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');
  });

  it("switches each document's focus rings off after a pointer press and on after a navigation key", async () => {
    const pageDocument = document.implementation.createHTMLDocument();
    const secondDocument = document.implementation.createHTMLDocument();
    vi.stubGlobal('document', pageDocument);
    const tracker = await loadTracker();
    tracker.__startInteractionModalityTrackingForTest();
    tracker.__trackInteractionModalityInForTest(secondDocument);
    const ring = (target: Document) =>
      target.documentElement.style.getPropertyValue('--_focus-ring');
    // No input yet: no override, so the rings read their keyboard default.
    expect(ring(pageDocument)).toBe('');
    pageDocument.dispatchEvent(new Event('pointerdown'));
    expect(ring(pageDocument)).toBe('0');
    expect(ring(secondDocument)).toBe('');
    // Option+Tab moves focus in Safari, so it shows the rings again.
    pageDocument.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Tab', altKey: true}),
    );
    expect(ring(pageDocument)).toBe('');
    // A modifier press leaves the modality alone.
    expect(tracker.getInteractionModality(pageDocument)).toBe('pointer');
    // Any key that makes the modality keyboard shows them, typing included.
    pageDocument.dispatchEvent(new Event('pointerdown'));
    expect(ring(pageDocument)).toBe('0');
    const field = pageDocument.createElement('input');
    pageDocument.body.append(field);
    field.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'a', bubbles: true, composed: true}),
    );
    expect(ring(pageDocument)).toBe('');
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(ring(secondDocument)).toBe('0');
    expect(ring(pageDocument)).toBe('');
  });

  it('shows the rings for focus that comes back from a child frame or another window with no press here', async () => {
    // A document with its own window, so the window's blur reaches the store.
    const host = document.createElement('iframe');
    document.body.append(host);
    const pageDocument = host.contentDocument as Document;
    const pageWindow = pageDocument.defaultView as Window;
    vi.stubGlobal('document', pageDocument);
    const tracker = await loadTracker();
    tracker.__startInteractionModalityTrackingForTest();
    const ring = () =>
      pageDocument.documentElement.style.getPropertyValue('--_focus-ring');
    const first = pageDocument.createElement('button');
    const frame = pageDocument.createElement('iframe');
    const next = pageDocument.createElement('button');
    pageDocument.body.append(first, frame, next);
    const focusIn = (target: Element) =>
      target.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    const leaveWindow = (activeElement: Element) => {
      vi.spyOn(pageDocument, 'activeElement', 'get').mockReturnValue(
        activeElement,
      );
      pageWindow.dispatchEvent(new FocusEvent('blur'));
      vi.restoreAllMocks();
    };

    try {
      // A press on the page, then focus into a frame and back out by keyboard.
      pageDocument.dispatchEvent(new Event('pointerdown'));
      expect(ring()).toBe('0');
      leaveWindow(frame);
      focusIn(next);
      await nextFrame(pageWindow);
      expect(ring()).toBe('');

      // A press that brings focus back from the frame keeps the rings off.
      pageDocument.dispatchEvent(new Event('pointerdown'));
      leaveWindow(frame);
      pageDocument.dispatchEvent(new Event('pointerdown'));
      focusIn(first);
      expect(ring()).toBe('0');

      // The window giving focus back to the element it left is a restore.
      leaveWindow(first);
      focusIn(first);
      expect(ring()).toBe('0');
      // Focus that comes back to another element moved by keyboard.
      leaveWindow(first);
      focusIn(next);
      await nextFrame(pageWindow);
      expect(ring()).toBe('');
    } finally {
      host.remove();
    }
  });

  it("releases a second document's listeners with its last consumer", async () => {
    const secondDocument = document.implementation.createHTMLDocument();
    const tracker = await loadTracker();
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const releaseFirst =
      tracker.__trackInteractionModalityInForTest(secondDocument);
    const releaseSecond =
      tracker.__trackInteractionModalityInForTest(secondDocument);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    releaseFirst();
    releaseFirst();
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    releaseSecond();
    expect(removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual(
      ['keydown', 'pointerdown'],
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
  });

  it("hears a second window's focus and blur through the input stream, and stops with its last consumer", async () => {
    const host = document.createElement('iframe');
    document.body.append(host);
    const secondDocument = host.contentDocument as Document;
    const secondWindow = secondDocument.defaultView as Window;
    const tracker = await loadTracker();
    const documentAdd = vi.spyOn(secondDocument, 'addEventListener');
    const windowAdd = vi.spyOn(secondWindow, 'addEventListener');
    const windowRemove = vi.spyOn(secondWindow, 'removeEventListener');
    try {
      const release =
        tracker.__trackInteractionModalityInForTest(secondDocument);
      secondDocument.dispatchEvent(new Event('pointerdown'));
      expect(documentAdd.mock.calls.map(([type]) => type)).not.toContain(
        'focusin',
      );
      expect(windowAdd.mock.calls.map(([type]) => type).sort()).toEqual([
        'blur',
        'focusin',
      ]);
      release();
      expect(windowRemove.mock.calls.map(([type]) => type).sort()).toEqual([
        'blur',
        'focusin',
      ]);
    } finally {
      host.remove();
    }
  });

  it('turns the rings back on at the next frame, and a press before that frame keeps them off', async () => {
    const host = document.createElement('iframe');
    document.body.append(host);
    const secondDocument = host.contentDocument as Document;
    const secondWindow = secondDocument.defaultView as Window;
    const tracker = await loadTracker();
    const ring = () =>
      secondDocument.documentElement.style.getPropertyValue('--_focus-ring');
    try {
      const release =
        tracker.__trackInteractionModalityInForTest(secondDocument);
      secondDocument.dispatchEvent(new Event('pointerdown'));
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      expect(ring()).toBe('0');
      await nextFrame(secondWindow);
      expect(ring()).toBe('');

      secondDocument.dispatchEvent(new Event('pointerdown'));
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      secondDocument.dispatchEvent(new Event('pointerdown'));
      await nextFrame(secondWindow);
      expect(ring()).toBe('0');
      release();
    } finally {
      host.remove();
    }
  });

  it('keeps hearing a second window across a release and hold in one commit', async () => {
    const host = document.createElement('iframe');
    document.body.append(host);
    const secondDocument = host.contentDocument as Document;
    const secondWindow = secondDocument.defaultView as Window;
    const tracker = await loadTracker();
    const ring = () =>
      secondDocument.documentElement.style.getPropertyValue('--_focus-ring');
    const first = secondDocument.createElement('button');
    const next = secondDocument.createElement('button');
    secondDocument.body.append(first, next);
    try {
      let release = tracker.__trackInteractionModalityInForTest(secondDocument);
      secondDocument.dispatchEvent(new Event('pointerdown'));
      expect(ring()).toBe('0');

      // An object-ref consumer releases and holds again after a commit.
      release();
      release = tracker.__trackInteractionModalityInForTest(secondDocument);
      await Promise.resolve();
      expect(ring()).toBe('0');

      // Focus leaves the window, then comes back by keyboard to another
      // element: the rings show on that first stop.
      vi.spyOn(secondDocument, 'activeElement', 'get').mockReturnValue(first);
      secondWindow.dispatchEvent(new FocusEvent('blur'));
      vi.restoreAllMocks();
      next.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
      await nextFrame(secondWindow);
      expect(ring()).toBe('');
      release();
    } finally {
      host.remove();
    }
  });

  it("drops a second document's ring override with its last consumer, but not across a release and hold in one commit", async () => {
    const secondDocument = document.implementation.createHTMLDocument();
    const tracker = await loadTracker();
    const ring = () =>
      secondDocument.documentElement.style.getPropertyValue('--_focus-ring');
    let release = tracker.__trackInteractionModalityInForTest(secondDocument);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(ring()).toBe('0');

    // An object-ref consumer releases and holds again after every commit.
    release();
    release = tracker.__trackInteractionModalityInForTest(secondDocument);
    await Promise.resolve();
    expect(ring()).toBe('0');

    // The last release drops it, so keyboard focus there still rings.
    release();
    await Promise.resolve();
    expect(ring()).toBe('');
  });

  it("tracks a hook consumer's object-ref document until its last consumer unmounts", async () => {
    const tracker = await loadTracker();
    const secondDocument = document.implementation.createHTMLDocument();
    const addEventListener = vi.spyOn(secondDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const elementRef = {current: secondDocument.createElement('div')};

    const first = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    const second = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    // One listener pair for the document, however many components track it.
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    // A re-render keeps the same tracking; it neither adds nor drops it.
    first.rerender();
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    expect(removeEventListener).not.toHaveBeenCalled();

    first.unmount();
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
    expect(removeEventListener).not.toHaveBeenCalled();

    // The last component in that document unmounts: tracking there stops.
    second.unmount();
    expect(removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual(
      ['keydown', 'pointerdown'],
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('keyboard');
  });

  it("keeps the page's document-lifetime tracking for a component on the page", async () => {
    const tracker = await loadTracker();
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const elementRef = {current: document.createElement('div')};
    const {unmount} = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    document.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality()).toBe('pointer');
    unmount();
    expect(
      removeEventListener.mock.calls.filter(
        ([type]) => type === 'pointerdown' || type === 'keydown',
      ),
    ).toHaveLength(0);
  });

  it('moves the tracking when the element moves to another document', async () => {
    const tracker = await loadTracker();
    const firstDocument = document.implementation.createHTMLDocument();
    const secondDocument = document.implementation.createHTMLDocument();
    const firstRemove = vi.spyOn(firstDocument, 'removeEventListener');
    const elementRef: {current: Element | null} = {
      current: firstDocument.createElement('div'),
    };
    const {rerender, unmount} = renderHook(() =>
      tracker.useInteractionModalityTrackingFor(elementRef),
    );
    elementRef.current = secondDocument.createElement('div');
    rerender();
    expect(firstRemove.mock.calls.map(([type]) => type).sort()).toEqual([
      'keydown',
      'pointerdown',
    ]);
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');
    unmount();
  });

  it('releases an object-ref document when the element detaches, and holds one under StrictMode replay', async () => {
    const tracker = await loadTracker();
    const {StrictMode, createElement} = await import('react');
    const secondDocument = document.implementation.createHTMLDocument();
    const addEventListener = vi.spyOn(secondDocument, 'addEventListener');
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const elementRef: {current: Element | null} = {
      current: secondDocument.createElement('div'),
    };
    const listeners = (spy: typeof addEventListener) =>
      spy.mock.calls.filter(([type]) => type === 'pointerdown').length;

    const {rerender, unmount} = renderHook(
      () => tracker.useInteractionModalityTrackingFor(elementRef),
      {wrapper: ({children}) => createElement(StrictMode, null, children)},
    );
    // StrictMode replays the effects; one hold remains.
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      1,
    );
    secondDocument.dispatchEvent(new Event('pointerdown'));
    expect(tracker.getInteractionModality(secondDocument)).toBe('pointer');

    // `null` detachment releases the document.
    elementRef.current = null;
    rerender();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      0,
    );

    // Re-attaching tracks it again; unmount releases it.
    elementRef.current = secondDocument.createElement('div');
    rerender();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      1,
    );
    unmount();
    expect(listeners(addEventListener) - listeners(removeEventListener)).toBe(
      0,
    );
  });

  describe('the callback ref a component attaches', () => {
    async function renderInFrame(element: ReactNode) {
      const {createRoot} = await import('react-dom/client');
      const {act} = await import('react');
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      const frameDocument = frame.contentDocument!;
      const container = frameDocument.createElement('div');
      frameDocument.body.appendChild(container);
      const root = createRoot(container);
      const render = async (next: ReactNode) => {
        await act(async () => {
          root.render(next);
        });
      };
      await render(element);
      return {
        frameDocument,
        render,
        unmount: async () => {
          await act(async () => {
            root.unmount();
          });
          frame.remove();
        },
      };
    }

    function listenerCount(add: MockInstance, remove: MockInstance) {
      const count = (spy: MockInstance) =>
        spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
      return count(add) - count(remove);
    }

    it('holds the element document once, keeps it across re-renders, and releases it with the last component', async () => {
      const tracker = await loadTracker();
      const {createElement: h, Fragment} = await import('react');
      function Probe() {
        const {ref} = tracker.useInteractionModalityTracking();
        return h('div', {ref});
      }
      const both = h(
        Fragment,
        null,
        h(Probe, {key: 'a'}),
        h(Probe, {key: 'b'}),
      );
      const frame = await renderInFrame(both);
      const add = vi.spyOn(frame.frameDocument, 'addEventListener');
      const remove = vi.spyOn(frame.frameDocument, 'removeEventListener');
      // Spies attach after the first render; re-render to prove no churn.
      await frame.render(both);
      expect(add).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      frame.frameDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality(frame.frameDocument)).toBe(
        'pointer',
      );

      await frame.render(h(Fragment, null, h(Probe, {key: 'a'})));
      expect(remove).not.toHaveBeenCalled();
      await frame.render(h(Fragment, null));
      expect(remove.mock.calls.map(([type]) => type).sort()).toEqual([
        'keydown',
        'pointerdown',
      ]);
      await frame.unmount();
    });

    it('releases the old node before holding a replacement, and holds one under StrictMode', async () => {
      const tracker = await loadTracker();
      const {createElement: h, StrictMode} = await import('react');
      function Probe({tag}: {tag: 'div' | 'span'}) {
        const {ref} = tracker.useInteractionModalityTracking();
        return h(tag, {ref});
      }
      const frame = await renderInFrame(
        h(StrictMode, null, h(Probe, {tag: 'div'})),
      );
      const add = vi.spyOn(frame.frameDocument, 'addEventListener');
      const remove = vi.spyOn(frame.frameDocument, 'removeEventListener');
      // A different tag replaces the node: the old hold releases first, so the
      // document's listeners are removed and added back, one pair at the end.
      await frame.render(h(StrictMode, null, h(Probe, {tag: 'span'})));
      expect(listenerCount(add, remove)).toBe(0);
      expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
        add.mock.invocationCallOrder[0],
      );
      frame.frameDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.getInteractionModality(frame.frameDocument)).toBe(
        'pointer',
      );
      await frame.unmount();
      expect(listenerCount(add, remove)).toBe(-1);
    });

    it('reads the element document, and the page before it attaches', async () => {
      const tracker = await loadTracker();
      const {result} = renderHook(() =>
        tracker.useInteractionModalityTracking(),
      );
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('pointer');
      const secondDocument = document.implementation.createHTMLDocument();
      const node = secondDocument.createElement('div');
      const cleanup = result.current.ref(node);
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      expect(result.current.readModality()).toBe('keyboard');
      // React's ref cleanup and a later `null` call release it only once.
      const remove = vi.spyOn(secondDocument, 'removeEventListener');
      cleanup?.();
      result.current.ref(null);
      expect(
        remove.mock.calls.filter(([type]) => type === 'pointerdown'),
      ).toHaveLength(1);
      // A detached element no longer answers from its old document.
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('pointer');
    });

    it('forgets the node when React runs the ref cleanup instead of a null call', async () => {
      const tracker = await loadTracker();
      const {result} = renderHook(() =>
        tracker.useInteractionModalityTracking(),
      );
      const secondDocument = document.implementation.createHTMLDocument();
      const cleanup = result.current.ref(secondDocument.createElement('div'));
      secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      document.dispatchEvent(new Event('pointerdown'));
      expect(result.current.readModality()).toBe('keyboard');
      cleanup?.();
      expect(result.current.readModality()).toBe('pointer');
    });
  });

  describe('text entry since the last pointer press', () => {
    async function trackIn(targetDocument: Document) {
      vi.stubGlobal('document', targetDocument);
      const tracker = await loadTracker();
      tracker.__startInteractionModalityTrackingForTest();
      const field = targetDocument.createElement('input');
      field.type = 'text';
      const button = targetDocument.createElement('button');
      targetDocument.body.append(field, button);
      const press = (target: Element, key: string) =>
        target.dispatchEvent(
          new KeyboardEvent('keydown', {key, bubbles: true}),
        );
      return {tracker, field, button, press};
    }

    it('is false before any input', async () => {
      const {tracker} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      expect(tracker.isTextEntrySincePointer()).toBe(false);
    });

    it.each(['a', ' ', 'Backspace', 'Delete', 'Enter', 'Unidentified'])(
      'stays true while %s types into a text field, and the modality turns to keyboard',
      async key => {
        const {tracker, field, press} = await trackIn(
          document.implementation.createHTMLDocument(),
        );
        field.ownerDocument.dispatchEvent(new Event('pointerdown'));
        expect(tracker.isTextEntrySincePointer()).toBe(true);

        press(field, key);

        expect(tracker.getInteractionModality()).toBe('keyboard');
        expect(tracker.isTextEntrySincePointer()).toBe(true);
      },
    );

    it('stays true while an emoji, one character of two code units, types into a text field', async () => {
      const {tracker, field, press} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      field.ownerDocument.dispatchEvent(new Event('pointerdown'));

      press(field, '\u{1F600}');

      expect(tracker.isTextEntrySincePointer()).toBe(true);
    });

    it('turns false for a key of more than one character that is not a text-entry key', async () => {
      const {tracker, field, press} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      field.ownerDocument.dispatchEvent(new Event('pointerdown'));

      press(field, 'ab');

      expect(tracker.isTextEntrySincePointer()).toBe(false);
    });

    it.each(['Tab', 'Escape', 'ArrowLeft', 'ArrowDown', 'Home'])(
      'turns false when %s navigates from a text field',
      async key => {
        const {tracker, field, press} = await trackIn(
          document.implementation.createHTMLDocument(),
        );
        field.ownerDocument.dispatchEvent(new Event('pointerdown'));
        press(field, 'a');

        press(field, key);

        expect(tracker.isTextEntrySincePointer()).toBe(false);
      },
    );

    it.each(['date', 'time', 'month', 'week'])(
      'stays true while a key types into a %s field',
      async type => {
        const {tracker, field, press} = await trackIn(
          document.implementation.createHTMLDocument(),
        );
        field.type = type;
        field.ownerDocument.dispatchEvent(new Event('pointerdown'));

        press(field, '1');

        expect(tracker.isTextEntrySincePointer()).toBe(true);
      },
    );

    it.each([
      ['read-only', (field: HTMLInputElement) => (field.readOnly = true)],
      ['disabled', (field: HTMLInputElement) => (field.disabled = true)],
      [
        'inputmode="none"',
        (field: HTMLInputElement) => field.setAttribute('inputmode', 'none'),
      ],
    ])(
      'turns false for a character key in a field that is %s, which brings up no keyboard',
      async (_, setUp) => {
        const {tracker, field, press} = await trackIn(
          document.implementation.createHTMLDocument(),
        );
        setUp(field);
        field.ownerDocument.dispatchEvent(new Event('pointerdown'));

        press(field, 'a');

        expect(tracker.isTextEntrySincePointer()).toBe(false);
      },
    );

    it('turns false for a character key outside a text field', async () => {
      const {tracker, button, press} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      button.ownerDocument.dispatchEvent(new Event('pointerdown'));

      press(button, ' ');

      expect(tracker.isTextEntrySincePointer()).toBe(false);
    });

    it('reads a keydown without a key as navigation, without throwing', async () => {
      const {tracker, field} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      field.ownerDocument.dispatchEvent(new Event('pointerdown'));

      expect(() =>
        field.dispatchEvent(new Event('keydown', {bubbles: true})),
      ).not.toThrow();

      expect(tracker.getInteractionModality()).toBe('keyboard');
      expect(tracker.isTextEntrySincePointer()).toBe(false);
    });

    it('stays false after navigation until the next pointer press', async () => {
      const {tracker, field, press} = await trackIn(
        document.implementation.createHTMLDocument(),
      );
      field.ownerDocument.dispatchEvent(new Event('pointerdown'));
      press(field, 'Tab');
      press(field, 'a');
      expect(tracker.isTextEntrySincePointer()).toBe(false);

      field.ownerDocument.dispatchEvent(new Event('pointerdown'));
      expect(tracker.isTextEntrySincePointer()).toBe(true);
    });
  });

  it('uses the keyboard-safe default without a document', async () => {
    vi.stubGlobal('document', undefined);
    const serverModule = await loadTracker();

    expect(serverModule.getInteractionModality()).toBe('keyboard');
    expect(() =>
      serverModule.__startInteractionModalityTrackingForTest()(),
    ).not.toThrow();
  });
});
