// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AlertDialog',
  displayName: 'Alert Dialog',
  group: 'Dialog',
  category: 'Overlay',
  isHiddenFromOverview: true,
  keywords: [
    'alert',
    'alertdialog',
    'confirm',
    'confirmation',
    'destructive',
    'delete',
    'modal',
    'dialog',
    'imperative',
  ],
  usage: {
    description:
      'AlertDialog asks the user to confirm a destructive or irreversible action before it happens. Use it for things like deleting content, revoking access, or discarding unsaved changes.\n\nIt implements the WAI-ARIA APG [Alert Dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/): `role="alertdialog"`, a title linked by `aria-labelledby`, a consequence description linked by `aria-describedby`, focus moved into the dialog on open and returned to the trigger on close, and no dismissal by clicking outside. Escape cancels.\n\nAlertDialog passes its requested width through to Dialog, which clamps the surface to the container and dynamic viewport with token gutters. Generic Dialog footers should wrap, but Dialog does not own action semantics or order; consumer composition controls that. AlertDialog owns its confirmation semantics: above 640px, actions render horizontally and may move onto another row; at 640px and below, the destructive action appears above Cancel and both buttons fill the footer width. Button labels retain their standard single-line behavior. The breakpoint follows available width, not pointer or hover capability. The body scrolls when block space is constrained.\n\nOn a touch screen the two actions are tracked as one group under a finger or a pen, the way iOS tracks the actions of an alert: the action under the finger highlights as soon as it is touched, the highlight follows the finger from one action to the other, and lifting the finger runs the action under it. Lifting it off both actions runs nothing. A mouse, the keyboard and assistive technology keep the click of each button.\n\nUnder a finger, on a phone or tablet, the alert also appears and leaves the way an iOS alert does: it scales down slightly into place while it and the dimming fade in, on the entrance timing of the theme, and it fades out with the dimming when it closes, on the exit timing of the theme. While it appears a touch does nothing (keys and assistive technology still act). While it leaves nothing reaches it: a touch, a click, a key or an assistive-technology activation does nothing, and a toast it raised stays live. With reduced motion it only cross-fades. With a mouse it keeps the theme entrance and closes at once.\n\nFor cases where you want to show an alert without managing open state, use the `useImperativeAlertDialog` hook: call `alert.show(options)` and render `alert.element` in your tree.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Make the action button label specific: "Delete project" is better than "OK" or "Confirm".',
      },
      {
        guidance: true,
        description:
          'Describe what will happen in the description so the user knows the consequences before confirming.',
      },
      {
        guidance: true,
        description:
          'Keep the cancel button as the least-destructive focus target. On narrow screens the destructive action is visually and structurally above Cancel, but Cancel still receives initial focus.',
      },
      {
        guidance: true,
        description:
          'Use concise, specific action labels. Above 640px, complete buttons may move onto another row; at 640px and below, the destructive action appears above Cancel and both buttons fill the footer width.',
      },
      {
        guidance: false,
        description:
          'Use AlertDialog for non-destructive actions; use a standard Dialog instead.',
      },
      {
        guidance: false,
        description:
          'Rely on color alone to signal danger; the action label itself should say what will happen.',
      },
      {
        guidance: false,
        description:
          'Close the dialog from onAction before the work finishes; hold it open with isActionLoading and call onOpenChange(false) when the action settles.',
      },
    ],
    anatomy: [
      {
        name: 'Title',
        required: true,
        description:
          'The question being asked. Renders as a level-2 heading and labels the dialog via aria-labelledby.',
      },
      {
        name: 'Description',
        required: true,
        description:
          'What will happen if the user confirms. Linked to the dialog via aria-describedby.',
      },
      {
        name: 'Cancel button',
        required: true,
        description:
          'Ghost button that dismisses without acting. Takes initial focus, and Escape does the same thing.',
      },
      {
        name: 'Action button',
        required: true,
        description:
          'The confirming action. Destructive by default; shows a spinner while isActionLoading is set.',
      },
      {
        name: 'Backdrop',
        required: true,
        description:
          'Overlay behind the dialog that blocks page interaction. Clicking it does not dismiss.',
      },
      {
        name: 'Dialog surface',
        required: true,
        description:
          'The modal panel that holds the title, description, and buttons.',
      },
    ],
  },
  // Intentionally a contained isInline preview, not playground.overlay: the
  // component stays visible on load and knobs stay live, whereas a real
  // showModal() overlay makes the page inert — see ComponentPlaygroundConfig.overlay
  // in docs-types.ts (#3657).
  playground: {
    defaults: {
      isOpen: true,
      isInline: true,
      onOpenChange: undefined,
      title: 'Delete item?',
      description:
        'This action cannot be undone. The item and all its data will be permanently removed.',
      actionLabel: 'Delete',
    },
  },
  description:
    'A modal dialog that asks the user to confirm a destructive action.',
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      required: true,
      description: 'Whether the dialog is open.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => unknown',
      required: true,
      description: 'Visibility change callback.',
    },
    {
      name: 'title',
      type: 'string',
      required: true,
      description: 'Dialog title. Linked via aria-labelledby.',
    },
    {
      name: 'description',
      type: 'string',
      required: true,
      description: 'Consequence description. Linked via aria-describedby.',
    },
    {
      name: 'actionLabel',
      type: 'string',
      required: true,
      description: 'Action button label.',
    },
    {
      name: 'onAction',
      type: '() => unknown',
      required: true,
      description: 'Called when action button is clicked. Does NOT auto-close.',
    },
    {
      name: 'cancelLabel',
      type: 'string',
      default: "'Cancel'",
      description: 'Cancel button label.',
    },
    {
      name: 'actionVariant',
      type: 'ButtonVariant',
      default: "'destructive'",
      description: 'Action button variant.',
    },
    {
      name: 'isActionLoading',
      type: 'boolean',
      description: 'Shows loading spinner on the action button.',
    },
    {
      name: 'width',
      type: 'number | string',
      default: '400',
      description:
        'Requested dialog width. Dialog preserves this preferred width and clamps it to the container and dynamic viewport with token gutters. Without one, a phone (a compact window under a coarse primary pointer) gets the iOS alert width, 320, in every theme.',
    },
    {
      name: 'isInline',
      type: 'boolean',
      default: 'false',
      description:
        'Renders alert dialog content inline without modal behavior. For documentation previews and showcases only. Not being a modal, the inline path renders role="group" instead of role="alertdialog".',
    },
  ],
  components: [{name: 'useImperativeAlertDialog'}],
  theming: {
    targets: [{className: 'astryx-alert-dialog'}],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Confirms destructive/irreversible action before it happens (delete, revoke access, discard unsaved changes).',
  usage: {
    description:
      'AlertDialog confirms destructive/irreversible action (delete, revoke access, discard changes). Implements WAI-ARIA APG Alert Dialog pattern (https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/): role="alertdialog", aria-labelledby title, aria-describedby description, focus into dialog on open + back to trigger on close, no outside-click dismissal, Escape cancels. Dialog preserves requested width + clamps it to container/dynamic viewport gutters. Generic Dialog footers wrap while consumers own action order. AlertDialog owns confirmation action layout: >640px horizontal buttons may move to another row; <=640px puts the destructive action above Cancel and makes both buttons full width regardless of pointer/hover capability. Button labels remain single-line. Body scrolls when height constrained. Touch (finger or pen): both actions tracked as one group like iOS alerts (action under finger highlights at once, highlight follows finger between actions, lift runs action under finger, lift off both runs nothing); mouse/keyboard/AT keep each button click. Under a finger (phone or tablet), motion like iOS alerts: scales down into place + fades in with the dim on the theme entrance timing, fades out with the dim on the theme exit timing; touch ignored while it appears (keys/AT still act), no input (touch, click, key, AT) while it leaves, a toast it raised stays live; reduced motion = cross-fade only; with a mouse, theme entrance + closes at once. Phone default width 320 (caller width wins). To show w/o managing open state, use useImperativeAlertDialog hook: call alert.show(options) + render alert.element in tree.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Make action button label specific: "Delete project" > "OK"/"Confirm".',
      },
      {
        guidance: true,
        description:
          'Describe consequences in description so user knows outcome before confirming.',
      },
      {
        guidance: true,
        description:
          'Keep cancel as initial focus: least destructive choice is preselected even when narrow visual/DOM order places it after the destructive action.',
      },
      {
        guidance: true,
        description:
          'Use concise action labels; >640px complete buttons may move to another row, and <=640px puts the destructive action above Cancel with both buttons full width regardless of pointer type.',
      },
      {
        guidance: false,
        description:
          'Use AlertDialog for non-destructive actions; use standard Dialog instead.',
      },
      {
        guidance: false,
        description:
          'Rely on color alone for danger; the action label should say what happens.',
      },
      {
        guidance: false,
        description:
          'Close from onAction before work finishes; hold open w/ isActionLoading, call onOpenChange(false) when it settles.',
      },
    ],
  },
};
