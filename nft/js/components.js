// ============================================================
// components.js – UI rendering helpers
// ============================================================

import { t, getCurrentLang } from './i18n.js';

export function renderCategoryCard(category) {
    const lang = getCurrentLang();
    const displayName = lang === 'zh' ? category.name_zh : category.name;
    return `
        <div class="card category-card" data-id="${category.id}">
            <div class="name">${displayName}</div>
            <div class="subcount">${category.subcount || 0} ${t('category_card_subitems')}</div>
        </div>
    `;
}

export function renderSubcategoryCard(sub) {
    const lang = getCurrentLang();
    const displayName = lang === 'zh' ? sub.name_zh : sub.name;
    return `
        <div class="card subcategory-card" data-id="${sub.id}">
            <div class="name">${displayName}</div>
            <div class="subcount">${sub.subcount || 0} ${t('subcategory_card_items')}</div>
        </div>
    `;
}

export function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function createLoadingSpinner() {
    return `<div class="loading-spinner"><div class="loader"></div><p>${t('loading_data')}</p></div>`;
}

export function getDisplayName(item) {
    const lang = getCurrentLang();
    return lang === 'zh' ? item.name_zh : item.name;
}
