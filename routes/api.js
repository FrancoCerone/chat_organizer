const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Filter = require('../models/Filter');
const { FilterService } = require('../services/filterService');

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

module.exports = router;



