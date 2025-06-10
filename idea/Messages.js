// --- CONSTANTS ---
const JWT_TOKEN_KEY = "auth_token";
const SOCKET_SERVER = "http://localhost:3000";
const DEBOUNCE_DELAY = 100; // ms

// Initialize socket with auto-connect disabled
const socket = io(SOCKET_SERVER, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Global state
let currentUser = null;
let currentUserId = null;
let currentUserMysqlId = null;
let currentChatId = null;
let allUsersForSelection = [];
let fetchedChatsData = new Map();
let userStatusCache = new Map(); // Central cache for user statuses
let studentStatusCache = new Map(); // Cache for student statuses
let isAuthenticated = false; // Track authentication state
let lastChatUpdate = 0; // Track last chat update timestamp
let chatUpdateTimeout = null; // For debouncing

// Initialize chat when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    // Initialize chat
    initializeChat();

    // Set up event listeners
    setupEventListeners();

    // Set up status updates
    setupStatusUpdates();
    
    // Set up socket connection
    setupSocketEvents();
    
    // Load initial chats
    loadChats();
});

// Function to initialize chat
function initializeChat() {
    const storedUser = sessionStorage.getItem("user");
    const jwtToken = sessionStorage.getItem(JWT_TOKEN_KEY);

    if (!storedUser || !jwtToken) {
        console.error("User not logged in or JWT token missing. Chat disabled.");
        disableChatFunctionality("Please log in to use Messages.");
        window.location.href = "login.html";
        return false;
    }
    
    try {
        currentUser = JSON.parse(storedUser);
        console.log("Found user and token in sessionStorage. User:", currentUser);
        
        // Update the UI with user info
        updateUserProfile();

        // Connect socket with authentication
        socket.auth = {
            token: jwtToken,
            userInfo: {
                id: currentUser.id,
                first_name: currentUser.first_name,
                last_name: currentUser.last_name,
                avatar: currentUser.avatar || 'assets/profile-chat.png'
            }
        };
        socket.connect();

        return true;
    } catch (error) {
        console.error("Error initializing chat:", error);
        disableChatFunctionality("Error initializing chat. Please try again.");
        return false;
    }
}

// Function to update user profile in UI
function updateUserProfile() {
    const profileNameElement = document.getElementById("profileName");
    const profileImageElement = document.getElementById("profileUserImage");
    
    if (profileNameElement) {
        profileNameElement.textContent = `${currentUser.first_name} ${currentUser.last_name}`;
    }
    if (profileImageElement) {
        profileImageElement.src = currentUser.avatar || 'assets/user.png';
    }
}

// Function to set up event listeners
function setupEventListeners() {
    // Chat creation and editing
    setupChatCreation();
    
    // Message sending
    setupMessageSending();
    
    // Socket events
    setupSocketEvents();
}

// Function to set up chat creation
function setupChatCreation() {
    const createNewChatBtn = document.getElementById('createNewChatBtn');
    const newChatModal = document.getElementById('newChatModal');
    const closeNewChatModal = document.getElementById('closeNewChatModal');
    const cancelNewChat = document.getElementById('cancelNewChat');
    const newChatForm = document.getElementById('newChatForm');
    const userSearchInput = document.getElementById('userSearchInput');

    if (createNewChatBtn && newChatModal) {
        createNewChatBtn.addEventListener('click', async () => {
            newChatModal.style.display = 'block';
            await fetchAndDisplayUsers();
        });
    }

    if (closeNewChatModal && cancelNewChat && newChatModal) {
        const closeModal = () => {
            newChatModal.style.display = 'none';
            if (newChatForm) newChatForm.reset();
            const errorMessage = document.getElementById('errorMessageUsers');
            if (errorMessage) errorMessage.style.display = 'none';
        };

        closeNewChatModal.addEventListener('click', closeModal);
        cancelNewChat.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === newChatModal) closeModal();
        });
    }

    if (newChatForm) {
        newChatForm.addEventListener('submit', handleNewChatSubmission);
    }

    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            filterUsers(e.target.value);
        });
    }

    const editChatBtn = document.getElementById('editChatBtn');
    if (editChatBtn) {
        editChatBtn.addEventListener('click', () => {
            const chatData = fetchedChatsData.get(currentChatId);
            if (chatData) {
                openNewChatModal(true, chatData); // Open in edit mode
            }
        });
    }
}

