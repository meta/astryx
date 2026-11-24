// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.sheetLoadFailure.test.tsx
 * @input Uses vitest, Testing Library, and Selector with a bottom-sheet frame
 *   whose load fails
 * @output Tests that an open whose sheet cannot load closes again, warns once,
 *   and that the next open asks for the frame again
 * @position Tests; Selector's touch presentation, alongside
 *   Selector.sheetLoad.test.tsx
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';

const frameModule = vi.hoisted(() => ({requests: 0}));

vi.mock('./SelectorBottomSheetFrame', () => {
  frameModule.requests += 1;
  throw new Error('The network dropped the chunk.');
});

import {Selector} from './Selector';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('Selector bottom-sheet load failure', () => {
  it('closes an open whose sheet cannot load, warns once, and asks again on the next open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        presentation="bottom-sheet"
      />,
    );
    const trigger = screen.getByRole('combobox');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    const warnings = () =>
      warn.mock.calls.filter(call =>
        String(call[0]).includes('selection sheet could not load'),
      ).length;
    expect(warnings()).toBe(1);
    const requestsAfterFirstOpen = frameModule.requests;
    expect(requestsAfterFirstOpen).toBeGreaterThan(0);

    fireEvent.click(trigger);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(frameModule.requests).toBeGreaterThan(requestsAfterFirstOpen);
    expect(warnings()).toBe(1);
  });
});
