// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file landmark.ts
 * @input Uses the shared accessibility-contract vocabulary
 * @output LANDMARK_PATTERN, LandmarkRole, and LandmarkStateFacts
 * @position Reusable semantic contract for one component-owned landmark region
 *   that a binding exposes with a role and, when declared, a label. Page-wide
 *   landmark completeness stays with the page.
 *
 * The required slice is derived from WCAG 2.2. The APG Landmark Regions
 * guidance is contextual: its unique-label principle is reported as advisory
 * because no current Astryx record adopts it as a gate.
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/';
const APG_PRINCIPLES_URL =
  'https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/general-principles.html';
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

const APG_UNIQUE_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'landmarks',
  requirement:
    'If a specific landmark role is used more than once on a web page, it should have a unique label.',
  url: APG_PRINCIPLES_URL,
};

/** The WAI-ARIA landmark roles a binding may declare. */
export type LandmarkRole =
  | 'banner'
  | 'complementary'
  | 'contentinfo'
  | 'form'
  | 'main'
  | 'navigation'
  | 'region'
  | 'search';

export interface LandmarkStateFacts {
  /** The landmark role the binding declares for this region. */
  readonly role: LandmarkRole;
  /** The accessible name the binding declares, or null when it declares none. */
  readonly label: string | null;
  /**
   * How many other landmarks with the same role the binding renders in the
   * same bounded composition. Each is supplied as a `peer-<index>` relation.
   */
  readonly sameRolePeers: number;
}

function describeRole(role: string | null): string {
  return role == null ? 'no role' : `"${role}"`;
}

function describeName(name: string): string {
  return name === '' ? 'no name' : `"${name}"`;
}

