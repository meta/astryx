// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {useAnimatedLayout} from '@astryxdesign/core/hooks';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Slider} from '@astryxdesign/core/Slider';
import {Switch} from '@astryxdesign/core/Switch';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta = {
  title: 'Core/Theme motion tempo',
  parameters: {layout: 'padded'},
};

export default meta;

type Story = StoryObj;

const TEMPOS = [0.75, 1, 1.5] as const;

const THEMES = TEMPOS.map(tempo =>
  defineTheme({
    name: `motion-tempo-${String(tempo).replace('.', '-')}`,
    motion: {tempo},
  }),
);

const NAMES: Record<(typeof TEMPOS)[number], string> = {
  0.75: 'Tempo 0.75, the quickest',
  1: "Tempo 1, Astryx's own",
  1.5: 'Tempo 1.5, the slowest',
};

const card = {
  display: 'grid',
  gap: 16,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background-surface)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-family-body)',
  fontSize: 14,
} as const;

const title = {
  margin: '0 0 6px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-family-body)',
} as const;

/**
 * Details that open with a glide: the content after them glides on the tempo
 * of the theme they are in.
 */
function Details({label}: {label: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  return (
    <ScrollableArea ref={containerRef} height={180} label={label}>
      <Collapsible
        trigger="Shipping details"
        defaultIsOpen={false}
        animatedLayout={animatedLayout}>
        <p style={{margin: '4px 0'}}>Ships in 2 business days.</p>
        <p style={{margin: '4px 0'}}>Free returns for 30 days.</p>
      </Collapsible>
      <p data-after-collapsible style={{margin: '8px 0 0'}}>
        The content after it glides on the theme&apos;s tempo.
      </p>
    </ScrollableArea>
  );
}

/**
 * One theme's controls: their touch springs and the Collapsible's glide play
 * at the theme's tempo.
 */
function Row({index}: {index: number}) {
  const tempo = TEMPOS[index];
  const [isOn, setIsOn] = useState(false);
  const [volume, setVolume] = useState(40);
  const [view, setView] = useState('day');
  return (
    <section data-tempo={tempo} style={{margin: '0 0 20px', maxWidth: 420}}>
      <div style={title}>{NAMES[tempo]}</div>
      <Theme theme={THEMES[index]} mode="light">
        <div style={card}>
          <Switch label="Wi-Fi" value={isOn} onChange={setIsOn} />
          <Slider label="Volume" value={volume} onChange={setVolume} />
          <SegmentedControl value={view} onChange={setView} label="Range">
            <SegmentedControlItem value="day" label="Day" />
            <SegmentedControlItem value="week" label="Week" />
            <SegmentedControlItem value="month" label="Month" />
          </SegmentedControl>
          <Details label={`Details at tempo ${tempo}`} />
        </div>
      </Theme>
    </section>
  );
}

/**
 * The same controls under three themes that set only `motion.tempo`. On a
 * touch screen, try each row: toggle the switch, drag the slider, slide the
 * segments and open the details. Every spring and the glide take the tempo
 * times their own time.
 */
export const ThreeTempos: Story = {
  name: 'Three tempos',
  render: () => (
    <div>
      {TEMPOS.map((tempo, index) => (
        <Row key={tempo} index={index} />
      ))}
    </div>
  ),
};

/** A theme that sets only a duration scale, as an existing theme does. */
const durationScaleTheme = defineTheme({
  name: 'motion-duration-scale',
  motion: {fast: 130, medium: 310, ratio: 0.75},
});

/**
 * A theme with only a duration scale, nested in a theme at tempo 1.5. Its
 * glide plays its own scale's `--duration-medium`, which the outer tempo
 * does not reach.
 */
export const NestedDurationScale: Story = {
  name: 'A duration scale nested in a tempo',
  render: () => (
    <div style={{maxWidth: 420}}>
      <section data-row="plain" style={{margin: '0 0 20px'}}>
        <div style={title}>No theme tempo</div>
        <div style={card}>
          <Details label="Details with no theme tempo" />
        </div>
      </section>
      <Theme theme={THEMES[TEMPOS.indexOf(1.5)]} mode="light">
        <section data-row="outer" style={{margin: '0 0 20px'}}>
          <div style={title}>Tempo 1.5</div>
          <div style={card}>
            <Details label="Details at tempo 1.5" />
          </div>
        </section>
        <Theme theme={durationScaleTheme} mode="light">
          <section data-row="nested" style={{margin: '0 0 20px'}}>
            <div style={title}>A duration scale inside tempo 1.5</div>
            <div style={card}>
              <Details label="Details in a duration scale" />
            </div>
          </section>
        </Theme>
      </Theme>
    </div>
  ),
};
