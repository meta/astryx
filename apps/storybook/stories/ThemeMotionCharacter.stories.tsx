// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta = {
  title: 'Core/Themes/Motion character',
  parameters: {layout: 'padded'},
};

export default meta;

type Story = StoryObj;

const TEMPOS = ['0.75', '1', '1.5'] as const;
type Tempo = (typeof TEMPOS)[number];

const CHARACTERS = ['standard', 'fluid'] as const;
type Character = (typeof CHARACTERS)[number];

/**
 * Each character's column of the motion token table. `defineTheme` does not
 * take `'fluid'` yet, so this preview writes both columns as explicit tokens.
 */
const COLUMNS: Record<
  Character,
  {entrance: string; move: string; mediumMinMs: number}
> = {
  standard: {
    entrance: 'cubic-bezier(0.24, 1, 0.4, 1)',
    move: 'cubic-bezier(0.24, 1, 0.4, 1)',
    mediumMinMs: 310,
  },
  fluid: {
    entrance: 'cubic-bezier(0, 0, 0, 1)',
    move: 'cubic-bezier(0.2, 0, 0, 1)',
    mediumMinMs: 410,
  },
};

/** The fast duration that exits play. It is the same at every character. */
const FAST_MS = 175;

function themeFor(character: Character, tempo: Tempo) {
  const column = COLUMNS[character];
  const scale = Number(tempo);
  return defineTheme({
    name: `motion-character-${character}-${tempo.replace('.', '-')}`,
    tokens: {
      '--ease-entrance': column.entrance,
      '--ease-move': column.move,
      '--duration-medium-min': `${column.mediumMinMs * scale}ms`,
      '--duration-fast': `${FAST_MS * scale}ms`,
    },
  });
}

const THEMES = Object.fromEntries(
  CHARACTERS.map(character => [
    character,
    Object.fromEntries(
      TEMPOS.map(tempo => [tempo, themeFor(character, tempo)]),
    ),
  ]),
) as Record<Character, Record<Tempo, ReturnType<typeof defineTheme>>>;

const card = {
  display: 'grid',
  alignContent: 'start',
  gap: 10,
  padding: 10,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background-surface)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-family-body)',
  fontSize: 13,
} as const;

const heading = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-family-body)',
} as const;

const note = {
  margin: 0,
  fontSize: 12,
  color: 'var(--color-text-secondary)',
} as const;

const row = {
  padding: '6px 8px',
  borderRadius: 8,
  background: 'var(--color-background-muted)',
} as const;

const line = {margin: '4px 8px'} as const;

const panel = {
  position: 'absolute',
  top: 34,
  left: 0,
  right: 0,
  display: 'grid',
  gap: 2,
  padding: 4,
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background-card)',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.16)',
  transformOrigin: 'top left',
} as const;

/**
 * Details that expand, and the rows after them, which glide on the same
 * motion: the move curve over the shortest medium duration.
 */
function ExpandAndGlide({
  isOpen,
  isReduced,
}: {
  isOpen: boolean;
  isReduced: boolean;
}) {
  return (
    <div style={{display: 'grid', gap: 4}}>
      <div style={row}>Shipping details</div>
      <div
        data-motion="expand"
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: isReduced
            ? 'none'
            : 'grid-template-rows var(--duration-medium-min) var(--ease-move)',
        }}>
        <div style={{overflow: 'hidden'}} aria-hidden={!isOpen}>
          <p style={line}>Ships in 2 business days.</p>
          <p style={line}>Free returns for 30 days.</p>
        </div>
      </div>
      <div data-motion="glide" style={row}>
        Order total
      </div>
      <div style={row}>Delivery</div>
    </div>
  );
}

/**
 * A menu that grows from its trigger on the entrance curve and leaves on the
 * exit curve and duration.
 */
function Popover({isOpen, isReduced}: {isOpen: boolean; isReduced: boolean}) {
  const timing = isOpen
    ? 'var(--duration-medium-min) var(--ease-entrance)'
    : 'var(--duration-exit) var(--ease-exit)';
  return (
    <div style={{position: 'relative', height: 132}}>
      <div style={row}>Sort by</div>
      <div
        data-motion="popover"
        aria-hidden={!isOpen}
        style={{
          ...panel,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(0.9)',
          transition: isReduced
            ? 'none'
            : `opacity ${timing}, transform ${timing}`,
        }}>
        <div style={row}>Newest</div>
        <div style={row}>Price</div>
        <div style={row}>Rating</div>
      </div>
    </div>
  );
}

function Column({
  character,
  tempo,
  isOpen,
  isReduced,
}: {
  character: Character;
  tempo: Tempo;
  isOpen: boolean;
  isReduced: boolean;
}) {
  const ms = Math.round(COLUMNS[character].mediumMinMs * Number(tempo));
  return (
    <Theme theme={THEMES[character][tempo]}>
      <section data-character={character} style={card}>
        <h3 style={heading}>{character}</h3>
        <p style={note}>Expand, glide and menu: {ms} ms</p>
        <ExpandAndGlide isOpen={isOpen} isReduced={isReduced} />
        <Popover isOpen={isOpen} isReduced={isReduced} />
      </section>
    </Theme>
  );
}

/**
 * The same motions under the standard and fluid characters, side by side at
 * phone width. Open plays them in both columns at once; the tempo scales both.
 */
export const StandardVsFluid: Story = {
  render: function StandardVsFluid() {
    const [tempo, setTempo] = useState<Tempo>('1');
    const [isOpen, setIsOpen] = useState(false);
    const isReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    return (
      <div style={{display: 'grid', gap: 12, maxWidth: 390}}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 8,
          }}>
          <SegmentedControl
            label="Tempo"
            value={tempo}
            onChange={value => setTempo(value as Tempo)}>
            {TEMPOS.map(value => (
              <SegmentedControlItem key={value} value={value} label={value} />
            ))}
          </SegmentedControl>
          <Button
            label={isOpen ? 'Close' : 'Open'}
            onClick={() => setIsOpen(open => !open)}
          />
        </div>
        {isReduced ? (
          <p style={note}>Reduce Motion is on, so these change at once.</p>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            alignItems: 'start',
            gap: 8,
          }}>
          {CHARACTERS.map(character => (
            <Column
              key={character}
              character={character}
              tempo={tempo}
              isOpen={isOpen}
              isReduced={isReduced}
            />
          ))}
        </div>
      </div>
    );
  },
};
