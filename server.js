const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'sharehood_super_secret_key_2024';

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
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Images only!'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ===================== DATABASE HELPERS =====================
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) seedDB();
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

function seedDB() {
  const defaultDB = {
    users: [],
    listings: [],
    chats: {},
    notifications: []
  };
  writeDB(defaultDB);
}

// Seed placeholder images
const createSeedImages = () => {
  const files = ['seed-furniture.webp', 'seed-ladder.webp', 'seed-lawnmower.webp'];
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  files.forEach(file => {
    const filePath = path.join(UPLOADS_DIR, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }
  });
};
createSeedImages();

// ===================== AUTH MIDDLEWARE =====================
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided. Please log in.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token. Please log in again.' });
    req.userId = decoded.userId;
    next();
  });
}

function generateInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ===================== AUTH ROUTES =====================

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, neighborhood, password } = req.body;

  if (!name || !email || !neighborhood || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const db = readDB();
  const existingUser = db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: 'user-' + Date.now(),
    name,
    email: email.toLowerCase(),
    neighborhood,
    avatar: generateInitials(name),
    wallet: 100,
    lockedFunds: 0,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDB(db);

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  const { passwordHash: _, ...safeUser } = newUser;
  res.status(201).json({ token, user: safeUser });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const db = readDB();
  const user = db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'No account found with that email.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { passwordHash: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// Get current user (verify token)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// ===================== USER ROUTES =====================

app.get('/api/users', authMiddleware, (req, res) => {
  const db = readDB();
  const safeUsers = db.users.map(({ passwordHash, ...u }) => u);
  res.json(safeUsers);
});

app.post('/api/users/:id/add-funds', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.wallet += Number(amount) || 0;
  writeDB(db);
  io.emit('userUpdated', { ...user, passwordHash: undefined });
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// ===================== LISTING ROUTES =====================

app.get('/api/listings', authMiddleware, (req, res) => {
  const db = readDB();
  res.json(db.listings);
});

app.post('/api/listings', authMiddleware, upload.single('image'), (req, res) => {
  const { title, description, type, category, location, deposit } = req.body;
  const authorId = req.userId;

  const db = readDB();
  const author = db.users.find(u => u.id === authorId);
  if (!author) return res.status(400).json({ error: 'Author not found' });

  let imagePath = '/uploads/seed-ladder.webp';
  if (req.file) imagePath = '/uploads/' + req.file.filename;

  const newListing = {
    id: 'list-' + Date.now(),
    title,
    description,
    type,
    category,
    image: imagePath,
    location,
    deposit: Math.max(0, Number(deposit) || 0),
    authorId,
    authorName: author.name,
    authorNeighborhood: author.neighborhood,
    status: 'active',
    takerId: null,
    createdAt: new Date().toISOString()
  };

  db.listings.unshift(newListing);
  writeDB(db);
  io.emit('listingCreated', newListing);
  res.status(201).json(newListing);
});

app.post('/api/listings/:id/take', authMiddleware, (req, res) => {
  const { id } = req.params;
  const takerId = req.userId;

  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  const taker = db.users.find(u => u.id === takerId);
  const author = db.users.find(u => u.id === listing?.authorId);

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (!taker) return res.status(404).json({ error: 'User not found' });
  if (listing.status !== 'active') return res.status(400).json({ error: 'Listing is already taken or completed' });
  if (listing.authorId === takerId) return res.status(400).json({ error: 'You cannot accept your own listing' });

  const deposit = listing.deposit;
  let lockedUser = listing.type === 'offer' ? taker : author;

  if (lockedUser.wallet < deposit) {
    return res.status(400).json({
      error: `Insufficient Trust Funds. ${lockedUser.name} needs ${deposit} tokens but has only ${lockedUser.wallet}.`
    });
  }

  lockedUser.wallet -= deposit;
  lockedUser.lockedFunds += deposit;
  listing.status = 'taken';
  listing.takerId = takerId;
  listing.takerName = taker.name;
  listing.takerNeighborhood = taker.neighborhood;

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

  const safeTaker = { ...taker }; delete safeTaker.passwordHash;
  const safeAuthor = { ...author }; delete safeAuthor.passwordHash;

  io.emit('listingUpdated', listing);
  io.emit('userUpdated', safeTaker);
  io.emit('userUpdated', safeAuthor);
  io.to(takerId).emit('notificationReceived', notifyTaker);
  io.to(listing.authorId).emit('notificationReceived', notifyAuthor);

  res.json({ listing, taker: safeTaker, author: safeAuthor });
});

app.post('/api/listings/:id/complete', authMiddleware, (req, res) => {
  const { id } = req.params;

  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'taken') return res.status(400).json({ error: 'Listing must be in "taken" state to complete' });

  const author = db.users.find(u => u.id === listing.authorId);
  const taker = db.users.find(u => u.id === listing.takerId);
  if (!author || !taker) return res.status(404).json({ error: 'Users not found' });

  const deposit = listing.deposit;
  let lockedUser = listing.type === 'offer' ? taker : author;
  let providerUser = listing.type === 'offer' ? author : taker;

  lockedUser.lockedFunds = Math.max(0, lockedUser.lockedFunds - deposit);
  lockedUser.wallet += deposit;
  providerUser.wallet += 5;
  listing.status = 'completed';

  const notifyTaker = {
    id: 'notif-' + Date.now() + '-3', userId: taker.id, type: 'transaction',
    title: 'Listing Completed!',
    message: listing.type === 'offer'
      ? `Transaction for "${listing.title}" complete. Escrow deposit of ${deposit} tokens returned.`
      : `Transaction for "${listing.title}" complete. You earned 5 Trust Tokens for your help!`,
    read: false, listingId: listing.id, createdAt: new Date().toISOString()
  };

  const notifyAuthor = {
    id: 'notif-' + Date.now() + '-4', userId: author.id, type: 'transaction',
    title: 'Listing Completed!',
    message: listing.type === 'offer'
      ? `Transaction for "${listing.title}" complete. You earned 5 Trust Tokens for lending!`
      : `Transaction for "${listing.title}" complete. Escrow deposit of ${deposit} tokens returned.`,
    read: false, listingId: listing.id, createdAt: new Date().toISOString()
  };

  db.notifications.push(notifyTaker, notifyAuthor);
  writeDB(db);

  const safeTaker = { ...taker }; delete safeTaker.passwordHash;
  const safeAuthor = { ...author }; delete safeAuthor.passwordHash;

  io.emit('listingUpdated', listing);
  io.emit('userUpdated', safeTaker);
  io.emit('userUpdated', safeAuthor);
  io.to(taker.id).emit('notificationReceived', notifyTaker);
  io.to(author.id).emit('notificationReceived', notifyAuthor);

  res.json({ listing, taker: safeTaker, author: safeAuthor });
});

app.post('/api/listings/:id/cancel-take', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const listing = db.listings.find(l => l.id === id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'taken') return res.status(400).json({ error: 'Listing not in progress' });

  const author = db.users.find(u => u.id === listing.authorId);
  const taker = db.users.find(u => u.id === listing.takerId);
  const deposit = listing.deposit;

  let lockedUser = listing.type === 'offer' ? taker : author;
  lockedUser.lockedFunds = Math.max(0, lockedUser.lockedFunds - deposit);
  lockedUser.wallet += deposit;

  const oldTakerId = listing.takerId;
  listing.status = 'active';
  listing.takerId = null;
  listing.takerName = null;
  listing.takerNeighborhood = null;

  const baseNotif = {
    type: 'transaction', title: 'Transaction Cancelled',
    message: `The transaction for "${listing.title}" was cancelled. Trust deposits have been refunded.`,
    read: false, listingId: listing.id, createdAt: new Date().toISOString()
  };

  db.notifications.push(
    { id: 'notif-' + Date.now() + '-5', userId: oldTakerId, ...baseNotif },
    { id: 'notif-' + Date.now() + '-6', userId: listing.authorId, ...baseNotif }
  );
  writeDB(db);

  const safeTaker = { ...taker }; delete safeTaker.passwordHash;
  const safeAuthor = { ...author }; delete safeAuthor.passwordHash;

  io.emit('listingUpdated', listing);
  io.emit('userUpdated', safeTaker);
  io.emit('userUpdated', safeAuthor);

  res.json({ listing });
});

