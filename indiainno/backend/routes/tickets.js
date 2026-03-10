const express = require('express');
const router = express.Router();
const { MasterTicket, Upvote, RawComplaint } = require('../models/Ticket');
const { protect, authorize } = require('../middleware/authMiddleware');

const SEVERITY_THRESHOLDS = { Medium: 3, High: 10, Critical: 25 };
const DEDUP_RADIUS_METERS = 50;

function calculateSeverity(count) {
    if (count >= SEVERITY_THRESHOLDS.Critical) return "Critical";
    if (count >= SEVERITY_THRESHOLDS.High) return "High";
    if (count >= SEVERITY_THRESHOLDS.Medium) return "Medium";
    return "Low";
}

// Helper: Format ticket for frontend
function formatTicket(t) {
    const obj = t.toObject ? t.toObject() : t;
    return {
        ...obj,
        id: obj._id,
        lat: obj.location ? obj.location.coordinates[1] : null,
        lng: obj.location ? obj.location.coordinates[0] : null,
    };
}

// ─── GET /api/tickets/public-map ─── Public map data (no auth)
router.get('/public-map', async (req, res) => {
    try {
        const tickets = await MasterTicket.find({
            location: { $exists: true, $ne: null },
            status: { $nin: ['Invalid_Spam', 'Pending_Approval'] }
        }).select('intentCategory severity status complaintCount upvoteCount location landmark city department createdAt ticketNumber');

        res.json(tickets.map(formatTicket));
    } catch (err) {
        console.error('[Public Map Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/tickets/complaint ─── Submit a new complaint
router.post('/complaint', protect, async (req, res) => {
    try {
        const { category, description, landmark, lat, lng, accuracy, department, imageUrl } = req.body;

        if (!category) {
            return res.status(400).json({ message: 'Category is required' });
        }
        if (!description) {
            return res.status(400).json({ message: 'Description is required' });
        }

        let matchingTicket = null;
        let isNew = false;

        // Spatial deduplication using MongoDB 2dsphere
        if (lat && lng) {
            try {
                const nearbyTickets = await MasterTicket.find({
                    intentCategory: category,
                    status: { $nin: ['Closed', 'Invalid_Spam', 'Pending_Approval'] },
                    location: {
                        $near: {
                            $geometry: { type: "Point", coordinates: [lng, lat] },
                            $maxDistance: DEDUP_RADIUS_METERS
                        }
                    }
                }).limit(1);

                if (nearbyTickets.length > 0) {
                    matchingTicket = nearbyTickets[0];
                }
            } catch (geoErr) {
                // If 2dsphere index doesn't exist yet, skip dedup
                console.warn('[Dedup] Geo query failed (index may not exist yet):', geoErr.message);
            }
        }

        if (matchingTicket) {
            matchingTicket.complaintCount += 1;
            matchingTicket.severity = calculateSeverity(matchingTicket.complaintCount + matchingTicket.upvoteCount);
            if (!matchingTicket.department && department) matchingTicket.department = department;
            await matchingTicket.save();
        } else {
            isNew = true;
            matchingTicket = new MasterTicket({
                intentCategory: category,
                description: description,
                severity: "Low",
                complaintCount: 1,
                status: "Open",
                department: department || null,
                needsManualGeo: (!lat || !lng),
                landmark: landmark || "",
                city: req.user.city || "",
                imageUrl: imageUrl || null,
                location: (lat && lng) ? { type: "Point", coordinates: [lng, lat] } : undefined
            });
            await matchingTicket.save();
        }

        // Save raw complaint
        const complaint = new RawComplaint({
            userId: req.user._id,
            transcriptOriginal: description,
            transcriptEnglish: description,
            intentCategory: category,
            extractedLandmark: landmark || '',
            location: (lat && lng) ? { type: "Point", coordinates: [lng, lat] } : undefined,
            geoAccuracy: accuracy,
            department: department,
            source: 'web_form',
            status: matchingTicket.status,
            masterTicketId: matchingTicket._id
        });
        await complaint.save();

        res.status(201).json({
            ticketId: matchingTicket._id,
            isNew,
            ticket: formatTicket(matchingTicket),
            needsManualGeo: matchingTicket.needsManualGeo
        });

    } catch (err) {
        console.error('[Complaint Submit Error]', err);
        res.status(500).json({ message: err.message || 'Failed to submit complaint' });
    }
});

// ─── GET /api/tickets/my-complaints ─── User's own complaints
router.get('/my-complaints', protect, async (req, res) => {
    try {
        const complaints = await RawComplaint.find({ userId: req.user._id })
            .populate('masterTicketId')
            .sort({ createdAt: -1 });

        const enriched = complaints.map(c => ({
            ...c.toObject(),
            id: c._id,
            ticket: c.masterTicketId ? { ...c.masterTicketId.toObject(), id: c.masterTicketId._id } : null
        }));
        res.json(enriched);
    } catch (err) {
        console.error('[My Complaints Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/master ─── All master tickets (filtered by role)
router.get('/master', protect, async (req, res) => {
    try {
        const query = { status: { $ne: 'Pending_Approval' } };
        if (req.user.city) {
            query.city = req.user.city;
        }

        if (req.user.role === 'engineer' && req.user.department) {
            query.department = req.user.department;
            query.$or = [{ assignedEngineerId: req.user._id }, { assignedEngineerId: null }];
            query.status = { $nin: ['Closed', 'Pending_Approval'] };
        } else if (req.query.needsManualGeo === 'true') {
            query.needsManualGeo = true;
            query.status = { $nin: ['Closed', 'Invalid_Spam', 'Pending_Approval'] };
        }

        const tickets = await MasterTicket.find(query)
            .populate('assignedEngineerId', 'name email phone department')
            .sort({ updatedAt: -1 });

        res.json(tickets.map(formatTicket));
    } catch (err) {
        console.error('[Master Tickets Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/pending-approval ─── For Officer Dashboard
router.get('/pending-approval', protect, authorize('admin', 'officer'), async (req, res) => {
    try {
        const query = { status: 'Pending_Approval' };
        if (req.user.department) query.department = req.user.department;
        if (req.user.city) query.city = req.user.city;

        const tickets = await MasterTicket.find(query).sort({ createdAt: -1 });
        res.json(tickets.map(formatTicket));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── PUT /api/tickets/master/:id/approve ─── Senior Officer Approves Voice Ticket
router.put('/master/:id/approve', protect, authorize('admin', 'officer'), async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket || ticket.status !== 'Pending_Approval') {
            return res.status(404).json({ message: 'Ticket not found or already verified' });
        }

        const allowedFields = ['intentCategory', 'department', 'city', 'landmark', 'description'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) ticket[field] = req.body[field];
        });

        ticket.status = 'Open';
        await ticket.save();

        await RawComplaint.updateMany(
            { masterTicketId: ticket._id },
            {
                status: 'Open',
                intentCategory: ticket.intentCategory,
                department: ticket.department,
                extractedLandmark: ticket.landmark
            }
        );

        const twilioService = require('../services/twilio');
        if (twilioService && ticket.source === 'voice_call') {
            const raw = await RawComplaint.findOne({ masterTicketId: ticket._id });
            if (raw && raw.callerPhoneRaw) {
                try {
                    await twilioService.sendNotification(
                        raw.callerPhoneRaw,
                        `CivicSync: Aapki shikayat pass ho gayi hai!\n` +
                        `Ticket: ${ticket.ticketNumber}\n` +
                        `Sub: ${ticket.intentCategory}\n` +
                        `Dept: ${ticket.department || 'General'}\n`
                    );
                } catch (smsErr) {
                    console.error('[Officer Approve] SMS failed:', smsErr.message);
                }
            }
        }

        res.json({ message: 'Ticket approved and SMS sent', ticket: formatTicket(ticket) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/master/:id ─── Single ticket detail
router.get('/master/:id', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id)
            .populate('assignedEngineerId', 'name email phone');
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        res.json(formatTicket(ticket));
    } catch (err) {
        console.error('[Ticket Detail Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── PUT /api/tickets/master/:id ─── Update ticket
router.put('/master/:id', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // Dynamic field updates
        const allowedFields = ['status', 'assignedEngineerId', 'needsManualGeo', 'resolutionNotes', 'severity', 'complaintCount', 'department', 'landmark', 'city', 'progressPercent'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'assignedEngineerId' && !req.body[field]) {
                    ticket[field] = null;
                } else {
                    ticket[field] = req.body[field];
                }
            }
        });

        // Push progress update with photo+remarks if progress changed
        if (req.body.progressPercent !== undefined && req.body.progressPercent > 0) {
            ticket.progressUpdates.push({
                percent: req.body.progressPercent,
                remarks: req.body.progressRemarks || '',
                imageUrl: req.body.progressImageUrl || null,
                timestamp: new Date()
            });
        }

        // Manual coordinate fix from Admin
        if (req.body.lat && req.body.lng) {
            ticket.location = { type: 'Point', coordinates: [req.body.lng, req.body.lat] };
        }

        // Engineer resolution submission
        if (req.body.resolutionLat && req.body.resolutionLng) {
            ticket.resolutionLocation = { type: 'Point', coordinates: [req.body.resolutionLng, req.body.resolutionLat] };
            ticket.resolutionImageUrl = req.body.resolutionImageUrl;
            ticket.resolutionTimestamp = new Date();
            ticket.status = 'Pending_Verification';
        }

        await ticket.save();
        res.json(formatTicket(ticket));
    } catch (err) {
        console.error('[Ticket Update Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── PUT /api/tickets/master/:id/verify ─── Citizen verifies resolution
router.put('/master/:id/verify', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const { verified, rating, feedback } = req.body;

        if (verified) {
            ticket.status = 'Closed';
        } else {
            ticket.status = 'Disputed';
        }

        if (rating !== undefined) ticket.citizenRating = rating;
        if (feedback !== undefined) ticket.citizenFeedback = feedback;

        await ticket.save();
        res.json(formatTicket(ticket));
    } catch (err) {
        console.error('[Ticket Verify Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/tickets/master/:id/upvote ─── Add upvote (1 per user per ticket)
router.post('/master/:id/upvote', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // Check for existing upvote
        const existing = await Upvote.findOne({ userId: req.user._id, ticketId: ticket._id });
        if (existing) {
            return res.status(409).json({ message: 'You have already upvoted this concern', upvoted: true, upvoteCount: ticket.upvoteCount });
        }

        await Upvote.create({ userId: req.user._id, ticketId: ticket._id });
        ticket.upvoteCount += 1;
        ticket.severity = calculateSeverity(ticket.complaintCount + ticket.upvoteCount);
        await ticket.save();

        res.json({ upvoted: true, upvoteCount: ticket.upvoteCount, severity: ticket.severity });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Already upvoted' });
        }
        console.error('[Upvote Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── DELETE /api/tickets/master/:id/upvote ─── Remove upvote
router.delete('/master/:id/upvote', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const deleted = await Upvote.findOneAndDelete({ userId: req.user._id, ticketId: ticket._id });
        if (!deleted) {
            return res.status(404).json({ message: 'You have not upvoted this concern', upvoted: false, upvoteCount: ticket.upvoteCount });
        }

        ticket.upvoteCount = Math.max(0, ticket.upvoteCount - 1);
        ticket.severity = calculateSeverity(ticket.complaintCount + ticket.upvoteCount);
        await ticket.save();

        res.json({ upvoted: false, upvoteCount: ticket.upvoteCount, severity: ticket.severity });
    } catch (err) {
        console.error('[Remove Upvote Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/master/:id/upvote-status ─── Check if current user upvoted
router.get('/master/:id/upvote-status', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const existing = await Upvote.findOne({ userId: req.user._id, ticketId: ticket._id });
        res.json({ upvoted: !!existing, upvoteCount: ticket.upvoteCount });
    } catch (err) {
        console.error('[Upvote Status Error]', err);
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/stats ─── Dashboard stats (admin)
router.get('/stats', protect, authorize('admin'), async (req, res) => {
    try {
        const [total, open, critical, pendingGeo] = await Promise.all([
            MasterTicket.countDocuments(),
            MasterTicket.countDocuments({ status: { $nin: ['Closed', 'Invalid_Spam'] } }),
            MasterTicket.countDocuments({ severity: 'Critical', status: { $nin: ['Closed'] } }),
            MasterTicket.countDocuments({ needsManualGeo: true, status: { $nin: ['Closed'] } })
        ]);
        res.json({ total, open, critical, pendingGeo });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/tickets/officer-analytics ─── Area + Engineer breakdown
router.get('/officer-analytics', protect, authorize('admin'), async (req, res) => {
    try {
        const User = require('../models/User');
        const tickets = await MasterTicket.find().populate('assignedEngineerId', 'name email department').lean();
        const engineers = await User.find({ role: 'engineer' }).select('name email department city').lean();

        // Area breakdown
        const areaMap = {};
        tickets.forEach(t => {
            const area = t.city || t.landmark || 'Unknown';
            if (!areaMap[area]) areaMap[area] = { area, pending: 0, resolved: 0, citizens: 0, critical: 0 };
            if (t.status !== 'Closed' && t.status !== 'Invalid_Spam') areaMap[area].pending++;
            else areaMap[area].resolved++;
            areaMap[area].citizens += (t.complaintCount || 1);
            if (t.severity === 'Critical' && t.status !== 'Closed') areaMap[area].critical++;
        });

        // Engineer deployment
        const engineerMap = {};
        engineers.forEach(e => {
            engineerMap[e._id.toString()] = { id: e._id, name: e.name, email: e.email, department: e.department, assigned: 0, resolved: 0, areas: new Set() };
        });
        tickets.forEach(t => {
            if (t.assignedEngineerId) {
                const eid = (t.assignedEngineerId._id || t.assignedEngineerId).toString();
                if (engineerMap[eid]) {
                    engineerMap[eid].assigned++;
                    if (t.status === 'Closed') engineerMap[eid].resolved++;
                    engineerMap[eid].areas.add(t.city || t.landmark || 'Unknown');
                }
            }
        });

        // Convert Sets to arrays
        const engineerStats = Object.values(engineerMap).map(e => ({ ...e, areas: [...e.areas] }));

        // Unique affected citizens
        const rawComplaints = await RawComplaint.distinct('userId');
        const affectedCitizens = rawComplaints.length;

        res.json({
            areas: Object.values(areaMap).sort((a, b) => b.pending - a.pending),
            engineers: engineerStats,
            affectedCitizens,
            totalTickets: tickets.length,
            openTickets: tickets.filter(t => t.status !== 'Closed' && t.status !== 'Invalid_Spam').length
        });
    } catch (err) {
        console.error('[Officer Analytics Error]', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
