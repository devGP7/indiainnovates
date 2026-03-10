import Navbar from "./Navbar";
import { useLanguage } from "../contexts/LanguageContext";

export default function DashboardLayout({ children, title, subtitle }) {
    const { language, setLanguage, LANGUAGES } = useLanguage();

    return (
        <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
            <Navbar />
            <main style={{ marginLeft: 220, padding: "28px 32px" }}>
                {title && (
                    <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1e3a8a", marginBottom: 4 }}>{title}</h1>
                            {subtitle && <p style={{ color: "#64748b", fontSize: 14 }}>{subtitle}</p>}
                        </div>
                        {/* Language Selector */}
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            style={{
                                padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1",
                                background: "#fff", fontSize: 13, fontWeight: 600, color: "#1e3a8a",
                                cursor: "pointer", outline: "none", minWidth: 110
                            }}
                        >
                            {LANGUAGES.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                        </select>
                    </div>
                )}
                {children}
            </main>

            <style>{`
                @media (max-width: 768px) {
                    main { margin-left: 0 !important; padding: 16px !important; }
                }
            `}</style>
        </div>
    );
}
