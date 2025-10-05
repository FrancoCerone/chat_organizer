const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Filter = require('../models/Filter');
const { FilterService } = require('../services/filterService');
const whatsappService = require('../services/whatsappService');
const whatsappWebService = require('../services/whatsappWebService');

// ===== MESSAGGI =====

// Ottieni tutti i messaggi con filtri
router.get('/messages', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      author,
      type,
      dateFrom,
      dateTo,
      search,
      tags,
      important
    } = req.query;

    // Costruisci query
    const query = {};
    
    if (status) query.status = status;
    if (priority) query['metadata.priority'] = priority;
    if (author) query['from.phoneNumber'] = author;
    if (type) query['content.type'] = type;
    if (important !== undefined) query['metadata.isImportant'] = important === 'true';
    if (tags) query['metadata.tags'] = { $in: tags.split(',') };
    
    // Filtri per data
    if (dateFrom || dateTo) {
      query.timestamp = {};
      if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
      if (dateTo) query.timestamp.$lte = new Date(dateTo);
    }
    
    // Ricerca nel testo
    if (search) {
      query['content.text'] = { $regex: search, $options: 'i' };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { timestamp: -1 }
    };

    const messages = await Message.find(query)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit);

    const total = await Message.countDocuments(query);

    res.json({
      messages,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ottieni messaggio specifico
router.get('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Aggiorna messaggio
router.patch('/messages/:id', async (req, res) => {
  try {
    const { priority, tags, notes, isImportant } = req.body;
    
    const updateData = {};
    if (priority) updateData['metadata.priority'] = priority;
    if (tags) updateData['metadata.tags'] = tags;
    if (notes !== undefined) updateData['metadata.notes'] = notes;
    if (isImportant !== undefined) updateData['metadata.isImportant'] = isImportant;

    const message = await Message.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Elimina messaggio
router.delete('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== FILTRI =====

// Ottieni tutti i filtri
router.get('/filters', async (req, res) => {
  try {
    const filters = await Filter.find().sort({ createdAt: -1 });
    res.json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ottieni filtro specifico
router.get('/filters/:id', async (req, res) => {
  try {
    const filter = await Filter.findById(req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Filter not found' });
    }
    res.json(filter);
  } catch (error) {
    console.error('Error fetching filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Crea nuovo filtro
router.post('/filters', async (req, res) => {
  try {
    const filter = await FilterService.createFilter(req.body);
    res.status(201).json(filter);
  } catch (error) {
    console.error('Error creating filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Aggiorna filtro
router.put('/filters/:id', async (req, res) => {
  try {
    const filter = await FilterService.updateFilter(req.params.id, req.body);
    if (!filter) {
      return res.status(404).json({ error: 'Filter not found' });
    }
    res.json(filter);
  } catch (error) {
    console.error('Error updating filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Elimina filtro
router.delete('/filters/:id', async (req, res) => {
  try {
    await FilterService.deleteFilter(req.params.id);
    res.json({ message: 'Filter deleted successfully' });
  } catch (error) {
    console.error('Error deleting filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Attiva/disattiva filtro
router.patch('/filters/:id/toggle', async (req, res) => {
  try {
    const filter = await Filter.findById(req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Filter not found' });
    }
    
    await filter.toggle();
    res.json(filter);
  } catch (error) {
    console.error('Error toggling filter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== STATISTICHE =====

// Ottieni statistiche generali
router.get('/stats', async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    const messagesByStatus = await Message.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const messagesByType = await Message.aggregate([
      { $group: { _id: '$content.type', count: { $sum: 1 } } }
    ]);
    const messagesByPriority = await Message.aggregate([
      { $group: { _id: '$metadata.priority', count: { $sum: 1 } } }
    ]);
    const importantMessages = await Message.countDocuments({ 'metadata.isImportant': true });
    
    const totalFilters = await Filter.countDocuments();
    const activeFilters = await Filter.countDocuments({ enabled: true });

    res.json({
      messages: {
        total: totalMessages,
        byStatus: messagesByStatus,
        byType: messagesByType,
        byPriority: messagesByPriority,
        important: importantMessages
      },
      filters: {
        total: totalFilters,
        active: activeFilters
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ottieni statistiche per autore
router.get('/stats/authors', async (req, res) => {
  try {
    const authorStats = await Message.aggregate([
      {
        $group: {
          _id: '$from.phoneNumber',
          name: { $first: '$from.name' },
          count: { $sum: 1 },
          lastMessage: { $max: '$timestamp' },
          importantCount: {
            $sum: { $cond: [{ $eq: ['$metadata.isImportant', true] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json(authorStats);
  } catch (error) {
    console.error('Error fetching author stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== RICERCA =====

// Ricerca avanzata
router.get('/search', async (req, res) => {
  try {
    const { q, type, dateFrom, dateTo, author } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const query = {
      $or: [
        { 'content.text': { $regex: q, $options: 'i' } },
        { 'from.name': { $regex: q, $options: 'i' } },
        { 'metadata.tags': { $regex: q, $options: 'i' } }
      ]
    };

    if (type) query['content.type'] = type;
    if (author) query['from.phoneNumber'] = author;
    
    if (dateFrom || dateTo) {
      query.timestamp = {};
      if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
      if (dateTo) query.timestamp.$lte = new Date(dateTo);
    }

    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(messages);
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== WHATSAPP =====

// Verifica stato del token WhatsApp
router.get('/whatsapp/token-status', async (req, res) => {
  try {
    const validation = await whatsappService.validateToken();
    res.json({
      valid: validation.valid,
      error: validation.error || null,
      data: validation.data || null
    });
  } catch (error) {
    console.error('Error checking token status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh manuale del token WhatsApp
router.post('/whatsapp/refresh-token', async (req, res) => {
  try {
    const newToken = await whatsappService.refreshAccessToken();
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      newToken: newToken.substring(0, 10) + '...' // Mostra solo i primi 10 caratteri per sicurezza
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      details: error.message 
    });
  }
});

// Test invio messaggio WhatsApp
router.post('/whatsapp/test', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ 
        error: 'Phone number and message are required' 
      });
    }

    const result = await whatsappService.sendText(to, message);
    res.json({
      success: true,
      message: 'Test message sent successfully',
      result: result
    });
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({ 
      error: 'Failed to send test message',
      details: error.message 
    });
  }
});

// Test invio nella chat separata
router.post('/whatsapp/test-separate-chat', async (req, res) => {
  try {
    const { message, filterName } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        error: 'Message is required' 
      });
    }

    // Crea un messaggio di test
    const testMessage = {
      content: { text: message },
      from: { 
        name: 'Test User', 
        phoneNumber: '+393471234567' 
      },
      timestamp: new Date().toISOString(),
      metadata: {}
    };

    const result = await whatsappService.sendToSeparateChat(testMessage, filterName || 'Test Filter');
    res.json({
      success: true,
      message: 'Test message sent to separate chat successfully',
      result: result
    });
  } catch (error) {
    console.error('Error sending test message to separate chat:', error);
    res.status(500).json({ 
      error: 'Failed to send test message to separate chat',
      details: error.message 
    });
  }
});

// Configurazione chat separata
router.get('/whatsapp/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        separateChatEnabled: process.env.FORWARD_SEPARATE_CHAT === 'true',
        separateChatNumber: process.env.FORWARD_SEPARATE_CHAT_NUMBER,
        whatsappEnabled: process.env.FORWARD_ENABLE_WHATSAPP_CLOUD_API === 'true'
      }
    });
  } catch (error) {
    console.error('Error checking config:', error);
    res.status(500).json({ 
      error: 'Failed to check config',
      details: error.message 
    });
  }
});

// Test message builder
router.post('/whatsapp/test-message-builder', async (req, res) => {
  try {
    const { message, filterName, format } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        error: 'Message is required' 
      });
    }

    // Crea un messaggio di test
    const testMessage = {
      content: { text: message },
      from: { 
        name: 'Test User', 
        phoneNumber: '+393471234567' 
      },
      timestamp: new Date().toISOString(),
      metadata: {}
    };

    // Test del builder
    const formattedMessage = whatsappService.buildForwardMessage(testMessage, filterName || 'Test Filter');
    
    res.json({
      success: true,
      message: 'Message builder test completed',
      formattedMessage: formattedMessage,
      originalMessage: testMessage
    });
  } catch (error) {
    console.error('Error testing message builder:', error);
    res.status(500).json({ 
      error: 'Failed to test message builder',
      details: error.message 
    });
  }
});

// Gestione filtri predefiniti
router.get('/filters/default-config', async (req, res) => {
  try {
    const defaultFiltersConfig = process.env.DEFAULT_FILTERS;
    
    let parsedFilters = null;
    if (defaultFiltersConfig) {
      try {
        parsedFilters = JSON.parse(defaultFiltersConfig);
      } catch (parseError) {
        console.error('Error parsing DEFAULT_FILTERS:', parseError.message);
      }
    }

    res.json({
      success: true,
      config: {
        hasDefaultFilters: !!defaultFiltersConfig,
        defaultFiltersCount: parsedFilters ? parsedFilters.length : 0,
        defaultFilters: parsedFilters
      }
    });
  } catch (error) {
    console.error('Error getting default filters config:', error);
    res.status(500).json({ 
      error: 'Failed to get default filters config',
      details: error.message 
    });
  }
});

// Reset filtri predefiniti
router.post('/filters/reset-defaults', async (req, res) => {
  try {
    // Importa setupFilters dinamicamente
    const { setupFilters } = require('../services/filterService');
    
    await setupFilters();
    
    res.json({
      success: true,
      message: 'Default filters reset successfully'
    });
  } catch (error) {
    console.error('Error resetting default filters:', error);
    res.status(500).json({ 
      error: 'Failed to reset default filters',
      details: error.message 
    });
  }
});

// ===== WHATSAPP WEB =====

// Stato WhatsApp Web
router.get('/whatsapp-web/status', async (req, res) => {
  try {
    const status = whatsappWebService.getStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('Error getting WhatsApp Web status:', error);
    res.status(500).json({ 
      error: 'Failed to get WhatsApp Web status',
      details: error.message 
    });
  }
});

// Lista gruppi WhatsApp
router.get('/whatsapp-web/groups', async (req, res) => {
  try {
    const groups = await whatsappWebService.getGroupsInfo();
    res.json({
      success: true,
      groups: groups
    });
  } catch (error) {
    console.error('Error getting WhatsApp groups:', error);
    res.status(500).json({ 
      error: 'Failed to get WhatsApp groups',
      details: error.message 
    });
  }
});

// Invia messaggio a gruppo
router.post('/whatsapp-web/send-to-group', async (req, res) => {
  try {
    const { groupName, message } = req.body;
    
    if (!groupName || !message) {
      return res.status(400).json({ 
        error: 'Group name and message are required' 
      });
    }

    await whatsappWebService.sendMessageToGroup(groupName, message);
    
    res.json({
      success: true,
      message: `Message sent to group "${groupName}" successfully`
    });
  } catch (error) {
    console.error('Error sending message to group:', error);
    res.status(500).json({ 
      error: 'Failed to send message to group',
      details: error.message 
    });
  }
});

// Test messaggio da gruppo
router.post('/whatsapp-web/test-group-message', async (req, res) => {
  try {
    const { groupName, senderName, message, filterName } = req.body;
    
    if (!groupName || !message) {
      return res.status(400).json({ 
        error: 'Group name and message are required' 
      });
    }

    // Crea un messaggio di test simulato da gruppo
    const testMessage = {
      messageId: 'test_' + Date.now(),
      from: { 
        name: senderName || 'Test User', 
        phoneNumber: '+393471234567' 
      },
      content: { 
        type: 'text',
        text: message 
      },
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'whatsapp-web',
        groupInfo: {
          name: groupName,
          id: 'test_group_id'
        }
      }
    };

    // Test del builder
    const formattedMessage = whatsappService.buildForwardMessage(testMessage, filterName || 'Test Filter');
    
    res.json({
      success: true,
      message: 'Group message test completed',
      formattedMessage: formattedMessage,
      originalMessage: testMessage
    });
  } catch (error) {
    console.error('Error testing group message:', error);
    res.status(500).json({ 
      error: 'Failed to test group message',
      details: error.message 
    });
  }
});

module.exports = router;



