/*global Proxy: true, */
/*jslint white: false, plusplus: false */
var Contracts = (function() {
    function blame(toblame, k, val) {
        throw {
            name: "BlameError",
            message: "I blame: " + toblame + " for violating " + k + " with value: " + val
        };
    }

    // creates the properties that behave as an identity for a Proxy
    function idHandler(obj) {
        return {
            getOwnPropertyDescriptor: function(name) {
                var desc = Object.getOwnPropertyDescriptor(obj, name);
                if (desc !== undefined) { desc.configurable = true; }
                return desc;
            },
            getPropertyDescriptor: function(name) {
                var desc = Object.getPropertyDescriptor(obj, name); 
                if (desc !== undefined) { desc.configurable = true; }
                return desc;
            },
            getOwnPropertyNames: function() {
                return Object.getOwnPropertyNames(obj);
            },
            getPropertyNames: function() {
                return Object.getPropertyNames(obj);               
            },
            defineProperty: function(name, desc) {
                Object.defineProperty(obj, name, desc);
            },
            delete: function(name) { return delete obj[name]; },   
            fix: function() {
                if (Object.isFrozen(obj)) {
                    return Object.getOwnPropertyNames(obj).map(function(name) {
                        return Object.getOwnPropertyDescriptor(obj, name);
                    });
                }
                return undefined;
            },
            has: function(name) { return name in obj; },
            hasOwn: function(name) { return Object.prototype.hasOwnProperty.call(obj, name); },
            enumerate: function() {
                var result = [],
                name;
                for (name in obj) { result.push(name); }
                return result;
            },
            get: function(receiver, name) {
                return obj[name];
            },
            set: function(receiver, name, val) {
                obj[name] = val;
                return true;
            },
            keys: function() { return Object.keys(obj); }
        };
    }

    // contract combinators
    var combinators = {
        flat: function(p, name) {
            return function(pos, neg) {
                return function (x) {
                    if (p(x)) {
                        return x;
                    } else {
                        blame(pos, name, x);
                    }
                };
            };
        },
        fun: function(dom, rng) {
            return function(pos, neg) {
                return function(f) {
                    var handler = idHandler(f);
                    return Proxy.createFunction(handler,
                                         function(args) {
                                             var i;
                                             for(i = 0; i < args.length; i++) {
                                                 dom[i](neg, pos)(args[i]);
                                             }
                                             return rng(pos, neg)(f.apply(this, arguments));
                                         },
                                         function(args) {
                                             // todo: think through this more
                                             var rng, i;
                                             for(i = 0; i < args.length; i++) {
                                                 dom[i](neg, pos)(args[i]);
                                             }
                                             return rng(pos, neg)(f.apply(this, arguments));
                                         });
                };
            };
        },
        object: function(objContract) {
            return function(pos, neg) {
                return function(obj) {
                    var missingProps,
                        handler = idHandler(obj);
                    handler.get = function(receiver, name) {
                        if(objContract.hasOwnProperty(name)) { 
                            return objContract[name](pos, neg)(obj[name]);
                        } else {
                            return obj[name];
                        }
                    };
                    handler.set = function(receiver, name, val) {
                        if(objContract.hasOwnProperty(name)) { 
                            obj[name] = objContract[name](pos, neg)(val);
                        } else {
                            obj[name] = val;
                        }
                        return true;
                    };
                    // check that all properties on the object have a contract
                    missingProps = Object.keys(objContract).filter(function(el) {
                        return !obj.hasOwnProperty(el);
                    });
                    if(missingProps.length !== 0) {
                        // todo: use missingProps to get more descriptive blame msg
                        blame(pos, objContract, obj);
                    }
                                                           
                    return Proxy.create(handler); // todo: what about the prototype? defaulting to null
                };
            };
        },
        any: function(pos, neg) {
            return function(val) {
                return val;
            };
        },
        or: function(k1, k2) {
            return function(pos, neg) {
                return function(val) {
                    // for now only accepting first order contracts for 'or'
                    if (typeof val === "function") {
                        blame(pos, "or", val);
                    }
                    var k1c = k1(pos, neg),
                        k2c = k2(pos, neg);
                    try {
                        return k1c(val);
                    } catch (e) {
                        return k2c(val);
                    }
                };
            };
        },
        none: function(pos, neg) {
            return function(val) {
                blame(pos, "none", val);
            };
        },
        and: function(k1, k2) {
            return function(pos, neg) {
                return function(val) {
                    return k2(pos, neg)(k1(pos, neg)(val));
                };
            };
        },
        guard: function(k, x, pos, neg) {
            return k(pos, neg)(x);
        }
    },
    // Some basic contracts
    contracts = {
        Number: combinators.flat(function(x) {
            return typeof(x) === "number";
        }, "Number"),
        String: combinators.flat(function(x) {
            return typeof(x) === "string";
        }, "String"),
        Odd: combinators.flat(function(x) {
            return  (x % 2) === 1;
        }, "Odd"),
        Even: combinators.flat(function(x) {
            return (x % 2) === 1;
        }, "Even"),
        Pos: combinators.flat(function(x) {
            return x >= 0;
        }, "Pos"),
        Array: combinators.object({
            length: combinators.flat(function(x) {
                return typeof(x) === "number";
            }, "Number")
        })
    };
    return {
        C: combinators,
        K: contracts
    };
})();

var M = (function () {
    function badAbs(x) {
        return x;
    }
    function id(x) { return x; }

    var C = Contracts.C, // combinators
        K = Contracts.K, // builtin contracts
        o = {
            id: id
        };

    return {
        id: C.guard(C.fun(C.any, C.any), id, "server", "client"),
        idNone: C.guard(C.fun(C.none, C.none), id, "server", "client"),
        idObj: C.guard(C.object({
            id: C.fun(K.Number, K.Number)
        }), o, "server", "client"),
        abs: C.guard(C.fun(K.Number, C.and(K.Number, K.Pos)), Math.abs, "server", "client"),
        badAbs: C.guard(C.fun(K.Number, C.and(K.Number, K.Pos)), badAbs, "server", "client") 
    };
})();