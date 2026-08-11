// migrate_ownership.js - Transfer all NFT ownership to a new wallet
// Run with: node migrate_ownership.js

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const NFT_DATA_DIR = path.join(__dirname, 'nft', 'data');

// OLD wallet (system wallet)
const OLD_WALLET = '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E';

// NEW wallet (your real wallet - Nicholas F)
const NEW_WALLET = 'A5518B32F97FCF6BA2FFC9063325B05AA60D5FE121EBE7D760CD34874E9F7D63';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
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

function ensureBackup(filePath) {
    const backupPath = filePath + '.bak';
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
        console.log(`  📦 Backup created: ${path.basename(backupPath)}`);
    }
}

// ============================================================
// MAIN MIGRATION
// ============================================================
function migrateOwnership() {
    console.log('\n========================================');
    console.log('🔄 NFT Ownership Migration Tool');
    console.log('========================================');
    console.log(`📁 Data directory: ${NFT_DATA_DIR}`);
    console.log(`🔴 Old wallet: ${OLD_WALLET.substring(0, 16)}...`);
    console.log(`🟢 New wallet: ${NEW_WALLET.substring(0, 16)}...`);
    console.log('========================================\n');

    if (!fs.existsSync(NFT_DATA_DIR)) {
        console.error('❌ NFT data directory not found!');
        return;
    }

    let totalFilesUpdated = 0;
    let totalLogsUpdated = 0;
    let totalDataFilesUpdated = 0;

    // Walk through all category directories
    const dirs = fs.readdirSync(NFT_DATA_DIR, { withFileTypes: true });

    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const categoryMatch = dir.name.match(/^(\d+)_(.+)$/);
        if (!categoryMatch) continue;

        const categoryId = categoryMatch[1];
        const categoryName = categoryMatch[2];
        console.log(`\n📂 Processing category: ${categoryName} (ID: ${categoryId})`);

        const categoryPath = path.join(NFT_DATA_DIR, dir.name);

        // ---- 1. Category level ----
        // content.json
        const contentFile = path.join(categoryPath, 'content.json');
        if (fs.existsSync(contentFile)) {
            const data = JSON.parse(fs.readFileSync(contentFile, 'utf-8'));
            if (data.nft_holder && data.nft_holder.wallet === OLD_WALLET) {
                ensureBackup(contentFile);
                data.nft_holder.wallet = NEW_WALLET;
                fs.writeFileSync(contentFile, JSON.stringify(data, null, 2));
                console.log(`  ✅ Updated content.json (nft_holder)`);
                totalDataFilesUpdated++;
            }
        }

        // content_log.json
        const logFile = path.join(categoryPath, 'content_log.json');
        if (fs.existsSync(logFile)) {
            const logData = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
            let updated = false;

            // Update nft_holder
            if (logData.nft_holder && logData.nft_holder.wallet === OLD_WALLET) {
                ensureBackup(logFile);
                logData.nft_holder.wallet = NEW_WALLET;
                updated = true;
            }

            // Update the latest buyer in logs
            if (logData.log && logData.log.length > 0) {
                const sorted = logData.log.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                const latest = sorted[0];
                if (latest && latest.buyer === OLD_WALLET) {
                    latest.buyer = NEW_WALLET;
                    updated = true;
                }
            }

            if (updated) {
                fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
                console.log(`  ✅ Updated content_log.json (nft_holder + buyer)`);
                totalLogsUpdated++;
            }
        }

        // ---- 2. Subcategory level ----
        const subdirs = fs.readdirSync(categoryPath, { withFileTypes: true });
        for (const subdir of subdirs) {
            if (!subdir.isDirectory()) continue;
            const subMatch = subdir.name.match(/^(\d+)_(.+)$/);
            if (!subMatch) continue;

            const subId = subMatch[1];
            const subName = subMatch[2];
            const subPath = path.join(categoryPath, subdir.name);

            // subcategory.json
            const subFile = path.join(subPath, 'subcategory.json');
            if (fs.existsSync(subFile)) {
                const data = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
                if (data.nft_holder && data.nft_holder.wallet === OLD_WALLET) {
                    ensureBackup(subFile);
                    data.nft_holder.wallet = NEW_WALLET;
                    fs.writeFileSync(subFile, JSON.stringify(data, null, 2));
                    console.log(`    ✅ Updated subcategory.json (${subName})`);
                    totalDataFilesUpdated++;
                }
            }

            // subcategory_log.json
            const subLogFile = path.join(subPath, 'subcategory_log.json');
            if (fs.existsSync(subLogFile)) {
                const logData = JSON.parse(fs.readFileSync(subLogFile, 'utf-8'));
                let updated = false;

                if (logData.nft_holder && logData.nft_holder.wallet === OLD_WALLET) {
                    ensureBackup(subLogFile);
                    logData.nft_holder.wallet = NEW_WALLET;
                    updated = true;
                }

                if (logData.log && logData.log.length > 0) {
                    const sorted = logData.log.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                    const latest = sorted[0];
                    if (latest && latest.buyer === OLD_WALLET) {
                        latest.buyer = NEW_WALLET;
                        updated = true;
                    }
                }

                if (updated) {
                    fs.writeFileSync(subLogFile, JSON.stringify(logData, null, 2));
                    console.log(`    ✅ Updated subcategory_log.json (${subName})`);
                    totalLogsUpdated++;
                }
            }

            // ---- 3. Item level ----
            const itemDirs = fs.readdirSync(subPath, { withFileTypes: true });
            for (const itemDir of itemDirs) {
                if (!itemDir.isDirectory()) continue;
                const itemMatch = itemDir.name.match(/^(\d+)_(.+)$/);
                if (!itemMatch) continue;

                const itemId = itemMatch[1];
                const itemName = itemMatch[2];
                const itemPath = path.join(subPath, itemDir.name);

                // {itemId}_{itemName}.json
                const itemFile = path.join(itemPath, `${itemId}_${itemName}.json`);
                if (fs.existsSync(itemFile)) {
                    const data = JSON.parse(fs.readFileSync(itemFile, 'utf-8'));
                    if (data.nft_holder && data.nft_holder.wallet === OLD_WALLET) {
                        ensureBackup(itemFile);
                        data.nft_holder.wallet = NEW_WALLET;
                        fs.writeFileSync(itemFile, JSON.stringify(data, null, 2));
                        console.log(`      ✅ Updated ${itemName}.json`);
                        totalDataFilesUpdated++;
                    }
                }

                // {itemId}_{itemName}_log.json
                const itemLogFile = path.join(itemPath, `${itemId}_${itemName}_log.json`);
                if (fs.existsSync(itemLogFile)) {
                    const logData = JSON.parse(fs.readFileSync(itemLogFile, 'utf-8'));
                    let updated = false;

                    if (logData.nft_holder && logData.nft_holder.wallet === OLD_WALLET) {
                        ensureBackup(itemLogFile);
                        logData.nft_holder.wallet = NEW_WALLET;
                        updated = true;
                    }

                    if (logData.log && logData.log.length > 0) {
                        const sorted = logData.log.sort((a, b) => (b.thread || 0) - (a.thread || 0));
                        const latest = sorted[0];
                        if (latest && latest.buyer === OLD_WALLET) {
                            latest.buyer = NEW_WALLET;
                            updated = true;
                        }
                    }

                    if (updated) {
                        fs.writeFileSync(itemLogFile, JSON.stringify(logData, null, 2));
                        console.log(`      ✅ Updated ${itemName}_log.json`);
                        totalLogsUpdated++;
                    }
                }
            }
        }
    }

    // ---- Summary ----
    console.log('\n========================================');
    console.log('📊 Migration Summary');
    console.log('========================================');
    console.log(`✅ Data files updated: ${totalDataFilesUpdated}`);
    console.log(`✅ Log files updated: ${totalLogsUpdated}`);
    console.log(`✅ Total files updated: ${totalDataFilesUpdated + totalLogsUpdated}`);
    console.log('========================================');
    console.log(`\n🟢 All NFTs are now owned by:\n   ${NEW_WALLET}`);
    console.log('\n💡 Note: Backup files (.bak) were created for each updated file.');
    console.log('   You can delete them after verifying the migration.');
    console.log('========================================\n');
}

// ============================================================
// RUN
// ============================================================
try {
    migrateOwnership();
} catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
}
