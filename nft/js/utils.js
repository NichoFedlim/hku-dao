// ============================================================
// utils.js - Shared utility functions for HKU DAO
// ============================================================

// ============================================================
// NFT LOGO HELPER: Real Image + Fallback with Initials/Icon
// ============================================================

// Cache for image existence checks
const imageCache = new Map();

/**
 * Check if an image exists using a HEAD request
 * @param {string} url - Image URL to check
 * @returns {Promise<boolean>} True if image exists
 */
async function imageExists(url) {
    // Check cache first
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }
    
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const exists = response.ok;
        imageCache.set(url, exists);
        return exists;
    } catch (error) {
        imageCache.set(url, false);
        return false;
    }
}

/**
 * Find the first existing image from a list of URLs
 * @param {string[]} urls - Array of image URLs to check
 * @returns {Promise<string|null>} First existing URL or null
 */
async function findExistingImage(urls) {
    for (const url of urls) {
        const exists = await imageExists(url);
        if (exists) {
            return url;
        }
    }
    return null;
}

/**
 * Build image URL from local storage based on your actual file naming
 * @param {string} type - Category type (faculties, buildings, etc.)
 * @param {string} name - Name of the entity
 * @param {number|string} id - ID of the entity (optional)
 * @returns {string[]} Array of image URLs to try
 */
