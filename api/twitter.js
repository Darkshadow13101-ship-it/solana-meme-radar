export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  // Normalize the secret so accidental whitespace, quotes, or a pasted
  // "Bearer " prefix do not break authentication.
  const rawToken = String(process.env.X_BEARER_TOKEN || '');
  const token = rawToken
    .trim()
    .replace(/^Bearer\\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!token) {
    return res.status(503).json({
      error: 'X_BEARER_TOKEN is not configured',
      code: 'MISSING_TOKEN'
    });
  }

  const query = '(Solana OR memecoin OR memecoins OR pumpfun OR "$SOL") -is:retweet -is:reply lang:en';

  const params = new URLSearchParams({
    query,
    max_results: '20',
    sort_order: 'recency',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name,verified'
  });

  const endpoints = [
    'https://api.x.com/2/tweets/search/recent',
    'https://api.twitter.com/2/tweets/search/recent'
  ];

  try {
    let lastError = null;

    for (const endpoint of endpoints) {
      const r = await fetch(endpoint + '?' + params.toString(), {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        }
      });

      const raw = await r.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}

      if (r.ok) {
        const users = Object.fromEntries(
          (data.includes?.users || []).map(u => [u.id, u])
        );

        const posts = (data.data || []).map(p => {
          const m = p.public_metrics || {};
          const u = users[p.author_id] || {};
          const reposts = m.retweet_count ?? m.repost_count ?? 0;
          const engagement =
            Number(m.like_count || 0) +
            Number(reposts) * 2 +
            Number(m.quote_count || 0) * 3 +
            Number(m.reply_count || 0);

          const text = String(p.text || '');
          const tokenHits = (
            text.match(/\\$[A-Za-z][A-Za-z0-9_]{1,11}/g) || []
          ).slice(0, 5);

          const score = Math.min(
            100,
            Math.round(
              Math.log10(engagement + 1) * 18 +
              (u.verified ? 12 : 0) +
              Math.min(20, tokenHits.length * 5)
            )
          );

          return {
            id: p.id,
            text,
            createdAt: p.created_at,
            username: u.username || 'unknown',
            name: u.name || u.username || 'unknown',
            verified: !!u.verified,
            likes: Number(m.like_count || 0),
            reposts: Number(reposts),
            replies: Number(m.reply_count || 0),
            engagement,
            score,
            tokenHits,
            url: 'https://x.com/' + (u.username || 'i') + '/status/' + p.id
          };
        }).sort((a, b) => b.score - a.score);

        return res.status(200).json({
          posts,
          count: posts.length,
          updatedAt: new Date().toISOString()
        });
      }

      lastError = {
        status: r.status,
        detail: data?.detail || data?.title || 'X API request failed',
        errors: data?.errors || null,
        endpoint
      };

      // Only try the compatibility endpoint for a server-side/API-host error.
      // A 401/403 means the credential or app access itself needs attention.
      if (r.status === 401 || r.status === 403) {
        return res.status(r.status).json({
          error: lastError.detail,
          code: 'X_API_' + r.status,
          x_errors: lastError.errors,
          hint: r.status === 401
            ? 'The Bearer Token was rejected by X.'
            : 'X accepted the request format but denied this app/token access.'
        });
      }
    }

    return res.status(lastError?.status || 502).json({
      error: lastError?.detail || 'Could not reach X API',
      code: 'X_API_UPSTREAM_ERROR',
      x_errors: lastError?.errors || null
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Could not reach X API',
      code: 'X_NETWORK_ERROR',
      detail: String(err?.message || err)
    });
  }
}
