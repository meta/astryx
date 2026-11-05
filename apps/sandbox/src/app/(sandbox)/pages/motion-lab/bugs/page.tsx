// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The generated audit, the installed core source, the lab store
 * @output Which structural findings survive contact with the code
 * @position /motion/bugs
 *
 * Of the four structural findings, one is real and underplayed, one is a
 * misreading of three components, one is correct code the scanner flags, and
 * one cannot be verified in this app at all. Every claim here is checked
 * against the installed package and cited file:line, including the places
 * where the generated audit was itself wrong.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Switch} from '@astryxdesign/core/Switch';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {LabPage} from '../PageFrame';
import {
  ComparePanes,
  DemoBody,
  DemoCard,
  LabSlider,
  Runner,
  useLoop,
} from '../LabPrimitives';
import {useMotionLab} from '../MotionLabStore';
import {
  AUDIT_COUNTS,
  DURATION_WITHOUT_CURVE,
  NOOP_TRANSITIONS,
  TIMEOUT_LITERALS,
  TRANSFORM_TRANSITIONS,
  TRANSITION_ALL,
} from '../__generated__/motionAudit';
import styles from '../MotionLab.module.css';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)', fontSize: '12px'},
  rows: {width: '100%'},
  readout: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '13px',
  },
  drawerBack: {padding: '14px', maxWidth: '34%'},
});

/** The rotation rule the brief reads as dead, verbatim from the package. */
const SELECTOR_SOURCE = `// Rotation lives on the chevron glyph itself (passed through \`xstyle\`), not
// on the layout wrapper above, so the icon's \`selector-indicator-icon\` theme
// target and the open/closed transform sit on one element — a theme can
// restyle the mark and its rotation through a single selector. The wrapper
// keeps only layout. The status branch renders a different icon, so it never
// picks these up and needs no transition opt-out.
triggerIconRotation: {
  transitionProperty: 'transform',
  transitionDuration: durationVars['--duration-fast'],
  transitionTimingFunction: easeVars['--ease-standard'],
  transformOrigin: 'center',
},
triggerIconOpen: {
  transform: 'rotate(180deg)',
},`;

const LIGHTBOX_SOURCE = `image: {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  pointerEvents: 'none',
  transitionProperty: 'transform',
  transitionDuration: {
    default: '200ms',
    '@media (prefers-reduced-motion: reduce)': '0ms',
  },
  transitionTimingFunction: 'ease-out',
},
imageDragging: {
  transitionProperty: 'none',
},

// ...applied only while the pointer is down, Lightbox.tsx:691
isDragging && styles.imageDragging,`;

const TIMER_FIX = `// What the brief describes: a literal that has to be kept in sync by hand.
setTimeout(() => setMounted(false), 250);

// What removes the class of bug: the element says when it is done.
const panel = panelRef.current;
if (panel == null) {
  setMounted(false);
  return;
}
Promise.allSettled(panel.getAnimations().map(a => a.finished)).then(() =>
  setMounted(false),
);

// The transitionend form, for a single known property. Note the guard: a
// bubbling transitionend from a child would unmount the panel early, and a
// zero duration fires nothing at all — which is why --duration-instant
// cannot simply be 0.
panel.addEventListener('transitionend', event => {
  if (event.target === panel && event.propertyName === 'transform') {
    setMounted(false);
  }
});`;

const INSTANT_DWC = DURATION_WITHOUT_CURVE.filter(
  site => site.decl?.includes('0.01s') === true,
);
const SUBSTANTIVE_DWC = DURATION_WITHOUT_CURVE.filter(
  site => site.decl?.includes('0.01s') !== true,
);
const SUBSTANTIVE_DWC_COMPONENTS = [
  ...new Set(SUBSTANTIVE_DWC.map(site => site.component)),
].sort();

