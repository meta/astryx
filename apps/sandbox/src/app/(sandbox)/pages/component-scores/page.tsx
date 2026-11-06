// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component audit ledger with filtered metrics and audit details.
 * @input Generated component roster and wiki-backed audit ledger snapshot.
 * @output Full-width audit table with filtered metrics, actions, and a drawer.
 * @position Sandbox audit surface at /pages/component-scores/.
 */

'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';

import {Layout, LayoutContent, VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';
import {Badge} from '@astryxdesign/core/Badge';
import type {BadgeVariant} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
import {Code} from '@astryxdesign/core/Code';
import {Divider} from '@astryxdesign/core/Divider';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Section} from '@astryxdesign/core/Section';
import {Table, proportional, pixel} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Stat} from '@astryxdesign/lab';

import {
  AUDIT_PROMPT,
  LEDGER_FETCH_TIMEOUT_MS,
  LEDGER_URL,
  LEDGER_WIKI_URL,
  REPO,
  RUBRIC_URL,
  SECTION_TITLES,
  SECTION_WEIGHTS,
  roster,
  snapshot,
  type Ledger,
  type LedgerBlock,
  type LedgerEntry,
  type LedgerSection,
} from '../../../../generated/componentScores';

// =============================================================================
// Row model — the roster joined with whatever the ledger knows
// =============================================================================

interface ScoreRow extends Record<string, unknown> {
  id: string;
  component: string;
  package: string;
  audited: boolean;
  score: number | null;
  grade: string | null;
  blocks: number;
  blockList: LedgerBlock[];
  lastAudited: string | null;
  rubricVersion: string | null;
  weakest: string | null;
  entry: LedgerEntry | null;
}

const GRADE_VARIANT: Record<string, BadgeVariant> = {
  A: 'success',
  B: 'success',
  C: 'warning',
  D: 'warning',
  F: 'error',
};

const AUDIT_PANEL_ID = 'component-audit-details';

const AUDIT_MODE_LABELS: Record<string, string> = {
  N: 'Nightly',
  P: 'Promotion',
  O: 'On-demand',
  R: 'Review',
};

const INTERACTIVE_ROW_DESCENDANT =
  'a, button, input, select, textarea, [role="button"], [role="link"], ' +
  '[role="checkbox"], [role="menu"], [role="menuitem"], ' +
  '[role="menuitemcheckbox"], [role="menuitemradio"], [role="listbox"], ' +
  '[role="option"], [contenteditable="true"]';

/** The lowest section carrying a published per-section score. */
function weakestSection(entry: LedgerEntry): string | null {
  let worst: {id: string; score: number} | null = null;
  for (const [id, section] of Object.entries(entry.sections || {})) {
    if (section.state !== 'scored' || typeof section.score !== 'number') {
      continue;
    }
    if (!worst || section.score < worst.score) {
      worst = {id, score: section.score};
    }
  }
  return worst
    ? `${SECTION_TITLES[worst.id] ?? worst.id} (${worst.score}/5)`
    : null;
}

function buildRows(ledger: Ledger | null): ScoreRow[] {
  const byId = new Map<string, LedgerEntry>();
  for (const entry of ledger?.components ?? []) {
    byId.set(`${entry.package}/${entry.component}`, entry);
  }

  return roster
    .map(item => {
      const entry = byId.get(`${item.package}/${item.component}`) ?? null;
      return {
        // `Chat` exists in both core and lab, so the row key is the pair.
        id: `${item.package}/${item.component}`,
        component: item.component,
        package: item.package,
        audited: entry != null,
        score: entry?.score ?? null,
        grade: entry?.grade ?? null,
        blocks: entry?.blocks?.count ?? 0,
        blockList: entry?.blocks?.open ?? [],
        lastAudited: entry?.lastAudited ?? null,
        rubricVersion: entry?.rubricVersion ?? null,
        weakest: entry ? weakestSection(entry) : null,
        entry,
      };
    })
    .sort(
      (a, b) =>
        a.component.localeCompare(b.component) ||
        a.package.localeCompare(b.package),
    );
}

