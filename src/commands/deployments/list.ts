import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { getProjectConfig } from '../../lib/config.js';
import { handleError, getRootOpts, ProjectNotLinkedError } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { SiteDeployment } from '../../types.js';

export function registerDeploymentsListCommand(deploymentsCmd: Command): void {
  deploymentsCmd
    .command('list')
    .description('List all deployments')
    .option('--limit <n>', 'Limit number of results', '20')
    .option('--offset <n>', 'Offset for pagination', '0')
    .action(async (opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();
        if (!getProjectConfig()) throw new ProjectNotLinkedError();

        const res = await ossFetch(`/api/deployments?limit=${opts.limit}&offset=${opts.offset}`);
        const data = await res.json() as { data?: SiteDeployment[] };
        const deployments: SiteDeployment[] = data.data ?? [];

        if (json) {
          outputJson(data);
        } else {
          if (!deployments.length) {
            console.log('No deployments found.');
            return;
          }
          outputTable(
            ['ID', 'Status', 'Provider', 'URL', 'Created'],
            deployments.map((d) => [
              d.id,
              d.status,
              d.provider ?? '-',
              d.deploymentUrl ?? '-',
              new Date(d.created_at).toLocaleString(),
            ]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
