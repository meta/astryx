// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template score-ledger schema, historical seed, and audit prompt.
 * @input Recoverable merge-commit score claims plus the wiki template rubric.
 * @output Versioned template ledger and executable audit-recording prompt.
 * @position Local seed and schema for the proposed wiki template ledger.
 *
 * SYNC: Keep this schema aligned with scripts/template-score-ledger.mjs.
 *
 * The page checks the expected wiki copy at runtime and falls back to this
 * bundled seed, matching the component page's live-ledger behavior without
 * claiming the still-unpublished wiki file is canonical. The seed preserves
 * only explicitly published details and remains historical until re-audited.
 */

export const TEMPLATE_LEDGER_URL =
  'https://raw.githubusercontent.com/wiki/meta/astryx/template-scores.json';

export const TEMPLATE_LEDGER_FETCH_TIMEOUT_MS = 10_000;

export const TEMPLATE_RUBRIC_URL =
  'https://github.com/meta/astryx/wiki/Contributing-Templates#template-grading-rubric';

export type TemplateAuditGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type TemplateAuditCategoryId =
  | 'component_purity'
  | 'icon_purity'
  | 'custom_css'
  | 'layout_structure'
  | 'doc_metadata'
  | 'image_handling'
  | 'code_quality';

export type TemplateAuditCategoryStatus =
  'published' | 'inferred' | 'intermediate' | 'unresolved';

export interface TemplateAuditCategory {
  score: number | null;
  status: TemplateAuditCategoryStatus;
  note?: string;
}

export interface TemplateAuditEvidence {
  label: string;
  href?: string;
}

export interface TemplateAudit {
  id: string;
  score: number;
  /** Grade derived from the current template-rubric thresholds. */
  grade: TemplateAuditGrade;
  /** Grade wording in the historical record, when it differs. */
  recordedGrade?: string;
  status: 'historical' | 'current';
  lastAudited: string;
  commit: string;
  pr?: number;
  rubricVersion: string;
  categories: Partial<Record<TemplateAuditCategoryId, TemplateAuditCategory>>;
  findings: string[];
  topFixes: string[];
  evidence: TemplateAuditEvidence[];
  notes: string;
}

export interface TemplateAuditLedger {
  ledgerVersion: number;
  rubricVersion: string;
  updated: string;
  about?: string;
  caveats?: string[];
  /** Absence from this collection is the only meaning of "not audited". */
  templates: TemplateAudit[];
}

export const TEMPLATE_AUDIT_CATEGORIES: ReadonlyArray<{
  id: TemplateAuditCategoryId;
  title: string;
  max: number;
}> = [
  {id: 'component_purity', title: 'Astryx component purity', max: 30},
  {id: 'icon_purity', title: 'Icon purity', max: 15},
  {id: 'custom_css', title: 'Custom CSS', max: 15},
  {id: 'layout_structure', title: 'Layout & structure', max: 15},
  {id: 'doc_metadata', title: 'Doc metadata', max: 10},
  {id: 'image_handling', title: 'Image handling', max: 5},
  {id: 'code_quality', title: 'Code quality', max: 10},
];

export function templateGrade(score: number): TemplateAuditGrade {
  if (score >= 90) {
    return 'A';
  }
  if (score >= 75) {
    return 'B';
  }
  if (score >= 60) {
    return 'C';
  }
  if (score >= 40) {
    return 'D';
  }
  return 'F';
}

interface HistoricalAuditInput {
  id: string;
  score: number;
  sha: string;
  date: string;
  pr: number;
  recordedGrade?: string;
  categories?: TemplateAudit['categories'];
  findings: string[];
}

