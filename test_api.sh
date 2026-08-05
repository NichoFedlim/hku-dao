#!/bin/bash
BASE_URL="http://localhost:5013"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "🧪 HKU DAO Backend API Tests"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

# Counter
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_code="$4"
    local data="$5"
    
    echo -e "${BLUE}📋 Testing:${NC} $name"
    echo -e "   ${method} $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi
    
    # Extract status code (last line)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "   ${GREEN}✅ PASSED${NC} (HTTP $http_code)"
        ((PASSED++))
        # Show first 100 chars of response for debugging
        if [ -n "$body" ] && [ ${#body} -lt 500 ]; then
            echo -e "   Response: ${body:0:150}..."
        fi
    else
        echo -e "   ${RED}❌ FAILED${NC} (Expected $expected_code, got $http_code)"
        if [ -n "$body" ]; then
            echo -e "   Response: ${body:0:200}..."
        fi
        ((FAILED++))
    fi
    echo ""
}

# ============================================
# AUTHENTICATION TESTS
# ============================================
echo -e "${YELLOW}🔐 Authentication Tests${NC}"
echo "------------------------------------------"

test_endpoint "Wallet Status" "GET" "/api/wallet-state/status" "200"

# ============================================
# CATEGORY TESTS
# ============================================
echo -e "${YELLOW}🏛️ Category Tests${NC}"
echo "------------------------------------------"

test_endpoint "List Categories" "GET" "/api/categories/list" "200"

test_endpoint "Get Category Detail (ID=1)" "GET" "/api/category/detail?id=1" "200"

test_endpoint "Get Category Detail (ID=999 - Not Found)" "GET" "/api/category/detail?id=999" "404"

# ============================================
# SUBCATEGORY TESTS
# ============================================
echo -e "${YELLOW}📂 Subcategory Tests${NC}"
echo "------------------------------------------"

test_endpoint "List Subcategories (Category 1)" "GET" "/api/subcategories/list/1" "200"

test_endpoint "List Subcategories (Category 999 - Empty)" "GET" "/api/subcategories/list/999" "200"

test_endpoint "Get Subcategory Detail (ID=101)" "GET" "/api/subcategory/detail?id=101" "200"

test_endpoint "Get Subcategory Detail (ID=999 - Not Found)" "GET" "/api/subcategory/detail?id=999" "404"

# ============================================
# ITEM TESTS
# ============================================
echo -e "${YELLOW}📦 Item Tests${NC}"
echo "------------------------------------------"

test_endpoint "List Items (Subcategory 101)" "GET" "/api/items/list?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture" "200"

test_endpoint "Get Item Detail (ID=10101)" "GET" "/api/item/detail?id=10101" "200"

test_endpoint "Get Item Detail (ID=999 - Not Found)" "GET" "/api/item/detail?id=999" "404"

# ============================================
# CONTENT MANAGEMENT TESTS
# ============================================
echo -e "${YELLOW}📄 Content Management Tests${NC}"
echo "------------------------------------------"

test_endpoint "Get Content List (Category 1)" "GET" "/api/content/list?level=category&category_id=1&category_name=Architecture" "200"

test_endpoint "Get Content List (Subcategory 101)" "GET" "/api/content/list?level=subcategory&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture" "200"

# Test content update (valid)
test_endpoint "Update Content (Valid)" "POST" "/api/content/update" "200" '{
    "level": "category",
    "category_id": "1",
    "category_name": "Architecture",
    "description": "Updated test description",
    "details": "Updated test details",
    "wallet": "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E"
}'

# Test content update (invalid - missing params)
test_endpoint "Update Content (Invalid)" "POST" "/api/content/update" "400" '{
    "level": "category",
    "category_name": "Architecture"
}'

# Test content upload (text)
test_endpoint "Upload Content (Text)" "POST" "/api/content/upload" "200" '{
    "level": "category",
    "category_id": "1",
    "category_name": "Architecture",
    "type": "text",
    "text": "Test text content"
}'

# ============================================
# MARKET TESTS
# ============================================
echo -e "${YELLOW}🛒 Market Tests${NC}"
echo "------------------------------------------"

test_endpoint "Get On-sale NFTs" "GET" "/api/nfts/onsale" "200"

test_endpoint "List NFT for Sale" "POST" "/api/nft/list" "200" '{
    "level": "category",
    "card_number": "1",
    "surname": "Architecture",
    "price": 1000,
    "seller_wallet": "18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E",
    "hash": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6"
}'

test_endpoint "Cancel NFT Sale" "POST" "/api/nft/cancel-sale" "200" '{
    "level": "category",
    "id": "1",
    "name": "Architecture"
}'

# ============================================
# USER NFT TESTS
# ============================================
echo -e "${YELLOW}👛 User NFT Tests${NC}"
echo "------------------------------------------"

test_endpoint "Get User NFTs" "GET" "/api/user/nfts?wallet=18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E" "200"

# ============================================
# TRANSACTION LOG TESTS
# ============================================
echo -e "${YELLOW}📜 Transaction Log Tests${NC}"
echo "------------------------------------------"

test_endpoint "Get Category Transaction Log" "GET" "/api/log/transaction?level=category&category_id=1&category_name=Architecture" "200"

test_endpoint "Get Subcategory Transaction Log" "GET" "/api/log/transaction?level=subcategory&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture" "200"

test_endpoint "Get Item Transaction Log" "GET" "/api/log/transaction?level=item&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture&item_number=10101&item_name=Prof._John_Smith" "200"

# ============================================
# SEARCH TESTS
# ============================================
echo -e "${YELLOW}🔍 Search Tests${NC}"
echo "------------------------------------------"

test_endpoint "Search 'architecture'" "GET" "/api/search?q=architecture" "200"

test_endpoint "Search 'engineering'" "GET" "/api/search?q=engineering" "200"

test_endpoint "Search Empty Query" "GET" "/api/search?q=" "200"

# ============================================
# TRASH TESTS
# ============================================
echo -e "${YELLOW}🗑️ Trash Tests${NC}"
echo "------------------------------------------"

test_endpoint "List Trash Items" "GET" "/api/trash/list" "200"

# ============================================
# QUEUE TESTS
# ============================================
echo -e "${YELLOW}📋 Queue Tests${NC}"
echo "------------------------------------------"

# Note: There's no direct queue endpoint, but we can check if the file exists
echo -e "${BLUE}📋 Checking:${NC} Queue file exists"
if [ -f "hku_dao_queue.json" ]; then
    echo -e "   ${GREEN}✅ PASSED${NC} - Queue file exists"
    ((PASSED++))
else
    echo -e "   ${YELLOW}⚠️ WARNING${NC} - Queue file not found"
fi
echo ""

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo -e "${YELLOW}📊 Test Summary${NC}"
echo "------------------------------------------"
echo -e "Total tests: $(($PASSED + $FAILED))"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
else
    echo -e "${RED}⚠️ Some tests failed. Check the output above.${NC}"
fi
echo "=========================================="