#!/bin/bash
set -e

echo "📦 Installing Chromium for Puppeteer..."

# Installa Chromium
apt-get update && \
    apt-get install -y --no-install-recommends chromium-browser \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

echo "✅ Chromium installed successfully"

# Installa dipendenze Node.js
npm install

echo "✅ Build completed"
