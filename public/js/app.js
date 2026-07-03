// Core application state and event handlers
window.sharehoodApp = {
  users: [],
  currentUser: null,
  listings: [],
  notifications: [],
  
  // Chat state
  activeRoomId: null, // Private chat room ID currently open
  activePublicListingId: null, // Public listing ID modal currently open
  unreadChatCount: 0,
  typingTimeout: null,

  init: async function(user) {
    this.bindEvents();
    this.setCurrentUser(user);
    await this.loadListings();
    
    // Set active tab to Explore initially
    this.switchTab('explore');
  },

  bindEvents: function() {
    // Tab switching
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });

    // Listing filters
    document.getElementById('filterType').addEventListener('change', () => this.renderListingsGrid());
    document.getElementById('filterCategory').addEventListener('change', () => this.renderListingsGrid());
    document.getElementById('filterNeighborhood').addEventListener('change', () => this.renderListingsGrid());

    // Create listing form upload box styling
    const fileInput = document.getElementById('postImage');
    const uploadArea = document.getElementById('uploadArea');
    fileInput.addEventListener('change', (e) => {
      if (fileInput.files.length > 0) {
        document.getElementById('fileInfo').innerHTML = `Selected: <strong class="highlight">${fileInput.files[0].name}</strong>`;
        uploadArea.style.borderColor = 'var(--success)';
      }
    });

    // Create listing submission
    document.getElementById('createListingForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitListing();
    });

    // Notification dropdown toggle
    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      notifDropdown.classList.add('hidden');
    });

    notifDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Mark all read button
    document.getElementById('markAllReadBtn').addEventListener('click', () => {
      this.markAllNotificationsRead();
    });

    // Modal Close
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      this.closePublicChatModal();
    });

    // Public Chat Form
    document.getElementById('publicChatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitPublicChatMessage();
    });

    // Private Chat Form
    document.getElementById('privateChatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitPrivateChatMessage();
    });

    // Typing Indicators Event Listeners
    const publicInput = document.getElementById('publicChatInput');
    publicInput.addEventListener('input', () => {
      this.handleTypingBroadcast(`listing_${this.activePublicListingId}_public`);
    });

    const privateInput = document.getElementById('privateChatInput');
    privateInput.addEventListener('input', () => {
      this.handleTypingBroadcast(this.activeRoomId);
    });

    // Chat listing view button
    document.getElementById('chatViewListingBtn').addEventListener('click', () => {
      if (this.activeRoomId) {
        const listingId = this.activeRoomId.split('_')[1];
        this.openPublicChatModal(listingId);
      }
    });

    // Chat complete button
    document.getElementById('chatCompleteTransactionBtn').addEventListener('click', () => {
      if (this.activeRoomId) {
        const listingId = this.activeRoomId.split('_')[1];
        this.completeTransaction(listingId);
      }
    });

    // Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      this.toggleTheme();
    });
  },

  // ================= USER IDENTITY =================
  setCurrentUser: function(user) {
    this.currentUser = user;
    
    // Update wallet display
    document.getElementById('walletBalance').textContent = `${user.wallet} TF`;
    document.getElementById('walletLocked').textContent = `(${user.lockedFunds || 0} Locked)`;
    document.getElementById('currentNeighborLabel').textContent = user.neighborhood;

    // Register with socket
    if (window.sharehoodSocket) {
      window.sharehoodSocket.registerUser(user.id);
    }

    // Refresh notifications
    this.loadNotifications();

    // Reload dashboards & private chats
    this.loadPrivateChatsList();
    this.renderWorkspace();
    this.renderListingsGrid();
  },

  // ================= GENERAL API DATA LOADING =================
  loadListings: async function() {
    try {
      const response = await sharehoodAuth.fetchWithAuth('/api/listings');
      if (!response) return;
      this.listings = await response.json();
      this.renderListingsGrid();
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    }
  },

  loadNotifications: async function() {
    if (!this.currentUser) return;
    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/notifications/${this.currentUser.id}`);
      if (!response) return;
      this.notifications = await response.json();
      this.renderNotificationsDropdown();
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  },

  // ================= NAVIGATION & ROUTING =================
  switchTab: function(tabName) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeTabButton = document.querySelector(`.sidebar-tab[data-tab="${tabName}"]`);
    const activeContentSection = document.getElementById(`${tabName}Tab`);

    if (activeTabButton) activeTabButton.classList.add('active');
    if (activeContentSection) activeContentSection.classList.add('active');

    // Tab-specific loading routines
    if (tabName === 'explore') {
      this.loadListings();
    } else if (tabName === 'workspace') {
      this.renderWorkspace();
    } else if (tabName === 'messages') {
      this.loadPrivateChatsList();
      this.clearChatAlertBadge();
    }
  },

  // ================= EXPLORE FEED RENDERER =================
  renderListingsGrid: function() {
    const grid = document.getElementById('listingsGrid');
    grid.innerHTML = '';

    const filterType = document.getElementById('filterType').value;
    const filterCategory = document.getElementById('filterCategory').value;
    const filterNeighborhood = document.getElementById('filterNeighborhood').value;

    const filtered = this.listings.filter(listing => {
      // 1. Don't show completed listings on the main Explore page
      if (listing.status === 'completed') return false;

      // 2. Type filter (offer vs request)
      if (filterType !== 'all' && listing.type !== filterType) return false;

      // 3. Category filter (item vs service)
      if (filterCategory !== 'all' && listing.category !== filterCategory) return false;

      // 4. Neighborhood filter
      if (filterNeighborhood !== 'all' && listing.authorNeighborhood !== filterNeighborhood) return false;

      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 60px 20px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px; height:48px; margin-bottom:12px; opacity:0.5;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12h8"/>
          </svg>
          <p>No listings match your selection. Be the first to post!</p>
        </div>
      `;
      return;
    }

    filtered.forEach(listing => {
      const card = document.createElement('div');
      card.className = `listing-card ${listing.status}`;
      card.id = `card-${listing.id}`;

      const isOwner = listing.authorId === this.currentUser.id;
      
      // Select appropriate label for buttons
      let actionLabel = 'Take Offer';
      if (listing.type === 'request') {
        actionLabel = 'Fulfill Request';
      }
      if (listing.status === 'taken') {
        actionLabel = 'In Progress';
      }

      card.innerHTML = `
        <div class="listing-image-container">
          <span class="badge-type ${listing.type}">${listing.type === 'offer' ? 'Offer' : 'Request'}</span>
          <span class="badge-status ${listing.status}">${listing.status}</span>
          <img src="${listing.image}" alt="${listing.title}" onerror="this.src='/uploads/seed-ladder.webp'">
          <div class="deposit-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>${listing.deposit} TF</span>
          </div>
        </div>
        <div class="listing-details">
          <div class="listing-meta-row">
            <span class="listing-neighborhood">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
              </svg>
              ${listing.authorNeighborhood}
            </span>
            <span class="listing-date">${this.formatRelativeTime(listing.createdAt)}</span>
          </div>
          <h3 class="listing-title">${listing.title}</h3>
          <p class="listing-description">${listing.description}</p>
          <div class="listing-author-credit">
            By <strong>${listing.authorName}</strong> ${isOwner ? '<span class="highlight">(You)</span>' : ''}
          </div>
          <div class="listing-location-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${listing.location}</span>
          </div>
          <div class="card-actions" style="margin-top: 14px;">
            <button class="card-btn card-btn-secondary" onclick="window.sharehoodApp.openPublicChatModal('${listing.id}')">
              Discussion Board
            </button>
            <button class="card-btn card-btn-primary" 
                    id="action-btn-${listing.id}"
                    ${isOwner || listing.status !== 'active' ? 'disabled' : ''} 
                    onclick="window.sharehoodApp.takeListing('${listing.id}')">
              ${isOwner ? 'Your Post' : actionLabel}
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  },

  // ================= POSTING LISTINGS FORM =================
  submitListing: async function() {
    const form = document.getElementById('createListingForm');
    const submitBtn = document.getElementById('submitPostBtn');
    
    // Add current user ID to form
    const formData = new FormData(form);
    formData.append('authorId', this.currentUser.id);

    submitBtn.textContent = 'Publishing...';
    submitBtn.disabled = true;

    try {
      const response = await sharehoodAuth.fetchWithAuth('/api/listings', {
        method: 'POST',
        body: formData
      });

      if (!response) return;
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server error occurred');
      }

      const listing = await response.json();
      this.showNotificationToast({
        title: 'Listing Published!',
        message: `Successfully posted "${listing.title}" on the Board.`,
        type: 'transaction'
      });

      // Reset form designs
      form.reset();
      document.getElementById('fileInfo').innerHTML = 'Max file size: 5MB';
      document.getElementById('uploadArea').style.borderColor = 'var(--border-color)';

      // Switch tab to board
      this.switchTab('explore');
    } catch (err) {
      console.error(err);
      alert('Failed to publish post: ' + err.message);
    } finally {
      submitBtn.textContent = 'Publish ShareHood Post';
      submitBtn.disabled = false;
    }
  },

  // ================= TRUST TRANSACTION MUTATIONS =================
  takeListing: async function(listingId) {
    const listing = this.listings.find(l => l.id === listingId);
    if (!listing) return;

    const actionBtn = document.getElementById(`action-btn-${listingId}`);
    if (actionBtn) actionBtn.disabled = true;

    // Determine who locks funds to display confirmation
    const lockingUser = listing.type === 'offer' ? 'You' : listing.authorName;
    const lockingWallet = listing.type === 'offer' ? this.currentUser : this.users.find(u => u.id === listing.authorId);
    
    if (lockingWallet && lockingWallet.wallet < listing.deposit) {
      alert(`Transaction cannot proceed. Insufficient trust funds. ${lockingWallet.id === this.currentUser.id ? 'You' : listing.authorName} must have at least ${listing.deposit} Trust Tokens, but has only ${lockingWallet.wallet}.`);
      if (actionBtn) actionBtn.disabled = false;
      return;
    }

    const confirmMsg = listing.type === 'offer'
      ? `Accepting "${listing.title}" will lock ${listing.deposit} Trust Tokens in escrow from your wallet until it is completed. Agree?`
      : `Volunteering to fulfill "${listing.title}". Neighborhood safety rules will lock ${listing.deposit} Tokens in escrow from ${listing.authorName}'s wallet. Agree?`;

    if (!confirm(confirmMsg)) {
      if (actionBtn) actionBtn.disabled = false;
      return;
    }

    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/listings/${listingId}/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ takerId: this.currentUser.id })
      });

      if (!response) return;
      const result = await response.json();
      
      this.showNotificationToast({
        title: 'Agreement Secured!',
        message: `Escrow setup complete. Check Private Chats to organize meetup.`,
        type: 'transaction'
      });

      // Reload state
      await this.loadListings();
      this.switchTab('messages');
      this.openPrivateChat(listingId);
    } catch (err) {
      alert(err.message);
      if (actionBtn) actionBtn.disabled = false;
    }
  },

  completeTransaction: async function(listingId) {
    const listing = this.listings.find(l => l.id === listingId);
    if (!listing) return;

    if (!confirm(`Are you sure this transaction is complete and the item is returned or volunteer service is done? This will refund locked escrow deposits and reward the lender.`)) {
      return;
    }

    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/listings/${listingId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.currentUser.id })
      });

      if (!response) return;

      this.showNotificationToast({
        title: 'Lending Complete!',
        message: `Tokens released from escrow. Thank you for building trust!`,
        type: 'transaction'
      });

      // Reload state
      await this.loadListings();
      this.closePrivateChatPane();
      this.renderWorkspace();
    } catch (err) {
      alert(err.message);
    }
  },

  cancelTakeListing: async function(listingId) {
    if (!confirm('Are you sure you want to cancel this agreement? Any locked Trust Tokens will be immediately returned to their wallets.')) {
      return;
    }

    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/listings/${listingId}/cancel-take`, {
        method: 'POST'
      });

      if (!response) return;

      this.showNotificationToast({
        title: 'Agreement Cancelled',
        message: `Escrow has been refunded. Post is now active again.`,
        type: 'transaction'
      });

      await this.loadListings();
      this.closePrivateChatPane();
      this.renderWorkspace();
    } catch (err) {
      alert(err.message);
    }
  },

  // ================= WORKSPACE DASHBOARD (PENDING SECTIONS) =================
  renderWorkspace: function() {
    if (!this.currentUser) return;

    const myRequestsList = document.getElementById('myRequestsList');
    const myOffersList = document.getElementById('myOffersList');
    const myBorrowingList = document.getElementById('myBorrowingList');

    myRequestsList.innerHTML = '';
    myOffersList.innerHTML = '';
    myBorrowingList.innerHTML = '';

    let requestsCount = 0;
    let offersCount = 0;
    let borrowingCount = 0;

    // Sort listings to separate them cleanly (don't lump it up!)
    this.listings.forEach(listing => {
      const isOwner = listing.authorId === this.currentUser.id;
      const isTaker = listing.takerId === this.currentUser.id;

      // Card structure HTML helper
      const generateRowHtml = (l, role) => {
        let actionBtnHtml = '';
        let statusBadgeClass = l.status;
        
        if (l.status === 'taken') {
          if (role === 'owner') {
            actionBtnHtml = `
              <button class="action-btn-sm success-btn" onclick="window.sharehoodApp.completeTransaction('${l.id}')">Complete</button>
              <button class="action-btn-sm danger-btn" onclick="window.sharehoodApp.cancelTakeListing('${l.id}')">Cancel</button>
            `;
          } else if (role === 'taker') {
            actionBtnHtml = `
              <button class="action-btn-sm primary-btn" onclick="window.sharehoodApp.switchTab('messages'); window.sharehoodApp.openPrivateChat('${l.id}')">Chat</button>
              <button class="action-btn-sm danger-btn" onclick="window.sharehoodApp.cancelTakeListing('${l.id}')">Cancel</button>
            `;
          }
        } else if (l.status === 'active' && role === 'owner') {
          actionBtnHtml = `
            <button class="action-btn-sm primary-btn" onclick="window.sharehoodApp.openPublicChatModal('${l.id}')">Discussions</button>
          `;
        }

        // Taker details
        let takerLabel = '';
        if (l.status === 'taken' && l.takerName) {
          takerLabel = `<span class="bold-term">Taker:</span> ${l.takerName} (${l.takerNeighborhood})`;
        } else if (l.status === 'completed' && l.takerName) {
          takerLabel = `<span class="bold-term">Completed by:</span> ${l.takerName}`;
        } else {
          takerLabel = `<span class="bold-term">Location:</span> ${l.location}`;
        }

        return `
          <div class="workspace-item-row" id="work-${l.id}">
            <div class="item-left">
              <img class="item-thumb" src="${l.image}" onerror="this.src='/uploads/seed-ladder.webp'">
              <div class="item-title-box">
                <h4>${l.title}</h4>
                <div class="item-details-meta">
                  <span><span class="bold-term">Deposit:</span> ${l.deposit} TF</span>
                  <span>${takerLabel}</span>
                </div>
              </div>
            </div>
            <div class="item-right">
              <span class="status-indicator-tag ${statusBadgeClass}">${l.status}</span>
              ${actionBtnHtml}
            </div>
          </div>
        `;
      };

      // 1. My Requests & Borrows (Current user created, type = request)
      if (isOwner && listing.type === 'request') {
        myRequestsList.innerHTML += generateRowHtml(listing, 'owner');
        requestsCount++;
      }
      // 2. My Offers & Lent Items (Current user created, type = offer)
      else if (isOwner && listing.type === 'offer') {
        myOffersList.innerHTML += generateRowHtml(listing, 'owner');
        offersCount++;
      }
      // 3. My Borrowed Items / Assisting Agreements (Current user is taker)
      else if (isTaker) {
        myBorrowingList.innerHTML += generateRowHtml(listing, 'taker');
        borrowingCount++;
      }
    });

    // Update counts
    document.getElementById('myRequestsCounter').textContent = requestsCount;
    document.getElementById('myOffersCounter').textContent = offersCount;
    document.getElementById('myBorrowingCounter').textContent = borrowingCount;

    // If any section is empty, display helper message
    if (requestsCount === 0) {
      myRequestsList.innerHTML = `<div class="empty-state">No pending requests published by you.</div>`;
    }
    if (offersCount === 0) {
      myOffersList.innerHTML = `<div class="empty-state">No offers published by you.</div>`;
    }
    if (borrowingCount === 0) {
      myBorrowingList.innerHTML = `<div class="empty-state">You have no active agreements in progress.</div>`;
    }

    // Set side navigation warning indicator if user has pending actions
    const totalWorkspaceItems = requestsCount + offersCount + borrowingCount;
    const alertBadge = document.getElementById('workspaceBadge');
    if (this.listings.some(l => l.status === 'taken' && (l.authorId === this.currentUser.id || l.takerId === this.currentUser.id))) {
      alertBadge.classList.remove('hidden');
    } else {
      alertBadge.classList.add('hidden');
    }
  },

  // ================= PUBLIC DISCUSSIONS CODE =================
  openPublicChatModal: async function(listingId) {
    const listing = this.listings.find(l => l.id === listingId);
    if (!listing) return;

    this.activePublicListingId = listingId;
    
    // Join socket room
    if (window.sharehoodSocket) {
      window.sharehoodSocket.joinRoom(`listing_${listingId}_public`);
    }

    // Populate modal summary details
    document.getElementById('modalListingType').textContent = listing.type === 'offer' ? 'Offer' : 'Request';
    document.getElementById('modalListingType').className = `modal-badge-type ${listing.type}`;
    document.getElementById('modalListingTitle').textContent = listing.title;
    document.getElementById('modalListingNeighborhood').textContent = `${listing.authorName} (${listing.authorNeighborhood})`;
    document.getElementById('modalListingImage').src = listing.image;
    document.getElementById('modalListingDesc').textContent = listing.description;
    document.getElementById('modalListingLocation').textContent = listing.location;
    document.getElementById('modalListingDeposit').textContent = listing.deposit;
    document.getElementById('modalListingAuthor').textContent = listing.authorName;

    // Clear public inputs
    document.getElementById('publicChatInput').value = '';
    document.getElementById('publicTypingIndicator').classList.add('hidden');

    // Show modal
    document.getElementById('publicChatModal').classList.remove('hidden');

    // Load message history
    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/chats/listing_${listingId}_public`);
      if (!response) return;
      const messages = await response.json();
      const chatContainer = document.getElementById('publicChatMessages');
      chatContainer.innerHTML = '';
      messages.forEach(msg => this.appendMessageToContainer(chatContainer, msg));
      this.scrollToBottom(chatContainer);
    } catch (err) {
      console.error(err);
    }
  },

  closePublicChatModal: function() {
    document.getElementById('publicChatModal').classList.add('hidden');
    if (window.sharehoodSocket && this.activePublicListingId) {
      // Leave public room
      window.sharehoodSocket.socket.emit('leaveRoom', `listing_${this.activePublicListingId}_public`);
    }
    this.activePublicListingId = null;
  },

  submitPublicChatMessage: function() {
    const input = document.getElementById('publicChatInput');
    const content = input.value.trim();
    if (!content || !this.activePublicListingId) return;

    const roomId = `listing_${this.activePublicListingId}_public`;
    if (window.sharehoodSocket) {
      window.sharehoodSocket.sendMessage(roomId, this.currentUser.id, this.currentUser.name, content);
      // Cancel typing indicator immediately on send
      window.sharehoodSocket.sendTypingStatus(roomId, this.currentUser.id, this.currentUser.name, false);
    }
    input.value = '';
  },

  // ================= PRIVATE CHATS LOGIC =================
  loadPrivateChatsList: async function() {
    if (!this.currentUser) return;
    const list = document.getElementById('chatRoomsList');
    list.innerHTML = '';

    // Active chats are listings that are 'taken' where user is author or taker
    const activeChats = this.listings.filter(l => l.status === 'taken' && (l.authorId === this.currentUser.id || l.takerId === this.currentUser.id));

    if (activeChats.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding: 24px 10px; font-size:0.75rem;">No active arrangements. Take an item or publish a request to start.</div>`;
      return;
    }

    activeChats.forEach(l => {
      const otherUser = l.authorId === this.currentUser.id 
        ? { name: l.takerName, neighbor: l.takerNeighborhood }
        : { name: l.authorName, neighbor: l.authorNeighborhood };

      const item = document.createElement('div');
      item.className = `chat-room-item ${this.activeRoomId === `listing_${l.id}_private` ? 'active' : ''}`;
      item.id = `room-item-${l.id}`;
      item.onclick = () => this.openPrivateChat(l.id);

      item.innerHTML = `
        <img class="room-thumb" src="${l.image}" onerror="this.src='/uploads/seed-ladder.webp'">
        <div class="room-item-details">
          <div class="room-item-title">${l.title}</div>
          <div class="room-item-desc">Chatting with ${otherUser.name} (${otherUser.neighbor})</div>
        </div>
      `;
      list.appendChild(item);
    });
  },

  openPrivateChat: async function(listingId) {
    const listing = this.listings.find(l => l.id === listingId);
    if (!listing) return;

    this.activeRoomId = `listing_${listingId}_private`;
    
    // Highlight list selection
    document.querySelectorAll('.chat-room-item').forEach(item => item.classList.remove('active'));
    const selectedItem = document.getElementById(`room-item-${listingId}`);
    if (selectedItem) selectedItem.classList.add('active');

    // Show pane
    document.getElementById('chatPaneEmpty').classList.add('hidden');
    document.getElementById('chatPaneActive').classList.remove('hidden');

    // Title info
    const otherUser = listing.authorId === this.currentUser.id 
      ? { name: listing.takerName, neighbor: listing.takerNeighborhood }
      : { name: listing.authorName, neighbor: listing.authorNeighborhood };

    document.getElementById('chatRoomTitle').textContent = listing.title;
    document.getElementById('chatRoomSubtitle').textContent = `Between you and ${otherUser.name} (${otherUser.neighbor})`;
    document.getElementById('escrowStatusText').textContent = `Trust Escrow Active: ${listing.deposit} Tokens Secured`;

    // Only creator of the listing sees "Complete" button
    const completeBtn = document.getElementById('chatCompleteTransactionBtn');
    if (listing.authorId === this.currentUser.id) {
      completeBtn.classList.remove('hidden');
    } else {
      completeBtn.classList.add('hidden');
    }

    // Connect to room via socket
    if (window.sharehoodSocket) {
      window.sharehoodSocket.joinRoom(this.activeRoomId);
    }

    // Reset input
    document.getElementById('privateChatInput').value = '';
    document.getElementById('privateTypingIndicator').classList.add('hidden');

    // Load message logs
    try {
      const response = await sharehoodAuth.fetchWithAuth(`/api/chats/${this.activeRoomId}`);
      if (!response) return;
      const messages = await response.json();
      const chatContainer = document.getElementById('privateChatMessages');
      chatContainer.innerHTML = '';
      messages.forEach(msg => this.appendMessageToContainer(chatContainer, msg));
      this.scrollToBottom(chatContainer);
    } catch (err) {
      console.error(err);
    }
  },

  closePrivateChatPane: function() {
    this.activeRoomId = null;
    document.getElementById('chatPaneActive').classList.add('hidden');
    document.getElementById('chatPaneEmpty').classList.remove('hidden');
    this.loadPrivateChatsList();
  },

  submitPrivateChatMessage: function() {
    const input = document.getElementById('privateChatInput');
    const content = input.value.trim();
    if (!content || !this.activeRoomId) return;

    if (window.sharehoodSocket) {
      window.sharehoodSocket.sendMessage(this.activeRoomId, this.currentUser.id, this.currentUser.name, content);
      window.sharehoodSocket.sendTypingStatus(this.activeRoomId, this.currentUser.id, this.currentUser.name, false);
    }
    input.value = '';
  },

  // ================= CHAT UI HELPERS =================
  appendChatMessage: function(msg) {
    // Detect which container to append to
    let chatContainer = null;
    const isPublic = window.sharehoodSocket.currentRoom.endsWith('_public');
    
    if (isPublic) {
      chatContainer = document.getElementById('publicChatMessages');
    } else {
      chatContainer = document.getElementById('privateChatMessages');
    }

    if (chatContainer) {
      this.appendMessageToContainer(chatContainer, msg);
      this.scrollToBottom(chatContainer);
    }
  },

  appendMessageToContainer: function(container, msg) {
    const isMe = msg.senderId === this.currentUser.id;
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isMe ? 'sent' : 'received'}`;
    
    wrapper.innerHTML = `
      <div class="msg-sender">${isMe ? 'You' : msg.senderName}</div>
      <div class="msg-bubble">${msg.content}</div>
      <div class="msg-time">${this.formatChatTime(msg.timestamp)}</div>
    `;
    container.appendChild(wrapper);
  },

  handleTypingBroadcast: function(roomId) {
    if (!roomId || !window.sharehoodSocket) return;
    
    // Send active status
    window.sharehoodSocket.sendTypingStatus(roomId, this.currentUser.id, this.currentUser.name, true);

    // Cancel previous timeout
    clearTimeout(this.typingTimeout);
    
    // Set timeout to clear typing after 2 seconds
    this.typingTimeout = setTimeout(() => {
      window.sharehoodSocket.sendTypingStatus(roomId, this.currentUser.id, this.currentUser.name, false);
    }, 2000);
  },

  toggleTypingIndicator: function(userId, userName, isTyping) {
    // Only show typing indicators for OTHER users
    if (userId === this.currentUser.id) return;

    const isPublic = window.sharehoodSocket.currentRoom && window.sharehoodSocket.currentRoom.endsWith('_public');
    const indicatorBar = isPublic 
      ? document.getElementById('publicTypingIndicator')
      : document.getElementById('privateTypingIndicator');

    if (indicatorBar) {
      if (isTyping) {
        indicatorBar.querySelector('.text').textContent = `${userName} is typing...`;
        indicatorBar.classList.remove('hidden');
      } else {
        indicatorBar.classList.add('hidden');
      }
    }
  },

  scrollToBottom: function(element) {
    element.scrollTop = element.scrollHeight;
  },

  // ================= NOTIFICATIONS LOGIC =================
  renderNotificationsDropdown: function() {
    const list = document.getElementById('notifList');
    list.innerHTML = '';

    const unread = this.notifications.filter(n => !n.read);
    const badge = document.getElementById('notifBadge');
    
    if (unread.length > 0) {
      badge.textContent = unread.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    if (this.notifications.length === 0) {
      list.innerHTML = `<div class="empty-state">No notifications yet.</div>`;
      return;
    }

    // Sort newest first
    const sorted = [...this.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sorted.forEach(n => {
      const item = document.createElement('div');
      item.className = `notif-item ${!n.read ? 'unread' : ''}`;
      
      // If notification is click-navigable (like a chat notification)
      item.onclick = async () => {
        await this.markNotificationRead(n.id);
        if (n.type === 'chat' && n.listingId) {
          this.switchTab('messages');
          this.openPrivateChat(n.listingId);
        } else if (n.type === 'transaction') {
          this.switchTab('workspace');
        }
        document.getElementById('notifDropdown').classList.add('hidden');
      };

      item.innerHTML = `
        <span class="notif-title">${n.title}</span>
        <span class="notif-desc">${n.message}</span>
        <span class="notif-time">${this.formatRelativeTime(n.createdAt)}</span>
      `;
      list.appendChild(item);
    });
  },

  addNotificationToList: function(notification) {
    // Add to state and render
    this.notifications.unshift(notification);
    this.renderNotificationsDropdown();
  },

  showNotificationToast: function(notification) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${notification.type || 'chat'}`;

    // Mascot Toast Icon
    let iconHtml = `<img src="/mascot_waving.jpg" alt="Mascot Alert" class="toast-mascot-icon">`;
    if (notification.type === 'transaction') {
      iconHtml = `<img src="/mascot_success.jpg" alt="Mascot Success" class="toast-mascot-icon">`;
    }

    toast.innerHTML = `
      ${iconHtml}
      <div class="toast-content">
        <span class="toast-title">${notification.title}</span>
        <span class="toast-message">${notification.message}</span>
      </div>
    `;

    // Toast click navigates user to tab
    toast.onclick = () => {
      if (notification.type === 'chat' && notification.listingId) {
        this.switchTab('messages');
        this.openPrivateChat(notification.listingId);
      } else {
        this.switchTab('workspace');
      }
      toast.remove();
    };

    container.appendChild(toast);
    
    // Auto-remove after 5s
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s reverse';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  },

  markNotificationRead: async function(id) {
    try {
      await sharehoodAuth.fetchWithAuth(`/api/notifications/${id}/read`, { method: 'POST' });
      const notif = this.notifications.find(n => n.id === id);
      if (notif) notif.read = true;
      this.renderNotificationsDropdown();
    } catch (err) {
      console.error(err);
    }
  },

  markAllNotificationsRead: async function() {
    if (!this.currentUser) return;
    try {
      await sharehoodAuth.fetchWithAuth(`/api/notifications/user/${this.currentUser.id}/read-all`, { method: 'POST' });
      this.notifications.forEach(n => n.read = true);
      this.renderNotificationsDropdown();
    } catch (err) {
      console.error(err);
    }
  },

  incrementChatAlertBadge: function(amount) {
    this.unreadChatCount += amount;
    const badge = document.getElementById('chatAlertBadge');
    if (this.unreadChatCount > 0) {
      badge.textContent = this.unreadChatCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  clearChatAlertBadge: function() {
    this.unreadChatCount = 0;
    document.getElementById('chatAlertBadge').classList.add('hidden');
  },

  // ================= REALTIME SYNC HANDLERS FROM SOCKETS =================
  handleListingCreatedRealtime: function(listing) {
    // 1. Add to state
    this.listings.unshift(listing);
    // 2. Refresh UI feeds
    this.renderListingsGrid();
    this.renderWorkspace();
  },

  handleListingUpdatedRealtime: function(listing) {
    // 1. Update listing in local array
    const idx = this.listings.findIndex(l => l.id === listing.id);
    if (idx !== -1) {
      this.listings[idx] = listing;
    } else {
      this.listings.push(listing);
    }

    // 2. If the active chat room header is displaying this listing, refresh subtitle
    if (this.activeRoomId === `listing_${listing.id}_private`) {
      const otherUser = listing.authorId === this.currentUser.id 
        ? { name: listing.takerName, neighbor: listing.takerNeighborhood }
        : { name: listing.authorName, neighbor: listing.authorNeighborhood };
      
      document.getElementById('chatRoomSubtitle').textContent = `Between you and ${otherUser.name} (${otherUser.neighbor})`;
      
      // If completed or cancelled, handle state
      if (listing.status === 'completed') {
        alert('This arrangement has been marked complete by the listing owner.');
        this.closePrivateChatPane();
      } else if (listing.status === 'active') {
        alert('This arrangement has been cancelled.');
        this.closePrivateChatPane();
      }
    }

    // 3. Refresh grids
    this.renderListingsGrid();
    this.renderWorkspace();
    this.loadPrivateChatsList();
  },

  handleUserUpdatedRealtime: function(updatedUser) {
    // Update local users array
    const idx = this.users.findIndex(u => u.id === updatedUser.id);
    if (idx !== -1) {
      this.users[idx] = updatedUser;
    }

    // If it's current logged in user, refresh wallet UI
    if (this.currentUser && this.currentUser.id === updatedUser.id) {
      this.currentUser = updatedUser;
      document.getElementById('walletBalance').textContent = `${updatedUser.wallet} TF`;
      document.getElementById('walletLocked').textContent = `(${updatedUser.lockedFunds} Locked)`;
    }
  },

  // ================= THEME TOGGLE (DARK / LIGHT) =================
  toggleTheme: function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('sharehood_theme', newTheme);
  },

  // ================= GENERAL DATE/TIME FORMATTERS =================
  formatChatTime: function(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  formatRelativeTime: function(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDays}d ago`;
  }
};

// Start application when DOM loads
window.addEventListener('DOMContentLoaded', () => {
  // Restore theme preference
  const savedTheme = localStorage.getItem('sharehood_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
});
