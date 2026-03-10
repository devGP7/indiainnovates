const express = require('express');
const router = express.Router();
const { MasterTicket, RawComplaint } = require('../models/Ticket');
const { protect } = require('../middleware/authMiddleware');

let twilio, VoiceResponse;
try {
    twilio = require('twilio');
    VoiceResponse = twilio.twiml.VoiceResponse;
} catch (e) {
    console.warn('[Voice] Twilio SDK not available. Voice routes will return 503.');
}

let aiService;
try {
    aiService = require('../services/ai');
} catch (e) {
    console.warn('[Voice] AI service not available:', e.message);
}

// =============================================
// POST /api/voice/incoming — Start Call Flow
// =============================================
router.post('/incoming', (req, res) => {
    if (!VoiceResponse) return res.status(503).json({ message: 'Twilio not configured' });

    const twiml = new VoiceResponse();
    const baseUrl = process.env.WEBHOOK_BASE_URL;

    // Play Hindi greeting
    twiml.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'Civic Sync mein aapka swagat hai. Kripya beep ke baad apni shikayat darj karein. Bolne ke baad, star key dabayein.'
    );

    // Record the user's voice — action MUST be an absolute URL for Twilio
    twiml.record({
        maxLength: 60,
        playBeep: true,
        action: `${baseUrl}/api/voice/recording-complete`,
        statusCallback: `${baseUrl}/api/voice/call-status`,
        trim: 'trim-silence',
        finishOnKey: '*'
    });

    // Fallback if user doesn't press anything
    twiml.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'Hum aapki awaaz nahi sun paye. Kripya dobara call karein. Dhanyawad.'
    );

    res.type('text/xml').send(twiml.toString());
});


// =============================================
// POST /api/voice/recording-complete — Process & Store
// =============================================
router.post('/recording-complete', async (req, res) => {
    if (!VoiceResponse) return res.status(503).json({ message: 'Twilio not configured' });

    const { RecordingUrl, CallSid, Caller } = req.body;

    const twiml = new VoiceResponse();

    if (!RecordingUrl) {
        twiml.say(
            { voice: 'Polly.Aditi', language: 'hi-IN' },
            'Kshama karein, hum aapki shikayat record nahi kar paaye. Kripya dobara call karein. Dhanyawad.'
        );
        return res.type('text/xml').send(twiml.toString());
    }

    // Immediately play the farewell message and hang up
    twiml.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'Dhanyawad, aapki shikayat aage bhej di gayi hai. Jab afsar dwara pass hogi toh aapko message aayega.'
    );
    res.type('text/xml').send(twiml.toString());

    // ── Async Processing Pipeline ──
    try {
        console.log(`[Voice] Processing ${CallSid} from ${Caller}`);

        const crypto = require('crypto');
        const callerHash = crypto.createHash('sha256').update(Caller || "unknown").digest('hex');

        let transcriptText = 'Voice complaint (transcription pending)';
        let originalTranscriptText = 'Voice complaint (transcription pending)';
        let intentCategory = 'Other';
        let department = null;
        let city = '';
        let landmark = '';

        if (aiService) {
            try {
                console.log(`[Voice] Starting STT for recording: ${RecordingUrl}`);
                const sttResult = await aiService.speechToText(RecordingUrl);

                originalTranscriptText = sttResult.transcriptOriginal || originalTranscriptText;
                transcriptText = sttResult.transcriptEnglish || originalTranscriptText;

                console.log(`[Voice] Original STT: "${originalTranscriptText}"`);
                console.log(`[Voice] English STT: "${transcriptText}"`);

                const entities = await aiService.extractComplaintEntities(transcriptText);
                intentCategory = entities.intentCategory || 'Other';
                department = entities.department || 'municipal';
                city = entities.city && entities.city !== 'Unknown' ? entities.city : '';
                landmark = entities.landmark || '';

                console.log(`[Voice] Extracted entities:`, entities);
            } catch (aiErr) {
                console.error('[Voice] AI processing failed, saving with placeholder:', aiErr.message);
            }
        }

        // Create ticket initially as Pending_Approval
        const ticket = new MasterTicket({
            intentCategory,
            description: transcriptText,
            originalTranscript: originalTranscriptText,
            severity: "Low",
            complaintCount: 1,
            status: "Pending_Approval", // MUST be approved by officer before going 'Open'
            needsManualGeo: true,
            landmark: landmark || "From voice call - needs manual review",
            audioUrl: RecordingUrl,
            department: department,
            city: city,
            source: 'voice_call'
        });
        await ticket.save();

        const rawComplaint = new RawComplaint({
            callerPhone: callerHash,
            callerPhoneRaw: Caller || "",
            audioUrl: RecordingUrl,
            status: 'Pending_Approval',
            source: 'voice_call',
            transcriptOriginal: originalTranscriptText,
            transcriptEnglish: transcriptText,
            intentCategory,
            department: department,
            extractedLandmark: landmark,
            masterTicketId: ticket._id
        });
        await rawComplaint.save();

        console.log(`[Voice] Successfully saved ticket ${ticket.ticketNumber} as Pending_Approval`);

        // Note: We DO NOT send SMS here. Sent on officer approval.

    } catch (err) {
        console.error("[Voice Pipeline Failure]", err);
    }
});

