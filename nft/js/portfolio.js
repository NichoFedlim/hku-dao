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
    document.title = t('portfolio_title') || 'My NFTs';
}

window.toggleLanguage = function() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    loadLanguage(next);
};

// ============================================================
// STATE VARIABLES
// ============================================================
let userNFTs = [];
let onSaleNFTs = [];
let pendingSellNFT = null;
let currentPriceInputId = '';
const itemsPerPage = 12;

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function checkLoginStatus() {
    const wallet = localStorage.getItem('wallet');
    const name = localStorage.getItem('name');
    const phone = localStorage.getItem('phone');
    if (wallet && name) {
        return { wallet, name, phone };
    }
    return null;
}

function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('wallet');
        localStorage.removeItem('name');
        localStorage.removeItem('phone');
        localStorage.removeItem('account');
        window.location.href = 'NFT_market.html';
    }
}

// ============================================================
// NFT LOADING FUNCTIONS
// ============================================================
async function loadUserNFTs() {
    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        alert('请先登录');
        window.location.href = 'NFT_market.html';
        return;
    }

    // Update user info display
    document.getElementById('displayUserName').textContent = loginInfo.name;
    document.getElementById('displayWallet').textContent = loginInfo.wallet;
    document.getElementById('displayPhone').textContent = loginInfo.phone || '未设置';

    try {
        document.getElementById('nft-content').innerHTML = '<div class="loading">正在从数据文件加载您的NFT...</div>';

        // Load user NFTs
        const userResponse = await fetch(`/api/user/nfts?wallet=${loginInfo.wallet}`);
        userNFTs = await userResponse.json();

        // Load on-sale NFTs
        const saleResponse = await fetch('/api/nfts/onsale');
        onSaleNFTs = await saleResponse.json();

        // Sort by price descending
        userNFTs.sort((a, b) => {
            const priceA = a.purchase_price || 0;
            const priceB = b.purchase_price || 0;
            return priceB - priceA;
        });

        await renderNFTsAutoLoad();

    } catch (error) {
        console.error('加载NFT失败:', error);
        document.getElementById('nft-content').innerHTML =
            '<div class="loading">加载失败，请刷新页面重试: ' + error.message + '</div>';
    }
}

// ============================================================
// RENDERING FUNCTIONS
// ============================================================
async function renderNFTsAutoLoad() {
    const container = document.getElementById('nft-content');

    if (!userNFTs || userNFTs.length === 0) {
        container.innerHTML = '<div class="empty-state">您还没有任何NFT</div>';
        return;
    }

    let html = `<div class="category-section">
        <div class="category-title">我的NFT (${userNFTs.length})</div>
        <div class="member-grid" id="nft-grid"></div>`;
    
    html += `<div id="loading-indicator" class="loading-indicator" style="display: none;">
        <div class="spinner"></div>
        <span>正在加载NFT数据...</span>
    </div>`;
    
    html += `</div>`;
    
    container.innerHTML = html;
    await autoLoadMoreBatches();
}

async function autoLoadMoreBatches() {
    let currentPage = 1;
    let allLoaded = false;
    
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
    
    while (!allLoaded) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, userNFTs.length);
        
        if (startIndex >= userNFTs.length) {
            allLoaded = true;
            break;
        }
        
        const batchNFTs = userNFTs.slice(startIndex, endIndex);
        await renderBatch(batchNFTs);
        
        currentPage++;
        
        if (endIndex >= userNFTs.length) {
            allLoaded = true;
        } else {
            await delay(300);
        }
    }
    
    if (loadingIndicator) {
        loadingIndicator.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">✅ 已加载全部NFT</div>';
        setTimeout(() => {
            loadingIndicator.style.display = 'none';
        }, 2000);
    }
}

