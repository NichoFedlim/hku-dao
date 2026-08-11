// hku_ps_sync.js - HKU DAO PS System Synchronization
// Functions:
// 1. Reads unprocessed records from hku_dao_queue.json every 3 seconds.
// 2. Handles purchase records separately (stores in purchase_db, no PS).
// 3. For NFT records: checks local nft.json DB for duplicates.
// 4. Sends unique NFTs to PS, gets tick, stores in nft_db.
// 5. Implements retry limits (max 10 attempts).
// 6. Cleans up the queue daily (removes old processed records).

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ================== CONFIGURATION ==================
const HKU_DAO_QUEUE_FILE = path.join(__dirname, 'hku_dao_queue.json');
const NFT_DB_DIR = path.join(__dirname, 'nft_db');
const NFT_FILE_PREFIX = 'nft_';
const MAX_NFT_PER_FILE = 10000;
const MAX_RETRIES = 10;              // Maximum retry attempts
const QUEUE_CLEANUP_AGE_DAYS = 30;   // Remove processed records older than this
const QUEUE_MAX_SIZE = 10000;        // Hard limit on queue size
const QUEUE_TARGET_SIZE = 5000;      // Target after cleanup
const DAO_ID = '2.3';   // Our DAO number

const PS_CONFIG = {
    url: 'ws://localhost:4000',
    connected: false,
    ws: null,
    ts_id: 1,           // TS node ID (RBAS)
    ts_thread: 0,       // Thread counter
    ts_chain: '',       // Current chain value
    reconnectInterval: 5000,
    isProcessing: false,
    currentRecordSeq: null
};

// ================== GLOBAL STATE ==================
let nftHashSet = new Set();
let currentNftFileNumber = 0;
let currentNftFileCount = 0;
let currentNftFilePath = '';

let currentPurchaseFileNumber = 0;
let currentPurchaseFileCount = 0;
let currentPurchaseFilePath = '';

// ================== UTILITY FUNCTIONS ==================
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


// Load ts_1_ledger.json to get ts_thread and ts_chain
function loadTsLedger() {
    const ledgerFile = path.join(__dirname, 'ts_1_ledger.json');
    try {
        if (fs.existsSync(ledgerFile)) {
            const ledgerData = JSON.parse(fs.readFileSync(ledgerFile, 'utf-8'));
            PS_CONFIG.ts_thread = ledgerData.ts_thread || 0;
            PS_CONFIG.ts_chain = ledgerData.ts_next_chain || '1234567890abcdef';
            console.log(`[${getFormattedDateTime()}] 📖 Loaded ledger: ts_thread=${PS_CONFIG.ts_thread}, ts_chain=${PS_CONFIG.ts_chain}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ⚠️ ts_1_ledger.json not found, using defaults`);
            PS_CONFIG.ts_chain = '1234567890abcdef';
            PS_CONFIG.ts_thread = 0;
            saveTsLedger();
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to read ledger:`, error);
        PS_CONFIG.ts_chain = '1234567890abcdef';
        PS_CONFIG.ts_thread = 0;
    }
}


// Save ts_1_ledger.json
function saveTsLedger() {
    const ledgerFile = path.join(__dirname, 'ts_1_ledger.json');
    const ledgerData = {
        ts_id: PS_CONFIG.ts_id,
        ts_thread: PS_CONFIG.ts_thread,
        ts_next_chain: PS_CONFIG.ts_chain,
        last_update: getFormattedDateTime()
    };
    try {
        fs.writeFileSync(ledgerFile, JSON.stringify(ledgerData, null, 2));
        console.log(`[${getFormattedDateTime()}] 💾 Saved ledger: ts_thread=${PS_CONFIG.ts_thread}, ts_chain=${PS_CONFIG.ts_chain}`);
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to save ledger:`, error);
    }
}


