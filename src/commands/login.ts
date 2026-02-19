import type { Command } from 'commander';
import * as clack from '@clack/prompts';
import { saveCredentials, getGlobalConfig, getPlatformApiUrl } from '../lib/config.js';
import { login as platformLogin, getProfile } from '../lib/api/platform.js';
import {
  generatePKCE,
  generateState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  startCallbackServer,
  DEFAULT_CLIENT_ID,
  OAUTH_SCOPES,
} from '../lib/auth.js';
import { handleError, getRootOpts } from '../lib/errors.js';
import type { StoredCredentials } from '../types.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with InsForge platform')
    .option('--email', 'Login with email and password instead of browser')
    .option('--client-id <id>', 'OAuth client ID (defaults to insforge-cli)')
    .action(async (opts, cmd) => {
      const { json, apiUrl } = getRootOpts(cmd);

      try {
        if (opts.email) {
          await loginWithEmail(json, apiUrl);
        } else {
          await loginWithOAuth(json, apiUrl, opts.clientId);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('cancelled')) {
          process.exit(0);
        }
        handleError(err, json);
      }
    });
}

async function loginWithEmail(json: boolean, apiUrl?: string): Promise<void> {
  if (!json) {
    clack.intro('InsForge CLI');
  }

  const email = json
    ? process.env.INSFORGE_EMAIL
    : await clack.text({
        message: 'Email:',
        validate: (v) => (v.includes('@') ? undefined : 'Please enter a valid email'),
      });

  if (clack.isCancel(email)) {
    clack.cancel('Login cancelled.');
    throw new Error('cancelled');
  }

  const password = json
    ? process.env.INSFORGE_PASSWORD
    : await clack.password({
        message: 'Password:',
      });

  if (clack.isCancel(password)) {
    clack.cancel('Login cancelled.');
    throw new Error('cancelled');
  }

  if (!email || !password) {
    throw new Error('Email and password are required. Set INSFORGE_EMAIL and INSFORGE_PASSWORD environment variables for non-interactive mode.');
  }

  if (!json) {
    const s = clack.spinner();
    s.start('Authenticating...');

    const result = await platformLogin(email as string, password as string, apiUrl);
    const creds: StoredCredentials = {
      access_token: result.token,
      refresh_token: result._refreshToken ?? '',
      user: result.user,
    };
    saveCredentials(creds);

    s.stop(`Authenticated as ${result.user.email}`);
    clack.outro('Done');
  } else {
    const result = await platformLogin(email as string, password as string, apiUrl);
    const creds: StoredCredentials = {
      access_token: result.token,
      refresh_token: result._refreshToken ?? '',
      user: result.user,
    };
    saveCredentials(creds);
    console.log(JSON.stringify({ success: true, user: result.user }));
  }
}

async function loginWithOAuth(json: boolean, apiUrl?: string, clientIdOverride?: string): Promise<void> {
  const platformUrl = getPlatformApiUrl(apiUrl);
  const config = getGlobalConfig();
  const clientId = clientIdOverride ?? config.oauth_client_id ?? DEFAULT_CLIENT_ID;

  // 1. Generate PKCE and state
  const pkce = generatePKCE();
  const state = generateState();

  // 2. Start local callback server
  const { port, result, close } = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  // 3. Build authorization URL
  const authUrl = buildAuthorizeUrl({
    platformUrl,
    clientId,
    redirectUri,
    codeChallenge: pkce.code_challenge,
    state,
    scopes: OAUTH_SCOPES,
  });

  if (!json) {
    clack.intro('InsForge CLI');
    clack.log.info('Opening browser for authentication...');
    clack.log.info(`If browser doesn't open, visit:\n${authUrl}`);
  }

  // 4. Open browser
  try {
    const open = (await import('open')).default;
    await open(authUrl);
  } catch {
    if (!json) {
      clack.log.warn(`Could not open browser. Please visit the URL above.`);
    }
  }

  // 5. Wait for callback
  if (!json) {
    const s = clack.spinner();
    s.start('Waiting for authentication...');

    try {
      const callbackResult = await result;
      close();

      // Verify state
      if (callbackResult.state !== state) {
        s.stop('Authentication failed');
        throw new Error('State mismatch. Possible CSRF attack.');
      }

      // 6. Exchange code for tokens
      s.message('Exchanging authorization code...');
      const tokens = await exchangeCodeForTokens({
        platformUrl,
        code: callbackResult.code,
        redirectUri,
        clientId,
        codeVerifier: pkce.code_verifier,
      });

      // 7. Fetch user profile with the new token
      const creds: StoredCredentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: { id: '', name: '', email: '', avatar_url: null, email_verified: true },
      };
      saveCredentials(creds);

      // Try to get user profile
      try {
        const profile = await getProfile(apiUrl);
        creds.user = profile;
        saveCredentials(creds);
        s.stop(`Authenticated as ${profile.email}`);
      } catch {
        s.stop('Authenticated successfully');
      }

      clack.outro('Done');
    } catch (err) {
      close();
      s.stop('Authentication failed');
      throw err;
    }
  } else {
    // JSON mode
    try {
      const callbackResult = await result;
      close();

      if (callbackResult.state !== state) {
        throw new Error('State mismatch.');
      }

      const tokens = await exchangeCodeForTokens({
        platformUrl,
        code: callbackResult.code,
        redirectUri,
        clientId,
        codeVerifier: pkce.code_verifier,
      });

      const creds: StoredCredentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: { id: '', name: '', email: '', avatar_url: null, email_verified: true },
      };
      saveCredentials(creds);

      try {
        const profile = await getProfile(apiUrl);
        creds.user = profile;
        saveCredentials(creds);
      } catch {}

      console.log(JSON.stringify({ success: true, user: creds.user }));
    } catch (err) {
      close();
      throw err;
    }
  }
}
