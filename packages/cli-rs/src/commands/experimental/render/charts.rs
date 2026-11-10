//! `foundation/render/charts.mjs` CHART_CSS.

pub const CHART_CSS: &str = ".recharts-responsive-container{width:100%}.recharts-responsive-container>.recharts-wrapper{width:100%!important;height:auto!important;display:flex;flex-direction:column}.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{width:100%!important;height:auto!important}.recharts-responsive-container>.recharts-wrapper>.recharts-legend-wrapper{position:static!important;width:auto!important;height:auto!important}.recharts-responsive-container>.recharts-wrapper:not([data-legend-side])>.recharts-legend-wrapper[style*=\"bottom\"]{order:1}.recharts-responsive-container>.recharts-wrapper[data-legend-side]{flex-direction:row;align-items:flex-start}.recharts-responsive-container>.recharts-wrapper[data-legend-side]:dir(rtl){flex-direction:row-reverse}.recharts-responsive-container>.recharts-wrapper[data-legend-side][data-legend-middle]{align-items:center}.recharts-responsive-container>.recharts-wrapper[data-legend-side][data-legend-bottom]{align-items:flex-end}.recharts-responsive-container>.recharts-wrapper[data-legend-side]>svg.recharts-surface{flex:1 1 0;min-width:0}.recharts-responsive-container>.recharts-wrapper[data-legend-side]>.recharts-legend-wrapper{flex:none}.recharts-responsive-container>.recharts-wrapper[data-legend-side=\"right\"]>.recharts-legend-wrapper{order:1}";

/// The recharts exports that draw a chart, besides ResponsiveContainer.
pub const CHART_ROOTS: [&str; 12] = [
    "AreaChart", "BarChart", "ComposedChart", "FunnelChart", "LineChart", "PieChart", "RadarChart", "RadialBarChart", "Sankey", "ScatterChart", "SunburstChart", "Treemap",
];

/// `setChartsAside`: point a module's recharts charts, and its
/// ResponsiveContainer, at the wrapper the render installs. `None` when the
/// module imports none.
pub fn set_charts_aside(source: &str, file: &str) -> Option<String> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{ImportDeclarationSpecifier, Statement};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    if !source.contains("recharts") {
        return None;
    }
    let alloc = Allocator::default();
    let st = SourceType::from_path(file).unwrap_or_else(|_| SourceType::tsx()).with_jsx(true);
    let ret = Parser::new(&alloc, source, st).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    // Names bound anywhere at the top of the module, for fresh names.
    let mut taken: Vec<String> = vec![];
    for s in &ret.program.body {
        if let Statement::ImportDeclaration(d) = s {
            for sp in d.specifiers.iter().flatten() {
                taken.push(sp.local().name.to_string());
            }
        }
    }
    let mut edits: Vec<(u32, u32, String)> = vec![];
    for s in &ret.program.body {
        let Statement::ImportDeclaration(d) = s else { continue };
        if d.source.value.as_str() != Some("recharts") || d.import_kind.is_type() {
            continue;
        }
        let mut decls = vec![];
        for sp in d.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(n) = sp else { continue };
            if n.import_kind.is_type() {
                continue;
            }
            let name = n.imported.name().to_string();
            let container = name == "ResponsiveContainer";
            if !container && !CHART_ROOTS.contains(&name.as_str()) {
                continue;
            }
            let mut uid = format!("_{name}");
            let mut i = 2;
            while taken.contains(&uid) {
                uid = format!("_{name}{i}");
                i += 1;
            }
            taken.push(uid.clone());
            edits.push((n.span.start, n.span.end, format!("{} as {uid}", n.imported.name())));
            decls.push(format!("const {} = globalThis.__astryxRenderChart({uid}, {container});", n.local.name));
        }
        if !decls.is_empty() {
            // The chart pass reaches recharts' `Global` through the same
            // module the page's charts use.
            decls.push("import {Global as __astryxChartGlobal} from 'recharts';\nglobalThis.__astryxChartGlobal = __astryxChartGlobal;".into());
            decls.reverse();
            edits.push((d.span.end, d.span.end, format!("\n{}", decls.join("\n"))));
        }
    }
    if edits.is_empty() {
        return None;
    }
    let mut out = source.to_string();
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    for (a, b, t) in edits {
        out.replace_range(a as usize..b as usize, &t);
    }
    Some(out)
}

