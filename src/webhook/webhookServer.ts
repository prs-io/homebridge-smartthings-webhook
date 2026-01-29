import { Logger } from 'homebridge';
import * as http from 'http';
import * as url from 'url';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { SmartThingsAuth } from '../auth/auth';
import { ShortEvent } from './subscriptionHandler';
import { SmartAppHandler, SmartAppRequest, SmartAppLifecycle } from './smartAppHandler';

export class WebhookServer {
  private server: http.Server | null = null;
  private eventHandlers: ((event: ShortEvent) => void)[] = [];
  private authHandler: SmartThingsAuth | null = null;
  private smartAppHandler: SmartAppHandler | null = null;
  private isRunning = false;
  private useDirectWebhook = false;

  constructor(
    private readonly platform: IKHomeBridgeHomebridgePlatform,
    private readonly log: Logger,
  ) {
    // Direct webhook mode is enabled by default (webhook server always runs)
    // Can be explicitly disabled with use_direct_webhook: false
    this.useDirectWebhook = this.platform.config.use_direct_webhook !== false;

    // Initialize SmartApp handler for direct webhooks
    if (this.useDirectWebhook) {
      this.smartAppHandler = new SmartAppHandler(this.platform, this.log);
      this.log.info('Direct SmartThings webhook mode enabled');
    }

    // Always start the webhook server - it handles:
    // 1. OAuth callbacks for token exchange
    // 2. SmartApp lifecycle events (direct webhook mode)
    // 3. Device events from relay service (legacy mode)
    this.startServer();
  }

  private startServer(): void {
    const port = this.platform.config.webhook_port || 3000;

    this.server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname === '/oauth/callback') {
        if (this.authHandler) {
          this.handleOAuthCallback(parsedUrl.query, res);
        } else {
          this.log.error('OAuth callback received but no auth handler registered');
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>Error: OAuth handler not initialized</h1>');
        }
      } else if (parsedUrl.pathname === '/smartapp' || (parsedUrl.pathname === '/' && this.useDirectWebhook && req.method === 'POST')) {
        // Handle SmartThings SmartApp webhook requests
        this.handleSmartAppRequest(req, res);
      } else if (parsedUrl.pathname === '/' && req.method === 'POST') {
        // Legacy relay-based device event (for backward compatibility)
        this.handleDeviceEvent(req, res);
      } else if (parsedUrl.pathname === '/health' || (parsedUrl.pathname === '/' && req.method === 'GET')) {
        // Health check endpoint for UI status check
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', directWebhook: this.useDirectWebhook }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.server.listen(port, () => {
      this.log.info(`Webhook server listening on port ${port}`);
      if (this.useDirectWebhook) {
        const serverUrl = this.platform.config.server_url || '<server_url not configured>';
        this.log.info(`SmartApp webhook endpoint: ${serverUrl}/smartapp`);
      }
      this.isRunning = true;
    });

    this.server.on('error', (error) => {
      this.log.error('Webhook server error:', error);
    });
  }

  public setAuthHandler(auth: SmartThingsAuth): void {
    this.authHandler = auth;
  }

  /**
   * Get the SmartApp handler for registering device IDs
   */
  public getSmartAppHandler(): SmartAppHandler | null {
    return this.smartAppHandler;
  }

  private async handleOAuthCallback(query: any, res: http.ServerResponse): Promise<void> {
    try {
      if (!this.authHandler) {
        throw new Error('No auth handler registered');
      }
      await this.authHandler.handleOAuthCallback(query, res);
    } catch (error) {
      this.log.error('OAuth callback error:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Authentication failed</h1><p>Please try again.</p>');
    }
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

  private async handleDeviceEvent(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const event = JSON.parse(body) as ShortEvent;
          this.notifyEventHandlers(event);
          res.writeHead(200);
          res.end();
        } catch (error) {
          this.log.error('Error parsing device event:', error);
          res.writeHead(400);
          res.end();
        }
      });
    } catch (error) {
      this.log.error('Error handling device event:', error);
      res.writeHead(500);
      res.end();
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