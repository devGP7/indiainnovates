import { createContext, useContext, useState, useCallback, useRef } from "react";

const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;

const LANGUAGES = [
    { code: "en", label: "English", sarvamCode: "en-IN" },
    { code: "hi", label: "हिन्दी", sarvamCode: "hi-IN" },
    { code: "ta", label: "தமிழ்", sarvamCode: "ta-IN" },
    { code: "te", label: "తెలుగు", sarvamCode: "te-IN" },
    { code: "bn", label: "বাংলা", sarvamCode: "bn-IN" },
    { code: "mr", label: "मराठी", sarvamCode: "mr-IN" },
    { code: "gu", label: "ગુજરાતી", sarvamCode: "gu-IN" },
    { code: "kn", label: "ಕನ್ನಡ", sarvamCode: "kn-IN" },
    { code: "ml", label: "മലയാളം", sarvamCode: "ml-IN" },
    { code: "pa", label: "ਪੰਜਾਬੀ", sarvamCode: "pa-IN" },
];

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState("en");
    const cacheRef = useRef({});

    const translate = useCallback(async (text) => {
        if (!text || language === "en") return text;

        const cacheKey = `${language}:${text}`;
        if (cacheRef.current[cacheKey]) return cacheRef.current[cacheKey];

        try {
            const langInfo = LANGUAGES.find(l => l.code === language);
            const res = await fetch("https://api.sarvam.ai/translate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-subscription-key": SARVAM_API_KEY
                },
                body: JSON.stringify({
                    input: text,
                    source_language_code: "en-IN",
                    target_language_code: langInfo?.sarvamCode || "hi-IN",
                    model: "mayura:v1",
                    enable_preprocessing: true
                })
            });

            if (!res.ok) return text;
            const data = await res.json();
            const translated = data.translated_text || text;
            cacheRef.current[cacheKey] = translated;
            return translated;
        } catch {
            return text;
        }
    }, [language]);

    // Batch translate helper
    const translateBatch = useCallback(async (texts) => {
        if (language === "en") return texts;
        const results = await Promise.all(texts.map(t => translate(t)));
        return results;
    }, [language, translate]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, translate, translateBatch, LANGUAGES }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}

export { LANGUAGES };
export default LanguageContext;
