use crate::{JsNativeErrorKind, TestAction, run_test_actions};
use indoc::indoc;

#[test]
fn construct() {
    run_test_actions([
        TestAction::assert_eq("(new Set()).size", 0),
        TestAction::assert_eq("(new Set(['one', 'two'])).size", 2),
    ]);
}

#[test]
fn clone() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let original = new Set(["one", "two"]);
                let clone = new Set(original);
            "#}),
        TestAction::assert_eq("clone.size", 2),
        TestAction::assert_eq(
            indoc! {r#"
                original.add("three");
                original.size
            "#},
            3,
        ),
        TestAction::assert_eq("clone.size", 2),
    ]);
}

#[test]
fn symbol_iterator() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                const set1 = new Set();
                set1.add('foo');
                set1.add('bar');
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from(set1[Symbol.iterator]()),
                    ["foo", "bar"]
                )
            "#}),
    ]);
}

#[test]
fn entries() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                const set1 = new Set();
                set1.add('foo');
                set1.add('bar')
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from(set1.entries()),
                    [["foo", "foo"], ["bar", "bar"]]
                )
            "#}),
    ]);
}

#[test]
fn merge() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let first = new Set(["one", "two"]);
                let second = new Set(["three", "four"]);
                let third = new Set(["four", "five"]);
                let merged1 = new Set([...first, ...second]);
                let merged2 = new Set([...second, ...third]);
            "#}),
        TestAction::assert_eq("merged1.size", 4),
        TestAction::assert_eq("merged2.size", 3),
    ]);
}

#[test]
fn clear() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let set = new Set(["one", "two"]);
            set.clear();
        "#}),
        TestAction::assert_eq("set.size", 0),
    ]);
}

#[test]
fn delete() {
    run_test_actions([
        TestAction::run("let set = new Set(['one', 'two'])"),
        TestAction::assert("set.delete('one')"),
        TestAction::assert_eq("set.size", 1),
        TestAction::assert("!set.delete('one')"),
    ]);
}

#[test]
fn has() {
    run_test_actions([
        TestAction::run("let set = new Set(['one', 'two']);"),
        TestAction::assert("set.has('one')"),
        TestAction::assert("set.has('two')"),
        TestAction::assert("!set.has('three')"),
        TestAction::assert("!set.has()"),
    ]);
}

#[test]
fn values_and_keys() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                const set1 = new Set();
                set1.add('foo');
                set1.add('bar');
            "#}),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                Array.from(set1.values()),
                ["foo", "bar"]
            )
        "#}),
        TestAction::assert("set1.values == set1.keys"),
    ]);
}

#[test]
fn for_each() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let set = new Set([5, 10, 15]);
                let value1Sum = 0;
                let value2Sum = 0;
                let sizeSum = 0;
                function callingCallback(value1, value2, set) {
                    value1Sum += value1;
                    value2Sum += value2;
                    sizeSum += set.size;
                }
                set.forEach(callingCallback);
            "#}),
        TestAction::assert_eq("value1Sum", 30),
        TestAction::assert_eq("value2Sum", 30),
        TestAction::assert_eq("sizeSum", 9),
    ]);
}

#[test]
fn recursive_display() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let set = new Set();
                let array = new Array([set]);
                set.add(set);
            "#}),
        TestAction::assert_with_op("set", |v, _| v.display().to_string() == "Set { Set(1) }"),
        TestAction::assert_with_op("set.add(array)", |v, _| {
            v.display().to_string() == "Set { Set(2), Array(1) }"
        }),
    ]);
}

#[test]
fn not_a_function() {
    run_test_actions([TestAction::assert_native_error(
        "Set()",
        JsNativeErrorKind::Type,
        "calling a builtin Set constructor without new is forbidden",
    )]);
}

#[test]
fn difference() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 3, 5, 7, 9]);
            let setB = new Set([1, 4, 9]);
        "#}),
        TestAction::assert_with_op("setA.difference(setB)", |v, _| {
            v.display().to_string() == "Set { 3, 5, 7 }"
        }),
        TestAction::assert_with_op("setB.difference(setA)", |v, _| {
            v.display().to_string() == "Set { 4 }"
        }),
    ]);
}

#[test]
fn difference_equal_set() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 3, 5, 7, 9]);
            let setB = new Set([1, 4, 5, 7, 9]);
        "#}),
        TestAction::assert_with_op("setA.difference(setB)", |v, _| {
            v.display().to_string() == "Set { 3 }"
        }),
        TestAction::assert_with_op("setB.difference(setA)", |v, _| {
            v.display().to_string() == "Set { 4 }"
        }),
    ]);
}

