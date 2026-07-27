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
    document.title = t('market_title') || 'NFT Market';
}

window.toggleLanguage = function() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    loadLanguage(next);
};

// ============================================================
// WALLET AUTH WRAPPER
// ============================================================
function checkLoginStatus() {
    const w = localStorage.getItem('wallet'),
        n = localStorage.getItem('name');
    return (w && n) ? { wallet: w, name: n, account: localStorage.getItem('account') } : null;
}

function clearUserSession() {
    localStorage.removeItem('wallet');
    localStorage.removeItem('name');
    localStorage.removeItem('account');
    userNFTs = [];
    pendingSellActions = [];
    pendingCancelActions = [];
    updateLoginUI();
}

function updateLoginUI() {
    const info = checkLoginStatus();
    document.getElementById('loginBtn').style.display = info ? 'none' : 'inline-block';
    document.getElementById('logoutBtn').style.display = info ? 'inline-block' : 'none';
}

function formatWalletShort(w) {
    if (!w) return 'Unknown';
    return w.length <= 12 ? w : w.slice(0, 6) + '...' + w.slice(-6);
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================================
// ORIGINAL MARKETPLACE LOGIC
// ============================================================
let rawNFTs = [],
    currentSortedNFTs = [],
    currentDetailNFT = null,
    currentBuyNFT = null,
    userNFTs = [],
    pendingSellActions = [],
    pendingCancelActions = [];
let nftDataCache = {},
    citangDetailsCache = {},
    memberDetailsCache = {};

function getFullPhone(type) {
    let countryCode, phoneNumber;
    if (type === 'login') {
        countryCode = document.getElementById('loginCountryCode').value;
        phoneNumber = document.getElementById('loginPhone').value.trim();
    } else {
        countryCode = document.getElementById('buyCountryCode').value;
        phoneNumber = document.getElementById('buyLoginPhone').value.trim();
    }
    if (!phoneNumber) return '';
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    return countryCode + cleanPhone;
}

function setButtonLoading(btn, isLoading, originalText = '') {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('btn-loading');
        if (originalText) btn.dataset.originalText = originalText;
        else if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
        btn.innerHTML = '<span>' + btn.dataset.originalText + '</span>';
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
    }
}

function showCustomToast(msg, type) {
    const t = document.createElement('div');
    t.className = 'custom-toast';
    t.innerHTML =
        `<div class="toast-icon">${type === 'error' ? '❌' : '✅'}</div><div class="toast-message">${msg}</div><div class="toast-close">OK</div>`;
    document.body.appendChild(t);
    t.querySelector('.toast-close').onclick = () => t.remove();
    setTimeout(() => t.remove(), 3000);
}

function setBodyScrollLock(lock) {
    if (lock) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
}

function getDisplayLines(nft) {
    if (nft.level === 'surname') return { surname: nft.surname, citang: null, member: null, isSurnameOnly: true };
    if (nft.level === 'citang') return { surname: nft.surname + '.', citang: nft.citang_name, member: null,
        isSurnameOnly: false };
    return { surname: nft.surname + '.', citang: nft.citang_name + '.', member: nft.member_name,
        isSurnameOnly: false };
}

function getFullDisplayName(nft) {
    if (nft.level === 'surname') return nft.surname;
    if (nft.level === 'citang') return `${nft.surname}.${nft.citang_name}`;
    return `${nft.surname}.${nft.citang_name}.${nft.member_name}`;
}

function getLevelWeightForward(nft) {
    if (nft.level === 'surname') return 1;
    if (nft.level === 'citang') return 2;
    return 3;
}

function getLevelWeightReverse(nft) {
    if (nft.level === 'member') return 1;
    if (nft.level === 'citang') return 2;
    return 3;
}

