// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input rubric.ts, the generated audit, the published guidance
 * @output The rubric as a bench: every criterion with a pass and a fail running
 * @position /motion/rubric
 *
 * A rubric that is only a table gets read once and then argued about from
 * memory. Every criterion here that can be shown is shown, so "the exit is on
 * the wrong curve" is something you look at rather than something you take on
 * trust.
 */

import {
  COST_EVIDENCE,
  COST_LABEL,
  COST_RULE,
  COST_SUMMARY,
  COST_VARIANT,
  LOOP_INVENTORY,
} from '../motionCost';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
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
  DemoBody,
  DemoCard,
  Runner,
  TokenSlider,
} from '../LabPrimitives';
import {
  CheckTickRig,
  InterruptRig,
  LayerRig,
  LoopRig,
  OriginRig,
  OutlineMarkerRig,
  PressRig,
} from '../LabDemos';
import {
  AUDIT_COUNTS,
  HARDCODED_SITES,
  NO_REDUCED_MOTION,
  TRANSFORM_TRANSITIONS,
} from '../__generated__/motionAudit';
import {
  AUTOMATABLE_LABEL,
  GRANDFATHERING,
  MISSING_PRINCIPLE,
  PASS_BAR,
  RUBRIC_CRITERIA,
  SEVERITY_LABEL,
  SEVERITY_RULES,
  type Automatable,
  type Criterion,
  type Severity,
} from '../rubric';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)', fontSize: '12px'},
  verdict: {
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
    paddingInlineStart: '10px',
  },
  pass: {borderInlineStartColor: 'var(--color-background-success, #3f9a6b)'},
  fail: {borderInlineStartColor: 'var(--color-background-error, #d3543f)'},
  quote: {
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
    paddingInlineStart: '12px',
    maxWidth: '64ch',
  },
});

const SEVERITY_VARIANT: Readonly<
  Record<Severity, 'error' | 'warning' | 'neutral'>
> = {
  blocker: 'error',
  'should-fix': 'warning',
  polish: 'neutral',
};

const AUTOMATABLE_VARIANT: Readonly<
  Record<Automatable, 'success' | 'info' | 'neutral'>
> = {
  yes: 'success',
  partly: 'info',
  no: 'neutral',
};

/** Only the criteria that can be watched get a rig; the rest say why not. */
function demoFor(id: string): ReactNode {
  switch (id) {
    case 'frequency':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label:
                'Fails — a tick that draws itself, on a control used forty times in a form',
              content: <CheckTickRig technique="draw" />,
            },
            {
              tone: 'after',
              label: 'Passes — instant, because this is a 100+/day interaction',
              content: <CheckTickRig technique="hard" />,
            },
          ]}
        />
      );
    case 'semantic':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails — exit duration on the entry curve',
              content: (
                <Runner
                  durationToken="--duration-exit"
                  easeToken="--ease-entry"
                />
              ),
            },
            {
              tone: 'after',
              label: 'Passes — exit duration on the exit curve',
              content: (
                <Runner
                  durationToken="--duration-exit"
                  easeToken="--ease-exit"
                />
              ),
            },
          ]}
        />
      );
    case 'budget':
      return (
        <DemoBody>
          <Runner durationToken="--duration-enter" easeToken="--ease-entry" />
          <TokenSlider
            token="--duration-enter"
            label="--duration-enter"
            min={0}
            max={900}
          />
          <BudgetMeter token="--duration-enter" />
        </DemoBody>
      );
    case 'compositor':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails — animates top and height',
              content: <OutlineMarkerRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Passes — transform only',
              content: <OutlineMarkerRig mode="after" />,
            },
          ]}
        />
      );
    case 'presence':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails the criterion — and follows the published page',
              content: (
                <LayerRig
                  mode="before"
                  label="No exit at all"
                  triggerLabel="Hover me"
                />
              ),
            },
            {
              tone: 'after',
              label: 'Passes — exit retraces the entry, faster',
              content: (
                <LayerRig
                  mode="after"
                  label="Exits on --duration-exit"
                  triggerLabel="Hover me"
                />
              ),
            },
          ]}
        />
      );
    case 'origin':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails — scale(0)',
              content: <OriginRig kind="zero" />,
            },
            {
              tone: 'neutral',
              label: 'Half right — 0.94, wrong origin',
              content: <OriginRig kind="centre" />,
            },
            {
              tone: 'after',
              label: 'Passes — anchored to the trigger',
              content: <OriginRig kind="anchored" />,
            },
          ]}
        />
      );
    case 'interruptible':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails — a keyframe restarts from zero',
              content: <InterruptRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Passes — a transition retargets',
              content: <InterruptRig mode="after" />,
            },
          ]}
        />
      );
    case 'reduced-motion':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — loops slow to 3s',
              content: <LoopRig policy="today" />,
            },
            {
              tone: 'neutral',
              label: 'Delete — what the published page says',
              content: <LoopRig policy="delete" />,
            },
            {
              tone: 'after',
              label: 'Degrade — what the criterion says',
              content: <LoopRig policy="degrade" />,
            },
          ]}
        />
      );
    case 'library':
      return (
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Fails — transition on transform',
              content: <PressRig technique="transform" />,
            },
            {
              tone: 'after',
              label: 'Passes — press on the scale property',
              content: <PressRig technique="scale" />,
            },
          ]}
        />
      );
    default:
      return null;
  }
}

