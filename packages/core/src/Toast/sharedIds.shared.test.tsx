// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedIds.shared.test.tsx
 * @input Two loads of useToast and of the haptics module, as the package and
 *   a swizzled copy each carry one
 * @output Proves the two loads never hand out the same toast id or the same
 *   haptic label id on one page
 * @position Shared-sequence tests for useToast.tsx and gestures/haptics.ts
 *   (spec:AST-110 FR3)
 */

import {renderHook} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ToastEntry} from './types';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

afterEach(async () => {
  const realm = await import('../utils/sharedRealm');
  realm.resetSharedStateForTest('toast/');
  realm.resetSharedStateForTest('gestures/');
  vi.resetModules();
});

describe('ids shared by the package and a swizzled copy', () => {
  it('gives toasts from two loads distinct ids in one queue', async () => {
    const pkg = await load(async () => import('./useToast'));
    const copy = await load(async () => import('./useToast'));
    const {ToastContext} = await import('../Layer/toastHost');
    const added: ToastEntry[] = [];
    const queue = {
      addToast: (entry: ToastEntry) => added.push(entry),
      removeToast: () => {},
      findByUniqueID: () => undefined,
    };
    const wrapper = ({children}: {children: ReactNode}) => (
      <ToastContext value={queue}>{children}</ToastContext>
    );
    const showPkg = renderHook(() => pkg.useToast(), {wrapper}).result.current;
    const showCopy = renderHook(() => copy.useToast(), {wrapper}).result
      .current;
    showPkg({body: 'Saved'});
    showCopy({body: 'Synced'});
    expect(added).toHaveLength(2);
    // The same id would let one copy's dismiss remove the other's toast.
    expect(added[0].id).not.toBe(added[1].id);
  });

  it('gives labels from two loads distinct haptic label ids', async () => {
    const pkg = await load(async () => import('../gestures/haptics'));
    const copy = await load(async () => import('../gestures/haptics'));
    const labelWithField = () => {
      const label = document.createElement('label');
      label.append(document.createElement('input'));
      document.body.append(label);
      return label;
    };
    const first = labelWithField();
    const second = labelWithField();
    const detachPkg = pkg.attachTapHaptic(first);
    const detachCopy = copy.attachTapHaptic(second);
    expect(first.id).not.toBe('');
    expect(second.id).not.toBe(first.id);
    detachPkg();
    detachCopy();
    first.remove();
    second.remove();
  });
});