function openNewChatModal(isEdit = false, chatData = null) {
    const newChatModal = document.getElementById('newChatModal');
    const newChatForm = document.getElementById('newChatForm');
    const chatNameInput = document.getElementById('chatNameInput');
    const modalTitle = newChatModal.querySelector('.modal-title');

    if (!newChatModal || !newChatForm || !chatNameInput || !modalTitle) return;

    newChatForm.reset();
    newChatModal.dataset.editMode = isEdit;
    
    if (isEdit && chatData) {
        modalTitle.textContent = 'Edit Chat';
        chatNameInput.value = chatData.name || '';
        newChatModal.dataset.chatId = chatData._id; // Store chat ID for submission
    } else {
        modalTitle.textContent = 'Create New Chat';
        delete newChatModal.dataset.chatId;
    }

    newChatModal.style.display = 'block';
    fetchAndDisplayUsers(chatData ? chatData.participants : []);
}

// Function to fetch and display users
async function fetchAndDisplayUsers(participants = []) {
    try {
        const token = sessionStorage.getItem('auth_token');
        console.log('Attempting to fetch users with token:', token);
        console.log('Making request to:', 'http://localhost:8888/students/all');

        const response = await fetch('http://localhost:8888/students/all', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Raw response data:', data);

        if (data.success && Array.isArray(data.students)) {
            if (data.students.length > 0) {
                console.log('First student object for debugging:', data.students[0]);
            }
            allUsersForSelection = data.students;
            console.log('Processed users for selection:', allUsersForSelection);
            updateUserList(data.students);
        } else {
            console.error('Invalid response format:', data);
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        alert('Failed to load users. Please try again.');
    }
}

// Function to handle new chat submission
async function handleNewChatSubmission(e) {
    e.preventDefault();
    const errorMessage = document.getElementById('errorMessageUsers');

    if (!currentUser || !currentUser.id) {
        console.error('Current user not properly initialized:', currentUser);
        if (errorMessage) {
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'Error: User not properly initialized. Please try logging in again.';
        }
        return;
    }

    // Get the full user objects for selected participants
    const selectedUsers = Array.from(document.querySelectorAll('#userListForNewChat .user-checkbox:checked'))
        .map(checkbox => {
            const userItem = checkbox.closest('.user-item');
            const userId = parseInt(userItem.dataset.userId, 10);
            return allUsersForSelection.find(u => u.id === userId);
        })
        .filter(Boolean); // Filter out any undefined/null results

    // Find the current user's full object from the master list
    const currentUserObject = allUsersForSelection.find(u => u.id === parseInt(currentUser.id, 10));

    // Combine and ensure the current user is included
    let participantsData = [...selectedUsers];
    if (currentUserObject && !participantsData.some(p => p.id === currentUserObject.id)) {
        participantsData.push(currentUserObject);
    }
    
    // Remove duplicates, just in case
    participantsData = [...new Map(participantsData.map(item => [item['id'], item])).values()];

    console.log('Final list of participant objects being sent to server:', participantsData);

    const chatName = document.getElementById('chatNameInput').value.trim();

    // Basic validation
    if (participantsData.length < 2) {
        if (errorMessage) {
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'Please select at least one other user.';
        }
        return;
    }
    
    const isEditMode = e.target.closest('#newChatModal').dataset.editMode === 'true';

    if (isEditMode) {
        const chatId = e.target.closest('#newChatModal').dataset.chatId;
        // Edit mode still sends MySQL IDs, as the users should already exist.
        const selectedUserIds = participantsData.map(p => p.id);
        socket.emit('updateChat', {
            chatId: chatId,
            name: chatName,
            participants: selectedUserIds
        });
    } else {
        // Emit the create chat event with the full participant data
        socket.emit('createNewChat', {
            participantsData: participantsData,
            groupName: chatName || null
        });
    }

    // Close and reset the modal
    const newChatModal = document.getElementById('newChatModal');
    if (newChatModal) {
        newChatModal.style.display = 'none';
        e.target.reset();
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
    }
}

// Function to fetch all students and their statuses
async function fetchAllStudentStatuses() {
    try {
        const token = sessionStorage.getItem('auth_token');
        const response = await fetch('http://localhost:8888/students/all', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Students data:', data);

        if (data.success && Array.isArray(data.students)) {
            // Update the status cache
            data.students.forEach(student => {
                studentStatusCache.set(student.id.toString(), student.status || false);
            });
        }
    } catch (error) {
        console.error('Error fetching student statuses:', error);
    }
}

// Function to check user online status from cache
function checkUserStatus(mysqlUserId) {
    return Promise.resolve(studentStatusCache.get(mysqlUserId.toString()) || false);
}

// Function to update all status indicators
function updateAllStatusIndicators() {
    const statusIndicators = document.querySelectorAll('.status-indicator');
    const promises = Array.from(statusIndicators).map(indicator => {
        const userId = indicator.closest('[data-user-id]')?.dataset.userId;
        if (userId) {
            return checkUserStatus(userId).then(isOnline => {
                console.log('Status update for user', userId, ':', isOnline);
                indicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
            });
        }
        return Promise.resolve();
    });
    return Promise.all(promises);
}

// Debounce function
function debounce(func, wait) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(chatUpdateTimeout);
            func(...args);
        };
        clearTimeout(chatUpdateTimeout);
        chatUpdateTimeout = setTimeout(later, wait);
    };
}

