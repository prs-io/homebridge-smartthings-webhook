# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - SmartApp-Only Authentication (Breaking Change)

### Breaking Changes

- **Removed OAuth-In App Flow**: Authentication now uses SmartApp credentials only
- **Removed Legacy Token Files**: `smartthings_tokens.json` is no longer used
- **Plugin Name Corrected**: Fixed plugin identifier from `homebridge-smartthings-ik` to `@prs.io/homebridge-smartthings-webhook`

### Added

- **Crash Loop Detection**: CrashLoopManager detects repeated failures and prevents Homebridge crashes
  - Monitors: `TOKEN_REFRESH_FAILURE`, `DEVICE_HEALTH_FAILURE`, `API_INIT_FAILURE`
  - Logs failures to `crash_loop_log.json`
  - Detects crash loops (5 failures in 15 minutes)
- **Automatic New Device Subscription**: When a new device is added in SmartThings, it's automatically subscribed
- **Batched Subscription Creation**: Device subscriptions created in parallel batches for faster startup
- **Setup Instructions in UI**: Added step-by-step SmartApp creation guide with video tutorial link

### Changed

- **Simplified Authentication**: Single SmartApp-based auth flow (no more dual OAuth systems)
- **Token Refresh**: Uses SmartApp's own `client_id`/`client_secret` for refresh
- **Token File Renamed**: `smartapp_credentials.json` → `smartthings_smartapp_token.json`
- **Async File I/O**: Credentials saved asynchronously to avoid blocking event loop
- **Improved Error Handling**: Better error messages for token refresh failures

### Removed

- **`src/auth/auth.ts`**: OAuth-In App flow removed
- **`src/auth/tokenManager.ts`**: Legacy token management removed
- **OAuth Callback Endpoint**: `/oauth/callback` endpoint removed from webhook server
- **Unused Code**: Removed dead `createCapabilitySubscription` method

### Technical Details

- Credentials stored in `smartthings_smartapp_token.json` (from SmartApp INSTALL event)
- Token refresh every 12 hours using SmartApp client credentials
- Subscription batching: 5 devices per batch with 100ms delay between batches

---

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
