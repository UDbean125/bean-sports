const searches = {
  lions: '"Detroit Lions" football',
  pistons: '"Detroit Pistons" basketball',
  osu: '"Ohio State" Buckeyes football',
  dayton: '"Dayton Flyers" basketball',
  gamecocks: '"South Carolina" Gamecocks football',
  alter: '"Alter" (Knights OR Kettering OR Archbishop) football Ohio'
};

module.exports = async function teamNews(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://bean-sports.hen-solutions.com');
  const team = req.query.team;
  if (req.method !== 'GET' || typeof team !== 'string' || !Object.hasOwn(searches, team)) {
    return res.status(400).end();
  }
  const primary = new URL('https://www.bing.com/news/search');
  primary.search = new URLSearchParams({q: searches[team], format: 'rss', setlang: 'en-US'}).toString();
  const backup = new URL('https://news.google.com/rss/search');
  backup.search = new URLSearchParams({q: searches[team], hl: 'en-US', gl: 'US', ceid: 'US:en'}).toString();
  try {
    let feed;
    for (const url of [primary, backup]) {
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(4500)});
        if (!response.ok) continue;
        const body = await response.text();
        if (body.includes('<rss') && /<item[\s>]/.test(body)) { feed = body; break; }
      } catch { continue; }
    }
    if (!feed) throw new Error('No feed available');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-if-error=300');
    res.status(200).send(feed);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).end();
  }
};