// =============================================
// POST /api/voice/re-transcribe/:ticketId — Retry failed STT
// =============================================
router.post('/re-transcribe/:ticketId', protect, async (req, res) => {
    try {
        const ticket = await MasterTicket.findById(req.params.ticketId);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
        if (!ticket.audioUrl) return res.status(400).json({ message: 'No audio recording URL' });

        if (!aiService) return res.status(503).json({ message: 'AI service not available' });

        console.log(`[Re-Transcribe] Starting for ticket ${ticket.ticketNumber}`);

        const sttResult = await aiService.speechToText(ticket.audioUrl);
        const originalTranscriptText = sttResult.transcriptOriginal || 'Transcription failed';
        const transcriptText = sttResult.transcriptEnglish || originalTranscriptText;

        const entities = await aiService.extractComplaintEntities(transcriptText);
        const intentCategory = entities.intentCategory || ticket.intentCategory;
        const department = entities.department || ticket.department;
        const city = entities.city && entities.city !== 'Unknown' ? entities.city : ticket.city;
        const landmark = entities.landmark || ticket.landmark;

        ticket.description = transcriptText;
        ticket.originalTranscript = originalTranscriptText;
        ticket.intentCategory = intentCategory;
        ticket.department = department;
        ticket.city = city;
        ticket.landmark = landmark || ticket.landmark;
        await ticket.save();

        await RawComplaint.updateMany(
            { masterTicketId: ticket._id },
            {
                transcriptOriginal: originalTranscriptText,
                transcriptEnglish: transcriptText,
                intentCategory,
                department,
                extractedLandmark: landmark
            }
        );

        res.json({
            success: true,
            originalTranscript: originalTranscriptText,
            englishTranscript: transcriptText,
            intentCategory,
            department,
            city,
            landmark
        });

    } catch (err) {
        console.error('[Re-Transcribe Error]', err?.response?.data || err.message);
        res.status(500).json({ message: 'Re-transcription failed', error: err.message });
    }
});

// =============================================
// POST /api/voice/call-me — Citizen requests callback
// =============================================
router.post('/call-me', protect, async (req, res) => {
    try {
        const DEMO_PHONE = process.env.DEMO_PHONE_NUMBER || '';
        const bodyPhone = (req.body && req.body.phone) ? req.body.phone : '';
        const userPhone = (req.user && req.user.phone) ? req.user.phone : '';

        // Priority: phone from request body → DEMO env var → user profile phone
        let formattedPhone = bodyPhone || DEMO_PHONE || userPhone;

        if (!formattedPhone || formattedPhone.length < 10) {
            return res.status(400).json({ message: 'No valid phone number', needsPhone: true });
        }

        formattedPhone = formattedPhone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.replace(/^0+/, '');
            if (!formattedPhone.startsWith('91')) formattedPhone = '91' + formattedPhone;
            formattedPhone = '+' + formattedPhone;
        }

        const webhookBase = process.env.WEBHOOK_BASE_URL;
        if (!webhookBase) {
            return res.status(500).json({ message: 'Server webhook URL not configured. Set WEBHOOK_BASE_URL in .env' });
        }

        console.log(`[Call-Me] Calling ${formattedPhone}, webhook: ${webhookBase}`);

        const twilioService = require('../services/twilio');
        const callSid = await twilioService.makeCall(formattedPhone, webhookBase);

        res.json({ success: true, message: `Call initiated to ${formattedPhone}!`, callSid });
    } catch (err) {
        console.error('[Call-Me Error]', err.message || err);
        res.status(500).json({ message: 'Failed to initiate call: ' + (err.message || 'Unknown error') });
    }
});

// =============================================
// POST /api/voice/call-status — Status Callback
// =============================================
router.post('/call-status', (req, res) => {
    console.log(`[Voice] Call ${req.body.CallSid} status: ${req.body.CallStatus} (${req.body.CallDuration}s)`);
    res.sendStatus(200);
});

module.exports = router;
