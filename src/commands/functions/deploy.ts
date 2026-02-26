import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { ossFetch } from '../../lib/api/oss.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts, CLIError } from '../../lib/errors.js';
import { outputJson, outputSuccess } from '../../lib/output.js';

export function registerFunctionsDeployCommand(functionsCmd: Command): void {
  functionsCmd
    .command('deploy <slug>')
    .description('Deploy an edge function (create or update)')
    .option('--file <path>', 'Path to the function source file')
    .option('--name <name>', 'Function display name')
    .option('--description <desc>', 'Function description')
    .action(async (slug: string, opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();

        // Resolve source file
        const filePath = opts.file ?? join(process.cwd(), 'insforge', 'functions', slug, 'index.ts');
        if (!existsSync(filePath)) {
          throw new CLIError(
            `Source file not found: ${filePath}\n` +
            `Specify --file <path> or create ${join('insforge', 'functions', slug, 'index.ts')}`,
          );
        }

        const code = readFileSync(filePath, 'utf-8');
        const name = opts.name ?? slug;
        const description = opts.description ?? '';

        // Check if function exists
        let exists = false;
        try {
          await ossFetch(`/api/functions/${encodeURIComponent(slug)}`);
          exists = true;
        } catch {
          exists = false;
        }

        if (exists) {
          await ossFetch(`/api/functions/${encodeURIComponent(slug)}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description, code }),
          });
        } else {
          await ossFetch('/api/functions', {
            method: 'POST',
            body: JSON.stringify({ slug, name, description, code }),
          });
        }

        if (json) {
          outputJson({ success: true, slug, action: exists ? 'updated' : 'created' });
        } else {
          outputSuccess(`Function "${slug}" ${exists ? 'updated' : 'created'} successfully.`);
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