/** The audit request for one component, with the placeholder filled in. */
const promptFor = (component: string) =>
  AUDIT_PROMPT.replaceAll('<Component>', component);

function RowActions({
  row,
  onViewAudit,
}: {
  row: ScoreRow;
  onViewAudit: (row: ScoreRow, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const copyAuditPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptFor(row.component));
      toast({
        body: `Audit prompt copied for ${row.component}.`,
        uniqueID: 'component-audit-prompt-copied',
      });
    } catch {
      toast({
        body: `Could not copy the audit prompt for ${row.component}.`,
        type: 'error',
        uniqueID: 'component-audit-prompt-copy-error',
      });
    }
  };

  return (
    <MoreMenu
      ref={triggerRef}
      label={`Actions for ${row.component} (${row.package})`}
      size="sm"
      items={[
        {
          label: 'Copy audit prompt',
          onClick: () => {
            void copyAuditPrompt();
          },
        },
        ...(row.entry
          ? [
              {
                label: 'View audit',
                onClick: () => onViewAudit(row, triggerRef.current),
              },
            ]
          : []),
      ]}
    />
  );
}

type AuditEvidence = NonNullable<LedgerEntry['evidence']>[number];

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(INTERACTIVE_ROW_DESCENDANT) != null
  );
}

function formatOptionalCount(value: number | null): string {
  return typeof value === 'number' ? String(value) : 'Not published';
}

function formatAuditMode(mode: string | null): string {
  if (!mode) {
    return 'Not published';
  }
  const label = AUDIT_MODE_LABELS[mode];
  return label ? mode + ' · ' + label : mode;
}

function readAuditSection(entry: LedgerEntry, id: string): LedgerSection {
  return (
    entry.sections?.[id] ?? {
      score: null,
      weight: SECTION_WEIGHTS[id] ?? 0,
      state: 'not_measured',
    }
  );
}

function sectionResultLabel(section: LedgerSection): string {
  const score =
    typeof section.score === 'number'
      ? section.score.toFixed(1) + ' / 5'
      : null;

  if (section.state === 'scored') {
    return score ?? 'Score unavailable';
  }
  if (section.state === 'limited') {
    return score
      ? score + ' · Limited, informational only'
      : 'Limited, informational only';
  }
  if (section.state === 'na') {
    return 'N/A';
  }
  if (section.state === 'unpublished') {
    return 'Audited · breakdown unpublished';
  }
  return 'Not measured';
}

function EvidenceReference({
  value,
  commit,
}: {
  value: string;
  commit: string | null;
}) {
  if (value.startsWith('https://') || value.startsWith('http://')) {
    return (
      <Link href={value} isExternalLink type="supporting">
        {value}
      </Link>
    );
  }

  if (!value.startsWith('/')) {
    return (
      <Link
        href={
          'https://github.com/' +
          REPO +
          '/blob/' +
          (commit ?? 'main') +
          '/' +
          value
        }
        isExternalLink
        type="supporting">
        {value}
      </Link>
    );
  }

  return <Code>{value}</Code>;
}

function AuditEvidenceItem({
  evidence,
  commit,
}: {
  evidence: AuditEvidence;
  commit: string | null;
}) {
  return (
    <Section variant="muted" padding={3}>
      <VStack gap={2}>
        <Text weight="medium">{evidence.label}</Text>
        {evidence.path ? (
          <EvidenceReference value={evidence.path} commit={commit} />
        ) : null}
        {evidence.note ? (
          <Text type="supporting" color="secondary">
            {evidence.note}
          </Text>
        ) : null}
      </VStack>
    </Section>
  );
}

