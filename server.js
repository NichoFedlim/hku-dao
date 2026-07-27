

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');  // 添加 https 模块用于短链服务

// 用于锁定 market.json 的文件级锁
let marketLock = false;

const multer = require('multer');
const ip = require('ip');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
const PORT = 5012;
const IP = ip.address();

// ================== 全局配置 ==================
const UPLOAD_DIR = 'uploads';
const NFT_DATA_DIR = path.join(__dirname, 'nft', 'data');

// ================== 持久化存储配置 ==================
const PERSISTENCE_DIR = path.join(__dirname, 'persistence');
const WALLET_STATE_FILE = path.join(PERSISTENCE_DIR, 'wallet_state.json');

// ================== bxd_ps.json 存储配置（极简模式） ==================
const BXD_PS_FILE = path.join(__dirname, 'bxd_ps.json');

// 在培正道 server.js 开头添加 CORS 配置
const cors = require('cors');  // 需要安装: npm install cors

// 配置 CORS
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5000',
            'http://127.0.0.1:5000',
        'https://d3.p2.rbas.top',
            'http://192.168.2.2:5000',
            'https://hk.rbas.top',
            'https://dao002.rbas.top',
            // 培正道自身
            'http://localhost:5012',
            'http://127.0.0.1:5012'
        ];
        
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn('[CORS] 拒绝来源:', origin);
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));




// bxd_ps.json 文件锁
let bxdFileLock = false;

/**
 * 获取当前最大序号（动态从文件读取）
 * @returns {number} 当前最大序号，如果没有记录则返回0
 */
function getCurrentMaxSeq() {
    try {
        if (fs.existsSync(BXD_PS_FILE)) {
            const allData = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
            // 确保是数组格式
            if (Array.isArray(allData) && allData.length > 0) {
                const maxSeq = Math.max(...allData.map(item => item.seq || 0));
                return maxSeq;
            }
        }
        return 0;
    } catch (error) {
        console.error('[BXD Queue] 读取最大序号失败:', error);
        return 0;
    }
}

/**
 * 确保 bxd_ps.json 文件存在
 */
function ensureBxdPsFile() {
    if (!fs.existsSync(BXD_PS_FILE)) {
        fs.writeFileSync(BXD_PS_FILE, JSON.stringify([], null, 2));
        console.log(`📁 创建 bxd_ps.json 文件: ${BXD_PS_FILE}`);
    } else {
        // 检查文件格式，如果是旧格式则转换
        try {
            const data = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
            if (!Array.isArray(data)) {
                console.log('[BXD Queue] 检测到旧格式文件，正在转换为纯数组格式...');
                // 如果是旧格式，提取 records 数组
                if (data.records && Array.isArray(data.records)) {
                    fs.writeFileSync(BXD_PS_FILE, JSON.stringify(data.records, null, 2));
                    console.log('[BXD Queue] 格式转换完成');
                } else {
                    fs.writeFileSync(BXD_PS_FILE, JSON.stringify([], null, 2));
                    console.log('[BXD Queue] 重新初始化为空数组');
                }
            }
        } catch (error) {
            console.error('[BXD Queue] 读取文件失败，重新初始化:', error);
            fs.writeFileSync(BXD_PS_FILE, JSON.stringify([], null, 2));
        }
    }
}

/**
 * 保存记录到 bxd_ps.json（极简模式：纯数组，只保存 seq, hash/verification_code）
 * 每次保存时动态读取当前最大seq值
 * @param {string} type - 类型: 'citang', 'member', 'purchase'
 * @param {string} code - verification_code 或 hash
 */
function saveToBxdPsSimple(type, code) {
    // 等待文件锁释放
    while (bxdFileLock) {
        // 短暂等待
        const waitUntil = Date.now() + 10;
        while (Date.now() < waitUntil) {}
    }
    
    bxdFileLock = true;
    try {
        ensureBxdPsFile();
        
        // 读取现有数据（纯数组）
        let allData = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
        
        // 确保是数组
        if (!Array.isArray(allData)) {
            allData = [];
        }
        
        // 动态获取当前最大序号
        const currentMaxSeq = getCurrentMaxSeq();
        const newSeq = currentMaxSeq + 1;
        
        // 创建新记录（极简模式 - 根据类型决定字段名）
        const newRecord = {
            seq: newSeq,
            [type === 'purchase' ? 'verification_code' : 'hash']: code
        };
        
        // 添加到数组
        allData.push(newRecord);
        
        // 写回文件
        fs.writeFileSync(BXD_PS_FILE, JSON.stringify(allData, null, 2));
        
        const codeType = type === 'purchase' ? 'verification_code' : 'hash';
        console.log(`💾 已保存到 bxd_ps.json: seq=${newSeq} (从${currentMaxSeq}+1), ${codeType}=${code.substring(0, 16)}...`);
        
        return newRecord;
    } catch (error) {
        console.error('❌ 保存到 bxd_ps.json 失败:', error);
        return null;
    } finally {
        bxdFileLock = false;
    }
}

/**
 * 批量保存记录到 bxd_ps.json（确保序号连续性）
 * @param {Array} items - 要保存的项数组 [{type, code}]
 * @returns {Array} 保存的记录
 */
function batchSaveToBxdPsSimple(items) {
    // 等待文件锁释放
    while (bxdFileLock) {
        const waitUntil = Date.now() + 10;
        while (Date.now() < waitUntil) {}
    }
    
    bxdFileLock = true;
    try {
        ensureBxdPsFile();
        
        // 读取现有数据
        let allData = JSON.parse(fs.readFileSync(BXD_PS_FILE, 'utf-8'));
        if (!Array.isArray(allData)) {
            allData = [];
        }
        
        // 获取当前最大序号
        let currentMaxSeq = getCurrentMaxSeq();
        const savedRecords = [];
        
        // 批量添加，序号连续递增
        for (const item of items) {
            currentMaxSeq++;
            const newRecord = {
                seq: currentMaxSeq,
                [item.type === 'purchase' ? 'verification_code' : 'hash']: item.code
            };
            allData.push(newRecord);
            savedRecords.push(newRecord);
            
            const codeType = item.type === 'purchase' ? 'verification_code' : 'hash';
            console.log(`💾 批量保存: seq=${currentMaxSeq}, ${codeType}=${item.code.substring(0, 16)}...`);
        }
        
        // 一次性写回文件
        fs.writeFileSync(BXD_PS_FILE, JSON.stringify(allData, null, 2));
        
        console.log(`✅ 批量保存完成: 共保存 ${savedRecords.length} 条记录`);
        return savedRecords;
    } catch (error) {
        console.error('❌ 批量保存到 bxd_ps.json 失败:', error);
        return [];
    } finally {
        bxdFileLock = false;
    }
}

/**
 * 确保持久化目录存在
 */
function ensurePersistenceDir() {
    if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true, mode: 0o755 });
        console.log(`📁 创建持久化目录: ${PERSISTENCE_DIR}`);
    }
}

/**
 * 加载持久化的钱包状态
 */
function loadWalletState() {
    ensurePersistenceDir();
    
    if (!fs.existsSync(WALLET_STATE_FILE)) {
        console.log('📂 未找到持久化状态文件，使用默认值');
        return null;
    }
    
    try {
        const stateData = fs.readFileSync(WALLET_STATE_FILE, 'utf-8');
        const state = JSON.parse(stateData);
        
        console.log('📂 已加载持久化钱包状态:');
        console.log(`  当前链值: ${state.currentChain || '未设置'}`);
        console.log(`  线程计数器: ${state.threadCounter || 0}`);
        console.log(`  请求索引: ${state.requestIndex || 0}`);
        console.log(`  最后操作时间: ${state.lastOperationTime ? new Date(state.lastOperationTime).toLocaleString() : '无'}`);
        
        return state;
    } catch (error) {
        console.error('❌ 加载持久化状态失败:', error.message);
        return null;
    }
}

/**
 * 保存钱包状态到持久化文件
 */
function saveWalletState() {
    try {
        ensurePersistenceDir();
        
        const state = {
            currentChain: WALLET_CONFIG.currentChain,
            threadCounter: WALLET_CONFIG.threadCounter,
            requestIndex: WALLET_CONFIG.requestIndex,
            lastOperationTime: WALLET_CONFIG.lastOperationTime,
            savedAt: Date.now(),
            savedAtFormatted: new Date().toLocaleString('zh-CN')
        };
        
        const tempFile = path.join(PERSISTENCE_DIR, 'wallet_state_temp.json');
        fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
        fs.renameSync(tempFile, WALLET_STATE_FILE);
        
        console.log(`💾 钱包状态已持久化: chain=${state.currentChain}, thread=${state.threadCounter}`);
        return true;
    } catch (error) {
        console.error('❌ 保存钱包状态失败:', error.message);
        return false;
    }
}

/**
 * 定期自动保存钱包状态
 */
function startAutoSave(intervalMs = 30000) {
    setInterval(() => {
        if (WALLET_CONFIG.lastOperationTime > 0) {
            saveWalletState();
        }
    }, intervalMs);
    console.log(`⏱️ 自动保存已启动，间隔: ${intervalMs/1000}秒`);
}

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

function jsSHA256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }
}

function sendError(res, status, message, details = '') {
    res.status(status).json({
        error: message,
        details: details
    });
}

function formatWalletShort(wallet) {
    if (!wallet) return '未知';
    if (wallet.length <= 8) return wallet;
    return wallet.slice(0, 4) + '***' + wallet.slice(-4);
}

function formatChainShort(chain) {
    const displayLength = 4;
    return chain ? chain.slice(0, displayLength) + '...' : '未知';
}

/**
 * 生成完整的64位验证码
 * @param {number} thread - 线程号
 * @param {string} time - 时间
 * @param {number} price - 价格
 * @param {string} seller - 卖家
 * @param {string} buyer - 买家
 * @param {string} chain - 当前链
 * @returns {string} 64位大写验证码
 */
function generateVerificationCode(thread, time, price, seller, buyer, chain) {
    // 使用标准格式生成验证码
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
 */
function calculateNextChain(thread, time, price, seller, buyer, chain) {
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    return verification_code.substring(0, 16).toUpperCase();
}

function atomicWriteMarket(data) {
    const tempFile = path.join(NFT_DATA_DIR, 'market_temp.json');
    const finalFile = path.join(NFT_DATA_DIR, 'market.json');
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, finalFile);
}

// ================== 短链生成函数 ==================

/**
 * 生成短链接（调用短链服务）
 * @param {string} originalUrl - 原始URL
 * @returns {Promise<{short_code: string, short_url: string}>}
 */
