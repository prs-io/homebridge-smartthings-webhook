![](https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-color-round-stylized.png)

# Homebridge SmartThings Webhook Plugin

A SmartThings plugin for Homebridge with **direct webhook support** for real-time device updates. No relay service required - events are pushed directly from SmartThings to your Homebridge instance.

## Features

- **Direct Webhook Support**: Real-time device updates without a relay service
- **OAuth Authentication**: Secure authentication with automatic token refresh
- **Automatic Device Discovery**: Finds and adds your SmartThings devices automatically
- **No Legacy App Required**: Works with the new SmartThings app and API
- **Easy Setup**: Step-by-step configuration with UI wizard

## Prerequisites

- **Homebridge**: A working Homebridge installation with UI access
- **SmartThings CLI**: [Download and install](https://github.com/SmartThingsCommunity/smartthings-cli#readme) the official SmartThings CLI tool
- **Public URL** (for webhooks): A way to expose your Homebridge to the internet (ngrok, Cloudflare Tunnel, or static IP with port forwarding)

---

## Quick Start

### Step 1: Install the Plugin

```
npm install homebridge-smartthings-webhook
```

Or through the Homebridge UI: search for `homebridge-smartthings-webhook` in the Plugins tab.

---

### Step 2: Create SmartThings OAuth App

Run the SmartThings CLI:

Follow the prompts:

| Prompt             | Value                                         |
| ------------------ | --------------------------------------------- |
| **App Type**       | `OAuth-In App`                                |
| **Display Name**   | `Homebridge SmartThings`                      |
| **Description**    | `Homebridge integration`                      |
| **Icon Image URL** | (skip)                                        |
| **Target URL**     | `https://httpbin.org/get`                     |
| **Scopes**         | `r:devices:*`, `x:devices:*`, `r:locations:*` |
| **Redirect URI**   | `https://httpbin.org/get`                     |

**Save the Client ID and Client Secret** - you won't be able to see them again!

---

### Step 3: Set Up ngrok (Free)

ngrok creates a secure tunnel to expose your local Homebridge to the internet.

#### 3.1 Create Account & Get Auth Token

1.  **Create a free ngrok account** at [https://ngrok.com/signup](https://ngrok.com/signup)
2.  **Get your auth token** from [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3.  **Get a free static domain** (recommended):
    - Go to [https://dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains)
    - Click **"New Domain"** to claim your free static domain
    - You'll get a domain like `your-name.ngrok-free.app`

#### 3.2 Install ngrok

**macOS (Homebrew):**

```
brew install ngrok
```

**Linux (Debian/Ubuntu):**

```
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
  && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list \
  && sudo apt update && sudo apt install ngrok
```

**Or download from** [https://ngrok.com/download](https://ngrok.com/download)

#### 3.3 Configure ngrok

```
# Add your auth token
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

#### 3.4 Test ngrok manually

```
# With static domain (recommended)
ngrok http --url=your-name.ngrok-free.app 3000

# Or without static domain (URL changes each restart)
ngrok http 3000
```

#### 3.5 Set Up ngrok as a systemd Service (Linux)

To run ngrok automatically on boot **before Homebridge starts**:

**Step 1: Create the ngrok config file**

```
mkdir -p ~/.config/ngrok
nano ~/.config/ngrok/ngrok.yml
```

Add the following content:

```
version: "2"
authtoken: YOUR_AUTH_TOKEN
tunnels:
  homebridge:
    addr: 3000
    proto: http
    url: your-name.ngrok-free.app
```

**Step 2: Install ngrok as a service (Easy Method)**

ngrok has a built-in command to install itself as a systemd service:

```
# Install ngrok as a system service
sudo ngrok service install --config ~/.config/ngrok/ngrok.yml

# Start the service
sudo ngrok service start
```

That's it! ngrok will now start automatically on boot.

**Check status:**

```
sudo ngrok service status
# or
sudo systemctl status ngrok
```

**View logs:**

```
journalctl -u ngrok -f
```

**Uninstall the service:**

```
sudo ngrok service uninstall
```

---

**Alternative: Manual systemd Setup (if you need custom configuration)**

If you need ngrok to start **before** Homebridge specifically:

**Create the systemd service file:**

```
sudo nano /etc/systemd/system/ngrok.service
```

Add the following content (replace `YOUR_USER` with your username):

```
[Unit]
Description=ngrok tunnel for Homebridge
After=network-online.target
Wants=network-online.target
Before=homebridge.service

[Service]
Type=simple
User=YOUR_USER
ExecStart=/usr/local/bin/ngrok start homebridge --config /home/YOUR_USER/.config/ngrok/ngrok.yml
Restart=on-failure
RestartSec=5
# Give ngrok time to establish tunnel before homebridge starts
ExecStartPost=/bin/sleep 3

[Install]
WantedBy=multi-user.target
RequiredBy=homebridge.service
```

> **Important**: The `Before=homebridge.service` and `RequiredBy=homebridge.service` ensure ngrok starts before Homebridge and that Homebridge waits for ngrok.

**Step 3: Find ngrok path** (update ExecStart if different):

```
which ngrok
```

**Step 4: Update Homebridge service to depend on ngrok**

```
sudo nano /etc/systemd/system/homebridge.service
```

Add or modify the `[Unit]` section to include:

```
[Unit]
Description=Homebridge
After=network-online.target ngrok.service
Wants=network-online.target
Requires=ngrok.service
```

**Step 5: Reload and enable services**

```
sudo systemctl daemon-reload
sudo systemctl enable ngrok.service
sudo systemctl start ngrok.service
```

**Step 6: Verify ngrok is running**

```
sudo systemctl status ngrok.service
```

**Step 7: Restart Homebridge** (it will now wait for ngrok)

```
sudo systemctl restart homebridge.service
```

**View ngrok logs:**

```
journalctl -u ngrok -f
```

**Check boot order:**

```
systemctl list-dependencies homebridge.service
```

#### 3.6 Set Up ngrok with launchd (macOS)

To run ngrok automatically on boot on macOS:

**Create the ngrok config file** at `~/.config/ngrok/ngrok.yml`:

**Create the launchd plist file**:

**Add the following content**:

**Find ngrok path** and update the plist if needed:

**Load the service**:

**Check status**:

> **Tip**: The free ngrok plan includes 1 free static domain. Using a static domain means you don't need to update your SmartApp URL each time you restart ngrok.

---

### Step 4: Create SmartThings Webhook SmartApp

This app receives real-time events from SmartThings.

Make sure ngrok is running and note your public URL (e.g., `https://your-name.ngrok-free.app`)

**Start the Homebridge plugin first** (so it can respond to the confirmation request):

- Configure the plugin with your ngrok URL (see Step 5)
- Start Homebridge
- Verify ngrok is forwarding to port 3000

**Create the SmartApp**:

**Select App Type**: Choose `Webhook SmartApp`

**Enter App Details**:

**Enter Target URL** - Use your ngrok URL with `/smartapp`:

> **Important**: Make sure to include `/smartapp` at the end!

**Select Scopes** - Use arrow keys and space to select:

Press Enter when done.

**Domain Confirmation** - The CLI will send a CONFIRMATION request to your webhook:

Check your Homebridge logs - you should see:

If successful, the CLI will show:

**Save the App ID** - You'll need this if you need to update the app later:

### Troubleshooting SmartApp Creation

**"Confirmation failed" or timeout:**

- Make sure Homebridge is running with the plugin configured
- Verify ngrok is running and forwarding to port 3000
- Check that `server_url` in your config matches your ngrok URL
- Check Homebridge logs for errors

**Update Target URL later:**  
If you need to change the URL (e.g., new ngrok domain):

```
smartthings apps:update YOUR_APP_ID
```

---

### Step 5: Configure the Plugin

In your Homebridge `config.json` or through the UI:

```
{
  "platforms": [
    {
      "platform": "HomeBridgeSmartThings",
      "name": "SmartThings",
      "client_id": "YOUR_OAUTH_CLIENT_ID",
      "client_secret": "YOUR_OAUTH_CLIENT_SECRET",
      "server_url": "https://YOUR-PUBLIC-URL",
      "webhook_port": 3000,
      "use_direct_webhook": true
    }
  ]
}
```

| Option               | Description                                 |
| -------------------- | ------------------------------------------- |
| `client_id`          | OAuth Client ID from Step 2                 |
| `client_secret`      | OAuth Client Secret from Step 2             |
| `server_url`         | Your public URL (without `/smartapp`)       |
| `webhook_port`       | Port for the webhook server (default: 3000) |
| `use_direct_webhook` | Set to `true` to enable direct webhooks     |

---

### Step 6: Install the SmartApp

1.  Open the SmartThings mobile app
2.  Go to **Menu** → **SmartApps** → **+** (Add)
3.  Scroll down and tap **"My SmartApps"** or find **"Homebridge Webhook"**
4.  Select your location and authorize the app

---

### Step 7: Restart Homebridge

Restart Homebridge to complete the setup. Check the logs for:

```
SmartApp: Loaded saved credentials for installed app: xxx
Direct webhook mode: Registered 24 device IDs with SmartApp handler
Direct webhook mode: Device subscriptions created
```

---

## How It Works

1.  **SmartApp Installation**: When you install the SmartApp in SmartThings, it sends credentials to your webhook
2.  **Device Subscriptions**: The plugin creates subscriptions for each of your devices
3.  **Real-Time Events**: When a device state changes, SmartThings pushes the event directly to your Homebridge
4.  **HomeKit Update**: The plugin processes the event and updates HomeKit immediately

No polling, no relay service, no delays!

---

## Troubleshooting

### Events not being received

Check that your public URL is accessible:

Verify subscriptions were created:

Check Homebridge logs for errors

### SmartApp not showing in mobile app

1.  Make sure you completed domain confirmation during `smartthings apps:create`
2.  Try: `smartthings apps:register YOUR_APP_ID`

### Token expired

The plugin automatically refreshes OAuth tokens. If issues persist:

1.  Re-run the OAuth wizard in plugin settings
2.  Restart Homebridge

### Clearing Tokens / Starting Fresh

If you need to completely reset the plugin authentication:

1.  **In Homebridge UI**: Click "Clear All Tokens" button in the plugin settings
2.  **In SmartThings App**: Remove the SmartApp installation:
    - Open SmartThings mobile app
    - Go to Menu (☰) → SmartApps
    - Find "Homebridge SmartThings"
    - Tap and select "Delete" or "Remove"
3.  **Restart Homebridge**
4.  **Re-authorize**: Go through the OAuth wizard again

> **Important**: If you only clear tokens in Homebridge but don't remove the SmartApp from SmartThings, you may have orphaned subscriptions that won't receive events properly.

---

## Configuration Options

| Option                         | Type    | Default | Description                                |
| ------------------------------ | ------- | ------- | ------------------------------------------ |
| `use_direct_webhook`           | boolean | `true`  | Enable direct SmartThings webhooks         |
| `server_url`                   | string  | \-      | Public URL for webhooks                    |
| `webhook_port`                 | number  | `3000`  | Local port for webhook server              |
| `smartapp_id`                  | string  | \-      | SmartApp ID for webhook request validation |
| `PollSensorsSeconds`           | number  | `5`     | Polling interval for sensors (fallback)    |
| `PollSwitchesAndLightsSeconds` | number  | `10`    | Polling interval for switches              |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## Credits

Special thanks to:

- [@iklein99](https://github.com/iklein99/) - Original [homebridge-smartthings](https://github.com/iklein99/homebridge-smartthings) plugin
- [@aziz66](https://github.com/aziz66/) - [homebridge-smartthings fork](https://github.com/aziz66/homebridge-smartthings) with direct webhook support

This plugin builds upon their excellent work to provide real-time SmartThings integration for Homebridge.

---

## License

MIT
