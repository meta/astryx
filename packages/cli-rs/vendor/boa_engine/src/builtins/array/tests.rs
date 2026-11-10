use super::Array;
use crate::{
    Context, JsNativeErrorKind, JsValue, TestAction, builtins::Number, js_string, run_test_actions,
};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn is_array() {
    run_test_actions([
        TestAction::assert("Array.isArray([])"),
        TestAction::assert("Array.isArray(new Array())"),
        TestAction::assert("Array.isArray(['a', 'b', 'c'])"),
        TestAction::assert("Array.isArray([1, 2, 3])"),
        TestAction::assert("!Array.isArray({})"),
        TestAction::assert("Array.isArray(new Array)"),
        TestAction::assert("!Array.isArray()"),
        TestAction::assert("!Array.isArray({ constructor: Array })"),
        TestAction::assert(
            "!Array.isArray({ push: Array.prototype.push, concat: Array.prototype.concat })",
        ),
        TestAction::assert("!Array.isArray(17)"),
        TestAction::assert("!Array.isArray({ __proto__: Array.prototype })"),
        TestAction::assert("!Array.isArray({ length: 0 })"),
    ]);
}

#[test]
fn of() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("arrayEquals(Array.of(1, 2, 3), [1, 2, 3])"),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                Array.of(1, 'a', [], undefined, null),
                [1, 'a', [], undefined, null]
            )
            "#}),
        TestAction::assert("arrayEquals(Array.of(), [])"),
        TestAction::run("let a = Array.of.call(Date, 'a', undefined, 3);"),
        TestAction::assert("a instanceof Date"),
        TestAction::assert_eq("a[0]", js_str!("a")),
        TestAction::assert_eq("a[1]", JsValue::undefined()),
        TestAction::assert_eq("a[2]", 3),
        TestAction::assert_eq("a.length", 3),
    ]);
}

#[test]
fn concat() {
    run_test_actions([
        TestAction::run_harness(),
        // Empty ++ Empty
        TestAction::assert("arrayEquals([].concat([]), [])"),
        // Empty ++ NonEmpty
        TestAction::assert("arrayEquals([].concat([1]), [1])"),
        // NonEmpty ++ Empty
        TestAction::assert("arrayEquals([1].concat([]), [1])"),
        // NonEmpty ++ NonEmpty
        TestAction::assert("arrayEquals([1].concat([1]), [1, 1])"),
    ]);
}

#[test]
fn copy_within() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("arrayEquals([1,2,3,4,5].copyWithin(-2), [1,2,3,1,2])"),
        TestAction::assert("arrayEquals([1,2,3,4,5].copyWithin(0, 3), [4,5,3,4,5])"),
        TestAction::assert("arrayEquals([1,2,3,4,5].copyWithin(0, 3, 4), [4,2,3,4,5])"),
        TestAction::assert("arrayEquals([1,2,3,4,5].copyWithin(-2, -3, -1), [1,2,3,3,4])"),
    ]);
}

#[test]
fn join() {
    run_test_actions([
        TestAction::assert_eq("[].join('.')", js_string!()),
        TestAction::assert_eq("['a'].join('.')", js_str!("a")),
        TestAction::assert_eq("['a', 'b', 'c'].join('.')", js_str!("a.b.c")),
        TestAction::assert_eq("let a=[];a[0]=a;a[1]=a;a[2]=a;a.join()", js_str!(",,")),
    ]);
}

#[test]
fn to_string() {
    run_test_actions([
        TestAction::assert_eq("[].toString()", js_string!()),
        TestAction::assert_eq("['a'].toString()", js_str!("a")),
        TestAction::assert_eq("['a', 'b', 'c'].toString()", js_str!("a,b,c")),
    ]);
}

