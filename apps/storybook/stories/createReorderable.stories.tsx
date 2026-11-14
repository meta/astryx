// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createReorderable.stories.tsx
 * @input createReorderable and Button from @astryxdesign/core
 * @output Stories of `createReorderable`'s `attach`: plain elements an app
 *   renders, reordered without a collection component
 * @position Storybook demo for reorderable/createReorderable.ts; the
 *   reorderable attach browser specs open it
 */

import {useCallback, useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {createReorderable} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const meta: Meta = {
  title: 'Core/Utilities/createReorderable',
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-3'],
  },
  list: {
    margin: 0,
    padding: 0,
    listStyleType: 'none',
    inlineSize: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
    color: colorVars['--color-text-primary'],
  },
  grip: {
    inlineSize: 28,
    blockSize: 28,
    borderWidth: 0,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-icon-secondary'],
    cursor: 'grab',
    fontSize: 16,
  },
});

const CARDS = [
  'Ace of spades',
  'King of hearts',
  'Queen of clubs',
  'Jack of diamonds',
];

function moveCard(cards: string[], key: string, to: number): string[] {
  const rest = cards.filter(card => card !== key);
  rest.splice(to, 0, key);
  return rest;
}

function AttachDemo() {
  const [cards, setCards] = useState(CARDS);
  const reorderable = useMemo(
    () =>
      createReorderable<string>({
        onReorder: ({key, to}) =>
          setCards(current => moveCard(current, key, to)),
      }),
    [],
  );
  // A stable ref callback: React calls it once per element, so the list is
  // attached once, not on every render.
  const attachList = useCallback(
    (element: HTMLOListElement | null) => {
      if (element == null) {
        return undefined;
      }
      const attachment = reorderable.attach(element, {
        items: () =>
          Array.from(element.querySelectorAll('li')).map(row => ({
            key: row.dataset.card ?? '',
            element: row,
            handle: row.querySelector('button') as HTMLElement,
          })),
      });
      return () => attachment.detach();
    },
    [reorderable],
  );
  return (
    <div {...stylex.props(styles.stack)}>
      <ol ref={attachList} {...stylex.props(styles.list)}>
        {cards.map(card => (
          <li key={card} data-card={card} {...stylex.props(styles.card)}>
            <span>{card}</span>
            <button type="button" {...stylex.props(styles.grip)}>
              <span aria-hidden>⋮⋮</span>
            </button>
          </li>
        ))}
      </ol>
      <Button
        label="Move Queen of clubs"
        variant="secondary"
        onClick={() => reorderable.start('Queen of clubs')}
      />
    </div>
  );
}

export const AttachPlainElements: Story = {
  render: () => <AttachDemo />,
  parameters: {
    docs: {
      description: {
        story:
          '`attach` reorders plain elements an app renders, here an ordered ' +
          'list of cards, without a collection component. Each grip becomes ' +
          'a reorder mode toggle named for its card: Space or Enter turns ' +
          'the mode on, the arrow keys move the card, and Escape ends it. ' +
          '`start(key)` turns the mode on from your own UI. Dragging an ' +
          'attached grip is not built yet.',
      },
    },
  },
};
