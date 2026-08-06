// hku_init.js - Full HKU DAO Data Generator

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ============================================================
// 0. CONFIGURATION - Change this based on your environment
// ============================================================
// For local development:
// const BASE_URL = 'http://127.0.0.1:5504';
// For production:
const BASE_URL = 'https://d3.p2.rbas.top';
// Or make it dynamic based on environment:
// const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5504';

// ============================================================
// 1. DAO CONFIG
// ============================================================
const DAO_HASH = crypto.createHash('sha256').update('HKU DAO 港大道').digest('hex').toUpperCase();
const SYSTEM_WALLET = '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E';
const DATA_ROOT = path.join(__dirname, 'nft', 'data');

// ============================================================
// 2. COMPLETE DATA (copied & merged from frontend)
// ============================================================

// Categories (Level 1) – from CATEGORY_DATA_FULL + CATEGORY_DATA_WITH_NFT
const CATEGORIES = [
    // Faculties
    { id: 1, name: 'Architecture', name_zh: '建筑学院', type: 'faculties' },
    { id: 2, name: 'Arts', name_zh: '文学院', type: 'faculties' },
    { id: 3, name: 'Business & Economics', name_zh: '商学院', type: 'faculties' },
    { id: 4, name: 'Dentistry', name_zh: '牙医学院', type: 'faculties' },
    { id: 5, name: 'Education', name_zh: '教育学院', type: 'faculties' },
    { id: 6, name: 'Engineering', name_zh: '工程学院', type: 'faculties' },
    { id: 7, name: 'Law', name_zh: '法学院', type: 'faculties' },
    { id: 8, name: 'Medicine', name_zh: '李嘉诚医学院', type: 'faculties' },
    { id: 9, name: 'Science', name_zh: '理学院', type: 'faculties' },
    { id: 10, name: 'Social Sciences', name_zh: '社会科学学院', type: 'faculties' },
    // Main Campus
    { id: 101, name: 'Main Building', name_zh: '主楼', type: 'main-campus' },
    { id: 102, name: 'Haking Wong Building', name_zh: '王克桢楼', type: 'main-campus' },
    { id: 103, name: 'Chow Yei Ching Building', name_zh: '周亦卿楼', type: 'main-campus' },
    { id: 104, name: 'K.K. Leung Building', name_zh: '梁銶琚楼', type: 'main-campus' },
    { id: 105, name: 'Meng Wah Complex', name_zh: '蒙民伟楼', type: 'main-campus' },
    { id: 106, name: 'Chong Yuet Ming Buildings', name_zh: '庄月明楼', type: 'main-campus' },
    { id: 107, name: 'Hui Oi Chow Science Building', name_zh: '许爱周科学楼', type: 'main-campus' },
    { id: 108, name: 'James Hsioung Lee Science Building', name_zh: '李兆基科学楼', type: 'main-campus' },
    { id: 109, name: 'Kadoorie Biological Sciences Building', name_zh: '嘉道理生物科学楼', type: 'main-campus' },
    { id: 110, name: 'Knowles Building', name_zh: '诺尔斯楼', type: 'main-campus' },
    { id: 111, name: 'Pao Siu Loong Building', name_zh: '包兆龙楼', type: 'main-campus' },
    { id: 112, name: 'Hung Hing Ying Building', name_zh: '孔庆荧楼', type: 'main-campus' },
    { id: 113, name: 'Tang Chi Ngong Building', name_zh: '邓志昂楼', type: 'main-campus' },
    { id: 114, name: 'Fung Ping Shan Building', name_zh: '冯平山楼', type: 'main-campus' },
    { id: 115, name: 'T.T. Tsui Building', name_zh: '徐展堂楼', type: 'main-campus' },
    { id: 116, name: 'Rayson Huang Theatre', name_zh: '黄丽松讲堂', type: 'main-campus' },
    { id: 117, name: 'Tam Wing Fan Innovation Wing', name_zh: '谭荣芬创新翼', type: 'main-campus' },
    // Centennial Campus
    { id: 201, name: 'Cheng Yu Tung Tower', name_zh: '郑裕彤楼', type: 'centennial-campus' },
    { id: 202, name: 'Chi Wah Learning Commons', name_zh: '智华学习共享空间', type: 'centennial-campus' },
    { id: 203, name: 'Lee Shau Kee Lecture Centre', name_zh: '李兆基演讲厅', type: 'centennial-campus' },
    { id: 204, name: 'The Grand Hall', name_zh: '大会堂', type: 'centennial-campus' },
    { id: 205, name: 'Run Run Shaw Tower', name_zh: '邵逸夫楼', type: 'centennial-campus' },
    { id: 206, name: 'The Jockey Club Tower', name_zh: '赛马会楼', type: 'centennial-campus' },
    { id: 207, name: 'Lui Che Woo Law Library', name_zh: '吕志和法律图书馆', type: 'centennial-campusg' },
    { id: 208, name: 'Run Run Shaw Heritage House', name_zh: '邵逸夫文物馆', type: 'centennial-campus' },
    // Halls
    { id: 301, name: 'Eliot Hall', name_zh: '伊利沙伯堂', type: 'halls' },
    { id: 302, name: 'May Hall', name_zh: '梅堂', type: 'halls' },
    { id: 303, name: 'Swire Hall', name_zh: '施德堂', type: 'halls' },
    { id: 304, name: 'Simon K. Y. Lee Hall', name_zh: '李国贤堂', type: 'halls' },
    { id: 305, name: 'Graduate House', name_zh: '研究生宿舍', type: 'halls' },
    { id: 306, name: 'Robert Black College', name_zh: '黑池学院', type: 'halls' },
    { id: 307, name: 'Jockey Club Student Village I', name_zh: '赛马会学生村一期', type: 'halls' },
    { id: 308, name: 'Jockey Club Student Village II', name_zh: '赛马会学生村二期', type: 'halls' },
    { id: 309, name: 'Jockey Club Student Village III', name_zh: '赛马会学生村三期', type: 'halls' },
    { id: 310, name: 'Jockey Club Student Village IV', name_zh: '赛马会学生村四期', type: 'halls' },
    { id: 311, name: "St. John's College", name_zh: '圣约翰学院', type: 'halls' },
    { id: 312, name: 'Ricci Hall', name_zh: '利玛窦堂', type: 'halls' },
    { id: 313, name: 'University Hall', name_zh: '大学堂', type: 'halls' },
    { id: 314, name: 'Mui Fong House', name_zh: '梅芳居', type: 'halls' },
    // Medical
    { id: 401, name: 'Faculty of Medicine Building', name_zh: '医学院大楼', type: 'medical' },
    { id: 402, name: 'Pauline Chan Building', name_zh: '陈瑞球楼', type: 'medical' },
    { id: 403, name: 'Patrick Manson Building', name_zh: '万德楼', type: 'medical' },
    { id: 404, name: 'Jockey Club Building for Interdisciplinary Research', name_zh: '赛马会跨学科研究大楼', type: 'medical' },
    { id: 405, name: 'Dexter H.C. Man Building', name_zh: '文卓诚楼', type: 'medical' },
    // Sports
    { id: 501, name: 'Stanley Ho Sports Centre', name_zh: '何鸿燊体育中心', type: 'sports' },
    { id: 502, name: 'Henry Fok Health and Fitness Complex', name_zh: '霍英东康体大楼', type: 'sports' },
    { id: 503, name: 'Henry Fok Swimming Pool', name_zh: '霍英东游泳池', type: 'sports' },
    // History
    { id: 601, name: '1910 – 1929', name_zh: '1910 – 1929', type: 'history' },
    { id: 602, name: '1930 – 1949', name_zh: '1930 – 1949', type: 'history' },
    { id: 603, name: '1950 – 1969', name_zh: '1950 – 1969', type: 'history' },
    { id: 604, name: '1970 – 1989', name_zh: '1970 – 1989', type: 'history' },
    { id: 605, name: '1990 – 2009', name_zh: '1990 – 2009', type: 'history' },
    { id: 606, name: '2010 – 2029', name_zh: '2010 – 2029', type: 'history' },
    // Culture
    { id: 701, name: 'Dim Sum', name_zh: '点心', type: 'culture' },
    { id: 702, name: 'Peak Hiking Trails', name_zh: '山顶行山径', type: 'culture' },
    { id: 703, name: 'Two-Dish Rice', name_zh: '两餸饭', type: 'culture' },
    { id: 704, name: 'Siu Mei (Roast Meats)', name_zh: '烧味', type: 'culture' }
];

