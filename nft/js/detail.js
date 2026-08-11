// ============================================================
// detail.js - Handles the detail page for categories, subcategories, and items
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
    document.title = t('detail_title') || 'Detail';
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
            const loginBtn = document.getElementById('login-btn');
            loginBtn.textContent = result.name || 'User';
            loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
            showToast(t('login_success'));
            // Check ownership after login
            checkOwnership();
        }
    } catch (e) {
        if (e.message !== '用户取消登录') {
            showToast(t('login_error') + ': ' + e.message, 'error');
        }
    }
};

// ============================================================
// TOAST
// ============================================================
function showToast(title, msg) {
    document.getElementById('toast-title').textContent = title || 'Success';
    document.getElementById('toast-msg').textContent = msg || 'Operation completed.';
    document.getElementById('customToast').style.display = 'block';
}

function hideToast() {
    document.getElementById('customToast').style.display = 'none';
}

// ============================================================
// STATE
// ============================================================
let detailData = {};
let originalData = {};
let itemType = 'item'; // 'category', 'item', 'subitem'
let itemId = null;
let isEditMode = false;
let hasOwnership = false;
let pendingUploads = [];
let selectedFile = null;
let selectedFileType = '';
let usingMockData = false; // flag to show mock indicator

// ============================================================
// EXTENDED MOCK DETAIL DATA
// ============================================================
const MOCK_DETAIL_DATA = {
    // ---- Categories (Faculties) ----
    'category_1': {
        id: 1,
        name: 'Architecture',
        name_zh: '建筑学院',
        type: 'category',
        hash: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/architecture',
        price: 1000,
        description: 'The Faculty of Architecture at HKU offers programs in Architecture, Landscape Architecture, Urban Planning, and Real Estate.',
        description_zh: '港大建筑学院提供建筑学、景观建筑、城市规划及房地产等课程。',
        details: 'Founded in 1912. Located at the Main Campus.',
        details_zh: '成立于1912年。位于主校园。',
        attachments: [
            { id: 1, type: 'image', name: 'campus.jpg', url: '/images/campus.jpg' },
            { id: 2, type: 'pdf', name: 'brochure.pdf', url: '/docs/brochure.pdf' }
        ]
    },
    'category_2': {
        id: 2,
        name: 'Arts',
        name_zh: '文学院',
        type: 'category',
        hash: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/arts',
        price: 1200,
        description: 'The Faculty of Arts offers a wide range of humanities and language programs.',
        description_zh: '文学院提供广泛的人文及语言课程。',
        details: 'Established in 1912. Includes Schools of Chinese, English, Humanities, and Modern Languages.',
        details_zh: '成立于1912年。包括中文学院、英文学院、人文学院及现代语言学院。',
        attachments: []
    },
    'category_3': {
        id: 3,
        name: 'Business & Economics',
        name_zh: '商学院',
        type: 'category',
        hash: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/business',
        price: 1500,
        description: 'The Faculty of Business and Economics offers programs in Accounting, Economics, Finance, Management, and Marketing.',
        description_zh: '商学院提供会计、经济、金融、管理及市场营销等课程。',
        details: 'Established in 1990. Located at the Main Campus.',
        details_zh: '成立于1990年。位于主校园。',
        attachments: []
    },
    'category_4': {
        id: 4,
        name: 'Dentistry',
        name_zh: '牙医学院',
        type: 'category',
        hash: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/dentistry',
        price: 1400,
        description: 'The Faculty of Dentistry provides education in clinical dentistry and research.',
        description_zh: '牙医学院提供临床牙科教育和研究。',
        details: 'Established in 1982. Located at the Prince Philip Dental Hospital.',
        details_zh: '成立于1982年。位于菲腊牙科医院。',
        attachments: []
    },
    'category_5': {
        id: 5,
        name: 'Education',
        name_zh: '教育学院',
        type: 'category',
        hash: '0xE5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/education',
        price: 1100,
        description: 'The Faculty of Education offers programs in teacher education, educational psychology, and policy.',
        description_zh: '教育学院提供教师教育、教育心理学及政策等课程。',
        details: 'Established in 1984. Located at the Main Campus.',
        details_zh: '成立于1984年。位于主校园。',
        attachments: []
    },
    'category_6': {
        id: 6,
        name: 'Engineering',
        name_zh: '工程学院',
        type: 'category',
        hash: '0xF6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/engineering',
        price: 1300,
        description: 'The Faculty of Engineering offers programs in civil, computer, electrical, mechanical, and industrial engineering.',
        description_zh: '工程学院提供土木、计算机、电机、机械及工业工程等课程。',
        details: 'Established in 1911. Located at the Main Campus.',
        details_zh: '成立于1911年。位于主校园。',
        attachments: []
    },
    'category_7': {
        id: 7,
        name: 'Law',
        name_zh: '法学院',
        type: 'category',
        hash: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/law',
        price: 1600,
        description: 'The Faculty of Law offers programs in law, human rights, and corporate governance.',
        description_zh: '法学院提供法律、人权及公司治理等课程。',
        details: 'Established in 1969. Located at the Main Campus.',
        details_zh: '成立于1969年。位于主校园。',
        attachments: []
    },
    'category_8': {
        id: 8,
        name: 'Medicine',
        name_zh: '李嘉诚医学院',
        type: 'category',
        hash: '0xB2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/medicine',
        price: 1800,
        description: 'The Li Ka Shing Faculty of Medicine offers programs in medicine, nursing, and public health.',
        description_zh: '李嘉诚医学院提供医学、护理及公共卫生等课程。',
        details: 'Established in 1887. Located at the Medical Campus.',
        details_zh: '成立于1887年。位于医疗校园。',
        attachments: []
    },
    'category_9': {
        id: 9,
        name: 'Science',
        name_zh: '理学院',
        type: 'category',
        hash: '0xC3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/science',
        price: 1250,
        description: 'The Faculty of Science offers programs in chemistry, biology, physics, mathematics, and earth sciences.',
        description_zh: '理学院提供化学、生物、物理、数学及地球科学等课程。',
        details: 'Established in 1911. Located at the Main Campus.',
        details_zh: '成立于1911年。位于主校园。',
        attachments: []
    },
    'category_10': {
        id: 10,
        name: 'Social Sciences',
        name_zh: '社会科学学院',
        type: 'category',
        hash: '0xD4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6',
        shortlink: 'https://hku.hk/social-sciences',
        price: 1150,
        description: 'The Faculty of Social Sciences offers programs in geography, political science, psychology, and sociology.',
        description_zh: '社会科学学院提供地理、政治、心理学及社会学等课程。',
        details: 'Established in 1967. Located at the Main Campus.',
        details_zh: '成立于1967年。位于主校园。',
        attachments: []
    },

    // ---- Subcategories (Citang) ----
    'item_101': {
        id: 101,
        name: 'Department of Architecture',
        name_zh: '建筑学系',
        type: 'item',
        parent: 'Architecture',
        parent_zh: '建筑学院',
        hash: '0x111222333444555666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/arch',
        price: 500,
        description: 'The Department of Architecture offers professional education in architectural design, history, and theory.',
        description_zh: '建筑学系提供建筑设计、历史及理论的专业教育。',
        details: 'Programs: BA(Arch), MArch, PhD. Research areas include sustainable design.',
        details_zh: '课程：建筑学士、建筑硕士、博士。研究方向包括可持续设计。',
        attachments: []
    },
    'item_102': {
        id: 102,
        name: 'Department of Real Estate & Construction',
        name_zh: '房地产及建设系',
        type: 'item',
        parent: 'Architecture',
        parent_zh: '建筑学院',
        hash: '0x222333444555666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/real-estate',
        price: 450,
        description: 'The Department of Real Estate and Construction focuses on property development and construction management.',
        description_zh: '房地产及建设系专注于房地产开发和建设管理。',
        details: 'Programs: BSc(Real Estate), MSc(Construction).',
        details_zh: '课程：房地产学士、建设管理硕士。',
        attachments: []
    },
    'item_601': {
        id: 601,
        name: 'Department of Civil Engineering',
        name_zh: '土木工程系',
        type: 'item',
        parent: 'Engineering',
        parent_zh: '工程学院',
        hash: '0x333444555666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/civil',
        price: 600,
        description: 'The Department of Civil Engineering provides education in structural, geotechnical, and environmental engineering.',
        description_zh: '土木工程系提供结构、岩土及环境工程教育。',
        details: 'Programs: BEng(Civil), MSc(Civil).',
        details_zh: '课程：土木工程学士、土木工程硕士。',
        attachments: []
    },
    'item_602': {
        id: 602,
        name: 'Department of Computer Science',
        name_zh: '计算机科学系',
        type: 'item',
        parent: 'Engineering',
        parent_zh: '工程学院',
        hash: '0x444555666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/cs',
        price: 650,
        description: 'The Department of Computer Science offers programs in artificial intelligence, data science, and software engineering.',
        description_zh: '计算机科学系提供人工智能、数据科学及软件工程等课程。',
        details: 'Programs: BEng(CS), MSc(CS).',
        details_zh: '课程：计算机科学学士、计算机科学硕士。',
        attachments: []
    },

    // ---- Items (Members) ----
    'item_10101': {
        id: 10101,
        name: 'Prof. John Smith',
        name_zh: 'John Smith 教授',
        type: 'item',
        parent: 'Department of Architecture',
        parent_zh: '建筑学系',
        hash: '0x555666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/arch/prof-smith',
        price: 200,
        description: 'Professor of Architecture, specializing in sustainable urban design.',
        description_zh: '建筑系教授，专攻可持续城市设计。',
        details: 'Research: Green buildings, urban resilience.',
        details_zh: '研究：绿色建筑、城市韧性。',
        attachments: []
    },
    'item_10102': {
        id: 10102,
        name: 'Dr. Jane Lee',
        name_zh: 'Jane Lee 博士',
        type: 'item',
        parent: 'Department of Architecture',
        parent_zh: '建筑学系',
        hash: '0x666777888999000111222333444555666777888999000',
        shortlink: 'https://hku.hk/arch/dr-lee',
        price: 180,
        description: 'Assistant Professor of Architecture, focusing on architectural history and preservation.',
        description_zh: '建筑系助理教授，研究建筑历史与保护。',
        details: 'Research: Heritage conservation, architectural theory.',
        details_zh: '研究：遗产保护、建筑理论。',
        attachments: []
    }
};

