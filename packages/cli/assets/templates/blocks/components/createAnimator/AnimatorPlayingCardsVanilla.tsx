// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {createAnimator} from '@astryxdesign/core';

const DECK = [
  {face: 'A\u2660', name: 'Ace of spades'},
  {face: 'K\u2665', name: 'King of hearts'},
  {face: 'Q\u2663', name: 'Queen of clubs'},
  {face: 'J\u2666', name: 'Jack of diamonds'},
];
/** A release faster than this (px/s) throws the card away. */
const THROW_SPEED = 1000;
/** The slowest throw, so a thrown card always leaves the table. */
const MIN_THROW = 1600;

/**
 * A deck on a table, in plain JavaScript: no React below this line. It
 * returns a function that takes it down again.
 */
function mountDeck(table: HTMLElement, discardButton: HTMLButtonElement) {
  let top = 0;
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
    // The theme's surface and text, so the rank reads in light and dark.
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    boxShadow: '0 2px 8px var(--color-shadow)',
    touchAction: 'none',
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
  const animator = createAnimator(card);
  // One discard at a time: a press while a card leaves deals no second card.
  let isDiscarding = false;

  // Announces the discard and deals the next card in place of the old one.
  async function dealNext() {
    status.textContent = `${DECK[top % DECK.length].name} discarded`;
    top += 1;
    const next = DECK[top % DECK.length];
    card.textContent = next.face;
    card.setAttribute('aria-label', next.name);
    animator.set({x: 0, y: 0, rotate: 0, scale: 0.9, opacity: 0});
    isDiscarding = false;
    await animator.animate({scale: 1, opacity: 1});
  }

  // Starts a discard unless one runs. It also ends a drag in progress: the
  // drag's next move would take the discard's motion over and drag the dealt
  // card.
  function startDiscard() {
    if (isDiscarding) {
      return false;
    }
    isDiscarding = true;
    origin = null;
    return true;
  }

  async function discard(vx: number, vy: number) {
    if (!startDiscard()) {
      return;
    }
    const speed = Math.hypot(vx, vy);
    const boost = speed < MIN_THROW ? MIN_THROW / Math.max(speed, 1) : 1;
    // The card coasts on while it fades; once it is gone, the next card is
    // dealt in place, which ends the coast. A coast continues the person's
    // throw, so Reduce Motion keeps it.
    void animator.decay({x: speed < 1 ? MIN_THROW : vx * boost, y: vy * boost});
    await animator.animate({opacity: 0});
    await dealNext();
  }

  // The drag: follow the pointer, then read the 80 ms before the release, so
  // a pointer that held still before letting go releases at rest.
  let origin: {x: number; y: number} | null = null;
  let samples: {t: number; x: number; y: number}[] = [];
  function onDown(event: PointerEvent) {
    // A leaving card takes no press. Pinning it would end its discard and deal
    // the next card under the finger.
    if (isDiscarding) {
      return;
    }
    card.setPointerCapture(event.pointerId);
    // Pins the card where it shows, so the drag starts there. Only the
    // position stops, so a card fading in keeps fading in.
    const {x, y, rotate} = animator.get();
    animator.set({x, y, rotate});
    origin = {x: event.clientX - x, y: event.clientY - y};
    samples = [];
  }
  function onMove(event: PointerEvent) {
    if (origin == null) {
      return;
    }
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    samples.push({t: event.timeStamp, x, y});
    animator.set({x, y, rotate: x / 18});
  }
  // A cancelled pointer was not let go, so the card springs back.
  function onCancel() {
    if (origin == null) {
      return;
    }
    origin = null;
    void animator.animate({x: 0, y: 0, rotate: 0});
  }
  function onUp(event: PointerEvent) {
    if (origin == null) {
      return;
    }
    origin = null;
    const recent = samples.filter(s => event.timeStamp - s.t <= 80);
    const first = recent[0];
    const last = recent.at(-1);
    const seconds = last && first ? (last.t - first.t) / 1000 : 0;
    const vx = seconds > 0 && last && first ? (last.x - first.x) / seconds : 0;
    const vy = seconds > 0 && last && first ? (last.y - first.y) / seconds : 0;
    if (Math.abs(vx) > THROW_SPEED) {
      void discard(vx, vy);
    } else {
      void animator.animate(
        {x: 0, y: 0, rotate: 0},
        {velocity: {x: vx, y: vy}},
      );
    }
  }
  // The button moves the card off on the state-change motion: a planned
  // move, which Reduce Motion turns into a fade where the card is.
  async function discardWithButton() {
    if (!startDiscard()) {
      return;
    }
    await animator.animate({x: 400, opacity: 0});
    await dealNext();
  }
  const onDiscard = () => void discardWithButton();

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onCancel);
  discardButton.addEventListener('click', onDiscard);
  return () => {
    discardButton.removeEventListener('click', onDiscard);
    animator.destroy();
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

export default function AnimatorPlayingCardsVanilla() {
  return (
    <div
      ref={mountTable}
      style={{display: 'grid', gap: 16, padding: 16, maxWidth: 360}}>
      <div style={{height: 200, display: 'grid', placeItems: 'center'}} />
      <button type="button">Discard the top card</button>
    </div>
  );
}
