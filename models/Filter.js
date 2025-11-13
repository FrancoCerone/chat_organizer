const mongoose = require('mongoose');

const filterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  
  description: String,
  
  // Filtri per autore
  authors: [{
    phoneNumber: String,
    name: String
  }],
  
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

module.exports = mongoose.model('Filter', filterSchema);




