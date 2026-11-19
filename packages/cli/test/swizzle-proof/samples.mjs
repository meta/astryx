// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file samples.mjs
 * @input A copy's component, its module, and the package modules
 * @output One element per swizzle target whose playground defaults do not
 *   render on their own
 * @position Read by the swizzle proof's entries; children and helpers come
 *   from the copy's own module when it exports them
 */

import {labNeedsNoSample, labSamples} from '../../../lab/swizzle-samples.mjs';

const noop = () => {};
const ref = () => ({current: null});

/** A small icon for targets whose required `icon` takes any node. */
const dotIcon = React =>
  React.createElement(
    'svg',
    {viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true},
    React.createElement('circle', {cx: 8, cy: 8, r: 6}),
  );

/** A search source over three teams, for the typeahead targets. */
function teamSource() {
  const items = [
    {id: 'design', label: 'Design'},
    {id: 'engineering', label: 'Engineering'},
    {id: 'research', label: 'Research'},
  ];
  return {
    search: query =>
      items.filter(item =>
        item.label.toLowerCase().includes(String(query).toLowerCase()),
      ),
    bootstrap: () => items,
    cancel: noop,
  };
}

/** A rich text editor state of one paragraph, as the view reads it. */
const paragraphState = text => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

function chartsSample(React, mod, Pkg, slot) {
  const h = React.createElement;
  const Chart = mod.Chart ?? Pkg.Chart;
  const bar = mod.bar ?? Pkg.bar;
  const data = [
    {month: 'Jan', revenue: 3},
    {month: 'Feb', revenue: 5},
    {month: 'Mar', revenue: 4},
  ];
  return h(Chart, {
    data,
    xKey: 'month',
    series: [bar('revenue', {label: 'Revenue'})],
    title: 'Revenue',
    ...slot,
  });
}

