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
let messageCache = new Map(); // Cache for messages, keyed by chatId
let pendingMessages = new Map(); // Pending messages for race condition fix
let studentStatusCache = new Map(); // Cache for student statuses
let isAuthenticated = false; // Track authentication state
let lastChatUpdate = 0; // Track last chat update timestamp
let chatUpdateTimeout = null; // For debouncing

// Initialize chat when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    // Cycle through waving hand images
    const wavingHandImg = document.querySelector('.welcome-content img.welcome-icon');
    if (wavingHandImg) {
        // Get the current index from localStorage or start at 0
        let currentHandIndex = parseInt(localStorage.getItem('wavingHandIndex') || '0');
        
        // Increment the index and wrap around if needed
        currentHandIndex = (currentHandIndex + 1) % 4; // 4 images (0 to 3)
        
        // Save the new index
        localStorage.setItem('wavingHandIndex', currentHandIndex.toString());
        
        // Set the appropriate image
        wavingHandImg.src = `assets/waving-hand${currentHandIndex || ''}.png`;
    }

    // Hide notification dot on initial load
    const notificationStatus = document.getElementById('notification-status');
    if (notificationStatus) {
        notificationStatus.classList.remove('show');
    }

    // Initialize chat
    initializeChat();

    // Set up event listeners
    setupEventListeners();

    // Set up status updates
    setupStatusUpdates();
    
    // Set up socket connection
    setupSocketEvents();
    
    // Check for pending chat selection
    const pendingChatId = sessionStorage.getItem('pending_chat_id');
    if (pendingChatId) {
        // Remove the pending chat ID
        sessionStorage.removeItem('pending_chat_id');
        // Wait for chats to load before selecting
        const checkChatsLoaded = setInterval(() => {
            if (fetchedChatsData.has(pendingChatId)) {
                selectChat(pendingChatId);
                clearInterval(checkChatsLoaded);
            }
        }, 100);
        // Clear the interval after 5 seconds if chat is not found
        setTimeout(() => clearInterval(checkChatsLoaded), 5000);
    }

    // Set up notification handling
    const notification = document.querySelector('.notification');
    const dropdownNotification = document.querySelector('.dropdownNotification');

    if (notification && notificationStatus && dropdownNotification) {
        // Clear any existing notifications on page load
        dropdownNotification.innerHTML = '';

        notification.addEventListener('mouseenter', () => {
            // Hide the red dot when viewing notifications
            notificationStatus.classList.remove('show');
            dropdownNotification.style.display = 'block';
            
            // Mark all current notifications as read
            const notifications = dropdownNotification.querySelectorAll('.notification-item');
            notifications.forEach(notif => {
                notif.classList.add('read');
            });
        });

        notification.addEventListener('mouseleave', () => {
            dropdownNotification.style.display = 'none';
            // Don't show the red dot after viewing notifications
            // It will only show again when new messages arrive
        });
    }
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
        // Ensure the user object has all required fields
        if (!currentUser.id && currentUser.mysql_user_id) {
            currentUser.id = currentUser.mysql_user_id;
        }
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
async function fetchAndDisplayUsers(existingParticipants = []) {
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
            updateUserList(data.students, existingParticipants);
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
    const selectedUsers = Array.from(document.querySelectorAll('#userListForNewChat .user-checkbox:checked'))
        .map(checkbox => {
            const userData = allUsersForSelection.find(u => u.id.toString() === checkbox.value);
            if (!userData) {
                console.warn(`Could not find user data for ID: ${checkbox.value}`);
                return null;
            }
            const firstName = userData.firstName || userData.first_name;
            const lastName = userData.lastName || userData.last_name;
            return {
                id: userData.id,
                username: `${firstName}_${lastName}`,
                first_name: firstName,
                last_name: lastName,
                avatar: userData.avatar
            };
        }).filter(Boolean); // Remove nulls from the array

    // Add the current user to the participants list automatically
    const currentUserData = {
        id: currentUser.id,
        username: `${currentUser.first_name}_${currentUser.last_name}`,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        avatar: currentUser.avatar
    };
    if (!selectedUsers.some(u => u.id === currentUserData.id)) {
        selectedUsers.push(currentUserData);
    }
    
    const errorMessage = document.getElementById('errorMessageUsers');
    if (selectedUsers.length < 2) {
        if (errorMessage) {
            errorMessage.textContent = 'Please select at least one other user.';
            errorMessage.style.display = 'block';
        }
        return;
    } else {
        if (errorMessage) errorMessage.style.display = 'none';
    }

    const chatName = document.getElementById('chatNameInput').value.trim();
    const isEditMode = e.target.closest('#newChatModal').dataset.editMode === 'true';

    if (isEditMode) {
        const chatId = e.target.closest('#newChatModal').dataset.chatId;
        socket.emit('updateChat', {
            chatId: chatId,
            name: chatName,
            participants: selectedUsers.map(u => u.id)
        });
    } else {
        // Emit the create chat event with the full participant data
        socket.emit('createNewChat', {
            participantsData: selectedUsers,
            groupName: chatName || null
        });
    }
    
    const newChatModal = document.getElementById('newChatModal');
    if (newChatModal) {
        newChatModal.style.display = 'none';
    }
}

