/**
 * Lighthouse Regression Detection Script
 * 
 * Compares lighthouse performance metrics between two test runs and detects
 * significant regressions that could indicate performance degradation.
 * 
 * Usage:
 *   node check-lighthouse-regressions.js <old_results.json> <new_results.json>
 * 
 * Environment Variables:
 *   REGRESSION_THRESHOLD_PERCENT - Percentage decrease threshold for regressions (default: 10)
 * 
 * Exit Codes:
 *   0 - No regressions detected or no baseline data available
 *   1 - Significant regressions detected or critical errors
 * 
 * Features:
 *   - Configurable regression thresholds
 *   - CSV metrics tracking over time
 *   - Graceful handling of missing baseline data
 *   - Detailed logging of regression analysis
 */

const fs = require('fs');
const path = require('path');

// Configuration
const METRICS_TO_CHECK = ['performance', 'accessibility']; // Add 'best-practices', 'seo' if needed
const REGRESSION_THRESHOLD_PERCENT = parseInt(process.env.REGRESSION_THRESHOLD_PERCENT, 10) || 10;
const THRESHOLD_DECIMAL = REGRESSION_THRESHOLD_PERCENT / 100;

// Command line arguments: old results file path and new results file path
const oldResultsPath = process.argv[2];
const newResultsPath = process.argv[3];

if (!oldResultsPath || !newResultsPath) {
    console.error('Usage: node scripts/check-lighthouse-regressions.js <old_results.json> <new_results.json>');
    process.exit(1);
}

/**
 * Safely loads and parses a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Object|null} Parsed JSON data or null if file doesn't exist or parsing fails
 */
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

/**
 * Writes lighthouse metrics to CSV for historical tracking
 * @param {Object} newResultsData - Latest lighthouse results data
 * @param {string} csvPath - Path where CSV file should be written
 */
function writeToCsv(newResultsData, csvPath) {
    const csvExists = fs.existsSync(csvPath);
    const timestamp = new Date().toISOString();
    
    // CSV headers - includes all lighthouse metrics for comprehensive tracking
    const headers = ['timestamp', 'site_url', 'site_hash', 'performance', 'accessibility', 'best-practices', 'seo'];
    
    let csvContent = '';
    
    // Add headers if this is a new CSV file
    if (!csvExists) {
        csvContent += headers.join(',') + '\n';
    }
    
    // Add data rows for each site in the results
    for (const siteHash in newResultsData) {
        if (Object.hasOwnProperty.call(newResultsData, siteHash)) {
            const siteData = newResultsData[siteHash];
            const siteUrl = siteData.url || siteHash;
            
            // Only write rows for sites that have lighthouse data
            if (siteData.lighthouse) {
                const row = [
                    timestamp,
                    `"${siteUrl}"`, // Quote URL in case it contains commas
                    siteHash,
                    siteData.lighthouse.performance || '',
                    siteData.lighthouse.accessibility || '',
                    siteData.lighthouse.bestPractices || '',
                    siteData.lighthouse.seo || ''
                ];
                csvContent += row.join(',') + '\n';
            }
        }
    }
    
    // Append to existing file or create new one
    fs.appendFileSync(csvPath, csvContent);
    console.log(`Metrics written to CSV: ${csvPath}`);
}

// Load both old and new results data
const oldResultsData = loadJson(oldResultsPath);
const newResultsData = loadJson(newResultsPath);

// Critical error if we can't load new results - this should never happen in normal operation
if (!newResultsData) {
    console.error('Error: Could not load new results data. Exiting.');
    process.exit(1); // Critical error if new results are missing
}

// Write metrics to CSV for historical tracking (happens regardless of regression check outcome)
const csvPath = path.join(path.dirname(newResultsPath), 'lighthouse-metrics.csv');
writeToCsv(newResultsData, csvPath);

// If no old results exist, we can't perform regression analysis but it's not an error
// This happens on first runs or when baseline data is unavailable
if (!oldResultsData) {
    console.log('No old results data found to compare against. Skipping regression check.');
    process.exit(0); // Not an error, just no baseline
}

// Track whether any regressions are detected across all sites
let hasRegressions = false;

console.log(`Comparing new results from ${path.basename(newResultsPath)} with old results from ${path.basename(oldResultsPath)}`);
console.log(`Regression threshold: ${REGRESSION_THRESHOLD_PERCENT}%`);

// Iterate through all sites in the new results to check for regressions
for (const siteHash in newResultsData) {
    if (Object.hasOwnProperty.call(newResultsData, siteHash)) {
        const newSiteData = newResultsData[siteHash];
        const oldSiteData = oldResultsData[siteHash];
        const siteUrl = newSiteData.url || siteHash;

        // Skip comparison if this site wasn't in the previous run (new site)
        if (!oldSiteData) {
            console.log(`- Site ${siteUrl}: New site, no previous data for comparison.`);
            continue;
        }

        // Skip comparison if lighthouse data is missing from either run
        if (!newSiteData.lighthouse || !oldSiteData.lighthouse) {
            console.warn(`- Site ${siteUrl}: Lighthouse data missing in new or old results. Skipping.`);
            continue;
        }

        console.log(`- Checking site: ${siteUrl}`);
        
        // Check each configured metric for regressions
        METRICS_TO_CHECK.forEach(metric => {
            const newScore = newSiteData.lighthouse[metric];
            const oldScore = oldSiteData.lighthouse[metric];

            // Validate that both scores are valid numbers
            if (typeof newScore !== 'number' || typeof oldScore !== 'number') {
                console.warn(`  - Metric ${metric}: Invalid score type (new: ${typeof newScore}, old: ${typeof oldScore}). Value (new: ${newScore}, old: ${oldScore}). Skipping.`);
                return;
            }

            // Check if new score represents a significant regression
            // Regression = new score is significantly lower than old score
            // Formula: newScore < oldScore * (1 - threshold)
            // Example: 0.75 < 0.85 * (1 - 0.10) = 0.765 → regression detected
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

// Final decision: fail the build if any regressions were detected
if (hasRegressions) {
    console.error('\\nSignificant metric regressions detected. Failing workflow.');
    process.exit(1);
} else {
    console.log('\\nNo significant metric regressions detected.');
    process.exit(0);
}