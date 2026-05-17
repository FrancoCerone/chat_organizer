/**
 * Memory Storage Service
 * Simula le operazioni del database MongoDB in memoria
 */

class MemoryStorage {
  constructor() {
    const parsedMaxMessages = Number.parseInt(process.env.MEMORY_MAX_MESSAGES || '1000', 10);
    this.maxMessages = Number.isNaN(parsedMaxMessages) || parsedMaxMessages < 1 ? 1000 : parsedMaxMessages;
    this.messages = new Map(); // messageId -> message
    this.filters = new Map(); // _id -> filter
    this.filterCounter = 0;
    this.messageCounter = 0;
  }

  // ============ MESSAGE OPERATIONS ============

  /**
   * Crea un nuovo messaggio in memoria
   */
  async createMessage(data) {
    const messageId = data.messageId || `msg_${Date.now()}_${++this.messageCounter}`;
    
    // Verifica unicità
    if (this.messages.has(messageId)) {
      const error = new Error('Duplicate messageId');
      error.name = 'MongoError';
      error.code = 11000;
      throw error;
    }

    const message = {
      _id: `msg_${Date.now()}_${++this.messageCounter}`,
      messageId: messageId,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: data.status || 'received',
      metadata: {
        ...data.metadata,
        isImportant: data.metadata?.isImportant ?? false,
        priority: data.metadata?.priority ?? 'medium',
        tags: data.metadata?.tags ?? [],
        notes: data.metadata?.notes ?? ''
      }
    };

    this.messages.set(messageId, message);
    this.enforceMessagesFifoLimit();
    return this.createMessageProxy(message);
  }

  /**
   * Mantiene il numero di messaggi entro il limite configurato (FIFO).
   */
  enforceMessagesFifoLimit() {
    while (this.messages.size > this.maxMessages) {
      const oldestMessageId = this.messages.keys().next().value;
      if (!oldestMessageId) {
        break;
      }
      this.messages.delete(oldestMessageId);
    }
  }

  /**
   * Trova messaggi con query
   */
  async findMessages(query = {}, options = {}) {
    let results = Array.from(this.messages.values());

    // Applica filtri
    if (query['content.text']) {
      results = results.filter(msg => 
        msg.content?.text === query['content.text']
      );
    }

    if (query.timestamp) {
      if (query.timestamp.$gte) {
        results = results.filter(msg => 
          new Date(msg.timestamp) >= new Date(query.timestamp.$gte)
        );
      }
      if (query.timestamp.$lte) {
        results = results.filter(msg => 
          new Date(msg.timestamp) <= new Date(query.timestamp.$lte)
        );
      }
    }

    if (query['metadata.tags']) {
      const tag = query['metadata.tags'];
      results = results.filter(msg => 
        msg.metadata?.tags?.includes(tag)
      );
    }

    // Ordina per timestamp decrescente
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Applica limit se specificato
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map(msg => this.createMessageProxy(msg));
  }

  /**
   * Trova un messaggio per ID
   */
  async findMessageById(id) {
    // Cerca per _id o messageId
    for (const [key, message] of this.messages.entries()) {
      if (message._id === id || message.messageId === id) {
        return this.createMessageProxy(message);
      }
    }
    return null;
  }

