// Script di inizializzazione per creare utente e database
db = db.getSiblingDB('chat_organizer');

// Crea utente per l'applicazione
db.createUser({
  user: 'chat_user',
  pwd: 'chat_password123',
  roles: [
    {
      role: 'readWrite',
      db: 'chat_organizer'
    }
  ]
});

// Crea collezioni iniziali
db.createCollection('messages');
db.createCollection('filters');

// Crea indici per performance
db.messages.createIndex({ "messageId": 1 }, { unique: true });
db.messages.createIndex({ "from.phoneNumber": 1, "timestamp": -1 });
db.messages.createIndex({ "timestamp": -1 });
db.messages.createIndex({ "status": 1 });
db.messages.createIndex({ "metadata.priority": 1 });
db.messages.createIndex({ "metadata.tags": 1 });

db.filters.createIndex({ "name": 1 }, { unique: true });
db.filters.createIndex({ "enabled": 1 });

print('✅ Database chat_organizer inizializzato');
print('✅ Utente chat_user creato');
print('✅ Collezioni e indici creati');




