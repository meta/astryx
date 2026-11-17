// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {createDragToSnapPoints} from '@astryxdesign/core';

const PLACES = ['Hand', 'Table', 'Discard pile'];

/**
 * A card that snaps between three places, in plain JavaScript: no React
 * below this line. It returns a function that takes it down again.
 */
function mountCard(table: HTMLElement, buttons: HTMLElement) {
  const card = document.createElement('div');
  card.textContent = 'Q\u2665';
  Object.assign(card.style, {
    width: '96px',
    height: '136px',
    display: 'grid',
    placeItems: 'center',
    font: 'bold 36px system-ui, sans-serif',
    // The theme's surface and text, so the card reads in light and dark.
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    boxShadow: '0 2px 8px var(--color-shadow)',
    touchAction: 'none',
    cursor: 'grab',
    userSelect: 'none',
  });
  table.append(card);
  const status = document.createElement('div');
  status.setAttribute('aria-live', 'polite');
  Object.assign(status.style, {position: 'absolute', clip: 'rect(0 0 0 0)'});
  table.append(status);

  // The places run in reading order, so leftward in a right-to-left layout.
  // There the snap points are negative, so they sort the other way round.
  const steps = [0, 110, 220];
  const isRtl = getComputedStyle(table).direction === 'rtl';
  const placeAt = (index: number) => (isRtl ? steps.length - 1 - index : index);
  const snap = createDragToSnapPoints(card, {
    axis: 'x',
    snapPoints: isRtl ? steps.map(step => -step) : steps,
    onSettle: index => {
      status.textContent = `The card is on the ${PLACES[placeAt(index)].toLowerCase()}.`;
    },
  });
  const controls = PLACES.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    // The Astryx reset removes a native button's own look, so these take the
    // theme's secondary button look.
    Object.assign(button.style, {
      height: 'var(--size-element-md)',
      paddingInline: 'var(--spacing-3)',
      border: 'none',
      borderRadius: 'var(--radius-element)',
      backgroundColor: 'var(--color-neutral)',
      color: 'var(--color-text-primary)',
      font: 'inherit',
      fontSize: 'var(--text-label-size)',
      fontWeight: 'var(--font-weight-medium)',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => snap.settleTo(placeAt(index)));
    buttons.append(button);
    return button;
  });
  return () => {
    snap.destroy();
    for (const button of controls) {
      button.remove();
    }
    card.remove();
    status.remove();
  };
}

/**
 * Mounts the card when the wrapper attaches, and takes it down when it
 * detaches: its cleanup is the callback ref's.
 */
function mountTable(wrapper: HTMLDivElement | null) {
  if (wrapper == null) {
    return undefined;
  }
  const table = wrapper.firstElementChild as HTMLElement;
  const buttons = wrapper.lastElementChild as HTMLElement;
  return mountCard(table, buttons);
}

export default function DragToSnapPointsCardVanilla() {
  return (
    <div
      ref={mountTable}
      style={{display: 'grid', gap: 16, padding: 16, maxWidth: 380}}>
      <div
        style={{
          position: 'relative',
          height: 150,
          display: 'flex',
          alignItems: 'center',
        }}
      />
      <div style={{display: 'flex', gap: 8}} />
    </div>
  );
}
