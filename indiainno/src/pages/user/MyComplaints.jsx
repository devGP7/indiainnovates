import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import api from "../../utils/api";
import { TICKET_STATUSES } from "../../data/departments";
import { HiOutlineClock, HiOutlinePhotograph } from "react-icons/hi";

export default function MyComplaints() {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        const fetchComplaints = async () => {
            try {
                const { data } = await api.get('/tickets/my-complaints');
                setComplaints(data);
            } catch (err) { console.error("Error fetching complaints:", err); }
            setLoading(false);
        };
        fetchComplaints();
    }, []);

    const handleVerify = async (ticketId, verified, rating = null) => {
        try {
            await api.put(`/tickets/master/${ticketId}/verify`, { verified, rating });
            setComplaints(complaints.map(c => {
                if (c.ticket?.id === ticketId || c.masterTicketId?._id === ticketId) {
                    return { ...c, ticket: c.ticket ? { ...c.ticket, status: verified ? 'Closed' : 'Disputed', citizenRating: rating } : undefined, status: verified ? 'Closed' : 'Disputed' };
                }
                return c;
            }));
            if (verified) alert('Thank you for verifying! Issue closed.');
            else alert('Dispute has been logged.');
        } catch (error) { console.error(error); alert('Failed to submit verification'); }
    };

    const filteredComplaints = filter === "all" ? complaints : complaints.filter((c) => (c.ticket?.status || c.status || "Open") === filter);

    const getCategoryIcon = (cat) => {
        const iconMap = {
            Pothole: "🕳️", Road_Damage: "🛣️", Streetlight: "💡", Power_Outage: "⚡",
            Water_Leak: "💧", No_Water: "🚰", Garbage: "🗑️", Sewage_Overflow: "🚿",
            Traffic_Signal: "🚦", Fire_Hazard: "🔥", Noise_Complaint: "📢",
            Hospital_Issue: "🏥", Tree_Felling: "🌳",
        };
        return iconMap[cat] || "📋";
    };

    return (
        <DashboardLayout title="My Complaints" subtitle="Track progress, view engineer updates & verify resolutions">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6 animate-fadeInUp">
                <button onClick={() => setFilter("all")}
                    className={`badge cursor-pointer transition-all ${filter === "all" ? "bg-[var(--color-primary)]/20 text-[var(--color-primary-light)] ring-1 ring-[var(--color-primary)]" : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"}`}>
                    All ({complaints.length})
                </button>
                {TICKET_STATUSES.slice(0, 6).map((s) => {
                    const count = complaints.filter((c) => (c.ticket?.status || c.status) === s.value).length;
                    return (
                        <button key={s.value} onClick={() => setFilter(s.value)}
                            className={`badge cursor-pointer transition-all ${filter === s.value ? `status-${s.value.toLowerCase()} ring-1` : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"}`}>
                            {s.label} ({count})
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><div className="spinner" /></div>
            ) : filteredComplaints.length === 0 ? (
                <div className="card text-center py-16">
                    <p className="text-4xl mb-3">🔍</p>
                    <p className="text-[var(--color-text-muted)]">No complaints found</p>
                </div>
            ) : (
                <div className="space-y-4 stagger">
                    {filteredComplaints.map((c) => {
                        const status = c.ticket?.status || c.status || "Open";
                        const severity = c.ticket?.severity || "Low";
                        const isExpanded = expandedId === c.id;
                        const progressUpdates = c.ticket?.progressUpdates || [];

                        return (
                            <div key={c.id} className="card animate-fadeInUp">
                                <div className="flex items-start gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                                    <div className="w-11 h-11 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-xl flex-shrink-0">
                                        {getCategoryIcon(c.intentCategory)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            {c.ticket?.ticketNumber && <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-sm">{c.ticket.ticketNumber}</span>}
                                            <h3 className="font-semibold text-sm">{c.intentCategory?.replace(/_/g, " ")}</h3>
                                            <span className={`badge status-${status.toLowerCase()}`}>{status.replace(/_/g, " ")}</span>
                                            <span className={`badge severity-${severity.toLowerCase()}`}>{severity}</span>
                                        </div>
                                        <p className="text-sm text-[var(--color-text-muted)] mb-2 line-clamp-2">{c.transcriptOriginal}</p>
                                        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                                            {c.extractedLandmark && <span>📍 {c.extractedLandmark}</span>}
                                            <span>🕐 {new Date(c.createdAt).toLocaleDateString()}</span>
                                            {c.ticket?.complaintCount > 1 && <span className="text-[var(--color-warning)]">👥 {c.ticket.complaintCount} reports</span>}
                                            {progressUpdates.length > 0 && <span className="text-[var(--color-primary)]"><HiOutlineClock className="inline" /> {progressUpdates.length} updates</span>}
                                        </div>
                                    </div>
                                    <div className="text-xs text-[var(--color-text-muted)]">{isExpanded ? "▲" : "▼"}</div>
                                </div>

                                {/* Progress Bar */}
                                {c.ticket?.progressPercent > 0 && c.ticket?.status !== "Closed" && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>Progress</span>
                                            <span className="font-bold">{c.ticket.progressPercent}%</span>
                                        </div>
                                        <div className="w-full bg-[var(--color-surface)] rounded-full h-2">
                                            <div className="bg-[var(--color-primary)] h-2 rounded-full transition-all" style={{ width: `${c.ticket.progressPercent}%` }} />
                                        </div>
                                    </div>
                                )}

                                {/* Expanded: Progress Timeline */}
                                {isExpanded && progressUpdates.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-[var(--color-primary)]">
                                            <HiOutlineClock /> Engineer Progress Timeline
                                        </h4>
                                        <div className="space-y-3">
                                            {progressUpdates.map((u, i) => (
                                                <div key={i} className="flex gap-3">
                                                    <div className="flex flex-col items-center">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${u.percent === 100 ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'}`}>
                                                            {u.percent}%
                                                        </div>
                                                        {i < progressUpdates.length - 1 && <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />}
                                                    </div>
                                                    <div className="flex-1 pb-3">
                                                        <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{new Date(u.timestamp).toLocaleString()}</p>
                                                        {u.remarks && <p className="text-sm mb-2 bg-[var(--color-surface)] p-2 rounded-md">{u.remarks}</p>}
                                                        {u.imageUrl && (
                                                            <div className="relative">
                                                                <img src={u.imageUrl} alt={`Progress ${u.percent}%`} className="w-full max-h-32 object-cover rounded-md border" />
                                                                <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded">
                                                                    <HiOutlinePhotograph className="inline mr-1" />Site @ {u.percent}%
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Pending Verification */}
                                {c.ticket?.status === "Pending_Verification" && (
                                    <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                                        <h4 className="font-semibold text-sm mb-2 text-[var(--color-warning)]">Review Resolution</h4>
                                        <p className="text-sm text-[var(--color-text)] mb-3 bg-[var(--color-surface)] p-3 rounded-md">
                                            {c.ticket?.resolutionNotes || "Fix implemented."}
                                        </p>
                                        {c.ticket?.resolutionImageUrl && (
                                            <img src={c.ticket.resolutionImageUrl} alt="Resolution" className="w-full h-48 object-cover rounded-md mb-3" />
                                        )}
                                        <div className="flex items-center gap-3 mt-3">
                                            <button onClick={() => handleVerify(c.ticket.id, true, prompt("Rate 1-5 stars:") || 5)} className="btn-primary text-sm py-2">
                                                ✅ Mark as Resolved
                                            </button>
                                            <button onClick={() => handleVerify(c.ticket.id, false)} className="btn-secondary text-sm py-2 bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                                                ❌ Dispute
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
}
