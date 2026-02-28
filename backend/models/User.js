const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        // Not required — Google OAuth users won't have one
        minlength: 6,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true, // allows multiple null values
    },
    avatar: {
        type: String, // Google profile picture URL
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local',
    },
}, {
    timestamps: true,
});

// Hash password before saving (only for local auth)
userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
