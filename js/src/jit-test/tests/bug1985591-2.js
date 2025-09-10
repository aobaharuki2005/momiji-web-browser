function test() {
    let o = new FakeDOMObject();
    o.foobar = 1;
}

// Fill up the deferred wrapper preservation buffer and
// trigger a nursery collection to make it work again
for (var i = 0; i < 8210; i++) {
    test();
}

minorgc();

for (var i = 0; i < 8210; i++) {
    test();
}