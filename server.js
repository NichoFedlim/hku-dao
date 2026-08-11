const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const multer = require('multer');
const ip = require('ip');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 5012;
const IP = ip.address();

// ============================================================
// CONFIGURATION
// ============================================================
const UPLOAD_DIR = 'uploads';
const NFT_DATA_DIR = path.join(__dirname, 'nft', 'data');
const PERSISTENCE_DIR = path.join(__dirname, 'persistence');
const WALLET_STATE_FILE = path.join(PERSISTENCE_DIR, 'wallet_state.json');
const HKU_DAO_FILE = path.join(__dirname, 'hku_dao.json');
const HKU_DAO_QUEUE_FILE = path.join(__dirname, 'hku_dao_queue.json'); // Queue for PS sync
const TRASH_DIR = path.join(__dirname, 'nft', 'trash'); 
const TRASH_LOG_FILE = path.join(TRASH_DIR, 'deletion_log.json'); 

// ============================================================
// CORS
// ============================================================
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            'https://d3.p2.rbas.top',
            'http://192.168.2.2:5000',
            'https://hk.rbas.top',
            'https://dao002.rbas.top',
            'http://localhost:5012',
            'http://127.0.0.1:5012',
            'http://localhost:5013',
            'http://127.0.0.1:5013',
            // Add Live Server ports
            'http://localhost:5504',
            'http://127.0.0.1:5504',
            'http://localhost:5500',
            'http://127.0.0.1:5500'
        ];
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn('[CORS] Source Denied:', origin);
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/rtf'
        ];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file types'), false);
        }
    }
});

// ============================================================
// STATIC FILES
// ============================================================
app.use('/nft', express.static(path.join(__dirname, 'nft')));
app.use(express.static(path.join(__dirname, 'nft')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname));
app.use('/subcategory-data', express.static(path.join(__dirname, 'nft', 'data'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.rtf': 'application/rtf'
        };
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// Serve the main homepage at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'nft', 'index_main.html'));
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function getFormattedTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }
}

function sendError(res, status, message, details = '') {
    res.status(status).json({ error: message, details });
}

function formatWalletShort(wallet) {
    if (!wallet) return 'Unknown';
    if (wallet.length <= 8) return wallet;
    return wallet.slice(0, 4) + '***' + wallet.slice(-4);
}

function formatChainShort(chain) {
    return chain ? chain.slice(0, 4) + '...' : 'Unknown';
}

function generateVerificationCode(thread, time, price, seller, buyer, chain) {
    const displayData =
        `${thread}\t` +
        `${time}\t` +
        `￥${price}\t` +
        `${formatWalletShort(seller)}\t` +
        `${formatWalletShort(buyer)}\t` +
        `${formatChainShort(chain)}`;
    return crypto.createHash('sha256').update(displayData).digest('hex').toUpperCase();
}

function getNFTName(level, category, subcategory, item) {
    switch (level) {
        case 'category': return category;
        case 'subcategory': return `${category} · ${subcategory}`;
        case 'item': return `${category} · ${subcategory} · ${item}`;
        default: return 'NFT';
    }
}

function getNFTDataPath(categoryId, categoryName, subcategoryNumber = null, subcategoryName = null, itemNumber = null, itemName = null) {
    if (!subcategoryNumber) {
        return path.join(NFT_DATA_DIR, `${categoryId}_${categoryName}`);
    }
    if (!itemNumber) {
        return path.join(NFT_DATA_DIR, `${categoryId}_${categoryName}`, `${subcategoryNumber}_${subcategoryName}`);
    }
    return path.join(NFT_DATA_DIR, `${categoryId}_${categoryName}`, `${subcategoryNumber}_${subcategoryName}`, `${itemNumber}_${itemName}`);
}

// ============================================================
// SOFT DELETE / TRASH FUNCTIONS
// ============================================================

