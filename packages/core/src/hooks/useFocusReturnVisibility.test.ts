// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusReturnVisibility.test.ts
 * @input useFocusReturnVisibility with an element in a second document
 * @output Verifies the returned-focus ring follows the last input in the
 *   element's own document, not the page's
 * @position Unit coverage for useFocusReturnVisibility.ts
 */

import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useFocusReturnVisibility} from './useFocusReturnVisibility';
import {useInteractionModalityTracking} from '../utils/interactionModality';

describe('useFocusReturnVisibility in a second document', () => {
  it("suppresses or keeps the ring by the element's own document's last input", () => {
    const secondDocument = document.implementation.createHTMLDocument();
    const trigger = secondDocument.createElement('button');
    const {result, unmount} = renderHook(() => {
      const modality = useInteractionModalityTracking();
      return {modality, ...useFocusReturnVisibility(modality)};
    });
    // The component attaches its tracking ref to the trigger.
    act(() => {
      result.current.modality.ref(trigger);
    });

    // The page saw a key; the trigger's document saw a pointer.
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    secondDocument.dispatchEvent(new Event('pointerdown'));
    act(() => result.current.prepareFocusReturn());
    expect(result.current.isFocusRingSuppressed).toBe(true);

    // The page saw a pointer; the trigger's document saw a key.
    document.dispatchEvent(new Event('pointerdown'));
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    act(() => result.current.prepareFocusReturn());
    expect(result.current.isFocusRingSuppressed).toBe(false);
    unmount();
  });
});
