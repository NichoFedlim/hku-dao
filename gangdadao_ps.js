// ====================================================================
// gangdadao_ps.js - PS系统同步程序 v4.0（适配港大道 server.js）
// ====================================================================
// 
// 【程序功能】
// 1. 从 hku_dao_queue.json 读取待处理的 NFT 记录
// 2. 逐条发送到 PS 系统（WebSocket 连接，使用 ts_id=3）
// 3. 接收 PS 系统返回的 tick 和 dao
// 4. 将处理结果保存到 ps_gangda.jsonl（不修改原文件）
// 5. 使用缓存机制，避免重复读取文件
// 6. 自动检测文件变化，智能刷新缓存
//
// 【与 bxd_ps.js 的区别】
// - ts_id: 3（港大道专用）
// - 账本文件: ts_3_ledger.json
// - 默认链值: 3234567890abcdef
// - 链值计算方式: 与 server.js 保持一致
//
// 【文件说明】
// - hku_dao_queue.json    : 待处理记录（由 server.js 写入，本程序只读）
// - ps_gangda.jsonl   : 已处理记录（本程序写入，用于去重和追溯）
// - ts_3_ledger.json: 账本文件（记录链状态）
//
// 【去重机制】
// 使用 Set 缓存所有已处理的 nft（hash 或 verification_code）
// 每次从 hku_dao_queue.json 读取时，过滤掉已存在的 nft
//
// 【缓存策略】
// - 缓存有效期：30秒（CACHE_TTL）
// - 检测文件变化：大小、修改时间、inode
// - 新增记录时：同时更新内存缓存和文件
// ====================================================================

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ==================== 配置 ====================

// 文件路径配置
const BXD_PS_FILE = path.join(__dirname, 'hku_dao_queue.json');    // 待处理记录（只读）
const PS_BXD_FILE = path.join(__dirname, 'ps_gangda.jsonl');   // 已处理记录（写入）
const TS_LEDGER_FILE = path.join(__dirname, 'ts_3_ledger.json'); // 账本（港大道专用）

// 缓存配置
const CACHE_TTL = 30000;  // 缓存有效期：30秒（30000毫秒）

// PS系统连接配置
const PS_CONFIG = {

    url: 'ws://192.168.1.26:4000',  // PS系统 WebSocket 地址
    connected: false,            // 连接状态
    ws: null,                    // WebSocket 实例
    ts_id: 3,                    // ★ TS节点ID（港大道专用）
    ts_thread: 0,                // 线程序号（从账本恢复）
    ts_chain: '',                // 当前链值（从账本恢复）
    reconnectInterval: 5000,     // 重连间隔：5秒
    isProcessing: false          // 是否正在处理（防止并发）
};

// ==================== 工具函数 ====================

/**
 * 获取格式化的日期时间
 * 格式：YYYY/MM/DD HH:MM:SS
 * 用途：日志记录、时间戳
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
 * 获取格式化的时间（不含日期）
 * 格式：HH:MM:SS
 * 用途：与 server.js 保持一致
 */
function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化钱包地址（短显示）
 * 用途：生成验证码时与 server.js 保持一致
 */
function formatWalletShort(wallet) {
    if (!wallet) return '未知';
    if (wallet.length <= 8) return wallet;
    return wallet.slice(0, 4) + '***' + wallet.slice(-4);
}

/**
 * 格式化链值（短显示）
 * 用途：生成验证码时与 server.js 保持一致
 */
function formatChainShort(chain) {
    const displayLength = 4;
    return chain ? chain.slice(0, displayLength) + '...' : '未知';
}

/**
 * 生成完整的64位验证码（与 server.js 保持一致）
 * 
 * 验证码生成规则：
 * 1. 拼接数据：thread + time + price + seller + buyer + chain
 * 2. 计算 SHA256 哈希
 * 3. 转换为大写
 * 
 * 用途：作为 NFT 交易的唯一标识
 * 
 * @param {number} thread - 线程号
 * @param {string} time - 时间
 * @param {number} price - 价格
 * @param {string} seller - 卖家
 * @param {string} buyer - 买家
 * @param {string} chain - 当前链
 * @returns {string} 64位大写验证码
 */
function generateVerificationCode(thread, time, price, seller, buyer, chain) {
    // 使用标准格式生成验证码（与 server.js 完全一致）
    const displayData =
        `${thread}\t` +
        `${time}\t` +
        `￥${price}\t` +
        `${formatWalletShort(seller)}\t` +
        `${formatWalletShort(buyer)}\t` +
        `${formatChainShort(chain)}`;
    
    // 计算完整的SHA256哈希并转换为大写
    const fullHash = crypto.createHash('sha256').update(displayData).digest('hex');
    return fullHash.toUpperCase();
}

