// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.pass.test.tsx
 * @input Vitest, jsdom with stubbed matchMedia, requestAnimationFrame,
 *   performance.now, element rects, and a counted getAnimations on each list
 * @output Checks that one pass reads a list's animations once for all the
 *   rows it writes, and that rows past the frame budget are written over the
 *   next frames. Each row still waits out its own list's motion
 * @position Test for utils/touchHitArea.ts with the real shared pass of
 *   utils/hitArea.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {HIT_INSET_PROPERTIES, resetHitAreaForTests} from './hitArea';
import {useTouchHitArea} from './touchHitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';

const ROW_SIZE = 24;
const ROW_STEP = 40;

let frames: (() => void)[] = [];

// The pass's frame budget reads `performance.now()`. The tests hold this
// clock still, so a slow runner does not move rows to a later frame.
let clock = 0;
// Runs when a row's rect is read, with the row's index.
let onRowRead: (index: number) => void = () => {};

/** Runs the frames requested so far: the shared pass. */
function flush(): void {
  const due = frames;
  frames = [];
  act(() => {
    due.forEach(run => run());
  });
}

/** Lets each animation's `finished` and the watches' reactions run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  });
}

function Row({index}: {index: number}) {
  const hitAreaRef = useTouchHitArea(true);
  return (
    <span
      ref={node => {
        if (node != null) {
          const top = index * ROW_STEP;
          node.getBoundingClientRect = () => {
            onRowRead(index);
            return {
              left: 0,
              top,
              right: ROW_SIZE,
              bottom: top + ROW_SIZE,
              x: 0,
              y: top,
              width: ROW_SIZE,
              height: ROW_SIZE,
              toJSON: () => ({}),
            };
          };
        }
        return hitAreaRef(node);
      }}
      role="button"
      tabIndex={0}
      data-testid={`row-${index}`}
      {...stylex.props(touchHitAreaStyles.layer)}
    />
  );
}

/** Lists of rows, each list with its own counted `getAnimations`. */
function Lists({sizes}: {sizes: ReadonlyArray<number>}) {
  let index = 0;
  const lists = sizes.map((size, list) => ({
    id: `list-${list}`,
    rows: Array.from({length: size}, () => {
      index += 1;
      return index;
    }),
  }));
  return (
    <div>
      {lists.map(({id, rows}) => (
        <div key={id} data-testid={id}>
          {rows.map(row => (
            <Row key={row} index={row} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The left inset written on each row, or '' where none is written. */
function writtenLefts(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[role="button"]')].map(
    row => row.style.getPropertyValue(HIT_INSET_PROPERTIES.left),
  );
}

describe('the shared pass with touch hit areas', () => {
  beforeEach(() => {
    frames = [];
    clock = 0;
    onRowRead = () => {};
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: media === '(pointer: coarse)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // Without these observers every watch counts as on screen and at rest.
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      frames.push(run);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    resetHitAreaForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Renders the lists and counts each list's `getAnimations` calls. */
  function renderLists(
    sizes: ReadonlyArray<number>,
    animationsOf: (list: number) => Animation[] = () => [],
  ) {
    const view = render(<Lists sizes={sizes} />);
    const reads = sizes.map((_, list) => {
      const read = vi.fn(() => animationsOf(list));
      view.getByTestId(`list-${list}`).getAnimations = read;
      return read;
    });
    return {view, reads};
  }

  it('reads each list’s animations once for all the rows a pass writes', () => {
    const {view, reads} = renderLists([12, 3]);
    flush();
    // Every row is written: 10 px toward 44 px on the side no neighbour is
    // near.
    expect(writtenLefts(view.container)).toEqual(Array(15).fill('10px'));
    expect(reads.map(read => read.mock.calls.length)).toEqual([1, 1]);
    expect(reads[0]).toHaveBeenCalledWith({subtree: true});
  });

  it('writes the rows past the frame budget over the next frames', () => {
    // Reading row 5 takes the pass past its 4 ms budget.
    onRowRead = index => {
      if (index === 5) {
        clock += 5;
      }
    };
    const {view, reads} = renderLists([12, 3]);
    flush();
    expect(writtenLefts(view.container)).toEqual([
      ...Array(5).fill('10px'),
      ...Array(10).fill(''),
    ]);
    expect(reads.map(read => read.mock.calls.length)).toEqual([1, 0]);
    // The rows that waited are written in the next frame, and each list's
    // animations are read once for that pass.
    expect(frames).toHaveLength(1);
    flush();
    expect(writtenLefts(view.container)).toEqual(Array(15).fill('10px'));
    expect(reads.map(read => read.mock.calls.length)).toEqual([2, 1]);
    expect(frames).toHaveLength(0);
  });

  it('still holds each row whose own list moves, and writes it once that motion ends', async () => {
    let finish = () => {};
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    let isSliding = true;
    const slide = {
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: 300})},
      finished,
    } as unknown as Animation;
    // The first list slides; the second is at rest.
    const {view} = renderLists([4, 3], list =>
      list === 0 && isSliding ? [slide] : [],
    );
    flush();
    expect(writtenLefts(view.container)).toEqual([
      '',
      '',
      '',
      '',
      '10px',
      '10px',
      '10px',
    ]);
    isSliding = false;
    finish();
    await settle();
    flush();
    expect(writtenLefts(view.container)).toEqual(Array(7).fill('10px'));
  });
});
