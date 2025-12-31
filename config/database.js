const mongoose = require('mongoose');

const connectDB = async () => {
  // Se si usa lo storage in memoria, non connettersi al database
  if (process.env.USE_MEMORY_STORAGE === 'true') {
    console.log('💾 Using in-memory storage (database disabled)');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_organizer', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };


