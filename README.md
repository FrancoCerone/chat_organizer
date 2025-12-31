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
```bash
docker-compose up -d
```

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