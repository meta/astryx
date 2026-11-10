#!/usr/bin/env node
// Records every request and response the TypeScript 7 Node API client sends to
// its compiler process on a small project. The Rust client's test replays the
// same calls and compares each request and response byte for byte.
//
// Usage: node scripts/ts7-oracle.mjs <typescript-7 package dir> [out.json]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsDir = path.resolve(process.argv[2] ?? "");
const out = process.argv[3] ?? path.join(here, "../src/ts7/testdata/oracle.json");
const ROOT = "/tmp/astryx-ts7-oracle/proj";

fs.rmSync(path.dirname(ROOT), { recursive: true, force: true });
fs.cpSync(path.join(here, "../src/ts7/testdata/proj"), ROOT, { recursive: true });

const { API, SignatureKind } = await import(pathToFileURL(path.join(tsDir, "dist/api/sync/api.js")).href);
const getExePath = (await import(pathToFileURL(path.join(tsDir, "lib/getExePath.js")).href)).default;
const { SyncRpcChannel } = await import(pathToFileURL(path.join(tsDir, "dist/api/syncChannel.js")).href);

let exchanges = [];
const calls = [];
const originalCall = SyncRpcChannel.prototype.handleCall;
SyncRpcChannel.prototype.handleCall = function (name, payload) {
  const write = this.writeTuple;
  let result;
  this.writeTuple = function (type, n, p) {
    result = { type, payload: Buffer.from(p).toString("utf8") };
    return write.call(this, type, n, p);
  };
  try {
    return originalCall.call(this, name, payload);
  } finally {
    this.writeTuple = write;
    calls.push({ name, arg: Buffer.from(payload).toString("utf8"), ...result });
  }
};
const original = SyncRpcChannel.prototype.requestBytesSync;
SyncRpcChannel.prototype.requestBytesSync = function (method, payload) {
  const request = typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8");
  const response = original.call(this, method, payload);
  exchanges.push(
    method === "getSourceFile"
      ? { method, request, responseBase64: Buffer.from(response).toString("base64") }
      : { method, request, response: Buffer.from(response).toString("utf8") },
  );
  return response;
};

const exe = getExePath();
const api = new API({ cwd: ROOT, tsserverPath: exe });
const snap = api.updateSnapshot({ openProjects: [`${ROOT}/tsconfig.json`] });
const project = snap.getProjects()[0];
const { program, checker } = project;
program.getSourceFileNames();
const buttonFile = `${ROOT}/src/Button.ts`;
const indexFile = `${ROOT}/src/index.ts`;
const sf = program.getSourceFile(buttonFile);
const text = fs.readFileSync(buttonFile, "utf8");
const propsSym = checker.getSymbolAtPosition(buttonFile, text.indexOf("ButtonProps"));
const propsType = checker.getDeclaredTypeOfSymbol(propsSym);
checker.typeToString(propsType);
for (const prop of checker.getPropertiesOfType(propsType)) {
  const t = checker.getTypeOfSymbol(prop);
  checker.typeToString(t);
  checker.getDocumentationCommentOfSymbol(prop);
}
checker.getJsDocTagsOfSymbol(propsSym);
const fnName = sf.statements[2].name;
const fnSym = checker.getSymbolAtLocation(fnName);
const fnType = checker.getTypeAtLocation(fnName);
for (const sig of checker.getSignaturesOfType(fnType, SignatureKind.Call)) {
  checker.getReturnTypeOfSignature(sig);
  checker.getParameterType(sig, 0);
}
checker.getTypeOfSymbol(fnSym);
program.getSemanticDiagnostics(buttonFile);
program.getSemanticDiagnostics(indexFile);
program.getSyntacticDiagnostics(indexFile);
const indexSf = program.getSourceFile(indexFile);
const moduleSym = checker.getSymbolAtLocation(indexSf);
if (moduleSym) checker.getExportsOfModule(moduleSym);
checker.getSymbolAtPosition(indexFile, [0, 10, 30]);
checker.getStringType();
snap.dispose();
api.close();

const plain = exchanges;
exchanges = [];

// A second session with file system callbacks: a virtual tsconfig and an
// instrumented source file served from memory.
const VIRTUAL = `${ROOT}/__astryx.tsconfig.json`;
const instrumented = text + "\ntype __astryx_0 = ButtonProps['size'];\n";
const vapi = new API({
  cwd: ROOT,
  tsserverPath: exe,
  fs: {
    readFile(p) {
      if (p === VIRTUAL) return JSON.stringify({ compilerOptions: { strict: true, noEmit: true, lib: ["es2022"] }, files: [buttonFile] });
      if (p === buttonFile) return instrumented;
      if (p === `${ROOT}/missing.ts`) return null;
      return undefined;
    },
    fileExists(p) {
      if (p === VIRTUAL) return true;
      return undefined;
    },
  },
});
const vsnap = vapi.updateSnapshot({ openProjects: [VIRTUAL] });
const vproject = vsnap.getProjects()[0];
const vt = vproject.checker.getTypeAtPosition(buttonFile, instrumented.indexOf("__astryx_0"));
vproject.checker.typeToString(vt);
vproject.program.getSemanticDiagnostics(buttonFile);
vsnap.dispose();
vapi.close();

calls.sort((a, b) => (a.name + a.arg < b.name + b.arg ? -1 : a.name + a.arg > b.name + b.arg ? 1 : 0));
// The compiler's own folder differs per machine.
const libDir = path.dirname(exe);
fs.writeFileSync(
  out,
  JSON.stringify({ root: ROOT, args: ["--api", "--cwd", ROOT], exchanges: plain, virtual: { exchanges, calls } }, null, 1).split(libDir).join("<tslib>") + "\n",
);
console.log(`${plain.length}+${exchanges.length} exchanges, ${calls.length} callbacks -> ${out}`);
