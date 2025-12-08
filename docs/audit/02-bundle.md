# Bundle Build Audit

**Generated:** 2025-12-08  
**Audited files:** `pack.js`, `files/*`, `src/interception.js`  
**Build benchmark:** 1.255s (real), 0.504s (user), 0.529s (sys)

---

## Table of Contents

1. [Current Packaging Workflow](#current-packaging-workflow)
2. [Bundle Statistics](#bundle-statistics)
3. [Embedded Libraries Analysis](#embedded-libraries-analysis)
4. [Optimization Opportunities](#optimization-opportunities)
5. [Code Splitting & Tree-Shaking Strategies](#code-splitting--tree-shaking-strategies)
6. [Modern Tooling Recommendations](#modern-tooling-recommendations)
7. [Measurable Targets](#measurable-targets)

---

## Current Packaging Workflow

### Overview of `pack.js`

The build script (`pack.js`) implements a **copy-based packaging workflow** with minimal transformation:

```
Source Files → Copy to Temp Folders → Patch Manifest → Zip → Cleanup
```

### Step-by-Step Process

1. **Directory Preparation** (lines 23-32)
   - Creates `build/` directory if missing
   - Removes existing temp folders for Chrome and Firefox
   - Ensures clean build state

2. **Full Project Copy** (lines 34-36)
   - Recursively copies entire project to `build/OldTweetDeckFirefox/`
   - Recursively copies entire project to `build/OldTweetDeckTempChrome/`
   - Excludes: `.git`, `.github`, `_metadata`, `node_modules`, `build`
   - **Redundancy**: All files copied twice, including large bundles (6+ MB each)

3. **Firefox Manifest Patching** (lines 38-73)
   - Converts `manifest_version: 3` → `manifest_version: 2`
   - Adds `browser_specific_settings.gecko` with extension ID
   - Converts `host_permissions` → `permissions` (MV2 format)
   - Adds `webRequest` and `webRequestBlocking` permissions
   - Removes `declarative_net_request` (MV3-only)
   - Removes `world: "MAIN"` from content scripts (MV2 incompatible)
   - Filters out `src/destroyer.js` from Firefox content scripts
   - Converts `background.service_worker` → `background.scripts`
   - Unwraps `web_accessible_resources` array format

4. **Cleanup** (lines 63-72)
   - Removes development files from both builds:
     - `pack.js`, `README.md`, `package.json`, `package-lock.json`, `.gitignore`
   - **Note**: No minification or optimization applied

5. **Zipping** (lines 77-94)
   - Creates `build/OldTweetDeckFirefox.zip` (~1.4 MB)
   - Creates `build/OldTweetDeckChrome.zip` (~1.4 MB)
   - Uses `adm-zip` library (synchronous, no compression level control)
   - **Note**: Zip compression reduces 7+ MB source to 1.4 MB (80% reduction)

6. **Final Cleanup** (lines 96-99)
   - Removes temporary folders
   - Leaves only final `.zip` artifacts

### Performance Characteristics

```bash
$ time npm run build
real    0m1.052s - 1.255s
user    0m0.433s - 0.504s
sys     0m0.379s - 0.529s
```

- **Total time**: ~1.05-1.25 seconds (varies by system load)
- **File I/O time**: ~0.38-0.53s (36-42% of total)
- **Computation**: ~0.43-0.50s (34-40% of total)
- **Overhead**: ~0.22-0.24s (18-21% of total)

### Redundant Operations

1. **Double Full Copy**: Entire 7+ MB project copied twice sequentially
2. **No Caching**: Every build starts from scratch
3. **Sync I/O**: `fs.unlinkSync`, `fs.writeFileSync` block execution
4. **No Parallelization**: Chrome and Firefox builds created sequentially
5. **No Minification**: Large bundles shipped as-is

### Lack of Build-Time Optimization

- No JavaScript minification (UglifyJS, Terser, esbuild)
- No CSS minification (csso, cssnano)
- No dead code elimination
- No source maps for debugging
- No asset fingerprinting/cache busting
- No bundle analysis or size reporting

---

## Bundle Statistics

### Asset Inventory

Generated via `scripts/audit/bundle-stats.mjs` (see [bundle-stats.json](data/bundle-stats.json)):

| File | Raw Size | Gzip | Brotli | Lines | Compression Ratio |
|------|----------|------|--------|-------|-------------------|
| **files/bundle.js** | 3.39 MB | 495.86 KB (14.28%) | 365.24 KB (10.52%) | 76,360 | 93× smaller (brotli) |
| **files/vendor.js** | 2.52 MB | 588.93 KB (22.84%) | 416.28 KB (16.14%) | 81,073 | 62× smaller (brotli) |
| **files/bundle.css** | 928.98 KB | 117.15 KB (12.61%) | 64.33 KB (6.92%) | 41,661 | 145× smaller (brotli) |
| **files/twitter-text.js** | 124.67 KB | 39.94 KB (32.04%) | 32.29 KB (25.90%) | 17 | 39× smaller (brotli) |
| **src/interception.js** | 133.13 KB | 18.87 KB (14.18%) | 15.96 KB (11.99%) | 2,899 | 83× smaller (brotli) |
| **TOTAL** | **7.07 MB** | **1.23 MB** | **894.09 KB** | **202,010** | **80× smaller (brotli)** |

### Key Observations

1. **Excellent Compression**: Brotli achieves 12.35% ratio (8× reduction)
2. **Large Monoliths**: Two 2.5+ MB JavaScript files dominate payload
3. **CSS Bloat**: Nearly 1 MB of CSS (likely includes unused legacy styles)
4. **Already Minified**: `twitter-text.js` is 17 lines (minified upstream)
5. **Interception Weight**: Main business logic is 133 KB (unminified)

### Checksum Records (for reproducible builds)

```
bundle.js:       b42357d34ef4bae66f62b6d9dd875e876cad0fe8f3960e6db298bb62a39edce7
vendor.js:       de38b4f35193737856f1301358f8f085f5b58d3d62f177c04d9a3d2cc9bed472
bundle.css:      d3da932799c75d4563295e158ac2dc9010f1401564a50b7b2941285b90033d13
twitter-text.js: fec94491b3bab8ef1f66e71b1ff5e2a1f607e700af4c20f9abd8b29dfdcd5acb
interception.js: 5e1518e096b828f7bf342ae4fcf86af47caa083afc64a7b6ba4dd686856f71ff
```

---

## Embedded Libraries Analysis

### Vendor Bundle (`files/vendor.js` - 2.52 MB)

Extracted via copyright notices and pattern matching:

```bash
$ grep -n "Copyright" files/vendor.js | head -30
```

#### Identified Libraries

| Library | Version | Size Est. | License | Notes |
|---------|---------|-----------|---------|-------|
| **jQuery** | v2.1.4 (2015) | ~240 KB | MIT | Line 11: "jQuery JavaScript Library v2.1.4"<br>Released 2015-04-28, **9+ years old** |
| **React** | v16.6.1 (2018) | ~120 KB | MIT | Line 54178+: "Copyright (c) Facebook, Inc."<br>**4 major versions behind** (current: v19) |
| **React-DOM** | v16.6.1 (2018) | ~180 KB | MIT | Bundled with React, includes legacy reconciler |
| **Flight** | v1.5.2 (2015) | ~50 KB | MIT | Line 35971: "Flight v1.5.2 &#124; (c) Twitter, Inc."<br>Twitter's component framework |
| **easyXDM** | 2009-2011 | ~40 KB | MIT | Line 59774: "easyXDM — Copyright(c) 2009-2011"<br>Cross-domain messaging (obsolete with postMessage) |
| **classnames** | Unknown | ~5 KB | MIT | Lines 6914+: "Copyright (c) 2016-2017 Jed Watson" |
| **Webpack Runtime** | Unknown | ~15 KB | — | Line 1: `window.webpackJsonp` array push pattern |

#### Legacy Polyfills and Utilities

```bash
$ grep -E "(Promise|WeakSet|WeakMap|Object\.assign)" files/vendor.js | wc -l
```

- ES6 Promise polyfill (~20 KB)
- WeakSet/WeakMap polyfills (lines 43033+)
- Multiple utility libraries embedded

#### Duplication Concerns

**Potential overlaps between vendor.js and bundle.js:**

```bash
$ grep "window.webpackJsonp" files/bundle.js
# Line 388: var o = (window.webpackJsonp = window.webpackJsonp || [])
```

Both bundles use webpack's JSONP loading mechanism, suggesting they were built from the same TweetDeck source but may contain redundant module resolution code.

### Main Bundle (`files/bundle.js` - 3.39 MB)

#### Key Components

```bash
$ grep -E "(Hogan|Mustache|TD\.)" files/bundle.js | head -20
```

| Component | Purpose | Size Est. |
|-----------|---------|-----------|
| **Hogan.js** | Mustache templating engine | ~25 KB |
| **TD.util** | TweetDeck utility namespace | ~50 KB |
| **Inline Templates** | 100+ Mustache templates for UI | ~200 KB |
| **Component Definitions** | React/Flight components | ~1.5 MB |
| **Business Logic** | Column management, API wrappers | ~800 KB |
| **Polyfills** | Duplicated from vendor.js? | ~100 KB |
| **Webpack Runtime** | Module loader | ~15 KB |

#### Template Example (found in bundle.js)

```html
'<div class="Card-video"> 
  {{#cardUsePublishedVideo}} 
    <iframe class="Card-videoIframe" src="https://twitter.com/i/videos/{{tweetId}}?square_corners=1"></iframe>
  {{/cardUsePublishedVideo}}
  {{^cardUsePublishedVideo}}
    <iframe class="Card-videoIframe" {{#cardVideoPosterImageOnly}}data-{{/cardVideoPosterImageOnly}}src="https://twitter.com/i/videos/static?json_rpc=1&square_corners=1..."></iframe>
    <button class="Card-videoPosterImageContainer">
      <img alt="" class="Card-videoPosterImage" src="{{rawPosterImageUrl}}" />
      <span class="Card-videoPosterImagePlayButton Icon Icon--playButton"></span>
    </button>
  {{/cardUsePublishedVideo}}
</div>'
```

**Issue**: Templates inlined as strings (not pre-compiled) → runtime parsing overhead

### Extension Scripts (not in bundles)

| File | Size | Purpose | Optimization Potential |
|------|------|---------|----------------------|
| `src/interception.js` | 133 KB | GraphQL → Legacy API translation | **HIGH** - Could be split by feature |
| `src/challenge.js` | 7.8 KB | Challenge solver iframe | **MEDIUM** - Could be lazy-loaded |
| `src/injection.js` | 8.7 KB | DOM replacement orchestrator | **LOW** - Core bootstrapping |
| `src/background.js` | 5.5 KB | MV2 background (webRequest) | **LOW** - Platform-specific |
| `src/background3.js` | 1.6 KB | MV3 service worker | **LOW** - Platform-specific |
| `src/notifications.js` | 5.7 KB | Modal announcements | **MEDIUM** - Could be lazy-loaded |
| `src/destroyer.js` | 1.7 KB | Chrome-only SPA sabotage | **LOW** - Critical for Chrome |
| `src/content.js` | 682 B | Bridge script | **NONE** |

---

## Optimization Opportunities

### 1. Minification (Est. 30-40% size reduction)

**Current State**: No minification applied to any assets.

**Impact**:
```
bundle.js:  3.39 MB → ~2.0 MB (minified) → ~280 KB (minified + brotli)
vendor.js:  2.52 MB → ~1.5 MB (minified) → ~300 KB (minified + brotli)
bundle.css: 929 KB → ~600 KB (minified) → ~45 KB (minified + brotli)
```

**Tooling Options**:
- **Terser** (best for webpack bundles): `npx terser bundle.js -o bundle.min.js -c -m`
- **esbuild** (fastest): `esbuild bundle.js --minify --outfile=bundle.min.js`
- **csso** (CSS): `npx csso bundle.css -o bundle.min.css`

**Affected Files**: All files in `files/`, `src/interception.js`

### 2. Dead Code Elimination (Est. 10-20% reduction)

**Issue**: Webpack bundles likely contain unused exports and polyfills.

**Example Checks**:
```bash
# Check for unused jQuery methods
grep -o '\$\.\w\+' files/bundle.js | sort -u | wc -l  # All jQuery static methods
# vs actual usage in codebase

# Check for unused React features
grep -E "(useContext|useReducer|Suspense|lazy)" files/vendor.js
# If not found but React includes them → dead code
```

**Strategy**:
- Re-bundle with `sideEffects: false` in package.json
- Enable webpack's `optimization.usedExports`
- Use Rollup's tree-shaking for better results

**Affected Files**: `files/vendor.js`, `files/bundle.js`

### 3. Library Updates (Security + Size)

**Outdated Dependencies**:

| Library | Current | Latest | Security Issues | Size Delta |
|---------|---------|--------|-----------------|------------|
| jQuery | 2.1.4 (2015) | 3.7.1 | CVE-2015-9251, CVE-2019-11358, CVE-2020-11022, CVE-2020-11023 | +50 KB (3.x adds features) |
| React | 16.6.1 (2018) | 19.0.0 | None critical | -30 KB (newer faster) |

**Recommendation**:
- **jQuery**: Consider removal or slim build (Ajax + core only)
- **React**: Upgrade to 18.x (backwards compatible, faster reconciler)
- **Flight**: Already archived by Twitter, but no CVEs

**Risk**: Breaking changes in TweetDeck's legacy code (needs testing)

**Affected Files**: `files/vendor.js` (requires re-bundling from source)

### 4. CSS Purging (Est. 20-30% reduction)

**Issue**: 929 KB CSS likely includes unused legacy styles.

**Analysis**:
```bash
$ grep -oE '\.[a-zA-Z0-9_-]+' files/bundle.css | sort -u | wc -l
# Unique classes: ~5000+

$ grep -oE 'class="[^"]*"' files/bundle.js | grep -oE '\.[a-zA-Z0-9_-]+' | sort -u | wc -l
# Used in JS: ~800
```

**Strategy**:
- Run PurgeCSS against `files/bundle.js` and `files/index.html`
- Whitelist dynamic classes (e.g., `is-*`, `js-*`, `Card-*`)
- Test with multiple column types to avoid removing active styles

**Tooling**:
```bash
npx purgecss --css files/bundle.css --content files/bundle.js files/index.html --output files/bundle.purged.css
```

**Affected Files**: `files/bundle.css`

### 5. Template Pre-compilation (Est. 5-10% reduction)

**Issue**: Mustache templates stored as strings, parsed at runtime.

**Current** (in `bundle.js`):
```javascript
'<div class="Card-video"> {{#cardUsePublishedVideo}} ... </div>'
```

**Optimized**:
```javascript
// Pre-compiled Hogan template
{code: function(c,p,i){var t=this;t.b(i=i||"");t.b("<div class=\"Card-video\">");...}}
```

**Strategy**:
- Extract template strings from bundle.js
- Pre-compile with `hogan.js` compiler
- Replace inline strings with compiled functions

**Impact**:
- ~100-200 KB raw size reduction
- Faster runtime rendering (no parse step)

**Affected Files**: `files/bundle.js` (requires source access or regex extraction)

### 6. Asset Duplication Check

**Suspected Overlap**:

```bash
# Check if vendor.js and bundle.js share module IDs
$ grep -oE 'function\(t,e,n\)\{' files/vendor.js | head -1
# function(t,e,n){  ← webpack module wrapper

$ grep -oE 'function\(t,e,n\)\{' files/bundle.js | head -1
# function(t,e,n){  ← same pattern
```

Both use webpack's UMD wrapper → potential for shared chunk extraction.

**Test**:
```bash
# Extract module IDs from both bundles
grep -oE '\[([0-9]+)\]=' files/vendor.js | sort -u > vendor_modules.txt
grep -oE '\[([0-9]+)\]=' files/bundle.js | sort -u > bundle_modules.txt
comm -12 vendor_modules.txt bundle_modules.txt  # Common modules
```

**If duplicates found**: Re-bundle with shared `runtime` chunk.

**Affected Files**: `files/vendor.js`, `files/bundle.js`

---

## Code Splitting & Tree-Shaking Strategies

### Current Loading Pattern

From `src/injection.js` (lines 32-162):

```javascript
// All assets loaded serially, blocking render
await Promise.allSettled([
    fetch(chrome.runtime.getURL("/src/challenge.js")),      // 7.8 KB
    fetch(chrome.runtime.getURL("/src/interception.js")),   // 133 KB
    fetch(chrome.runtime.getURL("/files/vendor.js")),       // 2.52 MB ← BLOCKS
    fetch(chrome.runtime.getURL("/files/bundle.js")),       // 3.39 MB ← BLOCKS
    fetch(chrome.runtime.getURL("/files/bundle.css")),      // 929 KB
    fetch(chrome.runtime.getURL("/files/twitter-text.js")), // 125 KB
]);

// Then attempts remote updates (optional)
// Then injects all scripts into <head>
```

**Problem**: 7 MB+ downloaded before first paint, even if user only uses one column type.

### Proposed Split Strategy

#### Phase 1: Defer Non-Critical Scripts

```javascript
// Critical path (inject immediately)
- files/vendor.js         // React, jQuery (core dependencies)
- files/bundle.js         // UI framework
- files/bundle.css        // Layout styles
- src/interception.js     // API proxy (needed for first column)

// Deferred (lazy load)
- src/challenge.js        // Only when challenge detected
- files/twitter-text.js   // Only when composing tweet
- src/notifications.js    // After 5s idle time
```

**Implementation**:
```javascript
// In injection.js
async function lazyLoadChallenge() {
    if (window.challengeNeeded) {
        const script = await fetch(chrome.runtime.getURL("/src/challenge.js")).then(r => r.text());
        eval(script); // or inject <script> tag
    }
}

// In interception.js
if (response.status === 403 && response.headers.get('x-challenge')) {
    window.challengeNeeded = true;
    await lazyLoadChallenge();
}
```

**Impact**: 7.8 KB removed from critical path (challenge.js loaded on-demand)

**Affected Files**: `src/injection.js`, `src/interception.js`

#### Phase 2: Split Interception by Feature

**Current** (`src/interception.js` - 2899 lines):

```javascript
// All features in one monolith
- GraphQL → Legacy translation
- Timeline cursors & caching
- Notification deduping
- Follow cache management
- Column import/export
- Settings persistence
- DM crypto handling
```

**Proposed** (modular):

```
src/interception/
├── core.js           (100 lines) - Fetch interceptor, PUBLIC_TOKENS
├── timeline.js       (600 lines) - Tweet normalization, cursors
├── notifications.js  (400 lines) - Notification deduping, persistence
├── dms.js            (300 lines) - DM threads, crypto key handling
├── lists.js          (200 lines) - List management
├── search.js         (150 lines) - Search API proxying
├── settings.js       (300 lines) - Import/export, localStorage
├── follow-cache.js   (200 lines) - Follow/block/mute caching
└── index.js          (50 lines)  - Lazy loader
```

**Loading Strategy**:
```javascript
// In src/interception/index.js
const modules = {
    timeline: () => import('./timeline.js'),
    notifications: () => import('./notifications.js'),
    dms: () => import('./dms.js'),
    lists: () => import('./lists.js'),
    search: () => import('./search.js'),
};

window.addEventListener('columnAdded', (e) => {
    const columnType = e.detail.type; // 'timeline', 'notifications', etc.
    if (!loadedModules[columnType]) {
        modules[columnType]().then(mod => mod.init());
    }
});
```

**Impact**:
- Initial: ~20 KB (core.js + timeline.js) vs 133 KB
- Per-column lazy load: ~20-40 KB each
- User with 3 columns: 60-80 KB vs 133 KB (40% reduction)

**Challenge**: Extension `import()` requires ES modules, not supported in MV2 content scripts.  
**Workaround**: Use dynamic `fetch()` + `eval()` or inline webpack's `__webpack_require__` shim.

**Affected Files**: `src/interception.js` → split into 9 files

#### Phase 3: Vendor Bundle Splitting

**Current**: Single `vendor.js` with jQuery + React + Flight + polyfills.

**Proposed**:
```
files/
├── vendor-core.js       (jQuery + utilities) - 300 KB
├── vendor-react.js      (React + React-DOM)  - 350 KB
├── vendor-flight.js     (Flight framework)   - 50 KB
└── vendor-polyfills.js  (ES6 shims)          - 40 KB
```

**Loading**:
```javascript
// Always load core
await fetch(chrome.runtime.getURL("/files/vendor-core.js"));

// Load React only if React components used (not on mobile?)
if (needsReact) {
    await fetch(chrome.runtime.getURL("/files/vendor-react.js"));
}
```

**Impact**: Mobile/low-spec users skip 350 KB React bundle if using legacy UI only.

**Challenge**: Requires re-bundling from TweetDeck source with webpack `splitChunks` config.

**Affected Files**: `files/vendor.js` → split into 4 files

#### Phase 4: CSS Code Splitting

**Current**: Single 929 KB `bundle.css` with all styles.

**Proposed**:
```
files/
├── bundle-core.css       (Layout, typography, base components) - 200 KB
├── bundle-timeline.css   (Tweet cards, media, modals)          - 250 KB
├── bundle-dms.css        (DM threads, compose)                 - 150 KB
├── bundle-compose.css    (Tweet composer, media upload)        - 100 KB
└── bundle-settings.css   (Settings panels, modals)             - 100 KB
```

**Loading** (in injection.js):
```javascript
// Load core CSS immediately
const coreCSS = await fetch(chrome.runtime.getURL("/files/bundle-core.css")).then(r => r.text());
document.head.appendChild(createStyleElement(coreCSS));

// Load per-feature CSS on demand
window.addEventListener('columnAdded', async (e) => {
    const type = e.detail.type;
    const css = await fetch(chrome.runtime.getURL(`/files/bundle-${type}.css`)).then(r => r.text());
    document.head.appendChild(createStyleElement(css));
});
```

**Impact**:
- Initial: 200 KB vs 929 KB (78% reduction)
- Full app with 3 columns: ~650 KB vs 929 KB (30% reduction)

**Challenge**: Requires analyzing CSS selectors to determine feature boundaries.

**Affected Files**: `files/bundle.css` → split into 5 files

### Tree-Shaking Prerequisites

To enable tree-shaking in a modern bundler:

1. **Convert to ES Modules**:
   ```javascript
   // Instead of: var utils = require('./utils');
   import { formatDate, parseJSON } from './utils.js';
   ```

2. **Mark Side-Effect-Free**:
   ```json
   // In package.json
   {
       "sideEffects": false,
       // or
       "sideEffects": ["*.css", "src/polyfills.js"]
   }
   ```

3. **Use Named Exports**:
   ```javascript
   // Instead of: module.exports = { a, b, c };
   export { a, b, c };
   ```

4. **Enable Bundler Flags**:
   ```javascript
   // Rollup
   export default {
       treeshake: {
           moduleSideEffects: false,
           propertyReadSideEffects: false,
       }
   };

   // Webpack
   optimization: {
       usedExports: true,
       sideEffects: true,
   }
   ```

**Caveat**: `files/vendor.js` and `files/bundle.js` are pre-compiled artifacts, not source. Tree-shaking requires original TweetDeck source code access.

---

## Modern Tooling Recommendations

### Option 1: Minimal Changes (Add Minification to `pack.js`)

**Goal**: Keep copy-based workflow, add compression step.

**Changes to `pack.js`**:

```javascript
const { minify } = require('terser');
const csso = require('csso');

// After copying files, before zipping:
async function minifyAssets(buildDir) {
    const jsFiles = ['files/bundle.js', 'files/vendor.js', 'src/interception.js'];
    for (const file of jsFiles) {
        const path = `${buildDir}/${file}`;
        const code = fs.readFileSync(path, 'utf8');
        const result = await minify(code, { 
            compress: { passes: 2 },
            mangle: true 
        });
        fs.writeFileSync(path, result.code);
    }

    const cssPath = `${buildDir}/files/bundle.css`;
    const css = fs.readFileSync(cssPath, 'utf8');
    const minified = csso.minify(css).css;
    fs.writeFileSync(cssPath, minified);
}

// Call before zipping
await minifyAssets('./build/OldTweetDeckFirefox');
await minifyAssets('./build/OldTweetDeckTempChrome');
```

**Pros**:
- Low risk (no architecture changes)
- 30-40% size reduction
- ~2-3 second build time increase

**Cons**:
- Still no code splitting
- Still double-copy workflow
- Minification slow with Terser (better with esbuild)

**Estimated Build Time**: 3-4 seconds (was 1.25s)

**Affected Files**: `pack.js` (+40 lines)

---

### Option 2: Hybrid (Add esbuild for Scripts Only)

**Goal**: Use esbuild to minify JS, keep copy workflow for other assets.

**New Structure**:
```
scripts/
└── minify-bundles.mjs  ← esbuild wrapper

pack.js (modified to call minify-bundles.mjs)
```

**`scripts/minify-bundles.mjs`**:
```javascript
import * as esbuild from 'esbuild';
import fs from 'fs';

const files = [
    'files/bundle.js',
    'files/vendor.js',
    'src/interception.js'
];

for (const file of files) {
    await esbuild.build({
        entryPoints: [file],
        outfile: file,
        allowOverwrite: true,
        minify: true,
        target: 'chrome90',
        format: 'iife', // Keep as-is (not ESM)
    });
}
```

**Modified `pack.js`**:
```javascript
const { execSync } = require('child_process');

// After copying, before zipping:
execSync('node scripts/minify-bundles.mjs');
```

**Pros**:
- 10× faster than Terser
- Simple integration
- 35-45% size reduction

**Cons**:
- Still copy-based workflow
- No tree-shaking (files are already bundled)

**Estimated Build Time**: 1.5-2 seconds (only +0.25-0.5s)

**Affected Files**: `pack.js` (+5 lines), `scripts/minify-bundles.mjs` (new)

---

### Option 3: Full Rebuild (esbuild Replaces pack.js)

**Goal**: Replace entire workflow with esbuild-based pipeline.

**New Structure**:
```
build.config.mjs           ← Build configuration
scripts/
├── build-chrome.mjs       ← Chrome MV3 build
├── build-firefox.mjs      ← Firefox MV2 build
└── common.mjs             ← Shared build logic
```

**`build.config.mjs`**:
```javascript
import * as esbuild from 'esbuild';

export const commonConfig = {
    bundle: false, // Don't re-bundle vendor.js (already bundled)
    minify: true,
    target: 'chrome90',
    platform: 'browser',
};

export async function buildExtension(platform) {
    // 1. Copy static assets
    // 2. Minify JS with esbuild
    // 3. Minify CSS with esbuild CSS loader
    // 4. Transform manifest
    // 5. Create zip
}
```

**Pros**:
- Unified build system
- Fast (entire build <1s)
- Easy to add source maps
- Can enable tree-shaking if we modularize scripts

**Cons**:
- Requires refactoring `pack.js` (~200 lines)
- Need to handle manifest patching in new system
- Risk of breaking existing workflow

**Estimated Build Time**: 0.5-1 second (faster than current!)

**Affected Files**: `pack.js` (replace with build.config.mjs), `package.json` (update scripts)

---

### Option 4: Full Modular Pipeline (Rollup + Code Splitting)

**Goal**: Maximum optimization with true tree-shaking and code splitting.

**Prerequisites**:
1. Convert `src/*.js` to ES modules
2. Split `src/interception.js` into sub-modules
3. Create `src/index.js` entry points for each build target

**New Structure**:
```
rollup.config.mjs          ← Rollup configuration
src/
├── interception/
│   ├── core.js
│   ├── timeline.js
│   ├── notifications.js
│   └── index.js           ← Entry point
├── chrome-entry.js        ← Chrome MV3 entry
└── firefox-entry.js       ← Firefox MV2 entry
```

**`rollup.config.mjs`**:
```javascript
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

export default defineConfig([
    {
        input: 'src/chrome-entry.js',
        output: {
            dir: 'build/chrome',
            format: 'iife',
            chunkFileNames: 'chunks/[name]-[hash].js',
        },
        plugins: [
            terser(),
            copy({ targets: [{ src: 'files/*', dest: 'build/chrome/files' }] }),
        ],
    },
    {
        input: 'src/firefox-entry.js',
        output: {
            dir: 'build/firefox',
            format: 'iife',
        },
        plugins: [/* same */],
    },
]);
```

**Pros**:
- Best tree-shaking (only used code included)
- Automatic code splitting
- Modern build pipeline
- Source maps support
- Can update libraries easily

**Cons**:
- Major refactor (1-2 days work)
- Risk of breaking existing code
- Must test all extension features
- Cannot optimize pre-compiled `vendor.js`/`bundle.js` without TweetDeck source

**Estimated Build Time**: 2-3 seconds (includes tree-shaking analysis)

**Affected Files**: All `src/*.js` (convert to ESM), new `rollup.config.mjs`, `package.json`

---

### Recommendation: Phased Approach

1. **Immediate** (this week): Option 2 (esbuild minification) → 35% size reduction, <1 hour work
2. **Short-term** (next sprint): Add `scripts/audit/bundle-stats.mjs` to CI → track size regressions
3. **Medium-term** (1 month): Option 3 (esbuild build system) → 40% reduction, cleaner pipeline
4. **Long-term** (3 months): Split `interception.js` + lazy loading → 50-60% reduction for typical users

### Compatibility Matrix

| Tool | MV2 (Firefox) | MV3 (Chrome) | Tree-Shaking | Minify | Source Maps |
|------|---------------|--------------|--------------|--------|-------------|
| **Current (pack.js)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **+ Terser** | ✅ | ✅ | ❌ | ✅ | ⚠️ (manual) |
| **+ esbuild** | ✅ | ✅ | ⚠️ (limited) | ✅ | ✅ |
| **+ Rollup** | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Measurable Targets

### Size Budgets (per asset)

| Asset | Current | Target (Minified) | Target (Min+Split) | Compression |
|-------|---------|-------------------|--------------------|-------------|
| **JavaScript (total)** | 6.20 MB | 3.60 MB (-42%) | 2.40 MB (-61%) | Brotli: <800 KB |
| - bundle.js | 3.39 MB | 2.00 MB | 1.20 MB (split 3×) | — |
| - vendor.js | 2.52 MB | 1.50 MB | 1.10 MB (split 3×) | — |
| - interception.js | 133 KB | 75 KB | 45 KB (split 5×) | — |
| - challenge.js | 7.8 KB | 5 KB | 5 KB (lazy) | — |
| - twitter-text.js | 125 KB | 125 KB | 125 KB | — |
| **CSS (total)** | 929 KB | 600 KB (-35%) | 350 KB (-62%) | Brotli: <40 KB |
| **Extension Package** | 7.07 MB raw | 4.20 MB | 2.79 MB | Zip: ~1.4 MB current, <1.0 MB target |

### Performance Targets

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Build Time** | 1.255s | <5s (with minify) | `time npm run build` |
| **First Paint** | Unknown | <1.5s (WiFi) | DevTools Performance |
| **Time to Interactive** | Unknown | <3s (WiFi) | When columns load |
| **Memory Usage (idle)** | Unknown | <150 MB | Chrome Task Manager |
| **Bundle Parse Time** | Unknown | <500ms | DevTools Coverage tab |

### Quality Gates (CI checks)

1. **Size Regression Check**:
   ```bash
   node scripts/audit/bundle-stats.mjs
   # Fail if total raw size > 4.5 MB (minified target + 20% buffer)
   ```

2. **Build Performance**:
   ```bash
   time npm run build
   # Warn if >5s, fail if >10s
   ```

3. **Compression Ratio**:
   ```bash
   # Ensure brotli ratio stays <15%
   brotli -c files/bundle.js | wc -c
   ```

4. **Dead Code Detection**:
   ```bash
   # Fail if console.log() or debugger statements found
   grep -r 'console\.log\|debugger' build/
   ```

### Rollout Plan

| Phase | Changes | Size Impact | Risk | Timeline |
|-------|---------|-------------|------|----------|
| **Phase 0** | Add bundle-stats.mjs to repo | 0% | None | ✅ Done |
| **Phase 1** | esbuild minification in pack.js | -35% | Low | Week 1 |
| **Phase 2** | CSS purging (remove unused styles) | -40% | Medium | Week 2 |
| **Phase 3** | Lazy-load challenge.js & notifications.js | -42% | Low | Week 3 |
| **Phase 4** | Split interception.js by feature | -55% | High | Month 2 |
| **Phase 5** | Re-bundle vendor.js with modern tools | -60% | High | Month 3+ |

### Success Criteria

- [ ] Total extension size <3 MB (uncompressed)
- [ ] Build completes in <5 seconds
- [ ] All existing features work (tested on Chrome + Firefox)
- [ ] No performance regressions (measured via Core Web Vitals)
- [ ] Documentation updated (this file + README)
- [ ] CI pipeline includes size checks

---

## Appendix: File Dependencies

### Critical Path (affects first render)

```
src/injection.js
└── files/index.html
    └── files/bundle.css ← Layout/styles
    └── files/vendor.js ← jQuery, React, Flight
        └── files/bundle.js ← UI components
            └── src/interception.js ← API proxy
```

### On-Demand (lazy loadable)

```
src/challenge.js     ← Only when 403 challenge response
src/notifications.js ← Only after 1hr idle (fetches oldtd.org)
files/twitter-text.js ← Only when composing tweet
```

### Background/Isolated (not in page)

```
src/background.js (MV2)   ← webRequest blocking
src/background3.js (MV3)  ← declarativeNetRequest
src/content.js            ← Bridge postMessage
src/destroyer.js          ← Chrome-only (sabotage SPA)
```

---

## Appendix: Build Output Structure

### Current `build/` Directory

```
build/
├── OldTweetDeckChrome.zip     (1.4 MB compressed)
│   ├── files/
│   │   ├── bundle.js          (3.39 MB)
│   │   ├── vendor.js          (2.52 MB)
│   │   ├── bundle.css         (929 KB)
│   │   ├── twitter-text.js    (125 KB)
│   │   └── index.html         (2.3 KB)
│   ├── src/
│   │   ├── interception.js    (133 KB)
│   │   ├── challenge.js       (7.8 KB)
│   │   ├── injection.js       (8.7 KB)
│   │   ├── background3.js     (1.6 KB) ← MV3 only
│   │   ├── content.js         (682 B)
│   │   ├── destroyer.js       (1.7 KB) ← Chrome only
│   │   └── notifications.js   (5.7 KB)
│   ├── images/
│   │   └── icon*.png
│   ├── manifest.json          (MV3 format)
│   └── ruleset.json           (DNR rules)
│
└── OldTweetDeckFirefox.zip    (1.4 MB compressed)
    ├── (same as Chrome)
    ├── src/background.js      (5.5 KB) ← MV2 only, no destroyer.js
    └── manifest.json          (MV2 format, patched)
```

### Optimized Build (proposed)

```
build/
├── OldTweetDeckChrome.zip     (<2 MB)
│   ├── files/
│   │   ├── core.min.js        (1.5 MB, vendor+bundle merged)
│   │   ├── bundle.min.css     (350 KB, purged)
│   │   └── index.html
│   ├── chunks/
│   │   ├── timeline-abc123.js (150 KB, lazy)
│   │   ├── dms-def456.js      (120 KB, lazy)
│   │   └── challenge-ghi789.js (5 KB, lazy)
│   └── (same structure as current)
│
└── OldTweetDeckFirefox.zip    (<2 MB)
    └── (same as Chrome)
```

---

**End of Bundle Build Audit**

For questions or suggestions, see [contributing guidelines](../../CONTRIBUTING.md) or open a GitHub issue.
