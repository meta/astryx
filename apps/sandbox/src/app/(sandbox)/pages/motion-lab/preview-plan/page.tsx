// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input previewPlan.ts and the generated audit
 * @output What every component's preview has to demonstrate before it is built
 * @position /motion/preview-plan
 *
 * A build plan, not a gallery. The column that matters is the hard case: a
 * preview that only shows the easy case decides nothing, and most of the
 * techniques in this project are chosen by one awkward instance rather than
 * by the general shape.
 */

import {COST_LABEL, COST_VARIANT} from '../motionCost';
import {useMemo, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
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
import {
  PREVIEW_GROUPS,
  PREVIEW_PLAN,
  measure,
  type PreviewRow,
  type Verdict,
} from '../previewPlan';

const VERDICT_VARIANT: Record<
  Verdict,
  'success' | 'warning' | 'error' | 'neutral'
> = {
  GOOD: 'success',
  PARTIAL: 'warning',
  ADD: 'error',
  NONE: 'neutral',
};

const PRIORITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'P1 · decides an open question',
  2: 'P2 · high-frequency surface',
  3: 'P3 · completeness',
};

function Field({label, children}: {label: string; children: string}) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" weight="semibold">
        {label}
      </Text>
      <Text type="supporting" color="secondary">
        {children}
      </Text>
    </VStack>
  );
}

function RowCard({row}: {row: PreviewRow}) {
  const measurement = measure(row);
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <VStack gap={1}>
          <HStack gap={1.5} vAlign="center" wrap="wrap">
            <Text weight="semibold">{row.component}</Text>
            <Badge variant={VERDICT_VARIANT[row.verdict]} label={row.verdict} />
            <Badge
              variant={row.status === 'built' ? 'success' : 'neutral'}
              label={
                row.status === 'built'
                  ? `built · ${row.rig ?? ''}`
                  : 'specified'
              }
            />
            <Badge label={PRIORITY_LABEL[row.priority]} />
            {row.motionCost !== 'idle' && (
              <Badge
                variant={COST_VARIANT[row.motionCost]}
                label={`${COST_LABEL[row.motionCost]} idle cost`}
              />
            )}
          </HStack>
          <HStack gap={3} wrap="wrap">
            <Text type="supporting" color="secondary">
              {`Today: ${row.today}`}
            </Text>
          </HStack>
          {row.motionCostWhy != null && (
            <Text type="supporting" color="secondary">
              <strong>{`${COST_LABEL[row.motionCost]} idle cost: `}</strong>
              {row.motionCostWhy}
            </Text>
          )}
          <Text type="supporting" color="secondary">
            {`Gap: ${row.gap}`}
          </Text>
        </VStack>

        <Divider />

        <Field label="The preview must show">{row.shows}</Field>
        <Field label="The hard case that decides the technique">
          {row.hardCase}
        </Field>

        {row.controls.length > 0 && (
          <HStack gap={1} wrap="wrap">
            {row.controls.map(control => (
              <Badge key={control} variant="info" label={control} />
            ))}
          </HStack>
        )}

        {measurement.kind === 'contradiction' && (
          <Banner
            status="error"
            title="Brief and measurement disagree"
            description={<Text>{measurement.note}</Text>}
          />
        )}
        {measurement.kind === 'nuance' && (
          <Banner
            status="warning"
            title="Measured differently"
            description={<Text>{measurement.note}</Text>}
          />
        )}
        {measurement.kind === 'unmeasured' && measurement.note !== '' && (
          <Text type="supporting" color="secondary">
            {measurement.note}
          </Text>
        )}
      </VStack>
    </Card>
  );
}