// Function to update chat list
const updateChatList = debounce((chats) => {
    const now = Date.now();
    if (now - lastChatUpdate < DEBOUNCE_DELAY) {
        console.log('Skipping duplicate chat update');
        return;
    }
    lastChatUpdate = now;

    console.log('Updating chat list:', chats);
    // Sort chats by last message timestamp
    chats.sort((a, b) => {
        const timeA = a.lastMessage?.timestamp || 0;
        const timeB = b.lastMessage?.timestamp || 0;
        return timeB - timeA;
    });
    
    // Clear existing chats
    const chatList = document.getElementById('chatList');
    if (chatList) {
        chatList.innerHTML = '';
    }
    
    // Store chats data
    fetchedChatsData.clear();
    chats.forEach(chat => {
        fetchedChatsData.set(chat._id, chat);
        addChatToList(chat);
        // Join each chat room
        socket.emit('joinChat', chat._id);
    });
}, DEBOUNCE_DELAY);

// Function to set up socket events
function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        if (!isAuthenticated) {
            // Send authentication only if not already authenticated
            socket.emit('authenticate', socket.auth);
        }
    });

    socket.on('authenticated', (data) => {
        if (isAuthenticated) {
            console.log('Already authenticated, ignoring duplicate event');
            return;
        }

        console.log('Successfully authenticated with chat server:', data);
        currentUserId = data.userId;
        currentUserMysqlId = data.mysqlId;
        isAuthenticated = true;

        console.log('Updated current user:', {
            currentUser,
            currentUserId,
            currentUserMysqlId
        });

        // Enable chat creation now that we are authenticated
        const createNewChatBtn = document.getElementById('createNewChatBtn');
        if (createNewChatBtn) {
            createNewChatBtn.disabled = false;
            createNewChatBtn.title = 'Create New Chat';
        }

        // Enable chat functionality
        const chatFunctionalArea = document.querySelector('.messages-main-container');
        if (chatFunctionalArea) {
            chatFunctionalArea.style.display = 'flex';
        }

        // Request user's chats after successful authentication
        socket.emit('getMyChats');
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        isAuthenticated = false; // Reset authentication state on disconnect
        lastChatUpdate = 0; // Reset last chat update time
    });

    socket.on('authentication_error', (error) => {
        console.error('Chat authentication failed:', error);
        isAuthenticated = false;
        lastChatUpdate = 0;
        disableChatFunctionality(`Authentication failed: ${error}. Please re-login.`);
    });

    socket.on('newMessage', (message) => {
        console.log('Received new message:', message);
        if (message.chatId === currentChatId) {
            displayMessages(message.chatId, [message]);
        } else {
            // Show notification for messages in other chats
            showMessageNotification(message);
        }

        // Update the chat in the list with new last message
        const chat = fetchedChatsData.get(message.chatId);
        if (chat) {
            chat.lastMessage = message;
            // Get all current chats and update the list
            const chats = Array.from(fetchedChatsData.values());
            updateChatList(chats);
        }
    });

    socket.on('chatMessages', ({ chatId, messages }) => {
        console.log('Received chat messages:', { chatId, messageCount: messages.length });
        displayMessages(chatId, messages);
    });

    socket.on('myChats', (chats) => {
        console.log('Received user chats:', chats);
        updateChatList(chats);
    });

    socket.on('notification', (data) => {
        console.log('Received notification:', data);
        if (data.chatId !== currentChatId) {
            showMessageNotification(data.message);
        }
    });

    socket.on('userStatusChanged', ({ userId, online }) => {
        // Update the status cache
        userStatusCache.set(userId.toString(), online);
        
        // Update status indicators everywhere in the UI
        document.querySelectorAll(`[data-user-id="${userId}"] .status-indicator`).forEach(indicator => {
            indicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
        });

        // Update chat list items
        fetchedChatsData.forEach((chat, chatId) => {
            const participant = chat.participants.find(p => p._id.toString() === userId.toString());
            if (participant) {
                participant.online = online;
                addChatToList(chat);
                if (chatId === currentChatId) {
                    displayChatParticipants(chat.participants);
                }
            }
        });
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
}

// Function to disable chat functionality
function disableChatFunctionality(message) {
    const chatArea = document.querySelector('.messages-main-container');
    if (chatArea) {
        chatArea.innerHTML = `<div class="chat-disabled-message">${message}</div>`;
    }
}

// Function to set up message sending
function setupMessageSending() {
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');

    if (messageInput && sendMessageBtn) {
        // Handle message input
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
                if (messageInput.value.trim() && currentChatId) {
                    sendMessage(messageInput.value.trim());
                    messageInput.value = '';
                }
            }
        });

        // Handle send button click
        sendMessageBtn.addEventListener('click', () => {
            if (messageInput.value.trim() && currentChatId) {
                sendMessage(messageInput.value.trim());
                messageInput.value = '';
            }
        });
    }
}

