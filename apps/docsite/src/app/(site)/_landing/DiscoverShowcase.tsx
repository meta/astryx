// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {AstryxLogo} from '../../../components/logos';
import {components} from '../../../generated/componentRegistry';
import {layout} from '../../../layout.stylex';

// Public core component count, rounded down to the nearest 10 for marketing
// copy. Sourced from the generated registry so it stays accurate as the library grows.
const CORE_COMPONENT_COUNT_ROUNDED =
  Math.floor(
    (components['@astryxdesign/core'] ?? []).filter(
      c => !c.hidden && !c.name.startsWith('use'),
    ).length / 10,
  ) * 10;

const styles = stylex.create({
  section: {
    width: '100%',
    overflowX: 'clip',
  },
  // Positioning anchor for the floating images + centered CTA card, capped so
  // all three home showcases line up vertically inside showcaseOverlay.
  stage: {
    position: 'relative',
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    isolation: 'isolate',
  },
  card: {
    position: 'relative',
    width: '100%',
    zIndex: 1,
    marginInline: 'auto',
    maxWidth: {
      default: 'calc(100% - var(--spacing-8))',
      '@media (min-width: 960px)': '100%',
    },
    // Retint the muted surface to the body color so this card blends in.
    // Scoped here only — a theme-wide override would recolor code blocks,
    // table rows, sliders, etc. that rely on the default muted tint.
    '--color-background-muted': 'var(--color-background-body)',
    // calc() over spacing tokens (not literals) so the padding scales with any
    // future spacing-scale override. Tightened on narrow screens where the
    // doubled inline padding crushed content into a thin column.
    paddingBlock: {
      default: spacingVars['--spacing-10'],
      '@media (min-width: 768px)': `calc(${spacingVars['--spacing-12']} * 2)`,
    },
    paddingInline: {
      default: spacingVars['--spacing-6'],
      '@media (min-width: 768px)': `calc(${spacingVars['--spacing-10']} * 2)`,
    },
  },
  // width:260 is the desktop art-directed thumbnail size; mobile uses viewport
  // clamps so the stack stays inside the rounded stage instead of overflowing.
  floatingImage: {
    position: 'absolute',
    width: {
      default: 'clamp(132px, 43vw, 188px)',
      '@media (min-width: 768px)': 'clamp(176px, 28vw, 236px)',
      '@media (min-width: 960px)': 260,
    },
    height: 'auto',
    borderRadius: 'var(--radius-container)',
    boxShadow: 'var(--shadow-high)',
    pointerEvents: 'none',
    transitionProperty: 'transform, top, left, right, bottom',
    transitionDuration: 'var(--duration-slow-max)',
    transitionTimingFunction: 'var(--ease-standard)',
    zIndex: 2,
    // Desktop-only decoration: below 960px there's no room to spread the images
    // to the corners, so they'd overlap and cover the card's text.
    display: {
      default: 'none',
      '@media (min-width: 960px)': 'block',
    },
  },
  // Starting "clumped" pose — images near center with slight offsets/rotations
  // so they read as an overlapping cluster before the spread animation.
  // Offsets/rotations are literals: composition values tied to image dimensions.
  floatTopLeftStart: {
    top: '50%',
    left: '50%',
    transform: 'translate(calc(-50% - 80px), calc(-50% - 24px)) rotate(-8deg)',
  },
  floatTopRightStart: {
    top: '50%',
    left: '50%',
    transform: 'translate(calc(-50% + 80px), calc(-50% - 32px)) rotate(6deg)',
  },
  floatBottomLeftStart: {
    top: '50%',
    left: '50%',
    transform: 'translate(calc(-50% - 60px), calc(-50% + 40px)) rotate(7deg)',
  },
  floatBottomRightStart: {
    top: '50%',
    left: '50%',
    transform: 'translate(calc(-50% + 60px), calc(-50% + 32px)) rotate(-5deg)',
  },
  // Resting "spread" poses — each image hugs a corner. Negative insets
  // (-64 / -32) are intentional bleed past the stage edge so the images read as
  // "popping out of" the card. Literals: negative spacing tokens don't exist.
  floatTopLeftEnd: {
    top: {
      default: spacingVars['--spacing-3'],
      '@media (min-width: 960px)': -64,
    },
    left: {
      default: `calc(-1 * ${spacingVars['--spacing-8']})`,
      '@media (min-width: 960px)': -64,
    },
    transform: {
      default: 'rotate(-8deg)',
      '@media (min-width: 960px)': 'rotate(-7deg)',
    },
  },
  floatTopRightEnd: {
    top: {
      default: spacingVars['--spacing-3'],
      '@media (min-width: 960px)': -64,
    },
    right: {
      default: `calc(-1 * ${spacingVars['--spacing-8']})`,
      '@media (min-width: 960px)': -64,
    },
    transform: {
      default: 'rotate(8deg)',
      '@media (min-width: 960px)': 'rotate(7deg)',
    },
  },
  floatBottomLeftEnd: {
    bottom: {
      default: spacingVars['--spacing-3'],
      '@media (min-width: 960px)': -64,
    },
    left: {
      default: `calc(-1 * ${spacingVars['--spacing-10']})`,
      '@media (min-width: 960px)': -32,
    },
    transform: 'rotate(6deg)',
  },
  floatBottomRightEnd: {
    bottom: {
      default: spacingVars['--spacing-3'],
      '@media (min-width: 960px)': -64,
    },
    right: {
      default: `calc(-1 * ${spacingVars['--spacing-10']})`,
      '@media (min-width: 960px)': -32,
    },
    transform: 'rotate(-6deg)',
  },
  // Inline wordmark glyph in the heading. Sized in `em` so it scales with the
  // heading font size; margin anchors to glyph metrics so it reads as one word.
  inlineWordmark: {
    display: 'inline-block',
    verticalAlign: 'baseline',
    height: '.75em',
    width: 'auto',
    marginInline: spacingVars['--spacing-4'],
    color: 'var(--color-brand)',
  },
  // maxWidth is a reading measure for the body paragraph, not a spacing token.
  cardContent: {
    maxWidth: 560,
    textAlign: 'center',
    marginInline: 'auto',
  },
  // Two-up button row. maxWidth is a thumb-reachable ergonomic value; the
  // auto-fit 160px tracks let narrow phones collapse to one centered column.
  buttonGrid: {
    width: '100%',
    maxWidth: 360,
    marginInline: 'auto',
  },
  // Reading-measure cap for the supporting paragraph, not a spacing token.
  supportingText: {
    maxWidth: 480,
  },
});