function AuditBlockDetails({
  block,
  rowId,
  index,
}: {
  block: LedgerBlock;
  rowId: string;
  index: number;
}) {
  return (
    <Card key={rowId + '-' + block.id + '-' + String(index)}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight="medium">{block.id}</Text>
          {block.issue ? (
            <Link
              href={
                'https://github.com/' + REPO + '/issues/' + String(block.issue)
              }
              isExternalLink
              type="supporting">
              Issue #{block.issue}
            </Link>
          ) : (
            <Text type="supporting" color="secondary">
              No issue filed
            </Text>
          )}
        </HStack>
        {block.section ? (
          <Text type="supporting" color="secondary">
            {block.section}
          </Text>
        ) : null}
        <Text>{block.summary}</Text>
        {block.evidence ? (
          <VStack gap={1}>
            <Text type="label">Evidence</Text>
            <Text type="supporting" color="secondary">
              {block.evidence}
            </Text>
          </VStack>
        ) : null}
      </VStack>
    </Card>
  );
}

function AuditDetails({
  row,
  currentRubricVersion,
}: {
  row: ScoreRow;
  currentRubricVersion: string | null;
}) {
  const entry = row.entry;
  if (!entry) {
    return null;
  }

  const blockCount = entry.blocks?.count ?? 0;
  const knownBlocks = entry.blocks?.open ?? [];
  const unpublishedBlockCount = Math.max(0, blockCount - knownBlocks.length);
  const evidence = entry.evidence ?? [];
  const isHistoricalRubric =
    entry.rubricVersion != null &&
    currentRubricVersion != null &&
    entry.rubricVersion !== currentRubricVersion;

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge
            variant={
              entry.grade
                ? (GRADE_VARIANT[entry.grade] ?? 'neutral')
                : 'neutral'
            }
            label={entry.grade ?? 'Unscored'}
          />
          <Text type="large" xstyle={styles.tabularValue}>
            {typeof entry.score === 'number'
              ? entry.score.toFixed(1) + ' / 100'
              : 'Score unavailable'}
          </Text>
          {blockCount > 0 ? (
            <Badge
              variant="error"
              label={
                String(blockCount) +
                ' open BLOCK' +
                (blockCount === 1 ? '' : 's')
              }
            />
          ) : null}
        </HStack>
      </VStack>

      {isHistoricalRubric ? (
        <Section variant="muted" padding={3}>
          <Text type="supporting">
            This audit used rubric v{entry.rubricVersion}; the current ledger
            uses v{currentRubricVersion}. Scores across rubric versions may not
            be directly comparable.
          </Text>
        </Section>
      ) : null}

      <VStack gap={3}>
        <Heading level={3}>Audit metadata</Heading>
        <MetadataList columns="multi" label={{position: 'top'}}>
          <MetadataListItem label="Last audited">
            {entry.lastAudited ?? 'Not published'}
          </MetadataListItem>
          <MetadataListItem label="Audit mode">
            {formatAuditMode(entry.mode)}
          </MetadataListItem>
          <MetadataListItem label="Rubric version">
            {entry.rubricVersion ?? 'Not published'}
          </MetadataListItem>
          <MetadataListItem label="Audited commit">
            {entry.commit ? (
              <Link
                href={'https://github.com/' + REPO + '/commit/' + entry.commit}
                isExternalLink>
                <Code>{entry.commit}</Code>
              </Link>
            ) : (
              'Not published'
            )}
          </MetadataListItem>
          <MetadataListItem label="Distinct defects">
            {formatOptionalCount(entry.distinct_defects)}
          </MetadataListItem>
          <MetadataListItem label="FIXes">
            {formatOptionalCount(entry.fixes)}
          </MetadataListItem>
          <MetadataListItem label="NITs">
            {formatOptionalCount(entry.nits)}
          </MetadataListItem>
        </MetadataList>
      </VStack>

      <Divider />

      <VStack gap={3}>
        <Heading level={3}>Open BLOCKs</Heading>
        {blockCount === 0 ? (
          <Text color="secondary">No open BLOCKs recorded.</Text>
        ) : (
          knownBlocks.map((block, index) => (
            <AuditBlockDetails
              key={row.id + '-' + block.id + '-' + String(index)}
              block={block}
              rowId={row.id}
              index={index}
            />
          ))
        )}
        {unpublishedBlockCount > 0 ? (
          <Text type="supporting" color="secondary">
            +{unpublishedBlockCount} BLOCK detail
            {unpublishedBlockCount === 1 ? '' : 's'} not individually published.
            The total above is authoritative.
          </Text>
        ) : null}
      </VStack>

      <Divider />

      <VStack gap={4}>
        <Heading level={3}>Rubric sections</Heading>
        {Object.keys(SECTION_TITLES).map((id, index) => {
          const section = readAuditSection(entry, id);
          return (
            <VStack key={id} gap={2}>
              {index > 0 ? <Divider /> : null}
              <VStack gap={1}>
                <Heading level={4}>{SECTION_TITLES[id]}</Heading>
                <HStack gap={3} wrap="wrap">
                  <Text weight="medium" xstyle={styles.tabularValue}>
                    {sectionResultLabel(section)}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {section.weight}% weight
                  </Text>
                </HStack>
              </VStack>
              {section.state === 'limited' ? (
                <Text type="supporting" color="secondary">
                  Fewer than one third of the section produced a non-vacuous
                  verdict, so this score is informational and its weight was
                  redistributed.
                </Text>
              ) : null}
              {section.note ? <Text>{section.note}</Text> : null}
            </VStack>
          );
        })}
      </VStack>

      {evidence.length > 0 ? (
        <>
          <Divider />
          <VStack gap={3}>
            <Heading level={3}>Evidence</Heading>
            {evidence.map((item, index) => (
              <AuditEvidenceItem
                key={item.label + '-' + String(index)}
                evidence={item}
                commit={entry.commit}
              />
            ))}
          </VStack>
        </>
      ) : null}

      {entry.notes ? (
        <>
          <Divider />
          <VStack gap={2}>
            <Heading level={3}>Audit notes</Heading>
            <Text>{entry.notes}</Text>
          </VStack>
        </>
      ) : null}
    </VStack>
  );
}