// Calculate the next chain value
function calculateNextChain(thread, currentChain, nftData) {
    const dataToHash = `${thread}${getFormattedDateTime()}100${nftData}${currentChain}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex').substring(0, 16).toUpperCase();
}

// ================== NFT DATABASE MANAGEMENT ==================

function ensureNftDbDir() {
    if (!fs.existsSync(NFT_DB_DIR)) fs.mkdirSync(NFT_DB_DIR, { recursive: true });
}

function loadNftDatabase() {
    ensureNftDbDir();
    const files = fs.readdirSync(NFT_DB_DIR).filter(f => f.startsWith('nft_') && f.endsWith('.json'));
    const hashSet = new Set();
    let maxFileNumber = 0;
    let lastFileNumberWithSpace = 0;
    let lastFilePath = '';
    let lastFileCount = 0;

    const sortedFiles = files.sort((a, b) => {
        return parseInt(a.replace('nft_', '').replace('.json', '')) - parseInt(b.replace('nft_', '').replace('.json', ''));
    });

    for (const file of sortedFiles) {
        const filePath = path.join(NFT_DB_DIR, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!Array.isArray(data)) continue;
            const count = data.length;
            const fileNumber = parseInt(file.replace('nft_', '').replace('.json', ''));
            if (fileNumber > maxFileNumber) maxFileNumber = fileNumber;
            for (const record of data) {
                if (record.nft) hashSet.add(record.nft);
            }
            if (count < MAX_RECORDS_PER_FILE) {
                lastFileNumberWithSpace = fileNumber;
                lastFilePath = filePath;
                lastFileCount = count;
            }
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to read NFT file ${file}:`, error);
        }
    }

    nftHashSet = hashSet;

    if (lastFileNumberWithSpace === 0 && maxFileNumber > 0) {
        currentNftFileNumber = maxFileNumber + 1;
        currentNftFilePath = path.join(NFT_DB_DIR, `nft_${currentNftFileNumber}.json`);
        currentNftFileCount = 0;
        fs.writeFileSync(currentNftFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new NFT file: ${currentNftFilePath}`);
    } else if (lastFileNumberWithSpace > 0) {
        currentNftFileNumber = lastFileNumberWithSpace;
        currentNftFilePath = lastFilePath;
        currentNftFileCount = lastFileCount;
    } else {
        currentNftFileNumber = 1;
        currentNftFilePath = path.join(NFT_DB_DIR, 'nft_1.json');
        currentNftFileCount = 0;
        fs.writeFileSync(currentNftFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new NFT file: ${currentNftFilePath}`);
    }

    console.log(`[${getFormattedDateTime()}] 📊 Loaded ${nftHashSet.size} unique NFT hashes. Active: ${path.basename(currentNftFilePath)} (${currentNftFileCount}/${MAX_RECORDS_PER_FILE})`);
}

