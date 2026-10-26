// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {CSSProperties} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof Spinner> = {
  title: 'Core/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Spinner size',
    },
    shade: {
      control: 'select',
      options: ['default', 'onMedia', 'subtle', 'inherit'],
      description: 'Color shade',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

/**
 * A flex host of a fixed width, drawn so the spinner's relationship to it is
 * visible. Deliberately a raw flex container: the point of the story below is
 * what an arbitrary consumer's layout does to the spinner's box.
 */
const narrowHost = (width: number): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width,
  border: '1px dashed #b0b0b0',
  padding: 4,
});

export const Default: Story = {
  args: {
    size: 'md',
    shade: 'default',
  },
};

export const Sizes: Story = {
  render: () => (
    <HStack gap={4} vAlign="center">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <Spinner size="xl" />
    </HStack>
  ),
};

export const Shades: Story = {
  render: () => (
    <HStack gap={4} vAlign="center">
      <Spinner shade="default" />
      <div
        style={{
          backgroundColor: '#1a1a2e',
          padding: 16,
          borderRadius: 8,
        }}>
        <Spinner shade="onMedia" />
      </div>
    </HStack>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <HStack gap={8} vAlign="start">
      <Spinner size="lg" label="Loading..." />
      <Spinner
        size="lg"
        label={
          <VStack gap={0} hAlign="center">
            <Text type="body" weight="bold">
              Fetching data
            </Text>
            <Text type="supporting" color="secondary">
              This may take a moment
            </Text>
          </VStack>
        }
        aria-label="Fetching data"
      />
    </HStack>
  ),
};

// The ring is an SVG circle whose radius and stroke come off the cascade, so a
// theme reaches its geometry and its two colors through public custom
// properties rather than CSS box properties — `width` would name a box the
// ring is not. These stories are how that surface is checked: the a11y and RTL
// audits only see what a story renders, and a themed ring cannot be verified
// in jsdom (no layout, no registered properties), so this is where a browser
// can look at it.
//
// Geometry is deliberately themed in `rem` rather than `px`: the resolved vars
// are registered as `<length>`, and a relative unit surviving into the drawn
// radius is what distinguishes a resolved value from substituted text.
const themedGeometry = defineTheme({
  name: 'spinner-themed-geometry',
  components: {
    spinner: {
      'size:sm': {
        '--spinner-diameter': '1rem',
        '--spinner-stroke-width': '0.125rem',
      },
      'size:md': {
        '--spinner-diameter': '1.5rem',
        '--spinner-stroke-width': '0.25rem',
      },
      'size:lg': {
        '--spinner-diameter': '2rem',
        '--spinner-stroke-width': '0.3125rem',
      },
      'size:xl': {
        '--spinner-diameter': 'calc(2rem + 8px)',
        '--spinner-stroke-width': '0.375rem',
      },
    },
  },
});

// A `Theme` with no parent Theme syncs its name onto the document root so its
// @scope'd component rules also reach portals — which means they reach every
// spinner on the page, including ones rendered outside the provider. A
// "default vs themed" pair inside one story therefore shows two themed rows,
// measured in Chromium; the unthemed reference is the `Sizes` story above.
export const ThemedGeometry: Story = {
  name: 'Themed Geometry (per size)',
  render: () => (
    <VStack gap={2}>
      <Text type="supporting" color="secondary">
        Themed — rem and calc() diameters; the box tracks the ring
      </Text>
      <Theme theme={themedGeometry} mode="light">
        <HStack gap={4} vAlign="center">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <Spinner size="xl" />
        </HStack>
      </Theme>
    </VStack>
  ),
};

// A hairline stroke: geometry themed down to 1px while the diameter stays put.
// Not `0` — one `stroke-width` drives both circles, so a stroke width of `0` is a
// zero-width stroke on each and paints nothing. An arc with no track behind it
// is `--spinner-track-color: transparent`, which is what the subtle shade in
// `ThemedColor` shows.
const themedHairline = defineTheme({
  name: 'spinner-themed-hairline',
  components: {
    spinner: {
      'size:xl': {'--spinner-stroke-width': '1px'},
      base: {'--spinner-track-color': 'transparent'},
    },
  },
});

