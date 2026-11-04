// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nestedTouchPress.adopters.test.tsx
 * @input vitest (jsdom), React Testing Library, every container that paints
 *   a press and has nested controls, the press controller
 * @output Checks, for each such container, that a finger press that starts on
 *   a control inside it paints no press on the container, and that a finger
 *   press on the container's own surface or its own action still paints
 * @position Testing; validates useClickableContainer's touch press rule
 *   across its adopters. A mouse press keeps its `:active` paint; the hook's
 *   own tests check that a mouse or pen press is left alone.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState, type ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {SelectableCard} from '../SelectableCard/SelectableCard';
import {TreeList} from '../TreeList/TreeList';
import {List} from '../List/List';
import {ListItem} from '../List/ListItem';
import {Token} from '../Token/Token';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Holds a finger on `element` past the press onset; returns whether anything painted a press. */
function fingerPaints(element: Element): boolean {
  fireEvent.pointerDown(element, {
    pointerType: 'touch',
    pointerId: 1,
    button: 0,
  });
  act(() => {
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
  });
  const painted = document.querySelector(`[${PRESSED_ATTRIBUTE}="on"]`) != null;
  fireEvent.pointerUp(element, {pointerType: 'touch', pointerId: 1, button: 0});
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  return painted;
}

const Inner = () => <button type="button">Inner</button>;
const inner = () => screen.getByRole('button', {name: 'Inner'});

function Selectable(): ReactElement {
  const [isSelected, setIsSelected] = useState(false);
  return (
    <SelectableCard
      label="Pick"
      isSelected={isSelected}
      onChange={setIsSelected}>
      <span>Surface</span>
      <Inner />
    </SelectableCard>
  );
}

const removeButton = () => screen.getByRole('button', {name: /remove/i});

const containers: ReadonlyArray<
  readonly [string, () => ReactElement, () => Element, () => Element]
> = [
  [
    'SelectableCard',
    () => <Selectable />,
    inner,
    () => screen.getByText('Surface'),
  ],
  [
    'ListItem with onClick',
    () => (
      <List>
        <ListItem label="Row" onClick={() => {}} endContent={<Inner />} />
      </List>
    ),
    inner,
    () => screen.getByText('Row'),
  ],
  [
    'ListItem with href',
    () => (
      <List>
        <ListItem label="Link row" href="#row" endContent={<Inner />} />
      </List>
    ),
    inner,
    () => screen.getByText('Link row'),
  ],
  [
    'TreeList link row',
    () => (
      <TreeList
        items={[{id: 'a', label: 'Docs', href: '#docs', endContent: <Inner />}]}
      />
    ),
    inner,
    () => screen.getByText('Docs'),
  ],
  [
    'TreeList row with onClick',
    () => (
      <TreeList
        items={[
          {id: 'b', label: 'Run', onClick: () => {}, endContent: <Inner />},
        ]}
      />
    ),
    inner,
    () => screen.getByText('Run'),
  ],
  [
    'TreeList parent row',
    () => (
      <TreeList
        items={[
          {
            id: 'c',
            label: 'Folder',
            endContent: <Inner />,
            children: [{id: 'd', label: 'File'}],
          },
        ]}
      />
    ),
    inner,
    () => screen.getByText('Folder'),
  ],
  [
    'Token with href and onRemove',
    () => <Token label="Tag" href="#tag" onRemove={() => {}} />,
    removeButton,
    () => screen.getByText('Tag'),
  ],
  [
    'Token with onClick and onRemove',
    () => <Token label="Filter" onClick={() => {}} onRemove={() => {}} />,
    removeButton,
    () => screen.getByText('Filter'),
  ],
];

describe('a finger press inside a container that paints a press', () => {
  for (const [name, ui, child, surface] of containers) {
    describe(name, () => {
      it('paints no press on the container for a finger on a control inside it', () => {
        render(ui());
        expect(fingerPaints(child())).toBe(false);
      });

      it('paints the press for a finger on the container itself', () => {
        render(ui());
        expect(fingerPaints(surface())).toBe(true);
      });
    });
  }
});
