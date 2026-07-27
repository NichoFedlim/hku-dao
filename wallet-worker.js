// ================== 4. 新增 wallet-worker.js（与 server.js 同目录）======
const { parentPort, workerData } = require('worker_threads');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 钱包道连接
const ws = new WebSocket(`ws://localhost:${workerData.walletPort}`);
let connOK = false;
let globalChain = '1234567890abcdef';
let threadCounter = 1;
const pending = new Map(); // 等待响应

ws.on('open', () => (connOK = true));
ws.on('close', () => (connOK = false));
ws.on('message', (buf) => {
  const msg = JSON.parse(buf);
  const { thread } = msg;
  if (pending.has(thread)) {
    const { resolve } = pending.get(thread);
    pending.delete(thread);
    resolve(msg);
  }
});

function sendWallet(request) {
  return new Promise((resolve, reject) => {
    if (!connOK) return reject(new Error('wallet not connected'));
    const thread = threadCounter++;
    request.thread = thread;
    request.chain = globalChain;
    // 计算 next_chain（与 server.js 相同算法）
    const next_chain = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({ ...request, next_chain: undefined }))
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
    request.next_chain = next_chain;
    pending.set(thread, { resolve, reject });
    ws.send(JSON.stringify(request));
    globalChain = next_chain; // 链往后走
  });
}

// 日志追加（按日期）
function logWallet(dateStr, entry) {
  const file = path.join(__dirname, 'nft', 'data', `${dateStr}_wallet.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

// 主循环：依次处理任务
parentPort.on('message', async ({ taskId, type, payload }) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    if (type === 'login') {
      const { account, password } = payload;
      const req = { dao_id: '2_0', type: 'log_in', name: account, phone: password };
      const res = await sendWallet(req);
      logWallet(dateStr, { time: new Date().toISOString(), type: 'login', request: req, response: res });
      parentPort.postMessage({ taskId, success: true, data: { wallet: res.status, name: account } });
    } else if (type === 'purchase') {
      // 这里直接调用 server.js 里已有的 purchaseNFTProcess 逻辑
      // 为简化，把 4 步写在下面；也可 require 原函数
      const { buyer_wallet, price, seller, nft_hash, level, card_number, surname, citang_number, citang_name, member_number, member_name } = payload;
      // 1. 买家→系统
      await sendWallet({ dao_id: '2_0', type: 'transfer_rc', from: buyer_wallet, to: '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E', rc: price });
      // 2. 系统→卖家（90%）
      const toSeller = Math.floor(price * 0.9);
      await sendWallet({ dao_id: '2_0', type: 'transfer_rc', from: '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E', to: seller, rc: toSeller });
      // 3. 移除 NFT
      await sendWallet({ dao_id: '2_0', type: 'nft_remove', from: seller, nft: nft_hash });
      // 4. 添加 NFT
      const nftName = `${surname}${citang_name ? '·' + citang_name : ''}${member_name ? '·' + member_name : ''}`;
      await sendWallet({ dao_id: '2_0', type: 'nft_add', to: buyer_wallet, holding: { nft: nft_hash, dao_id: '2_0', nft_name: nftName, value: price } });
      logWallet(dateStr, { time: new Date().toISOString(), type: 'purchase', payload, success: true });
      parentPort.postMessage({ taskId, success: true, data: { message: '购买成功' } });
    }
  } catch (e) {
    logWallet(dateStr, { time: new Date().toISOString(), type, payload, error: e.message });
    parentPort.postMessage({ taskId, success: false, data: e.message });
  }
});