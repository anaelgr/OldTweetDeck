const fs = require('fs');
const path = require('path');
const escomplex = require('typhonjs-escomplex');

function getAllFiles(dirPath, arrayOfFiles) {
  let files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const srcFiles = getAllFiles(path.join(__dirname, '../src'));
const reportData = [];

srcFiles.forEach(filePath => {
    const code = fs.readFileSync(filePath, 'utf8');
    try {
        const report = escomplex.analyzeModule(code);
        if (!report) {
             throw new Error("Report is undefined");
        }
        if (!report.functions) {
             // console.log(`Keys in report for ${filePath}:`, Object.keys(report));
             if (report.methods) {
                 report.functions = report.methods; // normalize
             }
        }

        reportData.push({
            filePath: filePath,
            maintainability: report.maintainability,
            aggregate: report.aggregate,
            functions: (report.functions || []).map(f => ({
                name: f.name,
                line: f.line,
                complexity: f.cyclomatic,
                halstead: f.halstead.difficulty
            })).sort((a, b) => b.complexity - a.complexity)
        });
    } catch (e) {
        console.error(`Error processing ${filePath}: ${e.message}`);
        reportData.push({
            filePath: filePath,
            error: e.message
        });
    }
});

const outputPath = path.join(__dirname, '../docs/audit/data/complexity.json');
// Ensure dir exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
console.log(`Complexity report saved to ${outputPath}`);