#[test]
fn every() {
    // taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every
    run_test_actions([
        TestAction::run(indoc! {r#"
                function appendingCallback(elem,index,arr) {
                    arr.push('new');
                    return elem !== "new";
                }
                function deletingCallback(elem,index,arr) {
                    arr.pop()
                    return elem < 3;
                }
            "#}),
        TestAction::assert("[11, 23, 45].every(e => e > 10)"),
        TestAction::assert("[].every(e => e < 10)"),
        TestAction::assert("![11, 23, 45].every(e => e < 10)"),
        TestAction::assert("[1,2,3,4].every(appendingCallback)"),
        TestAction::assert("[1,2,3,4].every(deletingCallback)"),
    ]);
}

#[test]
fn find() {
    run_test_actions([TestAction::assert_eq(
        "['a', 'b', 'c'].find(e => e == 'a')",
        js_str!("a"),
    )]);
}

#[test]
fn find_index() {
    run_test_actions([
        TestAction::assert_eq("[1, 2, 3].findIndex(e => e == 2)", 1),
        TestAction::assert_eq("[].findIndex(e => e == 2)", -1),
        TestAction::assert_eq("[4, 5, 6].findIndex(e => e == 2)", -1),
    ]);
}

#[test]
fn flat() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("arrayEquals( [[]].flat(), [] )"),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ['a', ['b', 'c']].flat(),
                    ['a', 'b', 'c']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ['a', ['b', ['c'], 'd']].flat(2),
                    ['a', 'b', 'c', 'd']
                )
            "#}),
        TestAction::assert("arrayEquals( [[[[[['a']]]]]].flat(Infinity), ['a'] )"),
    ]);
}

#[test]
fn flat_map() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    [1, 2, 3].flatMap(i => [i * 2]),
                    [2, 4, 6]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ["it's Sunny", "in Cali"].flatMap(x => x.split(" ")),
                    ["it's", "Sunny", "in", "Cali"]
                )
            "#}),
    ]);
}

#[test]
fn flat_map_with_hole() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                var arr = [0, 1, 2];
                delete arr[1];
                arrayEquals(
                    arr.flatMap(i => [i * 2]),
                    [0, 4]
                )
            "#}),
    ]);
}

#[test]
fn flat_map_not_callable() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            var array = [1,2,3];
            array.flatMap("not a function");
        "#},
        JsNativeErrorKind::Type,
        "flatMap mapper function is not callable",
    )]);
}

#[test]
fn push() {
    run_test_actions([
        TestAction::run("var arr = [1, 2];"),
        TestAction::assert_eq("arr.push()", 2),
        TestAction::assert_eq("arr.push(3, 4)", 4),
        TestAction::assert_eq("arr[2]", 3),
        TestAction::assert_eq("arr[3]", 4),
    ]);
}

#[test]
fn pop() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var one = [1];
                var many = [1, 2, 3, 4];
            "#}),
        TestAction::assert_eq("[].pop()", JsValue::undefined()),
        TestAction::assert_eq("one.pop()", 1),
        TestAction::assert("arrayEquals(one, [])"),
        TestAction::assert_eq("many.pop()", 4),
        TestAction::assert("arrayEquals(many, [1, 2, 3])"),
    ]);
}

#[test]
fn shift() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var one = [1];
                var many = [1, 2, 3, 4];
            "#}),
        TestAction::assert_eq("[].shift()", JsValue::undefined()),
        TestAction::assert_eq("one.shift()", 1),
        TestAction::assert("arrayEquals(one, [])"),
        TestAction::assert_eq("many.shift()", 1),
        TestAction::assert("arrayEquals(many, [2, 3, 4])"),
    ]);
}

#[test]
fn unshift() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("var arr = [3, 4];"),
        TestAction::assert_eq("arr.unshift()", 2),
        TestAction::assert_eq("arr.unshift(1, 2)", 4),
        TestAction::assert("arrayEquals(arr, [1, 2, 3, 4])"),
    ]);
}

#[test]
fn reverse() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("var arr = [1, 2];"),
        TestAction::assert("arrayEquals(arr.reverse(), [2, 1])"),
        TestAction::assert("arrayEquals(arr, [2, 1])"),
    ]);
}

