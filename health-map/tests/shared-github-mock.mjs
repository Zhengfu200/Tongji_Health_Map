// Isolated Git data API fixture. No network calls or real repository writes.
export function createGitHubMock() {
  let head = 'commit-0', count = 0, conflicts = 0;
  const commits = new Map([[head, { tree: { sha: 'tree-0' } }]]);
  const trees = new Map([['tree-0', { 'index.json': JSON.stringify({ version: 1, items: [] }), 'README.md': 'Preserve this file' }]]);
  const requests = [];
  function changeFiles(changes) {
    const files = { ...trees.get(commits.get(head).tree.sha) };
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) delete files[path]; else files[path] = content;
    }
    const tree = `tree-${++count}`, commit = `commit-${++count}`;
    trees.set(tree, files); commits.set(commit, { tree: { sha: tree }, parents: [head] }); head = commit;
  }
  async function fetcher(url, init = {}) {
    const parsed = new URL(url); const path = parsed.pathname.replace('/repos/Zhengfu200/Tongji_Health_Map_Backups', '');
    const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ path, method, body });
    const json = (value, status = 200) => Response.json(value, { status });
    if (path === '/git/ref/heads/main') return json({ object: { sha: head } });
    if (path.startsWith('/git/commits/') && method === 'GET') return json(commits.get(path.split('/').at(-1)));
    if (path.startsWith('/git/trees/') && method === 'GET') {
      const ref = path.split('/').at(-1);
      const files = trees.get(commits.get(ref)?.tree.sha || ref);
      return files ? json({ truncated: false, tree: Object.keys(files).map(path => ({ path, mode: '100644', type: 'blob' })) }) : json({}, 404);
    }
    if (path.startsWith('/contents/')) {
      const ref = parsed.searchParams.get('ref'); const files = trees.get(commits.get(ref)?.tree.sha);
      const contents = files?.[path.slice('/contents/'.length)];
      return contents === undefined ? json({ message: 'Missing' }, 404) : new Response(contents);
    }
    if (path === '/git/trees' && method === 'POST') {
      const sha = `tree-${++count}`; const files = { ...trees.get(body.base_tree) };
      for (const entry of body.tree) files[entry.path] = entry.content;
      trees.set(sha, files); return json({ sha }, 201);
    }
    if (path === '/git/commits' && method === 'POST') {
      const sha = `commit-${++count}`; commits.set(sha, { ...body, tree: { sha: body.tree } }); return json({ sha }, 201);
    }
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      if (conflicts > 0) {
        conflicts--;
        const foreign = `commit-${++count}`;
        commits.set(foreign, { tree: commits.get(head).tree, parents: [head] }); head = foreign;
        return json({ message: 'Not fast-forward' }, 422);
      }
      if (body.force || commits.get(body.sha)?.parents[0] !== head) return json({ message: 'Not fast-forward' }, 422);
      head = body.sha; return json({ object: { sha: head } });
    }
    throw new Error(`Unexpected mock call ${method} ${path}`);
  }
  return { fetcher, requests, changeFiles, conflict(times = 1) { conflicts = times; }, files() { return { ...trees.get(commits.get(head).tree.sha) }; } };
}
export const fixtureBackup = {
  version: 1, coordinateSystem: 'GCJ-02', records: [
    { id: 'place-fixture', kind: 'place', category: 'fitness', nameZh: '共享运动地点', nameEn: 'Shared sports place', description: '仅用于隔离测试', updatedAt: '2026-09-29T00:00:00Z', position: [121.5016, 31.2848], address: '', hours: '', contact: '' },
    { id: 'route-fixture', kind: 'route', category: 'relaxation', nameZh: '共享步行路线', nameEn: 'Shared walk', description: '', updatedAt: '2026-09-29T00:00:00Z', points: [[121.5016, 31.2848], [121.503, 31.286]], source: 'manual', distance: 188 },
  ],
};
export const mockEnv = { GITHUB_OWNER: 'Zhengfu200', GITHUB_REPO: 'Tongji_Health_Map_Backups', GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'test-only-token', ALLOWED_ORIGINS: 'http://localhost:5173', UPLOAD_LIMITER: { limit: async () => ({ success: true }) } };
