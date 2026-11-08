// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {MediaTheme, defineTheme} from '@astryxdesign/core/theme';
import {Button} from '@astryxdesign/core/Button';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Stack';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {y2kTheme} from '@astryxdesign/theme-y2k';
import {Card} from '@astryxdesign/core/Card';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta = {
  title: 'Core/Themes/MediaTheme',
  parameters: {
    docs: {
      description: {
        component:
          'Inverted surface theming context. Wraps children so they render correctly on dark or light backgrounds; buttons, links, text, and icons all pick up the right colors automatically.',
      },
    },
  },
};

export default meta;

// =============================================================================
// On Dark Surface
// =============================================================================

function OnDarkDemo() {
  return (
    <div
      style={{
        backgroundColor:
          'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
        borderRadius: 'var(--radius-container)',
        padding: 16,
      }}>
      <MediaTheme mode="dark">
        <Stack gap={3}>
          <Text>
            Content on a dark surface: text, icons, and interactive elements
            automatically adapt.
          </Text>
          <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
            <Button label="Primary" />
            <Button label="Secondary" variant="secondary" />
            <Button label="Ghost" variant="ghost" />
            <Link href="#" hasUnderline>
              A link
            </Link>
          </Stack>
          <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
            <Badge label="Badge" />
            <Icon icon="info" size="md" />
            <Icon icon="success" size="md" />
          </Stack>
        </Stack>
      </MediaTheme>
    </div>
  );
}

export const OnDark: StoryObj = {
  render: () => <OnDarkDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Content on a dark (inverted) surface. Text becomes light, icons invert, and button interaction states use white-tinted overlays.',
      },
    },
  },
};

// =============================================================================
// On Light Surface (dark mode)
// =============================================================================

function OnLightDemo() {
  return (
    <Theme theme={neutralTheme} mode="dark">
      <div
        style={{
          padding: 16,
          backgroundColor: 'var(--color-background-surface)',
        }}>
        <Text>Dark mode page background</Text>
        <div
          style={{
            backgroundColor:
              'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
            borderRadius: 'var(--radius-container)',
            padding: 16,
            marginTop: 12,
          }}>
          <MediaTheme mode="light">
            <Stack gap={3}>
              <Text>
                Content on a light surface in dark mode: text and icons become
                dark.
              </Text>
              <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
                <Button label="Primary" />
                <Button label="Secondary" variant="secondary" />
                <Button label="Ghost" variant="ghost" />
                <Link href="#" hasUnderline>
                  A link
                </Link>
              </Stack>
            </Stack>
          </MediaTheme>
        </div>
      </div>
    </Theme>
  );
}

export const OnLight: StoryObj = {
  render: () => <OnLightDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Content on a light surface in dark mode. The inverse of OnDark: dark text on a light background when the page is dark.',
      },
    },
  },
};

// =============================================================================
// Toast-like Example
// =============================================================================

function ToastDemo() {
  return (
    <Stack gap={3}>
      {/* Info toast */}
      <div
        style={{
          backgroundColor:
            'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
          borderRadius: 'var(--radius-container)',
          padding: '12px 16px',
          boxShadow: 'var(--shadow-med)',
          maxWidth: 400,
          width: '100%',
        }}>
        <MediaTheme mode="dark">
          <Stack direction="horizontal" gap={3} align="center" wrap="wrap">
            <Text style={{flex: 1}}>Changes saved successfully.</Text>
            <Button label="Undo" variant="secondary" size="sm" />
            <Button
              label="Dismiss"
              variant="ghost"
              size="sm"
              icon={<Icon icon="close" size="sm" />}
              isIconOnly
            />
          </Stack>
        </MediaTheme>
      </div>
      {/* Error toast */}
      <div
        style={{
          backgroundColor:
            'var(--color-error-inverted, light-dark(#AA071E, #E3193B))',
          borderRadius: 'var(--radius-container)',
          padding: '12px 16px',
          boxShadow: 'var(--shadow-med)',
          maxWidth: 400,
          width: '100%',
        }}>
        <MediaTheme mode="dark">
          <Stack direction="horizontal" gap={3} align="center" wrap="wrap">
            <Text style={{flex: 1}}>
              Failed to save. Check your connection.
            </Text>
            <Button
              label="Dismiss"
              variant="ghost"
              size="sm"
              icon={<Icon icon="close" size="sm" />}
              isIconOnly
            />
          </Stack>
        </MediaTheme>
      </div>
    </Stack>
  );
}

export const ToastExample: StoryObj = {
  render: () => <ToastDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Toast-like notifications using MediaTheme. The dark surface sets up the right token context; buttons and text just work without manual color overrides.',
      },
    },
  },
};

