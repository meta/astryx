//! A port of node-diff3 3.2.1 `mergeDiff3` (Hunt-McIlroy LCS, diff3 merge
//! regions, false-conflict exclusion, labelled conflict markers).

use std::collections::HashMap;

struct Cand {
    i1: isize,
    i2: isize,
    chain: Option<usize>,
}

/// `LCS(buffer1, buffer2)`: the index of the last candidate in `pool`.
fn lcs(b1: &[String], b2: &[String], pool: &mut Vec<Cand>) -> usize {
    let mut classes: HashMap<&str, Vec<usize>> = HashMap::new();
    for (j, item) in b2.iter().enumerate() {
        classes.entry(item.as_str()).or_default().push(j);
    }
    pool.push(Cand { i1: -1, i2: -1, chain: None });
    let mut candidates: Vec<usize> = vec![0];
    let empty: Vec<usize> = Vec::new();
    for (i, item) in b1.iter().enumerate() {
        let idxs = classes.get(item.as_str()).unwrap_or(&empty);
        let mut r = 0usize;
        let mut c = candidates[0];
        for &j in idxs {
            let j = j as isize;
            let mut s = r;
            while s < candidates.len() {
                if pool[candidates[s]].i2 < j && (s == candidates.len() - 1 || pool[candidates[s + 1]].i2 > j) {
                    break;
                }
                s += 1;
            }
            if s < candidates.len() {
                pool.push(Cand { i1: i as isize, i2: j, chain: Some(candidates[s]) });
                let new_c = pool.len() - 1;
                if r == candidates.len() {
                    candidates.push(c);
                } else {
                    candidates[r] = c;
                }
                r = s + 1;
                c = new_c;
                if r == candidates.len() {
                    break;
                }
            }
        }
        if r == candidates.len() {
            candidates.push(c);
        } else {
            candidates[r] = c;
        }
    }
    *candidates.last().unwrap()
}

struct Hunk {
    ab: u8,
    o_start: usize,
    o_len: usize,
    ab_start: usize,
    ab_len: usize,
}

/// `diffIndices(buffer1, buffer2)` as `(start1, len1, start2, len2)`.
fn diff_indices(b1: &[String], b2: &[String]) -> Vec<(usize, usize, usize, usize)> {
    let mut pool = Vec::new();
    let last = lcs(b1, b2, &mut pool);
    let mut out = Vec::new();
    let mut tail1 = b1.len() as isize;
    let mut tail2 = b2.len() as isize;
    let mut cur = Some(last);
    while let Some(ci) = cur {
        let c = &pool[ci];
        let m1 = tail1 - c.i1 - 1;
        let m2 = tail2 - c.i2 - 1;
        tail1 = c.i1;
        tail2 = c.i2;
        if m1 != 0 || m2 != 0 {
            out.push(((tail1 + 1) as usize, m1 as usize, (tail2 + 1) as usize, m2 as usize));
        }
        cur = c.chain;
    }
    out.reverse();
    out
}

enum Region {
    Stable(Vec<String>),
    Unstable { a: Vec<String>, o: Vec<String>, b: Vec<String> },
}

fn diff3_merge_regions(a: &[String], o: &[String], b: &[String]) -> Vec<Region> {
    let mut hunks: Vec<Hunk> = Vec::new();
    for (s1, l1, s2, l2) in diff_indices(o, a) {
        hunks.push(Hunk { ab: b'a', o_start: s1, o_len: l1, ab_start: s2, ab_len: l2 });
    }
    for (s1, l1, s2, l2) in diff_indices(o, b) {
        hunks.push(Hunk { ab: b'b', o_start: s1, o_len: l1, ab_start: s2, ab_len: l2 });
    }
    hunks.sort_by_key(|h| h.o_start);
    let mut results = Vec::new();
    let mut curr = 0usize;
    let advance = |end: usize, curr: &mut usize, results: &mut Vec<Region>| {
        if end > *curr {
            results.push(Region::Stable(o[*curr..end].to_vec()));
            *curr = end;
        }
    };
    let mut hi = 0usize;
    while hi < hunks.len() {
        let first = hi;
        hi += 1;
        let region_start = hunks[first].o_start;
        let mut region_end = hunks[first].o_start + hunks[first].o_len;
        advance(region_start, &mut curr, &mut results);
        while hi < hunks.len() {
            let next_start = hunks[hi].o_start;
            if next_start > region_end {
                break;
            }
            region_end = region_end.max(next_start + hunks[hi].o_len);
            hi += 1;
        }
        if hi - first == 1 {
            let h = &hunks[first];
            if h.ab_len > 0 {
                let buf = if h.ab == b'a' { a } else { b };
                results.push(Region::Stable(buf[h.ab_start..h.ab_start + h.ab_len].to_vec()));
            }
        } else {
            let mut ba: [isize; 4] = [a.len() as isize, -1, o.len() as isize, -1];
            let mut bb: [isize; 4] = [b.len() as isize, -1, o.len() as isize, -1];
            for h in &hunks[first..hi] {
                let bd = if h.ab == b'a' { &mut ba } else { &mut bb };
                let (os, oe) = (h.o_start as isize, (h.o_start + h.o_len) as isize);
                let (s, e) = (h.ab_start as isize, (h.ab_start + h.ab_len) as isize);
                bd[0] = bd[0].min(s);
                bd[1] = bd[1].max(e);
                bd[2] = bd[2].min(os);
                bd[3] = bd[3].max(oe);
            }
            let rs = region_start as isize;
            let re = region_end as isize;
            let a_start = ba[0] + (rs - ba[2]);
            let a_end = ba[1] + (re - ba[3]);
            let b_start = bb[0] + (rs - bb[2]);
            let b_end = bb[1] + (re - bb[3]);
            results.push(Region::Unstable { a: js_slice(a, a_start, a_end), o: o[region_start..region_end].to_vec(), b: js_slice(b, b_start, b_end) });
        }
        curr = region_end;
    }
    advance(o.len(), &mut curr, &mut results);
    results
}

/// `Array#slice(start, end)` with negative-index semantics.
fn js_slice(v: &[String], start: isize, end: isize) -> Vec<String> {
    let len = v.len() as isize;
    let norm = |x: isize| if x < 0 { (len + x).max(0) } else { x.min(len) };
    let (s, e) = (norm(start), norm(end));
    if s >= e {
        return Vec::new();
    }
    v[s as usize..e as usize].to_vec()
}

pub struct Labels<'a> {
    pub a: &'a str,
    pub o: &'a str,
    pub b: &'a str,
}

/// `mergeDiff3(a, o, b, {excludeFalseConflicts: true, label})`.
pub fn merge_diff3(a: &[String], o: &[String], b: &[String], label: &Labels) -> (bool, Vec<String>) {
    let mark = |p: &str, l: &str| if l.is_empty() { p.to_string() } else { format!("{p} {l}") };
    let a_sec = mark("<<<<<<<", label.a);
    let o_sec = mark("|||||||", label.o);
    let b_sec = mark(">>>>>>>", label.b);
    let mut conflict = false;
    let mut result = Vec::new();
    for r in diff3_merge_regions(a, o, b) {
        match r {
            Region::Stable(c) => result.extend(c),
            Region::Unstable { a: ac, o: oc, b: bc } => {
                if ac == bc {
                    result.extend(ac);
                } else {
                    conflict = true;
                    result.push(a_sec.clone());
                    result.extend(ac);
                    result.push(o_sec.clone());
                    result.extend(oc);
                    result.push("=======".into());
                    result.extend(bc);
                    result.push(b_sec.clone());
                }
            }
        }
    }
    (conflict, result)
}
