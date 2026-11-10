// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read a TypeScript 7 project through the checker interface the
 * type checks were written against: TypeScript's own JavaScript compiler API
 * names (`getSymbolAtLocation`, `type.isUnion()`, `symbol.declarations`).
 *
 * @input A project from `openTypeScript` (./project-typescript.mjs).
 * @output `{program, checker}`: each symbol, type and signature wrapped once,
 *   so identity comparisons hold; declarations resolved to TypeScript 7's
 *   own syntax nodes.
 * @position The props comparison (./prop-drift.mjs) and the modules it reads
 *   types with (./type-match.mjs, ./unresolved-references.mjs). Each method
 *   is one TypeScript 7 API request, or a field of an object one returned;
 *   packages/cli-rs/TS7-CHECKS.md lists the mapping.
 */

/** TypeScript's `TypeFormatFlags`, which TypeScript 7 reads by the same bits. */
export const TypeFormatFlags = Object.freeze({
  NoTruncation: 1,
  UseAliasDefinedOutsideCurrentScope: 1 << 14,
  InTypeAlias: 1 << 23,
  UseSingleQuotesForStringLiteralType: 1 << 28,
});

/** TypeScript 7's `CheckFlags` bits the checks read from `symbol.checkFlags`. */
export const CheckFlags = Object.freeze({
  Instantiated: 1,
  Mapped: 1 << 18,
});

/**
 * @param {any} project a TypeScript 7 `Project`
 * @param {any} syntax the session's syntax helpers
 */
