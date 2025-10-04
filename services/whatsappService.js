const axios = require('axios');

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0';

class WhatsappService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.refreshToken = process.env.WHATSAPP_REFRESH_TOKEN;
    this.appId = process.env.WHATSAPP_APP_ID;
    this.appSecret = process.env.WHATSAPP_APP_SECRET;
    this.tokenExpiry = null;
  }

  get axiosInstance() {
    return axios.create({
      baseURL: `${WHATSAPP_API_BASE}/${this.phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  // Verifica se il token è scaduto
  isTokenExpired() {
    if (!this.tokenExpiry) return false;
    return new Date() >= new Date(this.tokenExpiry);
  }

  // Gestisce il refresh del token di accesso
  async refreshAccessToken() {
    if (!this.refreshToken || !this.appId || !this.appSecret) {
      throw new Error('Refresh token, App ID o App Secret non configurati');
    }

    try {
      const response = await axios.get('https://graph.facebook.com/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: this.refreshToken
        }
      });

      this.accessToken = response.data.access_token;
      
      // Calcola la scadenza (di solito 60 giorni per i token a lunga durata)
      if (response.data.expires_in) {
        this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));
      }

      console.log('✅ WhatsApp access token refreshed successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Error refreshing WhatsApp access token:', error.response?.data || error.message);
      throw error;
    }
  }

  // Gestisce gli errori di token scaduto
  async handleTokenExpiredError(error) {
    if (error.response?.data?.error?.code === 190 && 
        error.response?.data?.error?.error_subcode === 463) {
      
      console.log('🔄 Token scaduto, tentativo di refresh...');
      
      try {
        await this.refreshAccessToken();
        return true; // Token aggiornato con successo
      } catch (refreshError) {
        console.error('❌ Impossibile aggiornare il token:', refreshError.message);
        return false; // Refresh fallito
      }
    }
    return false; // Non è un errore di token scaduto
  }

  async sendText(toPhoneNumber, text) {
    const payload = {
      messaging_product: 'whatsapp',
      to: toPhoneNumber,
      type: 'text',
      text: { body: text }
    };

    try {
      const { data } = await this.axiosInstance.post('/messages', payload);
      return data;
    } catch (error) {
      // Se il token è scaduto, prova a fare il refresh e riprova
      const tokenRefreshed = await this.handleTokenExpiredError(error);
      if (tokenRefreshed) {
        console.log('🔄 Retrying send after token refresh...');
        const { data } = await this.axiosInstance.post('/messages', payload);
        return data;
      }
      throw error;
    }
  }

  // Builder centralizzato per messaggi inoltrati
  buildForwardMessage(originalMessage, filterName = null) {
    const text = originalMessage.content?.text || '[messaggio senza testo]';
    const timestamp = new Date(originalMessage.timestamp).toLocaleString('it-IT');

    // Se è specificato un filtro, usa formattazione ricca
    if (filterName) {
      // Header con nome del filtro più prominente
      const filterHeader = `🚨 FILTRO ATTIVATO: **${filterName}**\n`;
      const separator = `${'═'.repeat(35)}\n`;
      
      // Informazioni mittente
      let senderInfo = '';
      if (originalMessage.metadata?.groupInfo) {
        // Messaggio da gruppo
        senderInfo = `👥 **Gruppo:** ${originalMessage.metadata.groupInfo.name}\n`;
        senderInfo += originalMessage.from?.name
          ? `👤 **Da:** ${originalMessage.from.name}\n📱 **Numero:** ${originalMessage.from.phoneNumber}\n`
          : `📱 **Da:** ${originalMessage.from.phoneNumber}\n`;
      } else {
        // Messaggio privato
        senderInfo = originalMessage.from?.name
          ? `👤 **Da:** ${originalMessage.from.name}\n📱 **Numero:** ${originalMessage.from.phoneNumber}\n`
          : `📱 **Da:** ${originalMessage.from.phoneNumber}\n`;
      }
      
      const timeInfo = `⏰ **Quando:** ${timestamp}\n`;
      const messageSeparator = `${'─'.repeat(30)}\n\n`;
      
      // Contenuto del messaggio
      const messageContent = `💬 **Messaggio:**\n${text}`;

      return `${filterHeader}${separator}${senderInfo}${timeInfo}${messageSeparator}${messageContent}`;
    } else {
      // Formattazione semplice per forward legacy
      const header = originalMessage.from?.name
        ? `Inoltrato da ${originalMessage.from.name} (${originalMessage.from.phoneNumber})\n\n`
        : `Inoltrato da ${originalMessage.from.phoneNumber}\n\n`;

      return `${header}${text}`;
    }
  }

  async forwardText(originalMessage, toPhoneNumber, filterName = null) {
    const messageBody = this.buildForwardMessage(originalMessage, filterName);
    return this.sendText(toPhoneNumber, messageBody);
  }

  // Invia messaggio nella chat separata con formattazione migliorata
  async sendToSeparateChat(originalMessage, filterName = 'Filtro') {
    const separateChatNumber = process.env.FORWARD_SEPARATE_CHAT_NUMBER;
    
    if (!separateChatNumber) {
      throw new Error('FORWARD_SEPARATE_CHAT_NUMBER non configurato');
    }

    console.log(`📤 Invio messaggio filtrato a ${separateChatNumber}`);
    
    return this.forwardText(originalMessage, separateChatNumber, filterName);
  }

  // Metodo per verificare la validità del token
  async validateToken() {
    try {
      const response = await axios.get(`https://graph.facebook.com/me`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });
      return { valid: true, data: response.data };
    } catch (error) {
      if (error.response?.data?.error?.code === 190) {
        return { valid: false, error: 'Token scaduto o non valido' };
      }
      return { valid: false, error: error.message };
    }
  }

  async postToWebhook(url, payload) {
    const { data } = await axios.post(url, payload, { timeout: 15000 });
    return data;
  }
}

module.exports = new WhatsappService();