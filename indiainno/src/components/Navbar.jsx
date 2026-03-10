import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
    HiOutlineMenu, HiOutlineX, HiOutlineLogout,
    HiOutlineViewGrid, HiOutlinePencilAlt, HiOutlineClipboardList,
    HiOutlineLocationMarker, HiOutlineTicket, HiOutlineMap,
    HiOutlineUserGroup, HiOutlineOfficeBuilding, HiOutlineFlag,
    HiOutlineCog
} from "react-icons/hi";
import { useState } from "react";

const NAV_LINKS = {
    user: [
        { to: "/citizen", label: "Dashboard", icon: HiOutlineViewGrid },
        { to: "/citizen/submit", label: "Submit Complaint", icon: HiOutlinePencilAlt },
        { to: "/citizen/complaints", label: "My Complaints", icon: HiOutlineClipboardList },
        { to: "/citizen/map", label: "City Map", icon: HiOutlineMap },
    ],
    engineer: [
        { to: "/engineer", label: "Dashboard", icon: HiOutlineCog },
    ],
    admin: [
        { to: "/admin", label: "Dashboard", icon: HiOutlineViewGrid },
        { to: "/admin/tickets", label: "Tickets", icon: HiOutlineTicket },
        { to: "/admin/map", label: "Live Map", icon: HiOutlineMap },
        { to: "/admin/engineers", label: "Engineers", icon: HiOutlineUserGroup },
        { to: "/admin/departments", label: "Departments", icon: HiOutlineOfficeBuilding },
        { to: "/admin/manual-queue", label: "Manual Queue", icon: HiOutlineFlag },
    ],
};

export default function Navbar() {
    const { user, userProfile, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    if (!user) return null;

    const links = NAV_LINKS[userProfile?.role] || [];
    const roleName = userProfile?.role === "admin" ? "Senior Officer" : userProfile?.role === "engineer" ? "Engineer" : "Citizen";

    const handleLogout = async () => {
        await logout();
        navigate("/");
    };

    return (
        <>
            {/* Sidebar */}
            <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
                <div style={{ padding: "14px 16px 18px", borderBottom: "1px solid #e2e8f0" }}>
                    <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                        <div style={{
                            width: 32, height: 32, background: "#1e3a8a", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 12, borderRadius: 4
                        }}>CS</div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a", lineHeight: 1.2 }}>CivicSync</div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{roleName}</div>
                        </div>
                    </Link>
                </div>

                <nav style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
                    {links.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.to;
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`sidebar-link ${isActive ? "active" : ""}`}
                                onClick={() => setMobileOpen(false)}
                            >
                                <Icon style={{ fontSize: 17, color: isActive ? "#1e3a8a" : "#64748b", flexShrink: 0 }} />
                                <span>{link.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <div style={{ padding: "0 2px", marginBottom: 10 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userProfile?.name}</p>
                        <p style={{ fontSize: 10, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userProfile?.email}</p>
                    </div>
                    <button onClick={handleLogout} className="btn-secondary" style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "7px 12px" }}>
                        <HiOutlineLogout style={{ fontSize: 15 }} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Mobile Toggle */}
            <button
                style={{
                    position: "fixed", top: 12, left: 12, zIndex: 50,
                    padding: 8, borderRadius: 4, background: "#fff",
                    border: "1px solid #cbd5e1", cursor: "pointer",
                    display: "none"
                }}
                className="md-hidden-toggle"
                onClick={() => setMobileOpen(!mobileOpen)}
            >
                {mobileOpen ? <HiOutlineX style={{ fontSize: 20 }} /> : <HiOutlineMenu style={{ fontSize: 20 }} />}
            </button>

            {/* Mobile Backdrop */}
            {mobileOpen && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 30 }}
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <style>{`
                @media (max-width: 768px) {
                    .md-hidden-toggle { display: block !important; }
                }
            `}</style>
        </>
    );
}
