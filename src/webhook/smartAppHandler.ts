import { Logger } from 'homebridge';
import axios from 'axios';
import * as crypto from 'crypto';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { ShortEvent } from './subscriptionHandler';

/**
 * SmartThings SmartApp Lifecycle types
 */
export enum SmartAppLifecycle {
  PING = 'PING',
  CONFIRMATION = 'CONFIRMATION',
  CONFIGURATION = 'CONFIGURATION',
  INSTALL = 'INSTALL',
  UPDATE = 'UPDATE',
  EVENT = 'EVENT',
  UNINSTALL = 'UNINSTALL',
}

/**
 * SmartThings Event types
 */
export enum SmartThingsEventType {
  DEVICE_EVENT = 'DEVICE_EVENT',
  DEVICE_COMMANDS_EVENT = 'DEVICE_COMMANDS_EVENT',
  DEVICE_LIFECYCLE_EVENT = 'DEVICE_LIFECYCLE_EVENT',
  DEVICE_HEALTH_EVENT = 'DEVICE_HEALTH_EVENT',
  HUB_HEALTH_EVENT = 'HUB_HEALTH_EVENT',
  MODE_EVENT = 'MODE_EVENT',
  TIMER_EVENT = 'TIMER_EVENT',
  SCENE_LIFECYCLE_EVENT = 'SCENE_LIFECYCLE_EVENT',
}

/**
 * SmartThings webhook request payload
 */
export interface SmartAppRequest {
  lifecycle: SmartAppLifecycle;
  executionId?: string;
  locale?: string;
  version?: string;
  appId?: string;

  // PING lifecycle
  pingData?: {
    challenge: string;
  };

  // CONFIRMATION lifecycle
  confirmationData?: {
    appId: string;
    confirmationUrl: string;
  };

  // CONFIGURATION lifecycle
  configurationData?: {
    installedAppId: string;
    phase: 'INITIALIZE' | 'PAGE';
    pageId?: string;
    previousPageId?: string;
    config?: Record<string, any>;
  };

  // INSTALL lifecycle
  installData?: {
    authToken: string;
    refreshToken: string;
    installedApp: InstalledApp;
  };

  // UPDATE lifecycle
  updateData?: {
    authToken: string;
    refreshToken: string;
    installedApp: InstalledApp;
    previousConfig?: Record<string, any>;
    previousPermissions?: string[];
  };

  // EVENT lifecycle
  eventData?: {
    authToken: string;
    installedApp: InstalledApp;
    events: SmartThingsEvent[];
  };

  // UNINSTALL lifecycle
  uninstallData?: {
    installedApp: InstalledApp;
  };

  settings?: Record<string, string>;
}

export interface InstalledApp {
  installedAppId: string;
  locationId: string;
  config?: Record<string, any>;
  permissions?: string[];
}

export interface SmartThingsEvent {
  eventType: SmartThingsEventType;
  deviceEvent?: {
    subscriptionName: string;
    eventId: string;
    locationId: string;
    deviceId: string;
    componentId: string;
    capability: string;
    attribute: string;
    value: any;
    stateChange: boolean;
  };
  deviceLifecycleEvent?: {
    lifecycle: 'CREATE' | 'DELETE' | 'UPDATE' | 'MOVE_FROM' | 'MOVE_TO';
    eventId: string;
    locationId: string;
    deviceId: string;
    deviceName?: string;
    principal?: string;
  };
}

import * as fs from 'fs';
import * as path from 'path';

/**
 * SmartApp Handler for direct SmartThings webhook integration
 * Handles all SmartApp lifecycle events: PING, CONFIRMATION, CONFIGURATION, INSTALL, UPDATE, EVENT, UNINSTALL
 */
export class SmartAppHandler {
  private installedAppId: string | null = null;
  private authToken: string | null = null;
  private refreshToken: string | null = null;
  private locationId: string | null = null;
  private eventHandlers: ((event: ShortEvent) => void)[] = [];
  private deviceLifecycleHandlers: ((lifecycle: string, deviceId: string, deviceName?: string) => void)[] = [];
  private deviceIds: string[] = [];
  private credentialsPath: string;

  constructor(
    private readonly platform: IKHomeBridgeHomebridgePlatform,
    private readonly log: Logger,
  ) {
    // Store credentials in Homebridge storage path
    this.credentialsPath = path.join(platform.api.user.storagePath(), 'smartapp_credentials.json');
    this.loadCredentials();
  }

