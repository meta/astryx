//! The `node:` builtins user modules import, as small JS shims over a few
//! host functions (`__astryx_host`). Only what real doc, config and manifest
//! files use is here; anything else throws on use, not on import.

/// The JS source of a builtin's shim module, or `None` when unknown.
pub fn source(name: &str) -> Option<&'static str> {
    Some(match name {
        "path" | "path/posix" => PATH,
        "url" => URL,
        "fs" => FS,
        "fs/promises" => FS_PROMISES,
        "process" => PROCESS,
        "module" => MODULE,
        "os" => OS,
        "util" => UTIL,
        "async_hooks" => ASYNC_HOOKS,
        _ => return None,
    })
}

const PATH: &str = r#"
function assertPath(p) { if (typeof p !== 'string') { const e = new TypeError('The "path" argument must be of type string. Received ' + (p === null ? 'null' : typeof p)); e.code = 'ERR_INVALID_ARG_TYPE'; throw e; } }
function normalizeString(path, allowAboveRoot) {
  let res = ''; let lastSegmentLength = 0; let lastSlash = -1; let dots = 0; let code;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i); else if (code === 47) break; else code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf('/');
            if (lastSlashIndex === -1) { res = ''; lastSegmentLength = 0; }
            else { res = res.slice(0, lastSlashIndex); lastSegmentLength = res.length - 1 - res.lastIndexOf('/'); }
            lastSlash = i; dots = 0; continue;
          } else if (res.length !== 0) { res = ''; lastSegmentLength = 0; lastSlash = i; dots = 0; continue; }
        }
        if (allowAboveRoot) { res += res.length > 0 ? '/..' : '..'; lastSegmentLength = 2; }
      } else {
        if (res.length > 0) res += '/' + path.slice(lastSlash + 1, i); else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i; dots = 0;
    } else if (code === 46 && dots !== -1) { ++dots; } else { dots = -1; }
  }
  return res;
}
export const sep = '/';
export const delimiter = ':';
export function resolve(...args) {
  let resolvedPath = ''; let resolvedAbsolute = false;
  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const path = i >= 0 ? args[i] : __astryx_host.cwd();
    assertPath(path);
    if (path.length === 0) continue;
    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute) return '/' + resolvedPath;
  return resolvedPath.length > 0 ? resolvedPath : '.';
}
export function normalize(path) {
  assertPath(path);
  if (path.length === 0) return '.';
  const isAbs = path.charCodeAt(0) === 47;
  const trailing = path.charCodeAt(path.length - 1) === 47;
  path = normalizeString(path, !isAbs);
  if (path.length === 0) { if (isAbs) return '/'; return trailing ? './' : '.'; }
  if (trailing) path += '/';
  return isAbs ? '/' + path : path;
}
export function isAbsolute(path) { assertPath(path); return path.length > 0 && path.charCodeAt(0) === 47; }
export function join(...args) {
  if (args.length === 0) return '.';
  let joined;
  for (const arg of args) { assertPath(arg); if (arg.length > 0) joined = joined === undefined ? arg : joined + '/' + arg; }
  if (joined === undefined) return '.';
  return normalize(joined);
}
export function relative(from, to) {
  assertPath(from); assertPath(to);
  if (from === to) return '';
  from = resolve(from); to = resolve(to);
  if (from === to) return '';
  const fromStart = 1; const fromEnd = from.length; const fromLen = fromEnd - fromStart;
  const toStart = 1; const toLen = to.length - toStart;
  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1; let i = 0;
  for (; i < length; i++) { const fromCode = from.charCodeAt(fromStart + i); if (fromCode !== to.charCodeAt(toStart + i)) break; else if (fromCode === 47) lastCommonSep = i; }
  if (i === length) {
    if (toLen > length) { if (to.charCodeAt(toStart + i) === 47) return to.slice(toStart + i + 1); if (i === 0) return to.slice(toStart + i); }
    else if (fromLen > length) { if (from.charCodeAt(fromStart + i) === 47) lastCommonSep = i; else if (i === 0) lastCommonSep = 0; }
  }
  let out = '';
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) { if (i === fromEnd || from.charCodeAt(i) === 47) out += out.length === 0 ? '..' : '/..'; }
  return out + to.slice(toStart + lastCommonSep);
}
export function toNamespacedPath(p) { return p; }
export function dirname(path) {
  assertPath(path);
  if (path.length === 0) return '.';
  const hasRoot = path.charCodeAt(0) === 47; let end = -1; let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; --i) { if (path.charCodeAt(i) === 47) { if (!matchedSlash) { end = i; break; } } else matchedSlash = false; }
  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) return '//';
  return path.slice(0, end);
}
export function basename(path, suffix) {
  assertPath(path);
  let start = 0; let end = -1; let matchedSlash = true;
  if (suffix !== undefined && suffix.length > 0 && suffix.length <= path.length) {
    if (suffix === path) return '';
    let extIdx = suffix.length - 1; let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charCodeAt(i);
      if (code === 47) { if (!matchedSlash) { start = i + 1; break; } }
      else {
        if (firstNonSlashEnd === -1) { matchedSlash = false; firstNonSlashEnd = i + 1; }
        if (extIdx >= 0) { if (code === suffix.charCodeAt(extIdx)) { if (--extIdx === -1) end = i; } else { extIdx = -1; end = firstNonSlashEnd; } }
      }
    }
    if (start === end) end = firstNonSlashEnd; else if (end === -1) end = path.length;
    return path.slice(start, end);
  }
  for (let i = path.length - 1; i >= 0; --i) { if (path.charCodeAt(i) === 47) { if (!matchedSlash) { start = i + 1; break; } } else if (end === -1) { matchedSlash = false; end = i + 1; } }
  if (end === -1) return '';
  return path.slice(start, end);
}
export function extname(path) {
  assertPath(path);
  let startDot = -1; let startPart = 0; let end = -1; let matchedSlash = true; let preDotState = 0;
  for (let i = path.length - 1; i >= 0; --i) {
    const code = path.charCodeAt(i);
    if (code === 47) { if (!matchedSlash) { startPart = i + 1; break; } continue; }
    if (end === -1) { matchedSlash = false; end = i + 1; }
    if (code === 46) { if (startDot === -1) startDot = i; else if (preDotState !== 1) preDotState = 1; }
    else if (startDot !== -1) preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) return '';
  return path.slice(startDot, end);
}
export function parse(path) {
  assertPath(path);
  const ret = { root: '', dir: '', base: '', ext: '', name: '' };
  if (path.length === 0) return ret;
  const isAbs = path.charCodeAt(0) === 47;
  if (isAbs) ret.root = '/';
  const base = basename(path); const ext = extname(path);
  ret.base = base; ret.ext = ext; ret.name = ext ? base.slice(0, base.length - ext.length) : base;
  const d = dirname(path);
  ret.dir = (d === '.' && !path.includes('/')) ? '' : d;
  return ret;
}
export function format(o) {
  const dir = o.dir || o.root; const base = o.base || ((o.name || '') + (o.ext ? (o.ext[0] === '.' ? '' : '.') + o.ext : ''));
  if (!dir) return base;
  return dir === o.root ? dir + base : dir + '/' + base;
}
export function matchesGlob() { throw new Error('path.matchesGlob is not supported here'); }
const path = { sep, delimiter, resolve, normalize, isAbsolute, join, relative, toNamespacedPath, dirname, basename, extname, parse, format, matchesGlob };
path.posix = path;
path.win32 = path;
export const posix = path;
export const win32 = path;
export default path;
"#;

