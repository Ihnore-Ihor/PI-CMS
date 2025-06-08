const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    name: { type: String }, // Optional: for group chats
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isGroupChat: { type: Boolean, default: false },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat; 