// Function to send a message
function sendMessage(content) {
    if (!currentChatId || !content) return;
    
    socket.emit('sendMessage', {
        chatId: currentChatId,
        content: content
    });
}

// Function to update user list UI
function updateUserList(users) {
    const userListContainer = document.getElementById('userListForNewChat');
    if (!userListContainer) return;

    userListContainer.innerHTML = '';
    
    // Ensure we have a valid current user ID
    const currentUserId = currentUser && currentUser.id ? parseInt(currentUser.id) : null;
    console.log('Updating user list. Current user:', {
        user: currentUser,
        parsedId: currentUserId
    });

    // Filter out current user and create user items
    const otherUsers = users.filter(user => {
        const userId = parseInt(user.id);
        const isCurrentUser = userId === currentUserId;
        console.log('Comparing user:', {
            userId,
            currentUserId,
            isCurrentUser
        });
        return !isCurrentUser;
    });
    
    console.log('Other users:', otherUsers);

    otherUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.userId = user.id.toString(); // Ensure it's a string in the dataset

        userItem.innerHTML = `
            <input type="checkbox" class="user-checkbox" id="user_${user.id}">
            <div class="user-info">
                <img src="${user.avatar || 'assets/user.png'}" alt="${user.first_name} ${user.last_name}" class="user-avatar">
                <div class="user-details">
                    <span class="user-name">${user.first_name} ${user.last_name}</span>
                    <span class="user-group">${user.group_name || ''}</span>
                </div>
            </div>
        `;

        userListContainer.appendChild(userItem);
    });

    // Show message if no other users available
    if (otherUsers.length === 0) {
        userListContainer.innerHTML = '<div class="no-users-message">No other users available</div>';
    }
}

// Function to filter users
function filterUsers(searchTerm) {
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        const userName = item.querySelector('.user-name').textContent.toLowerCase();
        const userGroup = item.querySelector('.user-group').textContent.toLowerCase();
        const matches = userName.includes(searchTerm.toLowerCase()) || 
                       userGroup.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'flex' : 'none';
    });
}

