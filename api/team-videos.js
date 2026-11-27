// Recent highlight videos for each Bean Sports team, read from YouTube search results.
// Only videos from an allowlist of official publishers/broadcasters are returned, so the page never
// shows spam channels or unauthorised re-uploads of full broadcasts.
const teams = {
  lions: {
    queries: ['Detroit Lions highlights', 'Detroit Lions game highlights'],
    title: /\blions\b/i,
    channels: ['nfl', 'detroit lions', 'nfl on fox', 'nfl on cbs', 'nfl on nbc', 'nfl network', 'nfl films', 'espn', 'fox sports', 'cbs sports', 'nbc sports']
  },
  pistons: {
    queries: ['Detroit Pistons highlights', 'Detroit Pistons game highlights'],
    title: /\bpistons\b/i,
    channels: ['nba', 'detroit pistons', 'nba on espn', 'nba on tnt', 'nba on prime', 'espn', 'cbs sports', 'nbc sports', 'fanduel sports network', 'bally sports detroit']
  },
  osu: {
    queries: ['Ohio State football highlights', 'Ohio State Buckeyes game highlights'],
    title: /ohio state|buckeyes/i,
    channels: ['big ten network', 'ohio state football', 'ohio state buckeyes', 'the ohio state university', 'fox college football', 'fox sports', 'espn', 'espn college football', 'cbs sports', 'cbs sports hq', 'nbc sports', 'peacock']
  },
  dayton: {
    queries: ['Dayton Flyers basketball highlights', 'Dayton Flyers game highlights'],
    title: /dayton|flyers/i,
    channels: ['dayton flyers', 'atlantic 10 conference', 'espn', 'espn college basketball', 'cbs sports', 'cbs sports hq', 'nbc sports', 'peacock', 'fox sports']
  },
  gamecocks: {
    queries: ['South Carolina Gamecocks football highlights', 'South Carolina Gamecocks game highlights'],
    title: /south carolina|gamecocks/i,
    channels: ['south carolina gamecocks', 'gamecocks', 'sec network', 'espn', 'espn college football', 'cbs sports', 'cbs sports hq', 'fox college football', 'fox sports', 'nbc sports', 'peacock']
  },
  alter: {
    queries: ['Archbishop Alter football highlights', 'Alter Knights football Kettering highlights'],
    title: /\balter\b/i,
    channels: ['maxpreps', 'whio', 'wdtn', 'dayton daily news', 'spectrum news 1 ohio', 'archbishop alter', 'alter high school', "dave berk's huddle"]
  }
};

const highlightWords = /(highlights?|recap|best plays|top plays|game-winner|buzzer|postgame|press conference|extended|full game|final minutes|ending|touchdown|interception|dunk)/i;
const unwanted = /\b(reaction|watch along|watch party|live stream|livestream|podcast|prediction|predictions|picks|betting|odds)\b/i;
const MAX_AGE_DAYS = 30;
const PER_TEAM = 8;

function allowedChannel(name, list) {
  const n = String(name || '').trim().toLowerCase();
  return list.some((e) => n === e || (e.length >= 7 && n.includes(e)));
}

function agoToMs(text) {
  // Handles both "4 days ago" and the short form "4d ago" / "11mo ago".
  const m = /(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|s|m|h|d|w|y)\s+ago/i.exec(text || '');
  if (!m) return null;
  const u = m[2].toLowerCase();
  const unit = u.startsWith('mo') ? 2592e6 : u.startsWith('m') ? 6e4 : u.startsWith('s') ? 1e3
    : u.startsWith('h') ? 36e5 : u.startsWith('d') ? 864e5 : u.startsWith('w') ? 6048e5 : 31536e6;
  return Number(m[1]) * unit;
}

