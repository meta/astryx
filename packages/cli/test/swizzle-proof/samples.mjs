// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file samples.mjs
 * @input A copy's component, its module, and the package modules
 * @output One element per swizzle target whose playground defaults do not
 *   render on their own
 * @position Read by the swizzle proof's entries; children and helpers come
 *   from the copy's own module when it exports them
 */

const noop = () => {};
const ref = () => ({current: null});

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

function labChart(React, mod, Pkg, props, child) {
  const h = React.createElement;
  const Chart = mod.Chart ?? Pkg.Chart;
  return h('div', {style: {width: 480, height: 320}}, h(Chart, props, child));
}

const monthly = {
  data: [
    {month: 'Jan', v: 1, upper: 30, lower: 10},
    {month: 'Feb', v: 3, upper: 40, lower: 20},
    {month: 'Mar', v: 2, upper: 50, lower: 30},
  ],
  xKey: 'month',
  yKeys: ['v', 'upper', 'lower'],
};
const xy = {
  data: [
    {x: 0, y: 1},
    {x: 1, y: 2},
    {x: 2, y: 3},
  ],
  xKey: 'x',
  yKeys: ['y'],
};
const ohlc = {
  data: [
    {day: '1', open: 1, close: 2, high: 3, low: 0.5},
    {day: '2', open: 2, close: 1.5, high: 2.5, low: 1},
    {day: '3', open: 1.5, close: 3, high: 3.5, low: 1.2},
  ],
  xKey: 'day',
  yKeys: ['high', 'low'],
};
const xyz = {
  data: [
    {x: 0, y: 1, z: 0},
    {x: 2, y: 2, z: 2},
    {x: 1, y: 3, z: 1},
  ],
  xKey: 'x',
  yKey: 'y',
  zKey: 'z',
};

function threeD(React, mod, Pkg, child) {
  const h = React.createElement;
  const ThreeDChart = mod.ThreeDChart ?? Pkg.ThreeDChart;
  return h(
    'div',
    {style: {width: 600, height: 400}},
    h(ThreeDChart, xyz, child),
  );
}

function tour(React, Tour, TourStep) {
  const h = React.createElement;
  function Sample() {
    const a = React.useRef(null);
    const b = React.useRef(null);
    return h(
      React.Fragment,
      null,
      h('button', {type: 'button', ref: a}, 'Target A'),
      h('button', {type: 'button', ref: b}, 'Target B'),
      h(
        Tour,
        {isActive: true, onDismiss: noop},
        h(TourStep, {targetRef: a, heading: 'First'}, 'First body'),
        h(TourStep, {targetRef: b, heading: 'Second'}, 'Second body'),
      ),
    );
  }
  return h(Sample);
}

