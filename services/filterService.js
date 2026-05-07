const Filter = require('../models/Filter');
const Message = require('../models/Message');
const moment = require('moment');
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
            messageData.from.phoneNumber.includes(author.phoneNumber)
        );
        if (!authorMatch) return false;
      }

      if (filter.sourceGroups && filter.sourceGroups.length > 0) {
        const sourceGroupsMatch = filter.sourceGroups.some(sourceGroups =>
            messageData.metadata.groupInfo.name === sourceGroups
        );
        if (!sourceGroupsMatch) return false;
      }

      // Controllo parole chiave
      if (filter.keywords && filter.keywords.length > 0 && messageData.content.text) {
        const text = messageData.content.text.toLowerCase();
        const keywordMatchMode = filter.keywordMatchMode || 'OR'; // Default OR se non specificato
        
        let keywordMatch;
        if (keywordMatchMode === 'AND') {
          // AND: tutte le keywords devono essere presenti
          keywordMatch = filter.keywords.every(keyword =>
            text.includes(keyword.toLowerCase())
          );
        } else {
          // OR: almeno una keyword deve essere presente (default)
          keywordMatch = filter.keywords.some(keyword =>
            text.includes(keyword.toLowerCase())
          );
        }
        
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

      // Controllo unicità messaggi (uniqueText)
      if (filter.uniqueText && filter.uniqueText.enabled) {
        // Verifica che messageData.content esista e che text sia una stringa valida
        // Gestisce null, undefined, stringa vuota e stringhe con solo spazi
        const hasValidText = messageData?.content?.text && 
                             typeof messageData.content.text === 'string' && 
                             messageData.content.text.trim().length > 0;
        
        // Se il testo non è valido, salta il controllo di unicità
        // (considera il messaggio come valido per non bloccare messaggi senza testo)
        if (!hasValidText) {
          console.log('ℹ️ Messaggio senza testo valido, controllo unicità saltato');
          return false;
          // Continua con il resto del filtro (non bloccare il messaggio)
        } else {
          // Il testo è valido, controlla l'unicità
          const isUnique = await this.checkMessageUniqueness(messageData, filter);
          
          if (!isUnique) {
            console.log(`⚠️ Messaggio duplicato rilevato - tag: ${filter.uniqueText.tag || 'N/A'}`);
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

  // Verifica se un messaggio è unico nel time window configurato
  async checkMessageUniqueness(messageData, filter) {
    try {
      if (!filter.uniqueText || !filter.uniqueText.enabled) {
        return true; // Se non abilitato, considera sempre unico
      }

      const tag = filter.uniqueText.tag;
      const timeWindowSeconds = filter.uniqueText.timeWindowSeconds || 60;


      // Calcola il timestamp di inizio del time window
      const messageTimestamp = new Date(messageData.timestamp);
      const timeWindowStart = new Date(messageTimestamp.getTime() - timeWindowSeconds * 1000);

      // Costruisci dinamicamente il filtro
      const query = {
        'content.text': messageData.content.text,
        timestamp: {
          $gte: timeWindowStart.toISOString(),
          $lte: messageTimestamp.toISOString()
        }
      };

      // Se il tag è valorizzato aggiungilo al filtro
      if (tag) {
        query['metadata.tags'] = tag;
      }

      const duplicateMessages = await Message.find(query).limit(2);

      // Se esiste almeno un messaggio con lo stesso tag e testo nel time window, il messaggio non è unico
      const isUnique = duplicateMessages.length == 1;

      if (!isUnique) {
        console.log(`📋 Messaggio duplicato trovato: tag="${tag}", testo="${messageData.content.text?.substring(0, 50)}...", timeWindow=${timeWindowSeconds}s, trovati ${duplicateMessages.length} messaggi`);
      }

      return isUnique;

    } catch (error) {
      console.error('Error checking message uniqueness:', error);
      return true; // In caso di errore, considera il messaggio come unico per non bloccare il flusso
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
      // I numeri vengono recuperati dall'environment invece di essere cablati nel codice
      if (actions.forwardTo && actions.forwardTo.length > 0) {
        // Recupera i numeri dall'environment (separati da virgola)
        const forwardNumbersEnv = process.env.FORWARD_TO_NUMBERS;
        let phonesToForward = [];
        
        if (forwardNumbersEnv) {
          // Parsing della lista di numeri dall'environment
          phonesToForward = forwardNumbersEnv
            .split(',')
            .map(phone => phone.trim())
            .filter(phone => phone.length > 0);
        }
        
        // Se non ci sono numeri nell'environment, usa quelli dal filtro come fallback
        if (phonesToForward.length === 0) {
          phonesToForward = actions.forwardTo;
        }
        
        // Inoltra ai numeri configurati
        for (const phone of phonesToForward) {
          try {
            await whatsappService.forwardText(message, phone, result.filterName);
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
      // I numeri vengono recuperati dall'environment invece di essere cablati nel codice
      if (actions.forwardTo && actions.forwardTo.length > 0) {
        // Recupera i numeri dall'environment (separati da virgola)
        const forwardNumbersEnv = process.env.FORWARD_TO_NUMBERS;
        let phonesToForward = [];
        
        if (forwardNumbersEnv) {
          // Parsing della lista di numeri dall'environment
          phonesToForward = forwardNumbersEnv
            .split(',')
            .map(phone => phone.trim())
            .filter(phone => phone.length > 0);
        }
        
        // Se non ci sono numeri nell'environment, usa quelli dal filtro come fallback
        if (phonesToForward.length === 0) {
          phonesToForward = actions.forwardTo;
          console.log('⚠️ FORWARD_TO_NUMBERS non configurato, uso numeri dal filtro');
        }
        
        // Inoltra ai numeri configurati
        for (const phone of phonesToForward) {
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
      await Filter.findByIdAndUpdate(filterId, { enabled: false }, { new: true });
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
      // Formati supportati:
      // 1) "update filter <filter_name> <field> <value>"
      // 2) "update filter <filter_name> sourcegroups add <value>"
      // 3) "update filter <filter_name> sourcegroups remove <value>"
      const updatePattern = /update\s+filter\s+(.+?)\s+([^\s]+)(?:\s+(add|remove))?\s+(.+)/i;
      const match = messageText.match(updatePattern);
      
      if (!match) {
        return null;
      }

      let [, filterName, field, operation, value] = match;
      
      // Pulisce i valori
      filterName = filterName.trim();
      field = field.trim().toLowerCase();
      operation = operation ? operation.trim().toLowerCase() : null;
      value = value.trim();

      return {
        filterName: filterName,
        field: field,
        operation: operation,
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

      // Comando help generale
      if (text === 'help') {
        return await this.sendGeneralHelp(messageData.from.phoneNumber, whatsappWebService);
      }

      // Comando help filtri
      if (text.includes('help filters')) {
        return await this.sendFilterHelp(messageData.from.phoneNumber, whatsappWebService);
      }

      // Comando lista filtri
      if (text.includes('list filters') || text.includes('show filters')) {
        return await this.sendFilterList(messageData.from.phoneNumber, whatsappWebService);
      }

      // Comando dettaglio filtro singolo
      if (text.startsWith('get filter ') || (text.startsWith('show filter ') && !text.includes('show filters'))) {
        return await this.sendSingleFilterDetails(messageData, whatsappWebService);
      }

      // Comando aggiorna filtro
      if (text.includes('update filter')) {
        return await this.updateFilterByCommand(messageData, whatsappWebService);
      }

      return { success: false, message: 'Command not recognized. Use "help" to see available commands.' };

    } catch (error) {
      console.error('Error handling admin command:', error);
      return { success: false, message: 'Errore durante l\'esecuzione del comando' };
    }
  }

  // Invia help generale per tutti i comandi admin
  async sendGeneralHelp(phoneNumber, whatsappWebService) {
    const helpMessage = `🤖 **AVAILABLE ADMIN COMMANDS**

🔧 **General Commands:**
• \`help\` - Show this message
• \`help filters\` - Specific help for filters

📋 **Filter Management:**
• \`list filters\` or \`show filters\` - Show all active filters
• \`get filter <name>\` - Show one specific filter
• \`update filter <name> <field> <value>\` - Update a filter
• \`update filter <name> sourcegroups add <group>\` - Add one source group
• \`update filter <name> sourcegroups remove <group>\` - Remove one source group

**Available filter fields:**
• \`keywords\` - Keywords (JSON array or string)
• \`keywordmatchmode\` - Keyword matching mode (AND or OR)
• \`authors\` - Authors (JSON array or phone number)
• \`sourcegroups\` - Source groups (JSON array or string)
• \`messagetypes\` - Message types (JSON array)
• \`timewindowseconds\` - Unique text window in seconds (number)
• \`forwardTo\` - Forward destination numbers (JSON array or string)
• \`priority\` - Priority (urgent, high, normal, low)
• \`important\` - Mark as important (true/false)
• \`archive\` - Archive (true/false)
• \`active\` - Active status (true/false)

**Command examples:**
\`get filter Urgent Messages\`
\`update filter Urgent Messages sourcegroups ["Gruppo A","Gruppo B"]\`
\`update filter Urgent Messages sourcegroups add "Gruppo C"\`
\`update filter Urgent Messages sourcegroups remove "Gruppo A"\`
\`update filter Urgent Messages timewindowseconds 120\`
\`update filter Urgent Messages forwardTo ["+393331112233","+393339998877"]\`
\`update filter Urgent Messages forwardTo add "+393331112233"\`
\`update filter Urgent Messages forwardTo remove "+393331112233"\`
\`update filter Urgent Messages keywords ["urgent","emergency"]\`
\`update filter Urgent Messages keywordmatchmode AND\`
\`update filter Urgent Messages priority urgent\`
\`update filter Urgent Messages active false\`

💡 **Tips:**
- Use \`help filters\` for detailed filter information
- Commands are case-insensitive
- JSON arrays must use double quotes: ["value1","value2"]`;

    if (whatsappWebService && whatsappWebService.isAuthenticated) {
      try {
        await whatsappWebService.sendMessageToNumber(phoneNumber, helpMessage);
        return { success: true, message: 'Help generale inviato' };
      } catch (sendError) {
        console.error('Error sending general help:', sendError);
        return { success: false, message: 'Errore invio help generale' };
      }
    }

    return { success: true, message: helpMessage };
  }

  // Invia help per i comandi filtri
  async sendFilterHelp(phoneNumber, whatsappWebService) {
    const helpMessage = `🔧 **FILTER COMMANDS:**

📋 **List filters:**
\`list filters\` or \`show filters\`

🔎 **Get one filter:**
\`get filter <name>\` (or \`show filter <name>\`)

📝 **Update filter:**
\`update filter <name> <field> <value>\`
\`update filter <name> sourcegroups add <group>\`
\`update filter <name> sourcegroups remove <group>\`

**Available fields:**
• \`keywords\` - Keywords (JSON array or string)
• \`keywordmatchmode\` - Keyword matching mode (AND or OR)
• \`authors\` - Authors (JSON array or phone number)
• \`sourcegroups\` - Source groups (JSON array or string)
• \`messagetypes\` - Message types (JSON array)
• \`timewindowseconds\` - Unique text window in seconds (number)
• \`forwardTo\` - Forward destination numbers (JSON array or string)
• \`priority\` - Priority (urgent, high, normal, low)
• \`important\` - Mark as important (true/false)
• \`archive\` - Archive (true/false)
• \`active\` - Active status (true/false)

**Examples:**
\`get filter Urgent Messages\`
\`update filter Urgent Messages sourcegroups ["Gruppo A","Gruppo B"]\`
\`update filter Urgent Messages sourcegroups add "Gruppo C"\`
\`update filter Urgent Messages sourcegroups remove "Gruppo A"\`
\`update filter Urgent Messages timewindowseconds 120\`
\`update filter Urgent Messages forwardTo ["+393331112233","+393339998877"]\`
\`update filter Urgent Messages forwardTo add "+393331112233"\`
\`update filter Urgent Messages forwardTo remove "+393331112233"\`
\`update filter Urgent Messages keywords ["urgent","emergency"]\`
\`update filter Urgent Messages keywordmatchmode AND\`
\`update filter Urgent Messages priority urgent\`
\`update filter Urgent Messages active false\``;

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
      const filters = await Filter.find({ enabled: true });
      
      let listMessage = `📋 **ACTIVE FILTERS (${filters.length}):**\n\n`;
      
      filters.forEach((filter, index) => {
        listMessage += `**${index + 1}. ${filter.name}**\n`;
        listMessage += `   📝 ${filter.description || 'No description'}\n`;
        
        if (filter.keywords && filter.keywords.length > 0) {
          const matchMode = filter.keywordMatchMode || 'OR';
          listMessage += `   🔍 Keywords: ${filter.keywords.join(', ')} (${matchMode})\n`;
        }
        
        if (filter.authors && filter.authors.length > 0) {
          const authors = filter.authors.map(a => a.phoneNumber || a.name).join(', ');
          listMessage += `   👤 Authors: ${authors}\n`;
        }
        
        listMessage += `   ⚡ Active: ${filter.enabled ? 'Yes' : 'No'}\n\n`;
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

  // Invia dettaglio di un filtro specifico
  async sendSingleFilterDetails(messageData, whatsappWebService) {
    try {
      const rawText = (messageData.content?.text || '').trim();
      const match = rawText.match(/^(?:get|show)\s+filter\s+(.+)$/i);

      if (!match || !match[1]) {
        return { success: false, message: 'Invalid command format. Use: "get filter <name>"' };
      }

      const filterName = match[1].trim();
      const filter = await Filter.findOne({ name: filterName });

      if (!filter) {
        return { success: false, message: `Filter "${filterName}" not found` };
      }

      const filterJson = JSON.stringify(filter.toObject(), null, 2);

      const details = [
        `🔎 **FILTER DETAILS: ${filter.name}**`,
        '',
        `📝 Description: ${filter.description || 'No description'}`,
        `⚡ Enabled: ${filter.enabled ? 'Yes' : 'No'}`,
        `🔍 Keywords: ${filter.keywords && filter.keywords.length > 0 ? filter.keywords.join(', ') : 'None'}`,
        `🧩 Keyword mode: ${filter.keywordMatchMode || 'OR'}`,
        `👤 Authors: ${filter.authors && filter.authors.length > 0 ? filter.authors.map(a => a.phoneNumber || a.name).join(', ') : 'None'}`,
        `💬 Message types: ${filter.messageTypes && filter.messageTypes.length > 0 ? filter.messageTypes.join(', ') : 'None'}`,
        `🏷️ Priority action: ${filter.actions?.setPriority || 'None'}`,
        `⭐ Mark important: ${filter.actions?.markAsImportant ? 'Yes' : 'No'}`,
        `🗃️ Archive: ${filter.actions?.archive ? 'Yes' : 'No'}`,
        '',
        '🧾 Full JSON:',
        '```json',
        filterJson,
        '```'
      ].join('\n');

      if (whatsappWebService && whatsappWebService.isAuthenticated) {
        try {
          await whatsappWebService.sendMessageToNumber(messageData.from.phoneNumber, details);
          return { success: true, message: `Dettaglio filtro "${filterName}" inviato` };
        } catch (sendError) {
          console.error('Error sending single filter details:', sendError);
          return { success: false, message: 'Errore invio dettaglio filtro' };
        }
      }

      return { success: true, message: details };
    } catch (error) {
      console.error('Error getting single filter details:', error);
      return { success: false, message: 'Errore recupero dettaglio filtro' };
    }
  }

  // Aggiorna un filtro tramite comando
  async updateFilterByCommand(messageData, whatsappWebService = null) {
    try {
      // Parsifica il comando
      const command = this.parseFilterUpdateCommand(messageData.content.text);
      if (!command) {
        return { success: false, message: 'Invalid command format. Use: "update filter <name> <field> <value>"' };
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
        return { success: false, message: `Filter "${command.filterName}" not found` };
      }

      // Aggiorna il campo specificato
      let updateResult = await this.updateFilterField(filter._id, command.field, command.value, command.operation);
      
      if (updateResult.success) {
        // Invia conferma all'admin
        if (whatsappWebService && whatsappWebService.isAuthenticated) {
          const confirmMessage = `✅ Filter "${command.filterName}" updated!\n` +
                               `Field: ${command.field}\n` +
                               `Operation: ${command.operation || 'set'}\n` +
                               `New value: ${command.value}`;
          
          try {
            await whatsappWebService.sendMessageToNumber(messageData.from.phoneNumber, confirmMessage);
          } catch (sendError) {
            console.error('Error sending confirmation:', sendError);
          }
        }
        
        return { success: true, message: `Filter "${command.filterName}" updated successfully` };
      } else {
        return updateResult;
      }

    } catch (error) {
      console.error('Error updating filter by command:', error);
      return { success: false, message: 'Errore durante l\'aggiornamento del filtro' };
    }
  }

  // Aggiorna un campo specifico di un filtro
  async updateFilterField(filterId, field, value, operation = null) {
    try {
      const filter = await Filter.findById(filterId);
      if (!filter) {
        return { success: false, message: 'Filter not found' };
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

        case 'sourcegroups':
          try {
            const normalizedValue = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            const existingGroups = Array.isArray(filter.sourceGroups) ? [...filter.sourceGroups] : [];

            if (operation === 'add') {
              if (!existingGroups.includes(normalizedValue)) {
                existingGroups.push(normalizedValue);
              }
              updateData.sourceGroups = existingGroups;
            } else if (operation === 'remove') {
              updateData.sourceGroups = existingGroups.filter(group => group !== normalizedValue);
            } else {
              // Se inizia con [ e finisce con ], è un array JSON
              if (value.startsWith('[') && value.endsWith(']')) {
                value = value.replace(/[“”]/g, '"');
                const groups = JSON.parse(value);
                if (Array.isArray(groups)) {
                  updateData.sourceGroups = groups;
                } else {
                  updateData.sourceGroups = [value];
                }
              } else {
                // Se non è un array JSON, tratta come stringa singola
                updateData.sourceGroups = [normalizedValue];
              }
            }
          } catch (parseError) {
            console.log('⚠️ Errore parsing sourcegroups, usando come stringa singola:', parseError.message);
            const fallbackValue = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            if (operation === 'add') {
              const existingGroups = Array.isArray(filter.sourceGroups) ? [...filter.sourceGroups] : [];
              if (!existingGroups.includes(fallbackValue)) {
                existingGroups.push(fallbackValue);
              }
              updateData.sourceGroups = existingGroups;
            } else if (operation === 'remove') {
              const existingGroups = Array.isArray(filter.sourceGroups) ? [...filter.sourceGroups] : [];
              updateData.sourceGroups = existingGroups.filter(group => group !== fallbackValue);
            } else {
              updateData.sourceGroups = [fallbackValue];
            }
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
          updateData.enabled = value.toLowerCase() === 'true';
          break;
          
        case 'keywordmatchmode':
          const mode = value.toUpperCase();
          if (mode === 'AND' || mode === 'OR') {
            updateData.keywordMatchMode = mode;
          } else {
            return { success: false, message: `Mode "${value}" is invalid. Use "AND" or "OR"` };
          }
          break;

        case 'timewindowseconds':
          {
            const parsedValue = parseInt(value, 10);
            if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
              return { success: false, message: `Value "${value}" is invalid. Use a positive integer (seconds)` };
            }
            updateData['uniqueText.timeWindowSeconds'] = parsedValue;
          }
          break;

        case 'forwardto':
          try {
            const normalizedValue = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            const existingForwardTo = Array.isArray(filter.actions?.forwardTo) ? [...filter.actions.forwardTo] : [];

            if (operation === 'add') {
              if (!existingForwardTo.includes(normalizedValue)) {
                existingForwardTo.push(normalizedValue);
              }
              updateData['actions.forwardTo'] = existingForwardTo;
            } else if (operation === 'remove') {
              updateData['actions.forwardTo'] = existingForwardTo.filter(number => number !== normalizedValue);
            } else if (value.startsWith('[') && value.endsWith(']')) {
              value = value.replace(/[“”]/g, '"');
              const numbers = JSON.parse(value);
              if (Array.isArray(numbers)) {
                updateData['actions.forwardTo'] = numbers;
              } else {
                updateData['actions.forwardTo'] = [normalizedValue];
              }
            } else {
              updateData['actions.forwardTo'] = [normalizedValue];
            }
          } catch (parseError) {
            console.log('⚠️ Errore parsing forwardto, usando come stringa singola:', parseError.message);
            const fallbackValue = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            updateData['actions.forwardTo'] = [fallbackValue];
          }
          break;
          
        default:
          return { success: false, message: `Field "${field}" not recognized` };
      }

      await Filter.findByIdAndUpdate(filterId, updateData, { new: true });
      await this.loadFilters(); // Ricarica filtri
      
      return { success: true, message: `Field "${field}" updated` };
      
    } catch (error) {
      console.error('Error updating filter field:', error);
      return { success: false, message: 'Error updating field' };
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
          },
          {
            name: '',
            description: 'Inoltra automaticamente tutti i messaggi ricevuti',
            actions: {
              addTags: ['inoltro-automatico']
            }
          }
        ];
      }
    } else {
      console.log('⚠️ DEFAULT_FILTERS non configurato nel .env, usando filtri predefiniti hardcoded');
      
      // Filtri predefiniti hardcoded
      defaultFilters = [
        {
          name: 'forward',
          description: 'i nuovi messaggi  vengono inoltrati in un numero separato, con: sourceGroups è possibile specificare quali gruppi o numeri attenzionare',
          authors: [],
          sourceGroups: ['NLF Lì-gue'],
          actions: {
            addTags: ['Messagio non duplicato']
          },
          timeWindowSeconds: 10,
          enabled: true,
          uniqueText: {
            enabled: true
          },
          actions: {
            forwardTo: ['+393476835437'],
          }

        }
      ];
    }

    // Crea i filtri se non esistono
    const USE_MEMORY_STORAGE = process.env.USE_MEMORY_STORAGE === 'true';
    
    for (const filterData of defaultFilters) {
      const existingFilter = await Filter.findOne({ name: filterData.name });
      if (!existingFilter) {
        // In modalità memoria, Filter è una funzione async che restituisce un proxy con save()
        // In modalità database, Filter è un costruttore Mongoose
        let filter;
        if (USE_MEMORY_STORAGE) {
          filter = await Filter(filterData);
        } else {
          filter = new Filter(filterData);
        }
        await filter.save();
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

