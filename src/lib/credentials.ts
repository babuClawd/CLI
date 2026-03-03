import { getCredentials, getGlobalConfig, getPlatformApiUrl, saveCredentials } from './config.js';
import { AuthError } from './errors.js';
import { refreshOAuthToken, DEFAULT_CLIENT_ID, performOAuthLogin } from './auth.js';
import * as clack from '@clack/prompts';
import type { StoredCredentials } from '../types.js';

export async function requireAuth(apiUrl?: string): Promise<StoredCredentials> {
  const creds = getCredentials();
  if (creds && creds.access_token) return creds;

  clack.log.info('You need to log in to continue.');

  for (;;) {
    try {
      return await performOAuthLogin(apiUrl);
    } catch (err) {
      if (!process.stdout.isTTY) throw err;

      const msg = err instanceof Error ? err.message : 'Unknown error';
      clack.log.error(`Login failed: ${msg}`);

      const retry = await clack.confirm({ message: 'Would you like to try again?' });
      if (clack.isCancel(retry) || !retry) {
        throw new AuthError('Authentication required. Run `insforge login` to authenticate.');
      }
    }
  }
}

export async function refreshAccessToken(apiUrl?: string): Promise<string> {
  const creds = getCredentials();
  if (!creds?.refresh_token) {
    throw new AuthError('Refresh token not found. Run `insforge login` again.');
  }

  const platformUrl = getPlatformApiUrl(apiUrl);
  const config = getGlobalConfig();
  const clientId = config.oauth_client_id ?? DEFAULT_CLIENT_ID;

  try {
    const data = await refreshOAuthToken({
      platformUrl,
      refreshToken: creds.refresh_token,
      clientId,
    });

    const updated: StoredCredentials = {
      ...creds,
      access_token: data.access_token,
      // Update refresh token if rotated
      refresh_token: data.refresh_token ?? creds.refresh_token,
    };
    saveCredentials(updated);
    return data.access_token;
  } catch {
    throw new AuthError('Failed to refresh token. Run `insforge login` again.');
  }
}
