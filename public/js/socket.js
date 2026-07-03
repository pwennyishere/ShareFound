// Establishes and manages the Socket.io real-time connection and logic
const socket = io();

// Global Socket manager object
window.sharehoodSocket = {
  socket: socket,
  currentRoom: null,
  typingTimeout: null,

  // Register the logged in user with Socket.io (so the server can send direct notifications)
  registerUser: (userId) => {
    socket.emit('registerUser', userId);
  },

  // Join a discussion room (public or private)
  joinRoom: (roomId) => {
    if (window.sharehoodSocket.currentRoom) {
      socket.emit('leaveRoom', window.sharehoodSocket.currentRoom);
    }
    window.sharehoodSocket.currentRoom = roomId;
    socket.emit('joinRoom', roomId);
    console.log(`Joined socket room: ${roomId}`);
  },

  // Send a chat message
  sendMessage: (roomId, senderId, senderName, content) => {
    socket.emit('sendMessage', { roomId, senderId, senderName, content });
  },

  // Broadcast typing status
  sendTypingStatus: (roomId, userId, userName, isTyping) => {
    socket.emit('typing', { roomId, userId, userName, isTyping });
  }
};

// Wire up global socket-level event listeners
socket.on('connect', () => {
  console.log('Connected to ShareHood socket gateway');
  // Re-register if user is already loaded
  if (window.sharehoodApp && window.sharehoodApp.currentUser) {
    window.sharehoodSocket.registerUser(window.sharehoodApp.currentUser.id);
  }
});

// Receive real-time chat messages
socket.on('messageReceived', (message) => {
  console.log('New message received:', message);
  
  // 1. If we are currently viewing the chat room where this message belongs
  const activeRoomId = window.sharehoodApp ? window.sharehoodApp.activeRoomId : null;
  const isPublicModalOpen = window.sharehoodApp ? !document.getElementById('publicChatModal').classList.contains('hidden') : false;
  const currentPublicListingId = window.sharehoodApp ? window.sharehoodApp.activePublicListingId : null;
  
  // Check if message belongs to the active private chat or active public modal
  const isForActivePrivate = activeRoomId && (window.sharehoodSocket.currentRoom === activeRoomId);
  const isForActivePublic = isPublicModalOpen && currentPublicListingId && (window.sharehoodSocket.currentRoom === `listing_${currentPublicListingId}_public`);

  if (isForActivePrivate || isForActivePublic) {
    if (window.sharehoodApp) {
      window.sharehoodApp.appendChatMessage(message);
    }
  } else {
    // 2. Message is for a room we are not viewing -> trigger notification dot / badge increment
    if (window.sharehoodApp) {
      // Find out if it's a private chat message
      if (window.sharehoodSocket.currentRoom && window.sharehoodSocket.currentRoom.endsWith('_private')) {
        window.sharehoodApp.incrementChatAlertBadge(1);
        // Refresh private chat rooms list in background to show preview
        window.sharehoodApp.loadPrivateChatsList();
      }
    }
  }
});

// Handle typing indicator from other users
socket.on('userTyping', ({ userId, userName, isTyping }) => {
  if (window.sharehoodApp) {
    window.sharehoodApp.toggleTypingIndicator(userId, userName, isTyping);
  }
});

// Listing updates (creation, accepts, completions)
socket.on('listingCreated', (listing) => {
  console.log('Realtime listing created:', listing);
  if (window.sharehoodApp) {
    window.sharehoodApp.handleListingCreatedRealtime(listing);
  }
});

socket.on('listingUpdated', (listing) => {
  console.log('Realtime listing updated:', listing);
  if (window.sharehoodApp) {
    window.sharehoodApp.handleListingUpdatedRealtime(listing);
  }
});

// User wallet updates
socket.on('userUpdated', (updatedUser) => {
  console.log('Realtime user wallet updated:', updatedUser);
  if (window.sharehoodApp) {
    window.sharehoodApp.handleUserUpdatedRealtime(updatedUser);
  }
});

// Direct user notification notifications
socket.on('notificationReceived', (notification) => {
  console.log('Realtime notification received:', notification);
  if (window.sharehoodApp) {
    window.sharehoodApp.addNotificationToList(notification);
    window.sharehoodApp.showNotificationToast(notification);
  }
});
