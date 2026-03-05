import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts } from '../../lib/errors.js';
import { outputJson, outputTable } from '../../lib/output.js';
import type { ListSchedulesResponse } from '../../types.js';
import { reportCliUsage } from '../../lib/skills.js';

export function registerSchedulesListCommand(schedulesCmd: Command): void {
  schedulesCmd
    .command('list')
    .description('List all schedules')
    .action(async (_opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();

        const res = await ossFetch('/api/schedules');
        const data = await res.json();
        const schedules: ListSchedulesResponse = data as ListSchedulesResponse;

        if (json) {
          outputJson(schedules);
        } else {
          if (!schedules.length) {
            console.log('No schedules found.');
            return;
          }
          outputTable(
            ['ID', 'Name', 'Cron', 'URL', 'Method', 'Active', 'Next Run'],
            schedules.map((s) => [
              String(s.id ?? '-'),
              String(s.name ?? '-'),
              String(s.cronSchedule ?? '-'),
              String(s.functionUrl ?? '-'),
              String(s.httpMethod ?? '-'),
              s.isActive === false ? 'No' : 'Yes',
              s.nextRun ? new Date(String(s.nextRun)).toLocaleString() : '-',
            ]),
          );
        }
        await reportCliUsage('cli.schedules.list', true);
      } catch (err) {
        handleError(err, json);
      }
    });
}
