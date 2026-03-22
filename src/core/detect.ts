const COMMON_PORTS = [3000, 5173, 5174, 8080, 4321, 3001, 4200, 8000, 8888];

export async function detectDevServer(): Promise<string | null> {
  for (const port of COMMON_PORTS) {
    const url = `http://localhost:${port}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300);
      const resp = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok || resp.status === 304) {
        return url;
      }
    } catch {
      // not running on this port
    }
  }
  return null;
}
