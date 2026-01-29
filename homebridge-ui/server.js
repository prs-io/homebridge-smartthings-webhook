const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const { AuthorizationCode } = require('simple-oauth2');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('/authCode', this.authCode.bind(this));
    this.onRequest('/getAuthUrl', this.getAuthUrl.bind(this));
    this.onRequest('/authToken', this.authToken.bind(this));
    this.onRequest('/clearTokens', this.clearTokens.bind(this));
    this.onRequest('/clearAllTokens', this.clearAllTokens.bind(this));
    this.onRequest('/checkWebhookStatus', this.checkWebhookStatus.bind(this));
    this.onRequest('/checkAuthorized', this.checkAuthorized.bind(this));

    this.client = undefined;

    this.ready();
  }

  async checkWebhookStatus() {
    try {
      const pluginConfig = await this.getPluginConfig();
      const config = pluginConfig && pluginConfig.length > 0 ? pluginConfig[0] : {};
      const port = config.webhook_port || 3000;

      // Try to connect to the webhook server
      const http = require('http');

      return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/`, { timeout: 2000 }, (res) => {
          console.log('[checkWebhookStatus] Got response, status:', res.statusCode);
          resolve({ running: true, port: port });
          req.destroy();
        });

        req.on('error', (err) => {
          console.log('[checkWebhookStatus] Error:', err.message);
          resolve({ running: false, port: port });
        });

        req.on('timeout', () => {
          console.log('[checkWebhookStatus] Timeout');
          resolve({ running: false, port: port });
          req.destroy();
        });
      });
    } catch (err) {
      console.log('[checkWebhookStatus] Exception:', err.message);
      return { running: false, error: err.message };
    }
  }

  async getAuthUrl() {
    try {
      // Read the auth URL that the plugin saved
      const authUrlFile = path.join(this.homebridgeStoragePath, 'smartthings_auth_url.txt');
      console.log('[getAuthUrl] Looking for auth URL file at:', authUrlFile);

      if (fs.existsSync(authUrlFile)) {
        const authUrl = fs.readFileSync(authUrlFile, 'utf8').trim();
        console.log('[getAuthUrl] Found auth URL:', authUrl);
        return { url: authUrl };
      }
      console.log('[getAuthUrl] Auth URL file not found');
      return { error: 'No auth URL found. Make sure Homebridge has restarted after configuring server_url.' };
    } catch (err) {
      console.log('[getAuthUrl] Error:', err.message);
      return { error: err.message };
    }
  }

  async authCode(config) {
    const state = crypto.randomBytes(32).toString('hex');

    console.log('[authCode] Generating auth URL with:', {
      clientId: config.clientId,
      redirectUrl: config.redirectUrl,
      scopes: config.scopes,
      state: state,
    });

    const params = {
      client: {
        id: config.clientId,
        secret: config.clientSecret,
      },
      auth: {
        tokenHost: 'https://api.smartthings.com',
        tokenPath: '/oauth/token',
        authorizePath: '/oauth/authorize',
      },
    };

    this.client = new AuthorizationCode(params);
    this.oauthState = state; // Store for later verification
    this.oauthRedirectUrl = config.redirectUrl;
    this.oauthScopes = config.scopes;

    const authUrl = this.client.authorizeURL({
      redirect_uri: config.redirectUrl,
      scope: config.scopes,
      state: state,
    });

    console.log('[authCode] Generated URL:', authUrl);
    return authUrl;
  }

  async authToken(config) {
    try {
      const tokenParams = {
        code: config.code,
        redirect_uri: config.redirectUrl,
        scope: config.scopes,
      };
      const accessToken = await this.client.getToken(tokenParams);
      return accessToken.token;
    } catch (err) {
      throw new RequestError(err.message);
    }
  }

  async clearTokens() {
    try {
      const tokenPath = path.join(this.homebridgeStoragePath, 'smartthings_tokens.json');
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
        return { success: true, message: 'Token file cleared' };
      }
      return { success: true, message: 'No token file to clear' };
    } catch (err) {
      throw new RequestError('Failed to clear tokens: ' + err.message);
    }
  }

  async clearAllTokens() {
    try {
      const files = [
        'smartthings_tokens.json',
        'smartapp_credentials.json',
        'smartthings_auth_url.txt',
      ];

      let cleared = [];
      for (const file of files) {
        const filePath = path.join(this.homebridgeStoragePath, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          cleared.push(file);
        }
      }

      if (cleared.length > 0) {
        return { success: true, message: `Cleared: ${cleared.join(', ')}` };
      }
      return { success: true, message: 'No token files to clear' };
    } catch (err) {
      throw new RequestError('Failed to clear tokens: ' + err.message);
    }
  }

  async checkAuthorized() {
    try {
      const tokenPath = path.join(this.homebridgeStoragePath, 'smartthings_tokens.json');
      const authorized = fs.existsSync(tokenPath);
      return { authorized };
    } catch (err) {
      return { authorized: false, error: err.message };
    }
  }
}

(() => {
  return new UiServer();
})();
