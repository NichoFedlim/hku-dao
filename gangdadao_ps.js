// ====================================================================
// gangdadao_ps.js - PS System Synchronization Program v4.0 (Adapted for Gangdadao server.js)
// ====================================================================
// 
// 【Program Functions】
// 1. Read pending NFT records from hku_dao_queue.json
// 2. Send each record to the PS system (WebSocket connection, using ts_id=3)
// 3. Receive tick and dao from the PS system
// 4. Save processing results to ps_gangda.jsonl (does not modify the original file)
// 5. Use caching mechanism to avoid repeated file reads
// 6. Automatically detect file changes and intelligently refresh cache
//
// 【Differences from bxd_ps.js】
// - ts_id: 3 (Gangdadao specific)
// - Ledger file: ts_3_ledger.json
// - Default chain value: 3234567890abcdef
// - Chain value calculation: consistent with server.js
//
// 【File Descriptions】
// - hku_dao_queue.json    : Pending records (written by server.js, this program only reads)
// - ps_gangda.jsonl   : Processed records (written by this program, used for deduplication and traceability)
// - ts_3_ledger.json: Ledger file (records chain state)
//
// 【Deduplication Mechanism】
// Use a Set to cache all processed nfts (hash or verification_code)
// When reading from hku_dao_queue.json, filter out existing nfts
//
// 【Cache Strategy】
// - Cache TTL: 30 seconds (CACHE_TTL)
// - Detect file changes: size, modification time, inode
// - When adding records: update both memory cache and file
// ====================================================================

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ==================== Configuration ====================

// File path configuration
const BXD_PS_FILE = path.join(__dirname, 'hku_dao_queue.json');    // Pending records (read-only)
const PS_BXD_FILE = path.join(__dirname, 'ps_gangda.jsonl');   // Processed records (write)
const TS_LEDGER_FILE = path.join(__dirname, 'ts_3_ledger.json'); // Ledger (Gangdadao specific)

// Cache configuration
const CACHE_TTL = 30000;  // Cache TTL: 30 seconds (30000 milliseconds)

// PS system connection configuration
const PS_CONFIG = {

    url: 'ws://192.168.1.26:4000',  // PS system WebSocket address
    connected: false,            // Connection status
    ws: null,                    // WebSocket instance
    ts_id: 3,                    // ★ TS node ID (Gangdadao specific)
    ts_thread: 0,                // Thread number (restored from ledger)
    ts_chain: '',                // Current chain value (restored from ledger)
    reconnectInterval: 5000,     // Reconnection interval: 5 seconds
    isProcessing: false          // Whether processing (prevents concurrency)
};

// ==================== Utility Functions ====================

/**
 * Get formatted date and time
 * Format: YYYY/MM/DD HH:MM:SS
 * Usage: logging, timestamps
 */
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
 * Get formatted time (without date)
 * Format: HH:MM:SS
 * Usage: consistent with server.js
 */
function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format wallet address (short display)
 * Usage: consistent with server.js when generating verification codes
 */
function formatWalletShort(wallet) {
    if (!wallet) return 'Unknown';
    if (wallet.length <= 8) return wallet;
    return wallet.slice(0, 4) + '***' + wallet.slice(-4);
}

/**
 * Format chain value (short display)
 * Usage: consistent with server.js when generating verification codes
 */
function formatChainShort(chain) {
    const displayLength = 4;
    return chain ? chain.slice(0, displayLength) + '...' : 'Unknown';
}

/**
 * Generate a complete 64-bit verification code (consistent with server.js)
 * 
 * Verification code generation rules:
 * 1. Concatenate data: thread + time + price + seller + buyer + chain
 * 2. Calculate SHA256 hash
 * 3. Convert to uppercase
 * 
 * Usage: as the unique identifier for NFT transactions
 * 
 * @param {number} thread - Thread number
 * @param {string} time - Time
 * @param {number} price - Price
 * @param {string} seller - Seller
 * @param {string} buyer - Buyer
 * @param {string} chain - Current chain
 * @returns {string} 64-bit uppercase verification code
 */
function generateVerificationCode(thread, time, price, seller, buyer, chain) {
    // Use standard format to generate verification code (exactly consistent with server.js)
    const displayData =
        `${thread}\t` +
        `${time}\t` +
        `￥${price}\t` +
        `${formatWalletShort(seller)}\t` +
        `${formatWalletShort(buyer)}\t` +
        `${formatChainShort(chain)}`;
    
    // Calculate the complete SHA256 hash and convert to uppercase
    const fullHash = crypto.createHash('sha256').update(displayData).digest('hex');
    return fullHash.toUpperCase();
}

