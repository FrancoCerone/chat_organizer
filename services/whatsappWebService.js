const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const whatsappService = require('./whatsappService');
const { FilterService } = require('./filterService');
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
      
      if (isGroupMessage) {
        await this.handleGroupMessage(message);
      } else {
        // Messaggio privato - non gestito da questo servizio
        return;
      }
      
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

      console.log(`📨 Messaggio da gruppo "${chat.name}" da ${contact.name || contact.number}`);

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
