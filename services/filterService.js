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
            await message.addTag(tag);
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
      await Filter.findByIdAndUpdate(filterId, { isActive: false }, { new: true });
      await this.loadFilters(); // Ricarica filtri
    } catch (error) {
      console.error('Error deleting filter:', error);
      throw error;
    }
  }

  // Verifica se un numero è autorizzato come admin
  isAdmin(number) {
    const adminNumbers = process.env.ADMIN_PHONE_NUMBERS;
    if (!adminNumbers) return false;
    
    const adminList = adminNumbers.split(',').map(num => num.trim().replace(/[^\d]/g, ''));
    const cleanNumber = number.replace(/[^\d]/g, '');
    
    return adminList.includes(cleanNumber);
  }

  // Parsifica comando di aggiornamento filtro
  parseFilterUpdateCommand(messageText) {
    try {
      // Formato: "aggiorna filtro <nome_filtro> <campo> <valore>"
      // Usa un regex più robusto che gestisce spazi nel nome del filtro e valori complessi
      const updatePattern = /aggiorna\s+filtro\s+([^\s]+(?:\s+[^\s]+)*?)\s+([^\s]+)\s+(.+)/i;
      const match = messageText.match(updatePattern);
      
      if (!match) {
        return null;
      }

      let [, filterName, field, value] = match;
      
      // Pulisce i valori
      filterName = filterName.trim();
      field = field.trim().toLowerCase();
      value = value.trim();

      return {
        filterName: filterName,
        field: field,
        value: value,
        isValid: true
      };
    } catch (error) {
      console.error('Error parsing filter update command:', error);
      return null;
    }
  }




  // Gestisce comandi admin
  async handleAdminCommand(messageData, whatsappWebService = null) {
    try {
      // Verifica se il mittente è admin
      if (!this.isAdmin(messageData.from.phoneNumber)) {
        console.log(`⚠️ Tentativo comando admin da numero non autorizzato: ${messageData.from.phoneNumber}`);
        return { success: false, message: 'Non autorizzato a eseguire comandi admin' };
      }

      const text = messageData.content.text.toLowerCase().trim();

      // Comando help
      if (text.includes('help filtri') || text.includes('aiuto filtri')) {
        return await this.sendFilterHelp(messageData.from.phoneNumber, whatsappWebService);
      }

      // Comando lista filtri
      if (text.includes('lista filtri') || text.includes('list filtri')) {
        return await this.sendFilterList(messageData.from.phoneNumber, whatsappWebService);
      }

      // Comando aggiorna filtro
      if (text.includes('aggiorna filtro')) {
        return await this.updateFilterByCommand(messageData, whatsappWebService);
      }

      return { success: false, message: 'Comando non riconosciuto. Usa "help filtri" per vedere i comandi disponibili.' };

    } catch (error) {
      console.error('Error handling admin command:', error);
      return { success: false, message: 'Errore durante l\'esecuzione del comando' };
    }
  }

  // Invia help per i comandi filtri
  async sendFilterHelp(phoneNumber, whatsappWebService) {
    const helpMessage = `🔧 **COMANDI FILTRI DISPONIBILI:**

📋 **Lista filtri:**
\`lista filtri\`

📝 **Aggiorna filtro:**
\`aggiorna filtro <nome> <campo> <valore>\`

**Campi disponibili:**
• \`keywords\` - Parole chiave (array JSON o stringa)
• \`authors\` - Autori (array JSON o numero)
• \`messagetypes\` - Tipi messaggio (array JSON)
• \`priority\` - Priorità (urgent, high, normal, low)
• \`important\` - Marca importante (true/false)
• \`archive\` - Archivia (true/false)
• \`active\` - Attivo (true/false)

**Esempi:**
\`aggiorna filtro Messaggi Urgenti keywords ["urgente","emergenza"]\`
\`aggiorna filtro Messaggi Urgenti priority urgent\`
\`aggiorna filtro Messaggi Urgenti active false\``;

    if (whatsappWebService && whatsappWebService.isAuthenticated) {
      try {
        await whatsappWebService.sendMessageToNumber(phoneNumber, helpMessage);
        return { success: true, message: 'Help inviato' };
      } catch (sendError) {
        console.error('Error sending help:', sendError);
        return { success: false, message: 'Errore invio help' };
      }
    }

    return { success: true, message: helpMessage };
  }

  // Invia lista filtri
  async sendFilterList(phoneNumber, whatsappWebService) {
    try {
      const filters = await Filter.find({ isActive: true });
      
      let listMessage = `📋 **FILTRI ATTIVI (${filters.length}):**\n\n`;
      
      filters.forEach((filter, index) => {
        listMessage += `**${index + 1}. ${filter.name}**\n`;
        listMessage += `   📝 ${filter.description || 'Nessuna descrizione'}\n`;
        
        if (filter.keywords && filter.keywords.length > 0) {
          listMessage += `   🔍 Keywords: ${filter.keywords.join(', ')}\n`;
        }
        
        if (filter.authors && filter.authors.length > 0) {
          const authors = filter.authors.map(a => a.phoneNumber || a.name).join(', ');
          listMessage += `   👤 Autori: ${authors}\n`;
        }
        
        listMessage += `   ⚡ Attivo: ${filter.isActive ? 'Sì' : 'No'}\n\n`;
      });

      if (whatsappWebService && whatsappWebService.isAuthenticated) {
        try {
          await whatsappWebService.sendMessageToNumber(phoneNumber, listMessage);
          return { success: true, message: 'Lista filtri inviata' };
        } catch (sendError) {
          console.error('Error sending filter list:', sendError);
          return { success: false, message: 'Errore invio lista' };
        }
      }

      return { success: true, message: listMessage };

    } catch (error) {
      console.error('Error getting filter list:', error);
      return { success: false, message: 'Errore recupero lista filtri' };
    }
  }

  // Aggiorna un filtro tramite comando
  async updateFilterByCommand(messageData, whatsappWebService = null) {
    try {
      // Parsifica il comando
      const command = this.parseFilterUpdateCommand(messageData.content.text);
      if (!command) {
        return { success: false, message: 'Formato comando non valido. Usa: "aggiorna filtro <nome> <campo> <valore>"' };
      }

      // Debug: mostra cosa è stato parsato
      console.log('🔍 Comando parsato:', {
        filterName: command.filterName,
        field: command.field,
        value: command.value,
        originalText: messageData.content.text
      });

      // Trova il filtro
      const filter = await Filter.findOne({ name: command.filterName });
      if (!filter) {
        return { success: false, message: `Filtro "${command.filterName}" non trovato` };
      }

      // Aggiorna il campo specificato
      let updateResult = await this.updateFilterField(filter._id, command.field, command.value);
      
      if (updateResult.success) {
        // Invia conferma all'admin
        if (whatsappWebService && whatsappWebService.isAuthenticated) {
          const confirmMessage = `✅ Filtro "${command.filterName}" aggiornato!\n` +
                               `Campo: ${command.field}\n` +
                               `Nuovo valore: ${command.value}`;
          
          try {
            await whatsappWebService.sendMessageToNumber(messageData.from.phoneNumber, confirmMessage);
          } catch (sendError) {
            console.error('Error sending confirmation:', sendError);
          }
        }
        
        return { success: true, message: `Filtro "${command.filterName}" aggiornato con successo` };
      } else {
        return updateResult;
      }

    } catch (error) {
      console.error('Error updating filter by command:', error);
      return { success: false, message: 'Errore durante l\'aggiornamento del filtro' };
    }
  }

  // Aggiorna un campo specifico di un filtro
  async updateFilterField(filterId, field, value) {
    try {
      const filter = await Filter.findById(filterId);
      if (!filter) {
        return { success: false, message: 'Filtro non trovato' };
      }

      let updateData = {};
      
      // Mappa i campi ai percorsi corretti nel documento
      switch (field) {
        case 'keywords':
          try {
            // Se inizia con [ e finisce con ], è un array JSON
            if (value.startsWith('[') && value.endsWith(']')) {
              value = value.replace(/[“”]/g, '"');
              const keywords = JSON.parse(value);
              if (Array.isArray(keywords)) {
                updateData.keywords = keywords;
              } else {
                updateData.keywords = [value];
              }
            } else {
              // Se non è un array JSON, tratta come stringa singola
              updateData.keywords = [value];
            }
          } catch (parseError) {
            console.log('⚠️ Errore parsing keywords, usando come stringa singola:', parseError.message);
            // Se il parsing fallisce, tratta come stringa singola
            updateData.keywords = [value];
          }
          break;
          
        case 'authors':
          try {
            // Se inizia con [ e finisce con ], è un array JSON
            if (value.startsWith('[') && value.endsWith(']')) {
              const authors = JSON.parse(value);
              if (Array.isArray(authors)) {
                updateData.authors = authors;
              } else {
                updateData.authors = [{ phoneNumber: value }];
              }
            } else {
              // Se non è un array JSON, tratta come numero singolo
              updateData.authors = [{ phoneNumber: value }];
            }
          } catch (parseError) {
            console.log('⚠️ Errore parsing authors, usando come numero singolo:', parseError.message);
            updateData.authors = [{ phoneNumber: value }];
          }
          break;
          
        case 'messagetypes':
          try {
            // Se inizia con [ e finisce con ], è un array JSON
            if (value.startsWith('[') && value.endsWith(']')) {
              const types = JSON.parse(value);
              if (Array.isArray(types)) {
                updateData.messageTypes = types;
              } else {
                updateData.messageTypes = [value];
              }
            } else {
              // Se non è un array JSON, tratta come stringa singola
              updateData.messageTypes = [value];
            }
          } catch (parseError) {
            console.log('⚠️ Errore parsing messagetypes, usando come stringa singola:', parseError.message);
            updateData.messageTypes = [value];
          }
          break;
          
        case 'priority':
          updateData['actions.setPriority'] = value;
          break;
          
        case 'important':
          updateData['actions.markAsImportant'] = value.toLowerCase() === 'true';
          break;
          
        case 'archive':
          updateData['actions.archive'] = value.toLowerCase() === 'true';
          break;
          
        case 'active':
          updateData.isActive = value.toLowerCase() === 'true';
          break;
          
        default:
          return { success: false, message: `Campo "${field}" non riconosciuto` };
      }

      await Filter.findByIdAndUpdate(filterId, updateData, { new: true });
      await this.loadFilters(); // Ricarica filtri
      
      return { success: true, message: `Campo "${field}" aggiornato` };
      
    } catch (error) {
      console.error('Error updating filter field:', error);
      return { success: false, message: 'Errore durante l\'aggiornamento del campo' };
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

