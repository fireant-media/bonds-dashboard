# API Call Map

## 1) Router map (Vercel rewrite)

Source: [`vercel.json`](/d:/FireAnt/project/bonds-dashboard/vercel.json)

- `/api/health/fireant` -> `api/health-fireant`
- `/api/fireant/:path*` -> `api/proxy?path=:path*`
- `/api/fa/:path*` -> `api/proxy?path=:path*`
- `/api/news/:id` -> `api/news?id=:id`
- `/api/news` -> `api/news`
- `/api/page-data/:view` -> `api/page-data?view=:view`
- `/api/page-data` -> `api/page-data`
- `/api/ai/:path*` -> `api/ai?path=:path*`
- `/api/auth/:path*` -> `api/auth?path=:path*`

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
  N3 --> N4[rest2/restv2/rests.fireant.vn posts]

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

## 6) News detail route

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
