# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - Security & Validation

### Added

- **SmartApp ID Validation**: New `smartapp_id` config option to validate incoming webhook requests
  - Only requests with matching `appId` are accepted (403 for others)
  - Configurable via UI in the "SmartThings Webhook Setup" page
  - Get your SmartApp ID using `smartthings apps` CLI command

### Changed

- **Improved Security**: Webhook requests can now be validated against your specific SmartApp ID
- **Updated UI**: SmartApp ID field added to the setup wizard

---

## [2.0.0] - Direct Webhook Support (Major Release)

### Added

- **Direct SmartThings Webhooks**: Real-time device updates without relay service
  - SmartApp handler for all lifecycle events (PING, CONFIRMATION, CONFIGURATION, INSTALL, UPDATE, EVENT, UNINSTALL)
  - Automatic device subscriptions when SmartApp is installed
  - Device lifecycle event support (CREATE, DELETE, UPDATE) for auto-detecting new devices
  - Subscription sync optimization - only creates missing subscriptions on restart
- **Simplified OAuth Flow**: Streamlined 3-state UI wizard
  - State 1: Initial setup (server URL + OAuth credentials)
  - State 2: Authorization required (one-click SmartThings login)
  - State 3: Configured (full settings form)
- **Clear All Tokens Button**: Easy way to reset authentication with guidance to also remove SmartApp from SmartThings app
- **Webhook Health Endpoint**: `/health` endpoint for monitoring webhook server status

### Changed

- **Default Webhook Mode**: Direct webhooks enabled by default (`use_direct_webhook: true`)
- **Polling Disabled**: Automatic polling disabled when using direct webhooks for better performance
- **Package Renamed**: Now `homebridge-smartthings-webhook` to reflect webhook-first approach
- **Improved Logging**: Better debug messages for SmartApp lifecycle and subscription management

### Removed

- **Legacy OAuth Wizard**: Removed complex multi-step authorization code flow
- **Relay Service Dependency**: No longer requires external relay service for real-time updates

### Technical Details

- Added `src/webhook/smartAppHandler.ts` for SmartApp lifecycle handling
- Added `src/webhook/webhookServer.ts` for HTTP server with OAuth callback and SmartApp endpoints
- Updated `src/webhook/subscriptionHandler.ts` to work with direct webhooks
- Credentials stored in `smartapp_credentials.json` (from SmartApp INSTALL event)
- OAuth tokens stored in `smartthings_tokens.json` (from OAuth flow)

---

## Previous Versions

For changelog of versions prior to 2.0.0, see the original projects:

- [homebridge-smartthings by @aziz66](https://github.com/aziz66/homebridge-smartthings/blob/master/CHANGELOG.md)
- [homebridge-smartthings by @iklein99](https://github.com/iklein99/homebridge-smartthings)
