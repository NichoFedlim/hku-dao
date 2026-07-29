// bxd_ps.js - PS System Synchronization Program (Improved Version)
// Functions:
// 1. Reads unprocessed records from bxd_ps.json every 3 seconds.
// 2. Sends each record to the PS system sequentially (processing one record before sending the next).
// 3. After receiving a response, adds a tick field to the original record.
// 4. Records with an added tick will not be sent again.

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ================== 配置 ==================
const BXD_PS_FILE = path.join(__dirname, 'bxd_ps.json');
const PS_CONFIG = {
    url: 'ws://localhost:4000',
    connected: false,
    ws: null,
    ts_id: 1,           // TS节点ID
    ts_thread: 0,       // 线程序号
    ts_chain: '',       // 当前链值
    reconnectInterval: 5000,
    isProcessing: false, // 是否正在处理中
    currentRecordSeq: null // 当前正在处理的记录seq
};

// ================== 工具函数 ==================
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
 * 读取ts_1_ledger.json获取ts_thread和ts_chain
 */
function loadTsLedger() {
    const ledgerFile = path.join(__dirname, 'ts_1_ledger.json');
    try {
        if (fs.existsSync(ledgerFile)) {
            const ledgerData = JSON.parse(fs.readFileSync(ledgerFile, 'utf-8'));
            PS_CONFIG.ts_thread = ledgerData.ts_thread || 0;
            PS_CONFIG.ts_chain = ledgerData.ts_next_chain || '1234567890abcdef';
            console.log(`[${getFormattedDateTime()}] 📖 加载账本: ts_thread=${PS_CONFIG.ts_thread}, ts_chain=${PS_CONFIG.ts_chain}`);
        } else {
            console.log(`[${getFormattedDateTime()}] ⚠️ ts_1_ledger.json不存在，使用默认值`);
            PS_CONFIG.ts_chain = '1234567890abcdef';
            PS_CONFIG.ts_thread = 0;
            saveTsLedger();
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 读取账本失败:`, error);
        PS_CONFIG.ts_chain = '1234567890abcdef';
        PS_CONFIG.ts_thread = 0;
    }
}

/**
 * 保存ts_1_ledger.json
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
        console.log(`[${getFormattedDateTime()}] 💾 保存账本: ts_thread=${PS_CONFIG.ts_thread}, ts_chain=${PS_CONFIG.ts_chain}`);
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 保存账本失败:`, error);
    }
}

/**
 * 计算下一个链值
 */
function calculateNextChain(thread, currentChain, nftData) {
    const dataToHash = `${thread}${getFormattedDateTime()}100${nftData}${currentChain}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * 读取bxd_ps.json，获取未处理的记录（没有tick字段的记录）
 * @returns {Array} 未处理的记录数组
 */
function getUnprocessedRecords() {
    try {
        if (!fs.existsSync(BXD_PS_FILE)) {
            return [];
        }
        
        const records = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
        
        // 确保是数组
        if (!Array.isArray(records)) {
            console.error(`[${getFormattedDateTime()}] ❌ bxd_ps.json格式错误，不是数组`);
            return [];
        }
        
        // 过滤出没有 tick 字段的记录（未处理）
        const unprocessed = records.filter(record => record.tick === undefined);
        
        // 按 seq 排序
        unprocessed.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        if (unprocessed.length > 0) {
            console.log(`[${getFormattedDateTime()}] 📋 发现 ${unprocessed.length} 条未处理记录，seq: ${unprocessed.map(r => r.seq).join(', ')}`);
        }
        
        return unprocessed;
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 读取bxd_ps.json失败:`, error);
        return [];
    }
}

/**
 * 更新bxd_ps.json中指定记录的tick字段
 * @param {number} seq - 记录的序号
 * @param {number} tick - PS系统返回的tick值
 * @returns {boolean} 是否更新成功
 */
function updateRecordTick(seq, tick) {
    try {
        if (!fs.existsSync(BXD_PS_FILE)) {
            return false;
        }
        
        const records = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
        
        if (!Array.isArray(records)) {
            return false;
        }
        
        const record = records.find(r => r.seq === seq);
        if (record) {
            record.tick = tick;
            record.processed_at = getFormattedDateTime();
            
            fs.writeFileSync(BXD_PS_FILE, JSON.stringify(records, null, 2));
            console.log(`[${getFormattedDateTime()}] ✅ 记录 seq=${seq} 已更新 tick=${tick}`);
            return true;
        } else {
            console.warn(`[${getFormattedDateTime()}] ⚠️ 未找到 seq=${seq} 的记录`);
            return false;
        }
    } catch (error) {
        console.error(`[${getFormattedDateTime()}] ❌ 更新记录失败:`, error);
        return false;
    }
}

/**
 * 发送单条记录到PS系统
 * @param {Object} record - 要发送的记录
 * @returns {Promise<Object>} PS系统响应
 */
