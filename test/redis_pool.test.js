var assert = require('assert')
  , Step = require('step')
  , _ = require('underscore')
  , RedisPool = require('../')
  , tests = module.exports = {};

suite('redis_pool', function() {

    // configure redis pool instance to use in tests
    var test_opts = require('./support/config').redis_pool;
    
    var redis_pool = new RedisPool(test_opts);

    test('RedisPool object exists', function(done){
      assert.ok(RedisPool);
      done();
    });
    
    test('RedisPool can create new redis_pool objects with default settings', function(done){
      var redis_pool = new RedisPool();
      done();
    });
    
    test('RedisPool can create new redis_pool objects with specific settings', function(done){
      var redis_pool = new RedisPool(_.extend({host:'127.0.0.1', port: '6379'}, test_opts));
      done();
    });
    
    
    test('pool object has an acquire function', function(done){
      var found=false;
      var functions = _.functions(redis_pool);
      for (var i=0; i<functions.length; ++i) {
          if ( functions[i] == 'acquire' ) { found=true; break; }
      }
      assert.ok(found);
      done();
    });
    
    test('calling aquire returns a redis client object that can get/set', function(done){
      redis_pool.acquire(0, function(err, client){
        if ( err ) { done(err); return; }
        client.set("key","value");
        client.get("key", function(err,data){      
          assert.equal(data, "value");      
          redis_pool.release(0, client); // needed to exit tests
          done();
        })
      });    
    });
    
    test('calling aquire on another DB returns a redis client object that can get/set', function(done){
      redis_pool.acquire(2, function(err, client){
        if ( err ) { done(err); return; }
        client.set("key","value");
        client.get("key", function(err,data){      
          assert.equal(data, "value");      
          redis_pool.release(2, client); // needed to exit tests
          done();
        })
      });      
    });

    // See https://github.com/CartoDB/node-redis-mpool/issues/1
    test('calling release resets connection state', function(done){
      var client1, client2, tx1;
      Step(
        function getClient1() {
          redis_pool.acquire(0, this);
        },
        function getClient2(err, client) {
          if ( err ) throw err;
          client1 = client;
          redis_pool.acquire(0, this);
        },
        function regetClient1(err, client) {
          if ( err ) throw err;
          client2 = client;
          client1.WATCH('k');
          redis_pool.release(0, client1);
          client1 = null;
          redis_pool.acquire(0, this);
        },
        function startTransaction1(err, client) {
          if ( err ) throw err;
          client1 = client;
          // We expect this to be not watching now..
          tx1 = client1.MULTI();
          tx1.SET('x',1); // 'x' will be set to 1 only if we're not watching
          client2.SET('k',1, this);
        },
        function execTransaction1(err) {
          if ( err ) throw err;
          // This would fail if we're watching
          tx1.EXEC(this);
        },
        function checkTransaction(err, res) {
          if ( err ) throw err;
          assert.ok(res, "Transaction unexpectedly aborted"); // we expect to succeeded
          assert.equal(res.length, 1);
          return null;
        },
        function finish(err) {
          if ( client1 ) redis_pool.release(0, client1);
          if ( client2 ) redis_pool.release(0, client2);
          done(err);
        }
      );
    });

});
