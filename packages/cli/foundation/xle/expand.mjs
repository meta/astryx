// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file XLE expander — bound AST → TSX.
 *
 * Expansion is codegen, not templating: required value/onChange pairs
 * become typed useState scaffolds, Layout children auto-route into its
 * slot props, Table rows partition into header/body, `fill`-flagged
 * stack children wrap in StackItem, and {hint} blocks become structured
 * TODO(xle) markers pointing at the real block template.
 *
 * Output is deterministic: same bound AST → byte-identical TSX.
 *
 * @input  validated doc (nodes carry .bound) + registry
 * @output expand() → {code, componentsUsed, states, todos}
 * @position lib/xle — last stage; api/layout.mjs orchestrates
 */

import {PAYLOAD_PROPS} from './validate.mjs';
import {mergeImports, renderImport, prepareSpliceModule} from './splice.mjs';

const INDENT = '  ';
/** The most copies one `*N` repeat expands to. */
export const MAX_REPEAT = 10000;

/** @param {string | null | undefined} text */
function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** @param {string} text */
function camelCase(text) {
  const parts = slugify(text).split('-').filter(Boolean);
  if (parts.length === 0) return 'item';
  return parts[0] + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

/** @param {import('./xle-ast').XLEValue} value */
function escapeAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * JSX text nodes cannot contain raw `<`, `>`, `{`, or `}`. When a text payload
 * contains any of them, emit it as a string-expression child so the output is
 * valid TSX. Plain text is passed through unchanged.
 * @param {import('./xle-ast').XLEValue} text
 * @returns {string}
 */
function jsxText(text) {
  const str = String(text);
  return /[<>{}]/.test(str) ? `{${JSON.stringify(str)}}` : str;
}

/**
 * @param {import('./xle-ast').XLEItem} item
 * @returns {import('./xle-ast').XLEItem}
 */
function cloneItem(item) {
  // .bound holds a registry reference (Map props) — rebuild it after the
  // JSON round-trip of the plain AST fields.
  const {bound, ...rest} = /** @type {import('./xle-ast').XLENode} */ (item);
  const copy = JSON.parse(JSON.stringify(rest, (key, value) => {
    if (key === 'bound') return undefined;
    return value;
  }));
  if (item.kind === 'node') {
    copy.bound = bound
      ? {component: bound.component, props: new Map(bound.props), slots: bound.slots, stray: []}
      : null;
    copy.children = item.children.map(cloneItem);
    copy.slots = item.slots; // slot subexprs are emitted from the original binding
  } else {
    copy.children = item.children.map(cloneItem);
  }
  return copy;
}

/**
 * Substitute Emmet-style `$` counters in payloads and string props.
 * `\$` escapes a literal dollar sign (prices etc.).
 * @param {string} text
 * @param {number} index
 */
function subCounterText(text, index) {
  return text.replace(/\\\$|\$/g, m => (m === '\\$' ? '$' : String(index)));
}

/**
 * Strip `\$` escapes when a node is NOT repeated (single emission).
 * @param {string} text
 */
function unescapeCounterText(text) {
  return text.replace(/\\\$/g, '$');
}

/**
 * @param {import('./xle-ast').XLEItem} node
 * @param {number} index
 */
function substituteCounter(node, index) {
  if (node.kind === 'group') {
    for (const child of node.children) substituteCounter(child, index);
    return;
  }
  if (node.payload) node.payload = subCounterText(node.payload, index);
  if (node.payload2) node.payload2 = subCounterText(node.payload2, index);
  if (node.bound) {
    for (const [key, value] of node.bound.props) {
      if (typeof value === 'string' && value.includes('$')) {
        node.bound.props.set(key, subCounterText(value, index));
      }
    }
  }
  for (const child of node.children) substituteCounter(child, index);
}

class Emitter {
  /**
   * @param {import('./xle-ast').Registry} registry
   * @param {{componentName?: string, blockModules?: Map<string, import('./xle-ast').BlockModule>}} [options]
   */
  constructor(registry, options = {}) {
    this.registry = registry;
    // importPath → {named:Set, types:Set, default, namespace, sideEffect}
    /** @type {Map<string, import('./xle-ast').ImportEntry>} */
    this.imports = new Map();
    /** @type {import('./xle-ast').StateEntry[]} */
    this.states = [];
    /** @type {Set<string>} */
    this.usedStateNames = new Set();
    /** @type {string[]} */
    this.todos = [];
    /** @type {Set<string>} */
    this.componentsUsed = new Set();
    this.componentName = options.componentName || 'GeneratedLayout';
    // canonical block key → prepared module ({mode, componentName, ...})
    this.blockModules = options.blockModules || new Map();
    // names of blocks already co-defined in this module (dedup)
    /** @type {Map<string, string>} */
    this.splicedBlocks = new Map(); // key → componentName
    /** @type {string[]} */
    this.blockDefs = []; // co-defined block source bodies, in first-use order
  }

  /**
   * @param {string} source
   * @returns {import('./xle-ast').ImportEntry}
   */
  importEntry(source) {
    if (!this.imports.has(source)) {
      this.imports.set(source, {named: new Set(), types: new Set(), default: null, namespace: null, sideEffect: false});
    }
    return /** @type {import('./xle-ast').ImportEntry} */ (this.imports.get(source));
  }

  /** @param {import('./xle-ast').RegistryComponent} component */
  addImport(component) {
    this.importEntry(component.importPath).named.add(component.exportName);
    this.componentsUsed.add(component.name);
  }

  /**
   * @param {string} source
   * @param {string} name
   */
  addNamedImport(source, name) {
    this.importEntry(source).named.add(name);
  }

  /**
   * @param {string} name
   * @returns {import('./xle-ast').RegistryComponent | undefined}
   */
  requireComponent(name) {
    const component = this.registry.components.get(name);
    if (component) this.addImport(component);
    return component;
  }

  /** @param {string} base */
  stateName(base) {
    let name = camelCase(base);
    if (!/^[a-z]/.test(name)) name = 'v' + name;
    let candidate = name;
    let n = 2;
    while (this.usedStateNames.has(candidate)) candidate = name + n++;
    this.usedStateNames.add(candidate);
    return candidate;
  }

  /**
   * @param {string} base
   * @param {string} initial
   */
  addState(base, initial) {
    const name = this.stateName(base);
    const setter = 'set' + name[0].toUpperCase() + name.slice(1);
    this.states.push({name, setter, initial});
    return {name, setter};
  }

  // ── value → JSX prop text ────────────────────────────────────────────

  /**
   * @param {import('./xle-ast').XLEValue} value
   * @returns {string | null}
   */
  jsxValue(value) {
    if (value === true) return null; // bare flag
    if (value === false) return '{false}';
    if (typeof value === 'number') return `{${value}}`;
    if (typeof value === 'string') return `"${escapeAttr(value)}"`;
    if (value && typeof value === 'object' && '__expr' in value) return `{${value.__expr}}`;
    if (Array.isArray(value)) {
      return `{[${value.map(v => (typeof v === 'string' ? `'${v}'` : String(v))).join(', ')}]}`;
    }
    if (typeof value === 'object' && value !== null) {
      const inner = Object.entries(value)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : String(v)}`)
        .join(', ');
      return `{{${inner}}}`;
    }
    return `{${String(value)}}`;
  }

  /**
   * @param {string} key
   * @param {import('./xle-ast').XLEValue} value
   */
  propText(key, value) {
    const v = this.jsxValue(value);
    return v === null ? key : `${key}=${v}`;
  }

  // ── scaffolding ──────────────────────────────────────────────────────

  /**
   * @param {import('./xle-ast').RegistryProp} prop
   * @param {import('./xle-ast').XLENode} node
   */
  initialFor(prop, node) {
    const type = (prop.type || '').trim();
    if (node.bound?.component.name === 'TabList') {
      const tabs = /** @type {import('./xle-ast').XLENode[]} */ (node.children.filter(c => c.kind === 'node'));
      const chosen = tabs.find(t => t.selected) || tabs[0];
      return chosen ? `'${slugify(chosen.payload || chosen.name)}'` : `''`;
    }
    if (type === 'string') return `''`;
    if (type.startsWith('boolean')) return 'false';
    if (type === 'number') return '1';
    if (prop.enumValues && prop.enumValues.length > 0) {
      const first = prop.enumValues[0];
      return typeof first === 'string' ? `'${first}'` : String(first);
    }
    return 'undefined';
  }

  /**
   * @param {import('./xle-ast').XLENode} node
   * @param {import('./xle-ast').RegistryComponent} component
   * @param {Map<string, import('./xle-ast').XLEValue>} props
   */
  scaffoldState(node, component, props) {
    for (const valueKey of ['value', 'page']) {
      const valueProp = component.props.get(valueKey);
      const onChange = component.props.get('onChange');
      if (!valueProp || !valueProp.required || !onChange) continue;
      if (props.has(valueKey)) continue;
      const base = node.payload || node.id || component.name;
      const {name, setter} = this.addState(base, this.initialFor(valueProp, node));
      props.set(valueKey, {__expr: name});
      if (!props.has('onChange')) props.set('onChange', {__expr: setter});
      return;
    }
  }

  /**
   * @param {import('./xle-ast').XLENode} node
   * @param {import('./xle-ast').RegistryComponent} component
   * @param {Map<string, import('./xle-ast').XLEValue>} props
   * @param {Set<string>} slotKeys
   */
  fillRequired(node, component, props, slotKeys) {
    for (const prop of component.props.values()) {
      if (!prop.required || props.has(prop.name) || slotKeys.has(prop.name)) continue;
      if (prop.name === 'children') continue; // handled by child emission
      if (prop.name === 'value' || prop.name === 'onChange' || prop.name === 'page') continue;
      if (prop.isFunction) { props.set(prop.name, {__expr: '() => {}'}); continue; }
      if (prop.enumValues && prop.enumValues.length > 0) {
        props.set(prop.name, prop.enumValues[0]);
        continue;
      }
      if (prop.type === 'string') {
        props.set(prop.name, node.payload || component.name);
        continue;
      }
      // Unfillable required prop (data arrays etc.) — structured TODO.
      this.todos.push(`${component.name}.${prop.name} (required ${prop.type}) needs real data`);
      props.set(prop.name, {__expr: `undefined /* TODO(xle): required ${prop.type} */`});
    }
  }

  // ── node emission ────────────────────────────────────────────────────

  /**
   * @param {import('./xle-ast').XLEItem[]} items
   * @param {number} depth
   * @param {import('./xle-ast').EmitContext} [context]
   * @returns {string[]}
   */
  emitItems(items, depth, context = {}) {
    /** @type {string[]} */
    const lines = [];
    for (const item of items) {
      if (item.kind === 'group') {
        const count = Math.min(item.repeat || 1, MAX_REPEAT);
        for (let i = 1; i <= count; i++) {
          for (const child of item.children) {
            const clone = count > 1 ? cloneItem(child) : child;
            if (count > 1) substituteCounter(clone, i);
            lines.push(...this.emitItems([clone], depth, context));
          }
        }
        continue;
      }
      const count = Math.min(item.repeat || 1, MAX_REPEAT);
      for (let i = 1; i <= count; i++) {
        const clone = count > 1 ? /** @type {import('./xle-ast').XLENode} */ (cloneItem(item)) : item;
        if (count > 1) {
          clone.repeat = null;
          substituteCounter(clone, i);
        }
        lines.push(...this.emitNode(clone, depth, context));
      }
    }
    return lines;
  }

  /**
   * @param {import('./xle-ast').XLENode} node
   * @param {number} depth
   * @param {import('./xle-ast').EmitContext} [context]
   * @returns {string[]}
   */
  emitNode(node, depth, context = {}) {
    if (!node.bound) {
      // Anonymous block reference — emit just the block, no wrapper element.
      if (node.hint) return this.emitHint(node.hint, depth);
      return [`${INDENT.repeat(depth)}{/* unresolved: ${node.name} */}`];
    }
    const component = node.bound.component;
    this.addImport(component);
    const pad = INDENT.repeat(depth);

    const props = new Map(node.bound.props);
    /** @type {string | null} */
    let textChild = null;

    // Payload → primary text prop, else text child. Required props win
    // (Button.label) over optional ones; a required children slot wins
    // over an optional label (Link).
    if (node.payload != null) {
      node.payload = unescapeCounterText(node.payload);
      const required = PAYLOAD_PROPS.find(p => component.props.get(p)?.required);
      const childrenRequired = component.props.get('children')?.required;
      const target = required
        || (childrenRequired ? null : PAYLOAD_PROPS.find(p => component.props.has(p)));
      if (target && !props.has(target)) props.set(target, node.payload);
      else textChild = node.payload;
    }
    if (node.payload2 != null && component.props.has('value') && !component.props.get('value')?.required) {
      props.set('value', node.payload2);
    }

    // `fill` in a stack context → wrap in StackItem.
    const needsFillWrap = context.inStack && props.get('__fill') === true;

    // Tab value synthesis inside TabList.
    if (component.name === 'Tab' && !props.has('value')) {
      props.set('value', slugify(node.payload || node.name));
    }

    this.scaffoldState(node, component, props);

    // Trigger binding: opens=#id → onClick TODO.
    const opens = props.get('__opens');
    props.delete('__opens');
    props.delete('__fill');
    if (opens) {
      const opensRef = /** @type {import('./xle-ast').IdRef} */ (opens);
      const target = opensRef.idref || opens;
      const handler = component.props.has('onClick') ? 'onClick' : 'clickAction';
      const targetId = typeof target === 'object' && target != null && 'idref' in target ? target.idref : target;
      props.set(handler, {__expr: `() => {/* TODO(xle): open #${targetId} */}`});
    }

    // Slots → element-valued props (keys collected first so required-prop
    // fill knows they're already satisfied).
    const slotKeys = new Set(node.bound.slots.map(s => s.key));
    this.fillRequired(node, component, props, slotKeys);

    /** @type {Array<[string, string[]]>} */
    const slotEntries = [];
    for (const slot of node.bound.slots) {
      slotEntries.push([slot.key, this.emitSlotValue(slot, depth + 1)]);
    }

    // Structural routing.
    /** @type {import('./xle-ast').XLEItem[]} */
    let children = node.children;
    if (component.name === 'Layout') {
      const routed = this.routeLayoutChildren(node, props, slotEntries, depth);
      children = routed;
    } else if (component.name === 'Table') {
      children = this.partitionTableChildren(node);
    }

    const childContext = {
      inStack: component.name === 'VStack' || component.name === 'HStack',
    };

    // Mark fill-flagged children before emitting them.
    for (const child of children) {
      if (child.kind === 'node' && child.bound) {
        const fillIdx = child.attrs.findIndex(a => a.kind === 'flag' && a.key === 'fill');
        if (fillIdx !== -1 && childContext.inStack) {
          child.bound.props.set('__fill', true);
          child.bound.props.delete('fill');
        }
      }
    }

    const bodyLines = [];
    if (node.hint) bodyLines.push(...this.emitHint(node.hint, depth + 1));
    if (textChild != null) bodyLines.push(`${INDENT.repeat(depth + 1)}${jsxText(textChild)}`);
    bodyLines.push(...this.emitItems(children, depth + 1, childContext));

    // Required children with nothing to render → placeholder text.
    const childrenProp = component.props.get('children');
    if (bodyLines.length === 0 && childrenProp?.required) {
      bodyLines.push(`${INDENT.repeat(depth + 1)}${jsxText(node.payload || component.name)}`);
    }

    const lines = this.renderTag(component, props, slotEntries, bodyLines, depth);
    if (needsFillWrap) {
      const stackItem = this.requireComponent('StackItem');
      if (stackItem) {
        return [
          `${pad}<${stackItem.exportName} size="fill">`,
          ...lines.map(l => INDENT + l),
          `${pad}</${stackItem.exportName}>`,
        ];
      }
    }
    return lines;
  }

  /**
   * @param {import('./xle-ast').RegistryComponent} component
   * @param {Map<string, import('./xle-ast').XLEValue>} props
   * @param {Array<[string, string[]]>} slotEntries
   * @param {string[]} bodyLines
   * @param {number} depth
   * @returns {string[]}
   */
  renderTag(component, props, slotEntries, bodyLines, depth) {
    const pad = INDENT.repeat(depth);
    const propTexts = [...props.entries()].map(([k, v]) => this.propText(k, v));
    const slotTexts = slotEntries.map(([key, valueLines]) => ({key, valueLines}));
    const tag = component.exportName;

    /** @type {string[]} */
    const open = [];
    const simple = slotTexts.length === 0 && propTexts.join(' ').length <= 60;
    if (simple) {
      const attrs = propTexts.length > 0 ? ' ' + propTexts.join(' ') : '';
      if (bodyLines.length === 0) return [`${pad}<${tag}${attrs} />`];
      open.push(`${pad}<${tag}${attrs}>`);
    } else {
      open.push(`${pad}<${tag}`);
      for (const text of propTexts) open.push(`${pad}${INDENT}${text}`);
      for (const {key, valueLines} of slotTexts) {
        open.push(`${pad}${INDENT}${key}={`);
        open.push(...valueLines.map(l => `${pad}${INDENT}${INDENT}${l.trimStart() === l ? l : l}`));
        open.push(`${pad}${INDENT}}`);
      }
      if (bodyLines.length === 0) {
        open.push(`${pad}/>`);
        return open;
      }
      open.push(`${pad}>`);
    }
    return [...open, ...bodyLines, `${pad}</${tag}>`];
  }

  /**
   * @param {import('./xle-ast').Slot} slot
   * @param {number} _depth
   * @returns {string[]}
   */
  emitSlotValue(slot, _depth) {
    const value = slot.value;
    if (value == null) {
      return [`${INDENT.repeat(0)}null /* TODO(xle): @${slot.key} */`];
    }
    if (typeof value === 'string') {
      const text = this.requireComponent('Text');
      return [text ? `<${text.exportName}>${jsxText(value)}</${text.exportName}>` : `<>${jsxText(value)}</>`];
    }
    if ('hint' in value) {
      return [
        '<>',
        ...this.emitHint(value.hint, 1).map(l => l.trimStart()).map(l => INDENT + l),
        '</>',
      ];
    }
    if ('idref' in value) {
      return [`null /* TODO(xle): reference #${value.idref} */`];
    }
    if ('subexpr' in value) {
      const lines = this.emitItems(value.subexpr, 0, {});
      if (value.subexpr.length > 1) return ['<>', ...lines.map(l => INDENT + l), '</>'];
      return lines;
    }
    return ['null'];
  }

  /**
   * @param {import('./xle-ast').Hint} hint
   * @param {number} depth
   * @returns {string[]}
   */
  emitHint(hint, depth) {
    const pad = INDENT.repeat(depth);
    if (hint.block) {
      const key = hint.block.name;
      const mod = this.blockModules.get(key) || this.blockModules.get(key.toLowerCase());
      if (mod) {
        const name = this.referenceBlock(key, mod);
        if (name) return [`${pad}<${name} />`];
      }
      // Source not available (e.g. browser, or unreadable) → pointer marker.
      this.todos.push(`reference block ${hint.block.name}`);
      const flags = hint.flags.length > 0 ? ` (+${hint.flags.join(' +')})` : '';
      const arg = hint.arg ? `:${hint.arg}` : '';
      return [
        `${pad}{/* TODO(xle): content block '${hint.block.name}'${flags}${arg} — scaffold it with: astryx template ${hint.block.name} --type block */}`,
      ];
    }
    this.todos.push(`unresolved hint {${hint.name}}`);
    return [`${pad}{/* TODO(xle): content '{${hint.name}}' (no matching block) */}`];
  }

  /**
   * Register a referenced block (import-mode app component, or splice-mode
   * template block co-defined once) and return the JSX component name to use.
   * @param {string} key
   * @param {import('./xle-ast').BlockModule} mod
   * @returns {string | null | undefined}
   */
  referenceBlock(key, mod) {
    if (this.splicedBlocks.has(key)) return this.splicedBlocks.get(key);

    if (mod.mode === 'import') {
      this.addNamedImport(mod.importPath, mod.componentName);
      this.componentsUsed.add(mod.componentName);
      this.splicedBlocks.set(key, mod.componentName);
      return mod.componentName;
    }

    // splice mode — prepare from raw source, co-define, hoist imports.
    const prepared = prepareSpliceModule(mod.source, mod.componentName);
    if (!prepared) return null;
    // Avoid name collisions with the generated component or another block.
    let name = prepared.componentName;
    if (name === this.componentName || [...this.splicedBlocks.values()].includes(name)) {
      name = `${name}Block`;
    }
    const body = name === prepared.componentName
      ? prepared.body
      : prepared.body.replace(
          new RegExp(`\\bfunction ${prepared.componentName}\\b`),
          `function ${name}`,
        );
    mergeImports(this.imports, prepared.imports);
    this.blockDefs.push(body);
    this.componentsUsed.add(name);
    this.splicedBlocks.set(key, name);
    return name;
  }

  /**
   * @param {import('./xle-ast').XLENode} node
   * @param {Map<string, import('./xle-ast').XLEValue>} props
   * @param {Array<[string, string[]]>} slotEntries
   * @param {number} depth
   * @returns {import('./xle-ast').XLEItem[]}
   */
  routeLayoutChildren(node, props, slotEntries, depth) {
    /** @type {Record<string, string>} */
    const family = {
      LayoutHeader: 'header',
      LayoutContent: 'content',
      LayoutFooter: 'footer',
    };
    const assigned = new Set(slotEntries.map(([k]) => k));
    /** @type {import('./xle-ast').XLEItem[]} */
    const loose = [];
    let panelCount = 0;
    for (const child of node.children) {
      const childName = child.kind === 'node' ? child.bound?.component?.name : undefined;
      let slotName = childName ? family[childName] : undefined;
      if (childName === 'LayoutPanel') {
        slotName = panelCount === 0 ? 'start' : 'end';
        panelCount++;
      }
      if (slotName && !assigned.has(slotName)) {
        assigned.add(slotName);
        slotEntries.push([slotName, this.emitItems([child], 0, {})]);
      } else {
        loose.push(child);
      }
    }
    // Loose children auto-wrap into an implicit LayoutContent slot.
    if (loose.length > 0 && !assigned.has('content')) {
      const lc = /** @type {import('./xle-ast').RegistryComponent} */ (this.requireComponent('LayoutContent'));
      const inner = this.emitItems(loose, 1, {});
      slotEntries.push(['content', [`<${lc.exportName}>`, ...inner, `</${lc.exportName}>`]]);
    } else if (loose.length > 0) {
      this.todos.push('Layout had extra children but content was already assigned');
    }
    void props; void depth;
    return [];
  }

  /**
   * Expand groups/repeats into a flat node list (clones carry repeat=null).
   * @param {import('./xle-ast').XLEItem[]} items
   * @returns {import('./xle-ast').XLENode[]}
   */
  flattenItems(items) {
    /** @type {import('./xle-ast').XLENode[]} */
    const out = [];
    for (const item of items) {
      const count = Math.min(item.repeat || 1, MAX_REPEAT);
      for (let i = 1; i <= count; i++) {
        const clone = count > 1 ? cloneItem(item) : item;
        if (count > 1) {
          clone.repeat = null;
          substituteCounter(clone, i);
        }
        if (clone.kind === 'group') out.push(...this.flattenItems(clone.children));
        else out.push(clone);
      }
    }
    return out;
  }

  /**
   * @param {import('./xle-ast').XLENode} node
   * @returns {import('./xle-ast').XLEItem[]}
   */
  partitionTableChildren(node) {
    const flat = this.flattenItems(node.children);
    const rows = flat.filter(c => c.kind === 'node' && c.bound?.component?.name === 'TableRow');
    if (rows.length === 0 || rows.length !== flat.length) return node.children;
    const isHeaderRow = (/** @type {import('./xle-ast').XLENode} */ row) => {
      const cells = this.flattenItems(row.children);
      return cells.length > 0 && cells.every(c => c.bound?.component?.name === 'TableHeaderCell');
    };
    const headerRows = rows.filter(isHeaderRow);
    const bodyRows = rows.filter(r => !isHeaderRow(r));
    /**
     * @param {string} name
     * @param {import('./xle-ast').XLENode[]} rowNodes
     * @returns {import('./xle-ast').XLENode}
     */
    const wrap = (name, rowNodes) => {
      const comp = this.requireComponent(name);
      /** @type {import('./xle-ast').XLENode} */
      const wrapper = {
        kind: 'node', name, id: null, enumMods: [], payload: null, payload2: null,
        attrs: [], slots: [], hint: null, repeat: null, selected: false,
        children: rowNodes, line: node.line, col: node.col,
        bound: {component: /** @type {import('./xle-ast').RegistryComponent} */ (comp), props: new Map(), slots: [], stray: []},
      };
      return wrapper;
    };
    /** @type {import('./xle-ast').XLEItem[]} */
    const out = [];
    if (headerRows.length > 0) out.push(wrap('TableHeader', headerRows));
    if (bodyRows.length > 0) out.push(wrap('TableBody', bodyRows));
    return out;
  }
}

/**
 * Expand a validated document into a complete TSX module.
 *
 * @param {{roots: import('./xle-ast').XLEItem[], overlays: import('./xle-ast').XLEItem[]}} doc
 * @param {import('./xle-ast').Registry} registry
 * @param {{componentName?: string, blockModules?: Map<string, import('./xle-ast').BlockModule>}} [options]
 * @returns {{code: string, componentsUsed: string[], states: number, todos: string[]}}
 */
export function expand(doc, registry, options = {}) {
  const emitter = new Emitter(registry, options);

  const rootLines = emitter.emitItems(doc.roots, 2, {});
  const overlayLines = doc.overlays.length > 0
    ? [
        `${INDENT.repeat(2)}{/* overlays — wire open state to the matching opens=#id trigger */}`,
        ...emitter.emitItems(doc.overlays, 2, {}),
      ]
    : [];

  // Count top-level elements *after* group/repeat expansion — a single root
  // item can still emit multiple siblings (`B*3`, `(a + b)`), which need a
  // fragment wrapper to be valid JSX.
  const topLevelRoots = emitter.flattenItems(doc.roots).length;
  const needsFragment = topLevelRoots + (doc.overlays.length > 0 ? 1 : 0) > 1;

  const body = [];
  if (needsFragment) {
    body.push(`${INDENT.repeat(1)}return (`, `${INDENT.repeat(2)}<>`);
    body.push(...[...rootLines, ...overlayLines].map(l => INDENT + l));
    body.push(`${INDENT.repeat(2)}</>`, `${INDENT.repeat(1)});`);
  } else {
    body.push(`${INDENT.repeat(1)}return (`);
    body.push(...rootLines);
    body.push(`${INDENT.repeat(1)});`);
  }

  // useState is just another named import from 'react' so it merges with any
  // hooks a spliced block brought in (e.g. a Table block's useState).
  if (emitter.states.length > 0) emitter.addNamedImport('react', 'useState');

  const importLines = [];
  const sortedImports = [...emitter.imports.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [importPath, entry] of sortedImports) {
    importLines.push(renderImport(importPath, entry));
  }

  const stateLines = emitter.states.map(
    s => `${INDENT}const [${s.name}, ${s.setter}] = useState(${s.initial});`,
  );

  // Co-defined template blocks live between imports and the page component.
  const blockSection = emitter.blockDefs.length > 0
    ? ['', ...emitter.blockDefs.flatMap(b => [b, ''])]
    : [];

  const code = [
    `// Generated by the Astryx XLE expander — this file is the artifact; edit freely.`,
    ...importLines,
    ...blockSection,
    '',
    `export default function ${emitter.componentName}() {`,
    ...stateLines,
    ...body,
    '}',
    '',
  ].join('\n');

  return {
    code,
    componentsUsed: [...emitter.componentsUsed].sort(),
    states: emitter.states.length,
    todos: emitter.todos,
  };
}
