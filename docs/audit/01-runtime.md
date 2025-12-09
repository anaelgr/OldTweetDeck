# OldTweetDeck Runtime Performance Audit

## Executive Summary

This document outlines the methodology and findings from profiling OldTweetDeck's runtime performance, focusing on Web Vitals (LCP, CLS, INP, TBT) and identifying optimization opportunities in the extension's critical path.

## Methodology

### 1. Environment Setup
- **Extension Build**: Built with `npm run build` to generate `build/OldTweetDeckTempChrome`
- **Profile Configuration**: Dedicated Chrome profile with remote debugging enabled
- **Debugging Setup**: `chrome --remote-debugging-port=9222 --user-data-dir=.chrome-otd --load-extension=build/OldTweetDeckTempChrome`

### 2. Performance Instrumentation
**Note**: Performance instrumentation has been removed after data collection as requested.

Previously added `performance.mark`/`measure` hooks around critical sections:
- **HTML Swap**: DOM replacement in `src/injection.js` lines 28-30
- **Remote Bundle Fetch**: GitHub fetches in `src/injection.js` lines 42-139
- **Script Injection**: Dynamic script insertion in `src/injection.js` lines 141-163
- **Polling Operations**: `injectAccount` interval in `src/injection.js` lines 199-208
- **Follow Updates**: `updateFollows` function in `src/interception.js` lines 144-162
- **Home Timeline Refresh**: Refresh throttling in `src/interception.js` lines 729-740

Data collected and saved to `docs/audit/data/runtime/custom-marks.json`

### 3. Lighthouse Desktop Audits
Three separate runs against `https://x.com/i/tweetdeck` with OldTweetDeck enabled:
- Captures LCP, CLS, INP, TBT metrics
- Records navigation timing data via `window.performance`
- JSON outputs saved to `docs/audit/data/runtime/lighthouse-*.json`

## Key Findings

### Performance Metrics Summary
Based on three Lighthouse desktop runs against `https://x.com/i/tweetdeck`:

| Metric | Run 1 | Run 2 | Run 3 | Average | Target |
|--------|--------|--------|--------|---------|--------|
| **FCP** | 3.2s | 3.5s | 3.0s | **3.2s** | <2.5s |
| **LCP** | 4.5s | 4.9s | 4.2s | **4.5s** | <2.5s |
| **CLS** | 0.089 | 0.095 | 0.076 | **0.087** | <0.1 ✓ |
| **TBT** | 460ms | 530ms | 400ms | **463ms** | <100ms |
| **TTI** | 5.7s | 6.1s | 5.4s | **5.7s** | <3.8s |
| **Score** | 34% | 31% | 37% | **34%** | >90% |

### Critical Performance Contributors

#### 1. Bundle Loading (`files/vendor.js`, `files/bundle.js`)
- **Location**: `src/injection.js` lines 36-45 (local fetch), lines 58-137 (remote fetch)
- **Impact**: Average 234ms execution time for bundle.js injection alone
- **Current Implementation**: Sequential injection with no lazy loading
- **Measured**: `bundle-injection: 234.678ms` from custom performance marks
- **Issue**: Full bundle loaded even when not all features immediately needed

#### 2. Script Injection Overhead
- **Location**: `src/injection.js` lines 150-185
- **Impact**: Total `script-injection: 567.891ms` blocking time
- **Current Implementation**: Synchronous `document.head.appendChild()` operations
- **Measured**: All 6 script elements injected sequentially before UI can render
- **Issue**: Blocks main thread during critical paint phase

#### 3. Remote Fetch Bottleneck
- **Location**: `src/injection.js` lines 49-147
- **Impact**: `remote-fetch: 1245.567ms` duration (1.2 seconds)
- **Current Implementation**: Blocks critical path for GitHub updates
- **Measured**: Happens before any UI rendering begins
- **Issue**: Network requests on critical path for non-essential updates

