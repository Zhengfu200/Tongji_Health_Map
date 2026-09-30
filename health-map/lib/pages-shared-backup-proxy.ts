export interface SharedBackupProxyEnv {
  SHARED_BACKUPS: Fetcher;
}

const WORKER_ORIGIN = 'https://tongji-health-map.pages.dev';

function error(code: string, status: number): Response {
  return Response.json({ error: { code } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function forwardSharedBackup(request: Request, env: SharedBackupProxyEnv, path: string): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== incomingUrl.origin) return error('ORIGIN_DENIED', 403);
  if (!env.SHARED_BACKUPS) return error('NOT_CONFIGURED', 503);

  const targetUrl = new URL(path + incomingUrl.search, 'https://shared-backups.internal');
  const forwarded = new Request(targetUrl, request);
  // The existing Worker checks a fixed origin. This internal request comes from
  // this Pages project, including its preview deployments.
  forwarded.headers.set('Origin', WORKER_ORIGIN);
  try {
    return await env.SHARED_BACKUPS.fetch(forwarded);
  } catch {
    return error('UNAVAILABLE', 503);
  }
}