function historicalAudit({
  id,
  score,
  sha,
  date,
  pr,
  recordedGrade,
  categories = {},
  findings,
}: HistoricalAuditInput): TemplateAudit {
  const grade = templateGrade(score);
  const gradeNote =
    recordedGrade && recordedGrade !== grade
      ? ` The historical record called this ${recordedGrade}; the table derives ${grade} from the current thresholds.`
      : '';

  return {
    id,
    score,
    grade,
    recordedGrade,
    status: 'historical',
    lastAudited: date.slice(0, 10),
    commit: sha,
    pr,
    rubricVersion: 'Historical template rubric · unversioned',
    categories,
    findings,
    topFixes: [],
    evidence: [
      {
        label: 'Historical merge-commit audit claim',
        href: `https://github.com/meta/astryx/commit/${sha}`,
      },
      {
        label: `Pull request #${pr}`,
        href: `https://github.com/meta/astryx/pull/${pr}`,
      },
    ],
    notes:
      'Recovered from merge-commit prose, not a structured ledger. The score has not been re-run against the current template at HEAD, and unpublished category details must not be inferred.' +
      gradeNote,
  };
}

const audits = [
  historicalAudit({
    id: 'page/centered-hero',
    score: 95,
    sha: '4348786581c77255909acf4055d919771ad6f66b',
    date: '2026-06-10T02:23:39-05:00',
    pr: 2583,
    findings: [
      'Remaining custom CSS is image fill, cap, and radius styling with no component-prop equivalent; tracked by #2582.',
    ],
  }),
  historicalAudit({
    id: 'page/contact-form',
    score: 92,
    sha: '09be607225ce7bdefdcdce31e6f238dd38a26900',
    date: '2026-05-02T21:02:26Z',
    pr: 1967,
    findings: [
      'Improved from 75 to 92 with a responsive Grid, fewer page-level styles, and better card semantics.',
      'Three justified image declarations remained because no general image component existed.',
    ],
  }),
  historicalAudit({
    id: 'page/detail-page',
    score: 97,
    sha: 'c065d978ddaaa914f258d392c25440aee853468a',
    date: '2026-06-10T14:01:25-05:00',
    pr: 2624,
    findings: [
      'Zero raw HTML, proper Layout slots, Thumbnail usage, and responsive panels.',
      'The only recorded deduction was negative-margin tab-row CSS without a component prop; tracked by #2622.',
    ],
  }),
  historicalAudit({
    id: 'page/documentation',
    score: 97,
    sha: '568f239a0a4b4e3c42fd3eb4132fe31f01b885bd',
    date: '2026-04-20T01:54:26Z',
    pr: 1509,
    findings: [
      'Custom CSS fell from six to three justified declarations; centering and wrapping moved to Astryx props.',
    ],
  }),
  historicalAudit({
    id: 'page/editor',
    score: 87,
    sha: '42db6476fb6150c3a9f8d893314c117d87d6d1ae',
    date: '2026-06-19T04:52:30-07:00',
    pr: 2627,
    categories: {
      component_purity: {score: 30, status: 'published'},
      layout_structure: {score: 15, status: 'published'},
      custom_css: {
        score: 5,
        status: 'intermediate',
        note: 'An intermediate pass reported 5/15 at ten declarations; the final implementation had eleven and did not publish final category points.',
      },
    },
    findings: [
      'Improved from 68 to 87 with a proper Layout root and removal of the raw sidebar structure.',
      'Responsive and mobile-dialog behavior still required custom CSS; tracked by #2623.',
    ],
  }),
  historicalAudit({
    id: 'page/file-explorer',
    score: 90,
    sha: '55693c176f5d0d1e953d733721d42680aca41510',
    date: '2026-06-12T04:54:13Z',
    pr: 2620,
    categories: {
      component_purity: {
        score: 30,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
      icon_purity: {
        score: 15,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
      custom_css: {score: 5, status: 'published'},
      layout_structure: {
        score: 15,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
      doc_metadata: {
        score: 10,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
      image_handling: {
        score: 5,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
      code_quality: {
        score: 10,
        status: 'inferred',
        note: 'The commit stated every category except Custom CSS was maxed.',
      },
    },
    findings: [
      'Custom CSS scored 5/15; five declarations were described as multi-pane layout plumbing tracked by #2594 and #2623.',
      'An earlier subcommit claimed 97; the final merge message explicitly records 90.',
    ],
  }),
  historicalAudit({
    id: 'page/form-two-column',
    score: 92,
    sha: '4b2088e3963194fa86491d56a46ab3e3ead637aa',
    date: '2026-06-10T14:07:29-05:00',
    pr: 2614,
    categories: {
      custom_css: {
        score: 12,
        status: 'published',
        note: 'Improved from 8/15.',
      },
      layout_structure: {
        score: 15,
        status: 'published',
        note: 'Improved from 8/15.',
      },
    },
    findings: [
      'Improved from 81 to 92 through responsive grids, corrected image behavior and alt text, and fewer custom styles.',
      'The remaining cap was image markup and fill CSS without a dedicated image component.',
    ],
  }),
  historicalAudit({
    id: 'page/gallery-hero',
    score: 85,
    sha: '8044501e0412cc9ac8901557fc2ca9804e15f3eb',
    date: '2026-06-10T14:07:41-05:00',
    pr: 2609,
    findings: [
      'Final review explicitly retained 85, overriding an intermediate 95 claim.',
      'The recorded cap was missing image primitives plus image-fill CSS; responsive grid and side padding were fixed.',
    ],
  }),
  historicalAudit({
    id: 'page/side-gallery',
    score: 85,
    sha: '4fb82bf12fe5f376f58963a1d018cd6402d09a0d',
    date: '2026-06-12T12:41:44-05:00',
    pr: 2617,
    findings: [
      'Improved from 70 to 85 after responsive Grid replaced a raw CSS-grid div and media query.',
      'Image-fill CSS remained because no general image component existed.',
    ],
  }),
  historicalAudit({
    id: 'page/table-grouped',
    score: 85,
    sha: '9aabd5599daded11fc180de2babff47458f5e49a',
    date: '2026-06-15T15:09:05Z',
    pr: 2619,
    categories: {
      component_purity: {
        score: 25,
        status: 'published',
        note: 'Improved from 15/30.',
      },
    },
    findings: [
      'Improved from 72 to 85 after raw table cells, a stray resize-handle line, and dead styles were removed.',
      'Raw colgroup/col and group-header CSS remained because Table lacked the required grouping API.',
    ],
  }),
  historicalAudit({
    id: 'page/login',
    score: 97,
    sha: 'dd2ec3ee1390a8cc6ce9d81103d47716519675bf',
    date: '2026-06-09T19:31:50-05:00',
    pr: 2585,
    categories: {
      custom_css: {score: 12, status: 'published'},
    },
    findings: [
      'A final body-background declaration changed the recorded total from 100 to 97, overriding the squash subject.',
    ],
  }),
  historicalAudit({
    id: 'page/login-card',
    score: 92,
    sha: '14d9b8cef381f3e09d7333e3775dc13635cd72f2',
    date: '2026-06-10T02:24:01-05:00',
    pr: 2587,
    categories: {
      custom_css: {score: 12, status: 'published'},
      icon_purity: {
        score: null,
        status: 'unresolved',
        note: 'An intermediate pass reported 15/15, but the final implementation restored inline SVG logos without publishing final category points.',
      },
    },
    findings: [
      'The body background moved an intermediate overall score from 100 to 97; later inline-logo changes produced the final recorded 92.',
    ],
  }),
  historicalAudit({
    id: 'page/login-split',
    score: 75,
    sha: 'c2d0935e20146694b76a549725ea66a756915c71',
    date: '2026-06-12T17:53:05-05:00',
    pr: 2597,
    recordedGrade: 'C',
    categories: {
      icon_purity: {
        score: 15,
        status: 'published',
        note: 'Last explicitly published category value.',
      },
      custom_css: {
        score: 5,
        status: 'intermediate',
        note: 'Published before later implementation changes.',
      },
      layout_structure: {
        score: 8,
        status: 'intermediate',
        note: 'Published before later responsive-layout work.',
      },
    },
    findings: [
      'The merge message contains intermediate totals near 83 and 90; the squash subject explicitly records the final 75.',
    ],
  }),
  historicalAudit({
    id: 'page/login-sso',
    score: 97,
    sha: 'b1bc4edd273ec01c016d9add5878f3d82e54c39a',
    date: '2026-06-10T02:00:36-05:00',
    pr: 2595,
    categories: {
      custom_css: {score: 12, status: 'published'},
    },
    findings: [
      'Custom CSS fell from seven to three declarations; the remaining full-bleed background image had no component-prop equivalent.',
    ],
  }),
  historicalAudit({
    id: 'page/mixed-gallery',
    score: 75,
    sha: 'e9a6850df979fef3bc47e12960a670a0bb84fb47',
    date: '2026-06-10T14:04:40-05:00',
    pr: 2608,
    recordedGrade: 'C',
    findings: [
      'An intermediate pass claimed 85, but later correctness work lowered the squash-subject score to 75.',
      'Responsive masonry required container-query grid behavior that the Grid component could not express.',
    ],
  }),
  historicalAudit({
    id: 'page/product-detail',
    score: 82,
    sha: '3386904fec282fa63d5a45e059fe50dcbc5f8a3a',
    date: '2026-06-10T14:04:57-05:00',
    pr: 2612,
    categories: {
      layout_structure: {
        score: 15,
        status: 'published',
        note: 'Improved from 8/15.',
      },
    },
    findings: [
      'Remaining styles covered image fill/radius, selected-thumbnail outline, and a sticky information column without component-prop equivalents.',
    ],
  }),
  historicalAudit({
    id: 'page/product-gallery',
    score: 85,
    sha: '9abdb9ddb04c8363c4d1649b4ec1fada822705da',
    date: '2026-06-10T14:02:47-05:00',
    pr: 2618,
    findings: [
      'The merge message described this as the template ceiling; missing image primitives capped two categories.',
    ],
  }),
  historicalAudit({
    id: 'page/settings',
    score: 97,
    sha: '53d0aae2201b5147559eefca8c917e7f184a3bcc',
    date: '2026-06-10T14:01:44-05:00',
    pr: 2621,
    findings: [
      'The only recorded remaining style constrained and centered the outer shell because Layout contentWidth could not cap it.',
    ],
  }),
  historicalAudit({
    id: 'page/settings-dialog',
    score: 95,
    sha: '15bb7c05f3b4c3b5a14c9b60e373b20b07f07618',
    date: '2026-06-19T04:52:37-07:00',
    pr: 2629,
    findings: [
      'The remaining prop-less rules were icon box, sticky header, content width, side-nav heading, and dialog height.',
    ],
  }),
  historicalAudit({
    id: 'page/settings-sidebar',
    score: 97,
    sha: '72ba77982e915e5257106cddb0f3c47e77e30894',
    date: '2026-06-19T04:52:33-07:00',
    pr: 2628,
    findings: [
      'Remaining styles covered a prop-less icon box and min-height needed in a content-sized host.',
    ],
  }),
  ...[
    {
      id: 'block/PowerSearchShowcase',
      finding:
        'Added controlled state and initial filter tokens, plus missing description and componentsUsed metadata.',
    },
    {
      id: 'block/PowerSearchFullFeatured',
      finding:
        'Removed a hardcoded-width overflow wrapper and compacted the configuration under 100 lines.',
    },
    {
      id: 'block/PowerSearchContentSearch',
      finding: 'The merge message explicitly records 100 after fixes.',
    },
    {
      id: 'block/PowerSearchPresetFilters',
      finding: 'The merge message explicitly records 100 after fixes.',
    },
    {
      id: 'block/PowerSearchSearchWithTable',
      finding:
        'Replaced a raw layout wrapper and inline style with VStack and added Layout to componentsUsed.',
    },
  ].map(({id, finding}) =>
    historicalAudit({
      id,
      score: 100,
      recordedGrade: 'A+',
      sha: '07483336979c458581b820e50192cebfd1364969',
      date: '2026-04-21T18:35:16-07:00',
      pr: 1625,
      findings: [finding],
    }),
  ),
];

/**
 * Bundled ledger seed. Once template-scores.json is published in the wiki, the
 * sandbox replaces this with the live central collection at runtime.
 */
export const templateLedgerSeed: TemplateAuditLedger = {
  ledgerVersion: 1,
  rubricVersion: '1',
  updated: '2026-08-11',
  about:
    'Seed for a central collection of Astryx page and block template audits. Template identity is type/slug, for example page/centered-hero.',
  caveats: [
    'The wiki template-scores.json file is not published yet; this bundled seed is the current source.',
    'The initial 25 entries were recovered from merge records and have not been re-run at the current HEAD.',
    'Unpublished category detail remains blank rather than being inferred from the total score.',
  ],
  templates: audits,
};

export function templateAuditsById(
  ledger: TemplateAuditLedger | null,
): Record<string, TemplateAudit> {
  return Object.fromEntries(
    (ledger?.templates ?? []).map(audit => [audit.id, audit]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function isTemplateAuditCategory(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const score = value.score;
  return (
    (score == null || (typeof score === 'number' && Number.isFinite(score))) &&
    ['published', 'inferred', 'intermediate', 'unresolved'].includes(
      String(value.status),
    ) &&
    isOptionalString(value.note)
  );
}

function isTemplateAudit(value: unknown): value is TemplateAudit {
  if (!isRecord(value) || !isRecord(value.categories)) {
    return false;
  }

  const score = value.score;
  const evidence = value.evidence;
  return (
    typeof value.id === 'string' &&
    /^(page|block)\/[^/]+$/.test(value.id) &&
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100 &&
    value.grade === templateGrade(score) &&
    ['A', 'B', 'C', 'D', 'F'].includes(String(value.grade)) &&
    ['historical', 'current'].includes(String(value.status)) &&
    typeof value.lastAudited === 'string' &&
    typeof value.commit === 'string' &&
    typeof value.rubricVersion === 'string' &&
    isOptionalString(value.recordedGrade) &&
    (value.pr == null ||
      (typeof value.pr === 'number' && Number.isInteger(value.pr))) &&
    Object.values(value.categories).every(isTemplateAuditCategory) &&
    Array.isArray(value.findings) &&
    value.findings.every(finding => typeof finding === 'string') &&
    Array.isArray(value.topFixes) &&
    value.topFixes.every(fix => typeof fix === 'string') &&
    Array.isArray(evidence) &&
    evidence.every(
      item =>
        isRecord(item) &&
        typeof item.label === 'string' &&
        isOptionalString(item.href),
    ) &&
    typeof value.notes === 'string'
  );
}

export function isTemplateAuditLedger(
  value: unknown,
): value is TemplateAuditLedger {
  if (!isRecord(value) || !Array.isArray(value.templates)) {
    return false;
  }

  const audits = value.templates;
  if (!audits.every(isTemplateAudit)) {
    return false;
  }
  const ids = audits.map(audit => audit.id);
  return (
    typeof value.ledgerVersion === 'number' &&
    Number.isInteger(value.ledgerVersion) &&
    typeof value.rubricVersion === 'string' &&
    typeof value.updated === 'string' &&
    isOptionalString(value.about) &&
    (value.caveats == null ||
      (Array.isArray(value.caveats) &&
        value.caveats.every(caveat => typeof caveat === 'string'))) &&
    new Set(ids).size === ids.length
  );
}

export interface TemplateAuditPromptInput {
  id: string;
  name: string;
  type: 'Page' | 'Block';
  codePath: string;
  docPath: string;
}

export function templateAuditPrompt({
  id,
  name,
  type,
  codePath,
  docPath,
}: TemplateAuditPromptInput): string {
  return `Audit the Astryx ${type.toLowerCase()} template "${name}" against the Template Grading Rubric:
${TEMPLATE_RUBRIC_URL}

Grade the current template at HEAD, not an earlier commit.

Source: ${codePath}
Metadata: ${docPath}

Work all seven rubric categories and use the rubric's grading output format. Inspect the rendered template in a real browser, capture the relevant states in light and dark, and include responsive viewport coverage for page templates. Cite exact file locations for every deduction. Do not infer unpublished evidence or award points for anything you did not measure.

Return the complete scorecard, detailed findings, screenshot-test evidence, and the top three fixes. Save the raw scorecard JSON to a file without the ledger-managed id or status fields. Then record and publish it with:

node scripts/template-score-ledger.mjs --record ${id} --from <scorecard.json> --push`;
}