// =============================================================================
// No sticky header — a Table limitation, measured
//
// 118 rows want a pinned header, and Table has no `isHeaderSticky`. A sticky
// `<th>` cannot supply one from outside the component either, because
// `position: sticky` resolves against the nearest scroll container and Table's
// scroll wrapper is unconditionally one in BOTH axes: it sets `overflow-x:
// auto` (which it needs, so a wide table survives 390px), and that forces the
// block axis to compute to `auto` too. `overflow-y: clip` does not escape it —
// paired with `auto` it computes to `hidden`, which is still a scroll
// container. Measured in Chromium, not reasoned about: with the page scrolled
// 1200px the header sat at -907, unpinned, either way.
//
// So the header can only pin while the WRAPPER is the vertical scroller — i.e.
// while the table has a capped height, which is the nested-scrollbar shape we
// deliberately removed. Page-scroll and a sticky header are mutually exclusive
// until Table grows the prop. Left undone rather than hand-rolled around; see
// the PR description.
// =============================================================================

// =============================================================================
// Page
// =============================================================================

type AuditFilter = 'audited' | 'tbd';

const AUDIT_FILTER_OPTIONS = [
  {value: 'audited', label: 'Audited'},
  {value: 'tbd', label: 'TBD'},
];

// Derived from the roster, not hardcoded, so a package promoted out of lab
// (richtext was) gets a filter option the day it lands rather than showing
// rows that no filter can isolate.
const PACKAGE_FILTER_OPTIONS = [...new Set(roster.map(item => item.package))]
  .sort()
  .map(pkg => ({
    value: pkg,
    label: pkg.charAt(0).toUpperCase() + pkg.slice(1),
  }));

