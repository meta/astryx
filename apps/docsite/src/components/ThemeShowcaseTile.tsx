// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Plus} from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Switch} from '@astryxdesign/core/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';

// Below 800px viewport, the tile's left card + right column stack
// vertically (instead of side-by-side). The 2-column tile layout
// needs roughly 750px+ of tile width to read well — type samples
// + swatches + buttons on the left, input + table + controls +
// banners on the right. Below that, the 50/50 split crushes
// content. Above ~760px viewport the grid drops to 1 card/row but
// the tile stays side-by-side because the full viewport gives the
// card 760-1540px to work with.
const TILE_STACK_BREAKPOINT = '@media (max-width: 800px)';

// Visual sizing constants for the preview tile. Pulled to module
// constants so they're easy to find and adjust without hunting
// through stylex blocks.
const HERO_IMAGE_HEIGHT = 170; // px — hero image inside the left card
const SWATCH_SIZE = 24; // px — diameter of each color swatch circle
const TYPE_SAMPLE_GLYPH_SIZE = 36; // px — font-size for the "Aa" type samples

// Image asset extensions checked in order. The hero image for a
// theme is discovered at runtime by stepping through these against
// the conventional path `/theme-<slug>-preview.<ext>`. The first
// extension that loads wins; if none do, we render the tinted
// gradient fallback. New themes only need to drop a file matching
// one of these extensions in /public — no map update required.
const THEME_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

// Build the candidate URL list for a given theme package name.
// `@astryxdesign/theme-stone` → ['/theme-stone-preview.png', '/theme-stone-preview.jpg', …]
function themeImageCandidates(themeName: string): ReadonlyArray<string> {
  const slug = themeName.replace('@astryxdesign/theme-', '');
  return THEME_IMAGE_EXTENSIONS.map(ext => `/theme-${slug}-preview.${ext}`);
}

// Row 1 — Brand surface set. The 4 tokens that together define the
// theme's brand backdrop: the accent itself, the muted-accent
// variant (used for hover/pressed/subtle states), and the two
// background surfaces (body page bg + elevated card surface).
const BRAND_SWATCH_TOKENS: ReadonlyArray<string> = [
  '--color-accent',
  '--color-accent-muted',
  '--color-background-body',
  '--color-background-surface',
];

// Row 2 — Categorical palette. The 9 non-semantic hues every theme
// defines for badges, banner tints, and color-coded categorization.
// We render --color-background-{hue} because that's the variant
// actually visible to end users in badge/banner surfaces — matching
// the colors users see in the table badges and banner stack
// elsewhere in the preview tile.
const CATEGORICAL_SWATCH_TOKENS: ReadonlyArray<string> = [
  '--color-background-blue',
  '--color-background-cyan',
  '--color-background-green',
  '--color-background-orange',
  '--color-background-pink',
  '--color-background-purple',
  '--color-background-red',
  '--color-background-teal',
  '--color-background-yellow',
];

