// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the draggable-box pan block.
 * @input The shipped PanDraggableBox block, rendered in jsdom with the pans,
 *   StyleX and the Astryx components stubbed. It shows one box with
 *   usePanGesture and one with createPanGesture.
 * @output Guards that each box follows its own drag through its StyleX drag
 *   style and springs back when it is let go. A person who reduces motion gets
 *   no spring. The createPanGesture pan comes down with the block.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file.
 */

import {act, createElement, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PanDraggableBox from '../../assets/templates/blocks/components/usePanGesture/PanDraggableBox';

type PanEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled';
  translation: {x: number; y: number};
  velocity: {x: number; y: number};
};
type Listener = (event: PanEvent) => void;
// The stubbed pans keep each form's listener, so a case can drive one drag.
const pan = vi.hoisted(() => ({
  hook: null as null | ((event: PanEvent) => void),
  factory: null as null | ((event: PanEvent) => void),
  destroyed: 0,
}));
// This project does not compile StyleX. The stub merges a style list into one
// object on `data-style`, so a case reads the styles the block applies.
const style = vi.hoisted(() => ({
  attribute: (...styles: unknown[]) => ({
    'data-style': JSON.stringify(
      Object.assign({}, ...styles.flat(Infinity).filter(Boolean)),
    ),
  }),
}));
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: object) => styles,
  props: style.attribute,
}));
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({
    xstyle,
    children,
    ref,
  }: {
    xstyle: unknown;
    children: ReactNode;
    ref: unknown;
  }) =>
    createElement(
      'div',
      {ref, role: 'group', ...style.attribute(xstyle)},
      children,
    ),
}));
vi.mock('@astryxdesign/core/Center', () => ({
  Center: (props: {children: ReactNode}) =>
    createElement('div', null, props.children),
}));
vi.mock('@astryxdesign/core/HStack', () => ({
  HStack: (props: {children: ReactNode}) =>
    createElement('div', null, props.children),
}));
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  colorVars: {},
  durationVars: {'--duration-medium': 'var(--duration-medium)'},
  easeVars: {'--ease-move': 'var(--ease-move)'},
  radiusVars: {},
}));
vi.mock('@astryxdesign/core/hooks', () => ({
  usePanGesture: (_ref: unknown, options: {onPan: Listener}) => {
    pan.hook = options.onPan;
  },
}));
vi.mock('@astryxdesign/core', () => ({
  createPanGesture: (_element: unknown, options: {onPan: Listener}) => {
    pan.factory = options.onPan;
    return {
      destroy: () => {
        pan.destroyed += 1;
      },
    };
  },
}));

const reactActEnvironment = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
});

type Styles = {
  translate?: string;
  userSelect?: string;
  transition?: {
    default: string;
    '@media (prefers-reduced-motion: reduce)': string;
  };
};

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PanDraggableBox));
  });
  // The hook's box comes first, then the factory's.
  const boxes = [...container.querySelectorAll<HTMLElement>('[role="group"]')];
  const styles = (index: number) =>
    JSON.parse(boxes[index]?.getAttribute('data-style') ?? '{}') as Styles;
  return {root, boxes, styles};
}

const at = (x: number, y = 0) => ({x, y});

async function send(listener: Listener | null, event: PanEvent) {
  await act(async () => {
    listener?.(event);
  });
}

describe('the draggable-box pan block', () => {
  it('shows the same box twice, each named by the API that makes its pan', async () => {
    const {root, boxes} = await mount();
    expect(boxes.map(box => box.textContent)).toEqual([
      'usePanGesture',
      'createPanGesture',
    ]);
    await act(async () => {
      root.unmount();
    });
  });

  for (const [name, index, listener] of [
    ['usePanGesture', 0, () => pan.hook],
    ['createPanGesture', 1, () => pan.factory],
  ] as const) {
    it(`follows a drag, then springs back when it is let go (${name})`, async () => {
      const {root, styles} = await mount();
      await send(listener(), {
        state: 'began',
        translation: at(0),
        velocity: at(0),
      });
      await send(listener(), {
        state: 'changed',
        translation: at(30, 12),
        velocity: at(400),
      });
      const held = styles(index);
      expect(held.translate).toBe('30px 12px');
      // A mouse drag moves the box instead of selecting its text.
      expect(held.userSelect).toBe('none');
      expect(held.transition).toBeUndefined();
      // The other box stays where it is.
      expect(styles(1 - index).translate).toBe('0px 0px');
      await send(listener(), {
        state: 'ended',
        translation: at(30, 12),
        velocity: at(0),
      });
      const released = styles(index);
      expect(released.translate).toBe('0px 0px');
      // At the theme's duration and easing for a move.
      expect(released.transition?.default).toBe(
        'translate var(--duration-medium) var(--ease-move)',
      );
      // A person who reduces motion sees it back at once.
      expect(
        released.transition?.['@media (prefers-reduced-motion: reduce)'],
      ).toBe('none');
      await act(async () => {
        root.unmount();
      });
    });
  }

  it('takes the createPanGesture pan down with the block', async () => {
    const {root} = await mount();
    const destroyed = pan.destroyed;
    await act(async () => {
      root.unmount();
    });
    expect(pan.destroyed).toBe(destroyed + 1);
  });
});
