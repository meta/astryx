// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input SPRINGS from motionTokens, the spring model, the lab store
 * @output The four named springs, tunable, beside the CSS pair for the same gesture
 * @position /motion/springs
 *
 * Springs are the only part of the proposal with no CSS representation, so
 * they live in the JS mirror rather than the token file. That is not a
 * technicality: a spring is what gesture-driven and interruptible motion
 * needs, because it carries velocity through an interruption where a keyframe
 * restarts from zero.
 *
 * The runner and the plot use the lab's CSS module classes rather than local
 * styles so a spring-driven box and a token-driven <Runner> are pixel
 * identical — the comparison is only honest if the only difference is timing.
 */

import {useCallback, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {LabPage} from '../PageFrame';
import {DemoBody, DemoCard, LabSlider, Runner, useLoop} from '../LabPrimitives';
import {useMotionLab} from '../MotionLabStore';
import {SPRINGS} from '../motionTokens';
import {createSpring, plotPath} from '../spring';
import styles from '../MotionLab.module.css';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)'},
  prose: {maxWidth: '72ch'},
});

/** Bounce above this stops reading as a crisp library. Rubric criterion 11. */
const CRISP_BOUNCE_CEILING = 0.3;

const PLOT_WIDTH = 380;
const PLOT_HEIGHT = 148;
const PLOT_PAD = 18;
/** Plot past the nominal duration so the overshoot is visible, not clipped. */
const PLOT_TAIL = 1.5;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * The spring's position over time. The dashed line is the target: everything
 * above it is overshoot, and the vertical mark is where the nominal duration
 * ends — a light spring is still moving there, which is the thing the number
 * in the readout is measuring.
 */
