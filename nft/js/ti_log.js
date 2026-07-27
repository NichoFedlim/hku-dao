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
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
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
// FORMATTING FUNCTIONS
// ============================================================
function formatChainShort(chain) {
    const displayLength = 4;
    return chain ? chain.slice(0, displayLength) + '...' : '未知';
}

function formatWalletShort(wallet) {
    if (!wallet) return '未知';
    if (wallet.length <= 8) return wallet;
    return wallet.slice(0, 4) + '***' + wallet.slice(-4);
}

// ============================================================
// AUTH CODE FUNCTIONS
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

function showFullAuthCode(fullCode) {
    document.getElementById('authCodeFullText').textContent = fullCode;
    document.getElementById('authCodeModal').style.display = 'block';
}

function closeAuthCodeModal() {
    document.getElementById('authCodeModal').style.display = 'none';
}

function copyAuthCode() {
    const authCodeText = document.getElementById('authCodeFullText').textContent;
    navigator.clipboard.writeText(authCodeText).then(() => {
        alert('认证码已复制到剪贴板！');
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    });
}

// ============================================================
// NAVIGATION FUNCTIONS
// ============================================================
function goBack() {
    window.history.back();
}

function goToPreviousPage() {
    window.history.back();
}

function goToHomePage() {
    window.location.href = 'index_main.html';
}

// ============================================================
// DATA LOADING
// ============================================================
async function fetchData() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const name = decodeURIComponent(urlParams.get('name') || '');
        const card_number = urlParams.get('card_number');
        
        if (!card_number) throw new Error('缺少 card_number');

        // Fetch data
        const logResp = await fetch(`/ti-log/${card_number}?surname=${encodeURIComponent(name)}`);
        if (!logResp.ok) throw new Error('读取日志接口失败');
        const { log, nft_holder } = await logResp.json();

        // Render transaction table
        loadTransactions(log);
    } catch (err) {
        console.error(err);
        document.querySelector('.transaction-count').textContent = '数据加载失败';
    }
}

function loadTransactions(logs) {
    const tableBody = document.getElementById('transaction-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = '';

    document.getElementById('transaction-count').textContent = `共 ${logs.length} 条记录`;
    
    const sortedLogs = [...logs].sort((a, b) => parseInt(a.thread) - parseInt(b.thread));
    
    sortedLogs.forEach(log => {
        const authCode = calculateAuthCode(log);
        
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${log.thread}</td>
            <td>${log.time}</td>
            <td>￥${log.price}</td>
            <td>${formatWalletShort(log.seller)}</td>
            <td>${formatWalletShort(log.buyer)}</td>
            <td>${formatChainShort(log.chain)}</td>
            <td>
                <a href="javascript:void(0);" 
                   class="auth-code-clickable"
                   onclick="showFullAuthCode('${authCode}')">
                    ${formatChainShort(authCode)}
                </a>
                <button onclick="showFullAuthCode('${authCode}')">查看</button>
            </td>
        `;
    });
}

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    applyTranslations();
    fetchData();
}

// Make functions globally accessible for inline onclick handlers
window.toggleLanguage = toggleLanguage;
window.goBack = goBack;
window.goToPreviousPage = goToPreviousPage;
window.goToHomePage = goToHomePage;
window.showFullAuthCode = showFullAuthCode;
window.closeAuthCodeModal = closeAuthCodeModal;
window.copyAuthCode = copyAuthCode;

// Modal click outside to close
window.onclick = function(event) {
    const modal = document.getElementById('authCodeModal');
    if (event.target === modal) {
        closeAuthCodeModal();
    }
};

document.addEventListener('DOMContentLoaded', init);