async function generateShortLinkForNFT(originalUrl) {
    const SHORTEN_API = 'https://dao002.rbas.top/shorten-api/shorten';
    
    return new Promise((resolve, reject) => {
        const url = new URL(SHORTEN_API);
        const postData = JSON.stringify({ url: originalUrl });
        
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success) {
                        resolve({
                            short_code: result.short_code,
                            short_url: result.short_url
                        });
                    } else {
                        reject(new Error(result.error || '生成短链失败'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * 为会堂生成详情页URL和短链接
 * @param {string} surname - 姓氏
 * @param {string} cardNumber - 卡号
 * @param {string} citangNumber - 会堂编号
 * @param {string} citangName - 会堂名称
 * @returns {Promise<{detailUrl: string, shortlink: string, short_code: string}>}
 */
async function generateCitangShortlink(surname, cardNumber, citangNumber, citangName) {
    const detailUrl = `https://dao002.rbas.top/citang_detail.html?surname=${encodeURIComponent(surname)}&citang_number=${citangNumber}&card_number=${cardNumber}&name=${encodeURIComponent(citangName)}`;
    
    try {
        const result = await generateShortLinkForNFT(detailUrl);
        return {
            detailUrl,
            shortlink: result.short_url,
            short_code: result.short_code
        };
    } catch (error) {
        console.error(`生成会堂短链接失败: ${error.message}`);
        return {
            detailUrl,
            shortlink: '',
            short_code: ''
        };
    }
}

/**
 * 为成员生成详情页URL和短链接
 * @param {string} surname - 姓氏
 * @param {string} cardNumber - 卡号
 * @param {string} citangNumber - 会堂编号
 * @param {string} citangName - 会堂名称
 * @param {string} memberNumber - 成员编号
 * @param {string} memberName - 成员姓名
 * @returns {Promise<{detailUrl: string, shortlink: string, short_code: string}>}
 */
async function generateMemberShortlink(surname, cardNumber, citangNumber, citangName, memberNumber, memberName) {
    const detailUrl = `https://dao002.rbas.top/member_detail.html?surname=${encodeURIComponent(surname)}&citang_number=${citangNumber}&member_number=${memberNumber}&card_number=${cardNumber}&citangname=${encodeURIComponent(citangName)}&membername=${encodeURIComponent(memberName)}`;
    
    try {
        const result = await generateShortLinkForNFT(detailUrl);
        return {
            detailUrl,
            shortlink: result.short_url,
            short_code: result.short_code
        };
    } catch (error) {
        console.error(`生成成员短链接失败: ${error.message}`);
        return {
            detailUrl,
            shortlink: '',
            short_code: ''
        };
    }
}

// ================== 中间件配置 ==================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// 修改 multer 配置，允许更多文件类型
const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB 限制
    fileFilter: (req, file, cb) => {
        // 允许的文件类型
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/rtf',
            'application/vnd.oasis.opendocument.text'
        ];
        
        // 允许的扩展名
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt'];
        
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'), false);
        }
    }
});

// ================== 静态文件服务 ==================
app.use('/nft', express.static(path.join(__dirname, 'nft')));
app.use(express.static(path.join(__dirname, 'nft')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));


//2026-07-15 19：45
// ========== 新增：提供 wallet-auth.js 文件 ==========
app.use(express.static(__dirname));  // ← 这行确保 wallet-auth.js 可以被访问


// ================== 姓氏内容静态文件服务 ==================
app.use('/surname-content', express.static(path.join(__dirname, 'nft', 'data'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.txt': 'text/plain'
        };
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// ================== 钱包道系统连接 ==================
const WALLET_CONFIG = {
    url: 'ws://192.168.1.26:5000',
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

// ================== 初始化钱包状态 ==================
function initWalletState() {
    const savedState = loadWalletState();
    
    if (savedState) {
        if (savedState.currentChain) {
            WALLET_CONFIG.currentChain = savedState.currentChain;
        }
        if (savedState.threadCounter && savedState.threadCounter > 0) {
            WALLET_CONFIG.threadCounter = savedState.threadCounter;
        }
        if (savedState.requestIndex && savedState.requestIndex > 0) {
            WALLET_CONFIG.requestIndex = savedState.requestIndex;
        }
        if (savedState.lastOperationTime) {
            WALLET_CONFIG.lastOperationTime = savedState.lastOperationTime;
        }
        
        console.log('\n========================================');
        console.log('🔄 从持久化状态恢复:');
        console.log(`  当前链值: ${WALLET_CONFIG.currentChain}`);
        console.log(`  线程计数器: ${WALLET_CONFIG.threadCounter}`);
        console.log(`  请求索引: ${WALLET_CONFIG.requestIndex}`);
        console.log(`  最后操作时间: ${WALLET_CONFIG.lastOperationTime ? new Date(WALLET_CONFIG.lastOperationTime).toLocaleString() : '无'}`);
        console.log('========================================\n');
    } else {
        console.log('🆕 使用默认初始状态');
    }
    
    startAutoSave(30000);
}

function calculateWalletNextChain(request) {
    const { next_chain, ...requestWithoutNextChain } = request;
    const pwd = JSON.stringify(requestWithoutNextChain);
    const hash = crypto.createHash("sha256").update(pwd).digest("hex");
    const nextChain = hash.substring(0, 16);
    return nextChain;
}

function initWalletConnection() {
    try {
        WALLET_CONFIG.ws = new WebSocket(WALLET_CONFIG.url);
        
        WALLET_CONFIG.ws.on('open', () => {
            console.log('✅ 已连接到钱包道系统');
            WALLET_CONFIG.connected = true;
            WALLET_CONFIG.wallet_rx = 0;
            WALLET_CONFIG.wallet_tx = 0;
            WALLET_CONFIG.lastOperationTime = Date.now();
            saveWalletState();
        });

        WALLET_CONFIG.ws.on('message', (data) => {
            try {
                WALLET_CONFIG.wallet_rx++;
                const response = JSON.parse(data);
                console.log('📥 收到钱包道响应:');
                console.table({ result: response });
                
                if (response.next_chain) {
                    if (response.next_chain !== WALLET_CONFIG.currentChain) {
                        console.warn(`⚠️  Chain验证警告: 响应chain(${response.next_chain}) ≠ 当前chain(${WALLET_CONFIG.currentChain})`);
                    } else {
                        console.log(`  ✅ Chain验证通过: ${response.next_chain}`);
                    }
                }
                
                logWalletCommunication('response', response);
                handleWalletResponse(response);
                
                WALLET_CONFIG.lastOperationTime = Date.now();
            } catch (e) {
                console.error('钱包道响应解析失败:', e);
            }
        });

        WALLET_CONFIG.ws.on('close', () => {
            console.warn('⚠️ 钱包道连接断开，尝试重连...');
            WALLET_CONFIG.connected = false;
            saveWalletState();
            setTimeout(initWalletConnection, WALLET_CONFIG.reconnectInterval);
        });

        WALLET_CONFIG.ws.on('error', (err) => {
            console.error('❌ 钱包道连接错误:', err);
            WALLET_CONFIG.connected = false;
        });
    } catch (error) {
        console.error('钱包道系统初始化失败:', error);
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
    console.log('未找到对应的钱包道请求:', response);
}

async function sendToWallet(request) {
    return new Promise((resolve, reject) => {
        if (!WALLET_CONFIG.connected) {
            reject(new Error('钱包道未连接'));
            return;
        }

        const requestId = Date.now().toString();
        
        const timeout = setTimeout(() => {
            WALLET_CONFIG.pendingRequests.delete(requestId);
            reject(new Error('钱包道响应超时'));
        }, 600000);

        WALLET_CONFIG.pendingRequests.set(requestId, {
            resolve: (response) => {
                clearTimeout(timeout);
                resolve(response);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            },
            dao_id: request.dao_id,
            thread: request.thread
        });

        WALLET_CONFIG.ws.send(JSON.stringify(request));
        WALLET_CONFIG.wallet_tx++;
        WALLET_CONFIG.lastOperationTime = Date.now();
        logWalletCommunication('request', request);
        console.log(`📤 发送请求到钱包道 (thread: ${request.thread}, chain: ${request.chain})`);
    });
}

// ================== 钱包道业务函数 ==================
async function walletLogin(name, phone, code) {
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
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

    console.log(`\n🔐 登录操作: index=${index}, thread=${thread}`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    try {
        const response = await sendToWallet(finalRequest);
        
        if (response.status && response.status !== 'log_in error') {
            return {
                success: true,
                wallet: response.status,
                name: name,
                message: '登录成功',
                chainUsed: currentChain,
                nextChain: next_chain,
                response: response
            };
        } else {
            return {
                success: false,
                error: response.error || '登录失败，请检查姓名、手机号和验证码'
            };
        }
    } catch (error) {
        console.error('登录请求失败:', error);
        return {
            success: false,
            error: error.message || '登录失败'
        };
    }
}

async function walletRequestCode(name, phone) {
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
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

    console.log(`\n📱 验证码请求: index=${index}, thread=${thread}`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    try {
        const response = await sendToWallet(finalRequest);
        
        if (response.status && response.status !== 'code_request error') {
            return {
                success: true,
                message: response.message || '验证码已经发送到您的手机，请在输入框输入验证码',
                response: response
            };
        } else {
            return {
                success: false,
                error: response.error || '发送验证码失败'
            };
        }
    } catch (error) {
        console.error('验证码请求失败:', error);
        return {
            success: false,
            error: error.message || '网络错误'
        };
    }
}

async function transferRC(from, to, amount) {
    // 参数验证
    if (!from || typeof from !== 'string') {
        console.error(`[transferRC] 无效的发送方钱包地址: ${from}`);
        throw new Error('无效的发送方钱包地址');
    }
    
    if (!to || typeof to !== 'string') {
        console.error(`[transferRC] 无效的接收方钱包地址: ${to}`);
        throw new Error('无效的接收方钱包地址');
    }
    
    // 验证钱包地址格式（64位十六进制）
    const walletAddressRegex = /^[A-F0-9]{64}$/i;
    if (!walletAddressRegex.test(from)) {
        console.error(`[transferRC] 发送方钱包地址格式错误: ${from.substring(0, 16)}...`);
        throw new Error('发送方钱包地址格式错误');
    }
    
    if (!walletAddressRegex.test(to)) {
        console.error(`[transferRC] 接收方钱包地址格式错误: ${to.substring(0, 16)}...`);
        throw new Error('接收方钱包地址格式错误');
    }
    
    if (!amount || amount <= 0 || typeof amount !== 'number') {
        console.error(`[transferRC] 无效的转账金额: ${amount}`);
        throw new Error('无效的转账金额');
    }
    
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
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

    console.log(`\n💸 转账操作: index=${index}, thread=${thread}`);
    console.log(`  金额: ${amount} 根币`);
    console.log(`  发送方: ${from.substring(0, 16)}...`);
    console.log(`  接收方: ${to.substring(0, 16)}...`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    try {
        const response = await sendToWallet(finalRequest);
        
        console.log(`[transferRC] 钱包道响应:`, JSON.stringify(response, null, 2));
        
        if (response.status === 'ok') {
            console.log(`[transferRC] ✅ 转账成功: ${amount} 根币`);
            return { 
                success: true, 
                response, 
                chainUsed: currentChain, 
                nextChain: next_chain 
            };
        }
        
        if (response.status === 'error') {
            const errorMessage = response.error || '转账失败';
            
            switch (errorMessage) {
                case 'insufficient_balance':
                    console.error(`[transferRC] ❌ 余额不足: 需要 ${amount} 根币`);
                    throw new Error(`余额不足，当前余额可能不足 ${amount} 根币`);
                    
                case 'invalid_wallet':
                    console.error(`[transferRC] ❌ 无效的钱包地址`);
                    throw new Error(`钱包地址无效，请重新登录`);
                    
                case 'invalid_wallet_index':
                    console.error(`[transferRC] ❌ 钱包索引无效`);
                    throw new Error(`钱包验证失败，请重新登录`);
                    
                case 'sender_not_found':
                    console.error(`[transferRC] ❌ 发送方钱包不存在`);
                    throw new Error(`您的钱包不存在，请重新登录`);
                    
                case 'receiver_not_found':
                    console.error(`[transferRC] ❌ 接收方钱包不存在`);
                    throw new Error(`接收方钱包不存在`);
                    
                default:
                    console.error(`[transferRC] ❌ 转账失败: ${errorMessage}`);
                    throw new Error(`转账失败: ${errorMessage}`);
            }
        }
        
        if (response.status && response.status !== 'transfer_rc error') {
            console.log(`[transferRC] 转账状态: ${response.status}`);
            return { 
                success: true, 
                response, 
                chainUsed: currentChain, 
                nextChain: next_chain 
            };
        } else {
            throw new Error(response.status || '转账失败');
        }
        
    } catch (error) {
        console.error(`[transferRC] ❌ 转账异常:`, error.message);
        throw error;
    }
}

async function removeNFT(from, nft) {
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
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

    console.log(`\n🗑️ 移除NFT操作: index=${index}, thread=${thread}`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    const response = await sendToWallet(finalRequest);
    
    if (response.status && response.status !== 'nft_remove error') {
        return { success: true, response, chainUsed: currentChain, nextChain: next_chain };
    } else {
        throw new Error(response.status || 'NFT移除失败');
    }
}

async function addNFT(to, nft, nft_name, value) {
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
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

    console.log(`\n➕ 添加NFT操作: index=${index}, thread=${thread}`);
    console.log(`  NFT名称: ${nft_name}, 价值: ${value}`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    const response = await sendToWallet(finalRequest);
    
    if (response.status && response.status !== 'nft_add error') {
        return { success: true, response, chainUsed: currentChain, nextChain: next_chain };
    } else {
        throw new Error(response.status || 'NFT添加失败');
    }
}

/**
 * 添加NFT到钱包（支持操作类型标识）
 * @param {string} to - 接收方钱包地址
 * @param {string} nft - NFT哈希值
 * @param {string} nft_name - NFT名称
 * @param {number} value - NFT价值
 * @param {string} actionType - 操作类型 ('add_citang', 'add_member', 'purchase' 等)
 * @returns {Promise<Object>} 添加结果
 */
async function addNFTWithActionType(to, nft, nft_name, value, actionType = 'add') {
    const thread = WALLET_CONFIG.threadCounter++;
    const index = WALLET_CONFIG.requestIndex++;
    const currentChain = WALLET_CONFIG.currentChain;
    
    const holding = { 
        nft: nft, 
        dao_id: "2.3", 
        nft_name: nft_name, 
        value: value,
        action_type: actionType
    };
    
    const baseRequest = {
        dao_id: "2.3",
        chain: currentChain,
        thread: thread,
        type: "nft_add",
        to: to,
        holding: holding,
        action_type: actionType
    };
    
    const next_chain = calculateWalletNextChain(baseRequest);
    const finalRequest = { ...baseRequest, next_chain: next_chain };

    console.log(`\n➕ 添加NFT操作: index=${index}, thread=${thread}`);
    console.log(`  NFT名称: ${nft_name}, 价值: ${value}`);
    console.log(`  操作类型: ${actionType}`);
    console.log(`  Chain原子传递: ${currentChain} → ${next_chain}`);

    WALLET_CONFIG.currentChain = next_chain;
    saveWalletState();
    
    try {
        const response = await sendToWallet(finalRequest);
        
        if (response.status && response.status !== 'nft_add error') {
            return { success: true, response, chainUsed: currentChain, nextChain: next_chain, actionType: actionType };
        } else {
            throw new Error(response.status || 'NFT添加失败');
        }
    } catch (error) {
        console.error('添加NFT到钱包失败:', error);
        throw error;
    }
}

// ================== 路由定义 ==================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'nft', 'index_main.html'));
});

// ================== 用户认证路由 ==================
app.post('/api/send-code', async (req, res) => {
    const { type, name, phone } = req.body;
    
    if (type === 'login') {
        try {
            const result = await walletRequestCode(name, phone);
            
            if (result.success) {
                res.json({ success: true, message: result.message || '验证码已经发送到您的手机，请在输入框输入验证码' });
            } else {
                res.json({ success: false, message: result.error || '发送验证码失败' });
            }
        } catch (error) {
            console.error('发送验证码失败:', error);
            res.json({ success: false, message: '网络错误，请重试' });
        }
    } else {
        res.json({ success: false, message: '不支持的验证码类型' });
    }
});

app.post('/api/check-user', async (req, res) => {
    res.json({ success: true, exists: true, message: '用户存在' });
});

app.post('/api/login', async (req, res) => {
    const { name, phone, code } = req.body;
    
    try {
        if (!name || !phone || !code) {
            return res.json({ success: false, error: '缺少必要参数：姓名、手机号、验证码' });
        }

        const loginResult = await walletLogin(name, phone, code);
        
        if (loginResult.success) {
            res.json({
                success: true,
                wallet: loginResult.wallet,
                name: loginResult.name,
                account: name,
                phone: phone,
                message: "登录成功"
            });
        } else {
            res.json({ success: false, error: loginResult.error || '登录失败' });
        }
    } catch (error) {
        console.error('登录失败:', error);
        res.json({ success: false, error: error.message || '登录失败，请稍后重试' });
    }
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// ================== 祠堂相关路由 ==================
app.get('/ti-log/:card_number', (req, res) => {
    const { card_number } = req.params;
    const surname = decodeURIComponent(req.query.surname || '');
    if (!surname) return sendError(res, 400, '缺少姓氏参数');

    const contentPath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'content.json');
    const logPath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'content_log.json');

    let holder = {};
    let logs = [];
    try {
        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
        holder = content.nft_holder || {};
    } catch { }
    try {
        const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        logs = logData.log || [];
    } catch { }

    res.json({ log: logs, nft_holder: holder });
});

app.get('/citang/all', (req, res) => {
    const citangDir = path.join(__dirname, 'nft', 'introduce', 'citang');
    const results = [];

    function walkSync(currentDirPath) {
        fs.readdirSync(currentDirPath).forEach(name => {
            const filePath = path.join(currentDirPath, name);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                walkSync(filePath);
            } else if (name === 'citang.json') {
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    const surname = path.basename(path.dirname(path.dirname(filePath))).split('_')[0];
                    results.push({ ...data, surname });
                } catch (e) {
                    console.error(`解析失败: ${filePath}`, e);
                }
            }
        });
    }

    try {
        walkSync(citangDir);
        res.json(results);
    } catch (error) {
        sendError(res, 500, '祠堂数据加载失败', error.message);
    }
});

app.get('/citang/by-card/:card_number', (req, res) => {
    const { card_number } = req.params;
    const dataRoot = path.join(__dirname, 'nft', 'data');

    let surnameDir01;
    try {
        const dirs = fs.readdirSync(dataRoot);
        const found = dirs
            .map(d => {
                const m = d.match(/^(\d+)_(.+)$/);
                return m ? { dir: d, num: m[1] } : null;
            })
            .filter(Boolean)
            .find(item => item.num === card_number);

        surnameDir01 = found ? found.dir : null;

        if (!surnameDir01) {
            return sendError(res, 404, `未找到编号为 ${card_number} 的姓氏目录`);
        }
    } catch (e) {
        return sendError(res, 500, '读取姓氏目录失败', e.message);
    }

    const dataRoot01 = path.join(dataRoot, surnameDir01);

    if (!fs.existsSync(dataRoot01)) {
        return sendError(res, 404, `没有找到编号为${card_number}的姓氏目录`);
    }
    try {
        const citangFolders = fs.readdirSync(dataRoot01, { withFileTypes: true })
            .filter(de => de.isDirectory())
            .map(de => de.name);

        const results = citangFolders.map(folder => {
            const citangFilePath = path.join(dataRoot01, folder, 'citang.json');
            if (fs.existsSync(citangFilePath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(citangFilePath, 'utf-8'));
                    const citangMatch = folder.match(/^(\d+)_/);
                    return {
                        ...data,
                        card_number,
                        citang_number: data.citang_number || (citangMatch ? citangMatch[1] : folder.match(/^\d+/)?.[0])
                    };
                } catch (e) {
                    console.error(`解析祠堂文件失败: ${citangFilePath}`, e);
                    return null;
                }
            }
            return null;
        }).filter(Boolean);

        res.json(results);
    } catch (error) {
        sendError(res, 500, '祠堂数据加载失败', error.message);
    }
});

app.get('/api/citang/details', (req, res) => {
    const { card_number, citang_number, surname, name } = req.query;
    
    if (!card_number || !citang_number || !surname) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number, citang_number 和 surname 参数');
    }

    const filePath = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${name}`,
        'citang.json'
    );

    if (!fs.existsSync(filePath)) {
        return sendError(res, 404, '祠堂数据不存在', `路径: ${filePath}`);
    }

    try {
        const citangData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        citangData.card_number = card_number;
        citangData.citang_number = citang_number;
        citangData.surname = decodeURIComponent(surname);
        res.json(citangData);
    } catch (err) {
        console.error('文件解析失败:', err);
        sendError(res, 500, '祠堂数据解析失败', err.message);
    }
});

app.get('/api/citang/basic', (req, res) => {
    const { card_number, surname, citang_number, citangname } = req.query;
    if (!card_number || !surname || !citang_number || !citangname) {
        return sendError(res, 400, '缺少参数');
    }
    const file = path.join(__dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        'citang.json');
    if (!fs.existsSync(file)) return sendError(res, 404, 'citang.json 不存在');
    try { 
        const data = JSON.parse(fs.readFileSync(file, 'utf-8')); 
        res.json(data); 
    } catch (e) { 
        sendError(res, 500, '解析失败', e.message); 
    }
});

app.get('/api/citang/log', (req, res) => {
    const { card_number, surname, citang_number, citangname } = req.query;
    if (!card_number || !surname || !citang_number || !citangname) {
        return sendError(res, 400, '缺少参数');
    }
    const file = path.join(__dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        'citang_log.json');
    if (!fs.existsSync(file)) return res.json({ log: [], nft_holder: {} });
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        res.json({ log: data.log || [], nft_holder: data.nft_holder || {} });
    } catch (e) { 
        sendError(res, 500, '解析失败', e.message); 
    }
});

app.get('/citang-log/:card_number/:citang_number', (req, res) => {
    const { card_number, citang_number } = req.params;
    const surname = decodeURIComponent(req.query.surname || '');
    const citang_name = decodeURIComponent(req.query.name || '');

    if (!surname || !citang_name) {
        return sendError(res, 400, '缺少姓氏或祠堂名称参数');
    }

    const filePath = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citang_name}`,
        'citang.json'
    );

    if (!fs.existsSync(filePath)) {
        return sendError(res, 404, 'citang.json 不存在', `路径: ${filePath}`);
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json({ log: data.log || [], nft_holder: data.nft_holder || {} });
    } catch (e) {
        console.error('解析 citang.json 失败:', e);
        sendError(res, 500, '解析失败', e.message);
    }
});

app.get('/citang/:surname/:citang_number/members', (req, res) => {
    const { surname, citang_number } = req.params;
    const card_number = req.query.card_number;
    const citangname = req.query.citangname || '';
    const member_number = req.query.member_number;
    const member_name = req.query.member_name;

    if (!card_number) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
    }

    const memberRoot = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`
    );

    if (!fs.existsSync(memberRoot)) {
        return sendError(res, 404, '成员目录不存在', `路径: ${memberRoot}`);
    }

    const members = [];

    fs.readdirSync(memberRoot, { withFileTypes: true })
        .filter(de => de.isDirectory() && /^\d+_/.test(de.name))
        .forEach(de => {
            const dirPath = path.join(memberRoot, de.name);
            const jsonFile = path.join(dirPath, `${de.name}.json`);
            if (fs.existsSync(jsonFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
                    members.push(data);
                } catch (e) {
                    console.error(`解析失败: ${jsonFile}`, e);
                }
            }
        });

    if (member_number && member_name) {
        const found = members.find(m => m.number === member_number && m.name === member_name);
        if (!found) return sendError(res, 404, '未找到该成员');
        return res.json(found);
    }

    res.json(members);
});

app.get('/citang/:surname/:citang_number/members-for-tree', (req, res) => {
    const { surname, citang_number } = req.params;
    const card_number = req.query.card_number;
    const citangname = req.query.citangname || '';

    if (!card_number) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
    }

    const memberRoot = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`
    );

    if (!fs.existsSync(memberRoot)) {
        return sendError(res, 404, '成员目录不存在', `路径: ${memberRoot}`);
    }

    const members = [];

    fs.readdirSync(memberRoot, { withFileTypes: true })
        .filter(de => de.isDirectory() && /^\d+_/.test(de.name))
        .forEach(de => {
            const dirPath = path.join(memberRoot, de.name);
            const jsonFile = path.join(dirPath, `${de.name}.json`);
            if (fs.existsSync(jsonFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
                    members.push(data);
                } catch (e) {
                    console.error(`解析失败: ${jsonFile}`, e);
                }
            }
        });

    res.json(members);
});

// ================== 添加会堂API（带短链接） ==================
app.post('/citang/:surname/:card_number/citang', async (req, res) => {
    const { surname, card_number } = req.params;
    const data = req.body;
    const buyerWallet = data.buyer_wallet || "DCE005AE4E27D67BFBC6EBD31A53D24AAFF58A0E017D5075D1B3B5BB1BCD8A03";

    // 1. 先获取年级的hash
    const gradeDir = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`);
    const gradeContentFile = path.join(gradeDir, 'content.json');
    let gradeHash = '';
    
    try {
        if (fs.existsSync(gradeContentFile)) {
            const gradeData = JSON.parse(fs.readFileSync(gradeContentFile, 'utf-8'));
            gradeHash = gradeData.hash || gradeData.nft || '';
            console.log(`📚 获取年级hash: ${gradeHash.substring(0, 16)}...`);
        }
    } catch (error) {
        console.error('读取年级hash失败:', error);
    }
    
    if (!gradeHash) {
        gradeHash = '0000000000000000000000000000000000000000000000000000000000000000';
        console.warn('⚠️ 无法获取年级hash，使用默认值');
    }

    // 2. 计算班级hash
    const citangName = data.name;
    const combinedInput = gradeHash + citangName;
    const citangHash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();
    
    console.log(`🔗 班级Hash生成: 年级hash + 班级名`);
    console.log(`   年级hash: ${gradeHash.substring(0, 16)}...`);
    console.log(`   班级名称: ${citangName}`);
    console.log(`   生成hash: ${citangHash.substring(0, 16)}...`);

    const price = 1000;
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";

    // 3. 从用户扣款
    let transferResult;
    try {
        transferResult = await transferRC(buyerWallet, systemWallet, price);
        if (!transferResult.success) {
            const errorMsg = transferResult.error || transferResult.response?.error || '转账失败';
            if (errorMsg.includes('余额不足')) {
                return res.json({ success: false, error: `余额不足，添加会堂需要 ${price} 根币` });
            }
            return res.json({ success: false, error: `扣款失败: ${errorMsg}` });
        }
        console.log(`✅ 扣款成功: ${price} RC`);
    } catch (transferError) {
        console.error('❌ 扣款异常:', transferError);
        return res.json({ success: false, error: `扣款失败: ${transferError.message}` });
    }
    
    // 4. 创建班级目录和文件
    const dir = path.join(__dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${data.citang_number}_${data.name}`);
    ensureDir(dir);

    // 生成短链接
    let shortlink = '';
    let short_code = '';
    try {
        const shortlinkResult = await generateCitangShortlink(
            surname, 
            card_number, 
            data.citang_number, 
            data.name
        );
        shortlink = shortlinkResult.short_url;
        short_code = shortlinkResult.short_code;
        console.log(`🏛️ 班级短链接生成成功: ${shortlink}`);
    } catch (error) {
        console.error(`⚠️ 班级短链接生成失败: ${error.message}`);
    }

    // 5. 保存班级数据
    const citangFile = path.join(dir, 'citang.json');
    const citangData = {
        ...data,
        hash: citangHash,
        shortlink: shortlink,
        short_code: short_code,
        purchase_price: price
    };
    fs.writeFileSync(citangFile, JSON.stringify(citangData, null, 2));

    // 6. 创建交易日志 - 修复chain/next_chain逻辑
    const chain = citangHash.substring(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const seller = systemWallet;
    const buyer = buyerWallet;
    
    // 生成完整的64位验证码
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    
    // next_chain 应该是 verification_code 的前16位
    const next_chain = verification_code.substring(0, 16).toUpperCase();

    const initLog = {
        log: [{
            thread,
            time,
            price,
            seller,
            buyer,
            chain,
            next_chain,
            verification_code
        }],
        nft_holder: {
            wallet: buyerWallet,
            phone_number: "",
            email: "",
            other: "......"
        }
    };
    fs.writeFileSync(path.join(dir, 'citang_log.json'), JSON.stringify(initLog, null, 2));

    // 7. 保存到 bxd_ps.json
    const itemsToSave = [
        { type: 'citang', code: citangHash },
        { type: 'purchase', code: verification_code }
    ];
    batchSaveToBxdPsSimple(itemsToSave);
    console.log(`✅ 已保存记录到 bxd_ps.json`);

    // 8. 将NFT添加到用户钱包
    try {
        const nftName = `${surname}·${data.name}`;
        await addNFTWithActionType(buyerWallet, citangHash, nftName, price, 'add_citang');
        console.log(`✅ NFT已成功添加到用户钱包`);
    } catch (walletError) {
        console.error('❌ 调用钱包道添加NFT失败:', walletError);
    }

    res.status(201).json({ 
        success: true,
        message: '班级创建成功，已扣除1000根币',
        price: price,
        citang_hash: citangHash,
        verification_code: verification_code,
        shortlink: shortlink,
        short_code: short_code
    });
});

// ================== 添加成员API（带短链接） ==================

// server.js - 完全重写添加成员路由的日志处理部分

app.post('/citang/:surname/:citang_number/members', async (req, res) => {
    const surname = req.params.surname.toLowerCase();
    const citang_number = req.params.citang_number;
    const card_number = req.query.card_number;
    const citangname = req.query.citangname || '';

    if (!card_number) return sendError(res, 400, '缺少 card_number');

    const { member, log } = req.body;
    if (!member || !log) return sendError(res, 400, '参数格式错误，需要 member & log');

    // 获取买家钱包地址
    let buyerWallet = "DCE005AE4E27D67BFBC6EBD31A53D24AAFF58A0E017D5075D1B3B5BB1BCD8A03";
    if (log && log.log && log.log.length > 0) {
        const lastLog = log.log[log.log.length - 1];
        if (lastLog && lastLog.buyer) {
            buyerWallet = lastLog.buyer;
        }
    }

    if (!buyerWallet || buyerWallet.length !== 64) {
        return sendError(res, 400, '无效的钱包地址');
    }

    const price = 100;
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";

    // 获取班级 hash
    const citangDir = path.join(__dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`);
    const citangFile = path.join(citangDir, 'citang.json');
    
    let citangHash = '';
    try {
        if (fs.existsSync(citangFile)) {
            const citangData = JSON.parse(fs.readFileSync(citangFile, 'utf-8'));
            citangHash = citangData.hash || '';
            console.log(`📚 获取班级hash: ${citangHash.substring(0, 16)}...`);
        }
    } catch (error) {
        console.error('读取班级hash失败:', error);
    }
    
    if (!citangHash) {
        citangHash = '0000000000000000000000000000000000000000000000000000000000000000';
        console.warn('⚠️ 无法获取班级hash，使用默认值');
    }

    // 使用班级hash + 成员名 计算成员hash
    const memberName = member.name;
    const combinedInput = citangHash + memberName;
    const memberHash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();
    
    console.log(`🔗 成员Hash生成: 班级hash + 成员名`);
    console.log(`   班级hash: ${citangHash.substring(0, 16)}...`);
    console.log(`   成员名称: ${memberName}`);
    console.log(`   生成hash: ${memberHash.substring(0, 16)}...`);

    // 扣款流程
    let transferResult;
    try {
        transferResult = await transferRC(buyerWallet, systemWallet, price);
        if (!transferResult.success) {
            const errorMsg = transferResult.error || transferResult.response?.error || '转账失败';
            if (errorMsg.includes('余额不足')) {
                return res.json({ success: false, error: `余额不足，添加成员需要 ${price} 根币` });
            } else if (errorMsg.includes('钱包验证失败') || errorMsg.includes('钱包不存在')) {
                return res.json({ success: false, error: '钱包验证失败，请重新登录后再试' });
            } else {
                return res.json({ success: false, error: `扣款失败: ${errorMsg}` });
            }
        }
        console.log(`✅ 扣款成功: ${price} RC`);
    } catch (transferError) {
        console.error('❌ 扣款异常:', transferError);
        return res.json({ success: false, error: `扣款失败: ${transferError.message}` });
    }

    // 创建成员目录和文件
    const memberDir = path.join(__dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        `${member.number}_${member.name}`);
    ensureDir(memberDir);

    // 生成短链接
    let shortlink = '';
    let short_code = '';
    try {
        const shortlinkResult = await generateMemberShortlink(
            surname, card_number, citang_number, citangname,
            member.number, member.name
        );
        shortlink = shortlinkResult.shortlink;
        short_code = shortlinkResult.short_code;
        console.log(`👤 成员短链接生成成功: ${shortlink}`);
    } catch (error) {
        console.error(`⚠️ 成员短链接生成失败: ${error.message}`);
    }

    const memberWithShortlink = {
        ...member,
        hash: memberHash,
        shortlink: shortlink,
        short_code: short_code,
        purchase_price: price
    };

    const memberPath = path.join(memberDir, `${member.number}_${member.name}.json`);
    fs.writeFileSync(memberPath, JSON.stringify(memberWithShortlink, null, 2));

    // ========== 【关键修复】完全重写日志处理 - 忽略前端传来的错误值 ==========
    const frontendLogs = log.log || [];
    const finalLogs = [];
    let savedVerificationCodes = [];

    // 第一条日志：创建成员
    const firstChain = memberHash.substring(0, 16).toUpperCase();
    const firstThread = (frontendLogs.length > 0 && frontendLogs[0].thread) ? frontendLogs[0].thread : 1;
    const firstTime = getFormattedTime();
    const firstSeller = systemWallet;
    const firstBuyer = buyerWallet;
    const firstPrice = price;

    // 生成正确的验证码
    const firstVerificationCode = generateVerificationCode(firstThread, firstTime, firstPrice, firstSeller, firstBuyer, firstChain);
    const firstNextChain = firstVerificationCode.substring(0, 16).toUpperCase();

    finalLogs.push({
        thread: firstThread,
        time: firstTime,
        price: firstPrice,
        seller: firstSeller,
        buyer: firstBuyer,
        chain: firstChain,
        next_chain: firstNextChain,
        verification_code: firstVerificationCode
    });
    savedVerificationCodes.push(firstVerificationCode);

    console.log(`📝 第一条日志已生成:`);
    console.log(`   chain: ${firstChain}`);
    console.log(`   next_chain: ${firstNextChain}`);
    console.log(`   verification_code: ${firstVerificationCode.substring(0, 32)}...`);

    // 处理后续日志（如果有购买记录等）
    if (frontendLogs.length > 1) {
        let currentChain = firstNextChain;  // 下一条的 chain 应该是上一条的 next_chain
        
        for (let i = 1; i < frontendLogs.length; i++) {
            const entry = frontendLogs[i];
            const threadNum = entry.thread;
            const timeStr = entry.time || getFormattedTime();
            const sellerWallet = entry.seller || systemWallet;
            const buyerWalletEntry = entry.buyer || buyerWallet;
            const priceVal = entry.price || price;
            
            // 使用正确的 chain（继承自上一级的 next_chain）
            const verificationCode = generateVerificationCode(threadNum, timeStr, priceVal, sellerWallet, buyerWalletEntry, currentChain);
            const nextChainVal = verificationCode.substring(0, 16).toUpperCase();
            
            finalLogs.push({
                thread: threadNum,
                time: timeStr,
                price: priceVal,
                seller: sellerWallet,
                buyer: buyerWalletEntry,
                chain: currentChain,
                next_chain: nextChainVal,
                verification_code: verificationCode
            });
            
            savedVerificationCodes.push(verificationCode);
            
            console.log(`📝 第${i+1}条日志已生成:`);
            console.log(`   chain (继承): ${currentChain}`);
            console.log(`   next_chain: ${nextChainVal}`);
            
            currentChain = nextChainVal;  // 更新 chain 用于下一条
        }
    }

    // 保存修正后的日志
    const correctedLog = {
        log: finalLogs,
        nft_holder: {
            wallet: buyerWallet,
            phone_number: "",
            email: "",
            other: "......"
        }
    };

    const logPath = path.join(memberDir, `${member.number}_${member.name}_log.json`);
    fs.writeFileSync(logPath, JSON.stringify(correctedLog, null, 2));

    console.log(`👤 新成员NFT产生: ${surname}·${citangname}·${member.name}`);
    console.log(`   购买价格: ${price} RC`);
    console.log(`   短链接: ${shortlink}`);
    console.log(`   Hash: ${memberHash}`);
    console.log(`   共生成 ${finalLogs.length} 条日志记录`);

    // 保存到 bxd_ps.json
    const itemsToSave = [
        { type: 'member', code: memberHash },
        ...savedVerificationCodes.map(code => ({ type: 'purchase', code: code }))
    ];
    batchSaveToBxdPsSimple(itemsToSave);

    // 将成员NFT添加到用户钱包
    try {
        const nftName = `${surname}·${citangname}·${member.name}`;
        await addNFTWithActionType(buyerWallet, memberHash, nftName, price, 'add_member');
        console.log(`✅ 成员NFT已成功添加到用户钱包`);
    } catch (walletError) {
        console.error('❌ 调用钱包道添加成员NFT失败:', walletError);
    }

    res.status(201).json({ 
        success: true,
        message: '成员创建成功，已扣除100根币',
        price: price,
        hash: memberHash,
        ...member, 
        shortlink: shortlink,
        short_code: short_code,
        verification_codes: savedVerificationCodes 
    });
});


// ================== 成员详情路由 ==================
app.get('/api/member/:card_number/:surname/:citang_number/:citangname/:member_number/:membername', (req, res) => {
    const { card_number, surname, citang_number, citangname, member_number, membername } = req.params;
    const filePath = path.join(
        __dirname,
        'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        `${member_number}_${membername}`,
        `${member_number}_${membername}.json`
    );

    if (!fs.existsSync(filePath)) {
        return sendError(res, 404, '成员不存在', `路径: ${filePath}`);
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (e) {
        console.error('解析会员 JSON 失败:', e);
        sendError(res, 500, '成员数据解析失败', e.message);
    }
});

app.get('/citang-data/:card_number\\:surname/:citang_number\\:citangname/:member_number\\:membername/:jsonFile', (req, res) => {
    const filePath = path.join(
        __dirname,
        'nft', 'data',
        `${req.params.card_number}_${req.params.surname}`,
        `${req.params.citang_number}_${req.params.citangname}`,
        `${req.params.member_number}_${req.params.membername}`,
        req.params.jsonFile
    );

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '成员数据不存在', path: filePath });
    }

    try {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(json);
    } catch (e) {
        console.error('解析成员 JSON 失败:', e);
        res.status(500).json({ error: '成员数据解析失败', details: e.message });
    }
});

// ================== 内容上传系统路由 ==================
app.post('/citang/:surname/:citang_number/content/upload',
    upload.single('file'),
    async (req, res) => {
        try {
            const { surname, citang_number } = req.params;
            const card_number = req.query.card_number;
            const citangname = req.query.name || '';
            const type = req.body.type;

            if (!card_number) {
                return sendError(res, 400, '缺少必要参数', '需要提供 card_number');
            }
            if (!citangname) {
                return sendError(res, 400, '缺少必要参数', '需要提供会堂名称（name）');
            }
            if (!['text', 'image'].includes(type)) {
                return sendError(res, 400, '类型错误', 'type 只能是 text 或 image');
            }

            const targetDir = path.join(
                __dirname,
                'nft',
                'data',
                `${card_number}_${surname}`,
                `${citang_number}_${citangname}`,
                'contents'
            );
            ensureDir(targetDir);

            const timestamp = Date.now();
            const ext = type === 'image' ? path.extname(req.file.originalname) : '.txt';
            const fileName = `${timestamp}${ext}`;
            const filePath = path.join(targetDir, fileName);

            let result = { type, timestamp, path: '', content: '' };
            if (type === 'text') {
                const text = req.body.text || '';
                fs.writeFileSync(filePath, text, 'utf-8');
                result.content = text;
            } else {
                fs.renameSync(req.file.path, filePath);
            }

            result.path = `/citang-data/${card_number}_${surname}/${citang_number}_${citangname}/contents/${fileName}`;

            const metaPath = path.join(targetDir, 'meta.json');
            let meta = [];
            if (fs.existsSync(metaPath)) {
                meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            }
            meta.push(result);
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

            res.json(result);
        } catch (err) {
            console.error('上传失败：', err);
            sendError(res, 500, '上传失败', err.message);
        }
    });

app.post('/citang/:surname/:citang_number/member/:member_number/upload',
    upload.single('file'),
    async (req, res) => {
        try {
            const surname = req.params.surname.toLowerCase();
            const citang_number = req.params.citang_number;
            const member_number = req.params.member_number;
            const card_number = req.query.card_number;
            const citangname = req.query.citangname || '';
            const member_name = req.query.member_name || '';
            const type = req.body.type;

            if (!card_number) return sendError(res, 400, '缺少 card_number');
            if (!type) return sendError(res, 400, '缺少 type 字段');

            const targetDir = path.join(
                __dirname,
                'nft', 'data',
                `${card_number}_${surname}`,
                `${citang_number}_${citangname}`,
                `${member_number}_${member_name}`,
                'info'
            );
            ensureDir(targetDir);

            const timestamp = Date.now();
            const result = { type, timestamp, path: '', content: '', filename: '' };

            if (type === 'text') {
                const text = req.body.text || '';
                const fileName = `${timestamp}.txt`;
                const filePath = path.join(targetDir, fileName);
                fs.writeFileSync(filePath, text, 'utf-8');
                result.content = text;
                result.path = `/citang-data/${card_number}_${surname}/${citang_number}_${citangname}/${member_number}_${member_name}/info/${fileName}`;
                result.filename = fileName;
            } else if (type === 'image') {
                if (!req.file) return sendError(res, 400, '未上传文件');
                const ext = path.extname(req.file.originalname) || '.jpg';
                const fileName = `${timestamp}${ext}`;
                const filePath = path.join(targetDir, fileName);
                fs.renameSync(req.file.path, filePath);
                result.path = `/citang-data/${card_number}_${surname}/${citang_number}_${citangname}/${member_number}_${member_name}/info/${fileName}`;
                result.filename = req.file.originalname;
            } else if (type === 'pdf' || type === 'word' || type === 'file') {
                if (!req.file) return sendError(res, 400, '未上传文件');
                
                let fileType = type;
                if (req.file.mimetype === 'application/pdf') {
                    fileType = 'pdf';
                } else if (req.file.mimetype === 'application/msword' || 
                           req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    fileType = 'word';
                } else if (req.file.mimetype === 'text/plain') {
                    fileType = 'text';
                }
                
                const safeFileName = `${timestamp}_${req.file.originalname.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.-]/g, '_')}`;
                const filePath = path.join(targetDir, safeFileName);
                fs.renameSync(req.file.path, filePath);
                
                result.type = fileType;
                result.path = `/citang-data/${card_number}_${surname}/${citang_number}_${citangname}/${member_number}_${member_name}/info/${safeFileName}`;
                result.filename = req.file.originalname;
                result.originalType = req.file.mimetype;
                result.fileSize = req.file.size;
            } else {
                return sendError(res, 400, 'type 只能是 text、image、pdf、word 或 file');
            }

            const metaFile = path.join(targetDir, 'meta.json');
            let meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile)) : [];
            meta.push(result);
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

            res.json(result);
        } catch (error) {
            console.error('上传处理失败:', error);
            sendError(res, 500, '上传失败', error.message);
        }
    });

app.delete('/citang/:surname/:citang_number/content/:timestamp', (req, res) => {
    const { surname, citang_number, timestamp } = req.params;
    const card_number = req.query.card_number;
    const citangname = req.query.name;

    if (!card_number || !citangname) {
        return sendError(res, 400, '缺少 card_number 或 name 参数');
    }

    const ret = deleteCitangContent(card_number, surname, citang_number, citangname, timestamp);
    if (!ret.ok) return sendError(res, 404, ret.msg);

    res.json({ message: '删除成功' });
});

app.delete('/citang/:surname/:citang_number/member/:member_number/uploads/:timestamp', (req, res) => {
    const { surname, citang_number, member_number, timestamp } = req.params;
    const card_number = req.query.card_number;
    const citangname = decodeURIComponent(req.query.citangname || '');
    const member_name = decodeURIComponent(req.query.member_name || '');

    if (!card_number || !citangname || !member_name) {
        return sendError(res, 400, '缺少必要参数');
    }

    const infoDir = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        `${member_number}_${member_name}`,
        'info'
    );

    const metaPath = path.join(infoDir, 'meta.json');

    if (!fs.existsSync(metaPath)) {
        return sendError(res, 404, 'meta.json 不存在');
    }

    try {
        let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const index = meta.findIndex(item => String(item.timestamp) === String(timestamp));

        if (index === -1) {
            return sendError(res, 404, '未找到该时间戳的记录');
        }

        const item = meta[index];

        if (item.path) {
            const fileName = path.basename(item.path.split('?')[0]);
            const filePath = path.join(infoDir, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        meta.splice(index, 1);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        res.json({ message: '删除成功' });
    } catch (e) {
        console.error('删除成员内容失败:', e);
        sendError(res, 500, '删除失败', e.message);
    }
});

function deleteCitangContent(card_number, surname, citang_number, citangname, timestamp) {
    const targetDir = path.join(
        __dirname,
        'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`,
        'contents'
    );
    const metaPath = path.join(targetDir, 'meta.json');

    if (!fs.existsSync(metaPath)) return { ok: false, msg: '记录不存在' };

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const idx = meta.findIndex(it => String(it.timestamp) === String(timestamp));
    if (idx === -1) return { ok: false, msg: '时间戳不匹配' };

    const item = meta[idx];

    if (item.path) {
        const fileName = path.basename(item.path.split('?')[0]);
        const filePath = path.join(targetDir, fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    meta.splice(idx, 1);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return { ok: true };
}

app.get('/citang/:surname/:citang_number/content', (req, res) => {
    try {
        let { surname, citang_number } = req.params;
        const card_number = req.query.card_number;
        const citangname = req.query.name;

        if (!card_number) {
            return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
        }

        const metaPath = path.join(
            __dirname,
            'nft',
            'data',
            `${card_number}_${surname}`,
            `${citang_number}_${citangname}`,
            'contents',
            'meta.json'
        );

        if (!fs.existsSync(metaPath)) return res.json([]);

        const list = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        res.json(list);
    } catch (err) {
        console.error(err);
        sendError(res, 500, '读取失败', err.message);
    }
});

app.get('/citang/:surname/:citang_number/member/:member_number/uploads', (req, res) => {
    const { surname, citang_number, member_number } = req.params;
    const card_number = req.query.card_number;

    if (!card_number) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
    }

    const memberDir = path.join(
        __dirname,
        'nft',
        'data',
        `${card_number}_${surname}`,
        `${citang_number}_${req.query.citangname || ''}`,
        `${member_number}_${req.query.member_name || ''}`,
        'info'
    );

    const metaFilePath = path.join(memberDir, 'meta.json');

    if (!fs.existsSync(metaFilePath)) {
        return res.json([]);
    }

    try {
        const metaData = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
        res.json(metaData);
    } catch (error) {
        console.error('读取元数据失败:', error);
        sendError(res, 500, '读取上传内容失败', error.message);
    }
});

app.post('/api/citang/save', (req, res) => {
    const { filePath, citangData, card_number, surname, citang_number, citang_name } = req.body;
    
    if (!filePath || !citangData) {
        return sendError(res, 400, '缺少必要参数');
    }
    
    try {
        const absolutePath = path.join(__dirname, filePath);
        
        if (!fs.existsSync(absolutePath)) {
            return sendError(res, 404, '会堂文件不存在');
        }
        
        const backupPath = absolutePath + '.backup_' + Date.now();
        fs.copyFileSync(absolutePath, backupPath);
        
        fs.writeFileSync(absolutePath, JSON.stringify(citangData, null, 2), 'utf-8');
        
        console.log(`✅ 会堂数据已更新: ${filePath}`);
        
        res.json({
            success: true,
            message: '会堂信息保存成功',
            filePath: filePath,
            backupPath: backupPath
        });
    } catch (error) {
        console.error('保存会堂失败:', error);
        sendError(res, 500, '保存会堂失败', error.message);
    }
});

app.post('/api/member/save', (req, res) => {
    const { filePath, memberData, card_number, surname, citang_number, citang_name, member_number, member_name } = req.body;
    
    if (!filePath || !memberData) {
        return sendError(res, 400, '缺少必要参数');
    }
    
    try {
        const absolutePath = path.join(__dirname, filePath);
        
        if (!fs.existsSync(absolutePath)) {
            return sendError(res, 404, '成员文件不存在');
        }
        
        const backupPath = absolutePath + '.backup_' + Date.now();
        fs.copyFileSync(absolutePath, backupPath);
        
        fs.writeFileSync(absolutePath, JSON.stringify(memberData, null, 2), 'utf-8');
        
        console.log(`✅ 成员数据已更新: ${filePath}`);
        
        res.json({
            success: true,
            message: '成员信息保存成功',
            filePath: filePath,
            backupPath: backupPath
        });
    } catch (error) {
        console.error('保存成员失败:', error);
        sendError(res, 500, '保存成员失败', error.message);
    }
});

app.patch('/citang/:surname/:citang_number/members/:member_number', (req, res) => {
    const surname = req.params.surname.toLowerCase();
    const citang_number = req.params.citang_number;
    const member_number = req.params.member_number;
    const card_number = req.query.card_number;
    const citangname = decodeURIComponent(req.query.citangname || '');

    if (!card_number || !citangname) {
        return sendError(res, 400, '缺少 card_number 或 citangname 参数');
    }

    const memberDir = path.join(
        __dirname, 'nft', 'data',
        `${card_number}_${surname}`,
        `${citang_number}_${citangname}`
    );
    if (!fs.existsSync(memberDir)) return sendError(res, 404, '成员目录不存在');

    const dirs = fs.readdirSync(memberDir)
        .filter(d => d.startsWith(member_number) && fs.statSync(path.join(memberDir, d)).isDirectory());

    if (!dirs.length) return sendError(res, 404, '未找到该成员目录');
    const targetDir = dirs[0];
    const memberName = targetDir.replace(member_number, '');
    const filePath = path.join(memberDir, targetDir, `${member_number}_${memberName}.json`);

    try {
        const original = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const patch = req.body;

        for (const [k, v] of Object.entries(patch)) {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                original[k] = { ...original[k], ...v };
            } else {
                original[k] = v;
            }
        }

        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(original, null, 2));
        fs.renameSync(tmpPath, filePath);

        res.json({ success: true, updated: original });
    } catch (e) {
        console.error('PATCH 成员失败:', e);
        sendError(res, 500, '更新失败', e.message);
    }
});

