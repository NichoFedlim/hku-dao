// hku_ps_sync.js - HKU DAO PS System Synchronization
// Functions:
// 1. Reads unprocessed records from hku_dao_queue.json every 3 seconds.
// 2. Sends each record to the PS system sequentially (processing one record before sending the next).
// 3. After receiving a response, adds a tick field to the original record.
// 4. Records with an added tick will not be sent again.

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ================== CONFIGURATION ==================
const HKU_DAO_QUEUE_FILE = path.join(__dirname, 'hku_dao_queue.json');
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

/**
 * Load ts_1_ledger.json to get ts_thread and ts_chain
 */
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

/**
 * Save ts_1_ledger.json
 */
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

/**
 * Calculate the next chain value
 */
function calculateNextChain(thread, currentChain, nftData) {
    const dataToHash = `${thread}${getFormattedDateTime()}100${nftData}${currentChain}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Read hku_dao_queue.json and get unprocessed records (records without a tick field)
 * @returns {Array} Array of unprocessed records
 */
function getUnprocessedRecords() {
    try {
        if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) {
            return [];
        }
        
        const records = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        
        // Ensure it's an array
        if (!Array.isArray(records)) {
            console.error(`[${getFormattedDateTime()}] ❌ hku_dao_queue.json format error: not an array`);
            return [];
        }
        
        // Filter out records that already have a tick (already processed)
        const unprocessed = records.filter(record => record.tick === undefined);
        
        // Sort by seq
        unprocessed.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        if (unprocessed.length > 0) {
            console.log(`[${getFormattedDateTime()}] 📋 Found ${unprocessed.length} unprocessed records, seq: ${unprocessed.map(r => r.seq).join(', ')}`);
        }
        
        return unprocessed;
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to read hku_dao_queue.json:`, error);
        return [];
    }
}

/**
 * Update the tick field for a record in hku_dao_queue.json
 * @param {number} seq - Record sequence number
 * @param {number} tick - Tick value returned from PS system
 * @returns {boolean} Whether the update was successful
 */