function addNftToDb(record) {
    ensureNftDbDir();
    if (currentNftFileCount >= MAX_RECORDS_PER_FILE) {
        currentNftFileNumber++;
        currentNftFilePath = path.join(NFT_DB_DIR, `nft_${currentNftFileNumber}.json`);
        currentNftFileCount = 0;
        fs.writeFileSync(currentNftFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new NFT file: ${currentNftFilePath}`);
    }

    let data = [];
    try { data = JSON.parse(fs.readFileSync(currentNftFilePath, 'utf-8')); } catch (e) { data = []; }
    data.push(record);
    fs.writeFileSync(currentNftFilePath, JSON.stringify(data, null, 2));
    currentNftFileCount = data.length;
    if (record.nft) nftHashSet.add(record.nft);
    console.log(`[${getFormattedDateTime()}] ✅ NFT record (seq=${record.seq}) added to ${path.basename(currentNftFilePath)} (${currentNftFileCount}/${MAX_RECORDS_PER_FILE})`);
}

// ================== PURCHASE DATABASE MANAGEMENT ==================

function ensurePurchaseDbDir() {
    if (!fs.existsSync(PURCHASE_DB_DIR)) fs.mkdirSync(PURCHASE_DB_DIR, { recursive: true });
}

function loadPurchaseDatabase() {
    ensurePurchaseDbDir();
    const files = fs.readdirSync(PURCHASE_DB_DIR).filter(f => f.startsWith('purchase_') && f.endsWith('.json'));
    let maxFileNumber = 0;
    let lastFileNumberWithSpace = 0;
    let lastFilePath = '';
    let lastFileCount = 0;

    const sortedFiles = files.sort((a, b) => {
        return parseInt(a.replace('purchase_', '').replace('.json', '')) - parseInt(b.replace('purchase_', '').replace('.json', ''));
    });

    for (const file of sortedFiles) {
        const filePath = path.join(PURCHASE_DB_DIR, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!Array.isArray(data)) continue;
            const count = data.length;
            const fileNumber = parseInt(file.replace('purchase_', '').replace('.json', ''));
            if (fileNumber > maxFileNumber) maxFileNumber = fileNumber;
            if (count < MAX_RECORDS_PER_FILE) {
                lastFileNumberWithSpace = fileNumber;
                lastFilePath = filePath;
                lastFileCount = count;
            }
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to read purchase file ${file}:`, error);
        }
    }

    if (lastFileNumberWithSpace === 0 && maxFileNumber > 0) {
        currentPurchaseFileNumber = maxFileNumber + 1;
        currentPurchaseFilePath = path.join(PURCHASE_DB_DIR, `purchase_${currentPurchaseFileNumber}.json`);
        currentPurchaseFileCount = 0;
        fs.writeFileSync(currentPurchaseFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new purchase file: ${currentPurchaseFilePath}`);
    } else if (lastFileNumberWithSpace > 0) {
        currentPurchaseFileNumber = lastFileNumberWithSpace;
        currentPurchaseFilePath = lastFilePath;
        currentPurchaseFileCount = lastFileCount;
    } else {
        currentPurchaseFileNumber = 1;
        currentPurchaseFilePath = path.join(PURCHASE_DB_DIR, 'purchase_1.json');
        currentPurchaseFileCount = 0;
        fs.writeFileSync(currentPurchaseFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new purchase file: ${currentPurchaseFilePath}`);
    }

    console.log(`[${getFormattedDateTime()}] 📊 Purchase DB active: ${path.basename(currentPurchaseFilePath)} (${currentPurchaseFileCount}/${MAX_RECORDS_PER_FILE})`);
}

function addPurchaseToDb(record) {
    ensurePurchaseDbDir();
    if (currentPurchaseFileCount >= MAX_RECORDS_PER_FILE) {
        currentPurchaseFileNumber++;
        currentPurchaseFilePath = path.join(PURCHASE_DB_DIR, `purchase_${currentPurchaseFileNumber}.json`);
        currentPurchaseFileCount = 0;
        fs.writeFileSync(currentPurchaseFilePath, JSON.stringify([], null, 2));
        console.log(`[${getFormattedDateTime()}] 📄 Created new purchase file: ${currentPurchaseFilePath}`);
    }

    let data = [];
    try { data = JSON.parse(fs.readFileSync(currentPurchaseFilePath, 'utf-8')); } catch (e) { data = []; }
    data.push(record);
    fs.writeFileSync(currentPurchaseFilePath, JSON.stringify(data, null, 2));
    currentPurchaseFileCount = data.length;
    console.log(`[${getFormattedDateTime()}] ✅ Purchase record (seq=${record.seq}) added to ${path.basename(currentPurchaseFilePath)} (${currentPurchaseFileCount}/${MAX_RECORDS_PER_FILE})`);
}

// ================== QUEUE OPERATIONS (with retry handling) ==================

function getUnprocessedRecords() {
    try {
        if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) return [];
        const records = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        if (!Array.isArray(records)) return [];
        // Filter: no tick AND (retry_count < MAX_RETRIES OR retry_count doesn't exist)
        const unprocessed = records.filter(record => {
            if (record.tick !== undefined) return false; // already processed
            const retries = record.retry_count || 0;
            if (retries >= MAX_RETRIES) {
                // If it reached max retries but isn't marked, mark it now to stop retrying.
                // We'll handle this in processRecord as well, but we can pre-mark.
                // For safety, we'll let processRecord mark it.
                return false; // Don't process if max retries exceeded.
            }
            return true;
        });
        unprocessed.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        if (unprocessed.length > 0) {
            console.log(`[${getFormattedDateTime()}] 📋 Found ${unprocessed.length} unprocessed records, seq: ${unprocessed.map(r => r.seq).join(', ')}`);
        }
        
        return unprocessed;
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to read queue:`, error);
        return [];
    }
}

function updateQueueRecord(seq, updates) {
    try {
        if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) return false;
        const records = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        if (!Array.isArray(records)) return false;
        const record = records.find(r => r.seq === seq);
        if (!record) {
            console.warn(`[${getFormattedDateTime()}] ⚠️ Record seq=${seq} not found`);
            return false;
        }
        Object.assign(record, updates);
        fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify(records, null, 2));
        console.log(`[${getFormattedDateTime()}] ✅ Record seq=${seq} updated with ${Object.keys(updates).join(', ')}`);
        return true;
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to update record:`, error);
        return false;
    }
}

