// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPalette,
  CommandPaletteFooter,
} from '@astryxdesign/core/CommandPalette';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

const meta: Meta<typeof CommandPaletteFooter> = {
  title: 'Core/CommandPaletteFooter',
  component: CommandPaletteFooter,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
    docs: {story: {inline: false, height: '600px'}},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Palette({
  customFooter,
  expandedText = false,
}: {
  customFooter: boolean;
  expandedText?: boolean;
}) {
  const source = useMemo(
    () =>
      createStaticSource([
        {id: 'home', label: 'Go home'},
        {id: 'settings', label: 'Open settings'},
      ]),
    [],
  );
  const palette = (
    <CommandPalette
      isOpen
      onOpenChange={() => {}}
      searchSource={source}
      footer={
        customFooter ? (
          <CommandPaletteFooter>
            Type to filter available commands.
          </CommandPaletteFooter>
        ) : undefined
      }
    />
  );
  if (!expandedText) {
    return palette;
  }
  return (
    <InternationalizationProvider
      locale="fr"
      overrides={{
        fr: {
          '@astryx.commandPalette.footer.navigate': 'Parcourir les commandes',
          '@astryx.commandPalette.footer.select': 'Sélectionner la commande',
          '@astryx.commandPalette.footer.close':
            'Fermer la palette de commandes',
        },
      }}>
      {palette}
    </InternationalizationProvider>
  );
}

/** The built-in CommandPalette branch with translated keyboard guidance. */
export const Default: Story = {
  render: () => <Palette customFooter={false} />,
};

/** A caller-provided footer replaces the built-in guidance in the real slot. */
export const CustomContent: Story = {
  render: () => <Palette customFooter />,
};

/** Expanded translated labels expose narrow-screen wrapping regressions. */
export const ExpandedText: Story = {
  render: () => <Palette customFooter={false} expandedText />,
};
