# Chat Organizer

Advanced WhatsApp message filtering and management system with real-time processing, admin commands, and dual messaging support (Cloud API + WhatsApp Web.js).

## 🚀 Features

### Core Functionality
- **Dual WhatsApp Integration**: Support for both WhatsApp Cloud API and WhatsApp Web.js
- **Advanced Filter System**: Smart message filtering with AND/OR keyword matching modes
- **Real-time Processing**: Instant message processing and filtering
- **Admin Commands**: WhatsApp-based filter management system
- **Message Forwarding**: Multiple forwarding options (Cloud API, WhatsApp Web, webhooks)
- **Database Storage**: MongoDB for persistent message and filter storage
- **REST API**: Complete API for frontend integration

### Filter Capabilities
- **Keyword Filtering**: Support for multiple keywords with AND/OR logic
- **Author Filtering**: Filter by specific phone numbers or names
- **Time-based Filtering**: Filter by time ranges and specific days
- **Message Type Filtering**: Filter by text, image, document, etc.
- **Priority Management**: Automatic priority assignment and tagging
- **Auto-actions**: Automatic replies, forwarding, archiving

### Admin Management
- **WhatsApp Commands**: Manage filters directly from WhatsApp
- **Real-time Updates**: Instant filter modifications
- **Help System**: Built-in help and documentation
- **Authorization**: Admin-only command access

## 📋 Prerequisites

- Node.js 16+
- MongoDB (local or cloud)
- WhatsApp Business Account with Cloud API access
- WhatsApp Web.js setup (optional, for dual integration)

## 🛠️ Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd chat-organizer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp env.example .env
```

Configure your `.env` file:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/chat_organizer

# WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=your_verify_token_here
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here

# WhatsApp App Configuration (for token refresh)
WHATSAPP_APP_ID=your_app_id_here
WHATSAPP_APP_SECRET=your_app_secret_here
WHATSAPP_REFRESH_TOKEN=your_long_lived_token_here

# Message Forwarding
FORWARD_ENABLE_WHATSAPP_CLOUD_API=true
FORWARD_ENABLE_WHATSAPPWEBJS=true
FORWARD_SEPARATE_CHAT=true
FORWARD_SEPARATE_CHAT_NUMBER=+1234567890

# WhatsApp Web.js Configuration
WHATSAPP_GROUPS_ENABLED=true
WHATSAPP_GROUPS_LIST=Work Group,Important Chat
WHATSAPP_GROUPS_ALL=true

# Admin Configuration
ADMIN_PHONE_NUMBERS=+1234567890,+0987654321

# Webhook URL (for production)
WEBHOOK_URL=https://yourdomain.com/webhook
```

### 4. Start MongoDB
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install MongoDB locally
```

### 5. Run the Application
```bash
# Development
npm run dev

# Production
npm start
```

### 6. Setup ngrok (for local development)
```bash
# Windows PowerShell
ngrok config add-authtoken YOUR_AUTHTOKEN
Start-Process cmd -ArgumentList "/k ngrok http 3000"
```

## 📡 WhatsApp Configuration

### Cloud API Setup
1. Configure webhook in Meta for Developers console:
   - URL: `https://yourdomain.com/webhook`
   - Verify token: Use value from `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to events: `messages`

### WhatsApp Web.js Setup
1. Enable WhatsApp groups in `.env`:
   ```env
   WHATSAPP_GROUPS_ENABLED=true
   WHATSAPP_GROUPS_LIST=Your Group Name
   ```
2. Start the application and scan QR code with WhatsApp
3. Groups will be automatically monitored

## 🤖 Admin Commands

Manage filters directly from WhatsApp using these commands:

### General Commands
- `help` - Show all available commands
- `help filters` - Detailed filter management help

### Filter Management
- `list filters` or `show filters` - Show all active filters
- `update filter <name> <field> <value>` - Update a specific filter

### Available Filter Fields
- `keywords` - Keywords (JSON array or string)
- `keywordmatchmode` - Keyword matching mode (AND or OR)
- `authors` - Authors (JSON array or phone number)
- `messagetypes` - Message types (JSON array)
- `priority` - Priority (urgent, high, normal, low)
- `important` - Mark as important (true/false)
- `archive` - Archive (true/false)
- `active` - Active status (true/false)

### Command Examples
```bash
# Update keywords (OR mode - any keyword matches)
update filter Urgent Messages keywords ["urgent","emergency","asap"]

