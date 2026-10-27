// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input motionTokens, the lab store, Core components
 * @output The semantic token proposal, tunable
 * @position /motion/tokens
 *
 * The page the rest of the lab depends on: every control here writes a real
 * custom property, so a curve settled on this page is the curve every demo in
 * every other section is already using.
 */

import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
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
  BudgetMeter,
  ComparePanes,
  CurveEditor,
  DemoBody,
  DemoCard,
  Runner,
  TokenSlider,
  isNamedCurve,
} from '../LabPrimitives';
import {useMotionLab} from '../MotionLabStore';
import {
  CURRENT_EASE,
  PRIMITIVE_DURATIONS,
  SEMANTIC_DURATIONS,
  SEMANTIC_EASES,
  STAGGERS,
} from '../motionTokens';
import {HARDCODED_SITES} from '../__generated__/motionAudit';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)'},
  jobRow: {maxWidth: '46ch'},
});

const CURVE_PRESETS = [
  ['ease-out', 'cubic-bezier(0, 0, 0.58, 1)'],
  ['iOS', 'cubic-bezier(0.32, 0.72, 0, 1)'],
  ['expo-out', 'cubic-bezier(0.16, 1, 0.3, 1)'],
] as const;

/** The duration each curve is best judged at — a linear curve needs a long run. */
function previewDuration(easeName: string): string {
  if (easeName === '--ease-linear') {
    return '--duration-continuous';
  }
  if (easeName === '--ease-drawer') {
    return '--duration-overlay';
  }
  if (easeName === '--ease-move') {
    return '--duration-reveal';
  }
  return '--duration-enter';
}

/** Which curve reads best against a given duration, for the duration cards. */
function pairedEase(durationName: string): string {
  switch (durationName) {
    case '--duration-exit':
      return '--ease-exit';
    case '--duration-continuous':
      return '--ease-linear';
    case '--duration-reveal':
      return '--ease-move';
    case '--duration-overlay':
      return '--ease-drawer';
    default:
      return '--ease-entry';
  }
}

