import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { getProjectConfig } from '../../lib/config.js';
import { handleError, getRootOpts, ProjectNotLinkedError } from '../../lib/errors.js';
import { outputJson, outputSuccess } from '../../lib/output.js';

export function registerDeploymentsSlugCommand(deploymentsCmd: Command): void {
  deploymentsCmd
    .command('slug <slug>')
    .description('Update the custom slug for the deployed site')
    .action(async (slug: string, _opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();
        if (!getProjectConfig()) throw new ProjectNotLinkedError();

        const res = await ossFetch('/api/deployments/slug', {
          method: 'PUT',
          body: JSON.stringify({ slug }),
        });
        const result = await res.json() as { domain?: string; slug?: string };

        if (json) {
          outputJson(result);
        } else {
          outputSuccess(`Slug updated to "${result.slug}"`);
          if (result.domain) console.log(`  Domain: ${result.domain}`);
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