# Update keywords (AND mode - all keywords must match)
update filter Urgent Messages keywordmatchmode AND

# Change priority
update filter Urgent Messages priority urgent

# Add author
update filter VIP Messages authors +1234567890

# Deactivate filter
update filter Old Filter active false
```

## 🔧 API Endpoints

### Webhook
- `GET /webhook` - Verify webhook
- `POST /webhook` - Receive WhatsApp events

### Messages
- `GET /api/messages` - List messages (with filters)
- `GET /api/messages/:id` - Get specific message
- `PATCH /api/messages/:id` - Update message
- `DELETE /api/messages/:id` - Delete message

### Filters
- `GET /api/filters` - List all filters
- `POST /api/filters` - Create new filter
- `PUT /api/filters/:id` - Update filter
- `DELETE /api/filters/:id` - Delete filter
- `PATCH /api/filters/:id/toggle` - Toggle filter status

### Statistics
- `GET /api/stats` - General statistics
- `GET /api/stats/authors` - Author statistics
- `GET /api/search?q=term` - Search messages

## 🎯 Filter Examples

### Urgent Messages Filter
```json
{
  "name": "Urgent Messages",
  "description": "Filter urgent messages with keywords",
  "keywords": ["urgent", "emergency", "asap"],
  "keywordMatchMode": "OR",
  "actions": {
    "markAsImportant": true,
    "setPriority": "urgent",
    "addTags": ["urgent"],
    "forwardTo": ["+1234567890"]
  }
}
```

### Work Hours Filter
```json
{
  "name": "Work Messages",
  "description": "Filter work-related messages during business hours",
  "keywords": ["meeting", "project", "deadline"],
  "keywordMatchMode": "OR",
  "timeRange": {
    "start": "09:00",
    "end": "18:00",
    "days": [1, 2, 3, 4, 5]
  },
  "actions": {
    "markAsImportant": true,
    "setPriority": "high",
    "addTags": ["work"]
  }
}
```

### VIP Contacts Filter
```json
{
  "name": "VIP Messages",
  "description": "Filter messages from important contacts",
  "authors": [
    {
      "phoneNumber": "+1234567890",
      "name": "John Doe"
    }
  ],
  "actions": {
    "markAsImportant": true,
    "setPriority": "urgent",
    "forwardTo": ["+0987654321"]
  }
}
```

## 📊 Database Schema

### Message Schema
```javascript
{
  messageId: String,
  from: {
    name: String,
    phoneNumber: String,
    profileName: String
  },
  content: {
    type: String, // text, image, document, etc.
    text: String,
    timestamp: Date,
    media: {
      mimetype: String,
      filename: String,
      data: String
    }
  },
  timestamp: String,
  status: String, // received, processed, filtered, archived
  metadata: {
    source: String, // webhook, whatsapp-web
    groupInfo: {
      name: String,
      id: String
    },
    isImportant: Boolean,
    priority: String, // low, medium, high, urgent
    tags: [String],
    processedAt: String
  }
}
```

### Filter Schema
```javascript
{
  name: String,
  description: String,
  authors: [{
    phoneNumber: String,
    name: String
  }],
  keywords: [String],
  keywordMatchMode: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'OR'
  },
  messageTypes: [String],
  timeRange: {
    start: String, // HH:mm format
    end: String,
    days: [Number] // 0=Sunday, 1=Monday, etc.
  },
  actions: {
    markAsImportant: Boolean,
    setPriority: String,
    addTags: [String],
    autoReply: {
      enabled: Boolean,
      message: String
    },
    forwardTo: [String],
    archive: Boolean
  },
  enabled: {
    type: Boolean,
    default: true
  },
  stats: {
    matches: Number,
    lastMatch: Date
  }
}
```

## 🔍 Usage Examples

### Get Important Messages
```bash
GET /api/messages?important=true&priority=urgent
```

### Search Messages
```bash
GET /api/search?q=important&type=text
```

### Filter by Author and Date
```bash
GET /api/messages?author=+1234567890&dateFrom=2024-01-01
```

### Create Filter via API
```bash
POST /api/filters
Content-Type: application/json