function Verdict({
  tone,
  label,
  text,
}: {
  tone: 'pass' | 'fail';
  label: string;
  text: string;
}) {
  return (
    <VStack
      gap={0.5}
      {...stylex.props(sx.verdict, tone === 'pass' ? sx.pass : sx.fail)}>
      <Text type="supporting" weight="semibold">
        {label}
      </Text>
      <Text type="supporting" color="secondary">
        {text}
      </Text>
    </VStack>
  );
}

function CriterionCard({criterion}: {criterion: Criterion}) {
  const demo = demoFor(criterion.id);
  return (
    <DemoCard
      title={`${criterion.n}. ${criterion.title}`}
      question={criterion.rule}
      badges={
        <>
          <Badge
            variant={SEVERITY_VARIANT[criterion.severity]}
            label={SEVERITY_LABEL[criterion.severity]}
          />
          <Badge
            variant={AUTOMATABLE_VARIANT[criterion.automatable]}
            label={AUTOMATABLE_LABEL[criterion.automatable]}
          />
          {criterion.guidance === 'reversal' && (
            <Badge variant="error" label="Reverses published guidance" />
          )}
          {criterion.guidance === 'overreach' && (
            <Badge variant="warning" label="Narrowed to fit its sources" />
          )}
          {criterion.guidance === 'aligned' && (
            <Badge variant="success" label="Already published" />
          )}
        </>
      }>
      <DemoBody>
        <Grid columns={{minWidth: 260}} gap={3}>
          <Verdict tone="pass" label="Passes" text={criterion.pass} />
          <Verdict tone="fail" label="Fails" text={criterion.fail} />
        </Grid>
        <Text type="supporting" color="secondary">
          <strong>Checked by: </strong>
          {criterion.check}
          {criterion.severityNote != null ? ` ${criterion.severityNote}` : ''}
        </Text>
        {criterion.evidence != null && (
          <Text type="supporting" color="secondary">
            <strong>Measured: </strong>
            {criterion.evidence}
          </Text>
        )}
        {criterion.contradictionNote != null && (
          <Text type="supporting" color="secondary">
            <strong>Pulls against criterion {criterion.contradicts}: </strong>
            {criterion.contradictionNote}
          </Text>
        )}
        {criterion.guidanceNote != null && (
          <Text type="supporting" color="secondary">
            <strong>
              {criterion.guidance === 'reversal'
                ? 'Contradicts the published Motion page: '
                : criterion.guidance === 'overreach'
                  ? 'Claimed more than its sources support: '
                  : 'Cites the published Motion page: '}
            </strong>
            {criterion.guidanceNote}{' '}
            <Link href="/pages/motion-lab/published/">See the conflicts</Link>
          </Text>
        )}
      </DemoBody>
      {demo}
    </DemoCard>
  );
}