/// The module the page's chart wrappers call, loaded before the page: the
/// worker's `__astryxRenderChart` and its state.
pub const CHART_SETUP: &str = r#"const CHART_MAX_WIDTH = 800;
const CHART_HEIGHT = 300;
const SPARKLINE_HEIGHT = 60;
export function chartSize({width, height, aspect}) {
  const ratio = typeof aspect === 'number' && aspect > 0 ? aspect : null;
  const w = typeof width === 'number' && width > 0 ? width : null;
  const h = typeof height === 'number' && height > 0 ? height : ratio ? (w ?? CHART_MAX_WIDTH) / ratio : CHART_HEIGHT;
  return {width: w ?? (ratio ? h * ratio : Math.min(CHART_MAX_WIDTH, Math.round(h * (h <= SPARKLINE_HEIGHT ? 6 : 2.5)))), height: h};
}
const st = globalThis.__astryxChartState = {mode: 'aside', charts: [], pageCharts: [], renderedAfterCommit: false, React: null, InChart: null};
globalThis.__astryxRenderChart = (Chart, container) => {
  function RenderedChart(props) {
    const {createElement, useContext, useRef, useLayoutEffect} = st.React;
    if (st.mode === 'aside') {
      st.charts.push(createElement(RenderedChart, props));
      return createElement('astryx-chart', {'data-chart': st.charts.length - 1});
    }
    const inside = useContext(st.InChart);
    const place = useRef(null);
    const committed = useRef(false);
    useLayoutEffect(() => {
      committed.current = true;
    });
    if (st.mode === 'page' && !inside) {
      place.current ??= st.pageCharts.length;
      st.pageCharts[place.current] = props;
      if (committed.current) st.renderedAfterCommit = true;
    }
    const drawn = container
      ? createElement('div', {className: 'recharts-responsive-container'}, createElement(Chart, {...props, ...chartSize(props)}))
      : createElement(Chart, props);
    if (st.mode === 'alone' || inside) return drawn;
    return createElement('astryx-chart', null, createElement(st.InChart.Provider, {value: true}, drawn));
  }
  return RenderedChart;
};
"#;

/// The worker's chart pass, after the server render (`drawCharts`).
pub const CHART_DRAW: &str = r#"function sameKey(value, depth = 0) {
  if (depth > 8) return '…';
  if (typeof value === 'function') return `fn:${value.name}`;
  if (typeof value === 'symbol') return String(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(v => sameKey(v, depth + 1)).join(',')}]`;
  if ('$$typeof' in value && 'props' in value) {
    const type = value.type;
    return `<${typeof type === 'string' ? type : (type?.displayName ?? type?.name ?? '?')} ${sameKey(value.props, depth + 1)}>`;
  }
  return `{${Object.keys(value).filter(key => !key.startsWith('_')).sort().map(key => `${key}:${sameKey(value[key], depth + 1)}`).join(',')}}`;
}
function chartDocument() {
  const window = globalThis.__astryxDom.install();
  // Node's own global, which the chart pass's React reads.
  if (typeof globalThis.navigator === 'undefined') globalThis.navigator = {userAgent: `Node.js/${String(globalThis.process?.versions?.node ?? "22").split(".")[0]}`};
  const quiet = () => ({matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}});
  Object.assign(window, {
    matchMedia: quiet,
    getComputedStyle: () => new Proxy({getPropertyValue: () => ''}, {get: (o, k) => (k in o ? o[k] : '')}),
    requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: id => clearTimeout(id),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  });
  const g = globalThis;
  g.window = window;
  g.document = window.document;
  g.matchMedia = window.matchMedia;
  g.getComputedStyle = window.getComputedStyle;
  g.requestAnimationFrame = window.requestAnimationFrame;
  g.cancelAnimationFrame = window.cancelAnimationFrame;
  g.ResizeObserver = window.ResizeObserver;
}
async function drawCharts(markup, Page, specs) {
  const st = globalThis.__astryxChartState;
  const {createElement} = st.React;
  const placeholder = /<astryx-chart data-chart="(\d+)"><\/astryx-chart>/g;
  let client, flushSync;
  try {
    chartDocument();
    client = await import(specs.client);
    flushSync = specs.flushSync;
    const Global = globalThis.__astryxChartGlobal;
    if (Global) Global.isSsr = false;
  } catch {
    return {markup: markup.replace(placeholder, ''), failed: st.charts.length, alone: false};
  }
  const drawIn = (element, all) => {
    let error = null;
    const host = globalThis.document.createElement('div');
    const root = client.createRoot(host, {onUncaughtError: e => { error = e; }, onRecoverableError: () => {}});
    try {
      flushSync(() => root.render(element));
    } catch (e) {
      error = e;
    }
    const out = error ? null : globalThis.__astryxDom.pictures(host, all);
    root.unmount();
    return out;
  };
  st.mode = 'page';
  let drawn = drawIn(createElement(Page), false);
  let alone = false;
  if (!drawn) alone = 'error';
  else if (drawn.length !== st.charts.length || st.pageCharts.length !== st.charts.length || st.charts.some((chart, i) => sameKey(chart.props) !== sameKey(st.pageCharts[i]))) {
    alone = 'changed';
  } else if (st.renderedAfterCommit) {
    alone = 'rerendered';
  }
  if (alone) {
    st.mode = 'alone';
    drawn = st.charts.map(chart => drawIn(chart, true)?.[0] ?? '');
  }
  let failed = 0;
  const pictures = drawn.map(html => {
    if (html.includes('<svg')) return html;
    failed += 1;
    return '';
  });
  return {markup: markup.replace(placeholder, (_, i) => pictures[Number(i)] ?? ''), failed, alone};
}
"#;
