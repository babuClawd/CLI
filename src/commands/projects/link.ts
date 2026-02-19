import { Command } from 'commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as clack from '@clack/prompts';
import {
  listOrganizations,
  listProjects,
  getProject,
  getProjectApiKey,
} from '../../lib/api/platform.js';
import { getGlobalConfig, saveGlobalConfig, saveProjectConfig } from '../../lib/config.js';
import { requireAuth } from '../../lib/credentials.js';
import { handleError, getRootOpts, CLIError } from '../../lib/errors.js';
import { outputJson, outputSuccess } from '../../lib/output.js';
import type { ProjectConfig } from '../../types.js';

const execAsync = promisify(exec);

function buildOssHost(appkey: string, region: string): string {
  return `https://${appkey}.${region}.insforge.app`;
}

export function registerProjectLinkCommand(projectsCmd: Command): void {
  projectsCmd
    .command('link')
    .description('Link current directory to an InsForge project')
    .option('--project-id <id>', 'Project ID to link')
    .option('--org-id <id>', 'Organization ID')
    .action(async (opts, cmd) => {
      const { json, apiUrl } = getRootOpts(cmd);
      try {
        requireAuth();

        let orgId = opts.orgId ?? getGlobalConfig().default_org_id;
        let projectId = opts.projectId;

        // Select organization if not specified
        if (!orgId) {
          const orgs = await listOrganizations(apiUrl);
          if (orgs.length === 0) {
            throw new CLIError('No organizations found.');
          }
          if (orgs.length === 1) {
            orgId = (orgs[0] as any).organization?.id ?? (orgs[0] as any).id;
          } else if (!json) {
            const selected = await clack.select({
              message: 'Select an organization:',
              options: orgs.map((o: any) => ({
                value: o.organization?.id ?? o.id,
                label: o.organization?.name ?? o.name,
              })),
            });
            if (clack.isCancel(selected)) process.exit(0);
            orgId = selected as string;
          } else {
            throw new CLIError('Multiple organizations found. Specify --org-id.');
          }
        }

        // Save default org
        const config = getGlobalConfig();
        config.default_org_id = orgId;
        saveGlobalConfig(config);

        // Select project if not specified
        if (!projectId) {
          const projects = await listProjects(orgId, apiUrl);
          if (projects.length === 0) {
            throw new CLIError('No projects found in this organization.');
          }
          if (json) {
            throw new CLIError('Specify --project-id in JSON mode.');
          }
          const selected = await clack.select({
            message: 'Select a project to link:',
            options: projects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.region}, ${p.status})`,
            })),
          });
          if (clack.isCancel(selected)) process.exit(0);
          projectId = selected as string;
        }

        // Fetch project details and API key
        const [project, apiKey] = await Promise.all([
          getProject(projectId, apiUrl),
          getProjectApiKey(projectId, apiUrl),
        ]);

        const projectConfig: ProjectConfig = {
          project_id: project.id,
          org_id: project.organization_id,
          appkey: project.appkey,
          region: project.region,
          api_key: apiKey,
          oss_host: buildOssHost(project.appkey, project.region),
        };

        saveProjectConfig(projectConfig);

        if (json) {
          outputJson({ success: true, project: { id: project.id, name: project.name, region: project.region } });
        } else {
          outputSuccess(`Linked to project "${project.name}" (${project.appkey}.${project.region})`);
        }

        // Install InsForge agent skills
        await installSkills(json);
      } catch (err) {
        handleError(err, json);
      }
    });
}

async function installSkills(json: boolean): Promise<void> {
  try {
    if (!json) clack.log.info('Installing InsForge agent skills...');
    await execAsync('npx skills add insforge/agent-skills -y -a antigravity -a augment -a claude-code -a cline -a codex -a cursor -a gemini-cli -a github-copilot -a kilo -a qoder -a qwen-code -a roo -a trae -a windsurf', {
      cwd: process.cwd(),
      timeout: 60_000,
    });
    if (!json) clack.log.success('InsForge agent skills installed.');
  } catch (err) {
    if (!json) clack.log.warn('Failed to install agent skills. You can run manually: npx skills add insforge/agent-skills');
  }
}