function sortNFTs(type, list) {
    let sorted = [...list];
    if (type === 'price-desc') sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (type === 'price-asc') sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (type === 'pinyin') sorted.sort((a, b) => getFullDisplayName(a).localeCompare(getFullDisplayName(b),
        'zh-CN'));
    else if (type === 'level') sorted.sort((a, b) => {
        let w = getLevelWeightForward(a) - getLevelWeightForward(b);
        if (w !== 0) return w;
        return getFullDisplayName(a).localeCompare(getFullDisplayName(b), 'zh-CN');
    });
    else if (type === 'level-reverse') sorted.sort((a, b) => {
        let w = getLevelWeightReverse(a) - getLevelWeightReverse(b);
        if (w !== 0) return w;
        return getFullDisplayName(a).localeCompare(getFullDisplayName(b), 'zh-CN');
    });
    return sorted;
}

function renderMarketCards(nfts) {
    const container = document.getElementById('market-content');
    if (!nfts || !nfts.length) {
        container.innerHTML = `<div class="loading">✨ ${t('no_nfts_on_sale')}</div>`;
        return;
    }
    let html = '<div class="market-grid">';
    nfts.forEach(nft => {
        const lines = getDisplayLines(nft);
        const isSurnameOnly = lines.isSurnameOnly;
        const surnameClass = isSurnameOnly ? 'surname-only' : '';
        const price = nft.price || 0;
        let inner = '';
        if (isSurnameOnly) inner =
            `<div class="name-line surname-line">${escapeHtml(lines.surname)}</div>`;
        else {
            inner =
                `<div class="name-line surname-line">${escapeHtml(lines.surname)}</div><div class="name-line citang-line">${escapeHtml(lines.citang)}</div>`;
            if (lines.member) inner +=
                `<div class="name-line member-line">${escapeHtml(lines.member)}</div>`;
        }
        inner += `<div class="price-line"><i class="fas fa-coins" style="font-size: 0.8rem;"></i>rc:${price}</div>`;
        html +=
            `<div class="nft-name-card ${surnameClass}" onclick="showNFTDetailByIndex(${rawNFTs.findIndex(n => n.card_number === nft.card_number && n.level === nft.level && n.surname === nft.surname && (n.citang_number || '') === (nft.citang_number || '') && (n.member_number || '') === (nft.member_number || ''))})">${inner}</div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function applySortAndRender(type) {
    if (!rawNFTs.length) return;
    currentSortedNFTs = sortNFTs(type, rawNFTs);
    renderMarketCards(currentSortedNFTs);
    document.querySelectorAll('.sort-btn').forEach(btn => {
        if (btn.dataset.sort === type) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

async function loadOnSaleNFTs() {
    try {
        const res = await fetch('/api/nfts/onsale');
        const nfts = await res.json();
        const sorted = nfts.sort((a, b) => a.price - b.price);
        const enriched = await Promise.all(sorted.map(async nft => {
            let nftValue = nft.nft_hash;
            if (!nftValue) nftValue = await getNFTData(nft);
            let add = {};
            if (nft.level === 'citang') add = await getCitangDetails(nft);
            if (nft.level === 'member') add = await getMemberDetails(nft);
            return { ...nft, nftValue, ...add };
        }));
        rawNFTs = enriched;
        applySortAndRender('price-desc');
    } catch (e) {
        document.getElementById('market-content').innerHTML =
            `<div class="loading">❌ ${t('load_error')}</div>`;
    }
}

async function getNFTData(nft) {
    const key =
        `${nft.level}_${nft.card_number}_${nft.citang_number || ''}_${nft.member_number || ''}`;
    if (nftDataCache[key]) return nftDataCache[key];
    let url = '';
    if (nft.level === 'surname') url = `/citang-data/${nft.card_number}${nft.surname}/content.json`;
    else if (nft.level === 'citang') url =
        `/citang-data/${nft.card_number}${nft.surname}/${nft.citang_number}${nft.citang_name}/citang.json`;
    else url =
        `/citang-data/${nft.card_number}${nft.surname}/${nft.citang_number}${nft.citang_name}/${nft.member_number}${nft.member_name}/${nft.member_number}${nft.member_name}.json`;
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        const d = await r.json();
        const val = nft.level === 'surname' ? (d.nft || d.hash) : (d.hash || d.nft);
        nftDataCache[key] = val || '';
        return val || '';
    } catch (e) {
        return nft.hash || '';
    }
}

async function getCitangDetails(nft) {
    const key = `citang_${nft.card_number}_${nft.citang_number}`;
    if (citangDetailsCache[key]) return citangDetailsCache[key];
    const url =
        `/citang-data/${nft.card_number}${nft.surname}/${nft.citang_number}${nft.citang_name}/citang.json`;
    try {
        const r = await fetch(url);
        if (!r.ok) return {};
        const d = await r.json();
        const details = { province: d.province || '', district: d.district || '' };
        citangDetailsCache[key] = details;
        return details;
    } catch (e) {
        return {};
    }
}

async function getMemberDetails(nft) {
    const key = `member_${nft.card_number}_${nft.citang_number}_${nft.member_number}`;
    if (memberDetailsCache[key]) return memberDetailsCache[key];
    const url =
        `/citang-data/${nft.card_number}${nft.surname}/${nft.citang_number}${nft.citang_name}/${nft.member_number}${nft.member_name}/${nft.member_number}${nft.member_name}.json`;
    try {
        const r = await fetch(url);
        if (!r.ok) return {};
        const d = await r.json();
        const details = { gender: d.gender || 'Unknown', birth: d.birth || 'Unknown' };
        memberDetailsCache[key] = details;
        return details;
    } catch (e) {
        return {};
    }
}

function showNFTDetailByIndex(idx) {
    if (idx >= 0 && rawNFTs[idx]) showNFTDetail(rawNFTs[idx]);
    else showCustomToast('NFT not found', 'error');
}

function showNFTDetail(nft) {
    currentDetailNFT = nft;
    document.getElementById('detailCardContainer').innerHTML = renderFullCard(nft);
    document.getElementById('nftDetailModal').style.display = 'block';
    setBodyScrollLock(true);
    setTimeout(() => generateQRCodeForDetail(nft), 100);
}

function renderFullCard(nft) {
    let qrId = '';
    if (nft.level === 'surname') qrId = `qr-detail-${nft.card_number}`;
    else if (nft.level === 'citang') qrId = `qr-detail-${nft.card_number}-${nft.citang_number}`;
    else qrId = `qr-detail-${nft.card_number}-${nft.citang_number}-${nft.member_number}`;
    const hashFmt = (nft.nftValue || '').match(/.{1,16}/g)?.join('<br>') || 'None';
    if (nft.level === 'surname') return `<div class="card-surname"><div class="card-inner"><div><h1 class="member-name" style="font-size:3.2rem;">${nft.surname}</h1></div><div class="qr-section"><div class="qr-wrapper"><div class="qrcode" id="${qrId}"></div></div><div class="nft-background">${hashFmt}</div></div></div><div class="button-section"><button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}','${nft.card_number}','${nft.surname}')">${t('view_transactions')}</button><div><span class="price-display">${t('root_coins')}: ${nft.price}</span><span class="card-number-tag">#${nft.card_number}</span></div></div></div>`;
    if (nft.level === 'citang') return `<div class="card-citang"><div class="card-inner"><div><span class="card-number-tag">#${nft.card_number}.${nft.citang_number}</span><h1 class="member-name" style="font-size:1.5rem;">${nft.surname}.</h1><h1 class="member-name" style="font-size:2rem;">${nft.citang_name}</h1><div class="member-details">${t('province')}: ${nft.province || 'Unknown'}</div><div class="member-details">${t('district')}: ${nft.district || 'Unknown'}</div></div><div class="qr-section"><div class="qr-wrapper"><div class="qrcode" id="${qrId}"></div></div><div class="nft-background">${hashFmt}</div></div></div><div class="button-section"><button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}','${nft.card_number}','${nft.surname}','${nft.citang_number}','${nft.citang_name}')">${t('view_transactions')}</button><div><span class="price-display">${t('root_coins')}: ${nft.price}</span></div></div></div>`;
    return `<div class="card-member"><div class="card-inner"><div><span class="card-number-tag">#${nft.card_number}.${nft.citang_number}.${nft.member_number}</span><h1 class="member-name" style="font-size:1.3rem;">${nft.surname}.</h1><h1 class="member-name" style="font-size:1.3rem;">${nft.citang_name}.</h1><div class="member-name">${nft.member_name}</div><div class="member-details">${t('gender')}: ${nft.gender || 'Unknown'}</div><div class="member-details">${t('birth')}: ${nft.birth || 'Unknown'}</div></div><div class="qr-section"><div class="qr-wrapper"><div class="qrcode" id="${qrId}"></div></div><div class="nft-background">${hashFmt}</div></div></div><div class="button-section"><button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}','${nft.card_number}','${nft.surname}','${nft.citang_number}','${nft.citang_name}','${nft.member_number}','${nft.member_name}')">${t('view_transactions')}</button><div><span class="price-display">${t('root_coins')}: ${nft.price}</span></div></div></div>`;
}

function generateQRCodeForDetail(nft) {
    let qrId = '';
    if (nft.level === 'surname') qrId = `qr-detail-${nft.card_number}`;
    else if (nft.level === 'citang') qrId = `qr-detail-${nft.card_number}-${nft.citang_number}`;
    else qrId = `qr-detail-${nft.card_number}-${nft.citang_number}-${nft.member_number}`;
    const el = document.getElementById(qrId);
    if (el && nft.nftValue && el.innerHTML.trim() === '') new QRCode(el, { text: nft.nftValue, width: 130,
        height: 130, correctLevel: QRCode.CorrectLevel.L });
}

function viewTransactionHistory(level, card_number, surname, citang_number = '', citang_name = '',
    member_number = '', member_name = '') {
    let url = '';
    if (level === 'surname') url =
        `/ti_log.html?name=${encodeURIComponent(surname)}&card_number=${card_number}`;
    else if (level === 'citang') url =
        `/ti_log.html?level=citang&id=${citang_number}`;
    else url =
        `/ti_log.html?level=member&id=${member_number}`;
    if (url) window.location.href = url;
}

function buyFromDetail() {
    if (currentDetailNFT) showBuyModal(currentDetailNFT);
    else showCustomToast('Please select an NFT', 'warning');
}

function showBuyModal(nft) {
    const info = checkLoginStatus();
    if (!info) {
        currentBuyNFT = nft;
        document.getElementById('buyModal').style.display = 'block';
        setBodyScrollLock(true);
        showBuyLoginSection();
        return;
    }
    if (nft.seller === info.wallet) {
        showCustomToast('⚠️ This is your own NFT, cannot purchase', 'warning');
        return;
    }
    currentBuyNFT = nft;
    document.getElementById('buyModal').style.display = 'block';
    setBodyScrollLock(true);
    showBuyConfirmSection();
}

function showBuyLoginSection() {
    document.getElementById('buyLoginSection').style.display = 'block';
    document.getElementById('buyConfirmSection').style.display = 'none';
}

function showBuyConfirmSection() {
    document.getElementById('buyLoginSection').style.display = 'none';
    document.getElementById('buyConfirmSection').style.display = 'block';
    const info = checkLoginStatus();
    if (info) document.getElementById('buyWalletAddress').innerText = formatWalletShort(info.wallet);
    document.getElementById('buyPriceDisplay').innerText = currentBuyNFT.price;
    document.getElementById('nftPreview').innerHTML =
        `<h4>📄 NFT Info</h4><p><strong>${t('name_label')}:</strong> ${getNFTName(currentBuyNFT)}</p><p><strong>${t('seller')}:</strong> ${formatWalletShort(currentBuyNFT.seller)}</p><p><strong>${t('price')}:</strong> ${currentBuyNFT.price} ${t('root_coins')}</p>`;
}

function resetBuyLoginForm() {
    document.getElementById('buyLoginAccount').value = '';
    document.getElementById('buyLoginPhone').value = '';
    document.getElementById('buyLoginCode').value = '';
    document.getElementById('buyLoginCode').disabled = true;
    const btn = document.getElementById('buySendCodeBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = t('send_code');
    }
}

function getNFTName(nft) {
    if (nft.level === 'surname') return nft.surname;
    if (nft.level === 'citang') return `${nft.surname}.${nft.citang_name}`;
    return `${nft.surname}.${nft.citang_name}.${nft.member_name}`;
}

function logoutDirect() {
    if (pendingSellActions.length || pendingCancelActions.length) {
        confirmAllActions();
        return;
    }
    clearUserSession();
}

function closeDetailModalAndLogout() {
    document.getElementById('nftDetailModal').style.display = 'none';
    setBodyScrollLock(false);
    currentDetailNFT = null;
    clearUserSession();
}

function closeBuyModalAndLogout() {
    document.getElementById('buyModal').style.display = 'none';
    setBodyScrollLock(false);
    resetBuyLoginForm();
    currentBuyNFT = null;
    clearUserSession();
}

function closeLoginModalAndLogout() {
    cancelAllActions();
    document.getElementById('loginModal').style.display = 'none';
    setBodyScrollLock(false);
    clearUserSession();
}

async function sendCode(type) {
    let name, phone, btn, codeInput, msgDiv;
    if (type === 'login') {
        name = document.getElementById('loginAccount').value.trim();
        phone = getFullPhone('login');
        btn = document.getElementById('sendCodeBtn');
        codeInput = document.getElementById('loginCode');
        msgDiv = document.getElementById('loginMessage');
    } else {
        name = document.getElementById('buyLoginAccount').value.trim();
        phone = getFullPhone('buy');
        btn = document.getElementById('buySendCodeBtn');
        codeInput = document.getElementById('buyLoginCode');
        msgDiv = document.getElementById('buyLoginMessage');
    }
    if (!name || !phone) {
        if (msgDiv) {
            msgDiv.textContent = t('fill_all_fields');
            msgDiv.className = 'message error';
            msgDiv.style.display = 'block';
            setTimeout(() => msgDiv.style.display = 'none', 3000);
        }
        return;
    }
    setButtonLoading(btn, true, t('send_code'));
    try {
        const res = await fetch('/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'login', name, phone: phone })
        });
        const result = await res.json();
        if (result.success) {
            if (msgDiv) {
                msgDiv.textContent = result.message || t('code_sent');
                msgDiv.className = 'message success';
                msgDiv.style.display = 'block';
                setTimeout(() => msgDiv.style.display = 'none', 3000);
            }
            codeInput.disabled = false;
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            btn.textContent = t('resend_code');
        } else {
            if (msgDiv) {
                msgDiv.textContent = result.message || t('send_failed');
                msgDiv.className = 'message error';
                msgDiv.style.display = 'block';
                setTimeout(() => msgDiv.style.display = 'none', 3000);
            }
            setButtonLoading(btn, false);
            btn.textContent = t('send_code');
        }
    } catch (e) {
        if (msgDiv) {
            msgDiv.textContent = t('network_error');
            msgDiv.className = 'message error';
            msgDiv.style.display = 'block';
            setTimeout(() => msgDiv.style.display = 'none', 3000);
        }
        setButtonLoading(btn, false);
        btn.textContent = t('send_code');
    }
}