/** transform declared inside a longer property list, which a grep never finds. */
const MULTI_PROPERTY_TRANSFORMS = TRANSFORM_TRANSITIONS.filter(
  site => site.decl?.includes(',') === true,
);
const SINGLE_PROPERTY_TRANSFORMS =
  TRANSFORM_TRANSITIONS.length - MULTI_PROPERTY_TRANSFORMS.length;
/** ...and the ones that also animate a layout property, which is criterion 6. */
const LAYOUT_MIXED_TRANSFORMS = MULTI_PROPERTY_TRANSFORMS.filter(site =>
  /width|height|top|left|margin|padding|inset/.test(site.decl ?? ''),
);

const LINT_MAP: ReadonlyArray<{
  readonly finding: string;
  readonly rule: string;
  readonly status: string;
}> = [
  {
    finding: 'A duration with no declared curve',
    rule: 'require-timing-function — a transitionDuration in a rule with no transitionTimingFunction and no shorthand.',
    status: `${AUDIT_COUNTS.durationWithoutCurve} sites today, ${SUBSTANTIVE_DWC.length} of them substantive.`,
  },
  {
    finding: 'A transitionProperty with no duration',
    rule: "no-noop-transition — same shape, inverted. Must exempt transitionProperty: 'none', which is a deliberate opt-out.",
    status: `${AUDIT_COUNTS.noopTransitions} site today, and it is the exemption case.`,
  },
  {
    finding: 'transition: all',
    rule: 'no-transition-all — a property list containing all.',
    status: `${TRANSITION_ALL.length} today. Pure regression guard.`,
  },
  {
    finding: 'A hardcoded duration, delay or curve',
    rule: 'motion-tokens-only — any time literal or bezier literal outside the token file.',
    status: `${AUDIT_COUNTS.hardcodedTotal} today. Needs an allowlist for the reduced-motion escape.`,
  },
  {
    finding: 'A timer literal standing in for a transition',
    rule: 'no-animation-timeout — a setTimeout whose literal matches a duration token value, inside a component that transitions.',
    status: `${TIMEOUT_LITERALS.length} literal timer in core, and it is unrelated to motion.`,
  },
  {
    finding: 'A CSS transition on transform',
    rule: 'no-transform-transition — criterion 12, the motion-library blocker.',
    status: `${AUDIT_COUNTS.transformTransitions} sites across ${AUDIT_COUNTS.transformTransitionComponents} components — criterion 12's entire caseload.`,
  },
];

/** Rows carrying the no-op rule, beside rows carrying a real one. */
function Rows({variant}: {variant: 'noop' | 'tint'}) {
  return (
    <VStack gap={1} {...stylex.props(sx.rows)}>
      {['Row one', 'Row two', 'Row three'].map(row => (
        // The CSS module owns both rules: the point of the pane is the
        // declaration itself, so it has to be the real one.
        <div
          key={row}
          className={variant === 'noop' ? styles.noopRow : styles.tintRow}>
          <Text type="supporting">{row}</Text>
        </div>
      ))}
    </VStack>
  );
}

/**
 * The unmount timer racing the slide. Both sliders are live and both tracks
 * run in real time, because the finding is a relationship between two numbers
 * rather than either number on its own.
 */