// Subcategories (Level 2) – from SUBCATEGORY_DATA in items.html
const SUBCATEGORIES = {
    // Faculty subcategories (departments)
    1: [ // Architecture
        { id: 101, name: 'Architecture', name_zh: '建筑学系' },
        { id: 102, name: 'Real Estate & Construction', name_zh: '房地产及建设系' },
        { id: 103, name: 'Urban Planning & Design', name_zh: '城市规划及设计系' },
        { id: 104, name: 'Landscape Architecture', name_zh: '景观建筑学部' }
    ],
    2: [ // Arts
        { id: 201, name: 'School of Chinese', name_zh: '中文学院' },
        { id: 202, name: 'School of English', name_zh: '英文学院' },
        { id: 203, name: 'School of Humanities', name_zh: '人文学院' },
        { id: 204, name: 'School of Modern Languages & Cultures', name_zh: '现代语言及文化学院' }
    ],
    3: [ // Business
        { id: 301, name: 'Accounting & Law', name_zh: '会计及法律' },
        { id: 302, name: 'Economics', name_zh: '经济学' },
        { id: 303, name: 'Finance', name_zh: '金融学' },
        { id: 304, name: 'Management', name_zh: '管理学' },
        { id: 305, name: 'Marketing', name_zh: '市场营销学' }
    ],
    4: [ // Dentistry
        { id: 401, name: 'Clinical Disciplines', name_zh: '临床学科' },
        { id: 402, name: 'Institute for Advanced Dentistry', name_zh: '先进牙科研究所' }
    ],
    5: [ // Education
        { id: 501, name: 'Teacher Education', name_zh: '教师教育' },
        { id: 502, name: 'Social Contexts & Policies', name_zh: '社会背景及政策' },
        { id: 503, name: 'Human Communication', name_zh: '人类沟通' }
    ],
    6: [ // Engineering
        { id: 601, name: 'Civil Engineering', name_zh: '土木工程系' },
        { id: 602, name: 'Computer Science', name_zh: '计算机科学系' },
        { id: 603, name: 'Electrical & Electronic Engineering', name_zh: '电机电子工程系' },
        { id: 604, name: 'Industrial & Manufacturing Systems Engineering', name_zh: '工业及制造系统工程系' },
        { id: 605, name: 'Mechanical Engineering', name_zh: '机械工程系' }
    ],
    7: [ // Law
        { id: 701, name: 'Department of Law', name_zh: '法律学系' },
        { id: 702, name: 'Department of Professional Legal Education', name_zh: '专业法律教育系' }
    ],
    8: [ // Medicine
        { id: 801, name: 'Anaesthesiology', name_zh: '麻醉学系' },
        { id: 802, name: 'Clinical Oncology', name_zh: '临床肿瘤学系' },
        { id: 803, name: 'Medicine', name_zh: '内科学系' },
        { id: 804, name: 'Microbiology', name_zh: '微生物学系' },
        { id: 805, name: 'Pathology', name_zh: '病理学系' },
        { id: 806, name: 'Pharmacology & Pharmacy', name_zh: '药理学及药剂学系' },
        { id: 807, name: 'Surgery', name_zh: '外科学系' },
        { id: 808, name: 'School of Public Health', name_zh: '公共卫生学院' }
    ],
    9: [ // Science
        { id: 901, name: 'Chemistry', name_zh: '化学系' },
        { id: 902, name: 'Earth Sciences', name_zh: '地球科学系' },
        { id: 903, name: 'Mathematics', name_zh: '数学系' },
        { id: 904, name: 'Physics', name_zh: '物理系' },
        { id: 905, name: 'Biological Sciences', name_zh: '生物科学学院' },
        { id: 906, name: 'Statistics & Actuarial Science', name_zh: '统计及精算学系' }
    ],
    10: [ // Social Sciences
        { id: 1001, name: 'Geography', name_zh: '地理学系' },
        { id: 1002, name: 'Politics & Public Administration', name_zh: '政治及公共行政学系' },
        { id: 1003, name: 'Psychology', name_zh: '心理学系' },
        { id: 1004, name: 'Social Work & Social Administration', name_zh: '社会工作及社会行政学系' },
        { id: 1005, name: 'Sociology', name_zh: '社会学系' }
    ],
    // Building subcategories (rooms) – for Main Building, etc.
    101: [ // Main Building
        { id: 10101, name: 'Loke Yew Hall', name_zh: '陆佑堂' },
        { id: 10102, name: 'MG14', name_zh: 'MG14室' },
        { id: 10103, name: 'MG20', name_zh: 'MG20室' },
        { id: 10104, name: 'MG21', name_zh: 'MG21室' },
        { id: 10105, name: 'MG22', name_zh: 'MG22室' },
        { id: 10106, name: 'MG23', name_zh: 'MG23室' },
        { id: 10107, name: 'MG24', name_zh: 'MG24室' },
        { id: 10108, name: 'MG25', name_zh: 'MG25室' },
        { id: 10109, name: 'MG26', name_zh: 'MG26室' },
        { id: 10110, name: '1/F', name_zh: '1楼' },
        { id: 10111, name: '2/F', name_zh: '2楼' },
        { id: 10112, name: '3/F', name_zh: '3楼' },
        { id: 10113, name: '4/F', name_zh: '4楼' },
        { id: 10114, name: '5/F', name_zh: '5楼' }
    ],
    102: [ // Haking Wong
        { id: 10201, name: 'HW311', name_zh: 'HW311室' },
        { id: 10202, name: 'HW312', name_zh: 'HW312室' },
        { id: 10203, name: 'HW313', name_zh: 'HW313室' },
        { id: 10204, name: 'HW314', name_zh: 'HW314室' },
        { id: 10205, name: 'HW315', name_zh: 'HW315室' },
        { id: 10206, name: 'HW316', name_zh: 'HW316室' },
        { id: 10207, name: 'HW317', name_zh: 'HW317室' },
        { id: 10208, name: 'HW318', name_zh: 'HW318室' },
        { id: 10209, name: 'HW319', name_zh: 'HW319室' },
        { id: 10210, name: 'HW320', name_zh: 'HW320室' }
    ],
    103: [ // Chow Yei Ching
        { id: 10301, name: 'CYC101', name_zh: 'CYC101室' },
        { id: 10302, name: 'CYC102', name_zh: 'CYC102室' },
        { id: 10303, name: 'CYC103', name_zh: 'CYC103室' },
        { id: 10304, name: 'CYC104', name_zh: 'CYC104室' },
        { id: 10305, name: 'CYC105', name_zh: 'CYC105室' },
        { id: 10306, name: 'CYC106', name_zh: 'CYC106室' },
        { id: 10307, name: 'CYC201', name_zh: 'CYC201室' },
        { id: 10308, name: 'CYC202', name_zh: 'CYC202室' },
        { id: 10309, name: 'CYC203', name_zh: 'CYC203室' },
        { id: 10310, name: 'CYC204', name_zh: 'CYC204室' },
        { id: 10311, name: 'CYC205', name_zh: 'CYC205室' },
        { id: 10312, name: 'CYC206', name_zh: 'CYC206室' },
        { id: 10313, name: 'CYC301', name_zh: 'CYC301室' },
        { id: 10314, name: 'CYC302', name_zh: 'CYC302室' },
        { id: 10315, name: 'CYC303', name_zh: 'CYC303室' },
        { id: 10316, name: 'CYC304', name_zh: 'CYC304室' },
        { id: 10317, name: 'CYC305', name_zh: 'CYC305室' },
        { id: 10318, name: 'CYC306', name_zh: 'CYC306室' }
    ],
    104: [ // K.K. Leung
        { id: 10401, name: 'KKL101', name_zh: 'KKL101室' },
        { id: 10402, name: 'KKL102', name_zh: 'KKL102室' },
        { id: 10403, name: 'KKL103', name_zh: 'KKL103室' },
        { id: 10404, name: 'KKL104', name_zh: 'KKL104室' },
        { id: 10405, name: 'KKL105', name_zh: 'KKL105室' },
        { id: 10406, name: 'KKL106', name_zh: 'KKL106室' },
        { id: 10407, name: 'KKL201', name_zh: 'KKL201室' },
        { id: 10408, name: 'KKL202', name_zh: 'KKL202室' },
        { id: 10409, name: 'KKL203', name_zh: 'KKL203室' },
        { id: 10410, name: 'KKL204', name_zh: 'KKL204室' },
        { id: 10411, name: 'KKL205', name_zh: 'KKL205室' },
        { id: 10412, name: 'KKL206', name_zh: 'KKL206室' },
        { id: 10413, name: 'KKL301', name_zh: 'KKL301室' },
        { id: 10414, name: 'KKL302', name_zh: 'KKL302室' },
        { id: 10415, name: 'KKL303', name_zh: 'KKL303室' },
        { id: 10416, name: 'KKL304', name_zh: 'KKL304室' },
        { id: 10417, name: 'KKL305', name_zh: 'KKL305室' },
        { id: 10418, name: 'KKL306', name_zh: 'KKL306室' }
    ],
    105: [ // Meng Wah
        { id: 10501, name: 'MW101', name_zh: 'MW101室' },
        { id: 10502, name: 'MW102', name_zh: 'MW102室' },
        { id: 10503, name: 'MW103', name_zh: 'MW103室' },
        { id: 10504, name: 'MW104', name_zh: 'MW104室' },
        { id: 10505, name: 'MW105', name_zh: 'MW105室' },
        { id: 10506, name: 'MW106', name_zh: 'MW106室' },
        { id: 10507, name: 'MW201', name_zh: 'MW201室' },
        { id: 10508, name: 'MW202', name_zh: 'MW202室' },
        { id: 10509, name: 'MW203', name_zh: 'MW203室' },
        { id: 10510, name: 'MW204', name_zh: 'MW204室' },
        { id: 10511, name: 'MW205', name_zh: 'MW205室' },
        { id: 10512, name: 'MW206', name_zh: 'MW206室' },
        { id: 10513, name: 'MW301', name_zh: 'MW301室' },
        { id: 10514, name: 'MW302', name_zh: 'MW302室' },
        { id: 10515, name: 'MW303', name_zh: 'MW303室' },
        { id: 10516, name: 'MW304', name_zh: 'MW304室' },
        { id: 10517, name: 'MW305', name_zh: 'MW305室' },
        { id: 10518, name: 'MW306', name_zh: 'MW306室' }
    ],
    201: [ // Cheng Yu Tung
        { id: 20101, name: 'CYT101', name_zh: 'CYT101室' },
        { id: 20102, name: 'CYT102', name_zh: 'CYT102室' },
        { id: 20103, name: 'CYT201', name_zh: 'CYT201室' },
        { id: 20104, name: 'CYT202', name_zh: 'CYT202室' },
        { id: 20105, name: 'CYT301', name_zh: 'CYT301室' },
        { id: 20106, name: 'CYT302', name_zh: 'CYT302室' }
    ],
    301: [ // Eliot Hall
        { id: 30101, name: 'Eliot Hall - Floor 1', name_zh: '伊堂1楼' },
        { id: 30102, name: 'Eliot Hall - Floor 2', name_zh: '伊堂2楼' },
        { id: 30103, name: 'Eliot Hall - Floor 3', name_zh: '伊堂3楼' },
        { id: 30104, name: 'Eliot Hall - Floor 4', name_zh: '伊堂4楼' },
        { id: 30105, name: 'Eliot Hall - Floor 5', name_zh: '伊堂5楼' }
    ]
    // Other subcategories may have no items; they will be left empty.
};

