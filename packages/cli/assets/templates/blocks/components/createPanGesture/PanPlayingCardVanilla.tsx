// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {createPanGesture} from '@astryxdesign/core';

const DECK = [
  {face: 'A\u2660', name: 'Ace of spades'},
  {face: 'K\u2665', name: 'King of hearts'},
  {face: 'Q\u2663', name: 'Queen of clubs'},
  {face: 'J\u2666', name: 'Jack of diamonds'},
];
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
  /** The drag in progress met a throw: the rest of it moves nothing. */
  let isIgnoringDrag = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const card = document.createElement('div');
  card.textContent = DECK[0].face;
  // An image's name is all a screen reader announces, so it names the card.
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', DECK[0].name);
  Object.assign(card.style, {
    width: '120px',
    height: '170px',
    display: 'grid',
    placeItems: 'center',
    font: 'bold 40px system-ui, sans-serif',
    borderRadius: '12px',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
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
    // The drag in progress, if any, moves nothing more.
    isIgnoringDrag = true;
    moveTo(direction * THROW_DISTANCE, 0, THROW);
    card.style.opacity = '0';
    const deal = () => {
      isThrowing = false;
      status.textContent = `${DECK[top % DECK.length].name} discarded`;
      top += 1;
      card.textContent = DECK[top % DECK.length].face;
      card.setAttribute('aria-label', DECK[top % DECK.length].name);
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
      // A drag that meets a throw is ignored to its end. Its moves would
      // cancel the throw's transitions, and the next card would jump to it.
      if (state === 'began') {
        isIgnoringDrag = isThrowing;
      }
      if (isIgnoringDrag) {
        return;
      }
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

/**
 * Mounts the deck when the wrapper attaches, and takes it down when it
 * detaches: its cleanup is the callback ref's.
 */
function mountTable(wrapper: HTMLDivElement | null) {
  if (wrapper == null) {
    return undefined;
  }
  const table = wrapper.firstElementChild as HTMLElement;
  const button = wrapper.querySelector('button') as HTMLButtonElement;
  return mountDeck(table, button);
}

export default function PanPlayingCardVanilla() {
  return (
    <div
      ref={mountTable}
      style={{display: 'grid', gap: 16, padding: 16, maxWidth: 360}}>
      <div
        style={{
          height: 200,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      />
      <button type="button">Discard the top card</button>
    </div>
  );
}