export default function PreviewPlanPage() {
  const [verdict, setVerdict] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PREVIEW_PLAN.filter(row => {
      if (verdict !== 'all' && row.verdict !== verdict) {
        return false;
      }
      if (status !== 'all' && row.status !== status) {
        return false;
      }
      if (needle === '') {
        return true;
      }
      return [
        row.component,
        row.today,
        row.gap,
        row.shows,
        row.hardCase,
        row.group,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [verdict, status, query]);

  const built = PREVIEW_PLAN.filter(row => row.status === 'built');
  const specified = PREVIEW_PLAN.filter(row => row.status === 'specified');
  const disagreements = PREVIEW_PLAN.filter(
    row => measure(row).kind === 'contradiction',
  );
  const queue = [...specified].sort(
    (a, b) =>
      a.priority - b.priority ||
      PREVIEW_GROUPS.indexOf(a.group) - PREVIEW_GROUPS.indexOf(b.group),
  );

  return (
    <LabPage
      title="Preview plan"
      intro="Every component in the audit, what its preview has to demonstrate, and the controls it needs. The hard case is the column that matters: a preview that only shows the easy case is worth nothing."
      badges={<Badge label={`${PREVIEW_PLAN.length} rows`} />}
      decides="What every remaining preview has to show before it is worth building.">
      <Grid columns={{minWidth: 200}} gap={3}>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Heading level={3}>{PREVIEW_PLAN.length}</Heading>
            <Text type="supporting" color="secondary">
              Rows across six surfaces
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Heading level={3}>{built.length}</Heading>
            <Text type="supporting" color="secondary">
              Already have a rig in the lab
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Heading level={3}>{specified.length}</Heading>
            <Text type="supporting" color="secondary">
              Specified, not built
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Heading level={3}>{disagreements.length}</Heading>
            <Text type="supporting" color="secondary">
              Rows where the brief and the audit disagree
            </Text>
          </VStack>
        </Card>
      </Grid>

      <Banner
        status="warning"
        title={`${disagreements.length} verdicts do not survive the measurement`}
        description={
          <Text>
            Almost all of them are the same mechanism: the brief credits a
            component with the motion it inherits, and the audit measures per
            directory. Tooltip, HoverCard, Popover and the overflow layers get
            their entry from <code>Layer/</code>; FieldStatus gets its slide
            from <code>hooks/containerReveal.stylex.ts</code>. Neither reading
            is wrong, but a rubric scoring components one at a time will score
            these wrong unless it knows where to look.
          </Text>
        }
      />

      <VStack gap={3}>
        <HStack gap={3} wrap="wrap" vAlign="end">
          <SegmentedControl
            label="Filter by verdict"
            value={verdict}
            onChange={setVerdict}
            size="sm">
            <SegmentedControlItem value="all" label="All" />
            <SegmentedControlItem value="GOOD" label="GOOD" />
            <SegmentedControlItem value="PARTIAL" label="PARTIAL" />
            <SegmentedControlItem value="ADD" label="ADD" />
            <SegmentedControlItem value="NONE" label="NONE" />
          </SegmentedControl>
          <SegmentedControl
            label="Filter by status"
            value={status}
            onChange={setStatus}
            size="sm">
            <SegmentedControlItem value="all" label="All" />
            <SegmentedControlItem value="built" label="Built" />
            <SegmentedControlItem value="specified" label="Specified" />
          </SegmentedControl>
          <TextInput
            label="Search"
            isLabelHidden
            placeholder="Search components, gaps, hard cases"
            value={query}
            onChange={setQuery}
            hasClear
            width={280}
          />
          <Text type="supporting" color="secondary">
            {`${filtered.length} of ${PREVIEW_PLAN.length}`}
          </Text>
        </HStack>

        {filtered.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            description="No row matches that combination of verdict, status and search."
          />
        ) : (
          PREVIEW_GROUPS.map(group => {
            const rows = filtered.filter(row => row.group === group);
            if (rows.length === 0) {
              return null;
            }
            return (
              <VStack key={group} gap={2}>
                <HStack gap={2} vAlign="center">
                  <Heading level={2}>{group}</Heading>
                  <Badge label={`${rows.length}`} />
                </HStack>
                <Grid columns={{minWidth: 420, max: 2}} gap={3}>
                  {rows.map(row => (
                    <RowCard key={row.id} row={row} />
                  ))}
                </Grid>
              </VStack>
            );
          })
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Build queue</Heading>
        <Text color="secondary">
          {`The ${specified.length} specified previews in priority order. P1 rows each settle an open question, so they are worth building before the decision meeting rather than after it.`}
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Priority</TableHeaderCell>
                <TableHeaderCell>Component</TableHeaderCell>
                <TableHeaderCell>Surface</TableHeaderCell>
                <TableHeaderCell>Why it is worth building</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map(row => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge
                      variant={
                        row.priority === 1
                          ? 'error'
                          : row.priority === 2
                            ? 'warning'
                            : 'neutral'
                      }
                      label={`P${row.priority}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Text weight="semibold">{row.component}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.group}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.hardCase}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </VStack>
    </LabPage>
  );
}
