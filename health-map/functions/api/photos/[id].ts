import { forwardSharedBackup, type SharedBackupProxyEnv } from '../../../lib/pages-shared-backup-proxy';

export const onRequestGet: PagesFunction<SharedBackupProxyEnv> = ({ request, env, params }) =>
  forwardSharedBackup(request, env, '/photos/' + encodeURIComponent(String(params.id)));
