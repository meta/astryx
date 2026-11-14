// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {components} from '../../../generated/componentRegistry';
import {layout} from '../../../layout.stylex';
import {ComponentsPreview} from './ComponentsPreview';
import {CliPreview} from './CliPreview';
import {ThemesPreview} from './ThemesPreview';

// Count of public @astryxdesign/core components (excluding hooks and hidden entries).
// Sourced from the generated registry so the number stays accurate as the
// library grows.
const CORE_COMPONENT_COUNT = (components['@astryxdesign/core'] ?? []).filter(
  c => !c.hidden && !c.name.startsWith('use'),
).length;
// Round down to the nearest 10 for marketing copy ("Over X components"
// reads better than "Over 87 components" and avoids the displayed number
// going stale every time a single component lands.
const CORE_COMPONENT_COUNT_ROUNDED = Math.floor(CORE_COMPONENT_COUNT / 10) * 10;

const styles = stylex.create({
  // Bento CSS-grid layout. Each grid cell holds a full-height
  // column wrapper (VStack with height:100%) rather than a
  // single card, so the grid auto-stretches all three columns to
  // the tallest column's natural content height — which is what
  // gives us visually-balanced column heights even when one column
  // has one tall card and another has a tall card plus a short
  // card stacked.
  // 3-column desktop bento, 1-column mobile stack.
  //
  //   <1024px: single column — every card stacks vertically.
  //   ≥1024px: 3 fixed columns. Each column has a wrapper
  //            (VStack with column style) that holds 1-2
  //            cards. Grid is align-items:stretch by default,
  //            so each column wrapper takes the full row height
  //            (set by min-height below). Cards inside with
  //            flex:1 (isFlex / isTall) grow to fill column
  //            leftover space.
  //
  // The column wrapper style (`column` below) uses display:
  // contents at mobile to dissolve the wrapper so cards become
  // direct children of the grid and the 1-col gridTemplateColumns
  // can lay them all out in source order.
  //
  // minHeight 720 keeps the bento tall enough on desktop that the
  // dominant "Themes" card has room for its larger image composition;
  // below this the right column reads as cramped against the left/middle.
  gridLayout: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    display: 'grid',
    // Tighter stacking gap on mobile; roomier --spacing-8 at the ≥1024px bento.
    gap: {
      default: spacingVars['--spacing-5'],
      '@media (min-width: 1024px)': spacingVars['--spacing-8'],
    },
    // minmax(0, 1fr) (not 1fr) so a card with wide content — e.g. the Themes
    // preview's left-bleed — can't blow out its column; all three stay equal.
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)':
        'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    },
    minHeight: {
      default: 0,
      '@media (min-width: 1024px)': 720,
    },
  },
  // Column wrapper. At desktop it's a flex column (rendered as an
  // VStack with gap={8} width="100%" height="100%") that takes
  // the full grid-cell height and stacks its 1-2 child cards. At
  // mobile (<1024) the xstyle below flips display to `contents`,
  // which dissolves the wrapper so its children become direct grid
  // children — combined with the parent's gridTemplateColumns:1fr
  // at mobile, every card gets its own row at full width.
  //
  // The display override is the ONLY thing in this xstyle because
  // VStack already sets `display: flex` + `flex-direction:
  // column` + the gap; xstyle is applied last in Stack so the
  // mobile `display: contents` cleanly wins at narrow widths and
  // falls back to flex at desktop without re-declaring anything.
  column: {
    display: {
      default: 'contents',
      '@media (min-width: 1024px)': 'flex',
    },
  },
  // Heading cell — the top-left column starts with plain text on
  // the page background (no card wrapper) per the bento reference.
  // paddingBlockStart matches the cards' internal padding
  // (spacing-5 = 20px) so the heading baseline visually aligns
  // with the heading inside the top-center "Over 150 components"
  // card. NO inline padding: the reference shows the heading text
  // starting flush at the column's left edge (NOT inset to match
  // the cards' internal padding) — keeping the full column width
  // also gives the display heading enough room to break onto
  // natural lines without being clipped by a tighter inner width.
  headingCell: {
    paddingBlockStart: spacingVars['--spacing-5'],
    width: '100%',
    // On desktop the heading block sits in a side-by-side grid
    // with the cards, where flush-left reads as an editorial
    // section header. Under 1024px (single-column stack — same
    // breakpoint as the grid switch) the heading is standalone
    // above the cards and centering reads better — matches the
    // centering treatment used in the AboutShowcase mobile layout.
    alignItems: {
      default: 'center',
      '@media (min-width: 1024px)': 'flex-start',
    },
    textAlign: {
      default: 'center',
      '@media (min-width: 1024px)': 'start',
    },
  },
  // All cards use Card padding={0} and apply their own padding
  // via the innerPadding* styles below. This is intentional: Card's
  // `padding={N}` prop wires its `padding-bottom` through a
  // (0,5,0)-specificity selector (`.astryx-card-XXX:not(#\#):not(#\#)
  // :not(#\#):not(#\#)`) which beats any xstyle override at (0,1,0).
  // The CSS variable indirection ALSO doesn't work because the card
  // sets `padding-bottom: var(--spacing-N)` directly (not via the
  // --container-padding-block-end var). So owning the padding via
  // the inner stack is the only reliable way to get 0 bottom padding
  // for image cards while leaving full padding on the text-only card.

  // All four card variants share the same pastel backdrop, pulled
  // from a marketing-only theme token (defined in astryxTheme.ts as
  // `--astryx-marketing-feature-card-bg`). Sourcing the color from the
  // theme keeps the bento palette tunable in one place and avoids
  // baking literal hex values into the component. We do NOT use
  // Card's `variant="blue"` here because that token (--color-
  // background-blue, 20%-alpha saturated wash) prints too vivid
  // against the white showcase surface — the marketing token is a
  // soft pastel band hand-tuned for this section.

  // Tall card variant — applied to the right-column "Themes" card.
  // flex:1 grows the card to fill its parent column wrapper, which
  // is stretched by the grid to match the tallest sibling column.
  cardTall: {
    flex: 1,
    backgroundColor: 'var(--astryx-marketing-feature-card-bg)',
    overflow: 'hidden',
  },
  // Regular image card — natural (content) height. Used for an image
  // card that shares its column with a grow-to-fill (isFlex) sibling:
  // the flex sibling absorbs the column's leftover height while this
  // card stays at its content height. (Must NOT be height:100% — that
  // would make it eat the whole stretched column and collapse the
  // flex sibling.) overflow:hidden because the image is intended to
  // sit flush at the card's bottom edge but NOT bleed past it (the
  // image's bottom aligns with the card's bottom rounded corner).
  card: {
    height: 'auto',
    overflow: 'hidden',
    backgroundColor: 'var(--astryx-marketing-feature-card-bg)',
  },
  // Flex variant of `card` — image card that grows to fill its
  // column's leftover height so a column with a short text-only
  // sibling can still match the height of an adjacent column with
  // only one tall card.
  cardFlex: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'var(--astryx-marketing-feature-card-bg)',
  },
  // Text-only feature card variant — no image, so overflow hidden
  // keeps the card contour tidy at the rounded corners.
  cardTextOnly: {
    height: 'auto',
    overflow: 'hidden',
    backgroundColor: 'var(--astryx-marketing-feature-card-bg)',
  },
  // Padding for image cards: --spacing-10 (40px) on top + sides +
  // 0 on bottom so the image wrapper inside sits flush at the
  // card's bottom edge.
  innerPaddingImage: {
    paddingBlockStart: spacingVars['--spacing-10'],
    paddingInlineStart: spacingVars['--spacing-10'],
    paddingInlineEnd: spacingVars['--spacing-10'],
    paddingBlockEnd: 0,
  },
  // Padding for an image card whose image stays *inset* (framed) rather
  // than full-bleed — --spacing-10 (40px) on all four sides, including
  // the bottom, so the image keeps left/right/bottom breathing room
  // inside the card instead of touching the edges.
  innerPaddingImageInset: {
    padding: spacingVars['--spacing-10'],
  },
  // Padding for the text-only card: --spacing-10 (40px) on all
  // sides (matches the image cards' top + sides; only difference
  // is the bottom padding which the image cards drop to 0 for
  // their image bleed).
  innerPaddingText: {
    padding: spacingVars['--spacing-10'],
  },
  // Explore link spacing — VStack gap holds heading↔description at
  // 4px, but the link below the description wants more breathing room
  // (16px). Adding a top margin on the link gives the +12px extra
  // beyond the 4px stack gap to reach the 16px total.
  exploreLink: {
    marginTop: spacingVars['--spacing-3'],
  },
  // Image wrapper for the 3 feature cards with images. The image is
  // full-bleed: it spans the entire card width and touches the card's
  // left, right, and bottom edges (only the text above keeps the
  // innerPaddingImage inset). To do that, the wrapper cancels the
  // inner stack's 40px inline padding with negative inline margins so
  // it reaches the card edges, even though its parent stack is inset.
  //
  // marginTop:auto pushes the wrapper to the bottom of the card's
  // content stack so the image always sits at the bottom regardless
  // of how much text wraps above.
  //
  // paddingTop creates breathing room between the "Explore" link
  // and the image.
  //
  // overflow:hidden keeps the image contained inside the wrapper
  // (and therefore inside the card, since the card itself uses
  // overflow:hidden too) so the bottom corners stay rounded.
  imageWrap: {
    marginTop: 'auto',
    // 40px gap between the text above and the image (matches the tall
    // and inset variants so every card has the same text↔image gap).
    paddingTop: spacingVars['--spacing-10'],
    // Break out of the inner stack's 40px inline padding so the image
    // bleeds to the card's left/right edges. Negative inline margins
    // pull the wrapper past the padding; the width is grown by the same
    // 2×40px so the wrapper's content box actually spans the full card
    // width (a plain width:100% would stay sized to the inset parent).
    marginInline: `calc(-1 * ${spacingVars['--spacing-10']})`,
    width: `calc(100% + 2 * ${spacingVars['--spacing-10']})`,
    minWidth: 0,
    overflow: 'hidden',
  },
  // Tall-card image wrapper variant. Same full-bleed treatment; more
  // top padding because the tall card has more vertical room above
  // the image baseline that we want to leave visually open.
  imageWrapTall: {
    marginTop: 'auto',
    paddingTop: spacingVars['--spacing-10'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-10']})`,
    width: `calc(100% + 2 * ${spacingVars['--spacing-10']})`,
    minWidth: 0,
    overflow: 'hidden',
  },
  // Vertically-centered full-bleed image wrapper. Same edge-to-edge
  // horizontal bleed as imageWrap, but the image floats in the middle
  // of the card's leftover vertical space instead of being pinned to
  // the bottom: marginBlock:auto puts equal auto-margin above and
  // below. Used by the Themes card so its composition sits centered
  // rather than bottom-anchored with a tall empty gap above.
  imageWrapCentered: {
    marginBlock: 'auto',
    // Keep at least a 40px gap above the image even when centered, so
    // the text↔image spacing matches the other cards.
    paddingTop: spacingVars['--spacing-10'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-10']})`,
    width: `calc(100% + 2 * ${spacingVars['--spacing-10']})`,
    minWidth: 0,
    overflow: 'hidden',
  },
  // Inset (framed) image wrapper — keeps the image within the card's
  // inner padding instead of bleeding to the edges. No negative inline
  // margins and no width expansion, so the wrapper stays inside the
  // 40px inset and the image has left/right/bottom breathing room (the
  // inner stack supplies the bottom padding via innerPaddingImageInset).
  // paddingTop is --spacing-10 (40px) so the gap above the image
  // matches the 40px frame on the other three sides.
  imageWrapInset: {
    marginTop: 'auto',
    paddingTop: spacingVars['--spacing-10'],
    alignSelf: 'stretch',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  // Inset wrapper for a live preview node. A fixed top gap (not marginTop:auto)
  // keeps the space under "Explore" consistent across preview cards; any extra
  // card height falls below the framed preview rather than above it.
  previewWrap: {
    paddingTop: spacingVars['--spacing-10'],
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  // Bottom-anchored preview wrapper. marginTop:auto pushes the preview to the
  // bottom of the card's content column so any extra card height opens up ABOVE
  // it (used by the Themes card so its store preview sits flush at the bottom).
  previewWrapBottom: {
    marginTop: 'auto',
    paddingTop: spacingVars['--spacing-10'],
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  // Default image: full-bleed to the card width (no max-width cap) so
  // it spans edge-to-edge. height:auto preserves natural aspect ratio.
  // display:block kills the inline baseline gap so there's no mystery
  // whitespace under the image.
  featureImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  // Reduced-size image — 3/4 of the wrapper width. Combined with a
  // center-aligned wrapper (hAlign="center") this leaves equal margin
  // on both sides so the composition reads as a smaller, centered
  // element rather than spanning the full card. Used by the Components
  // and CLI cards.
  featureImageSmall: {
    width: '75%',
    height: 'auto',
    display: 'block',
  },
  // Tall-card image: same full-bleed treatment. Still height:auto so
  // the natural aspect ratio is preserved.
  featureImageTall: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
});

type Feature = {
  title: string;
  description: string;
  href: string;
  /**
   * Optional supporting image rendered below the description. When
   * present, the image is centered horizontally and bleeds past
   * the card's bottom edge per the bento layout reference. When
   * omitted, the card renders as text-only.
   */
  image?: {
    src: string;
    alt: string;
  };
  /** Live, theme-aware preview node rendered in place of an image. */
  preview?: ReactNode;
};

// Looked up by slot key in the JSX below so each card's position in
// the bento grid is self-documenting. Keyed strings instead of an
// ordered array because the visual order in the grid is not the
// same as any obvious data order — explicit slot mapping is clearer
// than counting indices.
const features: Record<string, Feature> = {
  components: {
    title: `Over ${CORE_COMPONENT_COUNT_ROUNDED} components`,
    description:
      'Accessible and themeable React components with built-in spacing, dark mode, and flexible styling.',
    href: '/components',
    // Live, theme-aware sampler of real Astryx components instead of a
    // baked PNG — the old /feature-components.png stayed light on the
    // dark surface; ComponentsPreview re-themes for dark mode.
    preview: <ComponentsPreview />,
  },
  themes: {
    title: 'Themes that fit your brand',
    description:
      'Fully customizable themes ready for use. Make it yours without starting from scratch.',
    href: '/themes',
    // Butter-themed store preview + swatches/"Aa" instead of the old
    // /feature-brand.png, so it re-themes for dark mode (the PNG stayed light).
    // FeaturesShowcase adds the preview: its store comes from the server page.
  },
  templates: {
    title: 'Ready to ship templates',
    description:
      'Production-ready templates for common pages, just plug in your content.',
    href: '/templates',
    // Scaled-down static pages that the build renders from the real page
    // templates, so they re-theme for dark mode and stay in sync with the
    // templates. The server page renders them and passes them to
    // FeaturesShowcase.
  },
  cli: {
    title: 'A design system that your agent can use',
    description:
      'Scaffold projects, browse templates, generate themes, and get agent-ready docs from the command line or MCP.',
    href: '/docs/cli',
    // Live, theme-aware chat composer instead of a baked PNG — the old
    // /feature-cli.png stayed light on the dark surface; CliPreview
    // re-themes for dark mode.
    preview: <CliPreview />,
  },
};

function FeatureCard({
  feature,
  isTall = false,
  isFlex = false,
  insetImage = false,
  centerImage = false,
  smallImage = false,
  bottomPreview = false,
}: {
  feature: Feature;
  /**
   * Renders the card with the tall-variant image treatment (larger
   * image cap + more top padding above the image). Used by the
   * right-column "Themes" card which is the only card with a wider
   * vertical canvas for its composition.
   */
  isTall?: boolean;
  /**
   * When true, the card uses flex:1 so it grows to fill any leftover
   * vertical space inside its parent column. Used for the image
   * cards that need to balance against a short text-only sibling in
   * an adjacent column. Has no effect for the tall card (cardTall
   * already includes flex:1) or the text-only card (which is
   * intentionally shrink-to-content).
   */
  isFlex?: boolean;
  /**
   * When true, the image stays inset (framed) with left/right/bottom
   * padding instead of bleeding to the card edges. Used for the
   * "Over 150 components" card whose sample reads better framed than
   * full-bleed. Ignored for the tall card (which always full-bleeds).
   */
  insetImage?: boolean;
  /**
   * When true, the full-bleed image is centered in the card's leftover
   * vertical space instead of pinned to the bottom. Used for the Themes
   * card so its composition floats centered rather than bottom-anchored
   * with a tall empty gap above. Ignored for tall / inset images.
   */
  centerImage?: boolean;
  /**
   * When true, the image renders at 2/3 width and is horizontally
   * centered in its wrapper (equal margin on both sides). Used by the
   * Components and CLI cards so their smaller compositions don't span
   * the full card width.
   */
  smallImage?: boolean;
  /**
   * When true, a live preview is pinned to the bottom of the card (extra
   * card height opens above it) instead of sitting just under "Explore".
   * Used by the Themes card. Ignored for image cards.
   */
  bottomPreview?: boolean;
}) {
  const hasImage = feature.image != null;
  const hasPreview = feature.preview != null;
  const hasMedia = hasImage || hasPreview;
  // Style precedence:
  //   1. isTall   → cardTall (right-column dominant card)
  //   2. isFlex   → cardFlex (grow-to-fill media card)
  //   3. hasMedia → card     (natural-height media card)
  //   4. else     → cardTextOnly (shrink-to-content text-only card)
  // Only one of these applies at a time.
  const cardStyle = isTall
    ? styles.cardTall
    : isFlex
      ? styles.cardFlex
      : hasMedia
        ? styles.card
        : styles.cardTextOnly;

  return (
    // variant="transparent" suppresses Card's default border + bg
    // so the marketing token painted by `cardStyle` below is the
    // sole surface color (no blend with --color-background-card).
    <Card variant="transparent" padding={0} xstyle={cardStyle}>
      <VStack
        gap={1}
        align="start"
        height="100%"
        xstyle={
          hasMedia
            ? insetImage || hasPreview
              ? styles.innerPaddingImageInset
              : styles.innerPaddingImage
            : styles.innerPaddingText
        }>
        <Heading level={2} color="primary">
          {feature.title}
        </Heading>
        <Text type="body" color="primary">
          {feature.description}
        </Text>
        <Link
          type="body"
          color="primary"
          href={feature.href}
          hasUnderline={false}
          xstyle={styles.exploreLink}>
          Explore →
        </Link>
        {hasPreview ? (
          // vAlign="center" + hAlign="center" centers the preview in
          // the card's leftover horizontal space; bottomPreview pins it to the
          // bottom of the card instead of the fixed top gap.
          <HStack
            hAlign="center"
            vAlign="center"
            xstyle={
              bottomPreview ? styles.previewWrapBottom : styles.previewWrap
            }>
            {feature.preview}
          </HStack>
        ) : (
          hasImage &&
          feature.image && (
            // HStack handles the flex+direction+alignment chrome;
            // marginTop/padding/overflow/sizing live in the xstyle.
            // No width prop: the wrapper's width is set in the xstyle to
            // calc(100% + 2×40px) so it can exceed the inset parent and
            // bleed the image to the card edges (a width="100%" prop here
            // would win over the xstyle and clamp it back to the inset).
            <HStack
              hAlign={isTall || smallImage ? 'center' : 'start'}
              xstyle={
                isTall
                  ? styles.imageWrapTall
                  : insetImage
                    ? styles.imageWrapInset
                    : centerImage
                      ? styles.imageWrapCentered
                      : styles.imageWrap
              }>
              {/* Decorative image — kept as a raw <img> because @astryxdesign/core
                does not export a dedicated Image primitive (Thumbnail
                is a chat/attachment chrome, not a fit-to-container
                marketing image). Sizing + display:block come from the
                featureImage / featureImageTall / featureImageSmall
                xstyles below. */}
              <img
                src={feature.image.src}
                alt={feature.image.alt}
                {...stylex.props(
                  isTall
                    ? styles.featureImageTall
                    : smallImage
                      ? styles.featureImageSmall
                      : styles.featureImage,
                )}
              />
            </HStack>
          )
        )}
      </VStack>
    </Card>
  );
}

// Plain heading block — sits in the top-left grid slot on the page
// background (no card wrapper) per the bento reference. The text is
// flush-left to the grid column edge (no inline padding) so the
// display heading has the full column width to break onto natural
// lines. The block's paddingBlockStart matches the cards' internal
// top padding so the heading and the adjacent card titles sit on
// roughly the same vertical baseline at the top of the row.
function HeadingBlock() {
  return (
    <VStack gap={4} xstyle={styles.headingCell}>
      <Heading level={2} type="display-2" color="primary">
        Start anywhere.
        <br />
        Change anything.
        <br />
        Ship faster.
      </Heading>
      <Text display="block" type="large" weight="normal" color="secondary">
        A design system that adapts to your workflow, not the other way around.
        Built for speed, clarity, and creative freedom.
      </Text>
    </VStack>
  );
}

export function FeaturesShowcase({
  templatesPreview,
  themesStore,
}: {
  /** The templates card preview (TemplatesPreview). */
  templatesPreview: ReactNode;
  /** The themes card store snapshot (FrozenPreview), rendered on the server. */
  themesStore: ReactNode;
}) {
  // Each grid cell holds a full-height column wrapper (VStack
  // height:100%) rather than a single card, so the grid stretches
  // all three columns to the height of the tallest column. Cards
  // marked isFlex / isTall use flex:1 to grow into any leftover
  // vertical space inside their column, which is what visually
  // balances the column heights: the "Over 150 components" card in
  // the middle column grows to fill the space its "CLI" sibling
  // leaves behind, matching the heights of the dedicated
  // "Themes" card on the left and the "Templates" card on the
  // right.
  //
  // Layout on desktop (≥720px):
  //   col 1: HeadingBlock + Themes (flex)
  //   col 2: Components (flex) + CLI (image, natural height)
  //   col 3: Templates (tall, flex)
  //
  // Below 720px the grid collapses to 1 column. Each column wrapper
  // renders top-to-bottom in DOM order, so the cards stack as:
  // heading → themes → components → CLI → templates.
  return (
    <VStack as="section" align="center" gap={10} width="100%">
      {/* CSS-grid container with responsive column count. Kept as a
          plain <div> (rather than Grid) because we depend on grid's
          align-items:stretch + min-height behavior to drive equal
          column heights, and we need to control gap/minHeight via
          @media at the wrapper level. Grid is optimized for fixed
          column counts + a single gap and doesn't expose the
          minHeight responsive variant pattern we need here. */}
      <div {...stylex.props(styles.gridLayout)}>
        {/* Column wrappers use VStack at desktop and dissolve via
            `display: contents` at mobile (see styles.column comment).
            VStack handles flex+direction+gap+sizing; the xstyle
            owns only the responsive display switch. */}
        <VStack gap={8} width="100%" height="100%" xstyle={styles.column}>
          <HeadingBlock />
          <FeatureCard
            feature={{
              ...features.themes,
              preview: <ThemesPreview store={themesStore} />,
            }}
            isFlex
            bottomPreview
          />
        </VStack>
        <VStack gap={8} width="100%" height="100%" xstyle={styles.column}>
          <FeatureCard feature={features.components} isFlex insetImage />
          <FeatureCard feature={features.cli} />
        </VStack>
        <VStack gap={8} width="100%" height="100%" xstyle={styles.column}>
          <FeatureCard
            feature={{...features.templates, preview: templatesPreview}}
            isTall
            bottomPreview
          />
        </VStack>
      </div>
    </VStack>
  );
}
