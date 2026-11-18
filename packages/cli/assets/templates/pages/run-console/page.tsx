// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Run Console: launch a run of a pipeline, a job or a test suite, watch its
 * progress, read its logs, and read its results.
 *
 *   List view: header | status tabs | run table
 *   Run view:  header with actions | summary and progress | steps |
 *              Logs and Results tabs
 *
 * Choosing a run opens its run view in place of the table; Back returns to
 * the table. On a narrow screen the table keeps the columns a reader scans
 * first, and the run view stacks.
 */

import {useState} from 'react';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Table} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {useToast} from '@astryxdesign/core/Toast';
import {Token} from '@astryxdesign/core/Token';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {rtlStyles} from '@astryxdesign/core/utils';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/react/24/outline';

type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
type TestStatus = 'passed' | 'failed' | 'skipped';
type Trigger = 'push' | 'schedule' | 'manual';

interface Step {
  name: string;
  status: StepStatus;
  /** Seconds, or null while the step has not finished. */
  duration: number | null;
  log: string;
}

interface TestResult {
  name: string;
  suite: string;
  status: TestStatus;
  /** Milliseconds. */
  duration: number;
  message?: string;
}

interface Run extends Record<string, unknown> {
  id: string;
  number: number;
  pipeline: string;
  branch: string;
  commit: string;
  trigger: Trigger;
  status: RunStatus;
  /** ISO time, or null while the run is queued. */
  startedAt: string | null;
  /** Seconds, or null while the run has not finished. */
  duration: number | null;
  /** Percent of steps done, for a running run. */
  progress: number;
  steps: Step[];
  tests: TestResult[];
}

const PIPELINES = ['web-app ci', 'api integration tests', 'nightly e2e'];

const STEP_NAMES = ['Checkout', 'Install', 'Build', 'Test', 'Deploy preview'];

/** The test runner's output for a finished test step, from its results. */
function testLog(tests: TestResult[]): string {
  const lines = ['$ npm test -- --ci'];
  for (const suite of [...new Set(tests.map(t => t.suite))]) {
    const inSuite = tests.filter(t => t.suite === suite);
    const failed = inSuite.filter(t => t.status === 'failed');
    lines.push(
      `${failed.length > 0 ? 'FAIL' : 'PASS'}  src/${suite}/${suite}.test.ts (${inSuite.length} ${inSuite.length === 1 ? 'test' : 'tests'})`,
    );
    for (const t of failed) {
      lines.push(`  x ${t.name} (${t.duration} ms)`, `    ${t.message ?? ''}`);
    }
  }
  const count = (status: TestStatus) =>
    tests.filter(t => t.status === status).length;
  const parts = [
    count('failed') > 0 ? `${count('failed')} failed` : null,
    `${count('passed')} passed`,
    count('skipped') > 0 ? `${count('skipped')} skipped` : null,
  ].filter(Boolean);
  lines.push(`Tests: ${parts.join(', ')}, ${tests.length} total`);
  return lines.join('\n');
}

/** Log text for one step, in the shape a CI runner prints it. */
function logFor(step: string, status: StepStatus, tests: TestResult[]): string {
  if (status === 'pending') {
    return 'Not started: waiting for the earlier steps';
  }
  if (status === 'skipped') {
    return 'Skipped: the run ended before this step';
  }
  switch (step) {
    case 'Checkout':
      return [
        '$ git fetch --depth 1 origin',
        '$ git checkout --force FETCH_HEAD',
        'HEAD is now at the requested commit',
      ].join('\n');
    case 'Install':
      return [
        '$ npm ci',
        'added 1,284 packages',
        'found 0 vulnerabilities',
      ].join('\n');
    case 'Build':
      return [
        '$ npm run build',
        'Compiling 412 modules',
        status === 'failed'
          ? 'error: Cannot find module "./config/regions" from src/server.ts'
          : 'Build finished; output written to dist/',
      ].join('\n');
    case 'Test':
      return status === 'running'
        ? [
            '$ npm test -- --ci',
            'PASS  src/cart/cart.test.ts',
            'PASS  src/auth/auth.test.ts',
            'RUNS  src/checkout/checkout.test.ts',
          ].join('\n')
        : testLog(tests);
    default:
      return [
        '$ npm run deploy:preview',
        'Uploaded 64 files',
        'Preview is live',
      ].join('\n');
  }
}

/**
 * The steps of a run whose steps before `at` passed and whose step `at`
 * ended as `last`; the steps after it are pending or skipped.
 */
