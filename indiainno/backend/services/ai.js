const axios = require('axios');
const FormData = require('form-data');
const Groq = require('groq-sdk');
const dotenv = require('dotenv');

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

/**
 * 1. Sarvam AI - Speech to Text (Saaras)
 * Downloads Twilio recording (with auth), buffers it, and sends to Sarvam STT
 */
async function speechToText(audioUrl) {
    try {
        // 1. Download Twilio Recording as buffer (requires auth + .wav extension)
        const downloadUrl = audioUrl.endsWith('.wav') ? audioUrl : audioUrl + '.wav';
        console.log('[Sarvam] Downloading recording from:', downloadUrl);

        const response = await axios({
            method: "get",
            url: downloadUrl,
            responseType: "arraybuffer",
            timeout: 30000,
            auth: {
                username: process.env.TWILIO_ACCOUNT_SID,
                password: process.env.TWILIO_AUTH_TOKEN
            },
            // Follow redirects (Twilio sometimes 302s)
            maxRedirects: 5
        });

        const audioBuffer = Buffer.from(response.data);
        console.log(`[Sarvam] Downloaded ${audioBuffer.length} bytes, content-type: ${response.headers['content-type']}`);

        if (audioBuffer.length < 1000) {
            console.warn('[Sarvam] Audio buffer too small, likely an error page');
            throw new Error('Downloaded audio is too small — likely a Twilio auth or access error');
        }

        // 2. Upload buffer to Sarvam STT (Original Language)
        const form = new FormData();
        form.append('file', audioBuffer, {
            filename: 'recording.wav',
            contentType: 'audio/wav'
        });
        form.append('model', 'saaras:v2.5');
        form.append('with_timestamps', 'false');

        console.log('[Sarvam] Sending to STT API...');
        const sarvamRes = await axios.post('https://api.sarvam.ai/speech-to-text', form, {
            headers: {
                ...form.getHeaders(),
                'api-subscription-key': SARVAM_API_KEY,
            },
            timeout: 60000
        });

        const transcriptOriginal = sarvamRes.data.transcript;
        const languageCode = sarvamRes.data.language_code || "unknown";
        console.log("[Sarvam] STT Output:", transcriptOriginal);

        // 3. Translate to English using Sarvam Translate
        let transcriptEnglish = transcriptOriginal;
        if (languageCode !== 'en-IN' && languageCode !== 'unknown') {
            try {
                console.log(`[Sarvam] Translating from ${languageCode} to English...`);
                const translateRes = await axios.post('https://api.sarvam.ai/translate', {
                    input: transcriptOriginal,
                    source_language_code: languageCode,
                    target_language_code: 'en-IN',
                    model: 'mayura:v1',
                    enable_preprocessing: true
                }, {
                    headers: {
                        'api-subscription-key': SARVAM_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                if (translateRes.data.translated_text) {
                    transcriptEnglish = translateRes.data.translated_text;
                }
            } catch (errTranslate) {
                console.error("[Sarvam Translate Error]", errTranslate.message);
            }
        }

        return {
            transcriptOriginal,
            transcriptEnglish,
            language: languageCode
        };

    } catch (err) {
        const detail = err?.response?.data
            ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
            : err.message;
        console.error("[Sarvam STT Error]", `Status: ${err?.response?.status}`, detail);
        throw err;
    }
}

/**
 * 2. Groq LLM - Entity Extraction (Intent Category, Landmark, Department, City)
 */
async function extractComplaintEntities(englishTranscript) {
    const prompt = `
  You are an AI assistant for a civic grievance system in India.
  Extract the following information from this spoken complaint transcript:
  1. "intentCategory": MUST be exactly one of: Pothole, Road_Damage, Streetlight, Power_Outage, Water_Leak, No_Water, Garbage, Sewage_Overflow, Traffic_Signal, Fire_Hazard, Noise_Complaint, Hospital_Issue, Tree_Felling, Other.
  2. "department": Based on intent, assign EXACTLY ONE of: pwd, water_supply, municipal, electricity, transport, health, police, environment, education. Default to municipal if unsure.
  3. "city": Return ONLY if explicitly mentioned (e.g. Jaipur, Delhi, Mumbai, Pune, Bangalore). If not mentioned, return "Unknown".
  4. "landmark": Any specific location, street name, or area mentioned. If none, return "".

  Transcript: "${englishTranscript}"

  Respond strictly with ONLY valid JSON format like:
  {"intentCategory": "Pothole", "department": "pwd", "city": "Jaipur", "landmark": "Sector 14 near park"}
  `;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "mixtral-8x7b-32768",
            temperature: 0,
            response_format: { type: "json_object" }
        });

        const jsonRes = JSON.parse(chatCompletion.choices[0].message.content);
        return jsonRes;
    } catch (err) {
        console.error("[Groq Error]", err.message);
        return { intentCategory: "Other", landmark: "" };
    }
}

module.exports = {
    speechToText,
    extractComplaintEntities
};