/**
 * Calculate the next chain value (first 16 bits of verification_code)
 * ★ Consistent with server.js's calculateNextChain logic
 * 
 * @param {number} thread - Thread number
 * @param {string} time - Time
 * @param {number} price - Price
 * @param {string} seller - Seller
 * @param {string} buyer - Buyer
 * @param {string} chain - Current chain
 * @returns {string} 16-bit uppercase chain value
 */
function calculateNextChain(thread, time, price, seller, buyer, chain) {
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    return verification_code.substring(0, 16).toUpperCase();
}

/**
 * Extract NFT data from a record
 * Prefer verification_code, fallback to hash
 * Reason: verification_code is the transaction verification code, hash is the NFT hash
 */
function getNftData(record) {
    if (record.verification_code) {
        return record.verification_code;
    } else if (record.hash) {
        return record.hash;
    }
    return null;  // Neither exists, return null
}

// ==================== Cache Manager ====================

/**
 * File Cache Manager
 * 
 * Purpose: Avoid frequent hard disk file reads, improve performance
 * Principle: Load file data into memory (Set), use directly within the validity period
 * 
 * Cache invalidation conditions:
 * 1. Exceeds TTL (30 seconds)
 * 2. File size changes
 * 3. File modification time changes
 * 4. File inode changes (Linux)
 */
class FileCacheManager {
    /**
     * Constructor
     * @param {string} filePath - File path to cache
     * @param {number} ttl - Cache TTL (milliseconds)
     */
    constructor(filePath, ttl = 30000) {
        this.filePath = filePath;           // File path
        this.ttl = ttl;                     // Cache TTL
        
        this.cache = null;                  // Cache data (Set object)
        this.cacheTimestamp = 0;            // Cache creation time
        
        // File status tracking (for change detection)
        this.lastSize = 0;                  // Last file size (bytes)
        this.lastMtime = 0;                 // Last modification time (milliseconds)
        this.lastIno = 0;                   // Last inode number (Linux)
        
        // Statistics
        this.hitCount = 0;                  // Cache hit count
        this.missCount = 0;                 // Cache miss count
        
        // Initialize file status
        this.initFileState();
    }
    
