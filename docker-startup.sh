#!/bin/sh
# Startup script for Homebridge - copies plugin from mounted source

PLUGIN_NAME="homebridge-smartthings-webhook"
PLUGIN_SRC="/plugin-src"
PLUGIN_DEST="/var/lib/homebridge/node_modules/${PLUGIN_NAME}"

echo "=== Installing ${PLUGIN_NAME} from local source ==="

# Create plugin directory
mkdir -p "${PLUGIN_DEST}"

# Copy plugin files
echo "Copying plugin files..."
cp -r "${PLUGIN_SRC}/dist" "${PLUGIN_DEST}/"
cp -r "${PLUGIN_SRC}/node_modules" "${PLUGIN_DEST}/"
cp "${PLUGIN_SRC}/package.json" "${PLUGIN_DEST}/"
cp "${PLUGIN_SRC}/config.schema.json" "${PLUGIN_DEST}/"
cp -r "${PLUGIN_SRC}/homebridge-ui" "${PLUGIN_DEST}/"

echo "=== Plugin installed successfully ==="
