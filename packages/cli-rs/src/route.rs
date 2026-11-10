//! The small routing helper that build and search share
//! (`foundation/route/route.mjs`): searchers answer a request or pass,
//! dispatchers name the children that should answer, and a classifier is a
//! dispatcher whose route is a static word-weight classifier.
//!
//! Trees are small and static, so a tree here is a list of nodes with string
//! ids, as in the JS helper. Tuning and tracing are measurement tools and never
//! reach a command's output, so they are not ported.

use indexmap::IndexMap;

/// Static classifier weights: one row per token, one number per class.
#[derive(Debug, Clone, Default)]
pub struct ClassifierWeights {
    pub classes: Vec<String>,
    pub tokens: IndexMap<String, Vec<f64>>,
}

impl ClassifierWeights {
    /// Read `{classes, tokens}` from a parsed weights file.
    pub fn from_json(v: &serde_json::Value) -> Option<Self> {
        let classes = v
            .get("classes")?
            .as_array()?
            .iter()
            .map(|c| c.as_str().map(str::to_string))
            .collect::<Option<Vec<_>>>()?;
        let mut tokens = IndexMap::new();
        for (k, row) in v.get("tokens")?.as_object()? {
            let row = row
                .as_array()?
                .iter()
                .map(|x| x.as_f64())
                .collect::<Option<Vec<_>>>()?;
            tokens.insert(k.clone(), row);
        }
        Some(Self { classes, tokens })
    }
}

/// The probability of each class for these tokens: a softmax over the summed
/// rows of the tokens the weights know.
pub fn classify(weights: &ClassifierWeights, tokens: &[String]) -> Vec<f64> {
    let mut score = vec![0.0f64; weights.classes.len()];
    for token in tokens {
        if let Some(row) = weights.tokens.get(token) {
            for (k, s) in score.iter_mut().enumerate() {
                // JS reads `row[k]`; a short row adds `undefined`, giving NaN.
                *s += row.get(k).copied().unwrap_or(f64::NAN);
            }
        }
    }
    let top = js_max(&score);
    let e: Vec<f64> = score.iter().map(|x| crate::js::jsmath::exp(x - top)).collect();
    let sum = e.iter().fold(0.0, |a, b| a + b);
    e.iter().map(|x| x / sum).collect()
}

/// `Math.max(...xs)`: NaN when any is NaN, -Infinity when empty.
pub fn js_max(xs: &[f64]) -> f64 {
    let mut m = f64::NEG_INFINITY;
    for &x in xs {
        if x.is_nan() {
            return f64::NAN;
        }
        if x > m || (x == 0.0 && m == 0.0 && m.is_sign_negative()) {
            m = x;
        }
    }
    m
}

/// A dispatcher's route: the children to try, best first, and its confidence.
pub struct Route {
    pub ids: Vec<String>,
    pub confidence: f64,
}

/// One node of a tree.
pub enum Node<'a, Req, Ctx, Ans, E> {
    Searcher {
        id: String,
        run: Box<dyn Fn(&Req, &Ctx) -> Result<Option<Ans>, E> + 'a>,
    },
    Dispatcher {
        id: String,
        children: Vec<String>,
        floor: f64,
        fallback: String,
        route: Box<dyn Fn(&Req, &Ctx) -> Route + 'a>,
    },
}

impl<Req, Ctx, Ans, E> Node<'_, Req, Ctx, Ans, E> {
    pub fn id(&self) -> &str {
        match self {
            Node::Searcher { id, .. } | Node::Dispatcher { id, .. } => id,
        }
    }
}

/// A classifier spec, as `defineClassifier` takes it.
pub struct ClassifierSpec<'a, Req, Ctx> {
    pub id: String,
    /// Class name -> the searcher that answers it.
    pub searchers: IndexMap<String, String>,
    pub fallback: String,
    pub floor: f64,
    pub features: Box<dyn Fn(&Req, &Ctx) -> Vec<String> + 'a>,
    pub weights: Box<dyn Fn(&Ctx) -> ClassifierWeights + 'a>,
}

/// A dispatcher whose route is a static classifier: the most probable class
/// (the first on a tie) goes to its searcher; a class with no searcher, or the
/// fallback's own class, stays with the fallback.
pub fn define_classifier<'a, Req: 'a, Ctx: 'a, Ans, E>(
    spec: ClassifierSpec<'a, Req, Ctx>,
) -> Node<'a, Req, Ctx, Ans, E> {
    let mut children = vec![spec.fallback.clone()];
    for s in spec.searchers.values() {
        if !children.contains(s) {
            children.push(s.clone());
        }
    }
    let ClassifierSpec { id, searchers, fallback, floor, features, weights } = spec;
    let fb = fallback.clone();
    Node::Dispatcher {
        id,
        children,
        floor,
        fallback,
        route: Box::new(move |req, ctx| {
            let w = weights(ctx);
            let p = classify(&w, &features(req, ctx));
            let m = js_max(&p);
            let best = p.iter().position(|x| *x == m);
            let target = best
                .and_then(|b| w.classes.get(b))
                .and_then(|c| searchers.get(c));
            match target {
                Some(t) if *t != fb => Route { ids: vec![t.clone()], confidence: p[best.unwrap()] },
                _ => Route { ids: vec![fb.clone()], confidence: 1.0 },
            }
        }),
    }
}

/// A tree: its root id and its nodes.
pub struct Tree<'a, Req, Ctx, Ans, E> {
    pub root: String,
    pub nodes: Vec<Node<'a, Req, Ctx, Ans, E>>,
}

impl<'a, Req, Ctx, Ans, E> Tree<'a, Req, Ctx, Ans, E> {
    fn get(&self, id: &str) -> Option<&Node<'a, Req, Ctx, Ans, E>> {
        self.nodes.iter().find(|n| n.id() == id)
    }
}

/// Run the tree from its root: a dispatcher below its floor runs its fallback;
/// otherwise the children it names run in order and the first answer wins;
/// when none answers, the fallback runs.
pub fn run_tree<Req, Ctx, Ans, E>(
    tree: &Tree<'_, Req, Ctx, Ans, E>,
    request: &Req,
    ctx: &Ctx,
) -> Result<Option<Ans>, E> {
    run_node(tree, &tree.root, request, ctx)
}

fn run_node<Req, Ctx, Ans, E>(
    tree: &Tree<'_, Req, Ctx, Ans, E>,
    id: &str,
    request: &Req,
    ctx: &Ctx,
) -> Result<Option<Ans>, E> {
    let node = tree.get(id).unwrap_or_else(|| panic!("no node \"{id}\""));
    match node {
        Node::Searcher { run, .. } => run(request, ctx),
        Node::Dispatcher { children, floor, fallback, route, .. } => {
            let r = route(request, ctx);
            for child in &r.ids {
                assert!(
                    children.contains(child),
                    "\"{id}\" routed to \"{child}\", which is not one of its children"
                );
            }
            if r.confidence >= *floor {
                for child in &r.ids {
                    if let Some(a) = run_node(tree, child, request, ctx)? {
                        return Ok(Some(a));
                    }
                }
            }
            run_node(tree, fallback, request, ctx)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_softmax() {
        let mut tokens = IndexMap::new();
        tokens.insert("#bias".to_string(), vec![0.0]);
        let w = ClassifierWeights { classes: vec!["main".into()], tokens };
        assert_eq!(classify(&w, &["#bias".to_string()]), vec![1.0]);
    }
}