// ============================================================
// LOAD DETAIL
// ============================================================
async function loadDetail() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') || 'item';
    const id = params.get('id');

    itemType = type;
    itemId = id;

    if (!id) {
        showToast('Error', 'Missing item ID');
        return;
    }

    try {
        let response, data;
        let usingMock = false;

        // Try API first
        try {
            // Build the endpoint based on type – all use only the id
            let endpoint = '';
            if (type === 'category') {
                endpoint = `${API_BASE}/api/category/detail?id=${id}`;
            } else if (type === 'subcategory') {
                endpoint = `${API_BASE}/api/subcategory/detail?id=${id}`;
            } else if (type === 'item' || type === 'subitem') {
                endpoint = `${API_BASE}/api/item/detail?id=${id}`;
            } else {
                throw new Error('Unknown type: ' + type);
            }

            console.log('Fetching detail from:', endpoint);
            response = await fetch(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();

            // Map data to detailData
            if (type === 'category') {
                detailData = {
                    id: data.card_number || id,
                    name: data.name,
                    name_zh: data.name_zh || data.name,
                    type: 'category',
                    hash: data.hash || '',
                    shortlink: data.shortlink || '',
                    price: data.price || 0,
                    description: data.description || '',
                    description_zh: data.description_zh || '',
                    details: data.details || '',
                    details_zh: data.details_zh || '',
                    attachments: data.attachments || [],
                    category_id: data.card_number || id,
                    category_name: data.name
                };
            } else {
                detailData = {
                    id: data.id || id,
                    name: data.name,
                    name_zh: data.name_zh || data.name,
                    type: data.type || type,
                    hash: data.hash || '',
                    shortlink: data.shortlink || '',
                    price: data.purchase_price || data.price || 0,
                    description: data.description || '',
                    description_zh: data.description_zh || '',
                    details: data.details || '',
                    details_zh: data.details_zh || '',
                    attachments: data.attachments || [],
                    // For breadcrumb and parent info
                    parent: data.category_name || '',
                    parent_zh: data.category_name || '',
                    category_id: data.category_id || '',
                    category_name: data.category_name || '',
                    subcategory_id: data.subcategory_id || '',
                    subcategory_name: data.subcategory_name || ''
                };
            }

            usingMock = false;
        } catch (apiError) {
            console.warn('API failed, using mock data:', apiError);
            usingMock = true;
            loadDetailFallback(type, id);
        }

        if (!usingMock) {
            originalData = { ...detailData };
            renderDetail();
            await refreshAttachments();
            checkOwnership();
        }

    } catch (error) {
        console.error('Failed to load detail:', error);
        showToast('Failed to load data from server', 'error');
        // Fallback to mock data
        showToast('⚠️ Using mock data - backend API not available', 'warning');
        usingMockData = true;
        loadDetailFallback(type, id);
    }
}

