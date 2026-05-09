/**
 * NBA.com CDN often rejects anonymous / bot-like requests. Mirror a normal browser
 * so server-side fetches succeed on Vercel and local dev.
 */
const NBA_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com"
};

export function nbaCdnFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(NBA_BROWSER_HEADERS);
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return fetch(input, { ...init, headers });
}