    /**
     * Initialize file status
     * Record the current file status on first startup
     */
    initFileState() {
        try {
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                // inode may not exist on some systems, handle gracefully
                if (stats.ino) {
                    this.lastIno = stats.ino;
                }
                console.log(`[${getFormattedDateTime()}] 📂 Initialized file status:`);
                console.log(`   Size: ${this.lastSize} bytes`);
                console.log(`   Modification time: ${new Date(this.lastMtime).toLocaleString()}`);
                console.log(`   inode: ${this.lastIno || 'N/A'}`);
            } else {
                console.log(`[${getFormattedDateTime()}] ⚠️ File does not exist: ${this.filePath}`);
            }
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to initialize file status:`, error);
        }
    }
    
    /**
     * Detect whether the file has changed
     * 
     * Detection methods (triple detection):
     * 1. File size changed → indicates additions or deletions
     * 2. Modification time changed → indicates content was modified
     * 3. inode changed → indicates file was recreated (e.g., log rotation)
     * 
     * @returns {boolean} true=file changed, false=file unchanged
     */
    hasFileChanged() {
        try {
            // If file does not exist, treat as changed (need to reload, but will return empty data)
            if (!fs.existsSync(this.filePath)) {
                console.log(`[${getFormattedDateTime()}] ⚠️ File does not exist: ${this.filePath}`);
                return true;
            }
            
            // Get current file status
            const stats = fs.statSync(this.filePath);
            
            // Check for changes (any condition met means changed)
            const sizeChanged = stats.size !== this.lastSize;
            const mtimeChanged = stats.mtimeMs !== this.lastMtime;
            const inoChanged = stats.ino && stats.ino !== this.lastIno;
            
            const changed = sizeChanged || mtimeChanged || inoChanged;
            
            if (changed) {
                // Log change details
                console.log(`[${getFormattedDateTime()}] 📝 Detected file changes:`);
                if (sizeChanged) {
                    console.log(`   📏 Size: ${this.lastSize} → ${stats.size} bytes`);
                }
                if (mtimeChanged) {
                    console.log(`   🕐 Modification time: ${new Date(this.lastMtime).toLocaleString()} → ${new Date(stats.mtimeMs).toLocaleString()}`);
                }
                if (inoChanged) {
                    console.log(`   📁 inode: ${this.lastIno} → ${stats.ino}`);
                }
                
                // Update status
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            return changed;
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to detect file changes:`, error);
            return true;  // On error, treat as changed and reload
        }
    }
    
    /**
     * Check if cache is valid
     * 
     * Cache validity conditions:
     * 1. Cache exists (not null)
     * 2. Has not exceeded TTL
     * 3. File has not changed
     * 
     * @returns {boolean} true=cache valid, false=cache invalid, needs reload
     */
    isCacheValid() {
        // Condition 1: Does cache exist?
        if (!this.cache) {
            console.log(`[${getFormattedDateTime()}] 📦 Cache is empty, need to load`);
            return false;
        }
        
        // Condition 2: Has TTL been exceeded?
        const now = Date.now();
        const age = now - this.cacheTimestamp;
        if (age >= this.ttl) {
            console.log(`[${getFormattedDateTime()}] 📦 Cache expired (${Math.round(age/1000)}s > ${this.ttl/1000}s)`);
            return false;
        }
        
        // Condition 3: Has the file changed?
        if (this.hasFileChanged()) {
            console.log(`[${getFormattedDateTime()}] 📦 File changed, cache invalidated`);
            return false;
        }
        
        // Cache is valid
        this.hitCount++;
        console.log(`[${getFormattedDateTime()}] 📦 Cache hit (${this.cache.size} entries, loaded ${Math.round(age/1000)}s ago, ${this.hitCount} hits)`);
        return true;
    }
    
    /**
     * Load data from file into Set
     * 
     * File format: ps_gangda.jsonl (one JSON object per line)
     * Each line format: {"seq":1,"nft":"HASH","dao":"2.3","tick":12345,"time":"2026/08/10 10:30:15"}
     * 
     * @returns {Set} Set containing all nfts
     */
    loadFromFile() {
        const processed = new Set();
        let lineCount = 0;
        let errorCount = 0;
        
        try {
            // If file does not exist, return empty Set
            if (!fs.existsSync(this.filePath)) {
                console.log(`[${getFormattedDateTime()}] ⚠️ File does not exist, returning empty set`);
                return processed;
            }
            
            // Read file content
            console.log(`[${getFormattedDateTime()}] 📖 Reading file: ${this.filePath}`);
            const content = fs.readFileSync(this.filePath, 'utf-8');
            
            // Split by lines, filter empty lines
            const lines = content.trim().split('\n').filter(l => l.length > 0);
            console.log(`[${getFormattedDateTime()}] 📄 Total ${lines.length} lines`);
            
            // Parse line by line
            for (const line of lines) {
                try {
                    const record = JSON.parse(line);
                    if (record.nft) {
                        processed.add(record.nft);
                        lineCount++;
                    }
                } catch (e) {
                    errorCount++;
                    // Log the error but don't interrupt processing
                    if (errorCount <= 5) {
                        console.warn(`[${getFormattedDateTime()}] ⚠️ Failed to parse line: ${line.substring(0, 50)}...`);
                    }
                }
            }
            
            // Update file status (after loading, file status matches current)
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            console.log(`[${getFormattedDateTime()}] ✅ Load complete: ${lineCount} valid records${errorCount > 0 ? `, ${errorCount} parse errors` : ''}`);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to load file:`, error);
        }
        
        return processed;
    }
    
    /**
     * Get cached data
     * 
     * Core method: automatically detects if cache is valid
     * - Valid: directly returns the cached Set
     * - Invalid: reloads the file, updates cache
     * 
     * @returns {Set} Set of processed nfts
     */
    get() {
        if (this.isCacheValid()) {
            return this.cache;
        }
        
        // Cache invalid, reload
        this.missCount++;
        console.log(`[${getFormattedDateTime()}] 🔄 Reloading (${this.missCount}th time)`);
        
        this.cache = this.loadFromFile();
        this.cacheTimestamp = Date.now();
        
        console.log(`[${getFormattedDateTime()}] ✅ Cache updated (${this.cache.size} entries)`);
        return this.cache;
    }
    
    /**
     * Add a new record to cache and file
     * 
     * Key: simultaneously updates memory cache and hard disk file
     * Ensures cache and file are consistent, avoiding the need to reload next time
     * 
     * @param {number} seq - Sequence number
     * @param {string} nft - NFT data
     * @param {string} dao - dao returned by PS system
     * @param {number} tick - tick returned by PS system
     * @param {string} time - Processing time
     * @returns {boolean} Whether successful
     */
    addRecord(seq, nft, dao, tick, time) {
        try {
            // 1. Check if already exists (prevent duplicates)
            if (this.cache && this.cache.has(nft)) {
                console.log(`[${getFormattedDateTime()}] ⏭️ nft already exists, skipping`);
                return true;
            }
            
            // 2. Build record object
            const logEntry = {
                seq: seq,          // Sequence number (for sorting and traceability)
                nft: nft,          // NFT data (deduplication key)
                dao: dao,          // dao returned by PS system (Gangdadao uses 2.3)
                tick: tick,        // tick returned by PS system
                // time: time         // Processing time
            };
            
            // 3. Append to file (persistence)
            fs.appendFileSync(this.filePath, JSON.stringify(logEntry) + '\n');
            console.log(`[${getFormattedDateTime()}] 💾 Written to file: seq=${seq}`);
            
            // 4. Update memory cache (maintain consistency)
            if (this.cache) {
                this.cache.add(nft);
                console.log(`[${getFormattedDateTime()}] 💾 Cache updated: ${this.cache.size} entries`);
            }
            
            // 5. Update file status (avoid reloading next time)
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            return true;
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to add record:`, error);
            return false;
        }
    }
    
    /**
     * Check if a single nft has been processed
     * @param {string} nft - NFT data
     * @returns {boolean} Whether already processed
     */
    has(nft) {
        if (!nft) return false;
        const data = this.get();
        return data.has(nft);
    }
    
    /**
     * Get cache statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const now = Date.now();
        return {
            hasCache: this.cache !== null,
            size: this.cache ? this.cache.size : 0,
            age: this.cache ? Math.round((now - this.cacheTimestamp) / 1000) + 's' : 'None',
            ttl: this.ttl / 1000 + 's',
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: this.hitCount + this.missCount > 0 
                ? Math.round(this.hitCount / (this.hitCount + this.missCount) * 100) + '%' 
                : 'N/A',
            fileSize: this.lastSize + ' bytes',
            fileMtime: this.lastMtime ? new Date(this.lastMtime).toLocaleString() : 'Unknown'
        };
    }
}

// ==================== Initialize Cache Manager ====================

// Create cache manager instance
// Parameter 1: file path (ps_gangda.jsonl)
// Parameter 2: cache TTL (30 seconds)
const cacheManager = new FileCacheManager(PS_BXD_FILE, CACHE_TTL);

// ==================== Read Pending Records ====================

/**
 * Read unprocessed records from hku_dao_queue.json
 * 
 * Processing flow:
 * 1. Read all records from hku_dao_queue.json
 * 2. Get the set of processed nfts (from cache)
 * 3. Filter: only keep records whose nft is not in the processed set
 * 4. Sort by seq
 * 
 * @returns {Array} Array of unprocessed records
 */