async function login() {
    const name = document.getElementById('loginAccount').value.trim();
    const phone = getFullPhone('login');
    const code = document.getElementById('loginCode').value.trim();
    const btn = document.getElementById('loginSubmitBtn');
    if (!name || !phone || !code) {
        showLoginMessage(t('fill_all_fields'), 'error');
        return;
    }
    setButtonLoading(btn, true, t('confirm_login'));
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone: phone, code })
        });
        const result = await res.json();
        if (result.success) {
            localStorage.setItem('wallet', result.wallet);
            localStorage.setItem('name', result.name);
            localStorage.setItem('account', name);
            showLoginMessage(t('login_success'), 'success');
            setTimeout(() => { showNFTSelectionSection();
                updateLoginUI(); }, 1000);
        } else {
            showLoginMessage(t('login_failed') + ': ' + (result.error || t('unknown_error')), 'error');
        }
    } catch (e) {
        showLoginMessage(t('network_error'), 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

function showLoginMessage(txt, type) {
    const d = document.getElementById('loginMessage');
    d.textContent = txt;
    d.className = 'message ' + type;
    d.style.display = 'block';
    setTimeout(() => d.style.display = 'none', 3000);
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    setBodyScrollLock(true);
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('nftSelectionSection').style.display = 'none';
}

function showNFTSelectionSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('nftSelectionSection').style.display = 'block';
    const w = localStorage.getItem('wallet');
    const n = localStorage.getItem('name');
    document.getElementById('walletAddress').textContent = formatWalletShort(w);
    document.getElementById('displayName').textContent = n || t('unknown_user');
    loadUserNFTs();
}

async function loadUserNFTs() {
    const info = checkLoginStatus();
    if (!info) return;
    try {
        const res = await fetch(`/api/user/nfts?wallet=${info.wallet}`);
        userNFTs = await res.json();
        const onsaleRes = await fetch('/api/nfts/onsale');
        const onsaleList = await onsaleRes.json();
        const tbody = document.getElementById('nftTableBody');
        if (!userNFTs.length) {
            tbody.innerHTML = `<tr><td colspan="3">${t('no_nfts')}</td></tr>`;
            return;
        }
        let html = '';
        userNFTs.forEach((nft, idx) => {
            const name = getNFTName(nft);
            const onsaleItem = onsaleList.find(i =>
                i.level === nft.level &&
                i.card_number === nft.card_number &&
                i.surname === nft.surname &&
                (i.citang_number || '') === (nft.citang_number || '') &&
                (i.citang_name || '') === (nft.citang_name || '') &&
                (i.member_number || '') === (nft.member_number || '') &&
                (i.member_name || '') === (nft.member_name || '')
            );
            const isOnSale = !!onsaleItem;
            const onSalePrice = onsaleItem ? onsaleItem.price : null;
            const isPreparingCancel = pendingCancelActions.some(a => a.nftIndex === idx);
            const isPreparingSell = pendingSellActions.some(a => a.nftIndex === idx);

            const purchasePrice = nft.purchase_price || 'Unknown';
            const priceDisplay = purchasePrice !== 'Unknown' ? `💰 ${purchasePrice} rc` : 'Unknown';

            if (isOnSale) {
                const cancelBtnClass = isPreparingCancel ? 'sell-btn cancel-prepared-btn' : 'sell-btn';
                const cancelBtnText = isPreparingCancel ? t('cancel_prepared') : t('cancel_sale');
                html += `<tr>
                            <td class="nft-name-cell">${escapeHtml(name)}</td>
                            <td class="price-cell">${priceDisplay}</td>
                            <td class="action-cell">
                                <span style="color:#28a745;">✓ ${t('on_sale')}</span>
                                ${onSalePrice !== null ? `<span style="color:#ff9800; margin-left:8px;">💰rc:${onSalePrice}</span>` : ''}
                                <button class="${cancelBtnClass}" onclick="prepareCancelSale(${idx})" style="margin-left:8px;">${cancelBtnText}</button>
                            </td>
                        </tr>`;
            } else {
                const sellBtnClass = isPreparingSell ? 'sell-btn prepared' : 'sell-btn';
                const sellBtnText = isPreparingSell ? t('prepared') : t('list_for_sale');
                const priceVal = isPreparingSell ? (pendingSellActions.find(a => a.nftIndex === idx)
                    ?.price || '') : '';
                html += `<tr>
                            <td class="nft-name-cell">${escapeHtml(name)}</td>
                            <td class="price-cell">${priceDisplay}</td>
                            <td class="action-cell">
                                <input type="text" id="priceInput_${idx}" placeholder="${t('price_placeholder')}" style="width:80px;padding:5px;font-size:0.8rem;" ${isPreparingSell ? 'disabled' : ''} value="${priceVal}">
                                <button class="${sellBtnClass}" id="sellBtn_${idx}" onclick="prepareSellNFT(${idx})" ${(!isPreparingSell && (!document.getElementById('priceInput_' + idx) || !parseInt(document.getElementById('priceInput_' + idx)?.value) >= 1)) ? 'disabled' : ''}>${sellBtnText}</button>
                            </td>
                        </tr>`;
            }
        });
        tbody.innerHTML = html;

        userNFTs.forEach((_, idx) => {
            const pi = document.getElementById(`priceInput_${idx}`);
            if (pi && !pendingSellActions.some(a => a.nftIndex === idx)) {
                pi.oninput = function() {
                    const btn = document.getElementById(`sellBtn_${idx}`);
                    if (btn && parseInt(this.value) >= 1) btn.disabled = false;
                    else if (btn) btn.disabled = true;
                };
            }
        });
    } catch (e) {
        console.error(e);
    }
}

function prepareSellNFT(idx) {
    const nft = userNFTs[idx];
    const priceInput = document.getElementById(`priceInput_${idx}`);
    const price = parseInt(priceInput.value);
    if (isNaN(price) || price < 1) {
        showCustomToast(t('invalid_price'), 'warning');
        return;
    }
    const existing = pendingSellActions.find(a => a.nftIndex === idx);
    const btn = document.getElementById(`sellBtn_${idx}`);
    if (!existing) {
        pendingSellActions.push({ nftIndex: idx, nft, price });
        if (btn) {
            btn.textContent = t('prepared');
            btn.classList.add('prepared');
            btn.style.background = '#28a745';
        }
        if (priceInput) priceInput.disabled = true;
    } else {
        pendingSellActions = pendingSellActions.filter(a => a.nftIndex !== idx);
        if (btn) {
            btn.textContent = t('list_for_sale');
            btn.classList.remove('prepared');
            btn.style.background = '#ff9800';
            btn.disabled = true;
        }
        if (priceInput) {
            priceInput.disabled = false;
            priceInput.value = '';
        }
    }
}

function prepareCancelSale(idx) {
    const nft = userNFTs[idx];
    const existing = pendingCancelActions.find(a => a.nftIndex === idx);
    const row = document.getElementById('nftTableBody').children[idx];
    if (!row) return;
    const btn = row.querySelector('.sell-btn');
    if (!existing) {
        pendingCancelActions.push({ nftIndex: idx, nft });
        if (btn) {
            btn.textContent = t('cancel_prepared');
            btn.classList.add('cancel-prepared-btn');
            btn.style.background = '#28a745';
        }
    } else {
        pendingCancelActions = pendingCancelActions.filter(a => a.nftIndex !== idx);
        if (btn) {
            btn.textContent = t('cancel_sale');
            btn.classList.remove('cancel-prepared-btn');
            btn.style.background = '#ff9800';
        }
    }
}

function cancelAllActions() {
    pendingSellActions = [];
    pendingCancelActions = [];
    loadUserNFTs();
}

async function confirmAllActions() {
    if (!pendingSellActions.length && !pendingCancelActions.length) {
        showCustomToast(t('no_actions'), 'warning');
        return;
    }
    const info = checkLoginStatus();
    if (!info) return;
    for (const act of pendingSellActions) {
        try {
            const h = await getNFTData(act.nft);
            await fetch('/api/nft/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: act.nft.level,
                    card_number: act.nft.card_number,
                    surname: act.nft.surname,
                    citang_number: act.nft.citang_number || '',
                    citang_name: act.nft.citang_name || '',
                    member_number: act.nft.member_number || '',
                    member_name: act.nft.member_name || '',
                    price: act.price,
                    seller_wallet: info.wallet,
                    hash: h
                })
            });
        } catch (e) {}
    }
    for (const act of pendingCancelActions) {
        try {
            await fetch('/api/nft/cancel-sale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: act.nft.level,
                    card_number: act.nft.card_number,
                    surname: act.nft.surname,
                    citang_number: act.nft.citang_number || '',
                    citang_name: act.nft.citang_name || '',
                    member_number: act.nft.member_number || '',
                    member_name: act.nft.member_name || ''
                })
            });
        } catch (e) {}
    }
    pendingSellActions = [];
    pendingCancelActions = [];
    await loadUserNFTs();
    await loadOnSaleNFTs();
    clearUserSession();
    document.getElementById('loginModal').style.display = 'none';
    setBodyScrollLock(false);
}