async function sendToPS(record) {
    return new Promise((resolve, reject) => {
        if (!PS_CONFIG.connected || !PS_CONFIG.ws) {
            reject(new Error('PS系统未连接'));
            return;
        }
        
        // 确定要发送的数据（nft字段）
        let nftData = null;
        let dataType = null;
        
        if (record.verification_code) {
            nftData = record.verification_code;
            dataType = 'verification_code';
        } else if (record.hash) {
            nftData = record.hash;
            dataType = 'hash';
        } else {
            reject(new Error(`记录 seq=${record.seq} 既没有verification_code也没有hash字段`));
            return;
        }
        
        // 递增ts_thread
        PS_CONFIG.ts_thread++;
        const currentChain = PS_CONFIG.ts_chain;
        const tsNextChain = calculateNextChain(PS_CONFIG.ts_thread, currentChain, nftData);
        
        // 构建ts_request
        const tsRequest = {
            ts_id: PS_CONFIG.ts_id,
            ts_thread: PS_CONFIG.ts_thread,
            ts_chain: currentChain,
            ts_next_chain: tsNextChain,
            nft: nftData,
            service: "input"
        };
        
        console.log(`\n[${getFormattedDateTime()}] ========== 发送到PS系统 ==========`);
        console.log(`  记录 seq: ${record.seq}`);
        console.log(`  数据类型: ${dataType}`);
        console.log(`  数据: ${nftData.substring(0, 32)}...`);
        console.log(`  ts_thread: ${tsRequest.ts_thread}`);
        console.log(`  ts_chain: ${tsRequest.ts_chain}`);
        console.log(`  ts_next_chain: ${tsRequest.ts_next_chain}`);
        
        // 设置超时
        const timeout = setTimeout(() => {
            reject(new Error('PS系统响应超时 (30秒)'));
        }, 30000);
        
        // 生成请求标识（用于匹配响应）
        const requestKey = `${PS_CONFIG.ts_id}_${PS_CONFIG.ts_thread}`;
        
        // 保存响应处理函数
        const responseHandler = (response) => {
            // 检查响应的ts_thread是否匹配
            if (response.ts_thread === PS_CONFIG.ts_thread && response.ts_id === PS_CONFIG.ts_id) {
                clearTimeout(timeout);
                PS_CONFIG.ws.removeListener('message', messageHandler);
                resolve(response);
            }
        };
        
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                if (response.ts_thread === PS_CONFIG.ts_thread && response.ts_id === PS_CONFIG.ts_id) {
                    clearTimeout(timeout);
                    PS_CONFIG.ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (e) {
                // 忽略解析错误
            }
        };
        
        // 临时监听响应
        PS_CONFIG.ws.once('message', messageHandler);
        
        // 发送请求
        PS_CONFIG.ws.send(JSON.stringify(tsRequest));
        console.log(`[${getFormattedDateTime()}] 📤 请求已发送，等待响应...`);
    });
}

/**
 * 处理单条记录（发送并等待响应，然后更新tick）
 * @param {Object} record - 要处理的记录
 * @returns {Promise<boolean>} 是否处理成功
 */
