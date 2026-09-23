export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return res.status(503).json({ error: 'X_BEARER_TOKEN is not configured' });

  const q = '(Solana OR $SOL OR memecoin OR memecoins OR pumpfun OR pump.fun) -is:retweet -is:reply lang:en';
  const params = new URLSearchParams({
    query: q,
    max_results: '20',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name,verified'
  });

  const r = await fetch('https://api.x.com/2/tweets/search/recent?' + params, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data?.detail || 'X API request failed' });

  const users = Object.fromEntries((data.includes?.users || []).map(u => [u.id, u]));
  const posts = (data.data || []).map(p => {
    const m = p.public_metrics || {};
    const u = users[p.author_id] || {};
    const engagement = (m.like_count || 0) + (m.repost_count || 0) * 2 + (m.quote_count || 0) * 3 + (m.reply_count || 0);
    const text = p.text || '';
    const tokenHits = (text.match(/\$[A-Za-z]{2,12}/g) || []).slice(0, 5);
    const score = Math.min(100, Math.round(Math.log10(engagement + 1) * 18 + (u.verified ? 12 : 0) + Math.min(20, tokenHits.length * 5)));
    return {
      id: p.id, text, createdAt: p.created_at, username: u.username || 'unknown',
      name: u.name || u.username || 'unknown', verified: !!u.verified,
      likes: m.like_count || 0, reposts: m.repost_count || 0, replies: m.reply_count || 0,
      engagement, score, tokenHits,
      url: 'https://x.com/' + (u.username || 'i') + '/status/' + p.id
    };
  }).sort((a,b) => b.score - a.score);

  return res.status(200).json({ posts, updatedAt: new Date().toISOString() });
}
