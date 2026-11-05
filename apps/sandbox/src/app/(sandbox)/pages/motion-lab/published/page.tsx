// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input GUIDANCE_CONFLICTS and PUBLISHED_SECTIONS
 * @output The proposal beside what astryx.atmeta.com/docs/motion tells authors
 * @position /motion/published
 *
 * The exit gap and the delete-don't-degrade behaviour are both documented
 * guidance, correctly followed. That makes two of the proposals policy
 * reversals rather than bug fixes, which changes who has to sign them off and
 * what has to ship in the same stack. Every card here is one conflict; nothing
 * on the page is written by hand except the reading of it.
 */

import {Badge} from '@astryxdesign/core/Badge';
import * as stylex from '@stylexjs/stylex';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
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
import type {ReactNode} from 'react';
import {ComparePanes, DemoCard} from '../LabPrimitives';
import {LayerRig, LoopRig} from '../LabDemos';
import {LabPage} from '../PageFrame';
import {
  CORRECTED_EXIT_RULE,
  GUIDANCE_CONFLICTS,
  SOURCES,
  PUBLISHED_PAGE_URL,
  PUBLISHED_SECTIONS,
  type GuidanceConflict,
} from '../publishedGuidance';

const sx = stylex.create({
  quote: {
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
    paddingInlineStart: '12px',
    maxWidth: '62ch',
  },
});

type Severity = GuidanceConflict['severity'];

const SEVERITY: Record<
  Severity,
  {
    readonly variant: 'error' | 'warning' | 'success';
    readonly question: string;
  }
> = {
  reversal: {
    variant: 'error',
    question:
      'Two documents give opposite instructions. One of them has to move first.',
  },
  overreach: {
    variant: 'warning',
    question:
      'The proposal claims more than its own cited sources support, and the published text sits closer to them. Narrow the proposal rather than rewriting the page.',
  },
  extension: {
    variant: 'warning',
    question:
      'The page is not wrong, it is incomplete. Does the proposal extend it or replace it?',
  },
  aligned: {
    variant: 'success',
    question:
      'No conflict. Can the rubric cite this paragraph instead of re-arguing it?',
  },
};

