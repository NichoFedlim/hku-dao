// ============================================================
// main.js – Application initialisation & page routing
// ============================================================

import { loadLanguage, t, applyTranslations, getCurrentLang } from './nft/js/i18n.js';
import { checkLoginStatus, openWalletLogin } from './nft/js/auth.js';
import { getCategories, getSubcategories } from './nft/js/api.js';
import { renderCategoryCard, renderSubcategoryCard, showToast, createLoadingSpinner, getDisplayName } from './nft/js/components.js';

// ===== GLOBALS =====
let allItems = [];
let filteredItems = [];
let currentBatch = 0;
const BATCH_SIZE = 12;
let isLoading = false;
let hasOwnership = false;

// ===== PAGE DETECTION =====
const page = document.body.dataset.page || 'home';
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const grid = document.getElementById('grid');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const addBtn = document.getElementById('add-btn');
const permissionHint = document.getElementById('permission-hint');

// ===== LANGUAGE TOGGLE =====
window.toggleLanguage = async function() {
    const next = getCurrentLang() === 'zh' ? 'en' : 'zh';
    await loadLanguage(next);
    applyTranslations();
    // Re‑render current page data
    if (page === 'categories') loadCategories();
    if (page === 'subcategories') loadSubcategories();
};

// ===== LOGIN =====
window.handleLogin = async function() {
    const info = checkLoginStatus();
    if (info) {
        window.location.href = '/nft/portfolio.html';
        return;
    }
    try {
        const result = await openWalletLogin();
        if (result && result.walletid) {
            hasOwnership = true;
            updateAdminUI();
            showToast(t('login_success'));
        }
    } catch (e) {
        if (e.message !== '用户取消登录') {
            showToast(t('login_error') + ': ' + e.message, 'error');
        }
    }
};

// ===== ADMIN UI =====
function updateAdminUI() {
    const info = checkLoginStatus();
    if (info && hasOwnership) {
        if (addBtn) addBtn.classList.remove('disabled');
        if (permissionHint) {
            permissionHint.textContent = t('admin_owner_hint');
            permissionHint.style.color = '#28a745';
        }
    } else {
        if (addBtn) addBtn.classList.add('disabled');
        if (permissionHint) {
            permissionHint.textContent = info ? t('admin_owner_required') : t('login_to_add');
            permissionHint.style.color = info ? '#f44336' : '#666';
        }
    }
}

// ===== CATEGORIES PAGE =====
async function loadCategories() {
    if (!grid) return;
    grid.innerHTML = createLoadingSpinner();
    try {
        allItems = await getCategories();
        filteredItems = [...allItems];
        currentBatch = 0;
        grid.innerHTML = '';
        renderNextBatch();
    } catch (e) {
        grid.innerHTML = `<p style="color:red;text-align:center;padding:40px;">${t('load_error')}: ${e.message}</p>`;
    }
}

// ===== SUBCATEGORIES PAGE =====
async function loadSubcategories() {
    if (!grid) return;
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get('category');
    if (!categoryId) {
        grid.innerHTML = `<p style="color:red;text-align:center;padding:40px;">${t('missing_category_id')}</p>`;
        return;
    }
    grid.innerHTML = createLoadingSpinner();
    try {
        allItems = await getSubcategories(parseInt(categoryId));
        filteredItems = [...allItems];
        currentBatch = 0;
        grid.innerHTML = '';
        renderNextBatch();
    } catch (e) {
        grid.innerHTML = `<p style="color:red;text-align:center;padding:40px;">${t('load_error')}: ${e.message}</p>`;
    }
}

