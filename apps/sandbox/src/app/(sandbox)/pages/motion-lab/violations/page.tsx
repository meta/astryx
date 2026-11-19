// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The generated audit, the lab store
 * @output Every hardcoded duration and curve, with what it becomes
 * @position /motion/violations
 *
 * The brief says 28; the measured number is higher, and the difference is not
 * carelessness: a third of them are one deliberate reduced-motion idiom. The
 * page is organised around that, because a sweep planned for 28 careless
 * values and a sweep that contains a policy question are different pieces of
 * work. Counts come from the generated audit, never from prose.
 */

import {useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {LabPage} from '../PageFrame';
import {ComparePanes, DemoBody, DemoCard, TokenSlider} from '../LabPrimitives';
import {LoopRig, TintRig} from '../LabDemos';
import {
  AUDIT_COUNTS,
  HARDCODED_BY_COMPONENT,
  HARDCODED_SITES,
  LITERAL_VALUES,
  type HardcodedSite,
} from '../__generated__/motionAudit';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)', fontSize: '12px'},
  bad: {color: 'var(--color-text-error, #d3543f)'},
  good: {color: 'var(--color-text-success, #2f7d52)'},
  search: {maxWidth: '280px', width: '100%'},
  scroll: {maxHeight: '560px', overflow: 'auto', width: '100%'},
  statValue: {fontSize: '24px', fontWeight: 650, letterSpacing: '-0.02em'},
});

/**
 * What each literal should become. Grouped by the shape of the decision rather
 * than by component, because the sweep is only mechanical for two of these
 * four groups — the other two need an answer first.
 */
type Family = {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly token: string;
  readonly matches: (site: HardcodedSite) => boolean;
  readonly mechanical: boolean;
  readonly blockedBy?: string;
};

const FAMILIES: ReadonlyArray<Family> = [
  {
    id: 'instant',
    title: 'Reduced-motion escapes',
    blurb:
      'Every one of these is the same idiom: collapse a transition to nothing when the user has asked for less motion. It is not sloppiness, and it is not safe to sweep blind — a zero duration fires no transitionend, so anything sequencing off that event breaks. The 0.01s spelling exists to keep the event.',
    token: '--duration-instant',
    matches: s => s.ms != null && s.ms <= 10,
    mechanical: false,
    blockedBy:
      'Decide whether --duration-instant is 0 or 0.01ms before sweeping any of these.',
  },
  {
    id: 'table',
    title: 'Table interaction tint',
    blurb:
      'Ten sites across columnResize, groupedRows, rowExpansion, stickyColumns and tree: seven 150ms durations and three bare `ease` curves, several of them the two halves of one `transition` shorthand. This resolves an open question in the brief — its "nine hardcoded values in Table" and its "six hardcoded 150ms values in Table tree" are the same set counted twice, not fifteen sites. 150ms and the token\u2019s 175ms are near-indistinguishable at 1×, so what this family buys is the lint rule, not a visual change.',
    token: '--duration-state',
    matches: s => s.component === 'Table',
    mechanical: true,
  },
  {
    id: 'loops',
    title: 'Ambient loops',
    blurb:
      'StatusDot at 2s and Chat at 1.5s, both outside a scale that stops at 1300ms. They did not bypass the tokens by accident — there is no token that reaches. This group cannot be swept until the slow band is extended or ambient motion is declared a separate concern.',
    token: '--duration-continuous (does not reach)',
    matches: s => s.ms != null && s.ms >= 1000,
    mechanical: false,
    blockedBy: 'Needs the ambient-band decision.',
  },
  {
    id: 'curves',
    title: 'Curves authored by hand',
    blurb:
      'Mostly linear, and mostly correct: a progress bar and a scroll-driven wheel should be linear. The exception is the sheet exit, which authors a full cubic-bezier with a comment measuring why the standard curve fails. That comment is the specification for --ease-exit.',
    token: '--ease-linear / --ease-exit / --ease-state',
    matches: s => s.kind === 'easing',
    mechanical: true,
  },
];

function familyOf(site: HardcodedSite): Family | undefined {
  return FAMILIES.find(f => f.matches(site));
}

function tokenFor(site: HardcodedSite): string {
  if (site.kind === 'easing') {
    if (site.value === 'linear') {
      return '--ease-linear';
    }
    if (site.value.startsWith('cubic-bezier')) {
      return '--ease-exit';
    }
    return '--ease-state';
  }
  if (site.ms == null) {
    return '--duration-state';
  }
  if (site.ms <= 10) {
    return '--duration-instant';
  }
  if (site.ms >= 1000) {
    return 'no token reaches';
  }
  if (site.ms <= 160) {
    return '--duration-state';
  }
  return '--duration-enter';
}

