import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import api from "../../utils/api";
import { HiOutlineChartPie, HiOutlineUsers, HiOutlineTicket, HiOutlineExclamationCircle, HiOutlineLocationMarker, HiOutlineUserGroup, HiOutlineClipboardCheck } from "react-icons/hi";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
    const [stats, setStats] = useState({ total: 0, open: 0, critical: 0, users: 0 });
    const [analytics, setAnalytics] = useState({ areas: [], engineers: [], affectedCitizens: 0 });
    const [recentTickets, setRecentTickets] = useState([]);
    const [pendingApprovals, setPendingApprovals] = useState([]);
    const [approvingId, setApprovingId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const [ticketsRes, usersRes] = await Promise.all([
                    api.get('/tickets/master'),
                    api.get('/users')
                ]);

                const ticketsSnap = ticketsRes.data;
                const usersSnap = usersRes.data;

                let total = ticketsSnap.length, open = 0, critical = 0;
                ticketsSnap.forEach(t => {
                    if (t.status !== "Closed") open++;
                    if (t.severity === "Critical" && t.status !== "Closed") critical++;
                });

                setStats({ total, open, critical, users: usersSnap.length });
                setRecentTickets(ticketsSnap.slice(0, 5));

                // Officer analytics & Pending Approvals
                try {
                    const [analyticsRes, pendingRes] = await Promise.all([
                        api.get('/tickets/officer-analytics'),
                        api.get('/tickets/pending-approval')
                    ]);
                    setAnalytics(analyticsRes.data);
                    setPendingApprovals(pendingRes.data);
                } catch (e) { console.warn('Analytics or pending not available:', e); }
            } catch (err) { console.error("Dashboard fetch error:", err); }
            setLoading(false);
        };
        fetchDashboard();
    }, []);

    const handleApprove = async (ticket) => {
        setApprovingId(ticket.id);
        try {
            await api.put(`/tickets/master/${ticket.id}/approve`, {
                intentCategory: ticket.intentCategory,
                department: ticket.department,
                city: ticket.city,
                landmark: ticket.landmark,
                description: ticket.description
            });
            setPendingApprovals(prev => prev.filter(t => t.id !== ticket.id));
            alert('Ticket approved and SMS dispatched to citizen!');
        } catch (err) {
            console.error('Approval failed:', err);
            alert('Failed to approve ticket');
        }
        setApprovingId(null);
    };

    const updatePendingField = (id, field, value) => {
        setPendingApprovals(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    return (
        <DashboardLayout title="Senior Officer Dashboard" subtitle="City-wide Civic Operations Center">
            {/* ═══ TOP STATS ═══ */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 stagger">
                {[
                    { icon: HiOutlineTicket, label: "Total Tickets", value: stats.total, color: "#6366f1", bg: "from-[#6366f1]/10" },
                    { icon: HiOutlineChartPie, label: "Active Issues", value: stats.open, color: "#f59e0b", bg: "from-[#f59e0b]/10" },
                    { icon: HiOutlineExclamationCircle, label: "Critical", value: stats.critical, color: "#ef4444", bg: "from-[#ef4444]/10" },
                    { icon: HiOutlineUsers, label: "Users", value: stats.users, color: "#06b6d4", bg: "from-[#06b6d4]/10" },
                    { icon: HiOutlineUserGroup, label: "Affected Citizens", value: analytics.affectedCitizens, color: "#8b5cf6", bg: "from-[#8b5cf6]/10" },
                ].map((s, i) => (
                    <div key={i} className={`stat-card bg-gradient-to-br ${s.bg} to-transparent animate-fadeInUp`}>
                        <div className="flex items-center justify-between mb-2">
                            <s.icon className="text-xl" style={{ color: s.color }} />
                            <span className="text-2xl font-bold" style={{ color: s.color === "#ef4444" ? "#ef4444" : undefined }}>{loading ? "—" : s.value}</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)] font-medium">{s.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* ═══ MAIN COLUMN ═══ */}
                <div className="md:col-span-2 space-y-5">

                    {/* ═══ PENDING APPROVALS (VOICE COMPLAINTS) ═══ */}
                    {pendingApprovals.length > 0 && (
                        <div className="card animate-fadeInUp border-l-4 border-[#f59e0b]">
                            <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-[#f59e0b]">
                                <HiOutlineExclamationCircle className="text-xl" /> Voice Complaints Pending Approval
                            </h2>
                            <div className="space-y-4">
                                {pendingApprovals.map(ticket => (
                                    <div key={ticket.id} className="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <span className="text-xs font-bold bg-[var(--color-background)] py-1 px-2 rounded">{ticket.ticketNumber}</span>
                                                <span className="text-xs text-[var(--color-text-muted)] ml-2">{new Date(ticket.createdAt).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Audio Recording</label>
                                                <audio className="w-full h-8 mt-1" controls src={ticket.audioUrl}></audio>
                                            </div>
                                            <div className="space-y-2">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Original Transcript</label>
                                                    <p className="text-xs p-2 bg-[var(--color-background)] rounded italic">{ticket.originalTranscript || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">English Translation</label>
                                                    <input type="text" value={ticket.description} onChange={(e) => updatePendingField(ticket.id, 'description', e.target.value)} className="input-field text-xs py-1.5" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Category</label>
                                                <input type="text" value={ticket.intentCategory} onChange={(e) => updatePendingField(ticket.id, 'intentCategory', e.target.value)} className="input-field text-xs py-1" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Department</label>
                                                <input type="text" value={ticket.department || ""} onChange={(e) => updatePendingField(ticket.id, 'department', e.target.value)} className="input-field text-xs py-1" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">City</label>
                                                <input type="text" value={ticket.city || ""} onChange={(e) => updatePendingField(ticket.id, 'city', e.target.value)} className="input-field text-xs py-1" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Landmark</label>
                                                <input type="text" value={ticket.landmark || ""} onChange={(e) => updatePendingField(ticket.id, 'landmark', e.target.value)} className="input-field text-xs py-1" />
                                            </div>
                                        </div>

                                        <div className="flex justify-end">
                                            <button onClick={() => handleApprove(ticket)} disabled={approvingId === ticket.id} className="btn-primary py-1.5 px-4 text-sm flex items-center gap-2">
                                                {approvingId === ticket.id ? 'Approving...' : 'Approve & Create Ticket'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══ AREA BREAKDOWN ═══ */}
                    <div className="card animate-fadeInUp">
                        <h2 className="text-base font-bold mb-4 flex items-center gap-2"><HiOutlineLocationMarker className="text-[var(--color-primary)]" /> Area-Wise Issue Breakdown</h2>
                        {analytics.areas.length === 0 ? (
                            <p className="text-sm text-[var(--color-text-muted)] py-4">No area data available yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--color-border)]">
                                            <th className="text-left py-2 text-xs font-semibold text-[var(--color-text-muted)]">Area</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Pending</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Resolved</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Critical</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Citizens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.areas.map((a, i) => (
                                            <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]">
                                                <td className="py-2 font-medium">{a.area}</td>
                                                <td className="text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${a.pending > 0 ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'text-[var(--color-text-muted)]'}`}>{a.pending}</span>
                                                </td>
                                                <td className="text-center">
                                                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-[#22c55e]/10 text-[#22c55e]">{a.resolved}</span>
                                                </td>
                                                <td className="text-center">
                                                    {a.critical > 0 ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-[#ef4444]/10 text-[#ef4444]">{a.critical}</span> : <span className="text-[var(--color-text-muted)]">—</span>}
                                                </td>
                                                <td className="text-center font-semibold">{a.citizens}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ═══ ENGINEER DEPLOYMENT ═══ */}
                    <div className="card animate-fadeInUp">
                        <h2 className="text-base font-bold mb-4 flex items-center gap-2"><HiOutlineClipboardCheck className="text-[#06b6d4]" /> Engineer Deployment</h2>
                        {analytics.engineers.length === 0 ? (
                            <p className="text-sm text-[var(--color-text-muted)] py-4">No engineers registered yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--color-border)]">
                                            <th className="text-left py-2 text-xs font-semibold text-[var(--color-text-muted)]">Engineer</th>
                                            <th className="text-left py-2 text-xs font-semibold text-[var(--color-text-muted)]">Department</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Assigned</th>
                                            <th className="text-center py-2 text-xs font-semibold text-[var(--color-text-muted)]">Resolved</th>
                                            <th className="text-left py-2 text-xs font-semibold text-[var(--color-text-muted)]">Areas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.engineers.map((e, i) => (
                                            <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]">
                                                <td className="py-2">
                                                    <div className="font-medium">{e.name}</div>
                                                    <div className="text-[10px] text-[var(--color-text-muted)]">{e.email}</div>
                                                </td>
                                                <td className="py-2 text-xs"><span className="badge bg-[var(--color-primary)]/10 text-[var(--color-primary)]">{e.department || '—'}</span></td>
                                                <td className="text-center font-bold">{e.assigned}</td>
                                                <td className="text-center"><span className={`font-bold ${e.resolved > 0 ? 'text-[#22c55e]' : ''}`}>{e.resolved}</span></td>
                                                <td className="py-2 text-xs text-[var(--color-text-muted)]">{e.areas.join(', ') || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT SIDEBAR ═══ */}
                <div className="space-y-4 animate-fadeInUp" style={{ animationDelay: "100ms" }}>
                    <h2 className="text-base font-bold mb-2">Command Center</h2>

                    <Link to="/admin/map" className="block card p-4 hover:bg-[var(--color-surface)] border-[var(--color-primary)]/30 group">
                        <div className="flex items-center justify-between mb-2">
                            <HiOutlineLocationMarker className="text-xl text-[var(--color-primary)]" />
                            <span className="text-[var(--color-primary-light)] group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                        <h3 className="font-semibold mb-1">Live Heatmap</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">Real-time clustering of civic issues.</p>
                    </Link>

                    <Link to="/admin/tickets" className="block card p-4 hover:bg-[var(--color-surface)] group">
                        <div className="flex items-center justify-between mb-2">
                            <HiOutlineTicket className="text-xl text-[#6366f1]" />
                            <span className="text-[#6366f1] group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                        <h3 className="font-semibold mb-1">All Tickets</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">Manage and assign tickets to engineers.</p>
                    </Link>

                    <Link to="/admin/manual-queue" className="block card p-4 hover:bg-[var(--color-surface)] border-[#f59e0b]/30 group">
                        <div className="flex items-center justify-between mb-2">
                            <HiOutlineClipboardCheck className="text-xl text-[#f59e0b]" />
                            <span className="text-[#f59e0b] group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                        <h3 className="font-semibold mb-1">Manual Pin-Drop Queue</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">Fix NLP geocoding failures.</p>
                    </Link>

                    {/* Recent Activity */}
                    <div className="card">
                        <h3 className="font-semibold text-sm mb-3">Recent Tickets</h3>
                        <div className="space-y-2">
                            {recentTickets.slice(0, 4).map(t => (
                                <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]/50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium truncate">{t.intentCategory?.replace(/_/g, " ")}</p>
                                        <p className="text-[10px] text-[var(--color-text-muted)]">{t.landmark || "—"}</p>
                                    </div>
                                    <span className={`badge severity-${(t.severity || "low").toLowerCase()} text-[9px]`}>{t.severity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
