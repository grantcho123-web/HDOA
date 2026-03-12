const fs = require('fs');
const path = require('path');

/**
 * GET /api/freshness — returns the latest freshness data
 * 
 * This reads the pre-computed data/freshness.json that gets
 * updated daily by the GitHub Actions cron job.
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  
  try {
    const data = fs.readFileSync(
      path.join(process.cwd(), 'data', 'freshness.json'), 
      'utf8'
    );
    res.status(200).json(JSON.parse(data));
  } catch (err) {
    res.status(200).json({
      lastRun: null,
      results: {},
      error: 'No freshness data yet. Run the checker first.'
    });
  }
};
