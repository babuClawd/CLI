import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';

export function registerStorageBucketsCommand(storageCmd: Command): void {
  storageCmd
    .command('buckets')
    .description('List all storage buckets')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();

        const res = await ossFetch('/api/storage/buckets');
        const data = await res.json() as { buckets?: ({ name?: string } | string)[] };
        const buckets = data.buckets ?? [];

        if (json) {
          outputJson(buckets);
        } else {
          if (buckets.length === 0) {
            console.log('No buckets found.');
            return;
          }
          outputTable(
            ['Bucket Name'],
            buckets.map((b) => [typeof b === 'string' ? b : b.name ?? JSON.stringify(b)]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
