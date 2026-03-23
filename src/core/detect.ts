const COMMON_PORTS = [3000, 5173, 5174, 8080, 4321, 3001, 4200, 8000, 8888, 4000, 9000];

interface DetectedServer {
  url: string;
  port: number;
}

export async function detectDevServers(): Promise<DetectedServer[]> {
  const results = await Promise.all(
    COMMON_PORTS.map(async (port) => {
      const url = `http://localhost:${port}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        const resp = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok || resp.status === 304) {
          return { url, port };
        }
      } catch {
        // not running
      }
      return null;
    })
  );
  return results.filter((r): r is DetectedServer => r !== null);
}

// Backwards compat — returns first match
export async function detectDevServer(): Promise<string | null> {
  const servers = await detectDevServers();
  return servers.length > 0 ? servers[0].url : null;
}
