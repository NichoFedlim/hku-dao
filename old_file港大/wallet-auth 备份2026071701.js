// wallet-auth.js - 培正道专用版本
// 用于培正道系统，通过 postMessage 与钱包道登录页面通信

const WALLET_CONFIG = {
    // 钱包道登录页面 URL（使用服务器IP或域名）
    loginUrl: 'https://hk.rbas.top/wallet_login.html',
    // loginUrl: 'http://192.168.2.2:5000/wallet_login.html',

    appId: 'peizheng',  // 培正道应用标识
    loginWindow: null,
    callbacks: {
        onSuccess: null,
        onCancel: null,
        onError: null
    }
};

// ========== 检查登录状态 ==========
function checkWalletLoginStatus() {
    try {
        const walletid = localStorage.getItem('peizheng_walletid');
        const walletName = localStorage.getItem('peizheng_wallet_name');
        const walletPhone = localStorage.getItem('peizheng_wallet_phone');
        const loginTime = localStorage.getItem('peizheng_wallet_login_time');
        
        if (!walletid) return null;
        
        // 检查是否过期（24小时）
        if (loginTime) {
            const elapsed = Date.now() - parseInt(loginTime);
            if (elapsed > 24 * 60 * 60 * 1000) {
                clearWalletLogin();
                return null;
            }
        }
        
        return {
            walletid: walletid,
            name: walletName,
            phone: walletPhone
        };
    } catch (e) {
        return null;
    }
}

function clearWalletLogin() {
    localStorage.removeItem('peizheng_walletid');
    localStorage.removeItem('peizheng_wallet_name');
    localStorage.removeItem('peizheng_wallet_phone');
    localStorage.removeItem('peizheng_wallet_login_time');
    // 同时清除旧格式的登录数据（兼容）
    localStorage.removeItem('peizheng_wallet');
    localStorage.removeItem('peizheng_name');
    localStorage.removeItem('peizheng_account');
    localStorage.removeItem('peizheng_phone');
}

function saveWalletLogin(walletid, name, phone) {
    localStorage.setItem('peizheng_walletid', walletid);
    localStorage.setItem('peizheng_wallet_name', name || '');
    localStorage.setItem('peizheng_wallet_phone', phone || '');
    localStorage.setItem('peizheng_wallet_login_time', Date.now().toString());
    // 同时保存旧格式（兼容现有代码）
    localStorage.setItem('peizheng_wallet', walletid);
    localStorage.setItem('peizheng_name', name || '');
    localStorage.setItem('peizheng_account', name || '');
    localStorage.setItem('peizheng_phone', phone || '');
}

// ========== 🔥 使用模态框打开钱包道登录（Chrome 兼容） ==========

