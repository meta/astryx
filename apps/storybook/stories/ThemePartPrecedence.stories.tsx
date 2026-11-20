// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {MediaTheme, Theme, defineTheme} from '@astryxdesign/core/theme';
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
          "A theme with an entry for a part on another component's element, such as a toggle button, writes its rules in two sub-layers. A plain Text, a Timestamp and a Timer draw the same with or without that entry, whatever the theme's `text`, `timestamp` and `timer` entries and the caller's props. The `timestamp` and `timer` entries sit at the theme's root, in an adaptation, or on a dark media surface.",
      },
    },
  },
};

export default meta;

// =============================================================================
// Themes
// =============================================================================

type Components = NonNullable<Parameters<typeof defineTheme>[0]['components']>;

/**
 * A theme's `text` entries, one row each, in colors that read on a light page
 * and on a dark surface.
 */
function textEntries(onDark: boolean): Record<string, Components> {
  const [green, blue, teal, purple] = onDark
    ? ['#7fd87f', '#a8c4ff', '#7fe0e0', '#d9b8ff']
    : ['#006400', '#0000c8', '#006060', '#5c2d91'];
  return {
    none: {},
    base: {text: {base: {color: green, fontSize: '30px'}}},
    keyed: {
      text: {
        'type:body+color:primary': {color: blue},
        'type:body+size:lg': {fontSize: '31px'},
        'type:supporting+color:accent': {color: teal},
        'type:supporting+size:sm': {fontSize: '32px'},
      },
    },
    onekey: {
      text: {
        'color:accent': {color: purple},
        'size:lg': {fontSize: '33px'},
      },
    },
  };
}

/** The parts on Text's element and what their entries draw. */
function partEntries(onDark: boolean): Components {
  return onDark
    ? {
        timestamp: {base: {color: '#ffb0b0', fontSize: '20px'}},
        timer: {base: {color: '#ffb0ff', fontSize: '21px'}},
      }
    : {
        timestamp: {base: {color: '#b00000', fontSize: '20px'}},
        timer: {base: {color: '#800080', fontSize: '21px'}},
      };
}

/** The caller's props, one column each. */
const PROPS = {
  none: {},
  accent: {color: 'accent'},
  secondary: {color: 'secondary'},
  sm: {size: 'sm'},
  lg: {size: 'lg'},
} as const;

interface Case {
  id: string;
  theme: DefinedTheme;
  surface: boolean;
}

/** A part entry on another element: it turns the theme's sub-layers on. */
const LAYERING: Components = {
  'toggle-button': {base: {borderColor: '#333333'}},
};

/** Where the `timestamp` and `timer` entries sit. */
const PLACES = ['none', 'root', 'adaptation', 'ondark'] as const;

function themeFor(
  row: string,
  place: (typeof PLACES)[number],
  layered: boolean,
): DefinedTheme {
  const onDark = place === 'ondark';
  const text = textEntries(onDark)[row];
  const extra = layered ? LAYERING : {};
  const name = `part-precedence-${row}-${place}${layered ? '-layered' : ''}`;
  if (place === 'root') {
    return defineTheme({
      name,
      components: {...text, ...partEntries(false), ...extra},
    });
  }
  if (place === 'adaptation') {
    return defineTheme({
      name,
      components: {...text, ...extra},
      adaptations: {
        rules: [
          {
            when: {motion: 'no-preference'},
            value: {components: partEntries(false)},
          },
        ],
      },
    });
  }
  if (onDark) {
    return defineTheme({
      name,
      components: {...text, ...extra},
      onDark: {components: partEntries(true)},
    });
  }
  return defineTheme({name, components: {...text, ...extra}});
}

function casesFor(row: string): Case[] {
  return PLACES.flatMap(place =>
    [false, true].map(layered => ({
      id: `${row}-${place}${layered ? '-layered' : ''}`,
      theme: themeFor(row, place, layered),
      surface: place === 'ondark',
    })),
  );
}

const CASES = ['none', 'base', 'keyed', 'onekey'].flatMap(casesFor);

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

/** A dark MediaTheme surface on the inverted background it is made for. */
function Surface({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        backgroundColor:
          'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
        padding: 16,
      }}>
      <MediaTheme mode="dark">{children}</MediaTheme>
    </div>
  );
}

function ThemeCase({id, theme, surface}: Case) {
  return (
    <section data-theme-case={id}>
      <Theme theme={theme} mode="light">
        {surface ? (
          <Surface>
            <Subjects />
          </Surface>
        ) : (
          <Subjects />
        )}
      </Theme>
    </section>
  );
}

function CasesDemo() {
  return (
    <Stack gap={4}>
      {CASES.map(({id, theme, surface}) => (
        <ThemeCase key={id} id={id} theme={theme} surface={surface} />
      ))}
    </Stack>
  );
}

export const Cases: StoryObj = {
  render: () => <CasesDemo />,
};