// ===== RENDER BATCH (shared) =====
function renderNextBatch() {
    if (isLoading) return;
    const data = filteredItems.length ? filteredItems : allItems;
    const start = currentBatch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, data.length);
    if (start >= end) {
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
    }
    isLoading = true;
    const batch = data.slice(start, end);

    // Determine card renderer
    const isCategory = page === 'categories';
    const isSubcategory = page === 'subcategories';

    batch.forEach(item => {
        const cardDiv = document.createElement('div');
        if (isCategory) {
            cardDiv.innerHTML = renderCategoryCard(item);
        } else if (isSubcategory) {
            cardDiv.innerHTML = renderSubcategoryCard(item);
        }
        const card = cardDiv.firstElementChild;
        card.addEventListener('click', () => {
            if (isCategory) {
                window.location.href = `/nft/subcategories.html?category=${item.id}`;
            } else if (isSubcategory) {
                window.location.href = `/nft/subcategory.html?subcategory=${item.id}`;
            }
        });
        grid.appendChild(card);
    });

    currentBatch++;
    isLoading = false;

    if (end < data.length) {
        if (loadMoreContainer) loadMoreContainer.style.display = 'block';
    } else {
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }
}

window.loadMore = function() {
    renderNextBatch();
};

// ===== SEARCH (debounced) =====
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
        filteredItems = [...allItems];
        if (searchStatus) searchStatus.textContent = '';
    } else {
        filteredItems = allItems.filter(item =>
            item.name.toLowerCase().includes(q) ||
            (item.name_zh && item.name_zh.includes(q))
        );
        if (searchStatus) {
            searchStatus.textContent = filteredItems.length ?
                `${t('search_results')}: ${filteredItems.length}` :
                t('search_no_results');
        }
    }
    currentBatch = 0;
    grid.innerHTML = '';
    renderNextBatch();
}, 300);

if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
}

// ===== QR SCAN =====
let scanning = false;
let stream = null;
const scanModal = document.getElementById('scan-modal');
const scanVideo = document.getElementById('scan-video');
const scanResult = document.getElementById('scan-result');
const closeScan = document.getElementById('close-scan');

if (document.getElementById('scan-btn')) {
    document.getElementById('scan-btn').addEventListener('click', () => {
        if (scanModal) scanModal.style.display = 'flex';
        startScanning();
    });
}
if (closeScan) {
    closeScan.addEventListener('click', stopScanning);
}

async function startScanning() {
    try {
        scanning = true;
        if (scanResult) scanResult.textContent = t('scan_qr_preparing');
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (scanVideo) {
            scanVideo.srcObject = stream;
            await scanVideo.play();
            requestAnimationFrame(scanQRCode);
        }
    } catch (e) {
        if (scanResult) scanResult.textContent = t('scan_qr_error') + ': ' + e.message;
        scanning = false;
    }
}

function stopScanning() {
    scanning = false;
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    if (scanModal) scanModal.style.display = 'none';
}

function scanQRCode() {
    if (!scanning || !scanVideo) return;
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
        if (searchInput) {
            searchInput.value = text;
            handleSearch(text);
        }
        stopScanning();
    } else {
        requestAnimationFrame(scanQRCode);
    }
}

// ===== INIT =====
export async function initApp() {
    // Load language
    const savedLang = localStorage.getItem('hku_lang') || 'en';
    await loadLanguage(savedLang);
    applyTranslations();

    // Check login
    const info = checkLoginStatus();
    if (info) {
        // For demo, assume ownership if logged in
        hasOwnership = true;
        updateAdminUI();
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.textContent = info.name || 'User';
            loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
        }
    } else {
        updateAdminUI();
    }

    // Load page data
    if (page === 'categories') await loadCategories();
    if (page === 'subcategories') await loadSubcategories();

    // Add category button (placeholder)
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const info = checkLoginStatus();
            if (!info) {
                showToast(t('login_to_add'), 'warning');
                window.handleLogin();
                return;
            }
            if (!hasOwnership) {
                showToast(t('admin_owner_required'), 'warning');
                return;
            }
            const name = prompt(t('add_category_placeholder'));
            if (name) {
                showToast(t('add_category_success'), 'success');
                // In production: call API to add category
                loadCategories();
            }
        });
    }
}

// Listen for wallet login events
document.addEventListener('wallet-login-success', (e) => {
    const detail = e.detail;
    if (detail && detail.walletid) {
        hasOwnership = true;
        updateAdminUI();
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.textContent = detail.name || 'User';
            loginBtn.onclick = () => window.location.href = '/nft/portfolio.html';
        }
        showToast(t('login_success'));
    }
});

// Auto‑init when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
