// Small resilient fetch helper: timeout + retry with backoff + browser UA.
const UA = 'H5BirdFluTracker/1.0 (+https://github.com/apappas57/h5-bird-flu-tracker; data-sync bot)';

export async function getText(url, { timeoutMs = 30000, retries = 3, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept': '*/*', ...headers },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  return JSON.parse(await getText(url, opts));
}