/** `exit-optional` -> `Exit optional`. The data carries no title, so derive one. */
function titleOf(id: string): string {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Only two conflicts can be settled by looking rather than reading, and both
 * are the reversals. The rest are arguments about wording.
 */
function demoFor(id: string, tone: 'before' | 'after'): ReactNode {
  if (id === 'exit-optional') {
    return tone === 'before' ? (
      <LayerRig mode="before" label="Tooltip content" triggerLabel="Hover me" />
    ) : (
      <LayerRig mode="after" label="Tooltip content" triggerLabel="Hover me" />
    );
  }
  if (id === 'reduced-motion-delete') {
    return tone === 'before' ? (
      <LoopRig policy="delete" />
    ) : (
      <LoopRig policy="degrade" />
    );
  }
  return null;
}

function Quote({text, demo}: {text: string; demo: ReactNode}) {
  return (
    <VStack gap={3}>
      <Card padding={3}>
        <Text>{`\u201C${text}\u201D`}</Text>
      </Card>
      {demo}
    </VStack>
  );
}

export default function PublishedGuidancePage() {
  const reversals = GUIDANCE_CONFLICTS.filter(c => c.severity === 'reversal');
  const extensions = GUIDANCE_CONFLICTS.filter(c => c.severity === 'extension');
  const aligned = GUIDANCE_CONFLICTS.filter(c => c.severity === 'aligned');
  const rewriteSections = new Set(reversals.map(c => c.section));
  const noted = PUBLISHED_SECTIONS.filter(s => s.stale != null);

  return (
    <LabPage
      title="Against the published page"
      intro="Every proposal in the brief, beside the paragraph of astryx.atmeta.com/docs/motion it lands on. Quotes are verbatim, so this page can be diffed against the live one."
      badges={<Badge variant="error" label={`${reversals.length} reversals`} />}
      decides="Which proposals are bug fixes, which are reversals of published guidance, and which overreach their own sources.">
      <Banner
        status="error"
        title={`${reversals.length} of the ${GUIDANCE_CONFLICTS.length} conflicts reverse published guidance`}
        description={
          <Text>
            The brief reads the exit gap as historical accident. It is not: the
            published Movement Principles tell authors that tooltips, hover
            cards and dropdown menus may disappear instantly, and Respecting
            User Preferences tells them to replace animation with instant state
            changes. Those two proposals are{' '}
            <strong>policy changes, not bug fixes</strong> — they need a
            decision and an owner rather than a diff. The doc rewrite has to
            ship in the same stack as the code, or the rubric starts failing
            components for doing what the docs still tell the next author to do.
          </Text>
        }
        endContent={
          <AstryxLink
            href={PUBLISHED_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer">
            Read the live page
          </AstryxLink>
        }
      />

      <HStack gap={2} wrap="wrap">
        <Badge variant="error" label={`${reversals.length} reversals`} />
        <Badge variant="warning" label={`${extensions.length} extensions`} />
        <Badge variant="success" label={`${aligned.length} aligned`} />
        <Text type="supporting" color="secondary">
          Severity is about the document, not the code: a reversal means the
          published page has to change before the proposal is legitimate.
        </Text>
      </HStack>

      {GUIDANCE_CONFLICTS.map(conflict => (
        <DemoCard
          key={conflict.id}
          title={titleOf(conflict.id)}
          question={SEVERITY[conflict.severity].question}
          badges={
            <>
              <Badge
                variant={SEVERITY[conflict.severity].variant}
                label={conflict.severity}
              />
              <Badge label={conflict.section} />
            </>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              label="See it in the lab"
              href={conflict.href}
            />
          }
          controls={
            <VStack gap={3}>
              <VStack gap={1}>
                <Text type="label" weight="semibold">
                  Reading
                </Text>
                <Text color="secondary">{conflict.reading}</Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" weight="semibold">
                  Resolution
                </Text>
                <Text color="secondary">{conflict.resolution}</Text>
              </VStack>
            </VStack>
          }>
          <ComparePanes
            panes={[
              {
                tone: 'before',
                label: `Published today — ${conflict.section}`,
                content: (
                  <Quote
                    text={conflict.published}
                    demo={demoFor(conflict.id, 'before')}
                  />
                ),
              },
              {
                tone: 'after',
                label: 'Proposed in the brief',
                content: (
                  <Quote
                    text={conflict.proposed}
                    demo={demoFor(conflict.id, 'after')}
                  />
                ),
              },
            ]}
          />
        </DemoCard>
      ))}

      <VStack gap={3}>
        <Heading level={2}>Where the exit rules come from</Heading>
        <Text color="secondary">
          Two of the conflicts above are marked <em>overreach</em> rather than{' '}
          <em>reversal</em>, which is a claim about evidence and so it should
          show its working. The brief cites Emil Kowalski&rsquo;s animation
          guidance and beUI as references, so those are the standard it can be
          held to. Read against them the word &ldquo;exit&rdquo; comes apart
          into two rules with very different support.
        </Text>
        <VStack gap={4}>
          {SOURCES.map(entry => (
            <Card key={entry.claim} variant="muted">
              <VStack gap={2}>
                <Text weight="semibold">{entry.claim}</Text>
                {entry.support.map(sup => (
                  <VStack key={sup.source} gap={0.5}>
                    <Text type="supporting" color="secondary">
                      {sup.source}
                    </Text>
                    <Text {...stylex.props(sx.quote)}>
                      <em>&ldquo;{sup.says}&rdquo;</em>
                    </Text>
                  </VStack>
                ))}
                <Text type="supporting">{entry.verdict}</Text>
              </VStack>
            </Card>
          ))}
        </VStack>
        <Banner
          status="success"
          title="The rule the sources actually support"
          description={<Text>{CORRECTED_EXIT_RULE}</Text>}
          endContent={
            <AstryxLink href="/pages/motion-lab/exit-gap/">
              Which surfaces that covers
            </AstryxLink>
          }
        />

        <Heading level={2}>Scope of the doc rewrite</Heading>
        <Text color="secondary">
          {`${noted.length} of the ${PUBLISHED_SECTIONS.length} sections of the live page need something. Two of them are the reversals above and cannot be deferred: the rubric has no authority while the page contradicts it. The rest are additions — the page is accurate about what exists, and silent about how to choose.`}
        </Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Section</TableHeaderCell>
                <TableHeaderCell>What it says today</TableHeaderCell>
                <TableHeaderCell>Scope</TableHeaderCell>
                <TableHeaderCell>Note</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PUBLISHED_SECTIONS.map(section => {
                const isRewrite = rewriteSections.has(section.title);
                return (
                  <TableRow key={section.title}>
                    <TableCell>
                      <Text weight="semibold">{section.title}</Text>
                    </TableCell>
                    <TableCell>
                      <Text type="supporting" color="secondary">
                        {section.summary}
                      </Text>
                    </TableCell>
                    <TableCell>
                      {isRewrite ? (
                        <Badge variant="error" label="Rewrite" />
                      ) : section.stale != null ? (
                        <Badge variant="warning" label="Add to" />
                      ) : (
                        <Badge label="No change" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Text type="supporting" color="secondary">
                        {section.stale ?? '\u2014'}
                      </Text>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <Text type="supporting" color="secondary">
        The rewrite is a deliverable in the brief already, listed last. On this
        reading it is a gate on the rubric rather than a write-up of work
        already done, which moves it earlier in the sequence than the timeline
        has it.
      </Text>
    </LabPage>
  );
}