const URL: &str = r#"
function encodePathChars(p) {
  let out = '';
  for (const ch of p) {
    const c = ch.codePointAt(0);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || "/-._~!$&'()*+,;=:@".includes(ch)) out += ch;
    else out += Array.from(new TextEncoderShim().encode(ch), b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
  }
  return out;
}
class TextEncoderShim { encode(s) { return __astryx_host.utf8(s); } }
export function fileURLToPath(u) {
  const href = typeof u === 'string' ? u : (u && u.href);
  if (typeof href !== 'string') { const e = new TypeError('The "path" argument must be of type string or an instance of URL. Received ' + typeof u); e.code = 'ERR_INVALID_ARG_TYPE'; throw e; }
  if (!href.startsWith('file:')) { const e = new TypeError('The URL must be of scheme file'); e.code = 'ERR_INVALID_URL_SCHEME'; throw e; }
  let rest = href.slice(5).replace(/^\/\/(localhost)?/, '');
  rest = rest.split(/[?#]/)[0];
  return decodeURIComponent(rest);
}
export function pathToFileURL(p) {
  const abs = __astryx_host.resolvePath(p);
  const href = 'file://' + encodePathChars(abs) + ((p.endsWith('/') && !abs.endsWith('/')) ? '/' : '');
  return new URL(href);
}
export class URL {
  constructor(input, base) {
    let s = String(input);
    if (base !== undefined && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
      const b = new URL(base);
      if (s.startsWith('/')) s = b.protocol + '//' + b.host + s;
      else { const dir = b.pathname.slice(0, b.pathname.lastIndexOf('/') + 1); s = b.protocol + '//' + b.host + __astryx_host.normalizeUrlPath(dir + s); }
    }
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:)(\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/.exec(s);
    if (!m) { const e = new TypeError('Invalid URL'); e.code = 'ERR_INVALID_URL'; e.input = s; throw e; }
    this.protocol = m[1].toLowerCase(); this.host = m[3] || ''; this.hostname = this.host.replace(/:\d+$/, '');
    this.port = (/:(\d+)$/.exec(this.host) || [, ''])[1];
    this.pathname = m[4] || (m[2] !== undefined ? '/' : ''); this.search = m[5] && m[5] !== '?' ? m[5] : ''; this.hash = m[6] && m[6] !== '#' ? m[6] : '';
    this.username = ''; this.password = '';
  }
  get origin() { return this.protocol === 'file:' ? 'null' : this.protocol + '//' + this.host; }
  get href() { return this.protocol + (this.host || this.protocol === 'file:' ? '//' + this.host : '') + this.pathname + this.search + this.hash; }
  get searchParams() { return new URLSearchParams(this.search); }
  toString() { return this.href; }
  toJSON() { return this.href; }
}
export class URLSearchParams {
  constructor(init) { this._p = []; const s = typeof init === 'string' ? init.replace(/^\?/, '') : ''; if (s) for (const kv of s.split('&')) { const i = kv.indexOf('='); this._p.push(i < 0 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))]); } }
  get(k) { const e = this._p.find(p => p[0] === k); return e ? e[1] : null; }
  has(k) { return this._p.some(p => p[0] === k); }
  set(k, v) { this._p = this._p.filter(p => p[0] !== k); this._p.push([k, String(v)]); }
  toString() { return this._p.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
}
export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
"#;

