import type { NextApiRequest, NextApiResponse } from "next";
import { chromium, Browser } from "playwright";
import { promises as dns } from "dns";
import * as net from "net";

const TIMEOUT = 20_000; // 20 seconds
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type SuccessResponse = {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  status: number;
};

type DebugSuccess = {
  html: string;
  status: number;
};

type ErrorResponse = { error: string } | { error: string; details?: string; status?: number };

export function isValidHttpUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPrivateIpv4(octets: number[]) {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map((p) => Number(p));
    return isPrivateIpv4(parts);
  }

  if (net.isIP(ip) === 6) {
    // IPv6 checks: loopback ::1, unique local fc00::/7, link-local fe80::/10
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    return false;
  }

  return false;
}

async function isHostAllowed(urlString: string) {
  try {
    const u = new URL(urlString);
    const hostname = u.hostname;
    if (!hostname) return false;
    if (hostname === 'localhost') return false;

    // Lookup all addresses for the host and ensure none are private
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs || addrs.length === 0) return false;
    for (const a of addrs) {
      const ip = a.address;
      if (!ip) return false;
      if (isPrivateIp(ip)) return false;
    }

    return true;
  } catch (e) {
    // on DNS errors, treat as not allowed to be safe
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => Promise<void> | void) {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // call onTimeout and if it returns a promise, wait for it before rejecting
      const p = onTimeout ? onTimeout() : undefined;
      if (p && typeof (p as { then?: unknown }).then === 'function') {
        (p as Promise<void>).then(() => reject(new Error("Timeout"))).catch(() => reject(new Error("Timeout")));
      } else {
        reject(new Error("Timeout"));
      }
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]) as T;
  } finally {
    clearTimeout(timer!);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | DebugSuccess | ErrorResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const url = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const debug = req.query.debug === "true" || req.query.debug === "1";

  if (!url || typeof url !== "string" || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  // Host safety check to avoid SSRF/internal endpoints
  const hostAllowed = await isHostAllowed(url);
  if (!hostAllowed) {
    return res.status(400).json({ error: "Invalid URL or disallowed host" });
  }

  let browser: Browser | null = null;
  let pageClosed = false;

  const cleanup = async () => {
    try {
      if (!pageClosed && browser) {
        await browser.close();
        pageClosed = true;
      }
    } catch {
      // ignore
    }
  };

  try {
    // Use timeout wrapper to enforce overall operation timeout
    const result = await withTimeout(
      (async () => {
        // Launch browser
        browser = await chromium.launch({ headless: true });

        const context = await browser.newContext({ userAgent: DEFAULT_USER_AGENT });
        const page = await context.newPage();
        // Set per-page timeouts slightly lower than overall timeout
        page.setDefaultNavigationTimeout(TIMEOUT - 2000);
        page.setDefaultTimeout(TIMEOUT - 2000);

        // Add single retry for navigation errors
        const maxAttempts = 2;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            // Wait until networkidle or load
            await page.goto(url, { waitUntil: "networkidle" });
            // If loaded, break
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            // small delay before retry
            await new Promise((r) => setTimeout(r, 250));
          }
        }

        // If debug mode requested, return the full page HTML
        if (debug) {
          const html = await page.content();
          await cleanup();
          return {
            html,
            status: 200,
          } as DebugSuccess;
        }

        // Evaluate page for required selectors
        const data = await page.evaluate(() => {
          const titleEl = document.querySelector("title");
          const meta = document.querySelector('meta[name="description"]');
          const h1 = document.querySelector("h1");

          return {
            title: titleEl ? titleEl.textContent : null,
            metaDescription: meta ? (meta.getAttribute("content") || null) : null,
            h1: h1 ? h1.textContent : null,
          };
        });

        await cleanup();

        return {
          ...data,
          status: 200,
        } as SuccessResponse;
      })(),
      TIMEOUT,
      async () => {
        // on timeout: ensure cleanup is awaited
        await cleanup();
      },
    );

    return res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/scrape error:", err);

    // Helpful detection for the common Playwright installation problem
    if (message.includes("Executable doesn't exist") || message.includes("download new browsers")) {
      await cleanup();
      return res.status(500).json({ error: "Playwright browsers not installed. Run 'npx playwright install'" });
    }

    if (message === "Timeout") {
      await cleanup();
      return res.status(504).json({ error: "Timeout" });
    }

    await cleanup();

    // Other errors: return 500 with optional details when debug flag is set
    if (debug) {
      return res.status(500).json({ error: "Failed to scrape page", details: message });
    }

    return res.status(500).json({ error: "Failed to scrape page" });
  }
}
