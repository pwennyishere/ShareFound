const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(path.join(__dirname, 'public'))) {
  fs.mkdirSync(path.join(__dirname, 'public'));
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Images only!'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Database helpers
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      seedDB();
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { users: [], listings: [], chats: {}, notifications: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

// Initial Database Seeding
function seedDB() {
  const defaultDB = {
    users: [
      { id: 'sarah', name: 'Sarah Chen', neighborhood: 'Greenwood', avatar: 'SC', wallet: 100, lockedFunds: 0 },
      { id: 'mark', name: 'Mark Miller', neighborhood: 'Maplewood', avatar: 'MM', wallet: 100, lockedFunds: 0 },
      { id: 'elena', name: 'Elena Rostova', neighborhood: 'Silver Lake', avatar: 'ER', wallet: 100, lockedFunds: 0 },
      { id: 'james', name: 'James Carter', neighborhood: 'Sunset Hills', avatar: 'JC', wallet: 100, lockedFunds: 0 }
    ],
    listings: [
      {
        id: 'list-1',
        title: 'Heavy Duty Extension Ladder',
        description: 'Heavy duty 24ft aluminum extension ladder. Perfect for roof repairs or cleaning gutters. Willing to lend for up to a week!',
        type: 'offer',
        category: 'item',
        image: '/uploads/seed-ladder.webp',
        location: 'Greenwood Library Parking Lot',
        deposit: 20,
        authorId: 'sarah',
        authorName: 'Sarah Chen',
        authorNeighborhood: 'Greenwood',
        status: 'active',
        takerId: null,
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString() // 1 day ago
      },
      {
        id: 'list-2',
        title: 'Need a Lawn Mower for Saturday',
        description: 'Looking to borrow a push lawn mower for a couple of hours this Saturday. Can pick up and return clean. Thank you neighbors!',
        type: 'request',
        category: 'item',
        image: '/uploads/seed-lawnmower.webp',
        location: 'Oak Street (Near Greenwood Park)',
        deposit: 15,
        authorId: 'mark',
        authorName: 'Mark Miller',
        authorNeighborhood: 'Maplewood',
        status: 'active',
        takerId: null,
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString() // 12 hours ago
      },
      {
        id: 'list-3',
        title: 'Help Moving Heavy Furniture',
        description: 'Willing to help anyone lift/move heavy furniture or appliances. I have a trolley and am free on weekends.',
        type: 'offer',
        category: 'service',
        image: '/uploads/seed-furniture.webp',
        location: 'Silver Lake Area (Within 3 miles)',
        deposit: 10,
        authorId: 'elena',
        authorName: 'Elena Rostova',
        authorNeighborhood: 'Silver Lake',
        status: 'active',
        takerId: null,
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString() // 5 hours ago
      }
    ],
    chats: {},
    notifications: []
  };

  // Create default placeholder seeds in the filesystem if they don't exist
  // We can write base64 blank images or use placeholder images.
  // Actually, we can generate mock images later or copy standard files.
  // Let's create an empty mock file structure for them if needed, or we can use generated images.
  // Let's write empty files for seeds so they don't show broken images.
  // We'll write simple webp/png placeholders or check if they exist.
  writeDB(defaultDB);
}

// Write mock seed images if they don't exist
const createSeedImages = () => {
  const files = ['seed-ladder.webp', 'seed-lawnmower.webp', 'seed-furniture.webp'];
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 transparent pixel png
  files.forEach(file => {
    const filePath = path.join(UPLOADS_DIR, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }
  });
};
createSeedImages();

// API Routes

// Get all users
app.get('/api/users', (req, res) => {
  const db = readDB();
  res.json(db.users);
});

// Update a user's wallet (e.g. adding mock test funds)
app.post('/api/users/:id/add-funds', (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.wallet += Number(amount) || 0;
  writeDB(db);
  io.emit('userUpdated', user);
  res.json(user);
});

// Get listings
app.get('/api/listings', (req, res) => {
  const db = readDB();
  res.json(db.listings);
});

// Create new listing
app.post('/api/listings', upload.single('image'), (req, res) => {
  const { title, description, type, category, location, deposit, authorId } = req.body;
  const db = readDB();
  
  const author = db.users.find(u => u.id === authorId);
  if (!author) return res.status(400).json({ error: 'Invalid author ID' });

  let imagePath = '/uploads/seed-ladder.webp'; // fallback
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  const newListing = {
    id: 'list-' + Date.now(),
    title,
    description,
    type, // 'offer' or 'request'
    category, // 'item' or 'service'
    image: imagePath,
    location,
    deposit: Math.max(0, Number(deposit) || 0),
    authorId,
    authorName: author.name,
    authorNeighborhood: author.neighborhood,
    status: 'active', // 'active', 'taken', 'completed'
    takerId: null,
    createdAt: new Date().toISOString()
  };

  db.listings.unshift(newListing);
  writeDB(db);

  io.emit('listingCreated', newListing);
  res.status(201).json(newListing);
});

// Take / Accept Listing
app.post('/api/listings/:id/take', (req, res) => {
  const { id } = req.params;
  const { takerId } = req.body;
  
  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  const taker = db.users.find(u => u.id === takerId);
  const author = db.users.find(u => u.id === listing?.authorId);

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (!taker) return res.status(404).json({ error: 'Taker not found' });
  if (listing.status !== 'active') return res.status(400).json({ error: 'Listing is already taken or completed' });
  if (listing.authorId === takerId) return res.status(400).json({ error: 'You cannot accept your own listing' });

  const deposit = listing.deposit;

  // Wallet Trust Funds logic
  // For requests:
  // If A requests an item, and B offers to lend it:
  //   Lending is a voluntary act, or borrowing. Let's make sure the Borrower secures it.
  //   Rule: The person who BORROWS / RECEIVES the benefit of the service secures it.
  //   - If listing is 'offer' (A is offering, B is taking/borrowing): Taker (B) locks the deposit.
  //   - If listing is 'request' (A is requesting/borrowing, B is taking/fulfilling): Creator (A) locks the deposit.
  // Let's implement this escrow locking structure:
  let lockedUser = null;
  if (listing.type === 'offer') {
    // Taker is receiving the item/service. Taker locks funds.
    lockedUser = taker;
  } else {
    // Author is receiving the item/service (requesting it). Author locks funds.
    lockedUser = author;
  }

  if (lockedUser.wallet < deposit) {
    return res.status(400).json({ 
      error: `Insufficient Trust Funds. ${lockedUser.name} needs ${deposit} tokens, but has only ${lockedUser.wallet}.` 
    });
  }

  // Deduct from wallet and move to lockedFunds
  lockedUser.wallet -= deposit;
  lockedUser.lockedFunds += deposit;

  // Update listing status
  listing.status = 'taken';
  listing.takerId = takerId;
  listing.takerName = taker.name;
  listing.takerNeighborhood = taker.neighborhood;

  // Add system notifications
  const notifyTaker = {
    id: 'notif-' + Date.now() + '-1',
    userId: takerId,
    type: 'transaction',
    title: 'Listing Accepted!',
    message: listing.type === 'offer' 
      ? `You accepted ${author.name}'s offer: "${listing.title}". ${deposit} Trust Tokens locked in escrow. Private chat opened.`
      : `You offered to fulfill ${author.name}'s request: "${listing.title}". Private chat opened.`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  const notifyAuthor = {
    id: 'notif-' + Date.now() + '-2',
    userId: listing.authorId,
    type: 'transaction',
    title: listing.type === 'offer' ? 'Your item is being borrowed!' : 'Your request is fulfilled!',
    message: listing.type === 'offer'
      ? `${taker.name} took your offer: "${listing.title}". Private chat opened.`
      : `${taker.name} accepted your request: "${listing.title}". ${deposit} Trust Tokens locked in escrow. Private chat opened.`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  db.notifications.push(notifyTaker, notifyAuthor);
  writeDB(db);

  // Broadcast updates
  io.emit('listingUpdated', listing);
  io.emit('userUpdated', taker);
  io.emit('userUpdated', author);
  io.to(takerId).emit('notificationReceived', notifyTaker);
  io.to(listing.authorId).emit('notificationReceived', notifyAuthor);

  res.json({ listing, taker, author });
});

// Complete / Return Listing
app.post('/api/listings/:id/complete', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body; // User triggering completion

  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'taken') return res.status(400).json({ error: 'Listing must be in "taken" state to complete' });

  const author = db.users.find(u => u.id === listing.authorId);
  const taker = db.users.find(u => u.id === listing.takerId);
  
  if (!author || !taker) return res.status(404).json({ error: 'Users not found' });

  const deposit = listing.deposit;

  // Release escrow
  // Whoever locked the deposit gets it back.
  // Plus: The Lender/Provider receives an incentive of +5 tokens (bonus reward).
  let lockedUser = null;
  let providerUser = null;

  if (listing.type === 'offer') {
    // Taker locked funds (borrower). Taker gets deposit back.
    lockedUser = taker;
    // Author provided item. Author gets bonus reward.
    providerUser = author;
  } else {
    // Author locked funds (borrower/requester). Author gets deposit back.
    lockedUser = author;
    // Taker provided help. Taker gets bonus reward.
    providerUser = taker;
  }

  // Unlock deposit
  lockedUser.lockedFunds = Math.max(0, lockedUser.lockedFunds - deposit);
  lockedUser.wallet += deposit;

  // Add completion reward (+5 tokens) to provider as reward
  providerUser.wallet += 5;

  listing.status = 'completed';
  
  // System notifications
  const notifyTaker = {
    id: 'notif-' + Date.now() + '-3',
    userId: taker.id,
    type: 'transaction',
    title: 'Listing Completed!',
    message: listing.type === 'offer'
      ? `Transaction for "${listing.title}" marked complete. Escrow deposit of ${deposit} tokens returned.`
      : `Transaction for "${listing.title}" marked complete. You earned 5 Trust Tokens for lending your help!`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  const notifyAuthor = {
    id: 'notif-' + Date.now() + '-4',
    userId: author.id,
    type: 'transaction',
    title: 'Listing Completed!',
    message: listing.type === 'offer'
      ? `Transaction for "${listing.title}" marked complete. You earned 5 Trust Tokens for lending your item!`
      : `Transaction for "${listing.title}" marked complete. Escrow deposit of ${deposit} tokens returned.`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  db.notifications.push(notifyTaker, notifyAuthor);
  writeDB(db);

  // Broadcast updates
  io.emit('listingUpdated', listing);
  io.emit('userUpdated', taker);
  io.emit('userUpdated', author);
  io.to(taker.id).emit('notificationReceived', notifyTaker);
  io.to(author.id).emit('notificationReceived', notifyAuthor);

  res.json({ listing, taker, author });
});

// Cancel Listing transaction (revert back to active and unlock funds)
app.post('/api/listings/:id/cancel-take', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'taken') return res.status(400).json({ error: 'Listing not in progress' });

  const author = db.users.find(u => u.id === listing.authorId);
  const taker = db.users.find(u => u.id === listing.takerId);
  const deposit = listing.deposit;

  // Revert locked funds back to wallet
  let lockedUser = listing.type === 'offer' ? taker : author;
  lockedUser.lockedFunds = Math.max(0, lockedUser.lockedFunds - deposit);
  lockedUser.wallet += deposit;

  // Revert listing state
  listing.status = 'active';
  const oldTakerId = listing.takerId;
  listing.takerId = null;
  listing.takerName = null;
  listing.takerNeighborhood = null;

  // Notifications
  const notifyTaker = {
    id: 'notif-' + Date.now() + '-5',
    userId: oldTakerId,
    type: 'transaction',
    title: 'Transaction Cancelled',
    message: `The transaction for "${listing.title}" was cancelled. Any locked trust deposits have been refunded.`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  const notifyAuthor = {
    id: 'notif-' + Date.now() + '-6',
    userId: listing.authorId,
    type: 'transaction',
    title: 'Transaction Cancelled',
    message: `The transaction for "${listing.title}" was cancelled. Any locked trust deposits have been refunded.`,
    read: false,
    listingId: listing.id,
    createdAt: new Date().toISOString()
  };

  db.notifications.push(notifyTaker, notifyAuthor);
  writeDB(db);

  io.emit('listingUpdated', listing);
  io.emit('userUpdated', taker);
  io.emit('userUpdated', author);
  io.to(oldTakerId).emit('notificationReceived', notifyTaker);
  io.to(listing.authorId).emit('notificationReceived', notifyAuthor);

  res.json({ listing });
});

// Get chats for a specific room
app.get('/api/chats/:roomId', (req, res) => {
  const { roomId } = req.params;
  const db = readDB();
  res.json(db.chats[roomId] || []);
});

// Get user notifications
app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const db = readDB();
  const userNotifs = db.notifications.filter(n => n.userId === userId);
  res.json(userNotifs);
});

// Mark notification as read
app.post('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const notif = db.notifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    writeDB(db);
  }
  res.json({ success: true });
});

