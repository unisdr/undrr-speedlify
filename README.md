# speedlify

Here we use [Speedlify to Continuously Measure Site Performance](https://www.zachleat.com/web/speedlify/) of UNDRR websites.

- Each file in `_data/sites/*.js` is a category and contains a list of sites for comparison.
- This is a fork from <https://github.com/zachleat/speedlify>

## Run locally

```
npm install
npm run dev
```

## Generate assets

We do not yet build the assets as CI.

Locally you must:

1. `npm run build-production`
2. Commit assets from `_data` directory
3. Push to the remote
4. Github will then automatically dpeloy the latest changes

## Lighthouse Regression Checking

This Speedlify instance includes automated regression detection that protects against performance degradation over time—because nobody wants their lighthouse scores sliding into the abyss while they're busy shipping features.

### How It Works

The regression check runs automatically after every lighthouse test execution and compares the latest results against the previous run. Here's what happens under the hood:

1. **Test Execution**: Lighthouse tests run via `npm run test-pages`
2. **Comparison**: The `check-lighthouse-regressions.js` script compares new results against the previous baseline
3. **Analysis**: By default, it checks **performance** and **accessibility** metrics (though you can add `best-practices` and `seo` if you're feeling ambitious)
4. **Decision**: If any site shows a significant regression, the build fails immediately

### When It's Triggered

The regression check runs automatically in three scenarios:

- **On every push** to the repository
- **Manual trigger** via GitHub Actions workflow dispatch
- **Scheduled runs** every Tuesday at 3:00 PM UTC (because Tuesdays needed more excitement)

### What Causes Build Failures

The system fails the build when any monitored site's lighthouse scores drop by more than the configured threshold compared to the previous run.

**Default threshold**: 10% decrease (configurable via `REGRESSION_THRESHOLD_PERCENT` environment variable)

**Example failure scenarios**:

- Performance score drops from 0.85 to 0.75 (11.8% decrease) → Build fails
- Accessibility score drops from 0.90 to 0.82 (8.9% decrease) → Build passes
- Performance stays at 0.70 but accessibility drops from 0.95 to 0.84 (11.6% decrease) → Build fails

### Configuration Options

You can customize the regression check behavior:

```bash
# Set a different threshold (default: 10)
REGRESSION_THRESHOLD_PERCENT=15

# The script checks these metrics by default:
# - performance
# - accessibility
#
# To monitor additional metrics, edit the METRICS_TO_CHECK array in check-lighthouse-regressions.js
```

### What Happens on Failure

When regressions are detected:

1. The script logs detailed information about which sites and metrics failed
2. The GitHub Actions workflow fails with exit code 1
3. No results are committed to the repository
4. You get to debug why your beautiful website suddenly became a digital sloth

## Pay for something better

Speedlify is intended as a stepping stone to more robust performance monitoring solutions like:

- [SpeedCurve](https://speedcurve.com/)
- [Calibre](https://calibreapp.com/)
- [DebugBear](https://www.debugbear.com/)
