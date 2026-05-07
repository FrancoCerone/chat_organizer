# Chat Organizer

Server Node.js per organizzare messaggi WhatsApp tramite webhook.

## Caratteristiche

- Webhook per ricevere messaggi WhatsApp
- Sistema di filtri configurabili
- Inoltro automatico dei messaggi
- API REST per gestione filtri e messaggi
- Filtro "Inoltra Tutto" per inoltrare tutti i messaggi ricevuti

## Filtri Disponibili

### Inoltra Tutto
Filtro predefinito che inoltra automaticamente **tutti i messaggi ricevuti**. Questo filtro:
- Non ha keywords specifiche (matcha tutti i messaggi)
- Non ha autori specifici (matcha tutti gli autori)
- Funziona 24/7
- Aggiunge automaticamente il tag "inoltro-automatico"

Per configurare il numero di destinazione per l'inoltro, imposta le seguenti variabili nel file `.env`:
```
FORWARD_SEPARATE_CHAT=true
FORWARD_SEPARATE_CHAT_NUMBER=+39xxxxxxx
```

## Creazione Eseguibili

### Installazione dipendenze
```bash
npm install
```

### Costruire eseguibili

Per creare eseguibili per tutte le piattaforme:
```bash
npm run build:all
```

Per creare eseguibili specifici:
```bash
# Solo Windows
npm run build:win

# Solo Mac (Intel)
npm run build:mac

# Solo Mac (Apple Silicon/M1/M2)
npm run build:mac-arm
```

Gli eseguibili saranno creati nella cartella `dist/`:
- `chat-organizer-win.exe` - Windows
- `chat-organizer-macos` - Mac Intel
- `chat-organizer-macos-arm64` - Mac Apple Silicon

### Requisiti per l'esecuzione

Per eseguire l'applicazione è necessario avere:
- MongoDB (locale o remoto)
- File `.env` configurato con le credenziali necessarie
- WhatsApp Business API o WhatsApp Web configurato

## Configurazione

Copia il file `env.example` e crea un file `.env` con le tue configurazioni:

```bash
cp env.example .env
```

Modifica il file `.env` con le tue credenziali.

## Avvio

### Modalità sviluppo
```bash
npm run dev
```

### Modalità produzione
```bash
npm start
```

### Con Docker

#### Opzione 1: Docker Compose (consigliato per sviluppo)
```bash
# Assicurati di avere un file .env configurato
cp env.example .env
# Modifica .env con le tue configurazioni

# Avvia tutti i servizi (app + MongoDB)
docker-compose up -d

# Vedi i log
docker-compose logs -f app

# Ferma i servizi
docker-compose down
```

#### Opzione 2: Solo Docker (senza docker-compose)
```bash
# Build dell'immagine
docker build -t chat-organizer .

# Esegui il container
docker run -d \
  --name chat-organizer \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/wwebjs_auth:/app/.wwebjs_auth \
  -v $(pwd)/wwebjs_cache:/app/.wwebjs_cache \
  chat-organizer

# Vedi i log
docker logs -f chat-organizer
```

**Nota:** Le directory `wwebjs_auth` e `wwebjs_cache` vengono montate come volumi per mantenere le sessioni WhatsApp persistenti.

## Documentazione API

### Health Check
```
GET /health
```

### Webhook WhatsApp
```
POST /webhook
```

### API
```
GET /api
```

## Filtri

Il sistema supporta filtri personalizzati tramite API o comandi WhatsApp (per admin).

I filtri predefiniti includono:
- **Messaggi Urgenti**: Filtra messaggi con parole chiave urgenti
- **Messaggi di Lavoro**: Filtra messaggi durante orario lavorativo
- **Inoltra Tutto**: Inoltra automaticamente tutti i messaggi ricevuti

## Licenza

MIT

per riavviarlo nel VPS 

docker stop chat_organizer_app   chat_organizer_mongo_express chat_organizer_mongodb
docker rm chat_organizer_app   chat_organizer_mongo_express chat_organizer_mongodb
rm -rf  wwebjs_auth  wwebjs_cache
docker compose up -d --build
docker stop chat_organizer_app
sudo chmod -R 777 wwebjs_auth  wwebjs_cache
docker restart chat_organizer_app