// Colors default to each shade's token, so a theme can retune one shade
// without touching the others. `--color-text-blue` over a muted wash reads as
// themed in the monochrome neutral theme, where an accent-muted pair would
// land within a shade of the default.
const themedColor = defineTheme({
  name: 'spinner-themed-color',
  components: {
    spinner: {
      base: {
        '--spinner-color': 'var(--color-text-blue)',
        '--spinner-track-color': 'var(--color-background-blue)',
      },
      'shade:subtle': {'--spinner-track-color': 'transparent'},
    },
  },
});

export const ThemedColor: Story = {
  name: 'Themed Color (per shade)',
  render: () => (
    <VStack gap={2}>
      <Text type="supporting" color="secondary">
        Themed — blue arc and wash; the subtle shade drops its track (the
        `Shades` story above is the untinted reference — see the note on
        `ThemedGeometry` for why it cannot sit in this story)
      </Text>
      <Theme theme={themedColor} mode="light">
        <HStack gap={4} vAlign="center">
          <Spinner size="xl" />
          <Spinner size="xl" shade="subtle" />
        </HStack>
      </Theme>
    </VStack>
  ),
};

// One Theme per story, for the same reason: two providers in one story would
// each claim the document root and the last one mounted would paint both rows.
export const ThemedHairlineStroke: Story = {
  name: 'Themed Hairline Stroke',
  render: () => (
    <VStack gap={2}>
      <Text type="supporting" color="secondary">
        Themed — a 1px hairline stroke over a transparent track
      </Text>
      <Theme theme={themedHairline} mode="light">
        <Spinner size="xl" />
      </Theme>
    </VStack>
  ),
};

/**
 * A flex host narrower than the spinner in it. The box keeps the ring's size
 * and overflows the host visibly; before the fix the host compressed the box
 * and the ring was cut off at its edge, silently — a sliced ring still spins,
 * so nothing reported a problem. The dashed rule is the host, drawn so the
 * overflow is legible.
 *
 * All three are ordinary layouts rather than contrived ones: a label beside a
 * spinner in a narrow row, a spinner next to a sibling that will not give up
 * its width, and a host smaller than the spinner outright.
 */
export const NarrowFlexHost: Story = {
  render: () => (
    <VStack gap={4} hAlign="start">
      <VStack gap={1} hAlign="start">
        <Text type="supporting" color="secondary">
          Label beside it, in a 140px row
        </Text>
        <div style={narrowHost(140)}>
          <Spinner size="md" />
          <Text type="body">Uploading attachments…</Text>
        </div>
      </VStack>

      <VStack gap={1} hAlign="start">
        <Text type="supporting" color="secondary">
          Beside a sibling that keeps its width (flex: 1 0 100px)
        </Text>
        <div style={narrowHost(120)}>
          <Spinner size="lg" />
          <div style={{flex: '1 0 100px', height: 8, background: '#e0e0e0'}} />
        </div>
      </VStack>

      <VStack gap={1} hAlign="start">
        <Text type="supporting" color="secondary">
          Host narrower than the spinner outright (16px)
        </Text>
        <div style={narrowHost(16)}>
          <Spinner size="xl" />
        </div>
      </VStack>
    </VStack>
  ),
};

// An iOS-style activity indicator, for an app that wants that look: not a
// Spinner option but a component composed from StyleX and plain elements, to
// copy. As UIActivityIndicatorView draws it (iOS 26): eight capsule spokes, a
// bright head that steps clockwise one spoke every 100 ms (a turn every
// 0.8 s), and the trail dimming behind it, in UIKit's gray. Each spoke runs
// one opacity animation whose holds are joined by short linear ramps rather
// than steps(), which WebKit runs only on the main thread, so it keeps turning
// while a script runs. Like UIKit's, it keeps its pace under Reduce Motion and
// turns clockwise in right-to-left layouts.

/**
 * A spoke's opacity from the moment the head reaches it: UIKit's sixteen
 * images a turn, 50 ms each, with its spokes' alphas.
 */
