const express = require('express');
const router = express.Router();
const Prediction = require('../models/Prediction');

/**
 * GET /api/predictions
 * Get the logged-in user's prediction history (last 20).
 */
router.get('/', async (req, res) => {
    try {
        const predictions = await Prediction.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        res.json(predictions);
    } catch (err) {
        console.error('Get predictions error:', err);
        res.status(500).json({ error: 'Failed to get predictions' });
    }
});

module.exports = router;
