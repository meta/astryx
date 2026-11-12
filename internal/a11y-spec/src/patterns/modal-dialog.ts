// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file modal-dialog.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output MODAL_DIALOG_PATTERN and ModalDialogStateFacts
 * @position Reusable accessibility contract for native modal dialogs. Component
 *   bindings declare their states; browser-owned focus, top-layer, and inertness
 *   outcomes run only in a real browser.
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import {saysInOrder, spokenWords} from '../spoken';

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_2_5_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.3',
  name: 'Label in Name',
  level: 'A',
  url: `${UNDERSTANDING}/label-in-name.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};
const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/';
const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'dialog-modal',
  requirement:
    'The element that serves as the dialog container has a role of dialog.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_MODAL: ApgRequirement = {
  standard: 'apg',
  pattern: 'dialog-modal',
  requirement:
    'The aria-modal property is set to true on the dialog container.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_NAME: ApgRequirement = {
  standard: 'apg',
  pattern: 'dialog-modal',
  requirement: 'The dialog has either aria-labelledby or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIPTION: ApgRequirement = {
  standard: 'apg',
  pattern: 'dialog-modal',
  requirement:
    'Optionally, aria-describedby is set on the element with the dialog role to indicate which element or elements in the dialog contain content that describes the primary purpose or message of the dialog.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};

const DIALOG_FR1: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Dialog',
  clause: 'FR1',
  requirement:
    'A native Dialog MUST become visibly modal before Dialog applies its component-owned initial-focus request.',
  url: 'https://github.com/meta/astryx/blob/029368bde880cb25a7912523510419285d803a90/packages/core/src/Dialog/Dialog.spec.md',
};
const DIALOG_FR2: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Dialog',
  clause: 'FR2',
  requirement:
    'Dialog MUST honor an eligible descendant initial-focus request. A request is eligible only when its rendered target is inside the active Dialog, is neither hidden nor inert, and can receive programmatic focus when selection runs. DialogHeader supplies its title as the default when no non-default eligible request is rendered. Ordering among multiple non-default requests is unspecified (AV3).',
  url: DIALOG_FR1.url,
};
const DIALOG_FR3: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Dialog',
  clause: 'FR3',
  requirement:
    'When no eligible descendant request exists, Dialog MUST preserve the native dialog’s valid initial-focus behavior rather than move focus outside the modal.',
  url: DIALOG_FR1.url,
};
const DIALOG_FR4: AstryxRecord = {
  standard: 'astryx',
  id: 'component:Dialog',
  clause: 'FR4',
  requirement:
    'Closing a native Dialog MUST return focus to the still-connected external element that invoked the modal when that element can receive focus. Descendant mount focus MUST NOT replace that return owner.',
  url: DIALOG_FR1.url,
};

const LAYER_NATIVE_MODAL: AstryxRecord = {
  standard: 'astryx',
  id: 'architecture:layer-runtime',
  clause: 'Browser hosts and corrective portals',
  requirement:
    'dialog.showModal() provides a native modal boundary, backdrop, inert outside content, and platform close requests.',
  url: 'https://github.com/meta/astryx/blob/029368bde880cb25a7912523510419285d803a90/docs/architecture/layer-runtime.md',
};

const ALWAYS = {
  condition: 'the binding renders a modal dialog',
  test: () => true,
};

export interface ModalDialogStateFacts {
  readonly labelledBy: boolean;
  readonly hasDescriptionReference: boolean;
  readonly hasDeclaredInitialTarget: boolean;
  readonly usesNativeFocusFallback: boolean;
  readonly exercisesFocusRestoration: boolean;
  readonly makesBackgroundInert: boolean;
}

export const MODAL_DIALOG_PATTERN: PatternContract<ModalDialogStateFacts> =
  definePattern<ModalDialogStateFacts>({
    pattern: 'modal-dialog',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/',
    scope:
      'One native modal dialog that enters the browser modal state before focus, exposes its role and name, applies its declared focus entry and return, and makes the background inert.',
    expectations: [
      {
        id: 'modal-dialog.modal.in-top-layer',
        outcome:
          'The active dialog is in the browser’s native modal state, so the background is outside its interaction context.',
        sources: [DIALOG_FR1, LAYER_NATIVE_MODAL],
        covers: ['apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({subject}) => {
          if (!(await subject.isModal())) {
            throw new Error(
              'the dialog is open but is not a native modal in the browser top layer, so the page behind it remains in the same interaction context',
            );
          }
        },
      },
      {
        id: 'modal-dialog.modal.exposed',
        outcome:
          'The browser accessibility tree exposes the dialog as modal, matching the active interaction boundary.',
        sources: [WCAG_4_1_2, APG_MODAL],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {modal} = await subject.computed();
          if (modal !== true) {
            throw new Error(
              'the browser accessibility tree does not expose this active dialog as modal',
            );
          }
        },
      },
      {
        id: 'modal-dialog.focus.enters-after-modal',
        outcome:
          'The dialog reaches the browser’s native modal state before focus first enters its requested content.',
        sources: [DIALOG_FR1],
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding declares an eligible initial-focus target',
          test: facts => facts.hasDeclaredInitialTarget,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({initialFocusEntry}) => {
          const entry = await initialFocusEntry();
          if (!entry.subjectWasModal) {
            throw new Error(
              "focus entered the dialog before it reached the browser's native modal state",
            );
          }
        },
      },
      {
        id: 'modal-dialog.focus.initial-target',
        outcome:
          'Opening the modal places focus on the binding’s declared initial target inside the visible task.',
        sources: [DIALOG_FR2],
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding declares an eligible initial-focus target',
          test: facts => facts.hasDeclaredInitialTarget,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness}) => {
          const initial = await harness.related('initial');
          if (!(await initial.isFocused())) {
            throw new Error(
              'opening the modal dialog did not focus the binding’s declared initial target',
            );
          }
        },
      },
      {
        id: 'modal-dialog.focus.native-fallback',
        outcome:
          'When no descendant requests initial focus, browser-native focus remains inside the visible modal task.',
        sources: [DIALOG_FR3],
        covers: ['2.4.3-focus-order'],
        appliesWhen: {
          condition:
            'the binding has no eligible descendant initial-focus request',
          test: facts => facts.usesNativeFocusFallback,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({subject}) => {
          if (!(await subject.containsFocus())) {
            throw new Error(
              'opening a modal with no eligible descendant focus request left focus outside the visible dialog',
            );
          }
        },
      },
      {
        id: 'modal-dialog.focus.restored',
        outcome:
          'Closing the modal returns focus to its still-available invoker, so the person resumes where the task began.',
        sources: [DIALOG_FR4],
        covers: ['2.4.3-focus-order'],
        appliesWhen: {
          condition:
            'the state includes a close action and the invoker remains available',
          test: facts => facts.exercisesFocusRestoration,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const close = await harness.related('close');
          await close.focus();
          await harness.press('Enter');
          if (await subject.isModal()) {
            throw new Error(
              'activating the binding’s close action left the modal dialog open',
            );
          }
          const invoker = await harness.related('invoker');
          if (!(await invoker.isFocused())) {
            throw new Error(
              'closing the modal dialog did not return focus to its still-available invoker',
            );
          }
        },
      },
      {
        id: 'modal-dialog.background.inert',
        outcome:
          'While the modal is active, controls behind it cannot receive focus or pointer interaction.',
        sources: [DIALOG_FR1, LAYER_NATIVE_MODAL],
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: {
          condition: 'the binding declares a modal background',
          test: facts => facts.makesBackgroundInert,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const background = await harness.related('background');
          await background.focus();
          if (await background.isFocused()) {
            throw new Error(
              'a control behind the active modal dialog still received focus',
            );
          }
          if (!(await subject.containsFocus())) {
            throw new Error(
              'trying to focus the background moved focus outside the active modal dialog',
            );
          }
          if (await background.canReceivePointer()) {
            throw new Error(
              'a pointer can still reach a control behind the active modal dialog',
            );
          }
        },
      },
      {
        id: 'modal-dialog.role.exposed',
        outcome:
          'The browser accessibility tree exposes the modal task with role dialog.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'dialog') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this modal task'
                : `the browser reports this modal task as "${role}", not as a dialog`,
            );
          }
        },
      },
      {
        id: 'modal-dialog.name.exposed',
        outcome:
          'The browser accessibility tree exposes a non-empty name for the dialog.',
        sources: [WCAG_4_1_2, APG_NAME],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this dialog',
            );
          }
        },
      },
      {
        id: 'modal-dialog.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible dialog title, so speech-input users can say what they read.',
        sources: [WCAG_2_5_3],
        covers: ['2.5.3-label-in-name'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this state renders no visible dialog title, so there are no visible words for a speech-input user to say',
            );
          }
          const {name} = await subject.computed();
          if (!saysInOrder(spokenWords(name), spokenWords(visible))) {
            throw new Error(
              `the visible dialog title reads "${visible}" but the browser computes the accessible name as "${name}"`,
            );
          }
        },
      },
      {
        id: 'modal-dialog.name.references-resolve',
        outcome:
          'Every element used to label the dialog exists, so the task name is not silently lost.',
        sources: [WCAG_1_3_1, APG_NAME],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the dialog is named with aria-labelledby',
          test: facts => facts.labelledBy,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const attribute = await subject.attribute('aria-labelledby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'this state is labelled by another element, but the dialog has no aria-labelledby relationship',
            );
          }
          const targets = await subject.idReferences('aria-labelledby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-labelledby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing; the dialog loses that part of its name`,
            );
          }
        },
      },
      {
        id: 'modal-dialog.description.references-resolve',
        outcome:
          'Every id in aria-describedby resolves to an existing element, so the authored relationship is complete.',
        sources: [WCAG_1_3_1, APG_DESCRIPTION],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding authors an aria-describedby relationship',
          test: facts => facts.hasDescriptionReference,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const attribute = await subject.attribute('aria-describedby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'this state declares an aria-describedby relationship, but the dialog has no aria-describedby attribute',
            );
          }
          const targets = await subject.idReferences('aria-describedby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-describedby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component composition tests, the repository axe audit, and content review',
        reason:
          'The modal-dialog pattern owns the dialog surface, not the alternatives for images or icons composed inside it.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component DOM tests for structural relationships inside the dialog',
        reason:
          'This contract verifies the dialog name and description relationships; headings, fields, and groups composed inside remain component or caller content.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and caller content',
        verifiedBy: 'component DOM-order tests and content review',
        reason:
          'Reading order inside a modal task depends on the content the binding composes.',
      },
      '1.3.5-identify-input-purpose': {
        owner:
          'caller content and the form controls composed inside the dialog',
        verifiedBy:
          'form-control contracts and integration review of autocomplete purposes',
        reason:
          'The modal-dialog pattern does not choose or encode the purpose of caller-composed input fields.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component, theme, and caller content',
        verifiedBy: 'the repository visual gate and component review',
        reason:
          'Color-dependent meaning is a rendered visual and content fact, not a modal interaction fact.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Text contrast depends on resolved colors and the content rendered inside the modal.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Control, backdrop, and focus-indicator contrast are rendered-color measurements.',
      },
      '2.1.1-keyboard': {
        owner:
          'family:overlay-dismissal, the binding component, and caller content',
        verifiedBy:
          'component tests for Escape policy and controls composed inside the dialog, plus integration review of caller-owned commands',
        reason:
          'Current Dialog and overlay authority keep keyboard dismissal policy and composed-control operation outside this reusable modal-focus contract.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the binding component and its current focus contract',
        verifiedBy:
          'current Dialog tests for each supported dismissal path; no Tab-containment claim is verified until the Dialog owner adopts one',
        reason:
          'Current Dialog authority does not adopt APG Tab wrapping as a required outcome, so this contract does not turn that mechanic into policy.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason:
          'A component rendered in isolation does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level review of the order before opening and after focus restoration',
        reason:
          'This contract covers focus entry, containment, and return; the surrounding page owns the sequence outside the modal task.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'caller content',
        verifiedBy: 'review of links composed inside the dialog',
        reason: 'The adopted modal-dialog pattern has no required link part.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content',
        verifiedBy:
          'content review of the visible title, field labels, and instructions',
        reason:
          'This contract proves a name exists and includes the visible title; whether the wording describes the task remains a content judgement.',
      },
      '2.4.7-focus-visible': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and focus-ring review',
        reason: 'A visible focus indicator is a painted result.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'real-browser layout review of scrolling content and composed sticky regions',
        reason:
          'Whether focused content is obscured depends on modal layout and caller-composed content, not the focus lifecycle alone.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy:
          'component tests for backdrop and explicit close-button pointer behavior',
        reason:
          'Pointer dismissal channels vary by the component’s declared purpose and are not a universal modal-dialog action.',
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component and caller-composed controls',
        verifiedBy:
          'component-specific label-in-name tests and content review for controls inside the dialog',
        reason:
          'This contract verifies the dialog container’s visible title; buttons, fields, and other controls composed inside retain their own label-in-name obligations.',
        coversRemainderOnly: true,
      },
      '2.5.8-target-size': {
        owner: 'the binding component and caller content',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Target size belongs to the concrete controls composed inside the dialog.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A modal component does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller',
        verifiedBy:
          'integration tests for effects the caller performs after onOpenChange',
        reason:
          'The component requests dismissal; navigation or other context changes in response are caller-owned.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system',
        verifiedBy:
          'shared contract adoption and component API review across modal-dialog bindings',
        reason:
          'Consistency is a property of all adopters, not one rendered binding.',
      },
      '3.3.1-error-identification': {
        owner: 'caller content and form controls',
        verifiedBy:
          'form-control contracts and composed-dialog integration tests',
        reason:
          'Validation and error text belong to the fields and workflow rendered inside the dialog.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'caller content and form controls',
        verifiedBy: 'form-control contracts and content review',
        reason:
          'The modal surface does not author labels or instructions for fields composed inside it.',
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component and composed controls',
        verifiedBy:
          'component-specific tests for states and values not owned by the dialog surface',
        reason:
          'This contract covers the dialog role and name; descendant controls own their own roles, states, and values.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component status-message tests plus real-AT evidence under AST-009 when the claim is about announcement',
        reason:
          'A modal opening is a focus transition, not a status-message contract; updates inside it belong to their source.',
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy: 'forced-colors review and the repository visual gate',
        reason: 'Forced-color output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          'component transition tests and the repository visual gate under reduced motion',
        reason:
          'Entry and exit motion are rendered over time, not semantic behavior.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy: 'the repository i18n catalog check',
        reason:
          'Translation is a source-level concern; real announcement claims remain with AST-009.',
      },
    },
  });
