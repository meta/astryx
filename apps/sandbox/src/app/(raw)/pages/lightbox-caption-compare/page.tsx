// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input A theme, a light or dark mode and a short or long caption
 * @output Lightbox's caption before and after it sits on the counter's
 *   backing, each over a photo on the viewer's backdrop, with the measured
 *   contrast of the caption's text under each one
 * @position A raw preview page for comparing the caption change on a phone or
 *   a desktop. The page scrolls with the document.
 */

import {useCallback, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  Theme,
  defineTheme,
  tokenDefaults,
  type DefinedTheme,
  type ThemeMode,
} from '@astryxdesign/core/theme';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {butterTheme} from '@astryxdesign/theme-butter/built';
import {matchaTheme} from '@astryxdesign/theme-matcha/built';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {y2kTheme} from '@astryxdesign/theme-y2k/built';

const coreDefaultTheme = defineTheme({
  name: 'core-default',
  tokens: tokenDefaults,
});

const THEMES: {id: string; label: string; theme: DefinedTheme}[] = [
  {id: 'core', label: 'Core', theme: coreDefaultTheme},
  {id: 'neutral', label: 'Neutral', theme: neutralTheme},
  {id: 'butter', label: 'Butter', theme: butterTheme},
  {id: 'matcha', label: 'Matcha', theme: matchaTheme},
  {id: 'y2k', label: 'Y2K', theme: y2kTheme},
];

const CAPTIONS = {
  long: 'A beautiful forest path winding through tall trees on a misty morning',
  short: 'Golden hour at the beach',
} as const;
type CaptionId = keyof typeof CAPTIONS;

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a7c59"/><stop offset="0.6" stop-color="#9fc2d9"/><stop offset="1" stop-color="#c9b48a"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/></svg>',
  );

const BACKING = `color-mix(in srgb, ${colorVars['--color-on-light']} 75%, transparent)`;

const styles = stylex.create({
  page: {
    minHeight: '100vh',
    backgroundColor: colorVars['--color-background-body'],
    color: colorVars['--color-text-primary'],
  },
  // A stand-in for the open viewer: page content under Lightbox's backdrop,
  // with the photo and caption centred together, as Lightbox lays them out.
  frame: {
    position: 'relative',
    height: 'min(560px, 75vh)',
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-body'],
  },
  behind: {
    position: 'absolute',
    inset: 0,
    padding: spacingVars['--spacing-4'],
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorVars['--color-overlay'],
    backdropFilter: 'blur(2px)',
  },
  photo: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '60%',
    objectFit: 'contain',
  },
  // Lightbox's caption box, unchanged by the fix.
  caption: {
    color: colorVars['--color-on-dark'],
    fontSize: typeScaleVars['--text-large-size'],
    lineHeight: typeScaleVars['--text-large-leading'],
    textAlign: 'center',
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: 0,
    paddingInline: spacingVars['--spacing-3'],
    maxWidth: '600px',
    flexShrink: 0,
  },
  // After: the counter's backing behind each line of the caption's text.
  backing: {
    backgroundColor: BACKING,
    borderRadius: radiusVars['--radius-full'],
    paddingInline: spacingVars['--spacing-2'],
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },
});

type Rgba = {r: number; g: number; b: number; a: number};

/** Reads a computed colour: `rgb()`, `rgba()` or `color(srgb …)`. */
function parseColor(value: string): Rgba | null {
  const srgb = value.match(
    /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/,
  );
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: srgb[4] == null ? 1 : Number(srgb[4]),
    };
  }
  const rgb = value.match(
    /rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:[,/]\s*([\d.]+))?\)/,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] == null ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

function over(top: Rgba, under: Rgba): Rgba {
  return {
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  };
}

