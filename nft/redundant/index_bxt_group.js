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
    document.title = t('group_title') || 'Group Display';
}

window.toggleLanguage = function() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    loadLanguage(next);
};

// ============================================================
// STATE VARIABLES
// ============================================================
let currentStart = 1;
let allSurnamesData = [];
let TOTAL_SURNAMES = 0;
let gradeImageCache = {};

const ITEMS_PER_PAGE = 9;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNft(nft) {
    if (!nft) return 'No NFT data';
    return nft.match(/.{1,16}/g).join('<br>');
}

// ============================================================
// NAVIGATION FUNCTIONS
// ============================================================
function goBackToXingshi() {
    window.location.href = 'nft/categories.html';
}

function updateNavigationButtons(start) {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    prevBtn.disabled = start <= 1;
    const maxStart = Math.floor((TOTAL_SURNAMES - 1) / ITEMS_PER_PAGE) * ITEMS_PER_PAGE + 1;
    nextBtn.disabled = start >= maxStart;
}

function loadPreviousGroup() {
    if (currentStart > ITEMS_PER_PAGE) loadSurnamesData(currentStart - ITEMS_PER_PAGE);
    else if (currentStart > 1) loadSurnamesData(1);
}

function loadNextGroup() {
    const nextStart = currentStart + ITEMS_PER_PAGE;
    if (nextStart <= TOTAL_SURNAMES) loadSurnamesData(nextStart);
}

// ============================================================
// API FUNCTIONS
// ============================================================
async function loadAllSurnamesFromAPI() {
    const response = await fetch('/api/surnames/list');
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to fetch list');
    return result.data;
}

async function preloadGradeImage(card_number, surname) {
    const key = `${card_number}_${surname}`;
    if (gradeImageCache[key] !== undefined) return gradeImageCache[key];
    const imageUrl = `/nft/data/${card_number}_${surname}/contents/grade_log.png`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(imageUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        gradeImageCache[key] = response.ok ? imageUrl : null;
        return gradeImageCache[key];
    } catch {
        gradeImageCache[key] = null;
        return null;
    }
}

// ============================================================
// QR CODE FUNCTIONS
// ============================================================
function getResponsiveQrSize() {
    if (window.innerWidth <= 480) return 160;
    if (window.innerWidth <= 768) return 150;
    return 120;
}

// ============================================================
// RENDERING FUNCTIONS
// ============================================================
async function loadSurnamesData(start) {
    currentStart = start;
    if (allSurnamesData.length === 0) {
        const container = document.getElementById('nft-cards-container');
        container.innerHTML = `<div class="loading-container"><div class="loader"></div><p>正在扫描年级目录...</p></div>`;
        try {
            allSurnamesData = await loadAllSurnamesFromAPI();
            TOTAL_SURNAMES = allSurnamesData.length;
            await Promise.allSettled(allSurnamesData.map(item => preloadGradeImage(item.card_number, item.name)));
        } catch (error) {
            container.innerHTML = `<div style="text-align:center;padding:40px;"><h3>加载失败</h3><p>${error.message}</p><button class="retry-btn" onclick="location.reload()">重试</button></div>`;
            return;
        }
    }
    const end = Math.min(start + ITEMS_PER_PAGE, TOTAL_SURNAMES);
    document.getElementById('group-title').textContent = `编号 ${start}-${end}`;
    updateNavigationButtons(start);
    renderCards(allSurnamesData.slice(start - 1, end));
}

