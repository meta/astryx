// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useToast',
  displayName: 'useToast',
  group: 'Toast',
  keywords: [
    'toast',
    'notification',
    'snackbar',
    'alert',
    'message',
    'feedback',
    'flash',
  ],
  params: [
    // useToast takes no arguments; returns a show function
  ],
  returns: [
    {
      name: 'value',
      type: '(options: ToastOptions) => () => void',
      description:
        "useToast returns the show function itself, not an object: `const showToast = useToast(); showToast({body: 'Saved'});`. Call it with toast options to show a toast; it returns a function that dismisses that toast. ToastOptions fields: " +
        'body: ReactNode (required) is the message. ' +
        'type?: "info" | "error" sets the color; default "info". ' +
        'isAutoHide?: boolean dismisses the toast on a timer; default true for "info" and false for "error". ' +
        'autoHideDuration?: number is the time in milliseconds before the auto-dismiss; default 5000. ' +
        'endContent?: ReactNode is trailing content, for example an Undo Button. ' +
        'uniqueID?: string identifies the toast for deduplication. ' +
        'collisionBehavior?: "overwrite" | "ignore" sets what a new toast with the same uniqueID does: "overwrite" replaces the shown toast in place, "ignore" keeps the shown toast and drops the new one; default "overwrite". ' +
        'onHide?: (reason: "auto" | "manual") => void runs when the toast is removed. ' +
        'renderContent?: (toast) => ReactNode replaces the content of the card with your own layout; it receives body, endContent, type, isAutoHide, autoHideDuration and dismiss. Your layout must include the control that closes the toast. ' +
        'Import the ToastOptions type from @astryxdesign/core/Toast.',
    },
  ],
  usage: {
    description:
      'Hook for showing toast notifications from anywhere in your component tree; it needs no provider or mounted ToastViewport: inside LayerProvider (or a ToastViewport) it uses that viewport, and otherwise the first toast mounts a fallback viewport on document.body with a development warning. Returns the show function itself (not an object): `const showToast = useToast()`; call it with toast options to show the notification.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for transient success/error feedback that does not require user action.',
      },
      {
        guidance: true,
        description:
          'Set uniqueID to deduplicate toasts from rapid user actions.',
      },
      {
        guidance: true,
        description:
          'For an undo action, pass endContent: <Button label="Undo" variant="ghost" onClick={...} />, and call the dismiss function that showToast returns from that onClick.',
      },
      {
        guidance: false,
        description:
          'Use for critical errors that require acknowledgment; use AlertDialog instead.',
      },
      {
        guidance: false,
        description:
          'Call useToast in the same component that renders LayerProvider; it must be called from a child component inside the provider.',
      },
    ],
  },
  relatedComponents: ['Toast', 'Banner', 'AlertDialog'],
  relatedHooks: [],
  importPath: '@astryxdesign/core/Toast',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Show toast notifications from anywhere in component tree; no provider needed: uses LayerProvider/ToastViewport if present, else first toast mounts fallback viewport on document.body (dev warning). Returns the show fn itself, not an object (`const showToast = useToast()`); call it w/ toast options to show notification.',
  returnDescriptions: {
    value:
      'Returns the show fn itself, not an object: `const showToast = useToast(); showToast({body: \'Saved\'})`. Shows toast; returns dismiss fn. ToastOptions: body: ReactNode (required); type?: "info"|"error" (default "info"); isAutoHide?: boolean (default true for info, false for error); autoHideDuration?: ms (default 5000); endContent?: ReactNode (e.g. Undo Button); uniqueID?: string (dedupe); collisionBehavior?: "overwrite"|"ignore" (same uniqueID; default "overwrite"); onHide?: (reason: "auto"|"manual") => void; renderContent?: (toast) => ReactNode (own card content; gets body, endContent, type, isAutoHide, autoHideDuration, dismiss; must render its own close control). Type: ToastOptions from @astryxdesign/core/Toast.',
  },
  usage: {
    description:
      'Show toast notifications from anywhere in component tree; no provider needed: uses LayerProvider/ToastViewport if present, else first toast mounts fallback viewport on document.body (dev warning). Returns the show fn itself, not an object (`const showToast = useToast()`); call it w/ toast options to show notification.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for transient success/error feedback not requiring user action.',
      },
      {
        guidance: true,
        description:
          'Set uniqueID to deduplicate toasts from rapid user actions.',
      },
      {
        guidance: true,
        description:
          'Undo: endContent = <Button label="Undo" variant="ghost" onClick={...} />; call dismiss fn returned by showToast from that onClick.',
      },
      {
        guidance: false,
        description:
          'Use for critical errors requiring acknowledgment; use AlertDialog instead.',
      },
      {
        guidance: false,
        description:
          'Call useToast in same component that renders LayerProvider; must be called from child component inside provider.',
      },
    ],
  },
};