#[test]
fn index_of() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var one = ["a"];
                var many = ["a", "b", "c"];
                var duplicates = ["a", "b", "c", "a", "b"];
            "#}),
        // Empty
        TestAction::assert_eq("[].indexOf('a')", -1),
        // One
        TestAction::assert_eq("one.indexOf('a')", 0),
        // Missing from one
        TestAction::assert_eq("one.indexOf('b')", -1),
        // First in many
        TestAction::assert_eq("many.indexOf('a')", 0),
        // Second in many
        TestAction::assert_eq("many.indexOf('b')", 1),
        // First in duplicates
        TestAction::assert_eq("duplicates.indexOf('a')", 0),
        // Second in duplicates
        TestAction::assert_eq("duplicates.indexOf('b')", 1),
        // Positive fromIndex greater than array length
        TestAction::assert_eq("one.indexOf('a', 2)", -1),
        // Positive fromIndex missed match
        TestAction::assert_eq("many.indexOf('a', 1)", -1),
        // Positive fromIndex matched
        TestAction::assert_eq("many.indexOf('b', 1)", 1),
        // Positive fromIndex with duplicates
        TestAction::assert_eq("duplicates.indexOf('a', 1)", 3),
        // Negative fromIndex greater than array length
        TestAction::assert_eq("one.indexOf('a', -2)", 0),
        // Negative fromIndex missed match
        TestAction::assert_eq("many.indexOf('b', -1)", -1),
        // Negative fromIndex matched
        TestAction::assert_eq("many.indexOf('c', -1)", 2),
        // Negative fromIndex with duplicates
        TestAction::assert_eq("duplicates.indexOf('b', -2)", 4),
    ]);
}

#[test]
fn last_index_of() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var one = ["a"];
                var many = ["a", "b", "c"];
                var duplicates = ["a", "b", "c", "a", "b"];
            "#}),
        // Empty
        TestAction::assert_eq("[].lastIndexOf('a')", -1),
        // One
        TestAction::assert_eq("one.lastIndexOf('a')", 0),
        // Missing from one
        TestAction::assert_eq("one.lastIndexOf('b')", -1),
        // First in many
        TestAction::assert_eq("many.lastIndexOf('a')", 0),
        // Second in many
        TestAction::assert_eq("many.lastIndexOf('b')", 1),
        // 4th in duplicates
        TestAction::assert_eq("duplicates.lastIndexOf('a')", 3),
        // 5th in duplicates
        TestAction::assert_eq("duplicates.lastIndexOf('b')", 4),
        // Positive fromIndex greater than array length
        TestAction::assert_eq("one.lastIndexOf('a', 2)", 0),
        // Positive fromIndex missed match
        TestAction::assert_eq("many.lastIndexOf('c', 1)", -1),
        // Positive fromIndex matched
        TestAction::assert_eq("many.lastIndexOf('b', 1)", 1),
        // Positive fromIndex with duplicates
        TestAction::assert_eq("duplicates.lastIndexOf('a', 1)", 0),
        // Negative fromIndex greater than array length
        TestAction::assert_eq("one.lastIndexOf('a', -2)", -1),
        // Negative fromIndex missed match
        TestAction::assert_eq("many.lastIndexOf('c', -2)", -1),
        // Negative fromIndex matched
        TestAction::assert_eq("many.lastIndexOf('c', -1)", 2),
        // Negative fromIndex with duplicates
        TestAction::assert_eq("duplicates.lastIndexOf('b', -2)", 1),
    ]);
}

#[test]
fn fill_obj_ref() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let obj = {};
                let a = new Array(3).fill(obj);
                obj.hi = 'hi'
            "#}),
        TestAction::assert_eq("a[2].hi", js_str!("hi")),
    ]);
}

#[test]
fn fill() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("var a = [1, 2, 3];"),
        TestAction::assert("arrayEquals(a.fill(4), [4, 4, 4])"),
        // make sure the array is modified
        TestAction::assert("arrayEquals(a, [4, 4, 4])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, '1'), [1, 4, 4])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 1, 2), [1, 4, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 1, 1), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 3, 3), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, -3, -2), [4, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, NaN, NaN), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 3, 5), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, '1.2', '2.5'), [1, 4, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 'str'), [4, 4, 4])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, 'str', 'str'), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, undefined, null), [1, 2, 3])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(4, undefined, undefined), [4, 4, 4])"),
        TestAction::assert("arrayEquals([1, 2, 3].fill(), [undefined, undefined, undefined])"),
    ]);
}

