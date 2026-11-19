// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Filterable template audit roster with live summary metrics and details.
 * @input Generated page/block registries and the sandbox template audit data.
 * @output Filter-aware audit table, drawer, and identity-bound audit prompts.
 * @position Sandbox template catalog at /templates/.
 */

'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import NextLink from '../../../router';

import {Badge} from '@astryxdesign/core/Badge';
import type {BadgeVariant} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Code} from '@astryxdesign/core/Code';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, Layout, LayoutContent, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {useToast} from '@astryxdesign/core/Toast';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Stat} from '@astryxdesign/lab';

import {
  TEMPLATE_AUDIT_CATEGORIES,
  TEMPLATE_LEDGER_FETCH_TIMEOUT_MS,
  TEMPLATE_LEDGER_URL,
  TEMPLATE_RUBRIC_URL,
  isTemplateAuditLedger,
  templateAuditsById,
  templateAuditPrompt,
  templateLedgerSeed,
} from '../../../data/templateAudits';
import type {
  TemplateAudit,
  TemplateAuditCategoryStatus,
  TemplateAuditGrade,
  TemplateAuditLedger,
} from '../../../data/templateAudits';
import {blocks} from '../../../generated/blockRegistry';
import {templates} from '../../../generated/templateRegistry';
import {SearchIcon} from '../../icons';

interface TemplateRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  href: string;
  type: 'Page' | 'Block';
  component: string;
  codePath: string;
  docPath: string;
  isReady: boolean;
  isShowcase: boolean;
  audit: TemplateAudit | null;
  audited: boolean;
  grade: TemplateAuditGrade | 'TBD';
  score: number | null;
  weakest: string | null;
  lastAudited: string | null;
}

const GRADE_VARIANT: Record<TemplateAuditGrade, BadgeVariant> = {
  A: 'success',
  B: 'success',
  C: 'warning',
  D: 'warning',
  F: 'error',
};

const CATEGORY_STATUS_LABELS: Record<TemplateAuditCategoryStatus, string> = {
  published: 'Published',
  inferred: 'Inferred',
  intermediate: 'Intermediate',
  unresolved: 'Unresolved',
};

const CATEGORY_STATUS_VARIANTS: Record<
  TemplateAuditCategoryStatus,
  BadgeVariant
> = {
  published: 'success',
  inferred: 'info',
  intermediate: 'warning',
  unresolved: 'neutral',
};

const AUDIT_PANEL_ID = 'template-audit-details';
const REPO_URL = 'https://github.com/meta/astryx';
const INTERACTIVE_ROW_DESCENDANT =
  'a, button, input, select, textarea, [role="button"], [role="link"], ' +
  '[role="checkbox"], [role="menu"], [role="menuitem"], ' +
  '[contenteditable="true"]';

function weakestCategory(audit: TemplateAudit | null): string | null {
  if (!audit) {
    return null;
  }

  let weakest: {title: string; score: number; max: number} | null = null;
  for (const definition of TEMPLATE_AUDIT_CATEGORIES) {
    const category = audit.categories[definition.id];
    if (
      typeof category?.score !== 'number' ||
      (category.status !== 'published' && category.status !== 'inferred')
    ) {
      continue;
    }
    if (
      !weakest ||
      category.score / definition.max < weakest.score / weakest.max
    ) {
      weakest = {
        title: definition.title,
        score: category.score,
        max: definition.max,
      };
    }
  }

  return weakest
    ? weakest.title + ' (' + weakest.score + '/' + weakest.max + ')'
    : null;
}

interface TemplateRowInput {
  id: string;
  name: string;
  description: string;
  href: string;
  type: 'Page' | 'Block';
  component: string;
  codePath: string;
  docPath: string;
  isReady: boolean;
  isShowcase: boolean;
}

function makeRow(
  {
    id,
    name,
    description,
    href,
    type,
    component,
    codePath,
    docPath,
    isReady,
    isShowcase,
  }: TemplateRowInput,
  audit: TemplateAudit | null,
): TemplateRow {
  return {
    id,
    name,
    description,
    href,
    type,
    component,
    codePath,
    docPath,
    isReady,
    isShowcase,
    audit,
    audited: audit != null,
    grade: audit?.grade ?? 'TBD',
    score: audit?.score ?? null,
    weakest: weakestCategory(audit),
    lastAudited: audit?.lastAudited ?? null,
  };
}

