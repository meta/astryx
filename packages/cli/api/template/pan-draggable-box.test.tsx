// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the two draggable-box pan blocks.
 * @input The shipped PanDraggableBox (usePanGesture) and
 *   PanDraggableBoxVanilla (createPanGesture) blocks, rendered in jsdom with
 *   the pan, StyleX and the Astryx components stubbed.
 * @output Guards that the box follows a drag through its StyleX drag style and
 *   springs back when it is let go. A person who reduces motion gets no
 *   spring. The plain-JavaScript block takes its pan down with the box.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file.
 */

import {act, createElement, type ComponentType, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PanDraggableBoxVanilla from '../../assets/templates/blocks/components/createPanGesture/PanDraggableBoxVanilla';
import PanDraggableBox from '../../assets/templates/blocks/components/usePanGesture/PanDraggableBox';

type PanEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled';
  translation: {x: number; y: number};
  velocity: {x: number; y: number};
};
// The stubbed pan keeps the block's listener, so a case can drive a drag.
const pan = vi.hoisted(() => ({
  onPan: null as null | ((event: PanEvent) => void),
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
  }) => createElement('div', {ref, ...style.attribute(xstyle)}, children),
}));
vi.mock('@astryxdesign/core/Center', () => ({
  Center: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  colorVars: {},
  durationVars: {'--duration-medium': 'var(--duration-medium)'},
  easeVars: {'--ease-move': 'var(--ease-move)'},
  radiusVars: {},
}));
vi.mock('@astryxdesign/core/hooks', () => ({
  usePanGesture: (
    _ref: unknown,
    options: {onPan: (event: PanEvent) => void},
  ) => {
    pan.onPan = options.onPan;
  },
}));
vi.mock('@astryxdesign/core', () => ({
  createPanGesture: (
    _element: unknown,
    options: {onPan: (event: PanEvent) => void},
  ) => {
    pan.onPan = options.onPan;
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

async function mount(Block: ComponentType) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Block));
  });
  // The box sits in its stage.
  const box = container.firstElementChild?.firstElementChild as HTMLElement;
  const styles = () =>
    JSON.parse(box.getAttribute('data-style') ?? '{}') as {
      translate?: string;
      transition?: {
        default: string;
        '@media (prefers-reduced-motion: reduce)': string;
      };
    };
  return {root, styles};
}

const at = (x: number, y = 0) => ({x, y});

async function send(event: PanEvent) {
  await act(async () => {
    pan.onPan?.(event);
  });
}

describe('the draggable-box pan blocks', () => {
  for (const [name, Block] of [
    ['usePanGesture', PanDraggableBox],
    ['createPanGesture', PanDraggableBoxVanilla],
  ] as ReadonlyArray<[string, ComponentType]>) {
    it(`follows a drag, then springs back when it is let go (${name})`, async () => {
      const {styles} = await mount(Block);
      await send({state: 'began', translation: at(0), velocity: at(0)});
      await send({
        state: 'changed',
        translation: at(30, 12),
        velocity: at(400),
      });
      const held = styles();
      expect(held.translate).toBe('30px 12px');
      expect(held.transition).toBeUndefined();
      await send({state: 'ended', translation: at(30, 12), velocity: at(0)});
      const released = styles();
      expect(released.translate).toBe('0px 0px');
      // At the theme's duration and easing for a move.
      expect(released.transition?.default).toBe(
        'translate var(--duration-medium) var(--ease-move)',
      );
      // A person who reduces motion sees it back at once.
      expect(
        released.transition?.['@media (prefers-reduced-motion: reduce)'],
      ).toBe('none');
    });
  }

  it('takes the plain-JavaScript pan down with the box', async () => {
    const {root} = await mount(PanDraggableBoxVanilla);
    const destroyed = pan.destroyed;
    await act(async () => {
      root.unmount();
    });
    expect(pan.destroyed).toBe(destroyed + 1);
  });
});