const styles = stylex.create({
  // Outer tile: 2-column flex by default (left card + right column
  // side-by-side). Below 640px viewport, switches to a vertical
  // stack so neither column gets cramped on small screens.
  //
  // A 16px gap sits between the two columns. Each column carries
  // its own outer-edge padding (top/bottom + the outer horizontal
  // edge) so the tile's overall inset matches what each column
  // contributes — and the middle channel is exactly one 16px gap
  // rather than the doubled 32px gutter we'd get from symmetric
  // padding on both columns.
  tile: {
    display: 'flex',
    flexDirection: 'row',
    gap: spacingVars['--spacing-4'],
    [TILE_STACK_BREAKPOINT]: {
      flexDirection: 'column',
    },
    // The tile is purely presentational — no card-wide click target,
    // no hover/active overlay. Navigation is handled by the two
    // Buttons inside the hover overlay rendered above this tile
    // (see /themes/page.tsx). We still override two pieces of the
    // Card chrome:
    //
    // 1. backgroundColor: Card's default variant paints
    //    --color-background-card (lifted surface tone). Theme tiles
    //    need to sit on the theme's body color so the hero image,
    //    banners, and form controls inside the tile read as a
    //    continuous themed surface (matches what a real themed app
    //    looks like, where everything sits on --color-background-body).
    // 2. overflow: hidden: without this, the hero image and the
    //    right-column banners at the card edges paint past the
    //    rounded corners Card sets via its radius.
    backgroundColor: colorVars['--color-background-body'],
    overflow: 'hidden',
    // Drop the Card default variant's --color-border-emphasized
    // border so the tile reads as a continuous themed surface
    // rather than a bordered card-on-card. The dark hover scrim
    // from Overlay (rendered around this tile) is the only
    // hover affordance — no static border needed.
    borderColor: 'transparent',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
  },

  // Left column wraps the theme card. Sized to share the tile width
  // 50/50 with the right column. The Card inside carries the
  // actual surface styling (border, background, radius). 16px of
  // padding on the top / bottom / left (outer tile edges); 0 on
  // the right so the inside edges of the two columns share a
  // single gap instead of doubling up (which produced a visible
  // 32px channel down the middle of every card).
  //
  // When the tile stacks (narrow viewport), the bottom padding
  // collapses since the right column sits flush underneath
  // (handled by its top padding instead).
  leftColumn: {
    flex: '1 1 0',
    [TILE_STACK_BREAKPOINT]: {
      flex: '0 0 auto',
      paddingBottom: 0,
      paddingRight: spacingVars['--spacing-4'],
    },
    minWidth: 0,
    display: 'flex',
    paddingBlock: spacingVars['--spacing-4'],
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: 0,
  },

  // Make Card fill the left column's full width *and* height
  // so the inner card stretches to match the right column instead
  // of leaving a band of empty tile background below it.
  leftCard: {
    width: '100%',
    height: '100%',
  },

  // Image wrapper at the bottom of the left card. Flex-grows to
  // fill any vertical space left over after heading + description
  // + type samples + swatches lay out, while HERO_IMAGE_HEIGHT
  // acts as a floor so short tiles still get a real hero band.
  // Combined with `objectFit: cover` on the <img> below, the
  // image just crops to whatever final height it ends up at.
  // Lives at the bottom of the card (not the top) so the card
  // opens with the theme name + description as the dominant
  // identity element, with the hero image as a closing brand
  // signature.
  //
  // `flex: '1 1 0'` (basis = 0, NOT auto) is load-bearing: with
  // basis `auto`, the flex algorithm uses the <img>'s natural
  // pixel size as the wrapper's preferred height — which for
  // stock-photo assets is 800px+, blowing out the whole left
  // card to match. Basis `0` makes the wrapper start at zero
  // and grow by exactly the leftover space, capped by the right
  // column's natural height.
  imageWrapper: {
    position: 'relative',
    overflow: 'hidden',
    flex: '1 1 0',
    minHeight: HERO_IMAGE_HEIGHT,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  image: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    backgroundImage: `linear-gradient(135deg, ${colorVars['--color-accent']} 0%, ${colorVars['--color-background-muted']} 100%)`,
  },

  // Typography sample — flex hint so each of the 4 "Aa" columns
  // gets equal width via flex: 1 (VStack with this xstyle is the
  // column wrapper for one type role: Display / Heading / Body / Mono).
  typeSample: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    minWidth: 0,
  },
  // Each typography sample sizes itself uniformly via a wrapper
  // class. The actual font family + weight comes from the underlying
  // Text / span using the theme's own typography tokens (or, for
  // Display, the theme-scoped .astryx-text[data-type="display-3"] rule, which
  // themes like Gothic use to swap in a signature display family).
  typeAa: {
    display: 'inline-block',
    fontSize: TYPE_SAMPLE_GLYPH_SIZE,
    lineHeight: 1,
    color: colorVars['--color-text-primary'],
  },
  typeAaHeading: {
    fontFamily: typographyVars['--font-family-heading'],
  },
  typeAaBody: {
    fontFamily: typographyVars['--font-family-body'],
  },
  typeAaMono: {
    fontFamily: typographyVars['--font-family-code'],
  },

  // Color swatch — one of two rows (brand surface set + categorical
  // palette). Width/height keep all circles uniformly sized
  // regardless of theme.
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: radiusVars['--radius-full'],
    flexShrink: 0,
  },

  // Action row sits between the form-controls (switch/radio/
  // checkbox) row and the banner stack in the right column.
  // Holds the Primary / Secondary / Ghost button samples — demos
  // the theme's button chrome. Buttons are passive samples (the
  // right column carries `inert`), not interactive CTAs — the
  // real navigation lives in the hover overlay's Preview / Open
  // in Playground buttons rendered around this tile.
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },

  // Right column: stacked groups of components. Uses a larger
  // 24px gap *between* component groups (form-inputs / table /
  // controls / banners) so the visual hierarchy reads cleanly.
  // Each group inside uses VStack/HStack with a tighter gap.
  // flex-basis flips to auto when stacked (see leftColumn note above).
  //
  // Padding mirrors leftColumn — 16px on top / bottom / right
  // (outer tile edges); 0 on the left so the inside edge between
  // the two columns has a single 16px gap rather than 32px.
  rightColumn: {
    flex: '1 1 0',
    [TILE_STACK_BREAKPOINT]: {
      flex: '0 0 auto',
      paddingLeft: spacingVars['--spacing-4'],
    },
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
    paddingBlock: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
    paddingInlineStart: 0,
    minWidth: 0,
  },
});

