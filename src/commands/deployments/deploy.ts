import type { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as clack from '@clack/prompts';
import archiver from 'archiver';
import { ossFetch } from '../../lib/api/oss.js';
import { getProjectConfig } from '../../lib/config.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts, CLIError, ProjectNotLinkedError } from '../../lib/errors.js';
import { outputJson } from '../../lib/output.js';
import type { CreateDeploymentResponse, StartDeploymentRequest } from '../../types.js';

const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  '.env',
  '.env.local',
  'dist',
  'build',
  '.DS_Store',
  '.insforge',
];

function shouldExclude(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  for (const pattern of EXCLUDE_PATTERNS) {
    if (
      normalized === pattern ||
      normalized.startsWith(pattern + '/') ||
      normalized.endsWith('/' + pattern) ||
      normalized.includes('/' + pattern + '/')
    ) {
      return true;
    }
  }
  if (normalized.endsWith('.log')) return true;
  return false;
}

async function createZipBuffer(sourceDir: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: Error) => reject(err));

    archive.directory(sourceDir, false, (entry) => {
      if (shouldExclude(entry.name)) return false;
      return entry;
    });

    void archive.finalize();
  });
}

export function registerDeploymentsDeployCommand(deploymentsCmd: Command): void {
  deploymentsCmd
    .command('deploy [directory]')
    .description('Deploy a frontend project to Vercel')
    .option('--env <vars>', 'Environment variables as JSON (e.g. \'{"KEY":"value"}\')')
    .option('--meta <meta>', 'Deployment metadata as JSON')
    .action(async (directory: string | undefined, opts, cmd) => {
      const { json } = getRootOpts(cmd);
      try {
        requireAuth();
        const config = getProjectConfig();
        if (!config) throw new ProjectNotLinkedError();

        // Resolve source directory
        const sourceDir = path.resolve(directory ?? '.');
        const stats = await fs.stat(sourceDir).catch(() => null);
        if (!stats?.isDirectory()) {
          throw new CLIError(`"${sourceDir}" is not a valid directory.`);
        }

        const s = !json ? clack.spinner() : null;

        // Step 1: Create deployment to get presigned upload URL
        s?.start('Creating deployment...');
        const createRes = await ossFetch('/api/deployments', { method: 'POST' });
        const { id: deploymentId, uploadUrl, uploadFields } =
          (await createRes.json()) as CreateDeploymentResponse;

        // Step 2: Create zip
        s?.message('Compressing source files...');
        const zipBuffer = await createZipBuffer(sourceDir);

        // Step 3: Upload zip to presigned URL
        s?.message('Uploading...');
        const formData = new FormData();
        for (const [key, value] of Object.entries(uploadFields)) {
          formData.append(key, value);
        }
        formData.append(
          'file',
          new Blob([zipBuffer], { type: 'application/zip' }),
          'deployment.zip',
        );

        const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.text();
          throw new CLIError(`Failed to upload: ${uploadErr}`);
        }

        // Step 4: Start the deployment
        s?.message('Starting deployment...');
        const startBody: StartDeploymentRequest = {};
        if (opts.env) {
          try { startBody.envVars = JSON.parse(opts.env); } catch { throw new CLIError('Invalid --env JSON.'); }
        }
        if (opts.meta) {
          try { startBody.meta = JSON.parse(opts.meta); } catch { throw new CLIError('Invalid --meta JSON.'); }
        }

        const startRes = await ossFetch(`/api/deployments/${deploymentId}/start`, {
          method: 'POST',
          body: JSON.stringify(startBody),
        });
        const result = await startRes.json() as { deploymentUrl?: string; url?: string };

        s?.stop('Deployment started');

        if (json) {
          outputJson(result);
        } else {
          const url = result.deploymentUrl ?? result.url;
          if (url) clack.log.info(`URL: ${url}`);
          clack.log.info(`Deployment ID: ${deploymentId}`);
          clack.log.info('Check status with `insforge deployments status <id>`');
        }
      } catch (err) {
        handleError(err, json);
      }
    });
}