function steps(
  at: number,
  last: StepStatus,
  durations: number[],
  tests: TestResult[] = [],
): Step[] {
  return STEP_NAMES.map((name, i) => {
    const status: StepStatus =
      i < at
        ? 'passed'
        : i === at
          ? last
          : last === 'running' || last === 'pending'
            ? 'pending'
            : 'skipped';
    const done = status === 'passed' || status === 'failed';
    return {
      name,
      status,
      duration: done ? (durations[i] ?? null) : null,
      log: logFor(name, status, tests),
    };
  });
}

const PASSING_TESTS: TestResult[] = [
  {
    name: 'adds an item to the cart',
    suite: 'cart',
    status: 'passed',
    duration: 41,
  },
  {
    name: 'merges a guest cart on sign-in',
    suite: 'cart',
    status: 'passed',
    duration: 63,
  },
  {
    name: 'refreshes an expired session',
    suite: 'auth',
    status: 'passed',
    duration: 118,
  },
  {
    name: 'calculates tax for a split shipment',
    suite: 'checkout',
    status: 'passed',
    duration: 207,
  },
  {
    name: 'shows the order summary',
    suite: 'checkout',
    status: 'passed',
    duration: 95,
  },
  {
    name: 'renders the gift wrap option',
    suite: 'checkout',
    status: 'skipped',
    duration: 0,
  },
];

const FAILING_TESTS: TestResult[] = [
  {
    name: 'applies a saved discount code',
    suite: 'checkout',
    status: 'failed',
    duration: 2104,
    message: 'Expected total 84.00, received 96.00',
  },
  {
    name: 'retries a declined card once',
    suite: 'checkout',
    status: 'failed',
    duration: 1880,
    message: 'Timed out waiting for the payment response',
  },
  ...PASSING_TESTS,
];

const DURATIONS = [6, 41, 72, 188, 35];

// Deterministic fixtures: fixed ISO times, no clocks, no randomness.
const RUNS: Run[] = [
  {
    id: 'run-1048',
    number: 1048,
    pipeline: 'web-app ci',
    branch: 'feature/checkout-redesign',
    commit: '3f9c2ab',
    trigger: 'push',
    status: 'running',
    startedAt: '2026-06-30T16:42:00Z',
    duration: null,
    progress: 60,
    steps: steps(3, 'running', DURATIONS),
    tests: [],
  },
  {
    id: 'run-1047',
    number: 1047,
    pipeline: 'api integration tests',
    branch: 'fix/rate-limit-retry',
    commit: 'b81e07d',
    trigger: 'push',
    status: 'failed',
    startedAt: '2026-06-30T16:05:00Z',
    duration: 307,
    progress: 100,
    steps: steps(3, 'failed', DURATIONS, FAILING_TESTS),
    tests: FAILING_TESTS,
  },
  {
    id: 'run-1046',
    number: 1046,
    pipeline: 'web-app ci',
    branch: 'main',
    commit: '9d4a611',
    trigger: 'push',
    status: 'passed',
    startedAt: '2026-06-30T15:20:00Z',
    duration: 342,
    progress: 100,
    steps: steps(5, 'passed', DURATIONS, PASSING_TESTS),
    tests: PASSING_TESTS,
  },
  {
    id: 'run-1045',
    number: 1045,
    pipeline: 'nightly e2e',
    branch: 'main',
    commit: '9d4a611',
    trigger: 'schedule',
    status: 'passed',
    startedAt: '2026-06-30T03:00:00Z',
    duration: 1265,
    progress: 100,
    steps: steps(5, 'passed', [8, 52, 90, 1080, 35], PASSING_TESTS),
    tests: PASSING_TESTS,
  },
  {
    id: 'run-1044',
    number: 1044,
    pipeline: 'web-app ci',
    branch: 'chore/upgrade-bundler',
    commit: '5c27e90',
    trigger: 'push',
    status: 'failed',
    startedAt: '2026-06-29T22:14:00Z',
    duration: 131,
    progress: 100,
    steps: steps(2, 'failed', DURATIONS),
    tests: [],
  },
  {
    id: 'run-1043',
    number: 1043,
    pipeline: 'api integration tests',
    branch: 'main',
    commit: '7e1f3c4',
    trigger: 'manual',
    status: 'cancelled',
    startedAt: '2026-06-29T19:31:00Z',
    duration: 58,
    progress: 40,
    steps: steps(2, 'skipped', DURATIONS),
    tests: [],
  },
  {
    id: 'run-1049',
    number: 1049,
    pipeline: 'nightly e2e',
    branch: 'release/2.4',
    commit: 'a0c55e2',
    trigger: 'manual',
    status: 'queued',
    startedAt: null,
    duration: null,
    progress: 0,
    steps: steps(0, 'pending', DURATIONS),
    tests: [],
  },
];

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_DOT: Record<
  RunStatus,
  'accent' | 'success' | 'error' | 'neutral'
