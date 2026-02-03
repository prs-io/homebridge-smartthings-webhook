//import { RequestBody, ResponseBody } from '../webhook/subscriptionHandler;
//import { BasePlatformAccessory } from '../basePlatformAccessory';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { Logger, PlatformConfig } from 'homebridge';
import { MultiServiceAccessory } from '../multiServiceAccessory';
import { WebhookServer } from './webhookServer';

export interface ShortEvent {
  deviceId: string;
  value: any;
  componentId: string;
  capability: string;
  attribute: string;
}

export class SubscriptionHandler {
  private config: PlatformConfig;
  private devices: MultiServiceAccessory[] = [];
  private deviceIds: string[] = [];
  private log: Logger;

  constructor(
    platform: IKHomeBridgeHomebridgePlatform,
    devices: MultiServiceAccessory[],
    private readonly webhookServer: WebhookServer,
  ) {
    this.config = platform.config;
    this.log = platform.log;

    devices.forEach((device) => {
      this.deviceIds.push(device.id);
    });
    this.devices = devices;

    // Register event handler with webhook server
    this.webhookServer.addEventHandler(this.handleDeviceEvent.bind(this));

    // Register with SmartApp handler for direct webhook events
    const smartAppHandler = this.webhookServer.getSmartAppHandler();
    this.log.info(`Direct webhook mode: smartAppHandler exists = ${smartAppHandler !== null}`);
    if (smartAppHandler) {
      this.log.info(`Direct webhook mode: Calling setDeviceIds with ${this.deviceIds.length} devices`);
      // Set device IDs and create subscriptions (async)
      smartAppHandler.setDeviceIds(this.deviceIds).then(() => {
        this.log.info('Direct webhook mode: Device subscriptions created');
      }).catch((error) => {
        this.log.error(`Direct webhook mode: Failed to create subscriptions: ${error}`);
      });
      smartAppHandler.addEventHandler(this.handleDeviceEvent.bind(this));
      this.log.info(`Direct webhook mode: Registered ${this.deviceIds.length} device IDs with SmartApp handler`);
    } else {
      this.log.error('Direct webhook mode: SmartApp handler is NULL - webhook server may not have initialized it');
    }
  }

  private handleDeviceEvent(event: ShortEvent): void {
    const device = this.devices.find(device => device.id === event.deviceId);
    if (device) {
      device.processEvent(event);
    }
  }

  async startService() {
    this.log.debug('Starting subscription handler');
    this.log.info('Direct webhook mode enabled - SmartThings will push events directly');
    this.log.info(`SmartApp target URL should be: ${this.config.server_url}/smartapp`);
  }

  stopService() {
    if (this.webhookServer) {
      this.webhookServer.stop();
    }
  }
}