// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docs-only demo content that catalog templates may show inside real
 *   Astryx components: a playing card's face and back, and a hint under a demo.
 * @input A rank and suit, and whether the card lies face down; a hint's text.
 * @output Token-styled card contents sized to fill their container, and a
 *   centered demo with a muted hint line under it.
 * @position The one demo-content module templates import, as
 *   `@astryx-docs/demo-content` (mapped by the docsite, sandbox, template
 *   viewer, test, and CLI type-check configs). It is not part of any package:
 *   every copy and every surface that hands out template source replace each
 *   element imported from it (the CLI's `replaceDemoContent`), so only live
 *   previews ever render it. An element with no children becomes a generic
 *   `<Text>` placeholder. `DemoHint` wraps one element and is removed, so its
 *   child stays as written. Each prop is a literal or a variable the template
 *   also reads elsewhere, so that replacement stays safe.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
} as const;

export type PlayingCardSuit = keyof typeof SUIT_SYMBOLS;

const RANK_NAMES: Record<string, string> = {
  A: 'Ace',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
};

/**
 * Where each pip of a number card sits, as percentages of the pip field:
 * `[left, top]`. These are the traditional layouts. A pip below the middle is
 * printed upside down, as on a real card.
 */
const PIP_LAYOUTS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '2': [
    [50, 0],
    [50, 100],
  ],
  '3': [
    [50, 0],
    [50, 50],
    [50, 100],
  ],
  '4': [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
  ],
  '5': [
    [0, 0],
    [100, 0],
    [50, 50],
    [0, 100],
    [100, 100],
  ],
  '6': [
    [0, 0],
    [100, 0],
    [0, 50],
    [100, 50],
    [0, 100],
    [100, 100],
  ],
  '7': [
    [0, 0],
    [100, 0],
    [50, 25],
    [0, 50],
    [100, 50],
    [0, 100],
    [100, 100],
  ],
  '8': [
    [0, 0],
    [100, 0],
    [50, 25],
    [0, 50],
    [100, 50],
    [50, 75],
    [0, 100],
    [100, 100],
  ],
  '9': [
    [0, 0],
    [100, 0],
    [0, 33.3],
    [100, 33.3],
    [50, 50],
    [0, 66.7],
    [100, 66.7],
    [0, 100],
    [100, 100],
  ],
  '10': [
    [0, 0],
    [100, 0],
    [50, 16.7],
    [0, 33.3],
    [100, 33.3],
    [0, 66.7],
    [100, 66.7],
    [50, 83.3],
    [0, 100],
    [100, 100],
  ],
};

/** A crown or cap for each court card, drawn in a 24 × 16 box. */
const COURT_HEADDRESS: Record<string, string> = {
  K: 'M2 15 L3.5 4 L8 9 L12 1.5 L16 9 L20.5 4 L22 15 Z',
  Q: 'M3 15 L4 6 L9 10.5 L12 4 L15 10.5 L20 6 L21 15 Z',
  J: 'M2 15 L4 9 C6 4 18 4 20 9 L22 15 Z M11 4.5 C12 1.5 15 0.5 18 1 C16 2 14 3.5 13 5 Z',
};

export interface PlayingCardContentsProps {
  /** The card's rank as printed in its corner: `A`, `2`–`10`, `J`, `Q`, `K`. */
  rank: string;
  suit: PlayingCardSuit;
  /** Show the card's back: a token-colored pattern with no rank or suit. */
  faceDown?: boolean;
}

/**
 * A playing card in real-card proportions (5 : 7). The face has its rank and
 * suit in the top-left corner and again, upside down, in the bottom-right
 * corner; number cards lay out their pips, aces show one large pip, and court
 * cards show a framed, two-headed portrait. `faceDown` shows the back. Every
 * size scales with the card's width, so give its container a width.
 */
export function PlayingCardContents({
  rank,
  suit,
  faceDown = false,
}: PlayingCardContentsProps) {
  if (faceDown) {
    return (
      <span role="img" aria-label="Card back" {...stylex.props(styles.card)}>
        <span {...stylex.props(styles.back)} />
      </span>
    );
  }
  const symbol = SUIT_SYMBOLS[suit];
  const isRed = suit === 'hearts' || suit === 'diamonds';
  return (
    <span
      role="img"
      aria-label={`${RANK_NAMES[rank] ?? rank} of ${suit}`}
      {...stylex.props(styles.card, styles.face, isRed && styles.red)}>
      <CornerIndex rank={rank} symbol={symbol} />
      <CardCenter rank={rank} symbol={symbol} isRed={isRed} />
      <CornerIndex rank={rank} symbol={symbol} isUpsideDown />
    </span>
  );
}

function CornerIndex({
  rank,
  symbol,
  isUpsideDown = false,
}: {
  rank: string;
  symbol: string;
  isUpsideDown?: boolean;
}) {
  return (
    <span
      aria-hidden
      {...stylex.props(
        styles.corner,
        isUpsideDown ? styles.cornerEnd : styles.cornerStart,
      )}>
      <span {...stylex.props(styles.cornerRank)}>{rank}</span>
      <span {...stylex.props(styles.cornerSuit)}>{symbol}</span>
    </span>
  );
}

