// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarTodayHydration.stories.tsx
 * @input Calendar, React's server renderer and hydrateRoot, run in the page
 * @output A fixture that server-renders Calendar, or a sheet DateInput or
 *   DateTimeInput, on one date and hydrates it on another, for the browser
 *   lane; excluded from the visual matrix
 * @position Real-browser server render, hydration and post-hydration fixture
 *   for component:Calendar FR12 and the sheet fields of spec:AST-013 FR9
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useRef, useState, type ReactElement} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar, DateInput, DateTimeInput} from '@astryxdesign/core';

const meta = {
  title: 'Core/CalendarHydration',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * "Server render" writes the server markup with the page's current date.
 * The spec then moves the date and presses "Hydrate", so the server and the
 * browser disagree on today, as a UTC server and a visitor in another zone
 * do near midnight.
 */
function HydrationFixture({tree}: {tree: ReactElement}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'server' | 'hydrated'>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hostRef.current == null) {
            return;
          }
          hostRef.current.innerHTML = renderToString(tree);
          setPhase('server');
        }}>
        Server render
      </button>
      <button
        type="button"
        onClick={() => {
          if (hostRef.current == null) {
            return;
          }
          const found: string[] = [];
          hydrateRoot(hostRef.current, tree, {
            onRecoverableError: error => {
              found.push(String(error));
              setErrors([...found]);
            },
          });
          setPhase('hydrated');
        }}>
        Hydrate
      </button>
      <output data-phase={phase} data-errors={errors.length}>
        {errors.join('\n')}
      </output>
      <div ref={hostRef} data-testid="host" />
    </div>
  );
}

export const OneMonth: Story = {
  render: () => <HydrationFixture tree={<Calendar />} />,
};

export const TwoMonths: Story = {
  render: () => <HydrationFixture tree={<Calendar numberOfMonths={2} />} />,
};

export const SheetDateInput: Story = {
  render: () => (
    <HydrationFixture
      tree={
        <DateInput
          label="Due"
          presentation="bottom-sheet"
          onChange={() => {}}
        />
      }
    />
  ),
};

export const SheetDateTimeInput: Story = {
  render: () => (
    <HydrationFixture
      tree={
        <DateTimeInput
          label="Starts"
          presentation="bottom-sheet"
          onChange={() => {}}
        />
      }
    />
  ),
};