function loadDetailFallback(type, id) {
    const key = `${type}_${id}`;
    const data = MOCK_DETAIL_DATA[key];

    if (!data) {
        // Generate fallback
        detailData = {
            id: parseInt(id),
            name: `Item ${id}`,
            name_zh: `项目 ${id}`,
            type: type,
            hash: `0x${Math.random().toString(16).substring(2, 18)}${Math.random().toString(16).substring(2, 18)}`,
            shortlink: '',
            price: Math.floor(Math.random() * 100) + 10,
            description: 'Sample description. Edit this content.',
            description_zh: '示例描述。编辑此内容。',
            details: 'Additional details go here.',
            details_zh: '其他详细信息在此。',
            attachments: []
        };
    } else {
        detailData = { ...data };
    }

    usingMockData = true;
    originalData = { ...detailData };
    renderDetail();
    checkOwnership();

    // Show mock indicator
    showMockIndicator();
    showToast('⚠️ Using mock data - backend API not available', 'warning');
}

function showMockIndicator() {
    const existing = document.getElementById('mock-indicator');
    if (existing) existing.remove();

    if (usingMockData) {
        const indicator = document.createElement('div');
        indicator.id = 'mock-indicator';
        indicator.innerHTML = `
            ⚠️ Using mock data (backend API not available)
            <button class="close-mock" onclick="this.parentElement.remove()">✕</button>
        `;
        const container = document.querySelector('.detail-container');
        if (container) {
            container.insertBefore(indicator, container.firstChild);
        }
    }
}

// ============================================================
// VIEW TRANSACTION HISTORY
// ============================================================
function viewTransactionHistory() {
    const type = detailData.type || 'item';
    const id = detailData.id;
    let url = '';

    // Build the URL based on the NFT type
    if (type === 'category') {
        // For category level: use card_number from the data
        const cardNumber = detailData.card_number || id;
        const name = encodeURIComponent(detailData.name || '');
        url = `/nft/ti_log.html?level=category&card_number=${cardNumber}&name=${name}`;
    } else if (type === 'subcategory') {
        // For subcategory
        const categoryId = detailData.category_id || id;
        const categoryName = encodeURIComponent(detailData.category_name || '');
        const subcategoryId = detailData.id;
        const subcategoryName = encodeURIComponent(detailData.name || '');
        url = `/nft/ti_log.html?level=subcategory&category_id=${categoryId}&category_name=${categoryName}&subcategory_id=${subcategoryId}&subcategory_name=${subcategoryName}`;
    } else if (type === 'item' || type === 'subitem') {
        // For item
        const categoryId = detailData.category_id || id;
        const categoryName = encodeURIComponent(detailData.category_name || '');
        const subcategoryId = detailData.subcategory_id || id;
        const subcategoryName = encodeURIComponent(detailData.subcategory_name || '');
        const itemNumber = detailData.id;
        const itemName = encodeURIComponent(detailData.name || '');
        url = `/nft/ti_log.html?level=item&category_id=${categoryId}&category_name=${categoryName}&subcategory_id=${subcategoryId}&subcategory_name=${subcategoryName}&item_number=${itemNumber}&item_name=${itemName}`;
    } else {
        // Fallback
        const cardNumber = detailData.card_number || id;
        const name = encodeURIComponent(detailData.name || '');
        url = `/nft/ti_log.html?level=category&card_number=${cardNumber}&name=${name}`;
    }

    if (url) {
        window.location.href = url;
    } else {
        showToast(t('error'), t('unable_to_view_transactions'));
    }
}

