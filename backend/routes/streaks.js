const express = require('express');
const router = express.Router();
const Streak = require('../models/Streak');

/**
 * Get the ISO date string for the Monday of the current week.
 */
function getWeekStart() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

/**
 * GET /api/streaks
 * Get current week's streak for the logged-in user.
 */
router.get('/', async (req, res) => {
    try {
        const weekStart = getWeekStart();
        let streak = await Streak.findOne({
            userId: req.user._id,
            weekStart,
        });

        if (!streak) {
            streak = { weekStart, days: [] };
        }

        res.json(streak);
    } catch (err) {
        console.error('Get streak error:', err);
        res.status(500).json({ error: 'Failed to get streak data' });
    }
});

/**
 * POST /api/streaks
 * Mark a day as complete with an image.
 * Body: { dayIndex: 0-6, imageData: "base64..." }
 */
router.post('/', async (req, res) => {
    try {
        const { dayIndex, imageData } = req.body;

        if (dayIndex === undefined || dayIndex < 0 || dayIndex > 6) {
            return res.status(400).json({ error: 'Invalid dayIndex (0-6)' });
        }

        const weekStart = getWeekStart();

        let streak = await Streak.findOne({
            userId: req.user._id,
            weekStart,
        });

        if (!streak) {
            streak = new Streak({
                userId: req.user._id,
                weekStart,
                days: [],
            });
        }

        // Check if this day already exists
        const existingDay = streak.days.find(d => d.dayIndex === dayIndex);
        if (existingDay) {
            existingDay.completed = true;
            existingDay.imageData = imageData || '';
            existingDay.uploadedAt = new Date();
        } else {
            streak.days.push({
                dayIndex,
                completed: true,
                imageData: imageData || '',
                uploadedAt: new Date(),
            });
        }

        await streak.save();
        res.json(streak);
    } catch (err) {
        console.error('Save streak error:', err);
        res.status(500).json({ error: 'Failed to save streak' });
    }
});

/**
 * DELETE /api/streaks/:dayIndex
 * Clear a day's proof.
 */
router.delete('/:dayIndex', async (req, res) => {
    try {
        const dayIndex = parseInt(req.params.dayIndex);
        const weekStart = getWeekStart();

        const streak = await Streak.findOne({
            userId: req.user._id,
            weekStart,
        });

        if (!streak) {
            return res.status(404).json({ error: 'No streak found for this week' });
        }

        streak.days = streak.days.filter(d => d.dayIndex !== dayIndex);
        await streak.save();

        res.json(streak);
    } catch (err) {
        console.error('Delete streak error:', err);
        res.status(500).json({ error: 'Failed to delete streak entry' });
    }
});

module.exports = router;
