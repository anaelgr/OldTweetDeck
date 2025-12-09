import fs from 'fs';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { gzip, brotliCompress } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const FILES_TO_ANALYZE = [
    'files/bundle.js',
    'files/vendor.js',
    'files/bundle.css',
    'files/twitter-text.js',
    'src/interception.js'
];

async function analyzeFile(filePath) {
    const absolutePath = path.join(projectRoot, filePath);
    
    if (!fs.existsSync(absolutePath)) {
        console.warn(`File not found: ${filePath}`);
        return null;
    }

    const content = fs.readFileSync(absolutePath);
    const rawSize = content.length;
    
    const gzipped = await gzipAsync(content, { level: 9 });
    const gzipSize = gzipped.length;
    
    const brotlied = await brotliAsync(content);
    const brotliSize = brotlied.length;
    
    const hash = createHash('sha256');
    hash.update(content);
    const checksum = hash.digest('hex');
    
    const lines = content.toString('utf-8').split('\n').length;
    
    return {
        path: filePath,
        rawSize,
        rawSizeHuman: formatBytes(rawSize),
        gzipSize,
        gzipSizeHuman: formatBytes(gzipSize),
        brotliSize,
        brotliSizeHuman: formatBytes(brotliSize),
        gzipRatio: ((gzipSize / rawSize) * 100).toFixed(2) + '%',
        brotliRatio: ((brotliSize / rawSize) * 100).toFixed(2) + '%',
        lines,
        checksum,
        timestamp: new Date().toISOString()
    };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function generateBundleStats() {
    console.log('🔍 Analyzing bundle files...\n');
    
    const results = {
        generatedAt: new Date().toISOString(),
        files: {}
    };
    
    for (const file of FILES_TO_ANALYZE) {
        console.log(`Analyzing ${file}...`);
        const stats = await analyzeFile(file);
        if (stats) {
            results.files[file] = stats;
            console.log(`  Raw: ${stats.rawSizeHuman} | Gzip: ${stats.gzipSizeHuman} (${stats.gzipRatio}) | Brotli: ${stats.brotliSizeHuman} (${stats.brotliRatio})`);
        }
    }
    
    const totalRaw = Object.values(results.files).reduce((sum, f) => sum + f.rawSize, 0);
    const totalGzip = Object.values(results.files).reduce((sum, f) => sum + f.gzipSize, 0);
    const totalBrotli = Object.values(results.files).reduce((sum, f) => sum + f.brotliSize, 0);
    
    results.totals = {
        rawSize: totalRaw,
        rawSizeHuman: formatBytes(totalRaw),
        gzipSize: totalGzip,
        gzipSizeHuman: formatBytes(totalGzip),
        brotliSize: totalBrotli,
        brotliSizeHuman: formatBytes(totalBrotli),
        gzipRatio: ((totalGzip / totalRaw) * 100).toFixed(2) + '%',
        brotliRatio: ((totalBrotli / totalRaw) * 100).toFixed(2) + '%'
    };
    
    console.log('\n📊 Total Statistics:');
    console.log(`  Raw: ${results.totals.rawSizeHuman}`);
    console.log(`  Gzip: ${results.totals.gzipSizeHuman} (${results.totals.gzipRatio})`);
    console.log(`  Brotli: ${results.totals.brotliSizeHuman} (${results.totals.brotliRatio})`);
    
    const outputPath = path.join(projectRoot, 'docs/audit/data/bundle-stats.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`\n✅ Bundle statistics saved to ${outputPath}`);
    
    return results;
}

generateBundleStats().catch(err => {
    console.error('Error generating bundle stats:', err);
    process.exit(1);
});
