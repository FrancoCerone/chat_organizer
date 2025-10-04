# Chat Organizer

Server Node.js per organizzare e filtrare messaggi WhatsApp tramite webhook della Cloud API.

## 🚀 Funzionalità

- **Webhook WhatsApp**: Riceve eventi in tempo reale dalla WhatsApp Cloud API
- **Sistema di Filtri Avanzato**: Filtra messaggi per autore, parole chiave, tipo, orario
- **Database MongoDB**: Memorizza tutti i messaggi e metadati
- **API REST**: Endpoint per frontend e integrazioni
- **Statistiche**: Dashboard con metriche e analisi
- **Auto-azioni**: Risposte automatiche, inoltro, archiviazione

## 📋 Prerequisiti

- Node.js 16+
- MongoDB
- Account WhatsApp Business con Cloud API

## 🛠️ Installazione

1. **Clona il repository**
```bash
git clone <repository-url>
cd chat-organizer
```

2. **Installa dipendenze**
```bash
npm install
```

3. **Configura variabili d'ambiente**
```bash
cp env.example .env
```

Modifica il file `.env` con le tue credenziali:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/chat_organizer
WHATSAPP_VERIFY_TOKEN=your_verify_token_here
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
```

4. **Avvia MongoDB**
```bash
# Con Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# O installa MongoDB localmente
```

5. **Avvia il server**
```bash
# Sviluppo
npm run dev

# Produzione
npm start
```

6 **Se in locale avvia ngrok (windows powershell)**
```bash
 ngrok config 33U1PlM2g225OC5SQStl2khSmIP_mEQ4Q4eH3vPTSuz9gKLt
 
 Start-Process cmd -ArgumentList "/k ngrok http 3000"
 ```


## 📡 Configurazione Webhook WhatsApp

1. **Configura il webhook** nella console di Meta for Developers:
   - URL: `https://yourdomain.com/webhook`
   - Verifica token: usa il valore da `WHATSAPP_VERIFY_TOKEN`

2. **Sottoscrivi agli eventi**:
   - `messages` - per ricevere i messaggi

## 🔧 API Endpoints

### Webhook
- `GET /webhook` - Verifica webhook
- `POST /webhook` - Ricevi eventi WhatsApp

### Messaggi
- `GET /api/messages` - Lista messaggi (con filtri)
- `GET /api/messages/:id` - Messaggio specifico
- `PATCH /api/messages/:id` - Aggiorna messaggio
- `DELETE /api/messages/:id` - Elimina messaggio

### Filtri
- `GET /api/filters` - Lista filtri
- `POST /api/filters` - Crea filtro
- `PUT /api/filters/:id` - Aggiorna filtro
- `DELETE /api/filters/:id` - Elimina filtro
- `PATCH /api/filters/:id/toggle` - Attiva/disattiva filtro

### Statistiche
- `GET /api/stats` - Statistiche generali
- `GET /api/stats/authors` - Statistiche per autore
- `GET /api/search?q=termine` - Ricerca messaggi

## 🎯 Esempi di Filtri

### Filtro per Parole Chiave
```json
{
  "name": "Messaggi Urgenti",
  "keywords": ["urgente", "emergenza", "asap"],
  "actions": {
    "markAsImportant": true,
    "setPriority": "urgent",
    "addTags": ["urgente"]
  }
}
```

### Filtro per Orario
```json
{
  "name": "Messaggi Lavoro",
  "timeRange": {
    "start": "09:00",
    "end": "18:00",
    "days": [1, 2, 3, 4, 5]
  },
  "actions": {
    "addTags": ["lavoro"]
  }
}
```

### Filtro per Autore
```json
{
  "name": "Messaggi VIP",
  "authors": [
    {
      "phoneNumber": "+1234567890",
      "name": "Mario Rossi"
    }
  ],
  "actions": {
    "markAsImportant": true,
    "setPriority": "high"
  }
}
```

## 📊 Struttura Database

### Message Schema
```javascript
{
  messageId: String,
  from: {
    phoneNumber: String,
    name: String
  },
  content: {
    type: String, // text, image, document, etc.
    text: String,
    media: Object
  },
  timestamp: Date,
  status: String, // received, processed, filtered, archived
  filters: Object,
  metadata: {
    isImportant: Boolean,
    priority: String, // low, medium, high, urgent
    tags: [String],
    notes: String
  }
}
```

### Filter Schema
```javascript
{
  name: String,
  authors: [Object],
  keywords: [String],
  messageTypes: [String],
  timeRange: Object,
  actions: {
    markAsImportant: Boolean,
    setPriority: String,
    addTags: [String],
    autoReply: Object,
    forwardTo: [String],
    archive: Boolean
  }
}
```

## 🔍 Esempi di Utilizzo

### Ottenere messaggi importanti
```bash
GET /api/messages?important=true&priority=urgent
```

### Cercare messaggi per parola chiave
```bash
GET /api/search?q=importante&type=text
```

### Filtrare per autore e data
```bash
GET /api/messages?author=+1234567890&dateFrom=2024-01-01
```

## 🚀 Deploy

### Con Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Con PM2
```bash
npm install -g pm2
pm2 start server.js --name chat-organizer
```

## 📝 Note

- Il server gestisce automaticamente la verifica del webhook
- I filtri vengono applicati in tempo reale ai nuovi messaggi
- Tutti i messaggi vengono salvati nel database per analisi future
- Le statistiche vengono calcolate dinamicamente

## 🤝 Contributi

1. Fork del repository
2. Crea un branch per la feature
3. Commit delle modifiche
4. Push al branch
5. Apri una Pull Request

## 📄 Licenza

MIT License

## 🤝     Coinvolgere il cliente (se lui ha già WhatsApp Business)

Puoi chiedere al cliente di creare un Facebook Business Manager (gratuito) e abilitare lì il WhatsApp Business Account (WABA).

Poi ti assegna come developer/partner al suo Business Manager.

Così tu puoi sviluppare direttamente sul suo ambiente ufficiale, mentre lui mantiene il controllo.



