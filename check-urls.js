#!/usr/bin/env node
/**
 * Freshness Checker — runs via GitHub Actions cron (daily)
 * 
 * For each platform:
 *   1. Makes HEAD + GET request to their careers/jobs URL
 *   2. Checks HTTP status code
 *   3. Checks if page content still contains expected keywords
 *   4. Records response time
 *   5. Writes results to data/freshness.json
 * 
 * Vercel auto-deploys on push, so the frontend always has latest data.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PLATFORMS_PATH = path.join(__dirname, '..', 'data', 'platforms.json');
const FRESHNESS_PATH = path.join(__dirname, '..', 'data', 'freshness.json');
const TIMEOUT_MS = 15000;
const CONCURRENCY = 5; // max parallel requests

// ── HTTP request helper ──
function checkUrl(url, checkSelector) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proto = url.startsWith('https') ? https : http;
    
    const req = proto.get(url, { 
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': 'HumanDataOps-FreshnessChecker/1.0 (automated monitoring)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    }, (res) => {
      const responseTimeMs = Date.now() - start;
      let body = '';
      
      // Follow redirects (up to 3)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        res.resume(); // drain the response
        return checkUrl(redirectUrl, checkSelector).then(resolve);
      }

      res.setEncoding('utf8');
      // Only read first 50KB to check for content
      let bytesRead = 0;
      res.on('data', (chunk) => {
        if (bytesRead < 50000) {
          body += chunk;
          bytesRead += chunk.length;
        }
      });
      
      res.on('end', () => {
        const bodyLower = body.toLowerCase();
        const hasExpectedContent = checkSelector 
          ? bodyLower.includes(checkSelector.toLowerCase())
          : true;
        // Also check for generic job/career indicators
        const hasJobContent = /job|career|position|opening|apply|hiring|opportunit/i.test(body);
        
        resolve({
          status: res.statusCode === 200 ? (hasExpectedContent ? 'live' : 'changed') : 'error',
          httpStatus: res.statusCode,
          responseTimeMs,
          hasExpectedContent,
          hasJobContent,
          contentLength: body.length,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 'down',
        httpStatus: 0,
        responseTimeMs: Date.now() - start,
        hasExpectedContent: false,
        hasJobContent: false,
        error: err.code || err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'timeout',
        httpStatus: 0,
        responseTimeMs: TIMEOUT_MS,
        hasExpectedContent: false,
        hasJobContent: false,
        error: 'TIMEOUT',
      });
    });
  });
}

// ── Process in batches ──
async function processBatch(items, fn, batchSize) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    // Small delay between batches to be polite
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return results;
}

// ── Main ──
async function main() {
  console.log('🔍 Human Data Ops — Freshness Checker');
  console.log(`   Running at ${new Date().toISOString()}\n`);

  // Load platforms
  const platformsData = JSON.parse(fs.readFileSync(PLATFORMS_PATH, 'utf8'));
  const platforms = platformsData.platforms;
  console.log(`   Checking ${platforms.length} platforms...\n`);

  // Load previous results for comparison
  let previousResults = {};
  try {
    const prev = JSON.parse(fs.readFileSync(FRESHNESS_PATH, 'utf8'));
    previousResults = prev.results || {};
  } catch (e) {
    console.log('   No previous results found, starting fresh.\n');
  }

  // Check all platforms
  const results = {};
  const checks = await processBatch(platforms, async (platform) => {
    const result = await checkUrl(platform.url, platform.checkSelector);
    const prev = previousResults[platform.id] || {};
    
    results[platform.id] = {
      ...result,
      lastChecked: new Date().toISOString(),
      previousStatus: prev.status || null,
      consecutiveFailures: result.status !== 'live' 
        ? (prev.consecutiveFailures || 0) + 1 
        : 0,
      url: platform.url,
    };

    // Log
    const icon = result.status === 'live' ? '✅' : result.status === 'changed' ? '⚠️' : '❌';
    console.log(`   ${icon} ${platform.name.padEnd(25)} ${result.status.padEnd(10)} ${result.httpStatus} ${result.responseTimeMs}ms ${result.hasExpectedContent ? '✓content' : '✗content'}`);
    
    return result;
  }, CONCURRENCY);

  // Write results
  const output = {
    lastRun: new Date().toISOString(),
    totalPlatforms: platforms.length,
    summary: {
      live: Object.values(results).filter(r => r.status === 'live').length,
      changed: Object.values(results).filter(r => r.status === 'changed').length,
      down: Object.values(results).filter(r => r.status === 'down').length,
      timeout: Object.values(results).filter(r => r.status === 'timeout').length,
      error: Object.values(results).filter(r => r.status === 'error').length,
    },
    results,
  };

  fs.writeFileSync(FRESHNESS_PATH, JSON.stringify(output, null, 2));

  // Summary
  console.log('\n   ══════════════════════════════');
  console.log(`   ✅ Live:     ${output.summary.live}`);
  console.log(`   ⚠️  Changed:  ${output.summary.changed}`);
  console.log(`   ❌ Down:     ${output.summary.down}`);
  console.log(`   ⏱  Timeout:  ${output.summary.timeout}`);
  console.log(`   🔴 Error:    ${output.summary.error}`);
  console.log(`   ──────────────────────────────`);
  console.log(`   Total: ${platforms.length} | Written to data/freshness.json`);
  
  // Exit with error if too many failures (so GitHub Actions shows as failed)
  const failRate = (output.summary.down + output.summary.error) / platforms.length;
  if (failRate > 0.5) {
    console.log('\n   ⚠️  WARNING: >50% failure rate. Check network/URLs.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