function countIn(familyId: string): number {
  return HARDCODED_SITES.filter(s => familyOf(s)?.id === familyId).length;
}

export default function ViolationsPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'duration' | 'easing'>('all');

  const rows = useMemo(
    () =>
      HARDCODED_SITES.filter(site => {
        if (kind !== 'all' && site.kind !== kind) {
          return false;
        }
        if (query.trim() === '') {
          return true;
        }
        const q = query.toLowerCase();
        return (
          site.component.toLowerCase().includes(q) ||
          site.file.toLowerCase().includes(q) ||
          site.value.toLowerCase().includes(q) ||
          site.prop.toLowerCase().includes(q)
        );
      }),
    [kind, query],
  );

  return (
    <LabPage
      title="Hardcoded durations and curves"
      intro="The token linter polices type, spacing, radius and colour. It has no entry for duration or easing, which is a complete explanation for every site below. Adding those entries turns rubric criterion 3 from a review question into a build failure."
      decides="What each hardcoded site becomes, and whether the swap is visible at all."
      badges={
        <Badge
          variant="error"
          label={`${AUDIT_COUNTS.hardcodedTotal} measured`}
        />
      }>
      <Banner
        status="warning"
        title={`The brief says 28. The measured number is ${AUDIT_COUNTS.hardcodedTotal}.`}
        description={
          <Text>
            Higher, not lower — so the sweep is bigger than budgeted. More
            importantly, the extra is not more of the same: {countIn('instant')}{' '}
            of them are one reduced-motion idiom that needs a decision before it
            can be touched, and {countIn('loops')} are ambient loops that no
            token currently reaches. Two of the four families below are
            mechanical; the other two are blocked on answers, and together they
            are {countIn('instant') + countIn('loops')} of the{' '}
            {AUDIT_COUNTS.hardcodedTotal}.
          </Text>
        }
      />

      <Grid columns={{minWidth: 220}} gap={3}>
        {[
          [
            AUDIT_COUNTS.hardcodedTotal,
            'Hardcoded sites',
            'measured against core@0.5.0',
          ],
          [AUDIT_COUNTS.hardcodedDuration, 'Durations and delays', ''],
          [AUDIT_COUNTS.hardcodedEasing, 'Curves', ''],
          [
            AUDIT_COUNTS.durationWithoutCurve,
            'Durations with no curve',
            'silently taking the CSS default',
          ],
        ].map(([value, label, detail]) => (
          <Card key={String(label)} padding={4}>
            <VStack gap={0.5}>
              <span {...stylex.props(sx.statValue)}>{value}</span>
              <Text type="supporting">{label}</Text>
              {detail !== '' && (
                <Text type="supporting" color="secondary">
                  {detail}
                </Text>
              )}
            </VStack>
          </Card>
        ))}
      </Grid>

      <VStack gap={3}>
        <Heading level={2}>Four families, two of them blocked</Heading>
        {FAMILIES.map(family => {
          const count = HARDCODED_SITES.filter(
            s => familyOf(s)?.id === family.id,
          ).length;
          return (
            <DemoCard
              key={family.id}
              title={family.title}
              question={family.blurb}
              badges={
                <HStack gap={1}>
                  <Badge label={`${count} sites`} />
                  <Badge
                    variant={family.mechanical ? 'success' : 'warning'}
                    label={family.mechanical ? 'mechanical' : 'blocked'}
                  />
                </HStack>
              }>
              {family.id === 'table' && (
                <ComparePanes
                  panes={[
                    {
                      tone: 'before',
                      label: 'Today — 150ms, default curve',
                      content: <TintRig mode="before" />,
                    },
                    {
                      tone: 'after',
                      label: 'Proposed — --duration-state, --ease-state',
                      content: <TintRig mode="after" />,
                    },
                    {
                      tone: 'neutral',
                      label: 'No transition',
                      content: <TintRig mode="none" />,
                    },
                  ]}
                />
              )}
              {family.id === 'loops' && (
                <ComparePanes
                  panes={[
                    {
                      tone: 'before',
                      label: 'Today — hardcoded, outside the scale',
                      content: <LoopRig policy="today" />,
                    },
                    {
                      tone: 'neutral',
                      label: 'Stopped',
                      content: <LoopRig policy="degrade" />,
                    },
                  ]}
                />
              )}
              <DemoBody>
                {family.id === 'table' && (
                  <>
                    <TokenSlider
                      token="--duration-state"
                      label="state"
                      max={400}
                    />
                    <Text type="supporting" color="secondary">
                      Put the rail on 4× or 8× if you want to see the difference
                      between 150 and 175 at all. That it is hard to see at 1×
                      is the honest finding, and it is the argument for treating
                      this family as a lint fix rather than a design change.
                      With the device set to reduce motion, the tokenised pane
                      changes at once at any speed.
                    </Text>
                  </>
                )}
                {family.blockedBy != null && (
                  <Text type="supporting" {...stylex.props(sx.bad)}>
                    Blocked: {family.blockedBy}
                  </Text>
                )}
                <HStack gap={2} wrap="wrap">
                  {HARDCODED_SITES.filter(s => familyOf(s)?.id === family.id)
                    .slice(0, 6)
                    .map((s, i) => (
                      <Text
                        key={`${s.file}:${s.line}:${i}`}
                        {...stylex.props(sx.mono)}
                        color="secondary">
                        {s.file}:{s.line}
                      </Text>
                    ))}
                  {count > 6 && (
                    <Text type="supporting" color="secondary">
                      +{count - 6} more in the table below
                    </Text>
                  )}
                </HStack>
              </DemoBody>
            </DemoCard>
          );
        })}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Every site</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <div {...stylex.props(sx.search)}>
            <TextInput
              label="Filter sites"
              isLabelHidden
              placeholder="Filter by component, file or value…"
              value={query}
              onChange={setQuery}
            />
          </div>
          <SegmentedControl
            label="Kind"
            size="sm"
            value={kind}
            onChange={value => setKind(value as 'all' | 'duration' | 'easing')}>
            <SegmentedControlItem value="all" label="All" />
            <SegmentedControlItem value="duration" label="Durations" />
            <SegmentedControlItem value="easing" label="Curves" />
          </SegmentedControl>
          <Text type="supporting" color="secondary">
            {rows.length} of {HARDCODED_SITES.length}
          </Text>
        </HStack>
        <Card padding={0}>
          <div {...stylex.props(sx.scroll)}>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Component</TableHeaderCell>
                  <TableHeaderCell>Site</TableHeaderCell>
                  <TableHeaderCell>Property</TableHeaderCell>
                  <TableHeaderCell>Today</TableHeaderCell>
                  <TableHeaderCell>Becomes</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Two sites can share file, line, value and property when one
                    declaration carries a duration and a curve, so the index is
                    part of the identity. */}
                {rows.map((site, i) => (
                  <TableRow
                    key={`${site.file}:${site.line}:${site.prop}:${site.value}:${i}`}>
                    <TableCell>
                      <Text weight="semibold">{site.component}</Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)} color="secondary">
                        {site.file}:{site.line}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)} color="secondary">
                        {site.prop}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono, sx.bad)}>
                        {site.value}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text {...stylex.props(sx.mono, sx.good)}>
                        {tokenFor(site)}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </VStack>

      <Grid columns={{minWidth: 320}} gap={3}>
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Literals in use</Heading>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Value</TableHeaderCell>
                  <TableHeaderCell>Sites</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LITERAL_VALUES.map(([value, count]) => (
                  <TableRow key={value}>
                    <TableCell>
                      <Text {...stylex.props(sx.mono)}>{value}</Text>
                    </TableCell>
                    <TableCell>
                      <Text>{count}</Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>By component</Heading>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Component</TableHeaderCell>
                  <TableHeaderCell>Sites</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {HARDCODED_BY_COMPONENT.map(([name, count]) => (
                  <TableRow key={name}>
                    <TableCell>
                      <Text>{name}</Text>
                    </TableCell>
                    <TableCell>
                      <Text>{count}</Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </VStack>
        </Card>
      </Grid>

      <VStack gap={3}>
        <Heading level={2}>Sweep order</Heading>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Step</TableHeaderCell>
                <TableHeaderCell>Why this order</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                [
                  '1. Land the semantic tokens as aliases',
                  'Nothing to migrate to until they exist, and aliasing means nothing shifts perceptually while the sweep runs.',
                ],
                [
                  '2. Add the lint rules in warn mode',
                  'Produces the real inventory continuously, so this page stops being a snapshot.',
                ],
                [
                  '3. Answer the two blocked families',
                  'Whether --duration-instant is 0 or 0.01ms, and whether the slow band grows an ambient tier.',
                ],
                [
                  '4. Sweep',
                  'Mechanical once the tokens and the answers both exist.',
                ],
                [
                  '5. Flip lint to error',
                  'Only once the count is zero, or the remainder is explicitly allowlisted.',
                ],
              ].map(([step, why]) => (
                <TableRow key={step}>
                  <TableCell>
                    <Text weight="semibold">{step}</Text>
                  </TableCell>
                  <TableCell>
                    <Text color="secondary">{why}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Text type="supporting" color="secondary">
          The rule stub is on{' '}
          <Link href="/pages/motion-lab/export/">Export tuning</Link>. The
          reduced-motion decision that blocks family one is on{' '}
          <Link href="/pages/motion-lab/reduced-motion/">Reduced motion</Link>.
        </Text>
      </VStack>
    </LabPage>
  );
}