#[test]
fn includes_value() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var one = ["a"];
                var many = ["a", "b", "c"];
                var duplicates = ["a", "b", "c", "a", "b"];
            "#}),
        // Empty
        TestAction::assert("![].includes('a')"),
        // One
        TestAction::assert("one.includes('a')"),
        // Missing from one
        TestAction::assert("!one.includes('b')"),
        // In many
        TestAction::assert("many.includes('b')"),
        // Missing from many
        TestAction::assert("!many.includes('d')"),
        // In duplicates
        TestAction::assert("duplicates.includes('a')"),
        // Missing from duplicates
        TestAction::assert("!duplicates.includes('d')"),
    ]);
}

#[test]
fn map() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var one = ["x"];
                var many = ["x", "y", "z"];
            "#}),
        // Empty
        TestAction::assert("arrayEquals([].map(v => v + '_'), [])"),
        // One
        TestAction::assert("arrayEquals(one.map(v => '_' + v), ['_x'])"),
        // Many
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    many.map(v => '_' + v + '_'),
                    ['_x_', '_y_', '_z_']
                )
            "#}),
        // assert the old arrays have not been modified
        TestAction::assert("arrayEquals(one, ['x'])"),
        TestAction::assert("arrayEquals(many, ['x', 'y', 'z'])"),
        // One but it uses `this` inside the callback
        TestAction::assert(indoc! {r#"
                var _this = { answer: 42 };

                function callback() {
                    return 'The answer to life is: ' + this.answer;
                }

                arrayEquals(
                    one.map(callback, _this),
                    ['The answer to life is: 42']
                )
            "#}),
    ]);
}

#[test]
fn slice() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("arrayEquals([].slice(), [])"),
        TestAction::assert("arrayEquals(['a'].slice(), ['a'])"),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ["a", "b", "c", "d"].slice(1),
                    ["b", "c", "d"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ["a", "b", "c", "d"].slice(2, 3),
                    ["c"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ["a", "b", "c", "d"].slice(7),
                    []
                )
            "#}),
    ]);
}

#[test]
fn for_each() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var sum = 0;
                var indexSum = 0;
                var listLengthSum = 0;
                function callingCallback(item, index, list) {
                    sum += item;
                    indexSum += index;
                    listLengthSum += list.length;
                }
                [2, 3, 4, 5].forEach(callingCallback);
            "#}),
        TestAction::assert_eq("sum", 14),
        TestAction::assert_eq("indexSum", 6),
        TestAction::assert_eq("listLengthSum", 16),
    ]);
}

#[test]
fn for_each_push_value() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var a = [1, 2, 3, 4];
                a.forEach((item, index, list) => list.push(item * 2));
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    a,
                    [1, 2, 3, 4, 2, 4, 6, 8]
                )
            "#}),
    ]);
}

#[test]
fn filter() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("var empty = [], one = ['1'], many = ['1', '0', '1'];"),
        // Empty
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    empty.filter(v => v === "1"),
                    []
                )
            "#}),
        // One filtered on "1"
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    one.filter(v => v === "1"),
                    ["1"]
                )
            "#}),
        //  One filtered on "0"
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    one.filter(v => v === "0"),
                    []
                )
            "#}),
        // Many filtered on "1"
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    many.filter(v => v === "1"),
                    ["1", "1"]
                )
            "#}),
        //  Many filtered on "0"
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    many.filter(v => v === "0"),
                    ["0"]
                )
            "#}),
        // assert the old arrays have not been modified
        TestAction::assert("arrayEquals(one, ['1'])"),
        TestAction::assert("arrayEquals(many, ['1', '0', '1'])"),
    ]);
}

