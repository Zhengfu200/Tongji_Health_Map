// Only for browser verification. This entrypoint cannot write to GitHub.
import { GitHubStore, handleRequest } from '../shared-backups-worker/index.ts';
import { UUID_PATTERN } from '../lib/shared-backups.ts';
import { createGitHubMock, mockEnv } from './shared-github-mock.mjs';
const fixture = createGitHubMock();
const store = new GitHubStore(mockEnv, fixture.fetcher);
export default {
  fetch(request, env) {
    const match = new URL(request.url).pathname.match(/^\/__test\/backups\/([^/]+)\/delete-file$/);
    if (match && request.method === 'POST') {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== 'http://localhost:5173') return Response.json({}, { status: 403 });
      if (!UUID_PATTERN.test(match[1])) return Response.json({}, { status: 400 });
      fixture.changeFiles({ [`backups/${match[1].toLowerCase()}.json`]: null });
      return Response.json({ deleted: true }, { headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Cache-Control': 'no-store' } });
    }
    return handleRequest(request, { ...env, ALLOWED_ORIGINS: 'http://localhost:5173' }, store);
  },
};
