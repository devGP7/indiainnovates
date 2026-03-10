/**
 * Voice Form API — Records voice, sends to Sarvam STT, then Groq LLM to extract form fields
 */

const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

/**
 * Record audio from microphone
 * @returns {Promise<Blob>} audio blob (webm/ogg)
 */
export function recordVoice(durationMs = 8000) {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                resolve(new Blob(chunks, { type: 'audio/webm' }));
            };
            mediaRecorder.onerror = (e) => reject(new Error('Recording failed'));

            mediaRecorder.start();

            // Auto-stop after duration
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, durationMs);

            // Return the recorder so caller can stop early
            resolve._recorder = mediaRecorder;
        } catch (err) {
            reject(new Error('Microphone access denied'));
        }
    });
}

/**
 * Transcribe audio blob using Sarvam STT API
 * @param {Blob} audioBlob 
 * @returns {Promise<string>} transcript text
 */
export async function transcribeVoice(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'saaras:v2');
    formData.append('language_code', 'hi-IN');
    formData.append('with_timestamps', 'false');

    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_API_KEY },
        body: formData
    });

    if (!res.ok) {
        // Fallback: try with Web Speech API
        throw new Error('Sarvam STT failed');
    }

    const data = await res.json();
    return data.transcript || data.text || '';
}

/**
 * Use Groq LLM to extract structured form fields from voice transcript
 * @param {string} transcript 
 * @returns {Promise<{category, department, description, landmark}>}
 */
export async function extractFormFields(transcript) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a civic complaint classifier. Extract structured data from the user's voice complaint.
Return ONLY valid JSON with these fields:
- "category": one of [Pothole, Road_Damage, Streetlight, Power_Outage, Water_Leak, No_Water, Garbage, Sewage_Overflow, Traffic_Signal, Fire_Hazard, Noise_Complaint, Hospital_Issue, Tree_Felling, Illegal_Construction, Encroachment, Stray_Animal, Public_Toilet, Bus_Service, Auto_Rickshaw, School_Issue, Park_Maintenance, Pollution, Drain_Blockage, Bridge_Damage, Footpath_Damage, Water_Quality, Electricity_Bill, Property_Tax]
- "department": one of [pwd, water_supply, municipal, electricity, transport, health, police, environment, education]
- "description": a clean 1-2 sentence summary of the complaint in English
- "landmark": any location/landmark mentioned (or empty string)

Map departments: pwd=roads/potholes/bridges/footpaths, water_supply=water/leaks/taps, municipal=garbage/sewage/parks/toilets/construction, electricity=power/streetlights/bills, transport=traffic/bus/auto, health=hospital/stray, police=noise/encroachment, environment=pollution/trees/fire, education=school`
                },
                {
                    role: 'user',
                    content: transcript
                }
            ],
            temperature: 0.1,
            max_tokens: 300
        })
    });

    if (!res.ok) throw new Error('Groq API failed');

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
        return JSON.parse(jsonStr);
    } catch {
        return { description: transcript };
    }
}

/**
 * Full pipeline: record → transcribe → extract fields
 */
export async function voiceToFormFields(durationMs = 8000) {
    const blob = await recordVoice(durationMs);
    let transcript;

    try {
        transcript = await transcribeVoice(blob);
    } catch {
        // Fallback to browser Web Speech API
        transcript = await browserSpeechRecognition();
    }

    if (!transcript) throw new Error('No speech detected');

    const fields = await extractFormFields(transcript);
    return { ...fields, rawTranscript: transcript };
}

/**
 * Fallback: Browser Web Speech API
 */
function browserSpeechRecognition() {
    return new Promise((resolve, reject) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            reject(new Error('Speech recognition not supported'));
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            resolve(event.results[0][0].transcript);
        };
        recognition.onerror = () => reject(new Error('Speech recognition failed'));
        recognition.onend = () => resolve('');

        recognition.start();
        setTimeout(() => recognition.stop(), 10000);
    });
}