export function DiscoverShowcase() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [spread, setSpread] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setSpread(true);
            observer.disconnect();
            break;
          }
        }
      },
      {threshold: 0.4},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <VStack as="section" gap={10} align="center" xstyle={styles.section}>
      {/* Raw <div>: a position:relative anchor for the absolutely-positioned
          images. VStack/HStack would impose flex semantics that fight the
          absolute positioning model. */}
      <div ref={stageRef} {...stylex.props(styles.stage)}>
        {/* Raw <img>s: core has no general-purpose image component. aria-hidden
            + empty alt keep this pure decoration out of the a11y tree; it
            animates from a clumped to a spread pose on scroll into view. */}
        <img
          src="/landing/discover-card-1.webp"
          alt=""
          aria-hidden="true"
          {...stylex.props(
            styles.floatingImage,
            spread ? styles.floatTopLeftEnd : styles.floatTopLeftStart,
          )}
        />
        <img
          src="/landing/discover-card-3.webp"
          alt=""
          aria-hidden="true"
          {...stylex.props(
            styles.floatingImage,
            spread ? styles.floatTopRightEnd : styles.floatTopRightStart,
          )}
        />
        <img
          src="/landing/discover-card-2.webp"
          alt=""
          aria-hidden="true"
          {...stylex.props(
            styles.floatingImage,
            spread ? styles.floatBottomLeftEnd : styles.floatBottomLeftStart,
          )}
        />
        <img
          src="/landing/discover-card-4.webp"
          alt=""
          aria-hidden="true"
          {...stylex.props(
            styles.floatingImage,
            spread ? styles.floatBottomRightEnd : styles.floatBottomRightStart,
          )}
        />
        <Card variant="muted" padding={0} xstyle={styles.card}>
          <VStack gap={6} align="center" xstyle={styles.cardContent}>
            <VStack gap={6} align="center">
              <Heading level={2} type="display-1" color="primary">
                Discover the full
                <AstryxLogo
                  role="img"
                  aria-label="Astryx"
                  {...stylex.props(styles.inlineWordmark)}
                />
                design system
              </Heading>
              <Text
                type="body"
                color="secondary"
                xstyle={styles.supportingText}>
                Browse {CORE_COMPONENT_COUNT_ROUNDED}+ components, explore
                production-ready templates, and tune themes to match your brand;
                pick a starting point and go.
              </Text>
            </VStack>
            <Grid
              columns={{minWidth: 160, repeat: 'fit'}}
              gap={3}
              xstyle={styles.buttonGrid}>
              <Button
                variant="primary"
                size="lg"
                label="Get started"
                href="/docs/getting-started"
              />
              <Button
                variant="secondary"
                size="lg"
                label="Browse components"
                href="/components"
              />
            </Grid>
          </VStack>
        </Card>
      </div>
    </VStack>
  );
}
