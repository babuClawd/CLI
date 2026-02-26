import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { getProjectConfig } from '../../lib/config.js';
import { handleError, getRootOpts, ProjectNotLinkedError } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { DeploymentMetadata } from '../../types.js';

export function registerDeploymentsMetadataCommand(deploymentsCmd: Command): void {
  deploymentsCmd
    .command('metadata')
    .description('Get current deployment metadata and domain URLs')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();
        if (!getProjectConfig()) throw new ProjectNotLinkedError();

        const res = await ossFetch('/api/deployments/metadata');
        const d = (await res.json()) as DeploymentMetadata;

        if (json) {
          outputJson(d);
        } else {
          outputTable(
            ['Field', 'Value'],
            [
              ['Current Deployment', d.currentDeploymentId ?? '-'],
              ['Domain', d.domain ?? '-'],
              ['Slug', d.slug ?? '-'],
              ['Deployment URL', d.deploymentUrl ?? '-'],
            ],
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
