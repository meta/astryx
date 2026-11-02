// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef} from 'react';
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

  // The places run in reading order: leftward in a right-to-left layout,
  // where the snap points are negative and so sort the other way round
  // (design:bidirectionality DR13).
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

export default function DragToSnapPointsCardVanilla() {
  const table = useRef<HTMLDivElement>(null);
  const buttons = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (table.current == null || buttons.current == null) {
      return undefined;
    }
    return mountCard(table.current, buttons.current);
  }, []);
  return (
    <div style={{display: 'grid', gap: 16, padding: 16, maxWidth: 380}}>
      <div
        ref={table}
        style={{
          position: 'relative',
          height: 150,
          display: 'flex',
          alignItems: 'center',
        }}
      />
      <div ref={buttons} style={{display: 'flex', gap: 8}} />
    </div>
  );
}