> = {
  queued: 'neutral',
  running: 'accent',
  passed: 'success',
  failed: 'error',
  cancelled: 'neutral',
};

const STEP_DOT: Record<StepStatus, 'accent' | 'success' | 'error' | 'neutral'> =
  {
    pending: 'neutral',
    running: 'accent',
    passed: 'success',
    failed: 'error',
    skipped: 'neutral',
  };

const STEP_LABEL: Record<StepStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const TRIGGER_LABEL: Record<Trigger, string> = {
  push: 'Push',
  schedule: 'Schedule',
  manual: 'Manual',
};

const TEST_LABEL: Record<TestStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const TEST_TOKEN: Record<TestStatus, 'green' | 'red' | 'gray'> = {
  passed: 'green',
  failed: 'red',
  skipped: 'gray',
};

/** 307 -> "5m 7s". */
function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type Filter = 'all' | 'running' | 'failed' | 'passed';

function matches(run: Run, filter: Filter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'running') {
    return run.status === 'running' || run.status === 'queued';
  }
  return run.status === filter;
}

function RunStatusMark({status}: {status: RunStatus}) {
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot
        variant={STATUS_DOT[status]}
        label={STATUS_LABEL[status]}
        isPulsing={status === 'running'}
      />
      <Text type="body">{STATUS_LABEL[status]}</Text>
    </HStack>
  );
}

function RunTable({
  runs,
  isNarrow,
  onOpen,
}: {
  runs: Run[];
  isNarrow: boolean;
  onOpen: (id: string) => void;
}) {
  const all: TableColumn<Run>[] = [
    {
      key: 'status',
      header: 'Status',
      renderCell: run => <RunStatusMark status={run.status} />,
    },
    {
      key: 'number',
      header: 'Run',
      renderCell: run => (
        <Button
          label={`#${run.number}`}
          variant="ghost"
          size="sm"
          onClick={() => onOpen(run.id)}
        />
      ),
    },
    {key: 'pipeline', header: 'Pipeline'},
    {key: 'branch', header: 'Branch'},
    {
      key: 'trigger',
      header: 'Trigger',
      renderCell: run => TRIGGER_LABEL[run.trigger],
    },
    {
      key: 'duration',
      header: 'Duration',
      renderCell: run =>
        run.status === 'running' ? (
          <ProgressBar
            value={run.progress}
            label={`Run ${run.number} progress`}
            isLabelHidden
          />
        ) : (
          formatDuration(run.duration)
        ),
    },
    {
      key: 'startedAt',
      header: 'Started',
      renderCell: run =>
        run.startedAt ? (
          <Timestamp
            value={run.startedAt}
            format="date_time"
            color="secondary"
          />
        ) : (
          <Text type="body" color="secondary">
            Not started
          </Text>
        ),
    },
  ];
  // A narrow screen keeps what a reader scans first.
  const narrowKeys = ['status', 'number', 'pipeline'];
  const columns = isNarrow
    ? all.filter(column => narrowKeys.includes(column.key))
    : all;
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs here"
        description="Choose another status, or start a run."
        icon={<Icon icon={PlayIcon} size="lg" />}
      />
    );
  }
  return (
    <Table
      data={runs}
      columns={columns}
      idKey="id"
      density="compact"
      textOverflow="truncate"
    />
  );
}

