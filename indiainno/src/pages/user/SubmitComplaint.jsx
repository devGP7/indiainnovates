import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout";
import api from "../../utils/api";
import { getCurrentLocation } from "../../utils/geolocation";
import DEPARTMENTS, { getCategoryDepartment } from "../../data/departments";
import toast from "react-hot-toast";
import { HiOutlineLocationMarker, HiOutlineThumbUp, HiThumbUp, HiOutlinePhotograph, HiOutlineMicrophone, HiMicrophone } from "react-icons/hi";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

const SEVERITY_COLORS = {
    Critical: "#ef4444", High: "#f59e0b", Medium: "#3b82f6", Low: "#22c55e"
};

export default function SubmitComplaint() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);
    const [pins, setPins] = useState([]);
    const [mapLoading, setMapLoading] = useState(true);
    const [popupInfo, setPopupInfo] = useState(null);
    const [upvoteLoading, setUpvoteLoading] = useState(false);
    const [userUpvotes, setUserUpvotes] = useState({});

    // Voice recording state
    const [recording, setRecording] = useState(false);
    const [voiceProcessing, setVoiceProcessing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const [form, setForm] = useState({
        category: "", description: "", landmark: "",
        lat: null, lng: null, accuracy: null, department: "",
        imageFile: null, imagePreview: null
    });

    const [viewState, setViewState] = useState({
        latitude: 28.4595, longitude: 77.0266, zoom: 11
    });

    useEffect(() => { fetchPins(); }, []);

    const fetchPins = async () => {
        try {
            const { data } = await api.get("/tickets/public-map");
            setPins(data.filter(t => t.lat && t.lng));
        } catch (err) { console.error("[Map] Fetch error:", err); }
        setMapLoading(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === "category") {
            const dept = getCategoryDepartment(value);
            setForm({ ...form, category: value, department: dept?.id || "" });
        } else {
            setForm({ ...form, [name]: value });
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setForm(f => ({ ...f, imageFile: file, imagePreview: reader.result }));
            reader.readAsDataURL(file);
        }
    };

    const captureLocation = async () => {
        setGeoLoading(true);
        try {
            const loc = await getCurrentLocation();
            setForm(f => ({ ...f, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }));
            setViewState(v => ({ ...v, latitude: loc.lat, longitude: loc.lng, zoom: 15 }));
            toast.success(`Location captured! Accuracy: ${Math.round(loc.accuracy)}m`);
        } catch (err) { toast.error(err.message); }
        setGeoLoading(false);
    };

    // ═══ VOICE RECORDING ═══
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                await processVoice(blob);
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;
            setRecording(true);
            toast("🎤 Listening... Speak your complaint now!", { duration: 3000 });

            // Auto-stop after 15s
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setRecording(false);
                }
            }, 15000);
        } catch (err) {
            toast.error("Microphone access denied");
            // Fallback to browser speech
            useBrowserSpeech();
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setRecording(false);
        }
    };

    const useBrowserSpeech = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { toast.error("Speech not supported in this browser"); return; }

        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;
        setRecording(true);

        recognition.onresult = async (event) => {
            setRecording(false);
            const transcript = event.results[0][0].transcript;
            toast.success(`Heard: "${transcript.slice(0, 60)}..."`);
            await processTranscript(transcript);
        };
        recognition.onerror = () => { setRecording(false); toast.error("Speech failed"); };
        recognition.start();
        setTimeout(() => recognition.stop(), 12000);
    };

    const processVoice = async (blob) => {
        setVoiceProcessing(true);
        try {
            // Step 1: Sarvam STT
            const formData = new FormData();
            formData.append('file', blob, 'recording.webm');
            formData.append('model', 'saaras:v2');
            formData.append('language_code', 'hi-IN');
            formData.append('with_timestamps', 'false');

            const sttRes = await fetch('https://api.sarvam.ai/speech-to-text', {
                method: 'POST',
                headers: { 'api-subscription-key': SARVAM_API_KEY },
                body: formData
            });

            let transcript = '';
            if (sttRes.ok) {
                const sttData = await sttRes.json();
                transcript = sttData.transcript || sttData.text || '';
            }

            if (!transcript) {
                toast.error("Couldn't transcribe. Try again or type manually.");
                setVoiceProcessing(false);
                return;
            }

            toast.success(`Transcribed: "${transcript.slice(0, 80)}..."`);
            await processTranscript(transcript);
        } catch (err) {
            console.error('[Voice]', err);
            toast.error("Voice processing failed. Try the browser speech fallback.");
        }
        setVoiceProcessing(false);
    };

    const processTranscript = async (transcript) => {
        setVoiceProcessing(true);
        try {
            // Step 2: Groq LLM — extract fields
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a civic complaint classifier for Indian cities. Extract structured data from the user's voice complaint.
Return ONLY valid JSON (no markdown) with: 
{ "category": "...", "department": "...", "description": "...", "landmark": "..." }
Categories: Pothole, Road_Damage, Streetlight, Power_Outage, Water_Leak, No_Water, Garbage, Sewage_Overflow, Traffic_Signal, Fire_Hazard, Noise_Complaint, Hospital_Issue, Tree_Felling, Illegal_Construction, Encroachment, Stray_Animal, Public_Toilet, Bus_Service, Auto_Rickshaw, School_Issue, Park_Maintenance, Pollution, Drain_Blockage, Bridge_Damage, Footpath_Damage, Water_Quality, Electricity_Bill, Property_Tax
Departments: pwd, water_supply, municipal, electricity, transport, health, police, environment, education
Map: pwd=roads/potholes/bridges, water_supply=water/leaks/taps, municipal=garbage/sewage/parks, electricity=power/lights/bills, transport=traffic/bus/auto, health=hospital/stray, police=noise/encroachment, environment=pollution/trees/fire, education=school`
                        },
                        { role: 'user', content: transcript }
                    ],
                    temperature: 0.1,
                    max_tokens: 300
                })
            });

            if (!groqRes.ok) throw new Error('Groq API failed');

            const groqData = await groqRes.json();
            const content = groqData.choices?.[0]?.message?.content || '{}';
            const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            let fields;
            try {
                fields = JSON.parse(jsonStr);
            } catch {
                fields = { description: transcript };
            }

            // Auto-fill the form
            setForm(f => ({
                ...f,
                category: fields.category || f.category,
                department: fields.department || f.department,
                description: fields.description || transcript,
                landmark: fields.landmark || f.landmark
            }));

            toast.success("✨ Form auto-filled from your voice!", { duration: 4000 });
        } catch (err) {
            console.error('[Groq]', err);
            // At least fill description with raw transcript
            setForm(f => ({ ...f, description: transcript }));
            toast("Filled description with your speech. Select category manually.", { icon: "📝" });
        }
        setVoiceProcessing(false);
    };

    const handlePinClick = (pin, e) => {
        e.originalEvent.stopPropagation();
        setPopupInfo(pin);
        const dept = pin.department || "";
        setForm(f => ({
            ...f,
            category: pin.intentCategory || f.category,
            landmark: pin.landmark || f.landmark,
            lat: pin.lat, lng: pin.lng, accuracy: null,
            department: dept || f.department,
            description: f.description || `Same issue: ${(pin.intentCategory || '').replace(/_/g, ' ')} near ${pin.landmark || 'this location'}`,
        }));
        toast.success("Location & category auto-filled!", { icon: "📍" });
    };

    const handleUpvote = async (ticketId) => {
        if (upvoteLoading) return;
        setUpvoteLoading(true);
        try {
            const isUpvoted = userUpvotes[ticketId];
            const res = isUpvoted
                ? await api.delete(`/tickets/master/${ticketId}/upvote`)
                : await api.post(`/tickets/master/${ticketId}/upvote`);
            setUserUpvotes(prev => ({ ...prev, [ticketId]: res.data.upvoted }));
            setPins(prev => prev.map(p => (p.id || p._id) === ticketId ? { ...p, upvoteCount: res.data.upvoteCount, severity: res.data.severity || p.severity } : p));
            if (popupInfo && (popupInfo.id || popupInfo._id) === ticketId)
                setPopupInfo(prev => ({ ...prev, upvoteCount: res.data.upvoteCount, severity: res.data.severity || prev.severity }));
            toast.success(res.data.upvoted ? "Upvoted!" : "Upvote removed");
        } catch (err) {
            if (err.response?.status === 409) { setUserUpvotes(prev => ({ ...prev, [ticketId]: true })); toast("Already upvoted", { icon: "👍" }); }
            else toast.error("Failed to upvote");
        }
        setUpvoteLoading(false);
    };

    const checkUpvoteStatus = async (ticketId) => {
        try { const { data } = await api.get(`/tickets/master/${ticketId}/upvote-status`); setUserUpvotes(prev => ({ ...prev, [ticketId]: data.upvoted })); } catch { }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.category) return toast.error("Please select a category");
        if (!form.description) return toast.error("Please describe the issue");
        setLoading(true);

        try {
            const { data } = await api.post('/tickets/complaint', {
                category: form.category, description: form.description, landmark: form.landmark,
                lat: form.lat, lng: form.lng, accuracy: form.accuracy, department: form.department,
                imageUrl: form.imagePreview || null
            });

            toast.success(data.isNew ? "Complaint submitted! New ticket created." : `Linked to existing ticket. Severity: ${data.ticket.severity}.`);
            navigate("/citizen/complaints");
        } catch (err) { toast.error(err.response?.data?.message || "Failed to submit complaint."); }
        setLoading(false);
    };

    return (
        <DashboardLayout title="Submit Complaint" subtitle="Report a civic issue — speak, type, or click a map pin">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, minHeight: "75vh" }}>

                {/* ═══ LEFT: FORM ═══ */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Voice Input Banner */}
                    <div className="card" style={{ padding: 16, background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)", color: "#fff", border: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <button
                                type="button"
                                onClick={recording ? stopRecording : startRecording}
                                disabled={voiceProcessing}
                                style={{
                                    width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
                                    background: recording ? "#ef4444" : "rgba(255,255,255,0.2)",
                                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                                    animation: recording ? "pulse-pin 1s infinite" : "none",
                                    fontSize: 24, backdropFilter: "blur(4px)"
                                }}
                            >
                                {voiceProcessing ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2, borderTopColor: "#fff" }} />
                                    : recording ? <HiMicrophone /> : <HiOutlineMicrophone />}
                            </button>
                            <div>
                                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                                    {voiceProcessing ? "Processing your voice..." : recording ? "Listening... Tap to stop" : "Speak Your Complaint"}
                                </h3>
                                <p style={{ fontSize: 12, opacity: 0.8, margin: "4px 0 0" }}>
                                    {voiceProcessing ? "AI is extracting category & department..." : "Tap the mic and describe your issue in any language. AI will auto-fill the form."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {/* Step 1: What */}
                        <div className="card" style={{ padding: 18 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 22, height: 22, borderRadius: 4, background: "#1e3a8a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>1</span>
                                What's the issue?
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <select name="category" value={form.category} onChange={handleChange} className="input-field" required>
                                    <option value="">Select a category</option>
                                    {DEPARTMENTS.map((dept) => (
                                        <optgroup key={dept.id} label={dept.name}>
                                            {dept.categories.map((cat) => (
                                                <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                {form.department && (
                                    <div style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", borderRadius: 4, padding: "6px 10px", border: "1px solid #e2e8f0" }}>
                                        Auto-routed → <strong style={{ color: "#1e3a8a" }}>{DEPARTMENTS.find(d => d.id === form.department)?.name}</strong>
                                    </div>
                                )}
                                <textarea name="description" value={form.description} onChange={handleChange} className="input-field"
                                    style={{ minHeight: 80, resize: "vertical" }} placeholder="Describe the issue..." required />
                            </div>
                        </div>

                        {/* Step 2: Where + Photo */}
                        <div className="card" style={{ padding: 18 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 22, height: 22, borderRadius: 4, background: "#f97316", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>2</span>
                                Where is it? + Photo Proof
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <input name="landmark" type="text" value={form.landmark} onChange={handleChange} className="input-field"
                                    placeholder="Landmark, e.g., Near Shiv Mandir, Sector 14" />
                                <button type="button" onClick={captureLocation} disabled={geoLoading} className="btn-secondary" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                                    {geoLoading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Detecting...</>
                                        : form.lat ? <><HiOutlineLocationMarker style={{ color: "#16a34a" }} /> Location ✓ ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</>
                                            : <><HiOutlineLocationMarker /> Capture GPS Location</>}
                                </button>

                                {/* Image Upload */}
                                <label style={{
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    border: `2px dashed ${form.imagePreview ? "#1e3a8a" : "#cbd5e1"}`, borderRadius: 8,
                                    padding: form.imagePreview ? 8 : 20, cursor: "pointer", transition: "all 0.2s",
                                    background: form.imagePreview ? "#eff6ff" : "#fafafa"
                                }}>
                                    {form.imagePreview ? (
                                        <img src={form.imagePreview} alt="Issue" style={{ maxHeight: 120, borderRadius: 6, objectFit: "cover" }} />
                                    ) : (
                                        <>
                                            <HiOutlinePhotograph style={{ fontSize: 28, color: "#94a3b8", marginBottom: 6 }} />
                                            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Upload Photo of Issue (Optional)</span>
                                        </>
                                    )}
                                    <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ display: "none" }} />
                                </label>
                            </div>
                        </div>

                        <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 14, fontWeight: 700 }} disabled={loading}>
                            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: "#fff" }} /> : "Submit Complaint"}
                        </button>
                    </form>
                </div>

                {/* ═══ RIGHT: MAP ═══ */}
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", position: "relative", minHeight: 500 }}>
                    {mapLoading && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(241,245,249,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                            <div className="spinner" />
                        </div>
                    )}
                    <Map {...viewState} onMove={evt => setViewState(evt.viewState)}
                        mapStyle="mapbox://styles/mapbox/streets-v12" mapboxAccessToken={MAPBOX_TOKEN} style={{ width: "100%", height: "100%" }}>
                        <NavigationControl position="top-right" />
                        {form.lat && form.lng && (
                            <Marker longitude={form.lng} latitude={form.lat}>
                                <div style={{ width: 16, height: 16, background: "#3b82f6", border: "3px solid #fff", borderRadius: "50%", boxShadow: "0 0 12px rgba(59,130,246,0.5)" }} />
                            </Marker>
                        )}
                        {pins.map(pin => (
                            <Marker key={pin.id || pin._id} longitude={pin.lng} latitude={pin.lat}
                                onClick={e => { handlePinClick(pin, e); checkUpvoteStatus(pin.id || pin._id); }}>
                                <div style={{
                                    width: pin.severity === "Critical" ? 18 : pin.severity === "High" ? 16 : 13,
                                    height: pin.severity === "Critical" ? 18 : pin.severity === "High" ? 16 : 13,
                                    borderRadius: "50%", background: SEVERITY_COLORS[pin.severity] || SEVERITY_COLORS.Low,
                                    border: "2px solid #fff", cursor: "pointer",
                                    boxShadow: `0 1px 6px ${SEVERITY_COLORS[pin.severity] || SEVERITY_COLORS.Low}80`,
                                    opacity: pin.status === "Closed" ? 0.4 : 1
                                }} />
                            </Marker>
                        ))}
                        {popupInfo && (
                            <Popup anchor="bottom" longitude={popupInfo.lng} latitude={popupInfo.lat}
                                onClose={() => setPopupInfo(null)} closeButton closeOnClick={false} maxWidth="280px">
                                <div style={{ padding: "4px 2px", color: "#1e293b" }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 4 }}>
                                        {popupInfo.intentCategory?.replace(/_/g, " ")}
                                    </h4>
                                    <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                                        <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: SEVERITY_COLORS[popupInfo.severity] + "20", color: SEVERITY_COLORS[popupInfo.severity] }}>{popupInfo.severity}</span>
                                        <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: "#f1f5f9", color: "#475569" }}>{popupInfo.status?.replace(/_/g, " ")}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                                        Reports: <strong>{popupInfo.complaintCount}</strong> · Upvotes: <strong>{popupInfo.upvoteCount || 0}</strong>
                                        {popupInfo.landmark && <div>📍 {popupInfo.landmark}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 4 }}>
                                        <button type="button" onClick={() => handleUpvote(popupInfo.id || popupInfo._id)} disabled={upvoteLoading}
                                            style={{
                                                flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                                                border: userUpvotes[popupInfo.id || popupInfo._id] ? "2px solid #f97316" : "2px solid #1e3a8a",
                                                background: userUpvotes[popupInfo.id || popupInfo._id] ? "#fff7ed" : "#eff6ff",
                                                color: userUpvotes[popupInfo.id || popupInfo._id] ? "#f97316" : "#1e3a8a"
                                            }}>
                                            {userUpvotes[popupInfo.id || popupInfo._id] ? <><HiThumbUp /> Upvoted</> : <><HiOutlineThumbUp /> +1</>}
                                        </button>
                                        <button type="button" onClick={() => { handlePinClick(popupInfo, { originalEvent: { stopPropagation: () => { } } }); setPopupInfo(null); }}
                                            style={{
                                                flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                                border: "2px solid #16a34a", background: "#f0fdf4", color: "#16a34a",
                                                display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                            Fill Form
                                        </button>
                                    </div>
                                </div>
                            </Popup>
                        )}
                    </Map>
                    <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 10, background: "rgba(255,255,255,0.95)", borderRadius: 6, padding: "6px 10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                            {[{ l: "C", c: SEVERITY_COLORS.Critical }, { l: "H", c: SEVERITY_COLORS.High }, { l: "M", c: SEVERITY_COLORS.Medium }, { l: "L", c: SEVERITY_COLORS.Low }].map(s => (
                                <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.c }} />
                                    <span style={{ fontSize: 9, color: "#475569", fontWeight: 600 }}>{s.l}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ position: "absolute", top: 10, left: 10, right: 48, zIndex: 10, background: "rgba(255,255,255,0.95)", borderRadius: 6, padding: "6px 12px", border: "1px solid #e2e8f0", fontSize: 11, color: "#475569" }}>
                        <strong style={{ color: "#1e3a8a" }}>Click a pin</strong> to auto-fill or <strong style={{ color: "#f97316" }}>+1 upvote</strong>
                    </div>
                </div>
            </div>

            <style>{`
                .mapboxgl-popup-content { background: #fff !important; border: 1px solid #e2e8f0 !important; border-radius: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important; padding: 6px !important; }
                .mapboxgl-popup-tip { border-top-color: #fff !important; border-bottom-color: #fff !important; }
                .mapboxgl-popup-close-button { color: #94a3b8; font-size: 16px; right: 6px; top: 6px; }
                @media (max-width: 900px) { div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }
            `}</style>
        </DashboardLayout>
    );
}
