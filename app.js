const tokenList = document.querySelector('#token-list');
const activityList = document.querySelector('#activity-list');

const API = 'https://api.dexscreener.com';
const REFRESH_MS = 60000;
let tokens = [];
let lastUpdated = null;

const trendClass = value => Number(value) >= 0 ? 'gain' : 'loss';
const fmtUsd = value => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1) return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (value >= 0.01) return '$' + value.toFixed(4);
  return '$' + value.toPrecision(4);
};
const fmtCompact = value => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(value);
};

function fomoScore(p, boost) {
  const h1 = Math.max(-20, Math.min(20, Number(p?.priceChange?.h1 || 0)));
  const h24 = Math.max(-50, Math.min(50, Number(p?.priceChange?.h24 || 0)));
  const vol = Number(p?.volume?.h24 || 0);
  const liq = Number(p?.liquidity?.usd || 0);
  const tx = Number(p?.txns?.h24?.buys || 0) + Number(p?.txns?.h24?.sells || 0);
  const buyRatio = Number(p?.txns?.h24?.buys || 0) / Math.max(1, tx);
  const volumeLiq = liq ? Math.min(20, (vol / liq) * 3) : 0;
  const momentum = Math.max(0, h1) * 1.6 + Math.max(0, h24) * 0.25;
  const activity = Math.min(15, Math.log10(Math.max(1, tx)) * 4);
  const buyPressure = Math.max(0, (buyRatio - 0.5) * 30);
  const boostPoints = Math.min(10, Number(boost || 0) / 10);
  const liquidityPenalty = liq < 25000 ? 25 : liq < 100000 ? 12 : 0;
  return Math.max(0, Math.min(100, Math.round(30 + momentum + volumeLiq + activity + buyPressure + boostPoints - liquidityPenalty)));
}

function signalFor(score, liq) {
  if (liq < 25000) return 'RISK';
  if (score >= 80) return 'HOT';
  if (score >= 65) return 'WATCH';
  return 'NEW';
}

function renderTokens(items) {
  tokenList.innerHTML = items.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div></td>
      <td>${fmtUsd(t.price)}</td>
      <td class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(2)}%</td>
      <td class="${trendClass(t.h24)}">${t.h24 >= 0 ? '+' : ''}${t.h24.toFixed(2)}%</td>
      <td>${fmtCompact(t.volume)}</td>
      <td>${fmtCompact(t.liquidity)}</td>
      <td><span class="signal ${t.signal.toLowerCase()}">${t.signal} ${t.fomo}</span></td>
      <td><button class="star" aria-label="Open ${t.symbol}" onclick="window.open('${t.url}','_blank')">↗</button></td>
    </tr>`).join('') || '<tr><td colspan="9">No live tokens matched your search.</td></tr>';
}

function renderActivity(items) {
  if (!activityList) return;
  activityList.innerHTML = items.slice(0, 6).map((a, i) => `
    <div class="activity-item">
      <span class="token-avatar activity-avatar">${i + 1}</span>
      <div class="activity-text"><b>${a.symbol}</b> ${a.side} <b>${a.count}</b> trades<br><span class="${a.side === 'buy-heavy' ? 'gain' : 'loss'}">${a.ratio}% buys</span></div>
      <span class="activity-time">24h</span>
    </div>`).join('') || '<div class="activity-item">No activity yet.</div>';
}

async function fetchLiveData() {
  try {
    const boostsRes = await fetch(API + '/token-boosts/latest/v1', { cache: 'no-store' });
    if (!boostsRes.ok) throw new Error('Boost feed failed: ' + boostsRes.status);
    const boosts = await boostsRes.json();

    const solanaBoosts = boosts.filter(x => x.chainId === 'solana').slice(0, 18);
    const results = await Promise.allSettled(solanaBoosts.map(async boost => {
      const res = await fetch(API + '/latest/dex/tokens/' + boost.tokenAddress, { cache: 'no-store' });
      if (!res.ok) throw new Error('pair lookup failed');
      const data = await res.json();
      const pairs = (data.pairs || []).filter(p => p.chainId === 'solana' && p.liquidity?.usd);
      return { boost, pair: pairs.sort((a,b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))[0] };
    }));

    const fresh = results
      .filter(r => r.status === 'fulfilled' && r.value.pair)
      .map(r => {
        const { boost, pair: p } = r.value;
        const score = fomoScore(p, boost.amount);
        const liq = Number(p.liquidity?.usd || 0);
        const buys = Number(p.txns?.h24?.buys || 0);
        const sells = Number(p.txns?.h24?.sells || 0);
        return {
          symbol: p.baseToken?.symbol || 'UNKNOWN',
          name: p.baseToken?.name || 'Unknown token',
          letter: (p.baseToken?.symbol || '?').slice(0,1).toUpperCase(),
          color: ['orange','purple','pink','blue','yellow'][Math.floor(Math.random() * 5)],
          price: Number(p.priceUsd || 0),
          h1: Number(p.priceChange?.h1 || 0),
          h24: Number(p.priceChange?.h24 || 0),
          volume: Number(p.volume?.h24 || 0),
          liquidity: liq,
          fomo: score,
          signal: signalFor(score, liq),
          url: p.url,
          buys, sells
        };
      })
      .sort((a,b) => b.fomo - a.fomo);

    if (!fresh.length) throw new Error('No live Solana pairs returned');
    tokens = fresh;
    lastUpdated = new Date();
    renderTokens(tokens);
    renderActivity(tokens.map(t => ({
      symbol: t.symbol,
      side: t.buys >= t.sells ? 'buy-heavy' : 'sell-heavy',
      count: t.buys + t.sells,
      ratio: Math.round((t.buys / Math.max(1, t.buys + t.sells)) * 100)
    })));
  } catch (err) {
    console.error(err);
    if (!tokens.length) tokenList.innerHTML = '<tr><td colspan="9">Live feed unavailable. Try Refresh.</td></tr>';
  }
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active');
  button.classList.add('active');
  const f = button.dataset.filter;
  renderTokens(f === 'all' ? tokens : tokens.filter(t => f === 'trending' ? t.fomo >= 65 : f === 'gainers' ? t.h24 > 0 : f === 'new' ? t.signal === 'NEW' : true));
}));

document.querySelector('#search')?.addEventListener('input', event => {
  const value = event.target.value.toLowerCase();
  renderTokens(tokens.filter(t => `${t.symbol} ${t.name}`.toLowerCase().includes(value)));
});

const refresh = document.querySelector('#refresh');
if (refresh) refresh.addEventListener('click', fetchLiveData);

fetchLiveData();
setInterval(fetchLiveData, REFRESH_MS);