async function processRecord(record) {
    console.log(`\n[${getFormattedDateTime()}] 🔄 开始处理记录 seq=${record.seq}`);
    
    try {
        // 发送到PS系统并等待响应
        const response = await sendToPS(record);
        
        console.log(`[${getFormattedDateTime()}] 📥 收到PS系统响应:`);
        console.log(`  ts_thread: ${response.ts_thread}`);
        console.log(`  tick: ${response.tick}`);
        console.log(`  result.dao: ${response.result?.dao}`);
        
        // 更新账本（ts_chain）
        if (response.ledger && response.ledger.ts_next_chain) {
            PS_CONFIG.ts_chain = response.ledger.ts_next_chain;
            saveTsLedger();
            console.log(`[${getFormattedDateTime()}] 🔗 更新ts_chain: ${PS_CONFIG.ts_chain}`);
        }
        
        // 检查处理结果
        if (response.result && response.result.dao !== "error") {
            // 成功：更新记录中的tick字段
            const tick = response.tick;
            if (tick !== undefined) {
                const updated = updateRecordTick(record.seq, tick);
                if (updated) {
                    console.log(`[${getFormattedDateTime()}] ✅ 记录 seq=${record.seq} 处理成功，tick=${tick}`);
                    return true;
                } else {
                    console.error(`[${getFormattedDateTime()}] ❌ 记录 seq=${record.seq} 处理成功但更新tick失败`);
                    return false;
                }
            } else {
                console.warn(`[${getFormattedDateTime()}] ⚠️ PS响应中没有tick字段`);
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

/**
 * 处理所有未处理的记录（按顺序逐条处理）
 */
async function processAllRecords() {
    if (PS_CONFIG.isProcessing) {
        console.log(`[${getFormattedDateTime()}] ⏳ 正在处理中，跳过本次检查`);
        return;
    }
    
    // 获取未处理的记录
    const unprocessedRecords = getUnprocessedRecords();
    
    if (unprocessedRecords.length === 0) {
        // 无待处理记录，静默跳过
        return;
    }
    
    PS_CONFIG.isProcessing = true;
    console.log(`\n[${getFormattedDateTime()}] 🚀 开始处理 ${unprocessedRecords.length} 条记录`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 按顺序逐条处理
    for (let i = 0; i < unprocessedRecords.length; i++) {
        const record = unprocessedRecords[i];
        
        // 处理前再次确认该记录是否已经有tick（可能被其他进程更新）
        const currentRecords = getUnprocessedRecords();
        const stillUnprocessed = currentRecords.some(r => r.seq === record.seq);
        if (!stillUnprocessed) {
            console.log(`[${getFormattedDateTime()}] ⏭️ 记录 seq=${record.seq} 已被处理，跳过`);
            continue;
        }
        
        const success = await processRecord(record);
        
        if (success) {
            successCount++;
        } else {
            failCount++;
            // 失败时可以选择停止或继续，这里选择继续处理下一条
            console.log(`[${getFormattedDateTime()}] ⚠️ 记录 seq=${record.seq} 处理失败，继续下一条`);
        }
        
        // 每条记录处理后稍作延迟，避免对PS系统造成压力
        if (i < unprocessedRecords.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log(`\n[${getFormattedDateTime()}] 📊 处理完成: 成功=${successCount}, 失败=${failCount}`);
    PS_CONFIG.isProcessing = false;
}

/**
 * 初始化PS系统WebSocket连接
 */
async function initPSConnection() {
    return new Promise((resolve) => {
        try {
            PS_CONFIG.ws = new WebSocket(PS_CONFIG.url);
            
            PS_CONFIG.ws.on('open', () => {
                console.log(`[${getFormattedDateTime()}] ✅ 已连接到PS系统 (${PS_CONFIG.url})`);
                PS_CONFIG.connected = true;
                resolve(true);
            });
            
            PS_CONFIG.ws.on('error', (err) => {
                console.error(`[${getFormattedDateTime()}] ❌ PS系统连接错误:`, err.message);
                PS_CONFIG.connected = false;
                resolve(false);
            });
            
            PS_CONFIG.ws.on('close', () => {
                console.log(`[${getFormattedDateTime()}] ⚠️ PS系统连接断开`);
                PS_CONFIG.connected = false;
                // 尝试重连
                setTimeout(() => {
                    console.log(`[${getFormattedDateTime()}] 🔄 尝试重连PS系统...`);
                    initPSConnection();
                }, PS_CONFIG.reconnectInterval);
            });
            
            // 连接超时处理
            setTimeout(() => {
                if (!PS_CONFIG.connected) {
                    console.log(`[${getFormattedDateTime()}] ⏰ PS系统连接超时`);
                    resolve(false);
                }
            }, 5000);
            
        } catch (error) {
            console.error(`[${getFormattedDateTime()}] ❌ 初始化PS连接失败:`, error);
            resolve(false);
        }
    });
}

/**
 * 主循环：每3秒检查并处理
 */
async function mainLoop() {
    console.log(`[${getFormattedDateTime()}] 🔄 主循环已启动，检查间隔: 3秒`);
    
    while (true) {
        if (PS_CONFIG.connected) {
            await processAllRecords();
        } else {
            // 未连接时静默等待
            process.stdout.write('.');
        }
        
        // 等待3秒
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * 启动程序
 */
async function start() {
    console.log('\n========================================');
    console.log('🚀 bxd_ps.js - PS系统同步程序 v2.0');
    console.log('========================================');
    console.log(`📁 bxd_ps.json 文件: ${BXD_PS_FILE}`);
    console.log(`🔌 PS系统地址: ${PS_CONFIG.url}`);
    console.log(`⏱️  检查间隔: 3秒`);
    console.log(`📝 处理模式: 顺序逐条处理，每条记录添加tick后继续下一条`);
    console.log('========================================\n');
    
    // 加载账本
    loadTsLedger();
    
    // 连接PS系统
    const connected = await initPSConnection();
    
    if (!connected) {
        console.log(`[${getFormattedDateTime()}] ⚠️ 初始连接失败，将在后台持续重连`);
    }
    
    // 启动主循环
    await mainLoop();
}

// 优雅退出处理
process.on('SIGINT', () => {
    console.log('\n\n🛑 收到退出信号，正在清理...');
    if (PS_CONFIG.ws) {
        PS_CONFIG.ws.close();
    }
    saveTsLedger();
    console.log('✅ 清理完成，退出程序');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 收到终止信号，正在清理...');
    if (PS_CONFIG.ws) {
        PS_CONFIG.ws.close();
    }
    saveTsLedger();
    process.exit(0);
});

// 启动程序
start().catch(error => {
    console.error('❌ 程序启动失败:', error);
    process.exit(1);
});