function updateRecordTick(seq, tick) {
    try {
        if (!fs.existsSync(HKU_DAO_QUEUE_FILE)) {
            return false;
        }
        
        const records = JSON.parse(fs.readFileSync(HKU_DAO_QUEUE_FILE, 'utf-8'));
        
        if (!Array.isArray(records)) {
            return false;
        }
        
        const record = records.find(r => r.seq === seq);
        if (record) {
            record.tick = tick;
            record.processed_at = getFormattedDateTime();
            
            fs.writeFileSync(HKU_DAO_QUEUE_FILE, JSON.stringify(records, null, 2));
            console.log(`[${getFormattedDateTime()}] ✅ Record seq=${seq} updated with tick=${tick}`);
            return true;
        } else {
            console.warn(`[${getFormattedDateTime()}] ⚠️ Record seq=${seq} not found`);
            return false;
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to update record:`, error);
        return false;
    }
}

/**
 * Send a single record to the PS system
 * @param {Object} record - The record to send
 * @returns {Promise<Object>} PS system response
 */
async function sendToPS(record) {
    return new Promise((resolve, reject) => {
        if (!PS_CONFIG.connected || !PS_CONFIG.ws) {
            reject(new Error('PS system not connected'));
            return;
        }
        
        // Determine what data to send
        let nftData = null;
        let dataType = null;
        
        if (record.verification_code) {
            nftData = record.verification_code;
            dataType = 'verification_code';
        } else if (record.hash) {
            nftData = record.hash;
            dataType = 'hash';
        } else {
            reject(new Error(`Record seq=${record.seq} has neither verification_code nor hash`));
            return;
        }
        
        // Increment ts_thread
        PS_CONFIG.ts_thread++;
        const currentChain = PS_CONFIG.ts_chain;
        const tsNextChain = calculateNextChain(PS_CONFIG.ts_thread, currentChain, nftData);
        
        // Build ts_request
        const tsRequest = {
            ts_id: PS_CONFIG.ts_id,
            ts_thread: PS_CONFIG.ts_thread,
            ts_chain: currentChain,
            ts_next_chain: tsNextChain,
            nft: nftData,
            service: "input"
        };
        
        console.log(`\n[${getFormattedDateTime()}] ========== Sending to PS System ==========`);
        console.log(`  Record seq: ${record.seq}`);
        console.log(`  Data type: ${dataType}`);
        console.log(`  Data: ${nftData.substring(0, 32)}...`);
        console.log(`  ts_thread: ${tsRequest.ts_thread}`);
        console.log(`  ts_chain: ${tsRequest.ts_chain}`);
        console.log(`  ts_next_chain: ${tsRequest.ts_next_chain}`);
        
        // Set timeout
        const timeout = setTimeout(() => {
            reject(new Error('PS system response timeout (30s)'));
        }, 30000);
        
        // Response handler
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                if (response.ts_thread === PS_CONFIG.ts_thread && response.ts_id === PS_CONFIG.ts_id) {
                    clearTimeout(timeout);
                    PS_CONFIG.ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (e) {
                // Ignore parse errors for messages that aren't for us
            }
        };
        
        // Temporarily listen for response
        PS_CONFIG.ws.once('message', messageHandler);
        
        // Send request
        PS_CONFIG.ws.send(JSON.stringify(tsRequest));
        console.log(`[${getFormattedDateTime()}] 📤 Request sent, waiting for response...`);
    });
}

/**
 * Process a single record (send, wait for response, then update tick)
 * @param {Object} record - The record to process
 * @returns {Promise<boolean>} Whether processing was successful
 */
async function processRecord(record) {
    console.log(`\n[${getFormattedDateTime()}] 🔄 Processing record seq=${record.seq}`);
    
    try {
        // Send to PS system and wait for response
        const response = await sendToPS(record);
        
        console.log(`[${getFormattedDateTime()}] 📥 Received PS response:`);
        console.log(`  ts_thread: ${response.ts_thread}`);
        console.log(`  tick: ${response.tick}`);
        console.log(`  result.dao: ${response.result?.dao}`);
        
        // Update ledger (ts_chain)
        if (response.ledger && response.ledger.ts_next_chain) {
            PS_CONFIG.ts_chain = response.ledger.ts_next_chain;
            saveTsLedger();
            console.log(`[${getFormattedDateTime()}] 🔗 Updated ts_chain: ${PS_CONFIG.ts_chain}`);
        }
        
        // Check processing result
        if (response.result && response.result.dao !== "error") {
            // Success: update record with tick
            const tick = response.tick;
            if (tick !== undefined) {
                const updated = updateRecordTick(record.seq, tick);
                if (updated) {
                    console.log(`[${getFormattedDateTime()}] ✅ Record seq=${record.seq} processed successfully, tick=${tick}`);
                    return true;
                } else {
                    console.error(`[${getFormattedDateTime()}] ❌ Record seq=${record.seq} processed but tick update failed`);
                    return false;
                }
            } else {
                console.warn(`[${getFormattedDateTime()}] ⚠️ PS response has no tick field`);
                return false;
            }
        } else {
            console.error(`[${getFormattedDateTime()}] ❌ PS system returned error: ${response.result?.dao || 'unknown'}`);
            return false;
        }
        
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Processing record seq=${record.seq} failed:`, error.message);
        return false;
    }
}

/**
 * Process all unprocessed records (sequentially, one by one)
 */