export function adaptProject(project, syntax) {
  const raw = project.checker;
  const rawProgram = project.program;
  const {SignatureKind, TypeFlags, ObjectFlags} = syntax;
  /** @type {Map<string, any>} */
  const nodes = new Map();
  /** @type {WeakMap<object, any>} */
  const symbols = new WeakMap();
  /** @type {WeakMap<object, any>} */
  const types = new WeakMap();
  /** @type {WeakMap<object, any>} */
  const signatures = new WeakMap();

  /** @param {any} handle */
  const node = handle => {
    if (!handle) return undefined;
    const key = `${handle.path}\0${handle.index}`;
    if (!nodes.has(key)) nodes.set(key, handle.resolve(project));
    return nodes.get(key);
  };

  class Sym {
    /** @param {any} s */
    constructor(s) {
      this.raw = s;
      this.name = s.name;
      this.escapedName = s.escapedName;
      this.flags = s.flags;
      this.checkFlags = s.checkFlags;
    }
    get declarations() {
      const value = (this.raw.declarations ?? []).map(node).filter(Boolean);
      Object.defineProperty(this, 'declarations', {value});
      return value;
    }
    get valueDeclaration() {
      const value = node(this.raw.valueDeclaration);
      Object.defineProperty(this, 'valueDeclaration', {value});
      return value;
    }
    get parent() {
      return symbol(this.raw.getParent());
    }
  }

  class Typ {
    /** @param {any} t */
    constructor(t) {
      this.raw = t;
      this.id = t.id;
      this.flags = t.flags;
      this.objectFlags = t.objectFlags ?? 0;
      if (t.flags & (TypeFlags.Literal | TypeFlags.EnumLiteral)) {
        this.value = t.value;
      }
      if (t.intrinsicName) this.intrinsicName = t.intrinsicName;
      else if (t.flags & TypeFlags.BooleanLiteral) {
        this.intrinsicName = t.value ? 'true' : 'false';
      }
      if (t.texts) this.texts = t.texts;
    }
    isUnion() {
      return (this.flags & TypeFlags.Union) !== 0;
    }
    isIntersection() {
      return (this.flags & TypeFlags.Intersection) !== 0;
    }
    isStringLiteral() {
      return (this.flags & TypeFlags.StringLiteral) !== 0;
    }
    isNumberLiteral() {
      return (this.flags & TypeFlags.NumberLiteral) !== 0;
    }
    get types() {
      const list = this.raw.getTypes();
      const value = list ? list.map(type) : undefined;
      Object.defineProperty(this, 'types', {value});
      return value;
    }
    get symbol() {
      const value = this.raw.symbol ? symbol(this.raw.getSymbol()) : undefined;
      Object.defineProperty(this, 'symbol', {value});
      return value;
    }
    get aliasSymbol() {
      const value = this.raw.aliasSymbol
        ? symbol(this.raw.getAliasSymbol())
        : undefined;
      Object.defineProperty(this, 'aliasSymbol', {value});
      return value;
    }
    get aliasTypeArguments() {
      const value = this.raw.aliasTypeArguments?.length
        ? this.raw.getAliasTypeArguments().map(type)
        : undefined;
      Object.defineProperty(this, 'aliasTypeArguments', {value});
      return value;
    }
    /** A reference's generic target; a string mapping's argument is `type`. */
    get target() {
      const value =
        this.objectFlags & ObjectFlags.Reference && this.raw.target
          ? type(this.raw.getTarget())
          : undefined;
      Object.defineProperty(this, 'target', {value});
      return value;
    }
    get type() {
      const value =
        this.flags & TypeFlags.StringMapping && this.raw.target
          ? type(this.raw.getTarget())
          : undefined;
      Object.defineProperty(this, 'type', {value});
      return value;
    }
    /** A mapped type's declaration: its symbol's, a `MappedTypeNode`. */
    get declaration() {
      const value =
        this.objectFlags & ObjectFlags.Mapped
          ? this.symbol?.declarations.find(syntax.isMappedTypeNode)
          : undefined;
      Object.defineProperty(this, 'declaration', {value});
      return value;
    }
    getCallSignatures() {
      return raw.getSignaturesOfType(this.raw, SignatureKind.Call).map(signature);
    }
    getConstructSignatures() {
      return raw
        .getSignaturesOfType(this.raw, SignatureKind.Construct)
        .map(signature);
    }
  }

  class Sig {
    /** @param {any} s */
    constructor(s) {
      this.raw = s;
    }
    getParameters() {
      return this.raw.getParameters().map(symbol);
    }
    getTypeParameters() {
      return (this.raw.typeParameters?.length
        ? this.raw.getTypeParameters()
        : []
      ).map(type);
    }
  }

  /** @param {any} s */
  function symbol(s) {
    if (!s) return undefined;
    let w = symbols.get(s);
    if (!w) {
      w = new Sym(s);
      symbols.set(s, w);
    }
    return w;
  }
  /** @param {any} t */
  function type(t) {
    if (!t) return undefined;
    let w = types.get(t);
    if (!w) {
      w = new Typ(t);
      types.set(t, w);
    }
    return w;
  }
  /** @param {any} s */
  function signature(s) {
    let w = signatures.get(s);
    if (!w) {
      w = new Sig(s);
      signatures.set(s, w);
    }
    return w;
  }

  const checker = {
    /** @param {any} n */
    getSymbolAtLocation: n => symbol(raw.getSymbolAtLocation(n)),
    /** @param {any} s */
    getExportsOfModule: s => raw.getExportsOfModule(s.raw).map(symbol),
    /** @param {any} s */
    getAliasedSymbol: s => symbol(raw.getAliasedSymbol(s.raw)),
    /** @param {any} s */
    getExportSymbolOfSymbol: s => symbol(s.raw.getExportSymbol()),
    /** @param {any} s @param {any} n */
    getTypeOfSymbolAtLocation: (s, n) =>
      type(raw.getTypeOfSymbolAtLocation(s.raw, n)),
    /** @param {any} s */
    getTypeOfSymbol: s => type(raw.getTypeOfSymbol(s.raw)),
    /** @param {any} s */
    getDeclaredTypeOfSymbol: s => type(raw.getDeclaredTypeOfSymbol(s.raw)),
    /** @param {any} t */
    getPropertiesOfType: t => raw.getPropertiesOfType(t.raw).map(symbol),
    /** @param {any} t @param {string} name */
    getPropertyOfType: (t, name) => symbol(raw.getPropertyOfType(t.raw, name)),
    /** @param {any} t */
    getIndexInfosOfType: t =>
      raw.getIndexInfosOfType(t.raw).map(
        (/** @type {any} */ info) => ({
          keyType: type(info.keyType),
          type: type(info.valueType),
          declaration: node(info.declaration),
        }),
      ),
    /** @param {any} t @param {any} [at] @param {number} [flags] */
    typeToString: (t, at, flags) => raw.typeToString(t.raw, at, flags),
    /** @param {any} n */
    getTypeFromTypeNode: n => type(raw.getTypeFromTypeNode(n)),
    /** @param {any} n */
    getTypeAtLocation: n => type(raw.getTypeAtLocation(n)),
    /** @param {any} a @param {any} b */
    isTypeAssignableTo: (a, b) => raw.isTypeAssignableTo(a.raw, b.raw),
    getUndefinedType: () => type(raw.getUndefinedType()),
    /** @param {any} t */
    getTypeArguments: t => raw.getTypeArguments(t.raw).map(type),
    /** @param {any} t a class or interface type */
    getBaseTypes: t => (t.raw.getBaseTypes() ?? []).map(type),
    /** @param {any} n */
    getShorthandAssignmentValueSymbol: n =>
      symbol(raw.getShorthandAssignmentValueSymbol(n)),
    /**
     * @param {string} name
     * @param {number} meaning
     * @param {any} location
     */
    resolveName: (name, meaning, location) =>
      symbol(raw.resolveName(name, meaning, location, false)),
    /**
     * A symbol's name through its parents, as TypeScript's
     * `getFullyQualifiedName` writes it (`"/a/b".Color`).
     * @param {any} s
     */
    getFullyQualifiedName: s => {
      /** @type {string[]} */
      const parts = [];
      for (let at = s; at; at = at.parent) parts.unshift(at.name);
      return parts.join('.');
    },
  };

  /** @param {any} file a source file or its name */
  const fileName = file => (typeof file === 'string' ? file : file.fileName);
  const program = {
    /** @param {string} file */
    getSourceFile: file => rawProgram.getSourceFile(file),
    getSourceFileNames: () => rawProgram.getSourceFileNames(),
    getCompilerOptions: () => project.compilerOptions,
    /** @param {any} sf */
    isSourceFileDefaultLibrary: sf => rawProgram.isSourceFileDefaultLibrary(sf),
    /** @param {any} file */
    getSemanticDiagnostics: file =>
      rawProgram
        .getSemanticDiagnostics(fileName(file))
        .map((/** @type {any} */ d) => ({
          start: d.pos,
          end: d.end,
          code: d.code,
          category: d.category,
          messageText: d.text,
        })),
    getTypeChecker: () => checker,
  };
  return {program, checker};
}
