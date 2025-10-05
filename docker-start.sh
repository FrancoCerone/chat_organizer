#!/bin/bash

# Script per avviare il database MongoDB con Docker

echo "🐳 Avvio MongoDB con Docker Compose..."

# Avvia i servizi
docker-compose up -d

echo "⏳ Attendo che MongoDB sia pronto..."
sleep 10

# Verifica che i container siano in esecuzione
echo "📊 Stato dei container:"
docker-compose ps

echo ""
echo "✅ MongoDB è pronto!"
echo "🔗 Connessione: mongodb://chat_user:chat_password123@localhost:27017/chat_organizer"
echo "🌐 Mongo Express: http://localhost:8081 (admin/admin123)"
echo ""
echo "Per fermare i servizi: docker-compose down"
echo "Per vedere i log: docker-compose logs -f"




