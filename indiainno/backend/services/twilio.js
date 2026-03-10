const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send SMS/WhatsApp Notification
 */
async function sendNotification(to, body) {
    try {
        const message = await client.messages.create({
            body: body,
            from: TWILIO_NUMBER,
            to: to
        });
        console.log(`[Twilio] Message sent to ${to}: ${message.sid}`);
        return message.sid;
    } catch (err) {
        console.error(`[Twilio Error] Failed to send to ${to}`, err.message);
        throw err;
    }
}

/**
 * Make an outbound call that routes through the same /incoming webhook
 */
async function makeCall(to, webhookBaseUrl) {
    try {
        const call = await client.calls.create({
            to: to,
            from: TWILIO_NUMBER,
            url: `${webhookBaseUrl}/api/voice/incoming`,
            statusCallback: `${webhookBaseUrl}/api/voice/call-status`,
            statusCallbackMethod: 'POST'
        });
        console.log(`[Twilio] Outbound call initiated to ${to}: ${call.sid}`);
        return call.sid;
    } catch (err) {
        console.error(`[Twilio Error] Failed to call ${to}`, err.message);
        throw err;
    }
}

module.exports = {
    sendNotification,
    makeCall
};