export const LANDMARK_PATTERN: PatternContract<LandmarkStateFacts> =
  definePattern<LandmarkStateFacts>({
    pattern: 'landmark',
    url: APG_URL,
    scope:
      'One component-owned landmark region: its exposed role, its declared label, the content it bounds, and how it is told apart from same-role peers in one bounded composition.',
    expectations: [
      {
        id: 'landmark.role.exposed',
        outcome:
          'The browser exposes the region with the landmark role the binding declares, so people navigating by landmark can find it.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding declares a landmark role for the region',
          test: () => true,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role} = await subject.computed();
          if (role !== facts.role) {
            throw new Error(
              `the browser exposes ${describeRole(role)} instead of the declared "${facts.role}" landmark`,
            );
          }
        },
      },
      {
        id: 'landmark.name.exposed',
        outcome:
          'When the binding declares a label, the landmark computes exactly that name, so people can tell what the region is for.',
        sources: [WCAG_1_3_1, WCAG_2_4_6],
        covers: ['1.3.1-info-and-relationships', '2.4.6-headings-and-labels'],
        appliesWhen: {
          condition: 'the binding declares a label for the landmark',
          test: facts => facts.label != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {name} = await subject.computed();
          if (name !== facts.label) {
            throw new Error(
              `the landmark should be named "${facts.label}", but the browser computes ${describeName(name)}`,
            );
          }
        },
      },
      {
        id: 'landmark.content.contained',
        outcome:
          'The content the region presents sits inside the landmark, so moving to the landmark reaches that content.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders content inside the region',
          test: () => true,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const content = await harness.related('content');
          if (!(await harness.contains(subject, content))) {
            throw new Error(
              'the region content is outside its landmark element',
            );
          }
        },
      },
      {
        id: 'landmark.peers.distinct-names',
        outcome:
          'Landmarks that share a role in the same composition each have a different, non-empty name, so people can tell them apart.',
        sources: [APG_UNIQUE_LABEL],
        wcagOutcome:
          'Supports WCAG 2.2 1.3.1 Info and Relationships by keeping repeated regions of one kind programmatically distinguishable.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition:
            'the binding renders another landmark with the same role in the same composition',
          test: facts => facts.sameRolePeers > 0,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'advisory',
        advisoryBecause:
          'WCAG 2.2 A/AA has no success criterion that directly requires distinct names for repeated same-role landmarks, and no current Astryx record adopts the APG unique-label principle as a gate.',
        run: async ({harness, subject, facts}) => {
          const own = await subject.computed();
          const names = [own.name];
          for (let index = 0; index < facts.sameRolePeers; index += 1) {
            const peer = await (
              await harness.related(`peer-${index}`)
            ).computed();
            if (peer.role !== facts.role) {
              throw new Error(
                `peer ${index + 1} exposes ${describeRole(peer.role)}, not the shared "${facts.role}" role the binding declares`,
              );
            }
            names.push(peer.name);
          }
          const unnamed = names.filter(name => name === '').length;
          if (unnamed > 0) {
            throw new Error(
              `${unnamed} of ${names.length} "${facts.role}" landmarks have no name`,
            );
          }
          const repeated = names.filter(
            (name, index) => names.indexOf(name) !== index,
          );
          if (repeated.length > 0) {
            throw new Error(
              `${names.length} "${facts.role}" landmarks repeat the name ${[
                ...new Set(repeated),
              ]
                .map(name => `"${name}"`)
                .join(', ')}`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'Caller content placed in the region',
        verifiedBy: 'Content review and the repository axe audit',
        reason:
          'A landmark adds no non-text content of its own; images and icons inside it belong to their content owners.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'The composing page and caller content',
        verifiedBy: 'Page-level landmark review and the repository axe audit',
        reason:
          'This contract encodes one region role, its declared name, and its content boundary. Whether all perceivable page content sits in a landmark, whether the page has exactly one main landmark, and whether banner and contentinfo are top level are page outcomes an isolated region cannot satisfy.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'The binding and the composing page',
        verifiedBy: 'Component DOM-order tests and page reading-order review',
        reason:
          'Region order follows the binding’s slot order and the page’s composition, not the landmark semantics.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'Form controls inside the region',
        verifiedBy: 'Text-input contract bindings and form review',
        reason: 'A landmark collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered review and the repository visual gate',
        reason:
          'Region boundaries and dividers are paint outcomes outside this semantic contract.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'Caller content and the active theme',
        verifiedBy: 'Rendered contrast audit',
        reason: 'Text contrast depends on resolved colors and backdrop.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered boundary and divider contrast review',
        reason: 'Any region boundary or divider is a paint outcome.',
      },
      '2.1.1-keyboard': {
        owner:
          'Assistive technology and the pattern owners of interactive content',
        verifiedBy:
          'Real-AT review under AST-009 and each interactive part’s contract',
        reason:
          'Landmark navigation keys are provided by assistive technology; the region adds no keyboard interaction of its own.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'Interactive content and the composing page',
        verifiedBy: 'Their contracts and page-level keyboard review',
        reason: 'A landmark region cannot trap focus.',
      },
      '2.4.2-page-titled': {
        owner: 'The page',
        verifiedBy: 'Page-level title review',
        reason: 'A region does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'The binding and the composing page',
        verifiedBy: 'Real-browser keyboard-order review',
        reason:
          'Sequential focus depends on the controls placed in the region and the page’s composition.',
      },
      '2.4.4-link-purpose': {
        owner: 'The link pattern and caller content',
        verifiedBy: 'Link contract bindings plus content review',
        reason: 'A landmark contains links but does not define their purpose.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller-provided landmark labels',
        verifiedBy: 'Content review of each landmark label',
        reason:
          'This contract proves the landmark computes the declared name, not that the caller’s wording describes the region or avoids repeating the role.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'Interactive content and the active theme',
        verifiedBy: 'Rendered keyboard-focus review',
        reason: 'A landmark is not focusable; focus paint belongs to controls.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'The binding, the composing page, and the overlay system',
        verifiedBy: 'Constrained-viewport and sticky-region browser review',
        reason:
          'Whether a sticky or scrolling region hides focused content depends on layout, not landmark semantics.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'Interactive content pattern owners',
        verifiedBy: 'Their pointer activation tests',
        reason: 'A landmark has no pointer action.',
      },
      '2.5.3-label-in-name': {
        owner: 'Interactive content pattern owners',
        verifiedBy: 'Their visible-label versus computed-name checks',
        reason:
          'A landmark is not a labelled user-interface component; label-in-name applies to the controls inside it.',
      },
      '2.5.8-target-size': {
        owner: 'Interactive content and the composing page',
        verifiedBy: 'Rendered target geometry review',
        reason: 'A landmark has no pointer target.',
      },
      '3.1.1-language-of-page': {
        owner: 'The page and localization provider',
        verifiedBy: 'Document-language checks',
        reason: 'A region does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'Interactive content pattern owners',
        verifiedBy: 'Role-specific interaction tests',
        reason: 'A landmark has no input event.',
      },
      '3.2.4-consistent-identification': {
        owner: 'The design system and caller content',
        verifiedBy: 'Cross-page review of repeated landmark labels',
        reason:
          'Consistency is a property of repeated pages and regions, not one isolated binding.',
      },
      '3.3.1-error-identification': {
        owner: 'The composing form',
        verifiedBy: 'Form-level error review',
        reason: 'A landmark defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'Form controls inside the region',
        verifiedBy: 'Form-level label and instruction review',
        reason: 'A landmark is not a form input.',
      },
      '4.1.2-name-role-value': {
        owner: 'Interactive content pattern owners',
        verifiedBy: 'Their reusable contracts and component tests',
        reason:
          'A landmark is a structural region rather than a user-interface component; its role and name are encoded here under 1.3.1, and controls inside it keep their own patterns.',
      },
      '4.1.3-status-messages': {
        owner: 'The status-message pattern and caller content',
        verifiedBy:
          'Status-message tests and AST-009 when spoken timing is claimed',
        reason: 'Rendering a landmark is not a status message.',
      },
      'apg-interaction': {
        owner: 'Assistive technology and each binding’s current authority',
        verifiedBy:
          'Real-AT review under AST-009; the advisory unique-label expectation here',
        reason:
          'APG Landmark Regions defines no widget keyboard interaction. This contract reports its unique-label principle as advisory; its other structural guidance, such as top-level placement and labels that omit the role name, stays with the page and caller content because no current Astryx record adopts it as a gate.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered forced-colors review',
        reason: 'Semantic exposure does not prove forced-colors paint.',
      },
      'reduced-motion': {
        owner: 'The binding and its content',
        verifiedBy: 'Component motion tests and rendered review',
        reason: 'Landmark semantics add no motion.',
      },
      'at-facing-strings': {
        owner: 'The binding’s localization and caller-provided labels',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'The contract verifies a deterministic computed name without claiming spoken wording, order, or timing.',
      },
    },
  });