function moveToTrash(sourcePath, entityType, entityId, entityName, wallet) {
    ensureDir(TRASH_DIR);
    
    // Create a unique name for the trash item
    const timestamp = Date.now();
    const trashName = `${timestamp}_${entityType}_${entityId}_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const trashPath = path.join(TRASH_DIR, trashName);
    
    // Move the folder to trash
    fs.renameSync(sourcePath, trashPath);
    
    // Log the deletion
    let logs = [];
    if (fs.existsSync(TRASH_LOG_FILE)) {
        try {
            logs = JSON.parse(fs.readFileSync(TRASH_LOG_FILE, 'utf-8'));
        } catch (e) {
            console.warn('Failed to read trash log, creating new one');
        }
    }
    
    const logEntry = {
        id: timestamp,
        originalPath: sourcePath,
        trashPath: trashPath,
        trashName: trashName,
        entityType: entityType,
        entityId: entityId,
        entityName: entityName,
        deletedBy: wallet,
        deletedAt: new Date().toISOString(),
        deletedAtFormatted: getFormattedDateTime(),
        restored: false
    };
    
    logs.push(logEntry);
    fs.writeFileSync(TRASH_LOG_FILE, JSON.stringify(logs, null, 2));
    
    return trashPath;
}

function getTrashItems() {
    ensureDir(TRASH_DIR);
    if (!fs.existsSync(TRASH_LOG_FILE)) {
        return [];
    }
    try {
        const logs = JSON.parse(fs.readFileSync(TRASH_LOG_FILE, 'utf-8'));
        // Filter out restored items
        return logs.filter(item => !item.restored);
    } catch (e) {
        console.error('Failed to read trash log:', e);
        return [];
    }
}

function restoreFromTrash(trashId) {
    const logs = JSON.parse(fs.readFileSync(TRASH_LOG_FILE, 'utf-8'));
    const index = logs.findIndex(item => item.id === trashId && !item.restored);
    
    if (index === -1) {
        throw new Error('Item not found in trash or already restored');
    }
    
    const item = logs[index];
    const sourcePath = item.trashPath;
    const originalPath = item.originalPath;
    
    // Check if original path already exists
    if (fs.existsSync(originalPath)) {
        // Append a timestamp to avoid conflict
        const dirname = path.dirname(originalPath);
        const basename = path.basename(originalPath);
        const newBasename = basename + '_' + Date.now();
        const newPath = path.join(dirname, newBasename);
        fs.renameSync(sourcePath, newPath);
        item.restoredAt = new Date().toISOString();
        item.restoredTo = newPath;
    } else {
        // Move back to original location
        fs.renameSync(sourcePath, originalPath);
        item.restoredAt = new Date().toISOString();
        item.restoredTo = originalPath;
    }
    
    item.restored = true;
    fs.writeFileSync(TRASH_LOG_FILE, JSON.stringify(logs, null, 2));
    
    return item;
}

function permanentDeleteFromTrash(trashId) {
    const logs = JSON.parse(fs.readFileSync(TRASH_LOG_FILE, 'utf-8'));
    const index = logs.findIndex(item => item.id === trashId && !item.restored);
    
    if (index === -1) {
        throw new Error('Item not found in trash or already restored');
    }
    
    const item = logs[index];
    // Delete the folder permanently
    if (fs.existsSync(item.trashPath)) {
        fs.rmSync(item.trashPath, { recursive: true, force: true });
    }
    
    // Remove from log (or mark as permanently deleted)
    logs.splice(index, 1);
    fs.writeFileSync(TRASH_LOG_FILE, JSON.stringify(logs, null, 2));
    
    return true;
}

// ============================================================
// QUEUE FUNCTIONS (hku_dao_queue.json)
// ============================================================
let queueFileLock = false;

function ensureQueueFile() {
    if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) {
        fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify([], null, 2));
        console.log(`📁 Create Queue File: ${HKU_DAO_QUEUE_FILE}`);
    }
}

function getCurrentMaxSeq() {
    try {
        if (fs.existsSync(HKU_DAO_QUEUE_FILE)) {
            const allData = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
            if (Array.isArray(allData) && allData.length > 0) {
                return Math.max(...allData.map(item => item.seq || 0));
            }
        }
        return 0;
    } catch (error) {
        console.error('[Queue] Failed to read maximum sequence number:', error);
        return 0;
    }
}

/**
 * Save a single record to the queue.
 * @param {string} type - 'category', 'subcategory', 'item', or 'purchase'
 * @param {string} code - hash or verification_code
 */
function saveToQueue(type, code) {
    while (queueFileLock) { /* wait */ }
    queueFileLock = true;
    try {
        ensureQueueFile();
        let allData = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        if (!Array.isArray(allData)) allData = [];

        const currentMaxSeq = getCurrentMaxSeq();
        const newSeq = currentMaxSeq + 1;
        const newRecord = {
            seq: newSeq,
            [type === 'purchase' ? 'verification_code' : 'hash']: code,
            type: type,
            created_at: getFormattedDateTime()
        };
        allData.push(newRecord);
        fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify(allData, null, 2));

        const codeType = type === 'purchase' ? 'verification_code' : 'hash';
        console.log(`💾 Queue Saving: seq=${newSeq}, ${codeType}=${code.substring(0,16)}...`);
        return newRecord;
    } catch (error) {
        console.error('❌ Queue save failed:', error);
        return null;
    } finally {
        queueFileLock = false;
    }
}

/**
 * Batch save multiple records (ensures continuous seq numbers)
 */
function batchSaveToQueue(items) {
    while (queueFileLock) { /* wait */ }
    queueFileLock = true;
    try {
        ensureQueueFile();
        let allData = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        if (!Array.isArray(allData)) allData = [];

        let currentMaxSeq = getCurrentMaxSeq();
        const savedRecords = [];
        for (const item of items) {
            currentMaxSeq++;
            const newRecord = {
                seq: currentMaxSeq,
                [item.type === 'purchase' ? 'verification_code' : 'hash']: item.code,
                type: item.type,
                created_at: getFormattedDateTime()
            };
            allData.push(newRecord);
            savedRecords.push(newRecord);
            const codeType = item.type === 'purchase' ? 'verification_code' : 'hash';
            console.log(`💾 Batch Save: seq=${currentMaxSeq}, ${codeType}=${item.code.substring(0,16)}...`);
        }
        fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify(allData, null, 2));
        return savedRecords;
    } catch (error) {
        console.error('❌ Batch save failed:', error);
        return [];
    } finally {
        queueFileLock = false;
    }
}

// Manual cleanup endpoint (for testing, or on demand)
app.post('/api/queue/cleanup', (req, res) => {
    try {
        cleanupQueue();
        res.json({ success: true, message: 'Queue cleanup completed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// SELF-CONTAINED URL SHORTENER (No external API)
// ============================================================

const SHORTCODE_FILE = path.join(__dirname, 'shortcodes.json');

// Ensure shortcode file exists
function ensureShortcodeFile() {
    if (!fs.existsSync(SHORTCODE_FILE)) {
        fs.writeFileSync(SHORTCODE_FILE, JSON.stringify({}, null, 2));
        console.log(`📁 Created shortcode file: ${SHORTCODE_FILE}`);
    }
}

/**
 * Generate a short code using base62 encoding (0-9, a-z, A-Z)
 * @param {number} id - Numeric ID to encode
 * @returns {string} - Base62 encoded string
 */
function encodeBase62(id) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    let num = id;
    while (num > 0) {
        result = chars[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result || '0';
}

/**
 * Decode a base62 string back to number
 * @param {string} str - Base62 encoded string
 * @returns {number} - Decoded number
 */
function decodeBase62(str) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = 0;
    for (let i = 0; i < str.length; i++) {
        result = result * 62 + chars.indexOf(str[i]);
    }
    return result;
}

/**
 * Get the next available ID from the shortcode mappings
 * @returns {number} - Next available ID
 */
function getNextShortcodeId() {
    ensureShortcodeFile();
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    
    // Find the highest ID currently in use
    let maxId = 0;
    for (const key in mappings) {
        const id = mappings[key].id || 0;
        if (id > maxId) maxId = id;
    }
    return maxId + 1;
}

/**
 * Shorten a URL using our own service
 * @param {string} originalUrl - The URL to shorten
 * @param {string} domain - The domain to use (default: https://d3.p2.rbas.top)
 * @returns {Promise<{short_code: string, short_url: string}>}
 */
async function generateShortLinkForNFT(originalUrl, domain = 'https://d3.p2.rbas.top') {
    ensureShortcodeFile();
    
    // Read existing mappings
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    
    // Check if this URL already has a shortcode
    for (const [shortCode, data] of Object.entries(mappings)) {
        if (data.url === originalUrl) {
            return {
                short_code: shortCode,
                short_url: `${domain}/s/${shortCode}`
            };
        }
    }
    
    // Generate new shortcode
    const nextId = getNextShortcodeId();
    const shortCode = encodeBase62(nextId);
    
    // Store the mapping
    mappings[shortCode] = {
        id: nextId,
        url: originalUrl,
        created_at: getFormattedDateTime(),
        created_at_iso: new Date().toISOString()
    };
    
    // Write to file
    fs.writeFileSync(SHORTCODE_FILE, JSON.stringify(mappings, null, 2));
    
    console.log(`🔗 Generated shortcode: ${shortCode} -> ${originalUrl.substring(0, 60)}...`);
    
    return {
        short_code: shortCode,
        short_url: `${domain}/s/${shortCode}`
    };
}

/**
 * Get the original URL from a short code
 * @param {string} shortCode - The short code
 * @returns {string|null} - The original URL or null if not found
 */
function getOriginalUrl(shortCode) {
    ensureShortcodeFile();
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    return mappings[shortCode]?.url || null;
}

/**
 * Get all shortcode statistics
 * @returns {object} - Statistics about shortcodes
 */
function getShortcodeStats() {
    ensureShortcodeFile();
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    return {
        total: Object.keys(mappings).length,
        mappings: mappings
    };
}

// ============================================================
// SHORTLINK GENERATION FUNCTIONS (Using our own shortener)
// ============================================================

// Generate category shortlink
async function generateCategoryShortlink(categoryId, categoryName, baseUrl, domain = 'https://d3.p2.rbas.top') {
    const detailUrl = `${domain}/nft/detail.html?type=category&id=${categoryId}&name=${encodeURIComponent(categoryName)}`;
    
    try {
        const result = await generateShortLinkForNFT(detailUrl, domain);
        return {
            detailUrl,
            shortlink: result.short_url,
            short_code: result.short_code
        };
    } catch (error) {
        console.error(`Failed to generate shortlink for category: ${error.message}`);
        return {
            detailUrl,
            shortlink: detailUrl,
            short_code: ''
        };
    }
}

// Generate subcategory shortlink
async function generateSubcategoryShortlink(categoryId, categoryName, subcategoryId, subcategoryName, baseUrl, domain = 'https://d3.p2.rbas.top') {
    const detailUrl = `${domain}/nft/detail.html?type=subcategory&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName)}&subcategoryId=${subcategoryId}&subcategoryName=${encodeURIComponent(subcategoryName)}`;
    
    try {
        const result = await generateShortLinkForNFT(detailUrl, domain);
        return {
            detailUrl,
            shortlink: result.short_url,
            short_code: result.short_code
        };
    } catch (error) {
        console.error(`Failed to generate shortlink for subcategory: ${error.message}`);
        return {
            detailUrl,
            shortlink: detailUrl,
            short_code: ''
        };
    }
}


// Generate item shortlink
async function generateItemShortlink(categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName, baseUrl, domain = 'https://d3.p2.rbas.top') {
    const detailUrl = `${domain}/nft/detail.html?type=item&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName)}&subcategoryId=${subcategoryId}&subcategoryName=${encodeURIComponent(subcategoryName)}&itemNumber=${itemNumber}&itemName=${encodeURIComponent(itemName)}`;
    
    try {
        const result = await generateShortLinkForNFT(detailUrl, domain);
        return {
            detailUrl,
            shortlink: result.short_url,
            short_code: result.short_code
        };
    } catch (error) {
        console.error(`Failed to generate shortlink for item: ${error.message}`);
        return {
            detailUrl,
            shortlink: detailUrl,
            short_code: ''
        };
    }
}

// ============================================================
// API: REDIRECT SHORTCODE TO ORIGINAL URL
// ============================================================
app.get('/s/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    
    if (!shortCode) {
        return res.status(400).send('Missing short code');
    }
    
    const originalUrl = getOriginalUrl(shortCode);
    
    if (!originalUrl) {
        return res.status(404).send('Short URL not found');
    }
    
    // Redirect to the original URL
    res.redirect(302, originalUrl);
});

// ============================================================
// API: SHORTCODE STATISTICS
// ============================================================
app.get('/api/shortcode/stats', (req, res) => {
    try {
        const stats = getShortcodeStats();
        res.json({ success: true, ...stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API: TEST SHORTLINK GENERATION
// ============================================================
app.get('/api/test-shortlink', async (req, res) => {
    const { type, categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName } = req.query;
    
    try {
        let result;
        const domain = 'https://d3.p2.rbas.top';
        
        if (type === 'category') {
            result = await generateCategoryShortlink(categoryId, categoryName, null, domain);
        } else if (type === 'subcategory') {
            result = await generateSubcategoryShortlink(categoryId, categoryName, subcategoryId, subcategoryName, null, domain);
        } else if (type === 'item') {
            result = await generateItemShortlink(categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName, null, domain);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid type. Use: category, subcategory, or item' });
        }
        
        res.json({ 
            success: true, 
            originalUrl: result.detailUrl,
            shortlink: result.shortlink,
            short_code: result.short_code,
            note: 'Visit the shortlink to be redirected to the original URL'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API: GET ORIGINAL URL FROM SHORTCODE
// ============================================================
app.get('/api/shortcode/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    
    if (!shortCode) {
        return res.status(400).json({ success: false, error: 'Missing short code' });
    }
    
    const originalUrl = getOriginalUrl(shortCode);
    
    if (!originalUrl) {
        return res.status(404).json({ success: false, error: 'Short URL not found' });
    }
    
    res.json({ 
        success: true, 
        short_code: shortCode,
        original_url: originalUrl
    });
});

// ============================================================
// TRANSACTION LOG UPDATE (unified)
// ============================================================
async function updateTransactionLog(level, categoryId, categoryName, subcategoryNumber = null, subcategoryName = null, itemNumber = null, itemName = null, price, seller, buyer) {
    try {
        let logFilePath = '';
        let dataFilePath = '';

        if (level === 'category') {
            const dir = getNFTDataPath(categoryId, categoryName);
            logFilePath = path.join(dir, 'content_log.json');
            dataFilePath = path.join(dir, 'content.json');
        } else if (level === 'subcategory') {
            const dir = getNFTDataPath(categoryId, categoryName, subcategoryNumber, subcategoryName);
            logFilePath = path.join(dir, 'subcategory_log.json');
            dataFilePath = path.join(dir, 'subcategory.json');
        } else if (level === 'item') {
            const dir = getNFTDataPath(categoryId, categoryName, subcategoryNumber, subcategoryName, itemNumber, itemName);
            logFilePath = path.join(dir, `${itemNumber}_${itemName}_log.json`);
            dataFilePath = path.join(dir, `${itemNumber}_${itemName}.json`);
        } else {
            return { success: false, error: 'Invalid level' };
        }

        // Ensure directory exists
        ensureDir(path.dirname(logFilePath));

        // Initialize log file if not exists
        if (!fs.existsSync(logFilePath)) {
            const initialLog = { log: [], nft_holder: {} };
            fs.writeFileSync(logFilePath, JSON.stringify(initialLog, null, 2));
        }

        const logData = JSON.parse(fs.readFileSync(logFilePath, 'utf-8'));
        // Determine chain: if there are previous logs, use last next_chain, else use a default or the entity's hash?
        let chain = "1234567890abcdef";
        if (logData.log.length > 0) {
            const lastLog = logData.log[logData.log.length - 1];
            chain = lastLog.next_chain || chain;
        } else {
            // For first log, we might use the entity's hash (if available) or a default
            // We'll set chain to the hash of the entity (category/subcategory/item) - we'll pass it in or compute later
            // For now, we'll use the entity hash if available; we'll set it outside.
            // We'll override chain parameter; we'll pass it as an argument.
        }

        const thread = (logData.log.length > 0 ? Math.max(...logData.log.map(l => l.thread)) : 0) + 1;
        const time = getFormattedTime();

        const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
        const next_chain = verification_code.substring(0, 16).toUpperCase();

        const newLog = { thread, time, price, seller, buyer, chain, next_chain, verification_code };
        logData.log.push(newLog);
        logData.nft_holder = { wallet: buyer, phone_number: "", email: "", other: "......" };
        fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

        // Update the data file's nft_holder
        if (fs.existsSync(dataFilePath)) {
            const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
            data.nft_holder = logData.nft_holder;
            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
        }

        return { success: true, log: newLog };
    } catch (error) {
        console.error('Transaction log update failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// WALLET CONNECTION (RBAS)
// ============================================================
const WALLET_CONFIG = {
    url: 'ws://192.168.1.26:5000',
    // url: 'https://hk.rbas.top/',
    connected: false,
    ws: null,
    reconnectInterval: 5000,
    pendingRequests: new Map(),
    currentChain: '1234567890abcdef',
    threadCounter: 1,
    wallet_rx: 0,
    wallet_tx: 0,
    requestIndex: 0,
    lastOperationTime: 0
};

// ===== Persistence =====
function ensurePersistenceDir() {
    if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true, mode: 0o755 });
    }
}

function loadWalletState() {
    ensurePersistenceDir();
    if (!fs.existsSync(WALLET_STATE_FILE)) return null;
    try {
        const state = JSON.parse(fs.readFileSync(WALLET_STATE_FILE, 'utf-8'));
        console.log('📂 Persistent wallet state has been loaded successfully.');
        return state;
    } catch (error) {
        console.error('Loading persistent wallet state failed:', error);
        return null;
    }
}

function saveWalletState() {
    try {
        ensurePersistenceDir();
        const state = {
            currentChain: WALLET_CONFIG.currentChain,
            threadCounter: WALLET_CONFIG.threadCounter,
            requestIndex: WALLET_CONFIG.requestIndex,
            lastOperationTime: WALLET_CONFIG.lastOperationTime,
            savedAt: Date.now()
        };
        fs.writeFileSync(WALLET_STATE_FILE, JSON.stringify(state, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save wallet state:', error);
        return false;
    }
}

function initWalletState() {
    const saved = loadWalletState();
    if (saved) {
        if (saved.currentChain) WALLET_CONFIG.currentChain = saved.currentChain;
        if (saved.threadCounter) WALLET_CONFIG.threadCounter = saved.threadCounter;
        if (saved.requestIndex) WALLET_CONFIG.requestIndex = saved.requestIndex;
        console.log(`🔄 Restore from persistent wallet state: chain=${WALLET_CONFIG.currentChain}, thread=${WALLET_CONFIG.threadCounter}`);
    }
}

function calculateWalletNextChain(request) {
    const { next_chain, ...rest } = request;
    return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16).toUpperCase();
}

function initWalletConnection() {
    try {
        WALLET_CONFIG.ws = new WebSocket(WALLET_CONFIG.url);

        WALLET_CONFIG.ws.on('open', () => {
            console.log('✅ Connected to the RBAS wallet system');
            WALLET_CONFIG.connected = true;
            WALLET_CONFIG.lastOperationTime = Date.now();
            saveWalletState();
        });

        WALLET_CONFIG.ws.on('message', (data) => {
            try {
                WALLET_CONFIG.wallet_rx++;
                const response = JSON.parse(data);
                console.log('📥 Received wallet response:', response);
                handleWalletResponse(response);
                WALLET_CONFIG.lastOperationTime = Date.now();
                logWalletCommunication('response', response);
            } catch (e) {
                console.error('Wallet response parsing failed:', e);
            }
        });

        WALLET_CONFIG.ws.on('close', () => {
            console.warn('⚠️  Wallet connection lost, attempting to reconnect....');
            WALLET_CONFIG.connected = false;
            setTimeout(initWalletConnection, WALLET_CONFIG.reconnectInterval);
        });

        WALLET_CONFIG.ws.on('error', (err) => {
            console.error('❌ Wallet connection error:', err);
            WALLET_CONFIG.connected = false;
        });
    } catch (error) {
        console.error('Wallet system initialization failed:', error);
    }
}

function handleWalletResponse(response) {
    for (const [requestId, callback] of WALLET_CONFIG.pendingRequests.entries()) {
        if (response.dao_id === callback.dao_id && response.thread === callback.thread) {
            WALLET_CONFIG.pendingRequests.delete(requestId);
            callback.resolve(response);
            return;
        }
    }
}

async function sendToWallet(request) {
    return new Promise((resolve, reject) => {
        if (!WALLET_CONFIG.connected) {
            reject(new Error('Wallet not connected'));
            return;
        }

        const requestId = Date.now().toString();
        const timeout = setTimeout(() => {
            WALLET_CONFIG.pendingRequests.delete(requestId);
            reject(new Error('Wallet response timeout'));
        }, 60000);

        WALLET_CONFIG.pendingRequests.set(requestId, {
            resolve: (response) => { clearTimeout(timeout); resolve(response); },
            reject: (error) => { clearTimeout(timeout); reject(error); },
            dao_id: request.dao_id,
            thread: request.thread
        });

        WALLET_CONFIG.ws.send(JSON.stringify(request));
        WALLET_CONFIG.wallet_tx++;
        logWalletCommunication('request', request);
        console.log(`📤 Send request to wallet (thread: ${request.thread})`);
    });
}

// ============================================================
// WALLET OPERATIONS
// ============================================================

async function walletRequestCode(name, phone) {
    const thread = WALLET_CONFIG.threadCounter++;
    const currentChain = WALLET_CONFIG.currentChain;

    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "code_request",
        name: name,
        phone: phone
    };
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();

    try {
        const response = await sendToWallet(finalRequest);
        if (response.status && response.status !== 'code_request error') {
            return { success: true, message: response.message || 'Verification code has been sent' };
        } else {
            return { success: false, error: response.error || 'Verification code failed to be sent' };
        }
    } catch (error) {
        return { success: false, error: error.message || 'Network error' };
    }
}

async function walletLogin(name, phone, code) {
    const thread = WALLET_CONFIG.threadCounter++;
    const currentChain = WALLET_CONFIG.currentChain;

    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "log_in",
        name: name,
        phone: phone,
        code: code
    };
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();

    try {
        const response = await sendToWallet(finalRequest);
        if (response.status && response.status !== 'log_in error') {
            return { success: true, wallet: response.status, name: name };
        } else {
            return { success: false, error: response.error || 'Login failed' };
        }
    } catch (error) {
        return { success: false, error: error.message || 'Login failed' };
    }
}

async function transferRC(from, to, amount) {
    const thread = WALLET_CONFIG.threadCounter++;
    const currentChain = WALLET_CONFIG.currentChain;

    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "transfer_rc",
        from: from,
        to: to,
        rc: amount
    };
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();

    try {
        const response = await sendToWallet(finalRequest);
        if (response.status === 'ok') {
            return { success: true, response };
        }
        if (response.status === 'error') {
            const errorMap = {
                'insufficient_balance': `Insufficient balance, need ${amount} 根币`,
                'invalid_wallet': 'Invalid wallet address, please log in again.',
                'sender_not_found': 'The sender\'s wallet does not exist.',
                'receiver_not_found': 'The recipient\'s wallet does not exist.'
            };
            const errorMsg = errorMap[response.error] || response.error || 'Transfer failed';
            return { success: false, error: errorMsg };
        }
        return { success: false, error: response.status || 'Transfer failed' };
    } catch (error) {
        return { success: false, error: error.message || 'Transfer failed' };
    }
}

async function addNFT(to, nft, nft_name, value) {
    const thread = WALLET_CONFIG.threadCounter++;
    const currentChain = WALLET_CONFIG.currentChain;

    const holding = { nft: nft, dao_id: "2.3", nft_name: nft_name, value: value };
    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "nft_add",
        to: to,
        holding: holding
    };
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();

    try {
        const response = await sendToWallet(finalRequest);
        if (response.status && response.status !== 'nft_add error') {
            return { success: true, response };
        }
        return { success: false, error: response.status || 'NFT addition failed.' };
    } catch (error) {
        return { success: false, error: error.message || 'NFT addition failed.' };
    }
}

async function removeNFT(from, nft) {
    const thread = WALLET_CONFIG.threadCounter++;
    const currentChain = WALLET_CONFIG.currentChain;

    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "nft_remove",
        from: from,
        nft: nft
    };
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();

    try {
        const response = await sendToWallet(finalRequest);
        if (response.status && response.status !== 'nft_remove error') {
            return { success: true, response };
        }
        return { success: false, error: response.status || 'NFT removal failed.' };
    } catch (error) {
        return { success: false, error: error.message || 'NFT removal failed.' };
    }
}

// ============================================================
// WALLET COMMUNICATION LOGGING
// ============================================================
function logWalletCommunication(type, data) {
    try {
        const logDir = path.join(__dirname, 'nft', 'data');
        ensureDir(logDir);
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const logFile = path.join(logDir, `${dateStr}_wallet.jsonl`);
        const logEntry = {
            time: getFormattedDateTime(),
            type: type,
            data: data,
            current_chain: WALLET_CONFIG.currentChain
        };
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
        console.error(`保存钱包道${type}日志失败:`, error);
    }
}

function cleanupOldWalletLogs(daysToKeep = 30) {
    try {
        const logDir = path.join(__dirname, 'nft', 'data');
        if (!fs.existsSync(logDir)) return;
        const files = fs.readdirSync(logDir);
        const walletLogs = files.filter(file =>
            file.match(/^\d{8}_wallet\.jsonl$/) || file === 'wallet.jsonl'
        );
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffDateStr = `${cutoffDate.getFullYear()}${String(cutoffDate.getMonth() + 1).padStart(2, '0')}${String(cutoffDate.getDate()).padStart(2, '0')}`;
        for (const file of walletLogs) {
            const filePath = path.join(logDir, file);
            const match = file.match(/^(\d{8})_wallet\.jsonl$/);
            if (match) {
                const fileDateStr = match[1];
                if (fileDateStr < cutoffDateStr) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Delete old log files: ${file}`);
                }
            } else if (file === 'wallet.jsonl') {
                const dateStr = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
                const newFilePath = path.join(logDir, `${dateStr}_wallet.jsonl`);
                if (fs.existsSync(newFilePath)) {
                    const oldContent = fs.readFileSync(filePath, 'utf-8');
                    fs.appendFileSync(newFilePath, oldContent);
                } else {
                    fs.renameSync(filePath, newFilePath);
                }
                console.log(`📦 Migrate old log files to: ${dateStr}_wallet.jsonl`);
            }
        }
    } catch (error) {
        console.error('Cleaning up old log files failed:', error);
    }
}

