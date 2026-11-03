// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slotPresence.controls.test.tsx
 * @input BreadcrumbItem, Button, Lightbox, SegmentedControlItem, Tab
 *   and Tokenizer slots
 * @output Proves each slot's presence follows the shared `isRenderable` check
 * @position Tests for `architecture:react-component-runtime` INV16
 *
 * An empty value (`null`, `false`, `''`) renders no slot wrapper, as an
 * omitted slot does. `0` is content: it renders inside the slot's wrapper,
 * never as a stray "0" beside it, and a slot that was dropped for `0` shows.
 */

import {beforeAll, describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {Avatar} from '../Avatar/Avatar';
import type {ReactNode} from 'react';
import {Breadcrumbs} from '../Breadcrumbs/Breadcrumbs';
import {BreadcrumbItem} from '../Breadcrumbs/BreadcrumbItem';
import {Button} from '../Button/Button';
import {Lightbox} from '../Lightbox/Lightbox';
import {SegmentedControl} from '../SegmentedControl/SegmentedControl';
import {SegmentedControlItem} from '../SegmentedControl/SegmentedControlItem';
import {TabList} from '../TabList/TabList';
import {Tab} from '../TabList/Tab';
import {Tokenizer} from '../Tokenizer/Tokenizer';

// jsdom does not implement showModal/close on <dialog>; Lightbox uses them.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const EMPTY_VALUES = [
  ['null', null],
  ['false', false],
  ['an empty string', ''],
] as const;

/** The element whose own text is exactly "0", if any. */
function zeroParent(): HTMLElement | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent === '0') {
      return node.parentElement;
    }
  }
  return null;
}

/** Whether the "0" sits inside an element whose class names `style`. */
function zeroIsInside(style: string): boolean {
  return zeroParent()?.closest(`[class*="${style}"]`) != null;
}

/** One slot: how to render it with a value, and its wrapper's class. */
type SlotCase = [string, (value: ReactNode) => ReactNode, string];

const SLOTS: ReadonlyArray<SlotCase> = [
  [
    'BreadcrumbItem startIcon',
    value => (
      <Breadcrumbs>
        <BreadcrumbItem href="/home" startIcon={value}>
          Home
        </BreadcrumbItem>
        <BreadcrumbItem>Page</BreadcrumbItem>
      </Breadcrumbs>
    ),
    'itemStyles.icon',
  ],
  [
    'Button icon',
    value => <Button label="Save" icon={value} />,
    'styles.iconWrapper',
  ],
  [
    'Button endContent',
    value => <Button label="Save" endContent={value} />,
    'styles.endContentWrapper',
  ],
  [
    'Lightbox caption',
    value => (
      <Lightbox
        isOpen
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo', caption: value}}
      />
    ),
    'styles.caption',
  ],
  [
    'SegmentedControlItem icon',
    value => (
      <SegmentedControl label="View" value="list" onChange={() => {}}>
        <SegmentedControlItem value="list" label="List" icon={value} />
      </SegmentedControl>
    ),
    'styles.icon',
  ],
  [
    'Tab icon',
    value => (
      <TabList value="a" onChange={() => {}}>
        <Tab value="a" label="Overview" icon={value} />
      </TabList>
    ),
    'styles.icon',
  ],
  [
    'Tab selectedIcon',
    value => (
      <TabList value="a" onChange={() => {}}>
        <Tab value="a" label="Overview" icon="x" selectedIcon={value} />
      </TabList>
    ),
    'styles.icon',
  ],
  [
    'Tab endContent',
    value => (
      <TabList value="a" onChange={() => {}}>
        <Tab value="a" label="Overview" endContent={value} />
      </TabList>
    ),
    'styles.endContentWrapper',
  ],
];

describe.each(SLOTS)('%s follows isRenderable', (_slot, renderWith, style) => {
  it.each(EMPTY_VALUES)('renders no slot for %s', (_label, value) => {
    render(renderWith(value));
    // Tab selectedIcon falls back to the icon "x", which is not this check.
    if (_slot !== 'Tab selectedIcon') {
      expect(document.querySelector(`[class*="${style}"]`)).toBeNull();
    }
    expect(zeroParent()).toBeNull();
  });

  it('renders 0 inside its slot', () => {
    render(renderWith(0));
    expect(zeroIsInside(style)).toBe(true);
  });
});

describe('Tokenizer startIcon follows isRenderable', () => {
  const source = {search: () => [], bootstrap: () => []};
  const token = {id: 'ada', label: 'Ada'};
  const cases: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['an empty field', {value: []}],
    ['a field with collapsed tokens', {value: [token]}],
    [
      'a field whose tokens expand in a layer',
      {value: [token], tokenOverflowBehavior: 'unfocusedLayer'},
    ],
    [
      'the bottom-sheet trigger',
      {value: [token], experimental: {presentation: 'bottom-sheet'}},
    ],
  ];

  describe.each(cases)('in %s', (_case, props) => {
    const renderWith = (startIcon: ReactNode) =>
      render(
        <Tokenizer
          label="People"
          searchSource={source}
          onChange={() => {}}
          value={[]}
          startIcon={startIcon}
          {...props}
        />,
      );

    it.each(EMPTY_VALUES)('renders no start icon for %s', (_label, value) => {
      renderWith(value);
      expect(zeroParent()).toBeNull();
    });

    it('renders 0 as the start icon', () => {
      renderWith(0);
      const parent = zeroParent();
      expect(parent).not.toBeNull();
      // Where the start icon has a wrapper span, the 0 renders inside it,
      // never as a bare text node of the field's control box. The expanded
      // layer renders the icon with no wrapper, so 0 is its content there.
      if (props.tokenOverflowBehavior !== 'unfocusedLayer') {
        expect(parent?.tagName).toBe('SPAN');
      }
    });
  });
});

// Avatar's status slot has its own emptiness test: a truthy value renders it,
// and a falsy one, 0 included, renders nothing.
describe('Avatar status renders for a truthy value only', () => {
  it.each([...EMPTY_VALUES, ['0', 0] as const])(
    'renders no status slot and no stray "0" for %s',
    (_label, value) => {
      render(<Avatar name="Ada Lovelace" status={value} />);
      expect(document.querySelector('[class*="styles.status"]')).toBeNull();
      expect(zeroParent()).toBeNull();
    },
  );

  it('renders the status slot for a truthy value', () => {
    render(<Avatar name="Ada Lovelace" status={<span>Online</span>} />);
    expect(document.querySelector('[class*="styles.status"]')).not.toBeNull();
  });
});
