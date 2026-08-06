// ============================================================
// ti_log.js – Transaction Log Logic (HKU DAO)
// ============================================================

// ===== USE MOCK DATA FOR DEVELOPMENT =====
const USE_MOCK_DATA = false; // Set to false when backend is ready
// ===== API BASE =====
const API_BASE = (window.location.port === '5504' || window.location.port === '5500') ? 'http://127.0.0.1:5012' : 'https://d3.p2.rbas.top';

// ===== I18N =====
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
        const toggle = document.getElementById('lang-switch');
        if (toggle) toggle.textContent = lang === 'zh' ? 'English' : '中文';
    } catch (e) {
        console.warn('i18n error, using fallback', e);
        translations = {};
    }
}

function t(key, fallback = key) {
    return translations[key] || fallback;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.title = t('log_title') || 'Transaction Log';
}

window.toggleLanguage = function() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    loadLanguage(next);
};

// ============================================================
// SHA256 UTILITY (for fallback auth code calculation)
// ============================================================
function jsSHA256(input) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const utf8Bytes = new TextEncoder().encode(input);
    const bitLength = utf8Bytes.length * 8;

    const paddedByteLength = Math.ceil((bitLength + 65) / 512) * 512 / 8;
    const message = new Uint8Array(paddedByteLength);

    message.set(utf8Bytes);
    message[utf8Bytes.length] = 0x80;

    const dataView = new DataView(message.buffer);
    const lengthHigh = Math.floor(bitLength / 0x100000000);
    const lengthLow = bitLength;

    dataView.setUint32(paddedByteLength - 8, lengthHigh, false);
    dataView.setUint32(paddedByteLength - 4, lengthLow, false);

    for (let i = 0; i < message.length; i += 64) {
        const w = new Uint32Array(64);

        for (let j = 0; j < 16; j++) {
            w[j] = dataView.getUint32(i + j * 4, false);
        }

        for (let j = 16; j < 64; j++) {
            const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }

        let a = h0, b = h1, c = h2, d = h3,
            e = h4, f = h5, g = h6, h = h7;

        for (let j = 0; j < 64; j++) {
            const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
            const ch = (e & f) ^ ((~e) & g);
            const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
            const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const hashArray = [
        (h0 >>> 24) & 0xFF, (h0 >>> 16) & 0xFF, (h0 >>> 8) & 0xFF, h0 & 0xFF,
        (h1 >>> 24) & 0xFF, (h1 >>> 16) & 0xFF, (h1 >>> 8) & 0xFF, h1 & 0xFF,
        (h2 >>> 24) & 0xFF, (h2 >>> 16) & 0xFF, (h2 >>> 8) & 0xFF, h2 & 0xFF,
        (h3 >>> 24) & 0xFF, (h3 >>> 16) & 0xFF, (h3 >>> 8) & 0xFF, h3 & 0xFF,
        (h4 >>> 24) & 0xFF, (h4 >>> 16) & 0xFF, (h4 >>> 8) & 0xFF, h4 & 0xFF,
        (h5 >>> 24) & 0xFF, (h5 >>> 16) & 0xFF, (h5 >>> 8) & 0xFF, h5 & 0xFF,
        (h6 >>> 24) & 0xFF, (h6 >>> 16) & 0xFF, (h6 >>> 8) & 0xFF, h6 & 0xFF,
        (h7 >>> 24) & 0xFF, (h7 >>> 16) & 0xFF, (h7 >>> 8) & 0xFF, h7 & 0xFF
    ];

    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ============================================================
// FORMATTING
// ============================================================
function formatChainShort(chain) {
    if (!chain) return '—';
    return chain.slice(0, 6) + '…' + chain.slice(-4);
}

function formatWalletShort(wallet) {
    if (!wallet) return '—';
    if (wallet.length <= 10) return wallet;
    return wallet.slice(0, 4) + '…' + wallet.slice(-4);
}

// ============================================================
// AUTH CODE (fallback if verification_code not in log)
// ============================================================
function calculateAuthCode(log) {
    // If verification_code exists, use it directly
    if (log.verification_code) {
        return log.verification_code;
    }

    // Fallback: calculate from log data
    const displayData =
        `${log.thread}\t` +
        `${log.time}\t` +
        `￥${log.price}\t` +
        `${formatWalletShort(log.seller)}\t` +
        `${formatWalletShort(log.buyer)}\t` +
        `${formatChainShort(log.chain)}`;

    return jsSHA256(displayData);
}

let currentAuthCode = '';

function showFullAuthCode(fullCode) {
    currentAuthCode = fullCode;
    document.getElementById('authCodeFullText').textContent = fullCode;
    document.getElementById('authCodeModal').style.display = 'block';
    const btn = document.getElementById('copyAuthBtn');
    btn.textContent = t('copy') || 'Copy to Clipboard';
    btn.classList.remove('copied');
    document.body.style.overflow = 'hidden';
}

function closeAuthCodeModal() {
    document.getElementById('authCodeModal').style.display = 'none';
    document.body.style.overflow = '';
}

function copyAuthCode() {
    const text = document.getElementById('authCodeFullText').textContent;
    const btn = document.getElementById('copyAuthBtn');

    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = t('copy') || 'Copy to Clipboard';
            btn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = t('copy') || 'Copy to Clipboard';
            btn.classList.remove('copied');
        }, 2000);
    });
}