function initWalletLogCleanup() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(1, 0, 0, 0);
    const timeUntilCleanup = tomorrow.getTime() - now.getTime();
    setTimeout(() => {
        cleanupOldWalletLogs(30);
        setInterval(() => {
            cleanupOldWalletLogs(30);
        }, 24 * 60 * 60 * 1000);
    }, timeUntilCleanup);
    console.log(`🗑️  Log cleanup has been scheduled and will be conducted in ${new Date(now.getTime() + timeUntilCleanup).toLocaleString()} for the first time`);
}

// ============================================================
// AUTO-SAVE WALLET STATE
// ============================================================
function startAutoSave(intervalMs = 30000) {
    setInterval(() => {
        if (WALLET_CONFIG.lastOperationTime > 0) {
            saveWalletState();
        }
    }, intervalMs);
    console.log(`⏱️  Wallet auto-save is enabled, at intervals: ${intervalMs/1000} seconds`);
}

// ============================================================
// MARKET LOCKING
// ============================================================
let marketLock = false;

// ============================================================
// API: AUTHENTICATION
// ============================================================
app.post('/api/send-code', async (req, res) => {
    const { type, name, phone } = req.body;
    if (type === 'login') {
        const result = await walletRequestCode(name, phone);
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.json({ success: false, message: result.error });
        }
    } else {
        res.json({ success: false, message: 'Unsupported CAPTCHA types' });
    }
});

