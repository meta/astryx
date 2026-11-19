// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Timer} from '@astryxdesign/core/Timer';
import {Timestamp} from '@astryxdesign/core/Timestamp';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta = {
  title: 'Core/Themes/PartPrecedence',
  parameters: {
    docs: {
      description: {
        component:
          "A Timestamp and a Timer draw on Text's element. A theme's `timestamp` and `timer` entries win over its `text` entries there, and change only what the caller left unset: a color or size the caller passes draws as it would without them, and a plain Text draws the same with or without them.",
      },
    },
  },
};

export default meta;

// =============================================================================
// Themes
// =============================================================================

/** A theme's `text` entries, one row each. */
const TEXT_ENTRIES = {
  none: {},
  base: {text: {base: {color: '#008000', fontSize: '30px'}}},
  keyed: {
    text: {
      'type:body+color:primary': {color: '#0000ff'},
      'type:body+size:lg': {fontSize: '31px'},
      'type:supporting+color:accent': {color: '#008080'},
      'type:supporting+size:sm': {fontSize: '32px'},
    },
  },
} as const;

/** The parts on Text's element and what their entries draw. */
const PART_ENTRIES = {
  timestamp: {base: {color: '#ff0000', fontSize: '20px'}},
  timer: {base: {color: '#ff00ff', fontSize: '21px'}},
} as const;

/** The caller's props, one column each. */
const PROPS = {
  none: {},
  accent: {color: 'accent'},
  secondary: {color: 'secondary'},
  sm: {size: 'sm'},
  lg: {size: 'lg'},
} as const;

const THEMES = Object.entries(TEXT_ENTRIES).flatMap(([row, components]) => [
  {id: row, theme: defineTheme({name: `part-precedence-${row}`, components})},
  {
    id: `${row}-parts`,
    theme: defineTheme({
      name: `part-precedence-${row}-parts`,
      components: {...components, ...PART_ENTRIES},
    }),
  },
]);

// =============================================================================
// Cases
// =============================================================================

/** A fixed instant, so every render shows the same time. */
const INSTANT = 1_700_000_000;

function Subjects() {
  return (
    <Stack gap={2}>
      {Object.entries(PROPS).map(([prop, props]) => (
        <React.Fragment key={prop}>
          <div data-case={`text-${prop}`}>
            <Text type="body" {...props}>
              Plain text
            </Text>
          </div>
          <div data-case={`timestamp-${prop}`}>
            <Timestamp
              value={INSTANT}
              format="date"
              hasTooltip={false}
              {...props}
            />
          </div>
          <div data-case={`timer-${prop}`}>
            <Timer startTime={INSTANT} {...props} />
          </div>
        </React.Fragment>
      ))}
    </Stack>
  );
}

function Case({id, theme}: {id: string; theme: DefinedTheme}) {
  return (
    <section data-theme-case={id}>
      <Theme theme={theme} mode="light">
        <Subjects />
      </Theme>
    </section>
  );
}

function CasesDemo() {
  return (
    <Stack gap={4}>
      {THEMES.map(({id, theme}) => (
        <Case key={id} id={id} theme={theme} />
      ))}
    </Stack>
  );
}

export const Cases: StoryObj = {
  render: () => <CasesDemo />,
};