  /**
   * Load saved credentials from disk
   */
  private loadCredentials(): void {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const data = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
        this.installedAppId = data.installedAppId || null;
        this.authToken = data.authToken || null;
        this.refreshToken = data.refreshToken || null;
        this.locationId = data.locationId || null;
        this.log.info(`SmartApp: Loaded saved credentials for installed app: ${this.installedAppId}`);
      }
    } catch (error) {
      this.log.debug(`SmartApp: No saved credentials found or error loading: ${error}`);
    }
  }

  /**
   * Save credentials to disk
   */
  private saveCredentials(): void {
    try {
      const data = {
        installedAppId: this.installedAppId,
        authToken: this.authToken,
        refreshToken: this.refreshToken,
        locationId: this.locationId,
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.credentialsPath, JSON.stringify(data, null, 2));
      this.log.info('SmartApp: Saved credentials to disk');
    } catch (error) {
      this.log.error(`SmartApp: Failed to save credentials: ${error}`);
    }
  }

  /**
   * Clear saved credentials
   */
  private clearCredentials(): void {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        fs.unlinkSync(this.credentialsPath);
        this.log.info('SmartApp: Cleared saved credentials');
      }
    } catch (error) {
      this.log.error(`SmartApp: Failed to clear credentials: ${error}`);
    }
  }

  /**
   * Set device IDs to subscribe to
   * Subscriptions will be created/synced when:
   * 1. SmartApp is already installed (credentials available) - immediate sync
   * 2. SmartApp receives first EVENT - credentials from event will be used
   */
  public async setDeviceIds(deviceIds: string[]): Promise<void> {
    this.deviceIds = deviceIds;
    this.log.info(`SmartApp: Set ${deviceIds.length} device IDs for subscription`);

    // If we have credentials (from saved file or from previous request), sync now
    if (this.isInstalled() && deviceIds.length > 0) {
      this.log.info('SmartApp: Syncing subscriptions with device IDs...');
      await this.syncDeviceSubscriptions();

      // Also ensure device lifecycle subscription exists
      await this.createDeviceLifecycleSubscription();
    } else if (!this.isInstalled()) {
      this.log.info('SmartApp: No credentials yet - subscriptions will be created when first EVENT is received');
      this.log.info('SmartApp: (Credentials come with each EVENT from SmartThings, no manual setup needed)');
    }
  }

  /**
   * Called after receiving credentials from an EVENT request to sync any pending subscriptions
   */
  private async syncPendingSubscriptions(): Promise<void> {
    if (!this.isInstalled() || this.deviceIds.length === 0) {
      return;
    }

    this.log.info('SmartApp: Credentials received from event - syncing device subscriptions...');
    await this.syncDeviceSubscriptions();
    await this.createDeviceLifecycleSubscription();
  }

  /**
   * Add event handler for device events
   */
  public addEventHandler(handler: (event: ShortEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Add handler for device lifecycle events (CREATE, DELETE, UPDATE)
   */
  public addDeviceLifecycleHandler(handler: (lifecycle: string, deviceId: string, deviceName?: string) => void): void {
    this.deviceLifecycleHandlers.push(handler);
  }

  /**
   * Main handler for all SmartApp lifecycle requests
   */
  public async handleRequest(request: SmartAppRequest): Promise<any> {
    this.log.debug(`SmartApp: Received ${request.lifecycle} lifecycle event`);

    switch (request.lifecycle) {
      case SmartAppLifecycle.PING:
        return this.handlePing(request);

      case SmartAppLifecycle.CONFIRMATION:
        return this.handleConfirmation(request);

      case SmartAppLifecycle.CONFIGURATION:
        return this.handleConfiguration(request);

      case SmartAppLifecycle.INSTALL:
        return this.handleInstall(request);

      case SmartAppLifecycle.UPDATE:
        return this.handleUpdate(request);

      case SmartAppLifecycle.EVENT:
        return this.handleEvent(request);

      case SmartAppLifecycle.UNINSTALL:
        return this.handleUninstall(request);

      default:
        this.log.warn(`SmartApp: Unhandled lifecycle: ${request.lifecycle}`);
        return { statusCode: 200 };
    }
  }

  /**
   * Handle PING lifecycle - used for initial registration verification
   */
  private handlePing(request: SmartAppRequest): any {
    this.log.info('SmartApp: Received PING challenge');

    if (!request.pingData?.challenge) {
      this.log.error('SmartApp: PING request missing challenge');
      return { statusCode: 400 };
    }

    return {
      statusCode: 200,
      pingData: {
        challenge: request.pingData.challenge,
      },
    };
  }

  /**
   * Handle CONFIRMATION lifecycle - verify domain ownership
   */
  private async handleConfirmation(request: SmartAppRequest): Promise<any> {
    this.log.info('SmartApp: Received CONFIRMATION request');

    if (!request.confirmationData?.confirmationUrl) {
      this.log.error('SmartApp: CONFIRMATION request missing confirmationUrl');
      return { statusCode: 400 };
    }

    try {
      // Automatically confirm by making GET request to confirmation URL
      this.log.info(`SmartApp: Confirming domain at ${request.confirmationData.confirmationUrl}`);
      await axios.get(request.confirmationData.confirmationUrl);
      this.log.info('SmartApp: Domain confirmation successful');

      return { statusCode: 200 };
    } catch (error) {
      this.log.error(`SmartApp: Domain confirmation failed: ${error}`);
      return { statusCode: 500 };
    }
  }

  /**
   * Handle CONFIGURATION lifecycle - provide app configuration UI
   */
  private handleConfiguration(request: SmartAppRequest): any {
    const configData = request.configurationData;

    if (!configData) {
      this.log.error('SmartApp: CONFIGURATION request missing configurationData');
      return { statusCode: 400 };
    }

    this.log.info(`SmartApp: Configuration phase: ${configData.phase}`);

    if (configData.phase === 'INITIALIZE') {
      return {
        statusCode: 200,
        configurationData: {
          initialize: {
            name: 'Homebridge SmartThings',
            description: 'Homebridge integration for SmartThings devices',
            id: 'homebridge-smartthings',
            permissions: ['r:devices:*', 'x:devices:*', 'r:locations:*'],
            firstPageId: '1',
          },
        },
      };
    }

    if (configData.phase === 'PAGE') {
      return {
        statusCode: 200,
        configurationData: {
          page: {
            pageId: '1',
            name: 'Homebridge SmartThings Configuration',
            nextPageId: null,
            previousPageId: null,
            complete: true,
            sections: [
              {
                name: 'About',
                settings: [
                  {
                    id: 'info',
                    name: 'Homebridge SmartThings',
                    description: 'This app enables real-time device updates for your Homebridge SmartThings plugin. ' +
                      'All devices will be automatically monitored for changes.',
                    type: 'PARAGRAPH',
                  },
                ],
              },
            ],
          },
        },
      };
    }

    return { statusCode: 200 };
  }

  /**
   * Handle INSTALL lifecycle - app was installed by user
   */
  private async handleInstall(request: SmartAppRequest): Promise<any> {
    this.log.info('SmartApp: App installed');

    const installData = request.installData;
    if (!installData) {
      this.log.error('SmartApp: INSTALL request missing installData');
      return { statusCode: 400 };
    }

    // Store credentials
    this.installedAppId = installData.installedApp.installedAppId;
    this.authToken = installData.authToken;
    this.refreshToken = installData.refreshToken;
    this.locationId = installData.installedApp.locationId;

    this.log.info(`SmartApp: Installed app ID: ${this.installedAppId}`);
    this.log.info(`SmartApp: Location ID: ${this.locationId}`);

    // Save credentials to disk for persistence across restarts
    this.saveCredentials();

    // Create subscriptions for all devices
    await this.createDeviceSubscriptions();

    // Subscribe to device lifecycle events (CREATE, DELETE, UPDATE)
    await this.createDeviceLifecycleSubscription();

    return {
      statusCode: 200,
      installData: {},
    };
  }

  /**
   * Handle UPDATE lifecycle - app configuration was updated
   */
  private async handleUpdate(request: SmartAppRequest): Promise<any> {
    this.log.info('SmartApp: App updated');

    const updateData = request.updateData;
    if (!updateData) {
      this.log.error('SmartApp: UPDATE request missing updateData');
      return { statusCode: 400 };
    }

    // Update credentials
    this.installedAppId = updateData.installedApp.installedAppId;
    this.authToken = updateData.authToken;
    this.refreshToken = updateData.refreshToken;
    this.locationId = updateData.installedApp.locationId;

    // Save updated credentials
    this.saveCredentials();

    // Delete old subscriptions and create new ones
    await this.deleteAllSubscriptions();
    await this.createDeviceSubscriptions();

    // Subscribe to device lifecycle events (CREATE, DELETE, UPDATE)
    await this.createDeviceLifecycleSubscription();

    return {
      statusCode: 200,
      updateData: {},
    };
  }

  /**
   * Handle EVENT lifecycle - device event received
   */
  private async handleEvent(request: SmartAppRequest): Promise<any> {
    const eventData = request.eventData;

    if (!eventData) {
      this.log.error('SmartApp: EVENT request missing eventData');
      return { statusCode: 400 };
    }

    // Update credentials from the EVENT request (SmartThings provides fresh token with each event)
    // This allows us to create subscriptions for new devices without persisted credentials
    const hadCredentialsBefore = this.isInstalled();
    if (eventData.authToken && eventData.installedApp) {
      this.authToken = eventData.authToken;
      this.installedAppId = eventData.installedApp.installedAppId;
      this.locationId = eventData.installedApp.locationId;

      // If this is the first time we have credentials, sync pending subscriptions
      if (!hadCredentialsBefore && this.deviceIds.length > 0) {
        await this.syncPendingSubscriptions();
      }
    }

    this.log.info(`SmartApp: Received EVENT with ${eventData.events.length} event(s)`);

    // Process each event
    for (const event of eventData.events) {
      this.log.info(`SmartApp: Event type: ${event.eventType}`);

      if (event.eventType === SmartThingsEventType.DEVICE_EVENT && event.deviceEvent) {
        const deviceEvent = event.deviceEvent;

        this.log.debug(
          `SmartApp: Device event - ${deviceEvent.deviceId} ` +
          `${deviceEvent.capability}.${deviceEvent.attribute} = ${deviceEvent.value}`,
        );

        // Convert to ShortEvent format and notify handlers
        const shortEvent: ShortEvent = {
          deviceId: deviceEvent.deviceId,
          componentId: deviceEvent.componentId,
          capability: deviceEvent.capability,
          attribute: deviceEvent.attribute,
          value: deviceEvent.value,
        };

        this.notifyEventHandlers(shortEvent);
      } else if (event.eventType === SmartThingsEventType.DEVICE_LIFECYCLE_EVENT && event.deviceLifecycleEvent) {
        const lifecycleEvent = event.deviceLifecycleEvent;

        this.log.info(
          `SmartApp: Device lifecycle - ${lifecycleEvent.lifecycle} for device ${lifecycleEvent.deviceId}` +
          (lifecycleEvent.deviceName ? ` (${lifecycleEvent.deviceName})` : ''),
        );

        // If a new device was created, subscribe to it
        if (lifecycleEvent.lifecycle === 'CREATE') {
          this.log.info(`SmartApp: New device detected - ${lifecycleEvent.deviceId}, creating subscription...`);
          try {
            await this.createDeviceSubscription(lifecycleEvent.deviceId);
            this.deviceIds.push(lifecycleEvent.deviceId);
          } catch (error) {
            this.log.error(`SmartApp: Failed to subscribe to new device: ${error}`);
          }
        }

        // Notify device lifecycle handlers
        this.notifyDeviceLifecycleHandlers(
          lifecycleEvent.lifecycle,
          lifecycleEvent.deviceId,
          lifecycleEvent.deviceName,
        );
      }
    }

    return {
      statusCode: 200,
      eventData: {},
    };
  }

  /**
   * Handle UNINSTALL lifecycle - app was uninstalled
   */
  private handleUninstall(_request: SmartAppRequest): any {
    this.log.info('SmartApp: App uninstalled');

    // Clear stored data
    this.installedAppId = null;
    this.authToken = null;
    this.refreshToken = null;
    this.locationId = null;

    // Clear saved credentials from disk
    this.clearCredentials();

    return {
      statusCode: 200,
      uninstallData: {},
    };
  }

  /**
   * Get existing subscriptions from SmartThings API
   */
  private async getExistingSubscriptions(): Promise<Set<string>> {
    const subscribedDeviceIds = new Set<string>();

    if (!this.installedAppId || !this.authToken) {
      return subscribedDeviceIds;
    }

    try {
      const url = `https://api.smartthings.com/installedapps/${this.installedAppId}/subscriptions`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
        },
      });

      // Extract device IDs from existing subscriptions
      for (const sub of response.data.items || []) {
        if (sub.sourceType === 'DEVICE' && sub.device?.deviceId) {
          subscribedDeviceIds.add(sub.device.deviceId);
        }
      }

      this.log.info(`SmartApp: Found ${subscribedDeviceIds.size} existing device subscriptions`);
    } catch (error) {
      this.log.error(`SmartApp: Failed to get existing subscriptions: ${error}`);
    }

    return subscribedDeviceIds;
  }

  /**
   * Sync device subscriptions - only create missing ones, skip existing
   * This avoids unnecessary API calls on every Homebridge restart
   */
  private async syncDeviceSubscriptions(): Promise<void> {
    if (!this.installedAppId || !this.authToken) {
      this.log.error('SmartApp: Cannot sync subscriptions - missing credentials');
      return;
    }

    if (this.deviceIds.length === 0) {
      this.log.warn('SmartApp: No device IDs registered for subscription');
      return;
    }

    // Get existing subscriptions
    const existingSubscriptions = await this.getExistingSubscriptions();

    // Find devices that need subscriptions
    const missingDeviceIds = this.deviceIds.filter(id => !existingSubscriptions.has(id));

    if (missingDeviceIds.length === 0) {
      this.log.info(`SmartApp: All ${this.deviceIds.length} devices already have subscriptions - no changes needed`);
      return;
    }

    this.log.info(
      `SmartApp: Creating subscriptions for ${missingDeviceIds.length} new devices (${existingSubscriptions.size} already exist)`,
    );

    let successCount = 0;
    for (const deviceId of missingDeviceIds) {
      try {
        await this.createDeviceSubscription(deviceId);
        successCount++;
      } catch (error) {
        this.log.error(`SmartApp: Failed to create subscription for device ${deviceId}: ${error}`);
      }
    }
    this.log.info(`SmartApp: Created ${successCount}/${missingDeviceIds.length} new device subscriptions`);
  }

  /**
   * Create device subscriptions for all registered devices
   * NOTE: Capability wildcard subscriptions do NOT send events - must use device subscriptions
   */
  private async createDeviceSubscriptions(): Promise<void> {
    if (!this.installedAppId || !this.authToken) {
      this.log.error('SmartApp: Cannot create subscriptions - missing credentials');
      return;
    }

    if (this.deviceIds.length === 0) {
      this.log.warn('SmartApp: No device IDs registered for subscription yet');
      this.log.warn('SmartApp: Subscriptions will be created when devices are loaded');
      // Don't create capability subscription - it doesn't actually send events!
      return;
    }

    this.log.info(`SmartApp: Creating subscriptions for ${this.deviceIds.length} devices`);

    let successCount = 0;
    for (const deviceId of this.deviceIds) {
      try {
        await this.createDeviceSubscription(deviceId);
        successCount++;
      } catch (error) {
        this.log.error(`SmartApp: Failed to create subscription for device ${deviceId}: ${error}`);
      }
    }
    this.log.info(`SmartApp: Successfully created ${successCount}/${this.deviceIds.length} device subscriptions`);
  }

  /**
   * Create subscription for a single device
   */
  private async createDeviceSubscription(deviceId: string): Promise<void> {
    const url = `https://api.smartthings.com/installedapps/${this.installedAppId}/subscriptions`;

    const subscriptionRequest = {
      sourceType: 'DEVICE',
      device: {
        deviceId: deviceId,
        componentId: '*',
        capability: '*',
        attribute: '*',
        stateChangeOnly: true,
        subscriptionName: `homebridge_${deviceId.substring(0, 8)}`,
      },
    };

    try {
      this.log.info(`SmartApp: Creating device subscription for ${deviceId}`);
      const response = await axios.post(url, subscriptionRequest, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
      });
      this.log.info(`SmartApp: Created subscription for device ${deviceId}`);
      this.log.debug(`SmartApp: Subscription response: ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        this.log.debug(`SmartApp: Subscription already exists for device ${deviceId}`);
      } else {
        this.log.error(`SmartApp: Failed to create subscription for ${deviceId}: ${error.message}`);
        if (error.response) {
          this.log.error(`SmartApp: Response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
    }
  }

  /**
   * Create subscription for device lifecycle events (CREATE, DELETE, UPDATE)
   * This allows automatic detection of new/removed devices
   */
  private async createDeviceLifecycleSubscription(): Promise<void> {
    if (!this.installedAppId || !this.authToken || !this.locationId) {
      this.log.error('SmartApp: Cannot create device lifecycle subscription - missing credentials');
      return;
    }

    const url = `https://api.smartthings.com/installedapps/${this.installedAppId}/subscriptions`;

    const subscriptionRequest = {
      sourceType: 'DEVICE_LIFECYCLE',
      deviceLifecycle: {
        locationId: this.locationId,
        subscriptionName: 'homebridge_device_lifecycle',
      },
    };

    try {
      this.log.info('SmartApp: Creating device lifecycle subscription...');
      const response = await axios.post(url, subscriptionRequest, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
      });
      this.log.info('SmartApp: Created device lifecycle subscription - will detect new/removed devices');
      this.log.debug(`SmartApp: Subscription response: ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        this.log.debug('SmartApp: Device lifecycle subscription already exists');
      } else {
        this.log.error(`SmartApp: Failed to create device lifecycle subscription: ${error.message}`);
        if (error.response) {
          this.log.error(`SmartApp: Response: ${JSON.stringify(error.response.data)}`);
        }
      }
    }
  }

  /**
   * Create capability-based subscription (subscribes to all devices with a capability)
   */
  private async createCapabilitySubscription(capability: string): Promise<void> {
    if (!this.installedAppId || !this.authToken || !this.locationId) {
      this.log.error('SmartApp: Cannot create capability subscription - missing credentials');
      return;
    }

    const url = `https://api.smartthings.com/installedapps/${this.installedAppId}/subscriptions`;

    const subscriptionRequest = {
      sourceType: 'CAPABILITY',
      capability: {
        locationId: this.locationId,
        capability: capability,
        attribute: '*',
        value: '*',
        stateChangeOnly: true,
        subscriptionName: `homebridge_capability_${capability}`,
      },
    };

    try {
      this.log.info(`SmartApp: Creating subscription with request: ${JSON.stringify(subscriptionRequest)}`);
      const response = await axios.post(url, subscriptionRequest, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
      });
      this.log.info(`SmartApp: Created capability subscription for ${capability}`);
      this.log.info(`SmartApp: Subscription response: ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      this.log.error(`SmartApp: Failed to create capability subscription: ${error.message}`);
      if (error.response) {
        this.log.error(`SmartApp: Response status: ${error.response.status}`);
        this.log.error(`SmartApp: Response data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  /**
   * Delete all subscriptions for the installed app
   */
  private async deleteAllSubscriptions(): Promise<void> {
    if (!this.installedAppId || !this.authToken) {
      this.log.error('SmartApp: Cannot delete subscriptions - missing credentials');
      return;
    }

    const url = `https://api.smartthings.com/installedapps/${this.installedAppId}/subscriptions`;

    try {
      await axios.delete(url, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
        },
      });
      this.log.info('SmartApp: Deleted all existing subscriptions');
    } catch (error) {
      this.log.error(`SmartApp: Failed to delete subscriptions: ${error}`);
    }
  }

  /**
   * Notify all event handlers of a device event
   */
  private notifyEventHandlers(event: ShortEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.log.error(`SmartApp: Error in event handler: ${error}`);
      }
    }
  }

  /**
   * Notify all device lifecycle handlers
   */
  private notifyDeviceLifecycleHandlers(lifecycle: string, deviceId: string, deviceName?: string): void {
    for (const handler of this.deviceLifecycleHandlers) {
      try {
        handler(lifecycle, deviceId, deviceName);
      } catch (error) {
        this.log.error(`SmartApp: Error in device lifecycle handler: ${error}`);
      }
    }
  }

  /**
   * Get installed app ID
   */
  public getInstalledAppId(): string | null {
    return this.installedAppId;
  }

  /**
   * Check if SmartApp is installed and has credentials
   */
  public isInstalled(): boolean {
    return this.installedAppId !== null && this.authToken !== null;
  }
}