function SpringPlot({duration, bounce}: {duration: number; bounce: number}) {
  const spring = createSpring(duration, bounce);
  const span = spring.duration * PLOT_TAIL;
  const yMin = -0.08;
  const yMax = Math.max(1.2, spring.overshoot() + 0.1);
  const toY = (y: number) =>
    PLOT_HEIGHT -
    PLOT_PAD -
    ((y - yMin) / (yMax - yMin)) * (PLOT_HEIGHT - PLOT_PAD * 2);
  const nominalX = PLOT_PAD + (1 / PLOT_TAIL) * (PLOT_WIDTH - PLOT_PAD * 2);

  return (
    <svg
      className={styles.curveCanvas}
      width={PLOT_WIDTH}
      height={PLOT_HEIGHT}
      // Shrinks with a card narrower than the plot (a phone); its own size
      // otherwise.
      style={{maxWidth: '100%', height: 'auto'}}
      viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
      role="img"
      aria-label={`Spring position over time, duration ${duration} seconds, bounce ${bounce}`}>
      <line
        x1={PLOT_PAD}
        y1={toY(1)}
        x2={PLOT_WIDTH - PLOT_PAD}
        y2={toY(1)}
        stroke="var(--color-border)"
        strokeDasharray="3 3"
      />
      <line
        x1={nominalX}
        y1={PLOT_PAD}
        x2={nominalX}
        y2={PLOT_HEIGHT - PLOT_PAD}
        stroke="var(--color-text-tertiary, #8a8a8a)"
        strokeDasharray="2 4"
      />
      <path
        d={plotPath(
          x => spring.sample(x * span),
          PLOT_WIDTH,
          PLOT_HEIGHT,
          PLOT_PAD,
          yMin,
          yMax,
        )}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * A box driven by the spring itself rather than by a duration token, which is
 * why it cannot be the shared <Runner>: the timing comes from the sampled
 * curve, and only the slow-mo multiplier is shared with the rest of the lab.
 */
function SpringRunner({duration, bounce}: {duration: number; bounce: number}) {
  const {speed, reducedMotion} = useMotionLab();
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(() => {
    const dot = dotRef.current;
    const track = trackRef.current;
    if (dot == null || track == null) {
      return;
    }
    for (const animation of dot.getAnimations()) {
      animation.cancel();
    }
    const spring = createSpring(duration, bounce);
    // Short of the far edge, so an overshooting spring is not clipped by the
    // track it is travelling in.
    const distance = Math.max(0, track.clientWidth - 52);
    // A spring is movement, which is the first thing either reduced-motion
    // policy removes — so the box arrives rather than travels.
    const isInstant = reducedMotion !== 'off';
    dot.animate(
      [{transform: 'translateX(0)'}, {transform: `translateX(${distance}px)`}],
      {
        duration: isInstant ? 1 : Math.max(1, spring.duration * 1000 * speed),
        easing: isInstant ? 'linear' : spring.linear(),
        fill: 'both',
      },
    );
  }, [bounce, duration, reducedMotion, speed]);

  useLoop(run, duration * 1000 * speed + 900);

  return (
    <div ref={trackRef} className={styles.runner}>
      <span ref={dotRef} className={styles.runnerDot} />
    </div>
  );
}

/**
 * The same spring, retargeted mid-flight. The box picks up from wherever it
 * is but from a standstill, because a sampled curve has no velocity to carry.
 * A real spring integrator does — which is the argument for the JS spring
 * over the CSS fallback for anything gesture-driven.
 */
function InterruptDemo({duration, bounce}: {duration: number; bounce: number}) {
  const {speed, reducedMotion} = useMotionLab();
  const [isOut, setOut] = useState(false);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const toggle = useCallback(() => {
    const dot = dotRef.current;
    const track = trackRef.current;
    if (dot == null || track == null) {
      return;
    }
    const next = !isOut;
    setOut(next);
    const spring = createSpring(duration, bounce);
    const distance = Math.max(0, track.clientWidth - 52);
    // The running animation does not commit its value, so the position has to
    // be read off the box before it is cancelled.
    const matrix = new DOMMatrixReadOnly(
      window.getComputedStyle(dot).transform,
    );
    for (const animation of dot.getAnimations()) {
      animation.cancel();
    }
    const isInstant = reducedMotion !== 'off';
    dot.animate(
      [
        {transform: `translateX(${matrix.m41}px)`},
        {transform: `translateX(${next ? distance : 0}px)`},
      ],
      {
        duration: isInstant ? 1 : Math.max(1, spring.duration * 1000 * speed),
        easing: isInstant ? 'linear' : spring.linear(),
        fill: 'both',
      },
    );
  }, [bounce, duration, isOut, reducedMotion, speed]);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div ref={trackRef} className={styles.runner}>
        <span ref={dotRef} className={styles.runnerDot} />
      </div>
      <Button
        size="sm"
        variant="secondary"
        label="Send it back — press twice, fast"
        onClick={toggle}
      />
    </VStack>
  );
}

function SpringCard({
  name,
  use,
  cssCounterpart,
}: {
  name: string;
  use: string;
  cssCounterpart: readonly [string, string];
}) {
  const {springs, setSpring} = useMotionLab();
  const tuned = springs[name];
  const spring = createSpring(tuned.duration, tuned.bounce);
  const isBouncy = tuned.bounce > CRISP_BOUNCE_CEILING;

  return (
    <DemoCard
      title={name}
      question={use}
      badges={
        isBouncy ? (
          <Badge
            variant="warning"
            label={`bounce ${tuned.bounce.toFixed(2)} — past crisp`}
          />
        ) : (
          <Badge
            label={`${Math.round(tuned.duration * 1000)}ms · bounce ${tuned.bounce.toFixed(2)}`}
          />
        )
      }>
      <DemoBody>
        <SpringPlot duration={tuned.duration} bounce={tuned.bounce} />
        <VStack gap={1} {...stylex.props(sx.full)}>
          <Text type="supporting" color="secondary">
            spring — <code>{name}</code>
          </Text>
          <SpringRunner duration={tuned.duration} bounce={tuned.bounce} />
          <Text type="supporting" color="secondary">
            CSS counterpart — <code>{cssCounterpart[0]}</code> +{' '}
            <code>{cssCounterpart[1]}</code>
          </Text>
          <Runner
            durationToken={cssCounterpart[0]}
            easeToken={cssCounterpart[1]}
          />
        </VStack>
        <LabSlider
          label="Duration"
          value={tuned.duration}
          min={0.1}
          max={1.2}
          step={0.05}
          format={v => `${v.toFixed(2)}s`}
          onChange={v => setSpring(name, {duration: v, bounce: tuned.bounce})}
        />
        <LabSlider
          label="Bounce"
          value={tuned.bounce}
          min={0}
          max={0.6}
          step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setSpring(name, {duration: tuned.duration, bounce: v})}
        />
        <MetadataList columns={2} label={{position: 'top'}}>
          <MetadataListItem label="Duration">
            <Text {...stylex.props(sx.mono)}>
              {spring.duration.toFixed(2)}s
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Bounce">
            <Text {...stylex.props(sx.mono)}>{spring.bounce.toFixed(2)}</Text>
          </MetadataListItem>
          <MetadataListItem label="Overshoot">
            <Text {...stylex.props(sx.mono)}>
              {pct(spring.overshoot() - 1)}
            </Text>
          </MetadataListItem>
          <MetadataListItem label="At nominal duration">
            <Text {...stylex.props(sx.mono)}>{pct(spring.settle())}</Text>
          </MetadataListItem>
          <MetadataListItem label="Stiffness">
            <Text {...stylex.props(sx.mono)}>{spring.stiffness}</Text>
          </MetadataListItem>
          <MetadataListItem label="Damping">
            <Text {...stylex.props(sx.mono)}>{spring.damping}</Text>
          </MetadataListItem>
        </MetadataList>
      </DemoBody>
    </DemoCard>
  );
}

