// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {useRef, useState} from 'react';
import {Toast} from '@astryxdesign/core/Toast';
import {
  MediaTheme,
  Theme,
  defineTheme,
  useTheme,
} from '@astryxdesign/core/theme';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';

const meta: Meta = {
  title: 'Core/Themes/MediaTheme Auto',
  parameters: {
    docs: {
      description: {
        component:
          '`MediaTheme mode="auto"` measures the surface the browser actually painted and decides from it: no media context when the surface\'s own text already reads on it (3:1, WCAG\'s non-text line), otherwise whichever side reads better. A theme is free to define `--color-background-inverted` as something that is not inverted, and a hardcoded `mode="dark"` then paints white text on pale grey — the surface color is a runtime value, so no compile-time guess can be right for every theme.',
      },
    },
  },
};

export default meta;

// A theme whose "inverted" background is barely inverted — the case a
// hardcoded mode gets wrong, in both color modes.
const flatSurfaceTheme = defineTheme({
  name: 'flat-surface',
  tokens: {
    '--color-background-inverted': ['#E4E6EB', '#1C1F24'],
  },
});

const noop = () => {};

function SurfacePanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={2}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

const surfaceStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background-inverted)',
  borderRadius: 'var(--radius-container)',
  padding: 16,
  width: 400,
  maxWidth: '100%',
  boxShadow: 'var(--shadow-med)',
};

function SurfaceBody() {
  return (
    <Stack direction="horizontal" gap={3} align="center">
      <Text>Your changes were saved</Text>
      <Button label="Undo" variant="ghost" size="sm" />
    </Stack>
  );
}

/** What a hardcoded mode produces — the rule Toast used before `auto`. */
function HardcodedToast() {
  const {mode} = useTheme();
  return (
    <div style={surfaceStyle}>
      <MediaTheme mode={mode === 'light' ? 'dark' : 'light'}>
        <SurfaceBody />
      </MediaTheme>
    </div>
  );
}

function AutoToast() {
  return (
    <div style={surfaceStyle}>
      <MediaTheme mode="auto">
        <SurfaceBody />
      </MediaTheme>
    </div>
  );
}

// =============================================================================
// The bug
// =============================================================================

export const FlatSurfaceTheme: StoryObj = {
  render: function FlatSurfaceStory() {
    const {mode} = useTheme();
    return (
      <Theme theme={flatSurfaceTheme} mode={mode}>
        <Stack gap={5}>
          <Text>
            This theme sets <code>--color-background-inverted</code> to a pale
            grey in light mode and a near-black in dark mode — so the hardcoded
            rule is wrong in <em>both</em>. Toggle the color mode.
          </Text>
          <SurfacePanel label="Hardcoded — inverts because the page is light">
            <HardcodedToast />
          </SurfacePanel>
          <SurfacePanel label="Auto — the surface reads fine already, so no media context">
            <AutoToast />
          </SurfacePanel>
        </Stack>
      </Theme>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Light mode: the hardcoded rule paints white on pale grey at 1.25:1; auto measures the theme's own text at 14.36:1, concludes the surface is not really inverted, and applies nothing (14.36:1). Dark mode is the mirror image — 1.08:1 becomes 15.83:1.",
      },
    },
  },
};

export const StockTheme: StoryObj = {
  render: function StockThemeStory() {
    return (
      <Stack gap={5}>
        <Text>
          When the inverted surface really is inverted, auto agrees with the
          hardcoded rule — this is the no-change case.
        </Text>
        <SurfacePanel label="Hardcoded">
          <HardcodedToast />
        </SurfacePanel>
        <SurfacePanel label="Auto">
          <AutoToast />
        </SurfacePanel>
      </Stack>
    );
  },
};

// =============================================================================
// Toast, which now uses auto
// =============================================================================