// =============================================================================
// ContrastSwatch — auto-bordered color swatch
// =============================================================================
//
// Renders a circle filled with the CSS variable `token`. After mount,
// reads the resolved background-color via getComputedStyle and the
// theme's surface background, computes the WCAG contrast ratio
// between them, and conditionally adds a 1px subtle border when the
// swatch would otherwise blend into the card background.
//
// Why: themes like Butter set --color-background-body to a creamy
// off-white and define light surface/border tokens that visually
// disappear against the inner left card's --color-background-surface.
// Stone's --color-background-body is white-on-white. The auto-border
// keeps the swatch's edge visible without forcing a hardcoded border
// on every theme (which would be visually noisy on themes with
// already-high-contrast palettes like Gothic on dark surfaces).

// Parse any CSS color string into [r, g, b] 0-255 via the canvas
// 2D context's built-in color parser. Canvas accepts every standard
// CSS color format (rgb, rgba, hex, hsl, hsla, oklch, oklab, color(),
// named colors, currentColor) and normalizes them to the rendered
// pixel value, which we read back via getImageData.
//
// This is more robust than regex-matching `rgb(...)` because modern
// themes can produce colors in formats like `oklch(...)` or
// `light-dark(...)` via getComputedStyle resolution.
function parseRgb(color: string): [number, number, number] | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#000'; // baseline so invalid `color` doesn't carry over
  ctx.fillStyle = color;
  // If the canvas couldn't parse the color, fillStyle stays at the
  // baseline. Check by re-reading fillStyle; canvas normalizes to a
  // valid CSS color string, so an unparseable input will read back as
  // the baseline ('#000000').
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0], data[1], data[2]];
}

// WCAG relative luminance per https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG contrast ratio: 1 = identical, 21 = max (white vs black).
function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

// Threshold below which we add a border. 1.5:1 is well below WCAG text
// thresholds (3:1 for large text) but above visual-noise level —
// chosen empirically as "the swatch's edge is no longer obvious".
const CONTRAST_THRESHOLD = 1.5;

function ContrastSwatch({
  token,
  swatchStyle,
}: {
  token: string;
  swatchStyle: ReturnType<typeof stylex.props>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [needsBorder, setNeedsBorder] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const swatchRgb = parseRgb(getComputedStyle(el).backgroundColor);
    // Walk up to find the nearest styled ancestor to read the
    // resolved surface color from. Reading the CSS custom property
    // directly off `el` returns the unresolved expression (e.g.
    // "light-dark(...)") which parseRgb can handle via canvas, but
    // reading the COMPUTED background-color of an ancestor is more
    // reliable since the cascade is already applied.
    const surfaceColor = getComputedStyle(el)
      .getPropertyValue('--color-background-surface')
      .trim();
    const surfaceRgb = surfaceColor ? parseRgb(surfaceColor) : null;
    if (!swatchRgb || !surfaceRgb) {
      setNeedsBorder(false);
      return;
    }
    const ratio = contrastRatio(swatchRgb, surfaceRgb);
    setNeedsBorder(ratio < CONTRAST_THRESHOLD);
  }, [token]);

  return (
    <div
      ref={ref}
      className={swatchStyle.className}
      style={{
        ...swatchStyle.style,
        backgroundColor: `var(${token})`,
        border: needsBorder ? '1px solid var(--color-border)' : undefined,
      }}
    />
  );
}

