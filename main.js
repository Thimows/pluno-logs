(function() {
    // Store original console methods
    const original = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
        trace: console.trace
    };

    // Enhanced serialization with better error handling and depth control
    function serializeForPostMessage(arg, depth = 0, maxDepth = 3) {
        const seen = new WeakSet();
        
        function getErrorDetails(error) {
            const errorObj = {
                __type: 'Error',
                name: error.name,
                message: error.message,
                stack: error.stack
            };
            
            // Capture non-standard error properties
            for (const key of Object.getOwnPropertyNames(error)) {
                if (!['name', 'message', 'stack'].includes(key)) {
                    try {
                        errorObj[key] = error[key];
                    } catch (e) {
                        errorObj[key] = '[Unable to access property]';
                    }
                }
            }
            
            return errorObj;
        }

        function serialize(value, currentDepth) {
            if (currentDepth > maxDepth) {
                return '[Max Depth Exceeded]';
            }

            if (value === null || value === undefined) {
                return value;
            }

            if (value instanceof Error || (value && value.constructor && value.constructor.name === 'Error')) {
                return getErrorDetails(value);
            }

            const type = typeof value;

            // Handle primitive types
            if (type === 'number') {
                if (isNaN(value)) return 'NaN';
                if (!isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
                return value;
            }

            if (type === 'symbol') {
                return '[Symbol: ' + (value.description || 'unknown') + ']';
            }

            if (type !== 'object' && type !== 'function') {
                return value;
            }

            // Handle circular references
            if (seen.has(value)) {
                return '[Circular Reference]';
            }

            if (value instanceof Promise) {
                return {
                    __type: 'Promise',
                    state: 'pending'  // Could be enhanced to show resolved/rejected state
                };
            }

            if (value instanceof Date) {
                return {
                    __type: 'Date',
                    value: value.toISOString()
                };
            }

            if (value instanceof RegExp) {
                return {
                    __type: 'RegExp',
                    source: value.source,
                    flags: value.flags
                };
            }

            // Handle DOM nodes
            if (value instanceof Node) {
                return {
                    __type: 'DOMNode',
                    nodeName: value.nodeName,
                    nodeType: value.nodeType,
                    id: value.id || undefined,
                    className: value.className || undefined,
                    innerHTML: value instanceof Element ? value.innerHTML : undefined
                };
            }

            if (type === 'function') {
                return {
                    __type: 'Function',
                    name: value.name || 'anonymous',
                    source: value.toString().substring(0, 200) + (value.toString().length > 200 ? '...' : '')
                };
            }

            seen.add(value);

            if (Array.isArray(value)) {
                return value.map(item => serialize(item, currentDepth + 1));
            }

            if (type === 'object') {
                const obj = {};
                const props = Object.getOwnPropertyNames(value);
                
                for (const key of props) {
                    try {
                        if (typeof key === 'symbol') continue;
                        obj[key] = serialize(value[key], currentDepth + 1);
                    } catch (e) {
                        obj[key] = '[Unable to serialize: ' + e.message + ']';
                    }
                }
                return obj;
            }

            return '[Unknown Type]';
        }

        try {
            return serialize(arg, depth);
        } catch (e) {
            return {
                __type: 'SerializationError',
                message: e.message,
                value: String(arg)
            };
        }
    }

    // Enhanced console interceptor
    function interceptConsole(level) {
        return function(...args) {
            try {
                // Call original console method
                original[level].apply(console, args);
                
                // Get stack trace for better error tracking
                const stack = new Error().stack;
                const callSite = stack.split('\n')[2] || '';
                
                const serializedArgs = args.map(arg => serializeForPostMessage(arg));
                
                // Add metadata to help with debugging
                const message = {
                    type: 'console',
                    level: level,
                    timestamp: new Date().toISOString(),
                    args: serializedArgs,
                    callSite: callSite,
                    url: window.location.href
                };

                // Ensure we can post to parent
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage(message, '*');
                }
            } catch (e) {
                // If interception fails, at least log the original message
                original[level].apply(console, args);
                // And try to report the interception error
                original.error.call(console, 'Console interception error:', e);
            }
        };
    }

    // Set up error event listener to catch unhandled errors
    window.addEventListener('error', function(event) {
        try {
            const errorDetails = serializeForPostMessage(event.error);
            const message = {
                type: 'console',
                level: 'error',
                timestamp: new Date().toISOString(),
                args: [{
                    __type: 'UnhandledError',
                    error: errorDetails,
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                }],
                url: window.location.href
            };

            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
            }
        } catch (e) {
            original.error.call(console, 'Error event handling failed:', e);
        }
    });

    // Set up promise rejection handler
    window.addEventListener('unhandledrejection', function(event) {
        try {
            const rejectionDetails = serializeForPostMessage(event.reason);
            const message = {
                type: 'console',
                level: 'error',
                timestamp: new Date().toISOString(),
                args: [{
                    __type: 'UnhandledPromiseRejection',
                    reason: rejectionDetails
                }],
                url: window.location.href
            };

            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
            }
        } catch (e) {
            original.error.call(console, 'Promise rejection handling failed:', e);
        }
    });

    // Intercept all console methods
    console.log = interceptConsole('log');
    console.error = interceptConsole('error');
    console.warn = interceptConsole('warn');
    console.info = interceptConsole('info');
    console.debug = interceptConsole('debug');
    console.trace = interceptConsole('trace');
})();
