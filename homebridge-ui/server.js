const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const fs = require('fs');
const path = require('path');

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('/checkWebhookStatus', this.checkWebhookStatus.bind(this));
    this.onRequest('/checkSmartAppStatus', this.checkSmartAppStatus.bind(this));
    this.onRequest('/clearAllTokens', this.clearAllTokens.bind(this));

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
        const req = http.get(`http://localhost:${port}/health`, { timeout: 2000 }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve({ running: true, port: port, ...json });
            } catch {
              resolve({ running: true, port: port });
            }
          });
          req.destroy();
        });

        req.on('error', () => {
          resolve({ running: false, port: port });
        });

        req.on('timeout', () => {
          resolve({ running: false, port: port });
          req.destroy();
        });
      });
    } catch (err) {
      return { running: false, error: err.message };
    }
  }

  async checkSmartAppStatus() {
    try {
      // Check if smartthings_smartapp_token.json exists (SmartApp installed)
      const credentialsPath = path.join(this.homebridgeStoragePath, 'smartthings_smartapp_token.json');

      if (fs.existsSync(credentialsPath)) {
        const data = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        return {
          installed: true,
          installedAppId: data.installed_app_id || null,
          locationId: data.location_id || null,
        };
      }

      return { installed: false };
    } catch (err) {
      return { installed: false, error: err.message };
    }
  }

  async clearAllTokens() {
    try {
      const files = [
        'smartthings_tokens.json',
        'smartthings_smartapp_token.json',
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
}

(() => {
  return new UiServer();
})();