async function processAllRecords() {
    if (PS_CONFIG.isProcessing) {
        console.log(`[${getFormattedDateTime()}] ⏳ Already processing, skipping this check`);
        return;
    }
    
    // Get unprocessed records
    const unprocessedRecords = getUnprocessedRecords();
    
    if (unprocessedRecords.length === 0) {
        // No pending records, skip silently
        return;
    }
    
    PS_CONFIG.isProcessing = true;
    console.log(`\n[${getFormattedDateTime()}] 🚀 Starting processing of ${unprocessedRecords.length} records`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Process sequentially
    for (let i = 0; i < unprocessedRecords.length; i++) {
        const record = unprocessedRecords[i];
        
        // Double-check that this record still doesn't have a tick (may have been processed by another process)
        const currentRecords = getUnprocessedRecords();
        const stillUnprocessed = currentRecords.some(r => r.seq === record.seq);
        if (!stillUnprocessed) {
            console.log(`[${getFormattedDateTime()}] ⏭️ Record seq=${record.seq} already processed, skipping`);
            continue;
        }
        
        const success = await processRecord(record);
        
        if (success) {
            successCount++;
        } else {
            failCount++;
            console.log(`[${getFormattedDateTime()}] ⚠️ Record seq=${record.seq} failed, continuing to next`);
        }
        
        // Small delay between records to avoid overwhelming the PS system
        if (i < unprocessedRecords.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log(`\n[${getFormattedDateTime()}] 📊 Processing complete: success=${successCount}, failed=${failCount}`);
    PS_CONFIG.isProcessing = false;
}

/**
 * Initialize PS system WebSocket connection
 */
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
                console.error(`[${getFormattedDateTime()}] ❌ PS system connection error:`, err.message);
                PS_CONFIG.connected = false;
                resolve(false);
            });
            
            PS_CONFIG.ws.on('close', () => {
                console.log(`[${getFormattedDateTime()}] ⚠️ PS system connection closed`);
                PS_CONFIG.connected = false;
                // Attempt to reconnect
                setTimeout(() => {
                    console.log(`[${getFormattedDateTime()}] 🔄 Attempting to reconnect to PS system...`);
                    initPSConnection();
                }, PS_CONFIG.reconnectInterval);
            });
            
            // Connection timeout
            setTimeout(() => {
                if (!PS_CONFIG.connected) {
                    console.log(`[${getFormattedDateTime()}] ⏰ PS system connection timeout`);
                    resolve(false);
                }
            }, 5000);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to initialize PS connection:`, error);
            resolve(false);
        }
    });
}

/**
 * Main loop: check and process every 3 seconds
 */
async function mainLoop() {
    console.log(`[${getFormattedDateTime()}] 🔄 Main loop started, check interval: 3 seconds`);
    
    while (true) {
        if (PS_CONFIG.connected) {
            await processAllRecords();
        } else {
            // Silently wait while disconnected
            process.stdout.write('.');
        }
        
        // Wait 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * Start the program
 */
async function start() {
    console.log('\n========================================');
    console.log('🚀 hku_ps_sync.js - HKU DAO PS System Sync v2.0');
    console.log('========================================');
    console.log(`📁 Queue file: ${HKU_DAO_QUEUE_FILE}`);
    console.log(`🔌 PS system URL: ${PS_CONFIG.url}`);
    console.log(`⏱️  Check interval: 3 seconds`);
    console.log(`📝 Processing mode: Sequential, tick added after each record`);
    console.log('========================================\n');
    
    // Load ledger
    loadTsLedger();
    
    // Connect to PS system
    const connected = await initPSConnection();
    
    if (!connected) {
        console.log(`[${getFormattedDateTime()}] ⚠️ Initial connection failed, will retry in background`);
    }
    
    // Start main loop
    await mainLoop();
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Received SIGINT, cleaning up...');
    if (PS_CONFIG.ws) {
        PS_CONFIG.ws.close();
    }
    saveTsLedger();
    console.log('✅ Cleanup complete, exiting');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Received SIGTERM, cleaning up...');
    if (PS_CONFIG.ws) {
        PS_CONFIG.ws.close();
    }
    saveTsLedger();
    process.exit(0);
});

// Start the program
start().catch(error => {
    console.error('❌ Program startup failed:', error);
    process.exit(1);
});