// ============================================================
// MOCK DATA GENERATOR (fallback for development)
// ============================================================
function generateMockTransactions() {
    const now = new Date();
    const mockWallets = [
        '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
        '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
        '0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4',
        '0x3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2'
    ];
    const names = ['Architecture', 'Engineering', 'Medicine', 'Law', 'Business', 'Science'];

    const mockLogs = [];
    const numThreads = 12;

    for (let i = 1; i <= numThreads; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - Math.floor(Math.random() * 30));
        date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0);

        const seller = mockWallets[Math.floor(Math.random() * mockWallets.length)];
        let buyer = mockWallets[Math.floor(Math.random() * mockWallets.length)];
        while (buyer === seller) {
            buyer = mockWallets[Math.floor(Math.random() * mockWallets.length)];
        }

        const price = Math.floor(Math.random() * 500) + 50;
        const chain = Array.from({ length: 64 }, () =>
            '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
        ).join('');
        const nextChain = Array.from({ length: 64 }, () =>
            '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
        ).join('');
        const verificationCode = Array.from({ length: 64 }, () =>
            '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
        ).join('');

        mockLogs.push({
            thread: i,
            time: date.toISOString().replace('T', ' ').slice(0, 16),
            price: price,
            seller: seller,
            buyer: buyer,
            chain: chain,
            next_chain: nextChain,
            verification_code: verificationCode
        });
    }

    mockLogs.sort((a, b) => a.thread - b.thread);

    return {
        log: mockLogs,
        nft_holder: {
            wallet: '0xa1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4',
            telephone: '+852 9123 4567',
            email: 'holder@hku.hk',
            other: 'Current NFT holder'
        }
    };
}

// ============================================================
// TOAST SYSTEM (unified)
// ============================================================
function showToast(message, type = 'info', duration = 3000) {
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
// SEARCH & PAGINATION STATE
// ============================================================
let allTransactions = [];
let filteredTransactions = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 50;
let showAllMode = false;
let searchQuery = '';

// ============================================================
// SEARCH FUNCTIONS
// ============================================================
function applySearch() {
    const input = document.getElementById('search-input');
    searchQuery = input.value.trim().toLowerCase();
    filterAndRender();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    searchQuery = '';
    filteredTransactions = [...allTransactions];
    currentPage = 1;
    showAllMode = false;
    document.getElementById('show-all-btn').classList.remove('active');
    renderCurrentView();
    updateSearchStatus();
}

function filterAndRender() {
    if (!searchQuery) {
        filteredTransactions = [...allTransactions];
    } else {
        filteredTransactions = allTransactions.filter(log => {
            const searchable = [
                log.thread?.toString() || '',
                log.time || '',
                log.price?.toString() || '',
                log.seller || '',
                log.buyer || '',
                log.chain || '',
                log.next_chain || '',
                log.verification_code || ''
            ].join(' ').toLowerCase();
            return searchable.includes(searchQuery);
        });
    }
    currentPage = 1;
    showAllMode = false;
    document.getElementById('show-all-btn').classList.remove('active');
    renderCurrentView();
    updateSearchStatus();
}

function updateSearchStatus() {
    const statusEl = document.getElementById('search-status');
    const total = allTransactions.length;
    const filtered = filteredTransactions.length;

    if (searchQuery) {
        statusEl.textContent = `🔍 Found ${filtered} of ${total} transactions matching "${searchQuery}"`;
    } else {
        statusEl.textContent = `📊 ${total} transactions total`;
    }
}

// ============================================================
// PAGINATION FUNCTIONS
// ============================================================
function getCurrentPageItems() {
    if (showAllMode) return filteredTransactions;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, filteredTransactions.length);
    return filteredTransactions.slice(start, end);
}

