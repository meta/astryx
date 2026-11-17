// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThemeColorScheme.stories.tsx
 * @input Theme from @astryxdesign/core/theme and the neutral theme
 * @output A system Theme at the root, holding a Theme that forces light with a
 *   system Theme inside it, and a system Theme inside the system Theme; and a
 *   root Theme that forces dark, with a probe beside it on the page. Each
 *   probe's colour is `light-dark()`, so it names the scheme the probe
 *   resolves in, and the probe shows the mode `useTheme()` reports.
 * @position Storybook evidence for Theme's color scheme. The ThemeColorScheme
 *   Chromium spec reads this story with the toolbar theme set to none, so the
 *   story's outer Theme is the page's root Theme.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Theme, useTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const meta: Meta = {
  title: 'Core/Themes/ColorScheme',
};

export default meta;
type Story = StoryObj;

/**
 * Text whose colour is rgb(1, 2, 3) in a light scheme and rgb(4, 5, 6) in a
 * dark one, carrying the mode `useTheme()` reports there.
 */
function Probe({name}: {name: string}) {
  const {mode} = useTheme();
  return (
    <p
      data-probe={name}
      data-hook-mode={mode}
      style={{color: 'light-dark(rgb(1, 2, 3), rgb(4, 5, 6))'}}>
      {name}
    </p>
  );
}

export const Cases: Story = {
  render: () => (
    <Theme theme={neutralTheme} mode="system">
      <Probe name="root-system" />
      <Theme theme={neutralTheme} mode="light">
        <Probe name="forced-light" />
        <Theme theme={neutralTheme} mode="system">
          <Probe name="system-under-light" />
        </Theme>
      </Theme>
      <Theme theme={neutralTheme} mode="system">
        <Probe name="system-under-system" />
      </Theme>
    </Theme>
  ),
};

export const ForcedRoot: Story = {
  name: 'Forced root',
  render: () => (
    <>
      <Probe name="page" />
      <Theme theme={neutralTheme} mode="dark">
        <Probe name="forced-root" />
      </Theme>
    </>
  ),
};
