// ============================================================
// portfolio.js - Handles the portfolio page, including loading user NFTs, searching, sorting, pagination, and displaying details.
// ============================================================

// Detect dev server (Live Server) and use backend port
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
        const toggle = document.getElementById('lang-switch');
        if (toggle) toggle.textContent = lang === 'zh' ? 'English' : '中文';
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
    document.title = t('portfolio_title') || 'My NFTs';
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
    // Fallback to localStorage
    const wallet = localStorage.getItem('wallet');
    const name = localStorage.getItem('name');
    const phone = localStorage.getItem('phone');
    if (wallet && name) {
        return { walletid: wallet, name: name, phone: phone };
    }
    return null;
}

function clearWalletSession() {
    // Clear localStorage
    localStorage.removeItem('wallet');
    localStorage.removeItem('name');
    localStorage.removeItem('phone');
    localStorage.removeItem('account');
    // Clear wallet-auth session if available
    if (typeof clearWalletLogin === 'function') {
        clearWalletLogin();
    }
}

// ============================================================
// LOGOUT – Properly clears all sessions
// ============================================================
function performLogout() {
    const confirmMsg = t('logout_confirm') || 'Are you sure you want to logout?';
    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        clearWalletSession();                       // Clear all sessions
        // Clear any cached data
        userNFTs = [];
        onSaleNFTs = [];
        pendingSellNFT = null;
        showToast(t('logout_success') || 'Logged out successfully');      // Show toast message

        // Redirect to market page after short delay
        setTimeout(() => {
            window.location.href = '/nft/NFT_market.html';
        }, 800);
    } catch (error) {
        console.error('Logout error:', error);
        showToast(t('logout_error') || 'Logout failed', 'error');
    }
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
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
// PORTFOLIO LOGIC
// ============================================================
let userNFTs = [];
let filteredNFTs = [];  
let onSaleNFTs = [];
let pendingSellNFT = null;
let pendingTransferNFT = null;
let currentPriceInputId = '';
let usingMockData = false;

// ===== FILTER, SEARCH, PAGINATION STATE =====
let currentFilter = 'all';
let currentSearchQuery = '';
let currentPage = 1;
const ITEMS_PER_PAGE = 30; // Number of NFTs to load per batch
let showAllMode = false;

// ============================================================
// MOCK DATA GENERATOR (fallback)
// ============================================================
function generateLongHash() {
    let hash = '';
    for (let i = 0; i < 8; i++) {
        hash += Math.random().toString(16).substring(2, 10);
    }
    return hash.toUpperCase();
}

function getMockNFTs() {
    return [
        {
            level: 'surname',
            surname: 'Architecture',
            card_number: 1,
            purchase_price: 1000,
            hash: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6'
        },
        {
            level: 'surname',
            surname: 'Engineering',
            card_number: 6,
            purchase_price: 800,
            hash: generateLongHash()
        },
        {
            level: 'surname',
            surname: 'Medicine',
            card_number: 8,
            purchase_price: 1200,
            hash: generateLongHash()
        },
        {
            level: 'citang',
            surname: 'Architecture',
            card_number: 1,
            citang_number: 101,
            citang_name: 'Department of Architecture',
            purchase_price: 500,
            province: 'Hong Kong',
            district: 'Main Campus',
            hash: generateLongHash()
        },
        {
            level: 'citang',
            surname: 'Engineering',
            card_number: 6,
            citang_number: 601,
            citang_name: 'Department of Civil Engineering',
            purchase_price: 600,
            province: 'Hong Kong',
            district: 'Main Campus',
            hash: generateLongHash()
        },
        {
            level: 'member',
            surname: 'Architecture',
            card_number: 1,
            citang_number: 101,
            citang_name: 'Department of Architecture',
            member_number: 1001,
            member_name: 'Prof. John Smith',
            purchase_price: 200,
            gender: 'Male',
            birth: '1975-03-15',
            hash: generateLongHash()
        }
    ];
}

// ============================================================
// NAVIGATE TO DETAIL PAGE
// ============================================================
function goToDetail(level, card_number, citang_number, member_number) {
    let type, id;
    
    if (level === 'surname' || level === 'category') {
        type = 'category';
        id = card_number;
    } else if (level === 'citang' || level === 'subcategory') {
        type = 'subcategory';
        id = citang_number;
    } else if (level === 'member' || level === 'item') {
        type = 'item';
        id = member_number;
    } else {
        console.warn('Unknown level:', level);
        showToast('Cannot open detail for this NFT type', 'error');
        return;
    }
    
    const url = `/nft/detail.html?type=${type}&id=${id}`;
    window.location.href = url;
}