// ===================== CHAT & NOTIFICATION ROUTES =====================

app.get('/api/chats/:roomId', authMiddleware, (req, res) => {
  const db = readDB();
  res.json(db.chats[req.params.roomId] || []);
});

app.get('/api/notifications/:userId', authMiddleware, (req, res) => {
  const db = readDB();
  res.json(db.notifications.filter(n => n.userId === req.params.userId));
});

app.post('/api/notifications/:id/read', authMiddleware, (req, res) => {
  const db = readDB();
  const notif = db.notifications.find(n => n.id === req.params.id);
  if (notif) { notif.read = true; writeDB(db); }
  res.json({ success: true });
});

app.post('/api/notifications/user/:userId/read-all', authMiddleware, (req, res) => {
  const db = readDB();
  db.notifications.forEach(n => { if (n.userId === req.params.userId) n.read = true; });
  writeDB(db);
  res.json({ success: true });
});

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('registerUser', (userId) => {
    socket.join(userId);
  });

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
  });

  socket.on('sendMessage', ({ roomId, senderId, senderName, content }) => {
    const db = readDB();
    if (!db.chats[roomId]) db.chats[roomId] = [];

    const newMessage = { senderId, senderName, content, timestamp: new Date().toISOString() };
    db.chats[roomId].push(newMessage);
    writeDB(db);
    io.to(roomId).emit('messageReceived', newMessage);

    if (roomId.endsWith('_private')) {
      const listingId = roomId.split('_')[1];
      const listing = db.listings.find(l => l.id === listingId);
      if (listing) {
        const recipientId = listing.authorId === senderId ? listing.takerId : listing.authorId;
        if (recipientId) {
          const chatNotif = {
            id: 'notif-' + Date.now(),
            userId: recipientId,
            type: 'chat',
            title: `New message from ${senderName}`,
            message: content.length > 50 ? content.substring(0, 47) + '...' : content,
            read: false, listingId: listing.id, chatType: 'private',
            createdAt: new Date().toISOString()
          };
          db.notifications.push(chatNotif);
          writeDB(db);
          io.to(recipientId).emit('notificationReceived', chatNotif);
        }
      }
    }
  });

  socket.on('typing', ({ roomId, userId, userName, isTyping }) => {
    socket.to(roomId).emit('userTyping', { userId, userName, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ===================== START =====================
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`ShareHood is running on http://localhost:${PORT}`);
  console.log(`==================================================`);
});
