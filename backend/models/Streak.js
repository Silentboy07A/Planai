const mongoose = require('mongoose');

const dayEntrySchema = new mongoose.Schema({
    dayIndex: { type: Number, required: true, min: 0, max: 6 },
    completed: { type: Boolean, default: false },
    imageData: { type: String, default: '' }, // base64 data URI
    uploadedAt: { type: Date, default: Date.now },
});

const streakSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    weekStart: {
        type: String, // ISO date string for the Monday of the week
        required: true,
    },
    days: [dayEntrySchema],
}, {
    timestamps: true,
});

// Compound index: one streak doc per user per week
streakSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('Streak', streakSchema);