function luminance({r, g, b}: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(first: Rgba, second: Rgba): number {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

/** The caption text's contrast against what it sits on, beside its glyphs. */
function measure(frame: HTMLElement): {ratio: number; lines: number} | null {
  const page = parseColor(getComputedStyle(frame).backgroundColor);
  const backdropElement = frame.querySelector<HTMLElement>('[data-backdrop]');
  const captionElement = frame.querySelector<HTMLElement>('[data-caption]');
  if (page == null || backdropElement == null || captionElement == null) {
    return null;
  }
  const backdrop = parseColor(
    getComputedStyle(backdropElement).backgroundColor,
  );
  const text = parseColor(getComputedStyle(captionElement).color);
  if (backdrop == null || text == null) {
    return null;
  }
  let under = over(backdrop, page);
  const backingElement =
    captionElement.querySelector<HTMLElement>('[data-backing]');
  if (backingElement != null) {
    const backing = parseColor(
      getComputedStyle(backingElement).backgroundColor,
    );
    if (backing != null) {
      under = over(backing, under);
    }
  }
  const textNode = document
    .createTreeWalker(captionElement, NodeFilter.SHOW_TEXT)
    .nextNode();
  let lines = 0;
  if (textNode != null) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    lines = new Set(
      Array.from(range.getClientRects()).map(rect => Math.round(rect.top)),
    ).size;
  }
  return {ratio: contrast(text, under), lines};
}

function ViewerFrame({
  variant,
  caption,
  revision,
}: {
  variant: 'before' | 'after';
  caption: string;
  revision: string;
}) {
  const [reading, setReading] = useState<{ratio: number; lines: number} | null>(
    null,
  );
  // Measures once the frame paints with the current theme, mode and caption.
  const frameRef = useCallback(
    (frame: HTMLDivElement | null) => {
      if (frame == null) {
        return;
      }
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setReading(measure(frame))),
      );
      return () => cancelAnimationFrame(id);
    },
    // The revision names the theme, mode and caption the frame shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );
  const passes = reading != null && reading.ratio >= 4.5;
  return (
    <VStack gap={2}>
      <Heading level={2}>
        {variant === 'before' ? 'Before (main)' : 'After (this change)'}
      </Heading>
      <div ref={frameRef} {...stylex.props(styles.frame)}>
        <div aria-hidden {...stylex.props(styles.behind)}>
          <VStack gap={2}>
            {Array.from({length: 14}, (_, index) => (
              <Text key={index} color="secondary">
                Page content under the open viewer, line {index + 1}
              </Text>
            ))}
          </VStack>
        </div>
        <div data-backdrop="" {...stylex.props(styles.backdrop)}>
          <img
            src={PHOTO}
            alt="A forest path"
            {...stylex.props(styles.photo)}
          />
          <div data-caption="" {...stylex.props(styles.caption)}>
            {variant === 'after' ? (
              <span data-backing="" {...stylex.props(styles.backing)}>
                {caption}
              </span>
            ) : (
              caption
            )}
          </div>
        </div>
      </div>
      <Text weight="bold" color={passes ? 'primary' : 'secondary'}>
        {reading == null
          ? 'Measuring…'
          : `Caption contrast ${reading.ratio.toFixed(2)}:1, ${
              passes ? 'meets' : 'fails'
            } 4.5:1 · ${reading.lines} ${reading.lines === 1 ? 'line' : 'lines'}`}
      </Text>
    </VStack>
  );
}

export default function LightboxCaptionComparePage() {
  const [themeId, setThemeId] = useState('neutral');
  const [mode, setMode] = useState<ThemeMode>('light');
  const [captionId, setCaptionId] = useState<CaptionId>('long');
  const [isOpen, setIsOpen] = useState(false);
  const theme = THEMES.find(t => t.id === themeId)?.theme ?? neutralTheme;
  const caption = CAPTIONS[captionId];
  const revision = `${themeId}:${mode}:${captionId}`;
  return (
    <Theme theme={theme} mode={mode}>
      <VStack gap={5} padding={4} xstyle={styles.page}>
        <VStack gap={2}>
          <Heading level={1}>Lightbox caption: before and after</Heading>
          <Text color="secondary">
            The caption&apos;s light text sat on a light theme&apos;s
            translucent backdrop. After the change it sits on the counter&apos;s
            dark backing, line by line. The backing&apos;s padding can make a
            long caption wrap one line sooner, which moves the photo up.
          </Text>
        </VStack>
        <VStack gap={3}>
          <SegmentedControl
            label="Theme"
            value={themeId}
            onChange={setThemeId}
            size="sm">
            {THEMES.map(t => (
              <SegmentedControlItem key={t.id} value={t.id} label={t.label} />
            ))}
          </SegmentedControl>
          <HStack gap={3} wrap="wrap">
            <SegmentedControl
              label="Mode"
              value={mode}
              onChange={value => setMode(value as ThemeMode)}
              size="sm">
              <SegmentedControlItem value="light" label="Light" />
              <SegmentedControlItem value="dark" label="Dark" />
            </SegmentedControl>
            <SegmentedControl
              label="Caption"
              value={captionId}
              onChange={value => setCaptionId(value as CaptionId)}
              size="sm">
              <SegmentedControlItem value="long" label="Long" />
              <SegmentedControlItem value="short" label="Short" />
            </SegmentedControl>
          </HStack>
        </VStack>
        <ViewerFrame variant="before" caption={caption} revision={revision} />
        <ViewerFrame variant="after" caption={caption} revision={revision} />
        <VStack gap={2} hAlign="start">
          <Text color="secondary">
            The real Lightbox, with the change, in the chosen theme and mode:
          </Text>
          <Button
            label="Open the real Lightbox"
            variant="secondary"
            onClick={() => setIsOpen(true)}
          />
        </VStack>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{src: PHOTO, alt: 'A forest path', caption}}
        />
      </VStack>
    </Theme>
  );
}
