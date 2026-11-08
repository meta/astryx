// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core types for the vibeability test harness
 * @position internal/vibe-tests/src/types.ts
 */

export interface Turn {
  type: 'probe' | 'filler' | 'distractor' | 'recovery';
  prompt: string;
  response: string;
  evaluation?: Evaluation;
}

export interface Evaluation {
  success: boolean;
  componentsUsed: string[];
  componentsExpected: string[];
  /** Escape hatches — kept for backwards compat with existing result JSON files */
  escapeHatches: (string | Record<string, unknown>)[];
  failureMode: string | null;
  confusionSignals: string[];
}

/** Job breakdown for output token analysis */
export interface JobBreakdown {
  componentRouting: number;
  componentConfig: number;
  supplementalStyling: number;
  contentAuthoring: number;
  businessLogic: number;
  boilerplate: number;
  total: number;
}

/** Input token breakdown by doc type */
export interface InputTokenBreakdown {
  /** AGENTS.md - always read */
  agentsMd: number;
  /** principles.md, tokens.md - styling/design guidance */
  designDocs: number;
  /** Component-specific docs (Button.md, TextInput.md, etc.) */
  componentDocs: number;
  /** Prompt and instructions */
  promptOverhead: number;
  /** Total estimated input tokens */
  total: number;
}

/** Full token usage breakdown */
export interface TokenUsageBreakdown {
  input: InputTokenBreakdown;
  output: JobBreakdown;
  total: number;
}

export interface TestResult {
  id: string;
  timestamp: string;
  systemVersion: string;
  model: string;
  persona: string;
  promptCategory: string;
  trajectoryDepth: number;
  prompt: string;
  response: string;
  evaluation: Evaluation;
  fullConversation: Turn[];
  contextWindowUsage: number;
  // Timing and usage metrics
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  // Optional job breakdown
  jobBreakdown?: JobBreakdown;
  // Docs that were read (for input token tracking)
  docsRead?: string[];
}

export type RefinementTarget =
  'skill_doc' | 'component_api' | 'component_naming' | 'examples';

export type EffortEstimate = 'trivial' | 'moderate' | 'significant';

export interface Refinement {
  target: RefinementTarget;
  component: string | null;
  suggestion: string;
  evidence: string[];
  confidence: number;
  effortEstimate: EffortEstimate;
}

export interface AggregateMetrics {
  overallSuccessRate: number;
  byCategory: Record<string, number>;
  byPersona: Record<string, number>;
  degradationCliff: number;
}

export interface Iteration {
  id: string;
  parentIteration: string | null;
  skillDocHash: string;
  refinementsApplied: Refinement[];
  aggregateMetrics: AggregateMetrics;
  analystSummary: string;
  nextRefinements: Refinement[];
  promptsRun: string[];
  promptsTotal: number;
}

export type PromptComplexity = 'simple' | 'moderate' | 'complex';

export interface TestPrompt {
  id: string;
  category: string;
  prompt: string;
  expectedComponents: string[];
  complexity: PromptComplexity;
  /** Follow-up prompts for iterative degradation testing */
  followUps?: string[];
}

export interface TestSet {
  name: string;
  prompts: TestPrompt[];
  holdout?: TestPrompt[];
  fillerPrompts?: string[];
  distractorPrompts?: string[];
  recoveryContext?: string;
}

export type Protocol = 'one-shot' | 'degradation' | 'persona-comparison';

export type PersonaType = 'naive' | 'experienced' | 'adversarial';

export interface RunConfig {
  protocol: Protocol;
  persona: PersonaType;
  model: string;
  skillDocPath: string;
  sample?: number;
  holdout?: boolean;
}

export interface AnalysisResult {
  patterns: string[];
  refinements: Refinement[];
  summary: string;
}

// ============================================================
// Quality Assessment Types
// ============================================================

export type QualityScore = 'good' | 'needs-work' | 'poor';

export interface AccessibilityIssue {
  severity: 'critical' | 'moderate' | 'minor';
  element: string;
  issue: string;
  recommendation: string;
  lineNumber?: number;
}

export interface DesignSystemIssue {
  severity: 'critical' | 'moderate' | 'minor';
  category:
    | 'component-usage'
    | 'token-usage'
    | 'pattern-violation'
    | 'typography-violation';
  issue: string;
  recommendation: string;
  codeSnippet?: string;
}

export interface CodeQualityIssue {
  severity: 'critical' | 'moderate' | 'minor';
  category:
    'state-management' | 'event-handling' | 'typescript' | 'performance';
  issue: string;
  recommendation: string;
  codeSnippet?: string;
}

export interface QualityAssessment {
  accessibility: {
    issues: AccessibilityIssue[];
    score: QualityScore;
  };
  designSystemAdherence: {
    issues: DesignSystemIssue[];
    score: QualityScore;
  };
  codeQuality: {
    issues: CodeQualityIssue[];
    score: QualityScore;
  };
  overallScore: QualityScore;
  summary: string;
}

// ============================================================
// Universal Evaluation Types (6 dimensions, 0-100 each)
// ============================================================

