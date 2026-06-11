# API Call Map

## 1) Router map (Vercel rewrite)

Source: [`vercel.json`](/d:/FireAnt/project/bonds-dashboard/vercel.json)

- `/api/health/fireant` -> `api/health-fireant.ts`
- `/api/proxy` -> `api/proxy.ts`
- `/api/fireant/:path*` -> `api/proxy.ts?path=:path*`
- `/api/fa/:path*` -> `api/proxy.ts?path=:path*`
- `/api/news/:id` -> `api/news.ts?id=:id`
- `/api/news` -> `api/news.ts`
- `/api/page-data/:view` -> `api/page-data.ts?view=:view`
- `/api/page-data` -> `api/page-data.ts`
- `/api/ai/:path*` -> `api/ai.ts?path=:path*`
- `/api/auth/:path*` -> `api/auth.ts?path=:path*`

## 2) End-to-end flow diagram

```mermaid
flowchart LR
  A[React components/services] --> B[src/api/fireant.ts<br/>fireantRequest()]
  B --> C[/api/fireant/* or /api/fa/*]
  C --> D[api/proxy.ts]
  D --> E[https://restv2.fireant.vn/*]

  A --> N[src/services/newsService.ts]
  N --> N2[/api/news]
  N2 --> N3[api/news.ts]
  N3 --> N4[https://restv2.fireant.vn/posts]

  A --> AI[src/api/ai.ts]
  AI --> AI2[/api/ai/*]
  AI2 --> AI3[api/ai.ts]
  AI3 --> AI4[https://openai.fireant.vn/v1/*]

  A --> AU[/api/auth/login|logout|session]
  AU --> AU2[api/auth.ts]

  A --> PD[/api/page-data/:view]
  PD --> PD2[api/page-data.ts]
  PD2 --> PD3[api/_lib/page-data.ts]
  PD3 --> E

  A --> H[/api/health/fireant]
  H --> H2[api/health-fireant.ts]
  H2 --> E
```

## 3) API handler is in which file?

- FireAnt proxy handler: [`api/proxy.ts`](/d:/FireAnt/project/bonds-dashboard/api/proxy.ts)
- FireAnt route entry (alias files): [`api/fireant/[...path].ts`](/d:/FireAnt/project/bonds-dashboard/api/fireant/[...path].ts), [`api/fa/[...path].ts`](/d:/FireAnt/project/bonds-dashboard/api/fa/[...path].ts)
- News aggregate API: [`api/news.ts`](/d:/FireAnt/project/bonds-dashboard/api/news.ts)
- Page data API for AI/chatbot: [`api/page-data.ts`](/d:/FireAnt/project/bonds-dashboard/api/page-data.ts), [`api/_lib/page-data.ts`](/d:/FireAnt/project/bonds-dashboard/api/_lib/page-data.ts)
- AI gateway API: [`api/ai.ts`](/d:/FireAnt/project/bonds-dashboard/api/ai.ts)
- Auth mock/session API: [`api/auth.ts`](/d:/FireAnt/project/bonds-dashboard/api/auth.ts)
- FireAnt health check: [`api/health-fireant.ts`](/d:/FireAnt/project/bonds-dashboard/api/health-fireant.ts)
- HTML fetch helper (host-limited): [`api/news-html.ts`](/d:/FireAnt/project/bonds-dashboard/api/news-html.ts)

## 4) Client/service call points (where API is triggered)

- FireAnt client wrapper (all bond/issuer/industry endpoints): [`src/api/fireant.ts`](/d:/FireAnt/project/bonds-dashboard/src/api/fireant.ts)
- Bond data orchestration: [`src/services/bondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/bondData.ts)
- Industry bond orchestration (`mapWithConcurrency` usage): [`src/services/industryBondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/industryBondData.ts)
- News client/service: [`src/services/newsService.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/newsService.ts)
- AI client: [`src/api/ai.ts`](/d:/FireAnt/project/bonds-dashboard/src/api/ai.ts)
- Auth calls in app shell: [`src/App.tsx`](/d:/FireAnt/project/bonds-dashboard/src/App.tsx)

## 5) New industry bond filter API (icbCode/statusID)

- Wrapper: `fireantApi.getBondsByIndustryFilter({ icbCode, statusID })` in [`src/api/fireant.ts`](/d:/FireAnt/project/bonds-dashboard/src/api/fireant.ts)
- Compatibility alias: `fireantApi.getBondsFilter({ icbCode, statusID })` in [`src/api/fireant.ts`](/d:/FireAnt/project/bonds-dashboard/src/api/fireant.ts)
- Service helper: `loadBondsByIndustryFilter(icbCode, statusID)` in [`src/services/bondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/bondData.ts)
- Compatibility alias: `loadBondsByIndustryStatus(icbCode, statusID)` in [`src/services/bondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/bondData.ts)
- Current implementation maps to FireAnt REST route: `POST /api/fireant/bonds/filter` with body `{ "icbCode": <code>, "statusID": <0|1> }`
- Industry loader uses this filter first, then fans out to `getBond(bondCode)` in parallel for per-bond calculations.
- Legacy compatibility in `api/proxy.ts`: `/api/fireant/bond_Filter?IssuerSymbol=STB` is translated to `GET /bonds/issuer/STB` so deployed clients or bookmarks do not hit the removed FireAnt procedure endpoint.

## 5.1) Generic POST /bonds/filter guide

Purpose: use one REST filter endpoint for ad hoc bond filtering by kỳ hạn, ngày phát hành, ngày đáo hạn, lợi suất, tổ chức phát hành, ICB code, và các điều kiện thị trường khác.

- App wrapper: `fireantApi.filterBonds(body)` in [`src/api/fireant.ts`](/d:/FireAnt/project/bonds-dashboard/src/api/fireant.ts)
- Service mapper: `toRestBondFilterBody(query)` in [`src/services/bondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/bondData.ts)
- Generic loader: `loadBondFilterRows(query)` in [`src/services/bondData.ts`](/d:/FireAnt/project/bonds-dashboard/src/services/bondData.ts)
- Current implementation maps to FireAnt REST route: `POST /api/fireant/bonds/filter`

