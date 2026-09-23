export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
  try {
    const url = 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1';
    const r = await fetch(url, {
      headers: { Accept: 'application/json;version=20230203' }
    });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: 'Market data upstream unavailable', detail: String(e?.message || e) });
  }
}