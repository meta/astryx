// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import * as core from '../index';
import {createPresentationHold, usePresentationHold} from './presentationHold';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('createPresentationHold', () => {
  it('holds what the opening chose until it is released', () => {
    const hold = createPresentationHold<'touch' | 'pointer'>();
    expect(hold.isHeld()).toBe(false);
    expect(hold.current()).toBeUndefined();
    hold.take('touch');
    expect(hold.current()).toBe('touch');
    expect(hold.isHeld()).toBe(true);
    hold.release();
    expect(hold.isHeld()).toBe(false);
    expect(hold.current()).toBeUndefined();
  });

  it('holds a false choice as held', () => {
    const hold = createPresentationHold<boolean>();
    hold.take(false);
    expect(hold.isHeld()).toBe(true);
    expect(hold.current()).toBe(false);
  });
});

describe('usePresentationHold', () => {
  it('holds the presentation from the render that opens it, whatever it becomes, until release', () => {
    const {result, rerender} = renderHook(
      (props: {isOpen: boolean; presentation: string}) =>
        usePresentationHold(props),
      {initialProps: {isOpen: false, presentation: 'sheet'}},
    );
    expect(result.current).toMatchObject({presentation: null, isHeld: false});
    rerender({isOpen: true, presentation: 'sheet'});
    expect(result.current).toMatchObject({presentation: 'sheet', isHeld: true});
    // The screen stops being compact while it is open: the hold keeps the
    // opening's choice, and keeps it through the close.
    rerender({isOpen: true, presentation: 'anchored'});
    expect(result.current.presentation).toBe('sheet');
    rerender({isOpen: false, presentation: 'anchored'});
    expect(result.current).toMatchObject({presentation: 'sheet', isHeld: true});
    act(() => result.current.release());
    expect(result.current).toMatchObject({presentation: null, isHeld: false});
    // The next opening chooses again.
    rerender({isOpen: true, presentation: 'anchored'});
    expect(result.current.presentation).toBe('anchored');
  });

  it('keeps release stable across renders', () => {
    const {result, rerender} = renderHook(
      (props: {isOpen: boolean}) =>
        usePresentationHold({...props, presentation: 1}),
      {initialProps: {isOpen: true}},
    );
    const first = result.current.release;
    rerender({isOpen: false});
    expect(result.current.release).toBe(first);
  });

  it('stays internal: not exported from the package or the Layer barrel', () => {
    expect(core).not.toHaveProperty('usePresentationHold');
    expect(core).not.toHaveProperty('createPresentationHold');
    const barrel = fs.readFileSync(path.join(here, 'index.ts'), 'utf8');
    expect(barrel).not.toMatch(/presentationHold/);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(here, '../../package.json'), 'utf8'),
    ) as {exports: Record<string, unknown>};
    expect(
      Object.keys(pkg.exports).filter(key => key.includes('presentationHold')),
    ).toEqual([]);
  });
});
