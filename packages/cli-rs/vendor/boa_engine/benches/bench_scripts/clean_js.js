!function () {
	var M = new Array();
	for (i = 0; i < 100; i++) {
		M.push(Math.floor(Math.random() * 100));
	}
	var test = [];
	for (i = 0; i < 100; i++) {
		if (M[i] > 50) {
			test.push(M[i]);
		}
	}
	test.forEach(elem => {
        0
    });
}();
