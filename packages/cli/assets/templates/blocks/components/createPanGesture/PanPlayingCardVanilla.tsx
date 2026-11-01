// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef} from 'react';
import {createPanGesture} from '@astryxdesign/core';

const DECK = ['A\u2660', 'K\u2665', 'Q\u2663', 'J\u2666'];
/** A release faster than this (px/s) throws the card away. */
const THROW_SPEED = 1000;
/** How far a thrown card travels before the next one is dealt, px. */
const THROW_DISTANCE = 480;
const SETTLE = 'translate 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';
const THROW = 'translate 250ms ease-in, opacity 250ms ease-in';

/**
 * A deck on a table, in plain JavaScript: no React below this line. The pan
 * reports the drag; the card's own style moves it. Returns a function that
 * takes it down again.
 */
function mountDeck(table: HTMLElement, discardButton: HTMLButtonElement) {
  let top = 0;
  /** A throw is in flight: the next card is dealt when it ends. */
  let isThrowing = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const card = document.createElement('div');
  card.textContent = DECK[0];
  card.setAttribute('aria-label', 'Top card');
  Object.assign(card.style, {
    width: '120px',
    height: '170px',
    display: 'grid',
    placeItems: 'center',
    font: 'bold 40px system-ui, sans-serif',
    borderRadius: '12px',
    background: 'white',
    boxShadow: '0 2px 8px rgb(0 0 0 / 0.2)',
    cursor: 'grab',
    userSelect: 'none',
  });
  // Announces each discard to screen readers.
  const status = document.createElement('div');
  status.setAttribute('aria-live', 'polite');
  Object.assign(status.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  });
  table.append(card, status);

  /** Move the card, with a transition unless the person reduces motion. */
  function moveTo(x: number, y: number, transition: string) {
    card.style.transition = reduceMotion.matches ? 'none' : transition;
    card.style.translate = `${x}px ${y}px`;
  }

  function discard(direction: number) {
    // One throw at a time: a second Discard during it would deal twice.
    if (isThrowing) {
      return;
    }
    isThrowing = true;
    moveTo(direction * THROW_DISTANCE, 0, THROW);
    card.style.opacity = '0';
    const deal = () => {
      isThrowing = false;
      status.textContent = `${DECK[top % DECK.length]} discarded`;
      top += 1;
      card.textContent = DECK[top % DECK.length];
      moveTo(0, 0, 'none');
      card.style.opacity = '1';
    };
    if (reduceMotion.matches) {
      deal();
    } else {
      card.addEventListener('transitionend', deal, {once: true});
    }
  }

  const pan = createPanGesture(card, {
    onPan: ({state, translation, velocity}) => {
      if (state === 'began' || state === 'changed') {
        // Follows the finger: translation leaves out the travel the drag
        // needed to begin, so the card does not jump.
        moveTo(translation.x, translation.y, 'none');
      } else if (state === 'ended' && Math.abs(velocity.x) > THROW_SPEED) {
        discard(Math.sign(velocity.x));
      } else {
        moveTo(0, 0, SETTLE);
      }
    },
  });
  // The drag's keyboard and assistive-technology path (WCAG 2.5.7).
  const onDiscard = () => discard(1);
  discardButton.addEventListener('click', onDiscard);
  return () => {
    discardButton.removeEventListener('click', onDiscard);
    pan.destroy();
    card.remove();
    status.remove();
  };
}

export default function PanPlayingCardVanilla() {
  const table = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (table.current == null || button.current == null) {
      return undefined;
    }
    return mountDeck(table.current, button.current);
  }, []);
  return (
    <div style={{display: 'grid', gap: 16, padding: 16, maxWidth: 360}}>
      <div
        ref={table}
        style={{
          height: 200,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      />
      <button ref={button} type="button">
        Discard the top card
      </button>
    </div>
  );
}
