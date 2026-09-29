// Only for browser verification. This entrypoint cannot write to GitHub.
import { GitHubStore, handleRequest } from '../shared-backups-worker/index.ts';
import { createGitHubMock, mockEnv } from './shared-github-mock.mjs';
const fixture = createGitHubMock();
const store = new GitHubStore(mockEnv, fixture.fetcher);
export default {
  fetch(request, env) {
    return handleRequest(request, { ...env, ALLOWED_ORIGINS: 'http://localhost:5174' }, store);
  },
};