// ============================================================
// 3. HELPER FUNCTIONS
// ============================================================
function getFormattedTime() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function generateVerificationCode(thread, time, price, seller, buyer, chain) {
    const displayData =
        `${thread}\t` +
        `${time}\t` +
        `￥${price}\t` +
        `${seller.slice(0,4)}***${seller.slice(-4)}\t` +
        `${buyer.slice(0,4)}***${buyer.slice(-4)}\t` +
        `${chain.slice(0,4)}...`;
    return crypto.createHash('sha256').update(displayData).digest('hex').toUpperCase();
}

// Helper to generate detail URL
function getDetailUrl(level, id, name, categoryId = null, categoryName = null, subcategoryId = null, subcategoryName = null) {
    let url = `${BASE_URL}/nft/detail.html?type=${level}&id=${id}`;
    if (categoryId) url += `&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName || '')}`;
    if (subcategoryId) url += `&subcategoryId=${subcategoryId}&subcategoryName=${encodeURIComponent(subcategoryName || '')}`;
    if (name) url += `&name=${encodeURIComponent(name)}`;
    return url;
}

// ============================================================
// 4. GENERATE ALL NFT FILES
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log(`🌐 Using BASE_URL: ${BASE_URL}`);
console.log('');

// --- DAO config ---
const daoConfig = {
    name: 'HKU DAO',
    hash: DAO_HASH,
    shortlink: `${BASE_URL}/nft/index_main.html`,
    created: getFormattedTime(),
    total_categories: CATEGORIES.length
};
fs.writeFileSync(path.join(__dirname, 'hku_dao.json'), JSON.stringify(daoConfig, null, 2));
console.log('✅ hku_dao.json created');