export default function ComponentScoresPage() {
  const [ledger, setLedger] = useState<Ledger | null>(snapshot);
  const [query, setQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<AuditFilter | null>(null);
  const [packageFilter, setPackageFilter] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [isAuditPanelOpen, setIsAuditPanelOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const auditContentRef = useRef<HTMLDivElement>(null);
  const auditTriggerRef = useRef<HTMLElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // The live wiki fetch keeps the ledger current without requiring a rebuild.
  // The build-time snapshot keeps the page useful while it resolves and when
  // the wiki is unavailable. `no-store` avoids the upstream five-minute cache,
  // and one controller bounds both the request timeout and unmount.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LEDGER_FETCH_TIMEOUT_MS);

    fetch(LEDGER_URL, {cache: 'no-store', signal: controller.signal})
      .then(res =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: Ledger) => {
        if (cancelled) {
          return;
        }
        if (!Array.isArray(data.components)) {
          throw new Error('not a ledger');
        }
        setLedger(data);
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const rows = useMemo(() => buildRows(ledger), [ledger]);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selectedRowId) ?? null,
    [rows, selectedRowId],
  );

  const openAudit = useCallback(
    (row: ScoreRow, trigger?: HTMLElement | null) => {
      if (!row.entry) {
        return;
      }
      if (trigger) {
        auditTriggerRef.current = trigger;
      }
      setSelectedRowId(row.id);
      setIsAuditPanelOpen(true);
    },
    [],
  );

  // Switching rows keeps the non-modal drawer open. Reset its reading
  // position and move focus to the new heading so the changed audit is
  // announced and Escape continues to reach the shared dismissal owner.
  useEffect(() => {
    if (!isAuditPanelOpen || !selectedRowId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const dialog = drawerRef.current;
      // The Layout's content region is the scroller; the drawer keeps its
      // header pinned above it.
      if (auditContentRef.current) {
        auditContentRef.current.scrollTop = 0;
      }
      dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isAuditPanelOpen, selectedRowId]);

  // Drawer remembers the trigger from its initial open. For master-detail
  // row switching, return focus to the most recently selected row instead.
  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) {
      return;
    }

    const restoreLatestTrigger = () => {
      const trigger = auditTriggerRef.current;
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        filterInputRef.current?.focus();
      }
    };
    dialog.addEventListener('close', restoreLatestTrigger);
    return () => dialog.removeEventListener('close', restoreLatestTrigger);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (
        q &&
        !r.component.toLowerCase().includes(q) &&
        !r.package.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (auditFilter === 'audited' && !r.audited) {
        return false;
      }
      if (auditFilter === 'tbd' && r.audited) {
        return false;
      }
      if (packageFilter && r.package !== packageFilter) {
        return false;
      }
      return true;
    });
  }, [rows, query, auditFilter, packageFilter]);

  const stats = useMemo(() => {
    const audited = visible.filter(row => row.audited).length;
    const scores = visible
      .map(row => row.score)
      .filter((score): score is number => typeof score === 'number');

    return {
      total: visible.length,
      audited,
      percent: visible.length
        ? Math.round((audited / visible.length) * 1000) / 10
        : 0,
      average:
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null,
      scored: scores.length,
    };
  }, [visible]);

  const lastUpdatedLabel = ledger?.updated
    ? 'Last updated ' + ledger.updated
    : 'Last updated unavailable';

  const hasActiveFilters =
    auditFilter != null || packageFilter != null || query.length > 0;
  const auditRowPlugin = useMemo<TablePlugin<ScoreRow>>(
    () => ({
      transformBodyRow(props, row) {
        if (!row.entry) {
          return props;
        }

        const previousOnClick = props.htmlProps.onClick;
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            onClick: event => {
              previousOnClick?.(event);
              if (
                event.defaultPrevented ||
                isInteractiveRowTarget(event.target) ||
                window.getSelection()?.toString()
              ) {
                return;
              }

              const trigger = event.currentTarget.querySelector<HTMLElement>(
                'button[aria-haspopup="menu"]',
              );
              trigger?.focus();
              openAudit(row, trigger);
            },
          },
          xstyle: [...props.xstyle, styles.auditRow],
        };
      },
    }),
    [openAudit],
  );

  const tablePlugins = useMemo(
    () => ({auditDetails: auditRowPlugin}),
    [auditRowPlugin],
  );

  const columns: TableColumn<ScoreRow>[] = [
    {
      key: 'component',
      header: 'Component',
      width: proportional(3),
      renderCell: (row: ScoreRow) => (
        <VStack gap={1}>
          <Text weight="medium">{row.component}</Text>
          <Text type="supporting" color="secondary">
            {row.package}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'grade',
      header: 'Grade',
      width: pixel(88),
      renderCell: (row: ScoreRow) =>
        row.grade ? (
          <Badge
            variant={GRADE_VARIANT[row.grade] ?? 'neutral'}
            label={row.grade}
          />
        ) : (
          <Badge label="TBD" />
        ),
    },
    {
      key: 'score',
      header: 'Score',
      width: pixel(80),
      renderCell: (row: ScoreRow) => (
        <Text>
          {typeof row.score === 'number' ? row.score.toFixed(1) : '—'}
        </Text>
      ),
    },
    {
      key: 'weakest',
      header: 'Weakest rubric area',
      width: proportional(2),
      renderCell: (row: ScoreRow) => (
        <Text type="supporting" color="secondary">
          {row.weakest ?? '—'}
        </Text>
      ),
    },
    {
      key: 'lastAudited',
      header: 'Last audited',
      width: pixel(136),
      renderCell: (row: ScoreRow) =>
        row.audited ? (
          <VStack gap={1}>
            <Text type="supporting">{row.lastAudited}</Text>
            <Text type="supporting" color="secondary">
              rubric v{row.rubricVersion}
            </Text>
          </VStack>
        ) : (
          <Text type="supporting" color="secondary">
            never
          </Text>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: pixel(72),
      align: 'end',
      renderCell: (row: ScoreRow) => (
        <RowActions
          row={row}
          onViewAudit={(auditRow, trigger) => openAudit(auditRow, trigger)}
        />
      ),
    },
  ];

  // AppShell supplies no content padding, so this page owns its gutters while
  // the audit table uses the full available content width.
  return (
    <>
      <VStack gap={0} width="100%">
        <Section variant="transparent" padding={4}>
          <VStack gap={5}>
            <HStack gap={4} justify="between" vAlign="start" wrap="wrap">
              <VStack gap={2} maxWidth="72ch">
                <Heading level={1}>Component Audits</Heading>
                <Text>
                  To audit a component, open its <strong>Actions</strong> menu,
                  choose <strong>Copy audit prompt</strong>, run the prompt
                  against the component in the repository, then record and
                  publish the completed result to the{' '}
                  <Link href={LEDGER_WIKI_URL} isExternalLink>
                    central audit ledger
                  </Link>
                  . This page automatically shows recorded scores and evidence;
                  components without a recorded result remain{' '}
                  <strong>TBD</strong>.
                </Text>
                <Link href={RUBRIC_URL} isExternalLink>
                  How components are graded, and how to get one audited
                </Link>
              </VStack>
              <Text type="supporting" color="secondary">
                {lastUpdatedLabel}
              </Text>
            </HStack>

            <Toolbar
              label="Filter components"
              size="sm"
              gap={2}
              startContent={
                <HStack gap={1} vAlign="center">
                  <Selector
                    label="Audit status"
                    isLabelHidden
                    placeholder="Audit status"
                    options={AUDIT_FILTER_OPTIONS}
                    value={auditFilter}
                    onChange={value =>
                      setAuditFilter(
                        value ? (value.toLowerCase() as AuditFilter) : null,
                      )
                    }
                    hasClear
                    variant="ghost"
                    size="sm"
                    controlXstyle={styles.filterToken}
                  />
                  <Selector
                    label="Package"
                    isLabelHidden
                    placeholder="Package"
                    options={PACKAGE_FILTER_OPTIONS}
                    value={packageFilter}
                    onChange={value =>
                      setPackageFilter(value ? value.toLowerCase() : null)
                    }
                    hasClear
                    variant="ghost"
                    size="sm"
                    controlXstyle={styles.filterToken}
                  />
                  <Text type="supporting" color="secondary">
                    {visible.length}{' '}
                    {visible.length === 1 ? 'result' : 'results'}
                  </Text>
                  {hasActiveFilters ? (
                    <>
                      <Text type="supporting" color="secondary" aria-hidden>
                        ·
                      </Text>
                      <Button
                        label="Clear all"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAuditFilter(null);
                          setPackageFilter(null);
                          setQuery('');
                        }}
                      />
                    </>
                  ) : null}
                </HStack>
              }
              endContent={
                <TextInput
                  ref={filterInputRef}
                  label="Search components"
                  isLabelHidden
                  placeholder="Search components…"
                  value={query}
                  onChange={setQuery}
                  hasClear
                  startIcon={<Icon icon="search" size="sm" color="secondary" />}
                  width={240}
                  size="sm"
                />
              }
            />

            <Grid columns={{minWidth: 240, max: 2, repeat: 'fit'}} gap={4}>
              <Card padding={4}>
                <Stat
                  size="sm"
                  label="Audited"
                  value={String(stats.percent) + '%'}
                  description={
                    String(stats.audited) +
                    ' of ' +
                    String(stats.total) +
                    ' components'
                  }
                />
              </Card>
              <Card padding={4}>
                <Stat
                  size="sm"
                  label="Average score"
                  value={stats.average == null ? '—' : stats.average.toFixed(1)}
                  description={
                    stats.scored > 0
                      ? 'Across ' + String(stats.scored) + ' scored components'
                      : 'No scored components'
                  }
                />
              </Card>
            </Grid>
          </VStack>
        </Section>

        <Section variant="transparent" padding={4} paddingBlock={0}>
          <Table<ScoreRow>
            data={visible}
            columns={columns}
            plugins={tablePlugins}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
          />
        </Section>

        {ledger?.caveats?.length ? (
          <VStack padding={4}>
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Caveats on the recorded rows</Heading>
                <VStack gap={2}>
                  {ledger.caveats.map(caveat => (
                    <Text key={caveat} type="supporting" color="secondary">
                      {caveat}
                    </Text>
                  ))}
                </VStack>
              </VStack>
            </Card>
          </VStack>
        ) : null}
      </VStack>

      <Drawer
        ref={drawerRef}
        id={AUDIT_PANEL_ID}
        isOpen={isAuditPanelOpen && selectedRow?.entry != null}
        onOpenChange={setIsAuditPanelOpen}
        label={
          selectedRow
            ? selectedRow.component +
              ' ' +
              selectedRow.package +
              ' audit details'
            : 'Component audit details'
        }
        hasScrim={false}
        width={560}>
        {selectedRow ? (
          <Layout
            header={
              <DrawerHeader
                // The title is the focus target on open and on row switch,
                // so the changed audit is announced.
                title={
                  <span tabIndex={-1} data-autofocus>
                    {selectedRow.component}
                  </span>
                }
                subtitle={selectedRow.package + ' component audit'}
                onOpenChange={setIsAuditPanelOpen}
                hasDivider
              />
            }
            content={
              <LayoutContent ref={auditContentRef}>
                <AuditDetails
                  row={selectedRow}
                  currentRubricVersion={ledger?.rubricVersion ?? null}
                />
              </LayoutContent>
            }
          />
        ) : null}
      </Drawer>
    </>
  );
}

const styles = stylex.create({
  auditRow: {
    cursor: 'pointer',
  },
  filterToken: {
    backgroundColor: colorVars['--color-neutral'],
    borderRadius: radiusVars['--radius-inner'],
  },
  tabularValue: {
    fontVariantNumeric: 'tabular-nums',
  },
});
