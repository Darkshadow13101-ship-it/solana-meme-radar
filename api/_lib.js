const cache=new Map();
const N=v=>Number.isFinite(Number(v))?Number(v):0;
async function get(url,ttl=15000){
  const now=Date.now(), hit=cache.get(url);
  if(hit&&now-hit.time<ttl)return hit.data;
  const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'Moonwatch/1.0'}});
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{throw Error('Invalid upstream response')}
  if(!r.ok)throw Error('HTTP '+r.status);
  cache.set(url,{time:now,data}); return data;
}
function dex(x){
  const q=x.txns||{},c=x.priceChange||{},v=x.volume||{},b=x.baseToken||{};
  return {address:String(b.address||''),poolAddress:String(x.pairAddress||''),symbol:String(b.symbol||'UNKNOWN').toUpperCase(),name:String(b.name||b.symbol||'Unknown token'),price:N(x.priceUsd),m5:N(c.m5),h1:N(c.h1),h24:N(c.h24),volume:N(v.h24),liquidity:N(x.liquidity?.usd),buys:N(q.h24?.buys),sells:N(q.h24?.sells),buys5:N(q.m5?.buys),sells5:N(q.m5?.sells),buys1:N(q.h1?.buys),sells1:N(q.h1?.sells),pairCreatedAt:N(x.pairCreatedAt),url:String(x.url||'https://dexscreener.com/solana/'+x.pairAddress),imageUrl:String(x.info?.imageUrl||'')};
}
function json(res,status,obj){res.status(status).json(obj)}
module.exports={N,get,dex,json};