function getTotalPages() {
    if (showAllMode) return 1;
    return Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1;
}

function renderPagination() {
    const total = filteredTransactions.length;
    const totalPages = getTotalPages();
    const start = showAllMode ? 1 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = showAllMode ? total : Math.min(currentPage * ITEMS_PER_PAGE, total);

    document.getElementById('showing-start').textContent = total > 0 ? start : 0;
    document.getElementById('showing-end').textContent = total > 0 ? end : 0;
    document.getElementById('total-count').textContent = total;

    const container = document.getElementById('page-numbers');
    container.innerHTML = '';

    if (showAllMode || totalPages <= 1) {
        const span = document.createElement('span');
        span.textContent = '1';
        span.className = 'page-btn active';
        container.appendChild(span);
    } else {
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
    }

    document.getElementById('prev-page-btn').disabled = currentPage <= 1 || showAllMode;
    document.getElementById('next-page-btn').disabled = currentPage >= totalPages || showAllMode;

    const showAllBtn = document.getElementById('show-all-btn');
    showAllBtn.classList.toggle('active', showAllMode);
    showAllBtn.textContent = showAllMode ? (t('show_pages') || 'Show Pages') : (t('show_all') || 'Show All');
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

function renderCurrentView() {
    const items = getCurrentPageItems();
    renderTransactions(items);
    renderPagination();
}

// ============================================================
// RENDER TRANSACTIONS
// ============================================================
function renderTransactions(logs) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">${t('no_transactions')}</td></tr>`;
        return;
    }

    // Sort by thread descending (newest first)
    const sorted = [...logs].sort((a, b) => (b.thread || 0) - (a.thread || 0));

    sorted.forEach(log => {
        const authCode = calculateAuthCode(log); // uses verification_code if available
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${log.thread || '—'}</td>
            <td>${log.time || '—'}</td>
            <td>￥${log.price || 0}</td>
            <td>${formatWalletShort(log.seller)}</td>
            <td>${formatWalletShort(log.buyer)}</td>
            <td><span class="hash-short">${formatChainShort(log.chain)}</span></td>
            <td>
                <button class="auth-code-btn" onclick="showFullAuthCode('${authCode}')">
                    ${authCode.length > 8 ? formatChainShort(authCode) : authCode}
                </button>
                <button class="view-btn" onclick="showFullAuthCode('${authCode}')">View</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

// ============================================================
// DATA LOADING – Unified HKU DAO Backend with Mock Fallback
// ============================================================
async function fetchData() {
    const urlParams = new URLSearchParams(window.location.search);

    // Parse parameters – support both old and new naming
    const levelParam = urlParams.get('level') || 'surname';
    const id = urlParams.get('id');
    const name = decodeURIComponent(urlParams.get('name') || '');
    const cardNumber = urlParams.get('card_number');

    // Map legacy level names to new HKU DAO structure
    let level = '';
    let category_id = '';
    let category_name = '';
    let subcategory_id = '';
    let subcategory_name = '';
    let item_number = '';
    let item_name = '';

    // Try to get from URL parameters (new format)
    const urlCategoryId = urlParams.get('category_id') || urlParams.get('categoryId');
    const urlCategoryName = urlParams.get('category_name') || urlParams.get('categoryName');
    const urlSubcategoryId = urlParams.get('subcategory_id') || urlParams.get('subcategoryId');
    const urlSubcategoryName = urlParams.get('subcategory_name') || urlParams.get('subcategoryName');
    const urlItemNumber = urlParams.get('item_number') || urlParams.get('itemNumber');
    const urlItemName = urlParams.get('item_name') || urlParams.get('itemName');

    // Determine level
    if (levelParam === 'surname' || levelParam === 'category') {
        level = 'category';
        category_id = urlCategoryId || cardNumber || id || '';
        category_name = urlCategoryName || name || '';
    } else if (levelParam === 'citang' || levelParam === 'subcategory') {
        level = 'subcategory';
        category_id = urlCategoryId || cardNumber || '';
        category_name = urlCategoryName || '';
        subcategory_id = urlSubcategoryId || id || '';
        subcategory_name = urlSubcategoryName || name || '';
    } else if (levelParam === 'member' || levelParam === 'item') {
        level = 'item';
        category_id = urlCategoryId || cardNumber || '';
        category_name = urlCategoryName || '';
        subcategory_id = urlSubcategoryId || '';
        subcategory_name = urlSubcategoryName || '';
        item_number = urlItemNumber || id || '';
        item_name = urlItemName || name || '';
    } else {
        // Fallback: treat as category
        level = 'category';
        category_id = cardNumber || id || '';
        category_name = name || '';
    }

    const loadingEl = document.getElementById('loading-state');
    const tableWrapper = document.getElementById('table-wrapper');
    const emptyEl = document.getElementById('empty-state');
    const errorEl = document.getElementById('error-state');
    const totalEl = document.getElementById('log-total');
    const badgeEl = document.getElementById('log-level-badge');

    loadingEl.style.display = 'block';
    tableWrapper.style.display = 'none';
    emptyEl.style.display = 'none';
    errorEl.style.display = 'none';

    const levelDisplay = {
        'category': 'Category',
        'subcategory': 'Subcategory',
        'item': 'Item'
    }[level] || 'All';
    badgeEl.textContent = `Level: ${levelDisplay}`;

    try {
        let data = null;
        let usingMock = false;

        // Try real API first (unless USE_MOCK_DATA is forced)
        if (!USE_MOCK_DATA) {
            try {
                // Build query parameters
                const params = new URLSearchParams();
                params.set('level', level);
                if (category_id) params.set('category_id', category_id);
                if (category_name) params.set('category_name', category_name);
                if (subcategory_id) params.set('subcategory_id', subcategory_id);
                if (subcategory_name) params.set('subcategory_name', subcategory_name);
                if (item_number) params.set('item_number', item_number);
                if (item_name) params.set('item_name', item_name);

                const endpoint = `${API_BASE}/api/log/transaction?${params.toString()}`;
                const response = await fetch(endpoint);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                data = await response.json();
                console.log('✅ Loaded transaction log from HKU DAO backend');
            } catch (apiError) {
                console.warn('⚠️ Failed to fetch from API, using mock fallback:', apiError);
                usingMock = true;
                data = generateMockTransactions();
                showToast('⚠️ Using mock data (backend API not available)', 'warning');
            }
        } else {
            // Mock data forced
            usingMock = true;
            data = generateMockTransactions();
            console.log('📦 Using mock transaction data (USE_MOCK_DATA=true)');
        }

        // If mock is used, show a notice
        if (usingMock) {
            const header = document.querySelector('.log-header');
            let notice = document.querySelector('.mock-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.className = 'mock-notice';
                notice.style.cssText = 'text-align:center;padding:10px;background:#fff3cd;color:#856404;border-radius:4px;margin-bottom:12px;font-size:0.9rem;';
                notice.textContent = '⚠️ Using mock data (backend API not available)';
                header.insertAdjacentElement('afterend', notice);
            } else {
                notice.style.display = 'block';
            }
        } else {
            // Remove mock notice if exists
            const notice = document.querySelector('.mock-notice');
            if (notice) notice.style.display = 'none';
        }

        const logs = data.log || [];

        if (logs.length === 0) {
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'block';
            totalEl.textContent = 'Total: 0 records';
            return;
        }

        loadingEl.style.display = 'none';
        tableWrapper.style.display = 'block';

        allTransactions = logs;
        filteredTransactions = [...allTransactions];
        searchQuery = '';
        document.getElementById('search-input').value = '';

        renderTransactions(filteredTransactions);
        renderPagination();
        updateSearchStatus();
        totalEl.textContent = `Total: ${logs.length} records${usingMock ? ' (mock)' : ''}`;

    } catch (err) {
        console.error('Failed to load log:', err);
        loadingEl.style.display = 'none';
        showError(err.message);
        showToast('Failed to load transaction log: ' + err.message, 'error');
    }
}

function showError(message) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

// ============================================================
// NAVIGATION
// ============================================================
function goBack() {
    window.history.back();
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('authCodeModal');
        if (modal.style.display === 'block') {
            closeAuthCodeModal();
        }
    }
});

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    applyTranslations();
    fetchData();
}

// Make functions globally accessible
window.toggleLanguage = toggleLanguage;
window.goBack = goBack;
window.showFullAuthCode = showFullAuthCode;
window.closeAuthCodeModal = closeAuthCodeModal;
window.copyAuthCode = copyAuthCode;
window.applySearch = applySearch;
window.clearSearch = clearSearch;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.goToPage = goToPage;
window.toggleShowAll = toggleShowAll;

// Click outside modal to close
window.onclick = function(event) {
    const modal = document.getElementById('authCodeModal');
    if (event.target === modal) {
        closeAuthCodeModal();
    }
};

document.addEventListener('DOMContentLoaded', init);