function DrawerCutDemo() {
  const {speed} = useMotionLab();
  const [slideMs, setSlideMs] = useState(410);
  const [timerMs, setTimerMs] = useState(250);
  const [derived, setDerived] = useState(false);
  const [open, setOpen] = useState(true);
  const [cut, setCut] = useState(false);

  const slideFill = useRef<HTMLSpanElement | null>(null);
  const timerFill = useRef<HTMLSpanElement | null>(null);
  const raf = useRef<number | null>(null);
  const timers = useRef<Array<number>>([]);

  const effectiveTimer = derived ? slideMs : timerMs;
  const slideRun = slideMs * speed;
  const timerRun = effectiveTimer * speed;
  const completed = Math.min(100, (effectiveTimer / slideMs) * 100);

  const clear = useCallback(() => {
    for (const id of timers.current) {
      window.clearTimeout(id);
    }
    timers.current = [];
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const play = useCallback(() => {
    clear();
    setCut(false);
    setOpen(true);
    if (slideFill.current != null) {
      slideFill.current.style.width = '0%';
    }
    if (timerFill.current != null) {
      timerFill.current.style.width = '0%';
    }
    timers.current.push(
      window.setTimeout(() => {
        setOpen(false);
        const start = performance.now();
        const span = Math.max(slideRun, timerRun);
        const step = (now: number) => {
          const elapsed = now - start;
          if (slideFill.current != null) {
            slideFill.current.style.width = `${Math.min(100, (elapsed / slideRun) * 100)}%`;
          }
          if (timerFill.current != null) {
            timerFill.current.style.width = `${Math.min(100, (elapsed / timerRun) * 100)}%`;
          }
          if (elapsed < span) {
            raf.current = requestAnimationFrame(step);
          }
        };
        raf.current = requestAnimationFrame(step);
        timers.current.push(window.setTimeout(() => setCut(true), timerRun));
      }, 700),
    );
  }, [clear, slideRun, timerRun]);

  useEffect(() => clear, [clear]);
  useLoop(play, Math.max(2600, slideRun + timerRun + 1400));

  return (
    <VStack gap={3} {...stylex.props(sx.full)}>
      <div className={`${styles.stage} ${styles.stageBlock}`}>
        <VStack gap={1} {...stylex.props(sx.drawerBack)}>
          <Text type="supporting" color="secondary">
            Page behind
          </Text>
        </VStack>
        {/* The transition, the visibility hand-off and the cut are all in the
            CSS module: a style object cannot express the [data-open] pair. */}
        <div
          data-open={open}
          style={{['--drawer-slide' as string]: `${slideRun}ms`}}
          className={
            cut ? `${styles.drawer} ${styles.drawerCut}` : styles.drawer
          }>
          <VStack gap={1}>
            <Text weight="semibold">Drawer</Text>
            <Text type="supporting" color="secondary">
              Slides on --ease-drawer. Removed by a timer that does not know
              about it.
            </Text>
          </VStack>
        </div>
      </div>

      <Grid columns={{minWidth: 260}} gap={3}>
        <VStack gap={1}>
          <Text type="supporting" weight="semibold">
            Slide — {slideMs}ms
          </Text>
          <span className={styles.track}>
            <span
              ref={slideFill}
              className={`${styles.trackFill} ${styles.trackSlide}`}
            />
          </span>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting" weight="semibold">
            Unmount timer — {effectiveTimer}ms
          </Text>
          <span className={styles.track}>
            <span
              ref={timerFill}
              className={`${styles.trackFill} ${styles.trackTimer}`}
            />
          </span>
        </VStack>
      </Grid>

      <Text {...stylex.props(sx.readout)}>
        {completed >= 100
          ? 'The panel survives its whole exit — 100% of the slide runs.'
          : `The panel is removed at ${Math.round(completed)}% of its travel. ${Math.round(
              100 - completed,
            )}% of the exit never runs.`}
      </Text>

      <LabSlider
        label="Slide duration"
        value={slideMs}
        min={150}
        max={800}
        step={10}
        format={v => `${v}ms`}
        onChange={setSlideMs}
      />
      <LabSlider
        label="Unmount timer"
        value={timerMs}
        min={50}
        max={800}
        step={10}
        format={v => `${v}ms`}
        onChange={setTimerMs}
      />
      <Switch
        label="Derive the timer from the transition"
        description="What the fix does: the panel unmounts when its own animation finishes, so the two numbers cannot drift apart."
        value={derived}
        onChange={setDerived}
      />
    </VStack>
  );
}

export default function MotionBugsPage() {
  const noop = NOOP_TRANSITIONS[0];

  return (
    <LabPage
      title="Small bugs"
      intro="Four structural findings in the brief. One is real and underplayed, one is a misreading of three components, one is correct code the scanner flags, and one cannot be verified in this app at all."
      badges={<Badge variant="warning" label="1 of 4 survives as written" />}
      decides="Which of the structural findings are real once you look at the code.">
      <Banner
        status="warning"
        title="The three dead no-op transitions are not there"
        description={
          <Text>
            The brief lists three dead no-op transitions in Selector,
            ComplexSelector and MultiSelector. All three rules exist, and all
            three carry a tokenised duration
            <em> and </em> a tokenised curve. The audit finds exactly one no-op
            in the whole package —{' '}
            <code>
              {noop?.file}:{noop?.line}
            </code>{' '}
            — and it is a deliberate{' '}
            <code>transitionProperty: &lsquo;none&rsquo;</code> that turns a
            transition off during a drag. Correct code, flagged by a scanner.
          </Text>
        }
      />

      <DemoCard
        title="The three that are not dead"
        question="Selector, ComplexSelector and MultiSelector all declare the same rotation rule. Is anything missing from it?"
        badges={<Badge variant="success" label="No finding" />}>
        <DemoBody>
          <CodeBlock
            language="tsx"
            title="Selector/Selector.tsx:201-214 — identical at ComplexSelector.tsx:154-166 and MultiSelector.tsx:178-191"
            code={SELECTOR_SOURCE}
            hasCopyButton
            maxHeight={340}
          />
          <Text type="supporting">
            Property, duration and curve, all three tokenised, paired with{' '}
            <code>triggerIconOpen</code> which supplies the transform. There is
            nothing dead here.
          </Text>
          <Text type="supporting" color="secondary">
            The misreading is easy to make and the source explains it: the
            rotation was moved off the layout wrapper and onto the chevron
            glyph, which receives it through <code>xstyle</code>. Read the
            wrapper and you see a component that rotates something with no
            transition anywhere near it. Worth re-checking before it becomes a
            milestone line item — it is currently costed as three fixes that do
            not exist.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="The one real no-op is correct"
        question={`${noop?.file}:${noop?.line} — a transitionProperty with no duration. Bug, or opt-out?`}
        badges={<Badge variant="success" label="Working as intended" />}>
        <DemoBody>
          <CodeBlock
            language="tsx"
            title="Lightbox/Lightbox.tsx:180-194, applied at :691"
            code={LIGHTBOX_SOURCE}
            hasCopyButton
            maxHeight={380}
          />
          <Text type="supporting">
            The zoomed image transitions <code>transform</code> over 200ms so a
            zoom step glides. While the pointer is down,{' '}
            <code>imageDragging</code> replaces that with{' '}
            <code>transitionProperty: &lsquo;none&rsquo;</code>, so the image
            tracks the pointer 1:1 instead of easing 200ms behind it. Removing
            it would make dragging feel like dragging through syrup.
          </Text>
          <Text type="supporting" color="secondary">
            The audit is right that the shape is a no-op and wrong that it is a
            defect. The lint rule needs the exemption written in from the start:{' '}
            <code>none</code> is the only value of{' '}
            <code>transitionProperty</code> that legitimately appears without a
            duration.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Why the shape is still worth linting"
        question="Both panes declare a transition. Only one of them animates. Which is which, at a glance in review?"
        actions={<Badge variant="neutral" label="Hover the rows" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label:
                'transitionProperty, no duration — reads like motion, does nothing',
              content: <Rows variant="noop" />,
            },
            {
              tone: 'after',
              label: 'The same rule with a duration and a curve',
              content: <Rows variant="tint" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            This is the argument for the rule even though the package has one
            instance and it is exempt: the failure is invisible in review. A
            reviewer sees the word <code>transition</code> and moves on, and the
            component ships with a state change that snaps.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title={`${AUDIT_COUNTS.durationWithoutCurve} durations with no declared curve`}
        question="A duration with no timing function silently gets the CSS default, which is ease — not --ease-standard. How different are they?"
        badges={
          <Badge variant="warning" label="The largest structural finding" />
        }>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'ease — what these sites actually run',
              content: (
                <Runner
                  durationToken="--duration-reveal"
                  easeToken="--ease-state"
                />
              ),
            },
            {
              tone: 'after',
              label: '--ease-standard — the curve core ships',
              content: (
                <Runner
                  durationToken="--duration-reveal"
                  easeToken="--ease-standard-today"
                />
              ),
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting">
            <code>ease</code> is <code>cubic-bezier(0.25, 0.1, 0.25, 1)</code> —
            a gentle symmetrical curve. <code>--ease-standard</code> is{' '}
            <code>cubic-bezier(0.24, 1, 0.4, 1)</code>, which leaves immediately
            and decelerates hard. Every site below is running the first one
            while its neighbours run the second, and nobody wrote that decision
            down.
          </Text>
          <Card padding={0}>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Site</TableHeaderCell>
                  <TableHeaderCell>Declaration</TableHeaderCell>
                  <TableHeaderCell>Reading</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DURATION_WITHOUT_CURVE.map(site => {
                  const instant = site.decl?.includes('0.01s') === true;
                  return (
                    <TableRow key={`${site.file}:${site.line}`}>
                      <TableCell>
                        <Text
                          {...stylex.props(
                            sx.mono,
                          )}>{`${site.file}:${site.line}`}</Text>
                      </TableCell>
                      <TableCell>
                        <Text {...stylex.props(sx.mono)} color="secondary">
                          {site.decl}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text type="supporting" color="secondary">
                          {instant
                            ? 'Reduced-motion escape — the curve is irrelevant at 10ms'
                            : 'Substantive: a real duration silently taking the CSS default'}
                        </Text>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <Text type="supporting">
            {SUBSTANTIVE_DWC.length} of the {AUDIT_COUNTS.durationWithoutCurve}{' '}
            are substantive — a real duration silently taking <code>ease</code>{' '}
            — across {SUBSTANTIVE_DWC_COMPONENTS.join(', ')}. Only{' '}
            {INSTANT_DWC.length} is the <code>0.01s</code> escape, where having
            no curve is the right answer. The brief underplays this finding, and
            the figure has already moved twice as the scanner improved: read it
            out of the audit rather than quoting it.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="The drawer exit, cut short"
        question="Slide 410ms, unmount at 250ms. Drag either slider: at what point does an exit stop being an exit?"
        badges={<Badge variant="success" label="Resolved before Core" />}>
        <DemoBody>
          <Text type="supporting">
            <strong>This was the lab failure.</strong> The former implementation
            hardcoded a <code>250</code>ms close timer while the panel and scrim
            transitions used <code>--duration-medium</code> (410ms by default).
            The dialog closed at 61% of its own travel, so the last 160ms of the
            slide never rendered.
          </Text>
          <Text type="supporting" color="secondary">
            Drawer now waits for the actual transform transition and uses a
            computed-duration backstop in{' '}
            <code>core/Drawer/useDrawerDialogPresence.ts</code>. Theme motion
            can no longer desynchronize the visual exit from native-host
            release; the sliders below preserve the original failure as an
            interactive explanation of why the fix matters.
          </Text>
        </DemoBody>
        <DemoBody>
          <DrawerCutDemo />
        </DemoBody>
        <DemoBody>
          <CodeBlock
            language="tsx"
            title="The class of bug, and the two ways out of it"
            code={TIMER_FIX}
            hasCopyButton
            maxHeight={420}
          />
          <Text type="supporting" color="secondary">
            The bug is not the number 250. It is that two numbers have to agree
            and only one of them is a token: retune{' '}
            <code>--duration-overlay</code> and the timer keeps its old value,
            so the cut appears in a diff that never touched the drawer.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="transition: all"
        question={`${TRANSITION_ALL.length} sites. Is a rule with nothing to fix worth writing?`}
        badges={
          <Badge variant="success" label={`${TRANSITION_ALL.length} today`} />
        }>
        <DemoBody>
          <Text type="supporting">
            Yes, and it is the cheapest rule in the set.{' '}
            <code>transition: all</code> animates every property that ever
            changes, including layout properties nobody intended to animate, and
            it arrives in a codebase one careless line at a time. Core is clean
            today; the rule keeps it clean and costs one regex.
          </Text>
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>
          The count moved twice, and the brief was right
        </Heading>
        <Text color="secondary">
          Every structural number on this page is a scanner output, so what the
          scanner can see decides what gets scheduled. This section started as a
          grep run against a generated count that looked too small; the
          generator has since been fixed twice, and criterion 12&rsquo;s
          caseload went from something smaller than the brief&rsquo;s estimate
          to something larger than it.
        </Text>
        <Grid columns={{minWidth: 300}} gap={3}>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">A scanner sees shape, not intent</Text>
              <Text type="supporting" color="secondary">
                The one no-op it reports is the Lightbox drag opt-out above:
                correct code with the shape of a defect. Every rule the lint
                gains has to carry its exemptions from the start, or the first
                thing it produces is work that ends in &ldquo;working as
                intended&rdquo;.
              </Text>
            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">A grep sees less than a scanner</Text>
              <Text type="supporting" color="secondary">
                {SINGLE_PROPERTY_TRANSFORMS} of the{' '}
                {TRANSFORM_TRANSITIONS.length} transform transitions declare{' '}
                <code>transform</code> on its own.{' '}
                {MULTI_PROPERTY_TRANSFORMS.length} declare it inside a longer
                property list, where a search for{' '}
                <code>transitionProperty: &lsquo;transform&rsquo;</code> never
                finds them — which is how one repository yields three different
                counts depending on who counted.
              </Text>
            </VStack>
          </Card>
        </Grid>
        <Text color="secondary">
          The multi-property declarations are the interesting half: criterion 12
          findings like the rest, and {LAYOUT_MIXED_TRANSFORMS.length} of them
          criterion 6 findings as well, because they animate a layout property
          in the same breath as a compositor one.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Declaration</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MULTI_PROPERTY_TRANSFORMS.map(site => (
                <TableRow key={`${site.file}:${site.line}`}>
                  <TableCell>
                    <Text
                      {...stylex.props(
                        sx.mono,
                      )}>{`${site.file}:${site.line}`}</Text>
                  </TableCell>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {site.decl}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <HStack gap={2} wrap="wrap">
          <Badge
            variant="success"
            label={`Audit, fixed: ${AUDIT_COUNTS.transformTransitions} sites / ${AUDIT_COUNTS.transformTransitionComponents} components`}
          />
          <Badge variant="neutral" label="Brief: 20+ components" />
        </HStack>
        <Text type="supporting" color="secondary">
          This page found the discrepancy by grepping when the generated number
          looked too small, and the generator has since been fixed twice: once
          so a value that wraps onto its own line is still read, and once so a
          rule containing nested per-state objects is still scanned. Both bugs
          hid matches, and both made the brief look wrong when it was right. The
          lasting fix is a parser rather than a regex — a StyleX rule is a
          TypeScript object literal and can be read as one — but the habit
          matters more than the tool: when a generated count disagrees with
          someone who has read the code, check the generator first.
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>What would have caught each of these</Heading>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Finding</TableHeaderCell>
                <TableHeaderCell>Lint rule</TableHeaderCell>
                <TableHeaderCell>Caseload today</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LINT_MAP.map(row => (
                <TableRow key={row.finding}>
                  <TableCell>
                    <Text weight="semibold">{row.finding}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting">{row.rule}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.status}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Text type="supporting" color="secondary">
          Five of the six are mechanical. The sixth — a timer standing in for a
          transition — is the only one that needs a heuristic, and it is the
          only one of the six that describes a bug a user would notice.
        </Text>
      </VStack>
    </LabPage>
  );
}
