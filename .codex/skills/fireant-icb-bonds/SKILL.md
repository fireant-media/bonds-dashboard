---
name: fireant-icb-bonds
description: FireAnt ICB bond issuance data workflow for bonds-dashboard. Use when implementing or modifying industry bond data logic, sidebar industry ordering, ICB symbol fetching, duplicate symbol handling, grouped issuer/bond data, or industry charts based on FireAnt APIs.
---

# FireAnt ICB Bonds

Use this workflow for industry tabs, issuer views, maturity views, and charts that depend on FireAnt bond data.

## Vercel, Auth, And Env Rules

This project uses an older Vercel `builds` configuration. Keep API rewrites in `vercel.json` pointing to TypeScript files with the `.ts` suffix:

- Use `"src": "api/*.ts"` for the `@vercel/node` build entry.
- Use `/api/proxy.ts?path=:path*`, not `/api/proxy?path=:path*`.
- Use `/api/auth.ts?path=:path*`, not `/api/auth?path=:path*`.
- Use `/api/news.ts`, `/api/news.ts?id=:id`, `/api/ai.ts?path=:path*`, and `/api/page-data.ts?view=:view`.
- Do not add nested exact Vercel handlers such as `api/auth/login.ts` or `api/fireant/bonds/filter.ts` unless the Vercel build strategy is changed and tested end to end. The working production path relies on wildcard rewrites into top-level handlers.

If deployed `POST /api/auth/login` or `POST /api/fireant/bonds/filter` returns `405 Method Not Allowed`, first compare `vercel.json` against the working pattern above. In this repo, extensionless destinations caused POST requests to miss the intended Node function.

FireAnt OIDC login must use the deployed origin for callback URLs:

- `src/auth/oidc.tsx` should use `APP_URL` from `src/api/config.ts`, not read `VITE_APP_BASE_URL` directly.
- `src/api/config.ts` should prefer `window.location.origin` when `VITE_APP_BASE_URL` is empty.
- If `VITE_APP_BASE_URL` is set to `http://localhost:3000` while running on `bonds.fireant.vn`, ignore that local value and use the browser origin.
- On Vercel, set `VITE_APP_BASE_URL=https://bonds.fireant.vn` or leave it empty. Never deploy production with `VITE_APP_BASE_URL=http://localhost:3000`.
- FireAnt OIDC must allow production callbacks: `/signin-callback`, `/signout-callback`, and `/silent-renew-callback` on `https://bonds.fireant.vn`.

FireAnt REST base URL rules:

- Use only `https://restv2.fireant.vn` for FireAnt REST APIs.
- Do not reintroduce `https://rest2.fireant.vn` or `https://rests.fireant.vn`.
- Server config should read `FIREANT_BASE_URL` / `VITE_FIREANT_BASE_URL` with fallback `https://restv2.fireant.vn`.
- Client config should read `VITE_FIREANT_BASE_URL` with fallback `https://restv2.fireant.vn`.

TypeScript project rules:

- Keep `tsconfig.json` scoped with `include` for `server.ts`, `vite.config.ts`, `api/**/*.ts`, and `src/**/*`.
- Keep `exclude` for `dist` and `node_modules`. With `allowJs: true`, omitting `exclude` makes TypeScript/IDE scan built assets in `dist`.
- `baseUrl: "."` is valid; if the IDE marks it, check `include/exclude` and TypeScript server state before changing module paths.

## Page Data API For AI

When chatbot or AI features need dashboard data, expose page-shaped payloads through `api/_lib/page-data.ts` and `api/page-data.ts` instead of reimplementing screen calculations inside the chatbot.

Supported routes:

- `GET /api/page-data/schema` returns endpoint descriptions and response sections.
- `GET /api/page-data/market-overview?includeCashFlows=0|1&detailLimit=120` returns cards and charts for market overview.
- `GET /api/page-data/industry?industryId=Banking&includeCashFlows=0|1&detailLimit=150` returns cards and charts for one industry.
- `GET /api/page-data/issuer?q=STB` searches issuers.
- `GET /api/page-data/issuer?symbol=STB&detailLimit=120` returns issuer profile, cards, charts, and bonds.
- `GET /api/page-data/watchlist?codes=BOND1,BOND2` or `POST /api/page-data/watchlist` with `{ "codes": [...] }` hydrates watchlist page data.
- `GET /api/page-data/maturity?days=365` returns upcoming maturity page data.

Keep this API aligned with user-facing page structure: `page`, `params`, `cards`, `charts`, page-specific lists, and optional `raw` source data. Watchlist lives in browser localStorage, so server APIs must receive bond codes from the caller.

## Source APIs

Always use the app proxy/helpers instead of hardcoding FireAnt URLs or bearer tokens.

Primary REST sources:

- Symbols by ICB: `fireantApi.getIcbSymbols(code)` -> `GET /icb/{code}/symbols`
- Bonds by issuer: `fireantApi.getIssuerBonds(symbol)` -> `GET /bonds/issuer/{symbol}`
- Bonds by industry: `fireantApi.getBondsByIndustryFilter({ icbCode, statusID })` -> `POST /bonds/filter`
- Bond detail/cash flows: `fireantApi.getBond(code)` -> `GET /bonds/{code}`
- Maturing bonds: `fireantApi.getMaturingSoon(days)` -> `GET /bonds/stats/bonds/maturing-soon?days={days}`
- Issuer stats: `fireantApi.getTopDebtIssuers(top)` -> `GET /bonds/stats/issuers/top-debt?top={top}`
- Industry stats: `fireantApi.getIndustries(top, level)` -> `GET /bonds/stats/industries?top={top}&level={level}`
- Market overview level-1 industry stats: `fireantApi.getIndustries(1000, 1)` -> `GET /bonds/stats/industries?top=1000&level=1`

Legacy procedure endpoints are compatibility only:

- `bond_Filter` must not be the first choice for issuer, maturity, or industry loaders.
- `/api/fireant/bond_Filter?IssuerSymbol=STB` is translated in `api/proxy.ts` to `/bonds/issuer/STB`.
- `/api/fireant/bond_Filter?ICBCode=3010&StatusID=1` is translated in `api/proxy.ts` to `POST /bonds/filter`.
- `/api/fireant/bond_Filter?MaturityDateFrom=...&MaturityDateTo=...` is translated in `api/proxy.ts` to `/bonds/stats/bonds/maturing-soon`.
- `bond_StatisticsByIssuer` is translated to `/bonds/stats/issuers/top-debt`.
- `bond_GetCategoryList` is translated for issuer and industry category usage.

## ICB Industries

Use this exact industry set and keep it centralized in `src/constants/industries.ts`.

| Code | ID | Label | Level |
| --- | --- | --- | --- |
| `10` | `Technology` | Technology | 1 |
| `15` | `Telecommunications` | Telecommunications | 1 |
| `20` | `HealthCare` | Health care | 1 |
| `30` | `Financials` | Financials other | 1 |
| `3010` | `Banking` | Banking | 2 |
| `30202005` | `Securities` | Securities | 4 |
| `35` | `RealEstate` | Real estate | 1 |
| `40` | `ConsumerDiscretionary` | Consumer discretionary | 1 |
| `45` | `ConsumerStaples` | Consumer staples | 1 |
| `50` | `Industrials` | Industrials | 1 |
| `55` | `BasicMaterials` | Basic materials | 1 |
| `60` | `Energy` | Energy | 1 |
| `65` | `InfrastructureServices` | Infrastructure services | 1 |

## Duplicate Symbol Rule

Each symbol must belong to exactly one industry. Deduplicate with a `Set` or `Map`.

Priority for overlapping financial symbols:

1. `Securities` (`30202005`)
2. `Banking` (`3010`)
3. `Financials` (`30`)

After this pass, `Financials` means financial symbols not already assigned to Securities or Banking.

## Grouped Bond Data

For each final industry group:

1. Fetch bonds by industry code with `fireantApi.getBondsByIndustryFilter({ icbCode, statusID: 1 })`.
2. For `Financials`, fetch `30` and exclude child industry bonds from `3010` and `30202005`.
   Check all returned ICB code shapes, including `icbCode`, `ICBCode`, `icbCodeLv1` through `icbCodeLv4`, nested `bondInfos`, `raw`, and `infoObj` variants.
3. Deduplicate bonds by uppercase `bondCode`.
4. Fetch bond detail with `getBond(bondCode)` when chart values need `totalIssuedValue`, `currentListedValue`, or cash flows.
5. Merge issuer symbol/name onto every bond.
6. Group by industry ID and issuer symbol.

The final grouped shape should support:

- `symbols`: deduped symbols assigned to the industry.
- `bonds`: deduped bonds for those symbols.
- `issuerSummaries`: issuer-level totals for ranking and market-share charts.
- `industryStats`: industry totals for KPI cards.
- `projectedCashFlowBuckets`: month buckets for cash-flow charts.

Industry pages should render in stages:

1. Show cached industry data immediately.
2. Load industry bond rows first so ranking and market-share cards can render early.
3. Fetch bond detail in the background and replace cached data when it arrives.
4. Keep chart state stable while data upgrades instead of resetting to empty.

## Fetch Concurrency

When fetching a list of issuers or bond details, do not fetch sequentially and do not open unbounded `Promise.all` request storms.

Use `mapWithConcurrency` from `src/utils/async.ts`.

Recommended concurrency:

- Issuer bond lists: `6`
- Bond detail / cash-flow fetches: `8` to `10`
- Issuer profiles / translated names: `5`

For expensive grouped industry loaders, keep an in-flight promise map alongside persistent cache. This prevents React StrictMode remounts, quick tab switches, or duplicate callers from starting the same industry calculation twice before the first result is cached.

## Fetch And Calculation Contract