export function ThemeShowcaseTile({
  label,
  themeName,
  description,
}: {
  label: string;
  themeName?: string;
  description?: string;
}) {
  // Step through candidate image URLs on each <img onError>. Each
  // error advances candidateIndex by one; when we run out of
  // candidates, we fall through to the gradient fallback. Memoized
  // so it doesn't recompute on every render.
  const candidates = useMemo(
    () => (themeName ? themeImageCandidates(themeName) : []),
    [themeName],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  // Reset to the first candidate whenever the theme changes (e.g. in
  // a parent that swaps themes without unmounting the tile).
  useEffect(() => {
    setCandidateIndex(0);
  }, [themeName]);
  const imageSrc = candidates[candidateIndex];
  const showImage = imageSrc !== undefined;

  return (
    <Card padding={0} xstyle={styles.tile}>
      {/* Left column: theme card wrapped in Card for a self-
          contained surface (border, background, radius). */}
      <div {...stylex.props(styles.leftColumn)}>
        <Card padding={4} xstyle={styles.leftCard}>
          <VStack gap={6} width="100%" height="100%">
            {/* Group 1 — identity: name + description. The hero
                image used to live in this group at the top of the
                card; it now sits at the bottom of the card (after
                Group 2) as a closing brand signature so the card
                opens with the most identifying information rather
                than a decorative photo. Inert so the tile reads
                as a passive demo. */}
            <VStack gap={1} inert>
              <Heading level={2} color="primary">
                {label}
              </Heading>
              {description && (
                <Text as="span" type="body" color="secondary">
                  {description}
                </Text>
              )}
            </VStack>

            {/* Group 2 — design tokens: typography samples + color
                swatches. Both visualize the theme's underlying
                token system so they cluster together. Inert so
                the tile reads as a passive demo.
                gap={6} (not gap={4}) between the Aa row and the
                swatches: the small-glyph supporting labels under
                each Aa (Display / Heading / Body / Mono) eat some
                of the visual gap, so a larger spacing value reads
                as optically even with the rest of the card's
                inter-group rhythm. */}
            <VStack gap={6} inert>
              {/* Typography samples — each "Aa" rendered in the theme's
                  display / heading / body / mono font with the role as
                  label. The Display sample uses Text type="display-3"
                  so themes that scope a custom display family to the
                  .astryx-text[data-type="display-3"] selector (e.g. Gothic →
                  Manufacturing Consent) flow through cleanly. */}
              <HStack gap={3}>
                <VStack gap={0.5} xstyle={styles.typeSample}>
                  <Text
                    as="span"
                    type="display-3"
                    color="primary"
                    xstyle={styles.typeAa}>
                    Aa
                  </Text>
                  <Text as="span" type="supporting" color="secondary">
                    Display
                  </Text>
                </VStack>
                <VStack gap={0.5} xstyle={styles.typeSample}>
                  <span {...stylex.props(styles.typeAa, styles.typeAaHeading)}>
                    Aa
                  </span>
                  <Text as="span" type="supporting" color="secondary">
                    Heading
                  </Text>
                </VStack>
                <VStack gap={0.5} xstyle={styles.typeSample}>
                  <span {...stylex.props(styles.typeAa, styles.typeAaBody)}>
                    Aa
                  </span>
                  <Text as="span" type="supporting" color="secondary">
                    Body
                  </Text>
                </VStack>
                <VStack gap={0.5} xstyle={styles.typeSample}>
                  <span {...stylex.props(styles.typeAa, styles.typeAaMono)}>
                    Aa
                  </span>
                  <Text as="span" type="supporting" color="secondary">
                    Mono
                  </Text>
                </VStack>
              </HStack>

              {/* Color swatch palette — two rows tell two stories.
                Row 1 (brand surface set): accent, accent-muted,
                background-body, background-surface. Together these
                define the theme's brand backdrop and primary
                action color.
                Row 2 (categorical palette): the 9 non-semantic
                hues every theme defines (Blue → Yellow), shown
                via the --color-icon-{hue} variant for max
                saturation.
                Each swatch auto-adds a 1px border when its color
                blends into the card surface (low WCAG contrast)
                so light-on-light tokens stay visible. */}
              <VStack gap={2}>
                <HStack gap={2} wrap="wrap">
                  {BRAND_SWATCH_TOKENS.map(token => (
                    <ContrastSwatch
                      key={token}
                      token={token}
                      swatchStyle={stylex.props(styles.swatch)}
                    />
                  ))}
                </HStack>
                <HStack gap={2} wrap="wrap">
                  {CATEGORICAL_SWATCH_TOKENS.map(token => (
                    <ContrastSwatch
                      key={token}
                      token={token}
                      swatchStyle={stylex.props(styles.swatch)}
                    />
                  ))}
                </HStack>
              </VStack>
            </VStack>
            {/* end Group 2 */}

            {/* Hero image — closing brand signature at the bottom
                of the left card. Flex-grows to fill any leftover
                vertical space so tall tiles (Butter, Y2K) don't
                leave an empty band at the bottom; falls back to a
                170px floor on short tiles. Raw <img> intentionally:
                Astryx provides Thumbnail but it's purpose-built
                for file-attachment UX (square 64px default,
                remove/click affordances, upload-style skeleton).
                Tinted gradient fallback covers themes whose
                preview asset isn't ready yet. Inert so the tile
                reads as a passive demo. */}
            <div {...stylex.props(styles.imageWrapper)} inert>
              {showImage ? (
                <img
                  src={imageSrc}
                  alt=""
                  {...stylex.props(styles.image)}
                  onError={() => setCandidateIndex(i => i + 1)}
                />
              ) : (
                <div {...stylex.props(styles.imageFallback)} />
              )}
            </div>
          </VStack>
        </Card>
      </div>

      {/* Right column — open content, no card chrome. Each group
          of related components is wrapped in an VStack at the
          tighter intra-group gap; the column itself uses a larger
          gap between groups for clear visual hierarchy. Inert so
          every showcase component (input, progress, table, form
          controls, banners, Primary/Secondary button samples)
          reads as a passive demo — the only interactive surfaces
          are the two Buttons inside the hover overlay
          rendered around this tile (see /themes/page.tsx). */}
      <div {...stylex.props(styles.rightColumn)} inert>
        {/* Group 1 — form-input components (text input + progress
            bar). Both are data-input/feedback elements so they
            cluster together at the tighter gap. */}
        <VStack gap={3}>
          <TextInput
            label="Input"
            isLabelHidden
            size="sm"
            placeholder="Type something..."
            value=""
            onChange={() => {}}
          />
          <ProgressBar label="Progress" value={75} isLabelHidden />
        </VStack>

        {/* Compact 3-column table with two example rows — demos the
            theme's table chrome (header, row dividers, cell typography),
            a Badge in the Status column, and a ghost icon button in
            the Action column for the icon-button chrome. */}
        <Table density="compact" dividers="rows">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Table</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Example 1</TableCell>
              <TableCell>
                <Badge label="Badge" variant="info" />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  label="Add"
                  isIconOnly
                  icon={<Plus />}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Example 2</TableCell>
              <TableCell>
                <Badge label="Badge" variant="success" />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  label="Add"
                  isIconOnly
                  icon={<Plus />}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Three form controls in one horizontal row — demos the
            theme's switch, radio, and checkbox styling side-by-
            side. All three render at their default size: Switch
            ships at a single fixed size with no `size` variant
            (passing one is a type error that breaks the build),
            so the neighboring RadioList + CheckboxInput
            also use their default sizes to stay visually matched. */}
        <HStack gap={4} wrap="wrap" vAlign="center">
          <Switch label="Toggle" value={true} />
          <RadioList
            label="Radio"
            isLabelHidden
            value="radio"
            onChange={() => {}}>
            <RadioListItem label="Radio Button" value="radio" />
          </RadioList>
          <CheckboxInput label="Checkbox" value={false} />
        </HStack>

        {/* Action row — Primary / Secondary / Ghost button samples.
            Passive demos thanks to the column's inert; the whole
            tile is a single link to the theme page. Sits above
            the banners so the demo flows from atomic interactive
            chrome (buttons) into compound chrome (banner stack). */}
        <div {...stylex.props(styles.actionRow)}>
          <HStack gap={2} wrap="wrap">
            <Button variant="primary" size="sm" label="Primary" />
            <Button variant="secondary" size="sm" label="Secondary" />
            <Button variant="ghost" size="sm" label="Ghost" />
          </HStack>
        </div>

        {/* Four banners stacked — demos the theme's info / success /
            warning / error chrome (icon, surface color, text color). */}
        <VStack gap={2}>
          <Banner status="info" title="Banner Title" />
          <Banner status="success" title="Banner Title" />
          <Banner status="warning" title="Banner Title" />
          <Banner status="error" title="Banner Title" />
        </VStack>
      </div>
    </Card>
  );
}
