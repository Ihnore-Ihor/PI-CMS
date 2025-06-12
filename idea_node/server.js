const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Keep for now, might be used for other server-to-server later
const jwt = require('jsonwebtoken'); // Added

// Import Schemas
const User = require('./schemas/User');
const Chat = require('./schemas/Chat');
const Message = require('./schemas/Message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:63342", "http://localhost:5500", "http://127.0.0.1:5500"], // Allow WebStorm, Live Server (localhost), Live Server (127.0.0.1)
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = 'mongodb://localhost:27017'; // Replace with your MongoDB connection string

// Middleware to serve static files from the 'idea' directory (parent directory)
app.use(express.static(__dirname + '/../idea'));

const JWT_SECRET = "supersecret"; // Store this in environment variables in a real app

// Enhanced MongoDB connection with options and better error handling
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
.then(() => {
    console.log('MongoDB connected successfully.');
    // Start the server only after successful DB connection
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    console.error('Please make sure MongoDB is running on your machine.');
    process.exit(1); // Exit the process with failure
});

// Add connection event listeners for better monitoring
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully.');
});

io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserMysqlId = null;

    socket.on('authenticate', async (auth) => {
        try {
            if (!auth || !auth.token) {
                return socket.emit('authentication_error', 'Invalid authentication data: token missing');
            }

            let decoded;
            try {
                decoded = jwt.verify(auth.token, JWT_SECRET);
            } catch (jwtError) {
                // Update user status to offline if token is expired
                if (jwtError.name === 'TokenExpiredError' && auth.userInfo && auth.userInfo.id) {
                    await User.findOneAndUpdate(
                        { mysql_user_id: auth.userInfo.id.toString() },
                        { 
                            online: false,
                            lastSeen: new Date()
                        }
                    );
                }
                return socket.emit('authentication_error', jwtError.message);
            }

            const mysqlId = decoded.sub;

            if (!mysqlId) {
                return socket.emit('authentication_error', 'Invalid token: Missing user ID');
            }

            const { first_name, last_name, avatar } = auth.userInfo || {};
            
            let user = await User.findOneAndUpdate(
                { mysql_user_id: mysqlId.toString() },
                {
                    $set: {
                        username: `${first_name}_${last_name}`,
                        first_name: first_name || 'Unknown',
                        last_name: last_name || 'User',
                        avatar: avatar || 'assets/user.png',
                        mysql_user_id: mysqlId.toString(),
                        socketId: socket.id,
                        online: true,
                        lastSeen: new Date()
                    }
                },
                { new: true, upsert: true }
            );

            socket.data.userId = user._id;
            socket.data.mysqlId = mysqlId;
            currentUserId = user._id;
            currentUserMysqlId = mysqlId;

            socket.join(user._id.toString());

            // Broadcast user's online status to all connected clients
            socket.broadcast.emit('userStatusChanged', {
                userId: user._id,
                mysqlId: user.mysql_user_id,
                online: true,
                lastSeen: user.lastSeen
            });

            socket.emit('authenticated', {
                userId: user._id,
                mysqlId: mysqlId,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar: user.avatar
            });

        } catch (error) {
            console.error('Authentication error:', error);
            socket.emit('authentication_error', error.message);
        }
    });

    socket.on('getAllUserStatuses', async () => {
        try {
            const users = await User.find({}, 'mysql_user_id online lastSeen _id');
            socket.emit('allUserStatuses', users);
        } catch (error) {
            console.error('Error fetching user statuses:', error);
            socket.emit('error', { message: 'Failed to fetch user statuses' });
        }
    });

    socket.on('getMyChats', async () => {
        if (!currentUserId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        try {
            console.log('Fetching chats for user:', currentUserId);
            
            const user = await User.findById(currentUserId);
            if (!user) {
                console.log('User not found:', currentUserId);
                socket.emit('error', { message: 'User not found' });
                return;
            }

            const chats = await Chat.find({ participants: currentUserId })
                .populate('participants', 'username first_name last_name avatar mysql_user_id')
                .populate({
                    path: 'lastMessage',
                    populate: { path: 'senderId', select: 'username first_name last_name avatar mysql_user_id' }
                })
                .sort({ updatedAt: -1 });

            console.log('Found chats for user:', chats.length);
            
            socket.emit('myChats', chats);

            // Join all chat rooms
            chats.forEach(chat => {
                console.log('Joining chat room:', chat._id);
                socket.join(chat._id.toString());
            });
        } catch (error) {
            console.error('Error fetching chats:', error);
            socket.emit('error', { message: 'Failed to fetch chats' });
        }
    });

    socket.on('createNewChat', async (data) => {
        if (!currentUserId) {
            return socket.emit('error', { message: 'Not authenticated' });
        }

        const { participantsData, groupName } = data;

        if (!participantsData || participantsData.length < 2) {
            return socket.emit('error', { message: 'A chat requires at least two participants.' });
        }

        try {
            // Find or create users in the chat database based on MySQL ID
            const participantPromises = participantsData.map(p =>
                User.findOneAndUpdate(
                    { mysql_user_id: p.id.toString() },
                    {
                        $setOnInsert: {
                            mysql_user_id: p.id.toString(),
                            username: p.username,
                            first_name: p.first_name,
                            last_name: p.last_name,
                            avatar: p.avatar,
                            online: false // Default to offline until they connect
                        }
                    },
                    { upsert: true, new: true } // Create if not exists, and return the new doc
                )
            );

            const participantDocs = await Promise.all(participantPromises);
            const participantIds = participantDocs.map(p => p._id);
            const creatorDoc = participantDocs.find(p => p._id.equals(currentUserId));
            
            if (!creatorDoc) {
                 return socket.emit('error', { message: 'Could not identify chat creator.' });
            }

            const isGroupChat = participantIds.length > 2 || (groupName && groupName.trim() !== '');

            // For direct chats, check if one already exists to prevent duplicates
            if (!isGroupChat) {
                const existingChat = await Chat.findOne({
                    isGroupChat: false,
                    participants: { $all: participantIds, $size: 2 }
                }).populate('participants', 'username first_name last_name avatar mysql_user_id online')
                  .populate('lastMessage');
                
                if (existingChat) {
                    return socket.emit('chatAlreadyExists', existingChat);
                }
            }

            // Create new chat
            const newChat = new Chat({
                name: groupName || null,
                participants: participantIds,
                createdBy: currentUserId,
                isGroupChat: isGroupChat
            });

            await newChat.save();
            const populatedChat = await newChat.populate([
                { path: 'participants', select: 'username first_name last_name avatar mysql_user_id online' },
                { path: 'createdBy', select: 'username first_name last_name avatar mysql_user_id' }
            ]);
            
            // Notify all participants about the new chat
            participantDocs.forEach(user => {
                if (user.socketId) {
                    const event = user._id.equals(currentUserId) ? 'chatCreatedSuccessfully' : 'newChatCreated';
                    io.to(user.socketId).emit(event, populatedChat);
                }
            });

        } catch (error) {
            console.error('Error creating new chat:', error);
            socket.emit('error', { message: 'Failed to create chat.' });
        }
    });

    socket.on('joinChat', async (chatId) => {
        if (!currentUserId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        try {
            const chat = await Chat.findOne({
                _id: chatId,
                participants: currentUserId
            });

            if (!chat) {
                socket.emit('error', { message: 'Chat not found or access denied' });
                return;
            }

            socket.join(chatId.toString());
            console.log(`User ${currentUserId} joined chat ${chatId}`);
        } catch (error) {
            console.error('Error joining chat:', error);
            socket.emit('error', { message: 'Failed to join chat' });
        }
    });

    socket.on('getChatMessages', async (chatId) => {
        console.log('[getChatMessages] Request received:', {
            userId: currentUserId,
            chatId: chatId
        });

        if (!currentUserId) {
            console.log('[getChatMessages] Not authenticated');
            return socket.emit('error', { message: 'Not authenticated' });
        }

        try {
            // Validate the user is a participant of the chat they're requesting
            const chat = await Chat.findOne({ _id: chatId, participants: currentUserId });
            if (!chat) {
                console.log('[getChatMessages] Chat not found or user not participant:', {
                    chatId,
                    userId: currentUserId
                });
                return socket.emit('error', { message: 'Chat not found or you are not a participant.' });
            }

            const messages = await Message.find({ chatId: chatId })
                .sort({ timestamp: 'asc' })
                .populate('senderId', 'username first_name last_name avatar mysql_user_id');
            
            console.log('[getChatMessages] Found messages:', {
                chatId,
                messageCount: messages.length,
                timeRange: messages.length > 0 ? {
                    oldest: messages[0].timestamp,
                    newest: messages[messages.length - 1].timestamp
                } : null
            });
            
            socket.emit('chatMessages', { chatId, messages });

        } catch (error) {
            console.error('[getChatMessages] Error:', error);
            socket.emit('error', { message: 'Failed to fetch messages.' });
        }
    });

    socket.on('sendMessage', async ({ chatId, content }) => {
        console.log('[sendMessage] New message request:', {
            chatId,
            senderId: currentUserId,
            contentLength: content ? content.length : 0
        });

        try {
            // First get the current user for sender details
            const sender = await User.findById(currentUserId);
            if (!sender) {
                console.log('[sendMessage] Sender not found:', currentUserId);
                socket.emit('error', { message: 'Sender not found' });
                return;
            }

            const chat = await Chat.findOne({
                _id: chatId,
                participants: currentUserId
            }).populate('participants');

            if (!chat) {
                console.log('[sendMessage] Chat not found or access denied:', {
                    chatId,
                    userId: currentUserId
                });
                socket.emit('error', { message: 'Chat not found or access denied' });
                return;
            }

            console.log('[sendMessage] Creating new message:', {
                chatId,
                senderId: currentUserId,
                senderName: `${sender.first_name}_${sender.last_name}`
            });

            const message = new Message({
                chatId: chatId,
                senderId: currentUserId,
                senderName: `${sender.first_name}_${sender.last_name}`,
                senderAvatar: sender.avatar || 'assets/user.png',
                content: content,
                timestamp: new Date()
            });

            await message.save();
            console.log('[sendMessage] Message saved:', message._id);

            // Update chat's last message and timestamp
            chat.lastMessage = message._id;
            chat.updatedAt = new Date();
            await chat.save();
            console.log('[sendMessage] Chat updated with new message');

            // Populate the message with sender details
            const populatedMessage = await Message.findById(message._id)
                .populate('senderId', 'username first_name last_name avatar mysql_user_id');

            console.log('[sendMessage] Broadcasting message to chat participants');
            
            // Emit to all participants
            chat.participants.forEach(participant => {
                io.to(participant._id.toString()).emit('newMessage', populatedMessage);
            });

        } catch (error) {
            console.error('[sendMessage] Error:', error);
            socket.emit('error', { message: 'Failed to send message.' });
        }
    });

    socket.on('updateChat', async (data) => {
        if (!currentUserId) return socket.emit('error', { message: 'Not authenticated.' });

        try {
            const chat = await Chat.findById(data.chatId).populate('participants');
            if (!chat) return socket.emit('error', { message: 'Chat not found.' });

            // Authorization: only the creator can edit
            if (!chat.createdBy.equals(currentUserId)) {
                return socket.emit('error', { message: 'You are not authorized to edit this chat.' });
            }

            // Update name if provided
            if (data.name) {
                chat.name = data.name;
            }

            // Update participants if provided
            if (data.participants.length > 0) {
                const newParticipantUsers = await User.find({ mysql_user_id: { $in: data.participants.map(String) } });
                const newParticipantIds = newParticipantUsers.map(u => u._id);
                
                // Add creator to participants if not already included
                if (!newParticipantIds.some(id => id.equals(currentUserId))) {
                    newParticipantIds.push(currentUserId);
                }

                chat.participants = newParticipantIds;
                chat.isGroupChat = newParticipantIds.length > 2 || Boolean(data.name);
            }
            
            chat.updatedAt = new Date();
            await chat.save();
            
            const populatedChat = await Chat.findById(chat._id)
                .populate('participants', 'username first_name last_name avatar online lastSeen mysql_user_id')
                .populate('createdBy', 'username first_name last_name');

            // Notify all current and new participants
            populatedChat.participants.forEach(p => {
                io.to(p._id.toString()).emit('chatUpdated', populatedChat);
            });

        } catch (error) {
            console.error(`Error updating chat ${data.chatId}:`, error);
            socket.emit('error', { message: 'Failed to update chat.' });
        }
    });

    socket.on('getChatDetails', async (chatId) => {
        if (!currentUserId) {
            return socket.emit('error', { message: 'Not authenticated' });
        }

        try {
            const chat = await Chat.findOne({ _id: chatId, participants: currentUserId })
                .populate('participants', 'username first_name last_name avatar mysql_user_id')
                .populate({
                    path: 'lastMessage',
                    populate: { path: 'senderId', select: 'username first_name last_name avatar mysql_user_id' }
                });

            if (!chat) {
                return socket.emit('error', { message: 'Chat not found or you are not a participant.' });
            }

            socket.emit('chatDetails', chat);
        } catch (error) {
            console.error(`Error fetching details for chat ${chatId}:`, error);
            socket.emit('error', { message: 'Failed to fetch chat details.' });
        }
    });

    socket.on('disconnect', async () => {
        if (currentUserId) {
            try {
                // Update user status in MongoDB
                const user = await User.findByIdAndUpdate(currentUserId, {
                    online: false,
                    lastSeen: new Date(),
                    socketId: null // Clear the socket ID
                }, { new: true });

                if (user) {
                    // Broadcast status change to all connected clients
                    socket.broadcast.emit('userStatusChanged', {
                        userId: user._id,
                        mysqlId: user.mysql_user_id,
                        online: false,
                        lastSeen: new Date()
                    });

                    // Leave all rooms
                    const rooms = [...socket.rooms];
                    rooms.forEach(room => {
                        socket.leave(room);
                    });
                }
            } catch (error) {
                console.error('Error updating user status on disconnect:', error);
            }
        }
    });
});

// Basic route to serve the main HTML page for testing if needed directly
// app.get('/', (req, res) => {
//   res.sendFile(__dirname + '/../idea/Messages.html');
// }); 