- `loadIssuerBondsByFilter(symbol)` must use `GET /bonds/issuer/{symbol}` directly.
- `loadMaturingBonds(days)` must use `/bonds/stats/bonds/maturing-soon` directly.
- `loadBondsByIndustryFilter(icbCode, statusID)` must use `POST /bonds/filter` directly.
- `loadBondFilterRows(query)` may call legacy `bond_Filter` only for unsupported ad hoc filters.
- Normalize every API payload through `normalizeBondRow` before UI mapping.
- Cache by normalized query and dedupe in-flight calls with maps to avoid duplicate StrictMode requests.
- Convert VND values to billion VND only at UI/chart boundaries. Keep raw service totals in original API units unless a function name or interface explicitly documents billion VND.
- Calculate issuer summaries from deduped bonds. Use `currentListedValue` as remaining debt fallback when `totalRemainingDebt` is absent.
- For cash-flow charts, use `cashFlows` from detail. If cash flows are absent, fallback to maturity principal using `currentListedValue || totalRemainingDebt || totalIssuedValue`.
- Market overview KPI cards and level-1 industry charts must come from `fireantApi.getIndustries(1000, 1)`, not grouped residual industry data.
- Market overview KPI cards map level-1 industry stats by summing: `bondCount`, `totalIssuedVolume`, `totalIssuedValue`, and `totalRemainingDebt`.
- Market overview value-by-industry chart uses `totalIssuedValue` and `totalCurrentListedValue`.
- Market overview volume-by-industry chart uses `totalIssuedVolume` and `totalCurrentListedVolume`.
- Market overview total issued volume KPI and industry issued/listed volume KPIs display volume as millions of bonds at the UI boundary (`volume / 1_000_000`); keep raw service values unchanged.
- Market overview projected cash-flow charts must include x-axis `dataZoom` for both month and year modes.
- Industry projected cash-flow charts must include x-axis `dataZoom` for both month and year modes.
- Dashboard core warmup must not fetch grouped data for every industry. When a user opens or hovers a specific industry, fetch that industry first with `warmIndustryData(industryId)` / `loadIndustryBaseBondGroupData(industryId)` / `loadIndustryBondGroupData(industryId)`.

## Industry Stats Contract

Cards and the interest chart should use `/bonds/stats/industries` by industry level when possible:

- Level 1 industries use `level=1`.
- `Banking` uses `level=2`.
- `Securities` uses `level=4`.

Map API fields to cards:

- `totalIssuedVolume` -> issued volume
- `totalIssuedValue` -> issued value
- `totalCurrentListedVolume` -> listed volume
- `totalCurrentListedValue` -> listed value
- `totalDebtFull` -> original debt
- `totalRemainingDebt` -> remaining debt

Map API fields to the interest chart:

- `avgRate` -> average rate
- `avgCouponRate` -> coupon rate
- `floatingRate` -> floating rate

For `Financials` / financials other, calculate residual stats:

```ts
financialsOther = financialsLevel1 - bankingLevel2 - securitiesLevel4;
```

Apply direct subtraction for count/volume/value/debt fields. For rate fields, calculate the residual weighted by `totalIssuedValue`.

## Chart Data Contract

Industry tabs should render directly from grouped industry data:

- Debt ranking in industry: `issuerSummaries` sorted by `totalRemainingDebt`.
- Debt market share in industry: `issuerSummaries` share of `totalRemainingDebt`.
- Remaining debt and bond count relation: `issuerSummaries.totalRemainingDebt` and `issuerSummaries.bondCount`.
- Monthly/yearly projected cash flow: `projectedCashFlowBuckets`.

Do not use `top_debt_200` as the primary source for industry charts when grouped ICB bond data is required.

## Bond Detail Assessment

Use this rule for the `Đánh giá` section in the bond detail popup, specifically the item renamed to `Mức lãi suất so với ngành`.

### Purpose

Evaluate a corporate bond's interest rate relative to peer bonds in the same industry.

### Output

- `Thấp`
- `Trung bình`
- `Cao`
- `null` when there is not enough peer data to evaluate

### Normalization

- `remainingTerm = maturityDate - today`
- `termGroup`:
  - `short_term` when remaining term is less than 36 months
  - `long_term` when remaining term is 36 months or more
- `rateType`:
  - `fixed`
  - `floating`
- Never compare fixed and floating bonds directly.

### Peer Group Construction

Start with:

- `industry + rateType + termGroup`

If peer bond count is below 5, expand in this order:

1. Drop `termGroup`, keep `industry + rateType`
2. If still below 5, drop `rateType`, keep `industry`

### Threshold Rules

- If `peerBondCount >= 5`, use dynamic percentiles:
  - `lãi suất < P25` -> `Thấp`
  - `P25 <= lãi suất <= P75` -> `Trung bình`
  - `lãi suất > P75` -> `Cao`
- If `industryPeerCount` is from 2 to 4, use the industry's median:
  - below median -> `Thấp`
  - near median -> `Trung bình`
  - above median -> `Cao`
  - include `confidence: low`
- If `industryPeerCount < 2`, return `null`

### Absolute Rules

- Do not use fixed hardcoded thresholds.
- Do not compare across other industries.
- Do not compare floating with fixed.
- Recalculate thresholds whenever bond data changes or on daily refresh.