app.get('/citang/:surname/:citang_number/member/:member_number/family-tree', (req, res) => {
    const { surname, citang_number, member_number } = req.params;
    const card_number = req.query.card_number;

    if (!card_number) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
    }

    const memberDir = path.join(
        __dirname,
        'nft',
        'introduce',
        'baijx',
        card_number,
        citang_number
    );

    try {
        const files = fs.readdirSync(memberDir);
        const memberFiles = files.filter(file =>
            file.endsWith('.json') && /^\d+\.json$/.test(file)
        );

        const members = [];
        memberFiles.forEach(file => {
            try {
                const filePath = path.join(memberDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                members.push(data);
            } catch (e) {
                console.error(`文件解析失败: ${file}`, e);
            }
        });

        const rootMember = members.find(m => m.number === member_number);
        if (!rootMember) {
            return sendError(res, 404, '未找到指定的根成员');
        }

        function buildFamilyTree(rootMember, allMembers, maxGenerations = 5) {
            function createNode(member) {
                return {
                    id: member.number,
                    name: member.name,
                    gender: member.gender || '未知',
                    birth: member.birth || '未知',
                    spouse: member.family?.spouse || null,
                    children: [],
                    isRoot: member.number === rootMember.number
                };
            }

            function buildGenerations(parentNode, currentGen) {
                if (currentGen >= maxGenerations) return;

                const parentMember = allMembers.find(m => m.number === parentNode.id);
                if (!parentMember || !parentMember.family?.child) return;

                parentMember.family.child.forEach(childName => {
                    const childMember = allMembers.find(m => m.name === childName);
                    if (childMember) {
                        const childNode = createNode(childMember);
                        parentNode.children.push(childNode);
                        buildGenerations(childNode, currentGen + 1);
                    }
                });
            }

            const tree = createNode(rootMember);
            buildGenerations(tree, 1);
            return tree;
        }

        const familyTree = buildFamilyTree(rootMember, members, 5);
        res.json(familyTree);
    } catch (error) {
        console.error('构建家族树失败:', error);
        sendError(res, 500, '构建家族树失败', error.message);
    }
});

