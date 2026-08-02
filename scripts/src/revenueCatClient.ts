/**
 * Creates a RevenueCat API client authenticated via the Replit connectors proxy.
 * Not cached — fetch fresh each call so tokens never go stale.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  // The SDK may pass a Request object (with method/body embedded) or a plain
  // URL string + init options.  Extract everything from both sources.
  const customFetch: typeof fetch = async (input, init) => {
    // ── URL ──────────────────────────────────────────────────────────────────
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const urlObj = new URL(urlStr);
    const path   = urlObj.pathname + urlObj.search;

    // ── Method ───────────────────────────────────────────────────────────────
    // Prefer init.method, fall back to the method embedded in the Request obj.
    const method =
      init?.method ??
      (input instanceof Request && !(input instanceof URL) ? (input as Request).method : "GET");

    // ── Body ─────────────────────────────────────────────────────────────────
    let body: unknown;
    if (init?.body) {
      body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    } else if (
      input instanceof Request &&
      !(input instanceof URL) &&
      (input as Request).body
    ) {
      const raw = await (input as Request).text();
      body = raw ? JSON.parse(raw) : undefined;
    }

    // ── Proxy call ────────────────────────────────────────────────────────────
    const resp = await connectors.proxy("revenuecat", path, {
      method: method as string,
      ...(body !== undefined ? { body } : {}),
    });

    // connectors.proxy returns a Response — read and re-wrap so the body is
    // not consumed before the SDK reads it (some versions clone internally).
    const text = await (resp as Response).text();
    return new Response(text, {
      status: (resp as Response).status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: customFetch,
  });
}
