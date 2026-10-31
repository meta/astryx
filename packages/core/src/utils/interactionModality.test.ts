// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionModality.test.ts
 * @input The interaction-modality utility loaded more than once
 * @output Verifies document-wide continuity, shared Shift-key modality policy,
 *   and a second document's separate value
 * @position Unit coverage for interactionModality.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

const isolatedDocument = document.implementation.createHTMLDocument();

async function loadTracker() {
  vi.resetModules();
  return import('./interactionModality');
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
    tracker.trackInteractionModalityIn(secondDocument);

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

  it("releases a second document's listeners with its last consumer", async () => {
    const secondDocument = document.implementation.createHTMLDocument();
    const tracker = await loadTracker();
    const removeEventListener = vi.spyOn(secondDocument, 'removeEventListener');
    const releaseFirst = tracker.trackInteractionModalityIn(secondDocument);
    const releaseSecond = tracker.trackInteractionModalityIn(secondDocument);
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

  it('uses the keyboard-safe default without a document', async () => {
    vi.stubGlobal('document', undefined);
    const serverModule = await loadTracker();

    expect(serverModule.getInteractionModality()).toBe('keyboard');
    expect(() =>
      serverModule.__startInteractionModalityTrackingForTest()(),
    ).not.toThrow();
  });
});