function CardCenter({
  rank,
  symbol,
  isRed,
}: {
  rank: string;
  symbol: string;
  isRed: boolean;
}) {
  const headdress = COURT_HEADDRESS[rank];
  if (headdress != null) {
    return (
      <span
        aria-hidden
        {...stylex.props(styles.court, isRed && styles.courtRed)}>
        <CourtHalf rank={rank} symbol={symbol} headdress={headdress} />
        <CourtHalf
          rank={rank}
          symbol={symbol}
          headdress={headdress}
          isUpsideDown
        />
      </span>
    );
  }
  const pips = PIP_LAYOUTS[rank];
  if (pips == null) {
    return (
      <span aria-hidden {...stylex.props(styles.acePip)}>
        {symbol}
      </span>
    );
  }
  return (
    <span aria-hidden {...stylex.props(styles.pipField)}>
      {pips.map(([left, top]) => (
        <span
          key={`${left}-${top}`}
          {...stylex.props(
            styles.pip,
            styles.pipAt(`${left}%`, `${top}%`),
            top > 50 && styles.upsideDown,
          )}>
          {symbol}
        </span>
      ))}
    </span>
  );
}

function CourtHalf({
  rank,
  symbol,
  headdress,
  isUpsideDown = false,
}: {
  rank: string;
  symbol: string;
  headdress: string;
  isUpsideDown?: boolean;
}) {
  return (
    <span
      {...stylex.props(styles.courtHalf, isUpsideDown && styles.upsideDown)}>
      <svg viewBox="0 0 24 16" {...stylex.props(styles.headdress)}>
        <path d={headdress} fill="currentColor" />
      </svg>
      <span {...stylex.props(styles.courtRank)}>
        {rank}
        <span {...stylex.props(styles.courtSuit)}>{symbol}</span>
      </span>
    </span>
  );
}

export interface DemoHintProps {
  /** One short sentence: what to do with the demo to see what it shows. */
  text: string;
  /** The demo: one element. */
  children: ReactNode;
}

/**
 * Center a demo and put a muted line under it that tells the reader what to
 * try. Copies drop the hint and keep the demo as written.
 */
export function DemoHint({text, children}: DemoHintProps) {
  return (
    <div {...stylex.props(styles.hinted)}>
      {children}
      <Text type="supporting" color="secondary" xstyle={styles.hint}>
        {text}
      </Text>
    </div>
  );
}

// A card face is a picture of a physical object, so it does not mirror in
// right-to-left text: its corners and pips use physical sides.
const styles = stylex.create({
  card: {
    position: 'relative',
    display: 'block',
    aspectRatio: '5 / 7',
    inlineSize: '100%',
    containerType: 'inline-size',
    userSelect: 'none',
  },
  face: {
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-heading'],
  },
  red: {
    color: colorVars['--color-text-red'],
  },
  corner: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minInlineSize: '12cqi',
    lineHeight: 1,
  },
  cornerStart: {
    top: '3cqi',
    left: '3cqi',
  },
  cornerEnd: {
    bottom: '3cqi',
    right: '3cqi',
    transform: 'rotate(180deg)',
  },
  cornerRank: {
    fontSize: '14cqi',
    fontWeight: fontWeightVars['--font-weight-semibold'],
    letterSpacing: '-0.05em',
  },
  cornerSuit: {
    fontSize: '12cqi',
  },
  acePip: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    fontSize: '48cqi',
    lineHeight: 1,
  },
  pipField: {
    position: 'absolute',
    top: '16%',
    bottom: '16%',
    left: '30%',
    right: '30%',
  },
  pip: {
    position: 'absolute',
    fontSize: '18cqi',
    lineHeight: 1,
    translate: '-50% -50%',
  },
  pipAt: (left: string, top: string) => ({left, top}),
  upsideDown: {
    rotate: '180deg',
  },
  court: {
    position: 'absolute',
    top: '13%',
    bottom: '13%',
    left: '17%',
    right: '17%',
    display: 'grid',
    gridTemplateRows: '1fr 1fr',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-background-gray'],
    overflow: 'hidden',
  },
  courtRed: {
    backgroundColor: colorVars['--color-background-red'],
  },
  courtHalf: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1cqi',
    paddingBlockStart: '2cqi',
  },
  headdress: {
    inlineSize: '28cqi',
    blockSize: 'auto',
  },
  courtRank: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '1cqi',
    fontSize: '22cqi',
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: 1,
  },
  courtSuit: {
    fontSize: '14cqi',
  },
  back: {
    position: 'absolute',
    inset: 0,
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-accent'],
    backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3cqi, color-mix(in srgb, ${colorVars['--color-on-accent']} 22%, transparent) 3cqi 4cqi), repeating-linear-gradient(-45deg, transparent 0 3cqi, color-mix(in srgb, ${colorVars['--color-on-accent']} 22%, transparent) 3cqi 4cqi)`,
    boxShadow: `inset 0 0 0 4cqi ${colorVars['--color-accent']}, inset 0 0 0 5cqi ${colorVars['--color-on-accent']}`,
  },
  hinted: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
  },
  hint: {
    maxInlineSize: '40ch',
    textAlign: 'center',
    textWrap: 'balance',
  },
});
