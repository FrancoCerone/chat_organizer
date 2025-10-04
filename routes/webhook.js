const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { FilterService } = require('../services/filterService');

// Verifica webhook (GET)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verifica token
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.status(403).json({ error: 'Forbidden' });
  }
});

// Ricevi webhook (POST)
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    
    // Verifica che sia un webhook di WhatsApp
    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry;
      
      for (const entry of entries) {
        const changes = entry.changes;
        
        for (const change of changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;
            
            if (messages && messages.length > 0) {
              for (const message of messages) {
                await processMessage(message, change.value);
              }
            }
          }
        }
      }
    }
    
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Processa un singolo messaggio
async function processMessage(messageData, webhookData) {
  try {
    console.log('📨 Processing new message:', messageData.id);
    
    // Estrai informazioni del messaggio
    const messageInfo = extractMessageInfo(messageData, webhookData);
    
    // Salva messaggio nel database
    const message = new Message(messageInfo);
    await message.save();
    
    console.log('💾 Message saved to database');
    
    // Applica filtri
    const filterResults = await FilterService.applyFilters(messageInfo);
    
    if (filterResults.length > 0) {
      console.log(`🔍 Message matched ${filterResults.length} filters`);
      
      // Esegui azioni dei filtri
      await FilterService.executeFilterActions(message, filterResults);
      
      // Aggiorna stato messaggio
      await message.markAsFiltered();
    } else {
      // Nessun filtro matchato, marca come processato
      await message.markAsProcessed();
    }
    
    console.log('✅ Message processing completed');
    
  } catch (error) {
    console.error('❌ Error processing message:', error);
  }
}

// Estrae informazioni utili dal messaggio WhatsApp
function extractMessageInfo(messageData, webhookData) {
  const messageInfo = {
    messageId: messageData.id,
    from: {
      phoneNumber: messageData.from,
      name: webhookData.contacts?.[0]?.profile?.name || null,
      profileName: webhookData.contacts?.[0]?.profile?.name || null
    },
    to: {
      phoneNumber: messageData.to
    },
    content: {
      type: messageData.type,
      text: messageData.text?.body || null
    },
    timestamp: new Date(parseInt(messageData.timestamp) * 1000),
    rawData: {
      message: messageData,
      webhook: webhookData
    }
  };
  
  // Gestisci diversi tipi di contenuto
  switch (messageData.type) {
    case 'image':
    case 'document':
    case 'audio':
    case 'video':
    case 'sticker':
      messageInfo.content.media = {
        url: messageData[messageData.type]?.link || null,
        mimeType: messageData[messageData.type]?.mime_type || null,
        fileName: messageData[messageData.type]?.filename || null,
        fileSize: messageData[messageData.type]?.file_size || null
      };
      break;
      
    case 'location':
      messageInfo.content.location = {
        latitude: messageData.location?.latitude || null,
        longitude: messageData.location?.longitude || null,
        name: messageData.location?.name || null,
        address: messageData.location?.address || null
      };
      break;
      
    case 'contact':
      messageInfo.content.contact = messageData.contact;
      break;
  }
  
  return messageInfo;
}

module.exports = router;


