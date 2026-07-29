#!/bin/bash
BASE_URL="http://localhost:5012"

echo "=========================================="
echo "🧪 Testing HKU DAO Backend APIs"
echo "=========================================="

# 1. Test Categories List
echo -e "\n📋 1. GET /api/categories/list"
curl -s "$BASE_URL/api/categories/list" | jq '.data | length' || echo "Failed"

# 2. Test Subcategories List (for category 1 - Architecture)
echo -e "\n📋 2. GET /api/subcategories/list/1"
curl -s "$BASE_URL/api/subcategories/list/1" | jq '.data | length' || echo "Failed"

# 3. Test Category Detail (ID=1, Name=Architecture)
echo -e "\n📋 3. GET /api/category/detail?id=1&name=Architecture"
curl -s "$BASE_URL/api/category/detail?id=1&name=Architecture" | jq '.name' || echo "Failed"

# 4. Test Subcategory Detail
echo -e "\n📋 4. GET /api/subcategory/detail?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture"
curl -s "$BASE_URL/api/subcategory/detail?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture" | jq '.name' || echo "Failed"

# 5. Test Items List (for subcategory 101)
echo -e "\n📋 5. GET /api/items/list?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture"
curl -s "$BASE_URL/api/items/list?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture" | jq '.data | length' || echo "Failed"

# 6. Test Search
echo -e "\n📋 6. GET /api/search?q=architecture"
curl -s "$BASE_URL/api/search?q=architecture" | jq '.total' || echo "Failed"

# 7. Test Transaction Log (for category)
echo -e "\n📋 7. GET /api/log/transaction?level=category&category_id=1&category_name=Architecture"
curl -s "$BASE_URL/api/log/transaction?level=category&category_id=1&category_name=Architecture" | jq '.log | length' || echo "Failed"

# 8. Test On-sale NFTs
echo -e "\n📋 8. GET /api/nfts/onsale"
curl -s "$BASE_URL/api/nfts/onsale" | jq 'length' || echo "Failed"

# 9. Test Content List (for category)
echo -e "\n📋 9. GET /api/content/list?level=category&category_id=1&category_name=Architecture"
curl -s "$BASE_URL/api/content/list?level=category&category_id=1&category_name=Architecture" | jq 'length' || echo "Failed"

# 10. Test Wallet State
echo -e "\n📋 10. GET /api/wallet-state/status"
curl -s "$BASE_URL/api/wallet-state/status" | jq '.' || echo "Failed"

echo -e "\n=========================================="
echo "✅ API tests completed!"
echo "=========================================="