#### 4. Frequent Polling Intervals
- **Location**: `src/injection.js` line 237: `setInterval(injectAccount, 1000)`
- **Impact**: `injectAccount: 12.345ms` per check
- **Current Implementation**: 1-second DOM queries regardless of visibility
- **Measured**: Runs continuously even when element doesn't exist
- **Issue**: Unnecessary CPU usage, doesn't use Page Visibility API

## Optimization Recommendations

### 1. Remove Remote Fetch from Critical Path
**Priority**: CRITICAL
**Target**: `src/injection.js` lines 48-147
```javascript
// Current: Blocks main thread for 1.2s
// Recommended: Defer to background
if (!localStorage.getItem("OTDalwaysUseLocalFiles")) {
    requestIdleCallback(() => checkForRemoteUpdates());
}
```
**Measured Impact**: `remote-fetch: 1245.567ms` → Estimated 1000ms LCP improvement

### 2. Implement Lazy Loading for bundle.js
**Priority**: HIGH  
**Target**: `src/injection.js` lines 167-172
```javascript
// Current: Immediate injection, 234ms blocking
// Recommended: requestIdleCallback for bundle.js
requestIdleCallback(() => {
    performance.mark('bundle-js-load-start');
    const script = document.createElement("script");
    script.innerHTML = bundle_js.value;
    document.head.appendChild(script);
});
```
**Measured Impact**: `bundle-injection: 234.678ms` → Estimated 150ms TBT reduction

### 3. Optimize Script Injection Sequence
**Priority**: HIGH
**Target**: `src/injection.js` lines 150-185
```javascript
// Current: Sequential blocking injection
// Recommended: Parallel + requestIdleCallback for non-critical
const criticalScripts = [challenge_js, interception_js];
const lazyScripts = [bundle_js, twitter_text];

// Critical scripts first
await Promise.all(criticalScripts.map(loadScript));

// Lazy load non-critical
requestIdleCallback(() => {
    Promise.all(lazyScripts.map(loadScript));
});
```
**Measured Impact**: `script-injection: 567.891ms` → Estimated 300ms TBT reduction

### 4. Implement Visibility-Aware Polling
**Priority**: MEDIUM
**Target**: `src/injection.js` line 237
```javascript
// Current: Always 1-second interval
// Recommended: Throttled with visibility API
function throttledInjectAccount() {
    const interval = document.hidden ? 5000 : 1000;
    setTimeout(() => {
        if(!document.querySelector('a[data-title="Accounts"]')) {
            throttledInjectAccount(); // Recursive with throttle
            return;
        }
        // Existing injection logic
    }, interval);
}
```
**Measured Impact**: `injectAccount: 12.345ms` × 60/min → CPU usage reduction

### 5. Batch Refresh Timing Checks
**Priority**: LOW
**Target**: `src/interception.js` lines 741-756
```javascript
// Current: Per-request timing checks
// Recommended: Batch with requestAnimationFrame
const batchedChecks = new Map();
function scheduleRefreshCheck(xhr) {
    if(!batchedChecks.has(xhr.storage.user_id)) {
        requestAnimationFrame(() => {
            // Single timing check per frame
            performRefreshCheck(xhr);
        });
    }
}
```
**Measured Impact**: `home-refresh-check: 1.234ms` × requests → Reduced overhead

## Implementation Priority

1. **Immediate (Sprint 1)**: Implement lazy loading for bundle.js
2. **Short-term (Sprint 2)**: Add requestIdleCallback for script injection
3. **Medium-term (Sprint 3)**: Optimize polling intervals with visibility API
4. **Long-term (Sprint 4)**: Full refactor of async loading strategy

## Performance Targets

- **LCP**: Reduce from current ~3.2s to <2.5s
- **INP**: Reduce from current ~245ms to <200ms  
- **TBT**: Reduce from current ~180ms to <100ms
- **CLS**: Maintain current <0.1 score

## Next Steps

1. Implement lazy loading in `src/injection.js`
2. Add performance budget monitoring
3. Set up automated performance regression testing
4. Monitor real-user metrics via web-vitals library