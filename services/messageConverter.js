/**
 * Servizio per convertire messaggi da diversi formati al formato standard
 */

class MessageConverter {
  
  /**
   * Converte un messaggio WhatsApp Web.js nel formato standard
   * @param {Object} message - Messaggio da whatsapp-web.js
   * @param {Object} chat - Chat object da whatsapp-web.js
   * @param {Object} contact - Contact object da whatsapp-web.js
   * @returns {Object} Messaggio nel formato standard
   */
  static async convertWhatsAppWebMessage(message, chat, contact) {
    try {
      const messageData = {
        messageId: message.id._serialized,
        from: {
          name: contact.name || contact.pushname || contact.number,
          phoneNumber: contact.number,
          profileName: contact.pushname || contact.name
        },
        content: {
          type: message.type === 'chat' ? 'text': message.type,
          text: message.body || '',
          timestamp: new Date(message.timestamp * 1000)
        },
        timestamp: new Date(message.timestamp * 1000).toISOString(),
        metadata: {
          source: 'whatsapp-web',
          groupInfo: {
            name: chat.name,
            id: chat.id._serialized
          }
        }
      };

      // Gestisce diversi tipi di messaggio
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        messageData.content.media = {
          mimetype: media.mimetype,
          filename: media.filename,
          data: media.data
        };
      }

      return messageData;
    } catch (error) {
      console.error('❌ Errore conversione messaggio WhatsApp Web:', error);
      throw error;
    }
  }

  /**
   * Converte un messaggio webhook nel formato standard
   * @param {Object} webhookMessage - Messaggio dal webhook
   * @returns {Object} Messaggio nel formato standard
   */
  static convertWebhookMessage(webhookMessage) {
    try {
      return {
        messageId: webhookMessage.id || `webhook_${Date.now()}`,
        from: {
          name: webhookMessage.from?.name || webhookMessage.from?.profileName,
          phoneNumber: webhookMessage.from?.phoneNumber,
          profileName: webhookMessage.from?.profileName || webhookMessage.from?.name
        },
        content: {
          type: webhookMessage.content?.type || 'text',
          text: webhookMessage.content?.text || '',
          timestamp: new Date(webhookMessage.timestamp || Date.now())
        },
        timestamp: webhookMessage.timestamp || new Date().toISOString(),
        metadata: {
          source: 'webhook'
        }
      };
    } catch (error) {
      console.error('❌ Errore conversione messaggio webhook:', error);
      throw error;
    }
  }

  /**
   * Normalizza un messaggio per il processing
   * @param {Object} message - Messaggio in formato standard
   * @returns {Object} Messaggio normalizzato per i filtri
   */
  static normalizeMessage(message) {
    try {
      return {
        messageId: message.messageId,
        from: {
          name: message.from?.name || 'Unknown',
          phoneNumber: message.from?.phoneNumber || 'Unknown',
          profileName: message.from?.profileName || message.from?.name
        },
        content: {
          type: message.content?.type || 'text',
          text: message.content?.text || '',
          timestamp: message.content?.timestamp || new Date(message.timestamp)
        },
        timestamp: message.timestamp,
        metadata: {
          ...message.metadata,
          processedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ Errore normalizzazione messaggio:', error);
      throw error;
    }
  }

  /**
   * Valida un messaggio nel formato standard
   * @param {Object} message - Messaggio da validare
   * @returns {boolean} True se valido
   */
  static validateMessage(message) {
    try {
      const requiredFields = ['messageId', 'from', 'content', 'timestamp'];
      
      for (const field of requiredFields) {
        if (!message[field]) {
          console.error(`❌ Campo mancante: ${field}`);
          return false;
        }
      }

      if (!message.from.phoneNumber) {
        console.error('❌ Numero di telefono mancante');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Errore validazione messaggio:', error);
      return false;
    }
  }

  /**
   * Controlla se un messaggio Mongoose è stato modificato
   * @param {Object} message - Oggetto Mongoose Message
   * @returns {boolean} True se modificato
   */
  static isMessageModified(message) {
    try {
      // Se è un oggetto Mongoose, usa isModified()
      if (message && typeof message.isModified === 'function') {
        return message.isModified();
      }
      
      // Altrimenti controlla se ha modifiche manuali
      return message._modified || false;
    } catch (error) {
      console.error('❌ Errore controllo modifiche messaggio:', error);
      return false;
    }
  }

  /**
   * Marca un messaggio come modificato
   * @param {Object} message - Oggetto messaggio
   */
  static markAsModified(message) {
    try {
      if (message && typeof message.markModified === 'function') {
        // Per oggetti Mongoose
        message.markModified('status');
        message.markModified('metadata');
      } else {
        // Per oggetti normali
        message._modified = true;
      }
    } catch (error) {
      console.error('❌ Errore marcatura modifiche:', error);
    }
  }
}

module.exports = MessageConverter;
