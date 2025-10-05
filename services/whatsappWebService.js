const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const filterServiceModule = require('./filterService');
const MessageConverter = require('./messageConverter');
const Message = require('../models/Message');


class WhatsappWebService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.groupsEnabled = process.env.WHATSAPP_GROUPS_ENABLED === 'true';
    this.groupsList = this.parseGroupsList();
    this.listenToAllGroups = process.env.WHATSAPP_GROUPS_ALL === 'true';
  }

  // Parsing della lista gruppi dal file .env
  parseGroupsList() {
    const groupsEnv = process.env.WHATSAPP_GROUPS_LIST;
    if (!groupsEnv) return [];
    
    return groupsEnv.split(',').map(group => group.trim()).filter(group => group.length > 0);
  }

  // Valida e formatta un numero di telefono per WhatsApp
  formatPhoneNumber(phoneNumber) {
    try {
      // Converte in stringa se necessario
      let phoneStr = phoneNumber;
      if (typeof phoneNumber !== 'string') {
        if (phoneNumber && phoneNumber.toString) {
          phoneStr = phoneNumber.toString();
        } else {
          throw new Error(`Numero di telefono non valido: ${JSON.stringify(phoneNumber)}`);
        }
      }

      // Pulisce il numero di telefono (rimuove spazi, caratteri speciali)
      phoneStr = phoneStr.replace(/\s+/g, '').replace(/[^\d+]/g, '');
      
      // Se inizia con +, rimuove il +
      if (phoneStr.startsWith('+')) {
        phoneStr = phoneStr.substring(1);
      }

      // Verifica che contenga solo numeri
      if (!/^\d+$/.test(phoneStr)) {
        throw new Error(`Numero di telefono contiene caratteri non validi: ${phoneStr}`);
      }

      // Verifica lunghezza minima (almeno 7 cifre)
      if (phoneStr.length < 7) {
        throw new Error(`Numero di telefono troppo corto: ${phoneStr}`);
      }

      return phoneStr;
    } catch (error) {
      console.error('❌ Errore formattazione numero:', error.message);
      throw error;
    }
  }

  // Inizializza il client WhatsApp Web
  async initialize() {
    if (!this.groupsEnabled) {
      console.log('⚠️ WhatsApp gruppi disabilitato nel file .env');
      return;
    }

    try {
      console.log('🚀 Inizializzazione WhatsApp Web.js...');
      
      this.client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      });

      this.setupEventListeners();
      await this.client.initialize();
      
    } catch (error) {
      console.error('❌ Errore inizializzazione WhatsApp Web:', error);
    }
  }

  // Configura gli event listener
  setupEventListeners() {
    // QR Code per autenticazione
    this.client.on('qr', (qr) => {
      console.log('📱 QR Code per autenticazione WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('💡 Scansiona il QR code sopra con WhatsApp');
    });

    // Autenticazione completata
    this.client.on('ready', () => {
      console.log('✅ WhatsApp Web.js autenticato e pronto!');
      this.isConnected = true;
      this.isAuthenticated = true;
      this.logGroupsInfo();
    });

    // Messaggio ricevuto
    this.client.on('message', async (message) => {
      console.log(JSON.stringify(message))
      await this.handleIncomingMessage(message);
    });

    // Disconnessione
    this.client.on('disconnected', (reason) => {
      console.log('❌ WhatsApp Web disconnesso:', reason);
      this.isConnected = false;
      this.isAuthenticated = false;
    });

    // Errore di autenticazione
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Autenticazione WhatsApp fallita:', msg);
      this.isAuthenticated = false;
    });
  }

  // Log informazioni sui gruppi
  async logGroupsInfo() {
    try {
      const chats = await this.client.getChats();
      const groups = chats.filter(chat => chat.isGroup);
      
      console.log(`📋 Trovati ${groups.length} gruppi WhatsApp`);
      
      if (this.listenToAllGroups) {
        console.log('🔊 Ascoltando TUTTI i gruppi');
        groups.forEach(group => {
          console.log(`  - ${group.name} (${group.id._serialized})`);
        });
      } else if (this.groupsList.length > 0) {
        console.log('🔊 Ascoltando gruppi specifici:');
        this.groupsList.forEach(groupName => {
          const group = groups.find(g => g.name === groupName);
          if (group) {
            console.log(`  ✅ ${groupName} (${group.id._serialized})`);
          } else {
            console.log(`  ❌ ${groupName} (non trovato)`);
          }
        });
      }
    } catch (error) {
      console.error('❌ Errore nel recupero informazioni gruppi:', error);
    }
  }

  // Gestisce i messaggi in arrivo
  async handleIncomingMessage(message) {
    try {
      // Controlla se è un messaggio da gruppo
      const isGroupMessage = message.
      from.includes('@g.us');
      
      await this.handleGroupMessage(message);

    } catch (error) {
      console.error('❌ Errore gestione messaggio:', error);
    }
  }

  // Gestisce messaggi da gruppi
  async handleGroupMessage(message) {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Controlla se dobbiamo ascoltare questo gruppo
      if (!this.shouldListenToGroup(chat.name)) {
        return;
      }

      console.log(`📨 Messaggio da "${chat.name}" da ${contact.name || contact.number}`);

      // Converte il messaggio nel formato standard
      const standardMessage = await this.convertToStandardMessage(message, chat, contact);
      
      // Processa il messaggio tramite i filtri
      await this.processMessage(standardMessage);
      
    } catch (error) {
      console.error('❌ Errore gestione messaggio gruppo:', error);
    }
  }

  // Controlla se dobbiamo ascoltare questo gruppo
  shouldListenToGroup(groupName) {
    if (this.listenToAllGroups) {
      return true;
    }
    
    return this.groupsList.includes(groupName);
  }

  // Converte messaggio WhatsApp Web in formato standard (usa il converter)
  async convertToStandardMessage(message, chat, contact) {
    return await MessageConverter.convertWhatsAppWebMessage(message, chat, contact);
  }

  // Processa il messaggio tramite i filtri (unificato con il sistema esistente)
  async processMessage(messageData) {
    try {
      // Normalizza il messaggio per il processing
      const normalizedMessage = MessageConverter.normalizeMessage(messageData);
      
      // Valida il messaggio
      if (!MessageConverter.validateMessage(normalizedMessage)) {
        console.error('❌ Messaggio non valido, saltando processamento');
        return;
      }

      const groupName = messageData.metadata?.groupInfo?.name || 'Sconosciuto';
      console.log(`🔍 Processando messaggio da gruppo "${groupName}" da ${normalizedMessage.from.name}`);
      
      // Salva il messaggio nel database per compatibilità con executeFilterActions
      const message = new Message(normalizedMessage);
      await message.save();
      console.log('💾 Messaggio da gruppo salvato nel database');
      
      // Applica i filtri usando il sistema unificato
      const FilterService = filterServiceModule.FilterService;
      const filterResults = await FilterService.applyFilters(normalizedMessage);
      
      if (filterResults.length > 0) {
        console.log(`✅ Messaggio matcha ${filterResults.length} filtro/i`);
        
        // Esegui le azioni dei filtri usando il sistema unificato
        // Passa l'oggetto Message del database per compatibilità
        await FilterService.executeFilterActions(message, filterResults);
        
        console.log('✅ Azioni filtri completate');
      } else {
        console.log('ℹ️ Messaggio non matcha nessun filtro');
        // Marca come processato se non matcha filtri
        await message.markAsProcessed();
      }
      
    } catch (error) {
      console.error('❌ Errore processamento messaggio:', error);
    }
  }

  // Ottiene informazioni sui gruppi
  async getGroupsInfo() {
    if (!this.isAuthenticated) {
      throw new Error('WhatsApp Web non autenticato');
    }

    try {
      const chats = await this.client.getChats();
      const groups = chats.filter(chat => chat.isGroup);
      
      return groups.map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants.length,
        isWatched: this.shouldListenToGroup(group.name)
      }));
    } catch (error) {
      console.error('❌ Errore recupero info gruppi:', error);
      throw error;
    }
  }

  // Invia messaggio a un gruppo
  async sendMessageToGroup(groupName, message) {
    if (!this.isAuthenticated) {
      throw new Error('WhatsApp Web non autenticato');
    }

    try {
      const chats = await this.client.getChats();
      const group = chats.find(chat => chat.isGroup && chat.name === groupName);
      
      if (!group) {
        throw new Error(`Gruppo "${groupName}" non trovato`);
      }

      await group.sendMessage(message);
      console.log(`📤 Messaggio inviato al gruppo "${groupName}"`);
      
    } catch (error) {
      console.error('❌ Errore invio messaggio gruppo:', error);
      throw error;
    }
  }

  // Invia messaggio a un numero di telefono specifico
  async sendMessageToNumber(phoneNumber, message) {
    if (!this.isAuthenticated) {
      throw new Error('WhatsApp Web non autenticato');
    }

    try {
      // Formatta il numero di telefono usando la funzione dedicata
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);
      
      // Formatta il numero di telefono per WhatsApp
      const formattedNumber = cleanPhoneNumber.includes('@c.us') ? cleanPhoneNumber : `${cleanPhoneNumber}@c.us`;
      
      console.log(`📤 Tentativo invio messaggio a: ${formattedNumber}`);
      await this.client.sendMessage(formattedNumber, message);
      console.log(`✅ Messaggio inviato al numero "${cleanPhoneNumber}"`);
      
    } catch (error) {
      console.error('❌ Errore invio messaggio al numero:', error);
      throw error;
    }
  }

  // Builder centralizzato per messaggi inoltrati (simile a whatsappService)
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

  // Inoltra messaggio a un numero specifico
  async forwardText(originalMessage, toPhoneNumber, filterName = null) {
    const messageBody = this.buildForwardMessage(originalMessage, filterName);
    return this.sendMessageToNumber(toPhoneNumber, messageBody);
  }

  // Invia messaggio nella chat separata con formattazione migliorata
  async sendToSeparateChat(originalMessage, filterName = 'Filtro') {
    const separateChatNumber = process.env.FORWARD_SEPARATE_CHAT_NUMBER;
    
    if (!separateChatNumber) {
      throw new Error('FORWARD_SEPARATE_CHAT_NUMBER non configurato');
    }

    console.log(`📤 Invio messaggio filtrato a ${separateChatNumber} via WhatsApp Web`);
    
    return this.forwardText(originalMessage, separateChatNumber, filterName);
  }

  // Disconnette il client
  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isConnected = false;
      this.isAuthenticated = false;
      console.log('🔌 WhatsApp Web disconnesso');
    }
  }

  // Stato del servizio
  getStatus() {
    return {
      enabled: this.groupsEnabled,
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      groupsList: this.groupsList,
      listenToAllGroups: this.listenToAllGroups
    };
  }
}

module.exports = new WhatsappWebService();
