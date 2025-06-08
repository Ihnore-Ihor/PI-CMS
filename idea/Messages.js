// --- CONSTANTS ---
const JWT_TOKEN_KEY = "auth_token";
const SOCKET_SERVER = "http://localhost:3000";

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

// Initialize chat when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    // Initialize chat
    initializeChat();

    // Set up event listeners
    setupEventListeners();
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

// Function to set up socket events
function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        socket.emit('authenticate', socket.auth);
    });

    socket.on('authenticated', (data) => {
        console.log('Successfully authenticated with chat server:', data);
        currentUserId = data.userId;
        currentUserMysqlId = parseInt(data.mysqlId);
        
        // This is the single source of truth for the user's ID.
        if (currentUser) {
            currentUser.id = currentUserMysqlId;
        }
        
        console.log('Updated current user:', {
            currentUser,
            currentUserId,
            currentUserMysqlId
        });
        
        // Enable chat creation now that we are fully authenticated and have the ID.
        const createNewChatBtn = document.getElementById('createNewChatBtn');
        if (createNewChatBtn) {
            createNewChatBtn.disabled = false;
            createNewChatBtn.title = 'Create New Chat';
        }

        // Update user info if needed
        if (data.first_name && data.last_name) {
            const profileNameElement = document.getElementById('profileName');
            if (profileNameElement) {
                profileNameElement.textContent = `${data.first_name} ${data.last_name}`;
            }
            const profileImageElement = document.getElementById('profileUserImage');
            if (profileImageElement && data.avatar) {
                profileImageElement.src = data.avatar;
            }
        }

        // Enable chat functionality
        const chatFunctionalArea = document.querySelector('.messages-main-container');
        if (chatFunctionalArea) {
            chatFunctionalArea.style.display = 'flex';
        }

        // Request user's chats after authentication
        socket.emit('getMyChats');
    });

    socket.on('myChats', (chats) => {
        console.log('Received user chats:', chats);
        if (Array.isArray(chats)) {
            chats.forEach(chat => {
                fetchedChatsData.set(chat._id, chat); // Cache the chat data
                addChatToList(chat);
                // Join each chat room
                socket.emit('joinChat', chat._id);
            });
        }
    });

    socket.on('authentication_error', (error) => {
        console.error('Chat authentication failed:', error);
        disableChatFunctionality(`Authentication failed: ${error}. Please re-login.`);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        alert(error.message);
    });

    socket.on('chatCreatedSuccessfully', (chat) => {
        console.log('Chat created successfully:', chat);
        fetchedChatsData.set(chat._id, chat); // Cache the new chat data
        addChatToList(chat);
        socket.emit('joinChat', chat._id);
        selectChat(chat._id); // Automatically select the new chat
    });

    socket.on('chatAlreadyExists', (existingChat) => {
        console.log('Chat already exists:', existingChat);
        fetchedChatsData.set(existingChat._id, existingChat); // Cache the existing chat data
        addChatToList(existingChat);
        socket.emit('joinChat', existingChat._id);
        selectChat(existingChat._id);
    });

    socket.on('newChatCreated', (chat) => {
        console.log('Received new chat notification:', chat);
        fetchedChatsData.set(chat._id, chat); // Cache the new chat data
        addChatToList(chat);
        socket.emit('joinChat', chat._id);
        // Don't auto-select for recipients
    });

    socket.on('newMessage', (message) => {
        console.log('Received new message:', message);
        if (message.chatId === currentChatId) {
            displayMessages(message.chatId, [message]);
        } else {
            // Show notification for messages in other chats
            showMessageNotification(message);
        }
    });

    socket.on('chatMessages', ({ chatId, messages }) => {
        console.log('Received chat messages:', { chatId, messageCount: messages.length });
        displayMessages(chatId, messages);
    });

    socket.on('notification', (data) => {
        console.log('Received notification:', data);
        if (data.chatId !== currentChatId) {
            showMessageNotification(data.message);
        }
    });

    socket.on('userStatusChanged', ({ userId, online, lastSeen }) => {
        // Update user status in the main user list for selection
        const userInList = allUsersForSelection.find(u => u._id === userId);
        if (userInList) {
            userInList.online = online;
        }

        // Update status indicators everywhere in the UI
        document.querySelectorAll(`[data-user-id="${userId}"] .status-indicator`).forEach(indicator => {
            indicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
        });

        // Update participant list for the currently selected chat
        if (currentChatId) {
            const chatData = fetchedChatsData.get(currentChatId);
            const participant = chatData?.participants.find(p => p._id === userId);
            if (participant) {
                participant.online = online;
                displayChatParticipants(chatData.participants);
            }
        }
    });

    socket.on('chatUpdated', (updatedChat) => {
        // Update the chat in our local cache
        fetchedChatsData.set(updatedChat._id, updatedChat);

        // Update the chat in the side list
        addChatToList(updatedChat);

        // If the updated chat is the currently selected one, refresh its view
        if (currentChatId === updatedChat._id) {
            selectChat(updatedChat._id);
        }
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
    const chatList = document.getElementById('chatList');
    if (!chatList) return;

    // Check if chat already exists in the list
    let existingChat = document.querySelector(`[data-chat-id="${chat._id}"]`);
    
    // Determine chat name and other properties
    const otherParticipants = chat.participants.filter(p => p.mysql_user_id !== currentUserMysqlId.toString());
    const isDirectChat = otherParticipants.length === 1;
    const chatName = chat.name || (isDirectChat ? `${otherParticipants[0].first_name} ${otherParticipants[0].last_name}` : 'Unnamed Group');
    const otherParticipant = isDirectChat ? otherParticipants[0] : null;

    const chatItemHTML = `
        <div class="chat-avatar-container">
            <img src="${otherParticipant?.avatar || 'assets/group-chat.png'}" alt="${chatName}" class="chat-avatar">
            ${otherParticipant ? `<span class="status-indicator ${otherParticipant.online ? 'online' : 'offline'}"></span>` : ''}
        </div>
        <div class="chat-item-details">
            <span class="chat-name">${chatName}</span>
            <span class="chat-last-message">${chat.lastMessage?.content || 'No messages yet'}</span>
        </div>
    `;

    if (existingChat) {
        // Update existing chat
        existingChat.innerHTML = chatItemHTML;
    } else {
        // Create new chat item
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-list-item';
        chatItem.dataset.chatId = chat._id;
        chatItem.innerHTML = chatItemHTML;
        chatItem.addEventListener('click', () => selectChat(chat._id));
        chatList.appendChild(chatItem);
    }
}

// Function to select and display a chat
function selectChat(chatId) {
    if (currentChatId === chatId && document.getElementById('messageList').style.display !== 'none') {
        return; // Don't re-select the same chat if it's already visible
    }

    currentChatId = chatId;

    // Toggle active class on chat list
    document.querySelectorAll('.chat-list-item').forEach(item => {
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

    // Filter out the current user for the display list if desired, or handle appropriately.
    const displayParticipants = participants.filter(p => p._id !== currentUserId);

    participantsContainer.innerHTML = 'Participants: '; // Clear previous
    displayParticipants.forEach((p, index) => {
        const participantSpan = document.createElement('span');
        participantSpan.className = 'participant-item';
        participantSpan.dataset.userId = p._id;

        // Add a status indicator for each participant
        const statusIndicator = `<span class="status-indicator ${p.online ? 'online' : 'offline'}"></span>`;

        participantSpan.innerHTML = `
            ${statusIndicator}
            ${p.first_name} ${p.last_name}${index < displayParticipants.length - 1 ? ', ' : ''}
        `;
        participantsContainer.appendChild(participantSpan);
    });

    if (displayParticipants.length === 0) {
        participantsContainer.innerHTML += 'Just you';
    }
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

// ... rest of your existing code ...