/**
 * The 6 evaluation dimensions:
 * - correctness, accessibility, codeQuality, efficiency, maintainability:
 *   deterministic static analysis of generated code
 * - design: vision LLM evaluation of rendered screenshots vs ideal reference
 *   images. Scores layout fidelity, visual hierarchy, spacing, component
 *   fidelity, and color/theming. Optional — only available when ideal images
 *   exist and a vision model is configured.
 */
export type UniversalDimension =
  | 'correctness'
  | 'accessibility'
  | 'codeQuality'
  | 'efficiency'
  | 'maintainability'
  | 'design';

export interface UniversalFinding {
  rule: string;
  severity?: 'critical' | 'moderate' | 'minor';
  detail: string;
  line?: number;
  count?: number;
  example?: string;
}

export interface EfficiencyMetrics {
  totalLines: number;
  codeLines: number;
  stylingLines: number;
  boilerplateLines: number;
  logicLines: number;
  stylingRatio: number;
  boilerplateRatio: number;
  decisionsPerElement: number;
  elementCount: number;
  stylingDecisionCount: number;
  duplicateRatio: number;
}

export interface MaintainabilityMetrics {
  semanticRatio: number;
  magicValueCount: number;
  semanticValueCount: number;
  avgStateSpread: number;
  darkModeSupport: boolean;
}

export interface DimensionScore<M = undefined> {
  score: number;
  findings?: UniversalFinding[];
  metrics?: M;
}

export interface DesignMetrics {
  layout: number;
  hierarchy: number;
  spacing: number;
  components: number;
  color: number;
  passCount: number;
  /** Max variance across passes (stability indicator) */
  maxVariance: number;
}

export interface UniversalScore {
  correctness: DimensionScore;
  accessibility: DimensionScore;
  codeQuality: DimensionScore;
  efficiency: DimensionScore<EfficiencyMetrics>;
  maintainability: DimensionScore<MaintainabilityMetrics>;
  /** Design dimension — null when no ideal reference image exists for the prompt */
  design?: DimensionScore<DesignMetrics> | null;
}

export type MetricQuality =
  'measured' | 'derived' | 'estimated' | 'unavailable';

export interface DurationMetric {
  valueMs: number | null;
  source:
    | 'provenance'
    | 'provenance-timestamps'
    | 'result-metadata'
    | 'filesystem'
    | 'unavailable';
  quality: MetricQuality;
}

export interface TokenMetric {
  inputTokens: number | null;
  outputTokens: number | null;
  source: string;
  quality: 'complete' | 'incomplete' | 'estimated';
  complete: boolean;
}

export interface ExecutionProvenanceFilter {
  harness?: string;
  model?: string;
  fixture?: string;
  condition?: string;
}

export interface UniversalRunSummary {
  promptId: string;
  taskId: string;
  harness: string;
  model: string;
  effort?: string;
  fixture?: string;
  condition?: string;
  rep?: number;
  executionStatus?: string;
  score: UniversalScore;
  duration: DurationMetric;
  usage: TokenMetric;
}

export interface ExecutionGroupSummary {
  dimensions: {
    harness?: string;
    model?: string;
    fixture?: string;
    condition?: string;
  };
  runCount: number;
  averageScore: number;
  averageDurationMs: number | null;
  usage: {
    complete: boolean;
    completeRuns: number;
    incompleteRuns: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export interface ExecutionBreakdown {
  runs: UniversalRunSummary[];
  byHarnessModel: ExecutionGroupSummary[];
  byFixture: ExecutionGroupSummary[];
  byCondition: ExecutionGroupSummary[];
}

export interface PromptCostMetrics {
  durationMs: number;
  durationSource: DurationMetric['source'];
  durationQuality: MetricQuality;
  outputChars: number;
  outputLines: number;
  docsRead: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  tokenSource: string;
  tokenQuality: TokenMetric['quality'];
  usageComplete: boolean;
  /** Legacy estimates retained independently of selected provenance usage. */
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface CostMetrics {
  totalDurationMs: number;
  avgDurationMs: number;
  avgOutputChars: number;
  avgOutputLines: number;
  avgDocsRead: number;
  inputTokens: number | null;
  outputTokens: number | null;
  usageComplete: boolean;
  completeUsageRuns: number;
  incompleteUsageRuns: number;
  durationSources: Record<string, number>;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  byPrompt: Record<string, PromptCostMetrics>;
}

export interface UniversalAggregate {
  averages: Record<UniversalDimension, number>;
  overall: number;
  byPrompt: Record<string, UniversalScore>;
  byCategory: Record<string, Record<UniversalDimension, number>>;
  darkModeRate: number;
  cost?: CostMetrics;
  execution?: ExecutionBreakdown;
}

export type TargetName = 'astryx' | 'astryx-tailwind' | 'baseline' | 'html';

export interface UniversalComparison {
  astryx: UniversalAggregate;
  baseline: UniversalAggregate;
  html?: UniversalAggregate;
  astryxTailwind?: UniversalAggregate;
  winners: Record<UniversalDimension, TargetName | 'tie'>;
  byPrompt: Record<
    string,
    {
      astryx: UniversalScore;
      baseline: UniversalScore;
      html?: UniversalScore;
      astryxTailwind?: UniversalScore;
      winner: TargetName | 'tie';
    }
  >;
}
