// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {MediaTheme, Theme, defineTheme} from '@astryxdesign/core/theme';
import type {ThemeMode} from '@astryxdesign/core/theme';
import {Pagination} from '@astryxdesign/core/Pagination';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

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
      <Pagination page={page} totalPages={5} onChange={setPage} />
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
        {children ?? <Subjects label={`${theme.name}, ${mode}`} />}
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
          <Subjects label="a light Theme inside a dark one" />
        </Theme>
      </Case>
      <Case id="surface" theme={blocksTheme} mode="dark">
        <MediaTheme mode="light">
          <Subjects label="a light surface inside a dark Theme" />
        </MediaTheme>
      </Case>
      {/* A mode Theme does not name light or dark follows the system. */}
      <Case
        id="blocks-other-mode"
        theme={blocksTheme}
        mode={'high-contrast' as ThemeMode}
      />
      <Case id="alternating" theme={blocksTheme} mode="light">
        <MediaTheme mode="dark">
          <div data-case="alternating-dark">
            <Subjects label="a dark surface" />
          </div>
          <MediaTheme mode="light">
            <div data-case="alternating-light">
              <Subjects label="a light surface inside it" />
            </div>
            <MediaTheme mode="dark">
              <div data-case="alternating-dark-again">
                <Subjects label="a dark surface inside that" />
              </div>
            </MediaTheme>
          </MediaTheme>
        </MediaTheme>
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
