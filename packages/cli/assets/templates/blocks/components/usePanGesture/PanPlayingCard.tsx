// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {usePanGesture} from '@astryxdesign/core/hooks';

const DECK = ['A\u2660', 'K\u2665', 'Q\u2663', 'J\u2666'];
/** A release faster than this (px/s) throws the card away. */
const THROW_SPEED = 1000;
/** How far a thrown card travels before the next one is dealt, px. */
const THROW_DISTANCE = 480;
const SETTLE = 'translate 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';
const THROW = 'translate 250ms ease-in, opacity 250ms ease-in';

export default function PanPlayingCard() {
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  /** A throw is in flight: the next card is dealt when it ends. */
  const throwing = useRef(false);

  /** Move the card, with a transition unless the person reduces motion. */
  function moveTo(x: number, y: number, transition: string) {
    const element = card.current;
    if (element == null) {
      return;
    }
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    element.style.transition = reduced ? 'none' : transition;
    element.style.translate = `${x}px ${y}px`;
  }

  function discard(direction: number) {
    const element = card.current;
    // One throw at a time: a second Discard during it would deal twice.
    if (element == null || throwing.current) {
      return;
    }
    throwing.current = true;
    moveTo(direction * THROW_DISTANCE, 0, THROW);
    element.style.opacity = '0';
    const deal = () => {
      throwing.current = false;
      setAnnouncement(`${DECK[top % DECK.length]} discarded`);
      setTop(value => value + 1);
      moveTo(0, 0, 'none');
      element.style.opacity = '1';
    };
    if (element.style.transition === 'none') {
      deal();
    } else {
      element.addEventListener('transitionend', deal, {once: true});
    }
  }

  // The drag writes the card's style in onPan: no render per move.
  usePanGesture(card, {
    onPan: ({state, translation, velocity}) => {
      if (state === 'began' || state === 'changed') {
        moveTo(translation.x, translation.y, 'none');
      } else if (state === 'ended' && Math.abs(velocity.x) > THROW_SPEED) {
        discard(Math.sign(velocity.x));
      } else {
        moveTo(0, 0, SETTLE);
      }
    },
  });

  return (
    <div style={{display: 'grid', gap: 16, padding: 16, maxWidth: 360}}>
      <div
        style={{
          height: 200,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}>
        <div
          ref={card}
          aria-label="Top card"
          style={{
            width: 120,
            height: 170,
            display: 'grid',
            placeItems: 'center',
            font: 'bold 40px system-ui, sans-serif',
            borderRadius: 12,
            background: 'white',
            boxShadow: '0 2px 8px rgb(0 0 0 / 0.2)',
            cursor: 'grab',
            userSelect: 'none',
          }}>
          {DECK[top % DECK.length]}
        </div>
      </div>
      {/* The drag's keyboard and assistive-technology path (WCAG 2.5.7). */}
      <button type="button" onClick={() => discard(1)}>
        Discard the top card
      </button>
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}>
        {announcement}
      </div>
    </div>
  );
}
