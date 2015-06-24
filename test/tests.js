var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("../promise_server.js");

describe("Promise.await", function () {
  it("should work inside an existing Fiber", function () {
    assert.strictEqual(Promise.await(42), 42);
    assert.strictEqual(Promise.await(Promise.resolve("asdf")), "asdf");

    var obj = {};
    assert.strictEqual(Promise.resolve(obj).await(), obj);
  }.async());

  it("should not switch Fibers", Promise.async(function () {
    var originalFiber = Fiber.current;
    assert.ok(originalFiber instanceof Fiber);
    var promise = Promise.resolve(0);

    for (var i = 0; i < 100; ++i) {
      promise = promise.then(function (count) {
        assert.ok(Fiber.current instanceof Fiber);
        assert.notStrictEqual(Fiber.current, originalFiber);
        return count + 1;
      });
    }

    assert.strictEqual(Promise.await(promise), 100);
    assert.strictEqual(Fiber.current, originalFiber);
  }));

  it("should throw rejection reasons", Promise.async(function () {
    var reason = new Error("reason");
    try {
      Promise.await(Promise.reject(reason));
      assert.ok(false, "should have thrown");
    } catch (error) {
      assert.strictEqual(error, reason);
    }
  }));
});

describe("Promise.awaitAll", function () {
  it("should await multiple promises", Promise.async(function () {
    assert.deepEqual(Promise.awaitAll([
      123,
      Promise.resolve("oyez"),
      new Promise(function (resolve) {
        process.nextTick(function () {
          resolve("resolved");
        });
      })
    ]), [123, "oyez", "resolved"]);
  }));
});

describe("Promise.async", function () {
  it("should create a new Fiber", function () {
    var self = this;

    var parent = Promise.async(function () {
      var parentFiber = Fiber.current;
      assert.ok(parentFiber instanceof Fiber);

      var childFibers = [];
      var child = Promise.async(function (arg) {
        assert.strictEqual(this, self);

        var childFiber = Fiber.current;
        assert.ok(childFiber instanceof Fiber);
        assert.notStrictEqual(childFiber, parentFiber);

        assert.strictEqual(childFibers.indexOf(childFiber), -1);
        childFibers.push(childFiber);

        return Promise.await(arg);
      });

      return Promise.all([
        child.call(this, 1),
        child.call(this, 2),
        child.call(this, 3)
      ]);
    });

    return parent.call(this).then(function (results) {
      assert.deepEqual(results, [1, 2, 3]);
    });
  });

  it("should be able to reuse Fiber.current", function () {
    var self = this;

    var parent = Promise.async(function () {
      var parentFiber = Fiber.current;
      assert.ok(parentFiber instanceof Fiber);

      var childFibers = [];
      var child = Promise.async(function (arg) {
        assert.strictEqual(this, self);

        var childFiber = Fiber.current;
        assert.ok(childFiber instanceof Fiber);
        assert.strictEqual(childFiber, parentFiber);

        childFibers.forEach(function (otherChildFiber) {
          assert.strictEqual(childFiber, otherChildFiber);
        });
        childFibers.push(childFiber);

        return Promise.await(arg);
      }, true);

      return Promise.all([
        child.call(this, 1),
        child.call(this, 2),
        child.call(this, 3)
      ]);
    });

    return parent.call(this).then(function (results) {
      assert.deepEqual(results, [1, 2, 3]);
    });
  });
});

describe("Promise.then callbacks", function () {
  it("should always run in a fiber", Promise.async(function () {
    var parentFiber = Fiber.current;
    assert.ok(parentFiber instanceof Fiber);

    var dynamics = { user: "ben" };
    parentFiber._meteorDynamics = dynamics;

    function checkCallbackFiber() {
      assert.ok(Fiber.current instanceof Fiber);
      assert.deepEqual(Fiber.current._meteorDynamics, dynamics);
    }

    return Promise.resolve("result").then(function (result) {
      assert.strictEqual(result, "result");
      checkCallbackFiber();
      throw new Error("friendly exception");
    }).catch(function (error) {
      assert.strictEqual(error.message, "friendly exception");
      checkCallbackFiber();
    });
  }));
});

describe("FiberPool", function () {
  it("should still work when the target size is 1 or 0", function () {
    var fiberPool = require("../fiber_pool.js").makePool(Promise);

    return fiberPool.setTargetFiberCount(1).run({
      callback: function () {
        assert.ok(Fiber.current instanceof Fiber);
        return Fiber.current;
      }
    }).then(function (firstFiber) {
      return fiberPool.run({
        callback: function () {
          assert.ok(Fiber.current instanceof Fiber);
          assert.strictEqual(Fiber.current, firstFiber);
          fiberPool.drain();
          return Fiber.current;
        }
      });
    }).then(function (secondFiber) {
      return fiberPool.run({
        callback: function () {
          assert.ok(Fiber.current instanceof Fiber);
          assert.notStrictEqual(Fiber.current, secondFiber);
        }
      });
    });
  });
});