Canonical JSON body:

```json
{
  "bondTypeID": 0,
  "bondRateTypeID": 0,
  "currencyID": 0,
  "marketID": 0,
  "icbCode": "string",
  "issueFormID": 0,
  "issueMethodID": 0,
  "statusID": 0,
  "issuerName": "string",
  "issuerInstitutionID": 0,
  "issuerSymbol": "string",
  "isListing": 0,
  "issueDateFrom": "2026-06-11T03:46:58.595Z",
  "issueDateTo": "2026-06-11T03:46:58.595Z",
  "maturityDateFrom": "2026-06-11T03:46:58.595Z",
  "maturityDateTo": "2026-06-11T03:46:58.595Z",
  "minBondRate": 0,
  "maxBondRate": 0,
  "minTenorMonths": 0,
  "maxTenorMonths": 0,
  "top": 0,
  "sortBy": 0
}
```

Example: filter by tenor

```json
{
  "statusID": 1,
  "minTenorMonths": 0,
  "maxTenorMonths": 50
}
```

Example: filter by issue date

```json
{
  "statusID": 1,
  "issueDateFrom": "2026-06-11T03:46:58.595Z",
  "issueDateTo": "2026-06-11T03:46:58.595Z"
}
```

Example: filter by maturity date

```json
{
  "statusID": 1,
  "maturityDateFrom": "2026-06-11T03:46:58.595Z",
  "maturityDateTo": "2026-06-11T03:46:58.595Z"
}
```

Example: filter by bond yield / rate

```json
{
  "statusID": 0,
  "minBondRate": 0,
  "maxBondRate": 0
}
```

`sortBy` reference:

- `0`: ten to chuc phat hanh theo Alphabet
- `1`: ma trai phieu theo Alphabet
- `2`: tong khoi luong phat hanh giam dan
- `3`: tong gia tri phat hanh giam dan
- `4`: thoi gian dao han gan nhat
- `5`: thoi gian phat hanh moi nhat
- `6`: lai suat danh nghia giam dan
- `7`: khoi luong niem yet giam dan
- `8`: gia tri niem yet giam dan
- `null` hoac gia tri khac: mac dinh theo ten to chuc phat hanh

## 5.2) AI bond filter flow

Purpose: let users describe bond filter conditions in natural language, then convert them into a short JSON body for `POST /bonds/filter`.

- Shared extractor service: `extractBondFilterCriteria()` in [`src/services/aiBondFilter.ts`](/f:/FireAnt/project/bonds-dashboard/src/services/aiBondFilter.ts)
- Query builder: `buildBondFilterQueryFromCriteria()` in [`src/services/aiBondFilter.ts`](/f:/FireAnt/project/bonds-dashboard/src/services/aiBondFilter.ts)
- Filter page integration: [`src/components/MarketBondFilterView.tsx`](/f:/FireAnt/project/bonds-dashboard/src/components/MarketBondFilterView.tsx)
- Chatbot integration: [`src/components/AIChatBot.tsx`](/f:/FireAnt/project/bonds-dashboard/src/components/AIChatBot.tsx)

Supported AI-extracted fields:

```json
{
  "minTenorMonths": 0,
  "maxTenorMonths": 0,
  "issueDateFrom": "2026-06-11",
  "issueDateTo": "2026-06-11",
  "maturityDateFrom": "2026-06-11",
  "maturityDateTo": "2026-06-11",
  "minBondRate": 0,
  "maxBondRate": 0,
  "bondRateType": "fixed",
  "sortBy": 6
}
```