// Clear data root
if (fs.existsSync(DATA_ROOT)) {
    fs.rmSync(DATA_ROOT, { recursive: true, force: true });
}
ensureDir(DATA_ROOT);

// For each category
CATEGORIES.forEach(cat => {
    const catHash = crypto.createHash('sha256').update(DAO_HASH + cat.name).digest('hex').toUpperCase();
    const catDir = path.join(DATA_ROOT, `${cat.id}_${cat.name}`);
    ensureDir(catDir);

    // Generate category detail URL
    const catDetailUrl = getDetailUrl('category', cat.id, cat.name);

    // content.json
    const contentData = {
        name: cat.name,
        name_zh: cat.name_zh,
        type: cat.type,
        hash: catHash,
        card_number: cat.id,
        population: 0,
        percent: 0,
        source: [],
        distribution: [],
        history: [],
        modern: [],
        nft_holder: { wallet: SYSTEM_WALLET, phone_number: '', email: '', other: '......' },
        shortlink: catDetailUrl,
        short_code: ''
    };
    fs.writeFileSync(path.join(catDir, 'content.json'), JSON.stringify(contentData, null, 2));

    // content_log.json – initial transaction
    const chain = catHash.slice(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const price = 1000; // default price
    const seller = SYSTEM_WALLET;
    const buyer = SYSTEM_WALLET; // creator owns it initially
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    const next_chain = verification_code.slice(0, 16).toUpperCase();

    const logData = {
        log: [{ thread, time, price, seller, buyer, chain, next_chain, verification_code }],
        nft_holder: { wallet: SYSTEM_WALLET, phone_number: '', email: '', other: '......' }
    };
    fs.writeFileSync(path.join(catDir, 'content_log.json'), JSON.stringify(logData, null, 2));

    console.log(`  ✅ Category: ${cat.id} - ${cat.name}`);

    // --- Subcategories ---
    const subList = SUBCATEGORIES[cat.id] || [];
    subList.forEach(sub => {
        const subHash = crypto.createHash('sha256').update(catHash + sub.name).digest('hex').toUpperCase();
        const subDir = path.join(catDir, `${sub.id}_${sub.name}`);
        ensureDir(subDir);

        // Generate subcategory detail URL
        const subDetailUrl = getDetailUrl('item', sub.id, sub.name, cat.id, cat.name);

        // subcategory.json
        const subData = {
            id: sub.id,
            name: sub.name,
            name_zh: sub.name_zh,
            hash: subHash,
            category_id: cat.id,
            category_name: cat.name,
            purchase_price: 100,
            shortlink: subDetailUrl,
            short_code: '',
            description: '',
            description_zh: ''
        };
        fs.writeFileSync(path.join(subDir, 'subcategory.json'), JSON.stringify(subData, null, 2));

        // subcategory_log.json – initial transaction
        const chain2 = subHash.slice(0, 16).toUpperCase();
        const thread2 = 1;
        const time2 = getFormattedTime();
        const price2 = 100;
        const verification_code2 = generateVerificationCode(thread2, time2, price2, SYSTEM_WALLET, SYSTEM_WALLET, chain2);
        const next_chain2 = verification_code2.slice(0, 16).toUpperCase();
        const logData2 = {
            log: [{ thread: thread2, time: time2, price: price2, seller: SYSTEM_WALLET, buyer: SYSTEM_WALLET, chain: chain2, next_chain: next_chain2, verification_code: verification_code2 }],
            nft_holder: { wallet: SYSTEM_WALLET, phone_number: '', email: '', other: '......' }
        };
        fs.writeFileSync(path.join(subDir, 'subcategory_log.json'), JSON.stringify(logData2, null, 2));

        console.log(`    ✅ Subcategory: ${sub.id} - ${sub.name}`);

        // --- Items (Level 3) – not in current frontend data, but could be added later
        // We'll leave a placeholder; you can extend similarly.
    });
});

// ============================================================
// 5. GENERATE MOCK MARKET DATA (for testing)
// ============================================================
function generateMockMarketData() {
    const marketFile = path.join(DATA_ROOT, 'market.json');
    
    // Check if market data already exists
    if (fs.existsSync(marketFile)) {
        console.log('⚠️ market.json already exists. Delete it first to regenerate.');
        return;
    }
    
    // Read all categories to get their hashes
    const categories = [];
    const dirs = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
    for (const dir of dirs) {
        if (dir.isDirectory()) {
            const match = dir.name.match(/^(\d+)_(.+)$/);
            if (match) {
                const contentPath = path.join(DATA_ROOT, dir.name, 'content.json');
                if (fs.existsSync(contentPath)) {
                    const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                    categories.push({
                        card_number: match[1],
                        surname: match[2],
                        hash: content.hash || '',
                        price: 100 + Math.floor(Math.random() * 500)
                    });
                }
            }
        }
    }
    
    // Create market entries for a few categories (simulating owners listing them)
    const marketData = categories.slice(0, 10).map(cat => ({
        level: 'surname',
        card_number: cat.card_number,
        surname: cat.surname,
        citang_number: '',
        citang_name: '',
        member_number: '',
        member_name: '',
        price: cat.price,
        seller: '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E',
        hash: cat.hash,
        list_time: new Date().toISOString()
    }));
    
    fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    console.log(`✅ Created ${marketData.length} mock market listings`);
}

// Call it at the end of the script
generateMockMarketData();

console.log(`\n🎉 All data generated under ${DATA_ROOT}`);
console.log(`Total categories: ${CATEGORIES.length}`);
console.log('✅ Done.');
console.log(`\n💡 To switch environment, change BASE_URL at the top of this file.`);
