import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { OssFunction } from '../../types.js';

export function registerFunctionsCommands(functionsCmd: Command): void {
  functionsCmd
    .command('list')
    .description('List all edge functions')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();

        const res = await ossFetch('/api/functions');
        const data = await res.json() as { functions?: OssFunction[] };
        const functions = data.functions ?? [];

        if (json) {
          outputJson(functions);
        } else {
          if (functions.length === 0) {
            console.log('No functions found.');
            return;
          }
          outputTable(
            ['Slug', 'Name', 'Status', 'Created At'],
            functions.map((f) => [
              f.slug,
              f.name ?? '-',
              f.status ?? '-',
              f.created_at ? new Date(f.created_at).toLocaleString() : '-',
            ]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
