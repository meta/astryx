// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PagerPreview.stories.tsx
 * @input The internal pager (hooks/usePager.ts) from Core's source
 * @output Two sandbox stories: five pages, and five pages that loop
 * @position Preview build only, for trying the pager on a phone and on a
 *   Mac trackpad; not for merge (the pager is internal to Core)
 */

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {usePager} from '@astryxdesign/core/hooks/usePager';

const COUNT = 5;
const GAP = 16;

const styles = stylex.create({
  root: {
    fontFamily: 'system-ui, sans-serif',
    paddingBlock: 12,
  },
  status: {
    marginInline: 16,
    marginBlock: 0,
    fontSize: 16,
  },
  hint: {
    marginInline: 16,
    marginBlockStart: 4,
    marginBlockEnd: 12,
    fontSize: 13,
    color: '#555',
  },
  viewport: {
    overflow: 'hidden',
    height: '60vh',
  },
  flexTrack: {
    display: 'flex',
    gap: GAP,
    height: '100%',
  },
  loopTrack: {
    position: 'relative',
    height: '100%',
  },
  page: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 64,
    fontWeight: 600,
    color: '#1b1b1b',
    userSelect: 'none',
    willChange: 'transform',
  },
  loopPage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
  },
  buttons: {
    display: 'flex',
    gap: 8,
    margin: 16,
  },
});

const dynamic = stylex.create({
  hue: (page: number) => ({
    backgroundColor: `hsl(${page * 70} 60% 72%)`,
  }),
  at: (virtual: number) => ({
    left: `calc(${virtual} * (100% + ${GAP}px))`,
  }),
});

/** A page index wrapped into [0, COUNT). */
function wrap(index: number): number {
  return ((index % COUNT) + COUNT) % COUNT;
}

function Hint() {
  return (
    <p {...stylex.props(styles.hint)}>
      Swipe or fling with a finger, drag with a mouse, or swipe with two fingers
      on a trackpad.
    </p>
  );
}

function PagesDemo() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const pager = usePager({
    viewportRef,
    trackRef,
    count: COUNT,
    gap: GAP,
    onIndexChange: page => setIndex(page),
  });
  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.status)} data-testid="status">
        Page {index + 1} of {COUNT}
      </p>
      <Hint />
      <div ref={viewportRef} {...stylex.props(styles.viewport)}>
        <div ref={trackRef} {...stylex.props(styles.flexTrack)}>
          {Array.from({length: COUNT}, (_, page) => (
            <div key={page} {...stylex.props(styles.page, dynamic.hue(page))}>
              {page + 1}
            </div>
          ))}
        </div>
      </div>
      <div {...stylex.props(styles.buttons)}>
        <button type="button" onClick={() => pager.goTo(pager.index - 1)}>
          Previous
        </button>
        <button type="button" onClick={() => pager.goTo(pager.index + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function LoopDemo() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [virtual, setVirtual] = useState(0);
  const pager = usePager({
    viewportRef,
    trackRef,
    count: COUNT,
    gap: GAP,
    loop: true,
    onIndexChange: () => setVirtual(pager.virtualIndex),
  });
  // The pages around the one on screen, each at its own place on the
  // unbounded track: the owner renders a looping pager's copies.
  const near = [virtual - 2, virtual - 1, virtual, virtual + 1, virtual + 2];
  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.status)} data-testid="status">
        Page {wrap(virtual) + 1} of {COUNT}, looping
      </p>
      <Hint />
      <div ref={viewportRef} {...stylex.props(styles.viewport)}>
        <div ref={trackRef} {...stylex.props(styles.loopTrack)}>
          {near.map(at => (
            <div
              key={at}
              {...stylex.props(
                styles.page,
                styles.loopPage,
                dynamic.hue(wrap(at)),
                dynamic.at(at),
              )}>
              {wrap(at) + 1}
            </div>
          ))}
        </div>
      </div>
      <div {...stylex.props(styles.buttons)}>
        <button
          type="button"
          onClick={() => pager.goTo(pager.virtualIndex - 1)}>
          Previous
        </button>
        <button
          type="button"
          onClick={() => pager.goTo(pager.virtualIndex + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

const meta = {
  title: 'Core/Pager Preview',
  parameters: {layout: 'fullscreen'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pages: Story = {
  name: 'Pages',
  render: () => <PagesDemo />,
};

export const Loop: Story = {
  name: 'Loop',
  render: () => <LoopDemo />,
};