const FS: &str = r#"
function fsError(code, syscall, path, msg) { const e = new Error(code + ': ' + msg + ', ' + syscall + " '" + path + "'"); e.code = code; e.syscall = syscall; e.path = path; e.errno = code === 'ENOENT' ? -2 : -1; return e; }
function toPath(p) { return typeof p === 'string' ? p : (p && typeof p.href === 'string' ? decodeURIComponent(p.href.replace(/^file:\/\//, '')) : String(p)); }
export function readFileSync(p, opts) {
  p = toPath(p);
  const enc = typeof opts === 'string' ? opts : opts && opts.encoding;
  const r = __astryx_host.readFile(p);
  if (typeof r !== 'string') throw fsError(r.code, 'open', p, r.message);
  if (enc) return r;
  return r; // Buffers are not modeled; text callers pass an encoding.
}
export function existsSync(p) { try { return __astryx_host.stat(toPath(p)) !== null; } catch { return false; } }
function statOf(p, syscall) {
  p = toPath(p);
  const s = __astryx_host.stat(p);
  if (s === null) throw fsError('ENOENT', syscall, p, 'no such file or directory');
  return { isFile: () => s.file, isDirectory: () => s.dir, isSymbolicLink: () => s.link, size: s.size, mtimeMs: s.mtimeMs, mtime: new Date(s.mtimeMs) };
}
export function statSync(p, opts) { try { return statOf(p, 'stat'); } catch (e) { if (opts && opts.throwIfNoEntry === false) return undefined; throw e; } }
export function lstatSync(p, opts) { return statSync(p, opts); }
export function readdirSync(p, opts) {
  p = toPath(p);
  const r = __astryx_host.readDir(p);
  if (!Array.isArray(r)) throw fsError(r.code, 'scandir', p, r.message);
  if (opts && opts.withFileTypes) return r.map(e => ({ name: e.name, parentPath: p, path: p, isFile: () => e.file, isDirectory: () => e.dir, isSymbolicLink: () => e.link }));
  return r.map(e => e.name);
}
export function realpathSync(p) { const r = __astryx_host.realpath(toPath(p)); if (r === null) throw fsError('ENOENT', 'realpath', toPath(p), 'no such file or directory'); return r; }
realpathSync.native = realpathSync;
export const promises = {
  readFile: async (p, o) => readFileSync(p, o),
  readdir: async (p, o) => readdirSync(p, o),
  stat: async (p) => statSync(p),
  access: async (p) => { statSync(p); },
};
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export default { readFileSync, existsSync, statSync, lstatSync, readdirSync, realpathSync, promises, constants };
"#;

const FS_PROMISES: &str = r#"
import fs from 'node:fs';
export const readFile = fs.promises.readFile;
export const readdir = fs.promises.readdir;
export const stat = fs.promises.stat;
export const access = fs.promises.access;
export default fs.promises;
"#;

const PROCESS: &str = r#"
export default globalThis.process;
export const env = globalThis.process.env;
export const argv = globalThis.process.argv;
export const platform = globalThis.process.platform;
export const cwd = globalThis.process.cwd;
"#;

const MODULE: &str = r#"
export function createRequire(from) { return __astryx_host.createRequire(String(from && from.href ? from.href : from)); }
export const builtinModules = [];
export default { createRequire, builtinModules };
"#;

const OS: &str = r#"
export const EOL = '\n';
export function platform() { return 'linux'; }
export function homedir() { return globalThis.process.env.HOME || '/'; }
export function tmpdir() { return globalThis.process.env.TMPDIR || '/tmp'; }
export default { EOL, platform, homedir, tmpdir };
"#;

const UTIL: &str = r#"
export function inspect(v) { return __astryx_host.inspect(v); }
export function format(...a) { return __astryx_host.format(...a); }
export function isDeepStrictEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export default { inspect, format, isDeepStrictEqual };
"#;

const ASYNC_HOOKS: &str = r#"
export class AsyncLocalStorage {
  constructor() { this._store = undefined; }
  getStore() { return this._store; }
  run(store, fn, ...args) {
    const prev = this._store;
    this._store = store;
    let result;
    try { result = fn(...args); } catch (e) { this._store = prev; throw e; }
    if (result && typeof result.then === 'function') return result.finally(() => { this._store = prev; });
    this._store = prev;
    return result;
  }
  enterWith(store) { this._store = store; }
  exit(fn, ...args) { return this.run(undefined, fn, ...args); }
  disable() { this._store = undefined; }
}
export default { AsyncLocalStorage };
"#;