// Function to fetch all students and their statuses
async function fetchAllStudentStatuses() {
    try {
        const token = sessionStorage.getItem('auth_token');
        const response = await fetch('http://localhost:8888/students', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch student data: ${response.statusText}`);
        }
        const data = await response.json();
        
        if (data && Array.isArray(data.students)) {
            const studentStatuses = new Map(data.students.map(s => [s.id.toString(), s.status]));
            studentStatusCache = studentStatuses;
        } else {
            console.error("Unexpected data format from /students endpoint:", data);
        }

        // Update statuses in the UI after fetching
        updateAllStatusIndicators();

    } catch (error) {
        console.error("Error fetching student statuses:", error);
    }
}

function checkUserStatus(mysqlUserId) {
    if (userStatusCache.has(mysqlUserId.toString())) {
        return Promise.resolve(userStatusCache.get(mysqlUserId.toString()));
    }
    return Promise.resolve(false); // Default to offline if not in cache
}

function updateAllStatusIndicators() {
    userStatusCache.forEach((isOnline, userId) => {
        document.querySelectorAll(`[data-user-id="${userId}"] .status-indicator`).forEach(indicator => {
            indicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
        });
    });
}

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

        // Update currentUser with the MySQL ID if not already set
        if (!currentUser.id) {
            currentUser.id = data.mysqlId;
        }

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
        socket.emit('getAllUserStatuses');
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        isAuthenticated = false; // Reset authentication state on disconnect
    });

    socket.on('chatCreatedSuccessfully', (newChat) => {
        console.log('Chat created successfully:', newChat);
        fetchedChatsData.set(newChat._id.toString(), newChat);
        upsertChatItem(newChat);
        selectChat(newChat._id.toString());

        const newChatModal = document.getElementById('newChatModal');
        if (newChatModal) {
            newChatModal.style.display = 'none';
            const newChatForm = document.getElementById('newChatForm');
            if (newChatForm) newChatForm.reset();
        }
    });

    socket.on('newChatCreated', (newChat) => {
        console.log('Added to new chat:', newChat);
        fetchedChatsData.set(newChat._id.toString(), newChat);
        socket.emit('joinChat', newChat._id);
        upsertChatItem(newChat);
    });

    socket.on('chatDetails', (chat) => {
        fetchedChatsData.set(chat._id.toString(), chat);
        upsertChatItem(chat); // Use the smart upsert function
        if (chat._id.toString() === currentChatId) {
            selectChat(chat._id.toString()); // Re-run selectChat now that data is available
        }
    });

    socket.on('authentication_error', (error) => {
        console.error('Chat authentication failed:', error);
        isAuthenticated = false;
        disableChatFunctionality(`Authentication failed: ${error}. Please re-login.`);
        
        if (error.includes('jwt expired') || error.includes('invalid token')) {
            sessionStorage.removeItem("auth_token");
            sessionStorage.removeItem("user");
            fetch('http://localhost:8888/students/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: false })
            }).finally(() => {
                window.location.href = "login.html";
            });
        }
    });

    socket.on('chatUpdated', (updatedChat) => {
        console.log('[chatUpdated] Received chat update:', updatedChat);

        // Update the local cache
        fetchedChatsData.set(updatedChat._id.toString(), updatedChat);

        // Update the chat item in the list
        upsertChatItem(updatedChat);

        // If the updated chat is the one currently open, refresh its header
        if (updatedChat._id.toString() === currentChatId) {
            updateChatHeader(updatedChat);
        }
    });

    socket.on('chatMessages', ({ chatId, messages }) => {
        console.log('[chatMessages] Received messages from server:', {
            chatId,
            messageCount: messages.length
        });

        const stringChatId = chatId.toString();
        
        // Get any pending messages for this chat
        const pending = pendingMessages.get(stringChatId) || [];
        console.log('[chatMessages] Found pending messages:', {
            chatId: stringChatId,
            pendingCount: pending.length,
            pendingIds: pending.map(m => m._id)
        });

        // Create a Set of message IDs from the server
        const existingIds = new Set(messages.map(m => m._id));
        console.log('[chatMessages] Server message IDs:', Array.from(existingIds));
        
        // Create a merged array with both fetched and pending messages
        let merged = [...messages];
        let addedPendingCount = 0;

        // Check timestamps of the last server message and pending messages
        const lastServerMessageTime = messages.length > 0 ? new Date(messages[messages.length - 1].timestamp).getTime() : 0;
        
        // Add pending messages that are newer than the last server message
        pending.forEach(msg => {
            const pendingMessageTime = new Date(msg.timestamp).getTime();
            if (pendingMessageTime > lastServerMessageTime) {
                console.log('[chatMessages] Adding pending message:', {
                    messageId: msg._id,
                    timestamp: msg.timestamp,
                    content: msg.content
                });
                merged.push(msg);
                addedPendingCount++;
            } else {
                console.log('[chatMessages] Skipping older pending message:', {
                    messageId: msg._id,
                    timestamp: msg.timestamp
                });
            }
        });
        
        console.log('[chatMessages] Merged messages:', {
            chatId: stringChatId,
            totalMessages: merged.length,
            addedFromPending: addedPendingCount,
            finalMessageCount: merged.length
        });
        
        // Sort all messages by timestamp
        merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Update the cache with merged messages
        messageCache.set(stringChatId, merged);
        
        // Clear pending messages for this chat since we've processed them
        pendingMessages.delete(stringChatId);
        
        // Display the merged messages
        displayMessages(stringChatId);
    });

    socket.on('newMessage', (message) => {
        console.log('[newMessage] Received new message:', {
            messageId: message._id,
            chatId: message.chatId,
            senderId: message.senderId,
            content: message.content,
            timestamp: message.timestamp,
            currentChatId: currentChatId
        });

        const chatId = message.chatId.toString();
        const chat = fetchedChatsData.get(chatId);
        if (!chat) {
            console.log('[newMessage] Chat not found in fetchedChatsData:', chatId);
            return;
        }

        // Update chat's last message and timestamp
        chat.lastMessage = message;
        chat.updatedAt = message.timestamp;
        upsertChatItem(chat);
        console.log('[newMessage] Updated chat in fetchedChatsData:', {
            chatId,
            lastMessage: message._id,
            updatedAt: message.timestamp
        });

        if (chatId === currentChatId) {
            console.log('[newMessage] Message is for current chat, updating cache and display');
            // If this chat is currently open, add to cache and display
            if (!messageCache.has(chatId)) {
                console.log('[newMessage] Initializing message cache for chat:', chatId);
                messageCache.set(chatId, []);
            }
            const currentMessages = messageCache.get(chatId);
            
            // Check if message already exists in cache
            const messageExists = currentMessages.some(m => m._id === message._id);
            if (!messageExists) {
                currentMessages.push(message);
                // Sort messages by timestamp
                currentMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                console.log('[newMessage] Added new message to cache. Current size:', currentMessages.length);
                displayMessages(chatId);
            } else {
                console.log('[newMessage] Message already exists in cache:', message._id);
            }
        } else {
            console.log('[newMessage] Message is for different chat, queueing in pending');
            // If chat is not open, queue message for later
            if (!pendingMessages.has(chatId)) {
                pendingMessages.set(chatId, []);
            }
            const pendingForChat = pendingMessages.get(chatId);
            // Check if message already exists in pending
            const messageExists = pendingForChat.some(m => m._id === message._id);
            if (!messageExists) {
                pendingForChat.push(message);
                // Sort pending messages by timestamp
                pendingForChat.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                console.log('[newMessage] Added to pending. Current size:', pendingForChat.length);
            } else {
                console.log('[newMessage] Message already exists in pending:', message._id);
            }
            
            // Show notification for new message
            showMessageNotification(message);
        }
    });

    socket.on('myChats', (chats) => {
        console.log('Received user chats:', chats);
        const chatList = document.getElementById('chatList');
        if (!chatList) return;

        chatList.innerHTML = ''; // Clear the list for a fresh render

        // Sort chats by the most recent activity
        chats.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt).getTime();
            return timeB - timeA;
        });

        // Populate the list from scratch
        chats.forEach(chat => {
            fetchedChatsData.set(chat._id.toString(), chat);
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.dataset.chatId = chat._id.toString();
            chatItem.innerHTML = generateChatItemHTML(chat);
            chatItem.addEventListener('click', () => selectChat(chat._id.toString()));
            chatList.appendChild(chatItem);
        });
    });

    socket.on('notification', (data) => {
        console.log('Received notification:', data);
        if (data.chatId !== currentChatId) {
            showMessageNotification(data.message);
        }
    });

    socket.on('userStatusChanged', ({ userId, online, lastSeen, mysqlId }) => {
        const idToUse = mysqlId || userId;
        userStatusCache.set(idToUse.toString(), online);
        
        document.querySelectorAll(`[data-user-id="${idToUse}"] .status-indicator`).forEach(indicator => {
            indicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
        });

        fetchedChatsData.forEach((chat, chatId) => {
            const participant = chat.participants.find(p => p.mysql_user_id.toString() === idToUse.toString());
            if (participant) {
                participant.online = online;
                upsertChatItem(chat);
                if (chatId === currentChatId) {
                    displayChatParticipants(chat.participants);
                }
            }
        });
    });
    
    socket.on('allUserStatuses', (users) => {
        users.forEach(user => {
            userStatusCache.set(user.mysql_user_id.toString(), user.online);
        });
        updateAllStatusIndicators();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        disableChatFunctionality('Cannot connect to chat server. Please check your connection and refresh.');
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
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (messageInput.value.trim() && currentChatId) {
                    sendMessage(messageInput.value.trim());
                    messageInput.value = '';
                }
            }
        });

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
    if (!currentChatId) {
        console.error("Cannot send message, no chat selected.");
        return;
    }
    socket.emit('sendMessage', {
        chatId: currentChatId,
        content: content
    });
}

// Function to update user list UI
function updateUserList(users, existingParticipants = []) {
    const userList = document.getElementById('userListForNewChat');
    if (!userList) {
        console.error("User list container not found!");
        return;
    }
    
    userList.innerHTML = '';
    
    if (users.length === 0) {
        userList.innerHTML = '<div class="no-users-found">No users found.</div>';
        return;
    }
    
    const existingParticipantIds = new Set(existingParticipants.map(p => p.mysql_user_id.toString()));

    const sortedUsers = users.sort((a, b) => ((a.firstName || a.first_name) || '').localeCompare((b.firstName || b.first_name) || ''));

    sortedUsers.forEach(user => {
        // Exclude the current logged-in user from the list
        if (user.id === currentUser.id) {
            return;
        }

        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.userId = user.id;

        const firstName = user.firstName || user.first_name || 'Unknown';
        const lastName = user.lastName || user.last_name || 'User';
        const groupName = user.groupName || user.group_name || user.group || 'N/A';

        userElement.innerHTML = `
            <input type="checkbox" id="user_${user.id}" value="${user.id}" class="user-checkbox">
            <div class="user-info">
                <img src="${user.avatar || 'assets/user.png'}" alt="user avatar" class="user-avatar">
                <div class="user-details">
                    <span class="user-name">${firstName} ${lastName}</span>
                    <span class="user-group">Group: ${groupName}</span>
                </div>
            </div>
        `;

        // Add event listener to the whole item for better UX
        userElement.addEventListener('click', (e) => {
            const checkbox = userElement.querySelector('.user-checkbox');
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
        });

        if (existingParticipantIds.has(user.id.toString())) {
            userElement.querySelector('.user-checkbox').checked = true;
        }

        userList.appendChild(userElement);
    });
}

// Function to filter users
function filterUsers(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filteredUsers = allUsersForSelection.filter(user =>
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(term)
    );
    updateUserList(filteredUsers);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });
}

function generateChatItemHTML(chat) {
    const otherParticipants = chat.participants.filter(p => p._id.toString() !== currentUserId.toString());
    const isDirectChat = !chat.isGroupChat && otherParticipants.length === 1;
    const otherParticipant = isDirectChat ? otherParticipants[0] : null;

    const chatName = chat.name || (otherParticipant ? `${otherParticipant.first_name} ${otherParticipant.last_name}` : 'Unnamed Group');
    let lastMessageContent = 'No messages yet';
    if (chat.lastMessage) {
        const sender = chat.lastMessage.senderId._id === currentUserId ? "You: " : "";
        lastMessageContent = sender + chat.lastMessage.content;
    }

    const lastMessageTimestamp = chat.lastMessage ? formatTimestamp(chat.lastMessage.timestamp) : formatTimestamp(chat.createdAt);
    const avatar = otherParticipant?.avatar || chat.avatar || 'assets/group-chat.png';
    const isOnline = otherParticipant ? userStatusCache.get(otherParticipant.mysql_user_id.toString()) : false;
    const onlineIndicator = isDirectChat ? `<span class="status-indicator ${isOnline ? 'online' : 'offline'}" data-user-id="${otherParticipant.mysql_user_id}"></span>` : '';

    return `
        <div class="chat-avatar-container">
            <img src="${avatar}" alt="${chatName}" class="chat-avatar">
            ${onlineIndicator}
        </div>
        <div class="chat-item-details" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <span class="chat-name">${chatName}</span>
            <span class="last-message" style="display: block; text-overflow: ellipsis; overflow: hidden;">${lastMessageContent}</span>
        </div>
        <div class="chat-item-timestamp">
            <span>${lastMessageTimestamp}</span>
        </div>
    `;
}

function upsertChatItem(chat) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;

    const chatId = chat._id.toString();
    console.log('[upsertChatItem] Updating chat item:', {
        chatId,
        name: chat.name,
        lastMessage: chat.lastMessage ? chat.lastMessage._id : null,
        updatedAt: chat.updatedAt
    });

    // Remove any existing instances of this chat
    const existingItems = chatList.querySelectorAll(`[data-chat-id="${chatId}"]`);
    if (existingItems.length > 1) {
        console.log('[upsertChatItem] Found duplicate chat items:', existingItems.length);
        // Keep the first one, remove the rest
        for (let i = 1; i < existingItems.length; i++) {
            existingItems[i].remove();
        }
    }

    let chatItem = existingItems[0] || document.createElement('div');
    
    if (!existingItems[0]) {
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chatId;
        chatItem.addEventListener('click', () => selectChat(chatId));
    }

    // Update content
    chatItem.innerHTML = generateChatItemHTML(chat);

    // If this is a new item or if it's not at the top, move it to the top
    if (!existingItems[0] || chatItem !== chatList.firstElementChild) {
        // Remove from current position if it exists
        if (chatItem.parentNode) {
            chatItem.parentNode.removeChild(chatItem);
        }
        // Add to the top
        chatList.insertBefore(chatItem, chatList.firstChild);
    }

    // Handle active class
    if (chatId === currentChatId) {
        const currentActive = chatList.querySelector('.active-chat');
        if (currentActive) currentActive.classList.remove('active-chat');
        chatItem.classList.add('active-chat');
    }

    console.log('[upsertChatItem] Chat item updated successfully:', {
        chatId,
        isActive: chatId === currentChatId,
        position: Array.from(chatList.children).indexOf(chatItem)
    });
}

// Function to select and display a chat
function selectChat(chatId) {
    console.log('[selectChat] Opening chat:', chatId);
    const stringChatId = chatId.toString();
    
    // Clear the message cache for this chat to ensure we get fresh data
    messageCache.delete(stringChatId);
    console.log('[selectChat] Cleared message cache for chat:', stringChatId);
    
    // Always fetch messages when a chat is selected
    console.log('[selectChat] Requesting messages from server for chat:', stringChatId);
    socket.emit('getChatMessages', stringChatId);

    if (currentChatId === stringChatId && document.getElementById('messageList').style.display !== 'none') {
        console.log('[selectChat] Chat already open and visible, skipping UI updates');
        return; // Don't re-run the rest of the logic if the chat is already open
    }

    console.log('[selectChat] Updating current chat ID from', currentChatId, 'to', stringChatId);
    currentChatId = stringChatId;

    const chatList = document.getElementById('chatList');
    if(chatList) {
        const currentActive = chatList.querySelector('.active-chat');
        if (currentActive) {
            currentActive.classList.remove('active-chat');
        }
        const newActive = chatList.querySelector(`[data-chat-id="${stringChatId}"]`);
        if (newActive) {
            newActive.classList.add('active-chat');
        }
    }

    // Show message view, hide welcome screen
    const messageList = document.getElementById('messageList');
    const welcomeScreen = document.getElementById('chatWelcomeScreen');
    const chatInfo = document.getElementById('chatInfo');
    const messageInputContainer = document.getElementById('messageInputContainer');

    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (chatInfo) chatInfo.style.display = 'block';
    if (messageList) {
        messageList.style.display = 'flex';
        messageList.innerHTML = '<div class="loading-messages">Loading messages...</div>';
    }
    if (messageInputContainer) messageInputContainer.style.display = 'flex';

    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (messageInput) messageInput.disabled = false;
    if (sendMessageBtn) sendMessageBtn.disabled = false;

    // Update header with chat info
    const chatData = fetchedChatsData.get(stringChatId);
    if (!chatData) {
        console.warn(`Could not find cached data for chat ID ${stringChatId}, fetching from server...`);
        socket.emit('getChatDetails', stringChatId);
        return;
    }

    updateChatHeader(chatData);
}

function updateChatHeader(chatData) {
    const chatNameElement = document.getElementById('currentChatName');
    if (!chatNameElement) return;

    const otherParticipants = chatData.participants.filter(p => p._id.toString() !== currentUserId.toString());
    const isDirectChat = !chatData.isGroupChat && otherParticipants.length === 1;
    const chatName = chatData.name || (isDirectChat ? `${otherParticipants[0].first_name} ${otherParticipants[0].last_name}` : 'Unnamed Group');

    chatNameElement.textContent = chatName;

    displayChatParticipants(chatData.participants);

    const editChatBtn = document.getElementById('editChatBtn');
    if (editChatBtn) {
        const amCreator = chatData.createdBy && chatData.createdBy._id === currentUserId;
        editChatBtn.style.display = (chatData.isGroupChat && amCreator) ? 'block' : 'none';
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
    // Show notification dot and animate bell for new messages
    const notificationStatus = document.getElementById('notification-status');
    const bell = document.getElementById('bell');
    
    if (notificationStatus) {
        notificationStatus.classList.add('show');
    }
    
    if (bell) {
        // Remove any existing animation
        bell.style.animation = 'none';
        // Trigger reflow
        bell.offsetHeight;
        // Start new animation
        bell.style.animation = 'skew 3s 1';
    }

    // Update dropdown notification if exists
    const dropdownNotification = document.querySelector('.dropdownNotification');
    if (dropdownNotification) {
        // Check if notification for this message already exists
        const existingNotification = dropdownNotification.querySelector(`[data-message-id="${message._id}"]`);
        if (existingNotification) {
            return; // Skip if notification already exists
        }

        const notificationElement = document.createElement('div');
        notificationElement.className = 'message notification-item unread';  // Add unread class
        notificationElement.dataset.chatId = message.chatId;
        notificationElement.dataset.messageId = message._id;
        notificationElement.innerHTML = `
            <div class="humanProfile">
                <img src="${message.senderId.avatar || 'assets/user.png'}" alt="profile">
                <p>${message.senderId.first_name} ${message.senderId.last_name}</p>
            </div>
            <div class="humanMessage">
                <p>${message.content}</p>
                <span class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
        `;
        
        // Add click handler to navigate to the chat
        notificationElement.addEventListener('click', () => {
            if (window.location.pathname.endsWith('Messages.html')) {
                // If already on Messages page, just switch to the chat
                selectChat(message.chatId);
                // Hide the notification dropdown
                dropdownNotification.style.display = 'none';
                // Mark this notification as read
                notificationElement.classList.remove('unread');
                notificationElement.classList.add('read');
                
                // Check if all notifications are read
                const unreadNotifications = dropdownNotification.querySelectorAll('.notification-item.unread');
                if (unreadNotifications.length === 0) {
                    // If no unread notifications, hide the red dot
                    const notificationStatus = document.getElementById('notification-status');
                    if (notificationStatus) {
                        notificationStatus.classList.remove('show');
                    }
                }
            } else {
                // If on another page, store the chat ID and redirect
                sessionStorage.setItem('pending_chat_id', message.chatId);
                window.location.href = 'Messages.html';
            }
        });
        
        // Add at the top
        if (dropdownNotification.firstChild) {
            dropdownNotification.insertBefore(notificationElement, dropdownNotification.firstChild);
        } else {
            dropdownNotification.appendChild(notificationElement);
        }

        // Limit the number of notifications shown (keep last 10)
        const notifications = dropdownNotification.querySelectorAll('.notification-item');
        if (notifications.length > 10) {
            for (let i = 10; i < notifications.length; i++) {
                notifications[i].remove();
            }
        }
    }
}

// Function to display messages
function displayMessages(chatId) {
    console.log('[displayMessages] Starting to display messages for chat:', chatId);
    const messageList = document.getElementById('messageList');
    if (!messageList) {
        console.log('[displayMessages] Message list element not found');
        return;
    }
    
    if (chatId !== currentChatId) {
        console.log('[displayMessages] Chat ID mismatch:', {
            displayFor: chatId,
            currentChat: currentChatId
        });
        return;
    }

    const messages = messageCache.get(chatId.toString()) || [];
    console.log('[displayMessages] Retrieved messages from cache:', {
        chatId,
        messageCount: messages.length,
        messageIds: messages.map(m => m._id)
    });

    // Clear the message list
    messageList.innerHTML = '';

    if (messages.length === 0) {
        console.log('[displayMessages] No messages to display');
        messageList.innerHTML = '<div class="no-messages-yet">No messages yet. Start the conversation!</div>';
        return;
    }

    // Create a Set to track displayed message IDs
    const displayedMessageIds = new Set();
    let displayedCount = 0;

    // Sort messages by timestamp to ensure correct order
    const sortedMessages = [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    sortedMessages.forEach(message => {
        // Skip if we've already displayed this message
        if (displayedMessageIds.has(message._id)) {
            console.log('[displayMessages] Skipping duplicate message:', message._id);
            return;
        }

        // Add message ID to displayed set
        displayedMessageIds.add(message._id);

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${message.senderId._id === currentUserId ? 'sent' : 'received'}`;
        messageElement.dataset.messageId = message._id;
        messageElement.innerHTML = `
            <img src="${message.senderId.avatar || 'assets/user.png'}" class="message-avatar" alt="Avatar">
            <div class="message-content">
                <div class="message-sender">${message.senderId.first_name} ${message.senderId.last_name}</div>
                <div class="message-text">${message.content}</div>
                <div class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
            </div>
        `;
        messageList.appendChild(messageElement);
        displayedCount++;
    });
    
    console.log('[displayMessages] Message display summary:', {
        chatId,
        totalMessages: messages.length,
        displayedCount,
        skippedCount: messages.length - displayedCount,
        displayedIds: Array.from(displayedMessageIds)
    });
    
    // Scroll to the bottom
    messageList.scrollTop = messageList.scrollHeight;
}

// Set up periodic status updates
function setupStatusUpdates() {
    // Initial fetch
    fetchAllStudentStatuses();
    // Update every 30 seconds
    setInterval(fetchAllStudentStatuses, 30000);
}

function loadChats() {
    if (isAuthenticated) {
        console.log('Socket already authenticated, requesting chats...');
        socket.emit('getMyChats');
    } else {
        console.log('Socket not authenticated yet, waiting for auth event to request chats.');
    }
}