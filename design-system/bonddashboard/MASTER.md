# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules override this Master file.
> If not, follow the rules below.

---

**Project:** FireAnt Bonds Dashboard
**Updated:** 2026-05-26
**Category:** Financial SaaS / Bond Analytics Dashboard

---

## Design Direction

FireAnt Bonds Dashboard uses a compact, high-contrast financial interface with professional light and dark modes. Light mode uses warm-light surfaces so charts do not feel washed out. Dark mode uses deep slate surfaces with higher chart saturation and controlled glow. The product should feel institutional, fast, and analytical rather than decorative.

- **Core mood:** premium data terminal, calm SaaS, compact operations.
- **Primary interaction color:** Walden blue `#3FB1E3`, with Tailwind `blue-500`/`blue-600` acceptable for standard controls.
- **Surface language:** crisp borders, soft elevation, subtle glass effect, clear focus states.
- **Density:** compact spacing with enough breathing room for tables and chart controls.

---

## Color Tokens

| Role | Light | Dark | Tailwind Usage |
|------|-------|------|----------------|
| Background | `#F5F7FB` | `#0F172A` | `bg-bg-base` |
| Surface | `#FFFFFF` | `#131C31` | `bg-bg-surface` |
| Low Surface / Hover | `#EEF2FF` | `#17233A` | `bg-surface-container-low` |
| Bright Surface / Glass | `#FFFFFF` | `#18243A` | `bg-surface-bright` |
| Text | `#1E293B` | `#E5E7EB` | `text-text-base` |
| Muted Text | `#64748B` | `#94A3B8` | `text-text-muted` |
| Text Highlight | `#256F93` | `#3FB1E3` | `text-text-highlight` |
| Action Accent | `#3FB1E3` | `#3FB1E3` | `bg-action-accent` |
| Border | `rgba(15,23,42,0.06)` | `rgba(255,255,255,0.06)` | `border-border-base` |

### Palette Rules

- Use Walden blue and cyan/green as the dominant accent pair for active states, chart focus, primary buttons, search focus, and selected navigation.
- Use `bg-action-accent` for active/primary button backgrounds, paired with `text-slate-950`.
- Use `text-text-highlight` for links, selected labels, and ticker text; it is darker in light mode for readability.
- Use warm-light backgrounds in light mode, not pure white across the full viewport.
- Use deep slate surfaces in dark mode, not pure black.
- Use semantic colors sparingly for status only: red for risk/error, emerald for success, amber for warnings.
- Do not introduce one-off inline color styles for UI. Use theme tokens or standard Tailwind color scales.

---

## Chart Palette

Use this fixed ECharts/D3 palette:

```ts
['#3FB1E3', '#6BE6C1', '#626C91', '#A0A7E6', '#C4EBAD', '#96DEE8']
```

- Default series colors remain deterministic from the palette.
- Single-series bars use the blue/cyan gradient pair: `#3FB1E3` to `#96DEE8`.
- Comparison or stacked bars with two series use contrasting pairs: series 1 blue/cyan (`#3FB1E3` to `#96DEE8`) and series 2 indigo/purple (`#626C91` to `#A0A7E6`).
- Projected cash-flow charts render as smooth stacked area lines and follow the same two-series color mapping as industry-volume bars: interest uses blue/cyan and principal uses indigo/purple.
- Additional bars may use the green pair (`#6BE6C1` to `#C4EBAD`) before cycling.
- Keep assignments deterministic across renders.
- Light chart theme: background `#F5F7FB`, panel `#FFFFFF`, labels `#64748B`, text `#1E293B`, grid `rgba(15,23,42,0.05)`, border `rgba(15,23,42,0.06)`.
- Dark chart theme: background `#0F172A`, panel `#131C31`, labels `#94A3B8`, text `#E5E7EB`, grid `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.06)`.
- Use lower gradient opacity in light mode so the pastel palette does not wash out labels.
- Use stronger line/bar contrast and slightly stronger gradients in dark mode.
- Donut charts use white separators in light mode and `#0F172A` separators in dark mode.
- Pie and donut slices must inherit the palette per data item; do not assign one series-level color that collapses all slices to the same hue.
- Candlestick charts use `#6BE6C1` for up candles and `#626C91` for down candles.
- Mixed bar/line comparisons use a contrasting line stroke: `#626C91` in light mode and `#A0A7E6` in dark mode.

### Gradient Rules

Light mode area gradients:

- Blue: `rgba(63,177,227,0.22-0.28)` to `rgba(63,177,227,0.01)`.
- Green: `rgba(107,230,193,0.20-0.24)` to `rgba(107,230,193,0.01)`.
- Purple: `rgba(160,167,230,0.18-0.22)` to `rgba(160,167,230,0.01)`.

