import { forwardSharedBackup, type SharedBackupProxyEnv } from '../../../../lib/pages-shared-backup-proxy';

export const onRequestDelete: PagesFunction<SharedBackupProxyEnv> = ({ request, env, params }) =>
  forwardSharedBackup(request, env, '/admin/backups/' + encodeURIComponent(String(params.id)));