// ================== QUEUE CLEANUP ==================
function cleanupQueue() {
    try {
        if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) return;
        let records = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        if (!Array.isArray(records)) return;

        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - QUEUE_CLEANUP_AGE_DAYS);

        // Keep unprocessed records AND processed records that are recent enough
        let filtered = records.filter(record => {
            if (!record.tick) return true; // always keep unprocessed
            const created = new Date(record.created_at);
            return created >= cutoffDate;
        });

        // If still too many, discard oldest processed records
        if (filtered.length > QUEUE_MAX_SIZE) {
            const unprocessed = filtered.filter(r => !r.tick);
            const processed = filtered.filter(r => r.tick);
            processed.sort((a, b) => a.seq - b.seq); // oldest first
            const keepCount = Math.max(0, QUEUE_MAX_SIZE - unprocessed.length);
            const keptProcessed = processed.slice(-keepCount); // keep latest
            filtered = [...unprocessed, ...keptProcessed];
        }

        if (filtered.length !== records.length) {
            fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify(filtered, null, 2));
            console.log(`[${getFormattedDateTime()}] 🧹 Queue cleaned: removed ${records.length - filtered.length} records`);
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Queue cleanup failed:`, error);
    }
}

// ================== PS COMMUNICATION ==================
async function sendToPS(record, nftData) {
    return new Promise((resolve, reject) => {
        if (!PS_CONFIG.connected || !PS_CONFIG.ws) {
            reject(new Error('PS system not connected'));
            return;
        }
        PS_CONFIG.ts_thread++;
        const currentChain = PS_CONFIG.ts_chain;
        const tsNextChain = calculateNextChain(PS_CONFIG.ts_thread, currentChain, nftData);

        const tsRequest = {
            ts_id: PS_CONFIG.ts_id,
            ts_thread: PS_CONFIG.ts_thread,
            ts_chain: currentChain,
            ts_next_chain: tsNextChain,
            nft: nftData,
            service: "input"
        };

        console.log(`\n[${getFormattedDateTime()}] ========== Sending to PS ==========`);
        console.log(`  seq: ${record.seq}, data: ${nftData.substring(0, 32)}...`);
        console.log(`  ts_thread: ${tsRequest.ts_thread}, ts_chain: ${tsRequest.ts_chain}`);

        const timeout = setTimeout(() => {
            reject(new Error('PS response timeout (30s)'));
        }, 30000);

        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                if (response.ts_thread === PS_CONFIG.ts_thread && response.ts_id === PS_CONFIG.ts_id) {
                    clearTimeout(timeout);
                    PS_CONFIG.ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (e) { /* ignore */ }
        };

        PS_CONFIG.ws.once('message', messageHandler);
        PS_CONFIG.ws.send(JSON.stringify(tsRequest));
        console.log(`[${getFormattedDateTime()}] 📤 Request sent`);
    });
}

// ================== PROCESS A SINGLE RECORD ==================
async function processRecord(record) {
    const seq = record.seq;
    const retryCount = (record.retry_count || 0) + 1;

    console.log(`\n[${getFormattedDateTime()}] 🔄 Processing seq=${seq}, type=${record.type}, retry=${retryCount}/${MAX_RETRIES}`);

    // --- Handle Purchase Records ---
    if (record.type === 'purchase') {
        if (!record.verification_code) {
            console.error(`[${getFormattedDateTime()}] ❌ Purchase record ${seq} missing verification_code`);
            await updateQueueRecord(seq, { tick: 'error_missing_code', retry_count: retryCount });
            return false;
        }
        // Store in purchase DB
        const purchaseRecord = {
            seq: seq,
            verification_code: record.verification_code,
            dao_id: DAO_ID,
            tick: 'purchase_logged',
            created_at: record.created_at,
            processed_at: getFormattedDateTime()
        };
        addPurchaseToDb(purchaseRecord);
        await updateQueueRecord(seq, { tick: 'purchase_logged', retry_count: retryCount });
        console.log(`[${getFormattedDateTime()}] ✅ Purchase record ${seq} stored in purchase DB.`);
        return true;
    }

    // --- NFT Records (category, subcategory, item) ---
    if (!record.hash) {
        console.error(`[${getFormattedDateTime()}] ❌ NFT record ${seq} missing hash`);
        await updateQueueRecord(seq, { tick: 'error_no_hash', retry_count: retryCount });
        return false;
    }

    const nftHash = record.hash;

    // 1. Check local duplicate
    if (nftHashSet.has(nftHash)) {
        console.warn(`[${getFormattedDateTime()}] ⚠️ NFT hash ${nftHash.substring(0,16)}... already exists. Marking duplicate.`);
        await updateQueueRecord(seq, { tick: 'duplicate', retry_count: retryCount });
        return true;
    }

    // 2. Send to PS
    let psResponse;
    try {
        psResponse = await sendToPS(record, nftHash);
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ PS error for ${seq}: ${error.message}`);
        // Increment retry count, do NOT set tick.
        if (retryCount >= MAX_RETRIES) {
            console.error(`[${getFormattedDateTime()}] ❌ Max retries reached for ${seq}. Marking as failed.`);
            await updateQueueRecord(seq, { tick: 'failed_max_retries', retry_count: retryCount });
            return false;
        }
        await updateQueueRecord(seq, { retry_count: retryCount });
        return false;
    }

    // 3. Check PS response
    if (!psResponse || !psResponse.result || psResponse.result.dao === 'error') {
        console.error(`[${getFormattedDateTime()}] ❌ PS returned error for ${seq}: ${psResponse?.result?.dao || 'unknown'}`);
        if (retryCount >= MAX_RETRIES) {
            await updateQueueRecord(seq, { tick: 'failed_max_retries', retry_count: retryCount });
            return false;
        }
        await updateQueueRecord(seq, { retry_count: retryCount });
        return false;
    }

    const tick = psResponse.tick;
    if (tick === undefined) {
        console.error(`[${getFormattedDateTime()}] ❌ PS response missing tick for ${seq}`);
        if (retryCount >= MAX_RETRIES) {
            await updateQueueRecord(seq, { tick: 'failed_max_retries', retry_count: retryCount });
            return false;
        }
        await updateQueueRecord(seq, { retry_count: retryCount });
        return false;
    }

    // 4. Update ledger
    if (psResponse.ledger && psResponse.ledger.ts_next_chain) {
        PS_CONFIG.ts_chain = psResponse.ledger.ts_next_chain;
        saveTsLedger();
        console.log(`[${getFormattedDateTime()}] 🔗 Updated ts_chain: ${PS_CONFIG.ts_chain}`);
    }

    // 5. Store in NFT DB
    const nftRecord = {
        seq: seq,
        nft: nftHash,
        dao_id: DAO_ID,
        tick: tick,
        type: record.type,
        created_at: record.created_at,
        processed_at: getFormattedDateTime()
    };
    addNftToDb(nftRecord);

    // 6. Update queue with success tick
    await updateQueueRecord(seq, { tick: tick, retry_count: retryCount });
    console.log(`[${getFormattedDateTime()}] ✅ Record ${seq} fully processed.`);
    return true;
}

