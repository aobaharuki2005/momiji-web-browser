function b(global) {
    var resolve;
    new Promise(d => resolve = d).then(global.Function)
    resolve()

    caught = false;
    try {
        globalOfFirstJobInQueue()
    } catch (exception) {
        caught = true;
        assertEq(exception.message.includes("dead object"), true);
    }
    assertEq(caught, true);
}

let g1 = newGlobal()
let g2 = newGlobal({
    newCompartment: true
})

nukeAllCCWs()

b(g2)