{
  "name": "New Filter",
  "keywords": ["test"],
  "keywordMatchMode": "OR",
  "actions": {
    "markAsImportant": true
  }
}
```

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 Deployment
```bash
npm install -g pm2
pm2 start server.js --name chat-organizer
pm2 startup
pm2 save
```

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chat_organizer
WEBHOOK_URL=https://yourdomain.com/webhook
```

## 🔐 Security

### Admin Authorization
- Only numbers in `ADMIN_PHONE_NUMBERS` can execute admin commands
- Commands are validated before execution
- All admin actions are logged

### Data Protection
- Message content is stored securely in MongoDB
- No sensitive data in logs
- Configurable data retention policies

## 📈 Monitoring

### Logs
- Real-time processing logs
- Admin command logs
- Error tracking and reporting

### Statistics
- Message processing statistics
- Filter effectiveness metrics
- Performance monitoring

## 🤝 Client Integration

### For Existing WhatsApp Business Clients

1. **Facebook Business Manager Setup**:
   - Client creates Facebook Business Manager (free)
   - Enables WhatsApp Business Account (WABA)
   - Assigns you as developer/partner

2. **Direct Development**:
   - You develop on their official environment
   - Client maintains full control
   - Production-ready from day one

### Benefits
- ✅ Official WhatsApp Business integration
- ✅ Client maintains control
- ✅ No additional setup required
- ✅ Immediate production deployment

## 🛠️ Development

### Project Structure
```
chat-organizer/
├── config/
│   └── database.js          # Database configuration
├── models/
│   ├── Filter.js            # Filter model
│   └── Message.js           # Message model
├── routes/
│   ├── api.js               # REST API routes
│   └── webhook.js           # Webhook endpoints
├── services/
│   ├── filterService.js     # Filter management
│   ├── messageConverter.js  # Message conversion
│   ├── whatsappService.js   # Cloud API service
│   └── whatsappWebService.js # Web.js service
├── mongo-init/
│   └── 01-init-user.js      # Database initialization
├── server.js                # Main application
├── docker-compose.yml       # Docker configuration
└── package.json             # Dependencies
```

### Key Services

#### FilterService
- Manages filter creation, updates, and deletion
- Handles admin commands from WhatsApp
- Provides real-time filter processing

#### WhatsappService
- Handles WhatsApp Cloud API integration
- Manages token refresh and authentication
- Processes message forwarding

#### WhatsappWebService
- Integrates with WhatsApp Web.js
- Monitors group messages
- Provides dual messaging support

#### MessageConverter
- Standardizes message formats
- Handles different message sources
- Provides validation and normalization

## 📝 Notes

- **Real-time Processing**: All messages are processed instantly upon receipt
- **Dual Integration**: Supports both Cloud API and Web.js simultaneously
- **Admin Commands**: Full filter management via WhatsApp messages
- **Automatic Backup**: All messages and filters are stored in MongoDB
- **Scalable Architecture**: Ready for high-volume message processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Check the admin commands with `help` in WhatsApp
- Review the API documentation above
- Check the logs for error details
- Ensure proper environment configuration

---

**Built with ❤️ for efficient WhatsApp message management**