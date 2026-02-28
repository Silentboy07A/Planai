const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    imageData: {
        type: String, // base64 data or URL
        default: '',
    },
    disease: {
        type: String,
        required: true,
    },
    confidence: {
        type: Number,
        required: true,
    },
    treatment: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

predictionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);