// =============================================================================
// Component Override Boundary
// =============================================================================

/**
 * This is the key demo: themes with component overrides (y2k has sharp
 * square buttons with visible borders, bordered secondary/destructive
 * variants, and pill-shaped badges). Inside MediaTheme, those component
 * overrides STILL apply — structural styling is preserved. Only the color
 * tokens change for the inverted surface.
 */

function ComponentOverrideBoundaryDemo() {
  return (
    <Theme theme={y2kTheme}>
      <Stack gap={4}>
        <Text weight="semibold">
          Y2K theme, notice the component overrides: square buttons with visible
          borders, bordered button variants, pill-shaped badges.
        </Text>

        {/* Normal surface — themed component overrides apply */}
        <Card>
          <Stack gap={2} style={{padding: 16}}>
            <Text type="supporting" weight="semibold">
              Normal surface (themed overrides)
            </Text>
            <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
              <Button label="Primary" />
              <Button label="Secondary" variant="secondary" />
              <Button label="Ghost" variant="ghost" />
              <Badge label="Badge" />
            </Stack>
          </Stack>
        </Card>

        {/* Inverted surface — scope boundary blocks component overrides */}
        <div
          style={{
            backgroundColor:
              'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
            borderRadius: 'var(--radius-element)',
            padding: 16,
          }}>
          <MediaTheme mode="dark">
            <Stack gap={2}>
              <Text type="supporting" weight="semibold">
                Dark surface (same overrides, inverted tokens)
              </Text>
              <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
                <Button label="Primary" />
                <Button label="Secondary" variant="secondary" />
                <Button label="Ghost" variant="ghost" />
                <Badge label="Badge" />
              </Stack>
            </Stack>
          </MediaTheme>
        </div>
      </Stack>
    </Theme>
  );
}

export const ComponentOverrideBoundary: StoryObj = {
  render: () => <ComponentOverrideBoundaryDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Shows component overrides flowing through to the media context. Y2K theme applies bold component overrides (square bordered buttons, pill badges); these are preserved inside MediaTheme. Only the color tokens change for the inverted surface.',
      },
    },
  },
};

// =============================================================================
// Themed — shows it works across different themes
// =============================================================================

function ThemedDemo() {
  return (
    <Stack gap={4}>
      {[
        {theme: neutralTheme, label: 'Neutral Theme'},
        {theme: y2kTheme, label: 'Y2K Theme'},
      ].map(({theme, label}) => (
        <Theme key={label} theme={theme}>
          <Stack gap={2}>
            <Text weight="semibold">{label}</Text>
            <Stack direction="horizontal" gap={3}>
              {/* Normal surface */}
              <div
                style={{
                  backgroundColor: 'var(--color-background-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-container)',
                  padding: 16,
                  flex: 1,
                }}>
                <Stack gap={2}>
                  <Text type="supporting">Normal surface</Text>
                  <Button label="Button" variant="secondary" />
                  <Button label="Ghost" variant="ghost" />
                  <Link href="#">Link</Link>
                </Stack>
              </div>
              {/* Inverted surface */}
              <div
                style={{
                  backgroundColor:
                    'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
                  borderRadius: 'var(--radius-container)',
                  padding: 16,
                  flex: 1,
                }}>
                <MediaTheme mode="dark">
                  <Stack gap={2}>
                    <Text type="supporting">Dark surface</Text>
                    <Button label="Button" variant="secondary" />
                    <Button label="Ghost" variant="ghost" />
                    <Link href="#">Link</Link>
                  </Stack>
                </MediaTheme>
              </div>
            </Stack>
          </Stack>
        </Theme>
      ))}
    </Stack>
  );
}

export const AcrossThemes: StoryObj = {
  render: () => <ThemedDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Side-by-side comparison across themes. Left column shows normal surface with themed component overrides. Right column shows MediaTheme dark surface: same components, inverted tokens, default styles.',
      },
    },
  },
};

// =============================================================================
// Custom on-media overrides
// =============================================================================

const customTheme = defineTheme({
  name: 'custom-media',
  tokens: {
    '--color-accent': ['#7C3AED', '#A78BFA'],
  },
  onDark: {
    tokens: {
      // Custom: use a tinted accent color on dark surfaces instead of white
      '--color-accent': '#C4B5FD',
      '--color-text-accent': '#C4B5FD',
    },
  },
});

