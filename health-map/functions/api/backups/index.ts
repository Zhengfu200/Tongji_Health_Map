import { forwardSharedBackup, type SharedBackupProxyEnv } from '../../../lib/pages-shared-backup-proxy';

export const onRequestGet: PagesFunction<SharedBackupProxyEnv> = ({ request, env }) =>
  forwardSharedBackup(request, env, '/backups');

export const onRequestPost: PagesFunction<SharedBackupProxyEnv> = ({ request, env }) =>
  forwardSharedBackup(request, env, '/backups');
