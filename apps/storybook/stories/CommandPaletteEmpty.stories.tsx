// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteEmpty.stories.tsx
 * @input Uses CommandPalette, CommandPaletteEmpty, Link, InternationalizationProvider
 * @output Storybook fixture for empty-state content the CommandPalette stories do not reach
 * @position Component-owned fixture; the CommandPalette audit matrix covers the
 *   default built-in empty branch, this covers expanded, long, and standalone content
 */

import {useMemo} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPalette,
  CommandPaletteEmpty,
} from '@astryxdesign/core/CommandPalette';
import {Link} from '@astryxdesign/core/Link';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {createStaticSource} from '@astryxdesign/core/Typeahead';

const meta: Meta<typeof CommandPaletteEmpty> = {
  title: 'Core/CommandPaletteEmpty',
  component: CommandPaletteEmpty,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const panelStyle = {flex: '1 1 280px', minWidth: 0} as const;
const headingStyle = {
  marginBlock: '0 8px',
  font: 'inherit',
  fontWeight: 600,
} as const;

/**
 * Empty content the built-in branch must hold without breaking layout: catalog
 * text expanded by translation, a long unbroken path echoed into the message,
 * and the standalone composition with caller-provided rich content.
 */
export const ContentMatrix: Story = {
  render: function Render() {
    const emptySource = useMemo(() => createStaticSource([]), []);
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: 16,
          width: '100%',
          padding: 16,
          boxSizing: 'border-box',
        }}>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Translated built-in text</h2>
          <InternationalizationProvider
            locale="fr"
            overrides={{
              fr: {
                '@astryx.commandPalette.emptyBootstrap':
                  'Commencez à saisir pour rechercher parmi les commandes disponibles',
                '@astryx.commandPalette.emptySearch':
                  'Aucune commande ne correspond à votre recherche',
              },
            }}>
            <CommandPalette
              isOpen
              isInline
              role="region"
              label="Translated empty command palette"
              onOpenChange={() => {}}
              searchSource={emptySource}
              width="100%"
              maxHeight={320}
            />
          </InternationalizationProvider>
        </section>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Long unbroken text</h2>
          <CommandPalette
            isOpen
            isInline
            role="region"
            label="Long empty command palette"
            onOpenChange={() => {}}
            searchSource={emptySource}
            emptyBootstrapText="No files in /workspace/design-system/packages/core/src/CommandPalette/__fixtures__/empty-results/"
            emptySearchText="No files match /workspace/design-system/packages/core/src/CommandPalette/__fixtures__/empty-results/"
            width="100%"
            maxHeight={320}
          />
        </section>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Standalone rich content</h2>
          <CommandPaletteEmpty>
            <span>
              No saved searches yet.{' '}
              <Link href="#create-saved-search">Create a saved search</Link>
            </span>
          </CommandPaletteEmpty>
        </section>
      </div>
    );
  },
};