/** The reduced-motion worklist, collapsed to components so it fits on a card. */
const REDUCED_BY_COMPONENT = [
  ...NO_REDUCED_MOTION.reduce((acc, row) => {
    acc.set(row.component, (acc.get(row.component) ?? 0) + 1);
    return acc;
  }, new Map<string, number>()),
].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const MULTI_PROPERTY_TRANSFORMS = TRANSFORM_TRANSITIONS.filter(
  site => site.decl?.includes(',') === true,
).length;

const INSTANT_ESCAPES = HARDCODED_SITES.filter(
  site => site.value === '0.01s',
).length;

const TABLE_TINTS = HARDCODED_SITES.filter(
  site => site.value === '150ms' && site.component === 'Table',
).length;

export default function MotionRubricPage() {
  const mechanical = RUBRIC_CRITERIA.filter(c => c.automatable === 'yes');
  const blockers = RUBRIC_CRITERIA.filter(c => c.severity === 'blocker');
  const reversals = RUBRIC_CRITERIA.filter(c => c.guidance === 'reversal');

  return (
    <LabPage
      title="Rubric bench"
      intro="Twelve criteria, each with a pass and a fail you can watch. Astryx already gates lab-to-core promotion on an accessibility checklist; motion works the same way or it does not work at all — published, graded per component, tracked."
      badges={
        <Badge variant="info" label={`${RUBRIC_CRITERIA.length} criteria`} />
      }
      decides="Whether each criterion is checkable, and what a pass and a fail look like.">
      <Banner
        status="warning"
        title="The brief says ten graded criteria. Its own table has twelve."
        description={
          <Text>
            Twelve is what the table describes and twelve is what is graded
            here. Fix the number in Deliverables before publication — a count in
            a deliverable is the thing that gets quoted back in a review, and
            nobody recounts the table. Criteria{' '}
            {reversals.map(c => c.n).join(' and ')} reverse guidance the
            published Motion page gives today, so the rubric cannot gate on
            either until that page is rewritten.
          </Text>
        }
        endContent={
          <Link href="/pages/motion-lab/published/">The conflicts</Link>
        }
      />

      <VStack gap={3}>
        <Heading level={2}>How it grades</Heading>
        <Text color="secondary">{PASS_BAR}</Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Severity</TableHeaderCell>
                <TableHeaderCell>What it means</TableHeaderCell>
                <TableHeaderCell>Effect on the gate</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SEVERITY_RULES.map(row => (
                <TableRow key={row.severity}>
                  <TableCell>
                    <Badge
                      variant={SEVERITY_VARIANT[row.severity]}
                      label={SEVERITY_LABEL[row.severity]}
                    />
                  </TableCell>
                  <TableCell>
                    <Text type="supporting">{row.meaning}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.gate}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Text type="supporting" color="secondary">
          Blockers: {blockers.length} of {RUBRIC_CRITERIA.length}. Mechanical
          today: {mechanical.length}. A component with two open should-fix items
          still passes; a third stops it, which is what keeps the second one
          from becoming permanent.
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>The thirteen</Heading>
        {RUBRIC_CRITERIA.map(criterion => (
          <CriterionCard key={criterion.id} criterion={criterion} />
        ))}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>What the rubric would have caught</Heading>
        <Text color="secondary">
          Measured against <code>@astryxdesign/core</code> by the audit script,
          not read out of the brief. These are the rows a reviewer would have
          been handed on the day the component landed.
        </Text>

        <DemoCard
          title="Criterion 6 — compositor-only"
          question={`${AUDIT_COUNTS.transformTransitions} transform transitions across ${AUDIT_COUNTS.transformTransitionComponents} components. Every one of them is also a criterion-12 finding.`}>
          <DemoBody>
            <Card padding={0}>
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Site</TableHeaderCell>
                    <TableHeaderCell>Declaration</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TRANSFORM_TRANSITIONS.slice(0, 6).map(site => (
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
            <Text type="supporting" color="secondary">
              {MULTI_PROPERTY_TRANSFORMS} of these declare{' '}
              <code>transform</code> inside a longer property list rather than
              on its own, so a grep for{' '}
              <code>transitionProperty: &lsquo;transform&rsquo;</code> finds
              barely half of them. That is worth knowing before anyone scopes
              criterion 12 from a search —{' '}
              <Link href="/pages/motion-lab/bugs/">
                the bugs page has the whole list
              </Link>
              , and the count has already moved twice as the scanner improved.
            </Text>
          </DemoBody>
        </DemoCard>

        <DemoCard
          title="Criterion 10 — reduced motion"
          question={`${AUDIT_COUNTS.filesWithoutReducedMotion} of ${AUDIT_COUNTS.animatedFiles} animated files have no reduced-motion branch. This is the sweep.`}>
          <DemoBody>
            <Card padding={0}>
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Component</TableHeaderCell>
                    <TableHeaderCell>Files with no branch</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {REDUCED_BY_COMPONENT.slice(0, 6).map(
                    ([component, count]) => (
                      <TableRow key={component}>
                        <TableCell>
                          <Text>{component}</Text>
                        </TableCell>
                        <TableCell>
                          <Text {...stylex.props(sx.mono)} color="secondary">
                            {count}
                          </Text>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </Card>
            <Text type="supporting" color="secondary">
              Table alone accounts for {REDUCED_BY_COMPONENT[0]?.[1]} of the{' '}
              {AUDIT_COUNTS.filesWithoutReducedMotion}.{' '}
              <Link href="/pages/motion-lab/reduced-motion/">
                The full worklist is on the reduced-motion page
              </Link>
              , where it also has to wait on degrade-or-delete: the sweep writes
              whichever answer wins {AUDIT_COUNTS.filesWithoutReducedMotion}{' '}
              times.
            </Text>
          </DemoBody>
        </DemoCard>

        <DemoCard
          title="Criterion 3 — token fidelity"
          question={`${AUDIT_COUNTS.hardcodedTotal} hardcoded values: ${AUDIT_COUNTS.hardcodedDuration} durations, ${AUDIT_COUNTS.hardcodedEasing} curves. The brief budgeted for 28.`}>
          <DemoBody>
            <Card padding={0}>
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Site</TableHeaderCell>
                    <TableHeaderCell>Property</TableHeaderCell>
                    <TableHeaderCell>Value</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    'Table/plugins/columnResize/useTableColumnResize.tsx',
                    'BottomSheet/BottomSheetPanel.tsx',
                    'StatusDot/StatusDot.tsx',
                    'Chat/ChatMessageMetadata.tsx',
                    'hooks/useKeyboardHint.tsx',
                    'Button/Button.tsx',
                  ]
                    .map(file =>
                      HARDCODED_SITES.find(site => site.file === file),
                    )
                    .filter(
                      (site): site is (typeof HARDCODED_SITES)[number] =>
                        site != null,
                    )
                    .map(site => (
                      <TableRow key={`${site.file}:${site.line}:${site.prop}`}>
                        <TableCell>
                          <Text
                            {...stylex.props(
                              sx.mono,
                            )}>{`${site.file}:${site.line}`}</Text>
                        </TableCell>
                        <TableCell>
                          <Text {...stylex.props(sx.mono)} color="secondary">
                            {site.prop}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Text {...stylex.props(sx.mono)}>{site.value}</Text>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Card>
            <Text type="supporting" color="secondary">
              Not all of them are carelessness: {INSTANT_ESCAPES} are the{' '}
              <code>0.01s</code> reduced-motion escape and {TABLE_TINTS} are the
              same 150ms tint in Table. The rubric would have caught every one
              at review time, which is the argument for the lint rule rather
              than the sweep.
            </Text>
          </DemoBody>
        </DemoCard>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Automatable?</Heading>
        <Text color="secondary">
          {mechanical.length} of {RUBRIC_CRITERIA.length} are mechanical today —{' '}
          {mechanical.map(c => c.n).join(', ')}. Five more can be narrowed by
          lint to a question a reviewer answers in one line. Three are judgement
          and always will be.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>#</TableHeaderCell>
                <TableHeaderCell>Criterion</TableHeaderCell>
                <TableHeaderCell>Automatable</TableHeaderCell>
                <TableHeaderCell>What checks it</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RUBRIC_CRITERIA.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {c.n}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text weight="semibold">{c.title}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={AUTOMATABLE_VARIANT[c.automatable]}
                      label={AUTOMATABLE_LABEL[c.automatable]}
                    />
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {c.check}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Grandfathering</Heading>
        <Text color="secondary">
          The rubric is worth nothing if it fails 48 animating components on the
          day it lands, and worth nothing if it never fails anything. This is
          the split.
        </Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Situation</TableHeaderCell>
                <TableHeaderCell>Rule</TableHeaderCell>
                <TableHeaderCell>Why</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GRANDFATHERING.map(row => (
                <TableRow key={row.situation}>
                  <TableCell>
                    <Text weight="semibold">{row.situation}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting">{row.rule}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.why}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Every loop in the system, and what it costs</Heading>
        <Text color="secondary">{COST_SUMMARY}</Text>
        <Banner
          status="info"
          title="Why a loop gets its own criterion"
          description={
            <VStack gap={2}>
              <Text>{COST_RULE}</Text>
              <Text type="supporting" color="secondary">
                {COST_EVIDENCE}
              </Text>
            </VStack>
          }
        />
        <Table density="balanced">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Loop</TableHeaderCell>
              <TableHeaderCell>Animates</TableHeaderCell>
              <TableHeaderCell>Contained</TableHeaderCell>
              <TableHeaderCell>Reduced-motion arm</TableHeaderCell>
              <TableHeaderCell>Idle cost</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LOOP_INVENTORY.map(loop => (
              <TableRow key={`${loop.where}-${loop.component}`}>
                <TableCell>
                  <VStack gap={0.5}>
                    <Text weight="semibold">{loop.component}</Text>
                    <Text type="supporting" color="secondary">
                      {loop.file}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {loop.note}
                    </Text>
                  </VStack>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={loop.compositorSafe ? 'success' : 'error'}
                    label={loop.animates}
                  />
                </TableCell>
                <TableCell>{loop.contained ? 'yes' : 'no'}</TableCell>
                <TableCell>{loop.hasReducedMotionArm ? 'yes' : 'no'}</TableCell>
                <TableCell>
                  <Badge
                    variant={COST_VARIANT[loop.cost]}
                    label={COST_LABEL[loop.cost]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Heading level={2}>A principle the rubric drops</Heading>
        <Card padding={4}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text weight="semibold">{MISSING_PRINCIPLE.title}</Text>
              <Badge variant="warning" label="Published, ungraded" />
            </HStack>
            <VStack gap={1} {...stylex.props(sx.quote)}>
              <Text type="supporting" color="secondary">
                &ldquo;{MISSING_PRINCIPLE.published}&rdquo;
              </Text>
            </VStack>
            <Text type="supporting">{MISSING_PRINCIPLE.gap}</Text>
            <Text type="supporting" color="secondary">
              {MISSING_PRINCIPLE.measuredAgainst}
            </Text>
            <Text type="supporting">
              <strong>Recommendation: </strong>
              {MISSING_PRINCIPLE.recommendation}
            </Text>
            <Text type="supporting" color="secondary">
              <Link href="/pages/motion-lab/published/">
                The published page against the proposal, conflict by conflict
              </Link>
            </Text>
          </VStack>
        </Card>
      </VStack>
    </LabPage>
  );
}
