import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { HiOutlineThumbUp, HiThumbUp, HiOutlineFilter, HiOutlineX } from "react-icons/hi";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const API_BASE = "http://localhost:5000/api";

const SEVERITY_COLORS = {
    Critical: "#ef4444",
    High: "#f59e0b",
    Medium: "#3b82f6",
    Low: "#22c55e"
};

const DEPARTMENTS = [
    { id: "pwd", name: "Public Works" },
    { id: "water_supply", name: "Water Supply" },
    { id: "municipal", name: "Municipal Corp" },
    { id: "electricity", name: "Electricity" },
    { id: "transport", name: "Roads & Transport" },
    { id: "health", name: "Health" },
    { id: "police", name: "Police" },
    { id: "environment", name: "Environment" },
    { id: "education", name: "Education" },
];

export default function PublicMap() {
    const [pins, setPins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [popupInfo, setPopupInfo] = useState(null);
    const [upvoteLoading, setUpvoteLoading] = useState(false);
    const [userUpvotes, setUserUpvotes] = useState({});
    const [filterOpen, setFilterOpen] = useState(false);
    const [filters, setFilters] = useState({ severity: "", department: "", status: "" });
    const [viewState, setViewState] = useState({
        latitude: 28.4595,
        longitude: 77.0266,
        zoom: 11
    });

    const token = localStorage.getItem("token");
    const isLoggedIn = !!token;

    useEffect(() => {
        fetchPins();
    }, []);

    const fetchPins = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/tickets/public-map`);
            setPins(data.filter(t => t.lat && t.lng));
        } catch (err) {
            console.error("[PublicMap] Fetch error:", err);
        }
        setLoading(false);
    };

    const handleUpvote = async (ticketId) => {
        if (!isLoggedIn || upvoteLoading) return;
        setUpvoteLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const isUpvoted = userUpvotes[ticketId];

            let res;
            if (isUpvoted) {
                res = await axios.delete(`${API_BASE}/tickets/master/${ticketId}/upvote`, { headers });
            } else {
                res = await axios.post(`${API_BASE}/tickets/master/${ticketId}/upvote`, {}, { headers });
            }

            setUserUpvotes(prev => ({ ...prev, [ticketId]: res.data.upvoted }));
            setPins(prev => prev.map(p =>
                p.id === ticketId ? { ...p, upvoteCount: res.data.upvoteCount, severity: res.data.severity || p.severity } : p
            ));
            if (popupInfo && popupInfo.id === ticketId) {
                setPopupInfo(prev => ({ ...prev, upvoteCount: res.data.upvoteCount, severity: res.data.severity || prev.severity }));
            }
        } catch (err) {
            if (err.response?.status === 409) {
                setUserUpvotes(prev => ({ ...prev, [ticketId]: true }));
            } else {
                console.error("[Upvote Error]", err);
            }
        }
        setUpvoteLoading(false);
    };

    const checkUpvoteStatus = async (ticketId) => {
        if (!isLoggedIn) return;
        try {
            const { data } = await axios.get(`${API_BASE}/tickets/master/${ticketId}/upvote-status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUserUpvotes(prev => ({ ...prev, [ticketId]: data.upvoted }));
        } catch (err) {
            // silently fail
        }
    };

    const handlePinClick = (pin, e) => {
        e.originalEvent.stopPropagation();
        setPopupInfo(pin);
        checkUpvoteStatus(pin.id || pin._id);
    };

    const filteredPins = pins.filter(p => {
        if (filters.severity && p.severity !== filters.severity) return false;
        if (filters.department && p.department !== filters.department) return false;
        if (filters.status) {
            if (filters.status === "Active" && (p.status === "Closed" || p.status === "Invalid_Spam")) return false;
            if (filters.status === "Closed" && p.status !== "Closed") return false;
        }
        return true;
    });

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f1f5f9" }}>
            {/* Header */}
            <header style={{
                background: "#ffffff",
                borderBottom: "4px solid #f97316",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                padding: "0 24px",
                position: "relative", zIndex: 20
            }}>
                <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
                    <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                        <div style={{
                            width: 36, height: 36, background: "#1e3a8a", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 14, borderRadius: 4
                        }}>CS</div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#1e3a8a" }}>CivicSync</div>
                            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Live City Map</div>
                        </div>
                    </Link>
                    <nav style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            style={{
                                background: filterOpen ? "#1e3a8a" : "#f1f5f9", color: filterOpen ? "#fff" : "#1e3a8a",
                                padding: "7px 14px", fontWeight: 700, fontSize: 12, borderRadius: 4,
                                border: "1px solid #cbd5e1", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 6
                            }}
                        >
                            <HiOutlineFilter style={{ fontSize: 14 }} /> Filters
                        </button>
                        {!isLoggedIn && (
                            <>
                                <Link to="/login" style={{ color: "#1e3a8a", fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Login</Link>
                                <Link to="/register" style={{
                                    background: "#1e3a8a", color: "#fff", padding: "7px 16px",
                                    fontWeight: 700, fontSize: 12, borderRadius: 4, textTransform: "uppercase"
                                }}>Register</Link>
                            </>
                        )}
                        {isLoggedIn && (
                            <Link to="/citizen" style={{ color: "#1e3a8a", fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Dashboard</Link>
                        )}
                    </nav>
                </div>
            </header>

            {/* Filter Panel */}
            {filterOpen && (
                <div style={{
                    background: "#ffffff", padding: "12px 24px", borderBottom: "1px solid #e2e8f0",
                    display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
                    position: "relative", zIndex: 15
                }}>
                    <select value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
                        style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600 }}>
                        <option value="">All Severities</option>
                        {["Low", "Medium", "High", "Critical"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}
                        style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600 }}>
                        <option value="">All Departments</option>
                        {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                        style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600 }}>
                        <option value="">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Closed">Closed</option>
                    </select>
                    {(filters.severity || filters.department || filters.status) && (
                        <button onClick={() => setFilters({ severity: "", department: "", status: "" })}
                            style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ef4444", color: "#ef4444", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            <HiOutlineX /> Clear
                        </button>
                    )}
                    <span style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>
                        Showing {filteredPins.length} of {pins.length} concerns
                    </span>
                </div>
            )}

            {/* Map */}
            <div style={{ flex: 1, position: "relative" }}>
                {loading && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(241,245,249,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, color: "#1e293b", fontSize: 16, fontWeight: 600 }}>
                        Loading incidents...
                    </div>
                )}

                <Map
                    {...viewState}
                    onMove={evt => setViewState(evt.viewState)}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    mapboxAccessToken={MAPBOX_TOKEN}
                    style={{ width: "100%", height: "calc(100vh - 56px)" }}
                >
                    <NavigationControl position="top-right" />

                    {filteredPins.map(pin => (
                        <Marker
                            key={pin.id}
                            longitude={pin.lng}
                            latitude={pin.lat}
                            onClick={e => handlePinClick(pin, e)}
                        >
                            <div style={{
                                width: pin.severity === "Critical" ? 18 : pin.severity === "High" ? 16 : 14,
                                height: pin.severity === "Critical" ? 18 : pin.severity === "High" ? 16 : 14,
                                borderRadius: "50%",
                                background: SEVERITY_COLORS[pin.severity] || SEVERITY_COLORS.Low,
                                border: "2px solid rgba(30,58,138,0.5)",
                                cursor: "pointer",
                                boxShadow: `0 0 8px ${SEVERITY_COLORS[pin.severity] || SEVERITY_COLORS.Low}60`,
                                opacity: pin.status === "Closed" ? 0.4 : 1,
                                animation: pin.status !== "Closed" ? "pulse-pin 2s infinite" : "none"
                            }} />
                        </Marker>
                    ))}

                    {popupInfo && (
                        <Popup
                            anchor="bottom"
                            longitude={popupInfo.lng}
                            latitude={popupInfo.lat}
                            onClose={() => setPopupInfo(null)}
                            closeButton={true}
                            closeOnClick={false}
                            maxWidth="320px"
                        >
                            <div style={{ padding: "8px 4px", color: "#1e293b", fontFamily: "'Noto Sans', sans-serif" }}>
                                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a", marginBottom: 8 }}>
                                    {popupInfo.intentCategory?.replace(/_/g, " ")}
                                </h4>

                                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                                    <span style={{
                                        padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 700,
                                        background: SEVERITY_COLORS[popupInfo.severity] + "20",
                                        color: SEVERITY_COLORS[popupInfo.severity],
                                        border: `1px solid ${SEVERITY_COLORS[popupInfo.severity]}40`
                                    }}>{popupInfo.severity}</span>
                                    <span style={{
                                        padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                                        background: "#f1f5f9", color: "#475569"
                                    }}>{popupInfo.status?.replace(/_/g, " ")}</span>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12, marginBottom: 10 }}>
                                    <div><span style={{ color: "#94a3b8" }}>Reports:</span> <strong>{popupInfo.complaintCount}</strong></div>
                                    <div><span style={{ color: "#94a3b8" }}>Upvotes:</span> <strong>{popupInfo.upvoteCount || 0}</strong></div>
                                    {popupInfo.department && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#94a3b8" }}>Dept:</span> {popupInfo.department?.replace(/_/g, " ")}</div>}
                                    {popupInfo.landmark && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#94a3b8" }}>Location:</span> {popupInfo.landmark}</div>}
                                    {popupInfo.city && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#94a3b8" }}>City:</span> {popupInfo.city}</div>}
                                </div>

                                {isLoggedIn && popupInfo.status !== "Closed" && (
                                    <button
                                        onClick={() => handleUpvote(popupInfo.id || popupInfo._id)}
                                        disabled={upvoteLoading}
                                        style={{
                                            width: "100%",
                                            padding: "8px 0",
                                            borderRadius: 4,
                                            border: userUpvotes[popupInfo.id || popupInfo._id] ? "2px solid #f97316" : "2px solid #1e3a8a",
                                            background: userUpvotes[popupInfo.id || popupInfo._id] ? "#fff7ed" : "#eff6ff",
                                            color: userUpvotes[popupInfo.id || popupInfo._id] ? "#f97316" : "#1e3a8a",
                                            fontWeight: 700, fontSize: 13, cursor: "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        {userUpvotes[popupInfo.id || popupInfo._id]
                                            ? <><HiThumbUp style={{ fontSize: 16 }} /> Upvoted</>
                                            : <><HiOutlineThumbUp style={{ fontSize: 16 }} /> Upvote this concern</>
                                        }
                                    </button>
                                )}

                                {!isLoggedIn && popupInfo.status !== "Closed" && (
                                    <Link to="/login" style={{
                                        display: "block", textAlign: "center",
                                        padding: "8px 0", borderRadius: 4,
                                        background: "#eff6ff", color: "#1e3a8a",
                                        fontWeight: 700, fontSize: 12,
                                        border: "1px solid #bfdbfe"
                                    }}>
                                        Login to upvote
                                    </Link>
                                )}
                            </div>
                        </Popup>
                    )}
                </Map>

                {/* Legend */}
                <div style={{
                    position: "absolute", bottom: 24, left: 24, zIndex: 10,
                    background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
                    borderRadius: 8, padding: "12px 16px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Severity</div>
                    {["Critical", "High", "Medium", "Low"].map(s => (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: SEVERITY_COLORS[s] }} />
                            <span style={{ fontSize: 12, color: "#334155" }}>{s}</span>
                        </div>
                    ))}
                </div>

                {/* Stats */}
                <div style={{
                    position: "absolute", top: 12, left: 12, zIndex: 10,
                    background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
                    borderRadius: 8, padding: "10px 16px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    display: "flex", gap: 16
                }}>
                    {[
                        { label: "Total", value: filteredPins.length, color: "#1e293b" },
                        { label: "Critical", value: filteredPins.filter(p => p.severity === "Critical").length, color: "#ef4444" },
                        { label: "Active", value: filteredPins.filter(p => p.status !== "Closed").length, color: "#16a34a" },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes pulse-pin {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.3); opacity: 0.8; }
                }
                .mapboxgl-popup-content {
                    background: #ffffff !important;
                    border: 1px solid #e2e8f0 !important;
                    border-radius: 12px !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
                    padding: 8px !important;
                }
                .mapboxgl-popup-tip {
                    border-top-color: #ffffff !important;
                    border-bottom-color: #ffffff !important;
                }
                .mapboxgl-popup-close-button {
                    color: #64748b;
                    font-size: 18px;
                    right: 8px; top: 8px;
                }
            `}</style>
        </div>
    );
}
