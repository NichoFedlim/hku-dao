// ============================================================
// categories.js - Handles category page
// ============================================================

// Detect if we're on the dev server (port 5504) and set API base accordingly
const API_BASE = (window.location.port === '5504' || window.location.port === '5500') ? 'http://127.0.0.1:5012' : window.location.origin;
// ============================================================
// I18N SYSTEM
// ============================================================
const LOCALES = {
    en: '/nft/locales/en.json',
    zh: '/nft/locales/zh.json'
};
let currentLang = localStorage.getItem('hku_lang') || 'en';
let translations = {};

async function loadLanguage(lang) {
    try {
        const res = await fetch(LOCALES[lang]);
        if (!res.ok) throw new Error('Failed to load locale');
        translations = await res.json();
        currentLang = lang;
        localStorage.setItem('hku_lang', lang);
        applyTranslations();
        document.getElementById('lang-switch').textContent = lang === 'zh' ? 'English' : '中文';
    } catch (e) {
        console.warn('i18n error, using fallback', e);
        translations = {};
    }
}

function t(key, fallback = key) { return translations[key] || fallback; }

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    document.title = t('categories_title');
}

window.toggleLanguage = function() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    loadLanguage(next);
};

// ============================================================
// WALLET AUTH
// ============================================================
function checkLoginStatus() {
    if (typeof checkWalletLoginStatus === 'function') {
        return checkWalletLoginStatus();
    }
    return null;
}

function openWalletLoginModal() {
    if (typeof openWalletLogin === 'function') {
        return openWalletLogin();
    }
    return Promise.reject(new Error('wallet-auth not loaded'));
}

window.handleLogin = async function() {
    const info = checkLoginStatus();
    if (info) {
        window.location.href = '/nft/portfolio.html';
        return;
    }
    try {
        const result = await openWalletLoginModal();
        if (result && result.walletid) {
            hasOwnership = true;
            updateAdminUI();
            loginBtn.textContent = result.name || 'User';
            loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
            showToast(t('login_success'));
        }
    } catch (e) {
        if (e.message !== '用户取消登录') {
            showToast(t('login_error') + ': ' + e.message, 'error');
        }
    }
};

// ===== CONSOLIDATED TOAST SYSTEM =====
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toast
    const existing = document.querySelector('.toast-global');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-global';
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ff9800',
        info: '#4cb7db'
    };
    
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors[type] || colors.info};
        color: white;
        padding: 14px 28px;
        border-radius: 12px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 9999;
        transition: opacity 0.3s ease;
        max-width: 90%;
        text-align: center;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// MERGED CATEGORY DATA (combine both definitions)
// ============================================================

