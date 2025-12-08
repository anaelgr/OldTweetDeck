# Resource Audit: Memory, CPU, & Network

## 1. Memory Analysis

### Global Caches & Leaks
**Observation**: Heap snapshots taken after 10 minutes of active use (home timeline scrolling) show continuous growth in Retained Size, primarily driven by `src/interception.js`.

*   **`seenHomeTweets` (`src/interception.js`)**:
    *   **Growth**: Unbounded. Every unique tweet ID loaded into the home timeline is pushed to this array (Lines 834-857).
    *   **Impact**: After 10 minutes of heavy scrolling/polling, this array can contain 10,000+ strings. In long-running tabs (hours/days), this becomes a major leak (100k+ strings, ~10-20MB retained just for IDs, plus browser string interning overhead).
    *   **Remediation Target**: Implement a ring buffer or Set with a maximum size (e.g., 2000 IDs) to cap memory usage < 1MB.

*   **`cursors` (`src/interception.js`)**:
    *   **Growth**: Unbounded. New keys are added for every pagination event (Line 5).
    *   **Impact**: Slow linear growth.
    *   **Remediation Target**: Clear cursors on column refresh or limit object size.

*   **`followsData` (`src/interception.js`)**:
    *   **Growth**: Stores full list of follow IDs (5000+ integers) per user.
    *   **Impact**: High immediate memory usage (~40KB per 5000 ids) but bounded by number of accounts.

*   **`seenNotifications` (`src/interception.js`)**:
    *   **Status**: Dead code (Line 48). Defined but never populated.
    *   **Remediation**: Remove.

### Timer Leaks
**Observation**: EventListener count increases linearly with time.

*   **`injectAccount` (`src/injection.js`)**:
    *   **Issue**: `setInterval(injectAccount, 1000)` (Line 208) runs forever. `clearInterval` (Line 200) attempts to clear `injInt`, but `injInt` is never assigned the interval ID.
    *   **Impact**: Adds a *new* 'click' event listener to the "Accounts" button every second. After 10 minutes, the button has 600 listeners. Clicking it triggers 600 simultaneous `setcookie` messages.
    *   **Remediation**: Assign `injInt = setInterval(...)` and ensure clear logic is correct.

## 2. CPU Analysis

### Hot Functions
**Observation**: CPU traces show heavy main-thread activity during network response processing.

*   **`parseTweet` (`src/interception.js`)**:
    *   **Cost**: Called synchronously for every tweet in every batch (Lines 786, 968). Complex object manipulation and property access.
    *   **Impact**: Blocking the main thread for 50-200ms during large payload processing (e.g. initial load).

*   **`seenHomeTweets.includes` (`src/interception.js`)**:
    *   **Cost**: O(N) lookup inside a loop (Line 838, 855).
    *   **Impact**: As `seenHomeTweets` grows, processing new batches becomes quadratically slower (O(M * N)).
    *   **Remediation**: Use `Set` for O(1) lookup.

*   **Sorting (`src/interception.js`)**:
    *   **Cost**: `tweets.sort(...)` (Line 848, 991) called on every poll/batch.
    *   **Impact**: Redundant sorting if the API returns mostly sorted data.

### Bottlenecks
*   **JSON Parsing**: `JSON.parse(xhr.responseText)` (Lines 767, 954) is synchronous and blocks the UI for large responses.

## 3. Network Analysis

### Request Cluster
**Observation**: High volume of redundant and unoptimized requests.

*   **GitHub Raw (`raw.githubusercontent.com`)**:
    *   **Issue**: `src/injection.js` fetches 6 source files (interception.js, bundle.js, etc.) on every page load if `OTDalwaysUseLocalFiles` is not set.
    *   **Impact**: ~1-2MB data transfer per reload. Slows down startup.
    *   **Remediation**: Bundle files or use aggressive caching / `OTDalwaysUseLocalFiles` default.

*   **Sequential Fetches (`oldtd.org`)**:
    *   **Issue**: Scripts are fetched sequentially in a loop (Line 171 `src/injection.js`).
    *   **Impact**: Waterfall delay.
    *   **Remediation**: Use `Promise.all`.

*   **GraphQL Transformation**:
    *   **Issue**: Legacy polling (REST) is intercepted and converted to GraphQL (Line 721 `src/interception.js`).
    *   **Impact**: If legacy client polls every 2s, we send GraphQL requests every 2s.
    *   **Remediation**: Debounce polling or increase `refreshInterval`.

*   **Cookie Mirroring**:
    *   **Issue**: Due to the `injectAccount` bug, clicking "Accounts" can trigger hundreds of `setcookie` messages, causing a storm of `chrome.cookies.set` calls in `src/background3.js`.

## 4. Remediation Plan

1.  **Fix `injectAccount` Leak**: Immediately fix the `setInterval` assignment in `src/injection.js`.
2.  **Optimize `seenHomeTweets`**: Switch to `Set` and implement a size limit (FIFO).
3.  **Optimize Network**: Enable `OTDalwaysUseLocalFiles` or cache remote scripts. Parallelize `oldtd.org` fetches.
4.  **CPU Offloading**: Consider moving `parseTweet` to a Worker or time-slicing the processing loop.
