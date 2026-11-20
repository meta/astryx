// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'usePopover',
  displayName: 'usePopover',
  group: 'Popover',
  keywords: [
    'popover',
    'popup',
    'dropdown',
    'floating',
    'anchor',
    'dialog',
    'overlay',
    'flyout',
  ],
  params: [
    {
      name: 'anchorRef',
      type: 'React.RefObject<Element | null>',
      description:
        'External ref to use as the popover anchor: the element the popover sits on when it is not the trigger. Any element with a CSS box works (an HTML element or an <svg> element; a shape inside an <svg> warns in development). The trigger keeps its toggle and ARIA; the anchor gets neither and is never a trigger. The ref is read on open, on each render of your component, and on each show(). To move an open popover, set anchorRef.current and call show(). A show() while the ref holds no element waits, and opens when the ref is next read and holds one. With no trigger attached, open it with show(). Omit it and the trigger is the anchor.',
    },
    {
      name: 'onShow',
      type: '() => void',
      description: 'Callback fired when the popover becomes visible.',
    },
    {
      name: 'onHide',
      type: '() => void',
      description:
        'Callback fired when the popover is hidden. Focus returns on its own as the popover closes, and there is no option to turn that off; to send focus somewhere else, focus that element here.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied to the popover content wrapper, after the default surface styles.',
    },
    {
      name: 'hasLightDismiss',
      type: 'boolean',
      description: 'Whether clicking outside dismisses the popover.',
      default: 'true',
    },
    {
      name: 'hasEscapeDismiss',
      type: 'boolean',
      description:
        'Whether pressing Escape dismisses the popover. Only takes full effect together with hasLightDismiss: false, since native light dismiss also closes on Escape.',
      default: 'true',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description:
        'Whether to focus the first genuine content control when opened. Dialogs with none fall back to the labeled surface; the generated close control is excluded from initial focus.',
      default: 'true',
    },
    {
      name: 'hasCloseButton',
      type: 'boolean',
      description:
        'Whether to include a hidden close button that appears for keyboard users.',
      default: 'true',
    },
    {
      name: 'closeButtonLabel',
      type: 'string',
      description: 'Accessible label for the hidden close button.',
      default: "'Close popover'",
    },
    {
      name: 'dialogLabel',
      type: 'string',
      description:
        'Accessible label for the popover dialog (only applies when role is "dialog"). Provide one when there is no visible title.',
    },
    {
      name: 'role',
      type: "'dialog' | 'none'",
      description:
        'ARIA role on the content wrapper. Use "dialog" for genuine dialog content; use "none" for listbox/menu popups whose own content role should be exposed and whose trigger keeps DOM focus.',
      default: "'dialog'",
    },
    {
      name: 'isModal',
      type: 'boolean',
      description:
        'Whether a dialog-role popover is modal (aria-modal). Only applies when role is "dialog".',
      default: 'true',
    },
    {
      name: 'hasSurface',
      type: 'boolean',
      description:
        'Whether to apply the default popover surface background, radius, and shadow.',
      default: 'true',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Inner padding of the painted surface on the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10). Omit it and the hook paints no padding of its own; Popover passes 3 by default and 0 for a flush surface.',
    },
    {
      name: 'surfaceTarget',
      type: 'string',
      description:
        'Optional component-owned refinement target on the painted surface, without the astryx- prefix. Use and document one when a direct hook composition needs distinct theme reachability.',
    },
  ],
  returns: [
    {
      name: 'triggerRef',
      type: '(el: HTMLElement | null) => void',
      description:
        'Ref callback to attach to the trigger element for CSS anchor positioning.',
    },
    {
      name: 'contentRef',
      type: 'RefObject<HTMLDivElement | null>',
      description:
        'Ref for the popover content container used by focus trapping.',
    },
    {
      name: 'anchorId',
      type: 'string',
      description: 'CSS anchor name for advanced positioning cases.',
    },
    {
      name: 'show',
      type: '(options?: {skipAutoFocus?: boolean}) => void',
      description:
        'Imperatively show the popover. skipAutoFocus preserves current focus for input-triggered popovers.',
    },
    {
      name: 'hide',
      type: '() => void',
      description: 'Imperatively hide the popover.',
    },
    {
      name: 'toggle',
      type: '() => void',
      description: 'Toggle the popover open or closed.',
    },
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the popover is currently open.',
    },
    {
      name: 'id',
      type: 'string',
      description: 'Unique ID for aria-describedby or aria-controls.',
    },
    {
      name: 'render',
      type: '(children: ReactNode, props?: ContextRenderProps) => ReactNode',
      description:
        "Render function for anchor-positioned popover content. Pass placement and alignment here. Logical: start/end resolve against the popover's own inherited direction (RTL mirrors in pure CSS).",
    },
    {
      name: 'triggerProps',
      type: '{aria-haspopup: "dialog" | "true"; aria-expanded: boolean; aria-controls: string}',
      description:
        'ARIA attributes to spread onto the trigger element. aria-haspopup reflects the popover role.',
    },
  ],
  usage: {
    description:
      'Headless hook for click-triggered popovers with focus trapping. Combines useLayer with useFocusTrap, auto-focus, light dismiss, Escape handling, and an optional hidden close button for accessible dialog-like popover behavior. Every painted surface emits the canonical popover target. A custom composition needing a distinct stable seam should pass and document its own surfaceTarget.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for interactive content such as menus, pickers, forms, and command panels that need focus management.',
      },
      {
        guidance: true,
        description:
          'Prefer the Popover component for standard trigger-content pairs; use the hook for custom trigger patterns.',
      },
      {
        guidance: true,
        description:
          'Do not add your own focus return: the hook returns focus as the popover closes, to the opener or a stand-in, and has no option to turn that off.',
      },
      {
        guidance: true,
        description: 'Use popover as the broad canonical surface target.',
      },
      {
        guidance: true,
        description:
          'When a custom composition needs its own theme refinement, pass and document an owned surfaceTarget such as selector-popup. It refines the Popover surface rather than creating another anatomy part.',
      },
      {
        guidance: false,
        description:
          'Use for non-interactive hover previews: use useHoverCard or useTooltip instead.',
      },
    ],
  },
  relatedComponents: ['Popover', 'DropdownMenu', 'HoverCard'],
  relatedHooks: ['useLayer', 'useFocusTrap', 'useHoverCard', 'useTooltip'],
  importPath: '@astryxdesign/core/Popover',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless click-triggered popovers w/ focus trap, auto-focus, light dismiss, Escape, optional hidden close button. Every surface emits the canonical popover target. Custom compositions needing a distinct seam pass/document an owned surfaceTarget.',
  paramDescriptions: {
    anchorRef:
      'ref to the element popover sits on when not the trigger; read on open, each render and each show(); position only, no trigger ARIA or handlers.',
    onShow: 'fires when popover becomes visible.',
    onHide:
      'fires when popover hides; focus a specific element here to send focus there (focus return then leaves it).',
    xstyle: 'StyleX styles for content wrapper, after default surface.',
    hasLightDismiss: 'whether outside click dismisses popover.',
    hasEscapeDismiss:
      'whether Escape dismisses; full effect only w/ hasLightDismiss false.',
    hasAutoFocus:
      'focus genuine content on open; dialog surface fallback; generated close excluded.',
    hasCloseButton: 'whether hidden keyboard close button is included.',
    closeButtonLabel: 'label for hidden close button.',
    dialogLabel: 'accessible label for popover dialog (role="dialog" only).',
    role: 'content wrapper ARIA role; "none" for listbox/menu popups.',
    isModal: 'whether a dialog-role popover is modal (aria-modal).',
    hasSurface: 'apply default surface background/radius/shadow.',
    padding: 'spacing-scale padding on the painted surface; omit for none.',
    surfaceTarget:
      'optional owned refinement target; document it when distinct reachability is needed.',
  },
  returnDescriptions: {
    triggerRef: 'trigger ref for CSS anchor positioning.',
    contentRef: 'content container ref for focus trap.',
    anchorId: 'CSS anchor name.',
    show: 'show popover; skipAutoFocus preserves current focus.',
    hide: 'hide popover.',
    toggle: 'toggle open/closed.',
    isOpen: 'whether currently open.',
    id: 'unique ARIA id.',
    render: 'renders anchor-positioned popover content.',
    triggerProps: 'ARIA attrs for trigger.',
  },
  usage: {
    description:
      'Headless click-triggered popovers w/ focus trap, auto-focus, light dismiss, Escape, optional hidden close button. Every surface emits the canonical popover target. Custom compositions needing a distinct seam pass/document an owned surfaceTarget.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for menus, pickers, forms, command panels needing focus management.',
      },
      {
        guidance: true,
        description:
          'Prefer Popover for standard trigger-content pairs; use hook for custom trigger patterns.',
      },
      {
        guidance: true,
        description:
          'Use the canonical popover target for broad surface theming.',
      },
      {
        guidance: true,
        description:
          'For component-specific reachability, pass and document an owned surfaceTarget; it refines the same surface.',
      },
      {
        guidance: false,
        description:
          'Use for non-interactive hover previews: use useHoverCard / useTooltip instead.',
      },
    ],
  },
};