// ============================================================
// LOAD USER NFTs
// ============================================================
async function loadUserNFTs() {
    const loginInfo = checkLoginStatus();

    if (!loginInfo) {
        // Not logged in – redirect to market
        showToast(t('please_login'), 'warning');
        setTimeout(() => {
            window.location.href = '/nft/NFT_market.html';
        }, 500);
        return;
    }

    // Update user info
    document.getElementById('displayUserName').textContent = loginInfo.name || 'Unknown';
    document.getElementById('displayWallet').textContent = loginInfo.walletid || loginInfo.wallet || 'Unknown';
    document.getElementById('displayPhone').textContent = loginInfo.phone || 'Not set';
    document.getElementById('displayNftCount').textContent = '0';

    try {
        const container = document.getElementById('nft-content');
        container.innerHTML = `<div class="loading">${t('loading_portfolio')}</div>`;

        let wallet = loginInfo.walletid || loginInfo.wallet;
        let userNfts = [];
        let usingMock = false;

        // Try real API
        try {
            const response = await fetch(`${API_BASE}/api/user/nfts?wallet=${wallet}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            userNfts = await response.json();
            console.log('✅ Loaded real user NFTs');
        } catch (apiError) {
            console.warn('⚠️ Failed to fetch user NFTs, using mock fallback:', apiError);
            usingMock = true;
            userNfts = getMockNFTs();
            showToast('⚠️ Using mock data for your NFTs', 'warning');
        }

        usingMockData = usingMock;
        userNFTs = userNfts;

        // Fetch on-sale NFTs
        try {
            const saleResponse = await fetch(`${API_BASE}/api/nfts/onsale`);
            if (saleResponse.ok) {
                onSaleNFTs = await saleResponse.json();
            } else {
                onSaleNFTs = [];
            }
        } catch (e) {
            onSaleNFTs = [];
        }

        // Sort by purchase price (high to low)
        userNFTs.sort((a, b) => {
            const priceA = a.purchase_price || 0;
            const priceB = b.purchase_price || 0;
            return priceB - priceA;
        });

        document.getElementById('displayNftCount').textContent = userNFTs.length;

        // UPDATE FILTER BADGES AND RENDER
        updatePortfolioFilterBadges();
        
        // Reset to first page and apply filter/search
        currentPage = 1;
        currentFilter = 'all';
        currentSearchQuery = '';
        document.querySelectorAll('#portfolio-filter-bar .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === 'all');
        });
        document.getElementById('portfolio-filter-clear').classList.add('hidden');
        document.getElementById('portfolio-search').value = '';
        
        applyFilterAndSearch();

        // Show mock indicator if using mock data
        if (usingMockData) {
            const indicator = document.getElementById('mock-indicator') || document.createElement('div');
            indicator.id = 'mock-indicator';
            indicator.innerHTML = `
                ⚠️ Using mock data (backend API not available)
                <button class="close-mock" onclick="this.parentElement.remove()">✕</button>
            `;
            const controls = document.querySelector('.portfolio-controls');
            if (controls && !document.getElementById('mock-indicator')) {
                controls.parentNode.insertBefore(indicator, controls);
            }
        } else {
            const existing = document.getElementById('mock-indicator');
            if (existing) existing.remove();
        }

    } catch (error) {
        console.error('Loading NFTs failed:', error);
        document.getElementById('nft-content').innerHTML =
            `<div class="loading">${t('load_error')}: ${error.message}</div>`;
    }
}

// ===== RENDER CARDS =====
function renderSurnameCard(nft) {
    const isOnSale = onSaleNFTs.some(s => s.level === nft.level && s.card_number === nft.card_number && s.surname === nft.surname);
    const saleInfo = onSaleNFTs.find(s => s.level === nft.level && s.card_number === nft.card_number && s.surname === nft.surname);
    const displayHash = nft.hash || t('no_hash');
    const purchasePrice = nft.purchase_price || 0;
    const levelTag = `#${nft.card_number}`;

    // Helper to escape strings for HTML attributes
    const esc = (str) => escapeHtml(str || '').replace(/'/g, "\\'");

    return `
        <div class="card-container">
            <div class="card-body">
                <div class="card-info">
                    <span class="card-number-tag">${levelTag}</span>
                    <div class="card-main-name">${escapeHtml(nft.surname)}</div>
                    <div class="card-details">
                        <span><span class="label">${t('level_label')}: </span>${t('surname')}</span>
                        <span><span class="label">${t('purchase_price')}: </span>${purchasePrice} RC</span>
                    </div>
                </div>
                <div class="card-qr-section">
                    <div class="qr-wrapper">
                        <div class="qrcode" id="qr-surname-${nft.card_number}" data-content="${nft.shortlink || nft.hash || ''}"></div>
                    </div>
                    <div class="nft-hash">${formatNft(displayHash)}</div>
                </div>
            </div>
            <div class="card-footer-actions">
                <span class="price-display">💰 <span class="rc">${purchasePrice} RC</span></span>
                <div class="btn-group">
                    <div class="btn-row">
                        <button class="btn-sm btn-sm-detail" onclick="goToDetail('${nft.level}', ${nft.card_number}, null, null)">
                            ${t('view_detail') || 'View Detail'}
                        </button>
                        <button class="btn-sm btn-sm-transaction" onclick="viewTransactionHistory('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', null, '', null, '')">
                            ${t('view_transactions')}
                        </button>
                        <button class="btn-sm btn-sm-transfer" onclick="openTransferModal('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', null, '', null, '')">
                            ${t('transfer')}
                        </button>
                    </div>
                    <div class="btn-row">
                        ${isOnSale ? `
                            <span class="price-info-tag">${t('selling_price')}: <span class="value">${saleInfo?.price || 0} RC</span></span>
                            <button class="btn-sm btn-sm-cancel" onclick="cancelSale('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', null, '', null, '')">
                                ${t('cancel_sale')}
                            </button>
                        ` : `
                            <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="${t('enter_price')}" min="1">
                            <button class="btn-sm btn-sm-sell" onclick="sellNFT('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', null, '', null, '')">
                                ${t('list_for_sale')}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderCitangCard(nft) {
    const isOnSale = onSaleNFTs.some(s =>
        s.level === nft.level && s.card_number === nft.card_number &&
        s.surname === nft.surname && s.citang_number === nft.citang_number
    );
    const saleInfo = onSaleNFTs.find(s =>
        s.level === nft.level && s.card_number === nft.card_number &&
        s.surname === nft.surname && s.citang_number === nft.citang_number
    );
    const displayHash = nft.hash || t('no_hash');
    const purchasePrice = nft.purchase_price || 0;
    const levelTag = `#${nft.card_number}.${nft.citang_number}`;

    // Helper to escape strings for HTML attributes
    const esc = (str) => escapeHtml(str || '').replace(/'/g, "\\'");

    return `
        <div class="card-container">
            <div class="card-body">
                <div class="card-info">
                    <span class="card-number-tag">${levelTag}</span>
                    <div class="card-main-name">${escapeHtml(nft.surname)}</div>
                    <div class="card-sub-name">${escapeHtml(nft.citang_name)}</div>
                    <div class="card-details">
                        <span><span class="label">${t('province')}: </span>${nft.province || '—'}</span>
                        <span><span class="label">${t('district')}: </span>${nft.district || '—'}</span>
                        <span><span class="label">${t('purchase_price')}: </span>${purchasePrice} RC</span>
                    </div>
                </div>
                <div class="card-qr-section">
                    <div class="qr-wrapper">
                        <div class="qrcode" id="qr-citang-${nft.card_number}-${nft.citang_number}" data-content="${nft.shortlink || nft.hash || ''}"></div>
                    </div>
                    <div class="nft-hash">${formatNft(displayHash)}</div>
                </div>
            </div>
            <div class="card-footer-actions">
                <span class="price-display">💰 <span class="rc">${purchasePrice} RC</span></span>
                <div class="btn-group">
                    <div class="btn-row">
                        <button class="btn-sm btn-sm-detail" onclick="goToDetail('${nft.level}', ${nft.card_number}, ${nft.citang_number}, null)">
                            ${t('view_detail') || 'View Detail'}
                        </button>
                        <button class="btn-sm btn-sm-transaction" onclick="viewTransactionHistory('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', null, '')">
                            ${t('view_transactions')}
                        </button>
                        <button class="btn-sm btn-sm-transfer" onclick="openTransferModal('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', null, '')">
                            ${t('transfer')}
                        </button>
                    </div>
                    <div class="btn-row">
                        ${isOnSale ? `
                            <span class="price-info-tag">${t('selling_price')}: <span class="value">${saleInfo?.price || 0} RC</span></span>
                            <button class="btn-sm btn-sm-cancel" onclick="cancelSale('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', null, '')">
                                ${t('cancel_sale')}
                            </button>
                        ` : `
                            <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="${t('enter_price')}" min="1">
                            <button class="btn-sm btn-sm-sell" onclick="sellNFT('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', null, '')">
                                ${t('list_for_sale')}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderMemberCard(nft) {
    const isOnSale = onSaleNFTs.some(s =>
        s.level === nft.level && s.card_number === nft.card_number &&
        s.surname === nft.surname && s.citang_number === nft.citang_number &&
        s.member_number === nft.member_number
    );
    const saleInfo = onSaleNFTs.find(s =>
        s.level === nft.level && s.card_number === nft.card_number &&
        s.surname === nft.surname && s.citang_number === nft.citang_number &&
        s.member_number === nft.member_number
    );
    const displayHash = nft.hash || t('no_hash');
    const purchasePrice = nft.purchase_price || 0;
    const levelTag = `#${nft.card_number}.${nft.citang_number}.${nft.member_number}`;

    // Helper to escape strings for HTML attributes
    const esc = (str) => escapeHtml(str || '').replace(/'/g, "\\'");

    return `
        <div class="card-container">
            <div class="card-body">
                <div class="card-info">
                    <span class="card-number-tag">${levelTag}</span>
                    <div class="card-main-name">${escapeHtml(nft.surname)}</div>
                    <div class="card-sub-name">${escapeHtml(nft.citang_name)} · ${escapeHtml(nft.member_name)}</div>
                    <div class="card-details">
                        <span><span class="label">${t('gender')}: </span>${nft.gender || '—'}</span>
                        <span><span class="label">${t('birth')}: </span>${nft.birth || '—'}</span>
                        <span><span class="label">${t('purchase_price')}: </span>${purchasePrice} RC</span>
                    </div>
                </div>
                <div class="card-qr-section">
                    <div class="qr-wrapper">
                        <div class="qrcode" id="qr-member-${nft.card_number}-${nft.citang_number}-${nft.member_number}" data-content="${nft.shortlink || nft.hash || ''}"></div>
                    </div>
                    <div class="nft-hash">${formatNft(displayHash)}</div>
                </div>
            </div>
            <div class="card-footer-actions">
                <span class="price-display">💰 <span class="rc">${purchasePrice} RC</span></span>
                <div class="btn-group">
                    <div class="btn-row">
                        <button class="btn-sm btn-sm-detail" onclick="goToDetail('${nft.level}', ${nft.card_number}, ${nft.citang_number}, ${nft.member_number})">
                            ${t('view_detail') || 'View Detail'}
                        </button>
                        <button class="btn-sm btn-sm-transaction" onclick="viewTransactionHistory('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', ${nft.member_number}, '${esc(nft.member_name)}')">
                            ${t('view_transactions')}
                        </button>
                        <button class="btn-sm btn-sm-transfer" onclick="openTransferModal('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', ${nft.member_number}, '${esc(nft.member_name)}')">
                            ${t('transfer')}
                        </button>
                    </div>
                    <div class="btn-row">
                        ${isOnSale ? `
                            <span class="price-info-tag">${t('selling_price')}: <span class="value">${saleInfo?.price || 0} RC</span></span>
                            <button class="btn-sm btn-sm-cancel" onclick="cancelSale('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', ${nft.member_number}, '${esc(nft.member_name)}')">
                                ${t('cancel_sale')}
                            </button>
                        ` : `
                            <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="${t('enter_price')}" min="1">
                            <button class="btn-sm btn-sm-sell" onclick="sellNFT('${nft.level}', ${nft.card_number}, '${esc(nft.surname)}', ${nft.citang_number}, '${esc(nft.citang_name)}', ${nft.member_number}, '${esc(nft.member_name)}')">
                                ${t('list_for_sale')}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>`;
}


// ===== UTILITY FUNCTIONS =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNft(nft) {
    if (!nft) return '';
    return nft.match(/.{1,16}/g)?.join('<br>') || nft;
}

function generateAllQRCodes(nfts) { 
    nfts.forEach(nft => {
        let id = '';
        if (nft.level === 'category' || nft.level === 'surname') {
            id = `qr-surname-${nft.card_number}`;
        } else if (nft.level === 'subcategory' || nft.level === 'citang') {
            id = `qr-citang-${nft.card_number}-${nft.citang_number}`;
        } else {
            id = `qr-member-${nft.card_number}-${nft.citang_number}-${nft.member_number}`;
        }
        
        const el = document.getElementById(id);
        if (el && el.innerHTML.trim() === '') {
            // Use shortlink if available, otherwise use hash
            const content = el.dataset.content || nft.shortlink || nft.hash || '';
            if (content) {
                const size = window.innerWidth <= 480 ? 100 : 130;
                new QRCode(el, {
                    text: content,
                    width: size,
                    height: size,
                    colorDark: '#003153',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
                // Ensure canvas fills the container
                const canvas = el.querySelector('canvas');
                if (canvas) {
                    canvas.style.width = '100%';
                    canvas.style.height = '100%';
                    canvas.style.display = 'block';
                }
            } else {
                el.innerHTML = `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;text-align:center;">No QR</div>`;
            }
        }
    });
}

function viewTransactionHistory(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    let url = '';
    switch (level) {
        case 'surname':
            url = `/nft/ti_log.html?name=${encodeURIComponent(surname)}&card_number=${card_number}`;
            break;
        case 'citang':
            url = `/nft/ti_log.html?level=citang&id=${citang_number}`;
            break;
        case 'member':
            url = `/nft/ti_log.html?level=member&id=${member_number}`;
            break;
    }
    if (url) window.location.href = url;
}

function getLevelName(level) {
    const names = { surname: 'Category', citang: 'Subcategory', member: 'Item' };
    return names[level] || level;
}

// ===== UPDATE FILTER BADGES =====
function updatePortfolioFilterBadges() {
    const counts = { all: userNFTs.length, category: 0, subcategory: 0, item: 0 };
    
    userNFTs.forEach(nft => {
        if (nft.level === 'category' || nft.level === 'surname') {
            counts.category++;
        } else if (nft.level === 'subcategory' || nft.level === 'citang') {
            counts.subcategory++;
        } else if (nft.level === 'item' || nft.level === 'member') {
            counts.item++;
        }
    });
    
    for (const [key, count] of Object.entries(counts)) {
        const badge = document.getElementById(`pcount-${key}`);
        if (badge) badge.textContent = count;
    }
}

// ===== RENDER NFTs =====
function renderNFTs(nftsToRender) {
    const container = document.getElementById('nft-content');
    
    // Clear loading indicator
    container.innerHTML = '';

    if (!nftsToRender || nftsToRender.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🖼️</div>
            <h3>${t('no_nfts_portfolio')}</h3>
            <p>${t('no_nfts_desc')}</p>
            ${currentSearchQuery ? `<p style="color:#888;font-size:0.9rem;">Try adjusting your search or filters.</p>` : ''}
        </div>`;
        return;
    }

    // Render each NFT card
    const gridHTML = nftsToRender.map(nft => {
        switch (nft.level) {
            case 'category':
            case 'surname':
                return renderSurnameCard(nft);
            case 'subcategory':
            case 'citang':
                return renderCitangCard(nft);
            case 'item':
            case 'member':
                return renderMemberCard(nft);
            default:
                console.warn('Unknown level:', nft.level);
                return '';
        }
    }).join('');

    container.innerHTML = `
        <div class="category-section">
            <div class="category-title">${t('my_nfts') || 'My NFTs'} (${filteredNFTs.length})</div>
            <div class="member-grid" id="nft-grid">
                ${gridHTML}
            </div>
        </div>
    `;

    // Generate QR codes after DOM update
    setTimeout(() => generateAllQRCodes(nftsToRender), 100);
}

// ============================================================
// FILTER, SEARCH, AND PAGINATION (matches categories page)
// ============================================================

function applyPortfolioFilter(filterKey) {
    currentFilter = filterKey;
    currentPage = 1;

    // Update active state on buttons
    document.querySelectorAll('#portfolio-filter-bar .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterKey);
    });

    // Show/hide clear button
    const clearBtn = document.getElementById('portfolio-filter-clear');
    if (filterKey === 'all') {
        clearBtn.classList.add('hidden');
    } else {
        clearBtn.classList.remove('hidden');
    }

    applyFilterAndSearch();
}

function clearPortfolioFilter() {
    applyPortfolioFilter('all');
}

function applyFilterAndSearch() {
    // Start with all NFTs
    let result = [...userNFTs];

    // Apply filter by level
    if (currentFilter !== 'all') {
        const levelMap = {
            'category': ['category', 'surname'],
            'subcategory': ['subcategory', 'citang'],
            'item': ['item', 'member']
        };
        const levels = levelMap[currentFilter] || [];
        result = result.filter(nft => levels.includes(nft.level));
    }

    // Apply search by name
    if (currentSearchQuery.trim() !== '') {
        const query = currentSearchQuery.trim().toLowerCase();
        result = result.filter(nft => {
            const name = nft.surname || nft.citang_name || nft.member_name || '';
            const nameZh = nft.surname_zh || nft.citang_name_zh || nft.member_name_zh || '';
            return name.toLowerCase().includes(query) ||
                   nameZh.toLowerCase().includes(query) ||
                   (nft.member_name && nft.member_name.toLowerCase().includes(query));
        });
    }

    filteredNFTs = result;
    currentPage = 1; // Reset to first page when filtering
    
    // Update search status
    const searchStatus = document.getElementById('portfolio-search-status');
    if (searchStatus) {
        if (currentSearchQuery.trim() !== '') {
            searchStatus.textContent = filteredNFTs.length ?
                `Search results: ${filteredNFTs.length}` :
                'No results found.';
        } else {
            searchStatus.textContent = '';
        }
    }
    
    updateResultsInfo();
    renderPagination();
    renderCurrentPage();
}

function getCurrentPageItems() {
    if (showAllMode) return filteredNFTs;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, filteredNFTs.length);
    return filteredNFTs.slice(start, end);
}

function getTotalPages() {
    if (showAllMode) return 1;
    return Math.ceil(filteredNFTs.length / ITEMS_PER_PAGE) || 1;
}

function updateResultsInfo() {
    const total = filteredNFTs.length;
    const start = showAllMode ? 1 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = showAllMode ? total : Math.min(currentPage * ITEMS_PER_PAGE, total);

    // Update all info elements
    document.querySelectorAll('#results-start, #showing-start-portfolio, #showing-start-portfolio-bottom').forEach(el => {
        if (el) el.textContent = total > 0 ? start : 0;
    });
    document.querySelectorAll('#results-end, #showing-end-portfolio, #showing-end-portfolio-bottom').forEach(el => {
        if (el) el.textContent = total > 0 ? end : 0;
    });
    document.querySelectorAll('#results-total, #total-count-portfolio, #total-count-portfolio-bottom').forEach(el => {
        if (el) el.textContent = total;
    });
}

function renderPagination() {
    const totalPages = getTotalPages();
    const total = filteredNFTs.length;

    // Update page info
    const containers = document.querySelectorAll('#page-numbers-portfolio, #page-numbers-portfolio-bottom');
    const prevBtns = document.querySelectorAll('#prev-page-portfolio, #prev-page-portfolio-bottom');
    const nextBtns = document.querySelectorAll('#next-page-portfolio, #next-page-portfolio-bottom');

    containers.forEach(container => {
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

    // Update prev/next buttons
    prevBtns.forEach(btn => {
        if (btn) btn.disabled = currentPage <= 1 || showAllMode;
    });
    nextBtns.forEach(btn => {
        if (btn) btn.disabled = currentPage >= totalPages || showAllMode;
    });

    // Update Show All button
    const showAllBtn = document.getElementById('show-all-portfolio');
    if (showAllBtn) {
        showAllBtn.classList.toggle('active', showAllMode);
        showAllBtn.textContent = showAllMode ? 'Show Pages' : 'Show All';
    }
}

function goToPage(page) {
    if (showAllMode) return;
    const totalPages = getTotalPages();
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updateResultsInfo();
    renderPagination();
    renderCurrentPage();
}

function toggleShowAll() {
    showAllMode = !showAllMode;
    if (showAllMode) {
        currentPage = 1;
    }
    updateResultsInfo();
    renderPagination();
    renderCurrentPage();
}

function renderCurrentPage() {
    const pageItems = getCurrentPageItems();
    renderNFTs(pageItems);
}

// ============================================================
// SELL NFT
// ============================================================
async function sellNFT(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        showToast(t('please_login'), 'warning');
        return;
    }

    currentPriceInputId = `price-${level}-${card_number}`;
    const priceInput = document.getElementById(currentPriceInputId);
    const price = parseInt(priceInput.value) || 0;

    if (price < 1) {
        showToast(t('invalid_price'), 'warning');
        priceInput.focus();
        return;
    }

    const nft = userNFTs.find(item =>
        item.level === level &&
        item.card_number === card_number &&
        item.surname === surname &&
        item.citang_number === citang_number &&
        item.citang_name === citang_name &&
        item.member_number === member_number &&
        item.member_name === member_name
    );

    if (!nft) {
        showToast(t('nft_not_found'), 'error');
        return;
    }

    pendingSellNFT = { ...nft, price: price };

    document.getElementById('confirmLevel').textContent = getLevelName(pendingSellNFT.level);
    document.getElementById('confirmSurname').textContent = pendingSellNFT.surname;
    document.getElementById('confirmPrice').textContent = `${pendingSellNFT.price} ${t('root_coins')}`;

    let numberText = '';
    if (pendingSellNFT.level === 'surname') {
        numberText = `#${pendingSellNFT.card_number}`;
    } else if (pendingSellNFT.level === 'citang') {
        numberText = `#${pendingSellNFT.card_number}.${pendingSellNFT.citang_number}`;
    } else {
        numberText = `#${pendingSellNFT.card_number}.${pendingSellNFT.citang_number}.${pendingSellNFT.member_number}`;
    }
    document.getElementById('confirmNumber').textContent = numberText;

    const citangRow = document.getElementById('confirmCitangRow');
    const citangSpan = document.getElementById('confirmCitang');
    if (pendingSellNFT.level === 'citang' || pendingSellNFT.level === 'member') {
        citangRow.style.display = 'flex';
        citangSpan.textContent = pendingSellNFT.citang_name || '-';
    } else {
        citangRow.style.display = 'none';
    }

    const memberRow = document.getElementById('confirmMemberRow');
    const memberSpan = document.getElementById('confirmMember');
    if (pendingSellNFT.level === 'member') {
        memberRow.style.display = 'flex';
        memberSpan.textContent = pendingSellNFT.member_name || '-';
    } else {
        memberRow.style.display = 'none';
    }

    const nftHashSpan = document.getElementById('confirmNftHash');
    nftHashSpan.textContent = pendingSellNFT.hash || 'No hash';

    document.getElementById('sellConfirmModal').style.display = 'block';
}

function hideSellConfirmModal() {
    document.getElementById('sellConfirmModal').style.display = 'none';
    pendingSellNFT = null;
    currentPriceInputId = '';
}

async function proceedSell() {
    if (!pendingSellNFT) {
        showToast(t('nft_not_found'), 'error');
        hideSellConfirmModal();
        return;
    }

    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        showToast(t('please_login'), 'warning');
        hideSellConfirmModal();
        return;
    }

    try {
        const wallet = loginInfo.walletid || loginInfo.wallet;
        const response = await fetch(`${API_BASE}/api/nft/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: pendingSellNFT.level,
                card_number: pendingSellNFT.card_number,
                surname: pendingSellNFT.surname,
                citang_number: pendingSellNFT.citang_number || '',
                citang_name: pendingSellNFT.citang_name || '',
                member_number: pendingSellNFT.member_number || '',
                member_name: pendingSellNFT.member_name || '',
                price: pendingSellNFT.price,
                seller_wallet: wallet,
                hash: pendingSellNFT.hash || ''
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(t('list_success'), 'success');
            hideSellConfirmModal();

            if (currentPriceInputId) {
                const priceInput = document.getElementById(currentPriceInputId);
                if (priceInput) priceInput.value = '';
            }

            loadUserNFTs();
        } else {
            showToast(t('list_failed') + ': ' + result.error, 'error');
        }
    } catch (error) {
        console.error('List failed:', error);
        showToast(t('list_failed') + ': ' + error.message, 'error');
    }
}

// ============================================================
// CANCEL SALE
// ============================================================
async function cancelSale(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    if (!confirm(t('confirm_cancel_sale'))) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/nft/cancel-sale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level,
                card_number,
                surname,
                citang_number,
                citang_name,
                member_number,
                member_name
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(t('cancel_sale_success'), 'success');
            loadUserNFTs();
        } else {
            showToast(t('cancel_sale_failed') + ': ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Cancel failed:', error);
        showToast(t('cancel_sale_failed') + ': ' + error.message, 'error');
    }
}

// ============================================================
// TRANSFER NFT
// ============================================================
function openTransferModal(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        showToast(t('please_login'), 'warning');
        return;
    }

    const nft = userNFTs.find(item =>
        item.level === level &&
        item.card_number === card_number &&
        item.surname === surname &&
        item.citang_number === citang_number &&
        item.citang_name === citang_name &&
        item.member_number === member_number &&
        item.member_name === member_name
    );

    if (!nft) {
        showToast(t('nft_not_found'), 'error');
        return;
    }

    pendingTransferNFT = nft;

    document.getElementById('transferLevel').textContent = getLevelName(pendingTransferNFT.level);
    document.getElementById('transferSurname').textContent = pendingTransferNFT.surname;

    let numberText = '';
    if (pendingTransferNFT.level === 'surname') {
        numberText = `#${pendingTransferNFT.card_number}`;
    } else if (pendingTransferNFT.level === 'citang') {
        numberText = `#${pendingTransferNFT.card_number}.${pendingTransferNFT.citang_number}`;
    } else {
        numberText = `#${pendingTransferNFT.card_number}.${pendingTransferNFT.citang_number}.${pendingTransferNFT.member_number}`;
    }
    document.getElementById('transferNumber').textContent = numberText;

    const citangRow = document.getElementById('transferCitangRow');
    const citangSpan = document.getElementById('transferCitang');
    if (pendingTransferNFT.level === 'citang' || pendingTransferNFT.level === 'member') {
        citangRow.style.display = 'flex';
        citangSpan.textContent = pendingTransferNFT.citang_name || '-';
    } else {
        citangRow.style.display = 'none';
    }

    const memberRow = document.getElementById('transferMemberRow');
    const memberSpan = document.getElementById('transferMember');
    if (pendingTransferNFT.level === 'member') {
        memberRow.style.display = 'flex';
        memberSpan.textContent = pendingTransferNFT.member_name || '-';
    } else {
        memberRow.style.display = 'none';
    }

    document.getElementById('transferNftHash').textContent = pendingTransferNFT.hash || 'No hash';
    document.getElementById('transferRecipient').value = '';

    document.getElementById('transferModal').style.display = 'block';
}

function hideTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
    pendingTransferNFT = null;
}

async function proceedTransfer() {
    if (!pendingTransferNFT) {
        showToast(t('nft_not_found'), 'error');
        hideTransferModal();
        return;
    }

    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        showToast(t('please_login'), 'warning');
        hideTransferModal();
        return;
    }

    const recipient = document.getElementById('transferRecipient').value.trim();
    if (!recipient || recipient.length !== 64 || !/^[A-F0-9]{64}$/i.test(recipient)) {
        showToast(t('invalid_recipient'), 'error');
        return;
    }

    // Check not sending to self
    if (recipient.toLowerCase() === loginInfo.walletid.toLowerCase()) {
        showToast(t('cannot_transfer_self'), 'error');
        return;
    }

    try {
        const wallet = loginInfo.walletid || loginInfo.wallet;
        const response = await fetch(`${API_BASE}/api/nft/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: pendingTransferNFT.level,
                card_number: pendingTransferNFT.card_number,
                surname: pendingTransferNFT.surname,
                citang_number: pendingTransferNFT.citang_number || '',
                citang_name: pendingTransferNFT.citang_name || '',
                member_number: pendingTransferNFT.member_number || '',
                member_name: pendingTransferNFT.member_name || '',
                from_wallet: wallet,
                to_wallet: recipient,
                hash: pendingTransferNFT.hash || ''
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(t('transfer_success'), 'success');
            hideTransferModal();
            loadUserNFTs();
        } else {
            showToast(t('transfer_failed') + ': ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Transfer failed:', error);
        showToast(t('transfer_failed') + ': ' + error.message, 'error');
    }
}

// ============================================================
// WALLET LOGIN EVENTS
// ============================================================
document.addEventListener('wallet-login-success', (e) => {
    const detail = e.detail;
    if (detail && detail.walletid) {
        showToast(t('login_success'), 'success');
        loadUserNFTs();
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
}

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    loadUserNFTs();

    // Listen for logout from other tabs/windows
    window.addEventListener('storage', (e) => {
        if (e.key === 'wallet' && !e.newValue) {
            // Logged out in another tab
            window.location.href = '/nft/NFT_market.html';
        }
    });
    initBackToTop();

    // ===== SEARCH =====
    const searchInput = document.getElementById('portfolio-search');
    if (searchInput) {
        // Debounced search
        let searchTimer;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                currentSearchQuery = e.target.value;
                applyFilterAndSearch();
            }, 300);
        });
    }

    // ===== SCAN BUTTON =====
    const scanBtn = document.getElementById('portfolio-scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            // You can reuse the QR scan logic from categories.js
            // or implement a simple placeholder
            showToast('QR scan coming soon to portfolio!', 'info');
        });
    }

    // Make functions globally accessible
    window.performLogout = performLogout;
    window.toggleLanguage = toggleLanguage;
    window.hideSellConfirmModal = hideSellConfirmModal;
    window.proceedSell = proceedSell;
    window.sellNFT = sellNFT;
    window.cancelSale = cancelSale;
    window.openTransferModal = openTransferModal;
    window.hideTransferModal = hideTransferModal;
    window.proceedTransfer = proceedTransfer;
    window.viewTransactionHistory = viewTransactionHistory;
}

document.addEventListener('DOMContentLoaded', init);