app.post('/api/login', async (req, res) => {
    const { name, phone, code } = req.body;
    try {
        const result = await walletLogin(name, phone, code);
        if (result.success) {
            res.json({ success: true, wallet: result.wallet, name: result.name, account: name, phone: phone, message: "Login success" });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Login failed:', error);
        res.json({ success: false, error: error.message || 'Login failed' });
    }
});

// ============================================================
// API: CATEGORY (Level 1)
// ============================================================

// List categories
app.get('/api/categories/list', (req, res) => {
    try {
        const dataRoot = NFT_DATA_DIR;
        if (!fs.existsSync(dataRoot)) return res.json({ success: true, data: [] });

        const categories = [];
        const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const id = parseInt(match[1]);
                    const name = match[2];
                    const contentPath = path.join(dataRoot, dir.name, 'content.json');
                    let hash = '', shortlink = '', price = 0, subcount = 0;
                    let type = 'other';   // default type
                    if (fs.existsSync(contentPath)) {
                        try {
                            const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                            hash = content.hash || '';
                            shortlink = content.shortlink || '';
                            type = content.type || 'other';
                            // Count subcategories
                            const subdirs = fs.readdirSync(path.join(dataRoot, dir.name), { withFileTypes: true });
                            subcount = subdirs.filter(d => d.isDirectory() && /^\d+_/.test(d.name)).length;
                            // Get latest price from log
                            const logPath = path.join(dataRoot, dir.name, 'content_log.json');
                            if (fs.existsSync(logPath)) {
                                const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
                                const logs = logData.log || [];
                                if (logs.length > 0) {
                                    const sorted = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                                    price = sorted[0].price || 0;
                                }
                            }
                        } catch (e) { console.error(`Failed to read ${contentPath}:`, e); }
                    }
                    categories.push({ id, name, hash, shortlink, price, subcount, type });
                }
            }
        }
        categories.sort((a, b) => a.id - b.id);
        res.json({ success: true, data: categories, total: categories.length });
    } catch (error) {
        console.error('Failed to retrieve category list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get category detail – find by ID only
app.get('/api/category/detail', (req, res) => {
    const { id } = req.query;
    if (!id) return sendError(res, 400, 'Missing parameter: id');

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) return sendError(res, 404, 'Data directory not found');

    const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
    let foundDir = null;
    for (const dir of dirs) {
        if (dir.isDirectory()) {
            const match = dir.name.match(/^(\d+)_(.+)$/);
            if (match && match[1] === id) {
                foundDir = dir.name;
                break;
            }
        }
    }
    if (!foundDir) return sendError(res, 404, 'Category not found');

    const filePath = path.join(dataRoot, foundDir, 'content.json');
    if (!fs.existsSync(filePath)) return sendError(res, 404, 'Category data not found');

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (e) {
        sendError(res, 500, 'Parsing failed', e.message);
    }
});

// Add category
app.post('/api/category/add', async (req, res) => {
    const { category_name, category_name_zh, category_type, price, buyer_wallet } = req.body;
    if (!category_name || !price || !buyer_wallet) {
        return res.status(400).json({ success: false, error: 'Missing necessary parameters' });
    }
    if (!buyer_wallet || buyer_wallet.length !== 64) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    // Read HKU DAO config
    let daoData = null;
    try {
        if (fs.existsSync(HKU_DAO_FILE)) {
            daoData = JSON.parse(fs.readFileSync(HKU_DAO_FILE, 'utf-8'));
        } else {
            daoData = {
                name: 'HKU DAO',
                hash: crypto.createHash('sha256').update('HKU DAO 港大道').digest('hex').toUpperCase(),
                created: getFormattedDateTime()
            };
            fs.writeFileSync(HKU_DAO_FILE, JSON.stringify(daoData, null, 2));
        }
    } catch (error) {
        console.error('Failed to read HKU DAO configuration:', error);
        return res.status(500).json({ success: false, error: 'Failed to read DAO data' });
    }

    // Generate category hash
    const combinedInput = daoData.hash + category_name;
    const category_hash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();
    console.log(`📝 Category Hash: ${daoData.hash} + ${category_name} = ${category_hash}`);

    // Find next category number
    const dataRoot = NFT_DATA_DIR;
    let maxNumber = 0;
    if (fs.existsSync(dataRoot)) {
        const items = fs.readdirSync(dataRoot, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                const match = item.name.match(/^(\d+)_/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNumber) maxNumber = num;
                }
            }
        }
    }
    const category_number = maxNumber + 1;
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";

    // Transfer RC
    const transferResult = await transferRC(buyer_wallet, systemWallet, price);
    if (!transferResult.success) {
        return res.json({ success: false, error: `Payment failed: ${transferResult.error}` });
    }
    console.log(`✅ Payment successful: ${price} RC`);

    // Generate shortlink
    // Get the base URL from the request origin (or use a fallback)
    const baseUrl = req.headers.origin || req.protocol + '://' + req.get('host');
    const shortlinkData = await generateCategoryShortlink(category_number, category_name, baseUrl);

    // Create category data
    const category_data = {
        name: category_name,
        hash: category_hash,
        card_number: category_number,
        type: category_type || 'other',  // Defaults to 'other' if not specified
        price: price,
        created: getFormattedDateTime(),
        population: 0,
        percent: 0,
        source: [],
        distribution: [],
        history: [],
        modern: [],
        nft_holder: { wallet: buyer_wallet, phone_number: "", email: "", other: "......" },
        shortlink: shortlinkData.shortlink || '',
        short_code: shortlinkData.short_code || ''
    };

    const dir = getNFTDataPath(category_number, category_name);
    ensureDir(dir);
    const contentFile = path.join(dir, 'content.json');
    fs.writeFileSync(contentFile, JSON.stringify(category_data, null, 2));

    // Create initial transaction log
    const chain = category_hash.slice(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const seller = systemWallet;
    const buyer = buyer_wallet;
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    const next_chain = verification_code.slice(0, 16).toUpperCase();
    const log_data = {
        log: [{ thread, time, price, seller, buyer, chain, next_chain, verification_code }],
        nft_holder: { wallet: buyer_wallet, phone_number: "", email: "", other: "......" }
    };
    const logFile = path.join(dir, 'content_log.json');
    fs.writeFileSync(logFile, JSON.stringify(log_data, null, 2));

    // Save to queue
    saveToQueue('category', category_hash);
    saveToQueue('purchase', verification_code);

    // Add NFT to wallet
    try {
        await addNFT(buyer_wallet, category_hash, category_name, price);
        console.log(`✅ The NFT has been added to the user's wallet.`);
    } catch (walletError) {
        console.error('Failed to add NFT to the user\'s wallet:', walletError);
    }

    res.status(201).json({
        success: true,
        message: 'Category created successfully',
        price,
        category_number,
        category_name,
        category_hash,
        verification_code,
        chain,
        next_chain,
        shortlink: shortlinkData.shortlink,
        short_code: shortlinkData.short_code
    });
});