  /**
   * Trova un messaggio con query
   */
  async findOneMessage(query) {
    const results = await this.findMessages(query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Crea un proxy per il messaggio che simula i metodi Mongoose
   */
  createMessageProxy(message) {
    const self = this;
    return {
      ...message,
      async save() {
        message.updatedAt = new Date();
        self.messages.set(message.messageId, message);
        return this;
      },
      async markAsProcessed() {
        message.status = 'processed';
        message.updatedAt = new Date();
        self.messages.set(message.messageId, message);
        return this;
      },
      async markAsFiltered() {
        message.status = 'filtered';
        message.updatedAt = new Date();
        self.messages.set(message.messageId, message);
        return this;
      },
      async addTag(tag) {
        if (!message.metadata.tags.includes(tag)) {
          message.metadata.tags.push(tag);
          message.updatedAt = new Date();
          self.messages.set(message.messageId, message);
        }
        return this;
      },
      async setPriority(priority) {
        message.metadata.priority = priority;
        message.updatedAt = new Date();
        self.messages.set(message.messageId, message);
        return this;
      },
      toObject() {
        return { ...message };
      },
      toJSON() {
        return { ...message };
      }
    };
  }

  // ============ FILTER OPERATIONS ============

  /**
   * Crea un nuovo filtro in memoria
   */
  async createFilter(data) {
    const filterId = `filter_${Date.now()}_${++this.filterCounter}`;
    
    // Verifica unicità del nome
    for (const filter of this.filters.values()) {
      if (filter.name === data.name) {
        const error = new Error('Duplicate filter name');
        error.name = 'MongoError';
        error.code = 11000;
        throw error;
      }
    }

    const filter = {
      _id: filterId,
      ...data,
      enabled: data.enabled !== undefined ? data.enabled : true,
      stats: {
        matches: 0,
        lastMatch: null
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.filters.set(filterId, filter);
    return this.createFilterProxy(filter);
  }

  /**
   * Trova filtri con query
   */
  async findFilters(query = {}) {
    let results = Array.from(this.filters.values());

    if (query.enabled !== undefined) {
      results = results.filter(f => f.enabled === query.enabled);
    }

    if (query.name) {
      results = results.filter(f => f.name === query.name);
    }

    return results.map(f => this.createFilterProxy(f));
  }

  /**
   * Trova un filtro per ID
   */
  async findFilterById(id) {
    const filter = this.filters.get(id);
    if (!filter) {
      // Cerca per nome se non trovato per ID
      for (const f of this.filters.values()) {
        if (f.name === id) {
          return this.createFilterProxy(f);
        }
      }
      return null;
    }
    return this.createFilterProxy(filter);
  }

  /**
   * Trova un filtro con query
   */
  async findOneFilter(query) {
    const results = await this.findFilters(query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Aggiorna un filtro
   */
  async updateFilter(id, updateData) {
    let filter = this.filters.get(id);
    
    // Se non trovato per ID, cerca per nome
    if (!filter) {
      for (const [filterId, f] of this.filters.entries()) {
        if (f.name === id) {
          filter = f;
          id = filterId; // Usa l'ID reale per l'update
          break;
        }
      }
    }
    
    if (!filter) {
      return null;
    }

    // Applica l'update
    Object.keys(updateData).forEach(key => {
      if (key.includes('.')) {
        // Gestione nested fields (es. 'actions.setPriority')
        const parts = key.split('.');
        let obj = filter;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) {
            obj[parts[i]] = {};
          }
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = updateData[key];
      } else {
        filter[key] = updateData[key];
      }
    });

    filter.updatedAt = new Date();
    this.filters.set(id, filter);
    return this.createFilterProxy(filter);
  }

  /**
   * Crea un proxy per il filtro che simula i metodi Mongoose
   */
  createFilterProxy(filter) {
    const self = this;
    return {
      ...filter,
      async save() {
        filter.updatedAt = new Date();
        self.filters.set(filter._id, filter);
        return this;
      },
      async incrementMatches() {
        filter.stats.matches = (filter.stats.matches || 0) + 1;
        filter.stats.lastMatch = new Date();
        filter.updatedAt = new Date();
        self.filters.set(filter._id, filter);
        return this;
      },
      async toggle() {
        filter.enabled = !filter.enabled;
        filter.updatedAt = new Date();
        self.filters.set(filter._id, filter);
        return this;
      },
      toObject() {
        return { ...filter };
      },
      toJSON() {
        return { ...filter };
      }
    };
  }

  /**
   * Metodo statico per ottenere filtri attivi
   */
  async getActiveFilters() {
    return this.findFilters({ enabled: true });
  }

  /**
   * Pulisce tutto lo storage (utile per test)
   */
  clear() {
    this.messages.clear();
    this.filters.clear();
    this.filterCounter = 0;
    this.messageCounter = 0;
  }

  /**
   * Ottiene statistiche dello storage
   */
  getStats() {
    return {
      messages: this.messages.size,
      maxMessages: this.maxMessages,
      filters: this.filters.size,
      activeFilters: Array.from(this.filters.values()).filter(f => f.enabled).length
    };
  }
}

// Singleton instance
let memoryStorageInstance = null;

function getMemoryStorage() {
  if (!memoryStorageInstance) {
    memoryStorageInstance = new MemoryStorage();
  }
  return memoryStorageInstance;
}

module.exports = { getMemoryStorage, MemoryStorage };
