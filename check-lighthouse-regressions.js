const fs = require('fs');
const path = require('path');

// Configuration
const METRICS_TO_CHECK = ['performance', 'accessibility']; // Add 'best-practices', 'seo' if needed
const REGRESSION_THRESHOLD_PERCENT = parseInt(process.env.REGRESSION_THRESHOLD_PERCENT, 10) || 10;
const THRESHOLD_DECIMAL = REGRESSION_THRESHOLD_PERCENT / 100;

const oldResultsPath = process.argv[2];
const newResultsPath = process.argv[3];

if (!oldResultsPath || !newResultsPath) {
    console.error('Usage: node scripts/check-lighthouse-regressions.js <old_results.json> <new_results.json>');
    process.exit(1);
}

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: Results file not found: ${filePath}`);
        return null;
    }
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error(`Error reading or parsing JSON from ${filePath}:`, error);
        return null; // Treat as error / missing data
    }
}

function writeToCsv(newResultsData, csvPath) {
    const csvExists = fs.existsSync(csvPath);
    const timestamp = new Date().toISOString();
    
    // CSV headers
    const headers = ['timestamp', 'site_url', 'site_hash', 'performance', 'accessibility', 'best-practices', 'seo'];
    
    let csvContent = '';
    
    // Add headers if file doesn't exist
    if (!csvExists) {
        csvContent += headers.join(',') + '\n';
    }
    
    // Add data rows
    for (const siteHash in newResultsData) {
        if (Object.hasOwnProperty.call(newResultsData, siteHash)) {
            const siteData = newResultsData[siteHash];
            const siteUrl = siteData.url || siteHash;
            
            if (siteData.lighthouse) {
                const row = [
                    timestamp,
                    `"${siteUrl}"`, // Quote URL in case it contains commas
                    siteHash,
                    siteData.lighthouse.performance || '',
                    siteData.lighthouse.accessibility || '',
                    siteData.lighthouse['best-practices'] || '',
                    siteData.lighthouse.seo || ''
                ];
                csvContent += row.join(',') + '\n';
            }
        }
    }
    
    // Append to file
    fs.appendFileSync(csvPath, csvContent);
    console.log(`Metrics written to CSV: ${csvPath}`);
}

const oldResultsData = loadJson(oldResultsPath);
const newResultsData = loadJson(newResultsPath);

if (!newResultsData) {
    console.error('Error: Could not load new results data. Exiting.');
    process.exit(1); // Critical error if new results are missing
}

// Write metrics to CSV
const csvPath = path.join(path.dirname(newResultsPath), 'lighthouse-metrics.csv');
writeToCsv(newResultsData, csvPath);

if (!oldResultsData) {
    console.log('No old results data found to compare against. Skipping regression check.');
    process.exit(0); // Not an error, just no baseline
}

let hasRegressions = false;

console.log(`Comparing new results from ${path.basename(newResultsPath)} with old results from ${path.basename(oldResultsPath)}`);
console.log(`Regression threshold: ${REGRESSION_THRESHOLD_PERCENT}%`);

for (const siteHash in newResultsData) {
    if (Object.hasOwnProperty.call(newResultsData, siteHash)) {
        const newSiteData = newResultsData[siteHash];
        const oldSiteData = oldResultsData[siteHash];
        const siteUrl = newSiteData.url || siteHash;

        if (!oldSiteData) {
            console.log(`- Site ${siteUrl}: New site, no previous data for comparison.`);
            continue;
        }

        if (!newSiteData.lighthouse || !oldSiteData.lighthouse) {
            console.warn(`- Site ${siteUrl}: Lighthouse data missing in new or old results. Skipping.`);
            continue;
        }

        console.log(`- Checking site: ${siteUrl}`);
        METRICS_TO_CHECK.forEach(metric => {
            const newScore = newSiteData.lighthouse[metric];
            const oldScore = oldSiteData.lighthouse[metric];

            if (typeof newScore !== 'number' || typeof oldScore !== 'number') {
                console.warn(`  - Metric ${metric}: Invalid score type (new: ${typeof newScore}, old: ${typeof oldScore}). Value (new: ${newScore}, old: ${oldScore}). Skipping.`);
                return;
            }

            if (newScore < oldScore * (1 - THRESHOLD_DECIMAL)) {
                const decreasePercentage = ((oldScore - newScore) / oldScore) * 100;
                const message = `  - Site ${siteUrl}: REGRESSION in ${metric}! ` +
                                `New score: ${newScore.toFixed(2)}, Old score: ${oldScore.toFixed(2)}. ` +
                                `Decrease: ${decreasePercentage.toFixed(1)}% (Threshold: ${REGRESSION_THRESHOLD_PERCENT}%)`;
                console.error(message);
                hasRegressions = true;
            } else {
                 console.log(`  - Metric ${metric}: OK (New: ${newScore.toFixed(2)}, Old: ${oldScore.toFixed(2)})`);
            }
        });
    }
}

if (hasRegressions) {
    console.error('\\nSignificant metric regressions detected. Failing workflow.');
    process.exit(1);
} else {
    console.log('\\nNo significant metric regressions detected.');
    process.exit(0);
}