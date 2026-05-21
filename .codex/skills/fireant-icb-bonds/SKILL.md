---
name: fireant-icb-bonds
description: FireAnt ICB bond issuance data workflow for bonds-dashboard. Use when implementing or modifying industry bond data logic, sidebar industry ordering, ICB symbol fetching, duplicate symbol handling, grouped issuer/bond data, or industry charts based on FireAnt APIs.
---

# FireAnt ICB Bonds

Use this workflow for industry tabs and charts that depend on FireAnt ICB data.

## Source APIs

Use the app proxy/helpers instead of hardcoding FireAnt URLs or bearer tokens:

- Symbols by ICB: `fireantApi.getIcbSymbols(code)` -> `/icb/{code}/symbols`
- Bonds by issuer: `fireantApi.getIssuerBonds(symbol)` -> `/bonds/issuer/{symbol}`
- Bond detail/cash flows: `fireantApi.getBond(code)` -> `/bonds/{code}`
- Industry stats for Cards and interest chart: `fireantApi.getIndustries(top, level)` -> `/bonds/stats/industries?top=10&level={level}`

## ICB Industries

Use this exact industry set:

| Code | ID | Label | Level |
| --- | --- | --- | --- |
| `10` | `Technology` | Công nghệ | 1 |
| `15` | `Telecommunications` | Viễn thông | 1 |
| `20` | `HealthCare` | Chăm sóc sức khỏe | 1 |
| `30` | `Financials` | Tài chính khác | 1 |
| `3010` | `Banking` | Ngân hàng | 2 |
| `30202005` | `Securities` | Chứng khoán | 4 |
| `35` | `RealEstate` | Bất động sản | 1 |
| `40` | `ConsumerDiscretionary` | Hàng tiêu dùng không thiết yếu | 1 |
| `45` | `ConsumerStaples` | Hàng tiêu dùng cơ bản | 1 |
| `50` | `Industrials` | Công nghiệp | 1 |
| `55` | `BasicMaterials` | Vật liệu cơ bản | 1 |
| `60` | `Energy` | Năng lượng | 1 |
| `65` | `InfrastructureServices` | Các dịch vụ hạ tầng | 1 |

Keep this list centralized in `src/constants/industries.ts`.

## Duplicate Symbol Rule

Each symbol must belong to exactly one industry. Deduplicate with a `Set` or `Map`.

Priority for overlapping financial symbols:

1. `Securities` (`30202005`)
2. `Banking` (`3010`)
3. `Financials` (`30`)

Implementation pattern:

```ts
const assignedSymbols = new Map<string, string>();

industries
  .sort((a, b) => a.priority - b.priority)
  .forEach((industry) => {
    const symbols = rawSymbolsByIndustry.get(industry.id) || [];
    groupedSymbols[industry.id] = symbols.filter((symbol) => {
      if (assignedSymbols.has(symbol)) return false;
      assignedSymbols.set(symbol, industry.id);
      return true;
    });
  });
```

After this pass, `Financials` means “Tài chính khác”: financial symbols not already assigned to Securities or Banking.

## Grouped Bond Data

For each final industry symbol group:

1. Fetch bonds for each issuer symbol with `getIssuerBonds(symbol)`.
2. Deduplicate bonds by `bondCode`.
3. Fetch bond detail with `getBond(bondCode)` when chart values need `totalIssuedValue`, `currentListedValue`, or cash flows.
4. Merge issuer symbol/name onto every bond.
5. Group by industry ID and issuer symbol.

The final grouped shape should support:

- `symbols`: deduped symbols assigned to the industry.
- `bonds`: deduped bonds for those symbols.
- `issuerSummaries`: issuer-level totals for ranking and market-share charts.
- `industryStats`: industry totals for KPI cards.
- `projectedCashFlowBuckets`: month buckets for cash-flow charts.

## Industry Stats Contract

Cards and the "Bieu do Lai suat nganh" must use `/bonds/stats/industries` by the industry level, not totals recomputed from issuer bonds:

- Level 1 industries use `level=1`.
- `Banking` uses `level=2`.
- `Securities` uses `level=4`.

Map API fields to Cards:

- `totalIssuedVolume` -> Khoi luong phat hanh
- `totalIssuedValue` -> Tong gia tri phat hanh
- `totalCurrentListedVolume` -> Khoi luong niem yet
- `totalCurrentListedValue` -> Gia tri niem yet
- `totalDebtFull` -> Tong du no ban dau
- `totalRemainingDebt` -> Du no con lai

Map API fields to the interest chart:

- `avgRate` -> LS trung binh
- `avgCouponRate` -> LS coupon
- `floatingRate` -> LS tha noi

For `Financials` / "Tai chinh khac", calculate residual stats:

```ts
financialsOther = financialsLevel1 - bankingLevel2 - securitiesLevel4;
```

Apply direct subtraction for count/volume/value/debt fields. For rate fields, calculate the residual weighted by `totalIssuedValue`:

```ts
otherRate = (
  financialsRate * financialsIssuedValue
  - bankingRate * bankingIssuedValue
  - securitiesRate * securitiesIssuedValue
) / otherIssuedValue;
```

## Chart Data Contract

Industry tabs should render directly from the grouped industry data:

- Xếp hạng dư nợ trái phiếu trong ngành: `issuerSummaries` sorted by `totalRemainingDebt`.
- Thị phần dư nợ trong ngành: `issuerSummaries` share of `totalRemainingDebt`.
- Mối liên hệ dư nợ còn lại & số lô trái phiếu: `issuerSummaries.totalRemainingDebt` and `issuerSummaries.bondCount`.
- Dòng tiền dự kiến tháng/năm: `projectedCashFlowBuckets`.

Do not use `top_debt_200` as the primary source for industry charts when grouped ICB bond data is required.