app.get('/introduce/baijx/:card_number/content.json', (req, res) => {
    const { card_number } = req.params;
    const dataPath = path.join(__dirname, 'nft', 'introduce', 'baijx', card_number, 'content.json');

    fs.readFile(dataPath, 'utf-8', (err, data) => {
        if (err) {
            const status = err.code === 'ENOENT' ? 404 : 500;
            const message = err.code === 'ENOENT' ? '姓氏不存在' : '服务器错误';
            return sendError(res, status, message, err.message);
        }

        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (parseError) {
            sendError(res, 500, '数据解析失败', parseError.message);
        }
    });
});

app.get('/citang/:surname/:citang_number/content/:filename', (req, res) => {
    let { surname, citang_number, filename } = req.params;
    surname = surname.toLowerCase();
    const card_number = req.query.card_number;

    if (!card_number) {
        return sendError(res, 400, '缺少必要参数', '需要提供 card_number 参数');
    }

    const filePath = path.join(
        __dirname,
        'nft',
        'introduce',
        'baijx',
        card_number,
        citang_number,
        'contents',
        filename
    );

    if (!fs.existsSync(filePath)) {
        return sendError(res, 404, '文件不存在', `路径: ${filePath}`);
    }

    res.sendFile(filePath);
});

// ================== 更新交易日志函数（修复chain/next_chain逻辑） ==================
async function updateTransactionLog(level, card_number, surname, citang_number, citang_name, member_number, member_name, price, seller, buyer) {
    try {
        let logFilePath = '';
        let dataFilePath = '';

        if (level === 'surname') {
            logFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'content_log.json');
            dataFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'content.json');
        } else if (level === 'citang') {
            logFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, `${citang_number}_${citang_name}`, 'citang_log.json');
            dataFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, `${citang_number}_${citang_name}`, 'citang.json');
        } else if (level === 'member') {
            logFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, `${citang_number}_${citang_name}`, `${member_number}_${member_name}`, `${member_number}_${member_name}_log.json`);
            dataFilePath = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, `${citang_number}_${citang_name}`, `${member_number}_${member_name}`, `${member_number}_${member_name}.json`);
        }

        if (!fs.existsSync(logFilePath)) {
            const initialLog = { log: [], nft_holder: {} };
            fs.writeFileSync(logFilePath, JSON.stringify(initialLog, null, 2));
        }

        const logData = JSON.parse(fs.readFileSync(logFilePath, 'utf-8'));
        
        // 新交易的 chain 应该是上一条的 next_chain
        let chain = "1234567890abcdef";
        let lastNextChain = null;
        
        if (logData.log.length > 0) {
            const lastLog = logData.log[logData.log.length - 1];
            chain = lastLog.next_chain;
            lastNextChain = lastLog.next_chain;
            console.log(`  继承上一条 next_chain: ${chain}`);
        } else {
            console.log(`  无历史记录，使用默认 chain: ${chain}`);
        }
        
        const thread = (logData.log.length > 0 ? Math.max(...logData.log.map(l => l.thread)) : 0) + 1;
        const time = getFormattedTime();
        
        // 生成完整的64位验证码
        const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
        
        // next_chain 应该是 verification_code 的前16位
        const next_chain = verification_code.substring(0, 16).toUpperCase();
        
        const newLog = {
            thread,
            time,
            price,
            seller,
            buyer,
            chain,
            next_chain,
            verification_code
        };

        logData.log.push(newLog);
        logData.nft_holder = { wallet: buyer, phone_number: "", email: "", other: "......" };
        fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

        if (fs.existsSync(dataFilePath)) {
            const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
            data.nft_holder = logData.nft_holder;
            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
        }

        console.log(`  交易日志更新: thread=${thread}`);
        console.log(`  chain (继承自上次next_chain): ${chain}`);
        console.log(`  next_chain (verification_code前16位): ${next_chain}`);
        if (lastNextChain) {
            console.log(`  验证: 上一条next_chain=${lastNextChain} == 当前chain=${chain} ${lastNextChain === chain ? '✅' : '❌'}`);
        }
        
        return { success: true, log: newLog };
    } catch (error) {
        console.error('更新交易日志失败:', error);
        return { success: false, error: error.message };
    }
}

