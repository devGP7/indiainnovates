const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
}, { _id: false });

const masterTicketSchema = new mongoose.Schema({
    intentCategory: { type: String, required: true },
    location: { type: pointSchema, index: '2dsphere' },
    severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
    complaintCount: { type: Number, default: 1 },
    status: {
        type: String,
        enum: ['Pending_Approval', 'Open', 'Assigned', 'In_Progress', 'Pending_Verification', 'Closed', 'Disputed', 'Invalid_Spam'],
        default: 'Pending_Approval'
    },
    assignedEngineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    department: { type: String, default: null },
    resolutionImageUrl: { type: String, default: null },
    resolutionLocation: { type: pointSchema, default: null },
    resolutionNotes: { type: String, default: null },
    resolutionTimestamp: { type: Date, default: null },
    needsManualGeo: { type: Boolean, default: false },
    landmark: { type: String, default: '' },
    city: { type: String, default: '' },
    audioUrl: { type: String, default: null },
    description: { type: String, default: '' },
    originalTranscript: { type: String, default: '' },
    source: { type: String, enum: ['web_form', 'voice_call', 'sms'], default: 'web_form' },
    ticketNumber: { type: String, unique: true },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    citizenRating: { type: Number, default: null, min: 1, max: 5 },
    citizenFeedback: { type: String, default: '' },
    upvoteCount: { type: Number, default: 0 },
    imageUrl: { type: String, default: null },
    progressUpdates: [{
        percent: { type: Number, required: true },
        remarks: { type: String, default: '' },
        imageUrl: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Pre-save middleware to auto-generate ticketNumber if not exists
masterTicketSchema.pre('save', function () {
    if (!this.ticketNumber) {
        // e.g., TKT-123456
        this.ticketNumber = 'TKT-' + Math.floor(100000 + Math.random() * 900000);
    }
});

const upvoteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterTicket', required: true }
}, { timestamps: true });

upvoteSchema.index({ userId: 1, ticketId: 1 }, { unique: true });

const rawComplaintSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    callerPhone: { type: String },
    callerPhoneRaw: { type: String },
    audioUrl: { type: String },
    transcriptOriginal: { type: String },
    transcriptEnglish: { type: String },
    intentCategory: { type: String },
    extractedLandmark: { type: String },
    location: { type: pointSchema, index: '2dsphere' },
    geoAccuracy: { type: Number },
    department: { type: String },
    source: { type: String, enum: ['web_form', 'voice_call', 'sms'], default: 'web_form' },
    status: { type: String, default: 'Open' },
    masterTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterTicket' }
}, { timestamps: true });

const MasterTicket = mongoose.model('MasterTicket', masterTicketSchema);
const Upvote = mongoose.model('Upvote', upvoteSchema);
const RawComplaint = mongoose.model('RawComplaint', rawComplaintSchema);

module.exports = { MasterTicket, Upvote, RawComplaint };