function CustomOverridesDemo() {
  return (
    <Theme theme={customTheme}>
      <Stack gap={3}>
        <Text>
          This theme has a custom <code>onDark</code> config; the accent color
          on dark surfaces is a lighter purple instead of plain white.
        </Text>
        <div
          style={{
            backgroundColor:
              'var(--color-surface-inverted, light-dark(#0A1317, #FFFFFF))',
            borderRadius: 'var(--radius-container)',
            padding: 16,
          }}>
          <MediaTheme mode="dark">
            <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
              <Button label="Accent button" />
              <Button label="Secondary" variant="secondary" />
              <Link href="#" hasUnderline>
                Accent link
              </Link>
            </Stack>
          </MediaTheme>
        </div>
      </Stack>
    </Theme>
  );
}

export const CustomOverrides: StoryObj = {
  render: () => <CustomOverridesDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Themes can provide custom `onDark` / `onLight` overrides in `defineTheme()` to fine-tune how components look on inverted surfaces.',
      },
    },
  },
};

// =============================================================================
// Auto-detected surface from image
// =============================================================================

import {useImageMode} from '@astryxdesign/core/hooks';

const DEMO_IMAGES = [
  {
    label: 'Dark photo (night city)',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600&h=400&fit=crop',
  },
  {
    label: 'Light photo (beach)',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop',
  },
  {
    label: 'Mixed (sunset)',
    url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=400&fit=crop',
  },
  {
    label: 'Dark (forest)',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=400&fit=crop',
  },
  {
    label: 'Light (snow)',
    url: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=600&h=400&fit=crop',
  },
];

function ImageCard({url, label}: {url: string; label: string}) {
  const surface = useImageMode(url);

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-container, 12px)',
        overflow: 'hidden',
        maxWidth: 300,
        width: '100%',
        height: 200,
      }}>
      <img
        src={url}
        alt={label}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          background:
            surface === 'light'
              ? 'linear-gradient(transparent, rgba(255,255,255,0.8))'
              : 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        }}>
        <MediaTheme mode={surface ?? 'dark'}>
          <Stack gap={1}>
            <Text weight="semibold">{label}</Text>
            <Text type="supporting">
              Detected: <strong>{surface ?? 'loading...'}</strong>
            </Text>
          </Stack>
        </MediaTheme>
      </div>
    </div>
  );
}

function AutoDetectDemo() {
  return (
    <Stack gap={3}>
      <Text>
        Each card auto-detects whether the image is dark or light using{' '}
        <code>useImageMode</code>, then applies the correct{' '}
        <code>MediaTheme</code> surface. Text color adapts automatically.
      </Text>
      <Stack direction="horizontal" gap={3} style={{flexWrap: 'wrap'}}>
        {DEMO_IMAGES.map(img => (
          <ImageCard key={img.url} {...img} />
        ))}
      </Stack>
    </Stack>
  );
}

export const AutoDetectFromImage: StoryObj = {
  render: () => <AutoDetectDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Auto-detects image luminance via `useImageMode` hook and applies the correct `MediaTheme` surface. Uses OffscreenCanvas to sample the image without interrupting the render loop.',
      },
    },
  },
};

// =============================================================================
// Regional detection
// =============================================================================

function RegionalDetectDemo() {
  const url =
    'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=400&fit=crop';
  // Sample just the bottom strip where text overlays
  const bottomSurface = useImageMode(url, {
    region: {x: 0, y: 0.7, width: 1, height: 0.3},
  });
  const fullSurface = useImageMode(url);

  return (
    <Stack gap={3}>
      <Text>
        The sunset image has a light sky and dark horizon. Full-image detection
        says <strong>{fullSurface ?? '...'}</strong>, but sampling just the
        bottom 30% (where text sits) says{' '}
        <strong>{bottomSurface ?? '...'}</strong>.
      </Text>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-container, 12px)',
          overflow: 'hidden',
          maxWidth: 400,
          width: '100%',
          height: 260,
        }}>
        <img
          src={url}
          alt="Sunset"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* Highlight the sampled region */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '30%',
            border: '2px dashed rgba(255,255,255,0.5)',
            borderBottom: 'none',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px',
          }}>
          <MediaTheme mode={bottomSurface ?? 'dark'}>
            <Stack gap={1}>
              <Text weight="semibold">Regional sampling</Text>
              <Text type="supporting">
                Bottom 30% → {bottomSurface ?? 'loading...'}
              </Text>
            </Stack>
          </MediaTheme>
        </div>
      </div>
    </Stack>
  );
}

export const RegionalDetection: StoryObj = {
  render: () => <RegionalDetectDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Regional detection samples a specific area of the image instead of the full average. Useful when text overlays a specific region: the sunset image is light overall but dark at the bottom where the text sits.',
      },
    },
  },
};
