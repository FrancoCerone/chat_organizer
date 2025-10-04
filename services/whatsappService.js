const axios = require('axios');

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0';

class WhatsappService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
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

  async sendText(toPhoneNumber, text) {
    const payload = {
      messaging_product: 'whatsapp',
      to: toPhoneNumber,
      type: 'text',
      text: { body: text }
    };

    const { data } = await this.axiosInstance.post('/messages', payload);
    return data;
  }

  async forwardText(originalMessage, toPhoneNumber) {
    const text = originalMessage.content?.text || '[messaggio senza testo]';
    const header = originalMessage.from?.name
      ? `Inoltrato da ${originalMessage.from.name} (${originalMessage.from.phoneNumber})\n\n`
      : `Inoltrato da ${originalMessage.from.phoneNumber}\n\n`;

    const body = `${header}${text}`;
    return this.sendText(toPhoneNumber, body);
  }

  async postToWebhook(url, payload) {
    const { data } = await axios.post(url, payload, { timeout: 15000 });
    return data;
  }
}

module.exports = new WhatsappService();