/**
 * 计算下一个链值（verification_code的前16位）
 * ★ 与 server.js 的 calculateNextChain 逻辑一致
 * 
 * @param {number} thread - 线程号
 * @param {string} time - 时间
 * @param {number} price - 价格
 * @param {string} seller - 卖家
 * @param {string} buyer - 买家
 * @param {string} chain - 当前链
 * @returns {string} 16位大写链值
 */
function calculateNextChain(thread, time, price, seller, buyer, chain) {
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    return verification_code.substring(0, 16).toUpperCase();
}

/**
 * 从记录中提取 NFT 数据
 * 优先使用 verification_code，其次使用 hash
 * 原因：verification_code 是交易验证码，hash 是 NFT 哈希
 */
function getNftData(record) {
    if (record.verification_code) {
        return record.verification_code;
    } else if (record.hash) {
        return record.hash;
    }
    return null;  // 两者都没有，返回 null
}

// ==================== 缓存管理器 ====================

/**
 * 文件缓存管理器
 * 
 * 目的：避免频繁读取硬盘文件，提升性能
 * 原理：将文件数据加载到内存（Set），在有效期内直接使用
 * 
 * 缓存失效条件：
 * 1. 超过有效期（30秒）
 * 2. 文件大小变化
 * 3. 文件修改时间变化
 * 4. 文件 inode 变化（Linux）
 */
class FileCacheManager {
    /**
     * 构造函数
     * @param {string} filePath - 要缓存的文件路径
     * @param {number} ttl - 缓存有效期（毫秒）
     */
    constructor(filePath, ttl = 30000) {
        this.filePath = filePath;           // 文件路径
        this.ttl = ttl;                     // 缓存有效期
        
        this.cache = null;                  // 缓存数据（Set 对象）
        this.cacheTimestamp = 0;            // 缓存创建时间
        
        // 文件状态追踪（用于检测变化）
        this.lastSize = 0;                  // 上次文件大小（字节）
        this.lastMtime = 0;                 // 上次修改时间（毫秒）
        this.lastIno = 0;                   // 上次 inode 编号（Linux）
        
        // 统计信息
        this.hitCount = 0;                  // 缓存命中次数
        this.missCount = 0;                 // 缓存未命中次数
        
        // 初始化文件状态
        this.initFileState();
    }
    
