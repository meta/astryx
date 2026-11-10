// Node's util.inspect and util.format for plain values (the default options:
// depth 2, breakLength 80, compact 3, single-quoted strings). Installed as
// hidden globals by the engine's bootstrap.
const kObject = 0, kArray = 1;
const quote = s => {
  let q = "'";
  if (s.includes("'")) { if (!s.includes('"')) q = '"'; else if (!s.includes('`') && !s.includes('${')) q = '`'; }
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === q || ch === '\\') out += '\\' + ch;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\v') out += '\\v';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + c.toString(16).toUpperCase().padStart(2, '0');
    else out += ch;
  }
  return q + out + q;
};
const identRe = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const keyStr = k => typeof k === 'symbol' ? '[' + k.toString() + ']' : identRe.test(k) ? k : quote(k);
function fnBase(v) {
  const name = v.name;
  const src = Function.prototype.toString.call(v);
  let kind = 'Function';
  if (src.startsWith('class')) kind = 'class';
  else if (v.constructor && v.constructor.name === 'AsyncFunction') kind = 'AsyncFunction';
  else if (v.constructor && v.constructor.name === 'GeneratorFunction') kind = 'GeneratorFunction';
  else if (v.constructor && v.constructor.name === 'AsyncGeneratorFunction') kind = 'AsyncGeneratorFunction';
  if (kind === 'class') { const ext = Object.getPrototypeOf(v); return '[class ' + (name || '(anonymous)') + (ext && ext.name ? ' extends ' + ext.name : '') + ']'; }
  return '[' + kind + (name ? ': ' + name : ' (anonymous)') + ']';
}
function isBelow(output, start, base) {
  let total = output.length + start;
  if (total + output.length > 80) return false;
  for (const o of output) { total += o.length; if (total > 80) return false; }
  return base === '' || !base.includes('\n');
}
function reduce(ctx, output, base, braces, type, recurseTimes) {
  if (ctx.currentDepth - recurseTimes < 3) {
    const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
    if (isBelow(output, start, base)) {
      const joined = output.join(', ');
      if (!joined.includes('\n')) return (base ? base + ' ' : '') + braces[0] + ' ' + joined + ' ' + braces[1];
    }
  }
  const ind = '\n' + ' '.repeat(ctx.indentationLvl);
  return (base ? base + ' ' : '') + braces[0] + ind + '  ' + output.join(',' + ind + '  ') + ind + braces[1];
}
function groupArray(ctx, output) {
  let totalLength = 0, maxLength = 0, i = 0;
  const outputLength = output.length;
  const separatorSpace = 2, dataLen = new Array(outputLength);
  for (; i < outputLength; i++) { const len = output[i].length; dataLen[i] = len; totalLength += len + separatorSpace; if (maxLength < len) maxLength = len; }
  const actualMax = maxLength + separatorSpace;
  if (actualMax * 3 + ctx.indentationLvl < 80 && (totalLength / actualMax > 5 || maxLength <= 6)) {
    const approxCharHeights = 2.5, averageBias = Math.sqrt(actualMax - totalLength / output.length), biasedMax = Math.max(actualMax - 3 - averageBias, 1);
    const columns = Math.min(Math.round(Math.sqrt(approxCharHeights * biasedMax * outputLength) / biasedMax), Math.floor((80 - ctx.indentationLvl) / actualMax), 3 * 4, 15);
    if (columns <= 1) return output;
    const tmp = [], maxLineLength = [];
    for (let i = 0; i < columns; i++) { let lineLength = 0; for (let j = i; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j]; maxLineLength.push(lineLength + separatorSpace); }
    const order = output.every(o => /^-?\d/.test(o)) ? 'padStart' : 'padEnd';
    for (let i = 0; i < outputLength; i += columns) {
      const max = Math.min(i + columns, outputLength);
      let str = '', j = i;
      for (; j < max - 1; j++) { const padding = maxLineLength[j - i] + output[j].length - dataLen[j]; str += (output[j] + ', ')[order](padding, ' '); }
      if (order === 'padStart') { const padding = maxLineLength[j - i] + output[j].length - dataLen[j] - separatorSpace; str += output[j].padStart(padding, ' '); } else str += output[j];
      tmp.push(str);
    }
    return tmp;
  }
  return output;
}
function formatValue(ctx, v, recurseTimes, typedArray) {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'undefined': return 'undefined';
    case 'string': return quote(v);
    case 'number': return Object.is(v, -0) ? '-0' : String(v);
    case 'bigint': return String(v) + 'n';
    case 'boolean': return String(v);
    case 'symbol': return v.toString();
  }
  if (ctx.seen.includes(v)) return '[Circular *1]';
  return formatRaw(ctx, v, recurseTimes);
}
function formatRaw(ctx, v, recurseTimes) {
  let keys = Object.keys(v);
  const syms = Object.getOwnPropertySymbols(v).filter(s => Object.prototype.propertyIsEnumerable.call(v, s));
  let braces, base = '', type = kObject, output = [], extra = null;
  const proto = Object.getPrototypeOf(v);
  const ctorName = proto === null ? null : (proto.constructor && proto.constructor.name) || '';
  const prefix = (fallback, size) => {
    if (ctorName === null) return `[${fallback}${size !== undefined ? `(${size})` : ''}: null prototype] `;
    if (ctorName !== fallback) return `${ctorName}${size !== undefined ? `(${size})` : ''} [${fallback}] `;
    return `${fallback}${size !== undefined ? `(${size})` : ''} `;
  };
  if (Array.isArray(v)) {
    const p = ctorName !== 'Array' || ctorName === null ? prefix('Array', v.length) : '';
    keys = keys.filter(k => !(String(k >>> 0) === k && (k >>> 0) < v.length));
    braces = [p + '[', ']'];
    type = kArray;
    if (v.length === 0 && keys.length === 0 && syms.length === 0) return braces[0] + ']';
    extra = 'array';
  } else if (typeof v === 'function') {
    base = fnBase(v);
    keys = keys.filter(k => k !== 'prototype');
    if (keys.length === 0 && syms.length === 0) return base;
    braces = ['{', '}'];
  } else if (v instanceof RegExp) {
    base = RegExp.prototype.toString.call(v);
    if (keys.length === 0) return base;
    braces = ['{', '}'];
  } else if (v instanceof Date) {
    base = Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
    if (keys.length === 0) return base;
    braces = ['{', '}'];
  } else if (v instanceof Error) {
    base = v.stack || (v.name + ': ' + v.message);
    if (!String(base).includes('\n    at')) base = '[' + base + ']';
    keys = keys.filter(k => k !== 'stack' && k !== 'message');
    if (keys.length === 0) return base;
    braces = ['{', '}'];
  } else if (v instanceof Map) {
    braces = [prefix('Map', v.size) + '{', '}'];
    if (v.size === 0 && keys.length === 0) return braces[0] + '}';
    extra = 'map';
  } else if (v instanceof Set) {
    braces = [prefix('Set', v.size) + '{', '}'];
    if (v.size === 0 && keys.length === 0) return braces[0] + '}';
    extra = 'set';
  } else if (v instanceof Promise) {
    braces = ['Promise {', '}'];
    extra = 'promise';
  } else {
    const tag = v[Symbol.toStringTag];
    let p = ctorName === null ? '[Object: null prototype] ' : ctorName !== 'Object' ? ctorName + ' ' : '';
    if (typeof tag === 'string' && tag !== '' && tag !== ctorName) p = (p || 'Object ') + '[' + tag + '] ';
    braces = [p + '{', '}'];
    if (keys.length === 0 && syms.length === 0) return p + '{}';
  }
  if (recurseTimes > 2) return ctorName && ctorName !== 'Object' && type !== kArray ? '[' + ctorName + ']' : type === kArray ? '[Array]' : '[Object]';
  recurseTimes++;
  ctx.seen.push(v);
  ctx.currentDepth = recurseTimes;
  if (extra === 'array') {
    const n = Math.min(v.length, 100);
    let holes = 0;
    for (let i = 0; i < n; i++) {
      if (!Object.prototype.hasOwnProperty.call(v, i)) { holes++; continue; }
      if (holes) { output.push(`<${holes} empty item${holes > 1 ? 's' : ''}>`); holes = 0; }
      output.push(formatValue(ctx, v[i], recurseTimes));
    }
    if (holes) output.push(`<${holes} empty item${holes > 1 ? 's' : ''}>`);
    if (v.length > 100) output.push(`... ${v.length - 100} more item${v.length - 100 > 1 ? 's' : ''}`);
  } else if (extra === 'map') {
    ctx.indentationLvl += 2;
    for (const [k, x] of v) output.push(formatValue(ctx, k, recurseTimes) + ' => ' + formatValue(ctx, x, recurseTimes));
    ctx.indentationLvl -= 2;
  } else if (extra === 'set') {
    ctx.indentationLvl += 2;
    for (const x of v) output.push(formatValue(ctx, x, recurseTimes));
    ctx.indentationLvl -= 2;
  } else if (extra === 'promise') {
    output.push('<pending>');
  }
  for (const k of [...keys, ...syms]) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    let str;
    ctx.indentationLvl += 2;
    if (d.get || d.set) str = d.get ? (d.set ? '[Getter/Setter]' : '[Getter]') : '[Setter]';
    else str = formatValue(ctx, d.value, recurseTimes);
    ctx.indentationLvl -= 2;
    output.push(keyStr(k) + ': ' + str);
  }
  ctx.seen.pop();
  if (type === kArray && output.length > 6) output = groupArray(ctx, output);
  const res = reduce(ctx, output, base, braces, type, recurseTimes);
  return res;
}
globalThis.__astryx_inspect = (v) => formatValue({seen: [], indentationLvl: 0, currentDepth: 0}, v, 0);
globalThis.__astryx_format = (...args) => {
  const first = args[0];
  let a = 0, str = '';
  if (typeof first === 'string') {
    if (args.length === 1) return first;
    let last = 0;
    a = 1;
    for (let i = 0; i < first.length - 1; i++) {
      if (first.charCodeAt(i) !== 37) continue;
      const c = first[i + 1];
      if (a !== args.length) {
        let rep;
        switch (c) {
          case 's': { const x = args[a]; rep = typeof x === 'string' ? x : typeof x === 'bigint' ? x + 'n' : (typeof x === 'object' && x !== null) ? globalThis.__astryx_inspect(x) : String(x); break; }
          case 'j': try { rep = JSON.stringify(args[a]); } catch { rep = '[Circular]'; } break;
          case 'd': { const x = args[a]; rep = typeof x === 'bigint' ? x + 'n' : typeof x === 'symbol' ? 'NaN' : String(Number(x)); break; }
          case 'i': { const x = args[a]; rep = typeof x === 'bigint' ? x + 'n' : typeof x === 'symbol' ? 'NaN' : String(parseInt(x)); break; }
          case 'f': { const x = args[a]; rep = typeof x === 'symbol' ? 'NaN' : String(parseFloat(x)); break; }
          case 'o': case 'O': rep = globalThis.__astryx_inspect(args[a]); break;
          case 'c': rep = ''; break;
          case '%': str += first.slice(last, i) + '%'; last = i + 2; i++; continue;
          default: continue;
        }
        if (last !== i) str += first.slice(last, i);
        str += rep;
        last = i + 2;
        i++;
        a++;
      } else if (c === '%') { str += first.slice(last, i) + '%'; last = i + 2; i++; }
    }
    if (last !== 0) { a = a; if (last < first.length) str += first.slice(last); } else { str = first; }
  }
  while (a < args.length) {
    const x = args[a];
    str += (a > 0 ? ' ' : '') + (typeof x === 'string' ? x : globalThis.__astryx_inspect(x));
    a++;
  }
  return str;
};
const consoleOut = level => (...args) => __astryx_host.console(level, globalThis.__astryx_format(...args));
globalThis.console = {
  log: consoleOut('log'), info: consoleOut('info'), debug: consoleOut('debug'),
  warn: consoleOut('warn'), error: consoleOut('error'), trace: consoleOut('trace'),
  dir: (v) => __astryx_host.console('log', globalThis.__astryx_inspect(v)),
  table: consoleOut('log'), group() {}, groupEnd() {}, time() {}, timeEnd() {}, assert(c, ...a) { if (!c) __astryx_host.console('error', 'Assertion failed' + (a.length ? ': ' + globalThis.__astryx_format(...a) : '')); },
};
