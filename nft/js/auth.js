// ============================================================
// auth.js – Wallet authentication wrapper
// ============================================================

export function checkLoginStatus() {
    if (typeof checkWalletLoginStatus === 'function') {
        return checkWalletLoginStatus();
    }
    return null;
}

export function openWalletLogin() {
    if (typeof openWalletLogin === 'function') {
        return openWalletLogin();
    }
    return Promise.reject(new Error('wallet-auth not loaded'));
}

export function clearWalletSession() {
    if (typeof clearWalletLogin === 'function') {
        clearWalletLogin();
    }
}