export default function MotionSpringsPage() {
  const {springs} = useMotionLab();
  const [escapeHatch, setEscapeHatch] = useState<string>(SPRINGS[0].name);
  const hatch = springs[escapeHatch];
  const hatchSpring = createSpring(hatch.duration, hatch.bounce);
  const bouncy = SPRINGS.filter(
    s => springs[s.name].bounce > CRISP_BOUNCE_CEILING,
  );

  return (
    <LabPage
      title="Springs"
      intro="A spring is described by duration and bounce, not by a curve, and it has no CSS representation at all — which is why the proposal keeps springs in the JS mirror rather than the token file. What they buy is interruption: a spring carries velocity through a change of target, where a keyframe restarts from zero. That is the whole case for having them, and it only pays off in gesture-driven and interruptible motion."
      decides="Whether the four named springs feel right, and whether they belong in the theme contract."
      badges={<Badge variant="info" label="JS mirror only — no CSS form" />}>
      <Banner
        status={bouncy.length > 0 ? 'warning' : 'info'}
        title={
          bouncy.length > 0
            ? `${bouncy.length} spring(s) tuned past bounce 0.3`
            : 'Bounce belongs in 0.1–0.3 for a crisp library'
        }
        description={
          <Text>
            Rubric criterion 11 is that visible bounce is for drag-to-dismiss
            and playful moments; a dashboard stays crisp. Every slider below
            runs to 0.6 on purpose. At bounce {CRISP_BOUNCE_CEILING} the box
            passes its target by{' '}
            {pct(createSpring(0.4, CRISP_BOUNCE_CEILING).overshoot() - 1)} and
            settles back; at 0.6 it passes by{' '}
            {pct(createSpring(0.4, 0.6).overshoot() - 1)} and reads as a toy.
            Overshoot depends only on bounce, not on duration, so this is the
            one number worth arguing about — and it is easier to agree on by
            looking than by reading it.
          </Text>
        }
      />

      <Grid columns={{minWidth: 420, max: 2}} gap={4}>
        {SPRINGS.map(spec => (
          <SpringCard
            key={spec.name}
            name={spec.name}
            use={spec.use}
            cssCounterpart={spec.cssCounterpart}
          />
        ))}
      </Grid>

      <DemoCard
        title="What the preview actually is"
        question="An approximation, and it is worth knowing where it stops being one."
        badges={<Badge label="honest about the model" />}>
        <DemoBody>
          <Text color="secondary" {...stylex.props(sx.prose)}>
            Motion describes a spring as duration and bounce. This lab
            reproduces that as a damped harmonic oscillator — bounce maps to the
            damping ratio, duration to the settle time — and then samples the
            curve into a CSS <code>linear()</code> easing so a plain transition
            can play it. Close enough to judge feel, and to argue about whether
            0.2 belongs in a crisp library.
          </Text>
          <Text color="secondary" {...stylex.props(sx.prose)}>
            The sampled curve is also the escape hatch: a component that cannot
            take a JS dependency can still run the spring shape from CSS. What
            it cannot do is interruption. Press the button below twice in quick
            succession — the box retargets from wherever it is, but from a
            standstill, because a curve has no velocity to carry. A real spring
            integrator does. So the fallback is for shape, and gesture work
            wants the JS spring.
          </Text>
          <InterruptDemo duration={hatch.duration} bounce={hatch.bounce} />
          <SegmentedControl
            label="Which spring to emit"
            size="sm"
            value={escapeHatch}
            onChange={value => setEscapeHatch(value as string)}>
            {SPRINGS.map(spec => (
              <SegmentedControlItem
                key={spec.name}
                value={spec.name}
                label={spec.name}
              />
            ))}
          </SegmentedControl>
          <CodeBlock
            language="css"
            title={`${escapeHatch} — CSS fallback, sampled from the spring`}
            hasCopyButton
            isWrapped
            maxHeight={220}
            code={`/* No JS dependency. Shape only: an interruption restarts from rest. */
.thing {
  transition-property: transform;
  transition-duration: ${Math.round(hatchSpring.duration * 1000)}ms;
  transition-timing-function: ${hatchSpring.linear(16)};
}`}
          />
          <Text type="supporting" color="secondary">
            Sampled at 16 points here so it is readable; the mirror emits 64.
            Overshoot {pct(hatchSpring.overshoot() - 1)}, which is the part a
            cubic-bezier cannot express without going out of its 0–1 box.
          </Text>
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>
          Open question: should springs be theme-tunable?
        </Heading>
        <Text color="secondary" {...stylex.props(sx.prose)}>
          A theme already retunes the whole duration scale from three numbers —
          a snappy theme sets{' '}
          <code>{'{fast: 100, medium: 250, ratio: 0.75}'}</code> and every
          primitive moves with it. Springs have no such axis, so today they are
          the same everywhere no matter what the theme says. If one theme is
          meant to feel bouncier than another, springs belong in the theme
          contract alongside the duration scale — and adding them after the
          contract ships is a breaking change to it. This wants deciding before
          the token work lands, not after.
        </Text>
        <CodeBlock
          language="ts"
          title="packages/core/src/theme/expandMotionScale.ts — the axis today, and the question"
          hasCopyButton
          code={`export interface MotionScaleConfig {
  fast: number;    // 175 — micro-interactions
  medium: number;  // 410 — entrance and exit
  slow?: number;   // 975 — continuous
  ratio: number;   // 0.75 — min = base × ratio, max = base ÷ ratio
  easing?: string; // overrides --ease-standard

  // Proposed, and the decision this page is asking for. Optional is not the
  // same as cheap: once themes ship without it, a theme author who tunes
  // duration and finds springs unmoved has been told the contract covers
  // motion when it covers only half of it.
  spring?: Record<'press' | 'swap' | 'panel' | 'layout', {duration: number; bounce: number}>;
}`}
        />
        <Text type="supporting" color="secondary">
          Springs are defined natively in the mirror rather than parsed out of
          CSS, since they have no CSS form to parse. See{' '}
          <Link href="/pages/motion-lab/js-mirror/">JS token mirror</Link> for
          the emitted shape and{' '}
          <Link href="/pages/motion-lab/export/">Export tuning</Link> for what
          ships.
        </Text>
      </VStack>
    </LabPage>
  );
}