function getUnprocessedRecords() {
    try {
        // 1. Check if file exists
        if (!fs.existsSync(BXD_PS_FILE)) {
            console.log(`[${getFormattedDateTime()}] ⚠️ hku_dao_queue.json does not exist`);
            return [];
        }
        
        // 2. Read all pending records
        const content = fs.readFileSync(BXD_PS_FILE, 'utf-8');
        const records = JSON.parse(content);
        
        // 3. Validate data format
        if (!Array.isArray(records)) {
            console.error(`[${getFormattedDateTime()}] ❌ hku_dao_queue.json format error: not an array`);
            return [];
        }
        
        console.log(`[${getFormattedDateTime()}] 📋 hku_dao_queue.json has ${records.length} records`);
        
        // 4. Get processed nfts set (from cache)
        const processedNfts = cacheManager.get();
        console.log(`[${getFormattedDateTime()}] 📦 Processed: ${processedNfts.size} entries`);
        
        // 5. Filter unprocessed records
        const unprocessed = [];
        let noNftCount = 0;
        
        for (const record of records) {
            const nft = getNftData(record);
            
            // Check if there is nft data
            if (!nft) {
                noNftCount++;
                console.warn(`[${getFormattedDateTime()}] ⚠️ Record seq=${record.seq} has no nft data`);
                continue;
            }
            
            // Check if already processed (core deduplication)
            if (!processedNfts.has(nft)) {
                unprocessed.push(record);
            }
        }
        
        // 6. Sort by seq (ensure processing order)
        unprocessed.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        // 7. Output statistics
        if (unprocessed.length > 0) {
            console.log(`[${getFormattedDateTime()}] 📋 Found ${unprocessed.length} unprocessed records`);
            console.log(`   seq: ${unprocessed.map(r => r.seq).join(', ')}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ✅ No unprocessed records`);
        }
        
        if (noNftCount > 0) {
            console.log(`   ⚠️ ${noNftCount} records have no nft data (skipped)`);
        }
        
        return unprocessed;
        
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to read hku_dao_queue.json:`, error);
        return [];
    }
}

// ==================== Ledger Management ====================

/**
 * Load the ledger file
 * Ledger records: ts_thread (thread number) and ts_chain (chain value)
 * Used to ensure chain-based verification of the PS system
 * ★ Gangdadao uses ts_3_ledger.json
 */
function loadTsLedger() {
    try {
        if (fs.existsSync(TS_LEDGER_FILE)) {
            const ledgerData = JSON.parse(fs.readFileSync(TS_LEDGER_FILE, 'utf-8'));
            PS_CONFIG.ts_thread = ledgerData.ts_thread || 0;
            PS_CONFIG.ts_chain = ledgerData.ts_next_chain || '3234567890abcdef';
            console.log(`[${getFormattedDateTime()}] 📖 Loaded ledger:`);
            console.log(`   ts_thread: ${PS_CONFIG.ts_thread}`);
            console.log(`   ts_chain: ${PS_CONFIG.ts_chain}`);
            console.log(`   Stats: in_total=${ledgerData.in_total || 0}, q_total=${ledgerData.q_total || 0}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ⚠️ Ledger does not exist, using default values`);
            PS_CONFIG.ts_chain = '3234567890abcdef';
            PS_CONFIG.ts_thread = 0;
            saveTsLedger();
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to read ledger:`, error);
        PS_CONFIG.ts_chain = '3234567890abcdef';
        PS_CONFIG.ts_thread = 0;
    }
}

