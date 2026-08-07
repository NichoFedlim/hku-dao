// migrate_to_shortlinks.js
// This script generates shortlinks for ALL existing NFTs and updates their files

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// CONFIGURATION
// ============================================================
const NFT_DATA_DIR = path.join(__dirname, 'nft', 'data');
const SHORTCODE_FILE = path.join(__dirname, 'shortcodes.json');
const DOMAIN = 'https://d3.p2.rbas.top';

// ============================================================
// SHORTLINK FUNCTIONS (copied from server.js)
// ============================================================

function ensureShortcodeFile() {
    if (!fs.existsSync(SHORTCODE_FILE)) {
        fs.writeFileSync(SHORTCODE_FILE, JSON.stringify({}, null, 2));
        console.log(`📁 Created shortcode file: ${SHORTCODE_FILE}`);
    }
}

function encodeBase62(id) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    let num = id;
    while (num > 0) {
        result = chars[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result || '0';
}

function getNextShortcodeId() {
    ensureShortcodeFile();
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    
    let maxId = 0;
    for (const key in mappings) {
        const id = mappings[key].id || 0;
        if (id > maxId) maxId = id;
    }
    return maxId + 1;
}

function generateShortLinkForNFT(originalUrl) {
    ensureShortcodeFile();
    
    const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
    
    // Check if this URL already has a shortcode
    for (const [shortCode, data] of Object.entries(mappings)) {
        if (data.url === originalUrl) {
            return {
                short_code: shortCode,
                short_url: `${DOMAIN}/s/${shortCode}`
            };
        }
    }
    
    // Generate new shortcode
    const nextId = getNextShortcodeId();
    const shortCode = encodeBase62(nextId);
    
    // Store the mapping
    mappings[shortCode] = {
        id: nextId,
        url: originalUrl,
        created_at: new Date().toISOString(),
        migrated: true
    };
    
    fs.writeFileSync(SHORTCODE_FILE, JSON.stringify(mappings, null, 2));
    
    return {
        short_code: shortCode,
        short_url: `${DOMAIN}/s/${shortCode}`
    };
}

// ============================================================
// MIGRATION FUNCTIONS
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

function generateCategoryDetailUrl(categoryId, categoryName) {
    return `${DOMAIN}/nft/detail.html?type=category&id=${categoryId}&name=${encodeURIComponent(categoryName)}`;
}

function generateSubcategoryDetailUrl(categoryId, categoryName, subcategoryId, subcategoryName) {
    return `${DOMAIN}/nft/detail.html?type=subcategory&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName)}&subcategoryId=${subcategoryId}&subcategoryName=${encodeURIComponent(subcategoryName)}`;
}

function generateItemDetailUrl(categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName) {
    return `${DOMAIN}/nft/detail.html?type=item&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName)}&subcategoryId=${subcategoryId}&subcategoryName=${encodeURIComponent(subcategoryName)}&itemNumber=${itemNumber}&itemName=${encodeURIComponent(itemName)}`;
}

function migrateCategory(categoryDir, categoryId, categoryName) {
    const contentPath = path.join(categoryDir, 'content.json');
    if (!fs.existsSync(contentPath)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
        
        // Check if already has shortlink
        if (data.shortlink && data.shortlink.includes('/s/')) {
            console.log(`  ⏭️  Category ${categoryId} already has shortlink: ${data.shortlink}`);
            return null;
        }
        
        // Generate shortlink
        const detailUrl = generateCategoryDetailUrl(categoryId, categoryName);
        const result = generateShortLinkForNFT(detailUrl);
        
        // Update data
        data.shortlink = result.short_url;
        data.short_code = result.short_code;
        
        // Write back
        fs.writeFileSync(contentPath, JSON.stringify(data, null, 2));
        
        console.log(`  ✅ Category ${categoryId} - ${categoryName}: ${result.short_url}`);
        return result;
    } catch (error) {
        console.error(`  ❌ Error migrating category ${categoryId}: ${error.message}`);
        return null;
    }
}

function migrateSubcategory(categoryDir, categoryId, categoryName, subDir, subcategoryId, subcategoryName) {
    const subPath = path.join(subDir, 'subcategory.json');
    if (!fs.existsSync(subPath)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
        
        // Check if already has shortlink
        if (data.shortlink && data.shortlink.includes('/s/')) {
            console.log(`    ⏭️  Subcategory ${subcategoryId} already has shortlink: ${data.shortlink}`);
            return null;
        }
        
        // Generate shortlink
        const detailUrl = generateSubcategoryDetailUrl(categoryId, categoryName, subcategoryId, subcategoryName);
        const result = generateShortLinkForNFT(detailUrl);
        
        // Update data
        data.shortlink = result.short_url;
        data.short_code = result.short_code;
        
        // Write back
        fs.writeFileSync(subPath, JSON.stringify(data, null, 2));
        
        console.log(`    ✅ Subcategory ${subcategoryId} - ${subcategoryName}: ${result.short_url}`);
        return result;
    } catch (error) {
        console.error(`    ❌ Error migrating subcategory ${subcategoryId}: ${error.message}`);
        return null;
    }
}

function migrateItem(categoryDir, categoryId, categoryName, subDir, subcategoryId, subcategoryName, itemDir, itemNumber, itemName) {
    const itemPath = path.join(itemDir, `${itemNumber}_${itemName}.json`);
    if (!fs.existsSync(itemPath)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
        
        // Check if already has shortlink
        if (data.shortlink && data.shortlink.includes('/s/')) {
            console.log(`      ⏭️  Item ${itemNumber} already has shortlink: ${data.shortlink}`);
            return null;
        }
        
        // Generate shortlink
        const detailUrl = generateItemDetailUrl(categoryId, categoryName, subcategoryId, subcategoryName, itemNumber, itemName);
        const result = generateShortLinkForNFT(detailUrl);
        
        // Update data
        data.shortlink = result.short_url;
        data.short_code = result.short_code;
        
        // Write back
        fs.writeFileSync(itemPath, JSON.stringify(data, null, 2));
        
        console.log(`      ✅ Item ${itemNumber} - ${itemName}: ${result.short_url}`);
        return result;
    } catch (error) {
        console.error(`      ❌ Error migrating item ${itemNumber}: ${error.message}`);
        return null;
    }
}

// ============================================================
// MAIN MIGRATION
// ============================================================

function migrateAllNFTs() {
    console.log('========================================');
    console.log('🚀 Starting NFT Shortlink Migration');
    console.log('========================================');
    console.log(`📁 Data Directory: ${NFT_DATA_DIR}`);
    console.log(`🌐 Domain: ${DOMAIN}`);
    console.log(`📄 Shortcode File: ${SHORTCODE_FILE}`);
    console.log('========================================\n');

    if (!fs.existsSync(NFT_DATA_DIR)) {
        console.error('❌ NFT data directory not found!');
        return;
    }

    let stats = {
        categories: 0,
        subcategories: 0,
        items: 0,
        total: 0
    };

    // Read all category directories
    const categoryDirs = fs.readdirSync(NFT_DATA_DIR, { withFileTypes: true });
    
    for (const catDir of categoryDirs) {
        if (!catDir.isDirectory()) continue;
        
        const catMatch = catDir.name.match(/^(\d+)_(.+)$/);
        if (!catMatch) continue;
        
        const categoryId = catMatch[1];
        const categoryName = catMatch[2];
        const categoryPath = path.join(NFT_DATA_DIR, catDir.name);
        
        console.log(`\n📂 Category: ${categoryId} - ${categoryName}`);
        
        // Migrate category
        const catResult = migrateCategory(categoryPath, categoryId, categoryName);
        if (catResult) {
            stats.categories++;
            stats.total++;
        }
        
        // Scan subcategories
        const subDirs = fs.readdirSync(categoryPath, { withFileTypes: true });
        for (const subDir of subDirs) {
            if (!subDir.isDirectory()) continue;
            
            const subMatch = subDir.name.match(/^(\d+)_(.+)$/);
            if (!subMatch) continue;
            
            const subcategoryId = subMatch[1];
            const subcategoryName = subMatch[2];
            const subPath = path.join(categoryPath, subDir.name);
            
            console.log(`  📁 Subcategory: ${subcategoryId} - ${subcategoryName}`);
            
            // Migrate subcategory
            const subResult = migrateSubcategory(categoryPath, categoryId, categoryName, subPath, subcategoryId, subcategoryName);
            if (subResult) {
                stats.subcategories++;
                stats.total++;
            }
            
            // Scan items
            const itemDirs = fs.readdirSync(subPath, { withFileTypes: true });
            for (const itemDir of itemDirs) {
                if (!itemDir.isDirectory()) continue;
                
                const itemMatch = itemDir.name.match(/^(\d+)_(.+)$/);
                if (!itemMatch) continue;
                
                const itemNumber = itemMatch[1];
                const itemName = itemMatch[2];
                const itemPath = path.join(subPath, itemDir.name);
                
                console.log(`    📁 Item: ${itemNumber} - ${itemName}`);
                
                // Migrate item
                const itemResult = migrateItem(categoryPath, categoryId, categoryName, subPath, subcategoryId, subcategoryName, itemPath, itemNumber, itemName);
                if (itemResult) {
                    stats.items++;
                    stats.total++;
                }
            }
        }
    }

    // Show summary
    console.log('\n========================================');
    console.log('✅ Migration Complete!');
    console.log('========================================');
    console.log(`📊 Summary:`);
    console.log(`   Categories migrated: ${stats.categories}`);
    console.log(`   Subcategories migrated: ${stats.subcategories}`);
    console.log(`   Items migrated: ${stats.items}`);
    console.log(`   Total NFTs migrated: ${stats.total}`);
    console.log(`📄 Shortcode file: ${SHORTCODE_FILE}`);
    console.log('========================================');
    
    // Show some shortcode stats
    if (fs.existsSync(SHORTCODE_FILE)) {
        const mappings = JSON.parse(fs.readFileSync(SHORTCODE_FILE, 'utf-8'));
        console.log(`🔗 Total shortcodes generated: ${Object.keys(mappings).length}`);
        console.log('\n📋 Sample shortcodes:');
        const entries = Object.entries(mappings).slice(0, 5);
        entries.forEach(([code, data]) => {
            console.log(`   ${DOMAIN}/s/${code} -> ${data.url.substring(0, 80)}...`);
        });
        if (Object.keys(mappings).length > 5) {
            console.log(`   ... and ${Object.keys(mappings).length - 5} more`);
        }
    }
}

// ============================================================
// RUN THE MIGRATION
// ============================================================

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('⚠️  WARNING: This will modify existing NFT data files!');
console.log('   It will add shortlinks to all categories, subcategories, and items.');
console.log('   A backup of the shortcodes will be created in shortcodes.json\n');

rl.question('Continue? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        // Create backup of shortcodes.json if it exists
        if (fs.existsSync(SHORTCODE_FILE)) {
            const backupPath = `${SHORTCODE_FILE}.backup`;
            fs.copyFileSync(SHORTCODE_FILE, backupPath);
            console.log(`📦 Backup created: ${backupPath}`);
        }
        
        migrateAllNFTs();
    } else {
        console.log('❌ Migration cancelled.');
    }
    rl.close();
});
