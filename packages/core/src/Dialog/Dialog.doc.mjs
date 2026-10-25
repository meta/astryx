// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Dialog',
  displayName: 'Dialog',
  group: 'Dialog',
  category: 'Overlay',
  keywords: [
    'dialog',
    'modal',
    'popup',
    'overlay',
    'lightbox',
    'alert',
    'confirm',
    'prompt',
    'backdrop',
    'focus trap',
    'imperative',
  ],
  // Intentionally a contained isInline preview, not playground.overlay: the
  // component stays visible on load and knobs stay live, whereas a real
  // showModal() overlay makes the page inert — see ComponentPlaygroundConfig.overlay
  // in docs-types.ts (#3657).
  playground: {
    defaults: {
      isOpen: true,
      isInline: true,
      onOpenChange: undefined,
      width: 400,
      children: {
        __element: 'VStack',
        props: {gap: 2},
        children: [
          {__element: 'Heading', props: {level: 3}, children: 'Dialog Title'},
          {
            __element: 'Text',
            props: {type: 'body'},
            children:
              'Are you sure you want to proceed? This action can be undone later from settings.',
          },
        ],
      },
    },
  },
  theming: {
    container: true,
    targets: [
      {className: 'astryx-dialog', visualProps: ['variant']},
      {className: 'astryx-dialog-header'},
      {className: 'astryx-dialog-header-start-content'},
      {className: 'astryx-dialog-header-title-block'},
      {className: 'astryx-dialog-header-end-content'},
      {className: 'astryx-dialog-header-close-icon'},
    ],
    vars: [
      {
        name: '--_dialog-radius',
        description: 'Border radius of the dialog',
        default: 'var(--radius-container)',
        private: true,
      },
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_dialog-radius']},
      {property: 'padding', expand: 'container'},
    ],
  },
  description:
    'Modal dialog using the native <dialog> element. Modal and inline content starts with theme body text defaults. Ancestor surface/group membership ends as a whole, including group-owned state. Explicit props and unrelated contexts remain unchanged. Place intentional groups and complete required providers inside the dialog. With reduced motion the dialog never slides or scales in: on a touch screen it fades in, in 200 ms or less, and with a mouse it appears at once.',
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the dialog is open.',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => unknown',
      description: 'Callback when dialog visibility changes.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Dialog content.',
      required: true,
    },
    {
      name: 'width',
      type: 'number | string',
      description:
        'Preferred width of the dialog in pixels or any CSS value. Standard dialogs clamp to their container and the dynamic viewport with spacing-token gutters so narrow viewports keep content on screen.',
      default: '400',
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description:
        'Maximum height of the dialog. Defaults to a dynamic viewport value so browser UI changes are reflected where supported.',
      default: "'75dvh'",
    },
    {
      name: 'position',
      type: 'DialogPosition',
      description:
        'Static position for the dialog; centered by default when omitted. ' +
        'Use logical `start`/`end` for inline offsets so positioned dialogs mirror correctly under RTL.',
    },
    {
      name: 'variant',
      type: "'standard' | 'fullscreen'",
      description:
        'Dialog variant: fullscreen expands to fill the entire viewport.',
      default: "'standard'",
    },
    {
      name: 'purpose',
      type: "'required' | 'form' | 'info'",
      description:
        'Controls dismissal behavior: required disables Escape and backdrop click; form disables backdrop click after interaction; info allows both.',
      default: "'info'",
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Internal padding of the dialog using the spacing scale step.',
    },
    {
      name: 'isInline',
      type: 'boolean',
      description:
        'Renders dialog content inline without the <dialog> element, backdrop, or modal behavior. For documentation previews and showcases only.',
      default: 'false',
    },
  ],
  components: [{name: 'DialogHeader'}, {name: 'useImperativeDialog'}],
  usage: {
    description:
      'Dialog displays a modal overlay that blocks interaction with the page until the user responds. Use it for delete confirmations, edit forms, terms acceptance, or any decision that should not be skipped.\n\nFor cases where you want to show a dialog without managing open state, use the `useImperativeDialog` hook: call `dialog.show(content)` and render `dialog.element` in your tree.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right purpose: info for dismissable content, form to prevent accidental backdrop dismissal, required when the user must respond.',
      },
      {
        guidance: true,
        description:
          'Include a clear title in the header so users immediately understand what the dialog is asking.',
      },
      {
        guidance: true,
        description:
          'Use purpose="form" for dialogs with inputs so the user can\'t accidentally lose data by clicking the backdrop.',
      },
      {
        guidance: true,
        description:
          'Keep dialogs focused on a single task; if the content grows beyond what fits, consider a full page instead.',
      },
      {
        guidance: false,
        description:
          'Use a dialog for simple messages that could be shown inline or as a toast notification.',
      },
      {
        guidance: false,
        description:
          'Nest dialogs inside other dialogs; restructure the flow into steps within a single dialog instead.',
      },
      {
        guidance: false,
        description:
          'Use the fullscreen variant for simple confirmations; it is meant for complex content like editors or long forms.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: true,
        description:
          'Title, optional subtitle, and close button. The title receives focus on open and labels the dialog via aria-labelledby.',
      },
      {
        name: 'Body',
        required: true,
        description:
          'The main content area: text, forms, lists, or any layout.',
      },
      {
        name: 'Footer',
        required: false,
        description:
          'Action buttons like Save/Cancel or Accept/Decline, aligned to the end.',
      },
      {
        name: 'Backdrop',
        required: true,
        description:
          'Semi-transparent overlay behind the dialog that blocks page interaction.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'Dialog displays a modal overlay that blocks interaction with the page until the user responds. Use it for delete confirmations, edit forms, terms acceptance, or any decision that should not be skipped.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right purpose: info for dismissable content, form to prevent accidental backdrop dismissal, required when the user must respond.',
      },
      {
        guidance: true,
        description:
          'Include a clear title in the header so users immediately understand what the dialog is asking.',
      },
      {
        guidance: true,
        description:
          'Use purpose="form" for dialogs with inputs so the user can\'t accidentally lose data by clicking the backdrop.',
      },
      {
        guidance: true,
        description:
          'Keep dialogs focused on a single task; if the content grows beyond what fits, consider a full page instead.',
      },
      {
        guidance: false,
        description:
          'Use a dialog for simple messages that could be shown inline or as a toast notification.',
      },
      {
        guidance: false,
        description:
          'Nest dialogs inside other dialogs; restructure the flow into steps within a single dialog instead.',
      },
      {
        guidance: false,
        description:
          'Use the fullscreen variant for simple confirmations; it is meant for complex content like editors or long forms.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: true,
        description:
          'Title, optional subtitle, and close button. The title receives focus on open and labels the dialog via aria-labelledby.',
      },
      {
        name: 'Body',
        required: true,
        description:
          'The main content area: text, forms, lists, or any layout.',
      },
      {
        name: 'Footer',
        required: false,
        description:
          'Action buttons like Save/Cancel or Accept/Decline, aligned to the end.',
      },
      {
        name: 'Backdrop',
        required: true,
        description:
          'Semi-transparent overlay behind the dialog that blocks page interaction.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'modal overlay that blocks page interaction until the user responds',
  usage: {
    description:
      'Dialog displays a modal overlay that blocks page interaction. Use for delete confirmations, edit forms, terms acceptance. Modal and inline content uses theme body defaults and exits ancestor surface/group membership as a whole; explicit props and unrelated contexts remain unchanged. Provide intentional groups and complete required providers inside the dialog.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right purpose: info for dismissable content, form to prevent accidental backdrop dismissal, required when user must respond.',
      },
      {
        guidance: true,
        description:
          'Include a clear title in the header so users immediately understand what the dialog is asking.',
      },
      {
        guidance: true,
        description:
          'Use purpose="form" for dialogs with inputs so user can\'t accidentally lose data by clicking the backdrop.',
      },
      {
        guidance: true,
        description:
          'Keep dialogs focused on a single task; if content grows beyond what fits, consider a full page instead.',
      },
      {
        guidance: false,
        description:
          'Use a dialog for simple messages that could be shown inline or as a toast notification.',
      },
      {
        guidance: false,
        description:
          'Nest dialogs inside other dialogs; restructure the flow into steps within a single dialog instead.',
      },
      {
        guidance: false,
        description:
          "Use the fullscreen variant for simple confirmations; it's meant for complex content like editors or long forms.",
      },
    ],
  },
};
