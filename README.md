<p align="center">
<img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-color-round-stylized.png" width="150">
</p>

<p align="center">
<a href="https://github.com/homebridge/homebridge/wiki/Verified-Plugins"><img src="https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat" alt="verified-by-homebridge"></a>
<a href="https://www.npmjs.com/package/@prs.io/homebridge-smartthings-webhook"><img src="https://img.shields.io/npm/v/@prs.io/homebridge-smartthings-webhook" alt="npm"></a>

</p>

# Homebridge SmartThings Webhook Plugin

A SmartThings plugin for Homebridge with **direct webhook support** for real-time device updates. No relay service required - events are pushed directly from SmartThings to your Homebridge instance.

## Features

- **Direct Webhook Support**: Real-time device updates without a relay service
- **SmartApp Authentication**: Simple SmartApp-based auth with automatic token refresh
- **Automatic Device Discovery**: Finds and adds your SmartThings devices automatically
- **New Device Detection**: Automatically subscribes to new devices when added in SmartThings
- **Crash Loop Protection**: Detects repeated failures and prevents Homebridge crashes
- **Easy Setup**: Step-by-step configuration with UI wizard

## Prerequisites

- **Homebridge**: A working Homebridge installation with UI access
- **Public HTTPS URL**: A way to expose your Homebridge to the internet (ngrok, Cloudflare Tunnel, or reverse proxy with SSL)
- **SmartThings Developer Account**: Access to [SmartThings Developer Workspace](https://developer.smartthings.com/)

---

## Quick Start

### Step 1: Install the Plugin

```bash
npm install @prs.io/homebridge-smartthings-webhook
```

Or through the Homebridge UI: search for `homebridge-smartthings-webhook` in the Plugins tab.

---

### Step 2: Get a Public HTTPS URL

Your webhook endpoint must be accessible from the internet with a valid HTTPS certificate.

<details>
<summary><strong>Option A: ngrok (Recommended for beginners)</strong></summary>

1. Create a free account at [ngrok.com](https://ngrok.com/signup)
2. Get a free static domain from [ngrok dashboard](https://dashboard.ngrok.com/domains)
3. Install ngrok: `brew install ngrok` (macOS) or download from ngrok.com
4. Configure: `ngrok config add-authtoken YOUR_TOKEN`
5. Run: `ngrok http --url=your-name.ngrok-free.app 3000`

Your URL will be: `https://your-name.ngrok-free.app`

</details>

<details>
<summary><strong>Option B: Cloudflare Tunnel (Free, more reliable)</strong></summary>

1. Install cloudflared: `brew install cloudflared`
2. Login: `cloudflared tunnel login`
3. Create tunnel: `cloudflared tunnel create homebridge`
4. Configure DNS in Cloudflare dashboard
5. Run: `cloudflared tunnel run homebridge`

</details>

<details>
<summary><strong>Option C: Reverse Proxy with Let's Encrypt</strong></summary>

If you have a domain and static IP, use nginx/Caddy with Let's Encrypt for free SSL certificates.

</details>

---

### Step 3: Create SmartThings SmartApp

1. Go to [SmartThings Developer Workspace](https://developer.smartthings.com/workspace/)

2. Click **+ New Project** → Select **Automation for the SmartApp** → Name it (e.g., "Homebridge SmartThings")

3. Click **REGISTER APP** and select **Webhook Endpoint**

4. Enter your webhook URL:

   ```
   https://your-public-url/smartapp
   ```

   > ⚠️ Must be HTTPS and include `/smartapp` at the end!

5. Configure App Details:
   - Add a display name and description
   - Select OAuth2 scopes: `r:devices:*`, `x:devices:*`, `r:locations:*`
6. Click **SAVE** and **immediately copy**:
   - **Client ID**
   - **Client Secret** (only shown once!)
   - **App ID** (from the app overview page)

---

### Step 4: Configure the Plugin

In your Homebridge config (via UI or `config.json`):

```json
{
  "platforms": [
    {
      "platform": "HomeBridgeSmartThings",
      "name": "SmartThings",
      "client_id": "YOUR_CLIENT_ID",
      "client_secret": "YOUR_CLIENT_SECRET",
      "server_url": "https://your-public-url",
      "webhook_port": 3000
    }
  ]
}
```

| Option          | Required | Description                                      |
| --------------- | -------- | ------------------------------------------------ |
| `client_id`     | Yes      | SmartApp Client ID from Step 3                   |
| `client_secret` | Yes      | SmartApp Client Secret from Step 3               |
| `server_url`    | Yes      | Your public HTTPS URL (without `/smartapp`)      |
| `webhook_port`  | No       | Local webhook server port (default: 3000)        |
| `smartapp_id`   | No       | SmartApp ID for request validation (recommended) |

---

### Step 5: Start Homebridge

Start or restart Homebridge. You should see in the logs:

```
[SmartThings] Webhook server listening on port 3000
[SmartThings] SmartApp webhook endpoint: https://your-public-url/smartapp
[SmartThings] SmartApp not installed or credentials not found.
```

This is expected - the plugin is waiting for you to install the SmartApp.

---

### Step 6: Install the SmartApp in SmartThings

1. Open the **SmartThings mobile app**
2. Go to **Menu (☰)** → **SmartApps** → **+** (Add)
3. Scroll to **My SmartApps** or search for your app name
4. Select your location and authorize the app
5. The app will send credentials to your Homebridge

---

### Step 7: Restart Homebridge

After installing the SmartApp, restart Homebridge. You should now see:

```
[SmartThings] SmartApp: Loaded saved credentials for installed app: xxx
[SmartThings] SmartApp credentials found, proceeding with device discovery...
[SmartThings] Discovered 24 devices total from SmartThings
[SmartThings] Direct webhook mode: Registered 24 device IDs with SmartApp handler
```

**Done!** Your devices should now appear in HomeKit with real-time updates.

---

## How It Works

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│   SmartThings   │ ──────────────▶│    Homebridge    │
│     Cloud       │   Push Events  │  (This Plugin)   │
└─────────────────┘                └──────────────────┘
                                           │
                                           ▼
                                   ┌──────────────────┐
                                   │     HomeKit      │
                                   └──────────────────┘
```

1. **SmartApp Installation**: When you install the SmartApp, SmartThings sends auth tokens to your webhook
2. **Device Subscriptions**: The plugin creates subscriptions for all your devices
3. **Real-Time Events**: Device state changes are pushed instantly via webhook
4. **Token Refresh**: Tokens are automatically refreshed every 12 hours
5. **New Device Detection**: When you add a new device in SmartThings, it's automatically subscribed

**No polling, no relay service, no delays!**

---

## Configuration Options

| Option                         | Type    | Default | Description                                   |
| ------------------------------ | ------- | ------- | --------------------------------------------- |
| `client_id`                    | string  | -       | SmartApp Client ID                            |
| `client_secret`                | string  | -       | SmartApp Client Secret                        |
| `server_url`                   | string  | -       | Public HTTPS URL for webhooks                 |
| `webhook_port`                 | number  | `3000`  | Local port for webhook server                 |
| `smartapp_id`                  | string  | -       | SmartApp ID for request validation            |
| `use_direct_webhook`           | boolean | `true`  | Enable direct SmartThings webhooks            |
| `IgnoreDevices`                | array   | `[]`    | Device names to exclude from HomeKit          |
| `ShowOnlyDevices`              | array   | `[]`    | Only show these devices (whitelist mode)      |
| `IgnoreLocations`              | array   | `[]`    | Location names to exclude                     |
| `PollSensorsSeconds`           | number  | `5`     | Polling interval for sensors (fallback only)  |
| `PollSwitchesAndLightsSeconds` | number  | `10`    | Polling interval for switches (fallback only) |
| `enableTelevisionService`      | boolean | `true`  | Enable TV service for Samsung TVs             |
| `registerVolumeSlider`         | boolean | `false` | Add volume control as lightbulb for TVs       |

---

## Troubleshooting

### SmartApp not receiving events

1. **Verify your public URL is accessible**:

   ```bash
   curl -X POST https://your-public-url/smartapp \
     -H "Content-Type: application/json" \
     -d '{"lifecycle":"PING","pingData":{"challenge":"test"}}'
   ```

   Should return: `{"statusCode":200,"pingData":{"challenge":"test"}}`

2. **Check Homebridge logs** for errors

3. **Verify ngrok/tunnel is running** and forwarding to port 3000

### "SmartApp not installed" message persists

1. Make sure you installed the SmartApp in the **SmartThings mobile app**
2. Check that `smartthings_smartapp_token.json` was created in your Homebridge storage
3. Restart Homebridge after installing the SmartApp

### Token refresh failures

The plugin automatically refreshes tokens every 12 hours. If refresh fails:

1. Check that `client_id` and `client_secret` are correct
2. Reinstall the SmartApp in SmartThings mobile app
3. Check Homebridge logs for specific errors

### Clearing Tokens / Starting Fresh

1. **In Homebridge UI**: Click "Clear All Tokens" button in plugin settings
2. **In SmartThings App**: Remove the SmartApp:
   - Menu (☰) → SmartApps → Find your app → Delete/Remove
3. **Restart Homebridge**
4. **Reinstall SmartApp** in SmartThings mobile app

---

## File Locations

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `smartthings_smartapp_token.json` | SmartApp credentials (auth/refresh tokens) |
| `crash_loop_log.json`             | Crash loop detection log                   |

These files are stored in your Homebridge storage directory (usually `~/.homebridge/` or `/var/lib/homebridge/`).

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## Credits

Special thanks to:

- [@iklein99](https://github.com/iklein99/) - Original [homebridge-smartthings](https://github.com/iklein99/homebridge-smartthings) plugin
- [@aziz66](https://github.com/aziz66/) - [homebridge-smartthings fork](https://github.com/aziz66/homebridge-smartthings) with OAuth

This plugin builds upon their excellent work to provide real-time SmartThings integration for Homebridge.

---

## License

Apache-2.0