// API: DELETE CATEGORY (Soft Delete)
app.delete('/api/category/delete', async (req, res) => {
    const { category_id, wallet } = req.body;
    if (!category_id || !wallet) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }
    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(wallet)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) {
        return res.status(404).json({ success: false, error: 'Data directory not found' });
    }

    let categoryDir = null;
    let categoryName = '';
    const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
    for (const dir of dirs) {
        if (dir.isDirectory()) {
            const match = dir.name.match(/^(\d+)_(.+)$/);
            if (match && match[1] === String(category_id)) {
                categoryDir = dir.name;
                categoryName = match[2];
                break;
            }
        }
    }
    if (!categoryDir) {
        return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check ownership via log
    const logPath = path.join(dataRoot, categoryDir, 'content_log.json');
    if (!fs.existsSync(logPath)) {
        return res.status(404).json({ success: false, error: 'Category log not found' });
    }
    let logData;
    try {
        logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to read log' });
    }
    const logs = logData.log || [];
    if (logs.length === 0) {
        return res.status(403).json({ success: false, error: 'No ownership record' });
    }
    const sorted = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
    const latest = sorted[0];
    if (latest.buyer !== wallet) {
        return res.status(403).json({ success: false, error: 'You do not own this category NFT' });
    }

    // Remove from market.json
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (fs.existsSync(marketFile)) {
        let marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        marketData = marketData.filter(item => item.card_number !== String(category_id));
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    }

    // Soft delete: Move to trash
    const fullPath = path.join(dataRoot, categoryDir);
    try {
        const trashPath = moveToTrash(fullPath, 'category', category_id, categoryName, wallet);
        res.json({ 
            success: true, 
            message: 'Category moved to trash. You can restore it from the trash page.',
            trashId: trashPath
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to move to trash: ' + e.message });
    }
});

// ============================================================
// API: SUBCATEGORY (Level 2)
// ============================================================

// List subcategories for a category
app.get('/api/subcategories/list/:categoryId', (req, res) => {
    const { categoryId } = req.params;
    try {
        const dataRoot = NFT_DATA_DIR;
        let categoryDir = null, categoryName = '';
        const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match && match[1] === categoryId) {
                    categoryDir = dir.name;
                    categoryName = match[2];
                    break;
                }
            }
        }
        if (!categoryDir) return res.json({ success: true, data: [] });

        const categoryPath = path.join(dataRoot, categoryDir);
        const subdirs = fs.readdirSync(categoryPath, { withFileTypes: true });
        const subcategories = [];
        for (const subdir of subdirs) {
            if (subdir.isDirectory()) {
                const match = subdir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const id = parseInt(match[1]);
                    const name = match[2];
                    const subPath = path.join(categoryPath, subdir.name, 'subcategory.json');
                    let hash = '', shortlink = '', price = 0, itemCount = 0;
                    if (fs.existsSync(subPath)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
                            hash = data.hash || '';
                            shortlink = data.shortlink || '';
                            price = data.purchase_price || 0;
                            const items = fs.readdirSync(path.join(categoryPath, subdir.name), { withFileTypes: true });
                            itemCount = items.filter(d => d.isDirectory() && /^\d+_/.test(d.name)).length;
                        } catch (e) { console.error(`Failed to read ${subPath}:`, e); }
                    }
                    subcategories.push({ id, name, hash, shortlink, price, itemCount, categoryId: parseInt(categoryId), categoryName });
                }
            }
        }
        subcategories.sort((a, b) => a.id - b.id);
        res.json({ success: true, data: subcategories });
    } catch (error) {
        console.error('Failed to retrieve subcategory list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get subcategory detail
app.get('/api/subcategory/detail', (req, res) => {
    const { id } = req.query;
    if (!id) return sendError(res, 400, 'Missing parameter: id');

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) return sendError(res, 404, 'Data directory not found');

    // Find the subcategory by scanning all category folders
    const categoryDirs = fs.readdirSync(dataRoot, { withFileTypes: true });
    let foundSubcategory = null;
    let foundCategory = null;

    for (const catDir of categoryDirs) {
        if (catDir.isDirectory()) {
            const catMatch = catDir.name.match(/^(\d+)_(.+)$/);
            if (catMatch) {
                const categoryId = catMatch[1];
                const categoryName = catMatch[2];
                const subPath = path.join(dataRoot, catDir.name);
                
                // Check if this category contains the subcategory
                const subDirs = fs.readdirSync(subPath, { withFileTypes: true });
                for (const subDir of subDirs) {
                    if (subDir.isDirectory()) {
                        const subMatch = subDir.name.match(/^(\d+)_(.+)$/);
                        if (subMatch && subMatch[1] === id) {
                            foundSubcategory = {
                                id: subMatch[1], name: subMatch[2], categoryId: categoryId, categoryName: categoryName
                            };
                            foundCategory = { id: categoryId, name: categoryName };
                            break;
                        }
                    }
                }
                if (foundSubcategory) break;
            }
        }
    }

    if (!foundSubcategory) return sendError(res, 404, 'Subcategory not found');

    const filePath = getNFTDataPath(foundCategory.id, foundCategory.name, foundSubcategory.id, foundSubcategory.name);
    const subFile = path.join(filePath, 'subcategory.json');
    if (!fs.existsSync(subFile)) return sendError(res, 404, 'Subcategory data not found');

    try {
        const data = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
        data.category_id = foundCategory.id;
        data.category_name = foundCategory.name;
        data.subcategory_id = foundSubcategory.id;
        res.json(data);
    } catch (e) {
        sendError(res, 500, 'Parsing failed', e.message);
    }
});

// Add subcategory
app.post('/subcategory/:categoryId/:categoryName/subcategory', async (req, res) => {
    const { categoryId, categoryName } = req.params;
    const data = req.body;
    const buyerWallet = data.buyer_wallet || "DCE005AE4E27D67BFBC6EBD31A53D24AAFF58A0E017D5075D1B3B5BB1BCD8A03";

    // Get category hash
    const categoryDir = getNFTDataPath(categoryId, categoryName);
    const categoryContentFile = path.join(categoryDir, 'content.json');
    let categoryHash = '';
    try {
        if (fs.existsSync(categoryContentFile)) {
            const categoryData = JSON.parse(fs.readFileSync(categoryContentFile, 'utf-8'));
            categoryHash = categoryData.hash || categoryData.nft || '';
        }
    } catch (error) {
        console.error('Failed to read Category Hash:', error);
    }
    if (!categoryHash) categoryHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Generate subcategory hash
    const subcategoryName = data.name;
    const combinedInput = categoryHash + subcategoryName;
    const subcategoryHash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();

    const price = 1000;
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";

    // Transfer RC
    const transferResult = await transferRC(buyerWallet, systemWallet, price);
    if (!transferResult.success) {
        return res.json({ success: false, error: `Payment failed: ${transferResult.error}` });
    }

    // Generate shortlink
    const baseUrl = req.headers.origin || req.protocol + '://' + req.get('host');
    const shortlinkData = await generateSubcategoryShortlink(categoryId, categoryName, data.subcategory_number, data.name, baseUrl);

    // Create subcategory directory and files
    const dir = getNFTDataPath(categoryId, categoryName, data.subcategory_number, data.name);
    ensureDir(dir);

    const subcategoryData = {
        ...data,
        hash: subcategoryHash,
        shortlink: shortlinkData.shortlink || '',
        short_code: shortlinkData.short_code || '',
        purchase_price: price,
        category_id: categoryId,
        category_name: categoryName
    };

    const subFile = path.join(dir, 'subcategory.json');
    fs.writeFileSync(subFile, JSON.stringify(subcategoryData, null, 2));

    // Create transaction log
    const chain = subcategoryHash.slice(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const seller = systemWallet;
    const buyer = buyerWallet;
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    const next_chain = verification_code.slice(0, 16).toUpperCase();
    const log_data = {
        log: [{ thread, time, price, seller, buyer, chain, next_chain, verification_code }],
        nft_holder: { wallet: buyerWallet, phone_number: "", email: "", other: "......" }
    };
    fs.writeFileSync(path.join(dir, 'subcategory_log.json'), JSON.stringify(log_data, null, 2));

    // Save to queue
    saveToQueue('subcategory', subcategoryHash);
    saveToQueue('purchase', verification_code);

    // Add NFT to wallet
    try {
        const nftName = `${categoryName} · ${subcategoryName}`;
        await addNFT(buyerWallet, subcategoryHash, nftName, price);
        console.log(`✅ The NFT has been added to the user's wallet.`);
    } catch (walletError) {
        console.error('Failed to add NFT to user\'s wallet:', walletError);
    }

    res.status(201).json({
        success: true,
        message: 'Subcategory created successfully',
        price,
        subcategory_hash: subcategoryHash,
        verification_code,
        shortlink: shortlinkData.shortlink,
        short_code: shortlinkData.short_code
    });
});

// API: DELETE SUBCATEGORY (Soft Delete)
app.delete('/api/subcategory/delete', async (req, res) => {
    const { category_id, category_name, subcategory_id, subcategory_name, wallet } = req.body;
    if (!category_id || !category_name || !subcategory_id || !subcategory_name || !wallet) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }
    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(wallet)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) {
        return res.status(404).json({ success: false, error: 'Data directory not found' });
    }

    const categoryFolder = path.join(dataRoot, `${category_id}_${category_name}`);
    if (!fs.existsSync(categoryFolder)) {
        return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const subFolder = path.join(categoryFolder, `${subcategory_id}_${subcategory_name}`);
    if (!fs.existsSync(subFolder)) {
        return res.status(404).json({ success: false, error: 'Subcategory not found' });
    }

    // Check ownership via log
    const logPath = path.join(subFolder, 'subcategory_log.json');
    if (!fs.existsSync(logPath)) {
        return res.status(404).json({ success: false, error: 'Subcategory log not found' });
    }
    let logData;
    try {
        logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to read log' });
    }
    const logs = logData.log || [];
    if (logs.length === 0) {
        return res.status(403).json({ success: false, error: 'No ownership record' });
    }
    const sorted = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
    const latest = sorted[0];
    if (latest.buyer !== wallet) {
        return res.status(403).json({ success: false, error: 'You do not own this subcategory NFT' });
    }

    // Remove from market.json
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (fs.existsSync(marketFile)) {
        let marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        marketData = marketData.filter(item => {
            return !(item.card_number === String(category_id) && item.citang_number === String(subcategory_id));
        });
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    }

    // Soft delete: Move to trash
    try {
        const entityName = `${category_name} / ${subcategory_name}`;
        const trashPath = moveToTrash(subFolder, 'subcategory', subcategory_id, entityName, wallet);
        res.json({ 
            success: true, 
            message: 'Subcategory moved to trash. You can restore it from the trash page.',
            trashId: trashPath
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to move to trash: ' + e.message });
    }
});

// ============================================================
// API: ITEM (Level 3)
// ============================================================

// List items for a subcategory
app.get('/api/items/list', (req, res) => {
    const { category_id, category_name, subcategory_id, subcategory_name } = req.query;
    if (!category_id || !category_name || !subcategory_id || !subcategory_name) {
        return sendError(res, 400, 'Missing parameters');
    }
    const subPath = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
    if (!fs.existsSync(subPath)) return res.json({ success: true, data: [] });

    try {
        const items = [];
        const dirs = fs.readdirSync(subPath, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const number = match[1];
                    const name = match[2];
                    const itemPath = path.join(subPath, dir.name, `${number}_${name}.json`);
                    if (fs.existsSync(itemPath)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
                            items.push({ number, name, hash: data.hash || '', shortlink: data.shortlink || '', purchase_price: data.purchase_price || 0, ...data });
                        } catch (e) { console.error(`Failed to read ${itemPath}:`, e); }
                    }
                }
            }
        }
        items.sort((a, b) => parseInt(a.number) - parseInt(b.number));
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Failed to retrieve items list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: GET ITEM DETAIL (unified for subcategories & items)
app.get('/api/item/detail', (req, res) => {
    const { id } = req.query;
    if (!id) return sendError(res, 400, 'Missing parameter: id');

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) return sendError(res, 404, 'Data directory not found');

    // Find the item by scanning all category → subcategory → item folders
    const categoryDirs = fs.readdirSync(dataRoot, { withFileTypes: true });
    let foundItem = null;
    let foundSubcategory = null;
    let foundCategory = null;

    // First, try to find an item (level 3)
    for (const catDir of categoryDirs) {
        if (catDir.isDirectory()) {
            const catMatch = catDir.name.match(/^(\d+)_(.+)$/);
            if (catMatch) {
                const categoryId = catMatch[1];
                const categoryName = catMatch[2];
                const subPath = path.join(dataRoot, catDir.name);
                const subDirs = fs.readdirSync(subPath, { withFileTypes: true });
                for (const subDir of subDirs) {
                    if (subDir.isDirectory()) {
                        const subMatch = subDir.name.match(/^(\d+)_(.+)$/);
                        if (subMatch) {
                            const subcategoryId = subMatch[1];
                            const subcategoryName = subMatch[2];
                            const itemPath = path.join(subPath, subDir.name);
                            const itemDirs = fs.readdirSync(itemPath, { withFileTypes: true });
                            for (const itemDir of itemDirs) {
                                if (itemDir.isDirectory()) {
                                    const itemMatch = itemDir.name.match(/^(\d+)_(.+)$/);
                                    if (itemMatch && itemMatch[1] === id) {
                                        foundItem = { id: itemMatch[1], name: itemMatch[2] };
                                        foundSubcategory = { id: subcategoryId, name: subcategoryName };
                                        foundCategory = { id: categoryId, name: categoryName };
                                        break;
                                    }
                                }
                            }
                            if (foundItem) break;
                        }
                    }
                    if (foundItem) break;
                }
                if (foundItem) break;
            }
        }
    }

    // If item not found, try to find a subcategory (level 2) with the same ID
    if (!foundItem) {
        for (const catDir of categoryDirs) {
            if (catDir.isDirectory()) {
                const catMatch = catDir.name.match(/^(\d+)_(.+)$/);
                if (catMatch) {
                    const categoryId = catMatch[1];
                    const categoryName = catMatch[2];
                    const subPath = path.join(dataRoot, catDir.name);
                    const subDirs = fs.readdirSync(subPath, { withFileTypes: true });
                    for (const subDir of subDirs) {
                        if (subDir.isDirectory()) {
                            const subMatch = subDir.name.match(/^(\d+)_(.+)$/);
                            if (subMatch && subMatch[1] === id) {
                                foundSubcategory = { id: subMatch[1], name: subMatch[2] };
                                foundCategory = { id: categoryId, name: categoryName };
                                break;
                            }
                        }
                    }
                    if (foundSubcategory) break;
                }
            }
            if (foundSubcategory) break;
        }
    }

    // Return data based on what was found
    if (foundItem) {
        const filePath = getNFTDataPath(
            foundCategory.id, foundCategory.name,
            foundSubcategory.id, foundSubcategory.name,
            foundItem.id, foundItem.name
        );
        const itemFile = path.join(filePath, `${foundItem.id}_${foundItem.name}.json`);
        if (!fs.existsSync(itemFile)) return sendError(res, 404, 'Item data not found');
        try {
            const data = JSON.parse(fs.readFileSync(itemFile, 'utf-8'));
            data.category_id = foundCategory.id;
            data.category_name = foundCategory.name;
            data.subcategory_id = foundSubcategory.id;
            data.subcategory_name = foundSubcategory.name;
            data.item_number = foundItem.id;
            data.item_name = foundItem.name;
            data.type = 'item';          // mark as item
            res.json(data);
        } catch (e) {
            sendError(res, 500, 'Parsing failed', e.message);
        }
    } else if (foundSubcategory) {
        const subDir = getNFTDataPath(foundCategory.id, foundCategory.name, foundSubcategory.id, foundSubcategory.name);
        const subFile = path.join(subDir, 'subcategory.json');
        if (!fs.existsSync(subFile)) return sendError(res, 404, 'Subcategory data not found');
        try {
            const data = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
            data.category_id = foundCategory.id;
            data.category_name = foundCategory.name;
            data.subcategory_id = foundSubcategory.id;
            data.subcategory_name = foundSubcategory.name;
            data.type = 'subcategory';   // mark as subcategory, but frontend will treat as 'item' level
            // Ensure fields expected by frontend exist
            data.description = data.description || '';
            data.description_zh = data.description_zh || '';
            data.details = data.details || '';
            data.details_zh = data.details_zh || '';
            data.attachments = data.attachments || [];
            data.price = data.purchase_price || 0;
            // Use subcategory name as display name
            res.json(data);
        } catch (e) {
            sendError(res, 500, 'Parsing failed', e.message);
        }
    } else {
        sendError(res, 404, 'Item not found');
    }
});

// Add item
app.post('/subcategory/:categoryId/:categoryName/:subcategoryNumber/:subcategoryName/item', async (req, res) => {
    const { categoryId, categoryName, subcategoryNumber, subcategoryName } = req.params;
    const { item, log } = req.body;
    const card_number = req.query.card_number || categoryId;

    if (!item) return sendError(res, 400, 'Missing items data');

    // Get buyer wallet from log or use default
    let buyerWallet = "DCE005AE4E27D67BFBC6EBD31A53D24AAFF58A0E017D5075D1B3B5BB1BCD8A03";
    if (log && log.log && log.log.length > 0) {
        const lastLog = log.log[log.log.length - 1];
        if (lastLog && lastLog.buyer) buyerWallet = lastLog.buyer;
    }

    // Get subcategory hash
    const subDir = getNFTDataPath(categoryId, categoryName, subcategoryNumber, subcategoryName);
    const subFile = path.join(subDir, 'subcategory.json');
    let subcategoryHash = '';
    try {
        if (fs.existsSync(subFile)) {
            const subData = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
            subcategoryHash = subData.hash || '';
        }
    } catch (error) {
        console.error('Failed to read Subcategory Hash:', error);
    }
    if (!subcategoryHash) subcategoryHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Generate item hash
    const itemName = item.name;
    const combinedInput = subcategoryHash + itemName;
    const itemHash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();

    const price = 100;
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";

    // Transfer RC
    const transferResult = await transferRC(buyerWallet, systemWallet, price);
    if (!transferResult.success) {
        return res.json({ success: false, error: `Payment Failed: ${transferResult.error}` });
    }

    // Generate shortlink
    const baseUrl = req.headers.origin || req.protocol + '://' + req.get('host');
    const shortlinkData = await generateItemShortlink(categoryId, categoryName, subcategoryNumber, subcategoryName, item.number, item.name, baseUrl);

    // Create item directory and files
    const itemDir = getNFTDataPath(categoryId, categoryName, subcategoryNumber, subcategoryName, item.number, item.name);
    ensureDir(itemDir);

    const itemWithHash = {
        ...item,
        hash: itemHash,
        shortlink: shortlinkData.shortlink || '',
        short_code: shortlinkData.short_code || '',
        purchase_price: price,
        category_id: categoryId,
        category_name: categoryName,
        subcategory_number: subcategoryNumber,
        subcategory_name: subcategoryName
    };

    const itemPath = path.join(itemDir, `${item.number}_${item.name}.json`);
    fs.writeFileSync(itemPath, JSON.stringify(itemWithHash, null, 2));

    // Create transaction log
    const chain = itemHash.slice(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const seller = systemWallet;
    const buyer = buyerWallet;
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    const next_chain = verification_code.slice(0, 16).toUpperCase();
    const log_data = {
        log: [{ thread, time, price, seller, buyer, chain, next_chain, verification_code }],
        nft_holder: { wallet: buyerWallet, phone_number: "", email: "", other: "......" }
    };
    const logPath = path.join(itemDir, `${item.number}_${item.name}_log.json`);
    fs.writeFileSync(logPath, JSON.stringify(log_data, null, 2));

    // Save to queue
    saveToQueue('item', itemHash);
    saveToQueue('purchase', verification_code);

    // Add NFT to wallet
    try {
        const nftName = `${categoryName} · ${subcategoryName} · ${item.name}`;
        await addNFT(buyerWallet, itemHash, nftName, price);
        console.log(`✅ The NFT has been added to the user's wallet.`);
    } catch (walletError) {
        console.error('Failed to add NFT to the user\'s wallet:', walletError);
    }

    res.status(201).json({
        success: true,
        message: 'Item created successfully',
        price,
        hash: itemHash,
        verification_code,
        shortlink: shortlinkData.shortlink,
        short_code: shortlinkData.short_code,
        ...item
    });
});

// API: DELETE ITEM (Soft Delete)
app.delete('/api/item/delete', async (req, res) => {
    const { category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, wallet } = req.body;
    if (!category_id || !category_name || !subcategory_id || !subcategory_name || !item_number || !item_name || !wallet) {
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    }
    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(wallet)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    const dataRoot = NFT_DATA_DIR;
    if (!fs.existsSync(dataRoot)) {
        return res.status(404).json({ success: false, error: 'Data directory not found' });
    }

    const categoryFolder = path.join(dataRoot, `${category_id}_${category_name}`);
    if (!fs.existsSync(categoryFolder)) {
        return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const subFolder = path.join(categoryFolder, `${subcategory_id}_${subcategory_name}`);
    if (!fs.existsSync(subFolder)) {
        return res.status(404).json({ success: false, error: 'Subcategory not found' });
    }

    const itemFolder = path.join(subFolder, `${item_number}_${item_name}`);
    if (!fs.existsSync(itemFolder)) {
        return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Check ownership via log
    const logPath = path.join(itemFolder, `${item_number}_${item_name}_log.json`);
    if (!fs.existsSync(logPath)) {
        return res.status(404).json({ success: false, error: 'Item log not found' });
    }
    let logData;
    try {
        logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to read log' });
    }
    const logs = logData.log || [];
    if (logs.length === 0) {
        return res.status(403).json({ success: false, error: 'No ownership record' });
    }
    const sorted = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
    const latest = sorted[0];
    if (latest.buyer !== wallet) {
        return res.status(403).json({ success: false, error: 'You do not own this item NFT' });
    }

    // Remove from market.json
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (fs.existsSync(marketFile)) {
        let marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        marketData = marketData.filter(item => {
            return !(item.card_number === String(category_id) &&
                     item.citang_number === String(subcategory_id) &&
                     item.member_number === String(item_number));
        });
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    }

    // Soft delete: Move to trash
    try {
        const entityName = `${category_name} / ${subcategory_name} / ${item_name}`;
        const trashPath = moveToTrash(itemFolder, 'item', item_number, entityName, wallet);
        res.json({ 
            success: true, 
            message: 'Item moved to trash. You can restore it from the trash page.',
            trashId: trashPath
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to move to trash: ' + e.message });
    }
});

// ============================================================
// API: TRASH MANAGEMENT
// ============================================================

// Get all trash items
app.get('/api/trash/list', (req, res) => {
    try {
        const items = getTrashItems();
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Failed to get trash items:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restore from trash
app.post('/api/trash/restore', (req, res) => {
    const { trashId, wallet } = req.body;
    if (!trashId) {
        return res.status(400).json({ success: false, error: 'Missing trashId' });
    }
    try {
        const result = restoreFromTrash(parseInt(trashId));
        res.json({ 
            success: true, 
            message: 'Item restored successfully',
            restored: result
        });
    } catch (error) {
        console.error('Failed to restore:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Permanent delete from trash
app.delete('/api/trash/permanent-delete', (req, res) => {
    const { trashId } = req.body;
    if (!trashId) {
        return res.status(400).json({ success: false, error: 'Missing trashId' });
    }
    try {
        permanentDeleteFromTrash(parseInt(trashId));
        res.json({ 
            success: true, 
            message: 'Item permanently deleted from trash'
        });
    } catch (error) {
        console.error('Failed to permanently delete:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Empty trash (delete all)
app.delete('/api/trash/empty', (req, res) => {
    try {
        if (!fs.existsSync(TRASH_DIR)) {
            return res.json({ success: true, message: 'Trash is already empty' });
        }
        
        // Delete all files in trash
        const files = fs.readdirSync(TRASH_DIR);
        for (const file of files) {
            const filePath = path.join(TRASH_DIR, file);
            if (file !== 'deletion_log.json') {
                fs.rmSync(filePath, { recursive: true, force: true });
            }
        }
        
        // Clear the log (keep the file but reset)
        if (fs.existsSync(TRASH_LOG_FILE)) {
            fs.writeFileSync(TRASH_LOG_FILE, JSON.stringify([], null, 2));
        }
        
        res.json({ success: true, message: 'Trash emptied successfully' });
    } catch (error) {
        console.error('Failed to empty trash:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API: TRANSACTION LOG (Unified)
// ============================================================
app.get('/api/log/transaction', (req, res) => {
    const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name } = req.query;
    if (!level || !category_id || !category_name) return sendError(res, 400, 'Missing parameters/levels');

    try {
        let logPath;
        if (level === 'category') {
            logPath = getNFTDataPath(category_id, category_name);
            logPath = path.join(logPath, 'content_log.json');
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing Subcategory parameters');
            logPath = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
            logPath = path.join(logPath, 'subcategory_log.json');
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing Items parameters');
            logPath = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
            logPath = path.join(logPath, `${item_number}_${item_name}_log.json`);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        if (!fs.existsSync(logPath)) return res.json({ log: [], nft_holder: {} });
        const data = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        res.json({ log: data.log || [], nft_holder: data.nft_holder || {} });
    } catch (error) {
        console.error('Failed to read transaction log:', error);
        sendError(res, 500, 'Read failed', error.message);
    }
});

// ============================================================
// API: CONTENT MANAGEMENT (Unified)
// ============================================================

// Get content list
app.get('/api/content/list', (req, res) => {
    const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name } = req.query;
    if (!level || !category_id || !category_name) return sendError(res, 400, 'Missing parameters');

    try {
        let targetDir;
        if (level === 'category') {
            targetDir = getNFTDataPath(category_id, category_name);
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing Subcategories parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing Items parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        const metaPath = path.join(targetDir, 'contents', 'meta.json');
        if (!fs.existsSync(metaPath)) return res.json([]);
        const contents = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        res.json(contents);
    } catch (error) {
        console.error('Failed to read content list:', error);
        sendError(res, 500, 'Read failed', error.message);
    }
});

// API: UPDATE CONTENT (description, details)
app.post('/api/content/update', (req, res) => {
    const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, description, description_zh, details, details_zh, wallet } = req.body;
    if (!level || !category_id || !category_name) {
        return sendError(res, 400, 'Missing required parameters');
    }
    try {
        let targetFile;
        if (level === 'category') {
            const dir = getNFTDataPath(category_id, category_name);
            targetFile = path.join(dir, 'content.json');
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) {
                return sendError(res, 400, 'Missing subcategory parameters');
            }
            const dir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
            targetFile = path.join(dir, 'subcategory.json');
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) {
                return sendError(res, 400, 'Missing item parameters');
            }
            const dir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
            targetFile = path.join(dir, `${item_number}_${item_name}.json`);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        if (!fs.existsSync(targetFile)) {
            return sendError(res, 404, 'Data file not found');
        }
        
        let data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
        // Update only provided fields
        if (description !== undefined) data.description = description;
        if (description_zh !== undefined) data.description_zh = description_zh;
        if (details !== undefined) data.details = details;
        if (details_zh !== undefined) data.details_zh = details_zh;
        fs.writeFileSync(targetFile, JSON.stringify(data, null, 2));
        res.json({ success: true, message: 'Content updated successfully' });
    } catch (error) {
        console.error('Failed to update content:', error);
        sendError(res, 500, 'Update failed', error.message);
    }
});

// Upload content (single)
app.post('/api/content/upload', upload.single('file'), async (req, res) => {
    try {
        const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, type } = req.body;
        if (!level || !category_id || !category_name || !type) return sendError(res, 400, 'Missing parameters');

        let targetDir;
        if (level === 'category') {
            targetDir = getNFTDataPath(category_id, category_name);
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing Subcategories parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing Items parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        const contentDir = path.join(targetDir, 'contents');
        ensureDir(contentDir);
        const timestamp = Date.now();
        let result = { type, timestamp, path: '', content: '' };
        let relativePath = '';

        if (type === 'text') {
            const text = req.body.text || '';
            const fileName = `${timestamp}.txt`;
            const filePath = path.join(contentDir, fileName);
            fs.writeFileSync(filePath, text, 'utf-8');
            result.content = text;
            // Build correct relative path based on level
            if (level === 'category') {
                relativePath = `/subcategory-data/${category_id}_${category_name}/contents/${fileName}`;
            } else if (level === 'subcategory') {
                relativePath = `/subcategory-data/${category_id}_${category_name}/${subcategory_id}_${subcategory_name}/contents/${fileName}`;
            } else { // item
                relativePath = `/subcategory-data/${category_id}_${category_name}/${subcategory_id}_${subcategory_name}/${item_number}_${item_name}/contents/${fileName}`;
            }
            result.path = relativePath;
        } else {
            if (!req.file) return sendError(res, 400, 'No file uploaded');
            const ext = path.extname(req.file.originalname) || '.jpg';
            const fileName = `${timestamp}${ext}`;
            const filePath = path.join(contentDir, fileName);
            fs.renameSync(req.file.path, filePath);
            // Build correct relative path based on level
            if (level === 'category') {
                relativePath = `/subcategory-data/${category_id}_${category_name}/contents/${fileName}`;
            } else if (level === 'subcategory') {
                relativePath = `/subcategory-data/${category_id}_${category_name}/${subcategory_id}_${subcategory_name}/contents/${fileName}`;
            } else { // item
                relativePath = `/subcategory-data/${category_id}_${category_name}/${subcategory_id}_${subcategory_name}/${item_number}_${item_name}/contents/${fileName}`;
            }
            result.path = relativePath;
            result.filename = req.file.originalname;
        }

        // Update meta.json
        const metaPath = path.join(contentDir, 'meta.json');
        let meta = [];
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        meta.push(result);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        res.json(result);
    } catch (error) {
        console.error('Upload failed:', error);
        sendError(res, 500, 'Upload failed', error.message);
    }
});

// Batch upload content
app.post('/api/content/batch-upload', upload.array('files'), async (req, res) => {
    try {
        const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, contents } = req.body;
        if (!level || !category_id || !category_name) return sendError(res, 400, 'Missing parameters');

        let targetDir;
        if (level === 'category') {
            targetDir = getNFTDataPath(category_id, category_name);
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing Subcategories parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing Items parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        const contentDir = path.join(targetDir, 'contents');
        ensureDir(contentDir);

        const contentItems = JSON.parse(contents || '[]');
        const metaPath = path.join(contentDir, 'meta.json');
        let meta = [];
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

        // Map files by original name
        const filesMap = {};
        req.files?.forEach(file => {
            filesMap[file.originalname] = file;
        });

        const results = [];
        for (const content of contentItems) {
            const { type, text, filename, timestamp } = content;
            const itemTimestamp = timestamp || Date.now();

            if (type === 'text') {
                const fileName = `${itemTimestamp}.txt`;
                const filePath = path.join(contentDir, fileName);
                fs.writeFileSync(filePath, text || '', 'utf-8');
                const result = {
                    type: 'text',
                    timestamp: itemTimestamp,
                    content: text,
                    path: `/subcategory-data/${category_id}_${category_name}/contents/${fileName}`
                };
                meta.push(result);
                results.push(result);
            } else if (type === 'image' && filename && filesMap[filename]) {
                const file = filesMap[filename];
                const ext = path.extname(filename) || '.jpg';
                const fileName = `${itemTimestamp}${ext}`;
                const filePath = path.join(contentDir, fileName);
                fs.renameSync(file.path, filePath);
                const result = {
                    type: 'image',
                    timestamp: itemTimestamp,
                    filename: file.originalname,
                    path: `/subcategory-data/${category_id}_${category_name}/contents/${fileName}`
                };
                meta.push(result);
                results.push(result);
            }
        }

        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        res.json({ success: true, uploaded: results.length, results });
    } catch (error) {
        console.error('Batch upload failed:', error);
        sendError(res, 500, 'Batch upload failed', error.message);
    }
});

// Delete content
app.delete('/api/content/delete', (req, res) => {
    const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, timestamp } = req.body;
    if (!level || !category_id || !category_name || !timestamp) return sendError(res, 400, 'Missing parameters');

    try {
        let targetDir;
        if (level === 'category') {
            targetDir = getNFTDataPath(category_id, category_name);
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing Subcategories parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing Items parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        const contentDir = path.join(targetDir, 'contents');
        const metaPath = path.join(contentDir, 'meta.json');
        if (!fs.existsSync(metaPath)) return sendError(res, 404, 'Content does not exist');

        let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const index = meta.findIndex(item => String(item.timestamp) === String(timestamp));
        if (index === -1) return sendError(res, 404, 'Content not found');

        const item = meta[index];
        if (item.path) {
            const fileName = path.basename(item.path);
            const filePath = path.join(contentDir, fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        meta.splice(index, 1);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        res.json({ success: true, message: 'Deletion successful' });
    } catch (error) {
        console.error('Deletion failed:', error);
        sendError(res, 500, 'Deletion failed', error.message);
    }
});

// Rename content (file)
app.put('/api/content/rename', (req, res) => {
    const { level, category_id, category_name, subcategory_id, subcategory_name, item_number, item_name, timestamp, new_name } = req.body;
    console.log('📝 Rename request:', { level, category_id, category_name, timestamp, new_name });
    if (!level || !category_id || !category_name || !timestamp || !new_name) {
        return sendError(res, 400, 'Missing required parameters');
    }

    try {
        let targetDir;
        if (level === 'category') {
            targetDir = getNFTDataPath(category_id, category_name);
        } else if (level === 'subcategory') {
            if (!subcategory_id || !subcategory_name) return sendError(res, 400, 'Missing subcategory parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name);
        } else if (level === 'item') {
            if (!subcategory_id || !subcategory_name || !item_number || !item_name) return sendError(res, 400, 'Missing item parameters');
            targetDir = getNFTDataPath(category_id, category_name, subcategory_id, subcategory_name, item_number, item_name);
        } else {
            return sendError(res, 400, 'Invalid level');
        }

        const contentDir = path.join(targetDir, 'contents');
        const metaPath = path.join(contentDir, 'meta.json');
        
        console.log('📂 Content directory:', contentDir);
        console.log('📄 Meta path:', metaPath);
        
        if (!fs.existsSync(metaPath)) {
            return sendError(res, 404, 'No attachments found');
        }

        let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const itemIndex = meta.findIndex(item => String(item.timestamp) === String(timestamp));
        
        if (itemIndex === -1) {
            console.error('❌ Attachment not found for timestamp:', timestamp);
            console.log('Available timestamps:', meta.map(item => item.timestamp));
            return sendError(res, 404, 'Attachment not found');
        }

        const item = meta[itemIndex];
        console.log('📎 Found attachment:', item);
        
        // Get the filename from the path or directly from item
        let oldFileName = '';
        let oldFilePath = '';
        
        // Try to find the file in the content directory
        // The filename might be stored separately or we need to find it
        if (item.path) {
            // The path might be a URL path like "/subcategory-data/.../contents/filename.ext"
            // Extract just the filename from the path
            oldFileName = path.basename(item.path);
            oldFilePath = path.join(contentDir, oldFileName);
            
            // If the file doesn't exist at that path, try to find it by matching the timestamp
            if (!fs.existsSync(oldFilePath)) {
                console.warn('⚠️ File not found at expected path:', oldFilePath);
                
                // Try to find a file that starts with the timestamp
                const files = fs.readdirSync(contentDir);
                const matchingFile = files.find(f => f.startsWith(String(timestamp)));
                
                if (matchingFile) {
                    oldFileName = matchingFile;
                    oldFilePath = path.join(contentDir, oldFileName);
                    console.log('✅ Found matching file:', oldFileName);
                } else {
                    // If still not found, look for any file that might match the timestamp pattern
                    const timestampMatch = files.find(f => {
                        const base = path.basename(f, path.extname(f));
                        return base === String(timestamp) || base.startsWith(String(timestamp));
                    });
                    
                    if (timestampMatch) {
                        oldFileName = timestampMatch;
                        oldFilePath = path.join(contentDir, oldFileName);
                        console.log('✅ Found timestamp-matching file:', oldFileName);
                    } else {
                        return sendError(res, 404, 'File not found: ' + oldFileName);
                    }
                }
            }
        } else {
            // If no path, try to find file by timestamp
            const files = fs.readdirSync(contentDir);
            const matchingFile = files.find(f => f.startsWith(String(timestamp)));
            
            if (matchingFile) {
                oldFileName = matchingFile;
                oldFilePath = path.join(contentDir, oldFileName);
                console.log('✅ Found file by timestamp:', oldFileName);
            } else {
                return sendError(res, 404, 'No file found for timestamp ' + timestamp);
            }
        }

        // Get the extension from the old file
        const ext = path.extname(oldFileName);
        
        // Generate new file name
        const sanitizedNewName = new_name.replace(/[^a-zA-Z0-9\-_. ]/g, '_');
        const newFileName = sanitizedNewName + ext;
        const newFilePath = path.join(contentDir, newFileName);

        console.log(`📝 Renaming: ${oldFileName} → ${newFileName}`);

        // Check if a file with the new name already exists
        if (fs.existsSync(newFilePath) && newFileName !== oldFileName) {
            return sendError(res, 409, 'A file with this name already exists');
        }

        // Rename the file (only if the name is different)
        if (oldFileName !== newFileName) {
            fs.renameSync(oldFilePath, newFilePath);
            console.log('✅ File renamed successfully');
        } else {
            console.log('ℹ️ File name unchanged');
        }

        // Update meta.json path and filename
        const newPath = item.path ? item.path.replace(oldFileName, newFileName) : newFileName;
        item.path = newPath;
        item.filename = newFileName; // Update display name
        item.name = newFileName; // Also update name field if it exists
        meta[itemIndex] = item;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        console.log('✅ Meta.json updated');

        res.json({ 
            success: true, 
            message: 'File renamed successfully', 
            newPath, 
            newFileName,
            oldFileName,
            newFilePath
        });
    } catch (error) {
        console.error('❌ Rename failed:', error);
        sendError(res, 500, 'Rename failed', error.message);
    }
});

// ============================================================
// API: NFT MARKET
// ============================================================

// Get user NFTs
app.get('/api/user/nfts', async (req, res) => {
    const wallet = req.query.wallet;
    if (!wallet) return sendError(res, 400, 'Missing wallet address');

    try {
        const nfts = [];
        const dataRoot = NFT_DATA_DIR;
        const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });

        // Helper: check if the latest buyer matches wallet
        function checkLogFile(logPath, level, idFields) {
            if (!fs.existsSync(logPath)) return null;
            try {
                const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
                const logs = logData.log || [];
                if (logs.length === 0) return null;
                // Sort by thread descending (latest first)
                const sorted = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                const latest = sorted[0];
                if (latest.buyer === wallet) {
                    return {
                        level: level,
                        ...idFields,
                        hash: latest.chain || '',
                        purchase_price: latest.price || 0
                    };
                }
            } catch (e) { /* ignore */ }
            return null;
        }

        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const card_number = match[1];
                    const surname = match[2];
                    const categoryPath = path.join(dataRoot, dir.name);
                    const contentLog = path.join(categoryPath, 'content_log.json');
                    // Check category level
                    const catResult = checkLogFile(contentLog, 'category', { card_number, surname });
                    if (catResult) nfts.push(catResult);

                    // Scan subcategories inside this category
                    const subdirs = fs.readdirSync(categoryPath, { withFileTypes: true });
                    for (const subdir of subdirs) {
                        if (subdir.isDirectory()) {
                            const subMatch = subdir.name.match(/^(\d+)_(.+)$/);
                            if (subMatch) {
                                const citang_number = subMatch[1];
                                const citang_name = subMatch[2];
                                const subPath = path.join(categoryPath, subdir.name);
                                const subLog = path.join(subPath, 'subcategory_log.json');
                                const subResult = checkLogFile(subLog, 'subcategory', { card_number, surname, citang_number, citang_name });
                                if (subResult) nfts.push(subResult);

                                // Scan items inside this subcategory
                                const itemDirs = fs.readdirSync(subPath, { withFileTypes: true });
                                for (const itemDir of itemDirs) {
                                    if (itemDir.isDirectory()) {
                                        const itemMatch = itemDir.name.match(/^(\d+)_(.+)$/);
                                        if (itemMatch) {
                                            const member_number = itemMatch[1];
                                            const member_name = itemMatch[2];
                                            const itemPath = path.join(subPath, itemDir.name);
                                            const itemLog = path.join(itemPath, `${member_number}_${member_name}_log.json`);
                                            const itemResult = checkLogFile(itemLog, 'item', { card_number, surname, citang_number, citang_name, member_number, member_name });
                                            if (itemResult) nfts.push(itemResult);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        res.json(nfts);
    } catch (error) {
        console.error('Failed to retrieve user NFTs:', error);
        sendError(res, 500, 'Failed to retrieve', error.message);
    }
});

// List NFT for sale
app.post('/api/nft/list', async (req, res) => {
    const { level, card_number, surname, citang_number, citang_name, member_number, member_name, price, seller_wallet, hash } = req.body;
    if (!level || !price || !seller_wallet) {
        return sendError(res, 400, 'Missing necessary parameters');
    }

    // Build a unique ID for the NFT (use all fields)
    const nftId = {
        level, card_number, surname,
        citang_number: citang_number || '', citang_name: citang_name || '',
        member_number: member_number || '', member_name: member_name || ''
    };

    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    let marketData = [];
    if (fs.existsSync(marketFile)) {
        try {
            marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        } catch (error) {
            console.error('Failed to read NFT market data:', error);
        }
    }

    // Remove existing entry if any
    marketData = marketData.filter(item => 
        !(item.level === level && 
          item.card_number === card_number && 
          item.surname === surname &&
          (item.citang_number || '') === (citang_number || '') &&
          (item.citang_name || '') === (citang_name || '') &&
          (item.member_number || '') === (member_number || '') &&
          (item.member_name || '') === (member_name || ''))
    );

    // Add new entry
    marketData.push({
        ...nftId, price: price,
        seller: seller_wallet, hash: hash || '',
        list_time: new Date().toISOString()
    });

    fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    res.json({ success: true, message: 'NFT listed successfully' });
});

// Get on-sale NFTs
app.get('/api/nfts/onsale', (req, res) => {
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (!fs.existsSync(marketFile)) return res.json([]);
    try {
        const marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        res.json(marketData);
    } catch (error) {
        console.error('Failed to read NFTs for sale:', error);
        res.json([]);
    }
});

// Cancel sale
app.post('/api/nft/cancel-sale', (req, res) => {
    const { level, id, name } = req.body;
    if (!level || !id || !name) return sendError(res, 400, 'Missing parameters');

    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (!fs.existsSync(marketFile)) return res.json({ success: false, error: 'NFT Market data is unavailable' });

    try {
        let marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        const initialLength = marketData.length;
        marketData = marketData.filter(item =>
            !(item.level === level && item.id === id && item.name === name)
        );
        if (marketData.length === initialLength) {
            return res.json({ success: false, error: 'No corresponding NFTs for sale were found.' });
        }
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
        res.json({ success: true, message: 'Sale cancelled' });
    } catch (error) {
        sendError(res, 500, 'Sale Cancellation failed', error.message);
    }
});

// Buy NFT
app.post('/api/nft/buy', async (req, res) => {
    const { level, id, name, buyer_wallet, buyer_account } = req.body;
    if (!level || !id || !name || !buyer_wallet) {
        return res.json({ success: false, error: 'Missing necessary parameters' });
    }

    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(buyer_wallet)) {
        return res.json({ success: false, error: 'Invalid wallet address format' });
    }

    while (marketLock) await new Promise(resolve => setTimeout(resolve, 50));
    marketLock = true;

    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    try {
        let marketData = [];
        if (fs.existsSync(marketFile)) {
            marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        }

        const nftIndex = marketData.findIndex(item =>
            item.level === level && item.id === id && item.name === name
        );
        if (nftIndex === -1) {
            return res.json({ success: false, error: 'NFT has been removed from the platform.' });
        }

        const nftForSale = marketData[nftIndex];
        const price = nftForSale.price;
        const sellerWallet = nftForSale.seller;
        const nftHash = nftForSale.hash || '';

        // Determine transaction level and details
        let txLevel = level;
        let categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName;
        // For simplicity, we assume id is the category id, and we may need to fetch subcategory/item info if needed
        // Since we only have id and name, we'll assume it's a category for now.
        // In a full implementation, we'd need to lookup the actual path. But for simplicity, we'll just use the info we have.
        // We'll update the transaction log for the given level.
        // We'll need to call updateTransactionLog with the correct parameters.
        // Since we only have category id/name, we'll handle that.
        // For subcategory/item, we'd need more data - but that's beyond this scope.
        // We'll just do a simple transfer and remove/add NFT.

        // We'll implement a simplified purchase: transfer, remove from seller, add to buyer, update log.
        const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";
        const sellerAmount = Math.floor(price * 0.9);

        // Step 1: buyer -> system
        const transfer1 = await transferRC(buyer_wallet, systemWallet, price);
        if (!transfer1.success) {
            return res.json({ success: false, error: `Payment failed: ${transfer1.error}` });
        }

        // Step 2: system -> seller
        const transfer2 = await transferRC(systemWallet, sellerWallet, sellerAmount);
        if (!transfer2.success) {
            // Refund
            await transferRC(systemWallet, buyer_wallet, price);
            return res.json({ success: false, error: 'The system transfer failed and a refund has been issued.' });
        }

        // Step 3: remove from seller
        const removeResult = await removeNFT(sellerWallet, nftHash);
        if (!removeResult.success) {
            // Rollback
            await transferRC(systemWallet, buyer_wallet, price);
            await transferRC(sellerWallet, systemWallet, sellerAmount);
            return res.json({ success: false, error: 'NFT removal failed and has been rolled back.' });
        }

        // Step 4: add to buyer
        const nftName = name; // Use name as NFT name
        const addResult = await addNFT(buyer_wallet, nftHash, nftName, price);
        if (!addResult.success) {
            // Full rollback
            await transferRC(systemWallet, buyer_wallet, price);
            await transferRC(sellerWallet, systemWallet, sellerAmount);
            await addNFT(sellerWallet, nftHash, nftName, price);
            return res.json({ success: false, error: 'NFT addition failed and has been completely rolled back.' });
        }

        // Step 5: update transaction log based on the actual level
        let logResult = { success: false };
        const nftLevel = nftForSale.level || 'category';
        if (nftLevel === 'category') {
            logResult = await updateTransactionLog(
                'category',
                nftForSale.card_number, nftForSale.surname,
                null, null,
                null, null,
                price, sellerWallet, buyer_wallet
            );
        } else if (nftLevel === 'subcategory') {
            logResult = await updateTransactionLog(
                'subcategory',
                nftForSale.card_number, nftForSale.surname,
                nftForSale.citang_number, nftForSale.citang_name,
                null, null,
                price, sellerWallet, buyer_wallet
            );
        } else if (nftLevel === 'item') {
            logResult = await updateTransactionLog(
                'item',
                nftForSale.card_number, nftForSale.surname,
                nftForSale.citang_number, nftForSale.citang_name,
                nftForSale.member_number, nftForSale.member_name,
                price, sellerWallet, buyer_wallet
            );
        } else {
            // fallback to category
            logResult = await updateTransactionLog(
                'category',
                nftForSale.card_number, nftForSale.surname,
                null, null,
                null, null,
                price, sellerWallet, buyer_wallet
            );
        }

        if (logResult.success) {
            saveToQueue('purchase', logResult.log.verification_code);
        }

        // Remove from market
        marketData.splice(nftIndex, 1);
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));

        res.json({
            success: true,
            message: 'Purchase successful',
            transaction: {
                price,
                seller: sellerWallet,
                buyer: buyer_wallet,
                seller_amount: sellerAmount,
                fee: price - sellerAmount,
                nft_hash: nftHash,
                nft_name: nftName,
                timestamp: new Date().toLocaleString('en'),
                verification_code: logResult.success ? logResult.log.verification_code : null
            }
        });

    } catch (error) {
        console.error('Purchase failed:', error);
        res.json({ success: false, error: 'Purchase processing failed: ' + error.message });
    } finally {
        marketLock = false;
    }
});

// ============================================================
// API: NFT TRANSFER
// ============================================================
app.post('/api/nft/transfer', async (req, res) => {
    const { level, card_number, surname, citang_number, citang_name, member_number, member_name, from_wallet, to_wallet, hash } = req.body;

    if (!level || !from_wallet || !to_wallet || !hash) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    // Validate wallet addresses (64 hex chars)
    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(from_wallet) || !walletRegex.test(to_wallet)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    if (from_wallet === to_wallet) {
        return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });
    }

    try {
        // 1. Remove NFT from sender
        const removeResult = await removeNFT(from_wallet, hash);
        if (!removeResult.success) {
            return res.status(500).json({ success: false, error: 'Failed to remove NFT from sender: ' + (removeResult.error || '') });
        }

        // 2. Add NFT to recipient
        // Determine NFT name (construct from data)
        let nftName = '';
        if (level === 'category') nftName = surname || card_number;
        else if (level === 'subcategory') nftName = `${surname || ''} · ${citang_name || ''}`;
        else if (level === 'item') nftName = `${surname || ''} · ${citang_name || ''} · ${member_name || ''}`;
        else nftName = 'NFT';

        const addResult = await addNFT(to_wallet, hash, nftName, 0); // Transfer price is 0 (no RC transfer)
        if (!addResult.success) {
            // Rollback: re-add to sender
            await addNFT(from_wallet, hash, nftName, 0);
            return res.status(500).json({ success: false, error: 'Failed to add NFT to recipient: ' + (addResult.error || '') });
        }

        // 3. Update transaction log (optional – you can add a transfer log entry)
        // We'll skip for now to keep it simple, but you can call updateTransactionLog with price=0, seller=from_wallet, buyer=to_wallet

        res.json({ success: true, message: 'NFT transferred successfully' });
    } catch (error) {
        console.error('Transfer failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API: SEARCH
// ============================================================
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ results: [] });

    const query = q.toLowerCase();
    const results = [];
    const dataRoot = NFT_DATA_DIR;

    try {
        const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const categoryId = parseInt(match[1]);
                    const categoryName = match[2];
                    if (categoryName.toLowerCase().includes(query)) {
                        results.push({ type: 'category', id: categoryId, name: categoryName, match: 'category' });
                    }

                    // Search subcategories
                    const categoryPath = path.join(dataRoot, dir.name);
                    const subdirs = fs.readdirSync(categoryPath, { withFileTypes: true });
                    for (const subdir of subdirs) {
                        if (subdir.isDirectory()) {
                            const subMatch = subdir.name.match(/^(\d+)_(.+)$/);
                            if (subMatch) {
                                const subId = parseInt(subMatch[1]);
                                const subName = subMatch[2];
                                if (subName.toLowerCase().includes(query)) {
                                    results.push({ type: 'subcategory', id: subId, name: subName, categoryId, categoryName, match: 'subcategory' });
                                }

                                // Search items
                                const subPath = path.join(categoryPath, subdir.name);
                                const itemDirs = fs.readdirSync(subPath, { withFileTypes: true });
                                for (const itemDir of itemDirs) {
                                    if (itemDir.isDirectory()) {
                                        const itemMatch = itemDir.name.match(/^(\d+)_(.+)$/);
                                        if (itemMatch) {
                                            const itemId = parseInt(itemMatch[1]);
                                            const itemName = itemMatch[2];
                                            if (itemName.toLowerCase().includes(query)) {
                                                results.push({
                                                    type: 'item',
                                                    id: itemId,
                                                    name: itemName,
                                                    categoryId,
                                                    categoryName,
                                                    subcategoryId: subId,
                                                    subcategoryName: subName,
                                                    match: 'item'
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        res.json({ results: results.slice(0, 50), total: results.length });
    } catch (error) {
        console.error('Search failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// API: WALLET STATE STATUS
// ============================================================
app.get('/api/wallet-state/status', (req, res) => {
    try {
        const state = {
            success: true,
            currentChain: WALLET_CONFIG.currentChain,
            threadCounter: WALLET_CONFIG.threadCounter,
            requestIndex: WALLET_CONFIG.requestIndex,
            lastOperationTime: WALLET_CONFIG.lastOperationTime,
            lastOperationTimeFormatted: WALLET_CONFIG.lastOperationTime ? new Date(WALLET_CONFIG.lastOperationTime).toLocaleString() : 'None',
            persistenceFile: WALLET_STATE_FILE,
            connected: WALLET_CONFIG.connected
        };
        res.json(state);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// START SERVER
// ============================================================
// --- Development Mode: Disable Wallet Connection ---
// The wallet server (192.168.1.26) is not accessible outside the office network.
// For local development/testing, we skip connecting to it.
const DEV_MODE = false; // Set to false when running inside the office network

// Initialize wallet state (reads from file, safe to run)
initWalletState();

if (!DEV_MODE) {
    // Only connect to the wallet if we are in production/office network
    initWalletConnection();
    startAutoSave(30000);   // Auto-save wallet state every 30 sec
    initWalletLogCleanup();
    console.log('🔗 Wallet connection enabled.');
} else {
    console.log('⚠️  DEVELOPMENT MODE: RBAS Wallet connection is DISABLED.');
    console.log('   Wallet operations (login, transfer, NFT minting/buying) will NOT work.');
    console.log('   Set DEV_MODE = false to enable wallet connection.');
    console.log('   (Only needed if you are testing blockchain transactions).');
}

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 HKU DAO Backend Server Started`);
    console.log(`========================================`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://${IP}:${PORT}`);
    console.log(`========================================`);
    console.log(`💾 Wallet Chain: ${WALLET_CONFIG.currentChain}`);
    console.log(`📁 NFT Data Dir: ${NFT_DATA_DIR}`);
    console.log(`📂 Queue File: ${HKU_DAO_QUEUE_FILE}`);
    console.log(`========================================`);
    console.log(`🛠️  Mode: ${DEV_MODE ? 'DEVELOPMENT (No Wallet)' : 'PRODUCTION (Wallet Active)'}`);
    console.log(`========================================`);
});

module.exports = app;