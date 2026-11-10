use crate::parser::tests::format::test_formatting;

#[test]
fn binding_pattern() {
    test_formatting(
        r#"
        var { } = {
            o: "1",
        };
        var { o_v1 } = {
            o_v1: "1",
        };
        var { o_v2 = "1" } = {
            o_v2: "2",
        };
        var { a : o_v3 = "1" } = {
            a: "2",
        };
        var { ... o_rest_v1 } = {
            a: "2",
        };
        var { o_v4, o_v5, o_v6 = "1", a : o_v7 = "1", ... o_rest_v2 } = {
            o_v4: "1",
            o_v5: "1",
        };
        var [] = [];
        var [ , ] = [];
        var [ a_v1 ] = [1, 2, 3];
        var [ a_v2, a_v3 ] = [1, 2, 3];
        var [ a_v2, , a_v3 ] = [1, 2, 3];
        var [ ... a_rest_v1 ] = [1, 2, 3];
        var [ a_v4, , ... a_rest_v2 ] = [1, 2, 3];
        var [ { a_v5 } ] = [{
            a_v5: 1,
        }, {
            a_v5: 2,
        }, {
            a_v5: 3,
        }];
        "#,
    );
}
