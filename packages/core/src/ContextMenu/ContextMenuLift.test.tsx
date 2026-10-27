// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLift.test.tsx
 * @input vitest (jsdom), Testing Library, useContextMenuLift with the lift
 *   module stubbed so its options can be read
 * @output Checks that every spring the context menu's lift plays is an
 *   internal motion role (spec:AST-094 FR4): the preview's growth, its return,
 *   the tint, the shadow, the menu and its close
 * @position Testing for ContextMenuLift.tsx
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {expect, it, vi} from 'vitest';
import type {LiftFromTriggerOptions} from '../liftFromTrigger/liftFromTrigger';
import {motionRoleOf} from '../motion/roles';
import {useContextMenuLift} from './ContextMenuLift';

const seen: {options: LiftFromTriggerOptions | null} = {options: null};

vi.mock('../liftFromTrigger/useLiftFromTrigger', () => ({
  useLiftFromTrigger: () => ({
    lift: (_source: HTMLElement, options: LiftFromTriggerOptions) => {
      seen.options = options;
      return null;
    },
    presentSurface: () => {},
    dismissSurface: () => {},
    drop: () => {},
    dispose: () => {},
    isLifted: () => false,
  }),
}));

function Lifted({onReady}: {onReady: (lift: () => void) => void}) {
  const ref = useRef<HTMLDivElement>(null);
  const lift = useContextMenuLift(ref);
  onReady(() => {
    lift.lift();
  });
  return <div ref={ref}>card</div>;
}

it('plays every spring of the lift through an internal motion role (spec:AST-094 FR4)', () => {
  let run: () => void = () => {};
  render(
    <Lifted
      onReady={lift => {
        run = lift;
      }}
    />,
  );
  run();
  const motion = seen.options?.motion ?? {};
  expect(
    Object.fromEntries(
      Object.entries(motion).map(([use, spring]) => [
        use,
        motionRoleOf(spring)?.id ?? null,
      ]),
    ),
  ).toEqual({
    lift: 'springs.contextMenuLift',
    drop: 'springs.contextMenuDismiss',
    clear: 'springs.contextMenuDismiss',
    shadowIn: 'springs.contextMenuMorph',
    shadowOut: 'springs.contextMenuMorph',
    surfaceIn: 'springs.contextMenuMorph',
    surfaceOut: 'springs.menuClose',
  });
});