function clockToSecs(text) {
  const parts = String(text || '').split(':').map((x) => parseInt(x, 10));
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function kindOf(title) {
  if (/full game/i.test(title)) return 'Full Game Highlights';
  if (/postgame|press conference|interview/i.test(title)) return 'Postgame';
  if (/extended/i.test(title)) return 'Extended Highlights';
  if (/highlights?|recap/i.test(title)) return 'Game Highlights';
  return 'Video';
}

function collectRenderers(node, out) {
  if (Array.isArray(node)) { for (const v of node) collectRenderers(v, out); return out; }
  if (node && typeof node === 'object') {
    if (node.videoRenderer) out.push(node.videoRenderer);
    for (const v of Object.values(node)) collectRenderers(v, out);
  }
  return out;
}

const DATA_RE = /var ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s;

// True when the page is a real results page (not a consent wall or bot check).
function hasData(html) { return DATA_RE.test(html || ''); }

// Pure function (exported for tests): turn a YouTube results page into filtered videos for one team.
function parseResults(html, team, now = Date.now()) {
  const cfg = teams[team];
  const m = DATA_RE.exec(html);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const out = [];
  for (const v of collectRenderers(data, [])) {
    const id = v.videoId;
    const title = (v.title?.runs || []).map((r) => r.text).join('');
    const channel = (v.ownerText?.runs || []).map((r) => r.text).join('');
    const length = v.lengthText?.simpleText;
    const age = agoToMs(v.publishedTimeText?.simpleText);
    if (!/^[\w-]{11}$/.test(id) || !title || !length || age === null) continue;
    if (JSON.stringify(v.navigationEndpoint || {}).includes('/shorts/')) continue;
    if (age > MAX_AGE_DAYS * 864e5) continue;
    const secs = clockToSecs(length);
    if (secs < 45) continue;
    if (!allowedChannel(channel, cfg.channels)) continue;
    if (!cfg.title.test(title) || !highlightWords.test(title) || unwanted.test(title)) continue;
    out.push({
      id, title, channel, secs,
      published: new Date(now - age).toISOString(),
      ago: v.publishedTimeText.simpleText,
      kind: kindOf(title)
    });
  }
  return out;
}

async function searchPage(query) {
  const url = new URL('https://www.youtube.com/results');
  url.search = new URLSearchParams({ search_query: query, sp: 'CAI%3D' }).toString(); // sort by upload date
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'CONSENT=PENDING+987; SOCS=CAI'
    }
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.text();
}

// YouTube's oEmbed answers 401 for videos whose owner disabled embedding (NFL clips often are).
// Only a definite 401 marks a clip as not embeddable; any other outcome stays "unknown" (null).
async function embeddable(id) {
  try {
    const url = new URL('https://www.youtube.com/oembed');
    url.search = new URLSearchParams({ url: 'https://www.youtube.com/watch?v=' + id, format: 'json' }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (response.status === 401) return false;
    return response.ok ? true : null;
  } catch { return null; }
}

async function teamVideos(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://bean-sports.hen-solutions.com');
  const team = req.query.team;
  if (req.method !== 'GET' || typeof team !== 'string' || !Object.hasOwn(teams, team)) {
    return res.status(400).end();
  }
  const settled = await Promise.allSettled(teams[team].queries.map(searchPage));
  const pages = settled.filter((s) => s.status === 'fulfilled' && hasData(s.value)).map((s) => s.value);
  if (!pages.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end();
  }
  const seen = new Set();
  const videos = [];
  for (const page of pages) {
    for (const v of parseResults(page, team)) {
      if (!seen.has(v.id)) { seen.add(v.id); videos.push(v); }
    }
  }
  videos.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  const top = videos.slice(0, PER_TEAM);
  const flags = await Promise.all(top.map((v) => embeddable(v.id)));
  top.forEach((v, i) => { v.embeddable = flags[i]; });
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60, stale-if-error=3600');
  res.status(200).json({ team, generated: new Date().toISOString(), videos: top });
}

module.exports = teamVideos;
module.exports.parseResults = parseResults;
module.exports.hasData = hasData;
module.exports.teams = teams;
