# API Call Map

## 1) Router map (Vercel rewrite)

Source: [`vercel.json`](/d:/Project/bonds-dashboard/vercel.json)

- `/api/health/fireant` -> `api/health-fireant.ts`
- `/api/proxy` -> `api/proxy.ts`
- `/api/fireant/:path*` -> `api/proxy.ts?path=:path*`
- `/api/fa/:path*` -> `api/proxy.ts?path=:path*`
- `/api/news` -> `api/news.ts`
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
  N3 --> N4[rest2/restv2/rests.fireant.vn posts]

  A --> AI[src/api/ai.ts]
  AI --> AI2[/api/ai/*]
  AI2 --> AI3[api/ai.ts]
  AI3 --> AI4[https://openai.fireant.vn/v1/*]

  A --> AU[/api/auth/login|logout|session]
  AU --> AU2[api/auth.ts]

  A --> H[/api/health/fireant]
  H --> H2[api/health-fireant.ts]
  H2 --> E
```

## 3) API handler is in which file?

- FireAnt proxy handler: [`api/proxy.ts`](/d:/Project/bonds-dashboard/api/proxy.ts)
- FireAnt route entry (alias files): [`api/fireant/[...path].ts`](/d:/Project/bonds-dashboard/api/fireant/[...path].ts), [`api/fa/[...path].ts`](/d:/Project/bonds-dashboard/api/fa/[...path].ts)
- News aggregate API: [`api/news.ts`](/d:/Project/bonds-dashboard/api/news.ts)
- AI gateway API: [`api/ai.ts`](/d:/Project/bonds-dashboard/api/ai.ts)
- Auth mock/session API: [`api/auth.ts`](/d:/Project/bonds-dashboard/api/auth.ts)
- FireAnt health check: [`api/health-fireant.ts`](/d:/Project/bonds-dashboard/api/health-fireant.ts)
- HTML fetch helper (host-limited): [`api/news-html.ts`](/d:/Project/bonds-dashboard/api/news-html.ts)

## 4) Client/service call points (where API is triggered)

- FireAnt client wrapper (all bond/issuer/industry endpoints): [`src/api/fireant.ts`](/d:/Project/bonds-dashboard/src/api/fireant.ts)
- Bond data orchestration: [`src/services/bondData.ts`](/d:/Project/bonds-dashboard/src/services/bondData.ts)
- Industry bond orchestration (`mapWithConcurrency` usage): [`src/services/industryBondData.ts`](/d:/Project/bonds-dashboard/src/services/industryBondData.ts)
- News client/service: [`src/services/newsService.ts`](/d:/Project/bonds-dashboard/src/services/newsService.ts)
- AI client: [`src/api/ai.ts`](/d:/Project/bonds-dashboard/src/api/ai.ts)
- Auth calls in app shell: [`src/App.tsx`](/d:/Project/bonds-dashboard/src/App.tsx)

## 6) New industry bond filter API (icbCode/statusID)

- Wrapper: `fireantApi.getBondsByIndustryFilter({ icbCode, statusID })` in [`src/api/fireant.ts`](/d:/Project/bonds-dashboard/src/api/fireant.ts)
- Compatibility alias: `fireantApi.getBondsFilter({ icbCode, statusID })` in [`src/api/fireant.ts`](/d:/Project/bonds-dashboard/src/api/fireant.ts)
- Service helper: `loadBondsByIndustryFilter(icbCode, statusID)` in [`src/services/bondData.ts`](/d:/Project/bonds-dashboard/src/services/bondData.ts)
- Compatibility alias: `loadBondsByIndustryStatus(icbCode, statusID)` in [`src/services/bondData.ts`](/d:/Project/bonds-dashboard/src/services/bondData.ts)
- Current implementation maps to FireAnt REST route: `POST /api/fireant/bonds/filter` with body `{ "icbCode": <code>, "statusID": <0|1> }`
- Industry loader uses this filter first, then fans out to `getBond(bondCode)` in parallel for per-bond calculations.

## 5) Important note to adjust

- `RightPanel` currently calls `/api/news/:id` at [`src/components/RightPanel.tsx`](/d:/Project/bonds-dashboard/src/components/RightPanel.tsx).
- Current rewrite only maps `/api/news` (exact), not `/api/news/:id`.
- If you need news-detail API, add rewrite + handler for that path (for example `/api/news/:id`).
