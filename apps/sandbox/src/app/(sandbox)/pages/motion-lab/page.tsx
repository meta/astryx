// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Generated audit, brief figures, section registry
 * @output The Motion Lab overview
 * @position /motion
 *
 * Opens on the disagreement between the brief and the code rather than on the
 * brief's numbers, because that is the first thing anyone acting on this needs
 * to know: the audit was written against a reading of the repo, and the repo
 * says something slightly different in several places.
 */

import * as stylex from '@stylexjs/stylex';
import Link from '../../../../router';
import {Banner} from '@astryxdesign/core/Banner';
import {Badge} from '@astryxdesign/core/Badge';
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
import {AUDIT_COUNTS, CORE_VERSION} from './__generated__/motionAudit';
import {GUIDANCE_CONFLICTS, PUBLISHED_PAGE_URL} from './publishedGuidance';
import {MOTION_SECTIONS} from './sections';
import {LabPage} from './PageFrame';

const sx = stylex.create({
  stat: {padding: '14px'},
  statValue: {
    fontSize: '26px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  bad: {color: 'var(--color-text-error, #d3543f)'},
  warn: {color: 'var(--color-text-warning, #b3760a)'},
  full: {width: '100%'},
  cardLink: {textDecoration: 'none', color: 'inherit', display: 'block'},
});

/**
 * The brief's figures beside the measured ones. Rows only appear here when
 * they differ — a table of agreements would bury the four that matter.
 */
const RECONCILIATION: ReadonlyArray<{
  readonly measure: string;
  readonly brief: string;
  readonly measured: string;
  readonly reading: string;
}> = [
  {
    measure: 'Component directories',
    brief: '107 (90 core, 17 lab)',
    measured: `${AUDIT_COUNTS.componentDirs} (${AUDIT_COUNTS.coreComponentDirs} core, ${AUDIT_COUNTS.labComponentDirs} lab)`,
    reading:
      'Lab matches exactly. Core is higher than the brief\u2019s 90 — the split it quotes is close but not current.',
  },
  {
    measure: 'Animate something',
    brief: '63',
    measured: String(AUDIT_COUNTS.animatingComponents),
    reading:
      'Counted as component directories with at least one transition, animation or keyframe. The brief counted across core and lab together.',
  },
  {
    measure: 'Hardcoded duration / easing',
    brief: '28',
    measured: String(AUDIT_COUNTS.hardcodedTotal),
    reading:
      'Higher, not lower. The brief undercounts: the sweep is bigger than budgeted, and about a quarter of it is a reduced-motion idiom rather than carelessness.',
  },
  {
    measure: 'Files animating with no reduced-motion branch',
    brief: '39',
    measured: String(AUDIT_COUNTS.filesWithoutReducedMotion),
    reading:
      'Close. The gap is counting method, not a disagreement worth chasing.',
  },
  {
    measure: 'Dead no-op transitions',
    brief: '3, in Selector / ComplexSelector / MultiSelector',
    measured: `${AUDIT_COUNTS.noopTransitions}, in Lightbox`,
    reading:
      'The brief\u2019s three do not exist as described. The one real instance is a deliberate transitionProperty: none. Worth re-checking before it becomes a milestone line item.',
  },
  {
    measure: 'CSS transition on transform',
    brief: '20+ components',
    measured: `${AUDIT_COUNTS.transformTransitions} sites, ${AUDIT_COUNTS.transformTransitionComponents} components`,
    reading:
      'The brief is right, and this row is a caution about the tool rather than the doc: two earlier versions of the audit script reported 13 across 9, because a wrapped value and a nested StyleX rule each hid matches. Trust a generated number only as far as its generator has been tested.',
  },
];

function Stat({
  value,
  label,
  detail,
  tone,
}: {
  value: string | number;
  label: string;
  detail?: string;
  tone?: 'bad' | 'warn';
}) {
  return (
    <Card padding={0} {...stylex.props(sx.full)}>
      <VStack gap={0.5} {...stylex.props(sx.stat)}>
        <span
          {...stylex.props(
            sx.statValue,
            tone === 'bad' && sx.bad,
            tone === 'warn' && sx.warn,
          )}>
          {value}
        </span>
        <Text type="supporting">{label}</Text>
        {detail != null && (
          <Text type="supporting" color="secondary">
            {detail}
          </Text>
        )}
      </VStack>
    </Card>
  );
}

export default function MotionOverviewPage() {
  const reversals = GUIDANCE_CONFLICTS.filter(c => c.severity === 'reversal');

  return (
    <LabPage
      title="Motion Lab"
      intro="A bench for the H2 2026 motion proposals. Every proposal is here as a working before-and-after with its values exposed as controls, so the decisions get made by looking rather than by arguing about numbers in a document."
      badges={<Badge variant="info" label={`core@${CORE_VERSION}`} />}
      decides="Whether the audit in the brief matches the code, and which decisions are actually blocking.">
      <Banner
        status="warning"
        title={`${reversals.length} of the proposals reverse guidance Astryx publishes today`}
        description={
          <Text>
            The published Motion page tells authors that tooltips, hover cards
            and dropdown menus <em>may</em> disappear instantly, and that
            reduced motion means replacing animation with instant state changes.
            The eleven-component exit gap is not drift — it is that paragraph,
            correctly followed. Read the conflicts before planning any of this
            work.
          </Text>
        }
        endContent={
          <AstryxLink href="/pages/motion-lab/published/">
            See the conflicts
          </AstryxLink>
        }
      />

      <VStack gap={3}>
        <Heading level={2}>Measured against the installed package</Heading>
        <Text color="secondary">
          Generated by <code>scripts/generate-motion-audit.mjs</code> from{' '}
          <code>packages/core/src</code> and <code>packages/lab/src</code> at
          core@
          {CORE_VERSION}, so these move when the packages do. Every finding
          carries the package it is in.
        </Text>
        <Grid columns={{minWidth: 210}} gap={3}>
          <Stat
            value={AUDIT_COUNTS.componentDirs}
            label="Component directories"
            detail={`${AUDIT_COUNTS.animatingComponents} animate, ${AUDIT_COUNTS.staticComponents} do not`}
          />
          <Stat
            value={1}
            label="Easing tokens"
            detail="--ease-standard, for every job"
            tone="bad"
          />
          <Stat
            value={9}
            label="Duration tokens"
            detail="named by size, not by job"
          />
          <Stat
            value={AUDIT_COUNTS.hardcodedTotal}
            label="Hardcoded duration / easing"
            detail={`${AUDIT_COUNTS.hardcodedDuration} durations, ${AUDIT_COUNTS.hardcodedEasing} curves`}
            tone="bad"
          />
          <Stat
            value={AUDIT_COUNTS.filesWithoutReducedMotion}
            label="Animated files with no reduced-motion branch"
            detail={`of ${AUDIT_COUNTS.animatedFiles} animated files`}
            tone="bad"
          />
          <Stat
            value={AUDIT_COUNTS.durationWithoutCurve}
            label="Durations with no declared curve"
            detail="silently getting the CSS default"
            tone="warn"
          />
          <Stat
            value={AUDIT_COUNTS.transformTransitions}
            label="Transitions on transform"
            detail={`across ${AUDIT_COUNTS.transformTransitionComponents} components`}
            tone="warn"
          />
          <Stat
            value={AUDIT_COUNTS.getComputedStyleReads}
            label="getComputedStyle reads"
            detail="the JS mirror's caseload"
          />
        </Grid>
      </VStack>

      <Banner
        status="info"
        title="How the counting works, and where it misleads"
        description={
          <Text>
            The audit attributes motion to the component directory the file sits
            in. Astryx composes heavily, so a surface can animate without a
            single transition in its own folder — Tooltip, HoverCard, Popover,
            Typeahead and the rest inherit theirs from <code>Layer/</code>,
            AlertDialog from <code>Dialog/</code>, IconButton and ToggleButton
            from <code>Button/</code>, FieldStatus from{' '}
            <code>hooks/containerReveal.stylex.ts</code>. Read the per-component
            numbers as &ldquo;where the motion is authored&rdquo;, not
            &ldquo;which components move&rdquo;. The same trap is waiting for
            the rubric: a per-component score has to follow composition, or it
            will fail a component for a curve it does not own.
          </Text>
        }
      />

      <VStack gap={3}>
        <Heading level={2}>Where the brief and the code disagree</Heading>
        <Text color="secondary">
          Only the rows that differ. Everything else in the audit checked out.
        </Text>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Measure</TableHeaderCell>
                <TableHeaderCell>Brief</TableHeaderCell>
                <TableHeaderCell>Measured</TableHeaderCell>
                <TableHeaderCell>Reading</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECONCILIATION.map(row => (
                <TableRow key={row.measure}>
                  <TableCell>
                    <Text weight="semibold">{row.measure}</Text>
                  </TableCell>
                  <TableCell>
                    <Text color="secondary">{row.brief}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>{row.measured}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.reading}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>How to use the bench</Heading>
        <Grid columns={{minWidth: 280}} gap={3}>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">The rail applies everywhere</Text>
              <Text type="supporting" color="secondary">
                Slow-mo stretches every duration without moving the token, so
                you can judge a 175ms curve at 8&times; and still export 175ms.
                Reduced motion drives the real policy switch. Show hides one
                half of every comparison.
              </Text>
            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">Every slider writes a real token</Text>
              <Text type="supporting" color="secondary">
                Tune a value anywhere and every demo in the section updates,
                because they all read the same custom property. When it feels
                right, the export page emits the token block and the JS mirror.
              </Text>
            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">Numbers are generated, prose is not</Text>
              <Text type="supporting" color="secondary">
                Counts and file:line citations come from the audit script.
                Judgements about what they mean are written, and are the part
                worth arguing with.
              </Text>
            </VStack>
          </Card>
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Sections</Heading>
        <Grid columns={{minWidth: 300}} gap={3}>
          {MOTION_SECTIONS.filter(s => s.href !== '/pages/motion-lab/').map(
            section => (
              <Link
                key={section.href}
                href={section.href}
                {...stylex.props(sx.cardLink)}>
                <Card padding={4} {...stylex.props(sx.full)}>
                  <VStack gap={1}>
                    <HStack gap={1.5} vAlign="center">
                      <Text weight="semibold">{section.title}</Text>
                      <Badge label={section.group} />
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {section.decides}
                    </Text>
                  </VStack>
                </Card>
              </Link>
            ),
          )}
        </Grid>
      </VStack>

      <Text type="supporting" color="secondary">
        Published guidance:{' '}
        <AstryxLink
          href={PUBLISHED_PAGE_URL}
          target="_blank"
          rel="noopener noreferrer">
          astryx.atmeta.com/docs/motion
        </AstryxLink>
      </Text>
    </LabPage>
  );
}