// ================== NFT市场功能函数 ==================
async function getUserNFTs(wallet) {
    const nfts = [];
    const dataRoot = NFT_DATA_DIR;

    async function searchNFTs(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                await searchNFTs(fullPath);
            } else if (item.name.endsWith('_log.json')) {
                try {
                    const logData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                    const logs = logData.log || [];
                    if (logs.length > 0) {
                        const latestLog = logs.reduce((latest, current) => 
                            (current.thread > (latest?.thread || 0)) ? current : latest, {});
                        if (latestLog.buyer === wallet) {
                            const dirPath = path.dirname(fullPath);
                            let nftInfo = {
                                level: '', card_number: '', surname: '', citang_number: '', citang_name: '',
                                member_number: '', member_name: '', hash: latestLog.nft_hash || '',
                                current_owner: wallet, purchase_price: latestLog.price || 0
                            };
                            const pathParts = dirPath.split(path.sep);
                            const dataIndex = pathParts.indexOf('data');
                            if (dataIndex !== -1) {
                                const surnameDir = pathParts[dataIndex + 1];
                                const surnameMatch = surnameDir.match(/^(\d+)_(.+)$/);
                                if (surnameMatch) {
                                    nftInfo.card_number = surnameMatch[1];
                                    nftInfo.surname = surnameMatch[2];
                                    nftInfo.level = 'surname';
                                    if (pathParts.length > dataIndex + 2) {
                                        const citangDir = pathParts[dataIndex + 2];
                                        const citangMatch = citangDir.match(/^(\d+)_(.+)$/);
                                        if (citangMatch) {
                                            nftInfo.citang_number = citangMatch[1];
                                            nftInfo.citang_name = citangMatch[2];
                                            nftInfo.level = 'citang';
                                            if (pathParts.length > dataIndex + 3) {
                                                const memberDir = pathParts[dataIndex + 3];
                                                const memberMatch = memberDir.match(/^(\d+)_(.+)$/);
                                                if (memberMatch) {
                                                    nftInfo.member_number = memberMatch[1];
                                                    nftInfo.member_name = memberMatch[2];
                                                    nftInfo.level = 'member';
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            try {
                                const nftDetails = await getNFTDetailsForUser(nftInfo);
                                nftInfo = { ...nftInfo, ...nftDetails };
                            } catch (hashError) {
                                console.error(`获取NFT详情失败:`, nftInfo, hashError);
                            }
                            nfts.push(nftInfo);
                        }
                    }
                } catch (error) {
                    console.error(`解析日志文件失败: ${fullPath}`, error);
                }
            }
        }
    }
    await searchNFTs(dataRoot);
    return nfts;
}

async function getNFTDetailsForUser(nftInfo) {
    let filePath = '';
    let details = {};

    switch (nftInfo.level) {
        case 'surname':
            filePath = path.join(__dirname, 'nft', 'data', `${nftInfo.card_number}_${nftInfo.surname}`, 'content.json');
            break;
        case 'citang':
            filePath = path.join(__dirname, 'nft', 'data', `${nftInfo.card_number}_${nftInfo.surname}`, `${nftInfo.citang_number}_${nftInfo.citang_name}`, 'citang.json');
            break;
        case 'member':
            filePath = path.join(__dirname, 'nft', 'data', `${nftInfo.card_number}_${nftInfo.surname}`, `${nftInfo.citang_number}_${nftInfo.citang_name}`, `${nftInfo.member_number}_${nftInfo.member_name}`, `${nftInfo.member_number}_${nftInfo.member_name}.json`);
            break;
        default:
            return { hash: nftInfo.hash || '' };
    }

    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`文件不存在: ${filePath}`);
            return { hash: nftInfo.hash || '', file_exists: false };
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (nftInfo.level === 'surname') {
            details.hash = data.nft || data.hash || nftInfo.hash || '';
        } else {
            details.hash = data.hash || data.nft || nftInfo.hash || '';
        }
        if (nftInfo.level === 'citang') {
            details.province = data.province || '';
            details.district = data.district || '';
        } else if (nftInfo.level === 'member') {
            details.gender = data.gender || '';
            details.birth = data.birth || '';
        }
        details.file_exists = true;
        details.file_path = filePath;
    } catch (error) {
        console.error(`获取NFT数据失败 [${nftInfo.level}]:`, filePath, error);
        details.hash = nftInfo.hash || '';
        details.file_exists = false;
        details.error = error.message;
    }
    return details;
}

async function listNFTForSale(nftInfo) {
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    let marketData = [];
    if (fs.existsSync(marketFile)) {
        try {
            marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        } catch (error) {
            console.error('读取市场数据失败:', error);
        }
    }
    let nftHash = '';
    try {
        nftHash = await getRealNFTDataForMarket(nftInfo);
    } catch (error) {
        console.error('获取NFT hash码失败:', error);
        nftHash = nftInfo.hash || '';
    }
    const existingIndex = marketData.findIndex(item => 
        item.level === nftInfo.level &&
        item.card_number === nftInfo.card_number &&
        item.surname === nftInfo.surname &&
        item.citang_number === nftInfo.citang_number &&
        item.citang_name === nftInfo.citang_name &&
        item.member_number === nftInfo.member_number &&
        item.member_name === nftInfo.member_name
    );
    if (existingIndex !== -1) {
        marketData[existingIndex].price = nftInfo.price;
        marketData[existingIndex].seller = nftInfo.seller_wallet;
        marketData[existingIndex].list_time = new Date().toISOString();
        marketData[existingIndex].nft_hash = nftHash;
    } else {
        marketData.push({
            ...nftInfo,
            seller: nftInfo.seller_wallet,
            nft_hash: nftHash,
            list_time: new Date().toISOString()
        });
    }
    fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
    return {
        success: true,
        message: 'NFT上架成功',
        nft_hash: nftHash
    };
}

async function getRealNFTDataForMarket(nftInfo) {
    let url = '';
    switch (nftInfo.level) {
        case 'surname':
            url = `/citang-data/${nftInfo.card_number}_${nftInfo.surname}/content.json`;
            break;
        case 'citang':
            url = `/citang-data/${nftInfo.card_number}_${nftInfo.surname}/${nftInfo.citang_number}_${nftInfo.citang_name}/citang.json`;
            break;
        case 'member':
            url = `/citang-data/${nftInfo.card_number}_${nftInfo.surname}/${nftInfo.citang_number}_${nftInfo.citang_name}/${nftInfo.member_number}_${nftInfo.member_name}/${nftInfo.member_number}_${nftInfo.member_name}.json`;
            break;
        default:
            return nftInfo.hash || '';
    }
    try {
        const filePath = url.replace('/citang-data/', path.join(__dirname, 'nft', 'data') + '/');
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (nftInfo.level === 'surname') {
            return data.nft || data.hash || '';
        } else {
            return data.hash || data.nft || '';
        }
    } catch (error) {
        console.error(`获取NFT数据失败 [${nftInfo.level}]:`, url, error);
        throw error;
    }
}

async function getOnSaleNFTs() {
    const marketFile = path.join(NFT_DATA_DIR, 'market.json');
    if (!fs.existsSync(marketFile)) {
        return [];
    }
    try {
        const marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        return marketData;
    } catch (error) {
        console.error('读取在售NFT失败:', error);
        return [];
    }
}

function getNFTName(level, surname, citang_name, member_name) {
    switch (level) {
        case 'surname':
            return `${surname}`;
        case 'citang':
            return `${surname}·${citang_name}`;
        case 'member':
            return `${surname}·${citang_name}·${member_name}`;
        default:
            return 'NFT';
    }
}

// ================== 购买流程函数 ==================
async function purchaseNFTProcess(level, card_number, surname, citang_number, citang_name, 
                                 member_number, member_name, buyer_wallet, buyer_account, 
                                 price, sellerWallet, nftHash) {
    console.log(`🚦 开始执行购买流程: ${getNFTName(level, surname, citang_name, member_name)}`);
    console.log(`💰 价格: ${price} 根币`);
    console.log(`👤 买家: ${formatWalletShort(buyer_wallet)}`);
    console.log(`👤 卖家: ${formatWalletShort(sellerWallet)}`);
    
    let stepResults = {
        transfer1: null,
        transfer2: null,
        remove_nft: null,
        add_nft: null,
        transaction_log: null
    };
    
    let finalVerificationCode = null;
    
    try {
        // 第一步转账：买家转给系统
        console.log(`🔸 步骤1: 从买家转账 ${price} 根币到系统账户`);
        stepResults.transfer1 = await transferRC(buyer_wallet, "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", price);
        
        if (!stepResults.transfer1.success) {
            const errorMsg = stepResults.transfer1.error || stepResults.transfer1.response?.error || '未知错误';
            if (errorMsg.includes('余额不足')) {
                throw new Error(`余额不足，需要 ${price} 根币`);
            } else if (errorMsg.includes('钱包地址无效') || errorMsg.includes('钱包不存在')) {
                throw new Error(`钱包验证失败，请重新登录后再试`);
            } else {
                throw new Error(`转账失败: ${errorMsg}`);
            }
        }
        console.log('✅ 步骤1完成');

        // 第二步转账：系统转给卖家（扣除手续费）
        const sellerAmount = Math.floor(price * 0.9);
        console.log(`🔸 步骤2: 系统转账 ${sellerAmount} 根币给卖家`);
        stepResults.transfer2 = await transferRC("18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", sellerWallet, sellerAmount);
        
        if (!stepResults.transfer2.success) {
            console.log('❌ 步骤2失败，开始退款');
            try {
                await transferRC("18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", buyer_wallet, price);
                console.log('✅ 退款成功');
            } catch (refundError) {
                console.error('❌ 退款失败:', refundError);
            }
            throw new Error(`系统转账失败，已尝试退款`);
        }
        console.log('✅ 步骤2完成');

        // 第三步：从卖家移除NFT
        console.log('🔸 步骤3: 从卖家移除NFT');
        stepResults.remove_nft = await removeNFT(sellerWallet, nftHash);
        if (!stepResults.remove_nft.success) {
            console.log('❌ 步骤3失败，开始回滚');
            try {
                await transferRC("18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", buyer_wallet, price);
                await transferRC(sellerWallet, "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", sellerAmount);
                console.log('✅ 回滚成功');
            } catch (rollbackError) {
                console.error('❌ 回滚失败:', rollbackError);
            }
            throw new Error(`NFT转移失败，已退款`);
        }
        console.log('✅ 步骤3完成');

        // 第四步：给买家添加NFT
        console.log('🔸 步骤4: 给买家添加NFT');
        const nftName = getNFTName(level, surname, citang_name, member_name);
        stepResults.add_nft = await addNFT(buyer_wallet, nftHash, nftName, price);
        if (!stepResults.add_nft.success) {
            console.log('❌ 步骤4失败，开始完全回滚');
            try {
                await transferRC("18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", buyer_wallet, price);
                await transferRC(sellerWallet, "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E", sellerAmount);
                await addNFT(sellerWallet, nftHash, nftName, price);
                console.log('✅ 完全回滚成功');
            } catch (fullRollbackError) {
                console.error('❌ 完全回滚失败:', fullRollbackError);
            }
            throw new Error(`NFT添加失败，已退款并恢复`);
        }
        console.log('✅ 步骤4完成');

        // 第五步：更新交易日志
        console.log('🔸 步骤5: 更新交易日志');
        const transactionResult = await updateTransactionLog(
            level, card_number, surname, citang_number, citang_name,
            member_number, member_name, price, sellerWallet, buyer_wallet
        );
        
        if (transactionResult.success) {
            stepResults.transaction_log = transactionResult.log;
            finalVerificationCode = transactionResult.log.verification_code;
            console.log('✅ 交易日志更新成功');
            console.log(`  验证码: ${finalVerificationCode}`);
        } else {
            console.warn('⚠️ 交易日志更新失败:', transactionResult.error);
        }

        // 第六步：保存到 bxd_ps.json
        console.log('🔸 步骤6: 保存记录到 bxd_ps.json');
        if (transactionResult.success && transactionResult.log) {
            saveToBxdPsSimple('purchase', transactionResult.log.verification_code);
            console.log(`✅ 购买记录已保存到 bxd_ps.json`);
        } else {
            console.warn('⚠️ 交易日志无效，尝试保存基本信息到 bxd_ps.json');
            const fallbackVerificationCode = generateVerificationCode(
                Date.now(), getFormattedTime(), price, sellerWallet, buyer_wallet, 
                WALLET_CONFIG.currentChain
            );
            saveToBxdPsSimple('purchase', fallbackVerificationCode);
        }

        console.log(`🎉 购买流程全部完成!`);
        
        return {
            success: true,
            message: '购买成功',
            transaction: {
                price: price,
                seller: sellerWallet,
                buyer: buyer_wallet,
                seller_amount: sellerAmount,
                fee: price - sellerAmount,
                nft_hash: nftHash,
                nft_name: nftName,
                timestamp: new Date().toLocaleString('zh-CN'),
                chain: WALLET_CONFIG.currentChain,
                verification_code: finalVerificationCode
            },
            wallet_response: stepResults,
            steps: 6
        };
        
    } catch (error) {
        console.error('购买流程执行失败:', error);
        
        try {
            const errorVerificationCode = crypto.createHash('sha256')
                .update(`${Date.now()}_${nftHash}_${error.message}`)
                .digest('hex')
                .substring(0, 64)
                .toUpperCase();
            
            saveToBxdPsSimple('purchase', errorVerificationCode);
        } catch (saveError) {
            console.error('保存失败记录到 bxd_ps.json 时出错:', saveError);
        }
        
        throw new Error('购买处理失败: ' + error.message);
    }
}

// ================== NFT市场路由 ==================
app.get('/api/user/nfts', async (req, res) => {
    const wallet = req.query.wallet;
    if (!wallet) return sendError(res, 400, '缺少钱包地址');
    
    try {
        const userNFTs = await getUserNFTs(wallet);
        res.json(userNFTs);
    } catch (error) {
        sendError(res, 500, '获取用户NFT失败', error.message);
    }
});

app.post('/api/nft/list', async (req, res) => {
    const { level, card_number, surname, citang_number, citang_name, member_number, member_name, price, seller_wallet } = req.body;
    try {
        const result = await listNFTForSale({
            level, card_number, surname, citang_number, citang_name, 
            member_number, member_name, price, seller_wallet
        });
        res.json(result);
    } catch (error) {
        sendError(res, 500, '上架NFT失败', error.message);
    }
});

app.get('/api/nfts/onsale', async (req, res) => {
    try {
        const onSaleNFTs = await getOnSaleNFTs();
        res.json(onSaleNFTs);
    } catch (error) {
        sendError(res, 500, '获取在售NFT失败', error.message);
    }
});

app.post('/api/nft/buy', async (req, res) => {
    const { level, card_number, surname, citang_number, citang_name, member_number, member_name, buyer_wallet, buyer_account } = req.body;

    if (!level || !card_number || !surname || !buyer_wallet) {
        return res.json({ 
            success: false, 
            error: '缺少必要参数'
        });
    }
    
    const walletRegex = /^[A-F0-9]{64}$/i;
    if (!walletRegex.test(buyer_wallet)) {
        return res.json({ 
            success: false, 
            error: '无效的钱包地址格式'
        });
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
            item.level === level &&
            item.card_number === card_number &&
            item.surname === surname &&
            item.citang_number === citang_number &&
            item.citang_name === citang_name &&
            item.member_number === member_number &&
            item.member_name === member_name
        );

        if (nftIndex === -1) {
            return res.json({ success: false, error: 'NFT已被其他用户购买' });
        }

        const nftForSale = marketData[nftIndex];
        const price = nftForSale.price;
        const sellerWallet = nftForSale.seller;
        const nftHash = nftForSale.nft_hash;

        if (!sellerWallet || !walletRegex.test(sellerWallet)) {
            return res.json({ 
                success: false, 
                error: '卖家钱包地址无效'
            });
        }

        let purchaseResult;
        try {
            purchaseResult = await purchaseNFTProcess(
                level, card_number, surname, citang_number, citang_name,
                member_number, member_name, buyer_wallet, buyer_account,
                price, sellerWallet, nftHash
            );
        } catch (purchaseError) {
            console.error('购买流程异常:', purchaseError);
            
            let errorMessage = purchaseError.message;
            if (errorMessage.includes('余额不足')) {
                errorMessage = `余额不足，购买需要 ${price} 根币`;
            } else if (errorMessage.includes('钱包验证失败')) {
                errorMessage = '钱包验证失败，请重新登录后再试';
            } else if (errorMessage.includes('无效的钱包地址')) {
                errorMessage = '钱包地址无效，请重新登录';
            }
            
            return res.json({ 
                success: false, 
                error: errorMessage
            });
        }

        if (!purchaseResult.success) {
            return res.json(purchaseResult);
        }

        marketData.splice(nftIndex, 1);
        const tempFile = path.join(NFT_DATA_DIR, 'market_temp.json');
        fs.writeFileSync(tempFile, JSON.stringify(marketData, null, 2));
        fs.renameSync(tempFile, marketFile);

        res.json({
            success: true,
            message: '购买成功',
            currentChain: WALLET_CONFIG.currentChain,
            ...purchaseResult
        });

    } catch (error) {
        console.error('购买NFT失败:', error);
        res.json({ 
            success: false, 
            error: '购买处理失败: ' + error.message 
        });
    } finally {
        marketLock = false;
    }
});

app.post('/api/nft/cancel-sale', async (req, res) => {
    const { level, card_number, surname, citang_number, citang_name, member_number, member_name } = req.body;
    try {
        const marketFile = path.join(NFT_DATA_DIR, 'market.json');
        if (!fs.existsSync(marketFile)) {
            return res.json({ success: false, error: '市场数据不存在' });
        }
        let marketData = JSON.parse(fs.readFileSync(marketFile, 'utf-8'));
        const initialLength = marketData.length;
        marketData = marketData.filter(item => 
            !(item.level === level &&
              item.card_number === card_number &&
              item.surname === surname &&
              item.citang_number === citang_number &&
              item.citang_name === citang_name &&
              item.member_number === member_number &&
              item.member_name === member_name)
        );
        if (marketData.length === initialLength) {
            return res.json({ success: false, error: '未找到对应的在售NFT' });
        }
        fs.writeFileSync(marketFile, JSON.stringify(marketData, null, 2));
        res.json({ success: true, message: 'NFT已取消出售' });
    } catch (error) {
        sendError(res, 500, '取消出售失败', error.message);
    }
});

// ================== 队列管理API ==================
app.get('/api/operation-queue/status', (req, res) => {
    res.json({
        success: true,
        message: "⚠️ 排队系统已禁用，操作将立即执行",
        queueEnabled: false,
        currentChain: WALLET_CONFIG.currentChain,
        threadCounter: WALLET_CONFIG.threadCounter,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/operation-queue/clear', (req, res) => {
    res.json({
        success: false,
        error: "排队系统已禁用，无需清空队列",
        timestamp: new Date().toISOString()
    });
});

// ================== 钱包状态API ==================
app.post('/api/wallet-state/save', (req, res) => {
    try {
        const result = saveWalletState();
        if (result) {
            res.json({
                success: true,
                message: '钱包状态已手动保存',
                currentChain: WALLET_CONFIG.currentChain,
                threadCounter: WALLET_CONFIG.threadCounter
            });
        } else {
            res.json({ success: false, message: '保存失败' });
        }
    } catch (error) {
        sendError(res, 500, '保存状态失败', error.message);
    }
});

app.get('/api/wallet-state/status', (req, res) => {
    res.json({
        success: true,
        currentChain: WALLET_CONFIG.currentChain,
        threadCounter: WALLET_CONFIG.threadCounter,
        requestIndex: WALLET_CONFIG.requestIndex,
        lastOperationTime: WALLET_CONFIG.lastOperationTime,
        lastOperationTimeFormatted: WALLET_CONFIG.lastOperationTime ? new Date(WALLET_CONFIG.lastOperationTime).toLocaleString() : '无',
        persistenceFile: WALLET_STATE_FILE
    });
});

// ================== 姓氏数据更新路由 ==================
app.post('/api/surname/update/:card_number/:surname', async (req, res) => {
    const { card_number, surname } = req.params;
    const { field, value, wallet } = req.body;
    
    if (!field || !value || !wallet) {
        return sendError(res, 400, '缺少必要参数');
    }
    
    const allowedFields = ['source', 'distribution', 'history', 'modern'];
    if (!allowedFields.includes(field)) {
        return sendError(res, 400, '不允许更新的字段');
    }
    
    try {
        const userNFTs = await getUserNFTs(wallet);
        const ownsSurname = userNFTs.some(nft =>
            nft.level === 'surname' &&
            nft.card_number === card_number &&
            nft.surname === decodeURIComponent(surname)
        );
        
        if (!ownsSurname) {
            return res.json({
                success: false,
                error: '您未拥有该姓氏NFT，无法修改'
            });
        }
        
        const contentPath = path.join(__dirname, 'nft', 'data', `${card_number}_${decodeURIComponent(surname)}`, 'content.json');
        
        if (!fs.existsSync(contentPath)) {
            return sendError(res, 404, '姓氏数据不存在');
        }
        
        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
        content[field] = value;
        
        const backupPath = contentPath + '.backup_' + Date.now();
        fs.copyFileSync(contentPath, backupPath);
        
        fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf-8');
        
        console.log(`✅ 姓氏数据已更新: ${surname}, 字段: ${field}`);
        
        res.json({
            success: true,
            message: '姓氏数据更新成功',
            field: field,
            backup: backupPath
        });
        
    } catch (error) {
        console.error('更新姓氏数据失败:', error);
        sendError(res, 500, '更新姓氏数据失败', error.message);
    }
});

// ================== 成员内容管理路由 ==================
app.delete('/api/member/content/delete', (req, res) => {
    const { 
        card_number, surname, citang_number, citang_name, 
        member_number, member_name, filename 
    } = req.body;
    
    if (!card_number || !surname || !citang_number || !citang_name || !member_number || !member_name || !filename) {
        return sendError(res, 400, '缺少必要参数');
    }
    
    try {
        const filePath = path.join(
            __dirname,
            'nft', 'data',
            `${card_number}_${surname}`,
            `${citang_number}_${citang_name}`,
            `${member_number}_${member_name}`,
            'info',
            filename
        );
        
        const metaPath = path.join(
            __dirname,
            'nft', 'data',
            `${card_number}_${surname}`,
            `${citang_number}_${citang_name}`,
            `${member_number}_${member_name}`,
            'info',
            'meta.json'
        );
        
        if (!fs.existsSync(filePath)) {
            return sendError(res, 404, '文件不存在');
        }
        
        fs.unlinkSync(filePath);
        console.log(`🗑️ 已删除文件: ${filename}`);
        
        if (fs.existsSync(metaPath)) {
            let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            meta = meta.filter(item => {
                const itemFilename = path.basename(item.path.split('/').pop());
                return itemFilename !== filename;
            });
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            console.log(`📝 已更新meta.json`);
        }
        
        res.json({
            success: true,
            message: '文件删除成功'
        });
    } catch (error) {
        console.error('删除成员内容失败:', error);
        sendError(res, 500, '删除失败', error.message);
    }
});

app.post('/api/member/content/batch-delete', (req, res) => {
    const { 
        card_number, surname, citang_number, citang_name, 
        member_number, member_name, timestamps 
    } = req.body;
    
    if (!card_number || !surname || !citang_number || !citang_name || !member_number || !member_name || !timestamps || !Array.isArray(timestamps)) {
        return sendError(res, 400, '缺少必要参数或参数格式错误');
    }
    
    try {
        const infoDir = path.join(
            __dirname,
            'nft', 'data',
            `${card_number}_${surname}`,
            `${citang_number}_${citang_name}`,
            `${member_number}_${member_name}`,
            'info'
        );
        
        const metaPath = path.join(infoDir, 'meta.json');
        
        if (!fs.existsSync(metaPath)) {
            return sendError(res, 404, '元数据文件不存在');
        }
        
        let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const originalLength = meta.length;
        
        const itemsToDelete = meta.filter(item => timestamps.includes(String(item.timestamp)));
        
        itemsToDelete.forEach(item => {
            if (item.path) {
                const filename = path.basename(item.path.split('/').pop());
                const filePath = path.join(infoDir, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ 已删除文件: ${filename}`);
                }
            }
        });
        
        meta = meta.filter(item => !timestamps.includes(String(item.timestamp)));
        
        if (meta.length === originalLength) {
            return res.json({ success: false, message: '未找到要删除的内容' });
        }
        
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        
        res.json({
            success: true,
            message: `成功删除 ${itemsToDelete.length} 个内容`,
            deletedCount: itemsToDelete.length
        });
    } catch (error) {
        console.error('批量删除失败:', error);
        sendError(res, 500, '批量删除失败', error.message);
    }
});

//2026070903

// ================== 成员内容批量上传路由（修改版） ==================
app.post('/api/member/content/batch-upload', upload.array('files'), async (req, res) => {
    try {
        const { 
            card_number, surname, citang_number, citang_name, 
            member_number, member_name, contents 
        } = req.body;
        
        if (!card_number || !surname || !citang_number || !citang_name || !member_number || !member_name) {
            return sendError(res, 400, '缺少必要参数');
        }
        
        let contentItems = [];
        try {
            contentItems = JSON.parse(contents || '[]');
        } catch (e) {
            return sendError(res, 400, 'contents 参数格式错误');
        }
        
        const infoDir = path.join(
            __dirname,
            'nft', 'data',
            `${card_number}_${surname}`,
            `${citang_number}_${citang_name}`,
            `${member_number}_${member_name}`,
            'info'
        );
        
        ensureDir(infoDir);
        
        const metaPath = path.join(infoDir, 'meta.json');
        let meta = [];
        if (fs.existsSync(metaPath)) {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        }
        
        // 修复 multer 中文文件名编码问题
        function fixEncoding(str) {
            if (!str) return str;
            if (/[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/.test(str)) return str;
            try {
                const fixed = Buffer.from(str, 'latin1').toString('utf8');
                if (/[\u4e00-\u9fa5]/.test(fixed)) return fixed;
                return str;
            } catch (e) { return str; }
        }
        
        const results = [];
        const filesMap = {};
        const uploadedFiles = [];
        
        console.log(`📁 [batch-upload] 收到 ${req.files?.length || 0} 个文件:`);
        req.files?.forEach(file => {
            const originalName = file.originalname;
            const fixedName = fixEncoding(originalName);
            file._fixedName = fixedName;
            filesMap[fixedName] = file;
            filesMap[originalName] = file;
            uploadedFiles.push({ original: originalName, fixed: fixedName });
            console.log(`   - originalname: "${originalName}" → 修复: "${fixedName}"`);
        });
        
        function findFileInMap(targetFilename) {
            if (filesMap[targetFilename]) return filesMap[targetFilename];
            const fixed = fixEncoding(targetFilename);
            if (fixed !== targetFilename && filesMap[fixed]) return filesMap[fixed];
            const targetBase = path.basename(targetFilename);
            for (const f of uploadedFiles) {
                if (path.basename(f.fixed) === targetBase || path.basename(f.original) === targetBase) {
                    return filesMap[f.fixed] || filesMap[f.original];
                }
            }
            if (uploadedFiles.length === 1) return filesMap[uploadedFiles[0].fixed] || filesMap[uploadedFiles[0].original];
            return null;
        }
        
        for (const content of contentItems) {
            const { type, content: textContent, filename, timestamp } = content;
            const itemTimestamp = timestamp || Date.now();
            const displayFilename = filename || '';
            
            console.log(`   📝 处理: type="${type}", filename="${displayFilename}"`);
            
            if (type === 'text') {
                const fileName = `${itemTimestamp}.txt`;
                const filePath = path.join(infoDir, fileName);
                fs.writeFileSync(filePath, textContent || '', 'utf-8');
                const result = {
                    type: 'text', timestamp: itemTimestamp,
                    content: textContent, filename: fileName,
                    path: `/citang-data/${card_number}_${surname}/${citang_number}_${citang_name}/${member_number}_${member_name}/info/${fileName}`
                };
                meta.push(result);
                results.push(result);
                
            } else if (type === 'image' && filename) {
                const file = findFileInMap(filename);
                if (!file) { console.log(`   ⚠️ 跳过图片: 未找到文件`); continue; }
                const ext = path.extname(displayFilename) || '.jpg';
                const fileName = `${itemTimestamp}${ext}`;
                const filePath = path.join(infoDir, fileName);
                fs.renameSync(file.path, filePath);
                const result = {
                    type: 'image', timestamp: itemTimestamp,
                    filename: displayFilename,
                    path: `/citang-data/${card_number}_${surname}/${citang_number}_${citang_name}/${member_number}_${member_name}/info/${fileName}`
                };
                meta.push(result);
                results.push(result);
                
            } else if ((type === 'pdf' || type === 'word' || type === 'txt' || type === 'file') && filename) {
                const file = findFileInMap(filename);
                if (!file) { console.log(`   ⚠️ 跳过文件: 未找到文件`); continue; }
                
                const ext = path.extname(displayFilename);
                const baseName = path.basename(displayFilename, ext);
                
                // ===== 改进的文件名清理：保留中文、英文、数字、空格、连字符、下划线、括号、点 =====
                const safeBaseName = baseName
                    .replace(/[<>:"/\\|?*]/g, '_')  // 只移除Windows文件名非法字符
                    .replace(/\s+/g, ' ')            // 多个空格合并为一个
                    .trim();
                
                const finalBaseName = safeBaseName || 'file';
                const fileName = `${itemTimestamp}_${finalBaseName}${ext}`;
                const filePath = path.join(infoDir, fileName);
                
                fs.renameSync(file.path, filePath);
                
                let actualType = type;
                if (file.mimetype === 'application/pdf') actualType = 'pdf';
                else if (file.mimetype === 'application/msword' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') actualType = 'word';
                else if (file.mimetype === 'text/plain') actualType = 'text';
                
                const result = {
                    type: actualType, timestamp: itemTimestamp,
                    filename: displayFilename,
                    originalType: file.mimetype, fileSize: file.size,
                    path: `/citang-data/${card_number}_${surname}/${citang_number}_${citang_name}/${member_number}_${member_name}/info/${fileName}`
                };
                meta.push(result);
                results.push(result);
                console.log(`   ✅ 文件已保存: ${fileName}`);
            }
        }
        
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        
        // 保存内容顺序
        const { content_order } = req.body;
        if (content_order) {
            try {
                const orderArray = JSON.parse(content_order);
                if (Array.isArray(orderArray) && orderArray.length > 0) {
                    const orderPath = path.join(infoDir, 'order.json');
                    fs.writeFileSync(orderPath, JSON.stringify({ order: orderArray }, null, 2));
                    console.log(`   📋 顺序已保存: ${orderArray.length} 条`);
                }
            } catch (e) {
                console.warn('保存顺序失败:', e.message);
            }
        }
        
        res.json({
            success: true,
            message: '内容上传成功',
            uploaded: results.length,
            results: results
        });
    } catch (error) {
        console.error('批量上传失败:', error);
        sendError(res, 500, '批量上传失败', error.message);
    }
});




app.use('/citang-data', express.static(path.join(__dirname, 'nft', 'data'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.rtf': 'application/rtf',
            '.odt': 'application/vnd.oasis.opendocument.text'
        };
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// ================== 其他路由 ==================
app.get('/nft-cards', (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'nft', 'introduce', 'NFT_card.json');
        let cards = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        cards = cards.map(c => ({
            ...c,
            price: getLatestPrice(c.card_number) ?? c.price
        }));
        res.json(cards);
    } catch (error) {
        sendError(res, 500, 'NFT数据加载失败', error.message);
    }
});

app.get('/nft-card/:cardNumber', (req, res) => {
    const cardNum = req.params.cardNumber;
    const nftPath = path.join(__dirname, 'nft', 'data', 'NFT_card.json');
    try {
        const list = JSON.parse(fs.readFileSync(nftPath, 'utf-8'));
        const card = list.find(c => c.card_number == cardNum);
        if (!card) return res.status(404).json({ price: 0, nft: '' });
        const contentPath = path.join(__dirname, 'nft', 'data', `${cardNum}_${card.name}`, 'content.json');
        if (fs.existsSync(contentPath)) {
            const cont = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
            const log = (cont.log || []).sort((a, b) => (b.thread || 0) - (a.thread || 0));
            card.price = log.length ? log[0].price : card.price;
            card.nft = cont.nft || card.nft;
        }
        res.json(card);
    } catch (e) {
        console.error(e);
        res.status(500).json({ price: 0, nft: '' });
    }
});

function getLatestPrice(cardNumber) {
    try {
        const contentPath = path.join(__dirname, 'nft', 'introduce', 'baijx', String(cardNumber), 'content.json');
        if (!fs.existsSync(contentPath)) return null;
        const data = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
        if (!Array.isArray(data.log) || data.log.length === 0) return null;
        const latest = data.log.sort((a, b) => b.thread - a.thread)[0];
        return latest.price;
    } catch (e) {
        console.error(`读取 ${cardNumber} 的最新价格失败`, e);
        return null;
    }
}

// ================== 日志函数 ==================
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
        console.log(`📝 钱包道${type}已保存到 ${dateStr}_wallet.jsonl (chain: ${WALLET_CONFIG.currentChain})`);
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
                    console.log(`🗑️ 删除旧的日志文件: ${file}`);
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
                console.log(`📦 迁移旧日志文件到: ${dateStr}_wallet.jsonl`);
            }
        }
    } catch (error) {
        console.error('清理旧日志文件失败:', error);
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
    console.log(`🗑️ 日志清理已安排，将在 ${new Date(now.getTime() + timeUntilCleanup).toLocaleString()} 首次执行`);
}

// ================== 姓氏列表 API ==================
app.get('/api/surnames/list', (req, res) => {
    try {
        const dataRoot = path.join(__dirname, 'nft', 'data');
        
        if (!fs.existsSync(dataRoot)) {
            return res.json({ success: true, data: [], total: 0 });
        }
        
        const dirs = fs.readdirSync(dataRoot, { withFileTypes: true });
        const surnames = [];
        
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const match = dir.name.match(/^(\d+)_(.+)$/);
                if (match) {
                    const card_number = parseInt(match[1]);
                    const surnameFromDir = match[2];
                    
                    const contentPath = path.join(dataRoot, dir.name, 'content.json');
                    let nft = '';
                    let shortlink = '';
                    let price = 0;
                    let name = surnameFromDir;
                    
                    if (fs.existsSync(contentPath)) {
                        try {
                            const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                            nft = content.hash || '';
                            shortlink = content.shortlink || '';
                            if (content.name) {
                                name = content.name;
                            }
                            
                            const logPath = path.join(dataRoot, dir.name, 'content_log.json');
                            if (fs.existsSync(logPath)) {
                                const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
                                const logs = logData.log || [];
                                if (logs.length > 0) {
                                    const sortedLogs = logs.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                                    price = sortedLogs[0].price || 0;
                                }
                            }
                        } catch (e) {
                            console.error(`读取 ${contentPath} 失败:`, e);
                        }
                    }
                    
                    surnames.push({
                        card_number: card_number,
                        name: name,
                        nft: nft,
                        shortlink: shortlink,
                        price: price
                    });
                }
            }
        }
        
        surnames.sort((a, b) => a.card_number - b.card_number);
        
        console.log(`📋 姓氏列表 API: 返回 ${surnames.length} 个姓氏`);
        res.json({ success: true, data: surnames, total: surnames.length });
        
    } catch (error) {
        console.error('获取姓氏列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== 姓氏补充内容管理路由 ==================
app.get('/surname/:surname/:card_number/content', (req, res) => {
    const { surname, card_number } = req.params;
    
    const contentDir = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'contents');
    const metaPath = path.join(contentDir, 'meta.json');
    
    if (!fs.existsSync(metaPath)) {
        return res.status(404).json({ error: '暂无内容' });
    }
    
    try {
        const contents = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        res.json(contents);
    } catch (error) {
        console.error('读取姓氏内容失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/surname/:surname/:card_number/content/upload',
    upload.single('file'),
    async (req, res) => {
        try {
            const { surname, card_number } = req.params;
            const type = req.body.type;
            
            if (!['text', 'image'].includes(type)) {
                return res.status(400).json({ error: 'type 只能是 text 或 image' });
            }
            
            const contentDir = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'contents');
            ensureDir(contentDir);
            
            const timestamp = Date.now();
            let result = { type, timestamp, path: '', content: '' };
            
            if (type === 'text') {
                const text = req.body.text || '';
                const fileName = `${timestamp}.txt`;
                const filePath = path.join(contentDir, fileName);
                fs.writeFileSync(filePath, text, 'utf-8');
                result.content = text;
                result.path = `/surname-content/${card_number}_${surname}/contents/${fileName}`;
                console.log(`📝 姓氏文本内容已保存: ${surname}, 长度: ${text.length}`);
            } else {
                if (!req.file) {
                    return res.status(400).json({ error: '未上传文件' });
                }
                const ext = path.extname(req.file.originalname) || '.jpg';
                const fileName = `${timestamp}${ext}`;
                const filePath = path.join(contentDir, fileName);
                fs.renameSync(req.file.path, filePath);
                result.path = `/surname-content/${card_number}_${surname}/contents/${fileName}`;
                result.filename = req.file.originalname;
                console.log(`🖼️ 姓氏图片已保存: ${surname}, 文件: ${req.file.originalname}`);
            }
            
            const metaPath = path.join(contentDir, 'meta.json');
            let meta = [];
            if (fs.existsSync(metaPath)) {
                meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            }
            meta.push(result);
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            
            console.log(`✅ 姓氏补充内容已保存: ${surname}, 类型: ${type}`);
            res.json(result);
            
        } catch (error) {
            console.error('上传姓氏内容失败:', error);
            res.status(500).json({ error: error.message });
        }
    });

app.delete('/surname/:surname/:card_number/content/:timestamp', (req, res) => {
    const { surname, card_number, timestamp } = req.params;
    
    const contentDir = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'contents');
    const metaPath = path.join(contentDir, 'meta.json');
    
    if (!fs.existsSync(metaPath)) {
        return res.status(404).json({ error: '内容不存在' });
    }
    
    try {
        let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const index = meta.findIndex(item => String(item.timestamp) === String(timestamp));
        
        if (index === -1) {
            return res.status(404).json({ error: '未找到该内容' });
        }
        
        const item = meta[index];
        
        if (item.path) {
            const fileName = path.basename(item.path);
            const filePath = path.join(contentDir, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ 已删除姓氏内容文件: ${fileName}`);
            }
        }
        
        meta.splice(index, 1);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        
        console.log(`✅ 姓氏补充内容已删除: ${surname}, timestamp: ${timestamp}`);
        res.json({ success: true, message: '删除成功' });
        
    } catch (error) {
        console.error('删除姓氏内容失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/surname/:surname/:card_number/content/batch-upload',
    upload.array('files'),
    async (req, res) => {
        try {
            const { surname, card_number } = req.params;
            const contents = JSON.parse(req.body.contents || '[]');
            
            const contentDir = path.join(__dirname, 'nft', 'data', `${card_number}_${surname}`, 'contents');
            ensureDir(contentDir);
            
            const metaPath = path.join(contentDir, 'meta.json');
            let meta = [];
            if (fs.existsSync(metaPath)) {
                meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            }
            
            const results = [];
            const filesMap = {};
            req.files?.forEach(file => {
                filesMap[file.originalname] = file;
            });
            
            for (const content of contents) {
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
                        path: `/surname-content/${card_number}_${surname}/contents/${fileName}`
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
                        path: `/surname-content/${card_number}_${surname}/contents/${fileName}`
                    };
                    meta.push(result);
                    results.push(result);
                }
            }
            
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            
            res.json({
                success: true,
                message: '批量上传成功',
                uploaded: results.length,
                results: results
            });
            
        } catch (error) {
            console.error('批量上传姓氏内容失败:', error);
            res.status(500).json({ error: error.message });
        }
    });

// ================== 添加年级 API ==================
app.post('/api/grade/add', async (req, res) => {
    const { grade_name, price, buyer_wallet } = req.body;
    
    if (!grade_name || !price || !buyer_wallet) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
    }
    
    if (!buyer_wallet || buyer_wallet.length !== 64) {
        return res.status(400).json({ success: false, error: '无效的钱包地址' });
    }
    
    const peizhengPath = path.join(__dirname, 'nft', 'data', 'peizheng.json');
    let peizhengData = null;
    try {
        peizhengData = JSON.parse(fs.readFileSync(peizhengPath, 'utf-8'));
    } catch (error) {
        console.error('读取 peizheng.json 失败:', error);
        return res.status(500).json({ success: false, error: '读取港大道数据失败' });
    }
    
    const combinedInput = peizhengData.hash + grade_name;
    const grade_hash = crypto.createHash('sha256').update(combinedInput).digest('hex').toUpperCase();
    console.log(`📝 年级 Hash 计算: ${peizhengData.hash} + ${grade_name} = ${grade_hash}`);
    
    const dataRoot = path.join(__dirname, 'nft', 'data');
    let maxNumber = 0;
    if (fs.existsSync(dataRoot)) {
        const items = fs.readdirSync(dataRoot, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                const match = item.name.match(/^(\d+)_/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNumber && num !== 3) {
                        maxNumber = num;
                    }
                }
            }
        }
    }
    const grade_number = maxNumber + 1;
    
    const systemWallet = "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E";
    
    let transferResult;
    try {
        transferResult = await transferRC(buyer_wallet, systemWallet, price);
        if (!transferResult.success) {
            const errorMsg = transferResult.error || transferResult.response?.error || '转账失败';
            if (errorMsg.includes('余额不足')) {
                return res.json({ success: false, error: `余额不足，添加年级需要 ${price} 根币` });
            }
            return res.json({ success: false, error: `扣款失败: ${errorMsg}` });
        }
        console.log(`✅ 扣款成功: ${price} RC`);
    } catch (transferError) {
        console.error('❌ 扣款异常:', transferError);
        return res.json({ success: false, error: `扣款失败: ${transferError.message}` });
    }
    
    const grade_data = {
        name: grade_name,
        population: 0,
        hash: grade_hash,
        percent: 0.06785714285714285,
        source: [],
        distribution: [],
        history: [],
        modern: [],
        card_number: grade_number,
        nft_holder: {
            wallet: buyer_wallet,
            phone_number: "",
            email: "",
            other: "......"
        },
        shortlink: "",
        short_code: ""
    };
    
    const dir = path.join(__dirname, 'nft', 'data', `${grade_number}_${grade_name}`);
    ensureDir(dir);
    
    const contentFile = path.join(dir, 'content.json');
    fs.writeFileSync(contentFile, JSON.stringify(grade_data, null, 2));
    
    // 修复年级日志的chain/next_chain逻辑
    const chain = grade_hash.substring(0, 16).toUpperCase();
    const thread = 1;
    const time = getFormattedTime();
    const seller = systemWallet;
    const buyer = buyer_wallet;
    
    const verification_code = generateVerificationCode(thread, time, price, seller, buyer, chain);
    const next_chain = verification_code.substring(0, 16).toUpperCase();
    
    const log_data = {
        log: [{
            thread: thread,
            time: time,
            price: price,
            seller: seller,
            buyer: buyer,
            chain: chain,
            next_chain: next_chain,
            verification_code: verification_code
        }],
        nft_holder: {
            wallet: buyer_wallet,
            phone_number: "",
            email: "",
            other: "......"
        }
    };
    
    const logFile = path.join(dir, 'content_log.json');
    fs.writeFileSync(logFile, JSON.stringify(log_data, null, 2));
    
    console.log(`🏛️ 新年级NFT产生: ${grade_name}`);
    console.log(`   购买价格: ${price} RC`);
    console.log(`   年级编号: ${grade_number}`);
    console.log(`   Hash: ${grade_hash}`);
    console.log(`   chain: ${chain}`);
    console.log(`   next_chain: ${next_chain}`);
    
    const itemsToSave = [
        { type: 'citang', code: grade_hash },
        { type: 'purchase', code: verification_code }
    ];
    batchSaveToBxdPsSimple(itemsToSave);
    
    try {
        const nftName = `${grade_name}`;
        await addNFTWithActionType(buyer_wallet, grade_hash, nftName, price, 'add_citang');
        console.log(`✅ NFT已成功添加到用户钱包`);
    } catch (walletError) {
        console.error('❌ 调用钱包道添加NFT失败:', walletError);
    }
    
    res.status(201).json({ 
        success: true,
        message: '年级创建成功',
        price: price,
        grade_number: grade_number,
        grade_name: grade_name,
        grade_hash: grade_hash,
        verification_code: verification_code,
        chain: chain,
        next_chain: next_chain
    });
});

// ================== 启动服务器 ==================
initWalletState();
initWalletConnection();

ensureBxdPsFile();

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 港大道NFT交易系统已启动`);
    console.log(`========================================`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`网络访问: http://${IP}:${PORT}`);
    console.log(`========================================`);
    console.log(`💾 持久化状态文件: ${WALLET_STATE_FILE}`);
    console.log(`  当前链值: ${WALLET_CONFIG.currentChain}`);
    console.log(`  线程计数器: ${WALLET_CONFIG.threadCounter}`);
    console.log(`========================================`);
    console.log(`📁 bxd_ps.json 文件: ${BXD_PS_FILE}`);
    console.log(`   - 极简纯数组格式：[{seq, hash/verification_code}]`);
    console.log(`   - 序号动态读取：每次保存时从文件获取最大seq+1`);
    console.log(`   - 会堂/成员：保存 hash`);
    console.log(`   - 购买交易：保存 verification_code`);
    console.log(`========================================`);
    console.log(`🔐 交易日志验证码功能已启用:`);
    console.log(`  - chain = 成员hash前16位 或 继承自上一条的next_chain`);
    console.log(`  - next_chain = verification_code前16位`);
    console.log(`  - verification_code = SHA256(thread, time, price, seller, buyer, chain)`);
    console.log(`========================================`);
    console.log(`🔗 短链接功能已启用:`);
    console.log(`  - 创建会堂时自动生成短链接`);
    console.log(`  - 添加成员时自动生成短链接`);
    console.log(`========================================`);
    console.log(`📁 目录结构: 下划线格式 {数字}_{名称}`);
    console.log(`========================================`);
    
    initWalletLogCleanup();
});

module.exports = app;