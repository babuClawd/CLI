import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { DatabaseIndexesResponse } from '../../types.js';

export function registerDbIndexesCommand(dbCmd: Command): void {
  dbCmd
    .command('indexes')
    .description('List all database indexes')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();

        const res = await ossFetch('/api/database/indexes');
        const raw = await res.json();
        const indexes: DatabaseIndexesResponse['indexes'] = Array.isArray(raw)
          ? raw
          : (raw as DatabaseIndexesResponse).indexes ?? [];

        if (json) {
          outputJson(raw);
        } else {
          if (indexes.length === 0) {
            console.log('No database indexes found.');
            return;
          }
          outputTable(
            ['Table', 'Index Name', 'Definition', 'Unique', 'Primary'],
            indexes.map((i) => [
              i.tableName,
              i.indexName,
              i.indexDef,
              i.isUnique ? 'Yes' : 'No',
              i.isPrimary ? 'Yes' : 'No',
            ]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