function navigation(React, Stack, Screen) {
  const h = React.createElement;
  return h(Stack, {
    label: 'Settings',
    root: h(
      Screen,
      {title: 'Settings'},
      h('button', {type: 'button'}, 'General'),
    ),
    path: [],
    onPathChange: noop,
    getKey: entry => entry,
    renderScreen: entry => h(Screen, {title: entry}, entry),
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
  lab__ChartArea: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      monthly,
      React.createElement(C, {
        yUpper: 'upper',
        yLower: 'lower',
        color: '#0064E0',
      }),
    ),
  lab__ChartBar: ({C, React, mod, Pkg}) =>
    labChart(React, mod, Pkg, monthly, React.createElement(C, {dataKey: 'v'})),
  lab__ChartLine: ({C, React, mod, Pkg}) =>
    labChart(React, mod, Pkg, monthly, React.createElement(C, {dataKey: 'v'})),
  lab__ChartDot: ({C, React, mod, Pkg}) =>
    labChart(React, mod, Pkg, xy, React.createElement(C, {dataKey: 'y'})),
  lab__ChartDotGL: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      xy,
      React.createElement(C, {dataKey: 'y', color: '#0064E0'}),
    ),
  lab__ChartDotGLInteractive: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      xy,
      React.createElement(C, {dataKey: 'y', color: '#0064E0'}),
    ),
  lab__ChartCandlestick: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      ohlc,
      React.createElement(C, {
        high: 'high',
        low: 'low',
        open: 'open',
        close: 'close',
      }),
    ),
  lab__ChartHeatmapGL: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      {
        data: [
          {month: 'Jan', row: 'A', value: 1},
          {month: 'Jan', row: 'B', value: 2},
          {month: 'Feb', row: 'A', value: 3},
          {month: 'Feb', row: 'B', value: 4},
        ],
        xKey: 'month',
        yKeys: ['value'],
      },
      React.createElement(C, {
        xKey: 'month',
        yKey: 'row',
        valueKey: 'value',
        colorRange: ['#000000', '#ffffff'],
      }),
    ),
  lab__ChartStreamGL: ({C, React, mod, Pkg}) =>
    labChart(
      React,
      mod,
      Pkg,
      {data: [], xKey: 't', yKeys: ['v'], xDomain: [0, 10], yDomain: [0, 1]},
      React.createElement(C, {color: '#0064E0'}),
    ),
  lab__ChatReactionBar: ({C, React}) =>
    React.createElement(C, {
      reactions: [
        {emoji: '👍', count: 2, label: 'Thumbs up'},
        {emoji: '🎉', count: 1, isSelected: true, label: 'Party'},
      ],
      onReactionClick: noop,
      onAddReaction: noop,
    }),
  lab__Tour: ({C, React, mod, Pkg}) =>
    tour(React, C, mod.TourStep ?? Pkg.TourStep),
  lab__TourStep: ({C, React, mod, Pkg}) => tour(React, mod.Tour ?? Pkg.Tour, C),
  lab__CodeEditor: ({C, React}) =>
    React.createElement(C, {
      value: 'const answer = 42;',
      onChange: noop,
      language: 'typescript',
      label: 'Edit snippet',
    }),
  lab__CommentComposer: ({C, React}) =>
    React.createElement(C, {value: '', onChange: noop, onSubmit: noop}),
  lab__CommentPin: ({C, React}) =>
    React.createElement(C, {
      label: 'Open annotation from Ada',
      participants: [{id: 'ada', name: 'Ada Lovelace'}],
      onClick: noop,
    }),
  lab__CommentThread: ({C, React}) =>
    React.createElement(
      'div',
      {style: {width: 320}},
      React.createElement(C, {
        comment: {
          id: 'margin',
          author: {id: 'maya', name: 'Maya Chen'},
          body: 'Should this say three days?',
          createdAt: '2026-09-30T19:00:00Z',
        },
        currentUser: {id: 'avery', name: 'Avery Kim'},
        onSubmit: noop,
      }),
    ),
  lab__DiffViewer: ({C, React, mod, Pkg}) => {
    const parse = mod.parseUnifiedDiff ?? Pkg.parseUnifiedDiff;
    const patch = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '',
    ].join('\n');
    return React.createElement(C, {file: parse(patch)[0]});
  },
  lab__ListInput: ({C, React, Core}) =>
    React.createElement(C, {
      label: 'Tags',
      value: [{id: '1', label: 'Alpha'}],
      onChange: noop,
      getItemKey: item => item.id,
      createItem: () => ({id: String(Date.now()), label: ''}),
      columns: [
        {
          key: 'label',
          header: 'Label',
          renderInput: ({item, label, isLabelHidden}) =>
            React.createElement(Core.TextInput, {
              label,
              isLabelHidden,
              value: item.label,
              onChange: noop,
            }),
        },
      ],
    }),
  lab__LogStream: ({C, React}) =>
    React.createElement(C, {
      entries: [
        {
          id: 'a',
          timestamp: '14:02:11.482',
          level: 'info',
          source: 'api-gateway',
          message: 'request accepted',
        },
        {
          id: 'b',
          timestamp: '14:02:12.001',
          level: 'warn',
          source: 'api-gateway',
          message: 'retrying upstream call',
        },
      ],
    }),
  lab__SankeyChart: ({C, React, mod, Pkg}) =>
    React.createElement(
      'div',
      {style: {width: 480, height: 320}},
      React.createElement(
        C,
        {
          nodes: [
            {id: 'a', label: 'A', value: 10},
            {id: 'b', label: 'B', value: 10},
            {id: 'c', label: 'C', value: 10},
          ],
          links: [
            {source: 'a', target: 'b', value: 5},
            {source: 'b', target: 'c', value: 5},
          ],
        },
        React.createElement(mod.SankeyNode ?? Pkg.SankeyNode),
      ),
    ),
  lab__Schedule: ({C, React, mod, Pkg}) => {
    const view = (
      mod.createScheduleMonthlyView ?? Pkg.createScheduleMonthlyView
    )();
    return React.createElement(C, {
      view,
      events: [],
      date: Date.UTC(2026, 9, 30),
      focusDate: Date.UTC(2026, 9, 30),
      timezoneID: 'UTC',
    });
  },
  lab__ThreeDBar: ({C, React, mod, Pkg}) =>
    threeD(React, mod, Pkg, React.createElement(C, {color: '#00aa00'})),
  lab__ThreeDScatter: ({C, React, mod, Pkg}) =>
    threeD(React, mod, Pkg, React.createElement(C, {color: '#00aa00'})),
  lab__ThreeDScatterGL: ({C, React, mod, Pkg}) =>
    threeD(React, mod, Pkg, React.createElement(C, {color: '#00aa00'})),
  lab__ThreeDSurface: ({C, React, mod, Pkg}) =>
    threeD(React, mod, Pkg, React.createElement(C, {color: '#00aa00'})),
  lab__ThreeDChart: ({C, React, mod, Pkg}) =>
    React.createElement(
      'div',
      {style: {width: 600, height: 400}},
      React.createElement(
        C,
        xyz,
        React.createElement(mod.ThreeDBar ?? Pkg.ThreeDBar, {color: '#00aa00'}),
      ),
    ),
  lab__TransferList: ({C, React}) =>
    React.createElement(C, {
      label: 'Columns',
      options: [
        {value: 'name', label: 'Name'},
        {value: 'status', label: 'Status'},
        {value: 'owner', label: 'Owner'},
      ],
      value: ['name'],
      onChange: noop,
    }),
  lab__NavigationStack: ({C, React, mod, Pkg}) =>
    navigation(React, C, mod.NavigationScreen ?? Pkg.NavigationScreen),
  lab__NavigationScreen: ({C, React, mod, Pkg}) =>
    navigation(React, mod.NavigationStack ?? Pkg.NavigationStack, C),
  lab__PageControl: ({C, React}) =>
    React.createElement(C, {
      totalPages: 3,
      page: 0,
      onChange: noop,
      label: 'Pages',
    }),
  lab__TabBarItem: ({C, React, mod, Pkg}) => {
    const TabBar = mod.TabBar ?? Pkg.TabBar;
    return React.createElement(
      TabBar,
      {value: 'home', onChange: noop, label: 'Sections'},
      React.createElement(C, {value: 'home', label: 'Home'}),
      React.createElement(C, {value: 'search', label: 'Search'}),
    );
  },
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
  lab__SVGIcon: ({C, React, mod, Pkg}) =>
    React.createElement(C, {
      icon: mod.bellIcon ?? Pkg.bellIcon,
      'aria-label': 'Notifications',
    }),
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
