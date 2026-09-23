const cache=new Map();
const N=v=>Number.isFinite(Number(v))?Number(v):0;
async function get(url,ttl=15000){
  const now=Date.now(),hit=cache.get(url);
  if(hit&&now-hit.time<ttl)return hit.data;
  const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Moonwatch/1.0"}});
  const text=await r.text();
  let data;try{data=JSON.parse(text)}catch{throw Error("Invalid upstream response")}
  if(!r.ok)throw Error("HTTP "+r.status);
  cache.set(url,{time:now,data});return data;
}
function dex(x){
  const q=x.txns||{},c=x.priceChange||{},v=x.volume||{},b=x.baseToken||{};
  return {address:String(b.address||""),poolAddress:String(x.pairAddress||""),symbol:String(b.symbol||"UNKNOWN").toUpperCase(),name:String(b.name||b.symbol||"Unknown token"),price:N(x.priceUsd),m5:N(c.m5),h1:N(c.h1),h24:N(c.h24),volume:N(v.h24),liquidity:N(x.liquidity?.usd),buys:N(q.h24?.buys),sells:N(q.h24?.sells),buys5:N(q.m5?.buys),sells5:N(q.m5?.sells),buys1:N(q.h1?.buys),sells1:N(q.h1?.sells),pairCreatedAt:N(x.pairCreatedAt),url:String(x.url||"https://dexscreener.com/solana/"+x.pairAddress),imageUrl:String(x.info?.imageUrl||"")};
}
function response(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
async function market(){
  let out=[];
  for(const q of ["SOL","meme","pump","dog","cat","inu","ai","moon"]){
    try{const d=await get("https://api.dexscreener.com/latest/dex/search?q="+encodeURIComponent(q),30000);
      for(const x of d.pairs||[])if(x?.chainId==="solana"&&x.baseToken?.address)out.push(dex(x));
    }catch{}
  }
  const seen=new Set();
  const now=Date.now();
  out=out
    .filter(x=>x.address&&!seen.has(x.address)&&seen.add(x.address))
    .filter(x=>x.symbol&&x.symbol!=="SOL"&&x.name.toLowerCase()!=="solana")
    .filter(x=>x.liquidity>=15000)
    .filter(x=>x.volume>=100)
    .filter(x=>x.buys+x.sells>=5)
    .filter(x=>!x.pairCreatedAt||now-x.pairCreatedAt<=30*24*60*60*1000)
    .sort((a,b)=>{
      const activity=x=>Math.log10(1+Math.max(0,x.volume))*18+Math.log10(1+Math.max(0,x.liquidity))*10+Math.min(20,(x.buys+x.sells)/100);
      const momentum=x=>Math.max(0,x.m5)*5+Math.max(0,x.h1)*2+Math.max(0,x.h24)*.35;
      return (activity(b)+momentum(b))-(activity(a)+momentum(a));
    })
    .slice(0,80);
  if(!out.length)throw Error("No verified Solana market data");
  return {data:out,source:"DEXSCREENER LIVE",updatedAt:new Date().toISOString()};
}
async function search(q){
  const d=await get("https://api.dexscreener.com/latest/dex/search?q="+encodeURIComponent(q),15000);
  const data=(d.pairs||[]).filter(x=>x.chainId==="solana"&&x.baseToken?.address).map(dex).filter((x,i,a)=>a.findIndex(y=>y.address===x.address)===i).slice(0,100);
  return {data,source:"DEXSCREENER LIVE",updatedAt:new Date().toISOString()};
}
async function newPools(){
  const d=await get("https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1",30000);
  const data=(d.data||[]).map(x=>{const a=x.attributes||{},id=String(x.id||"").replace(/^solana_/,"").split("_")[0],b=String(x.relationships?.base_token?.data?.id||"").replace(/^solana_/,"");return {address:b||id,poolAddress:id,symbol:String(a.name||"UNKNOWN").split(" / ")[0],name:String(a.name||"UNKNOWN").split(" / ")[0],price:N(a.base_token_price_usd),m5:N(a.price_change_percentage?.m5),h1:N(a.price_change_percentage?.h1),h24:N(a.price_change_percentage?.h24),volume:N(a.volume_usd?.h24),liquidity:N(a.reserve_in_usd),buys:N(a.transactions?.h24?.buys),sells:N(a.transactions?.h24?.sells),buys5:N(a.transactions?.m5?.buys),sells5:N(a.transactions?.m5?.sells),buys1:N(a.transactions?.h1?.buys),sells1:N(a.transactions?.h1?.sells),pairCreatedAt:a.pool_created_at?Date.parse(a.pool_created_at):0,url:"https://dexscreener.com/solana/"+id};}).filter(x=>x.address&&x.pairCreatedAt);
  return {data,source:"GECKOTERMINAL LIVE",updatedAt:new Date().toISOString()};
}
async function trades(url){
  const pools=(new URL(url).searchParams.get("pools")||"").split(",").filter(Boolean).slice(0,5);
  let trades=[];
  for(const pool of pools){try{const d=await get("https://api.geckoterminal.com/api/v2/networks/solana/pools/"+encodeURIComponent(pool)+"/trades?trade_volume_in_usd_greater_than=1000",30000);
    for(const x of d.data||[]){const a=x.attributes||{},usd=N(a.volume_in_usd);if(usd>=1000)trades.push({pool,side:String(a.kind||a.side||"unknown").toUpperCase(),usd,timestamp:a.block_timestamp||a.timestamp||null,tx:String(a.tx_hash||""),maker:String(a.tx_from_address||a.maker||""),url:"https://geckoterminal.com/solana/pools/"+pool});}
  }catch{}}
  trades.sort((a,b)=>b.usd-a.usd);return {data:trades.slice(0,40),source:"GECKOTERMINAL LIVE"};
}
async function news(){
  const feeds=["https://www.coindesk.com/arc/outboundfeeds/rss/","https://cointelegraph.com/rss"],items=[];
  for(const u of feeds){try{const r=await fetch(u,{headers:{"user-agent":"Mozilla/5.0"}}),xml=await r.text();
    for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)){const z=m[1],pick=k=>{const q=z.match(new RegExp("<"+k+"[^>]*>([\s\S]*?)</"+k+">","i"));return q?q[1].replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").trim():""};const title=pick("title"),link=pick("link"),publishedAt=pick("pubDate");if(title&&link)items.push({title,link,publishedAt,source:u.includes("coindesk")?"CoinDesk":"Cointelegraph"});}
  }catch{}}
  items.sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
  return {data:items.slice(0,20),source:items.length?"LIVE RSS":"NO VERIFIED NEWS DATA",updatedAt:new Date().toISOString()};
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname==="/health")return new Response("ok");
      if(url.pathname==="/api/market")return response(await market());
      if(url.pathname==="/api/search"){const q=url.searchParams.get("q")?.trim();if(!q)return response({error:"Search term required"},400);try{return response(await search(q));}catch{return response({error:"Live search unavailable"},502);}}
      if(url.pathname==="/api/new-pools"){try{return response(await newPools());}catch{return response({error:"Live new-pool feed unavailable"},502);}}
      if(url.pathname==="/api/trades")return response(await trades(request.url));
      if(url.pathname==="/api/news"){try{return response(await news());}catch{return response({data:[],source:"NO VERIFIED NEWS DATA",updatedAt:new Date().toISOString()});}}
      return env.ASSETS.fetch(request);
    }catch(e){return response({error:String(e.message||e)},502);}
  }
};
