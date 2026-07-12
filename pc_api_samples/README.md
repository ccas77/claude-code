# pc_api_samples/

This folder is intended to hold **one real GET response per Publisher Champ endpoint**
(`listAccountsAPI`, `bookStatsAPI`, `authorStatsAPI`, `adsMonitoringAPI`, `countryStatsAPI`).

**It is intentionally empty of data.** No sample JSON was captured because live probing
could not run from the environment where this report was produced:

1. The egress policy **blocks `www.publisherchamp.com`** (proxy 403 on CONNECT).
2. The Publisher Champ `api_key` / `account_id` are **not in any codebase or Vercel env** —
   they live only in the app user's browser `localStorage`.

No responses were fabricated. To populate this folder for real, run the ready-made,
**read-only (GET-only)** commands in `../PC_API_REPORT.md` §6 from a machine with network
access to publisherchamp.com and your key + account UUID. Each command writes one file here:

```
pc_api_samples/
├── listAccountsAPI.json
├── bookStatsAPI.json
├── authorStatsAPI.json
├── adsMonitoringAPI.json
├── countryStatsAPI.json
└── _openapi.json          # optional: full Swagger spec
```

⚠️ These JSON files will contain your real sales, royalty, and ad data (and the responses
may echo request params). Treat them as private; do not commit real data to a public repo.
