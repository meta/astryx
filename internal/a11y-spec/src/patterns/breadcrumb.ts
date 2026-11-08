// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file breadcrumb.ts
 * @input Uses the shared accessibility-contract vocabulary
 * @output BREADCRUMB_PATTERN and BreadcrumbStateFacts
 * @position Reusable semantic contract for one breadcrumb navigation landmark.
 *   Link, button, and menu interactions retain their own pattern owners.
 *
 * The required slice is derived from WCAG 2.2. The APG Breadcrumb page is
 * contextual only because no current Astryx record adopts its mechanics as a
 * separate required gate.
 */

import {
  definePattern,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

function wcag(
  id: string,
  name: string,
  level: 'A' | 'AA',
  slug: string,
): WcagCriterion {
  return {
    standard: 'wcag',
    id,
    name,
    level,
    url: `${UNDERSTANDING}/${slug}.html`,
  };
}

const WCAG_1_3_1 = wcag(
  '1.3.1',
  'Info and Relationships',
  'A',
  'info-and-relationships',
);
const WCAG_2_4_6 = wcag(
  '2.4.6',
  'Headings and Labels',
  'AA',
  'headings-and-labels',
);
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

export interface BreadcrumbStateFacts {
  /** The accessible name expected on the navigation landmark. */
  readonly landmarkLabel: string;
  /** Whether this trail includes the page that is current in its hierarchy. */
  readonly currentPage: boolean;
  /** The number of rendered separator containers owned by the binding. */
  readonly separatorCount: number;
}

const ALWAYS = {
  condition: 'the binding renders a breadcrumb trail',
  test: () => true,
};

export const BREADCRUMB_PATTERN: PatternContract<BreadcrumbStateFacts> =
  definePattern<BreadcrumbStateFacts>({
    pattern: 'breadcrumb',
    url: APG_URL,
    scope:
      'One named navigation landmark containing a breadcrumb list trail, an optional current page, and decorative separators.',
    expectations: [
      {
        id: 'breadcrumb.landmark.named',
        outcome:
          'The browser exposes a named navigation landmark so the trail can be found and distinguished from other navigation.',
        sources: [WCAG_4_1_2, WCAG_2_4_6],
        covers: ['4.1.2-name-role-value', '2.4.6-headings-and-labels'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role, name} = await subject.computed();
          if (role !== 'navigation') {
            throw new Error(
              `the browser exposes ${role == null ? 'no role' : `"${role}"`} instead of navigation`,
            );
          }
          if (name !== facts.landmarkLabel) {
            throw new Error(
              `the landmark should be named "${facts.landmarkLabel}", but the browser computes ${name === '' ? 'no name' : `"${name}"`}`,
            );
          }
        },
      },
      {
        id: 'breadcrumb.trail.list',
        outcome:
          'The navigation landmark contains a list that exposes the breadcrumb trail relationship.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const list = await harness.related('list');
          if (!(await harness.contains(subject, list))) {
            throw new Error(
              'the breadcrumb list is not contained by its navigation landmark',
            );
          }
          const {role} = await list.computed();
          if (role !== 'list') {
            throw new Error(
              `the browser exposes the trail as ${role == null ? 'no role' : `"${role}"`} instead of a list`,
            );
          }
        },
      },
      {
        id: 'breadcrumb.current-page.exposed',
        outcome:
          'When the trail includes the current page, that item is programmatically identified inside the trail.',
        sources: [WCAG_4_1_2, WCAG_1_3_1],
        covers: ['4.1.2-name-role-value', '1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the trail includes the current page',
          test: facts => facts.currentPage,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness}) => {
          const list = await harness.related('list');
          const current = await harness.related('current');
          if ((await current.attribute('aria-current')) !== 'page') {
            throw new Error(
              'the current breadcrumb does not expose aria-current="page"',
            );
          }
          if (!(await harness.contains(list, current))) {
            throw new Error(
              'the current breadcrumb is not contained by the ordered trail',
            );
          }
        },
      },
      {
        id: 'breadcrumb.separators.decorative',
        outcome:
          'Every visual separator is hidden from the accessibility tree so it does not interrupt the trail.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders one or more visual separators',
          test: facts => facts.separatorCount > 0,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, facts}) => {
          for (let index = 0; index < facts.separatorCount; index += 1) {
            const separator = await harness.related(`separator-${index}`);
            if ((await separator.attribute('aria-hidden')) !== 'true') {
              throw new Error(
                `breadcrumb separator ${index + 1} of ${facts.separatorCount} is exposed to assistive technology`,
              );
            }
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'BreadcrumbItem start content and caller content',
        verifiedBy:
          'Component icon tests, content review, and the repository axe audit',
        reason:
          'The trail contract owns landmark, list, current-page, and separator semantics; caller-provided icons and other non-text content remain binding-specific.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'The link, button, menu, and composing-page owners',
        verifiedBy:
          'Their pattern contracts, component tests, and page-level structure review',
        reason:
          'This contract encodes the landmark, list, current-page, and decorative-separator relationships. Relationships within each destination or menu remain with those parts.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'Breadcrumbs and the composing page',
        verifiedBy:
          'Component DOM-order tests and page-level reading-order review',
        reason:
          'The binding owns item order and the page owns where the trail appears relative to its heading and content.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'The composing form and caller content',
        verifiedBy: 'Form integration review',
        reason:
          'A breadcrumb trail does not collect information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'Breadcrumbs, BreadcrumbItem, and the active theme',
        verifiedBy: 'Rendered state review and the repository visual gate',
        reason:
          'Current-page emphasis and destination styling are paint outcomes outside this semantic contract.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'Breadcrumbs, BreadcrumbItem, and the active theme',
        verifiedBy: 'Rendered contrast audit',
        reason: 'Text contrast depends on resolved colors and backdrop.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'BreadcrumbItem controls and the active theme',
        verifiedBy:
          'Rendered control, state, and focus-indicator contrast review',
        reason:
          'Any control boundary, state cue, or focus indicator is a paint outcome.',
      },
      '2.1.1-keyboard': {
        owner: 'The link, button, and menu-button pattern owners',
        verifiedBy:
          'Their reusable contracts and BreadcrumbItem interaction tests',
        reason:
          'The breadcrumb container adds no keyboard interaction; each interactive item keeps its own role-specific contract.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'The menu-button, popover, and composing-page owners',
        verifiedBy: 'Menu dismissal tests and page-level keyboard review',
        reason:
          'The trail itself creates no focus trap; popup escape and surrounding navigation are separate owners.',
      },
      '2.4.2-page-titled': {
        owner: 'The page',
        verifiedBy: 'Page-level title review',
        reason: 'A breadcrumb component does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'BreadcrumbItem and the composing page',
        verifiedBy: 'Real-browser keyboard-order review',
        reason:
          'Sequential focus among destinations, menus, and surrounding controls depends on item composition and page placement.',
      },
      '2.4.4-link-purpose': {
        owner: 'The link pattern and caller-provided labels',
        verifiedBy: 'Link contract bindings plus content review',
        reason:
          'Breadcrumb destination purpose comes from caller text and the destination owner, not the trail container.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller-provided landmark text and destination labels',
        verifiedBy: 'Content review of the trail and each item label',
        reason:
          'This contract proves the landmark has the declared name, not that caller wording is sufficiently descriptive.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner:
          'BreadcrumbItem, interaction-modality architecture, and the active theme',
        verifiedBy: 'Rendered keyboard-focus review',
        reason: 'Focus-indicator paint requires visual evidence.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'The composing page and overlay system',
        verifiedBy: 'Constrained-viewport and open-menu browser review',
        reason: 'Occlusion depends on surrounding layout and open surfaces.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'The link, button, and menu-button pattern owners',
        verifiedBy: 'Their pointer activation and aborted-press tests',
        reason: 'The breadcrumb container has no pointer action of its own.',
      },
      '2.5.3-label-in-name': {
        owner: 'BreadcrumbItem and caller-provided visible labels',
        verifiedBy:
          'Visible-label versus computed-name browser review for each interactive item',
        reason:
          'The landmark label is normally not visible, while each visible interactive item keeps its own label-in-name owner.',
      },
      '2.5.8-target-size': {
        owner: 'BreadcrumbItem and the composing page',
        verifiedBy: 'Rendered target geometry and neighbouring-target review',
        reason: 'Target size and spacing depend on item rendering and layout.',
      },
      '3.1.1-language-of-page': {
        owner: 'The page and localization provider',
        verifiedBy: 'Document-language checks',
        reason: 'A breadcrumb trail does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'The link, button, menu, and caller navigation owners',
        verifiedBy: 'Role-specific interaction tests and integration review',
        reason:
          'Navigation or menu activation is owned by each item and its caller; the trail container has no input event.',
      },
      '3.2.4-consistent-identification': {
        owner: 'The design system and caller content',
        verifiedBy:
          'Cross-page review of repeated breadcrumb destinations and labels',
        reason:
          'Consistency is a property of repeated trails and destinations, not one isolated binding.',
      },
      '3.3.1-error-identification': {
        owner: 'The composing form and page',
        verifiedBy: 'Form-level error review',
        reason: 'The breadcrumb pattern defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'The composing form and caller content',
        verifiedBy: 'Form-level label and instruction review',
        reason: 'A breadcrumb trail is not a form input.',
      },
      '4.1.2-name-role-value': {
        owner: 'The link, button, and menu-button pattern owners',
        verifiedBy: 'Their contracts plus BreadcrumbItem-local state tests',
        reason:
          'This contract encodes the navigation landmark and current-page state. Role, name, value, and state inside each interactive item remain with its own pattern.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'The caller and status-message pattern',
        verifiedBy:
          'Status-message tests and AST-009 when spoken timing is claimed',
        reason:
          'Rendering or following a breadcrumb is not itself a status message.',
      },
      'apg-interaction': {
        owner: 'Current Breadcrumbs and BreadcrumbItem product authority',
        verifiedBy:
          'Required WCAG semantics here plus separate link and menu-button contracts',
        reason:
          'No current Astryx record adopts the APG Breadcrumb page as an additional required interaction gate; its structure is covered here only where WCAG directly requires the outcome.',
      },
      'forced-colors': {
        owner: 'Breadcrumbs, BreadcrumbItem, and the active theme',
        verifiedBy: 'Rendered forced-colors review',
        reason: 'Semantic exposure does not prove forced-colors paint.',
      },
      'reduced-motion': {
        owner: 'BreadcrumbItem menu and overlay owners',
        verifiedBy: 'Component motion tests and rendered review',
        reason:
          'The trail semantics add no motion; menu motion remains separately owned.',
      },
      'at-facing-strings': {
        owner: 'Breadcrumbs localization and caller-provided item labels',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'The contract verifies a deterministic landmark name without claiming spoken wording, order, or timing.',
      },
    },
  });