Rules:

- If the user does not mention a field, that field is omitted from the JSON.
- `bondRateType` is normalized to `fixed` or `floating`.
- Relative time phrases are resolved against `2026-06-11`.
- Final REST body still merges market defaults such as `statusID: 1` and `isListing: 1`.

Flow:

```mermaid
flowchart LR
  A[User natural language] --> B[src/services/aiBondFilter.ts]
  B --> C[/api/ai/chat]
  C --> D[openai.fireant.vn]
  B --> E[normalized criteria JSON]
  E --> F[src/api/fireant.ts filterBonds()]
  F --> G[/api/fireant/bonds/filter]
  G --> H[restv2.fireant.vn /bonds/filter]
  H --> I[Filtered bond rows]
  I --> J[Filter page or AI chatbot response]
```

## 6) News detail route

- News list retrieval in both `server.ts` and `api/news.ts` maps to FireAnt REST route `GET /posts?type=1`; do not use the retired `/posts/get-posts-by-group` request.
- `RightPanel` calls `/api/news/:id` to resolve missing thumbnails.
- Vercel rewrites `/api/news/:id` to `api/news?id=:id`.
- `api/news.ts` first tries `/posts/get-post?postID={id}` and falls back to matching the post from list endpoints.

## 7) Page-data API for AI/chatbot

Purpose: expose the same page-shaped data used by dashboard cards and charts so chatbot/AI callers can read one stable payload per user page.

- Schema: `GET /api/page-data/schema`
- Market overview: `GET /api/page-data/market-overview?includeCashFlows=0|1&detailLimit=120`
- Industry page: `GET /api/page-data/industry?industryId=Banking&includeCashFlows=0|1&detailLimit=150`
- Issuer search: `GET /api/page-data/issuer?q=STB`
- Issuer page: `GET /api/page-data/issuer?symbol=STB&detailLimit=120`
- Watchlist page: `GET /api/page-data/watchlist?codes=BOND1,BOND2` or `POST /api/page-data/watchlist` with `{ "codes": ["BOND1", "BOND2"] }`
- Maturity page: `GET /api/page-data/maturity?days=365`

Notes:

- Watchlist is stored in browser localStorage, so server-side AI callers must send `codes` or `items`.
- Market overview cards and level-1 industry charts come from `/bonds/stats/industries?top=1000&level=1`.
- Industry pages hydrate `/bonds/filter` rows and optional bond detail/cash-flow data.
- All page-data routes are available locally through `server.ts` and on Vercel through `api/page-data.ts`.

## 8) Chatbot data selection guide

The project chatbot sends an `apiCatalog` plus one or more compact `datasets` into `[PAGE_DATA]`. The assistant should choose the dataset that best matches the user's question and avoid inventing numbers outside those datasets.

| User intent | Page-data view | Main fields for AI | Source FireAnt APIs |
| --- | --- | --- | --- |
| Market overview, top issuers, top interest, issued/listed value by industry | `market-overview` | `cards`, `topIssuers`, `topInterestBonds`, `valueByIndustry`, `volumeByIndustry` | `/bonds/stats/industries`, `/bonds/stats/issuers/top-debt`, `/bonds/stats/bonds/high-yield` |
| Industry analysis such as Banking, Securities, RealEstate | `industry` | `cards`, `debtRanking`, `issuedValueLeaders`, `interestRates` | `/bonds/stats/industries`, `/icb/{code}/symbols`, `/bonds/filter`, `/bonds/stats/issuers/top-debt` |
| Issuer analysis by symbol such as STB, VHM, VIC | `issuer` | `profile`, `cards`, `bonds`, `termDistribution`, `interestTypeDistribution` | `/bonds/issuer/{symbol}`, `/symbols/{symbol}/profile`, `/symbols/{symbol}/financial-data`, `/bonds/{bondCode}` |
| Maturity pressure and upcoming redemption | `maturity` | `cards`, `bonds`, `byWarningStatus`, `byIssuer`, `byMaturityMonth` | `/bonds/stats/bonds/maturing-soon?days={days}` |
| User watchlist | `watchlist` | `cards`, `items`, `termDistribution`, `interestTypeDistribution` | Caller-provided watchlist codes plus `/bonds/{bondCode}` |

Chatbot behavior:

- It always includes the current route's page-data context.
- It adds extra datasets based on the question, e.g. maturity questions add `maturity`, industry names add `industry`, uppercase ticker-like tokens add `issuer`.
- It keeps JSON compact by sending only chart/card rows needed for analysis, not full raw API responses.
- It sends the logged-in user's FireAnt access token through `X-Fireant-Access-Token`; direct browser address-bar requests to protected page-data routes will not include this header.