export const ToastVariants: StoryObj = {
  render: function ToastVariantsStory() {
    return (
      <Stack gap={5}>
        <SurfacePanel label="Default">
          <Toast
            type="info"
            body="Your changes were saved"
            endContent={<Button label="Undo" variant="ghost" size="sm" />}
            isAutoHide={false}
            autoHideDuration={0}
            onDismiss={noop}
          />
        </SurfacePanel>
        <SurfacePanel label="Error — a saturated surface, dark in both modes">
          <Toast
            type="error"
            body="Could not reach the server"
            isAutoHide={false}
            autoHideDuration={0}
            onDismiss={noop}
          />
        </SurfacePanel>
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Toast passes `mode="auto"`, with its old rule kept only as the pre-measurement fallback. In light mode both surfaces invert. In dark mode the error surface resolves to `off`: its ambient text already reads at 4.50:1, and the rendering is pixel-identical to the media context, because a dark page already resolves those tokens to the same values.',
      },
    },
  },
};

// =============================================================================
// The limit: a surface auto cannot read
// =============================================================================

const PHOTO =
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600&h=200&fit=crop';

export const UnmeasurableSurface: StoryObj = {
  render: function UnmeasurableSurfaceStory() {
    return (
      <Stack gap={4} style={{maxWidth: 440}}>
        <Text>
          A <code>background-image</code> has no color a stylesheet can report,
          and reading its pixels needs canvas sampling and CORS access — so auto
          declines to guess and uses <code>fallback</code>. For real image
          surfaces, sample with <code>useImageMode</code> and pass the result as
          an explicit mode.
        </Text>
        {(['dark', 'light'] as const).map(fallback => (
          <div
            key={fallback}
            style={{
              backgroundImage: `url(${PHOTO})`,
              backgroundSize: 'cover',
              borderRadius: 'var(--radius-container)',
              padding: 16,
            }}>
            <MediaTheme mode="auto" fallback={fallback}>
              <Text>fallback="{fallback}"</Text>
            </MediaTheme>
          </div>
        ))}
      </Stack>
    );
  },
};

// =============================================================================
// Interactive probe
// =============================================================================

export const Playground: StoryObj = {
  render: function PlaygroundStory() {
    const [surface, setSurface] = useState('#E4E6EB');
    const [mode, setMode] = useState<'auto' | 'dark' | 'light' | 'off'>('auto');
    const ref = useRef<HTMLDivElement>(null);
    const [applied, setApplied] = useState('—');

    // Read back what MediaTheme resolved to, so the probe reports the real
    // DOM rather than re-deriving the decision alongside it.
    React.useEffect(() => {
      const wrapper = ref.current?.querySelector(':scope > div');
      setApplied(wrapper?.getAttribute('data-astryx-media') ?? 'off');
    });

    return (
      <Stack gap={4}>
        <Stack direction="horizontal" gap={4} align="center" wrap="wrap">
          <label style={{fontSize: 13}}>
            Surface{' '}
            <input
              type="color"
              value={surface}
              onChange={e => setSurface(e.target.value)}
            />
          </label>
          <label style={{fontSize: 13}}>
            mode{' '}
            <select
              value={mode}
              onChange={e =>
                setMode(e.target.value as 'auto' | 'dark' | 'light' | 'off')
              }>
              <option value="auto">auto</option>
              <option value="dark">dark</option>
              <option value="light">light</option>
              <option value="off">off</option>
            </select>
          </label>
          <span
            style={{
              fontFamily: 'var(--font-family-mono, monospace)',
              fontSize: 12,
            }}>
            resolved: <strong>{applied}</strong>
          </span>
        </Stack>

        <div
          ref={ref}
          style={{
            backgroundColor: surface,
            borderRadius: 'var(--radius-container)',
            padding: 16,
            width: 400,
            maxWidth: '100%',
          }}>
          <MediaTheme mode={mode}>
            <SurfaceBody />
          </MediaTheme>
        </div>
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Drag the surface through the greys on `auto`. Near the page's own text color it inverts; once the ambient pairing clears 3:1 it resolves to `off` and leaves the theme alone. Switch to `dark` or `light` to see what a hardcoded mode does on the same surface. The element stays put in every case, so children never remount.",
      },
    },
  },
};
