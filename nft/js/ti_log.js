// ============================================================
// ti_log.js – Transaction Log Logic
// ============================================================

// ===== USE MOCK DATA FOR DEVELOPMENT =====
const USE_MOCK_DATA = true; // Set to false when backend is ready


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
// SHA256 UTILITY
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
// AUTH CODE
// ============================================================
function calculateAuthCode(log) {
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
    // Reset copy button
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
        // Fallback
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
// MOCK DATA GENERATOR
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
        // Ensure buyer !== seller
        while (buyer === seller) {
            buyer = mockWallets[Math.floor(Math.random() * mockWallets.length)];
        }

        const price = Math.floor(Math.random() * 500) + 50;

        // Generate chain hash (64 hex chars)
        const chain = Array.from({ length: 64 }, () =>
            '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
        ).join('');

        const nextChain = Array.from({ length: 64 }, () =>
            '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
        ).join('');

        mockLogs.push({
            thread: i,
            time: date.toISOString().replace('T', ' ').slice(0, 16),
            price: price,
            seller: seller,
            buyer: buyer,
            chain: chain,
            next_chain: nextChain
        });
    }

    // Sort by thread
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
// DATA LOADING – Unified (with Mock Fallback)
// ============================================================
async function fetchData() {
    const urlParams = new URLSearchParams(window.location.search);
    const level = urlParams.get('level') || 'surname';
    const id = urlParams.get('id');
    const name = decodeURIComponent(urlParams.get('name') || '');
    const cardNumber = urlParams.get('card_number');

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

    let levelDisplay = '';

    // Determine level display name
    if (level === 'surname' || level === 'category') {
        levelDisplay = 'Category';
    } else if (level === 'citang' || level === 'subcategory') {
        levelDisplay = 'Subcategory';
    } else if (level === 'member' || level === 'item') {
        levelDisplay = 'Item';
    } else {
        levelDisplay = 'All';
    }
    badgeEl.textContent = `Level: ${levelDisplay}`;

    try {
        let data = null;

        // Try to fetch from API first
        if (!USE_MOCK_DATA) {
            let endpoint = '';
            if (level === 'surname' && cardNumber) {
                endpoint = `/ti-log/${cardNumber}?surname=${encodeURIComponent(name)}`;
            } else if (level === 'citang' && id) {
                endpoint = `/api/citang/log?citang_id=${id}`;
            } else if (level === 'member' && id) {
                endpoint = `/api/member/log?member_id=${id}`;
            } else if (cardNumber) {
                endpoint = `/ti-log/${cardNumber}?surname=${encodeURIComponent(name)}`;
            } else {
                throw new Error('Missing parameters');
            }

            const response = await fetch(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();
        } else {
            // Use mock data
            console.log('📦 Using mock transaction data for development');
            data = generateMockTransactions();

            // Show notice
            const notice = document.createElement('div');
            notice.style.cssText = 'text-align:center;padding:8px;background:#fff3cd;color:#856404;border-radius:4px;margin-bottom:12px;font-size:0.9rem;';
            notice.textContent = '⚠️ Using mock data (backend API not available)';
            const header = document.querySelector('.log-header');
            header.insertAdjacentElement('afterend', notice);
        }

        const logs = data.log || [];

        if (logs.length === 0) {
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
        }

        loadingEl.style.display = 'none';
        tableWrapper.style.display = 'block';
        renderTransactions(logs);
        totalEl.textContent = `Total: ${logs.length} records`;

    } catch (err) {
        console.error('Failed to load log:', err);
        loadingEl.style.display = 'none';

        // If using mock data and failed, still show mock
        if (USE_MOCK_DATA) {
            console.log('🔄 Attempting mock data fallback...');
            try {
                const mockData = generateMockTransactions();
                const logs = mockData.log || [];
                if (logs.length > 0) {
                    tableWrapper.style.display = 'block';
                    renderTransactions(logs);
                    totalEl.textContent = `Total: ${logs.length} records (mock)`;
                    return;
                }
            } catch (mockErr) {
                console.error('Mock fallback failed:', mockErr);
            }
        }

        showError(err.message);
    }
}

function showError(message) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

function renderTransactions(logs) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const sorted = [...logs].sort((a, b) => (a.thread || 0) - (b.thread || 0));

    sorted.forEach(log => {
        const authCode = calculateAuthCode(log);
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
                    ${formatChainShort(authCode)}
                </button>
                <button class="view-btn" onclick="showFullAuthCode('${authCode}')">View</button>
            </td>
        `;

        tbody.appendChild(row);
    });
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

// Click outside modal to close
window.onclick = function(event) {
    const modal = document.getElementById('authCodeModal');
    if (event.target === modal) {
        closeAuthCodeModal();
    }
};

document.addEventListener('DOMContentLoaded', init);