// Function to add a new chat to the list
function addChatToList(chat) {
    return new Promise((resolve) => {
        const chatList = document.getElementById('chatList');
        if (!chatList) {
            resolve();
            return;
        }

        let existingChat = document.querySelector(`[data-chat-id="${chat._id}"]`);
        
        const otherParticipants = chat.participants.filter(p => p._id.toString() !== currentUserId.toString());
        const isDirectChat = !chat.isGroupChat && otherParticipants.length === 1;
        const otherParticipant = isDirectChat ? otherParticipants[0] : null;
        
        // Get online status from cache for direct chats
        const statusPromise = isDirectChat && otherParticipant 
            ? checkUserStatus(otherParticipant.mysql_user_id)
            : Promise.resolve(false);

        statusPromise.then(isOnline => {
            console.log('Chat participant status:', {
                participant: otherParticipant?.mysql_user_id,
                isOnline
            });
            
            const chatName = chat.name || (otherParticipant ? `${otherParticipant.first_name} ${otherParticipant.last_name}` : 'Unnamed Group');

            const chatItemHTML = `
                <div class="chat-avatar-container">
                    <img src="${otherParticipant?.avatar || 'assets/group-chat.png'}" alt="${chatName}" class="chat-avatar">
                    ${isDirectChat ? `<span class="status-indicator ${isOnline ? 'online' : 'offline'}" data-user-id="${otherParticipant.mysql_user_id}"></span>` : ''}
                </div>
                <div class="chat-item-details">
                    <span class="chat-name">${chatName}</span>
                    ${chat.lastMessage ? `<span class="last-message">${chat.lastMessage.content}</span>` : ''}
                </div>
            `;

            if (existingChat) {
                existingChat.innerHTML = chatItemHTML;
            } else {
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.chatId = chat._id;
                chatItem.innerHTML = chatItemHTML;
                chatItem.addEventListener('click', () => selectChat(chat._id));
                chatList.appendChild(chatItem);
            }
            resolve();
        });
    });
}

// Function to select and display a chat
function selectChat(chatId) {
    if (currentChatId === chatId && document.getElementById('messageList').style.display !== 'none') {
        return; // Don't re-select the same chat if it's already visible
    }

    currentChatId = chatId;

    // Toggle active class on chat list
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active-chat');
    });
    const selectedChatElement = document.querySelector(`[data-chat-id="${chatId}"]`);
    if (selectedChatElement) {
        selectedChatElement.classList.add('active-chat');
    }

    // Show message view, hide welcome screen
    const messageList = document.getElementById('messageList');
    const welcomeScreen = document.getElementById('chatWelcomeScreen');
    const chatInfo = document.getElementById('chatInfo');
    const messageInputContainer = document.getElementById('messageInputContainer');

    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (chatInfo) chatInfo.style.display = 'block';
    if (messageList) messageList.style.display = 'flex';
    if (messageInputContainer) messageInputContainer.style.display = 'flex';

    // Clear previous messages
    messageList.innerHTML = '';

    // Enable message input
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (messageInput) messageInput.disabled = false;
    if (sendMessageBtn) sendMessageBtn.disabled = false;

    // Request new chat messages
    socket.emit('getChatMessages', chatId);

    // Update header with chat info
    const chatData = fetchedChatsData.get(chatId);
    if (!chatData) {
        console.warn(`Could not find cached data for chat ID ${chatId}`);
        return;
    }
    
    const otherParticipants = chatData.participants.filter(p => p.mysql_user_id !== currentUserMysqlId.toString());
    const isDirectChat = otherParticipants.length === 1;
    const chatName = chatData.name || (isDirectChat ? `${otherParticipants[0].first_name} ${otherParticipants[0].last_name}` : 'Unnamed Group');
    
    const chatNameElement = document.getElementById('currentChatName');
    if (chatNameElement) {
        chatNameElement.textContent = chatName;
    }

    displayChatParticipants(chatData.participants);

    const editChatBtn = document.getElementById('editChatBtn');
    if (editChatBtn) {
        const amCreator = chatData.createdBy && chatData.createdBy._id === currentUserId;
        editChatBtn.style.display = amCreator ? 'block' : 'none';
    }
}

