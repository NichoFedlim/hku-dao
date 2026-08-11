const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5010;

// 域名配置
const DOMAIN = 'dao002.rbas.top';  // 修改这里
const PROTOCOL = 'https';
const PATH_PREFIX = '/s';

app.use(express.json());

// 数据库初始化
const dbPath = path.join(__dirname, 'data', 'shortlinks.db');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS short_link (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_code TEXT,
        original_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_original_url ON short_link(original_url)`);

console.log('数据库初始化完成');

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function idToBase62(id) {
    if (id === 0) return BASE62[0];
    let result = [];
    while (id > 0) {
        result.push(BASE62[id % 62]);
        id = Math.floor(id / 62);
    }
    return result.reverse().join('');
}

function getOrCreateShortCode(originalUrl) {
    let row = db.prepare("SELECT short_code FROM short_link WHERE original_url = ?").get(originalUrl);
    if (row && row.short_code) {
        return row.short_code;
    }
    const info = db.prepare("INSERT INTO short_link (original_url) VALUES (?)").run(originalUrl);
    const shortCode = idToBase62(info.lastInsertRowid);
    db.prepare("UPDATE short_link SET short_code = ? WHERE id = ?").run(shortCode, info.lastInsertRowid);
    return shortCode;
}

// ==========================================
// 短链服务专用 API（使用 /shorten-api/ 前缀）
// ==========================================

// 生成短链 API
app.post('/shorten-api/shorten', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: '请提供 url 参数' });
    }
    
    try {
        const shortCode = getOrCreateShortCode(url);
        // 使用 dao002.rbas.top 域名和 /s/ 前缀
        const shortUrl = `${PROTOCOL}://${DOMAIN}${PATH_PREFIX}/${shortCode}`;
        
        console.log(`生成短链: ${url} -> ${shortUrl}`);
        
        res.json({ 
            success: true,
            short_url: shortUrl, 
            short_code: shortCode,
            original_url: url
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 查看所有短链 API
app.get('/shorten-api/links', (req, res) => {
    const rows = db.prepare("SELECT id, short_code, original_url, created_at FROM short_link WHERE short_code IS NOT NULL ORDER BY id DESC").all();
    res.json(rows);
});

// 短链跳转 - 使用 /s/:shortCode
app.get('/s/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    
    if (shortCode === 'api' || shortCode === 'favicon.ico') {
        return res.status(404).send('Not Found');
    }
    
    const row = db.prepare("SELECT original_url FROM short_link WHERE short_code = ?").get(shortCode);
    
    if (!row) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>短链接不存在</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; }
                    .error { color: red; }
                </style>
            </head>
            <body>
                <h2 class="error">❌ 短链接不存在</h2>
                <p>短码 "${shortCode}" 没有对应的链接</p>
                <a href="/admin">返回管理后台</a>
            </body>
            </html>
        `);
    }
    
    console.log(`跳转: /s/${shortCode} -> ${row.original_url}`);
    res.redirect(302, row.original_url);
});

// 管理后台（注意：HTML 中的 fetch 已改为 /shorten-api/ 前缀）
app.get('/admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>短链管理后台</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
                .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                h1 { color: #333; margin-bottom: 10px; }
                h2 { color: #555; margin: 20px 0 10px 0; font-size: 1.3em; }
                .subtitle { color: #666; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; transition: border-color 0.3s; }
                input:focus { outline: none; border-color: #667eea; }
                button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; transition: transform 0.2s; }
                button:hover { transform: translateY(-2px); }
                .result { margin-top: 20px; padding: 15px; background: #e8f5e9; border-radius: 8px; display: none; border-left: 4px solid #4caf50; }
                .result a { color: #4caf50; text-decoration: none; word-break: break-all; }
                .result a:hover { text-decoration: underline; }
                .link-item { padding: 12px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                .link-item:last-child { border-bottom: none; }
                .link-info { flex: 1; }
                .link-code { font-family: monospace; font-size: 14px; color: #667eea; font-weight: bold; }
                .link-url { color: #666; font-size: 12px; margin-top: 5px; word-break: break-all; }
                .link-date { color: #999; font-size: 11px; margin-top: 5px; }
                .error { color: #f44336; }
                .loading { text-align: center; padding: 20px; color: #666; }
                .badge { background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px; }
                .success { color: #4caf50; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔗 短链服务管理后台</h1>
                <div class="subtitle">将长链接转换为短链接，方便分享</div>
                
                <input type="text" id="urlInput" placeholder="输入长链接，例如：https://example.com/very/long/url" />
                <button onclick="generate()">✨ 生成短链接</button>
                
                <div id="result" class="result"></div>
                
                <h2>📋 已有短链列表</h2>
                <div id="links">
                    <div class="loading">加载中...</div>
                </div>
            </div>
            
            <script>
                async function generate() {
                    const url = document.getElementById('urlInput').value.trim();
                    if (!url) {
                        alert('请输入链接地址');
                        return;
                    }
                    
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        alert('请输入有效的HTTP/HTTPS链接');
                        return;
                    }
                    
                    const resultDiv = document.getElementById('result');
                    resultDiv.innerHTML = '<div class="loading">生成中...</div>';
                    resultDiv.style.display = 'block';
                    
                    try {
                        // 使用新的 API 路径前缀
                        const res = await fetch('/shorten-api/shorten', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url })
                        });
                        const data = await res.json();
                        
                        if (data.success) {
                            resultDiv.innerHTML = \`
                                <div class="success">
                                    ✅ 短链接生成成功！<br><br>
                                    📎 短链接: <a href="\${data.short_url}" target="_blank">\${data.short_url}</a><br>
                                    🔗 原始链接: \${data.original_url.substring(0, 100)}\${data.original_url.length > 100 ? '...' : ''}
                                </div>
                            \`;
                            document.getElementById('urlInput').value = '';
                            loadLinks();
                        } else {
                            resultDiv.innerHTML = '<div class="error">❌ 生成失败: ' + data.error + '</div>';
                        }
                    } catch (err) {
                        resultDiv.innerHTML = '<div class="error">❌ 请求失败: ' + err.message + '</div>';
                    }
                }
                
                async function loadLinks() {
                    try {
                        // 使用新的 API 路径前缀
                        const res = await fetch('/shorten-api/links');
                        const links = await res.json();
                        
                        if (links.length === 0) {
                            document.getElementById('links').innerHTML = '<div class="loading">暂无短链，创建一个吧！</div>';
                            return;
                        }
                        
                        document.getElementById('links').innerHTML = links.map(l => \`
                            <div class="link-item">
                                <div class="link-info">
                                    <div class="link-code">
                                        🔗 /s/\${l.short_code}
                                        <span class="badge">\${new Date(l.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div class="link-url">🎯 目标: \${l.original_url.substring(0, 80)}\${l.original_url.length > 80 ? '...' : ''}</div>
                                    <div class="link-date">📅 创建时间: \${new Date(l.created_at).toLocaleString()}</div>
                                </div>
                            </div>
                        \`).join('');
                    } catch (err) {
                        document.getElementById('links').innerHTML = '<div class="error">加载失败: ' + err.message + '</div>';
                    }
                }
                
                // 页面加载时获取链接列表
                loadLinks();
                
                // 支持回车键提交
                document.getElementById('urlInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        generate();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// 根路径重定向到管理后台
app.get('/', (req, res) => {
    res.redirect('/admin');
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ 短链服务已启动`);
    console.log(`   内部端口: ${PORT}`);
    console.log(`   管理后台: ${PROTOCOL}://${DOMAIN}/admin`);
    console.log(`   短链格式: ${PROTOCOL}://${DOMAIN}${PATH_PREFIX}/[短码]\n`);
    
    // 预置链接（可选）
    const urls = [
        "https://dao001.rbas.top/member_detail.html?surname=%E7%8E%8B&citang_number=1&member_number=4&card_number=1&citangname=%E4%B8%89%E6%A7%90%E5%A0%82&membername=%E7%8E%8B%E7%91%9E%E5%B9%B4",
        "https://dao001.rbas.top/member_detail.html?surname=%E7%8E%8B&citang_number=1&member_number=2&card_number=1&citangname=%E4%B8%89%E6%A7%90%E5%A0%82&membername=%E7%8E%8B%E7%A5%96%E8%8D%AB"
    ];
    
    console.log('预置链接:');
    urls.forEach(url => {
        try {
            const shortCode = getOrCreateShortCode(url);
            console.log(`   ✅ ${PROTOCOL}://${DOMAIN}${PATH_PREFIX}/${shortCode}`);
        } catch (err) {
            console.error(`   ❌ 加载失败: ${err.message}`);
        }
    });
    
    console.log('\n💡 提示: 访问 https://dao002.rbas.top/admin 管理短链\n');
});