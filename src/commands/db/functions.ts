import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { DatabaseFunctionsResponse } from '../../types.js';

export function registerDbFunctionsCommand(dbCmd: Command): void {
  dbCmd
    .command('functions')
    .description('List all database functions')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();

        const res = await ossFetch('/api/database/functions');
        const raw = await res.json();
        const functions: DatabaseFunctionsResponse['functions'] = Array.isArray(raw)
          ? raw
          : (raw as DatabaseFunctionsResponse).functions ?? [];

        if (json) {
          outputJson(raw);
        } else {
          if (functions.length === 0) {
            console.log('No database functions found.');
            return;
          }
          outputTable(
            ['Name', 'Definition', 'Kind'],
            functions.map((f) => [f.functionName, f.functionDef, f.kind]),
          );
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