// Mark all user notifications as read
app.post('/api/notifications/user/:userId/read-all', (req, res) => {
  const { userId } = req.params;
  const db = readDB();
  db.notifications.forEach(n => {
    if (n.userId === userId) n.read = true;
  });
  writeDB(db);
  res.json({ success: true });
});

// Socket.io Real-time handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // User registration to room for targeted events (like notifications)
  socket.on('registerUser', (userId) => {
    socket.join(userId);
    console.log(`Socket ${socket.id} joined user room: ${userId}`);
  });

  // Join a chat room (public or private)
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  // Leave a chat room
  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room: ${roomId}`);
  });

  // Handle message sending
  socket.on('sendMessage', ({ roomId, senderId, senderName, content }) => {
    const db = readDB();
    if (!db.chats[roomId]) {
      db.chats[roomId] = [];
    }

    const newMessage = {
      senderId,
      senderName,
      content,
      timestamp: new Date().toISOString()
    };

    db.chats[roomId].push(newMessage);

    // Save and emit message to room
    writeDB(db);
    io.to(roomId).emit('messageReceived', newMessage);

    // If it's a private chat, trigger notification/alert for the other party
    // Room ID format for private chat: listing_[listingId]_private
    if (roomId.endsWith('_private')) {
      const listingId = roomId.split('_')[1];
      const listing = db.listings.find(l => l.id === listingId);
      if (listing) {
        // Find recipient (the other party in the private room)
        const recipientId = (listing.authorId === senderId) ? listing.takerId : listing.authorId;
        if (recipientId) {
          const chatNotification = {
            id: 'notif-' + Date.now(),
            userId: recipientId,
            type: 'chat',
            title: `New message from ${senderName}`,
            message: content.length > 50 ? content.substring(0, 47) + '...' : content,
            read: false,
            listingId: listing.id,
            chatType: 'private',
            createdAt: new Date().toISOString()
          };
          
          db.notifications.push(chatNotification);
          writeDB(db);

          io.to(recipientId).emit('notificationReceived', chatNotification);
        }
      }
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ roomId, userId, userName, isTyping }) => {
    socket.to(roomId).emit('userTyping', { userId, userName, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`ShareHood App is running on http://localhost:${PORT}`);
  console.log(`==================================================`);
});