function displayChatParticipants(participants) {
    const participantsContainer = document.getElementById('currentChatParticipants');
    if (!participantsContainer) return;

    participantsContainer.innerHTML = '<span>Participants: </span>';
    
    const promises = participants.map((p, index) => {
        return checkUserStatus(p.mysql_user_id).then(isOnline => {
            const participantSpan = document.createElement('span');
            participantSpan.className = 'participant-item';
            participantSpan.dataset.userId = p.mysql_user_id;

            const statusIndicator = `<span class="status-indicator ${isOnline ? 'online' : 'offline'}" data-user-id="${p.mysql_user_id}"></span>`;
            const displayName = p._id.toString() === currentUserId.toString() ? 'You' : `${p.first_name} ${p.last_name}`;

            participantSpan.innerHTML = `${statusIndicator} ${displayName}${index < participants.length - 1 ? ', ' : ''}`;
            participantsContainer.appendChild(participantSpan);
        });
    });

    return Promise.all(promises).then(() => {
        if (participants.length === 0) {
            participantsContainer.innerHTML = '<span>No participants.</span>';
        }
    });
}

// Function to show message notification
function showMessageNotification(message) {
    const notificationStatus = document.getElementById('notification-status');
        if (notificationStatus) {
        notificationStatus.style.display = 'block';
    }

    // Update dropdown notification if exists
    const dropdownNotification = document.querySelector('.dropdownNotification');
    if (dropdownNotification) {
        const notificationElement = document.createElement('div');
        notificationElement.className = 'message';
        notificationElement.innerHTML = `
            <div class="humanProfile">
                <img src="${message.senderId.avatar || 'assets/user.png'}" alt="profile">
                <p>${message.senderId.first_name} ${message.senderId.last_name}</p>
            </div>
            <div class="humanMessage">
                <p>${message.content}</p>
            </div>
        `;
        
        // Add at the top
        if (dropdownNotification.firstChild) {
            dropdownNotification.insertBefore(notificationElement, dropdownNotification.firstChild);
        } else {
            dropdownNotification.appendChild(notificationElement);
        }
    }
}

// Function to display messages
function displayMessages(chatId, messages) {
    const messageList = document.getElementById('messageList');
    if (!messageList || chatId !== currentChatId) return;

    // The message list is now reliably cleared by the selectChat() function
    // before new messages are fetched. This function now only *appends* messages.

    // Ensure messages is always an array
    const messagesToDisplay = Array.isArray(messages) ? messages : [messages];

    messagesToDisplay.forEach(message => {
        // Skip if message is already displayed
        if (document.querySelector(`[data-message-id="${message._id}"]`)) {
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${message.senderId._id === currentUserId ? 'sent' : 'received'}`;
        messageElement.dataset.messageId = message._id;

        messageElement.innerHTML = `
            ${message.senderId._id !== currentUserId ? `
                <img src="${message.senderId.avatar || 'assets/user.png'}" alt="${message.senderId.first_name}" class="message-avatar">
            ` : ''}
            <div class="message-content">
                <span class="message-sender">${message.senderId._id === currentUserId ? 'You' : `${message.senderId.first_name} ${message.senderId.last_name}`}</span>
                <p>${message.content}</p>
                <span class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            ${message.senderId._id === currentUserId ? `
                <img src="${message.senderId.avatar || 'assets/user.png'}" alt="You" class="message-avatar">
            ` : ''}
        `;

        messageList.appendChild(messageElement);
    });

    // Scroll to bottom
    messageList.scrollTop = messageList.scrollHeight;
}

// Set up periodic status updates
function setupStatusUpdates() {
    // Initial fetch and update
    fetchAllStudentStatuses()
        .then(() => updateAllStatusIndicators())
        .catch(console.error);
    
    // Update statuses every 30 seconds
    setInterval(() => {
        fetchAllStudentStatuses()
            .then(() => updateAllStatusIndicators())
            .catch(console.error);
    }, 30000);
}

// Function to load chats
function loadChats() {
    if (!socket.connected) {
        console.log('Socket not connected, attempting to connect...');
        socket.connect();
    } else if (isAuthenticated) {
        // Only request chats if already authenticated
        socket.emit('getMyChats');
    }
    // If not authenticated, the authenticated event handler will request chats
}