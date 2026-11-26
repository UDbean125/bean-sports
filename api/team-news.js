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
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({q: searches[team], hl: 'en-US', gl: 'US', ceid: 'US:en'}).toString();
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(7000)});
    if (!response.ok) throw new Error('News provider unavailable');
    const feed = await response.text();
    if (!feed.includes('<rss')) throw new Error('Invalid news feed');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
    res.status(200).send(feed);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).end();
  }
};