const templateRoster: TemplateRowInput[] = [
  ...templates.map(template => ({
    id: 'page/' + template.slug,
    name: template.name,
    description: template.description,
    href: template.href,
    type: 'Page' as const,
    component: 'n/a',
    codePath:
      'packages/cli/assets/templates/pages/' + template.slug + '/page.tsx',
    docPath:
      'packages/cli/assets/templates/pages/' +
      template.slug +
      '/template.doc.mjs',
    isReady: template.isReady,
    isShowcase: false,
  })),
  ...blocks.map(block => ({
    id: 'block/' + block.slug,
    name: block.name,
    description: block.description,
    href: block.href,
    type: 'Block' as const,
    component: block.component,
    codePath:
      'packages/cli/assets/templates/blocks/components/' +
      block.component +
      '/' +
      block.slug +
      '.tsx',
    docPath:
      'packages/cli/assets/templates/blocks/components/' +
      block.component +
      '/' +
      block.slug +
      '.doc.mjs',
    isReady: block.isReady,
    isShowcase: block.isShowcase,
  })),
];

function buildRows(ledger: TemplateAuditLedger | null): TemplateRow[] {
  const audits = templateAuditsById(ledger);
  return templateRoster
    .map(template => makeRow(template, audits[template.id] ?? null))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type TemplateAuditFilter = 'audited' | 'tbd';
type TemplateTypeFilter = 'page' | 'block';

const TEMPLATE_AUDIT_FILTER_OPTIONS = [
  {value: 'audited', label: 'Audited'},
  {value: 'tbd', label: 'TBD'},
];

const TEMPLATE_TYPE_FILTER_OPTIONS = [
  {value: 'page', label: 'Page'},
  {value: 'block', label: 'Block'},
];

const ACTIONS_TRIGGER_TEST_ID = 'template-audit-row-actions';

function CopyButton({text, label}: {text: string; label: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
    />
  );
}

function promptFor(row: TemplateRow): string {
  return templateAuditPrompt({
    id: row.id,
    name: row.name,
    type: row.type,
    codePath: row.codePath,
    docPath: row.docPath,
  });
}

function TemplateRowActions({
  row,
  onViewAudit,
}: {
  row: TemplateRow;
  onViewAudit: (row: TemplateRow, trigger: HTMLElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const copyAuditPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptFor(row));
      toast({
        body: 'Audit prompt copied',
        uniqueID: 'template-audit-prompt-copied',
      });
    } catch {
      toast({
        body: 'Could not copy the audit prompt',
        type: 'error',
        uniqueID: 'template-audit-prompt-copy-error',
      });
    }
  };

  return (
    <MoreMenu
      ref={triggerRef}
      size="sm"
      label={'Actions for ' + row.name}
      data-testid={ACTIONS_TRIGGER_TEST_ID}
      items={[
        {
          label: 'Copy audit prompt',
          onClick: () => {
            void copyAuditPrompt();
          },
        },
        ...(row.audit
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

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(INTERACTIVE_ROW_DESCENDANT) != null
  );
}

function githubSource(path: string, commit = 'main'): string {
  return REPO_URL + '/blob/' + commit + '/' + path;
}

function TemplateAuditDetails({row}: {row: TemplateRow}) {
  const audit = row.audit;
  if (!audit) {
    return null;
  }
  const screenshotEvidence = audit.evidence.filter(evidence =>
    evidence.label.toLowerCase().includes('screenshot'),
  );

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge
            label={row.type}
            variant={row.type === 'Page' ? 'info' : 'neutral'}
          />
          {row.isShowcase ? <Badge label="Showcase" variant="info" /> : null}
        </HStack>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge variant={GRADE_VARIANT[audit.grade]} label={audit.grade} />
          <Text type="large" xstyle={styles.tabularValue}>
            {audit.score} / 100
          </Text>
        </HStack>
        <Link href={row.href} as={NextLink} target="_blank">
          Open template preview
        </Link>
      </VStack>

      {audit.status === 'historical' ? (
        <Section variant="muted" padding={3}>
          <Text type="supporting">
            This score was recovered from a historical merge record. It has not
            been re-run against the current template at HEAD, so use it as
            provenance rather than a fresh certification.
          </Text>
        </Section>
      ) : null}

      <VStack gap={3}>
        <Heading level={3}>Audit metadata</Heading>
        <MetadataList columns="multi" label={{position: 'top'}}>
          <MetadataListItem label="Last audited">
            {audit.lastAudited}
          </MetadataListItem>
          <MetadataListItem label="Audit status">
            {audit.status === 'current' ? 'Current' : 'Historical'}
          </MetadataListItem>
          <MetadataListItem label="Rubric">
            {audit.rubricVersion}
          </MetadataListItem>
          <MetadataListItem label="Current grade threshold">
            B starts at 75
          </MetadataListItem>
          <MetadataListItem label="For component">
            {row.component === 'n/a' ? 'Page template' : row.component}
          </MetadataListItem>
          <MetadataListItem label="Audited commit">
            <Link href={REPO_URL + '/commit/' + audit.commit} isExternalLink>
              <Code>{audit.commit.slice(0, 12)}</Code>
            </Link>
          </MetadataListItem>
          {audit.recordedGrade ? (
            <MetadataListItem label="Recorded grade wording">
              {audit.recordedGrade}
            </MetadataListItem>
          ) : null}
        </MetadataList>
      </VStack>

      <Divider />

      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>Rubric categories</Heading>
          <Text type="supporting" color="secondary">
            Unpublished category scores stay blank; they are not reconstructed
            from the total.
          </Text>
        </VStack>
        {TEMPLATE_AUDIT_CATEGORIES.map(definition => {
          const category = audit.categories[definition.id];
          return (
            <Section key={definition.id} variant="muted" padding={3}>
              <VStack gap={2}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Text weight="medium">{definition.title}</Text>
                  <Text xstyle={styles.tabularValue}>
                    {typeof category?.score === 'number'
                      ? category.score + ' / ' + definition.max
                      : '— / ' + definition.max}
                  </Text>
                  <Badge
                    variant={
                      category
                        ? CATEGORY_STATUS_VARIANTS[category.status]
                        : 'neutral'
                    }
                    label={
                      category
                        ? CATEGORY_STATUS_LABELS[category.status]
                        : 'Not published'
                    }
                  />
                </HStack>
                {category?.note ? (
                  <Text type="supporting" color="secondary">
                    {category.note}
                  </Text>
                ) : null}
              </VStack>
            </Section>
          );
        })}
      </VStack>

      <Divider />

      <VStack gap={3}>
        <Heading level={3}>Findings</Heading>
        {audit.findings.length ? (
          audit.findings.map((finding, index) => (
            <Text key={row.id + '-finding-' + String(index)}>• {finding}</Text>
          ))
        ) : (
          <Text color="secondary">No findings were published.</Text>
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={3}>Top fixes</Heading>
        {audit.topFixes.length ? (
          audit.topFixes.map((fix, index) => (
            <Text key={row.id + '-fix-' + String(index)}>
              {index + 1}. {fix}
            </Text>
          ))
        ) : (
          <Text color="secondary">
            No ordered fix list was published with this historical score.
          </Text>
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={3}>Screenshot tests</Heading>
        {screenshotEvidence.length ? (
          screenshotEvidence.map(evidence =>
            evidence.href ? (
              <Link key={evidence.label} href={evidence.href} isExternalLink>
                {evidence.label}
              </Link>
            ) : (
              <Text key={evidence.label}>{evidence.label}</Text>
            ),
          )
        ) : (
          <Text color="secondary">
            No screenshot-test evidence was published in the recovered record.
            The re-audit prompt requests light, dark, and responsive browser
            coverage.
          </Text>
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={3}>Evidence</Heading>
        {audit.evidence.map(evidence =>
          evidence.href ? (
            <Link key={evidence.label} href={evidence.href} isExternalLink>
              {evidence.label}
            </Link>
          ) : (
            <Text key={evidence.label}>{evidence.label}</Text>
          ),
        )}
      </VStack>

      <Section variant="muted" padding={3}>
        <VStack gap={2}>
          <Text weight="medium">Audit notes</Text>
          <Text type="supporting">{audit.notes}</Text>
        </VStack>
      </Section>

      <Divider />

      <VStack gap={3}>
        <Heading level={3}>Source and re-audit</Heading>
        <Link
          href={githubSource(row.codePath, audit.commit)}
          isExternalLink
          type="supporting">
          {row.codePath}
        </Link>
        <Link
          href={githubSource(row.docPath, audit.commit)}
          isExternalLink
          type="supporting">
          {row.docPath}
        </Link>
        <HStack gap={2} wrap="wrap">
          <CopyButton text={promptFor(row)} label="Copy re-audit prompt" />
          <CopyButton text={row.codePath} label="Copy code path" />
          <CopyButton text={row.docPath} label="Copy doc path" />
        </HStack>
      </VStack>
    </VStack>
  );
}

export default function TemplatesPage() {
  const [ledger, setLedger] = useState<TemplateAuditLedger | null>(
    templateLedgerSeed,
  );
  const [query, setQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<TemplateAuditFilter | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<TemplateTypeFilter | null>(
    'page',
  );
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [isAuditPanelOpen, setIsAuditPanelOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const auditContentRef = useRef<HTMLDivElement>(null);
  const auditTriggerRef = useRef<HTMLElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => buildRows(ledger), [ledger]);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selectedRowId) ?? null,
    [rows, selectedRowId],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TEMPLATE_LEDGER_FETCH_TIMEOUT_MS,
    );

    fetch(TEMPLATE_LEDGER_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(response =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(String(response.status))),
      )
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }
        if (!isTemplateAuditLedger(data)) {
          throw new Error('not a template audit ledger');
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

  const openAudit = useCallback(
    (row: TemplateRow, trigger?: HTMLElement | null) => {
      if (!row.audit) {
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

  const columns = useMemo<TableColumn<TemplateRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Template',
        width: proportional(3),
        renderCell: row => (
          <VStack gap={1}>
            <Link href={row.href} as={NextLink} target="_blank">
              {row.name}
            </Link>
            <HStack gap={2} vAlign="center">
              <Text type="supporting" color="secondary">
                {row.type}
              </Text>
            </HStack>
          </VStack>
        ),
      },
      {
        key: 'grade',
        header: 'Grade',
        width: pixel(88),
        renderCell: row =>
          row.audit ? (
            <Badge
              variant={GRADE_VARIANT[row.audit.grade]}
              label={row.audit.grade}
            />
          ) : (
            <Badge label="TBD" />
          ),
      },
      {
        key: 'score',
        header: 'Score',
        width: pixel(80),
        renderCell: row => (
          <Text xstyle={styles.tabularValue}>{row.score ?? '—'}</Text>
        ),
      },
      {
        key: 'weakest',
        header: 'Weakest rubric area',
        width: proportional(2),
        renderCell: row => (
          <Text type="supporting" color="secondary">
            {row.weakest ?? '—'}
          </Text>
        ),
      },
      {
        key: 'lastAudited',
        header: 'Last audited',
        width: pixel(120),
        renderCell: row =>
          row.audit ? (
            <Text type="supporting">{row.audit.lastAudited}</Text>
          ) : (
            <Text type="supporting" color="secondary">
              never
            </Text>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'end',
        width: pixel(88),
        renderCell: row => (
          <TemplateRowActions row={row} onViewAudit={openAudit} />
        ),
      },
    ],
    [openAudit],
  );

  const auditRowPlugin = useMemo<TablePlugin<TemplateRow>>(
    () => ({
      transformBodyRow(props, row) {
        if (!row.audit) {
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
                `[data-testid="${ACTIONS_TRIGGER_TEST_ID}"]`,
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

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter(row => {
      if (
        normalizedQuery &&
        ![row.name, row.description, row.component, row.type].some(value =>
          value.toLowerCase().includes(normalizedQuery),
        )
      ) {
        return false;
      }
      if (auditFilter === 'audited' && !row.audited) {
        return false;
      }
      if (auditFilter === 'tbd' && row.audited) {
        return false;
      }
      if (typeFilter && row.type.toLowerCase() !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [auditFilter, query, rows, typeFilter]);

  const stats = useMemo(() => {
    const audited = visible.filter(row => row.audit != null);
    const scores = audited.flatMap(row =>
      typeof row.score === 'number' ? [row.score] : [],
    );
    const averageScore = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;

    return {
      audited: audited.length,
      total: visible.length,
      coverage: visible.length
        ? Math.round((audited.length / visible.length) * 1000) / 10
        : 0,
      averageScore:
        averageScore == null ? null : Math.round(averageScore * 10) / 10,
    };
  }, [visible]);

  const hasActiveFilters =
    auditFilter != null || typeFilter != null || query !== '';

  const clearAllFilters = () => {
    setAuditFilter(null);
    setTypeFilter(null);
    setQuery('');
  };

  return (
    <>
      <VStack gap={0} width="100%">
        <Section variant="transparent" padding={4}>
          <VStack gap={5}>
            <HStack gap={4} hAlign="between" vAlign="start" wrap="wrap">
              <VStack gap={2} maxWidth="76ch">
                <Heading level={1}>Template Audits</Heading>
                <Text>
                  Choose Actions → Copy audit prompt, then run it against the
                  template in the repository. Record and publish the completed
                  audit to the central template ledger. Its score, date, and
                  details appear here automatically; templates without a ledger
                  record remain TBD.
                </Text>
                <Link href={TEMPLATE_RUBRIC_URL} isExternalLink>
                  How official templates are graded
                </Link>
              </VStack>
              <Text type="supporting" color="secondary">
                Last updated {ledger?.updated ?? 'not available'}
              </Text>
            </HStack>

            <Toolbar
              label="Template table filters"
              size="sm"
              gap={2}
              xstyle={styles.filterToolbar}
              startContent={
                <>
                  <Selector
                    label="Audit status"
                    isLabelHidden
                    placeholder="Audit status"
                    variant="ghost"
                    hasClear
                    value={auditFilter}
                    onChange={value =>
                      setAuditFilter(
                        value === 'audited' || value === 'tbd' ? value : null,
                      )
                    }
                    options={TEMPLATE_AUDIT_FILTER_OPTIONS}
                    controlXstyle={styles.filterToken}
                  />
                  <Selector
                    label="Template type"
                    isLabelHidden
                    placeholder="Type"
                    variant="ghost"
                    hasClear
                    value={typeFilter}
                    onChange={value =>
                      setTypeFilter(
                        value === 'page' || value === 'block' ? value : null,
                      )
                    }
                    options={TEMPLATE_TYPE_FILTER_OPTIONS}
                    controlXstyle={styles.filterToken}
                  />
                  <Text type="supporting" color="secondary">
                    {visible.length}{' '}
                    {visible.length === 1 ? 'result' : 'results'}
                  </Text>
                  {hasActiveFilters ? (
                    <>
                      <Text type="supporting" color="secondary">
                        ·
                      </Text>
                      <Button
                        variant="ghost"
                        label="Clear all"
                        onClick={clearAllFilters}
                      />
                    </>
                  ) : null}
                </>
              }
              endContent={
                <TextInput
                  ref={filterInputRef}
                  label="Search templates"
                  isLabelHidden
                  placeholder="Search templates…"
                  value={query}
                  onChange={setQuery}
                  startIcon={SearchIcon}
                  hasClear
                  width={240}
                />
              }
            />

            <Grid columns={{minWidth: 240, max: 2, repeat: 'fit'}} gap={4}>
              <Card padding={4}>
                <Stat
                  size="sm"
                  label="Audited"
                  value={`${stats.coverage}%`}
                  description={`${stats.audited} of ${stats.total} templates`}
                />
              </Card>
              <Card padding={4}>
                <Stat
                  size="sm"
                  label="Average score"
                  value={
                    stats.averageScore == null
                      ? '—'
                      : stats.averageScore.toFixed(1)
                  }
                  description={
                    stats.audited
                      ? 'Across audited templates'
                      : 'No audited templates'
                  }
                />
              </Card>
            </Grid>
          </VStack>
        </Section>

        <Section variant="transparent" padding={4} paddingBlock={0}>
          <Table<TemplateRow>
            data={visible}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
            plugins={{auditDetails: auditRowPlugin}}
          />
        </Section>

        {ledger?.caveats?.length ? (
          <Section variant="transparent" padding={4}>
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Caveats on the recorded rows</Heading>
                {ledger.caveats.map(caveat => (
                  <Text key={caveat} type="supporting" color="secondary">
                    {caveat}
                  </Text>
                ))}
              </VStack>
            </Card>
          </Section>
        ) : null}
      </VStack>

      <Drawer
        ref={drawerRef}
        id={AUDIT_PANEL_ID}
        isOpen={isAuditPanelOpen && selectedRow?.audit != null}
        onOpenChange={setIsAuditPanelOpen}
        label={
          selectedRow
            ? selectedRow.name + ' template audit details'
            : 'Template audit details'
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
                    {selectedRow.name}
                  </span>
                }
                onOpenChange={setIsAuditPanelOpen}
                hasDivider
              />
            }
            content={
              <LayoutContent ref={auditContentRef}>
                <TemplateAuditDetails row={selectedRow} />
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
  filterToolbar: {
    width: '100%',
  },
  filterToken: {
    backgroundColor: colorVars['--color-neutral'],
    borderRadius: radiusVars['--radius-inner'],
  },
  tabularValue: {
    fontVariantNumeric: 'tabular-nums',
  },
});
