const Filter = require('../models/Filter');
const Message = require('../models/Message');
const moment = require('moment');
const whatsappService = require('./whatsappService');
const MessageConverter = require('./messageConverter');

class FilterService {
  constructor() {
    this.filters = [];
    this.loadFilters();
  }

  // Carica tutti i filtri attivi
  async loadFilters() {
    try {
      this.filters = await Filter.getActiveFilters();
      console.log(`🔍 Loaded ${this.filters.length} active filters`);
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  }

  // Applica tutti i filtri a un messaggio
  async applyFilters(messageData) {
    const results = [];
    await this.loadFilters()
    for (const filter of this.filters) {
      const match = await this.checkFilterMatch(messageData, filter);
      if (match) {
        results.push({
          filterId: filter._id,
          filterName: filter.name,
          actions: filter.actions
        });
        
        // Incrementa contatore match
        await filter.incrementMatches();
      }
    }
    
    return results;
  }

  // Verifica se un messaggio matcha un filtro specifico
  async checkFilterMatch(messageData, filter) {
    try {
      // Controllo autore
      if (filter.authors && filter.authors.length > 0) {
        const authorMatch = filter.authors.some(author => 
          author.phoneNumber === messageData.from.phoneNumber ||
          author.name === messageData.from.name
        );
        if (!authorMatch) return false;
      }

      // Controllo parole chiave
      if (filter.keywords && filter.keywords.length > 0 && messageData.content.text) {
        const text = messageData.content.text.toLowerCase();
        const keywordMatch = filter.keywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
        if (!keywordMatch) return false;
      }

      // Controllo tipo messaggio
      if (filter.messageTypes && filter.messageTypes.length > 0) {
        const typeMatch = filter.messageTypes.includes(messageData.content.type);
        if (!typeMatch) return false;
      }

      // Controllo fascia oraria
      if (filter.timeRange) {
        const messageTime = moment(messageData.timestamp);
        const currentTime = messageTime.format('HH:mm');
        const dayOfWeek = messageTime.day();
        
        // Controllo orario
        if (filter.timeRange.start && filter.timeRange.end) {
          if (currentTime < filter.timeRange.start || currentTime > filter.timeRange.end) {
            return false;
          }
        }
        
        // Controllo giorni della settimana
        if (filter.timeRange.days && filter.timeRange.days.length > 0) {
          if (!filter.timeRange.days.includes(dayOfWeek)) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking filter match:', error);
      return false;
    }
  }

  // Esegue le azioni di un filtro su un messaggio
  async executeFilterActions(message, filterResults) {
    for (const result of filterResults) {
      const actions = result.actions;
      
      try {
        // Marca come importante
        if (actions.markAsImportant) {
          message.metadata.isImportant = true;
        }

        // Imposta priorità
        if (actions.setPriority) {
          message.metadata.priority = actions.setPriority;
        }

        // Aggiungi tag
        if (actions.addTags && actions.addTags.length > 0) {
          for (const tag of actions.addTags) {
            //await message.addTag(tag);
          }
        }

        // Archivia
        if (actions.archive) {
          message.status = 'archived';
          MessageConverter.markAsModified(message);
        }

        // Salva il messaggio (Mongoose gestisce automaticamente le modifiche)
        try {
          await message.save();
        } catch (error) {
          // Se è un errore di salvataggio parallelo, ignora
          if (error.name === 'ParallelSaveError') {
            console.log('ℹ️ Messaggio già salvato, saltando salvataggio parallelo');
          } else {
            throw error;
          }
        }
        
        // Auto-reply (da implementare con WhatsApp API)
        if (actions.autoReply && actions.autoReply.enabled) {
          await this.sendAutoReply(message, actions.autoReply.message);
        }

        // Forward via WhatsApp Business
        if (process.env.FORWARD_ENABLE_WHATSAPP_CLOUD_API === 'true') {
          await this.manageForwardWithCloudApi(message, result, actions);
        }

        // Forward via WhatsAppWeb-ts
        if (process.env.FORWARD_ENABLE_WHATSAPPWEBJS === 'true') {
          // implmementami la stessa gesione ma cutilizzando l'invio tramite whatsappWbbService
          await this.manageForwardWithWhatsappWebJs(message, result, actions);
        }



      } catch (error) {
        console.error('Error executing filter actions:', error);
      }
    }
  }

  async manageForwardWithCloudApi(message, result, actions) {
    try {
      // Se la chat separata è abilitata, invia lì
      if (process.env.FORWARD_SEPARATE_CHAT === 'true') {
        await whatsappService.sendToSeparateChat(message, result.filterName);
        console.log(`📤 Sent to separate chat via filter: ${result.filterName}`);
      }
      // Altrimenti usa il sistema legacy di forwardTo (senza duplicare se chat separata è attiva)
      if (actions.forwardTo && actions.forwardTo.length > 0) {
        for (const phone of actions.forwardTo) {
          try {
            await whatsappService.forwardText(message, phone,
                result.filterName);
            console.log(`📤 Forwarded via WhatsApp to ${phone}`);
          } catch (fwdErr) {
            console.error('Error forwarding via WhatsApp:',
                fwdErr?.response?.data || fwdErr.message);
          }
        }
      }
    } catch (fwdErr) {
      console.error('Error forwarding via WhatsApp:',
          fwdErr?.response?.data || fwdErr.message);
    }
  }

  async manageForwardWithWhatsappWebJs(message, result, actions, whatsappWebService = null) {
    try {
      // Se il servizio non è passato come parametro, prova a importarlo dinamicamente
      if (!whatsappWebService) {
        try {
          whatsappWebService = require('./whatsappWebService');
        } catch (importError) {
          console.log('⚠️ Impossibile importare whatsappWebService:', importError.message);
          return;
        }
      }

      // Controlla se WhatsApp Web è autenticato
      if (!whatsappWebService.isAuthenticated) {
        console.log('⚠️ WhatsApp Web non autenticato, saltando forward via WhatsAppWeb');
        return;
      }

      // Se la chat separata è abilitata, invia lì
      if (process.env.FORWARD_SEPARATE_CHAT === 'true') {
        await whatsappWebService.sendToSeparateChat(message, result.filterName);
        console.log(`📤 Sent to separate chat via WhatsApp Web filter: ${result.filterName}`);
      }
      
      // Altrimenti usa il sistema legacy di forwardTo (senza duplicare se chat separata è attiva)
      if (actions.forwardTo && actions.forwardTo.length > 0) {
        for (const phone of actions.forwardTo) {
          try {
            await whatsappWebService.forwardText(message, phone, result.filterName);
            console.log(`📤 Forwarded via WhatsApp Web to ${phone}`);
          } catch (fwdErr) {
            console.error('Error forwarding via WhatsApp Web:', fwdErr.message);
          }
        }
      }
    } catch (fwdErr) {
      console.error('Error forwarding via WhatsApp Web:', fwdErr.message);
    }
  }

// Invia auto-reply
  async sendAutoReply(message, replyText) {
    // TODO: Implementare invio risposta automatica tramite WhatsApp API
    console.log(`📤 Auto-reply to ${message.from.phoneNumber}: ${replyText}`);
  }

  // Inoltro legacy rimosso: usare whatsappService

  // Crea un nuovo filtro
  async createFilter(filterData) {
    try {
      const filter = new Filter(filterData);
      await filter.save();
      await this.loadFilters(); // Ricarica filtri
      return filter;
    } catch (error) {
      console.error('Error creating filter:', error);
      throw error;
    }
  }

  // Aggiorna un filtro
  async updateFilter(filterId, updateData) {
    try {
      const filter = await Filter.findByIdAndUpdate(filterId, updateData, { new: true });
      await this.loadFilters(); // Ricarica filtri
      return filter;
    } catch (error) {
      console.error('Error updating filter:', error);
      throw error;
    }
  }

  // Elimina un filtro
  async deleteFilter(filterId) {
    try {
      await Filter.findByIdAndDelete(filterId);
      await this.loadFilters(); // Ricarica filtri
    } catch (error) {
      console.error('Error deleting filter:', error);
      throw error;
    }
  }
}

// Setup filtri predefiniti
const setupFilters = async () => {
  try {
    let defaultFilters = [];
    
    // Leggi i filtri predefiniti dal file .env se disponibili
    if (process.env.DEFAULT_FILTERS) {
      try {
        defaultFilters = JSON.parse(process.env.DEFAULT_FILTERS);
        console.log(`📋 Caricati ${defaultFilters.length} filtri predefiniti dal file .env`);
      } catch (parseError) {
        console.error('❌ Errore nel parsing DEFAULT_FILTERS dal .env:', parseError.message);
        console.log('🔄 Usando filtri predefiniti hardcoded...');
        
        // Fallback ai filtri hardcoded se il parsing fallisce
        defaultFilters = [
          {
            name: 'Messaggi Urgenti',
            description: 'Filtra messaggi con parole chiave urgenti',
            keywords: ['urgente', 'emergenza', 'asap', 'subito'],
            actions: {
              markAsImportant: true,
              setPriority: 'urgent',
              addTags: ['urgente']
            }
          },
          {
            name: 'Messaggi di Lavoro',
            description: 'Filtra messaggi durante orario lavorativo',
            timeRange: {
              start: '09:00',
              end: '18:00',
              days: [1, 2, 3, 4, 5] // Lun-Ven
            },
            actions: {
              addTags: ['lavoro']
            }
          }
        ];
      }
    } else {
      console.log('⚠️ DEFAULT_FILTERS non configurato nel .env, usando filtri predefiniti hardcoded');
      
      // Filtri predefiniti hardcoded
      defaultFilters = [
        {
          name: 'Messaggi Urgenti',
          description: 'Filtra messaggi con parole chiave urgenti',
          keywords: ['urgente', 'emergenza', 'asap', 'subito'],
          actions: {
            markAsImportant: true,
            setPriority: 'urgent',
            addTags: ['urgente']
          }
        },
        {
          name: 'Messaggi di Lavoro',
          description: 'Filtra messaggi durante orario lavorativo',
          timeRange: {
            start: '09:00',
            end: '18:00',
            days: [1, 2, 3, 4, 5] // Lun-Ven
          },
          actions: {
            addTags: ['lavoro']
          }
        }
      ];
    }

    // Crea i filtri se non esistono
    for (const filterData of defaultFilters) {
      const existingFilter = await Filter.findOne({ name: filterData.name });
      if (!existingFilter) {
        await new Filter(filterData).save();
        console.log(`✅ Created default filter: ${filterData.name}`);
      } else {
        console.log(`ℹ️ Filter already exists: ${filterData.name}`);
      }
    }
    
    console.log(`🎯 Setup completato per ${defaultFilters.length} filtri predefiniti`);
  } catch (error) {
    console.error('Error setting up default filters:', error);
  }
};

module.exports = {
  FilterService: new FilterService(),
  setupFilters
};

