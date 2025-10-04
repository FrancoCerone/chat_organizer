const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // WhatsApp message ID
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Informazioni mittente
  from: {
    phoneNumber: {
      type: String,
      required: true,
      index: true
    },
    name: String,
    profileName: String
  },
  
  // Informazioni destinatario
  to: {
    phoneNumber: {
      type: String,
      required: false
    }
  },
  
  // Contenuto del messaggio
  content: {
    type: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker'],
      required: true
    },
    text: String,
    media: {
      url: String,
      mimeType: String,
      fileName: String,
      fileSize: Number
    },
    location: {
      latitude: Number,
      longitude: Number,
      name: String,
      address: String
    }
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  
  // Stato del messaggio
  status: {
    type: String,
    enum: ['received', 'processed', 'filtered', 'archived'],
    default: 'received'
  },
  
  // Filtri applicati
  filters: {
    keywords: [String],
    author: String,
    timeRange: {
      start: String,
      end: String
    },
    messageType: String
  },
  
  // Metadati aggiuntivi
  metadata: {
    isImportant: {
      type: Boolean,
      default: false
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    tags: [String],
    notes: String
  },
  
  // Dati originali WhatsApp
  rawData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indici per performance
messageSchema.index({ 'from.phoneNumber': 1, timestamp: -1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ 'metadata.priority': 1 });
messageSchema.index({ 'metadata.tags': 1 });

// Metodi del modello
messageSchema.methods.markAsProcessed = function() {
  this.status = 'processed';
  return this.save();
};

messageSchema.methods.markAsFiltered = function() {
  this.status = 'filtered';
  return this.save();
};

messageSchema.methods.addTag = function(tag) {
  if (!this.metadata.tags.includes(tag)) {
    this.metadata.tags.push(tag);
  }
  return this.save();
};

messageSchema.methods.setPriority = function(priority) {
  this.metadata.priority = priority;
  return this.save();
};

module.exports = mongoose.model('Message', messageSchema);


