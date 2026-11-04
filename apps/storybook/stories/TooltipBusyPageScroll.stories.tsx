// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Button} from '@astryxdesign/core/Button';
import {Switch} from '@astryxdesign/core/Switch';

const meta: Meta<typeof Tooltip> = {
  title: 'Core/Tooltip busy-page scroll',
  component: Tooltip,
  parameters: {layout: 'fullscreen'},
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

const ROWS = Array.from({length: 60}, (_, i) => `Row ${i + 1}`);
const TRIGGER_ROW = 30;
// Near either edge, a tooltip this tall fits on one side only. So as a
// scroll carries the trigger toward an edge, the tooltip changes sides.
const LINES = Array.from(
  {length: 16},
  (_, i) => `Line ${i + 1} of a tall tooltip`,
);
// The list starts with the trigger this far above its bottom edge.
const TRIGGER_START_FROM_BOTTOM = 140;

// While the page scrolls, each burst blocks the main thread for BURST_MS,
// once every BURST_EVERY_MS.
const BURST_MS = 150;
const BURST_EVERY_MS = 300;
// The bursts stop when nothing has scrolled for this long.
const SCROLL_IDLE_MS = 500;

/** Blocks the main thread in bursts while anything on the page scrolls. */
function useBusyBursts(isBusy: boolean): void {
  useEffect(() => {
    if (!isBusy) {
      return undefined;
    }
    let lastScroll = Number.NEGATIVE_INFINITY;
    const onScroll = () => {
      lastScroll = performance.now();
    };
    // Scroll events do not bubble. A capturing listener on the window also
    // gets the list's own scroll events.
    window.addEventListener('scroll', onScroll, {capture: true, passive: true});
    const timer = window.setInterval(() => {
      if (performance.now() - lastScroll > SCROLL_IDLE_MS) {
        return;
      }
      const end = performance.now() + BURST_MS;
      while (performance.now() < end) {
        // Busy: no other task, frame callback or event runs until the end.
      }
    }, BURST_EVERY_MS);
    return () => {
      window.removeEventListener('scroll', onScroll, {capture: true});
      window.clearInterval(timer);
    };
  }, [isBusy]);
}

/**
 * A tooltip held open in a scrolling list, its trigger near the bottom edge.
 * With Busy page on, the main thread is blocked in bursts while the list
 * scrolls, as on a busy page. Scroll the trigger up and watch whether the
 * tooltip slides past an edge.
 */
export const Default: Story = {
  render: function TooltipBusyPageScrollExample() {
    const [isBusy, setIsBusy] = useState(false);
    const list = useRef<HTMLDivElement>(null);
    const triggerRow = useRef<HTMLDivElement>(null);
    useBusyBursts(isBusy);
    useLayoutEffect(() => {
      const scroller = list.current;
      const row = triggerRow.current;
      if (scroller == null || row == null) {
        return;
      }
      scroller.scrollTop =
        row.offsetTop -
        scroller.offsetTop +
        row.offsetHeight -
        (scroller.clientHeight - TRIGGER_START_FROM_BOTTOM);
    }, []);
    return (
      // Fixed to the viewport, so only the list scrolls, never the page.
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div style={{padding: 12}}>
          <Switch label="Busy page" value={isBusy} onChange={setIsBusy} />
        </div>
        <div ref={list} style={{flex: 1, minHeight: 0, overflowY: 'auto'}}>
          {ROWS.map((row, index) =>
            index === TRIGGER_ROW ? (
              <div key={row} ref={triggerRow} style={{padding: '8px 16px'}}>
                <Tooltip
                  isOpen
                  placement="above"
                  content={
                    <div>
                      {LINES.map(line => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  }>
                  <Button label={`${row}: tooltip trigger`}>
                    {`${row}: tooltip trigger`}
                  </Button>
                </Tooltip>
              </div>
            ) : (
              <div key={row} style={{padding: '12px 16px'}}>
                {row}
              </div>
            ),
          )}
        </div>
      </div>
    );
  },
};