const activitySpoke = stylex.keyframes({
  '0%': {opacity: 0.51},
  '6.24%': {opacity: 0.51},
  '6.25%': {opacity: 0.467},
  '12.49%': {opacity: 0.467},
  '12.5%': {opacity: 0.424},
  '18.74%': {opacity: 0.424},
  '18.75%': {opacity: 0.38},
  '24.99%': {opacity: 0.38},
  '25%': {opacity: 0.337},
  '31.24%': {opacity: 0.337},
  '31.25%': {opacity: 0.294},
  '37.49%': {opacity: 0.294},
  '37.5%': {opacity: 0.251},
  '43.74%': {opacity: 0.251},
  '43.75%': {opacity: 0.208},
  '49.99%': {opacity: 0.208},
  '50%': {opacity: 0.165},
  '100%': {opacity: 0.165},
});

const activityStyles = stylex.create({
  indicator: {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
  },
  medium: {width: 20, height: 20},
  large: {width: 37, height: 37},
  spoke: {
    position: 'absolute',
    top: 0,
    borderRadius: 9999,
    // UIKit's secondary label color, light and dark (the alphas above are
    // the images', which include its own). Its brightest spoke reaches only
    // 2.74:1 on a white page, under the 3:1 WCAG asks of non-text graphics;
    // an app that needs 3:1 can draw the spokes in the theme's primary text
    // color (`colorVars['--color-text-primary']`: 3.64:1 at the same alphas,
    // where the secondary text color is lighter, 2.25:1). Under forced colors
    // a background becomes the page's Canvas, which would hide every spoke;
    // the spokes keep the system text color instead.
    backgroundColor: {
      default: 'light-dark(#3C3C43, #EBEBF5)',
      '@media (forced-colors: active)': 'CanvasText',
    },
    forcedColorAdjust: {
      default: null,
      '@media (forced-colors: active)': 'none',
    },
    animationName: activitySpoke,
    animationDuration: '0.8s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  // 2.55 pt wide, from 3.35 to 10 pt out from the center of the 20 pt box.
  spokeMedium: {
    left: 8.725,
    width: 2.55,
    height: 6.65,
    transformOrigin: '1.275px 10px',
  },
  // 5 pt wide, from 5.5 to 17.5 pt out from a center 1 pt up and left of the
  // 37 pt box's (UIKit draws the large image from its top-left corner).
  spokeLarge: {
    left: 15,
    width: 5,
    height: 12,
    transformOrigin: '2.5px 17.5px',
  },
  // Spoke k sits k × 45° clockwise from 12 o'clock. The head starts at
  // 9 o'clock (spoke 6) and reaches spoke k ((k − 6) mod 8) × 100 ms later.
  spokeAt: (index: number) => ({
    transform: `rotate(${index * 45}deg)`,
    animationDelay: `${((((index - 6) % 8) + 8) % 8) * 100 - 800}ms`,
  }),
});

/**
 * UIKit's activity indicator, medium (20 pt) or large (37 pt). It is a named
 * image, not a live region: mounted already named, a status element would
 * announce nothing reliably, so the app announces loading itself, once,
 * through the shared channel (`useAnnounce` from `@astryxdesign/core/hooks`).
 */
function ActivityIndicator({
  size = 'medium',
  label = 'Loading',
}: {
  size?: 'medium' | 'large';
  label?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      {...stylex.props(activityStyles.indicator, activityStyles[size])}>
      {Array.from({length: 8}, (_, index) => (
        <span
          key={index}
          {...stylex.props(
            activityStyles.spoke,
            size === 'large'
              ? activityStyles.spokeLarge
              : activityStyles.spokeMedium,
            activityStyles.spokeAt(index),
          )}
        />
      ))}
    </span>
  );
}

/**
 * The iOS look, composed from existing APIs: copy `ActivityIndicator` from
 * `apps/storybook/stories/Spinner.stories.tsx` into an app that wants it (the
 * code panel shows only this story's render).
 */
export const IOSStyleActivityIndicator: Story = {
  name: 'iOS-style activity indicator (composed)',
  render: () => (
    <HStack gap={6} vAlign="center">
      <ActivityIndicator />
      <ActivityIndicator size="large" />
    </HStack>
  ),
};
