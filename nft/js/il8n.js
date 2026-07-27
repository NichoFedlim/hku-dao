// ============================================================
// i18n.js – Language loading and translation
// ============================================================

export const LOCALES = {
    en: '/locales/en.json',
    zh: '/locales/zh.json'
};

let currentLang = localStorage.getItem('hku_lang') || 'en';
let translations = {};

export async function loadLanguage(lang) {
    try {
        const res = await fetch(LOCALES[lang]);
        if (!res.ok) throw new Error('Failed to load locale');
        translations = await res.json();
        currentLang = lang;
        localStorage.setItem('hku_lang', lang);
        applyTranslations();
        // Update language toggle button text
        const toggle = document.getElementById('lang-switch');
        if (toggle) toggle.textContent = lang === 'zh' ? 'English' : '中文';
    } catch (e) {
        console.warn('i18n error, using fallback', e);
        translations = {};
    }
}

export function t(key, fallback = key) {
    return translations[key] || fallback;
}

export function applyTranslations() {
    // Elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    // Title
    document.title = t('page_title') || 'HKU DAO';
}

export function getCurrentLang() {
    return currentLang;
}
