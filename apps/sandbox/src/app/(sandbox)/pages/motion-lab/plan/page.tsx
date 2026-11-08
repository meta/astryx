// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input openQuestions.ts
 * @output The sequence, what gates each stage, and who has to answer what
 * @position /motion/plan
 *
 * The ordering here is a dependency graph, not a schedule. Most of its edges
 * are decisions: nine of them are still open, and four of those sit above the
 * first stage that would write code.
 */

import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Link as AstryxLink} from '@astryxdesign/core/Link';
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
import {AUDIT_COUNTS} from '../__generated__/motionAudit';
import {DemoBody, DemoCard} from '../LabPrimitives';
import {LabPage} from '../PageFrame';
import {
  BRIEF_DEFECTS,
  COMMITMENTS,
  OPEN_QUESTIONS,
  RISKS,
  STAGES,
  type OpenQuestion,
} from '../openQuestions';

const URGENCY_VARIANT: Record<
  OpenQuestion['urgency'],
  'error' | 'warning' | 'neutral'
> = {
  'decide first': 'error',
  'decide before the sweep': 'warning',
  'decide before publishing': 'warning',
  'can run late': 'neutral',
};

export default function MotionPlanPage() {
  const blocking = OPEN_QUESTIONS.filter(q => q.urgency === 'decide first');
  const committed = COMMITMENTS.filter(c => c.level === 'committed');
  const stretch = COMMITMENTS.filter(c => c.level === 'stretch');

  return (
    <LabPage
      title="Plan & open questions"
      intro="A dependency order for the work, the decisions that gate each stage, and the ones nobody has made yet. Sizes are relative; there are no dates, because the brief has none either."
      badges={
        <Badge
          variant="warning"
          label={`${OPEN_QUESTIONS.length} open questions`}
        />
      }
      decides="Sequence, gates, and who has to answer what.">
      <Banner
        status="warning"
        title={`${blocking.length} decisions sit above the first line of code`}
        description={
          <Text>
            Springs in the theme contract and the mobile-token vocabulary both
            change the shape of the token contract, and both are breaking
            changes if they arrive after Foundation ships. Everything else can
            be decided while work runs — these two cannot.
          </Text>
        }
      />

      <VStack gap={3}>
        <Heading level={2}>Sequence</Heading>
        <Text color="secondary">
          Each stage lists what blocks it. A stage whose gate is still open does
          not start early; it starts twice.
        </Text>
        {STAGES.map(stage => (
          <DemoCard
            key={stage.id}
            title={`${stage.index}. ${stage.name}`}
            question={stage.goal}
            badges={<Badge label={stage.size} />}>
            <DemoBody>
              <VStack gap={1}>
                {stage.work.map((item, i) => (
                  <Text key={item} color="secondary">
                    {`${i + 1}. ${item}`}
                  </Text>
                ))}
              </VStack>
              {stage.blockedBy.length > 0 ? (
                <VStack gap={1.5}>
                  {stage.blockedBy.map(gate => (
                    <HStack key={gate} gap={2} vAlign="center" wrap="wrap">
                      <Badge variant="error" label="gate" />
                      <Text type="supporting" color="secondary">
                        {gate}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              ) : (
                <HStack gap={2} vAlign="center">
                  <Badge variant="success" label="unblocked" />
                  <Text type="supporting" color="secondary">
                    Nothing blocks this. It is the only stage that can start
                    today.
                  </Text>
                </HStack>
              )}
            </DemoBody>
          </DemoCard>
        ))}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Scope discipline</Heading>
        <Banner
          status="error"
          title="Do not combine token retuning, presence architecture and component remediation in one rollout"
          description={
            <Text>
              All three move the visual-regression baselines. Rolled out
              separately, a failure is attributable: a baseline moved because a
              curve changed, or because a surface now animates out, or because a
              component was rewritten. Rolled out together, every failure is a
              bisect, and the bisect is across a quarter of work. This is also
              why Foundation ships tokens as aliases before it retunes a single
              value — the alias step is provably invisible, so anything the
              capture catches afterwards belongs to the retune.
            </Text>
          }
        />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Open questions</Heading>
        <Text color="secondary">
          Each one names what it needs, what it blocks, and where in the lab you
          can look at it instead of arguing about it.
        </Text>
        {OPEN_QUESTIONS.map(question => (
          <Card key={question.id} padding={4}>
            <VStack gap={2}>
              <HStack gap={2} vAlign="center" wrap="wrap" justify="between">
                <Text weight="semibold">{question.question}</Text>
                <Badge
                  variant={URGENCY_VARIANT[question.urgency]}
                  label={question.urgency}
                />
              </HStack>
              <Grid columns={{minWidth: 260}} gap={3}>
                <VStack gap={1}>
                  <Text type="label" weight="semibold">
                    Needs
                  </Text>
                  <Text type="supporting" color="secondary">
                    {question.needs}
                  </Text>
                </VStack>
                <VStack gap={1}>
                  <Text type="label" weight="semibold">
                    Blocks
                  </Text>
                  <Text type="supporting" color="secondary">
                    {question.blocks}
                  </Text>
                </VStack>
              </Grid>
              <AstryxLink href={question.href}>{question.hrefLabel}</AstryxLink>
            </VStack>
          </Card>
        ))}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Committed and stretch</Heading>
        <Text color="secondary">
          {`Committed is what should be true at the end of H2 whatever else slips: ${committed.length} items. Stretch is ${stretch.length} more that are worth doing and safe to drop, because nothing in the committed list depends on them.`}
        </Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Level</TableHeaderCell>
                <TableHeaderCell>Why</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMMITMENTS.map(item => (
                <TableRow key={item.item}>
                  <TableCell>
                    <Text weight="semibold">{item.item}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.level === 'committed' ? 'success' : 'neutral'
                      }
                      label={item.level}
                    />
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {item.why}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Risks</Heading>
        <Text color="secondary">
          The brief&rsquo;s six, and what the lab does about each. One of them
          the lab cannot help with at all, which is worth saying out loud.
        </Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Risk</TableHeaderCell>
                <TableHeaderCell>What the lab does about it</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RISKS.map(risk => (
                <TableRow key={risk.risk}>
                  <TableCell>
                    <Text>{risk.risk}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {risk.mitigation}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Defects in the brief itself</Heading>
        <Text color="secondary">
          {`Found while building the lab, alongside the measurement corrections on the overview — the sweep is ${AUDIT_COUNTS.hardcodedTotal} sites rather than 28, and the transform blocker is ${AUDIT_COUNTS.transformTransitions} sites rather than "20+".`}
        </Text>
        <Grid columns={{minWidth: 300}} gap={3}>
          {BRIEF_DEFECTS.map(defect => (
            <Card key={defect.defect} padding={4}>
              <VStack gap={1.5}>
                <Text weight="semibold">{defect.defect}</Text>
                <Text type="supporting" color="secondary">
                  {defect.detail}
                </Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      </VStack>
    </LabPage>
  );
}
