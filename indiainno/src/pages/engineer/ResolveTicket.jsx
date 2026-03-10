import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout";
import api from "../../utils/api";
import { getCurrentLocation, isWithinRange } from "../../utils/geolocation";
import toast from "react-hot-toast";
import { HiOutlineLocationMarker, HiOutlinePhotograph, HiOutlineShieldCheck, HiOutlineCheckCircle, HiOutlineClock } from "react-icons/hi";

export default function ResolveTicket() {
    const { ticketId } = useParams();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);

    const [form, setForm] = useState({
        lat: null, lng: null, accuracy: null,
        imageFile: null, imagePreview: null,
        notes: "", progressPercent: 0,
        progressRemarks: "", progressImagePreview: null
    });

    useEffect(() => {
        const fetchTicket = async () => {
            try {
                const { data } = await api.get(`/tickets/master/${ticketId}`);
                setTicket(data);
                setForm(prev => ({ ...prev, progressPercent: data.progressPercent || 0 }));
            } catch (err) {
                toast.error("Failed to load ticket");
                navigate("/engineer");
            }
            setLoading(false);
        };
        fetchTicket();
    }, [ticketId, navigate]);

    const handleProgressImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setForm(f => ({ ...f, progressImagePreview: reader.result }));
            reader.readAsDataURL(file);
        }
    };

    const handleResolutionImageChange = (e) => {
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
            if (ticket.lat && ticket.lng) {
                const check = isWithinRange(ticket.lat, ticket.lng, loc.lat, loc.lng, 50);
                if (check.withinRange) toast.success(`Location verified! ${check.distance}m from site.`, { icon: '✅' });
                else toast.error(`Geo-fence Failed: ${check.distance}m away. Must be within 50m.`);
            } else {
                toast.success("Location captured.");
            }
        } catch (err) { toast.error(err.message); }
        setGeoLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Progress update (< 100%)
        if (form.progressPercent < 100) {
            if (!form.progressRemarks) return toast.error("Please write remarks about what work was done.");
            if (!form.progressImagePreview) return toast.error("Please upload a photo of current site status.");

            setSubmitting(true);
            try {
                await api.put(`/tickets/master/${ticketId}`, {
                    progressPercent: form.progressPercent,
                    status: 'In_Progress',
                    progressRemarks: form.progressRemarks,
                    progressImageUrl: form.progressImagePreview
                });
                toast.success("Progress updated with photo & remarks!");
                navigate("/engineer");
            } catch (err) { toast.error("Failed to update progress."); }
            setSubmitting(false);
            return;
        }

        // Full resolution (100%)
        if (!form.lat || !form.lng) return toast.error("Live geolocation required for final resolution.");
        if (!form.imagePreview) return toast.error("Must upload a resolution photo.");

        if (ticket.lat && ticket.lng) {
            const check = isWithinRange(ticket.lat, ticket.lng, form.lat, form.lng, 50);
            if (!check.withinRange) {
                toast.error(`DENIED: You are ${check.distance}m away. Must be within 50m.`);
                return;
            }
        }

        setSubmitting(true);
        try {
            await api.put(`/tickets/master/${ticketId}`, {
                resolutionLat: form.lat, resolutionLng: form.lng,
                resolutionNotes: form.notes, resolutionImageUrl: form.imagePreview,
                progressPercent: 100,
                progressRemarks: form.notes || 'Work completed. Submitted for verification.',
                progressImageUrl: form.imagePreview
            });
            toast.success("Resolution submitted! Awaiting citizen verification.", { duration: 5000 });
            navigate("/engineer");
        } catch (err) { console.error(err); toast.error("Failed to commit resolution."); }
        setSubmitting(false);
    };

    if (loading) return <DashboardLayout><div className="flex justify-center py-20"><div className="spinner" /></div></DashboardLayout>;
    if (!ticket) return null;

    return (
        <DashboardLayout title="Resolve Issue" subtitle={`Ticket: ${ticket.ticketNumber || ticket.id?.slice(0, 8)}`}>
            <div className="grid md:grid-cols-2 gap-6">

                {/* LEFT: Ticket Info + Progress Timeline */}
                <div className="space-y-5 animate-fadeInUp">
                    <div className="card">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-bold">{ticket.intentCategory?.replace(/_/g, " ")}</h2>
                                <p className="text-[var(--color-text-muted)]">{ticket.landmark || "Geo-coordinate report"}</p>
                            </div>
                            <span className={`badge severity-${(ticket.severity || "low").toLowerCase()}`}>{ticket.severity}</span>
                        </div>

                        <div className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] mb-4">
                            <p className="text-sm font-medium mb-1 flex items-center gap-2"><HiOutlineLocationMarker className="text-[var(--color-primary)]" /> Target Area</p>
                            <code className="text-xs text-[var(--color-text-muted)]">Lat: {ticket.lat?.toFixed(5)} | Lng: {ticket.lng?.toFixed(5)}</code>
                        </div>

                        {ticket.description && (
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                                <p className="text-sm font-medium text-blue-800 mb-1">Complaint Description</p>
                                <p className="text-sm text-blue-700">{ticket.description}</p>
                            </div>
                        )}

                        {ticket.imageUrl && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Citizen's Photo</p>
                                <img src={ticket.imageUrl} alt="Issue" className="w-full h-40 object-cover rounded-lg border" />
                            </div>
                        )}

                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-3 flex gap-3 text-sm">
                            <HiOutlineShieldCheck className="text-xl text-[#ef4444] shrink-0 mt-0.5" />
                            <div>
                                <strong className="block text-[#ef4444] mb-1">Geo-Fencing Active</strong>
                                <p className="text-[#f87171] text-xs">Must be within 50m of target to submit final resolution.</p>
                            </div>
                        </div>
                    </div>

                    {/* Progress Timeline */}
                    {ticket.progressUpdates?.length > 0 && (
                        <div className="card">
                            <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><HiOutlineClock className="text-[var(--color-primary)]" /> Update History</h3>
                            <div className="space-y-3">
                                {ticket.progressUpdates.map((u, i) => (
                                    <div key={i} className="flex gap-3 pb-3 border-b border-[var(--color-border)] last:border-0 last:pb-0">
                                        <div className="flex flex-col items-center">
                                            <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">{u.percent}%</div>
                                            {i < ticket.progressUpdates.length - 1 && <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-[var(--color-text-muted)] mb-1">{new Date(u.timestamp).toLocaleString()}</p>
                                            {u.remarks && <p className="text-sm mb-1">{u.remarks}</p>}
                                            {u.imageUrl && <img src={u.imageUrl} alt="Progress" className="w-full max-h-28 object-cover rounded-md border" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: Update Form */}
                <div className="animate-fadeInUp" style={{ animationDelay: "100ms" }}>
                    <form onSubmit={handleSubmit} className="card space-y-5">
                        <h3 className="text-lg font-bold">Progress & Resolution</h3>

                        {/* Progress Slider */}
                        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                            <label className="block text-sm font-medium mb-3 text-[var(--color-text-muted)]">Progress: <strong className="text-[var(--color-primary)]">{form.progressPercent}%</strong></label>
                            <input type="range" min="0" max="100" step="10"
                                value={form.progressPercent}
                                onChange={(e) => setForm(f => ({ ...f, progressPercent: parseInt(e.target.value) }))}
                                className="w-full accent-[var(--color-primary)]" />
                            <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] mt-1">
                                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                                    <span key={v}>{v}</span>
                                ))}
                            </div>
                        </div>

                        {/* Always show photo + remarks (except at 0%) */}
                        {form.progressPercent > 0 && form.progressPercent < 100 && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    <label className="block text-sm font-medium mb-2 text-[var(--color-text-muted)]">Remarks — What work was done?</label>
                                    <textarea
                                        value={form.progressRemarks}
                                        onChange={e => setForm(f => ({ ...f, progressRemarks: e.target.value }))}
                                        className="input-field min-h-[70px]"
                                        placeholder="E.g., Excavation completed, laying new pipes..."
                                        required
                                    />
                                </div>

                                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    <label className="block text-sm font-medium mb-2 text-[var(--color-text-muted)]">Site Photo (Required)</label>
                                    <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${form.progressImagePreview ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'}`}>
                                        {form.progressImagePreview ? (
                                            <img src={form.progressImagePreview} alt="Site" className="max-h-36 rounded-lg" />
                                        ) : (
                                            <>
                                                <HiOutlinePhotograph className="text-2xl text-[var(--color-primary)] mb-2" />
                                                <p className="text-sm font-medium">Upload Site Photo</p>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" capture="environment" onChange={handleProgressImageChange} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Full Resolution (100%) */}
                        {form.progressPercent === 100 && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    <label className="block text-sm font-medium mb-3 text-[var(--color-text-muted)]">Step 1: Verify Location</label>
                                    <button type="button" onClick={captureLocation} disabled={geoLoading}
                                        className={`btn-secondary w-full justify-center py-3 ${form.lat ? 'border-[#22c55e] bg-[#22c55e]/10 text-[#4ade80]' : ''}`}>
                                        {geoLoading ? <><div className="spinner w-4 h-4 border-2" /> Polling GPS...</>
                                            : form.lat ? <><HiOutlineCheckCircle className="text-lg" /> Locked ({Math.round(form.accuracy)}m acc)</>
                                                : <><HiOutlineLocationMarker className="text-lg" /> Fetch Live GPS</>}
                                    </button>
                                </div>

                                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    <label className="block text-sm font-medium mb-3 text-[var(--color-text-muted)]">Step 2: Resolution Photo</label>
                                    <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer transition-colors ${form.imagePreview ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                                        {form.imagePreview ? (
                                            <img src={form.imagePreview} alt="Resolution" className="max-h-44 rounded-lg" />
                                        ) : (
                                            <>
                                                <HiOutlinePhotograph className="text-2xl text-[var(--color-primary)] mb-2" />
                                                <p className="text-sm font-medium">Open Camera</p>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" capture="environment" onChange={handleResolutionImageChange} className="hidden" />
                                    </label>
                                </div>

                                <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    <label className="block text-sm font-medium mb-2 text-[var(--color-text-muted)]">Final Remarks</label>
                                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field min-h-[70px]"
                                        placeholder="Describe the resolution..." />
                                </div>
                            </div>
                        )}

                        <button type="submit" className="btn-primary w-full justify-center py-3 text-base" disabled={submitting}>
                            {submitting ? <div className="spinner w-5 h-5 border-2" /> : (form.progressPercent === 100 ? "Submit Final Resolution" : `Update Progress to ${form.progressPercent}%`)}
                        </button>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