// ========== 🔥 使用模态框打开钱包道登录（点击外部无效版） ==========
function openWalletLogin() {
    return new Promise((resolve, reject) => {
        WALLET_CONFIG.callbacks.onSuccess = resolve;
        WALLET_CONFIG.callbacks.onCancel = () => reject(new Error('用户取消登录'));
        WALLET_CONFIG.callbacks.onError = reject;

        // 检测是否为移动端
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                         || window.innerWidth < 768;

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'wallet-login-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: ${isMobile ? 'flex-start' : 'center'};
            animation: walletFadeIn 0.3s ease;
            padding: ${isMobile ? '10px 10px 0 10px' : '20px'};
            overflow-y: auto;
        `;

        // 创建模态框
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: ${isMobile ? '12px 12px 0 0' : '16px'};
            overflow: hidden;
            width: ${isMobile ? '100%' : '460px'};
            max-width: 100%;
            max-height: ${isMobile ? '92vh' : '90vh'};
            box-shadow: 0 ${isMobile ? '-4px' : '20px'} 60px rgba(0, 0, 0, 0.3);
            animation: ${isMobile ? 'walletSlideUpMobile' : 'walletSlideUp'} 0.3s ease;
            position: relative;
            margin-top: ${isMobile ? '10px' : '0'};
            display: flex;
            flex-direction: column;
            ${!isMobile ? 'height: auto; min-height: 400px;' : ''}
        `;

        // 顶部拖拽手柄（移动端提示）
        if (isMobile) {
            const handle = document.createElement('div');
            handle.style.cssText = `
                width: 40px;
                height: 4px;
                background: #ddd;
                border-radius: 2px;
                margin: 8px auto 4px auto;
                flex-shrink: 0;
                pointer-events: none;
            `;
            modal.appendChild(handle);
        }

        // ========== 🔥 关闭按钮（增强可见性） ==========
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: ${isMobile ? '14px' : '12px'};
            right: ${isMobile ? '14px' : '12px'};
            background: rgba(255, 255, 255, 0.92);
            border: 2px solid rgba(0, 0, 0, 0.12);
            border-radius: 50%;
            width: ${isMobile ? '40px' : '36px'};
            height: ${isMobile ? '40px' : '36px'};
            font-size: ${isMobile ? '22px' : '20px'};
            font-weight: bold;
            cursor: pointer;
            z-index: 10;
            color: #333;
            transition: all 0.25s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
            line-height: 1;
            padding: 0;
            user-select: none;
        `;

        // 鼠标悬停效果
        closeBtn.onmouseover = () => {
            closeBtn.style.background = '#f44336';
            closeBtn.style.color = 'white';
            closeBtn.style.borderColor = '#f44336';
            closeBtn.style.transform = 'scale(1.12)';
            closeBtn.style.boxShadow = '0 4px 20px rgba(244, 67, 54, 0.45)';
        };

        closeBtn.onmouseout = () => {
            closeBtn.style.background = 'rgba(255, 255, 255, 0.92)';
            closeBtn.style.color = '#333';
            closeBtn.style.borderColor = 'rgba(0, 0, 0, 0.12)';
            closeBtn.style.transform = 'scale(1)';
            closeBtn.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.15)';
        };

        // 触摸设备按下效果
        closeBtn.ontouchstart = () => {
            closeBtn.style.background = '#f44336';
            closeBtn.style.color = 'white';
            closeBtn.style.transform = 'scale(0.92)';
        };

        closeBtn.ontouchend = () => {
            closeBtn.style.background = 'rgba(255, 255, 255, 0.92)';
            closeBtn.style.color = '#333';
            closeBtn.style.transform = 'scale(1)';
        };

        closeBtn.onclick = (e) => {
            e.stopPropagation();
            cleanupAndClose();
            if (WALLET_CONFIG.callbacks.onCancel) {
                WALLET_CONFIG.callbacks.onCancel();
            }
        };

        // 创建 iframe 容器
        const iframeWrapper = document.createElement('div');
        iframeWrapper.style.cssText = `
            flex: 1;
            overflow: hidden;
            position: relative;
            ${!isMobile ? 'height: auto; min-height: 400px;' : ''}
        `;

        // 创建 iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'wallet-login-iframe';
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: white;
            display: block;
            ${!isMobile ? 'min-height: 420px;' : ''}
        `;

        // 构建登录 URL
        const currentUrl = window.location.href;
        const loginUrl = new URL(WALLET_CONFIG.loginUrl);
        loginUrl.searchParams.set('app_id', WALLET_CONFIG.appId);
        loginUrl.searchParams.set('redirect_uri', currentUrl);
        loginUrl.searchParams.set('mode', 'iframe');

        iframe.src = loginUrl.toString();

        // 组装模态框
        iframeWrapper.appendChild(iframe);
        modal.appendChild(closeBtn);
        modal.appendChild(iframeWrapper);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 添加动画样式
        const styleId = 'wallet-login-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes walletFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes walletSlideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes walletSlideUpMobile {
                    from { transform: translateY(40px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .wallet-login-no-scroll {
                    overflow: hidden !important;
                    position: fixed !important;
                    width: 100% !important;
                }
                /* 🔥 遮罩层不响应点击关闭 */
                #wallet-login-overlay {
                    pointer-events: none !important;
                }
                /* 🔥 模态框本身响应点击 */
                #wallet-login-overlay > div {
                    pointer-events: auto !important;
                }
            `;
            document.head.appendChild(style);
        }

        // 防止页面滚动
        document.body.classList.add('wallet-login-no-scroll');

        // 桌面端：监听 iframe 加载完成，自适应高度
        if (!isMobile) {
            iframe.addEventListener('load', function() {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc && iframeDoc.body) {
                        setTimeout(() => {
                            const contentHeight = iframeDoc.body.scrollHeight || iframeDoc.body.offsetHeight;
                            if (contentHeight > 0) {
                                const newHeight = Math.min(contentHeight + 20, window.innerHeight * 0.85);
                                iframe.style.height = newHeight + 'px';
                                iframeWrapper.style.height = newHeight + 'px';
                                modal.style.height = 'auto';
                            }
                        }, 300);
                    }
                } catch (e) {
                    iframe.style.height = 'auto';
                    iframe.style.minHeight = '420px';
                }
            });
        }

        // ========== 监听 postMessage ==========
        const messageHandler = (event) => {
            const allowedOrigins = [
                'http://localhost:5000',
                'http://127.0.0.1:5000',
                'http://192.168.2.2:5000',
                'https://hk.rbas.top',
                'https://dao002.rbas.top',
                'https://d3.p2.rbas.top',
                'https://d5.p2.rbas.top'
            ];
            
            if (!allowedOrigins.includes(event.origin)) {
                console.log('[Wallet Auth] 忽略来源:', event.origin);
                return;
            }

            const data = event.data;
            console.log('[Wallet Auth] 收到消息:', data);

            if (data.type === 'wallet_login_success') {
                const { walletid, name, phone, app_id } = data;
                saveWalletLogin(walletid, name, phone);
                cleanupAndClose();
                if (WALLET_CONFIG.callbacks.onSuccess) {
                    WALLET_CONFIG.callbacks.onSuccess({ walletid, name, phone, app_id });
                }
                window.dispatchEvent(new CustomEvent('wallet-login-success', {
                    detail: { walletid, name, phone, app_id }
                }));
            }
            
            if (data.type === 'wallet_login_cancel') {
                cleanupAndClose();
                if (WALLET_CONFIG.callbacks.onCancel) {
                    WALLET_CONFIG.callbacks.onCancel();
                }
            }
        };

        window.addEventListener('message', messageHandler);

        // ========== 清理函数 ==========
        const cleanupAndClose = () => {
            document.body.classList.remove('wallet-login-no-scroll');
            if (overlay.parentNode) {
                overlay.remove();
            }
            window.removeEventListener('message', messageHandler);
            // 🔥 移除 ESC 键监听
            // window.removeEventListener('keydown', escHandler);
            if (document.activeElement) {
                document.activeElement.blur();
            }
        };

        WALLET_CONFIG._cleanup = cleanupAndClose;

        // ========== 🔥 已移除 ESC 键关闭功能 ==========
        // 用户只能通过点击 ✕ 按钮关闭

        // ========== 🔥 已移除点击遮罩层关闭功能 ==========
        // overlay 已设置 pointer-events: none

        // ========== 移动端：键盘弹出时调整位置 ==========
        if (isMobile) {
            const handleResize = () => {
                const vh = window.innerHeight;
                const modalHeight = Math.min(vh * 0.92, vh - 20);
                modal.style.height = modalHeight + 'px';
                modal.style.maxHeight = modalHeight + 'px';
                
                setTimeout(() => {
                    const activeElement = document.activeElement;
                    if (activeElement && activeElement.tagName === 'INPUT') {
                        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 300);
            };

            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(handleResize, 100);
            });

            iframe.addEventListener('load', () => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        iframeDoc.addEventListener('focusin', (e) => {
                            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                                setTimeout(() => {
                                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 300);
                            }
                        });
                    }
                } catch (e) {
                    // 跨域限制，忽略
                }
            });

            const originalCleanup = cleanupAndClose;
            const newCleanup = () => {
                window.removeEventListener('resize', handleResize);
                originalCleanup();
            };
            WALLET_CONFIG._cleanup = newCleanup;
        }

        // ========== 加载完成后聚焦 ==========
        iframe.addEventListener('load', () => {
            setTimeout(() => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        const firstInput = iframeDoc.querySelector('input:not([type="hidden"])');
                        if (firstInput) {
                            firstInput.focus();
                        }
                    }
                } catch (e) {
                    // 跨域限制，忽略
                }
            }, 500);
        });
    });
}

// ========== 监听 postMessage 事件（保留，用于兼容） ==========
function initWalletAuthListener() {
    // 这个函数现在由 openWalletLogin 内部的 messageHandler 处理
    // 保留空函数以防外部调用报错
    console.log('[Wallet Auth] 使用模态框模式，postMessage 由内部处理');
}

// ========== 检查URL回调参数 ==========
function checkLoginCallback() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const walletid = urlParams.get('walletid');
        const loginSuccess = urlParams.get('login_success');
        
        if (loginSuccess === 'true' && walletid && walletid.length === 64) {
            // 清理URL参数
            const cleanUrl = window.location.pathname + 
                window.location.search
                    .replace(/[?&]walletid=[^&]*/, '')
                    .replace(/[?&]login_success=[^&]*/, '')
                    .replace(/^[?&]/, '?')
                    .replace(/[?&]$/, '');
            window.history.replaceState({}, document.title, cleanUrl || window.location.pathname);
            
            saveWalletLogin(walletid, '', '');
            
            window.dispatchEvent(new CustomEvent('wallet-login-success', {
                detail: { walletid: walletid, fromCallback: true }
            }));
            
            return walletid;
        }
    } catch (e) {
        console.warn('[Wallet Auth] 检查URL回调失败:', e);
    }
    return null;
}

// ========== 验证NFT所有权 ==========
async function verifyWalletOwnership(walletid, nftInfo) {
    try {
        const response = await fetch('/api/verify-ownership', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletid: walletid,
                ...nftInfo
            })
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[Wallet Auth] 验证所有权失败:', error);
        return { success: false, error: error.message };
    }
}

// ========== 自动初始化 ==========
document.addEventListener('DOMContentLoaded', function() {
    // 不再需要监听 postMessage，由 openWalletLogin 内部处理
    checkLoginCallback();
});

// 导出（用于模块化）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkWalletLoginStatus,
        clearWalletLogin,
        openWalletLogin,
        verifyWalletOwnership,
        saveWalletLogin,
        WALLET_CONFIG
    };
}