Dark mode area gradients:

- Blue: `rgba(63,177,227,0.45-0.65)` to `rgba(63,177,227,0.02)`.
- Green: `rgba(107,230,193,0.45-0.55)` to `rgba(107,230,193,0.02)`.
- Purple: `rgba(160,167,230,0.45-0.55)` to `rgba(160,167,230,0.02)`.

- Horizontal bars run gradients left-to-right along the value direction.

---

## Typography

- Use `Manrope` for product UI.
- Primary titles: `text-text-base font-bold`.
- Section titles: `text-text-base font-semibold`.
- Secondary content: `text-text-muted font-medium`.
- Captions/meta: `text-text-muted/80 font-semibold uppercase text-xs`.
- Never use `font-black`.
- Do not use negative letter spacing.

---

## Components

### Buttons

- Primary: `rounded-lg bg-action-accent text-slate-950 font-semibold shadow-md shadow-cyan-500/20 hover:opacity-90`.
- Secondary: `rounded-lg border border-border-base bg-bg-surface text-text-base hover:border-blue-500 hover:text-blue-600`.
- Icon buttons: square controls with lucide icons, `rounded-lg`, visible focus ring, and `cursor-pointer`.
- Use `active:scale-95` only for buttons; avoid hover transforms that shift layout.

### Cards

- Default dashboard and chart cards use `rounded-lg border border-border-base bg-bg-surface shadow-sm`.
- Light glass cards may use white at 70-80% opacity with blur and soft shadow.
- Dark cards use deep slate panels with subtle border and avoid heavy glow.
- KPI cards may add subtle blue shadow and a small blue indicator surface.
- KPI labels, values, and units must wrap within narrowed cards; do not use `whitespace-nowrap` on metric content.
- Bond volume KPI values are shown in millions of bonds at the UI boundary (`raw volume / 1,000,000`) with `Triệu trái phiếu` / `Million Bonds` as the unit.
- Avoid nested cards unless the inner element is a genuine repeated item or modal.
- Card headings stay compact; do not use hero-scale typography inside dashboard panels.

### Tables

- Header text is uppercase.
- Column unit appears on a second line under the title.
- Titles use `whitespace-nowrap`.
- Header styling follows `text-xs font-bold uppercase tracking-wider whitespace-nowrap`.
- Issuer and watchlist tables use `bg-surface-container-low text-text-muted` header rows with `border-border-base`, rather than a saturated brand fill.

### Charts

- All chart options should use `CHART_PALETTE` from `src/utils/chart.ts`.
- Tooltip surfaces must match app theme.
- Tooltip numeric values use the shared highlighted value treatment: bold, tabular figures in `text-text-highlight`, while labels remain neutral.
- Chart canvases render with a transparent background; the containing card owns the surface color in both light and dark modes.
- Issuer-detail charts use the shared palette, tooltip, axis, gradient and donut-separator rules; avoid chart-specific hardcoded surface colors.
- Axis labels use compact 10-12px equivalent styling in ECharts config.
- Keep grid and legend compact; dashboard charts should prioritize data area.
- Light mode tooltips are white/glass, never black.
- Grid lines are very subtle; avoid strong grid contrast.

---

## Layout

- Dashboard shell: fixed header, left navigation, right insight rail, scrollable main content.
- Main content spacing: compact `gap-3` and `p-3`/`p-4` panels.
- Landing page: product experience first, not marketing-only content. The first viewport should show actual dashboard data/charts.
- Header branding always preserves the complete FireAnt icon and wordmark and adds `Bond Dashboard` as a `text-blue-400` product descriptor; mobile controls wrap to a second row instead of dropping identity.
- Mobile: panels collapse into icon controls; no horizontal scroll.

---

## Anti-Patterns

- No arbitrary Tailwind class values in new UI (`text-[10px]`, `w-[245px]`, etc.).
- No inline hex colors for interface elements.
- No emoji icons; use `lucide-react`.
- No random chart colors.
- No `font-black`.
- No card-heavy decorative landing page that hides the actual product.
- No low-contrast glass surfaces.

---

## Pre-Delivery Checklist

- [ ] New UI uses standard Tailwind utilities.
- [ ] All clickable elements have visible hover/focus states and `cursor-pointer`.
- [ ] Chart colors come from the fixed palette.
- [ ] Table headers are uppercase and unit lines are separate.
- [ ] Light and dark themes both have readable contrast.
- [ ] Responsive behavior checked at mobile, tablet, and desktop widths.
