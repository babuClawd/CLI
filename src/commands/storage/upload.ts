import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Command } from 'commander';
import { getProjectConfig } from '../../lib/config.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts, CLIError, ProjectNotLinkedError } from '../../lib/errors.js';
import { outputJson, outputSuccess } from '../../lib/output.js';

export function registerStorageUploadCommand(storageCmd: Command): void {
  storageCmd
    .command('upload <file>')
    .description('Upload a file to a storage bucket')
    .requiredOption('--bucket <name>', 'Target bucket name')
    .option('--key <objectKey>', 'Object key (defaults to filename)')
    .action(async (file: string, opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        await requireAuth();

        const config = getProjectConfig();
        if (!config) throw new ProjectNotLinkedError();

        if (!existsSync(file)) {
          throw new CLIError(`File not found: ${file}`);
        }

        const fileContent = readFileSync(file);
        const objectKey = opts.key ?? basename(file);
        const bucketName = opts.bucket;

        // Build multipart form data
        const formData = new FormData();
        const blob = new Blob([fileContent]);
        formData.append('file', blob, objectKey);

        // PUT /api/storage/buckets/{bucket}/objects/{key} for named upload
        const url = `${config.oss_host}/api/storage/buckets/${encodeURIComponent(bucketName)}/objects/${encodeURIComponent(objectKey)}`;

        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${config.api_key}`,
          },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new CLIError(err.error ?? `Upload failed: ${res.status}`);
        }

        const data = await res.json();

        if (json) {
          outputJson(data);
        } else {
          outputSuccess(`Uploaded "${basename(file)}" to bucket "${bucketName}".`);
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
