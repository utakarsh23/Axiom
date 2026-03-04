// Blocklist of built-in / prototype method names that are noise in the call graph.
// Covers: TypeScript, JavaScript, Python, Go, Java, Rust, Solidity, C/C++
// Filtered before emitting ExtractedCall events — keeps only meaningful cross-function calls.
const CALL_BLOCKLIST = new Set([
    // ── JavaScript / TypeScript — Array prototype ─────────────────────────────
    'map', 'filter', 'forEach', 'find', 'findIndex', 'reduce', 'reduceRight',
    'some', 'every', 'flat', 'flatMap', 'includes', 'indexOf', 'lastIndexOf',
    'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat', 'join',
    'reverse', 'sort', 'fill', 'copyWithin', 'entries', 'keys', 'values', 'at',
    // JS/TS — String prototype
    'split', 'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd', 'replace',
    'replaceAll', 'match', 'matchAll', 'search', 'startsWith', 'endsWith',
    'toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase',
    'charAt', 'charCodeAt', 'codePointAt', 'normalize', 'repeat', 'substring',
    // JS/TS — Object / general
    'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
    'toJSON', 'toLocaleString', 'toPrecision', 'toFixed', 'toExponential',
    'assign', 'freeze', 'seal', 'create', 'fromEntries', 'is', 'isFrozen',
    'isSealed', 'getOwnPropertyNames',
    // JS/TS — Promise / async
    'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'allSettled', 'race', 'any',
    // JS/TS — Map / Set
    'set', 'get', 'has', 'delete', 'clear', 'add',
    // JS/TS — Console
    'log', 'error', 'warn', 'info', 'debug', 'trace', 'table', 'assert',
    // JS/TS — Math
    'abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt', 'random',
    'trunc', 'sign', 'hypot', 'cbrt', 'exp', 'log', 'log2', 'log10',
    // JS/TS — JSON
    'parse', 'stringify',
    // JS/TS — DOM / events / timers
    'addEventListener', 'removeEventListener', 'dispatchEvent', 'emit', 'on', 'off',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'bind', 'call', 'apply',
    // JS/TS — Node / misc
    'from', 'of', 'isArray', 'isNaN', 'isFinite', 'parseInt', 'parseFloat',
    'decodeURI', 'encodeURI', 'decodeURIComponent', 'encodeURIComponent',
    // JS/TS — React hooks (all hooks are framework plumbing, not architectural calls)
    'useState', 'useEffect', 'useContext', 'useCallback', 'useMemo', 'useRef',
    'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue',
    'useNavigate', 'useLocation', 'useParams', 'useSearchParams', 'useHistory',
    'useSelector', 'useDispatch', 'useStore',  // Redux
    'useQuery', 'useMutation', 'useLazyQuery', // React Query / Apollo
    'useForm', 'useFieldArray',                // React Hook Form
    'useAnimate', 'useInView', 'useSpring',    // Framer Motion / animation
    'useTheme', 'useMediaQuery',               // UI libs
    // JS/TS — React / frontend — UI state & navigation (all noise)
    'navigate', 'alert', 'confirm', 'prompt', 'toast',
    'animate', 'stagger', 'motion',
    // JS/TS — storage
    'getItem', 'setItem', 'removeItem', 'contains',
    // JS/TS — misc low-signal
    'open', 'close', 'begin', 'end', 'next', 'done', 'reset',
    'init', 'stop', 'flush', 'drain', 'read', 'write',
    // JS/TS — built-in constructors / global objects
    // These should NEVER appear as external service calls
    'Array', 'Buffer', 'String', 'Date', 'Object', 'Number', 'Boolean',
    'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
    'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Symbol',
    'Proxy', 'Reflect', 'JSON', 'Math', 'console', 'Intl',
    'Uint8Array', 'Int32Array', 'Float64Array', 'ArrayBuffer',
    'DataView', 'SharedArrayBuffer', 'Atomics', 'BigInt',
    'URL', 'URLSearchParams', 'Headers', 'Request', 'Response',
    'FormData', 'Blob', 'File', 'FileReader', 'AbortController',
    // JS/TS — very common local variable names that slip through
    // These are parameter/variable names used as method call targets, not real functions
    'app', 'server', 'res', 'req', 'result', 'results', 'response',
    'parts', 'ids', 'calls', 'entities', 'collection', 'client',
    'oldHashes', 'newHashes', 'sub', 'handler', 'driver', 'repo',
    'workspace', 'data', 'body', 'payload', 'args', 'opts', 'options',
    'cb', 'callback', 'err', 'error', 'msg', 'message', 'event',
    'stream', 'socket', 'conn', 'db', 'model', 'schema', 'doc', 'docs',
    'target', 'source', 'dest', 'config', 'settings', 'params', 'query',
    'name', 'url', 'path', 'key', 'val', 'value', 'token', 'id',
    'current', 'prev', 'next', 'temp', 'tmp', 'item', 'items',
    // More local variable noise seen in production data
    'session', 'findings', 'cycle', 'callers', 'f', 'lower',
    'filePath', 'entityName', 'entityCode', 'authHeader',
    'patchResponse', 'lowerExplanation', 'subscriptions',
    'validator', 'el', 'ctx', 'ref', 'state', 'acc', 'obj',
    'promise', 'record', 'records', 'entry', 'row', 'rows',
    'node', 'fnNode', 'importSource', 'firstArg', 'valueNode',
    'sourceNode', 'pathNode', 'child', 'funcDeclarator',
    'auth', 'parser', 'collection', 'workspace',
    // Web3 / blockchain local variables
    'provider', 'signer', 'contract', 'tx', 'receipt',
    'accounts', 'account', 'balance', 'network', 'chainId',
    // DOM / browser globals
    'navigator', 'location', 'history',
    'requestAnimationFrame', 'cancelAnimationFrame',
    // More frontend local variable noise from production data
    'now', 'currentMonth', 'nextMonth', 'paymentDate', 'date',
    'userBalance', 'gasEstimate', 'chartRef', 'chartInstanceRef',
    'html5QrCode', 'onScanSuccess', 'dropdownRef', 'menuRef',
    'connect', 'disconnect', 'isConnected',

    // ── Python — built-ins and common list/dict/str methods ──────────────────
    'append', 'extend', 'insert', 'remove', 'discard', 'update', 'copy',
    'items', 'popitem', 'setdefault', 'count', 'index',
    'strip', 'lstrip', 'rstrip', 'encode', 'decode', 'format', 'format_map',
    'upper', 'lower', 'capitalize', 'title', 'center', 'ljust', 'rjust',
    'len', 'range', 'enumerate', 'zip', 'iter', 'type', 'isinstance',
    'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr', 'callable',
    'print', 'input', 'repr', 'str', 'int', 'float', 'bool', 'list',
    'dict', 'tuple', 'bytes', 'bytearray', 'memoryview',
    'super', 'property', 'staticmethod', 'classmethod',
    'sorted', 'reversed', 'sum', 'divmod', 'hash', 'id', 'dir',
    'vars', 'globals', 'locals', 'readline', 'readlines',
    // Python — asyncio
    'run', 'gather', 'create_task', 'sleep', 'wait', 'wait_for',
    'ensure_future', 'get_event_loop', 'run_until_complete',
    // Python — Django / Flask / FastAPI framework noise
    'render', 'redirect', 'get_object_or_404', 'get_list_or_404',
    'jsonify', 'make_response', 'abort', 'url_for', 'flash',
    'save', 'create', 'bulk_create', 'get_or_create', 'update_or_create',
    'filter', 'exclude', 'annotate', 'aggregate', 'select_related',
    'prefetch_related', 'order_by', 'distinct', 'values', 'values_list',
    'first', 'last', 'exists', 'count', 'delete',
    // Python — decorators / common metaclass methods
    'route', 'app_route', 'api_view', 'action', 'permission_classes',
    'login_required', 'require_http_methods',
    // Python — common variable names
    'self', 'cls', 'kwargs', 'request', 'response', 'queryset', 'serializer',
    'context', 'instance', 'validated_data', 'obj',
    // Python — logging
    'getLogger', 'basicConfig', 'setLevel', 'addHandler',
    'warning', 'critical', 'exception',
    // Python — typing
    'Optional', 'Union', 'List', 'Dict', 'Tuple', 'Any', 'Callable',
    'TypeVar', 'Generic', 'Protocol', 'Final', 'Literal', 'ClassVar',

    // ── Go — common stdlib exported function names ─────────────────────────────
    'Println', 'Printf', 'Sprintf', 'Fprintf', 'Errorf', 'Scanln', 'Scanf',
    'Print', 'Sprint', 'Fprint', 'Fprintln', 'Fatal', 'Fatalf', 'Fatalln',
    'Panic', 'Panicf', 'Panicln', 'Error', 'Unwrap', 'Is', 'As', 'New',
    'MarshalJSON', 'UnmarshalJSON', 'Marshal', 'Unmarshal',
    'ReadAll', 'ReadFile', 'WriteFile', 'ReadDir',
    'Dial', 'Listen', 'Accept', 'HandleFunc', 'Handle',
    'Atoi', 'Itoa', 'ParseInt', 'ParseFloat', 'FormatInt',
    'Now', 'Sleep', 'Since', 'Until', 'After',
    'Lock', 'Unlock', 'RLock', 'RUnlock',
    // Go — common interface methods / patterns
    'String', 'Bytes', 'Close', 'Read', 'Write', 'Seek',
    'Len', 'Cap', 'Reset', 'Flush', 'Sync',
    'ServeHTTP', 'ListenAndServe', 'ListenAndServeTLS',
    'Next', 'Err', 'Scan', 'Done', 'Value',
    // Go — context / sync / testing
    'Background', 'TODO', 'WithCancel', 'WithTimeout', 'WithDeadline', 'WithValue',
    'Add', 'Wait', 'Done', 'Load', 'Store', 'CompareAndSwap',
    'Run', 'Skip', 'Helper', 'Cleanup', 'TempDir',
    // Go — Gin / Echo / common web frameworks
    'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'Use', 'Group',
    'JSON', 'Bind', 'BindJSON', 'ShouldBindJSON', 'Param', 'Query',
    'Param', 'FormValue', 'PostForm',
    // Go — GORM / database
    'Find', 'First', 'Create', 'Save', 'Delete', 'Where', 'Order',
    'Limit', 'Offset', 'Preload', 'Joins', 'Model', 'Table',
    'Begin', 'Commit', 'Rollback', 'AutoMigrate',
    // Go — common variable names
    'ctx', 'w', 'r', 'c', 'db', 'tx', 'err', 'wg', 'mu',

    // ── Java — Object methods and common collection/string calls ──────────────
    'equals', 'hashCode', 'compareTo', 'compareToIgnoreCase', 'equalsIgnoreCase',
    'isEmpty', 'isBlank', 'length', 'charAt', 'getBytes', 'toCharArray',
    'add', 'addAll', 'remove', 'removeAll', 'containsAll', 'size', 'iterator',
    'toArray', 'put', 'putAll', 'getOrDefault', 'entrySet', 'keySet',
    'containsKey', 'containsValue',
    'println', 'printf', 'parseInt', 'parseDouble', 'parseLong', 'parseBoolean',
    // Java — Stream API
    'stream', 'parallelStream', 'map', 'filter', 'collect', 'reduce',
    'flatMap', 'distinct', 'sorted', 'limit', 'skip', 'peek',
    'anyMatch', 'allMatch', 'noneMatch', 'findFirst', 'findAny',
    'toList', 'toSet', 'toMap', 'joining', 'groupingBy', 'partitioningBy',
    // Java — Optional
    'of', 'ofNullable', 'orElse', 'orElseGet', 'orElseThrow',
    'isPresent', 'ifPresent', 'get',
    // Java — logging (SLF4J, Log4j, java.util.logging)
    'trace', 'debug', 'info', 'warn', 'error', 'fatal',
    'getLogger', 'isDebugEnabled', 'isInfoEnabled',
    // Java — Spring framework noise
    'autowired', 'inject', 'build', 'builder', 'status', 'ok', 'body',
    'getBean', 'registerBean', 'refresh',
    'save', 'findById', 'findAll', 'deleteById', 'existsById', 'count',
    'flush', 'saveAndFlush',
    // Java — common variable names
    'this', 'args', 'params', 'result', 'response', 'request',
    'entity', 'dto', 'model', 'repository', 'service',
    // Java — Concurrency
    'start', 'run', 'join', 'interrupt', 'sleep', 'yield',
    'submit', 'invoke', 'invokeAll', 'execute', 'shutdown', 'awaitTermination',

    // ── Rust — trait methods and std primitives ────────────────────────────────
    'unwrap', 'expect', 'unwrap_or', 'unwrap_or_else', 'unwrap_or_default',
    'ok', 'err', 'is_ok', 'is_err', 'is_some', 'is_none',
    'clone', 'clone_from',
    'is_empty', 'capacity', 'reserve', 'shrink_to_fit',
    'retain', 'iter', 'iter_mut', 'into_iter',
    'fold', 'for_each', 'collect', 'position',
    'find', 'product',
    'as_str', 'as_bytes', 'to_string', 'to_owned', 'to_vec',
    'borrow', 'borrow_mut', 'as_ref', 'as_mut', 'into',
    'default', 'drop', 'try_lock', 'send', 'recv',
    'eprintln', 'eprint', 'panic',
    // Rust — tokio / async runtime
    'spawn', 'block_on', 'select', 'join', 'sleep', 'timeout',
    'try_join', 'try_recv', 'try_send',
    // Rust — serde
    'serialize', 'deserialize', 'serialize_struct', 'deserialize_struct',
    // Rust — Arc / Mutex / RefCell
    'lock', 'read', 'write', 'try_lock', 'try_read', 'try_write',
    'new', 'with_capacity', 'from_str', 'from_utf8',
    // Rust — common variable names
    'self', 'other', 'rhs', 'lhs',
    // Rust — error handling
    'map_err', 'and_then', 'or_else', 'ok_or', 'ok_or_else',
    'context', 'with_context', 'anyhow', 'bail',
    // Rust — tracing / log
    'instrument', 'in_scope', 'entered',
    'event', 'span', 'trace_span', 'debug_span', 'info_span',

    // ── Solidity — built-in global functions ──────────────────────────────────
    'require', 'revert', 'assert',
    'keccak256', 'sha256', 'ripemd160', 'ecrecover',
    'encodePacked', 'transfer', 'send', 'delegatecall', 'staticcall',
    'selfdestruct',
    // Solidity — abi encoding/decoding
    'encode', 'encodePacked', 'encodeWithSelector', 'encodeWithSignature',
    'decode',
    // Solidity — OpenZeppelin / ERC common methods
    'approve', 'transferFrom', 'allowance', 'balanceOf', 'totalSupply',
    'mint', 'burn', 'pause', 'unpause', 'renounceOwnership', 'transferOwnership',
    'safeTransferFrom', 'setApprovalForAll', 'isApprovedForAll',
    'ownerOf', 'tokenURI', 'supportsInterface',
    // Solidity — events (emit calls)
    'Transfer', 'Approval', 'OwnershipTransferred',
    // Solidity — modifiers and common patterns
    'onlyOwner', 'nonReentrant', 'whenNotPaused', 'whenPaused',

    // ── C / C++ — standard library call names ─────────────────────────────────
    'printf', 'fprintf', 'sprintf', 'snprintf', 'scanf', 'fscanf', 'sscanf',
    'malloc', 'calloc', 'realloc', 'free',
    'memcpy', 'memmove', 'memset', 'memcmp', 'strlen', 'strcpy', 'strncpy',
    'strcmp', 'strncmp', 'strcat', 'strncat', 'strchr', 'strstr',
    'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs', 'feof', 'ferror',
    'exit', 'abort',
    'cout', 'cin', 'cerr', 'endl',
    // C++ — STL containers / algorithms / smart pointers
    'push_back', 'pop_back', 'push_front', 'pop_front', 'emplace_back',
    'emplace', 'emplace_front', 'insert', 'erase', 'swap', 'resize',
    'begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend',
    'make_shared', 'make_unique', 'make_pair', 'make_tuple',
    'move', 'forward', 'swap',
    'sort', 'find', 'find_if', 'count', 'count_if', 'accumulate',
    'transform', 'copy', 'remove_if', 'unique',
    'lock_guard', 'unique_lock', 'shared_lock',
    'async', 'future', 'promise', 'packaged_task',
    'get', 'wait', 'wait_for', 'wait_until',
]);