    /**
     * 初始化文件状态
     * 首次启动时记录文件当前状态
     */
    initFileState() {
        try {
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                // inode 在某些系统上可能不存在，兼容处理
                if (stats.ino) {
                    this.lastIno = stats.ino;
                }
                console.log(`[${getFormattedDateTime()}] 📂 初始化文件状态:`);
                console.log(`   大小: ${this.lastSize} 字节`);
                console.log(`   修改时间: ${new Date(this.lastMtime).toLocaleString()}`);
                console.log(`   inode: ${this.lastIno || 'N/A'}`);
            } else {
                console.log(`[${getFormattedDateTime()}] ⚠️ 文件不存在: ${this.filePath}`);
            }
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 初始化文件状态失败:`, error);
        }
    }
    
    /**
     * 检测文件是否发生变化
     * 
     * 检测方式（三重检测）：
     * 1. 文件大小变化 → 说明有新增或删除
     * 2. 修改时间变化 → 说明内容被修改
     * 3. inode 变化 → 说明文件被重建（如日志轮转）
     * 
     * @returns {boolean} true=文件已变化，false=文件未变化
     */
    hasFileChanged() {
        try {
            // 如果文件不存在，视为已变化（需要重新加载，但会返回空数据）
            if (!fs.existsSync(this.filePath)) {
                console.log(`[${getFormattedDateTime()}] ⚠️ 文件不存在: ${this.filePath}`);
                return true;
            }
            
            // 获取当前文件状态
            const stats = fs.statSync(this.filePath);
            
            // 检查是否变化（任一条件满足即为变化）
            const sizeChanged = stats.size !== this.lastSize;
            const mtimeChanged = stats.mtimeMs !== this.lastMtime;
            const inoChanged = stats.ino && stats.ino !== this.lastIno;
            
            const changed = sizeChanged || mtimeChanged || inoChanged;
            
            if (changed) {
                // 记录变化详情
                console.log(`[${getFormattedDateTime()}] 📝 检测到文件变化:`);
                if (sizeChanged) {
                    console.log(`   📏 大小: ${this.lastSize} → ${stats.size} 字节`);
                }
                if (mtimeChanged) {
                    console.log(`   🕐 修改时间: ${new Date(this.lastMtime).toLocaleString()} → ${new Date(stats.mtimeMs).toLocaleString()}`);
                }
                if (inoChanged) {
                    console.log(`   📁 inode: ${this.lastIno} → ${stats.ino}`);
                }
                
                // 更新状态
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            return changed;
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 检测文件变化失败:`, error);
            return true;  // 出错时视为已变化，重新加载
        }
    }
    
    /**
     * 检查缓存是否有效
     * 
     * 缓存有效条件：
     * 1. 缓存存在（不为 null）
     * 2. 未超过有效期（TTL）
     * 3. 文件未发生变化
     * 
     * @returns {boolean} true=缓存有效，false=缓存无效需要重新加载
     */
    isCacheValid() {
        // 条件1：缓存是否存在
        if (!this.cache) {
            console.log(`[${getFormattedDateTime()}] 📦 缓存为空，需要加载`);
            return false;
        }
        
        // 条件2：是否超过有效期
        const now = Date.now();
        const age = now - this.cacheTimestamp;
        if (age >= this.ttl) {
            console.log(`[${getFormattedDateTime()}] 📦 缓存过期 (${Math.round(age/1000)}秒 > ${this.ttl/1000}秒)`);
            return false;
        }
        
        // 条件3：文件是否发生变化
        if (this.hasFileChanged()) {
            console.log(`[${getFormattedDateTime()}] 📦 文件变化，缓存失效`);
            return false;
        }
        
        // 缓存有效
        this.hitCount++;
        console.log(`[${getFormattedDateTime()}] 📦 缓存命中 (${this.cache.size} 条，${Math.round(age/1000)}秒前加载，命中${this.hitCount}次)`);
        return true;
    }
    
    /**
     * 从文件加载数据到 Set
     * 
     * 文件格式：ps_gangda.jsonl（每行一个 JSON 对象）
     * 每行格式：{"seq":1,"nft":"HASH","dao":"2.3","tick":12345,"time":"2026/08/10 10:30:15"}
     * 
     * @returns {Set} 包含所有 nft 的 Set 集合
     */
    loadFromFile() {
        const processed = new Set();
        let lineCount = 0;
        let errorCount = 0;
        
        try {
            // 如果文件不存在，返回空 Set
            if (!fs.existsSync(this.filePath)) {
                console.log(`[${getFormattedDateTime()}] ⚠️ 文件不存在，返回空集`);
                return processed;
            }
            
            // 读取文件内容
            console.log(`[${getFormattedDateTime()}] 📖 读取文件: ${this.filePath}`);
            const content = fs.readFileSync(this.filePath, 'utf-8');
            
            // 按行分割，过滤空行
            const lines = content.trim().split('\n').filter(l => l.length > 0);
            console.log(`[${getFormattedDateTime()}] 📄 共 ${lines.length} 行`);
            
            // 逐行解析
            for (const line of lines) {
                try {
                    const record = JSON.parse(line);
                    if (record.nft) {
                        processed.add(record.nft);
                        lineCount++;
                    }
                } catch (e) {
                    errorCount++;
                    // 记录错误但不中断处理
                    if (errorCount <= 5) {
                        console.warn(`[${getFormattedDateTime()}] ⚠️ 解析行失败: ${line.substring(0, 50)}...`);
                    }
                }
            }
            
            // 更新文件状态（加载完成后，文件状态与当前一致）
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            console.log(`[${getFormattedDateTime()}] ✅ 加载完成: ${lineCount} 条有效记录${errorCount > 0 ? `, ${errorCount} 条解析错误` : ''}`);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 加载文件失败:`, error);
        }
        
        return processed;
    }
    
    /**
     * 获取缓存数据
     * 
     * 核心方法：自动检测缓存是否有效
     * - 有效：直接返回缓存的 Set
     * - 无效：重新加载文件，更新缓存
     * 
     * @returns {Set} 已处理的 nft 集合
     */
    get() {
        if (this.isCacheValid()) {
            return this.cache;
        }
        
        // 缓存无效，重新加载
        this.missCount++;
        console.log(`[${getFormattedDateTime()}] 🔄 重新加载 (第${this.missCount}次)`);
        
        this.cache = this.loadFromFile();
        this.cacheTimestamp = Date.now();
        
        console.log(`[${getFormattedDateTime()}] ✅ 缓存已更新 (${this.cache.size} 条)`);
        return this.cache;
    }
    
    /**
     * 添加新记录到缓存和文件
     * 
     * 关键：同时更新内存缓存和硬盘文件
     * 确保缓存和文件一致，避免下次重新加载
     * 
     * @param {number} seq - 序号
     * @param {string} nft - NFT数据
     * @param {string} dao - PS系统返回的dao
     * @param {number} tick - PS系统返回的tick
     * @param {string} time - 处理时间
     * @returns {boolean} 是否成功
     */
    addRecord(seq, nft, dao, tick, time) {
        try {
            // 1. 检查是否已存在（防止重复）
            if (this.cache && this.cache.has(nft)) {
                console.log(`[${getFormattedDateTime()}] ⏭️ nft 已存在，跳过`);
                return true;
            }
            
            // 2. 构建记录对象
            const logEntry = {
                seq: seq,          // 序号（用于排序和追溯）
                nft: nft,          // NFT数据（去重依据）
                dao: dao,          // PS系统返回的dao（港大道用 2.3）
                tick: tick,        // PS系统返回的tick
                // time: time         // 处理时间
            };
            
            // 3. 追加到文件（持久化）
            fs.appendFileSync(this.filePath, JSON.stringify(logEntry) + '\n');
            console.log(`[${getFormattedDateTime()}] 💾 已写入文件: seq=${seq}`);
            
            // 4. 更新内存缓存（保持一致性）
            if (this.cache) {
                this.cache.add(nft);
                console.log(`[${getFormattedDateTime()}] 💾 已更新缓存: ${this.cache.size} 条`);
            }
            
            // 5. 更新文件状态（避免下次重新加载）
            if (fs.existsSync(this.filePath)) {
                const stats = fs.statSync(this.filePath);
                this.lastSize = stats.size;
                this.lastMtime = stats.mtimeMs;
                if (stats.ino) this.lastIno = stats.ino;
            }
            
            return true;
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 添加记录失败:`, error);
            return false;
        }
    }
    
    /**
     * 检查单个 nft 是否已处理
     * @param {string} nft - NFT数据
     * @returns {boolean} 是否已处理
     */
    has(nft) {
        if (!nft) return false;
        const data = this.get();
        return data.has(nft);
    }
    
    /**
     * 获取缓存统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const now = Date.now();
        return {
            hasCache: this.cache !== null,
            size: this.cache ? this.cache.size : 0,
            age: this.cache ? Math.round((now - this.cacheTimestamp) / 1000) + '秒' : '无',
            ttl: this.ttl / 1000 + '秒',
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: this.hitCount + this.missCount > 0 
                ? Math.round(this.hitCount / (this.hitCount + this.missCount) * 100) + '%' 
                : 'N/A',
            fileSize: this.lastSize + ' 字节',
            fileMtime: this.lastMtime ? new Date(this.lastMtime).toLocaleString() : '未知'
        };
    }
}

// ==================== 初始化缓存管理器 ====================

// 创建缓存管理器实例
// 参数1：文件路径（ps_gangda.jsonl）
// 参数2：缓存有效期（30秒）
const cacheManager = new FileCacheManager(PS_BXD_FILE, CACHE_TTL);

// ==================== 读取待处理记录 ====================

/**
 * 从 hku_dao_queue.json 读取未处理的记录
 * 
 * 处理流程：
 * 1. 读取 hku_dao_queue.json 所有记录
 * 2. 获取已处理的 nft 集合（从缓存）
 * 3. 过滤：只保留 nft 不在已处理集合中的记录
 * 4. 按 seq 排序
 * 
 * @returns {Array} 未处理的记录数组
 */
