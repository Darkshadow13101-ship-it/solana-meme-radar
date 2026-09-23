export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
  const urls = [
    'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token&page=1',
    'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1'
  ];
  try {
    let lastStatus = 502;
    let lastBody = '';
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(url, {
          headers: { Accept: 'application/json;version=20230203' },
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await r.text();
        lastStatus = r.status;
        lastBody = text;
        if (r.ok) {
          const data = JSON.parse(text);
          if (Array.isArray(data?.data) && data.data.length) return res.status(200).json(data);
        }
      } catch (e) {
        lastBody = String(e?.message || e);
      }
    }
    return res.status(lastStatus).send(lastBody || JSON.stringify({error:'Market feed unavailable'}));
  } catch (e) {
    return res.status(502).json({error:'Market data upstream unavailable',detail:String(e?.message || e)});
  }
}