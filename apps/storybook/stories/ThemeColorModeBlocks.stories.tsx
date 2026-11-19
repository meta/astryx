// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {MediaTheme, Theme, defineTheme} from '@astryxdesign/core/theme';
import type {ThemeMode} from '@astryxdesign/core/theme';
import {Pagination} from '@astryxdesign/core/Pagination';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta = {
  title: 'Core/Themes/ColorModeBlocks',
  parameters: {
    docs: {
      description: {
        component:
          "A theme's component overrides can hold `@light` and `@dark` blocks that apply only in that color mode. In the other mode the block writes nothing, so what Core gives a component in context stays as it was: the current page in Pagination and a text field's status border.",
      },
    },
  },
};

export default meta;

// =============================================================================
// Themes
// =============================================================================

/** The same theme with nothing set: what the other mode keeps. */
const plainTheme = defineTheme({name: 'color-mode-plain'});

/** A dark-only ghost button background and a light-only field border. */
const blocksTheme = defineTheme({
  name: 'color-mode-blocks',
  components: {
    button: {
      'variant:ghost': {
        '@dark': {
          backgroundColor: '#ff00ff',
          ':active': {backgroundColor: '#550055'},
        },
      },
    },
    'text-input': {base: {'@light': {borderColor: '#00ff00'}}},
    text: {base: {'@dark': {fontSize: '30px', color: '#ff8800'}}},
    heading: {base: {'@dark': {fontWeight: '300'}}},
  },
});

// =============================================================================
// Cases
// =============================================================================

function Subjects({label}: {label: string}) {
  const [page, setPage] = React.useState(2);
  return (
    <Stack gap={2}>
      <Text weight="semibold">{label}</Text>
      <Pagination
        page={page}
        totalPages={5}
        onChange={setPage}
        label={`Pagination: ${label}`}
      />
      <div data-probe="error">
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error', message: 'Required'}}
        />
      </div>
      <div data-probe="plain">
        <TextInput label="Name" value="" onChange={() => {}} />
      </div>
    </Stack>
  );
}

/** Text and a heading with explicit props, and text with none. */
function Explicit() {
  return (
    <Stack gap={2}>
      <div data-probe="explicit-text">
        <Text size="lg" color="secondary">
          Explicit size and color
        </Text>
      </div>
      <div data-probe="explicit-heading">
        <Heading level={2} weight="bold">
          Explicit weight
        </Heading>
      </div>
      <div data-probe="plain-text">
        <Text>No explicit props</Text>
      </div>
    </Stack>
  );
}

/** The theme's own page, so text sits on the theme's background. */
function Page({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-background-body)',
        color: 'var(--color-text-primary)',
        padding: 16,
      }}>
      {children}
    </div>
  );
}

/** A MediaTheme surface on the inverted background it is made for. */
function Surface({
  mode,
  children,
}: {
  mode: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        backgroundColor:
          'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
        padding: 16,
      }}>
      <MediaTheme mode={mode}>{children}</MediaTheme>
    </div>
  );
}

function Case({
  id,
  theme,
  mode,
  children,
}: {
  id: string;
  theme: typeof plainTheme;
  mode: ThemeMode;
  children?: React.ReactNode;
}) {
  return (
    <section data-case={id}>
      <Theme theme={theme} mode={mode}>
        <Page>{children ?? <Subjects label={`${theme.name}, ${mode}`} />}</Page>
      </Theme>
    </section>
  );
}

function CasesDemo() {
  return (
    <Stack gap={4}>
      <Case id="plain-light" theme={plainTheme} mode="light" />
      <Case id="plain-dark" theme={plainTheme} mode="dark" />
      <Case id="blocks-light" theme={blocksTheme} mode="light" />
      <Case id="blocks-dark" theme={blocksTheme} mode="dark" />
      <Case id="blocks-system" theme={blocksTheme} mode="system" />
      <Case id="nested" theme={blocksTheme} mode="dark">
        <Theme theme={blocksTheme} mode="light">
          <Page>
            <Subjects label="a light Theme inside a dark one" />
          </Page>
        </Theme>
      </Case>
      <Case id="surface" theme={blocksTheme} mode="dark">
        <Surface mode="light">
          <Subjects label="a light surface inside a dark Theme" />
        </Surface>
      </Case>
      {/* A mode Theme does not name light or dark follows the system. */}
      <Case
        id="blocks-other-mode"
        theme={blocksTheme}
        mode={'high-contrast' as ThemeMode}
      />
      <Case id="explicit-root" theme={blocksTheme} mode="dark">
        <Explicit />
      </Case>
      <Case id="explicit-surface" theme={blocksTheme} mode="light">
        <Surface mode="dark">
          <Explicit />
        </Surface>
      </Case>
      <Case id="alternating" theme={blocksTheme} mode="light">
        <Surface mode="dark">
          <div data-case="alternating-dark">
            <Subjects label="a dark surface" />
          </div>
          <Surface mode="light">
            <div data-case="alternating-light">
              <Subjects label="a light surface inside it" />
            </div>
            <Surface mode="dark">
              <div data-case="alternating-dark-again">
                <Subjects label="a dark surface inside that" />
              </div>
            </Surface>
          </Surface>
        </Surface>
      </Case>
    </Stack>
  );
}

export const Cases: StoryObj = {
  render: () => <CasesDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'The same components under a theme with nothing set and under one with a dark-only ghost button background and press, and a light-only field border: in each mode, the system mode, a mode that is neither, a nested Theme, a MediaTheme surface, and alternating surfaces.',
      },
    },
  },
};
