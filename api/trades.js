export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');
  try {
    const pool=String(req.query?.pool||'').trim(); if(!pool) return res.status(400).json({error:'Missing pool'});
    const url='https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(pool)+'/trades?trade_volume_in_usd_greater_than=250';
    const r=await fetch(url,{headers:{Accept:'application/json;version=20230203'}});
    const text=await r.text(); if(!r.ok) return res.status(r.status).send(text); res.status(200).send(text);
  }catch(e){res.status(502).json({error:String(e?.message||e)})}
}