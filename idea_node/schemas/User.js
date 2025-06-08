const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    mysql_user_id: { type: String, unique: true, required: true, index: true },
    username: { type: String, unique: true, required: true },
    first_name: String,
    last_name: String,
    avatar: String,
    online: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    socketId: String,
    chats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }]
});

const User = mongoose.model('User', userSchema);

module.exports = User; 