#[test]
fn some() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("var array = [11, 23, 45];"),
        TestAction::assert("!array.some(e => e < 10)"),
        TestAction::assert("![].some(e => e < 10)"),
        TestAction::assert("array.some(e => e > 10)"),
        TestAction::assert(indoc! {r#"
                // Cases where callback mutates the array.
                var appendArray = [1,2,3,4];
                function appendingCallback(elem, index, arr) {
                    arr.push('new');
                    return elem !== "new";
                }

                appendArray.some(appendingCallback)
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    appendArray,
                    [1, 2, 3, 4, "new"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                var delArray = [1,2,3,4];
                function deletingCallback(elem,index,arr) {
                    arr.pop()
                    return elem < 3;
                }

                delArray.some(deletingCallback)
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    delArray,
                    [1, 2, 3]
                )
            "#}),
    ]);
}

#[test]
fn reduce() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var arr = [1, 2, 3, 4];
                function add(acc, x) {
                    return acc + x;
                }

                function addIdx(acc, _, idx) {
                    return acc + idx;
                }

                function addLen(acc, _x, _idx, arr) {
                    return acc + arr.length;
                }

                function addResize(acc, x, idx, arr) {
                    if(idx == 0) {
                        arr.length = 3;
                    }
                    return acc + x;
                }
                var delArray = [1, 2, 3, 4, 5];
                delete delArray[0];
                delete delArray[1];
                delete delArray[3];

            "#}),
        // empty array
        TestAction::assert_eq("[].reduce(add, 0)", 0),
        // simple with initial value
        TestAction::assert_eq("arr.reduce(add, 0)", 10),
        // without initial value
        TestAction::assert_eq("arr.reduce(add)", 10),
        // with some items missing
        TestAction::assert_eq("delArray.reduce(add, 0)", 8),
        // with index
        TestAction::assert_eq("arr.reduce(addIdx, 0)", 6),
        // with array
        TestAction::assert_eq("arr.reduce(addLen, 0)", 16),
        // resizing the array as reduce progresses
        TestAction::assert_eq("arr.reduce(addResize, 0)", 6),
        // Empty array
        TestAction::assert_native_error(
            "[].reduce((acc, x) => acc + x);",
            JsNativeErrorKind::Type,
            "Array.prototype.reduce: called on an empty array and with no initial value",
        ),
        // Array with no defined elements
        TestAction::assert_native_error(
            indoc! {r#"
                var deleteArr = [0, 1];
                delete deleteArr[0];
                delete deleteArr[1];
                deleteArr.reduce((acc, x) => acc + x);
            "#},
            JsNativeErrorKind::Type,
            "Array.prototype.reduce: called on an empty array and with no initial value",
        ),
        // No callback
        TestAction::assert_native_error(
            indoc! {r#"
                var someArr = [0, 1];
                someArr.reduce('');
            "#},
            JsNativeErrorKind::Type,
            "Array.prototype.reduce: callback function is not callable",
        ),
    ]);
}