#[test]
fn difference_empty() {
    run_test_actions([
        TestAction::run(indoc! {r#"
           let setA = new Set([1, 3, 5, 7, 9]);
           let setB = new Set([]);
        "#}),
        TestAction::assert_with_op("setA.difference(setB)", |v, _| {
            v.display().to_string() == "Set { 1, 3, 5, 7, 9 }"
        }),
        TestAction::assert_with_op("setB.difference(setA)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
    ]);
}

#[test]
fn intersection() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1,2,3]);
            let setB = new Set([1,4,3]);
            let setC = new Set([]);
            "#}),
        TestAction::assert_with_op("setA.intersection(setB)", |v, _| {
            v.display().to_string() == "Set { 1, 3 }"
        }),
        TestAction::assert_with_op("setB.intersection(setA)", |v, _| {
            v.display().to_string() == "Set { 1, 3 }"
        }),
        TestAction::assert_with_op("setA.intersection(setA)", |v, _| {
            v.display().to_string() == "Set { 1, 2, 3 }"
        }),
        TestAction::assert_with_op("setB.intersection(setB)", |v, _| {
            v.display().to_string() == "Set { 1, 4, 3 }"
        }),
        TestAction::assert_with_op("setB.intersection(setC)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
        TestAction::assert_with_op("setA.intersection(setC)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
    ]);
}

#[test]
fn is_dist_joint_from() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 2, 3]);
            let setB = new Set([1, 4, 6]);
            let setC = new Set([4, 8, 15, 16 ,23 ,42]);
            "#}),
        TestAction::assert_with_op("setA.isDisjointFrom(setB)", |v, _| {
            !v.as_boolean().unwrap_or(false)
        }),
        TestAction::assert_with_op("setA.isDisjointFrom(setC)", |v, _| {
            v.as_boolean().unwrap_or(true)
        }),
    ]);
}

#[test]
fn is_subset_of() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([4, 8, 15]);
            let setB = new Set([1, 4, 6]);
            let setC = new Set([4, 8, 15, 16 ,23 ,42]);
            let setD = new Set([16]);
            let setE = new Set([]);
            "#}),
        TestAction::assert_with_op("setA.isSubsetOf(setB)", |v, _| {
            !v.as_boolean().unwrap_or(false)
        }),
        TestAction::assert_with_op("setA.isSubsetOf(setC)", |v, _| {
            v.as_boolean().unwrap_or(true)
        }),
        TestAction::assert_with_op("setB.isSubsetOf(setC)", |v, _| {
            !v.as_boolean().unwrap_or(false)
        }),
        TestAction::assert_with_op("setC.isSubsetOf(setC)", |v, _| {
            v.as_boolean().unwrap_or(true)
        }),
        TestAction::assert_with_op("setD.isSubsetOf(setC)", |v, _| {
            v.as_boolean().unwrap_or(true)
        }),
        TestAction::assert_with_op("setE.isSubsetOf(setC)", |v, _| {
            v.as_boolean().unwrap_or(true)
        }),
        TestAction::assert_with_op("setA.isSubsetOf(setE)", |v, _| {
            !v.as_boolean().unwrap_or(false)
        }),
    ]);
}

#[test]
fn is_superset_of() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set(["JavaScript", "HTML", "CSS"]);
            let setB = new Set(["HTML", "CSS"]);
            "#}),
        TestAction::assert_with_op("setA.isSupersetOf(setB)", |v, _| {
            v.as_boolean().unwrap_or(false)
        }),
        TestAction::assert_with_op("setB.isSupersetOf(setA)", |v, _| {
            !v.as_boolean().unwrap_or(false)
        }),
    ]);
}

#[test]
fn symmetric_difference_different_sets_strings() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set(["JavaScript", "HTML", "CSS"]);
            let setB = new Set(["Python", "Java", "JavaScript", "PHP"]);
            "#}),
        TestAction::assert_with_op("setA.symmetricDifference(setB)", |v, _| {
            v.display().to_string() == "Set { \"HTML\", \"CSS\", \"Python\", \"Java\", \"PHP\" }"
        }),
        TestAction::assert_with_op("setB.symmetricDifference(setA)", |v, _| {
            v.display().to_string() == "Set { \"Python\", \"Java\", \"PHP\", \"HTML\", \"CSS\" }"
        }),
    ]);
}

#[test]
fn symmetric_difference_different_sets_numbers() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setC = new Set([2, 4, 6, 8]);
            let setD = new Set([1, 4, 9]);
            "#}),
        TestAction::assert_with_op("setC.symmetricDifference(setD)", |v, _| {
            v.display().to_string() == "Set { 2, 6, 8, 1, 9 }"
        }),
        TestAction::assert_with_op("setD.symmetricDifference(setC)", |v, _| {
            v.display().to_string() == "Set { 1, 9, 2, 6, 8 }"
        }),
    ]);
}