function getImageUrls(type, name, id) {
    // Define folder mapping based on type
    const folderMap = {
        faculties: 'faculties',
        faculty: 'faculties',
        'main-campus': 'buildings',
        'centennial-campus': 'buildings',
        halls: 'halls',
        medical: 'medical',
        sports: 'sports',
        history: 'history',
        culture: 'culture',
        other: 'other'
    };
    
    const folder = folderMap[type] || 'other';
    
    // Convert name to match your actual file naming
    let filename = name
        .toLowerCase()
        // Handle special cases
        .replace(/business & economics/i, 'business_school')
        .replace(/social sciences/i, 'social_science')
        .replace(/engineering/i, 'engg')
        .replace(/&/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    
    // If it's a faculty, prefix with "hku_"
    if (type === 'faculties' || type === 'faculty') {
        if (!filename.startsWith('hku_')) {
            filename = 'hku_' + filename;
        }
    }
    
    // Build the full path
    const basePath = `/nft/image/${folder}/`;
    
    // Return array of possible extensions
    return [
        `${basePath}${filename}.png`,
        `${basePath}${filename}.jpg`,
        `${basePath}${filename}.jpeg`,
        `${basePath}${filename}.webp`
    ];
}

/**
 * Get NFT logo configuration (image + fallback) - Async version
 * @param {string} type - Category type
 * @param {string} name - Name of the entity
 * @param {number|string} id - ID of the entity
 * @param {string} customImage - Optional custom image URL
 * @returns {Promise<Object>} Logo configuration
 */
async function getNftLogoAsync(type, name, id, customImage = null) {
    // If custom image is provided, use it
    if (customImage && typeof customImage === 'string' && customImage.trim() !== '') {
        return {
            type: 'image',
            url: customImage
        };
    }
    
    // Get image URLs from storage
    const urls = getImageUrls(type, name, id);
    
    // Check which image exists (if any)
    const existingImage = await findExistingImage(urls);
    
    // Get initials from name (for fallback)
    const initials = name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
    
    // Define fallback colors per type
    const typeColors = {
        faculties: '#1a5276',
        faculty: '#1a5276',
        'main-campus': '#2e86c1',
        'centennial-campus': '#5dade2',
        buildings: '#2e86c1',
        halls: '#27ae60',
        medical: '#e74c3c',
        sports: '#f39c12',
        history: '#8e44ad',
        culture: '#d35400',
        other: '#7f8c8d'
    };
    const color = typeColors[type] || '#95a5a6';
    
    return {
        type: existingImage ? 'image' : 'fallback',
        url: existingImage || null,
        initials: initials,
        color: color,
        name: name
    };
}

/**
 * Generate HTML for logo display (synchronous, uses placeholder)
 * This is the synchronous version that renders a placeholder first,
 * then updates it when the image check completes
 * @param {Object} logo - Logo configuration from getNftLogo()
 * @param {string} className - CSS class name (e.g., 'nft-logo', 'detail-logo')
 * @param {string} altText - Alt text for image
 * @param {string} elementId - Optional ID for the logo element (for async updates)
 * @returns {string} HTML string
 */
function renderLogoPlaceholder(logo, className = 'nft-logo', altText = 'NFT', elementId = null) {
    if (!logo) {
        return `<div class="${className}" style="background:#95a5a6;color:white;font-weight:bold;font-size:1.2rem;display:flex;align-items:center;justify-content:center;">?</div>`;
    }
    
    const initials = logo.initials || '?';
    const color = logo.color || '#95a5a6';
    const idAttr = elementId ? `id="${elementId}"` : '';
    
    // If we have a URL, render with placeholder that will be updated
    if (logo.url) {
        return `
            <div ${idAttr} class="${className}" style="background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.5rem;overflow:hidden;position:relative;">
                <span style="position:relative;z-index:2;">${initials}</span>
                <img src="${logo.url}" 
                     alt="${altText}" 
                     style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;object-fit:cover;z-index:1;"
                     onload="this.style.display='block';this.parentElement.querySelector('span').style.display='none';this.parentElement.style.background='transparent';"
                     onerror="this.style.display='none';this.parentElement.querySelector('span').style.display='block';this.parentElement.style.background='${color}';" />
            </div>
        `;
    }
    
    // Fallback: just initials with color
    return `
        <div ${idAttr} class="${className}" style="background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.5rem;">
            ${initials}
        </div>
    `;
}

/**
 * Get logo and render it (synchronous version that checks cache)
 * This is a synchronous version that uses the cache - call this in render functions
 * @param {string} type - Category type
 * @param {string} name - Name of the entity
 * @param {number|string} id - ID of the entity
 * @param {string} className - CSS class name
 * @param {string} altText - Alt text for image
 * @param {string} elementId - Optional ID for the logo element
 * @param {string} customImage - Optional custom image URL
 * @returns {string} HTML string
 */
function renderLogo(type, name, id, className = 'nft-logo', altText = 'NFT', elementId = null, customImage = null) {
    // Check if we have a cached image URL for this entity
    const cacheKey = `${type}_${name}_${id}`;
    let cachedUrl = null;
    
    // Try to find from cache
    for (const [key, value] of imageCache.entries()) {
        if (key.includes(cacheKey) && value === true) {
            // Find the corresponding URL
            const urls = getImageUrls(type, name, id);
            for (const url of urls) {
                if (imageCache.get(url) === true) {
                    cachedUrl = url;
                    break;
                }
            }
            break;
        }
    }
    
    // Get initials from name
    const initials = name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
    
    // Define fallback colors per type
    const typeColors = {
        faculties: '#1a5276',
        faculty: '#1a5276',
        'main-campus': '#2e86c1',
        'centennial-campus': '#5dade2',
        buildings: '#2e86c1',
        halls: '#27ae60',
        medical: '#e74c3c',
        sports: '#f39c12',
        history: '#8e44ad',
        culture: '#d35400',
        other: '#7f8c8d'
    };
    const color = typeColors[type] || '#95a5a6';
    
    const idAttr = elementId ? `id="${elementId}"` : '';
    
    // If we have a cached image URL, render with it
    if (cachedUrl) {
        return `
            <div ${idAttr} class="${className}" style="background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.5rem;overflow:hidden;position:relative;">
                <span style="position:relative;z-index:2;display:none;">${initials}</span>
                <img src="${cachedUrl}" 
                     alt="${altText}" 
                     style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;object-fit:cover;z-index:1;display:block;"
                     onerror="this.style.display='none';this.parentElement.querySelector('span').style.display='block';this.parentElement.style.background='${color}';" />
            </div>
        `;
    }
    
    // If no cached image, render as initials and trigger async check
    // This avoids the 404 error because we don't try to load the image yet
    const urls = getImageUrls(type, name, id);
    const html = `
        <div ${idAttr} class="${className}" style="background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.5rem;overflow:hidden;position:relative;">
            <span style="position:relative;z-index:2;">${initials}</span>
        </div>
    `;
    
    // Trigger async image check to populate cache for future renders
    // Don't wait for it - just let it run in the background
    if (urls.length > 0) {
        // Use a small delay to not block rendering
        setTimeout(() => {
            findExistingImage(urls).then(existingUrl => {
                if (existingUrl) {
                    // Update the DOM element if it exists
                    const element = document.getElementById(elementId);
                    if (element) {
                        element.style.backgroundImage = `url('${existingUrl}')`;
                        element.style.backgroundSize = 'cover';
                        element.style.backgroundPosition = 'center';
                        element.style.backgroundRepeat = 'no-repeat';
                        element.innerHTML = ''; // Remove initials
                    }
                }
            });
        }, 10);
    }
    
    return html;
}

// ============================================================
// EXPOSE TO GLOBAL SCOPE
// ============================================================

window.getImageUrls = getImageUrls;
window.getNftLogoAsync = getNftLogoAsync;
window.renderLogo = renderLogo;
window.imageCache = imageCache;

console.log('✅ utils.js loaded successfully (logo module with no 404 errors)');