// First definition (with NFT fields, fewer items)
const CATEGORY_DATA_WITH_NFT = {
    faculties: [
        { id: 1, name: 'Architecture', name_zh: '建筑学院', subcount: 4, nft: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/architecture' },
        { id: 2, name: 'Arts', name_zh: '文学院', subcount: 4, nft: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/arts' },
        { id: 3, name: 'Business & Economics', name_zh: '商学院', subcount: 5, nft: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/business' },
        { id: 4, name: 'Dentistry', name_zh: '牙医学院', subcount: 2, nft: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/dentistry' },
        { id: 5, name: 'Education', name_zh: '教育学院', subcount: 3, nft: '0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/education' },
        { id: 6, name: 'Engineering', name_zh: '工程学院', subcount: 5, nft: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/engineering' },
        { id: 7, name: 'Law', name_zh: '法学院', subcount: 2, nft: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/law' },
        { id: 8, name: 'Medicine', name_zh: '李嘉诚医学院', subcount: 9, nft: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/medicine' },
        { id: 9, name: 'Science', name_zh: '理学院', subcount: 6, nft: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/science' },
        { id: 10, name: 'Social Sciences', name_zh: '社会科学学院', subcount: 5, nft: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/social-sciences' }
    ],
    'main-campus': [
        { id: 101, name: 'Main Building', name_zh: '主楼', subcount: 14, nft: '0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/main-building' },
        { id: 102, name: 'Haking Wong Building', name_zh: '王克桢楼', subcount: 10, nft: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/haking-wong' },
        { id: 103, name: 'Chow Yei Ching Building', name_zh: '周亦卿楼', subcount: 18, nft: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/chow-yei-ching' },
        { id: 104, name: 'K.K. Leung Building', name_zh: '梁銶琚楼', subcount: 18, nft: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/kk-leung' },
        { id: 105, name: 'Meng Wah Complex', name_zh: '蒙民伟楼', subcount: 18, nft: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/meng-wah' }
    ],
    'centennial-campus': [
        { id: 201, name: 'Cheng Yu Tung Tower', name_zh: '郑裕彤楼', subcount: 6, nft: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/cyt-tower' },
        { id: 202, name: 'Chi Wah Learning Commons', name_zh: '智华学习共享空间', subcount: 0, nft: '0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/chi-wah' },
        { id: 203, name: 'Lee Shau Kee Lecture Centre', name_zh: '李兆基演讲厅', subcount: 0, nft: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/lsk-lecture' }
    ],
    halls: [
        { id: 301, name: 'Eliot Hall', name_zh: '伊利沙伯堂', subcount: 5, nft: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/eliot-hall' },
        { id: 302, name: 'May Hall', name_zh: '梅堂', subcount: 0, nft: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/may-hall' },
        { id: 303, name: 'Swire Hall', name_zh: '施德堂', subcount: 0, nft: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/swire-hall' }
    ],
    medical: [
        { id: 401, name: 'Faculty of Medicine Building', name_zh: '医学院大楼', subcount: 0, nft: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/medicine-building' },
        { id: 402, name: 'Pauline Chan Building', name_zh: '陈瑞球楼', subcount: 0, nft: '0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/pauline-chan' }
    ],
    sports: [
        { id: 501, name: 'Stanley Ho Sports Centre', name_zh: '何鸿燊体育中心', subcount: 0, nft: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/stanley-ho' },
        { id: 502, name: 'Henry Fok Health and Fitness Complex', name_zh: '霍英东康体大楼', subcount: 0, nft: '0xA1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/henry-fok' }
    ],
    history: [
        { id: 601, name: '1910 – 1929', name_zh: '1910 – 1929', subcount: 0, nft: '0xB2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/history-1910' },
        { id: 602, name: '1930 – 1949', name_zh: '1930 – 1949', subcount: 0, nft: '0xC3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/history-1930' }
    ],
    culture: [
        { id: 701, name: 'Dim Sum', name_zh: '点心', subcount: 0, nft: '0xD4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/dim-sum' },
        { id: 702, name: 'Peak Hiking Trails', name_zh: '山顶行山径', subcount: 0, nft: '0xE5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/peak-hiking' }
    ],
    other: [
        { id: 999, name: 'Other Category', name_zh: '其他分类', subcount: 0, nft: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6', shortlink: 'https://hku.hk/other' }
    ]
};

// Second definition (complete list, without NFT fields)
const CATEGORY_DATA_FULL = {
    faculties: [
        { id: 1, name: 'Architecture', name_zh: '建筑学院', subcount: 4 },
        { id: 2, name: 'Arts', name_zh: '文学院', subcount: 4 },
        { id: 3, name: 'Business & Economics', name_zh: '商学院', subcount: 5 },
        { id: 4, name: 'Dentistry', name_zh: '牙医学院', subcount: 2 },
        { id: 5, name: 'Education', name_zh: '教育学院', subcount: 3 },
        { id: 6, name: 'Engineering', name_zh: '工程学院', subcount: 5 },
        { id: 7, name: 'Law', name_zh: '法学院', subcount: 2 },
        { id: 8, name: 'Medicine', name_zh: '李嘉诚医学院', subcount: 9 },
        { id: 9, name: 'Science', name_zh: '理学院', subcount: 6 },
        { id: 10, name: 'Social Sciences', name_zh: '社会科学学院', subcount: 5 }
    ],
    'main-campus': [
        { id: 101, name: 'Main Building', name_zh: '主楼', subcount: 0 },
        { id: 102, name: 'Haking Wong Building', name_zh: '王克桢楼', subcount: 0 },
        { id: 103, name: 'Chow Yei Ching Building', name_zh: '周亦卿楼', subcount: 0 },
        { id: 104, name: 'K.K. Leung Building', name_zh: '梁銶琚楼', subcount: 0 },
        { id: 105, name: 'Meng Wah Complex', name_zh: '蒙民伟楼', subcount: 0 },
        { id: 106, name: 'Chong Yuet Ming Buildings', name_zh: '庄月明楼', subcount: 0 },
        { id: 107, name: 'Hui Oi Chow Science Building', name_zh: '许爱周科学楼', subcount: 0 },
        { id: 108, name: 'James Hsioung Lee Science Building', name_zh: '李兆基科学楼', subcount: 0 },
        { id: 109, name: 'Kadoorie Biological Sciences Building', name_zh: '嘉道理生物科学楼', subcount: 0 },
        { id: 110, name: 'Knowles Building', name_zh: '诺尔斯楼', subcount: 0 },
        { id: 111, name: 'Pao Siu Loong Building', name_zh: '包兆龙楼', subcount: 0 },
        { id: 112, name: 'Hung Hing Ying Building', name_zh: '孔庆荧楼', subcount: 0 },
        { id: 113, name: 'Tang Chi Ngong Building', name_zh: '邓志昂楼', subcount: 0 },
        { id: 114, name: 'Fung Ping Shan Building', name_zh: '冯平山楼', subcount: 0 },
        { id: 115, name: 'T.T. Tsui Building', name_zh: '徐展堂楼', subcount: 0 },
        { id: 116, name: 'Rayson Huang Theatre', name_zh: '黄丽松讲堂', subcount: 0 },
        { id: 117, name: 'Tam Wing Fan Innovation Wing', name_zh: '谭荣芬创新翼', subcount: 0 }
    ],
    'centennial-campus': [
        { id: 201, name: 'Cheng Yu Tung Tower', name_zh: '郑裕彤楼', subcount: 0 },
        { id: 202, name: 'Chi Wah Learning Commons', name_zh: '智华学习共享空间', subcount: 0 },
        { id: 203, name: 'Lee Shau Kee Lecture Centre', name_zh: '李兆基演讲厅', subcount: 0 },
        { id: 204, name: 'The Grand Hall', name_zh: '大会堂', subcount: 0 },
        { id: 205, name: 'Run Run Shaw Tower', name_zh: '邵逸夫楼', subcount: 0 },
        { id: 206, name: 'The Jockey Club Tower', name_zh: '赛马会楼', subcount: 0 },
        { id: 207, name: 'Lui Che Woo Law Library', name_zh: '吕志和法律图书馆', subcount: 0 },
        { id: 208, name: 'Run Run Shaw Heritage House', name_zh: '邵逸夫文物馆', subcount: 0 }
    ],
    halls: [
        { id: 301, name: 'Eliot Hall', name_zh: '伊利沙伯堂', subcount: 0 },
        { id: 302, name: 'May Hall', name_zh: '梅堂', subcount: 0 },
        { id: 303, name: 'Swire Hall', name_zh: '施德堂', subcount: 0 },
        { id: 304, name: 'Simon K. Y. Lee Hall', name_zh: '李国贤堂', subcount: 0 },
        { id: 305, name: 'Graduate House', name_zh: '研究生宿舍', subcount: 0 },
        { id: 306, name: 'Robert Black College', name_zh: '黑池学院', subcount: 0 },
        { id: 307, name: 'Jockey Club Student Village I', name_zh: '赛马会学生村一期', subcount: 0 },
        { id: 308, name: 'Jockey Club Student Village II', name_zh: '赛马会学生村二期', subcount: 0 },
        { id: 309, name: 'Jockey Club Student Village III', name_zh: '赛马会学生村三期', subcount: 0 },
        { id: 310, name: 'Jockey Club Student Village IV', name_zh: '赛马会学生村四期', subcount: 0 },
        { id: 311, name: "St. John's College", name_zh: '圣约翰学院', subcount: 0 },
        { id: 312, name: 'Ricci Hall', name_zh: '利玛窦堂', subcount: 0 },
        { id: 313, name: 'University Hall', name_zh: '大学堂', subcount: 0 },
        { id: 314, name: 'Mui Fong House', name_zh: '梅芳居', subcount: 0 }
    ],
    medical: [
        { id: 401, name: 'Faculty of Medicine Building', name_zh: '医学院大楼', subcount: 0 },
        { id: 402, name: 'Pauline Chan Building', name_zh: '陈瑞球楼', subcount: 0 },
        { id: 403, name: 'Patrick Manson Building', name_zh: '万德楼', subcount: 0 },
        { id: 404, name: 'Jockey Club Building for Interdisciplinary Research', name_zh: '赛马会跨学科研究大楼', subcount: 0 },
        { id: 405, name: 'Dexter H.C. Man Building', name_zh: '文卓诚楼', subcount: 0 }
    ],
    sports: [
        { id: 501, name: 'Stanley Ho Sports Centre', name_zh: '何鸿燊体育中心', subcount: 0 },
        { id: 502, name: 'Henry Fok Health and Fitness Complex', name_zh: '霍英东康体大楼', subcount: 0 },
        { id: 503, name: 'Henry Fok Swimming Pool', name_zh: '霍英东游泳池', subcount: 0 }
    ],
    history: [
        { id: 601, name: '1910 – 1929', name_zh: '1910 – 1929', subcount: 0 },
        { id: 602, name: '1930 – 1949', name_zh: '1930 – 1949', subcount: 0 },
        { id: 603, name: '1950 – 1969', name_zh: '1950 – 1969', subcount: 0 },
        { id: 604, name: '1970 – 1989', name_zh: '1970 – 1989', subcount: 0 },
        { id: 605, name: '1990 – 2009', name_zh: '1990 – 2009', subcount: 0 },
        { id: 606, name: '2010 – 2029', name_zh: '2010 – 2029', subcount: 0 }
    ],
    culture: [
        { id: 701, name: 'Dim Sum', name_zh: '点心', subcount: 0 },
        { id: 702, name: 'Peak Hiking Trails', name_zh: '山顶行山径', subcount: 0 },
        { id: 703, name: 'Two-Dish Rice', name_zh: '两餸饭', subcount: 0 },
        { id: 704, name: 'Siu Mei (Roast Meats)', name_zh: '烧味', subcount: 0 }
    ],
    other: [
        { id: 999, name: 'Other Category', name_zh: '其他分类', subcount: 0 }
    ]
};
// ===== MERGE FUNCTION =====
function mergeCategoryData(base, enrich) {
    const merged = {};
    for (const key in base) {
        if (base.hasOwnProperty(key)) {
            // Build a map from enrich data by id for quick lookup
            const enrichMap = {};
            if (enrich[key]) {
                enrich[key].forEach(item => {
                    enrichMap[item.id] = item;
                });
            }
            // Merge each item in base
            merged[key] = base[key].map(item => {
                const enriched = enrichMap[item.id];
                if (enriched) {
                    // Use subcount, nft, shortlink from enriched if available
                    return {
                        ...item,
                        subcount: enriched.subcount !== undefined ? enriched.subcount : item.subcount,
                        nft: enriched.nft || null,
                        shortlink: enriched.shortlink || null,
                        price: enriched.price || null // Add this if you want price field
                    };
                } else {
                    // Keep base item as is, but ensure nft/shortlink are null if not present
                    return {
                        ...item,
                        nft: null,
                        shortlink: null,
                        price: null
                    };
                }
            });
        }
    }
    return merged;
}
// ===== CREATE FINAL CATEGORY_DATA =====
const CATEGORY_DATA = mergeCategoryData(CATEGORY_DATA_FULL, CATEGORY_DATA_WITH_NFT);

// ===== STATE =====
let allCategories = [];
let filteredCategories = [];
let currentFilter = 'all';
let currentPage = 1;
const ITEMS_PER_PAGE = 50;
let showAllMode = false;
let hasOwnership = false;
let usingMockData = false; // flag to show mock indicator

// ===== DOM REFS =====
const grid = document.getElementById('category-grid');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const addCategoryBtn = document.getElementById('add-category-btn');
const permissionHint = document.getElementById('permission-hint');
const loginBtn = document.getElementById('login-btn');

// ===== BUILD CATEGORY DATA =====
async function buildAllCategories() {
    try {
        const url = `${API_BASE}/api/categories/list`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch categories');
        const result = await response.json();
        const categories = result.data || [];
        if (!categories.length) throw new Error('No categories returned');
        
        // Transform API data to match the expected format
        return categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            name_zh: cat.name_zh || cat.name,
            filterKey: cat.type || 'all',
            subcount: cat.subcount || 0,
            nft: cat.hash || `0x${Math.random().toString(16).substring(2, 18)}`,
            shortlink: cat.shortlink || `https://hku.hk/category/${cat.id}`,
            price: cat.price || 0
        }));
    } catch (error) {
        console.error('Failed to load categories:', error);
        showToast('Failed to load categories from server', 'error');
        // Fallback to hardcoded data
        showToast('⚠️ Using mock data - backend API not available', 'warning');
        usingMockData = true;
        return buildAllCategoriesFallback();
    }
}

// Keep the fallback for when server is down
function buildAllCategoriesFallback() {
    // Your existing hardcoded data
    const all = [];
    for (const [filterKey, items] of Object.entries(CATEGORY_DATA)) {
        items.forEach(item => {
            all.push({
                ...item,
                filterKey: filterKey,
                // Ensure NFT fields exist
                nft: item.nft || `0x${Math.random().toString(16).substring(2, 18)}${Math.random().toString(16).substring(2, 18)}`,
                shortlink: item.shortlink || `https://hku.hk/category/${item.id}`
            });
        });
    }
    return all;
}

// ===== UPDATE FILTER BADGES FROM ACTUAL DATA =====
function updateFilterBadgesFromData(categories) {
    const counts = { all: categories.length };
    categories.forEach(cat => {
        const key = cat.filterKey || 'other';
        counts[key] = (counts[key] || 0) + 1;
    });
    // Update each badge
    for (const [key, count] of Object.entries(counts)) {
        const badge = document.getElementById(`count-${key}`);
        if (badge) badge.textContent = count;
    }
}

// ===== APPLY FILTER =====
function applyFilter(filterKey) {
    currentFilter = filterKey;
    currentPage = 1;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterKey);
    });

    const clearBtn = document.getElementById('filter-clear-btn');
    if (filterKey === 'all') {
        clearBtn.classList.add('hidden');
    } else {
        clearBtn.classList.remove('hidden');
    }

    if (filterKey === 'all') {
        filteredCategories = [...allCategories];
    } else {
        filteredCategories = allCategories.filter(cat => cat.filterKey === filterKey);
    }

    showAllMode = false;
    document.getElementById('show-all-btn').classList.remove('active');
    renderCurrentView();
}

function clearFilter() {
    applyFilter('all');
}

// ============================================================
// EDIT TYPE MODAL FUNCTIONS
// ============================================================
let editTypeCategoryId = null;
let editTypeCategoryName = '';

function openEditTypeModal(categoryId, currentType, categoryName) {
    const info = checkLoginStatus();
    if (!info) {
        showToast(t('login_to_edit'), 'warning');
        handleLogin();
        return;
    }
    if (!hasOwnership) {
        showToast(t('add_category_owner_required'), 'warning');
        return;
    }

    editTypeCategoryId = categoryId;
    editTypeCategoryName = categoryName;

    // Set the category name in the modal
    document.getElementById('editTypeCategoryName').textContent = categoryName;

    // Set the current type in the dropdown
    const select = document.getElementById('editCatType');
    // Find the option with matching value
    for (let option of select.options) {
        if (option.value === currentType) {
            option.selected = true;
            break;
        }
    }

    // Show modal
    const modal = document.getElementById('editTypeModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

async function updateCategoryType(categoryId, newType, wallet) {
    try {
        // We need to update the type in the category's content.json
        // Use the content/update endpoint with a 'type' field
        const response = await fetch(`${API_BASE}/api/content/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'category',
                category_id: categoryId,
                category_name: editTypeCategoryName,
                type: newType,
                wallet: wallet
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Category type updated successfully!', 'success');
            // Reload categories
            allCategories = await buildAllCategories();
            filteredCategories = [...allCategories];
            updateFilterBadgesFromData(allCategories);
            renderCurrentView();
            return true;
        } else {
            showToast(result.error || 'Failed to update category type.', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error updating category type:', error);
        showToast('Network error. Please try again.', 'error');
        return false;
    }
}

// ===== PAGINATION =====
function getCurrentPageItems() {
    if (showAllMode) return filteredCategories;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, filteredCategories.length);
    return filteredCategories.slice(start, end);
}

function getTotalPages() {
    if (showAllMode) return 1;
    return Math.ceil(filteredCategories.length / ITEMS_PER_PAGE) || 1;
}

function renderPagination() {
    const total = filteredCategories.length;
    const totalPages = getTotalPages();
    const start = showAllMode ? 1 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = showAllMode ? total : Math.min(currentPage * ITEMS_PER_PAGE, total);

    // Update TOP pagination
    const topStart = document.getElementById('showing-start');
    const topEnd = document.getElementById('showing-end');
    const topTotal = document.getElementById('total-count');
    if (topStart) topStart.textContent = total > 0 ? start : 0;
    if (topEnd) topEnd.textContent = total > 0 ? end : 0;
    if (topTotal) topTotal.textContent = total;

    // Update BOTTOM pagination
    const bottomStart = document.getElementById('showing-start-bottom');
    const bottomEnd = document.getElementById('showing-end-bottom');
    const bottomTotal = document.getElementById('total-count-bottom');
    if (bottomStart) bottomStart.textContent = total > 0 ? start : 0;
    if (bottomEnd) bottomEnd.textContent = total > 0 ? end : 0;
    if (bottomTotal) bottomTotal.textContent = total;

    const pageNumberContainers = document.querySelectorAll('#page-numbers, #page-numbers-bottom');
    const prevBtns = document.querySelectorAll('#prev-page-btn');
    const nextBtns = document.querySelectorAll('#next-page-btn');

    pageNumberContainers.forEach(container => {
        if (!container) return;
        container.innerHTML = '';
        if (showAllMode || totalPages <= 1) {
            const span = document.createElement('span');
            span.textContent = '1';
            span.className = 'page-btn active';
            container.appendChild(span);
            return;
        }

        const maxVisible = 7;
        let startPage = Math.max(1, currentPage - 3);
        let endPage = Math.min(totalPages, currentPage + 3);

        if (startPage > 1) {
            const firstBtn = document.createElement('button');
            firstBtn.className = 'page-btn';
            firstBtn.textContent = '1';
            firstBtn.onclick = () => goToPage(1);
            container.appendChild(firstBtn);
            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.textContent = '…';
                dots.style.padding = '0 4px';
                container.appendChild(dots);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => goToPage(i);
            container.appendChild(btn);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.textContent = '…';
                dots.style.padding = '0 4px';
                container.appendChild(dots);
            }
            const lastBtn = document.createElement('button');
            lastBtn.className = 'page-btn';
            lastBtn.textContent = totalPages;
            lastBtn.onclick = () => goToPage(totalPages);
            container.appendChild(lastBtn);
        }
    });

    prevBtns.forEach(btn => {
        if (btn) btn.disabled = currentPage <= 1 || showAllMode;
    });
    nextBtns.forEach(btn => {
        if (btn) btn.disabled = currentPage >= totalPages || showAllMode;
    });

    const showAllBtn = document.getElementById('show-all-btn');
    if (showAllBtn) {
        showAllBtn.classList.toggle('active', showAllMode);
        showAllBtn.textContent = showAllMode ? t('show_pages') || 'Show Pages' : t('show_all') || 'Show All';
    }
}

function goToPage(page) {
    if (showAllMode) return;
    const totalPages = getTotalPages();
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderCurrentView();
}

function prevPage() {
    if (currentPage > 1) goToPage(currentPage - 1);
}

function nextPage() {
    const totalPages = getTotalPages();
    if (currentPage < totalPages) goToPage(currentPage + 1);
}

function toggleShowAll() {
    showAllMode = !showAllMode;
    if (showAllMode) {
        currentPage = 1;
        document.getElementById('show-all-btn').classList.add('active');
    } else {
        document.getElementById('show-all-btn').classList.remove('active');
    }
    renderCurrentView();
}

function getShortlinkDomain() {
    // If we're on localhost (Live Server), use the backend server
    if (window.location.port === '5504' || window.location.port === '5500') {
        return 'http://127.0.0.1:5012';
    }
    // Otherwise use the current domain (production)
    return window.location.origin;
}

// ===== RENDER CATEGORY NFT CARDS =====
function renderCategories(items) {
    const info = checkLoginStatus();

    if (!items || items.length === 0) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>${t('no_categories_found')}</h3>
            <p>${t('no_categories_desc')}</p>
            <a href="/nft/index_main.html" class="back-link">← Back to Home Page</a>
        </div>`;
        return;
    }

    const displayName = (item) => currentLang === 'zh' ? item.name_zh : item.name;
    const filterLabels = {
        faculties: t('filter_faculties') || 'Faculties',
        'main-campus': t('filter_main-campus') || 'Main Campus',
        'centennial-campus': t('filter_centennial-campus') || 'Centennial Campus',
        halls: t('filter_halls') || 'Halls',
        medical: t('filter_medical') || 'Medical',
        sports: t('filter_sports') || 'Sports',
        history: t('filter_history') || 'History',
        culture: t('filter_culture') || 'Culture',
        other: t('filter_other') || 'Other'
    };
    const qrSize = window.innerWidth <= 480 ? 100 : 120;

    grid.innerHTML = items.map((item, index) => {
        // Build a proper detail URL
        const baseUrl = window.location.origin;         // e.g., http://127.0.0.1:5504 or https://d3.p2.rbas.top
        const detailUrl = `${baseUrl}/nft/detail.html?type=category&id=${item.id}`;
        const qrContent = item.shortlink?.trim() || detailUrl || item.nft?.trim() || 'https://hku.hk';
        const hashDisplay = item.nft ? item.nft.match(/.{1,16}/g)?.join('<br>') || item.nft : 'No hash';
        const priceDisplay = item.price ? `${item.price} rc` : '';
        const itemType = item.filterKey || item.type || 'other';
        const elementId = `logo-${item.id}-${index}`;
        
        // Render logo with unique ID for async updates
        const logoHtml = renderLogo(
            itemType,           // type
            item.name,          // name
            item.id,            // id
            'nft-logo',         // className
            displayName(item),  // altText
            elementId           // elementId for async updates
        );

        return `
            <div class="nft-card" data-id="${item.id}" data-filter="${item.filterKey}">
                <div class="card-inner">
                    <div class="card-left">
                        ${logoHtml}
                        <div class="item-name">${displayName(item)}</div>
                        <div class="item-parent">${filterLabels[item.filterKey] || item.filterKey}</div>
                        ${priceDisplay ? `<div class="price-tag">💰 ${priceDisplay}</div>` : ''}
                    </div>
                    <div class="card-right">
                        <div class="qr-wrapper">
                            <div class="qrcode" id="qr-${index}"></div>
                        </div>
                        <div class="nft-hash">${hashDisplay}</div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="card-number">#${item.id}</span>
                    <div class="btn-group-vertical">
                        <div class="btn-row">
                            <button class="action-btn" onclick="event.stopPropagation(); viewSubcategories(${item.id})" data-i18n="view_subcategories">View Sub-Items</button>
                            <button class="action-btn" style="background:#f0f0f0; color:#555;" onclick="event.stopPropagation(); viewDetail(${item.id})" data-i18n="view_detail">Detail</button>
                        </div>
                        <div class="btn-row">
                            ${info ? `<button class="action-btn" style="background:#dc3545; color:white;" onclick="event.stopPropagation(); deleteCategory(${item.id})" data-i18n="delete">Delete</button>` : ''}
                            ${info ? `<button class="action-btn" style="background:#6c757d; color:white;" onclick="event.stopPropagation(); openEditTypeModal(${item.id}, '${item.filterKey}', '${item.name}')" data-i18n="edit_type">Edit Type</button>` : ''}
                            ${!info ? `<span style="color:#999; font-size:0.75rem; text-align:center; width:100%;">${t('login_to_manage') || 'Login to manage'}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Generate QR codes
    items.forEach((item, index) => {
        setTimeout(() => {
            const qrDom = document.getElementById(`qr-${index}`);
            if (qrDom) {
                const qrContent = item.shortlink?.trim() || item.nft?.trim() || '';
                if (qrContent) {
                    const size = window.innerWidth <= 480 ? 100 : 120;
                    qrDom.innerHTML = '';
                    new QRCode(qrDom, {
                        text: qrContent,
                        width: size,
                        height: size,
                        colorDark: '#003153',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.L
                    });
                    const canvas = qrDom.querySelector('canvas');
                    if (canvas) {
                        canvas.style.width = '100%';
                        canvas.style.height = '100%';
                        canvas.style.display = 'block';
                    }
                } else {
                    qrDom.innerHTML = `<div style="width:${qrSize}px;height:${qrSize}px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;text-align:center;">No QR</div>`;
                }
            }
        }, index * 30);
    });

    // Click handler for cards (navigate to sub-items)
    grid.querySelectorAll('.nft-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Ignore clicks on buttons inside the card
            if (e.target.closest('.action-btn')) return;
            const id = card.dataset.id;
            viewSubcategories(parseInt(id));
        });
    });
}

// Add the viewDetail function
function viewDetail(categoryId) {
    window.location.href = `/nft/detail.html?type=category&id=${categoryId}`;
}

function viewSubcategories(categoryId) {
    window.location.href = `/nft/items.html?level=category&id=${categoryId}`;
}

async function deleteCategory(categoryId) {
    if (!confirm(t('confirm_delete_category') || 'Are you sure you want to delete this category and all its sub-items?')) return;
    const info = checkLoginStatus();
    if (!info) {
        showToast(t('please_login'), 'warning');
        return;
    }
    const wallet = info.walletid;
    try {
        const response = await fetch(`${API_BASE}/api/category/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId, wallet })
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message || 'Deleted', 'success');
            // Reload categories
            allCategories = await buildAllCategories();
            filteredCategories = [...allCategories];
            updateFilterBadgesFromData(allCategories);
            renderCurrentView();
        } else {
            showToast(result.error || 'Deletion failed', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Network error', 'error');
    }
}

function renderCurrentView() {
    const items = getCurrentPageItems();
    renderCategories(items);
    renderPagination();

    const total = filteredCategories.length;
    if (searchStatus) {
        const filterLabel = currentFilter === 'all' ? 'All' : (t(`filter_${currentFilter}`) || currentFilter);
        searchStatus.textContent = `${t('showing')} ${total} ${t('categories_label')} ${currentFilter !== 'all' ? `(${filterLabel})` : ''}`;
    }
}

// ===== SEARCH =====
const debounce = (fn, delay = 300) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const handleSearch = debounce((query) => {
    const q = query.trim().toLowerCase();
    if (!q) {
        applyFilter(currentFilter);
        return;
    }

    const baseData = currentFilter === 'all' ? allCategories :
        allCategories.filter(cat => cat.filterKey === currentFilter);

    filteredCategories = baseData.filter(cat =>
        cat.name.toLowerCase().includes(q) ||
        (cat.name_zh && cat.name_zh.includes(q))
    );

    currentPage = 1;
    showAllMode = false;
    document.getElementById('show-all-btn').classList.remove('active');
    renderCurrentView();

    if (searchStatus) {
        searchStatus.textContent = filteredCategories.length ?
            `${t('search_results')}: ${filteredCategories.length}` :
            t('search_no_results');
    }
}, 300);

searchInput.addEventListener('input', (e) => handleSearch(e.target.value));

// ===== QR SCAN =====
let scanning = false;
let stream = null;
const scanModal = document.getElementById('scan-modal');
const scanVideo = document.getElementById('scan-video');
const scanResult = document.getElementById('scan-result');
const closeScan = document.getElementById('close-scan');

document.getElementById('scan-btn').addEventListener('click', () => {
    scanModal.style.display = 'flex';
    startScanning();
});
closeScan.addEventListener('click', stopScanning);

async function startScanning() {
    try {
        scanning = true;
        scanResult.textContent = t('scan_qr_preparing');
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        scanVideo.srcObject = stream;
        await scanVideo.play();
        requestAnimationFrame(scanQRCode);
    } catch (e) {
        scanResult.textContent = t('scan_qr_error') + ': ' + e.message;
        scanning = false;
    }
}

function stopScanning() {
    scanning = false;
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    scanModal.style.display = 'none';
}

function scanQRCode() {
    if (!scanning) return;
    const video = scanVideo;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(scanQRCode);
        return;
    }
    const canvas = document.createElement('canvas');
    const scale = 0.5;
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
        const text = code.data.replace(/\s+/g, '');
        searchInput.value = text;
        handleSearch(text);
        stopScanning();
    } else {
        requestAnimationFrame(scanQRCode);
    }
}

// ===== LOGIN / OWNERSHIP =====
function updateAdminUI() {
    const info = checkLoginStatus();
    if (info && hasOwnership) {
        addCategoryBtn.classList.remove('disabled');
        permissionHint.textContent = t('add_category_owner_required');
        permissionHint.style.color = '#28a745';
    } else {
        addCategoryBtn.classList.add('disabled');
        if (info) {
            permissionHint.textContent = t('add_category_owner_required');
            permissionHint.style.color = '#f44336';
        } else {
            permissionHint.textContent = t('login_to_add');
            permissionHint.style.color = '#666';
        }
    }
}

// ============================================================
// Add Category (MODAL FUNCTIONS)
// ============================================================
function openAddCategory() {
    const info = checkLoginStatus();
    if (!info) {
        showToast(t('login_to_add'), 'warning');
        handleLogin();
        return;
    }
    if (!hasOwnership) {
        showToast(t('add_category_owner_required'), 'warning');
        return;
    }

    // Pre-fill wallet address from login info
    const walletInput = document.getElementById('catWallet');
    if (walletInput && info.walletid) {
        walletInput.value = info.walletid;
    }

    // Show modal
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// ===== FORM SUBMIT HANDLER =====
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('addCategoryForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const name = document.getElementById('catName').value.trim();
        const nameZh = document.getElementById('catNameZh').value.trim();
        const type = document.getElementById('catType').value;
        const price = parseInt(document.getElementById('catPrice').value);
        const wallet = document.getElementById('catWallet').value.trim();

        // Validation
        if (!name || !nameZh || !wallet || !price) {
            showToast('Please fill in all required fields.', 'error');
            return;
        }
        if (!/^[A-F0-9]{64}$/i.test(wallet)) {
            showToast('Invalid wallet address (must be 64 hex characters).', 'error');
            return;
        }

        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const url = `${API_BASE}/api/category/add`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category_name: name,
                    category_name_zh: nameZh,
                    category_type: type,
                    price: price,
                    buyer_wallet: wallet
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast('Category created successfully!', 'success');
                closeModal('addCategoryModal');
                // Reload categories
                allCategories = await buildAllCategories();
                filteredCategories = [...allCategories];
                updateFilterBadgesFromData(allCategories);
                renderCurrentView();
                // Reset form
                form.reset();
                // Re-fill wallet if still logged in
                const info = checkLoginStatus();
                if (info && info.walletid) {
                    document.getElementById('catWallet').value = info.walletid;
                }
            } else {
                showToast(result.error || 'Failed to create category.', 'error');
            }
        } catch (error) {
            console.error('Error creating category:', error);
            showToast('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = t('create_category') || 'Create Category';
        }
    });

    // Edit Type Form Handler
    const editTypeForm = document.getElementById('editTypeForm');
    if (editTypeForm) {
        editTypeForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const info = checkLoginStatus();
            if (!info) {
                showToast(t('please_login'), 'warning');
                return;
            }

            const newType = document.getElementById('editCatType').value;
            const wallet = info.walletid;

            if (!newType) {
                showToast('Please select a type.', 'error');
                return;
            }

            // Disable submit button
            const submitBtn = editTypeForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            const success = await updateCategoryType(editTypeCategoryId, newType, wallet);

            submitBtn.disabled = false;
            submitBtn.textContent = t('save_type') || 'Save Type';

            if (success) {
                closeModal('editTypeModal');
            }
        });
    }
});

// ===== WALLET LOGIN EVENTS =====
document.addEventListener('wallet-login-success', (e) => {
    const detail = e.detail;
    if (detail && detail.walletid) {
        hasOwnership = true;
        updateAdminUI();
        loginBtn.textContent = detail.name || 'User';
        loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
        showToast(t('login_success'));
    }
});

// ===== BACK TO TOP BUTTON =====
function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.innerHTML = '↑';
    btn.setAttribute('aria-label', 'Back to top');
    document.body.appendChild(btn);
    
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    });
    
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
};

// ===== INIT =====
async function init() {
    await loadLanguage(currentLang);
    allCategories = await buildAllCategories();
    filteredCategories = [...allCategories];
    updateFilterBadgesFromData(allCategories);    
    renderCurrentView();

    // Show mock indicator if using mock data
    if (usingMockData) {
        const indicator = document.createElement('div');
        indicator.id = 'mock-indicator';
        indicator.style.cssText = `
            background: #ff9800;
            color: #fff;
            padding: 8px 16px;
            border-radius: 8px;
            text-align: center;
            margin: 10px 0;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        `;
        indicator.innerHTML = '⚠️ Using mock data (backend API not available)';
        const searchSection = document.querySelector('.search-section');
        if (searchSection) {
            searchSection.parentNode.insertBefore(indicator, searchSection);
        }
    }

    const info = checkLoginStatus();
    if (info) {
        loginBtn.textContent = info.name || 'User';
        loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
        hasOwnership = true;
        updateAdminUI();
    } else {
        hasOwnership = false;
        updateAdminUI();
    }
    initBackToTop();
}

// Handle resize for QR codes
let resizeTimer;
window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (filteredCategories.length > 0) {
            renderCurrentView();
        }
    }, 300);
});

init();