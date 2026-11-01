// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnimator.test.tsx
 * @input vitest (jsdom), React Testing Library, the public hook and factory
 * @output Checks `spec:AST-107` FR3 and FR6 for the hook: `useAnimator(ref)`
 *   takes the caller's element ref and returns one animator, the factory's
 *   handle and nothing more; an animator used before its element mounts does
 *   nothing and resolves at once; it follows the element behind the ref
 *   when the node is replaced; an unmount keeps the values and a remount
 *   resumes; another hook can share the element through the same ref; no
 *   re-render while animating; and a hook module with no behavior of its own
 * @position Testing; validates useAnimator.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {act, render} from '@testing-library/react';
import {useEffect, useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {AnimatorHandle} from '../animator/createAnimator';
import {useAnimator} from './useAnimator';

beforeEach(() => {
  HTMLElement.prototype.animate = function () {
    return {
      startTime: null,
      playState: 'running',
      ready: new Promise(() => {}),
      cancel: vi.fn(),
    } as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

function Probe({
  box,
  onRender,
  show = true,
}: {
  box: {current: AnimatorHandle | null};
  onRender?: () => void;
  show?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animator = useAnimator(ref);
  box.current = animator;
  onRender?.();
  return show ? <div data-testid="target" ref={ref} /> : null;
}

describe('useAnimator', () => {
  it('takes the element ref and returns one animator for the component\u2019s lifetime, and never re-renders while animating', () => {
    const animators = new Set<AnimatorHandle>();
    let renders = 0;
    function Counter({label}: {label: string}) {
      const ref = useRef<HTMLButtonElement>(null);
      const animator = useAnimator(ref);
      animators.add(animator);
      renders += 1;
      return (
        <button
          type="button"
          ref={ref}
          onClick={() => void animator.animate({x: 20})}>
          {label}
        </button>
      );
    }
    const {getByRole, rerender} = render(<Counter label="Card" />);
    rerender(<Counter label="Card again" />);
    const after = renders;
    act(() => {
      getByRole('button').click();
    });
    expect(renders).toBe(after);
    expect(animators.size).toBe(1);
  });

  it('returns the handle\u2019s six methods, and nothing else: no ref and no destroy of its own', () => {
    const box: {current: AnimatorHandle | null} = {current: null};
    render(<Probe box={box} />);
    const animator = box.current!;
    expect(Object.keys(animator).sort()).toEqual(
      ['animate', 'decay', 'get', 'getVelocity', 'set', 'stop'].sort(),
    );
    for (const method of Object.keys(animator)) {
      expect(
        typeof (animator as unknown as Record<string, unknown>)[method],
      ).toBe('function');
    }
  });

  it('an animator used before its element mounts does nothing and resolves at once', async () => {
    const box: {current: AnimatorHandle | null} = {current: null};
    const {rerender, getByTestId} = render(<Probe box={box} show={false} />);
    const animator = box.current!;
    // Unattached: no element yet, so nothing happens and nothing throws.
    animator.set({x: 30, opacity: 0.4});
    animator.stop();
    expect(animator.get()).toMatchObject({x: 0, opacity: 1});
    let resolved = 0;
    await Promise.all([
      animator.animate({y: 10}).then(() => resolved++),
      animator.decay({x: 900}).then(() => resolved++),
    ]);
    expect(resolved).toBe(2);
    rerender(<Probe box={box} show />);
    const target = getByTestId('target');
    expect(animator.get()).toMatchObject({x: 0, y: 0, opacity: 1});
    // Attached, it works.
    animator.set({x: 30});
    expect(target.style.translate).toBe('30px 0px');
  });

  it('an unmount lets the element go and keeps the values; a remount resumes from them', () => {
    const box: {current: AnimatorHandle | null} = {current: null};
    const {rerender, getByTestId} = render(<Probe box={box} />);
    const animator = box.current!;
    animator.set({x: 12, rotate: 5});
    rerender(<Probe box={box} show={false} />);
    // With no element attached, a call does nothing.
    animator.set({x: 24});
    expect(animator.get()).toMatchObject({x: 12, rotate: 5});
    rerender(<Probe box={box} show />);
    expect(getByTestId('target').style.translate).toBe('12px 0px');
    expect(getByTestId('target').style.rotate).toBe('5deg');
  });

  it('follows the element behind the ref when the node is replaced (architecture:react-component-runtime INV6)', () => {
    const box: {current: AnimatorHandle | null} = {current: null};
    function Swapped({id}: {id: string}) {
      const ref = useRef<HTMLDivElement>(null);
      const animator = useAnimator(ref);
      box.current = animator;
      return <div key={id} data-testid={id} ref={ref} />;
    }
    const {rerender, getByTestId} = render(<Swapped id="first" />);
    const animator = box.current!;
    animator.set({x: 8});
    expect(getByTestId('first').style.translate).toBe('8px 0px');
    rerender(<Swapped id="second" />);
    // The new node takes the values, and the next call moves it.
    expect(getByTestId('second').style.translate).toBe('8px 0px');
    animator.set({x: 16});
    expect(getByTestId('second').style.translate).toBe('16px 0px');
  });

  it('shares its element with another hook through the same ref: a drag and an animation on one element', () => {
    const box: {current: AnimatorHandle | null} = {current: null};
    let seen: Element | null = null;
    function Shared() {
      const ref = useRef<HTMLDivElement>(null);
      const animator = useAnimator(ref);
      box.current = animator;
      // Another hook reads the same ref, as a gesture hook does.
      useEffect(() => {
        seen = ref.current;
      });
      return <div data-testid="shared" ref={ref} />;
    }
    const {getByTestId} = render(<Shared />);
    expect(seen).toBe(getByTestId('shared'));
    box.current!.set({y: 4});
    expect(getByTestId('shared').style.translate).toBe('0px 4px');
  });

  it('delegates entirely to the factory: the hook module holds no behavior of its own', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'useAnimator.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    expect(imports.sort()).toEqual([
      '../animator/createAnimator',
      './useIsomorphicLayoutEffect',
      'react',
    ]);
    // One construction, the factory's: the hook only wires the caller's ref
    // to it.
    expect(source).toContain('createAttachableAnimator()');
    expect(source).not.toMatch(/\bmotion\//);
  });
});
