// ============================================================
// api.js – Backend API calls (with mock fallback)
// ============================================================

// Mock data for development (replace with real API calls)
const MOCK_CATEGORIES = [
    { id: 1, name: 'Architecture', name_zh: '建筑学院', subcount: 4 },
    { id: 2, name: 'Arts', name_zh: '文学院', subcount: 4 },
    { id: 3, name: 'Business & Economics', name_zh: '商学院', subcount: 5 },
    { id: 4, name: 'Dentistry', name_zh: '牙医学院', subcount: 2 },
    { id: 5, name: 'Education', name_zh: '教育学院', subcount: 3 },
    { id: 6, name: 'Engineering', name_zh: '工程学院', subcount: 5 },
    { id: 7, name: 'Law', name_zh: '法学院', subcount: 2 },
    { id: 8, name: 'Medicine', name_zh: '李嘉诚医学院', subcount: 9 },
    { id: 9, name: 'Science', name_zh: '理学院', subcount: 6 },
    { id: 10, name: 'Social Sciences', name_zh: '社会科学学院', subcount: 5 }
];

const MOCK_SUBCATEGORIES = {
    1: [ // Architecture
        { id: 101, name: 'Architecture', name_zh: '建筑学系', subcount: 3 },
        { id: 102, name: 'Real Estate & Construction', name_zh: '房地产及建设系', subcount: 2 },
        { id: 103, name: 'Urban Planning & Design', name_zh: '城市规划及设计系', subcount: 2 }
    ],
    6: [ // Engineering
        { id: 601, name: 'Civil Engineering', name_zh: '土木工程系', subcount: 4 },
        { id: 602, name: 'Computer Science', name_zh: '计算机科学系', subcount: 5 },
        { id: 603, name: 'Electrical & Electronic Eng.', name_zh: '电机电子工程系', subcount: 3 }
    ]
};

// Level-3 items (mock)
const MOCK_ITEMS = {
    101: [ // Architecture department
        { id: 10101, name: 'Architectural Design', name_zh: '建筑设计', description: 'Design studio' },
        { id: 10102, name: 'History of Architecture', name_zh: '建筑历史', description: 'History course' }
    ],
    602: [ // Computer Science
        { id: 60201, name: 'Algorithms', name_zh: '算法', description: 'Core CS course' },
        { id: 60202, name: 'Data Structures', name_zh: '数据结构', description: 'Core CS course' },
        { id: 60203, name: 'Machine Learning', name_zh: '机器学习', description: 'AI course' }
    ]
};

// Mock detail for subcategories
const MOCK_SUBCATEGORY_DETAILS = {
    101: { id: 101, name: 'Architecture', name_zh: '建筑学系', description: 'Department of Architecture, HKU', founded: '1912' },
    102: { id: 102, name: 'Real Estate & Construction', name_zh: '房地产及建设系', description: 'Real estate and construction management', founded: '1950' },
    601: { id: 601, name: 'Civil Engineering', name_zh: '土木工程系', description: 'Civil engineering and infrastructure', founded: '1912' },
    602: { id: 602, name: 'Computer Science', name_zh: '计算机科学系', description: 'Computer science and AI', founded: '1984' }
};

export async function getCategories() {
    // In production: const res = await fetch('/api/categories'); return res.json();
    return new Promise(resolve => setTimeout(() => resolve(MOCK_CATEGORIES), 300));
}

export async function getSubcategories(categoryId) {
    // In production: const res = await fetch(`/api/subcategories?category=${categoryId}`);
    return new Promise(resolve => {
        const data = MOCK_SUBCATEGORIES[categoryId] || [];
        setTimeout(() => resolve(data), 300);
    });
}

export async function getSubcategoryDetail(subcategoryId) {
    // Fetch a single subcategory + its items
    // In production: const res = await fetch(`/api/subcategory/${subcategoryId}`);
    // For mock, find in MOCK_SUBCATEGORIES
    const all = Object.values(MOCK_SUBCATEGORIES).flat();
    const found = all.find(s => s.id === subcategoryId);
    return new Promise(resolve => {
        setTimeout(() => resolve(found || null), 200);
    });
}

export async function getItems(subcategoryId) {
    const items = MOCK_ITEMS[subcategoryId] || [];
    return new Promise(resolve => setTimeout(() => resolve(items), 200));
}

// For level-3 item detail (mock)
export async function getItemDetail(itemId) {
    // In production: fetch from /api/item/${itemId}
    // For mock, flatten all items
    const allItems = Object.values(MOCK_ITEMS).flat();
    const found = allItems.find(i => i.id === itemId);
    return new Promise(resolve => setTimeout(() => resolve(found || null), 200));
}

// Transaction logs (mock)
export async function getTransactionLog(level, id) {
    // In production: /api/log?level=${level}&id=${id}
    return new Promise(resolve => {
        setTimeout(() => resolve({
            log: [
                { thread: 1, time: '2026-07-21 10:00', price: 100, seller: '0xABC...', buyer: '0xDEF...', chain: '0x123...', next_chain: '0x456...' },
                { thread: 2, time: '2026-07-20 14:30', price: 150, seller: '0xDEF...', buyer: '0xGHI...', chain: '0x789...', next_chain: '0xABC...' }
            ],
            nft_holder: { wallet: '0x123...', telephone: '+852 1234 5678', email: 'holder@hku.hk' }
        }), 300);
    });
}

// NFT market
export async function getOnSaleNFTs() {
    // In production: /api/nfts/onsale
    return new Promise(resolve => {
        setTimeout(() => resolve([
            { id: 1, level: 'category', name: 'Architecture', price: 500, seller: '0xABC' },
            { id: 2, level: 'subcategory', name: 'Computer Science', price: 300, seller: '0xDEF' }
        ]), 300);
    });
}

// User NFTs
export async function getUserNFTs(wallet) {
    // In production: /api/user/nfts?wallet=...
    return new Promise(resolve => {
        setTimeout(() => resolve([
            { id: 1, level: 'category', name: 'Engineering', purchase_price: 400 },
            { id: 2, level: 'subcategory', name: 'Data Structures', purchase_price: 250 }
        ]), 300);
    });
}
