use crate::parser::tests::format::test_formatting;

#[test]
fn block() {
    test_formatting(
        r#"
        {
            let a = function_call();
            console.log("hello");
        }
        another_statement();
        "#,
    );
    // TODO: Once block labels are implemented, this should be tested:
    // super::super::test_formatting(
    //     r#"
    //     block_name: {
    //         let a = function_call();
    //         console.log("hello");
    //     }
    //     another_statement();
    //     "#,
    // );
}

#[test]
fn r#if() {
    test_formatting(
        r#"
        let a = true ? 5 : 6;
        if (false) {
            a = 10;
        } else {
            a = 20;
        }
        "#,
    );
}

#[test]
fn r#return() {
    test_formatting(
        r#"
        function say_hello(msg) {
            if (msg === "") {
                return 0;
            }
            console.log("hello " + msg);
            return;
        }
        say_hello("");
        say_hello("world");
        "#,
    );
}

#[test]
fn throw() {
    test_formatting(
        r#"
        try {
            throw "hello";
        } catch(e) {
            console.log(e);
        }
        "#,
    );
}

#[test]
fn r#try() {
    test_formatting(
        r#"
        try {
            throw "hello";
        } catch(e) {
            console.log(e);
        } finally {
            console.log("things");
        }
        try {
            throw "hello";
        } catch {
            console.log("something went wrong");
        }
        "#,
    );
}

#[test]
fn switch() {
    test_formatting(
        r#"
        let a = 3;
        let b = "unknown";
        switch (a) {
            case 0:
                b = "Mon";
                break;
            case 1:
                b = "Tue";
                break;
            case 2:
                b = "Wed";
                break;
            case 3:
                b = "Thurs";
                break;
            case 4:
                b = "Fri";
                break;
            case 5:
                b = "Sat";
                break;
            case 6:
                b = "Sun";
                break;
            default:
                b = "Unknown";
        }
        b;
        "#,
    );
}

#[test]
fn with() {
    test_formatting(
        r#"
        with (this) {
            {
            }
        }
        "#,
    );
}
