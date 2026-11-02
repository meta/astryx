// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docs-only demo content that catalog templates may show inside real
 *   Astryx components: a lightweight playing card's face and back.
 * @input A rank and suit for the face; nothing for the back.
 * @output Token-styled card contents sized to fill their container.
 * @position The one demo-content module templates import, as
 *   `@astryx-docs/demo-content` (mapped by the docsite, template viewer, test,
 *   and CLI type-check configs). It is not part of any package: copying a
 *   template, and the docsite's displayed code, replace every element imported
 *   from it with a generic `<Text>` placeholder (the CLI's
 *   `replaceDemoContent`), so only live previews ever render it. Elements are
 *   used with literal props and no children so that replacement stays safe.
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
} as const;

export type PlayingCardSuit = keyof typeof SUIT_SYMBOLS;

export interface PlayingCardContentsProps {
  /** The card's rank as printed in its corner: `A`, `2`–`10`, `J`, `Q`, `K`. */
  rank: string;
  suit: PlayingCardSuit;
}

/** A playing card's face: rank and suit in the corner, the suit at center. */
export function PlayingCardContents({rank, suit}: PlayingCardContentsProps) {
  const symbol = SUIT_SYMBOLS[suit];
  return (
    <span
      role="img"
      aria-label={`${rank} of ${suit}`}
      {...stylex.props(
        styles.face,
        (suit === 'hearts' || suit === 'diamonds') && styles.red,
      )}>
      <span aria-hidden {...stylex.props(styles.corner)}>
        <span>{rank}</span>
        <span>{symbol}</span>
      </span>
      <span aria-hidden {...stylex.props(styles.center)}>
        {symbol}
      </span>
    </span>
  );
}

/** A playing card's back: a token-colored pattern with no rank or suit. */
export function PlayingCardBack() {
  return (
    <span role="img" aria-label="Card back" {...stylex.props(styles.back)} />
  );
}

const styles = stylex.create({
  face: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    aspectRatio: '5 / 7',
    inlineSize: '100%',
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-heading'],
    userSelect: 'none',
  },
  red: {
    color: colorVars['--color-text-red'],
  },
  corner: {
    position: 'absolute',
    insetBlockStart: 0,
    insetInlineStart: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontSize: textSizeVars['--font-size-lg'],
    lineHeight: 1,
    fontWeight: 600,
  },
  center: {
    fontSize: textSizeVars['--font-size-4xl'],
    lineHeight: 1,
  },
  back: {
    display: 'block',
    aspectRatio: '5 / 7',
    inlineSize: '100%',
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-accent'],
    backgroundImage: `repeating-linear-gradient(45deg, transparent 0 ${spacingVars['--spacing-1']}, ${colorVars['--color-accent-muted']} ${spacingVars['--spacing-1']} ${spacingVars['--spacing-2']})`,
  },
});
