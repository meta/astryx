// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A preview page for a design choice: what a press does to a
 *   trigger whose own popover or menu is open, with a try-it per option
 * @position A raw page for a review. Options A and W are simulated on this
 *   page only, through the controls' public props; no component changes.
 */

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {
  DropdownMenu,
  type DropdownMenuOption,
} from '@astryxdesign/core/DropdownMenu';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {Popover} from '@astryxdesign/core/Popover';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {durationVars} from '@astryxdesign/core/theme/tokens.stylex';

type Choice = 'today' | 'a' | 'w';

// Option A, simulated: a trigger keeps its press scale only while its own
// layer is closed. The scale drops at once as the layer opens, so the
// layer's first frame meets the unscaled box.
const optionA = stylex.create({
  button: {
    transform: {
      default: 'scale(1)',
      ':active:not([aria-expanded="true"])': {
        default: 'scale(0.98)',
        '@media (pointer: coarse)': 'scale(1)',
        '@media (prefers-reduced-motion: reduce)': 'scale(1)',
      },
      '[data-astryx-press="on"]:not([aria-expanded="true"])': {
        default: 'scale(0.98)',
        '@media (prefers-reduced-motion: reduce)': 'scale(1)',
      },
    },
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '[aria-expanded="true"]': '0s',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
  },
  // A selector scales its control box, and the combobox inside the box
  // carries the open state.
  controlBox: {
    transform: {
      default: 'scale(1)',
      ':active:not(:has([aria-expanded="true"]))': {
        default: 'scale(0.98)',
        '@media (pointer: coarse)': 'scale(1)',
      },
      '[data-astryx-press="on"]:not(:has([aria-expanded="true"]))':
        'scale(0.98)',
    },
    transitionDuration: {
      default: durationVars['--duration-fast'],
      ':has([aria-expanded="true"])': '0s',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
  },
});

// Option W, simulated: an unscaled box takes the menu's anchor, and the
// press scales only the Button inside it.
const optionW = stylex.create({
  box: {
    display: 'inline-flex',
  },
});

const styles = stylex.create({
  page: {
    maxInlineSize: '44rem',
  },
});

const MENU_ITEMS: DropdownMenuOption[] = [
  {label: 'Edit'},
  {label: 'Duplicate'},
  {label: 'Share'},
];

type Density = 'Comfortable' | 'Compact';

const FRUITS = ['Apple', 'Banana', 'Orange', 'Mango', 'Pineapple'];
const COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Created'];

function SelectorRow({
  variant,
  isA,
}: {
  variant: 'ghost' | 'secondary';
  isA: boolean;
}) {
  const [fruit, setFruit] = useState<string | undefined>('Apple');
  return (
    <HStack gap={4} align="center" wrap="wrap">
      <Text weight="medium">Selector ({variant})</Text>
      <Selector
        label={`Fruit, ${variant}`}
        isLabelHidden
        variant={variant}
        options={FRUITS}
        value={fruit}
        onChange={setFruit}
        controlXstyle={isA ? optionA.controlBox : undefined}
      />
    </HStack>
  );
}

function MultiSelectorRow({
  variant,
  isA,
}: {
  variant: 'ghost' | 'secondary';
  isA: boolean;
}) {
  const [columns, setColumns] = useState<string[]>(['Role', 'Created']);
  return (
    <HStack gap={4} align="center" wrap="wrap">
      <Text weight="medium">MultiSelector ({variant})</Text>
      <MultiSelector
        label={`Columns, ${variant}`}
        isLabelHidden
        variant={variant}
        options={COLUMNS}
        value={columns}
        onChange={setColumns}
        controlXstyle={isA ? optionA.controlBox : undefined}
      />
    </HStack>
  );
}

function TryIt({choice}: {choice: Choice}) {
  const [density, setDensity] = useState<Density>('Comfortable');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const isA = choice === 'a';
  return (
    <VStack gap={5}>
      <HStack gap={4} align="center" wrap="wrap">
        <Text weight="medium">Popover</Text>
        <Popover
          label="Settings"
          placement="below"
          width={280}
          content={
            <Text color="secondary">
              Hold the Settings button and watch this popover.
            </Text>
          }>
          <Button label="Settings" xstyle={isA ? optionA.button : undefined} />
        </Popover>
      </HStack>
      <HStack gap={4} align="center" wrap="wrap">
        <Text weight="medium">Popover (anchorRef)</Text>
        <Button
          ref={anchorRef}
          label="Anchor"
          xstyle={isA ? optionA.button : undefined}
        />
        <Popover
          anchorRef={anchorRef as React.RefObject<HTMLElement>}
          label="Anchored popover"
          placement="below"
          width={260}
          content={
            <Text color="secondary">
              Hold the Anchor button and watch this popover.
            </Text>
          }
        />
      </HStack>
      <SelectorRow variant="ghost" isA={isA} />
      <SelectorRow variant="secondary" isA={isA} />
      <MultiSelectorRow variant="ghost" isA={isA} />
      <MultiSelectorRow variant="secondary" isA={isA} />
      <HStack gap={4} align="center" wrap="wrap">
        <Text weight="medium">ComplexSelector (secondary)</Text>
        <ComplexSelector<Density>
          label="View density"
          isLabelHidden
          value={density}
          onChange={setDensity}
          triggerLabel={`Density: ${density}`}
          variant="secondary"
          size="sm"
          width={190}
          startIcon="viewColumns"
          controlXstyle={isA ? optionA.controlBox : undefined}>
          {(selected, onChange, close) => (
            <HStack gap={2}>
              {(['Comfortable', 'Compact'] as const).map(option => (
                <Button
                  key={option}
                  label={option}
                  size="sm"
                  variant={selected === option ? 'primary' : 'secondary'}
                  onClick={() => {
                    onChange(option);
                    close();
                  }}
                />
              ))}
            </HStack>
          )}
        </ComplexSelector>
      </HStack>
      <HStack gap={4} align="center" wrap="wrap">
        <Text weight="medium">DropdownMenu</Text>
        {choice === 'w' ? (
          <DropdownMenu
            items={MENU_ITEMS}
            renderTrigger={({
              ref,
              onClick,
              onClickCapture,
              onPointerDown,
              onContextMenu,
              onKeyDown,
              onFocus,
              ...named
            }) => (
              // The box holds the anchor, so the menu's press handling
              // lives on it. The Button inside keeps the name and state.
              <HStack
                ref={ref}
                xstyle={optionW.box}
                onClick={onClick}
                onClickCapture={onClickCapture}
                onPointerDown={onPointerDown}
                onContextMenu={onContextMenu}
                onKeyDown={onKeyDown}
                onFocus={onFocus}>
                <Button
                  label="Actions"
                  endContent={
                    <Icon icon="chevronDown" size="sm" color="inherit" />
                  }
                  {...named}
                />
              </HStack>
            )}
          />
        ) : (
          <DropdownMenu
            button={{
              label: 'Actions',
              xstyle: isA ? optionA.button : undefined,
            }}
            items={MENU_ITEMS}
          />
        )}
      </HStack>
    </VStack>
  );
}

export default function PressScaleChoicePage() {
  const [choice, setChoice] = useState<Choice>('today');
  return (
    <VStack gap={8} padding={5} xstyle={styles.page}>
      <VStack gap={3}>
        <Heading level={1}>A press on a trigger whose layer is open</Heading>
        <Text>
          A press scales its control to 0.98. When that control&apos;s own
          popover or menu is open, the layer can move with it.
        </Text>
        <Text>Held on its open trigger today, a layer moves:</Text>
        <VStack gap={1}>
          <Text>
            MultiSelector, ghost or secondary: its list moves about 1 px and
            narrows about 2 px.
          </Text>
          <Text>
            ComplexSelector, secondary: its list moves about 2 px sideways.
          </Text>
          <Text>
            DropdownMenu, under a finger: its menu moves 1 px and narrows 2 px.
          </Text>
          <Text>
            Popover through anchorRef, under a mouse: it moves 0.7 px.
          </Text>
        </VStack>
        <Text>
          A Popover with its own trigger stays still. The default input
          selectors have no press scale.
        </Text>
        <Text>Your rule (02:31): a press never scales its popover.</Text>
      </VStack>

      <VStack gap={4}>
        <Heading level={2}>Try it</Heading>
        <Text>
          Open each control, then press and hold it. Watch the edge of the open
          layer. Option B needs a change inside Button and each selector, so
          this page cannot show it. W changes only the DropdownMenu row, and its
          box is simulated for a finger: a click cannot open it here. A ghost or
          secondary Selector&apos;s list covers its trigger, so it cannot be
          held.
        </Text>
        <SegmentedControl
          label="Option"
          value={choice}
          onChange={value => setChoice(value as Choice)}>
          <SegmentedControlItem value="today" label="Today" />
          <SegmentedControlItem value="a" label="A" />
          <SegmentedControlItem value="w" label="W" />
        </SegmentedControl>
        <TryIt key={choice} choice={choice} />
      </VStack>

      <VStack gap={6}>
        <Heading level={2}>Options</Heading>
        <VStack gap={2}>
          <Heading level={3}>
            A: no press scale while the trigger&apos;s own layer is open
          </Heading>
          <Text weight="medium">New public API / breaking: none.</Text>
          <Text>
            The trigger keeps its press scale while its layer is closed. As the
            layer opens, the scale drops at once. No DOM, API or layout change.
            On this page it stops every move above, under a mouse and a finger.
          </Text>
          <Text>
            Measured on DropdownMenu&apos;s touch hold: the finger presses the
            trigger before the menu opens. In the menu&apos;s first frame the
            trigger is already back at full size, so the menu never moves. Today
            the trigger stays at 0.98 for the whole hold.
          </Text>
        </VStack>
        <VStack gap={2}>
          <Heading level={3}>B: an inner part carries the press scale</Heading>
          <Text weight="medium">
            New public API / breaking: not breaking, but a theme-contract
            change.
          </Text>
          <Text>
            Every Button and selector gains one inner element, and only that
            element scales. The control&apos;s own box never moves, so no layer
            moves and no layout breaks. A theme that styles the pressed control
            moves its rules to the inner element.
          </Text>
        </VStack>
        <VStack gap={2}>
          <Heading level={3}>
            W: a box around DropdownMenu&apos;s trigger
          </Heading>
          <Text weight="medium">
            New public API / breaking: breaking. It forces a minor release and
            your extra sign-off.
          </Text>
          <Text>
            An unscaled box around the trigger takes the menu&apos;s anchor. It
            breaks caller layout. In a 480 px row, marginInlineStart: auto moves
            the trigger from x 406 to 80, and flexGrow: 1 shrinks it from 424 to
            90 px.
          </Text>
          <Text>
            Callers get a migration note: &ldquo;Layout that places the trigger
            in its parent (margins, flex or grid placement, alignSelf) moves
            from button.xstyle, className or style to an element around the
            DropdownMenu.&rdquo; A trigger in an InputGroup addon keeps its own
            anchor. display: contents would leave no box to anchor to.
          </Text>
          <Text>
            W fixes only DropdownMenu. The selectors and the anchorRef Popover
            still move, so they would still need A or B.
          </Text>
        </VStack>
      </VStack>

      <VStack gap={2}>
        <Heading level={2}>A press that closes a layer</Heading>
        <Text>
          It moves nothing in any option. Under a mouse the layer goes at once.
          A touch close plays on a copy of the layer that is not anchored to the
          trigger.
        </Text>
      </VStack>

      <VStack gap={2}>
        <Heading level={2}>Your reply</Heading>
        <Text>PS A, PS B or PS W.</Text>
      </VStack>
    </VStack>
  );
}
