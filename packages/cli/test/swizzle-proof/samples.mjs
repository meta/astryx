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
  lab__WeightedSVGIcon: ({C, React}) =>
    React.createElement(C, {
      icon: {
        name: 'swizzle-proof-dot',
        layers: [
          {
            from: 300,
            to: 700,
            paths: [{d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z'}],
          },
        ],
      },
      'aria-label': 'Dot',
    }),
  lab__ChatVirtualizer: ({C, React}) =>
    // A fixed-height frame, so the browser step windows real rows.
    React.createElement(
      'div',
      {style: {height: 320, display: 'flex', flexDirection: 'column'}},
      React.createElement(C, {
        data: [
          {id: 'a', text: 'First message'},
          {id: 'b', text: 'Second message'},
          {id: 'c', text: 'Third message'},
        ],
        getRowKey: item => item.id,
        renderItem: ({item}) => React.createElement('p', null, item.text),
      }),
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
      React.createElement(C, {
        value: 'home',
        label: 'Home',
        icon: dotIcon(React),
      }),
      React.createElement(C, {
        value: 'search',
        label: 'Search',
        icon: dotIcon(React),
      }),
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
  lab__ChatEmojiPicker: ({C, React}) =>
    React.createElement(
      C,
      {onSelect: noop},
      React.createElement('button', {type: 'button'}, 'Add reaction'),
    ),
  lab__CircleCheckIndicator: ({C, React}) =>
    React.createElement(C, {state: 'checked'}),
  lab__CircularProgress: ({C, React}) =>
    React.createElement(C, {label: 'Uploading', value: 40}),
  lab__DialogHeroHeader: ({C, React}) =>
    React.createElement(C, {
      title: 'Welcome aboard',
      media: React.createElement('div', {style: {height: 120}}),
    }),
  lab__EmojiPicker: ({C, React}) => React.createElement(C, {onSelect: noop}),
  lab__LineClamp: ({C, React}) =>
    React.createElement(
      C,
      {maxLines: 2},
      'A long paragraph that runs past two lines, so the clamp cuts it short and shows the rest only when it is expanded by the reader.',
    ),
  lab__SelectableCardGroup: ({C, React, mod, Pkg}) => {
    const Item = mod.SelectableCardGroupItem ?? Pkg.SelectableCardGroupItem;
    return React.createElement(
      C,
      {label: 'Plan', value: 'pro', onChange: noop},
      React.createElement(Item, {value: 'basic', label: 'Basic'}),
      React.createElement(Item, {value: 'pro', label: 'Pro'}),
    );
  },
  lab__Stat: ({C, React}) =>
    React.createElement(C, {label: 'Revenue', value: '$12.4k'}),
  lab__TabBar: ({C, React, mod, Pkg}) => {
    const Item = mod.TabBarItem ?? Pkg.TabBarItem;
    return React.createElement(
      C,
      {value: 'home', onChange: noop, label: 'Sections'},
      React.createElement(Item, {
        value: 'home',
        label: 'Home',
        icon: dotIcon(React),
      }),
      React.createElement(Item, {
        value: 'search',
        label: 'Search',
        icon: dotIcon(React),
      }),
    );
  },
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
export const needsNoSample = {
  // Its rows are the tabs past the fourth, read from the copy's own
  // TabBarItem, which the copy's entry does not export to a sample.
  lab__TabBarMoreList:
    "renders without onChange; its rows need the copy's TabBarItem, which its entry does not export",
};