// Given a call_expression's callee:
//   - member_expression (e.g. axios.get, router.post):
//       → return the OBJECT (module name) — axios.get → 'axios'
//       → unless object is 'this'/'self'/'super': fall through to property
//   - plain identifier:
//       → blocklist check, return name or null
// Returns null if call should be dropped.
function resolveCallee(
    calleeText: string,
    objectName: string | null,
    propertyName: string | null,
): string | null {
    if (objectName && propertyName) {
        // Objects whose method calls are noise (logging, browser APIs, common vars)
        const skipObjects = new Set([
            'this', 'self', 'super', 'window', 'document', 'global', 'globalThis', 'process',
            // Logging — always noise
            'console', 'logger', 'log',
            // Browser storage — architectural only at the module level, not per-call
            'localStorage', 'sessionStorage',
            // Very common local variable names whose methods are not architecturally meaningful
            'res', 'req', 'err', 'error', 'response', 'result', 'data', 'body',
            'event', 'e', 'msg', 'cb', 'callback',
            // DB / driver / ORM session objects — method calls on these are not cross-service calls
            'session', 'driver', 'db', 'client', 'conn', 'connection', 'pool',
            'nc', 'sub', 'subscription', 'nats',
            // Built-in constructors used as objects
            'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Date',
            'Buffer', 'Promise', 'Reflect', 'Proxy',
        ]);
        if (skipObjects.has(objectName)) {
            return null; // always drop method calls on skip objects
        }
        // If objectName itself looks like a chained call result (contains parens/brackets), drop it
        if (objectName.includes('(') || objectName.includes('[') || objectName.includes('\n')) {
            return null;
        }
        // If the property is a blocklisted method, drop it to avoid noise
        if (CALL_BLOCKLIST.has(propertyName)) return null;
        // If the object name itself is a blocklisted identifier (local var used as receiver), drop it
        // e.g. node.something(), app.use(), collection.add() — these are local vars, not services
        if (CALL_BLOCKLIST.has(objectName)) return null;
        // Drop React useState setters in both positions:
        // e.g. result.setBalance() (property) or setBalance.call() (object)
        if (/^set[A-Z]/.test(propertyName)) return null;
        if (/^set[A-Z]/.test(objectName)) return null;
        // Return the module/object name — this merges all calls to axios, nc, s3, etc.
        return objectName;
    }
    if (CALL_BLOCKLIST.has(calleeText)) return null;
    // Drop single-character identifiers (loop vars, short aliases) — never meaningful
    if (calleeText.length === 1) return null;
    // Drop React useState setters: any identifier matching set[A-Z]* pattern
    // e.g. setBalance, setError, setLoading, setIsConnected, setChartData...
    if (/^set[A-Z]/.test(calleeText)) return null;
    // Drop anything that looks like an expression (chained/multiline) rather than an identifier
    if (calleeText.includes('(') || calleeText.includes('\n') || calleeText.length > 60) return null;
    return calleeText;
}

export { CALL_BLOCKLIST, resolveCallee };