async function buyLogin() {
    const name = document.getElementById('buyLoginAccount').value.trim();
    const phone = getFullPhone('buy');
    const code = document.getElementById('buyLoginCode').value.trim();
    const btn = document.getElementById('buyLoginSubmitBtn');
    if (!name || !phone || !code) {
        showBuyLoginMessage(t('fill_all_fields'), 'error');
        return;
    }
    setButtonLoading(btn, true, t('login_and_buy'));
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone: phone, code })
        });
        const result = await res.json();
        if (result.success) {
            localStorage.setItem('wallet', result.wallet);
            localStorage.setItem('name', result.name);
            localStorage.setItem('account', name);
            showBuyLoginMessage(t('login_success'), 'success');
            setTimeout(() => { showBuyConfirmSection();
                updateLoginUI(); }, 1000);
        } else {
            showBuyLoginMessage(t('login_failed') + ': ' + (result.error || t('unknown_error')), 'error');
        }
    } catch (e) {
        showBuyLoginMessage(t('network_error'), 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

function showBuyLoginMessage(txt, type) {
    const d = document.getElementById('buyLoginMessage');
    d.textContent = txt;
    d.className = 'message ' + type;
    d.style.display = 'block';
    setTimeout(() => d.style.display = 'none', 3000);
}

async function confirmPurchase() {
    if (!currentBuyNFT) {
        showCustomToast(t('no_nft_selected'), 'warning');
        return;
    }
    const info = checkLoginStatus();
    if (!info) {
        showCustomToast(t('please_login'), 'warning');
        return;
    }
    if (currentBuyNFT.seller === info.wallet) {
        showCustomToast(t('cannot_buy_own'), 'warning');
        return;
    }
    const btn = document.getElementById('confirmBuyBtn');
    setButtonLoading(btn, true, t('confirm'));
    try {
        const res = await fetch('/api/nft/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: currentBuyNFT.level,
                card_number: currentBuyNFT.card_number,
                surname: currentBuyNFT.surname,
                citang_number: currentBuyNFT.citang_number || '',
                citang_name: currentBuyNFT.citang_name || '',
                member_number: currentBuyNFT.member_number || '',
                member_name: currentBuyNFT.member_name || '',
                buyer_wallet: info.wallet,
                buyer_account: info.account
            })
        });
        const result = await res.json();
        if (result.success) {
            hideBuyModal();
            const detailModal = document.getElementById('nftDetailModal');
            if (detailModal && detailModal.style.display === 'block') {
                detailModal.style.display = 'none';
                setBodyScrollLock(false);
                currentDetailNFT = null;
            }
            showCustomToast('🎉 ' + t('purchase_success'), 'success');
            await loadOnSaleNFTs();
            clearUserSession();
            updateLoginUI();
        } else {
            showCustomToast(t('purchase_failed') + ': ' + (result.error || t('unknown_error')), 'error');
        }
    } catch (e) {
        showCustomToast(t('network_error'), 'error');
    } finally {
        setButtonLoading(btn, false);
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            btn.innerHTML = t('confirm');
        }
    }
}