function RunView({
  run,
  onBack,
  onRerun,
  onCancel,
}: {
  run: Run;
  onBack: () => void;
  onRerun: (run: Run) => void;
  onCancel: (id: string) => void;
}) {
  const showToast = useToast();
  const firstOpen =
    run.steps.find(
      step => step.status === 'failed' || step.status === 'running',
    ) ?? run.steps[0];
  const [stepName, setStepName] = useState(firstOpen.name);
  const [tab, setTab] = useState(
    run.tests.length > 0 && run.status === 'failed' ? 'results' : 'logs',
  );
  const step = run.steps.find(s => s.name === stepName) ?? firstOpen;
  const isActive = run.status === 'running' || run.status === 'queued';
  const failed = run.tests.filter(t => t.status === 'failed').length;
  const skipped = run.tests.filter(t => t.status === 'skipped').length;
  const passed = run.tests.length - failed - skipped;
  // Failed tests first, so a reader sees what broke without scrolling.
  const tests = [...run.tests].sort(
    (a, b) => Number(b.status === 'failed') - Number(a.status === 'failed'),
  );
  const testColumns: TableColumn<TestResult & Record<string, unknown>>[] = [
    {
      key: 'status',
      header: 'Result',
      renderCell: t => (
        <Token
          size="sm"
          color={TEST_TOKEN[t.status]}
          label={TEST_LABEL[t.status]}
        />
      ),
    },
    {
      key: 'name',
      header: 'Test',
      renderCell: t => (
        <VStack gap={0}>
          <Text type="body">{t.name}</Text>
          {t.message && (
            <Text type="supporting" color="secondary">
              {t.message}
            </Text>
          )}
        </VStack>
      ),
    },
    {key: 'suite', header: 'Suite'},
    {
      key: 'duration',
      header: 'Time',
      renderCell: t => (t.status === 'skipped' ? '—' : `${t.duration} ms`),
    },
  ];

  return (
    <VStack gap={4}>
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Button
          label="All runs"
          variant="ghost"
          size="sm"
          icon={
            <Icon icon={ArrowLeftIcon} size="sm" xstyle={rtlStyles.mirror} />
          }
          onClick={onBack}
        />
        <StackItem size="fill">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={2}>
              {run.pipeline} #{run.number}
            </Heading>
            <RunStatusMark status={run.status} />
          </HStack>
        </StackItem>
        <HStack gap={2} wrap="wrap">
          {isActive ? (
            <Button
              label="Cancel run"
              variant="secondary"
              size="sm"
              icon={<Icon icon={StopIcon} size="sm" />}
              onClick={() => onCancel(run.id)}
            />
          ) : (
            <Button
              label="Re-run"
              size="sm"
              icon={<Icon icon={ArrowPathIcon} size="sm" />}
              onClick={() => onRerun(run)}
            />
          )}
        </HStack>
      </HStack>

      {run.status === 'running' && (
        <ProgressBar value={run.progress} label="Run progress" hasValueLabel />
      )}

      <MetadataList columns="multi">
        <MetadataListItem label="Branch">
          <Text type="body">{run.branch}</Text>
        </MetadataListItem>
        <MetadataListItem label="Commit">
          <Text type="body">{run.commit}</Text>
        </MetadataListItem>
        <MetadataListItem label="Trigger">
          <Text type="body">{TRIGGER_LABEL[run.trigger]}</Text>
        </MetadataListItem>
        <MetadataListItem label="Started">
          {run.startedAt ? (
            <Timestamp value={run.startedAt} format="date_time" />
          ) : (
            <Text type="body">Not started</Text>
          )}
        </MetadataListItem>
        <MetadataListItem label="Duration">
          <Text type="body">{formatDuration(run.duration)}</Text>
        </MetadataListItem>
      </MetadataList>

      <Divider />

      <VStack gap={2}>
        <Heading level={3}>Steps</Heading>
        <List density="compact" hasDividers listStyle="decimal">
          {run.steps.map(s => (
            <ListItem
              key={s.name}
              label={s.name}
              description={STEP_LABEL[s.status]}
              startContent={
                <StatusDot
                  variant={STEP_DOT[s.status]}
                  label={STEP_LABEL[s.status]}
                  isPulsing={s.status === 'running'}
                />
              }
              endContent={
                <Text type="supporting" color="secondary">
                  {formatDuration(s.duration)}
                </Text>
              }
              isSelected={tab === 'logs' && s.name === step.name}
              onClick={() => {
                setStepName(s.name);
                setTab('logs');
              }}
            />
          ))}
        </List>
      </VStack>

      <VStack gap={3}>
        <TabList value={tab} onChange={setTab} role="tablist" hasDivider>
          <Tab value="logs" label="Logs" panelId="run-logs" />
          <Tab
            value="results"
            label="Results"
            panelId="run-results"
            endContent={
              failed > 0 ? (
                <Badge variant="error" label={String(failed)} />
              ) : undefined
            }
          />
        </TabList>
        {tab === 'logs' ? (
          <VStack gap={2} id="run-logs" role="tabpanel">
            <CodeBlock
              code={step.log}
              language="plaintext"
              title={`${step.name} log`}
              hasLanguageLabel={false}
              hasLineNumbers
              maxHeight={320}
              width="100%"
              size="sm"
              endContent={
                <Button
                  label="Download log"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
                  onClick={() =>
                    // Demo only: replace this toast with the call that performs the action.
                    showToast({
                      body: `Demo: downloading the ${step.name.toLowerCase()} log would start here`,
                      uniqueID: `download-${run.id}-${step.name}`,
                    })
                  }
                />
              }
            />
          </VStack>
        ) : (
          <VStack gap={3} id="run-results" role="tabpanel">
            {run.tests.length === 0 ? (
              <EmptyState
                title="No test results yet"
                description={
                  isActive
                    ? 'This run has not finished its test step.'
                    : 'This run stopped before its test step.'
                }
                isCompact
              />
            ) : (
              <>
                <HStack gap={2} wrap="wrap">
                  <Badge variant="success" label={`${passed} passed`} />
                  <Badge variant="error" label={`${failed} failed`} />
                  <Badge variant="neutral" label={`${skipped} skipped`} />
                </HStack>
                <Table
                  data={tests as (TestResult & Record<string, unknown>)[]}
                  columns={testColumns}
                  idKey="name"
                  density="compact"
                />
              </>
            )}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}

export default function RunConsolePage() {
  const [runs, setRuns] = useState(RUNS);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isNewRunOpen, setIsNewRunOpen] = useState(false);
  const [pipeline, setPipeline] = useState(PIPELINES[0]);
  const [branch, setBranch] = useState('main');
  const isNarrow = useMediaQuery('(max-width: 768px)');

  const open = runs.find(run => run.id === openId) ?? null;
  const visible = runs.filter(run => matches(run, filter));
  const activeCount = runs.filter(
    run => run.status === 'running' || run.status === 'queued',
  ).length;

  /** A queued run of `pipeline` on `branch`, numbered after the newest run. */
  const queue = (from: {pipeline: string; branch: string; commit: string}) => {
    const number = Math.max(...runs.map(run => run.number)) + 1;
    const run: Run = {
      id: `run-${number}`,
      number,
      pipeline: from.pipeline,
      branch: from.branch,
      commit: from.commit,
      trigger: 'manual',
      status: 'queued',
      startedAt: null,
      duration: null,
      progress: 0,
      steps: steps(0, 'pending', DURATIONS),
      tests: [],
    };
    setRuns(prev => [run, ...prev]);
    return run;
  };

  const cancel = (id: string) =>
    setRuns(prev =>
      prev.map(run =>
        run.id === id
          ? {
              ...run,
              status: 'cancelled',
              steps: run.steps.map(s =>
                s.status === 'running' || s.status === 'pending'
                  ? {
                      ...s,
                      status: 'skipped' as const,
                      log: logFor(s.name, 'skipped', run.tests),
                    }
                  : s,
              ),
            }
          : run,
      ),
    );

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <HStack gap={2} vAlign="center">
                <Heading level={1}>Runs</Heading>
                <Text type="supporting" color="secondary">
                  {activeCount} running or queued
                </Text>
              </HStack>
            </StackItem>
            <Button
              label="New run"
              variant="primary"
              size="sm"
              icon={<Icon icon={PlayIcon} size="sm" />}
              onClick={() => setIsNewRunOpen(true)}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          {open ? (
            <RunView
              key={open.id}
              run={open}
              onBack={() => setOpenId(null)}
              onRerun={run => setOpenId(queue(run).id)}
              onCancel={cancel}
            />
          ) : (
            <VStack gap={3}>
              <TabList
                value={filter}
                onChange={value => setFilter(value as Filter)}
                hasDivider>
                <Tab value="all" label="All" />
                <Tab value="running" label="Running" />
                <Tab value="failed" label="Failed" />
                <Tab value="passed" label="Passed" />
              </TabList>
              <RunTable runs={visible} isNarrow={isNarrow} onOpen={setOpenId} />
            </VStack>
          )}
          <Dialog
            isOpen={isNewRunOpen}
            onOpenChange={setIsNewRunOpen}
            purpose="form">
            <Layout
              header={
                <DialogHeader
                  title="Start a run"
                  onOpenChange={setIsNewRunOpen}
                />
              }
              content={
                <LayoutContent padding={4}>
                  <VStack gap={4}>
                    <Selector
                      label="Pipeline"
                      value={pipeline}
                      options={PIPELINES.map(p => ({value: p, label: p}))}
                      onChange={setPipeline}
                    />
                    <TextInput
                      label="Branch"
                      value={branch}
                      onChange={setBranch}
                    />
                  </VStack>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <HStack gap={2} hAlign="end">
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onClick={() => setIsNewRunOpen(false)}
                    />
                    <Button
                      label="Start run"
                      variant="primary"
                      isDisabled={branch.trim() === ''}
                      onClick={() => {
                        queue({
                          pipeline,
                          branch: branch.trim(),
                          commit: 'latest',
                        });
                        setFilter('all');
                        setIsNewRunOpen(false);
                      }}
                    />
                  </HStack>
                </LayoutFooter>
              }
            />
          </Dialog>
        </LayoutContent>
      }
    />
  );
}
