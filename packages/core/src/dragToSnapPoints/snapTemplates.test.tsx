// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snapTemplates.test.tsx
 * @input The CLI's two playing-card examples of the snap-point drag (the
 *   `useDragToSnapPoints` one and the plain-JavaScript `createDragToSnapPoints`
 *   one), rendered left to right and right to left, with a recording stand-in
 *   for Element.animate
 * @output Tests `design:bidirectionality` DR13 for the examples: the places run
 *   in reading order, so a card sent to the next place moves toward the inline
 *   end, rightward or leftward, and its place is named the same either way
 * @position The examples ship to products through the CLI, so their direction
 *   handling is checked here, beside the drag they demonstrate.
 */

import type {ComponentType, ReactNode} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {InternationalizationProvider} from '../i18n';

// The examples live in the CLI's templates, outside Core's type-checked
// sources, so they load at run time; the CLI type-checks them itself.
const TEMPLATES = '../../../cli/assets/templates/blocks/components';
async function loadExample(file: string): Promise<ComponentType> {
  const module = (await import(/* @vite-ignore */ `${TEMPLATES}/${file}`)) as {
    default: ComponentType;
  };
  return module.default;
}
const DragToSnapPointsCard = await loadExample(
  'useDragToSnapPoints/DragToSnapPointsCard',
);
const DragToSnapPointsCardVanilla = await loadExample(
  'createDragToSnapPoints/DragToSnapPointsCardVanilla',
);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  HTMLElement.prototype.animate = function () {
    let start: number | null = null;
    const animation = {
      get startTime() {
        return start;
      },
      set startTime(value: number | null) {
        start = value;
      },
      playState: 'running',
      ready: new Promise(() => {}),
      finish() {},
      cancel() {},
    };
    requestAnimationFrame(() => {
      start ??= performance.now();
    });
    return animation as unknown as Animation;
  };
  // jsdom computes no inherited direction; a browser takes an element's from
  // the nearest dir attribute, which this reads the same way.
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    const dir = element.closest('[dir]')?.getAttribute('dir') ?? 'ltr';
    Object.defineProperty(style, 'direction', {value: dir, configurable: true});
    return style;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
});

function inDirection(dir: 'ltr' | 'rtl', example: ReactNode) {
  return (
    <div dir={dir}>
      <InternationalizationProvider locale="en" dir={dir}>
        {example}
      </InternationalizationProvider>
    </div>
  );
}

/** Sends the card to `place` with its button; returns where it settled, in px. */
async function sendTo(place: string, card: () => HTMLElement): Promise<number> {
  fireEvent.click(screen.getByRole('button', {name: place}));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  const [x = '0'] = (card().style.translate ?? '').split(' ');
  // At rest on its starting place the card carries no translate at all.
  const offset = Number.parseFloat(x);
  return Number.isFinite(offset) ? offset : 0;
}

describe('the snap-point examples follow the reading direction (design:bidirectionality DR13)', () => {
  const examples: [string, ComponentType, () => HTMLElement][] = [
    [
      'useDragToSnapPoints',
      DragToSnapPointsCard,
      () => screen.getByLabelText(/^Queen of hearts/),
    ],
    [
      'createDragToSnapPoints',
      DragToSnapPointsCardVanilla,
      () => screen.getByText('Q\u2665'),
    ],
  ];
  for (const [name, Example, card] of examples) {
    it(`${name}: the next place is rightward left to right, leftward right to left, and named the same`, async () => {
      for (const [dir, sign] of [
        ['ltr', 1],
        ['rtl', -1],
      ] as const) {
        const {unmount} = render(inDirection(dir, <Example />));
        expect(await sendTo('Table', card), dir).toBe(sign * 110);
        expect(await sendTo('Discard pile', card), dir).toBe(sign * 220);
        expect(
          screen.getByText('The card is on the discard pile.'),
        ).toBeTruthy();
        expect(await sendTo('Hand', card), dir).toBe(0);
        unmount();
      }
    });

    it(`${name}: without an internationalization provider, the places follow the direction the card renders in (architecture:internationalization INV11)`, async () => {
      const {unmount} = render(
        <div dir="rtl">
          <Example />
        </div>,
      );
      expect(await sendTo('Table', card)).toBe(-110);
      unmount();
    });
  }
});

describe('the plain-JavaScript example', () => {
  it('colours its card from the theme\u2019s surface and text tokens, so it reads in a dark theme', () => {
    render(<DragToSnapPointsCardVanilla />);
    const {style} = screen.getByText('Q\u2665');
    expect(style.backgroundColor).toBe('var(--color-background-surface)');
    expect(style.color).toBe('var(--color-text-primary)');
  });
});