async function renderCards(surnames) {
    const container = document.getElementById('nft-cards-container');
    if (surnames.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:40px;"><h3>暂无数据</h3></div>`;
        return;
    }

    const qrSize = getResponsiveQrSize();

    const cardsHtml = await Promise.all(surnames.map(async (card, idx) => {
        const qrContent = card.shortlink?.trim() || card.nft?.trim() || '';
        const gradeImgUrl = await preloadGradeImage(card.card_number, card.name);
        const safeName = escapeHtml(card.name);
        const nftDisplay = card.nft ? formatNft(card.nft) : '暂无NFT信息';
        const yearLogoUrl = `/image/1973_log.png`;

        return `
        <div class="card">
            <a href="name.html?name=${encodeURIComponent(card.name)}&card_number=${card.card_number}" class="card-link">
                <div class="card-layout">
                    <div class="card-top-section">
                        <div class="card-left">
                            <img src="/image/pcps_log.png" class="pcps-logo-img" alt="培正" onerror="this.style.display='none'">
                            ${gradeImgUrl ?
                `<img class="grade-photo" src="${gradeImgUrl}" alt="${safeName}" loading="lazy" 
                                          onerror="this.classList.add('grade-photo-placeholder'); this.onerror=null; this.parentElement.innerHTML='<div class=\\'grade-photo-placeholder\\'>暂无图片</div>'">` :
                `<div class="grade-photo-placeholder"></div>`
            }
                            <img src="${yearLogoUrl}" class="year-logo-img" alt="1973" onerror="this.style.display='none'">
                            <div class="grade-name">${safeName}</div>
                        </div>
                        <div class="card-right">
                            <div class="qr-wrapper">
                                <div class="qrcode" id="qr-${idx}" data-qr-content="${encodeURIComponent(qrContent)}" data-qr-size="${qrSize}"></div>
                            </div>
                            <div class="nft-display">${nftDisplay}</div>
                        </div>
                    </div>
                    <div class="card-bottom-section">
                        <div class="button-section">
                            <button class="nft-transaction-btn" onclick="handleTransactionClick(event,'${encodeURIComponent(card.name)}',${card.card_number})">
                                培正DAO-NFT
                            </button>
                        </div>
                    </div>
                </div>
            </a>
        </div>`;
    }));

    container.innerHTML = cardsHtml.join('');

    // Generate QR codes
    surnames.forEach((card, idx) => {
        setTimeout(() => {
            const qrDom = document.getElementById(`qr-${idx}`);
            if (qrDom) {
                let qrText = card.shortlink?.trim() || card.nft?.trim() || '';
                let targetSize = parseInt(qrDom.getAttribute('data-qr-size'));
                if (isNaN(targetSize) || targetSize <= 0) {
                    targetSize = getResponsiveQrSize();
                }
                if (qrText) {
                    qrDom.innerHTML = '';
                    new QRCode(qrDom, {
                        text: qrText,
                        width: targetSize,
                        height: targetSize,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.L
                    });
                    const canvasElem = qrDom.querySelector('canvas');
                    if (canvasElem) {
                        canvasElem.style.width = `${targetSize}px`;
                        canvasElem.style.height = `${targetSize}px`;
                        canvasElem.style.maxWidth = `${targetSize}px`;
                        canvasElem.style.margin = '0 auto';
                        canvasElem.style.display = 'block';
                    }
                } else {
                    qrDom.innerHTML = `<div style="width:${targetSize}px;height:${targetSize}px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:12px;text-align:center;">无码</div>`;
                }
            }
        }, idx * 20);
    });
}

// ============================================================
// EVENT HANDLERS
// ============================================================
function handleTransactionClick(e, name, cardNumber) {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `/ti_log.html?name=${name}&card_number=${cardNumber}`;
}

// ============================================================
// RESIZE HANDLER
// ============================================================
let resizeTimer;
window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (allSurnamesData.length > 0 && document.getElementById('nft-cards-container').innerHTML.includes('card')) {
            const start = currentStart;
            const endSlice = Math.min(start + ITEMS_PER_PAGE, TOTAL_SURNAMES);
            renderCards(allSurnamesData.slice(start - 1, endSlice));
        }
    }, 200);
});

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    applyTranslations();
    const startParam = getQueryParam('start');
    const start = startParam ? Math.max(1, parseInt(startParam)) : 1;
    loadSurnamesData(Math.floor((start - 1) / ITEMS_PER_PAGE) * ITEMS_PER_PAGE + 1);
}

// Make functions globally accessible for inline onclick handlers
window.toggleLanguage = toggleLanguage;
window.goBackToXingshi = goBackToXingshi;
window.loadPreviousGroup = loadPreviousGroup;
window.loadNextGroup = loadNextGroup;
window.handleTransactionClick = handleTransactionClick;
window.loadSurnamesData = loadSurnamesData;

document.addEventListener('DOMContentLoaded', init);
