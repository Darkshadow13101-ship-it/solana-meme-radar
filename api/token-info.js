export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
  try {
    const addresses=String(req.query?.addresses||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);
    if(!addresses.length) return res.status(200).json({data:[]});
    const url='https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/'+addresses.join(',');
    const r=await fetch(url,{headers:{Accept:'application/json;version=20230203'}});
    const text=await r.text(); if(!r.ok) return res.status(r.status).send(text); res.status(200).send(text);
  }catch(e){res.status(502).json({error:String(e?.message||e)})}
}