function hideBuyModal() {
    document.getElementById('buyModal').style.display = 'none';
    setBodyScrollLock(false);
    resetBuyLoginForm();
    currentBuyNFT = null;
}

function hideStatusOverlay() {
    document.getElementById('statusOverlay').style.display = 'none';
}

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    applyTranslations();
    await loadOnSaleNFTs();
    updateLoginUI();

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const st = btn.dataset.sort;
            if (st) applySortAndRender(st);
        });
    });
}

// Make functions globally accessible for inline onclick handlers
window.showNFTDetailByIndex = showNFTDetailByIndex;
window.viewTransactionHistory = viewTransactionHistory;
window.closeDetailModalAndLogout = closeDetailModalAndLogout;
window.buyFromDetail = buyFromDetail;
window.closeBuyModalAndLogout = closeBuyModalAndLogout;
window.closeLoginModalAndLogout = closeLoginModalAndLogout;
window.sendCode = sendCode;
window.login = login;
window.buyLogin = buyLogin;
window.confirmPurchase = confirmPurchase;
window.showLoginModal = showLoginModal;
window.logoutDirect = logoutDirect;
window.cancelAllActions = cancelAllActions;
window.confirmAllActions = confirmAllActions;
window.showBuyLoginSection = showBuyLoginSection;
window.hideStatusOverlay = hideStatusOverlay;
window.prepareSellNFT = prepareSellNFT;
window.prepareCancelSale = prepareCancelSale;
window.toggleLanguage = toggleLanguage;

document.addEventListener('DOMContentLoaded', init);