/**
 * Save the ledger file
 * Update after each record is processed to ensure persistence
 * ★ Preserves all statistical fields (in_total, q_total, in_err, q_err)
 */
function saveTsLedger() {
    // Read existing data to preserve statistical fields
    let existingData = {};
    try {
        if (fs.existsSync(TS_LEDGER_FILE)) {
            existingData = JSON.parse(fs.readFileSync(TS_LEDGER_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ⚠️ Failed to read existing ledger:`, error);
    }
    
    const ledgerData = {
        ts_id: PS_CONFIG.ts_id,
        ts_thread: PS_CONFIG.ts_thread,
        ts_next_chain: PS_CONFIG.ts_chain,
        in_total: existingData.in_total || 0,
        q_total: existingData.q_total || 0,
        in_err: existingData.in_err || 0,
        q_err: existingData.q_err || 0,
        last_update: getFormattedDateTime()
    };
    
    try {
        fs.writeFileSync(TS_LEDGER_FILE, JSON.stringify(ledgerData, null, 2));
        console.log(`[${getFormattedDateTime()}] 💾 Saved ledger:`);
        console.log(`   ts_thread: ${PS_CONFIG.ts_thread}`);
        console.log(`   ts_chain: ${PS_CONFIG.ts_chain}`);
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to save ledger:`, error);
    }
}

// ==================== PS System Communication ====================

/**
 * Send a record to the PS system
 * 
 * Communication protocol:
 * 1. Build ts_request (includes ts_id=3, ts_thread, ts_chain, ts_next_chain, nft, service)
 * 2. ★ Use the same chain value calculation method as server.js
 * 3. Send via WebSocket
 * 4. Wait for PS system response
 * 5. Parse response (includes tick, dao, ledger)
 * 
 * @param {Object} record - Record to process
 * @returns {Promise<Object>} PS system response
 */
async function sendToPS(record) {
    return new Promise((resolve, reject) => {
        // 1. Check connection status
        if (!PS_CONFIG.connected || !PS_CONFIG.ws) {
            reject(new Error('PS system not connected'));
            return;
        }
        
        // 2. Extract NFT data
        const nftData = getNftData(record);
        if (!nftData) {
            reject(new Error(`Record seq=${record.seq} has no nft data`));
            return;
        }
        
        // 3. Increment thread number
        PS_CONFIG.ts_thread++;
        const currentChain = PS_CONFIG.ts_chain;
        
        // ★ Use the same chain value calculation method as server.js
        const time = getFormattedTime();
        const price = 0;  // Default price, will be overridden in actual use
        const seller = 'SYSTEM';
        const buyer = 'SYSTEM';
        const tsNextChain = calculateNextChain(PS_CONFIG.ts_thread, time, price, seller, buyer, currentChain);
        
        // 4. Build request (using ts_id=3)
        const tsRequest = {
            ts_id: PS_CONFIG.ts_id,          // ★ TS node ID (Gangdadao specific)
            ts_thread: PS_CONFIG.ts_thread,   // Thread number (incremented)
            ts_chain: currentChain,           // Current chain value
            ts_next_chain: tsNextChain,       // Next chain value (consistent with server.js)
            nft: nftData,                     // NFT data
            service: "input"                  // Service type: input
        };
        
        // 5. Log request information
        console.log(`[${getFormattedDateTime()}] 📤 Sending to PS system:`);
        console.log(`   seq: ${record.seq}`);
        console.log(`   nft: ${nftData.substring(0, 32)}...`);
        console.log(`   ts_id: ${PS_CONFIG.ts_id}`);
        console.log(`   ts_thread: ${tsRequest.ts_thread}`);
        console.log(`   ts_chain: ${tsRequest.ts_chain}`);
        console.log(`   ts_next_chain: ${tsRequest.ts_next_chain}`);
        
        // 6. Set timeout (30 seconds)
        const timeout = setTimeout(() => {
            reject(new Error('PS system response timeout (30s)'));
        }, 30000);
        
        // 7. Message handler
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                // ★ Check if it matches the current request (ts_id and ts_thread)
                if (response.ts_id === PS_CONFIG.ts_id && 
                    response.ts_thread === PS_CONFIG.ts_thread) {
                    clearTimeout(timeout);
                    PS_CONFIG.ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (e) {
                // Ignore parse errors
            }
        };
        
        // 8. Register one-time message listener
        PS_CONFIG.ws.once('message', messageHandler);
        
        // 9. Send request
        PS_CONFIG.ws.send(JSON.stringify(tsRequest));
    });
}

// ==================== Process Records ====================

/**
 * Process a single record
 * 
 * Flow:
 * 1. Check if already processed (prevent concurrent duplicates)
 * 2. Send to PS system
 * 3. Receive response
 * 4. Update ledger
 * 5. Save to ps_gangda.jsonl
 * 6. Update memory cache
 * 
 * ★ Does not modify hku_dao_queue.json file
 * 
 * @param {Object} record - Record to process
 * @returns {Promise<boolean>} Whether processing succeeded
 */
async function processRecord(record) {
    // 1. Extract NFT data
    const nftData = getNftData(record);
    if (!nftData) {
        console.error(`[${getFormattedDateTime()}] ❌ Record seq=${record.seq} has no nft data`);
        return false;
    }
    
    // 2. Check if already processed (prevent concurrency)
    if (cacheManager.has(nftData)) {
        console.log(`[${getFormattedDateTime()}] ⏭️ nft already processed, skipping`);
        return true;
    }
    
    console.log(`[${getFormattedDateTime()}] 🔄 Starting to process seq=${record.seq}`);
    
    try {
        // 3. Send to PS system
        const response = await sendToPS(record);
        
        // 4. Log response
        console.log(`[${getFormattedDateTime()}] 📥 Received PS system response:`);
        console.log(`   ts_thread: ${response.ts_thread}`);
        console.log(`   tick: ${response.tick}`);
        console.log(`   dao: ${response.result?.dao}`);
        
        // 5. Update ledger (chain value)
        if (response.ledger && response.ledger.ts_next_chain) {
            PS_CONFIG.ts_chain = response.ledger.ts_next_chain;
            saveTsLedger();
            console.log(`[${getFormattedDateTime()}] 🔗 Updated chain value: ${PS_CONFIG.ts_chain}`);
        }
        
        // 6. Check processing result
        if (response.result && response.result.dao !== "error") {
            const tick = response.tick;
            const dao = response.result.dao;
            const time = getFormattedDateTime();
            
            // Validate required fields
            if (tick === undefined) {
                console.error(`[${getFormattedDateTime()}] ❌ Response missing tick`);
                return false;
            }
            if (dao === undefined) {
                console.error(`[${getFormattedDateTime()}] ❌ Response missing dao`);
                return false;
            }
            
            // 7. ★ Save to ps_gangda.jsonl and cache (does not modify hku_dao_queue.json)
            const saved = cacheManager.addRecord(record.seq, nftData, dao, tick, time);
            
            if (saved) {
                console.log(`[${getFormattedDateTime()}] ✅ Record seq=${record.seq} processed successfully`);
                console.log(`   tick: ${tick}`);
                console.log(`   dao: ${dao}`);
                return true;
            } else {
                console.error(`[${getFormattedDateTime()}] ❌ Failed to save record`);
                return false;
            }
        } else {
            console.error(`[${getFormattedDateTime()}] ❌ PS system returned error: ${response.result?.dao || 'unknown'}`);
            return false;
        }
        
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ Failed to process record seq=${record.seq}:`, error.message);
        return false;
    }
}

// ==================== Batch Processing ====================

/**
 * Process all unprocessed records
 * 
 * Flow:
 * 1. Get all unprocessed records
 * 2. Process one by one (serial, ensuring order)
 * 3. Aggregate results
 * 
 * Note: Serial processing ensures chain order of the PS system
 */
async function processAllRecords() {
    // Prevent concurrent processing
    if (PS_CONFIG.isProcessing) {
        console.log(`[${getFormattedDateTime()}] ⏳ Already processing, skipping`);
        return;
    }
    
    // Get unprocessed records
    const unprocessedRecords = getUnprocessedRecords();
    if (unprocessedRecords.length === 0) {
        return;
    }
    
    // Set processing status
    PS_CONFIG.isProcessing = true;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${getFormattedDateTime()}] 🚀 Starting batch processing of ${unprocessedRecords.length} records`);
    console.log(`${'='.repeat(60)}`);
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    // Process one by one
    for (let i = 0; i < unprocessedRecords.length; i++) {
        const record = unprocessedRecords[i];
        const nftData = getNftData(record);
        
        // Double-check if already processed (prevent concurrency)
        if (nftData && cacheManager.has(nftData)) {
            console.log(`[${getFormattedDateTime()}] ⏭️ Already processed, skipping: seq=${record.seq}`);
            skippedCount++;
            continue;
        }
        
        // Process record
        console.log(`\n[${getFormattedDateTime()}] 📝 Processing [${i+1}/${unprocessedRecords.length}] seq=${record.seq}`);
        const success = await processRecord(record);
        
        if (success) {
            successCount++;
        } else {
            failCount++;
            console.log(`[${getFormattedDateTime()}] ⚠️ Record seq=${record.seq} processing failed, continuing to next`);
        }
        
        // Wait 500ms between each record to avoid pressure on the PS system
        if (i < unprocessedRecords.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // Output statistics
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${getFormattedDateTime()}] 📊 Batch processing complete:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${unprocessedRecords.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Reset processing status
    PS_CONFIG.isProcessing = false;
}

// ==================== WebSocket Connection ====================

/**
 * Initialize PS system WebSocket connection
 * 
 * Connection states:
 * - open: Connection successful, set connected = true
 * - error: Connection failed, set connected = false
 * - close: Connection closed, auto-reconnect
 * 
 * @returns {Promise<boolean>} Whether connection succeeded
 */
async function initPSConnection() {
    return new Promise((resolve) => {
        try {
            console.log(`[${getFormattedDateTime()}] 🔌 Connecting to PS system: ${PS_CONFIG.url}`);
            
            PS_CONFIG.ws = new WebSocket(PS_CONFIG.url);
            
            // Connection successful
            PS_CONFIG.ws.on('open', () => {
                console.log(`[${getFormattedDateTime()}] ✅ Connected to PS system`);
                PS_CONFIG.connected = true;
                resolve(true);
            });
            
            // Connection error
            PS_CONFIG.ws.on('error', (err) => {
                console.error(`[${getFormattedDateTime()}] ❌ Connection error:`, err.message);
                PS_CONFIG.connected = false;
                resolve(false);
            });
            
            // Connection closed (auto-reconnect)
            PS_CONFIG.ws.on('close', () => {
                console.log(`[${getFormattedDateTime()}] ⚠️ Connection closed`);
                PS_CONFIG.connected = false;
                
                // Reconnect after delay
                setTimeout(() => {
                    console.log(`[${getFormattedDateTime()}] 🔄 Attempting to reconnect...`);
                    initPSConnection();
                }, PS_CONFIG.reconnectInterval);
            });
            
            // Connection timeout (5 seconds)
            setTimeout(() => {
                if (!PS_CONFIG.connected) {
                    console.log(`[${getFormattedDateTime()}] ⏰ Connection timeout`);
                    resolve(false);
                }
            }, 5000);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ Failed to initialize connection:`, error);
            resolve(false);
        }
    });
}

// ==================== Main Loop ====================

/**
 * Main loop
 * 
 * Executes every 3 seconds:
 * 1. Check if PS system is connected
 * 2. If connected, process all unprocessed records
 * 3. If not connected, output waiting status
 * 
 * Purpose: Continuously monitor and process new records
 */
async function mainLoop() {
    console.log(`[${getFormattedDateTime()}] 🔄 Main loop started, check interval: 3s`);
    console.log(`   Cache TTL: ${CACHE_TTL/1000}s`);
    console.log(`   File: ${PS_BXD_FILE}`);
    console.log(`   TS node ID: ${PS_CONFIG.ts_id}`);
    console.log('');
    
    let loopCount = 0;
    
    while (true) {
        loopCount++;
        
        if (PS_CONFIG.connected) {
            // Connection normal, process records
            await processAllRecords();
        } else {
            // Not connected, output waiting status
            if (loopCount % 20 === 0) {  // Every 60 seconds
                console.log(`[${getFormattedDateTime()}] ⏳ Waiting for PS system connection...`);
            }
            process.stdout.write('.');
        }
        
        // Wait 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

// ==================== Program Startup ====================

/**
 * Program entry point
 * 
 * Startup flow:
 * 1. Print program information
 * 2. Load ledger
 * 3. Connect to PS system
 * 4. Start main loop
 */
async function start() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🚀 gangdadao_ps.js - PS System Sync Program v4.0          ║');
    console.log('║  📌 Adapted for Gangdadao server.js (ts_id=3)              ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  📁 Pending file:   hku_dao_queue.json (read-only)         ║');
    console.log('║  📁 Processed file: ps_gangda.jsonl (write)                ║');
    console.log('║  📁 Ledger file:    ts_3_ledger.json                       ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  🔑 Deduplication:  NFT field (hash/verification_code)     ║`);
    console.log(`║  💾 Cache policy:   30s TTL + file change detection        ║`);
    console.log(`║  🔌 PS system:     ${PS_CONFIG.url.padEnd(30)}                ║`);
    console.log(`║  📌 TS node ID:    ${PS_CONFIG.ts_id}                         ║`);
    console.log(`║  ⏱️  Check interval: 3s                                      ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // 1. Load ledger
    loadTsLedger();
    
    // 2. Connect to PS system
    const connected = await initPSConnection();
    if (!connected) {
        console.log(`[${getFormattedDateTime()}] ⚠️ Initial connection failed, will continue retrying in background`);
    }
    
    // 3. Start main loop
    await mainLoop();
}

// ==================== Graceful Shutdown ====================

/**
 * Program exit handler
 * 
 * Before exiting:
 * 1. Close WebSocket connection
 * 2. Save ledger
 * 3. Print exit message
 */
function gracefulShutdown(signal) {
    console.log(`\n\n[${getFormattedDateTime()}] 🛑 Received ${signal} signal, cleaning up...`);
    
    // Close WebSocket
    if (PS_CONFIG.ws) {
        console.log(`[${getFormattedDateTime()}] 🔌 Closing WebSocket connection...`);
        PS_CONFIG.ws.close();
    }
    
    // Save ledger
    console.log(`[${getFormattedDateTime()}] 💾 Saving ledger...`);
    saveTsLedger();
    
    console.log(`[${getFormattedDateTime()}] ✅ Cleanup complete, program exiting`);
    process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    console.error(`[${getFormattedDateTime()}] ❌ Uncaught exception:`, error);
    // Log error but don't exit, continue running
});

// ==================== Start Program ====================

// Start
start().catch(error => {
    console.error(`[${getFormattedDateTime()}] ❌ Program startup failed:`, error);
    process.exit(1);
});
