const mongoose = require('mongoose');
const { getMemoryStorage } = require('../services/memoryStorage');

const USE_MEMORY_STORAGE = process.env.USE_MEMORY_STORAGE === 'true';

const filterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  
  description: String,
  
  // Filtri per autore
  authors: [String],

  // Filtri per gruppo
  sourceGroups: [String],

  // Parole chiave da cercare nel testo
  keywords: [String],
  
  // Modalità di matching per le keywords (AND o OR)
  keywordMatchMode: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'OR'
  },
  
  // Tipi di messaggio da filtrare
  messageTypes: [{
    type: String,
    enum: ['text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker']
  }],
  
  // Fascia oraria
  timeRange: {
    start: String, // formato HH:mm
    end: String,   // formato HH:mm
    days: [Number] // 0=domenica, 1=lunedì, etc.
  },
  
  // Filtri per priorità
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent']
  },
  
  // Controllo unicità messaggi
  uniqueText: {
    enabled: {
      type: Boolean,
      default: false
    },
    tag: {
      type: String
    },
    timeWindowSeconds: {
      type: Number,
      default: 60 // default 60 secondi
    }
  },
  
  // Azioni da eseguire quando il filtro matcha
  actions: {
    markAsImportant: {
      type: Boolean,
      default: false
    },
    setPriority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    addTags: [String],
    autoReply: {
      enabled: Boolean,
      message: String
    },
    forwardTo: [String], // numeri di telefono
    archive: {
      type: Boolean,
      default: false
    }
  },
  
  // Stato del filtro
  enabled: {
    type: Boolean,
    default: true
  },
  
  // Statistiche
  stats: {
    matches: {
      type: Number,
      default: 0
    },
    lastMatch: Date
  }
}, {
  timestamps: true
});

// Metodi del modello
filterSchema.methods.incrementMatches = function() {
  this.stats.matches += 1;
  this.stats.lastMatch = new Date();
  return this.save();
};

filterSchema.methods.toggle = function() {
  this.enabled = !this.enabled;
  return this.save();
};

// Metodo statico per trovare filtri attivi
filterSchema.statics.getActiveFilters = function() {
  return this.find({ enabled: true });
};

// Crea il modello Mongoose standard
const FilterModel = mongoose.model('Filter', filterSchema);

// Esporta il wrapper che supporta sia MongoDB che memoria
if (USE_MEMORY_STORAGE) {
  // Wrapper per memoria
  const Filter = function(data) {
    return getMemoryStorage().createFilter(data);
  };
  
  // Metodi statici
  Filter.find = function(query) {
    const storage = getMemoryStorage();
    // Crea un oggetto che simula una Query Mongoose
    const queryObj = {
      _query: query,
      _sort: null,
      async exec() {
        let results = await storage.findFilters(this._query);
        // Applica sort se specificato
        if (this._sort) {
          const [field, direction] = this._sort.split(' ');
          const dir = direction === '1' || direction === 'asc' || direction === 'ascending' ? 1 : -1;
          results.sort((a, b) => {
            const aVal = a[field] || a.createdAt;
            const bVal = b[field] || b.createdAt;
            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
          });
        }
        return results;
      },
      sort(sortObj) {
        // Converte { createdAt: -1 } in "createdAt -1"
        const keys = Object.keys(sortObj);
        if (keys.length > 0) {
          this._sort = `${keys[0]} ${sortObj[keys[0]]}`;
        }
        return this;
      },
      // Per compatibilità, se chiamato direttamente con await
      then: async function(resolve, reject) {
        try {
          const results = await this.exec();
          return resolve(results);
        } catch (error) {
          return reject(error);
        }
      },
      catch: function(reject) {
        return this.then(null, reject);
      }
    };
    return queryObj;
  };
  
  Filter.findOne = function(query) {
    return getMemoryStorage().findOneFilter(query);
  };
  
  Filter.findById = function(id) {
    return getMemoryStorage().findFilterById(id);
  };
  
  Filter.findByIdAndUpdate = async function(id, updateData, options = {}) {
    const storage = getMemoryStorage();
    const updated = await storage.updateFilter(id, updateData);
    // Se { new: true }, restituisce il documento aggiornato
    if (options.new && updated) {
      return updated;
    }
    return updated;
  };
  
  Filter.getActiveFilters = function() {
    return getMemoryStorage().getActiveFilters();
  };
  
  module.exports = Filter;
} else {
  module.exports = FilterModel;
}




