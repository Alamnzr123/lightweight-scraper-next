# lightweight-scraper-next

Lightweight Next.js-based scraper endpoint using Playwright. The project exposes a single GET API route which extracts basic page information (title, meta description and first H1) with sensible defaults and a debug mode.

## Try the scraper

Start the dev server and call the scraper endpoint (PowerShell example):

```powershell
cd lightweight-scraper-next
npm install
npm run dev

# In another terminal:
Invoke-RestMethod -Uri 'http://localhost:3000/api/scrape?url=https://github.com/Alamnzr123/retrieve-local-json-next' | ConvertTo-Json -Depth 5
```

The endpoint responds with JSON: { title, metaDescription, h1, status } or an error object.

Note: Playwright requires browser binaries. After adding Playwright, run:

```powershell
npx playwright install
```

This will download the browsers Playwright needs to launch headless Chromium/Firefox/WebKit.

Lightweight Next.js scraper endpoint (final state)

This repository implements a small Next.js API endpoint that scrapes a target URL and returns basic page information. The implementation uses Playwright (headless Chromium) and includes safety and robustness measures such as a global timeout, per-page timeouts, host safety checks (SSRF protection), a retry on navigation errors, and a debug mode.

Quick features

- GET /api/scrape?url=... — extracts title, meta description, and first H1
- Debug mode: add `debug=true` to return full HTML or detailed error information
- Global 20s timeout with reliable cleanup of browser resources
- Per-page navigation timeout aligned with global timeout
- Host safety checks to block private/internal IPs (SSRF protection)
- User-Agent override and a single retry for navigation errors
- OpenAPI spec at `/openapi.json` and interactive docs at `/docs`

Requirements

- Node.js 18+ and npm

Install & run

```powershell
cd lightweight-scraper-next
npm install
# playwright browsers are installed automatically via postinstall; you can also run:
# npx playwright install

npm run dev
```

API

GET /api/scrape?url={url}&debug={true|false}

Query params:

- `url` (required): http or https URL to scrape
- `debug` (optional): when `true` returns full HTML on success and detailed error info on failures

Responses (summary):

- 200 (success): `{ title, metaDescription, h1, status: 200 }` or (debug) `{ html, status: 200 }`
- 400: `{ error: 'Invalid URL' }` or `{ error: 'Invalid URL or disallowed host' }` for blocked hosts
- 504: `{ error: 'Timeout' }` when scraping exceeds 20s
- 500: `{ error: 'Failed to scrape page' }` (debug mode may include `details`)

Docs & testing

- Interactive API docs: http://localhost:3000/docs (served by `src/pages/docs.tsx` using `swagger-ui-react`)
- OpenAPI spec: `public/openapi.json`
- Unit tests: `npx vitest run` (tests live in `test/`)

Security & operational notes

- Host safety check: the handler resolves the target hostname and blocks requests resolving to private or loopback IPs (for safety in a public deployment). If you need to allow specific internal hosts, add an application-level allowlist.
- Resource cleanup: timeouts trigger an awaited cleanup routine to close the Playwright browser instance before responding with 504.
- Concurrency: every request launches a Chromium instance; for production consider pooling a browser instance and creating contexts per request to reduce overhead.

Next improvements (optional)

- Browser pooling / concurrency limiter
- Request caching and TTLs
- Proxy support for high-volume scraping or geo-specific requests
- Integration tests exercising the full scrape flow against local fixtures

## Contact

Author: Rahmad Alamsyah Nazaruddin — nzr.rahmad@gmail.com
