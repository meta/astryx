// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file carousel.ts
 * @input Uses the shared accessibility contract vocabulary
 * @output CAROUSEL_PATTERN and CarouselStateFacts
 * @position Reusable semantic and focus contract for non-rotating carousels.
 *
 * This first bounded slice covers the labelled collection, positional slides,
 * off-screen slide exposure, a keyboard-reachable scroller, and the APG focus
 * result for a navigation control that remains available. Button mechanics,
 * scroll geometry, looping, snapping, paint, and motion stay with their named
 * owners rather than being inferred from the Carousel pattern.
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/carousel/';
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
const WCAG_2_1_1 = wcag('2.1.1', 'Keyboard', 'A', 'keyboard');
const WCAG_2_1_2 = wcag('2.1.2', 'No Keyboard Trap', 'A', 'no-keyboard-trap');
const WCAG_2_4_3 = wcag('2.4.3', 'Focus Order', 'A', 'focus-order');
const WCAG_2_4_6 = wcag(
  '2.4.6',
  'Headings and Labels',
  'AA',
  'headings-and-labels',
);
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

function apg(requirement: string): ApgRequirement {
  return {
    standard: 'apg',
    pattern: 'carousel',
    requirement,
    url: `${APG_URL}#wai-ariaroles,states,andproperties`,
  };
}

const APG_CONTAINER_ROLE = apg(
  'The carousel container has either role region or role group.',
);
const APG_CONTAINER_DESCRIPTION = apg(
  'The carousel container has aria-roledescription set to carousel.',
);
const APG_CONTAINER_LABEL = apg(
  'The carousel container has an accessible label provided by aria-labelledby or aria-label.',
);
// APG, basic carousel elements: "Each slide container has role group with
// the property aria-roledescription set to slide." Only the carousel
// container may choose between region and group.
const APG_SLIDE_ROLE = apg('Each slide container has role group.');
const APG_SLIDE_DESCRIPTION = apg(
  'Each slide has aria-roledescription set to slide.',
);
const APG_SLIDE_LABEL = apg(
  'Each slide has an accessible name that identifies it in the set of slides.',
);
const APG_CONTROL_FOCUS: ApgRequirement = {
  standard: 'apg',
  pattern: 'carousel',
  requirement:
    'Activating the previous or next slide control does not move browser focus from the button.',
  url: `${APG_URL}#keyboardinteraction`,
};

export interface CarouselStateFacts {
  readonly part: 'container' | 'slide' | 'scroller' | 'control';
  readonly expectedName: string;
  readonly slideRelations: readonly string[];
  readonly offscreen: boolean;
  readonly scrollable: boolean;
  readonly focusable: boolean;
  readonly preservesControlFocus: boolean;
}

const APG_NOT_FORMALLY_ADOPTED =
  'The current Carousel implementation and consumer docs use this APG mechanic, but no current component record adopts it as a reusable required gate.';
const AST_025_FR12: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-025',
  clause: 'FR12',
  url: 'https://github.com/meta/astryx/blob/17044ab1e814586691db43ae6fd71b8b9bb9ceb1/docs/specs/AST-025/spec.md#L137-L141',
  requirement:
    'A delivery surface that assigns keyboard scrolling to the viewport MUST add it to the tab order only while at least one applicable axis is effective, and MUST provide an appropriate role and accessible name.',
};
const TAB_BUDGET = 10;

