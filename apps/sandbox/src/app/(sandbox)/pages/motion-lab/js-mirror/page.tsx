// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The generated audit, the lab store, the token data
 * @output The case for a JS mirror, and the module it would emit
 * @position /motion/js-mirror
 *
 * A CSS custom property is readable by exactly one consumer: CSS. Every
 * animation library, the Web Animations API, and anything drawing to a canvas
 * takes numbers. Motion wants seconds as a number and easing as four numbers;
 * it cannot resolve `var(--duration-fast)`. The mirror exists so that the
 * value in the stylesheet and the value in the chart are the same value.
 *
 * The chart demo draws to a real canvas rather than faking one with divs,
 * because the whole argument is that canvas sits outside the token system.
 */

import {useCallback, useEffect, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {VStack} from '@astryxdesign/core/Layout';
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
import {ComparePanes, DemoBody, DemoCard, useLoop} from '../LabPrimitives';
import {parseMs, useMotionLab} from '../MotionLabStore';
import {
  SEMANTIC_DURATIONS,
  SEMANTIC_EASES,
  SPRINGS,
  STAGGERS,
} from '../motionTokens';
import {bezierAt, isNamedCurve, parseBezier} from '../spring';
import {AUDIT_COUNTS, TIMEOUT_LITERALS} from '../__generated__/motionAudit';

const sx = stylex.create({
  full: {width: '100%'},
  prose: {maxWidth: '72ch'},
  mono: {fontFamily: 'var(--font-family-code)'},
  canvas: {
    display: 'block',
    width: '100%',
    height: '132px',
    // Canvas has no access to a custom property, so the demo parks the one
    // colour it needs on the element and reads it back with getComputedStyle.
    color: 'var(--color-brand)',
  },
});

const CHART_HEIGHT = 132;

/** Fixed data, so both panes cycle the same values and the eye can compare. */
const DATASETS: ReadonlyArray<ReadonlyArray<number>> = [
  [0.42, 0.66, 0.28, 0.81, 0.55, 0.35, 0.72],
  [0.68, 0.31, 0.74, 0.44, 0.86, 0.52, 0.29],
  [0.24, 0.58, 0.9, 0.36, 0.61, 0.79, 0.47],
];

/** `--duration-*` in seconds, `--ease-*` as points, the shape a library takes. */
function emitMirror(
  rawToken: (token: string) => string,
  springs: Readonly<Record<string, {duration: number; bounce: number}>>,
): string {
  const short = (name: string) =>
    name.replace(/^--(duration|ease|stagger)-/, '');
  const seconds = (name: string) =>
    Number((parseMs(rawToken(name)) / 1000).toFixed(3));
  const curve = (name: string) => {
    const value = rawToken(name);
    return isNamedCurve(value)
      ? JSON.stringify(value)
      : `[${parseBezier(value).join(', ')}]`;
  };

  return `// @generated from the Astryx theme by scripts/generate-motion-mirror.mjs.
// Seconds and numbers, because that is what animation libraries, the Web
// Animations API and canvas take. Regenerate when the theme changes.

/** Seconds. Motion, WAAPI and canvas all want a number here. */
export const duration = {
${SEMANTIC_DURATIONS.map(d => `  ${short(d.name)}: ${seconds(d.name)},`).join('\n')}
} as const;

/** Four control points, or the CSS keyword when the curve is a keyword. */
export const ease = {
${SEMANTIC_EASES.map(e => `  ${short(e.name)}: ${curve(e.name)},`).join('\n')}
} as const;

/** Seconds between items in a group entrance. */
export const stagger = {
${STAGGERS.map(([name]) => `  ${short(name)}: ${seconds(name)},`).join('\n')}
} as const;

/** No CSS form at all, so these are defined here rather than mirrored. */
export const spring = {
${SPRINGS.map(
  s =>
    `  ${s.name}: {duration: ${springs[s.name].duration}, bounce: ${springs[s.name].bounce}},`,
).join('\n')}
} as const;`;
}

const BEFORE_CODE = `// MobileNav/MobileNav.tsx:294-311
function resolveCloseDelay(dialog: HTMLDialogElement): number {
  const cap = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : MAX_CLOSE_DELAY_MS;

  const hold = parseShortestDurationMs(
    window.getComputedStyle(dialog).transitionDuration,
  );

  // The hold is unreadable — an unresolved var()
  // outside a real browser.
  if (hold === null) {
    return cap;
  }

  return hold <= 0 ? 0 : Math.min(cap, hold * CLOSE_WITHIN_HOLD);
}

// plus parseShortestDurationMs at :265 — 25 lines
// that exist only to turn "0.41s, 0.12s" back into
// a number, exported so it can be unit tested.`;

const AFTER_CODE = `import {duration} from '@astryxdesign/core/motion';

function resolveCloseDelay(prefersReducedMotion: boolean): number {
  const cap = prefersReducedMotion ? 0 : MAX_CLOSE_DELAY_MS;
  // The same value the stylesheet uses, theme-resolved,
  // and readable in jsdom.
  const hold = duration.overlay * 1000;
  return Math.min(cap, hold * CLOSE_WITHIN_HOLD);
}`;

const STYLEX_GAP_CODE = `import {durationVars, easeVars} from '@astryxdesign/core/theme/tokens.stylex';

durationVars['--duration-medium']; // "var(--x1kg2b7)" — a reference
easeVars['--ease-standard'];       // "var(--x9f0d3a)" — same

// Correct in StyleX:
stylex.create({panel: {transitionDuration: durationVars['--duration-medium']}});

// Useless anywhere else:
animate(el, {opacity: 1}, {duration: durationVars['--duration-medium']}); // NaN
ctx.globalAlpha = progress(durationVars['--duration-medium']);            // NaN`;

/**
 * A bar chart redrawn on a loop. Before replaces the data outright, which is
 * what every chart in the system does today; after interpolates it with the
 * same token the CSS uses, reached through the mirror.
 */
function ChartPane({mode}: {mode: 'before' | 'after'}) {
  const {rawToken, reducedMotion, scaledMs} = useMotionLab();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRef = useRef<ReadonlyArray<number>>(DATASETS[0]);
  const stepRef = useRef(1);
  const frameRef = useRef(0);

  const draw = useCallback((values: ReadonlyArray<number>) => {
    const canvas = canvasRef.current;
    if (canvas == null) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 280;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(CHART_HEIGHT * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      return;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, CHART_HEIGHT);
    ctx.fillStyle = window.getComputedStyle(canvas).color;
    const gap = 8;
    const barWidth = (width - gap * (values.length - 1)) / values.length;
    values.forEach((value, i) => {
      const height = Math.max(2, value * (CHART_HEIGHT - 6));
      ctx.fillRect(
        i * (barWidth + gap),
        CHART_HEIGHT - height,
        barWidth,
        height,
      );
    });
  }, []);

  const advance = useCallback(() => {
    const next = DATASETS[stepRef.current % DATASETS.length];
    stepRef.current += 1;
    const from = currentRef.current;

    // Under either reduced-motion policy the after pane collapses into the
    // before pane, which is what reduced motion costs a chart: the data still
    // changes, the eye just has to find it again.
    if (mode === 'before' || reducedMotion !== 'off') {
      currentRef.current = next;
      draw(next);
      return;
    }

    const ms = Math.max(1, scaledMs('--duration-reveal'));
    const curve = parseBezier(rawToken('--ease-move'));
    const startedAt = performance.now();
    window.cancelAnimationFrame(frameRef.current);
    const step = (now: number) => {
      const k = Math.min(1, (now - startedAt) / ms);
      const eased = bezierAt(curve, k);
      draw(next.map((target, i) => from[i] + (target - from[i]) * eased));
      if (k < 1) {
        frameRef.current = window.requestAnimationFrame(step);
      } else {
        currentRef.current = next;
      }
    };
    frameRef.current = window.requestAnimationFrame(step);
  }, [draw, mode, rawToken, reducedMotion, scaledMs]);

  useLoop(advance, scaledMs('--duration-reveal') + 1300);

  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        mode === 'before'
          ? 'Bar chart whose values change instantly'
          : 'Bar chart whose values interpolate over the reveal duration'
      }
      {...stylex.props(sx.canvas)}
    />
  );
}