#[test]
fn symmetric_difference_same_set() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set(["JavaScript", "HTML", "CSS"]);
            let setACopy = setA;
        "#}),
        TestAction::assert_with_op("setA.symmetricDifference(setACopy)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
    ]);
}

// Alternative test that programmatically creates a new Set with the same content.
#[test]
fn symmetric_difference_with_identical_content() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set(["JavaScript", "HTML", "CSS"]);
            // Создаем функцию, которая вернет новый Set с тем же содержимым
            function getIdenticalSet() {
                return new Set(Array.from(setA));
            }
            "#}),
        // We use a function to get a new Set object with the same content.
        TestAction::assert_with_op("setA.symmetricDifference(getIdenticalSet())", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
    ]);
}

#[test]
fn union() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([2, 4, 6, 8]);
            let setB = new Set([1, 4, 9]);
            "#}),
        TestAction::assert_with_op("setA.union(setB)", |v, _| {
            v.display().to_string() == "Set { 2, 4, 6, 8, 1, 9 }"
        }),
        TestAction::assert_with_op("setB.union(setA)", |v, _| {
            v.display().to_string() == "Set { 1, 4, 9, 2, 6, 8 }"
        }),
    ]);
}

#[test]
fn union_same_set() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 4, 9]);
            "#}),
        TestAction::assert_with_op("setA.union(setA)", |v, _| {
            v.display().to_string() == "Set { 1, 4, 9 }"
        }),
    ]);
}

/// `Set.prototype.intersection` — happy-path: elements present in both sets.
#[test]
fn intersection_common_elements() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 2, 3, 4]);
            let setB = new Set([3, 4, 5, 6]);
        "#}),
        // Both directions must yield the same logical result (order follows `this`).
        TestAction::assert_with_op("setA.intersection(setB)", |v, _| {
            v.display().to_string() == "Set { 3, 4 }"
        }),
        TestAction::assert_with_op("setB.intersection(setA)", |v, _| {
            v.display().to_string() == "Set { 3, 4 }"
        }),
        // Intersecting a set with itself yields an identical set.
        TestAction::assert_with_op("setA.intersection(setA)", |v, _| {
            v.display().to_string() == "Set { 1, 2, 3, 4 }"
        }),
    ]);
}

/// `Set.prototype.intersection` — disjoint sets produce an empty result.
#[test]
fn intersection_no_common_elements() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let setA = new Set([1, 2, 3]);
            let setB = new Set([4, 5, 6]);
            let setEmpty = new Set([]);
        "#}),
        // Two sets with nothing in common.
        TestAction::assert_with_op("setA.intersection(setB)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
        // Intersection with an empty set is always empty.
        TestAction::assert_with_op("setA.intersection(setEmpty)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
        TestAction::assert_with_op("setEmpty.intersection(setA)", |v, _| {
            v.display().to_string() == "Set(0)"
        }),
    ]);
}

/// Set.prototype.intersection — this is not a Set → \
#[test]
fn intersection_this_not_a_set() {
    run_test_actions([TestAction::assert_native_error(
        "Set.prototype.intersection.call({}, new Set([1, 2, 3]))",
        JsNativeErrorKind::Type,
        "method `Set.prototype.intersection` called on incompatible receiver",
    )]);
}

/// Set.prototype.intersection — other is not a valid Set-like object → \
#[test]
fn intersection_other_not_set_like() {
    run_test_actions([
        // Primitive value — GetSetRecord rejects non-objects.
        TestAction::assert_native_error(
            "new Set([1, 2]).intersection(42)",
            JsNativeErrorKind::Type,
            "Set operation called with non-object argument",
        ),
        // Plain object whose `size` is `undefined` (NaN after ToNumber).
        TestAction::assert_native_error(
            "new Set([1, 2]).intersection({})",
            JsNativeErrorKind::Type,
            "size is undefined",
        ),
        // `has` is present but not callable.
        TestAction::assert_native_error(
            "new Set([1, 2]).intersection({ size: 0, has: 1, keys: () => [][Symbol.iterator]() })",
            JsNativeErrorKind::Type,
            "Set-like object must have a callable 'has' method",
        ),
        // `keys` is present but not callable.
        TestAction::assert_native_error(
            "new Set([1, 2]).intersection({ size: 0, has: () => false, keys: 1 })",
            JsNativeErrorKind::Type,
            "Set-like object must have a callable 'keys' method",
        ),
    ]);
}