// ================== PROCESS ALL RECORDS ==================
async function processAllRecords() {
    if (PS_CONFIG.isProcessing) return;

    const unprocessed = getUnprocessedRecords();
    if (unprocessed.length === 0) return;

    PS_CONFIG.isProcessing = true;
    console.log(`\n[${getFormattedDateTime()}] 🚀 Starting processing of ${unprocessed.length} records`);

    for (const record of unprocessed) {
        // Double-check still unprocessed
        const currentUnprocessed = getUnprocessedRecords();
        const stillUnprocessed = currentUnprocessed.some(r => r.seq === record.seq);
        if (!stillUnprocessed) {
            console.log(`[${getFormattedDateTime()}] ⏭️ Record ${record.seq} already processed, skipping`);
            continue;
        }
        await processRecord(record);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    PS_CONFIG.isProcessing = false;
}

// ================== PS CONNECTION ==================
async function initPSConnection() {
    return new Promise((resolve) => {
        try {
            PS_CONFIG.ws = new WebSocket(PS_CONFIG.url);
            
            PS_CONFIG.ws.on('open', () => {
                console.log(`[${getFormattedDateTime()}] ✅ Connected to PS system (${PS_CONFIG.url})`);
                PS_CONFIG.connected = true;
                resolve(true);
            });

            PS_CONFIG.ws.on('error', (err) => {
                console.error(`[${getFormattedDateTime()}] ❌ PS error:`, err.message);
                PS_CONFIG.connected = false;
                resolve(false);
            });
            
            PS_CONFIG.ws.on('close', () => {
                console.log(`[${getFormattedDateTime()}] ⚠️ PS connection closed`);
                PS_CONFIG.connected = false;
                setTimeout(() => {
                    console.log(`[${getFormattedDateTime()}] 🔄 Reconnecting to PS...`);
                    initPSConnection();
                }, PS_CONFIG.reconnectInterval);
            });
            setTimeout(() => {
                if (!PS_CONFIG.connected) {
                    console.log(`[${getFormattedDateTime()}] ⏰ PS connection timeout`);
                    resolve(false);
                }
            }, 5000);
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to init PS:`, error);
            resolve(false);
        }
    });
}

// ================== MAIN LOOP ==================
async function mainLoop() {
    console.log(`[${getFormattedDateTime()}] 🔄 Main loop started (interval: 3s)`);
    let cleanupCounter = 0;

    while (true) {
        if (PS_CONFIG.connected) {
            await processAllRecords();
        } else {
            // Silently wait while disconnected
            process.stdout.write('.');
        }

        // Run cleanup every ~24 hours (approx 28800 iterations of 3s)
        cleanupCounter++;
        if (cleanupCounter % 28800 === 0) {
            console.log(`\n[${getFormattedDateTime()}] 🧹 Running scheduled queue cleanup...`);
            cleanupQueue();
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

// ================== START ==================
async function start() {
    console.log('\n========================================');
    console.log('🚀 hku_ps_sync.js v3.0 (with Purchase DB, Retries, Cleanup)');
    console.log('========================================');
    console.log(`📁 Queue: ${HKU_DAO_QUEUE_FILE}`);
    console.log(`📁 NFT DB: ${NFT_DB_DIR}`);
    console.log(`📁 Purchase DB: ${PURCHASE_DB_DIR}`);
    console.log(`🔌 PS: ${PS_CONFIG.url}`);
    console.log(`🔄 Max Retries: ${MAX_RETRIES}`);
    console.log(`🧹 Cleanup: ${QUEUE_CLEANUP_AGE_DAYS} days, Max ${QUEUE_MAX_SIZE} records`);
    console.log('========================================\n');

    loadTsLedger();
    loadNftDatabase();
    loadPurchaseDatabase();

    // Run initial cleanup on startup
    console.log(`[${getFormattedDateTime()}] 🧹 Running initial queue cleanup...`);
    cleanupQueue();

    const connected = await initPSConnection();
    
    if (!connected) {
        console.log(`[${getFormattedDateTime()}] ⚠️ Initial PS connection failed. Will retry.`);
    }

    await mainLoop();
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    if (PS_CONFIG.ws) PS_CONFIG.ws.close();
    saveTsLedger();
    console.log('✅ Cleanup complete. Exiting.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down...');
    if (PS_CONFIG.ws) PS_CONFIG.ws.close();
    saveTsLedger();
    process.exit(0);
});

// Start the program
start().catch(error => {
    console.error('❌ Startup failed:', error);
    process.exit(1);
});
