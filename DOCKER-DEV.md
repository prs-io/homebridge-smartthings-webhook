# Homebridge SmartThings Development Setup

## Quick Start

1. **Start Homebridge with the plugin:**

   ```bash
   docker-compose up -d
   ```

2. **View logs:**

   ```bash
   docker-compose logs -f
   ```

3. **Access Homebridge UI:**
   Open http://localhost:8581 in your browser
   - Default login: `admin` / `admin`

4. **Configure the plugin:**
   - Go to Plugins → Homebridge SmartThings oAuth Plugin → Settings
   - Enter your SmartThings OAuth credentials
   - Complete the OAuth wizard

## Testing Direct Webhooks

To test the direct webhook feature:

1. **Start a tunnel** (in a separate terminal):

   ```bash
   ngrok http 3000
   ```

2. **Update plugin config** in Homebridge UI:
   - Set **Server URL** to your ngrok URL (e.g., `https://abc123.ngrok-free.app`)
   - Enable **Use Direct SmartThings Webhook**
   - Restart Homebridge

3. **Create SmartApp** in [SmartThings Developer Workspace](https://developer.smartthings.com/workspace/):
   - Create new Webhook SmartApp
   - Target URL: `https://your-ngrok-url/smartapp`
   - Permissions: `r:devices:*`, `x:devices:*`, `r:locations:*`

4. **Install the SmartApp** from SmartThings mobile app

## Development Workflow

After making code changes:

```bash
# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or just restart (if only TypeScript changed)
docker-compose restart
```

## Stop Homebridge

```bash
docker-compose down
```

## Data Persistence

All Homebridge data is stored in `./homebridge-data/`:

- `config.json` - Homebridge configuration
- `persist/` - Accessory cache
- `accessories/` - Cached accessories

## Troubleshooting

**Plugin not loading:**

```bash
docker-compose logs homebridge | grep -i smartthings
```

**Rebuild from scratch:**

```bash
docker-compose down -v
rm -rf homebridge-data/persist homebridge-data/accessories
docker-compose up -d
```
