//! `mappedPropOrigin` (`prop-drift.mjs`): where the key of a prop a mapped
//! type builds comes from.

use super::prop_drift::{decls, file_of, fl, sf_, sk, some, strongest, text_of};
use super::type_match::aliased;
use super::Ts;
use boa_engine::JsValue;
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Clone)]
struct Bound {
    node: JsValue,
    env: Env,
}

type Env = Rc<RefCell<Vec<(JsValue, Bound)>>>;

fn env_get(t: &Ts, env: &Env, key: &JsValue) -> Option<Bound> {
    env.borrow().iter().rev().find(|(k, _)| t.same(k, key)).map(|(_, b)| b.clone())
}

fn env_set(t: &Ts, env: &Env, key: JsValue, b: Bound) {
    let mut e = env.borrow_mut();
    if let Some(slot) = e.iter_mut().find(|(k, _)| t.same(k, &key)) {
        slot.1 = b;
    } else {
        e.push((key, b));
    }
}

pub struct Origins<'a> {
    checker: JsValue,
    is_own: &'a dyn Fn(&str) -> bool,
    sites: Vec<(JsValue, Vec<Env>)>,
    budget: i64,
}

impl<'a> Origins<'a> {
    fn where_(&self, t: &mut Ts, node: &JsValue) -> &'static str {
        let f = file_of(t, node);
        if (self.is_own)(&f) {
            "own"
        } else {
            "foreign"
        }
    }

    fn target(&self, t: &mut Ts, node: &JsValue) -> JsValue {
        let mut n = t.get(node, "typeName");
        if !some(&n) {
            n = t.get(node, "exprName");
        }
        if !some(&n) {
            n = t.get(node, "expression");
        }
        if !some(&n) {
            n = node.clone();
        }
        let s = t.m(&self.checker, "getSymbolAtLocation", &[n]);
        aliased(t, &self.checker, &s)
    }

    fn bind(&self, t: &mut Ts, params: &JsValue, args: &JsValue, env: &Env) -> Env {
        let next: Env = Rc::new(RefCell::new(env.borrow().clone()));
        let ps = t.items(params);
        let arr = t.items(args);
        for (i, p) in ps.iter().enumerate() {
            let arg = arr.get(i).cloned().filter(some);
            let node = arg.clone().or_else(|| Some(t.get(p, "default")).filter(some));
            if let Some(node) = node {
                let pn = t.get(p, "name");
                let key = self.target(t, &pn);
                let b = Bound { node, env: if arg.is_some() { env.clone() } else { next.clone() } };
                env_set(t, &next, key, b);
            }
        }
        next
    }

    fn visit(&mut self, t: &mut Ts, node: &JsValue, env: &Env, depth: usize) {
        if !some(node) || depth > 40 {
            return;
        }
        self.budget -= 1;
        if self.budget < 0 {
            return;
        }
        if t.is("isMappedTypeNode", node) {
            match self.sites.iter_mut().find(|(k, _)| t.same(k, node)) {
                Some(e) => e.1.push(env.clone()),
                None => self.sites.push((node.clone(), vec![env.clone()])),
            }
        }
        let reference = t.is("isTypeReferenceNode", node) || t.is("isExpressionWithTypeArguments", node);
        let wrapped = t.is("isIdentifier", node) && {
            let p = t.get(node, "parent");
            (t.is("isCallExpression", &p) || t.is("isVariableDeclaration", &p)) && {
                let pe = t.get(&p, "expression");
                let pn = t.get(&p, "name");
                !t.same(node, &pe) && !t.same(node, &pn)
            }
        };
        if reference || wrapped {
            let target = self.target(t, node);
            for d in decls(t, &target) {
                let own = self.where_(t, &d) == "own";
                let targs = t.get(node, "typeArguments");
                if reference && t.is("isTypeAliasDeclaration", &d) {
                    let tps = t.get(&d, "typeParameters");
                    let next = self.bind(t, &tps, &targs, env);
                    let dt = t.get(&d, "type");
                    self.visit(t, &dt, &next, depth + 1);
                } else if reference && (own || !some(&targs)) {
                    let tps = t.get(&d, "typeParameters");
                    let next = self.bind(t, &tps, &targs, env);
                    if own {
                        self.visit(t, &d, &next, depth + 1);
                    } else {
                        let hc = t.get(&d, "heritageClauses");
                        for c in t.items(&hc) {
                            self.visit(t, &c, &next, depth + 1);
                        }
                    }
                } else if wrapped && own {
                    self.visit(t, &d, env, depth + 1);
                }
            }
        }
        for c in t.children(node) {
            self.visit(t, &c, env, depth + 1);
        }
    }

    fn key_origin(&self, t: &mut Ts, node: &JsValue, key: &str, env: &Env, depth: usize) -> Option<&'static str> {
        if !some(node) || depth > 40 {
            return Some("unknown");
        }
        let next = |s: &Self, t: &mut Ts, inner: &JsValue| s.key_origin(t, inner, key, env, depth + 1);
        if t.is("isParenthesizedTypeNode", node) {
            let ty = t.get(node, "type");
            return next(self, t, &ty);
        }
        if t.is("isLiteralTypeNode", node) {
            let l = t.get(node, "literal");
            return if text_of(t, &l) == key { Some(self.where_(t, node)) } else { None };
        }
        if t.is("isUnionTypeNode", node) {
            let tys = t.get(node, "types");
            let found: Vec<Option<&'static str>> = t.items(&tys).iter().map(|x| next(self, t, x)).collect();
            return strongest(&found);
        }
        if t.is("isConditionalTypeNode", node) {
            let a = t.get(node, "trueType");
            let b = t.get(node, "falseType");
            let found = vec![next(self, t, &a), next(self, t, &b)];
            return strongest(&found);
        }
        if t.is("isTypeOperatorNode", node) {
            let op = t.get(node, "operator");
            let ty = t.get(node, "type");
            if t.n(&op) == sk(t, "KeyOfKeyword") {
                let of = if t.is("isTypeReferenceNode", &ty) {
                    let tg = self.target(t, &ty);
                    env_get(t, env, &tg)
                } else {
                    None
                };
                let tn = match &of {
                    Some(b) => b.node.clone(),
                    None => ty.clone(),
                };
                let typ = t.m(&self.checker, "getTypeFromTypeNode", &[tn]);
                let k = t.str(key);
                let prop = t.m(&self.checker, "getPropertyOfType", &[typ, k]);
                return if some(&prop) { self.prop_origin(t, &prop, depth + 1) } else { None };
            }
        }
        if t.is("isArrayTypeNode", node) {
            let e = t.get(node, "elementType");
            return next(self, t, &e);
        }
        if t.is("isTupleTypeNode", node) {
            let els = t.get(node, "elements");
            let found: Vec<Option<&'static str>> = t.items(&els).iter().map(|x| next(self, t, x)).collect();
            return strongest(&found);
        }
        if t.is("isTypeOperatorNode", node) {
            let ty = t.get(node, "type");
            return next(self, t, &ty);
        }
        if t.is("isIndexedAccessTypeNode", node) {
            let it = t.get(node, "indexType");
            let ot = t.get(node, "objectType");
            let index = if t.is("isLiteralTypeNode", &it) {
                let l = t.get(&it, "literal");
                Some(text_of(t, &l))
            } else {
                None
            };
            let Some(index) = index else { return next(self, t, &ot) };
            let typ = t.m(&self.checker, "getTypeFromTypeNode", &[ot]);
            let ij = t.str(&index);
            let prop = t.m(&self.checker, "getPropertyOfType", &[typ, ij]);
            let declared = decls(t, &prop).first().cloned();
            return match declared {
                Some(d) => self.value_origin(t, &d, key, depth + 1),
                None => Some("unknown"),
            };
        }
        if t.is("isTypeQueryNode", node) {
            let tg = self.target(t, node);
            let vd = t.get(&tg, "valueDeclaration");
            return self.value_origin(t, &vd, key, depth + 1);
        }
        if t.is("isTypeReferenceNode", node) {
            let symbol = self.target(t, node);
            if some(&symbol) {
                if let Some(b) = env_get(t, env, &symbol) {
                    return self.key_origin(t, &b.node, key, &b.env, depth + 1);
                }
            }
            if let Some(alias) = decls(t, &symbol).into_iter().find(|d| t.is("isTypeAliasDeclaration", d)) {
                let tps = t.get(&alias, "typeParameters");
                let targs = t.get(node, "typeArguments");
                let bound = self.bind(t, &tps, &targs, env);
                let at = t.get(&alias, "type");
                return self.key_origin(t, &at, key, &bound, depth + 1);
            }
            if some(&symbol) && fl(t, &symbol, "flags") & (sf_(t, "Enum") | sf_(t, "EnumMember")) != 0 {
                let d = decls(t, &symbol);
                if let Some(d0) = d.first() {
                    return Some(self.where_(t, d0));
                }
            }
        }
        Some("unknown")
    }

    fn value_origin(&self, t: &mut Ts, node: &JsValue, key: &str, depth: usize) -> Option<&'static str> {
        if !some(node) || depth > 40 {
            return Some("unknown");
        }
        if t.is("isStringLiteralLike", node) || t.is("isNumericLiteral", node) {
            return if text_of(t, node) == key { Some(self.where_(t, node)) } else { None };
        }
        if t.is("isArrayLiteralExpression", node) {
            let els = t.get(node, "elements");
            let found: Vec<Option<&'static str>> = t.items(&els).iter().map(|e| self.value_origin(t, e, key, depth + 1)).collect();
            return strongest(&found);
        }
        let ty = t.get(node, "type");
        let written = some(&ty) && !t.is("isSatisfiesExpression", node) && {
            let tn = t.get(&ty, "typeName");
            !(some(&tn) && text_of(t, &tn) == "const")
        };
        if written {
            let empty: Env = Rc::new(RefCell::new(Vec::new()));
            return self.key_origin(t, &ty, key, &empty, depth + 1);
        }
        let mut inner = t.get(node, "initializer");
        if !some(&inner) {
            inner = t.get(node, "expression");
        }
        if some(&inner) {
            return self.value_origin(t, &inner, key, depth + 1);
        }
        if t.is("isIdentifier", node) {
            let s = t.m(&self.checker, "getSymbolAtLocation", &[node.clone()]);
            let s = aliased(t, &self.checker, &s);
            let vd = t.get(&s, "valueDeclaration");
            return self.value_origin(t, &vd, key, depth + 1);
        }
        Some("unknown")
    }

    fn prop_origin(&self, t: &mut Ts, prop: &JsValue, depth: usize) -> Option<&'static str> {
        if depth > 40 {
            return Some("unknown");
        }
        let ds = decls(t, prop);
        if !ds.is_empty() {
            return Some(if ds.iter().any(|d| self.where_(t, d) == "own") { "own" } else { "foreign" });
        }
        let lk = t.get(prop, "links");
        let links = if some(&lk) { lk } else { prop.clone() };
        let so = t.get(&links, "syntheticOrigin");
        if some(&so) {
            return self.prop_origin(t, &so, depth + 1);
        }
        let ct = t.get(&links, "containingType");
        if some(&ct) {
            let pname = super::prop_drift::name_of(t, prop);
            let tys = t.get(&ct, "types");
            let mut found = Vec::new();
            for ty in t.items(&tys) {
                let pj = t.str(&pname);
                let part = t.m(&self.checker, "getPropertyOfType", &[ty, pj]);
                found.push(if some(&part) && !t.same(&part, prop) { self.prop_origin(t, &part, depth + 1) } else { None });
            }
            return strongest(&found);
        }
        let mt = t.get(&links, "mappedType");
        let mapping = t.get(&mt, "declaration");
        let kt = t.get(&links, "keyType");
        let kv = t.get(&kt, "value");
        if !some(&mapping) || kv.is_undefined() {
            return Some("unknown");
        }
        let key = t.s(&kv);
        let envs: Vec<Env> = self.sites.iter().find(|(k, _)| t.same(k, &mapping)).map(|(_, e)| e.clone()).unwrap_or_default();
        let tp = t.get(&mapping, "typeParameter");
        let constraint = t.get(&tp, "constraint");
        let found: Vec<Option<&'static str>> = envs.iter().map(|e| self.key_origin(t, &constraint, &key, e, depth + 1)).collect();
        strongest(&found)
    }
}

/// `mappedPropOrigin(ts, checker, isOwnFile, starts)`: built once, asked per prop.
pub fn mapped_prop_origin<'a>(t: &mut Ts, checker: &JsValue, is_own: &'a dyn Fn(&str) -> bool, starts: &[JsValue]) -> Origins<'a> {
    let mut o = Origins { checker: checker.clone(), is_own, sites: Vec::new(), budget: 5000 };
    for s in starts {
        if some(s) && o.where_(t, s) == "own" {
            let env: Env = Rc::new(RefCell::new(Vec::new()));
            o.visit(t, s, &env, 0);
        }
    }
    o
}

impl Origins<'_> {
    pub fn origin(&self, t: &mut Ts, prop: &JsValue) -> &'static str {
        self.prop_origin(t, prop, 0).unwrap_or("unknown")
    }
}
