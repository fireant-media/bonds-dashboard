# Bonds Dashboard

Financial bond dashboard for monitoring market overview, issuer exposure, maturity schedules, news, and AI-assisted analysis.

## Tech Stack

- React 19 + Vite
- TypeScript
- Tailwind CSS v4
- Express server via `server.ts`
- ECharts for analytics visualizations
- FireAnt/OIDC integration

## Prerequisites

- Node.js
- npm

## Environment

Create a local `.env` from the example file:

```bash
cp .env.example .env
```

Required/used variables:

```bash
VITE_FIREANT_ACCESS_TOKEN=
VITE_OIDC_AUTHORITY=https://accounts.fireant.vn
VITE_OIDC_CLIENT_ID=
VITE_APP_BASE_URL=http://localhost:3000
SESSION_SECRET=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://openai.fireant.vn/v1
OPENAI_DEFAULT_MODEL=gpt-5.4-mini
```

## Development

Install dependencies:

```bash
npm install
```

Run the local server:

```bash
npm run dev
```

The app is served by `server.ts`, normally at:

```bash
http://localhost:3000
```

## Scripts

```bash
npm run dev      # Start local server in watch mode
npm run build    # Build frontend assets
npm run preview  # Preview built Vite output
npm run lint     # TypeScript check
```

## Deployment

The project includes `vercel.json` with rewrites for:

- `/api/news`
- `/api/news/:id`
- `/api/fireant/:path*`
- `/api/ai/:path*`
- `/api/auth/:path*`
- frontend fallback to `index.html`

Set the environment variables in the deployment platform before deploying.