export const samples = {
  core__AlertDialog: ({C, React}) =>
    React.createElement(C, {
      isOpen: true,
      onOpenChange: noop,
      title: 'Delete file?',
      description: 'This cannot be undone.',
      actionLabel: 'Delete',
      onAction: noop,
    }),
  core__CommandPalette: ({C, React}) => {
    const items = [
      {id: 'open', label: 'Open file'},
      {id: 'save', label: 'Save file'},
    ];
    return React.createElement(C, {
      isOpen: true,
      isInline: true,
      onOpenChange: noop,
      searchSource: {
        search: q =>
          items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())),
        bootstrap: () => items,
        cancel: noop,
      },
    });
  },
  core__Heading: ({C, React}) =>
    React.createElement(C, {level: 2}, 'Section title'),
  core__Kbd: ({C, React}) => React.createElement(C, {keys: 'mod+k'}),
  core__SelectableCard: ({C, React}) =>
    React.createElement(C, {
      label: 'Standard shipping',
      isSelected: false,
      onChange: noop,
    }),
  core__Toast: ({C, React}) =>
    React.createElement(C, {body: 'Changes saved', onDismiss: noop}),
  core__Toolbar: ({C, React, Core}) =>
    React.createElement(C, {
      label: 'Table actions',
      size: 'sm',
      startContent: React.createElement(
        Core.TabList,
        {value: 'overview', onChange: noop},
        React.createElement(Core.Tab, {label: 'Overview', value: 'overview'}),
        React.createElement(Core.Tab, {label: 'Details', value: 'details'}),
      ),
      endContent: React.createElement(Core.Button, {label: 'Export'}),
    }),
  charts__Chart: ({React, mod, Pkg}) => chartsSample(React, mod, Pkg, {}),
  charts__ChartAxis: ({C, React, mod, Pkg}) =>
    chartsSample(React, mod, Pkg, {
      axes: React.createElement(
        React.Fragment,
        null,
        React.createElement(C, {position: 'bottom'}),
        React.createElement(C, {position: 'left'}),
      ),
    }),
  charts__ChartGrid: ({C, React, mod, Pkg}) =>
    chartsSample(React, mod, Pkg, {
      grid: React.createElement(C, {horizontal: true}),
    }),
  charts__ChartLegend: ({C, React, mod, Pkg}) =>
    chartsSample(React, mod, Pkg, {legend: React.createElement(C)}),
  charts__ChartTooltip: ({C, React, mod, Pkg}) =>
    chartsSample(React, mod, Pkg, {tooltip: React.createElement(C)}),
  core__ComplexSelector: ({C, React}) =>
    React.createElement(
      C,
      {label: 'Assignee', value: 'ada', onChange: noop, triggerLabel: 'Ada'},
      (value, onChange, close) =>
        React.createElement(
          'button',
          {type: 'button', onClick: close},
          'Pick ' + value,
        ),
    ),
  richtext__RichTextEditorToolbar: ({C, React, mod, Pkg}) => {
    const Editor = mod.RichTextEditor ?? Pkg.RichTextEditor;
    return React.createElement(Editor, {
      label: 'Notes',
      toolbar: React.createElement(C),
    });
  },
  richtext__RichTextEditorAutoLinkPlugin: ({C, React, mod, Pkg}) => {
    const Editor = mod.RichTextEditor ?? Pkg.RichTextEditor;
    return React.createElement(Editor, {
      label: 'Notes',
      plugins: React.createElement(C),
    });
  },
  // Folders swizzle offers whose own name is not a component: each renders
  // a component the folder exports.
  core__Chat: ({React, mod}) =>
    React.createElement(
      mod.ChatMessage,
      {sender: 'user'},
      React.createElement(mod.ChatMessageBubble, null, 'Hello'),
    ),
  core__Indicator: ({React, mod}) =>
    React.createElement(mod.CheckboxIndicator, {isChecked: true}),
  core__Layer: ({React, mod, Core}) =>
    React.createElement(
      mod.LayerProvider,
      null,
      React.createElement(
        mod.Tooltip,
        {content: 'Hint'},
        React.createElement(Core.Button, {label: 'Hover'}),
      ),
    ),
  core__NavMenu: ({React, mod}) =>
    React.createElement(
      mod.NavHeadingMenu,
      {label: 'Products'},
      React.createElement(mod.NavHeadingMenuItem, {
        label: 'Overview',
        href: '#',
      }),
    ),
  core__Resizable: ({React, mod}) => {
    function Sample() {
      const resizable = mod.useResizable({defaultSize: mod.percent(50)});
      return React.createElement(mod.ResizeHandle, {
        resizable,
        label: 'Resize',
      });
    }
    return React.createElement(Sample);
  },
  core__SnapPaging: ({React, mod, Core}) => {
    function Sample() {
      const paging = mod.useSnapPaging();
      return React.createElement(
        Core.Carousel,
        {label: 'Photos', hasSnap: paging},
        React.createElement('div', null, 'One'),
        React.createElement('div', null, 'Two'),
      );
    }
    return React.createElement(Sample);
  },
  core__Swipe: ({React, mod, Core}) =>
    React.createElement(Core.Item, {
      label: 'Inbox',
      swipe: mod.createSwipe({
        trailing: [{id: 'archive', label: 'Archive', onActivate() {}}],
      }),
    }),
  // Required props the docs' playground defaults leave out. A sample that
  // starts from the defaults (`defaults`, revived as the proof renders them)
  // adds only the missing handlers.
  core__CheckboxList: ({C, React, mod, Pkg}) => {
    const Item = mod.CheckboxListItem ?? Pkg.CheckboxListItem;
    return React.createElement(
      C,
      {label: 'Export formats'},
      React.createElement(Item, {label: 'CSV'}),
      React.createElement(Item, {label: 'PDF'}),
    );
  },
  core__DateInput: ({C, React}) =>
    React.createElement(C, {label: 'Start date'}),
  core__DateRangeInput: ({C, React}) =>
    React.createElement(C, {label: 'Trip dates', value: null, onChange: noop}),
  core__DateTimeInput: ({C, React}) =>
    React.createElement(C, {label: 'Meeting', onChange: noop}),
  core__Drawer: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, isOpen: true, onOpenChange: noop}),
  core__FieldStatus: ({C, React}) =>
    React.createElement(C, {type: 'error', message: 'Enter a valid email.'}),
  core__FileInput: ({C, React}) =>
    React.createElement(C, {label: 'Attachment', value: null, onChange: noop}),
  core__IconButton: ({C, React}) =>
    React.createElement(C, {label: 'Settings', icon: dotIcon(React)}),
  core__InfoTip: ({C, React}) =>
    React.createElement(C, {content: 'Totals include tax.'}),
  core__InputGroup: ({C, React, mod, Pkg}) =>
    React.createElement(
      C,
      {label: 'Price'},
      React.createElement(mod.InputGroupText ?? Pkg.InputGroupText, null, '$'),
      React.createElement(mod.TextInput ?? Pkg.TextInput, {
        label: 'Amount',
        value: '12.00',
        onChange: noop,
      }),
    ),
  core__Lightbox: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, isOpen: true, onOpenChange: noop}),
  core__MultiSelector: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__NavIcon: ({C, React}) => React.createElement(C, {icon: dotIcon(React)}),
  core__NumberInput: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__Pagination: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__PowerSearch: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__RadioList: ({C, React, mod, Pkg}) => {
    const Item = mod.RadioListItem ?? Pkg.RadioListItem;
    return React.createElement(
      C,
      {label: 'Shipping', value: 'standard', onChange: noop},
      React.createElement(Item, {label: 'Standard', value: 'standard'}),
      React.createElement(Item, {label: 'Express', value: 'express'}),
    );
  },
  core__SegmentedControl: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__StatusDot: ({C, React}) =>
    React.createElement(C, {variant: 'success', label: 'Online'}),
  core__TabList: ({C, React, defaults}) =>
    React.createElement(C, {...defaults, onChange: noop}),
  core__TimeInput: ({C, React}) =>
    React.createElement(C, {label: 'Start time'}),
  core__Token: ({C, React}) => React.createElement(C, {label: 'Design'}),
  core__Tokenizer: ({C, React, defaults}) =>
    React.createElement(C, {
      ...defaults,
      searchSource: teamSource(),
      onChange: noop,
    }),
  core__Typeahead: ({C, React}) =>
    React.createElement(C, {
      label: 'Team',
      searchSource: teamSource(),
      value: null,
      onChange: noop,
    }),
  richtext__RichTextEditor: ({C, React}) =>
    React.createElement(C, {label: 'Notes'}),
  richtext__RichTextView: ({C, React}) =>
    React.createElement(C, {
      value: JSON.stringify(paragraphState('Release notes for this version.')),
    }),
  vega__VegaChart: ({C, React}) =>
    React.createElement(C, {
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            {month: 'Jan', revenue: 3},
            {month: 'Feb', revenue: 5},
            {month: 'Mar', revenue: 4},
          ],
        },
        mark: 'bar',
        encoding: {
          x: {field: 'month', type: 'nominal'},
          y: {field: 'revenue', type: 'quantitative'},
        },
      },
    }),
  // Lab samples live with Lab (packages/lab/swizzle-samples.mjs).
  ...labSamples,
};

/**
 * Folders swizzle offers that hold no component to render, with what they
 * hold. The proof still ejects and type-checks them.
 */
export const notRendered = {
  core__NavItem: 'a style module',
  core__InteractiveRoleContext: 'a context',
  core__SizeContext: 'a context',
};

/**
 * Targets whose doc names a required prop that neither a sample nor the doc's
 * playground defaults give, and that render without it: the proof renders
 * them with the defaults alone. A target with a required prop that is in none
 * of `samples`, `needsNoSample` and `notRendered` fails by name
 * (samples.test.mjs, and the proof before it renders). Every other such target
 * has a sample, so the browser step renders it with its required props.
 */
export const needsNoSample = {...labNeedsNoSample};