export default function MotionJsMirrorPage() {
  const {rawToken, springs, scaledMs} = useMotionLab();
  const typeahead = TIMEOUT_LITERALS[0];

  return (
    <LabPage
      title="JS token mirror"
      intro="CSS custom properties are unreadable to every animation library, to the Web Animations API, and to canvas and chart code. Motion takes seconds as a number and easing as a four-number array; it cannot resolve var(--duration-fast). The mirror emits the same values the stylesheets use, in the shape those consumers already expect."
      decides="What the mirror has to expose for charts, canvas and motion libraries."
      badges={<Badge variant="info" label="emitted live from this session" />}>
      <DemoCard
        title="The read that should not have to exist"
        question={`${AUDIT_COUNTS.getComputedStyleReads} getComputedStyle reads across core. Two of them read motion values back out of CSS because there is no other way to get them.`}
        badges={
          <Badge variant="warning" label="MobileNav/MobileNav.tsx:303" />
        }>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — parse the number back out of the stylesheet',
              content: (
                <CodeBlock
                  language="ts"
                  code={BEFORE_CODE}
                  maxHeight={340}
                  isWrapped
                  hasCopyButton={false}
                />
              ),
            },
            {
              tone: 'after',
              label: 'With the mirror',
              content: (
                <CodeBlock
                  language="ts"
                  code={AFTER_CODE}
                  maxHeight={340}
                  isWrapped
                  hasCopyButton={false}
                />
              ),
            },
          ]}
        />
        <DemoBody>
          <Text color="secondary" {...stylex.props(sx.prose)}>
            MobileNav is doing the right thing for the right reason. Its own
            comment says so: the hold is <code>--duration-medium</code>,{' '}
            <q>
              which themes rewrite — the shipped y2k theme sets it to exactly
              250ms — so read the hold in effect rather than assuming it
            </q>
            . Getting that value costs a computed-style read, a 25-line time
            parser exported for its own unit test (
            <code>MobileNav/MobileNav.tsx:265</code>), and a null branch for the
            case where the read comes back as an unresolved <code>var()</code>{' '}
            outside a real browser. That is exactly right, and exactly what
            nobody should have to write by hand.
          </Text>
          <Text color="secondary" {...stylex.props(sx.prose)}>
            The opposite failure — a hardcoded unmount timer drifting away from
            the transition it is supposed to outlast — is the one the brief
            warns about, and the audit does not find it.{' '}
            <code>TIMEOUT_LITERALS</code> holds exactly{' '}
            {TIMEOUT_LITERALS.length} entry:{' '}
            <code>
              {typeahead.file}:{typeahead.line}
            </code>{' '}
            ({typeahead.ms}ms), and it is a typeahead buffer reset, not motion
            at all. So core is currently on the safe side of that trade and
            paying for it in ceremony. The mirror does not fix a bug here; it
            removes the ceremony, and it makes the same number available to code
            that has no stylesheet to read.
          </Text>
          <Card padding={0}>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Read</TableHeaderCell>
                  <TableHeaderCell>What it wants</TableHeaderCell>
                  <TableHeaderCell>Mirror replaces it?</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)}>
                      MobileNav/MobileNav.tsx:303
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text color="secondary">
                      <code>transitionDuration</code>, to time the dialog close
                      inside the hold
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" label="yes" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)}>
                      BottomSheet/BottomSheetPanel.tsx:326
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text color="secondary">
                      <code>transitionProperty</code>,{' '}
                      <code>transitionDuration</code> and{' '}
                      <code>transitionDelay</code>, to know whether a{' '}
                      <code>transitionend</code> will arrive
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning" label="partly" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)}>
                      the other {AUDIT_COUNTS.getComputedStyleReads - 2}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text color="secondary">
                      direction, writing mode, padding, border radius, scroll
                      margin — layout, not motion
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Badge label="not its job" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
          <Text type="supporting" color="secondary">
            Worth saying plainly: {AUDIT_COUNTS.getComputedStyleReads} is the
            whole computed-style caseload, not the motion one. The motion
            argument rests on two sites and on everything that cannot read a
            stylesheet at all — which is the next card.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Charts are outside the token system entirely"
        question="Canvas cannot resolve a custom property. Chart, Radial, Sankey and Schedule therefore animate on whatever numbers their author typed, or they do not animate."
        badges={<Badge variant="neutral" label="live, on a loop" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — data replaces itself',
              content: (
                <VStack gap={2} {...stylex.props(sx.full)}>
                  <ChartPane mode="before" />
                  <Text type="supporting" color="secondary">
                    No token is reachable from here, so the honest default is no
                    animation at all. The chart jumps and the eye loses which
                    bar was which.
                  </Text>
                </VStack>
              ),
            },
            {
              tone: 'after',
              label: 'With the mirror — interpolated on the reveal token',
              content: (
                <VStack gap={2} {...stylex.props(sx.full)}>
                  <ChartPane mode="after" />
                  <Text type="supporting" color="secondary">
                    <code>scaledMs(&apos;--duration-reveal&apos;)</code> and{' '}
                    <code style={{overflowWrap: 'anywhere'}}>
                      bezierAt(parseBezier(rawToken(&apos;--ease-move&apos;)),
                      k)
                    </code>{' '}
                    — the same duration and the same curve the CSS uses, applied
                    per frame.
                  </Text>
                </VStack>
              ),
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            Currently {Math.round(scaledMs('--duration-reveal'))}ms at the
            rail&rsquo;s speed, on <code>{rawToken('--ease-move')}</code>.
            Change either on the tokens page and both this chart and every CSS
            demo in the lab move together — which is the whole claim: one value,
            two consumers.
          </Text>
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>The module, as it stands right now</Heading>
        <Text color="secondary" {...stylex.props(sx.prose)}>
          Emitted from whatever this session has tuned, including springs from
          the springs page. Copy it and it is a working module.
        </Text>
        <CodeBlock
          language="ts"
          title="@astryxdesign/core/motion — generated"
          hasCopyButton
          maxHeight={760}
          code={emitMirror(rawToken, springs)}
        />
      </VStack>

      <Grid columns={{minWidth: 460, max: 2}} gap={4}>
        <DemoCard
          title="Why the defaults are not hardcoded in JS"
          question="Because a theme retunes the whole scale, and a constants file would quietly stop agreeing with the stylesheet.">
          <DemoBody>
            <Text color="secondary" {...stylex.props(sx.prose)}>
              A theme sets three numbers —{' '}
              <code>{'{fast, medium, ratio}'}</code> — and{' '}
              <code>expandMotionScale</code> derives the whole duration scale
              from them; the shipped y2k theme lands{' '}
              <code>--duration-medium</code> on 250ms rather than 410ms. A
              mirror written as literals would be right for the default theme
              and wrong for every other one, which is the failure mode MobileNav
              is already defending against by reading the computed value.
            </Text>
            <Text color="secondary" {...stylex.props(sx.prose)}>
              So the mirror parses the same token values the stylesheets use,
              through the resolver core already has:{' '}
              <code>resolveThemeTokens(theme, {'{mode}'})</code> returns
              concrete strings with <code>var()</code> references already
              followed, and needs no React context and no browser. Springs are
              the exception and are defined in the mirror natively, because they
              have no CSS form to parse.
            </Text>
            <CodeBlock
              language="ts"
              title="How the emitter gets its numbers"
              isWrapped
              code={`import {resolveThemeTokens} from '@astryxdesign/core/theme/tokens';

const tokens = resolveThemeTokens(theme, {mode: 'light'});
duration.overlay = parseMs(tokens['--duration-overlay']) / 1000;
ease.move = parseBezier(tokens['--ease-move']);
// spring.* has no token to read — it is authored here.`}
            />
          </DemoBody>
        </DemoCard>

        <DemoCard
          title="StyleX vars are not the mirror"
          question="Core already exports durationVars and easeVars. They are the right thing for StyleX and useless everywhere else.">
          <DemoBody>
            <CodeBlock
              language="ts"
              code={STYLEX_GAP_CODE}
              isWrapped
              maxHeight={300}
            />
            <Text color="secondary" {...stylex.props(sx.prose)}>
              <code>stylex.defineVars</code> hands back opaque{' '}
              <code>var(...)</code> strings. That is the correct contract for a
              stylesheet and it is precisely the gap: the value never becomes a
              number on the JS side. The mirror is the second half of the same
              token, not a competing source of truth.
            </Text>
          </DemoBody>
        </DemoCard>
      </Grid>

      <Banner
        status="info"
        title="What the mirror does not solve"
        description={
          <Text>
            A second artefact is a second thing to keep in sync. It only stays
            honest if it is generated from the theme in the same build step that
            emits the CSS, and if the lint rule treats a hardcoded number in JS
            the same way it treats one in a stylesheet. Both of those are on{' '}
            <Link href="/pages/motion-lab/export/">Export tuning</Link>.
          </Text>
        }
      />
    </LabPage>
  );
}
