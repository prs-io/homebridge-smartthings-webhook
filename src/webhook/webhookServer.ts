import { Logger } from 'homebridge';
import * as http from 'http';
import * as url from 'url';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { ShortEvent } from './subscriptionHandler';
import { SmartAppHandler, SmartAppRequest } from './smartAppHandler';

export class WebhookServer {
  private server: http.Server | null = null;
  private eventHandlers: ((event: ShortEvent) => void)[] = [];
  private smartAppHandler: SmartAppHandler | null = null;
  private isRunning = false;
  private useDirectWebhook = false;

  constructor(
    private readonly platform: IKHomeBridgeHomebridgePlatform,
    private readonly log: Logger,
  ) {
    // Check if direct webhook mode is enabled (default: true)
    this.useDirectWebhook = this.platform.config.use_direct_webhook !== false;

    if (this.useDirectWebhook) {
      // Initialize SmartApp handler for webhooks
      this.smartAppHandler = new SmartAppHandler(this.platform, this.log);
      this.log.info('Direct webhook mode enabled');

      // Start the webhook server - it handles:
      // 1. SmartApp lifecycle events (PING, INSTALL, UPDATE, EVENT, UNINSTALL)
      // 2. Health check endpoints
      this.startServer();
    } else {
      this.log.info('Polling mode enabled - webhook server not started');
      this.log.info('Note: Polling mode is a temporary fallback. Direct webhook mode is recommended.');
    }
  }

  private startServer(): void {
    const port = this.platform.config.webhook_port || 3300;

    this.server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname === '/smartapp' || (parsedUrl.pathname === '/' && req.method === 'POST')) {
        // Handle SmartThings SmartApp webhook requests
        this.handleSmartAppRequest(req, res);
      } else if (parsedUrl.pathname === '/health' || (parsedUrl.pathname === '/' && req.method === 'GET')) {
        // Health check endpoint for UI status check
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (parsedUrl.pathname === '/status') {
        // SmartApp installation status endpoint for UI
        this.handleStatusRequest(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.server.listen(port, () => {
      this.log.info(`Webhook server listening on port ${port}`);
      const serverUrl = this.platform.config.server_url || '<server_url not configured>';
      this.log.info(`SmartApp webhook endpoint: ${serverUrl}/smartapp`);
      this.isRunning = true;
    });

    this.server.on('error', (error) => {
      this.log.error('Webhook server error:', error);
    });
  }

  /**
   * Get the SmartApp handler for registering device IDs
   */
  public getSmartAppHandler(): SmartAppHandler | null {
    return this.smartAppHandler;
  }

  /**
   * Handle status request for UI to check SmartApp installation status
   */
  private handleStatusRequest(res: http.ServerResponse): void {
    const handler = this.smartAppHandler;
    const isInstalled = handler ? handler.isInstalled() : false;
    const installedAppId = handler ? handler.getInstalledAppId() : null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      smartAppInstalled: isInstalled,
      installedAppId: installedAppId,
    }));
  }

  /**
   * Handle SmartThings SmartApp lifecycle requests (PING, CONFIRMATION, EVENT, etc.)
   */
  private async handleSmartAppRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.smartAppHandler) {
      this.log.error('SmartApp request received but handler not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SmartApp handler not initialized' }));
      return;
    }

    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const request = JSON.parse(body) as SmartAppRequest;
          this.log.debug(`SmartApp request: ${request.lifecycle}`);

          // Validate appId if configured
          const configuredAppId = this.platform.config.smartapp_id;
          if (configuredAppId && request.appId !== configuredAppId) {
            this.log.warn(`Rejected request with invalid appId: ${request.appId} (expected: ${configuredAppId})`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid' }));
            return;
          }

          // Handle the SmartApp lifecycle request
          const response = await this.smartAppHandler!.handleRequest(request);

          res.writeHead(response.statusCode || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          this.log.error('Error parsing SmartApp request:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
      });
    } catch (error) {
      this.log.error('Error handling SmartApp request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  public addEventHandler(handler: (event: ShortEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private notifyEventHandlers(event: ShortEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        this.log.error('Error in event handler:', error);
      }
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
    }
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }
}