// ============================================================
// RENDER DETAIL
// ============================================================
function renderDetail() {
    const displayName = currentLang === 'zh' ? (detailData.name_zh || detailData.name) : detailData.name;
    const displayDesc = currentLang === 'zh' ? (detailData.description_zh || detailData.description) : detailData.description;
    const displayDetails = currentLang === 'zh' ? (detailData.details_zh || detailData.details) : detailData.details;
    const elementId = `logo-${item.id}-${index}`;
    
    const logoHtml = renderLogo(
        itemType,
        item.name,
        item.id,
        'nft-logo',
        displayName(item),
        elementId
    );

    document.getElementById('detail-title').textContent = displayName;
    document.getElementById('detail-id').textContent = `#${detailData.id}`;
    document.getElementById('detail-type-badge').textContent = t(detailData.type || 'item') || detailData.type || 'Item';
    // Update title section with logo
    const titleSection = document.querySelector('.title-section');
    titleSection.innerHTML = `
        ${logoHtml}
        <div style="display:inline-block;vertical-align:middle;">
            <h1 id="detail-title" style="margin:0;">${displayName}</h1>
            <div class="subtitle">
                <span id="detail-id">#${detailData.id}</span>
                <span class="type-badge" id="detail-type-badge">${t(detailData.type || 'item')}</span>
            </div>
        </div>
    `;

    // Breadcrumb
    let parentName = '';
    let parentLink = '';
    if (detailData.type === 'category') {
        parentName = t('categories');
        parentLink = '/nft/categories.html';
    } else if (detailData.type === 'subcategory') {
        parentName = detailData.category_name || t('categories');
        parentLink = `/nft/items.html?level=category&id=${detailData.category_id || detailData.id}`;
    } else if (detailData.type === 'item') {
        parentName = detailData.subcategory_name || detailData.category_name || t('items');
        parentLink = `/nft/items.html?level=subcategory&id=${detailData.subcategory_id || detailData.id}`;
    } else {
        parentName = t('items');
        parentLink = '/nft/categories.html';
    }
    document.getElementById('breadcrumb-parent').textContent = parentName;
    document.getElementById('breadcrumb-parent').href = parentLink;
    document.getElementById('breadcrumb-current').textContent = displayName;

    // Transaction button
    const txBtn = document.getElementById('transaction-btn');
    if (txBtn) txBtn.style.display = 'inline-block';

    // Hash
    const hashEl = document.getElementById('detail-hash');
    if (detailData.hash) {
        const hashParts = detailData.hash.match(/.{1,16}/g);
        hashEl.innerHTML = hashParts ? hashParts.join('<br>') : detailData.hash;
    } else {
        hashEl.textContent = 'No hash available';
    }

    // Price
    const priceEl = document.getElementById('detail-price');
    if (detailData.price) {
        priceEl.textContent = `💰 ${detailData.price} root coins`;
    } else {
        priceEl.textContent = '';
    }

    // Description
    document.getElementById('description-display').innerHTML = displayDesc || '<span class="empty-text">' + t('no_description') + '</span>';

    // Details
    document.getElementById('details-display').innerHTML = displayDetails || '<span class="empty-text">' + t('no_details') + '</span>';

    // Attachments
    renderAttachments();

    // QR Code
    // Build a proper detail URL
    const baseUrl = window.location.origin;             // e.g., http://127.0.0.1:5504 or https://d3.p2.rbas.top
    const detailUrl = `${baseUrl}/nft/detail.html?type=${detailData.type || 'item'}&id=${detailData.id}`;
    const qrContent = detailData.shortlink?.trim() || detailUrl || 'https://hku.hk';
    const qrContainer = document.getElementById('detail-qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        const size = window.innerWidth <= 480 ? 120 : 140;
        new QRCode(qrContainer, {
            text: qrContent,
            width: size,
            height: size,
            colorDark: '#003153',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
        }
    }

    // Edit form values
    document.getElementById('edit-description').value = detailData.description || '';
    document.getElementById('edit-details').value = detailData.details || '';

    // Edit button
    const editBtn = document.getElementById('edit-btn');
    if (hasOwnership) {
        editBtn.disabled = false;
        editBtn.textContent = t('edit');
    } else {
        editBtn.disabled = true;
        editBtn.textContent = t('login_to_edit');
    }

    // Show mock indicator if needed
    showMockIndicator();
}

// ============================================================
// RENDER ATTACHMENTS
// ============================================================
function renderAttachments() {
    const container = document.getElementById('attachments-display');
    const attachments = detailData.attachments || [];

    if (attachments.length === 0) {
        container.innerHTML = '<span class="empty-text">' + t('no_attachments') + '</span>';
        return;
    }

    container.innerHTML = '<div class="attachments-list">' +
        attachments.map(att => {
            // Build full file path using stored relative path
            let fullPath = att.path || '';
            if (fullPath && !fullPath.startsWith('http') && !fullPath.startsWith('/')) {
                fullPath = '/' + fullPath;
            }
            if (typeof API_BASE !== 'undefined' && API_BASE && fullPath.startsWith('/')) {
                fullPath = API_BASE + fullPath;
            }

            const displayName = att.filename || att.name || 'file';
            const timestamp = att.timestamp;

            // Determine icon based on file type
            let icon = '<i class="fas fa-file"></i>';
            if (att.type === 'image') {
                icon = '<i class="fas fa-image"></i>';
            } else if (att.type === 'pdf') {
                icon = '<i class="fas fa-file-pdf"></i>';
            } else if (att.type === 'text') {
                icon = '<i class="fas fa-file-alt"></i>';
            }

            return `
                <div class="attachment-item">
                    <div class="attach-info">
                        <span class="attach-icon">${icon}</span>
                        <span class="attach-name">${displayName}</span>
                    </div>
                    <div class="attach-actions">
                        <button class="btn-sm btn-view" onclick="viewAttachment('${fullPath}')" data-i18n="view">View</button>
                        ${hasOwnership ? `<button class="btn-sm btn-rename" onclick="renameAttachment('${timestamp}')" data-i18n="rename">Rename</button>` : ''}
                        ${hasOwnership ? `<button class="btn-sm btn-delete" onclick="deleteAttachment('${timestamp}')" data-i18n="delete">Delete</button>` : ''}
                    </div>
                </div>
            `;
        }).join('') +
        '</div>';
}

// ============================================================
// REFRESH ATTACHMENTS (fetch from server)
// ============================================================
async function refreshAttachments() {
    if (!detailData || !detailData.id) return;
    try {
        const params = new URLSearchParams();
        const level = detailData.type || 'category';
        params.set('level', level);

        const categoryId = detailData.category_id || detailData.id;
        const categoryName = detailData.category_name || detailData.name;
        params.set('category_id', categoryId);
        params.set('category_name', categoryName);

        if (level === 'subcategory' || level === 'item') {
            const subcategoryId = (level === 'subcategory') ? detailData.id : detailData.subcategory_id;
            const subcategoryName = (level === 'subcategory') ? detailData.name : detailData.subcategory_name;
            params.set('subcategory_id', subcategoryId);
            params.set('subcategory_name', subcategoryName);
        }
        if (level === 'item') {
            params.set('item_number', detailData.id);
            params.set('item_name', detailData.name);
        }

        const url = `${API_BASE}/api/content/list?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch attachments');
        const data = await response.json();

        // Convert the server response to our attachment format
        detailData.attachments = data.map(item => ({
            id: item.timestamp,
            timestamp: item.timestamp,
            type: item.type,
            name: item.filename || 'file',
            path: item.path || '' // Keep the full path from server
        }));
        renderAttachments();
    } catch (error) {
        console.warn('Could not refresh attachments:', error);
        // Keep the existing attachments if fetch fails
    }
}

// ============================================================
// OWNERSHIP CHECK
// ============================================================
async function checkOwnership() {
    const info = checkLoginStatus();
    if (!info) {
        hasOwnership = false;
        updateEditUI();
        return;
    }

    try {
        // In production: fetch user's NFTs and check ownership
        // For demo, we check if the user is logged in
        const url = `${API_BASE}/api/user/nfts?wallet=${info.walletid}`;
        const response = await fetch(url);
        if (response.ok) {
            const userNFTs = await response.json();
            
            // Check if user owns this specific NFT based on the actual structure
            const level = detailData.type || 'item';
            const id = String(detailData.id);
            
            hasOwnership = userNFTs.some(nft => {
                // Check based on level
                if (level === 'category') {
                    return nft.level === 'category' && 
                        String(nft.card_number) === id;
                } else if (level === 'subcategory') {
                    return nft.level === 'subcategory' && 
                        String(nft.citang_number) === id;
                } else if (level === 'item') {
                    return nft.level === 'item' && 
                        String(nft.member_number) === id;
                }
                return false;
            });
            
            // For development/demo: if API fails or returns empty, allow editing
            if (!hasOwnership && userNFTs.length === 0) {
                console.log('No NFTs found, allowing edit for demo');
                hasOwnership = true;
            }
        } else {
            // For demo, allow editing if logged in but API fails
            console.warn('Ownership API failed, allowing edit for demo');
            hasOwnership = true;
        }
    } catch (e) {
        console.warn('Ownership check failed, allowing edit for demo', e);
        hasOwnership = true;
    }

    updateEditUI();
}

function updateEditUI() {
    const editBtn = document.getElementById('edit-btn');
    const deleteBtn = document.getElementById('delete-btn');
    if (hasOwnership) {
        editBtn.disabled = false;
        editBtn.textContent = t('edit');
        deleteBtn.style.display = 'inline-block';
    } else {
        editBtn.disabled = true;
        editBtn.textContent = t('login_to_edit');
        deleteBtn.style.display = 'none';
    }
    // Re-render attachments to show/hide rename/delete buttons
    renderAttachments();
}

// ============================================================
// EDIT MODE
// ============================================================
function toggleEditMode() {
    if (!hasOwnership) {
        showToast(t('permission_denied'), t('login_to_edit'));
        handleLogin();
        return;
    }
    isEditMode = !isEditMode;

    if (isEditMode) {
        // Enter edit mode
        document.getElementById('view-mode').style.display = 'none';
        document.getElementById('edit-mode').style.display = 'block';
        document.getElementById('edit-btn').style.display = 'none';
        document.getElementById('save-btn').style.display = 'inline-block';
        document.getElementById('cancel-btn').style.display = 'inline-block';
        // Set form values from current data
        document.getElementById('edit-description').value = detailData.description || '';
        document.getElementById('edit-details').value = detailData.details || '';
    } else {
        // Exit edit mode (cancel)
        cancelEdit();
    }
}

function cancelEdit() {
    isEditMode = false;
    document.getElementById('view-mode').style.display = 'block';
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('edit-btn').style.display = 'inline-block';
    document.getElementById('save-btn').style.display = 'none';
    document.getElementById('cancel-btn').style.display = 'none';
    // Reset form values
    document.getElementById('edit-description').value = detailData.description || '';
    document.getElementById('edit-details').value = detailData.details || '';
    pendingUploads = [];
    document.getElementById('pending-list').innerHTML = '';
}

// ============================================================
// DELETE MODE
// ============================================================
async function deleteEntity() {
    const type = detailData.type || 'category';
    const id = detailData.id;
    const name = detailData.name;
    const wallet = checkLoginStatus()?.walletid;
    if (!wallet) {
        showToast(t('please_login'), 'warning');
        return;
    }

    let confirmMsg = t('confirm_delete_entity') || `Are you sure you want to delete this ${type}?`;
    if (!confirm(confirmMsg)) return;

    let endpoint = '';
    let body = { wallet };

    if (type === 'category') {
        endpoint = '/api/category/delete';
        body.category_id = id;
    } else if (type === 'subcategory' || type === 'item') {
        // For subcategory or item we need parent info
        const categoryId = detailData.category_id || detailData.id;
        const categoryName = detailData.category_name || detailData.name;
        const subId = detailData.subcategory_id || detailData.id;
        const subName = detailData.subcategory_name || detailData.name;
        if (type === 'subcategory') {
            endpoint = '/api/subcategory/delete';
            body.category_id = categoryId;
            body.category_name = categoryName;
            body.subcategory_id = subId;
            body.subcategory_name = subName;
        } else { // item
            endpoint = '/api/item/delete';
            body.category_id = categoryId;
            body.category_name = categoryName;
            body.subcategory_id = subId;
            body.subcategory_name = subName;
            body.item_number = id;
            body.item_name = name;
        }
    } else {
        showToast('Unknown type', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message || 'Deleted', 'success');
            // Redirect to parent page or categories
            setTimeout(() => {
                if (type === 'category') {
                    window.location.href = '/nft/categories.html';
                } else {
                    window.location.href = `/nft/items.html?level=category&id=${body.category_id}`;
                }
            }, 1000);
        } else {
            showToast(result.error || 'Deletion failed', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Network error', 'error');
    }
}

// ============================================================
// SAVE CHANGES
// ============================================================
async function saveChanges() {
    if (!hasOwnership) {
        showToast(t('permission_denied'), t('login_to_edit'));
        return;
    }
    const newDescription = document.getElementById('edit-description').value.trim();
    const newDetails = document.getElementById('edit-details').value.trim();

    const payload = {
        level: detailData.type, // 'category', 'subcategory', or 'item'
        category_id: detailData.category_id || detailData.id,
        category_name: detailData.category_name || detailData.name,
        description: newDescription,
        details: newDetails,
        wallet: checkLoginStatus()?.walletid
    };

    // Add extra fields based on level
    if (detailData.type === 'subcategory') {
        payload.subcategory_id = detailData.id;
        payload.subcategory_name = detailData.name;
    } else if (detailData.type === 'item') {
        payload.subcategory_id = detailData.subcategory_id;
        payload.subcategory_name = detailData.subcategory_name;
        payload.item_number = detailData.id;
        payload.item_name = detailData.name;
    }

    try {
        const response = await fetch(`${API_BASE}/api/content/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.success) {
            showToast(t('success'), t('changes_saved'));
            // Update local data
            detailData.description = newDescription;
            detailData.details = newDetails;
            // Re-render view mode
            const displayDesc = currentLang === 'zh' ? (detailData.description_zh || detailData.description) : detailData.description;
            const displayDetails = currentLang === 'zh' ? (detailData.details_zh || detailData.details) : detailData.details;
            document.getElementById('description-display').innerHTML = displayDesc || '<span class="empty-text">' + t('no_description') + '</span>';
            document.getElementById('details-display').innerHTML = displayDetails || '<span class="empty-text">' + t('no_details') + '</span>';
            // Exit edit mode
            cancelEdit();
        } else {
            showToast(t('error'), result.error || t('save_failed'));
        }
    } catch (error) {
        console.error('Save failed:', error);
        showToast(t('error'), t('network_error'));
    }
}