function renderBatch(batchNFTs) {
    return new Promise((resolve) => {
        const gridContainer = document.getElementById('nft-grid');
        if (!gridContainer) {
            resolve();
            return;
        }

        const newHTML = batchNFTs.map(nft => {
            switch (nft.level) {
                case 'surname':
                    return renderSurnameCard(nft);
                case 'citang':
                    return renderCitangCard(nft);
                case 'member':
                    return renderMemberCard(nft);
                default:
                    return '';
            }
        }).join('');
        
        gridContainer.insertAdjacentHTML('beforeend', newHTML);
        
        setTimeout(() => generateAllQRCodes(batchNFTs), 100);
        setTimeout(() => resolve(), 50);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// CARD RENDERERS
// ============================================================
function renderSurnameCard(nft) {
    const isOnSale = onSaleNFTs.some(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname
    );

    const levelTag = '#' + nft.card_number;
    const displayHash = nft.hash || 'Hash信息缺失';
    const purchasePrice = nft.purchase_price || 0;

    const saleInfo = onSaleNFTs.find(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname
    );

    return `
        <div class="card-container">
            <div class="card-surname">
                <div class="card-inner" style="box-shadow:0 2px 0 0 #FFD700;">
                    <div style="display: flex; flex-direction: column; align-items: flex-start; height: 100%; padding: 10px 0; line-height: 1.2;">
                        <h1 class="member-name" style="font-size:3.2rem;margin:0;margin-top:8px">${nft.surname}</h1>
                    </div>
                    <div class="qr-section">
                        <div class="qrcode-container">
                            <div class="qr-wrapper">
                                <div class="qrcode" id="qr-surname-${nft.card_number}"></div>
                            </div>
                        </div>
                        <div class="nft-background">${formatNft(displayHash)}</div>
                    </div>
                </div>
                <div class="button-section">
                    <button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}', '${nft.card_number}', '${nft.surname}')">
                        NFT成交记录
                    </button>
                    <div>
                        <span class="price-display">根币:${purchasePrice} </span>
                        <span class="card-number-tag">${levelTag}</span>
                    </div>
                </div>
            </div>
            <div class="nft-actions-container">
                ${saleInfo ? `
                    <div class="nft-actions">
                        <div class="price-info">
                            <span class="label">出售价: </span>
                            <span class="value">${saleInfo.price} 根币</span>
                        </div>
                        <div class="nft-actions">
                            <button class="btn btn-cancel" onclick="cancelSale('${nft.level}', '${nft.card_number}', '${nft.surname}', '', '', '', '')">
                                取消出售
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="nft-actions">
                        <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="输入出售价格" min="1">
                        <button class="btn btn-sell" onclick="sellNFT('${nft.level}', '${nft.card_number}', '${nft.surname}', '', '', '', '')">
                            出售
                        </button>
                    </div>
                `}
            </div>
        </div>`;
}

function renderCitangCard(nft) {
    const isOnSale = onSaleNFTs.some(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname &&
        saleNFT.citang_number === nft.citang_number &&
        saleNFT.citang_name === nft.citang_name
    );

    const levelTag = `#${nft.card_number}.${nft.citang_number}`;
    const displayHash = nft.hash || 'Hash信息缺失';
    const purchasePrice = nft.purchase_price || 0;

    const saleInfo = onSaleNFTs.find(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname &&
        saleNFT.citang_number === nft.citang_number &&
        saleNFT.citang_name === nft.citang_name
    );

    return `
        <div class="card-container">
            <div class="card-citang">
                <div class="card-inner" style="box-shadow:0 2px 0 0 #FFD700;">
                    <div style="display: flex; flex-direction: column; align-items: flex-start; height: 100%; padding: 10px 0; line-height: 1.2;">
                        <span class="card-number-tag">#${nft.card_number}.${nft.citang_number}</span>
                        <h1 class="member-name" style="font-size:1.5rem;margin:0px;">${nft.surname}.</h1>
                        <h1 class="member-name" style="font-size:2.0rem;margin:0;margin-top:8px">${nft.citang_name}</h1>
                        <div class="member-details">省/市：${nft.province || '未知'}</div>
                        <div class="member-details">区/县：${nft.district || '未知'}</div>
                    </div>
                    <div class="qr-section">
                        <div class="qrcode-container">
                            <div class="qr-wrapper">
                                <div class="qrcode" id="qr-citang-${nft.card_number}-${nft.citang_number}"></div>
                            </div>
                        </div>
                        <div class="nft-background">${formatNft(displayHash)}</div>
                    </div>
                </div>
                <div class="button-section">
                    <button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}')">
                        NFT历史交易
                    </button>
                    <div>
                        <span class="price-display">购买价: ${purchasePrice} 根币</span>
                    </div>
                </div>
            </div>
            <div class="nft-actions-container">
                ${saleInfo ? `
                    <div class="nft-actions">
                        <div class="price-info">
                            <span class="label">出售价格: </span>
                            <span class="value">${saleInfo.price} 根币</span>
                        </div>
                        <div class="nft-actions">
                            <button class="btn btn-cancel" onclick="cancelSale('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}', '', '')">
                                取消出售
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="nft-actions">
                        <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="输入出售价格" min="1">
                        <button class="btn btn-sell" onclick="sellNFT('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}', '', '')">
                            出售
                        </button>
                    </div>
                `}
            </div>
        </div>`;
}

function renderMemberCard(nft) {
    const isOnSale = onSaleNFTs.some(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname &&
        saleNFT.citang_number === nft.citang_number &&
        saleNFT.citang_name === nft.citang_name &&
        saleNFT.member_number === nft.member_number &&
        saleNFT.member_name === nft.member_name
    );

    const levelTag = `#${nft.card_number}.${nft.citang_number}.${nft.member_number}`;
    const displayHash = nft.hash || 'Hash信息缺失';
    const purchasePrice = nft.purchase_price || 0;

    const saleInfo = onSaleNFTs.find(saleNFT =>
        saleNFT.level === nft.level &&
        saleNFT.card_number === nft.card_number &&
        saleNFT.surname === nft.surname &&
        saleNFT.citang_number === nft.citang_number &&
        saleNFT.citang_name === nft.citang_name &&
        saleNFT.member_number === nft.member_number &&
        saleNFT.member_name === nft.member_name
    );

    return `
        <div class="card-container">
            <div class="card-member">
                <div class="card-inner" style="box-shadow:0 2px 0 0 #FFD700;">
                    <div class="member-info-section" style="display: flex; flex-direction: column; align-items: flex-start; height: 100%; padding: 10px 0; line-height: 1.2;">
                        <span class="card-number-tag">#${nft.card_number}.${nft.citang_number}.${nft.member_number}</span>
                        <h1 class="member-name" style="font-size:1.3rem;margin:0px;">${nft.surname}.</h1>
                        <h1 class="member-name" style="font-size:1.3rem;margin:0;margin-top:8px">${nft.citang_name}.</h1>
                        <div class="member-name">${nft.member_name}</div>
                        <div class="member-details">性别：${nft.gender || '未知'}</div>
                        <div class="member-details">出生：${nft.birth || '未知'}</div>
                    </div>
                    <div class="qr-section">
                        <div class="qrcode-container">
                            <div class="qr-wrapper">
                                <div class="qrcode" id="qr-member-${nft.card_number}-${nft.citang_number}-${nft.member_number}"></div>
                            </div>
                        </div>
                        <div class="nft-background">${formatNft(displayHash)}</div>
                    </div>
                </div>
                <div class="button-section">
                    <button class="nft-transaction-btn" onclick="viewTransactionHistory('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}', '${nft.member_number}', '${nft.member_name}')">
                        NFT历史交易
                    </button>
                    <div>
                        <span class="price-display">购买价: ${purchasePrice} 根币</span>
                    </div>
                </div>
            </div>
            <div class="nft-actions-container">
                ${saleInfo ? `
                    <div class="nft-actions">
                        <div class="price-info">
                            <span class="label">出售价格: </span>
                            <span class="value">${saleInfo.price} 根币</span>
                        </div>
                        <div class="nft-actions">
                            <button class="btn btn-cancel" onclick="cancelSale('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}', '${nft.member_number}', '${nft.member_name}')">
                                取消出售
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="nft-actions">
                        <input type="number" class="price-input" id="price-${nft.level}-${nft.card_number}" placeholder="输入出售价格" min="1">
                        <button class="btn btn-sell" onclick="sellNFT('${nft.level}', '${nft.card_number}', '${nft.surname}', '${nft.citang_number}', '${nft.citang_name}', '${nft.member_number}', '${nft.member_name}')">
                            出售
                        </button>
                    </div>
                `}
            </div>
        </div>`;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatNft(nft) {
    if (!nft) return '';
    return nft.match(/.{1,16}/g).join('<br>');
}

function getLevelName(level) {
    const names = { surname: '姓氏', citang: '会堂', member: '成员' };
    return names[level] || level;
}

function generateAllQRCodes(nfts) {
    nfts.filter(nft => nft.level === 'surname').forEach(nft => {
        const qrContainer = document.getElementById(`qr-surname-${nft.card_number}`);
        if (qrContainer && qrContainer.innerHTML.trim() === '' && nft.hash) {
            new QRCode(qrContainer, {
                text: nft.hash,
                width: 130,
                height: 130,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }
    });

    nfts.filter(nft => nft.level === 'citang').forEach(nft => {
        const qrContainer = document.getElementById(`qr-citang-${nft.card_number}-${nft.citang_number}`);
        if (qrContainer && qrContainer.innerHTML.trim() === '' && nft.hash) {
            new QRCode(qrContainer, {
                text: nft.hash,
                width: 130,
                height: 130,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }
    });

    nfts.filter(nft => nft.level === 'member').forEach(nft => {
        const qrContainer = document.getElementById(`qr-member-${nft.card_number}-${nft.citang_number}-${nft.member_number}`);
        if (qrContainer && qrContainer.innerHTML.trim() === '' && nft.hash) {
            new QRCode(qrContainer, {
                text: nft.hash,
                width: 130,
                height: 130,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }
    });
}

function viewTransactionHistory(level, card_number, surname, citang_number = '', citang_name = '', member_number = '', member_name = '') {
    let url = '';
    switch (level) {
        case 'surname':
            url = `/ti_log.html?name=${encodeURIComponent(surname)}&card_number=${card_number}`;
            break;
        case 'citang':
            url = `/citang_ti_log.html?surname=${encodeURIComponent(surname)}&name=${encodeURIComponent(citang_name)}&card_number=${card_number}&citang_number=${citang_number}`;
            break;
        case 'member':
            url = `/member_ti_log.html?surname=${encodeURIComponent(surname)}&citang_number=${citang_number}&member_number=${member_number}&card_number=${card_number}&citangname=${encodeURIComponent(citang_name)}&membername=${encodeURIComponent(member_name)}`;
            break;
    }
    if (url) {
        location.href = url;
    }
}

// ============================================================
// NFT SELLING FUNCTIONS
// ============================================================
async function sellNFT(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        alert('请先登录');
        return;
    }

    currentPriceInputId = `price-${level}-${card_number}`;
    const priceInput = document.getElementById(currentPriceInputId);
    const price = parseInt(priceInput.value) || 0;

    if (price < 1) {
        alert('请输入有效的价格（至少为1根币）');
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
        alert('NFT信息错误，请刷新页面重试');
        return;
    }

    pendingSellNFT = {
        ...nft,
        price: price
    };
    
    document.getElementById('confirmLevel').textContent = getLevelName(pendingSellNFT.level);
    document.getElementById('confirmSurname').textContent = pendingSellNFT.surname;
    document.getElementById('confirmPrice').textContent = `${pendingSellNFT.price} 根币`;
    
    let numberText = '';
    if (pendingSellNFT.level === 'surname') {
        numberText = `#${pendingSellNFT.card_number}`;
    } else if (pendingSellNFT.level === 'citang') {
        numberText = `#${pendingSellNFT.card_number}.${pendingSellNFT.citang_number}`;
    } else if (pendingSellNFT.level === 'member') {
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
    const nftHash = pendingSellNFT.hash || '无';
    nftHashSpan.textContent = nftHash;
    nftHashSpan.title = nftHash;
    
    document.getElementById('sellConfirmModal').style.display = 'block';
}

function hideSellConfirmModal() {
    document.getElementById('sellConfirmModal').style.display = 'none';
    pendingSellNFT = null;
    currentPriceInputId = '';
}

async function proceedSell() {
    if (!pendingSellNFT) {
        alert('NFT信息已失效，请重新选择');
        hideSellConfirmModal();
        return;
    }
    
    const loginInfo = checkLoginStatus();
    if (!loginInfo) {
        alert('请先登录');
        hideSellConfirmModal();
        return;
    }
    
    try {
        const response = await fetch('/api/nft/list', {
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
                seller_wallet: loginInfo.wallet,
                hash: pendingSellNFT.hash || ''
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('NFT上架成功！');
            hideSellConfirmModal();
            
            if (currentPriceInputId) {
                const priceInput = document.getElementById(currentPriceInputId);
                if (priceInput) priceInput.value = '';
            }
            
            loadUserNFTs();
        } else {
            alert('上架失败: ' + result.error);
        }
    } catch (error) {
        console.error('上架失败:', error);
        alert('上架失败: ' + error.message);
    }
}

async function cancelSale(level, card_number, surname, citang_number, citang_name, member_number, member_name) {
    if (!confirm('确定要取消出售这个NFT吗？')) {
        return;
    }

    try {
        const response = await fetch('/api/nft/cancel-sale', {
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
            alert('已取消出售！');
            loadUserNFTs();
        } else {
            alert('取消出售失败: ' + result.error);
        }
    } catch (error) {
        console.error('取消出售失败:', error);
        alert('取消出售失败: ' + error.message);
    }
}

// ============================================================
// INIT
// ============================================================
async function init() {
    await loadLanguage(currentLang);
    applyTranslations();
    loadUserNFTs();
}

// Make functions globally accessible
window.toggleLanguage = toggleLanguage;
window.logout = logout;
window.sellNFT = sellNFT;
window.hideSellConfirmModal = hideSellConfirmModal;
window.proceedSell = proceedSell;
window.cancelSale = cancelSale;
window.viewTransactionHistory = viewTransactionHistory;

// Modal click outside to close
window.onclick = function(event) {
    const sellConfirmModal = document.getElementById('sellConfirmModal');
    if (event.target === sellConfirmModal) {
        hideSellConfirmModal();
    }
};

document.addEventListener('DOMContentLoaded', init);
