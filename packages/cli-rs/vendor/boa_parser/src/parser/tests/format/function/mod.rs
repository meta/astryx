use crate::parser::tests::format::test_formatting;

mod class;

#[test]
fn function() {
    test_formatting(
        r#"
        function func(a, b) {
            console.log(a);
        }
        function func_2(a, b) {}
        pass_func(function(a, b) {
            console.log("in callback", a);
        });
        pass_func(function(a, b) {});
        "#,
    );
}

#[test]
fn arrow() {
    test_formatting(
        r#"
        let arrow_func = (a, b) => {
            console.log("in multi statement arrow");
            console.log(b);
        };
        let arrow_func_2 = (a, b) => {};
        "#,
    );
}

#[test]
fn r#async() {
    test_formatting(
        r#"
            async function async_func(a, b) {
                console.log(a);
            }
            async function async_func_2(a, b) {}
            pass_async_func(async function(a, b) {
                console.log("in async callback", a);
            });
            pass_async_func(async function(a, b) {});
            "#,
    );
}