#[test]
fn reduce_right() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var arr = [1, 2, 3, 4];
                function sub(acc, x) {
                    return acc - x;
                }

                function subIdx(acc, _, idx) {
                    return acc - idx;
                }

                function subLen(acc, _x, _idx, arr) {
                    return acc - arr.length;
                }

                function subResize(acc, x, idx, arr) {
                    if(idx == arr.length - 1) {
                        arr.length = 1;
                    }
                    return acc - x;
                }
                function subResize0(acc, x, idx, arr) {
                    if(idx == arr.length - 2) {
                        arr.length = 0;
                    }
                    return acc - x;
                }
                var delArray = [1, 2, 3, 4, 5];
                delete delArray[0];
                delete delArray[1];
                delete delArray[3];
            "#}),
        // empty array
        TestAction::assert_eq("[].reduceRight(sub, 0)", 0),
        // simple with initial value
        TestAction::assert_eq("arr.reduceRight(sub, 0)", -10),
        // without initial value
        TestAction::assert_eq("arr.reduceRight(sub)", -2),
        // with some items missing
        TestAction::assert_eq("delArray.reduceRight(sub, 0)", -8),
        // with index
        TestAction::assert_eq("arr.reduceRight(subIdx)", 1),
        // with array
        TestAction::assert_eq("arr.reduceRight(subLen)", -8),
        // resizing the array as reduce progresses
        TestAction::assert_eq("arr.reduceRight(subResize, 0)", -5),
        // reset array
        TestAction::run("arr = [1, 2, 3, 4];"),
        // resizing the array to 0 as reduce progresses
        TestAction::assert_eq("arr.reduceRight(subResize0, 0)", -7),
        // Empty array
        TestAction::assert_native_error(
            "[].reduceRight((acc, x) => acc + x);",
            JsNativeErrorKind::Type,
            "Array.prototype.reduceRight: called on an empty array and with no initial value",
        ),
        // Array with no defined elements
        TestAction::assert_native_error(
            indoc! {r#"
                var deleteArr = [0, 1];
                delete deleteArr[0];
                delete deleteArr[1];
                deleteArr.reduceRight((acc, x) => acc + x);
            "#},
            JsNativeErrorKind::Type,
            "Array.prototype.reduceRight: called on an empty array and with no initial value",
        ),
        // No callback
        TestAction::assert_native_error(
            indoc! {r#"
                var otherArr = [0, 1];
                otherArr.reduceRight("");
            "#},
            JsNativeErrorKind::Type,
            "Array.prototype.reduceRight: callback function is not callable",
        ),
    ]);
}

#[test]
fn call_array_constructor_with_one_argument() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("arrayEquals(new Array(0), [])"),
        TestAction::assert("arrayEquals(new Array(5), [,,,,,])"),
        TestAction::assert("arrayEquals(new Array('Hello, world!'), ['Hello, world!'])"),
    ]);
}

#[test]
fn array_values_simple() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from([1, 2, 3].values()),
                    [1, 2, 3]
                )
            "#}),
    ]);
}

#[test]
fn array_keys_simple() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from([1, 2, 3].keys()),
                    [0, 1, 2]
                )
            "#}),
    ]);
}

#[test]
fn array_entries_simple() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from([1, 2, 3].entries()),
                    [
                        [0, 1],
                        [1, 2],
                        [2, 3]
                    ]
                )
            "#}),
    ]);
}

#[test]
fn array_values_empty() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from([].values()),
                    []
                )
            "#}),
    ]);
}

#[test]
fn array_values_sparse() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                var array = Array();
                array[3] = 5;
                arrayEquals(
                    Array.from(array.values()),
                    [undefined, undefined, undefined, 5]
                )
            "#}),
    ]);
}

#[test]
fn array_symbol_iterator() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from([1, 2, 3][Symbol.iterator]()),
                    [1, 2, 3]
                )
            "#}),
    ]);
}

#[test]
fn array_values_symbol_iterator() {
    run_test_actions([TestAction::assert(indoc! {r#"
                var iterator = [1, 2, 3].values();
                iterator === iterator[Symbol.iterator]();
            "#})]);
}

#[test]
fn array_spread_arrays() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    [1, ...[2, 3]],
                    [1, 2, 3]
                )
            "#}),
    ]);
}

#[test]
fn array_spread_non_iterable() {
    run_test_actions([TestAction::assert_native_error(
        "const array2 = [...5];",
        JsNativeErrorKind::Type,
        "value with type `number` is not iterable",
    )]);
}