// ============================================================
// UPLOAD FUNCTIONS (now with real API calls)
// ============================================================
// Helper: build form data for file uploads
function getUploadFormData(type, file, text) {
    const formData = new FormData();
    const level = detailData.type || 'category';
    formData.append('level', level);

    // Category info – use category_id/name from detailData, fallback to id/name
    const categoryId = detailData.category_id || detailData.id;
    const categoryName = detailData.category_name || detailData.name;
    formData.append('category_id', categoryId);
    formData.append('category_name', categoryName);

    // Subcategory info (if level is subcategory or item)
    if (level === 'subcategory' || level === 'item') {
        const subcategoryId = (level === 'subcategory') ? detailData.id : detailData.subcategory_id;
        const subcategoryName = (level === 'subcategory') ? detailData.name : detailData.subcategory_name;
        formData.append('subcategory_id', subcategoryId);
        formData.append('subcategory_name', subcategoryName);
    }

    // Item info (if level is item)
    if (level === 'item') {
        formData.append('item_number', detailData.id);
        formData.append('item_name', detailData.name);
    }

    formData.append('type', type);
    if (type === 'text') {
        formData.append('text', text);
    } else {
        formData.append('file', file);
    }
    return formData;
}

function selectUploadType(type) {
    document.querySelectorAll('.upload-option').forEach(el => el.classList.remove('active'));
    document.querySelector(`.upload-option[data-type="${type}"]`).classList.add('active');
    document.querySelectorAll('.upload-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`upload-${type}`).classList.add('active');
    // Reset file selection
    selectedFile = null;
    selectedFileType = '';
    document.getElementById('image-file-name').textContent = t('no_file');
    document.getElementById('pdf-file-name').textContent = t('no_file');
    document.getElementById('image-preview').style.display = 'none';
}

function handleFileSelect(type) {
    const input = document.getElementById(type === 'image' ? 'image-file-input' : 'pdf-file-input');
    const file = input.files[0];
    const clearBtn = document.getElementById(type === 'image' ? 'image-clear-btn' : 'pdf-clear-btn');

    if (!file) {
        selectedFile = null;
        selectedFileType = '';
        document.getElementById(`${type}-file-name`).textContent = t('no_file');
        if (clearBtn) clearBtn.style.display = 'none';
        if (type === 'image') {
            document.getElementById('image-preview').style.display = 'none';
        }
        return;
    }

    selectedFile = file;
    selectedFileType = type;
    document.getElementById(`${type}-file-name`).textContent = file.name;
    if (clearBtn) clearBtn.style.display = 'inline-block';

    // Add to pending uploads
    pendingUploads.push({
        type: type,
        name: file.name,
        content: type === 'text' ? '' : ''
    });
    renderPendingUploads();

    if (type === 'image') {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('image-preview-img').src = e.target.result;
            document.getElementById('image-preview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function clearSelectedFile(type) {
    const input = document.getElementById(type === 'image' ? 'image-file-input' : 'pdf-file-input');
    const clearBtn = document.getElementById(type === 'image' ? 'image-clear-btn' : 'pdf-clear-btn');

    // Reset the file input
    input.value = '';
    selectedFile = null;
    selectedFileType = '';
    document.getElementById(`${type}-file-name`).textContent = t('no_file');
    if (clearBtn) clearBtn.style.display = 'none';

    if (type === 'image') {
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('image-preview-img').src = '';
    }
}

async function uploadText() {
    const text = document.getElementById('upload-text-input').value.trim();
    if (!text) {
        showToast(t('error'), t('enter_text'));
        return;
    }

    const btn = document.querySelector('#upload-text .btn-save');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    
    try {
        const formData = getUploadFormData('text', null, text);
        const response = await fetch(`${API_BASE}/api/content/upload`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        await refreshAttachments();
        document.getElementById('upload-text-input').value = '';
        showToast(t('success'), t('text_added'));
    } catch (error) {
        console.error('Upload failed:', error);
        showToast(t('error'), error.message || t('upload_failed'));
    } finally {
        btn.disabled = false;
        btn.textContent = t('add_text');
    }
}

async function uploadImage() {
    if (!selectedFile || selectedFileType !== 'image') {
        showToast(t('error'), t('select_image'));
        return;
    }

    const btn = document.querySelector('#upload-image .btn-save');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
        const formData = getUploadFormData('image', selectedFile);
        const response = await fetch(`${API_BASE}/api/content/upload`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        await refreshAttachments();
        // Reset file input
        selectedFile = null;
        selectedFileType = '';
        document.getElementById('image-file-input').value = '';
        document.getElementById('image-file-name').textContent = t('no_file');
        document.getElementById('image-preview').style.display = 'none';
        clearSelectedFile('image');
        showToast(t('success'), t('image_added'));
    } catch (error) {
        console.error('Upload failed:', error);
        showToast(t('error'), error.message || t('upload_failed'));
    } finally {
        btn.disabled = false;
        btn.textContent = t('upload_image');
    }
}

async function uploadPDF() {
    if (!selectedFile || selectedFileType !== 'pdf') {
        showToast(t('error'), t('select_pdf'));
        return;
    }

    const btn = document.querySelector('#upload-pdf .btn-save');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
        const formData = getUploadFormData('pdf', selectedFile);
        const response = await fetch(`${API_BASE}/api/content/upload`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        await refreshAttachments();
        // Reset file input
        selectedFile = null;
        selectedFileType = '';
        document.getElementById('pdf-file-input').value = '';
        document.getElementById('pdf-file-name').textContent = t('no_file');
        clearSelectedFile('pdf');
        showToast(t('success'), t('pdf_added'));
    } catch (error) {
        console.error('Upload failed:', error);
        showToast(t('error'), error.message || t('upload_failed'));
    } finally {
        btn.disabled = false;
        btn.textContent = t('upload_pdf');
    }
}

function renderPendingUploads() {
    const container = document.getElementById('pending-list');
    if (pendingUploads.length === 0) {
        container.innerHTML = '<span style="color:#aaa;">' + t('no_pending_uploads') + '</span>';
        return;
    }
    container.innerHTML = pendingUploads.map((item, index) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:#f8f9fa; border-radius:4px; margin-bottom:4px;">
            <span>
                ${item.type === 'text' ? '📝' : item.type === 'image' ? '🖼️' : '📄'}
                ${item.type === 'text' ? (item.content.substring(0, 30) + (item.content.length > 30 ? '...' : '')) : item.name}
            </span>
            <button onclick="removePendingUpload(${index})" style="background:#dc3545; color:white; border:none; padding:2px 10px; border-radius:4px; cursor:pointer; font-size:0.75rem;">✕</button>
        </div>
    `).join('');
}

function removePendingUpload(index) {
    pendingUploads.splice(index, 1);
    renderPendingUploads();
}

// ============================================================
// ATTACHMENT ACTIONS (View, Delete, Rename)
// ============================================================
function viewAttachment(url) {
    window.open(url, '_blank');
}

async function deleteAttachment(timestamp) {
    if (!confirm(t('confirm_delete'))) return;

    try {
        const level = detailData.type || 'category';
        const payload = {
            level: level,
            category_id: detailData.category_id || detailData.id,
            category_name: detailData.category_name || detailData.name,
            timestamp: timestamp
        };

        if (level === 'subcategory') {
            payload.subcategory_id = detailData.id;
            payload.subcategory_name = detailData.name;
        } else if (level === 'item') {
            payload.subcategory_id = detailData.subcategory_id || detailData.id;
            payload.subcategory_name = detailData.subcategory_name || detailData.name;
            payload.item_number = detailData.id;
            payload.item_name = detailData.name;
        }

        const response = await fetch(`${API_BASE}/api/content/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Delete failed');
        const result = await response.json();
        showToast(t('success'), t('attachment_deleted'));
        await refreshAttachments();
    } catch (error) {
        console.error('Delete failed:', error);
        showToast(t('error'), error.message || t('delete_failed'));
    }
}

async function renameAttachment(timestamp) {
    // Find the attachment in detailData
    const attachment = detailData.attachments.find(a => String(a.timestamp) === String(timestamp));
    if (!attachment) {
        showToast(t('error'), 'Attachment not found');
        return;
    }

    const currentName = attachment.name || attachment.filename || 'file';
    const newName = prompt(t('rename_prompt') || 'Enter new name for the file:', currentName);
    if (newName === null || newName.trim() === '') return; // canceled or empty

    if (!hasOwnership) {
        showToast(t('permission_denied'), t('login_to_edit'));
        return;
    }

    try {
        const level = detailData.type || 'category';
        const payload = {
            level: level,
            category_id: detailData.category_id || detailData.id,
            category_name: detailData.category_name || detailData.name,
            timestamp: timestamp,
            new_name: newName.trim()
        };

        if (level === 'subcategory') {
            payload.subcategory_id = detailData.id;
            payload.subcategory_name = detailData.name;
        } else if (level === 'item') {
            payload.subcategory_id = detailData.subcategory_id || detailData.id;
            payload.subcategory_name = detailData.subcategory_name || detailData.name;
            payload.item_number = detailData.id;
            payload.item_name = detailData.name;
        }

        const response = await fetch(`${API_BASE}/api/content/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Rename failed');
        const result = await response.json();
        showToast(t('success'), t('rename_success') || 'File renamed');
        await refreshAttachments();
    } catch (error) {
        console.error('Rename failed:', error);
        showToast(t('error'), error.message || t('rename_failed'));
    }
}

// ============================================================
// NAVIGATION
// ============================================================
function goBack() {
    window.history.back();
}

// ============================================================
// RESIZE HANDLER FOR QR
// ============================================================
let resizeTimer;
window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (detailData && detailData.hash) {
            const qrContainer = document.getElementById('detail-qrcode');
            if (qrContainer) {
                const size = window.innerWidth <= 480 ? 120 : 140;
                const qrContent = detailData.shortlink?.trim() || detailData.hash?.trim() || 'https://hku.hk';
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, {
                    text: qrContent,
                    width: size,
                    height: size,
                    colorDark: '#003153',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
                const canvas = qrContainer.querySelector('canvas');
                if (canvas) {
                    canvas.style.width = '100%';
                    canvas.style.height = '100%';
                    canvas.style.display = 'block';
                }
            }
        }
    }, 300);
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
    await loadDetail();

    const info = checkLoginStatus();
    if (info) {
        const loginBtn = document.getElementById('login-btn');
        loginBtn.textContent = info.name || 'User';
        loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
    }

    // Listen for wallet login
    document.addEventListener('wallet-login-success', (e) => {
        const detail = e.detail;
        if (detail && detail.walletid) {
            const loginBtn = document.getElementById('login-btn');
            loginBtn.textContent = detail.name || 'User';
            loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
            checkOwnership();
            showToast(t('login_success'));
        }
    });

    initBackToTop();

    // Make functions globally accessible
    window.toggleLanguage = toggleLanguage;
    window.handleLogin = handleLogin;
    window.goBack = goBack;
    window.toggleEditMode = toggleEditMode;
    window.cancelEdit = cancelEdit;
    window.saveChanges = saveChanges;
    window.selectUploadType = selectUploadType;
    window.handleFileSelect = handleFileSelect;
    window.uploadText = uploadText;
    window.uploadImage = uploadImage;
    window.uploadPDF = uploadPDF;
    window.removePendingUpload = removePendingUpload;
    window.viewAttachment = viewAttachment;
    window.deleteAttachment = deleteAttachment;
    window.renameAttachment = renameAttachment;
    window.hideToast = hideToast;
    window.refreshAttachments = refreshAttachments;
}

init();