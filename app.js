const tokenList = document.querySelector('#token-list');
const activityList = document.querySelector('#activity-list');

const API = 'https://api.dexscreener.com';
const REFRESH_MS = 30000;
let tokens = [];

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
  const h1 = Number(p?.priceChange?.h1 || 0);
  const h24 = Number(p?.priceChange?.h24 || 0);
  const m5 = Number(p?.priceChange?.m5 || 0);
  const m15 = Number(p?.priceChange?.m15 || 0);
  const v5 = Number(p?.volume?.m5 || 0);
  const v1 = Number(p?.volume?.h1 || 0);
  const v24 = Number(p?.volume?.h24 || 0);
  const liq = Number(p?.liquidity?.usd || 0);
  const buys5 = Number(p?.txns?.m5?.buys || 0);
  const sells5 = Number(p?.txns?.m5?.sells || 0);
  const buys1 = Number(p?.txns?.h1?.buys || 0);
  const sells1 = Number(p?.txns?.h1?.sells || 0);
  const tx5 = buys5 + sells5;
  const tx1 = buys1 + sells1;
  const ageHours = p?.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;

  // Early-momentum model: rewards fresh acceleration and buy pressure,
  // but heavily penalizes thin liquidity so a tiny pool cannot score as a moonshot.
  const ageBoost = ageHours < 1 ? 18 : ageHours < 3 ? 12 : ageHours < 12 ? 7 : ageHours < 24 ? 3 : 0;
  const acceleration = Math.max(0, Math.min(18, m5 * 1.5 + m15 * 0.6));
  const momentum = Math.max(0, Math.min(16, h1 * 1.2 + h24 * 0.15));
  const volumeAcceleration = v1 > 0 ? Math.min(16, Math.max(0, (v5 / Math.max(1, v1 / 12)) * 8)) : 0;
  const buyPressure5 = tx5 ? Math.max(0, (buys5 / tx5 - 0.5) * 30) : 0;
  const buyPressure1 = tx1 ? Math.max(0, (buys1 / tx1 - 0.5) * 12) : 0;
  const activity = Math.min(10, Math.log10(Math.max(1, tx1)) * 3);
  const volumeLiq = liq ? Math.min(12, (v24 / liq) * 1.8) : 0;
  const boostPoints = Math.min(10, Number(boost || 0) / 8);
  const liquidityPenalty = liq < 25000 ? 35 : liq < 50000 ? 20 : liq < 100000 ? 10 : liq < 250000 ? 3 : 0;
  const rugPenalty = (ageHours < 1 && tx5 < 5) ? 8 : 0;

  return Math.max(0, Math.min(100, Math.round(
    22 + ageBoost + acceleration + momentum + volumeAcceleration +
    buyPressure5 + buyPressure1 + activity + volumeLiq + boostPoints -
    liquidityPenalty - rugPenalty
  )));
}

function signalFor(score, p) {
  const liq = Number(p?.liquidity?.usd || 0);
  const ageHours = p?.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;
  if (liq < 25000) return 'RISK';
  if (score >= 85 && ageHours < 6) return 'EARLY';
  if (score >= 80) return 'HOT';
  if (score >= 65) return 'WATCH';
  return ageHours < 24 ? 'NEW' : 'WATCH';
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
      <span class="activity-time">5m/1h</span>
    </div>`).join('');
}

async function getJson(path) {
  const res = await fetch(API + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  return res.json();
}

async function fetchLiveData() {
  try {
    const [boosts, profiles] = await Promise.all([
      getJson('/token-boosts/latest/v1'),
      getJson('/token-profiles/latest/v1')
    ]);

    const candidates = new Map();
    [...boosts, ...profiles].filter(x => x.chainId === 'solana').forEach(x => {
      if (x.tokenAddress) candidates.set(x.tokenAddress, x);
    });

    const addresses = [...candidates.keys()].slice(0, 40);
    const results = await Promise.allSettled(addresses.map(async address => {
      const data = await getJson('/latest/dex/tokens/' + address);
      const pairs = (data.pairs || []).filter(p => p.chainId === 'solana' && p.liquidity?.usd);
      return { meta: candidates.get(address), pair: pairs.sort((a,b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))[0] };
    }));

    const fresh = results
      .filter(r => r.status === 'fulfilled' && r.value.pair)
      .map(r => {
        const { meta, pair: p } = r.value;
        const score = fomoScore(p, meta?.amount);
        const liq = Number(p.liquidity?.usd || 0);
        const buys = Number(p.txns?.h24?.buys || 0);
        const sells = Number(p.txns?.h24?.sells || 0);
        const ageHours = p.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;
        return {
          symbol: p.baseToken?.symbol || 'UNKNOWN',
          name: p.baseToken?.name || 'Unknown token',
          letter: (p.baseToken?.symbol || '?').slice(0,1).toUpperCase(),
          color: ['orange','purple','pink','blue','yellow'][Math.abs((p.baseToken?.symbol || '').charCodeAt(0)) % 5],
          price: Number(p.priceUsd || 0),
          h1: Number(p.priceChange?.h1 || 0),
          h24: Number(p.priceChange?.h24 || 0),
          volume: Number(p.volume?.h24 || 0),
          liquidity: liq,
          fomo: score,
          signal: signalFor(score, p),
          url: p.url,
          buys, sells,
          ageHours
        };
      })
      .sort((a,b) => b.fomo - a.fomo);

    if (!fresh.length) throw new Error('No live Solana pairs returned');
    tokens = fresh;
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
  renderTokens(f === 'all' ? tokens : tokens.filter(t =>
    f === 'trending' ? t.fomo >= 65 :
    f === 'gainers' ? t.h24 > 0 :
    f === 'new' ? t.ageHours < 24 : true
  ));
}));

document.querySelector('#search')?.addEventListener('input', event => {
  const value = event.target.value.toLowerCase();
  renderTokens(tokens.filter(t => `${t.symbol} ${t.name}`.toLowerCase().includes(value)));
});

fetchLiveData();
setInterval(fetchLiveData, REFRESH_MS);