export default function MotionTokensPage() {
  const {rawToken, setToken} = useMotionLab();
  const exitCurveSite = HARDCODED_SITES.find(
    s => s.component === 'BottomSheet' && s.value.startsWith('cubic-bezier'),
  );

  return (
    <LabPage
      title="Semantic motion tokens"
      intro="The current scale names sizes. An author choosing between --duration-fast-max and --duration-medium-min is guessing, because neither name says what it is for. The proposal keeps the primitive scale exactly as it is and adds a semantic layer on top, the way colour already works."
      decides="Whether six easings and eight durations are the right vocabulary, and what each value should be."
      badges={
        <Badge variant="info" label="every control writes a real token" />
      }>
      <Banner
        status="info"
        title="One curve is doing three jobs"
        description={
          <Text>
            Core ships exactly one easing token,{' '}
            <code>
              {CURRENT_EASE.name}: {CURRENT_EASE.value}
            </code>
            , and it covers entry, exit and state at once. The codebase has
            already discovered this and worked around it locally — with a
            comment measuring why.
            {exitCurveSite != null && (
              <>
                {' '}
                <code>
                  {exitCurveSite.file}:{exitCurveSite.line}
                </code>{' '}
                authors <code>{exitCurveSite.value}</code> by hand for the
                sheet&rsquo;s exit.
              </>
            )}
          </Text>
        }
      />

      <DemoCard
        title="The same three jobs, one curve and six"
        question="Watch the exit lane. On the standard curve a leaving surface spends its travel immediately and then coasts, which is right for an arrival and wrong for a departure."
        badges={<Badge variant="neutral" label="run at 4× to judge" />}>
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — --ease-standard for all three',
              content: (
                <VStack gap={2} {...stylex.props(sx.full)}>
                  {(
                    [
                      ['Arriving', '--duration-enter'],
                      ['Leaving', '--duration-exit'],
                      ['Moving', '--duration-reveal'],
                    ] as const
                  ).map(([label, duration]) => (
                    <VStack key={label} gap={1} {...stylex.props(sx.full)}>
                      <Text type="supporting" color="secondary">
                        {label}
                      </Text>
                      <Runner
                        durationToken={duration}
                        easeToken="--ease-standard-today"
                      />
                    </VStack>
                  ))}
                </VStack>
              ),
            },
            {
              tone: 'after',
              label: 'Proposed — the curve names the job',
              content: (
                <VStack gap={2} {...stylex.props(sx.full)}>
                  {(
                    [
                      ['Arriving', '--duration-enter', '--ease-entry'],
                      ['Leaving', '--duration-exit', '--ease-exit'],
                      ['Moving', '--duration-reveal', '--ease-move'],
                    ] as const
                  ).map(([label, duration, ease]) => (
                    <VStack key={label} gap={1} {...stylex.props(sx.full)}>
                      <Text type="supporting" color="secondary">
                        {label} — <code>{ease}</code>
                      </Text>
                      <Runner durationToken={duration} easeToken={ease} />
                    </VStack>
                  ))}
                </VStack>
              ),
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            The sheet needed its own curve because the standard one, measured on
            device, “put the sheet half off-screen in 59ms of a 410ms close and
            90% off in 163ms — the travel is over before the eye has followed
            it”. That comment, already in the codebase, is the specification for{' '}
            <code>--ease-exit</code>. Promoting it is not a new idea; it is the
            second time someone has needed it.
          </Text>
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>Easing</Heading>
        <Text color="secondary">
          Drag a control point and every demo in the lab moves with it. Arrow
          keys nudge; hold shift for a bigger step.
        </Text>
        <Grid columns={{minWidth: 420, max: 2}} gap={4}>
          {SEMANTIC_EASES.map(ease => {
            const duration = previewDuration(ease.name);
            const value = rawToken(ease.name);
            return (
              <DemoCard
                key={ease.name}
                title={ease.name}
                question={ease.job}
                badges={
                  isNamedCurve(value) ? (
                    <Badge label="CSS keyword — nothing to tune" />
                  ) : undefined
                }>
                <DemoBody>
                  {!isNamedCurve(value) && (
                    <CurveEditor
                      value={value}
                      onChange={next => setToken(ease.name, next)}
                      presets={[['reset', ease.value], ...CURVE_PRESETS]}
                    />
                  )}
                  <VStack gap={1} {...stylex.props(sx.full)}>
                    <Text type="supporting" color="secondary">
                      today — <code>--ease-standard</code>
                    </Text>
                    <Runner
                      durationToken={duration}
                      easeToken="--ease-standard-today"
                    />
                    <Text type="supporting" color="secondary">
                      proposed — <code>{ease.name}</code>
                    </Text>
                    <Runner durationToken={duration} easeToken={ease.name} />
                  </VStack>
                  <Text
                    type="supporting"
                    color="secondary"
                    {...stylex.props(sx.jobRow)}>
                    {ease.rationale}
                  </Text>
                  {ease.evidence != null && (
                    <Text type="supporting" color="secondary">
                      Already in the code:{' '}
                      <code style={{overflowWrap: 'anywhere'}}>
                        {ease.evidence}
                      </code>
                    </Text>
                  )}
                </DemoBody>
              </DemoCard>
            );
          })}
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Duration</Heading>
        <Text color="secondary">
          Aliases onto the existing primitives, so a theme retunes them for free
          through the motion scale it already has.
        </Text>
        <Grid columns={{minWidth: 380, max: 2}} gap={4}>
          {SEMANTIC_DURATIONS.map(duration => (
            <DemoCard
              key={duration.name}
              title={duration.name}
              question={duration.job}
              badges={
                <Badge
                  label={
                    duration.primitive == null
                      ? 'new'
                      : duration.primitive.replace('--duration-', '')
                  }
                />
              }>
              <DemoBody>
                {duration.ms > 0 && (
                  <>
                    <Runner
                      durationToken={duration.name}
                      easeToken={pairedEase(duration.name)}
                    />
                    <TokenSlider token={duration.name} max={900} />
                    <BudgetMeter token={duration.name} />
                    {duration.budget != null && (
                      <Text type="supporting" color="secondary">
                        Reference budget {duration.budget[0]}–
                        {duration.budget[1]}ms.
                      </Text>
                    )}
                  </>
                )}
                {duration.note != null && (
                  <Text
                    type="supporting"
                    color="secondary"
                    {...stylex.props(sx.jobRow)}>
                    {duration.note}
                  </Text>
                )}
              </DemoBody>
            </DemoCard>
          ))}
        </Grid>
      </VStack>

      <Banner
        status="warning"
        title="The slow band is simultaneously unused and too short"
        description={
          <Text>
            Interface motion should stay under 300ms unless it is an overlay, so{' '}
            <code>--duration-medium-max</code> (550ms) and everything above it
            has no interface use. Meanwhile the components that genuinely need a
            long loop bypass the scale entirely, because it stops at 1300ms:
            StatusDot runs 2s and Chat 1.5s, both hardcoded. Either extend the
            band or say plainly that ambient motion is a separate concern from
            interface motion — but the two loops cannot be swept onto tokens
            until one of those happens.
          </Text>
        }
      />

      <DemoCard
        title="Stagger"
        question="Group entrances want 30–80ms between items. Longer feels slow, and stagger must never block interaction — the last item has to be reachable before it has finished arriving.">
        <DemoBody>
          {STAGGERS.map(([name, , job]) => (
            <VStack key={name} gap={1} {...stylex.props(sx.full)}>
              <HStack gap={2} vAlign="center">
                <Text {...stylex.props(sx.mono)}>{name}</Text>
                <Text type="supporting" color="secondary">
                  {job}
                </Text>
              </HStack>
              <TokenSlider token={name} max={160} step={5} />
            </VStack>
          ))}
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>The primitive scale, unchanged</Heading>
        <Text color="secondary">
          Theme-generated and working. Nothing here moves — the semantic layer
          sits on top, which is what keeps the change non-breaking.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Primitive</TableHeaderCell>
                <TableHeaderCell>Value</TableHeaderCell>
                <TableHeaderCell>Semantic alias</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRIMITIVE_DURATIONS.map(([name, ms]) => {
                const aliases = SEMANTIC_DURATIONS.filter(
                  d => d.primitive === name,
                );
                return (
                  <TableRow key={name}>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)}>{name}</Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)} color="secondary">
                        {ms}ms
                      </Text>
                    </TableCell>
                    <TableCell>
                      {aliases.length > 0 ? (
                        <HStack gap={1} wrap="wrap">
                          {aliases.map(a => (
                            <Badge
                              key={a.name}
                              variant="success"
                              label={a.name}
                            />
                          ))}
                        </HStack>
                      ) : (
                        <Text color="secondary">—</Text>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Where this lands</Heading>
        <Text color="secondary">
          Not a <code>:root</code> block — core defines its tokens through
          StyleX, so the proposal is an addition to two existing objects.
        </Text>
        <CodeBlock
          language="ts"
          title="@astryxdesign/core/src/theme/tokens.stylex.ts"
          hasCopyButton
          code={`export const easeDefaults = {
  '--ease-standard': 'cubic-bezier(0.24, 1, 0.4, 1)', // kept, deprecated in docs
  '--ease-entry': ${JSON.stringify(rawToken('--ease-entry'))},
  '--ease-exit': ${JSON.stringify(rawToken('--ease-exit'))},
  '--ease-move': ${JSON.stringify(rawToken('--ease-move'))},
  '--ease-state': ${JSON.stringify(rawToken('--ease-state'))},
  '--ease-linear': ${JSON.stringify(rawToken('--ease-linear'))},
  '--ease-drawer': ${JSON.stringify(rawToken('--ease-drawer'))},
} as const;

export const durationDefaults = {
  // the nine primitives stay exactly as they are
  ...
  // semantic layer, aliased so a theme retunes both at once
${SEMANTIC_DURATIONS.map(
  d =>
    `  '${d.name}': ${JSON.stringify(rawToken(d.name))},${
      d.primitive != null ? ` // ${d.primitive}` : ''
    }`,
).join('\n')}
} as const;`}
        />
        <Text type="supporting" color="secondary">
          The export page emits this with whatever you have tuned. See{' '}
          <Link href="/pages/motion-lab/export/">Export tuning</Link>.
        </Text>
      </VStack>
    </LabPage>
  );
}