function getUnprocessedRecords() {
    try {
        // 1. 检查文件是否存在
        if (!fs.existsSync(BXD_PS_FILE)) {
            console.log(`[${getFormattedDateTime()}] ⚠️ hku_dao_queue.json 不存在`);
            return [];
        }
        
        // 2. 读取所有待处理记录
        const content = fs.readFileSync(BXD_PS_FILE, 'utf-8');
        const records = JSON.parse(content);
        
        // 3. 验证数据格式
        if (!Array.isArray(records)) {
            console.error(`[${getFormattedDateTime()}] ❌ hku_dao_queue.json 格式错误：不是数组`);
            return [];
        }
        
        console.log(`[${getFormattedDateTime()}] 📋 hku_dao_queue.json 共 ${records.length} 条记录`);
        
        // 4. 获取已处理的 nft 集合（从缓存）
        const processedNfts = cacheManager.get();
        console.log(`[${getFormattedDateTime()}] 📦 已处理: ${processedNfts.size} 条`);
        
        // 5. 过滤未处理的记录
        const unprocessed = [];
        let noNftCount = 0;
        
        for (const record of records) {
            const nft = getNftData(record);
            
            // 检查是否有 nft 数据
            if (!nft) {
                noNftCount++;
                console.warn(`[${getFormattedDateTime()}] ⚠️ 记录 seq=${record.seq} 没有 nft 数据`);
                continue;
            }
            
            // 检查是否已处理（去重核心）
            if (!processedNfts.has(nft)) {
                unprocessed.push(record);
            }
        }
        
        // 6. 按 seq 排序（确保处理顺序）
        unprocessed.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        // 7. 输出统计信息
        if (unprocessed.length > 0) {
            console.log(`[${getFormattedDateTime()}] 📋 发现 ${unprocessed.length} 条未处理记录`);
            console.log(`   seq: ${unprocessed.map(r => r.seq).join(', ')}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ✅ 没有未处理的记录`);
        }
        
        if (noNftCount > 0) {
            console.log(`   ⚠️ ${noNftCount} 条记录没有 nft 数据（已跳过）`);
        }
        
        return unprocessed;
        
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 读取 hku_dao_queue.json 失败:`, error);
        return [];
    }
}

// ==================== 账本管理 ====================

/**
 * 加载账本文件
 * 账本记录：ts_thread（线程序号）和 ts_chain（链值）
 * 用于保证 PS 系统的链式验证
 * ★ 港大道使用 ts_3_ledger.json
 */
function loadTsLedger() {
    try {
        if (fs.existsSync(TS_LEDGER_FILE)) {
            const ledgerData = JSON.parse(fs.readFileSync(TS_LEDGER_FILE, 'utf-8'));
            PS_CONFIG.ts_thread = ledgerData.ts_thread || 0;
            PS_CONFIG.ts_chain = ledgerData.ts_next_chain || '3234567890abcdef';
            console.log(`[${getFormattedDateTime()}] 📖 加载账本:`);
            console.log(`   ts_thread: ${PS_CONFIG.ts_thread}`);
            console.log(`   ts_chain: ${PS_CONFIG.ts_chain}`);
            console.log(`   统计: in_total=${ledgerData.in_total || 0}, q_total=${ledgerData.q_total || 0}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ⚠️ 账本不存在，使用默认值`);
            PS_CONFIG.ts_chain = '3234567890abcdef';
            PS_CONFIG.ts_thread = 0;
            saveTsLedger();
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 读取账本失败:`, error);
        PS_CONFIG.ts_chain = '3234567890abcdef';
        PS_CONFIG.ts_thread = 0;
    }
}

