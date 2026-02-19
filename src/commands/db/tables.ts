import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';

export function registerDbTablesCommand(dbCmd: Command): void {
  dbCmd
    .command('tables')
    .description('List all database tables')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();

        const res = await ossFetch('/api/database/tables');
        const data = await res.json() as { tables?: ({ table_name?: string; name?: string } | string)[] };
        const tables = data.tables ?? [];

        if (json) {
          outputJson(tables);
        } else {
          if (tables.length === 0) {
            console.log('No tables found.');
            return;
          }
          outputTable(
            ['Table Name'],
            tables.map((t) => [typeof t === 'string' ? t : t.table_name ?? t.name ?? JSON.stringify(t)]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