#[test]
fn get_relative_start() {
    #[track_caller]
    fn assert(context: &mut Context, arg: Option<&JsValue>, len: u64, expected: u64) {
        const UNDEFINED: &JsValue = &JsValue::undefined();
        let arg = arg.unwrap_or(UNDEFINED);
        assert_eq!(
            Array::get_relative_start(context, arg, len).unwrap(),
            expected
        );
    }
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert(ctx, None, 10, 0);
        assert(ctx, Some(&JsValue::undefined()), 10, 0);
        assert(ctx, Some(&JsValue::new(f64::NEG_INFINITY)), 10, 0);
        assert(ctx, Some(&JsValue::new(f64::INFINITY)), 10, 10);
        assert(ctx, Some(&JsValue::new(-1)), 10, 9);
        assert(ctx, Some(&JsValue::new(1)), 10, 1);
        assert(ctx, Some(&JsValue::new(-11)), 10, 0);
        assert(ctx, Some(&JsValue::new(11)), 10, 10);
        assert(ctx, Some(&JsValue::new(f64::MIN)), 10, 0);
        assert(ctx, Some(&JsValue::new(Number::MIN_SAFE_INTEGER)), 10, 0);
        assert(ctx, Some(&JsValue::new(f64::MAX)), 10, 10);
        // This test is relevant only on 32-bit archs (where usize == u32 thus `len` is u32)
        assert(ctx, Some(&JsValue::new(Number::MAX_SAFE_INTEGER)), 10, 10);
    })]);
}

#[test]
fn get_relative_end() {
    #[track_caller]
    fn assert(context: &mut Context, arg: Option<&JsValue>, len: u64, expected: u64) {
        const UNDEFINED: &JsValue = &JsValue::undefined();
        let arg = arg.unwrap_or(UNDEFINED);
        assert_eq!(
            Array::get_relative_end(context, arg, len).unwrap(),
            expected
        );
    }
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert(ctx, None, 10, 10);
        assert(ctx, Some(&JsValue::undefined()), 10, 10);
        assert(ctx, Some(&JsValue::new(f64::NEG_INFINITY)), 10, 0);
        assert(ctx, Some(&JsValue::new(f64::INFINITY)), 10, 10);
        assert(ctx, Some(&JsValue::new(-1)), 10, 9);
        assert(ctx, Some(&JsValue::new(1)), 10, 1);
        assert(ctx, Some(&JsValue::new(-11)), 10, 0);
        assert(ctx, Some(&JsValue::new(11)), 10, 10);
        assert(ctx, Some(&JsValue::new(f64::MIN)), 10, 0);
        assert(ctx, Some(&JsValue::new(Number::MIN_SAFE_INTEGER)), 10, 0);
        assert(ctx, Some(&JsValue::new(f64::MAX)), 10, 10);
        // This test is relevant only on 32-bit archs (where usize == u32 thus `len` is u32)
        assert(ctx, Some(&JsValue::new(Number::MAX_SAFE_INTEGER)), 10, 10);
    })]);
}

#[test]
fn array_length_is_not_enumerable() {
    run_test_actions([TestAction::assert(
        "!Object.getOwnPropertyDescriptor([], 'length').enumerable",
    )]);
}

#[test]
fn array_sort() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run("let arr = ['80', '9', '700', 40, 1, 5, 200];"),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    arr.sort(),
                    [1, 200, 40, 5, "700", "80", "9"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    arr.sort((a, b) => a - b),
                    [1, 5, "9", 40, "80", 200, "700"]
                )
            "#}),
    ]);
}

#[test]
fn array_of_neg_zero() {
    run_test_actions([
        TestAction::run("let arr = [-0, -0, -0, -0];"),
        // Assert the parity of all items of the list.
        TestAction::assert("arr.every(x => (1/x) === -Infinity)"),
    ]);
}

#[test]
fn array_prototype_find_edge_cases() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert("[].find(x => x === 1) === undefined"),
        TestAction::assert("[1, 2, 3].find(x => x === 99) === undefined"),
        TestAction::assert("[1, 2, 1].find(x => x === 1) === 1"),
        TestAction::assert(indoc! {r#"
            var obj = { name: "Alice" };
            [obj].find(x => x.name === "Alice") === obj
        "#}),
        TestAction::assert(indoc! {r#"
            var idx = -1;
            [10, 20, 30].find((v, i) => { idx = i; return v === 20; });
            idx === 1
        "#}),
        TestAction::assert(indoc! {r#"
            let arr = [1, , 3];
            arr.find(x => x === undefined) === undefined
        "#}),
    ]);
}
