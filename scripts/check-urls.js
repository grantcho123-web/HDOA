const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PLATFORMS_PATH = path.join(__dirname, '..', 'data', 'platforms.json');
const FRESHNESS_PATH = path.join(__dirname, '..', 'data', 'freshness.json');

function checkUrl(url, checkSelector) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'HumanDataOps/1.0', 'Accept': 'text/html' }
    }, (res) => {
      const ms = Date.now() - start;
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        const redir = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume();
        return checkUrl(redir, checkSelector).then(resolve);
      }
      let body = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (bytes < 50000) { body += chunk; bytes += chunk.length; } });
      res.on('end', () => {
        const hasContent = checkSelector ? body.toLowerCase().includes(checkSelector.toLowerCase()) : true;
        resolve({ status: res.statusCode === 200 ? (hasContent ? 'live' : 'changed') : 'error', httpStatus: res.statusCode, responseTimeMs: ms, hasExpectedContent: hasContent });
      });
    });
    req.on('error', (err) => resolve({ status: 'down', httpStatus: 0, responseTimeMs: Date.now() - start, error: err.code }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', httpStatus: 0, responseTimeMs: 15000, error: 'TIMEOUT' }); });
  });
}

async function main() {
  console.log('Freshness Checker — ' + new Date().toISOString());
  const platforms = JSON.parse(fs.readFileSync(PLATFORMS_PATH, 'utf8')).platforms;
  console.log('Checking ' + platforms.length + ' platforms...\n');

  const results = {};
  for (let i = 0; i < platforms.length; i += 5) {
    const batch = platforms.slice(i, i + 5);
    await Promise.all(batch.map(async (p) => {
      const r = await checkUrl(p.url, p.checkSelector);
      results[p.id] = { ...r, lastChecked: new Date().toISOString(), url: p.url };
      const icon = r.status === 'live' ? '✅' : r.status === 'changed' ? '⚠️' : '❌';
      console.log(icon + ' ' + p.name.padEnd(25) + ' ' + r.status.padEnd(10) + ' ' + r.httpStatus);
    }));
    if (i + 5 < platforms.length) await new Promise(r => setTimeout(r, 1000));
  }

  const summary = { live: 0, changed: 0, down: 0, timeout: 0, error: 0 };
  Object.values(results).forEach(r => { summary[r.status] = (summary[r.status] || 0) + 1; });

  const output = { lastRun: new Date().toISOString(), totalPlatforms: platforms.length, summary, results };
  fs.writeFileSync(FRESHNESS_PATH, JSON.stringify(output, null, 2));

  console.log('\n✅ Live: ' + summary.live + ' | ⚠️ Changed: ' + summary.changed + ' | ❌ Down: ' + summary.down + ' | ⏱ Timeout: ' + summary.timeout);
  console.log('Written to data/freshness.json');
}

main().catch(err => { console.error(err); process.exit(1); });
