# Moonwatch

Moonwatch is a live Solana meme-coin market radar. It loads current Solana boosted-token and pair data from the public Dexscreener API directly in the browser—no API key or build step is required.

## What is live

- Token prices, 1-hour and 24-hour price changes, volume, and liquidity.
- A fresh list of boosted Solana tokens and the highest-volume live pairs.
- The pair-activity and market-leader panels.

Moonwatch refreshes its market data automatically every minute. Use **Refresh** to fetch it immediately. Each token opens its live Dexscreener page in a new tab.

## Run locally

Serve the folder with:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