/**
 * 保存账本文件
 * 每次处理完记录后更新，确保持久化
 * ★ 保留所有统计字段（in_total, q_total, in_err, q_err）
 */
function saveTsLedger() {
    // 读取现有数据以保留统计字段
    let existingData = {};
    try {
        if (fs.existsSync(TS_LEDGER_FILE)) {
            existingData = JSON.parse(fs.readFileSync(TS_LEDGER_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ⚠️ 读取现有账本失败:`, error);
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
        console.log(`[${getFormattedDateTime()}] 💾 保存账本:`);
        console.log(`   ts_thread: ${PS_CONFIG.ts_thread}`);
        console.log(`   ts_chain: ${PS_CONFIG.ts_chain}`);
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 保存账本失败:`, error);
    }
}

// ==================== PS系统通信 ====================

/**
 * 发送记录到 PS 系统
 * 
 * 通信协议：
 * 1. 构建 ts_request（包含 ts_id=3, ts_thread, ts_chain, ts_next_chain, nft, service）
 * 2. ★ 使用与 server.js 一致的链值计算方式
 * 3. 通过 WebSocket 发送
 * 4. 等待 PS 系统响应
 * 5. 解析响应（包含 tick, dao, ledger）
 * 
 * @param {Object} record - 待处理的记录
 * @returns {Promise<Object>} PS系统响应
 */
async function sendToPS(record) {
    return new Promise((resolve, reject) => {
        // 1. 检查连接状态
        if (!PS_CONFIG.connected || !PS_CONFIG.ws) {
            reject(new Error('PS系统未连接'));
            return;
        }
        
        // 2. 提取 NFT 数据
        const nftData = getNftData(record);
        if (!nftData) {
            reject(new Error(`记录 seq=${record.seq} 没有 nft 数据`));
            return;
        }
        
        // 3. 递增线程序号
        PS_CONFIG.ts_thread++;
        const currentChain = PS_CONFIG.ts_chain;
        
        // ★ 使用与 server.js 一致的链值计算方式
        const time = getFormattedTime();
        const price = 0;  // 默认价格，实际使用时会被覆盖
        const seller = 'SYSTEM';
        const buyer = 'SYSTEM';
        const tsNextChain = calculateNextChain(PS_CONFIG.ts_thread, time, price, seller, buyer, currentChain);
        
        // 4. 构建请求（使用 ts_id=3）
        const tsRequest = {
            ts_id: PS_CONFIG.ts_id,          // ★ TS节点ID（港大道专用）
            ts_thread: PS_CONFIG.ts_thread,   // 线程序号（递增）
            ts_chain: currentChain,           // 当前链值
            ts_next_chain: tsNextChain,       // 下一个链值（与 server.js 一致）
            nft: nftData,                     // NFT数据
            service: "input"                  // 服务类型：输入
        };
        
        // 5. 打印请求信息
        console.log(`[${getFormattedDateTime()}] 📤 发送到PS系统:`);
        console.log(`   seq: ${record.seq}`);
        console.log(`   nft: ${nftData.substring(0, 32)}...`);
        console.log(`   ts_id: ${PS_CONFIG.ts_id}`);
        console.log(`   ts_thread: ${tsRequest.ts_thread}`);
        console.log(`   ts_chain: ${tsRequest.ts_chain}`);
        console.log(`   ts_next_chain: ${tsRequest.ts_next_chain}`);
        
        // 6. 设置超时（30秒）
        const timeout = setTimeout(() => {
            reject(new Error('PS系统响应超时 (30秒)'));
        }, 30000);
        
        // 7. 消息处理器
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                // ★ 检查是否匹配当前请求（ts_id 和 ts_thread）
                if (response.ts_id === PS_CONFIG.ts_id && 
                    response.ts_thread === PS_CONFIG.ts_thread) {
                    clearTimeout(timeout);
                    PS_CONFIG.ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (e) {
                // 解析错误忽略
            }
        };
        
        // 8. 注册一次性消息监听
        PS_CONFIG.ws.once('message', messageHandler);
        
        // 9. 发送请求
        PS_CONFIG.ws.send(JSON.stringify(tsRequest));
    });
}

// ==================== 处理记录 ====================

/**
 * 处理单条记录
 * 
 * 流程：
 * 1. 检查是否已处理（防止并发重复）
 * 2. 发送到 PS 系统
 * 3. 接收响应
 * 4. 更新账本
 * 5. 保存到 ps_gangda.jsonl
 * 6. 更新内存缓存
 * 
 * ★ 不再修改 hku_dao_queue.json 文件
 * 
 * @param {Object} record - 待处理的记录
 * @returns {Promise<boolean>} 是否处理成功
 */
async function processRecord(record) {
    // 1. 提取 NFT 数据
    const nftData = getNftData(record);
    if (!nftData) {
        console.error(`[${getFormattedDateTime()}] ❌ 记录 seq=${record.seq} 没有 nft 数据`);
        return false;
    }
    
    // 2. 检查是否已处理（防止并发）
    if (cacheManager.has(nftData)) {
        console.log(`[${getFormattedDateTime()}] ⏭️ nft 已处理，跳过`);
        return true;
    }
    
    console.log(`[${getFormattedDateTime()}] 🔄 开始处理 seq=${record.seq}`);
    
    try {
        // 3. 发送到 PS 系统
        const response = await sendToPS(record);
        
        // 4. 打印响应
        console.log(`[${getFormattedDateTime()}] 📥 收到PS系统响应:`);
        console.log(`   ts_thread: ${response.ts_thread}`);
        console.log(`   tick: ${response.tick}`);
        console.log(`   dao: ${response.result?.dao}`);
        
        // 5. 更新账本（链值）
        if (response.ledger && response.ledger.ts_next_chain) {
            PS_CONFIG.ts_chain = response.ledger.ts_next_chain;
            saveTsLedger();
            console.log(`[${getFormattedDateTime()}] 🔗 更新链值: ${PS_CONFIG.ts_chain}`);
        }
        
        // 6. 检查处理结果
        if (response.result && response.result.dao !== "error") {
            const tick = response.tick;
            const dao = response.result.dao;
            const time = getFormattedDateTime();
            
            // 验证必要字段
            if (tick === undefined) {
                console.error(`[${getFormattedDateTime()}] ❌ 响应缺少 tick`);
                return false;
            }
            if (dao === undefined) {
                console.error(`[${getFormattedDateTime()}] ❌ 响应缺少 dao`);
                return false;
            }
            
            // 7. ★ 保存到 ps_gangda.jsonl 和缓存（不修改 hku_dao_queue.json）
            const saved = cacheManager.addRecord(record.seq, nftData, dao, tick, time);
            
            if (saved) {
                console.log(`[${getFormattedDateTime()}] ✅ 记录 seq=${record.seq} 处理成功`);
                console.log(`   tick: ${tick}`);
                console.log(`   dao: ${dao}`);
                return true;
            } else {
                console.error(`[${getFormattedDateTime()}] ❌ 保存记录失败`);
                return false;
            }
        } else {
            console.error(`[${getFormattedDateTime()}] ❌ PS系统返回错误: ${response.result?.dao || 'unknown'}`);
            return false;
        }
        
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 处理记录 seq=${record.seq} 失败:`, error.message);
        return false;
    }
}

// ==================== 批量处理 ====================

/**
 * 处理所有未处理的记录
 * 
 * 流程：
 * 1. 获取所有未处理记录
 * 2. 逐条处理（串行，保证顺序）
 * 3. 统计结果
 * 
 * 注意：串行处理是为了保证 PS 系统的链式顺序
 */
async function processAllRecords() {
    // 防止并发处理
    if (PS_CONFIG.isProcessing) {
        console.log(`[${getFormattedDateTime()}] ⏳ 正在处理中，跳过`);
        return;
    }
    
    // 获取未处理记录
    const unprocessedRecords = getUnprocessedRecords();
    if (unprocessedRecords.length === 0) {
        return;
    }
    
    // 设置处理状态
    PS_CONFIG.isProcessing = true;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${getFormattedDateTime()}] 🚀 开始批量处理 ${unprocessedRecords.length} 条记录`);
    console.log(`${'='.repeat(60)}`);
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    // 逐条处理
    for (let i = 0; i < unprocessedRecords.length; i++) {
        const record = unprocessedRecords[i];
        const nftData = getNftData(record);
        
        // 再次检查是否已处理（防止并发）
        if (nftData && cacheManager.has(nftData)) {
            console.log(`[${getFormattedDateTime()}] ⏭️ 已处理，跳过: seq=${record.seq}`);
            skippedCount++;
            continue;
        }
        
        // 处理记录
        console.log(`\n[${getFormattedDateTime()}] 📝 处理 [${i+1}/${unprocessedRecords.length}] seq=${record.seq}`);
        const success = await processRecord(record);
        
        if (success) {
            successCount++;
        } else {
            failCount++;
            console.log(`[${getFormattedDateTime()}] ⚠️ 记录 seq=${record.seq} 处理失败，继续下一条`);
        }
        
        // 每条记录间隔 500ms，避免对 PS 系统造成压力
        if (i < unprocessedRecords.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // 输出统计
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${getFormattedDateTime()}] 📊 批量处理完成:`);
    console.log(`   成功: ${successCount}`);
    console.log(`   失败: ${failCount}`);
    console.log(`   跳过: ${skippedCount}`);
    console.log(`   总计: ${unprocessedRecords.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 重置处理状态
    PS_CONFIG.isProcessing = false;
}

// ==================== WebSocket 连接 ====================

/**
 * 初始化 PS 系统 WebSocket 连接
 * 
 * 连接状态：
 * - open: 连接成功，设置 connected = true
 * - error: 连接失败，设置 connected = false
 * - close: 连接断开，自动重连
 * 
 * @returns {Promise<boolean>} 是否连接成功
 */
async function initPSConnection() {
    return new Promise((resolve) => {
        try {
            console.log(`[${getFormattedDateTime()}] 🔌 连接PS系统: ${PS_CONFIG.url}`);
            
            PS_CONFIG.ws = new WebSocket(PS_CONFIG.url);
            
            // 连接成功
            PS_CONFIG.ws.on('open', () => {
                console.log(`[${getFormattedDateTime()}] ✅ 已连接到PS系统`);
                PS_CONFIG.connected = true;
                resolve(true);
            });
            
            // 连接错误
            PS_CONFIG.ws.on('error', (err) => {
                console.error(`[${getFormattedDateTime()}] ❌ 连接错误:`, err.message);
                PS_CONFIG.connected = false;
                resolve(false);
            });
            
            // 连接关闭（自动重连）
            PS_CONFIG.ws.on('close', () => {
                console.log(`[${getFormattedDateTime()}] ⚠️ 连接断开`);
                PS_CONFIG.connected = false;
                
                // 延迟后重连
                setTimeout(() => {
                    console.log(`[${getFormattedDateTime()}] 🔄 尝试重连...`);
                    initPSConnection();
                }, PS_CONFIG.reconnectInterval);
            });
            
            // 连接超时（5秒）
            setTimeout(() => {
                if (!PS_CONFIG.connected) {
                    console.log(`[${getFormattedDateTime()}] ⏰ 连接超时`);
                    resolve(false);
                }
            }, 5000);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 初始化连接失败:`, error);
            resolve(false);
        }
    });
}

// ==================== 主循环 ====================

/**
 * 主循环
 * 
 * 每3秒执行一次：
 * 1. 检查 PS 系统是否连接
 * 2. 如果已连接，处理所有未处理记录
 * 3. 如果未连接，输出等待状态
 * 
 * 目的：持续监控并处理新记录
 */
async function mainLoop() {
    console.log(`[${getFormattedDateTime()}] 🔄 主循环启动，检查间隔: 3秒`);
    console.log(`   缓存有效期: ${CACHE_TTL/1000}秒`);
    console.log(`   文件: ${PS_BXD_FILE}`);
    console.log(`   TS节点ID: ${PS_CONFIG.ts_id}`);
    console.log('');
    
    let loopCount = 0;
    
    while (true) {
        loopCount++;
        
        if (PS_CONFIG.connected) {
            // 连接正常，处理记录
            await processAllRecords();
        } else {
            // 未连接，输出等待状态
            if (loopCount % 20 === 0) {  // 每60秒输出一次
                console.log(`[${getFormattedDateTime()}] ⏳ 等待PS系统连接...`);
            }
            process.stdout.write('.');
        }
        
        // 等待3秒
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

// ==================== 启动程序 ====================

/**
 * 程序启动入口
 * 
 * 启动流程：
 * 1. 打印程序信息
 * 2. 加载账本
 * 3. 连接 PS 系统
 * 4. 启动主循环
 */
async function start() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🚀 gangdadao_ps.js - PS系统同步程序 v4.0                   ║');
    console.log('║  📌 适配港大道 server.js (ts_id=3)                          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  📁 待处理文件: hku_dao_queue.json (只读)                          ║');
    console.log('║  📁 已处理文件: ps_gangda.jsonl (写入)                         ║');
    console.log('║  📁 账本文件:   ts_3_ledger.json                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  🔑 去重方式:   NFT 字段 (hash/verification_code)           ║`);
    console.log(`║  💾 缓存策略:   30秒有效期 + 文件变化检测                      ║`);
    console.log(`║  🔌 PS系统:     ${PS_CONFIG.url.padEnd(30)}                ║`);
    console.log(`║  📌 TS节点ID:   ${PS_CONFIG.ts_id}                         ║`);
    console.log(`║  ⏱️  检查间隔:   3秒                                        ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // 1. 加载账本
    loadTsLedger();
    
    // 2. 连接 PS 系统
    const connected = await initPSConnection();
    if (!connected) {
        console.log(`[${getFormattedDateTime()}] ⚠️ 初始连接失败，将在后台持续重连`);
    }
    
    // 3. 启动主循环
    await mainLoop();
}

// ==================== 优雅退出 ====================

/**
 * 程序退出处理
 * 
 * 退出前：
 * 1. 关闭 WebSocket 连接
 * 2. 保存账本
 * 3. 打印退出信息
 */
function gracefulShutdown(signal) {
    console.log(`\n\n[${getFormattedDateTime()}] 🛑 收到 ${signal} 信号，正在清理...`);
    
    // 关闭 WebSocket
    if (PS_CONFIG.ws) {
        console.log(`[${getFormattedDateTime()}] 🔌 关闭 WebSocket 连接...`);
        PS_CONFIG.ws.close();
    }
    
    // 保存账本
    console.log(`[${getFormattedDateTime()}] 💾 保存账本...`);
    saveTsLedger();
    
    console.log(`[${getFormattedDateTime()}] ✅ 清理完成，程序退出`);
    process.exit(0);
}

// 注册信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
    console.error(`[${getFormattedDateTime()}] ❌ 未捕获异常:`, error);
    // 记录错误但不退出，继续运行
});

// ==================== 启动程序 ====================

// 启动
start().catch(error => {
    console.error(`[${getFormattedDateTime()}] ❌ 程序启动失败:`, error);
    process.exit(1);
});