export const CAROUSEL_PATTERN: PatternContract<CarouselStateFacts> =
  definePattern<CarouselStateFacts>({
    pattern: 'carousel',
    url: APG_URL,
    scope:
      'A labelled non-rotating carousel collection, its positional slides, keyboard-reachable scroll area, and navigation-control focus result.',
    expectations: [
      {
        id: 'carousel.container.role-exposed',
        outcome:
          'The browser exposes the collection as a region or group so its slides have a programmatic container.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_CONTAINER_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates the carousel container',
          test: facts => facts.part === 'container',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'region' && role !== 'group') {
            throw new Error(
              `the browser exposes this container as ${role == null ? 'no role' : `"${role}"`}, not as a region or group`,
            );
          }
        },
      },
      {
        id: 'carousel.container.name-exposed',
        outcome:
          'The carousel has an accessible name so the user knows which collection they reached.',
        sources: [WCAG_2_4_6, WCAG_4_1_2, APG_CONTAINER_LABEL],
        covers: ['2.4.6-headings-and-labels', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates the carousel container',
          test: facts => facts.part === 'container',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this carousel',
            );
          }
          if (facts.expectedName !== '' && name !== facts.expectedName) {
            throw new Error(
              `the browser names this carousel "${name}" instead of "${facts.expectedName}"`,
            );
          }
        },
      },
      {
        id: 'carousel.container.roledescription',
        outcome:
          'The container identifies itself as a carousel rather than an unnamed generic collection.',
        sources: [APG_CONTAINER_DESCRIPTION],
        wcagOutcome:
          'Supports WCAG 2.2 4.1.2 by exposing the widget type Astryx presents visually.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding designates the carousel container',
          test: facts => facts.part === 'container',
        },
        evidenceLayer: 'dom',
        enforcement: 'advisory',
        advisoryBecause: APG_NOT_FORMALLY_ADOPTED,
        run: async ({subject}) => {
          if (
            (await subject.attribute('aria-roledescription')) !== 'carousel'
          ) {
            throw new Error(
              'the carousel has no aria-roledescription="carousel"',
            );
          }
        },
      },
      {
        id: 'carousel.slide.role-exposed',
        outcome:
          'The browser exposes each slide as a group so its content has a programmatic boundary.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_SLIDE_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a slide',
          test: facts => facts.part === 'slide',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'group') {
            throw new Error(
              `the browser exposes this slide as ${role == null ? 'no role' : `"${role}"`}, not as a group`,
            );
          }
        },
      },
      {
        id: 'carousel.slide.name-exposed',
        outcome:
          'Each slide has an accessible name that identifies its position in the collection.',
        sources: [WCAG_2_4_6, WCAG_4_1_2, APG_SLIDE_LABEL],
        covers: ['2.4.6-headings-and-labels', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a slide',
          test: facts => facts.part === 'slide',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this slide',
            );
          }
          if (name !== facts.expectedName) {
            throw new Error(
              `the browser names this slide "${name}" instead of "${facts.expectedName}"`,
            );
          }
        },
      },
      {
        id: 'carousel.slide.roledescription',
        outcome: 'Each item identifies itself as a slide within the carousel.',
        sources: [APG_SLIDE_DESCRIPTION],
        wcagOutcome:
          'Supports WCAG 2.2 4.1.2 by exposing the item type Astryx presents visually.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding designates a slide',
          test: facts => facts.part === 'slide',
        },
        evidenceLayer: 'dom',
        enforcement: 'advisory',
        advisoryBecause: APG_NOT_FORMALLY_ADOPTED,
        run: async ({subject}) => {
          if ((await subject.attribute('aria-roledescription')) !== 'slide') {
            throw new Error('the slide has no aria-roledescription="slide"');
          }
        },
      },
      {
        id: 'carousel.collection.contains-slides',
        outcome:
          'Every declared slide belongs to the carousel in the accessibility tree, including slides outside the viewport.',
        sources: [WCAG_1_3_1, APG_SLIDE_ROLE],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the container binding declares its slides',
          test: facts =>
            facts.part === 'container' && facts.slideRelations.length > 0,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          for (const relation of facts.slideRelations) {
            if (
              !(await harness.containsSemantically(
                subject,
                await harness.related(relation),
              ))
            ) {
              throw new Error(
                `the binding’s "${relation}" is not contained by the carousel`,
              );
            }
          }
        },
      },
      {
        id: 'carousel.slide.offscreen-exposed',
        outcome:
          'A slide outside the viewport remains in the accessibility tree so assistive-technology navigation does not lose it.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding designates an off-screen slide',
          test: facts => facts.part === 'slide' && facts.offscreen,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role == null || name.trim() === '') {
            throw new Error(
              'the off-screen slide is absent from the accessibility tree',
            );
          }
        },
      },
      {
        id: 'carousel.scroller.reachable-and-escapable',
        outcome:
          'Tab reaches an overflowing scroll container and Tab again leaves it so keyboard users can operate the overflow without becoming trapped.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition:
            'the binding designates a focusable, effectively scrollable container',
          test: facts =>
            facts.part === 'scroller' && facts.scrollable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await harness.resetFocus();
          let reached = false;
          for (let step = 0; step < TAB_BUDGET && !reached; step += 1) {
            await harness.press('Tab');
            reached = await subject.isFocused();
          }
          if (!reached) {
            throw new Error(
              `${TAB_BUDGET} presses of Tab never reached the scroll container`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error('Tab did not leave the scroll container');
          }
        },
      },
      {
        id: 'carousel.scroller.role-and-name',
        outcome:
          'A scroll container that takes keyboard focus is exposed with a role and an accessible name, so a user landing on it knows what they can scroll.',
        sources: [WCAG_4_1_2, AST_025_FR12],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a focusable scroll container',
          test: facts => facts.part === 'scroller' && facts.focusable,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role, name} = await subject.computed();
          if (role == null || role === 'generic' || role === 'none') {
            throw new Error(
              'the browser exposes the focusable scroll container with no role',
            );
          }
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for the focusable scroll container',
            );
          }
        },
      },
      {
        id: 'carousel.control.focus-preserved',
        outcome:
          'A navigation control that remains available keeps focus after activation.',
        sources: [APG_CONTROL_FOCUS, WCAG_2_4_3],
        wcagOutcome:
          'Supports WCAG 2.2 2.4.3 by keeping focus in a predictable place after navigation.',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding designates an available navigation control whose action should preserve focus',
          test: facts =>
            facts.part === 'control' &&
            facts.focusable &&
            facts.preservesControlFocus,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause: APG_NOT_FORMALLY_ADOPTED,
        run: async ({harness, subject}) => {
          await harness.click(subject);
          if (!(await subject.isFocused())) {
            throw new Error(
              'activating the carousel control moved focus away from it',
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'Caller slide content and nested components',
        verifiedBy: 'Caller content review and the repository axe audit',
        reason:
          'The Carousel wrapper cannot determine whether an image inside an arbitrary child is informative or decorative.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'Caller slide content',
        verifiedBy: 'Component composition tests and caller content review',
        reason:
          'This contract proves the collection and slide boundaries; relationships inside each arbitrary slide remain caller-owned.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'Carousel child order and caller content',
        verifiedBy:
          'Existing child-order tests and page-level reading-order review',
        reason:
          'The contract preserves declared collection membership but does not decide whether a caller supplied its slides in a meaningful order.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'Forms embedded by callers',
        verifiedBy: 'Form-purpose and autocomplete review',
        reason: 'Carousel itself collects no personal information.',
      },
      '1.4.1-use-of-color': {
        owner: 'Carousel, theme, and caller slide content',
        verifiedBy: 'Rendered-state review and the visual gate',
        reason:
          'Semantic grouping cannot prove that painted cues avoid color-only meaning.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'Theme and caller slide content',
        verifiedBy: 'Repository axe audit and rendered theme review',
        reason: 'Contrast is a rendered-pixel outcome.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'Carousel controls, focus styles, and theme',
        verifiedBy: 'Repository axe audit and rendered focus/control review',
        reason:
          'Control and focus-indicator contrast is not observable from this semantic contract.',
      },
      '2.1.1-keyboard': {
        owner: 'Carousel scrolling and Button pattern',
        verifiedBy:
          'Component scroll tests, Button contract, and real-browser Carousel binding',
        reason:
          'This contract proves the scroll area is reachable; key-to-scroll behavior and button activation retain their existing owners.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'Caller interactive slide content and page composition',
        verifiedBy: 'Page-level sequential-focus review',
        reason:
          'The contract proves exit from the scroller itself, not arbitrary interactive descendants supplied by callers.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'Page shell',
        verifiedBy: 'Page-level accessibility review',
        reason: 'A Carousel does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'Page composition and Carousel edge hand-off',
        verifiedBy:
          'Existing Carousel edge-focus tests and page-level focus-order review',
        reason:
          'The pattern checks one stable control result; ordering before, within, and after caller content remains separately owned.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'Links rendered by callers',
        verifiedBy: 'Link contract and caller content review',
        reason: 'Carousel itself does not create navigation links.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller-authored wording',
        verifiedBy: 'Content review of the collection and slide labels',
        reason:
          'The contract proves names exist and match declared facts, not that the words describe the caller’s content well.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'Carousel, Button, theme, and interaction-modality system',
        verifiedBy: 'Stable visual regression and keyboard-focus review',
        reason: 'Focus indication is a painted result.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'Carousel geometry and page composition',
        verifiedBy: 'Constrained-viewport real-browser review',
        reason:
          'Occlusion depends on clipping, viewport geometry, and surrounding content.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'Button pattern and native scrolling',
        verifiedBy: 'Button contract and browser gesture tests',
        reason:
          'This semantic slice does not re-own pointer activation or scrolling gestures.',
      },
      '2.5.3-label-in-name': {
        owner: 'Carousel controls and caller slide content',
        verifiedBy: 'Button contract plus visible-label review',
        reason:
          'The Carousel and slide names are programmatic; visible labels inside arbitrary slides belong to their content.',
      },
      '2.5.8-target-size': {
        owner: 'Button, Carousel layout, and page composition',
        verifiedBy: 'Browser geometry and WCAG exception review',
        reason: 'Target size and spacing require rendered geometry.',
      },
      '3.1.1-language-of-page': {
        owner: 'Page shell and localization provider',
        verifiedBy: 'Document-language integration checks',
        reason: 'Carousel does not own the page language.',
      },
      '3.2.2-on-input': {
        owner: 'Caller-owned interactive slide content',
        verifiedBy: 'Component and page integration tests',
        reason:
          'Carousel navigation changes viewport position, not the setting of a form control.',
      },
      '3.2.4-consistent-identification': {
        owner: 'Design system and caller content',
        verifiedBy: 'Cross-surface content review and shared Button contract',
        reason:
          'Consistency is a property of repeated functions across a product.',
      },
      '3.3.1-error-identification': {
        owner: 'Forms and status-message owners',
        verifiedBy: 'Field and status-message contracts',
        reason: 'Carousel defines no validation state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'Caller content',
        verifiedBy: 'Task-level content review',
        reason:
          'The component cannot know which instructions a composed task requires.',
      },
      '4.1.2-name-role-value': {
        owner: 'Button pattern and caller slide descendants',
        verifiedBy: 'Shared component contracts and the repository axe audit',
        reason:
          "This contract owns the collection and slide identity and the focusable scroll container's role and name; semantics of controls and arbitrary descendants remain with their own patterns.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'Status-message pattern and caller composition',
        verifiedBy:
          'Status-message bindings and AST-009 for announcement claims',
        reason: 'Carousel performs no live-region announcement.',
      },
      'apg-interaction': {
        owner: 'Button pattern and Carousel component tests',
        verifiedBy:
          'Button contract, Carousel scrolling tests, and real-browser visual evidence',
        reason:
          'This slice covers collection/slide semantics and stable control focus; rotation, picker controls, scrolling distance, looping, and snapping keep their existing owners.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'Carousel controls and theme',
        verifiedBy: 'Real-browser forced-colors review',
        reason:
          'Forced-color paint cannot be established by DOM or accessibility-tree semantics.',
      },
      'reduced-motion': {
        owner: 'Carousel implementation and visual/browser evidence',
        verifiedBy:
          'The prefers-reduced-motion branch and real-browser motion review',
        reason:
          'Motion is a rendered result over time and is not established by collection semantics.',
      },
      'at-facing-strings': {
        owner: 'Carousel localization',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'Translation completeness is a source and localization concern rather than an accessibility-tree identity check.',
      },
    },
  });
