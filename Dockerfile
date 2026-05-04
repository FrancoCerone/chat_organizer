# Dockerfile per Chat Organizer
# Applicazione Node.js con WhatsApp Web.js e Puppeteer

FROM node:18-bullseye


# Metadati
LABEL maintainer="Franco"
LABEL description="Chat Organizer - Server Node.js per organizzare messaggi WhatsApp"

# Installa dipendenze di sistema necessarie per Puppeteer/Chrome
# Queste sono essenziali per far funzionare whatsapp-web.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Dipendenze base
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    # Fonti per rendering corretto
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*


# Crea directory di lavoro
WORKDIR /app

# Crea utente non-root per sicurezza (opzionale ma consigliato)
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

# Copia file di dipendenze
COPY package*.json ./

# Installa dipendenze Node.js
# Usa npm install --omit=dev (più flessibile, funziona anche senza package-lock.json)
# Se package-lock.json esiste, verrà usato automaticamente
RUN npm install --omit=dev && \
    npm cache clean --force

# Installa Chrome per Puppeteer usando la versione richiesta dal puppeteer-core installato
# Questo evita mismatch tipo "Could not find Chrome (ver. X.Y.Z)"
RUN mkdir -p /home/appuser/.cache/puppeteer && \
    chown -R appuser:appuser /home/appuser/.cache && \
    CHROME_VERSION=$(node -e "const { PUPPETEER_REVISIONS } = require('puppeteer-core/lib/cjs/puppeteer/revisions.js'); process.stdout.write(PUPPETEER_REVISIONS.chrome);") && \
    echo "🔎 Chrome richiesto da puppeteer-core: ${CHROME_VERSION}" && \
    npx -y @puppeteer/browsers@latest install chrome@${CHROME_VERSION} --path=/home/appuser/.cache/puppeteer && \
    chown -R appuser:appuser /home/appuser/.cache || \
    (echo "⚠️ Installazione Chrome fallita, provo metodo alternativo..." && \
     CHROME_VERSION=$(node -e "const { PUPPETEER_REVISIONS } = require('puppeteer-core/lib/cjs/puppeteer/revisions.js'); process.stdout.write(PUPPETEER_REVISIONS.chrome);") && \
     PUPPETEER_CACHE_DIR=/home/appuser/.cache/puppeteer \
     npx -y @puppeteer/browsers@latest install chrome@${CHROME_VERSION} && \
     chown -R appuser:appuser /home/appuser/.cache) || \
    (echo "⚠️ Installazione Chrome fallita, continuo comunque" && exit 0)

# Copia il resto del codice dell'applicazione
COPY . .

# Crea directory per sessioni WhatsApp
# Queste directory devono essere persistenti per mantenere l'autenticazione
RUN mkdir -p .wwebjs_auth .wwebjs_cache && \
    chown -R appuser:appuser /app

# Cambia a utente non-root
USER appuser

# Esponi la porta dell'applicazione
EXPOSE 3000

# Variabili d'ambiente di default
ENV NODE_ENV=production
ENV PORT=3000

# Variabili per Puppeteer (per ambienti containerizzati)
# Chrome verrà installato da @puppeteer/browsers nella cache di Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/home/appuser/.cache/puppeteer

# Health check per verificare che l'app sia in esecuzione
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Avvia l'applicazione
CMD ["node", "server.js"]
