(function(){
    const original = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };

    function serializeForPostMessage(arg) {
        const seen = new WeakSet();
        
        function serialize(value) {
            if (value === null || value === undefined) {
                return value;
            }

            if (typeof value === 'symbol') {
                return '[Symbol: ' + (value.description || 'unknown') + ']';
            }

            if (typeof value !== 'object' && typeof value !== 'function') {
                return value;
            }

            if (value instanceof Error) {
                return {
                    __type: 'Error',
                    name: value.name,
                    message: value.message,
                    stack: value.stack
                };
            }

            if (value instanceof Date) {
                return {
                    __type: 'Date',
                    value: value.toISOString()
                };
            }

            if (value instanceof Node) {
                return {
                    __type: 'DOMNode',
                    nodeName: value.nodeName,
                    nodeType: value.nodeType
                };
            }

            if (typeof value === 'function') {
                return {
                    __type: 'Function',
                    name: value.name || 'anonymous'
                };
            }

            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);

            if (Array.isArray(value)) {
                return value.map(item => serialize(item));
            }

            if (typeof value === 'object') {
                const obj = {};
                const props = Object.getOwnPropertyNames(value);
                
                for (const key of props) {
                    try {
                        if (typeof key === 'symbol') continue;
                        
                        const propValue = value[key];
                        if (typeof propValue === 'symbol') {
                            obj[key] = '[Symbol: ' + (propValue.description || 'unknown') + ']';
                        } else {
                            obj[key] = serialize(propValue);
                        }
                    } catch (e) {
                        obj[key] = '[Unable to serialize]';
                    }
                }
                return obj;
            }

            return '[Unknown Type]';
        }

        try {
            return serialize(arg);
        } catch (e) {
            return '[Serialization Error]';
        }
    }

    function interceptConsole(level) {
        return function(...args) {
            original[level].apply(console, args);
            
            const serializedArgs = args.map(arg => serializeForPostMessage(arg));
            
            // Send to parent window
            if (window.parent && window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'console',
                        level: level,
                        args: serializedArgs
                    }, '*');
                } catch (e) {
                    // Silently fail if we can't post to parent
                }
            }
        };
    }

    console.log = interceptConsole('log');
    console.error = interceptConsole('error');
    console.warn = interceptConsole('warn');
    console.info = interceptConsole('info');
})();
