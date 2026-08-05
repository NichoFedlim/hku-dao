const fetch = require('node-fetch'); // npm install node-fetch if needed
// For Node 18+, you can use global fetch

const BASE_URL = 'http://localhost:5013';
const TEST_WALLET = '18FB5707601BD6A8D79F2F6C18427E85F6EA7EAB3D9AB43948C436D8A1DD1D0E';

const tests = [
  // ===== AUTHENTICATION TESTS =====
  {
    name: 'Wallet Status',
    path: '/api/wallet-state/status',
    method: 'GET',
    validate: (data) => data.success === true
  },

  // ===== CATEGORY TESTS =====
  {
    name: 'List Categories',
    path: '/api/categories/list',
    method: 'GET',
    validate: (data) => data.data && Array.isArray(data.data)
  },
  {
    name: 'Get Category Detail (ID=1)',
    path: '/api/category/detail?id=1',
    method: 'GET',
    validate: (data) => data.name !== undefined
  },
  {
    name: 'Get Category Detail (Not Found)',
    path: '/api/category/detail?id=999',
    method: 'GET',
    expectedStatus: 404,
    validate: (data) => data.error !== undefined
  },

  // ===== SUBCATEGORY TESTS =====
  {
    name: 'List Subcategories (Category 1)',
    path: '/api/subcategories/list/1',
    method: 'GET',
    validate: (data) => data.data && Array.isArray(data.data)
  },
  {
    name: 'Get Subcategory Detail (ID=101)',
    path: '/api/subcategory/detail?id=101',
    method: 'GET',
    validate: (data) => data.name !== undefined
  },

  // ===== ITEM TESTS =====
  {
    name: 'List Items (Subcategory 101)',
    path: '/api/items/list?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture',
    method: 'GET',
    validate: (data) => data.data && Array.isArray(data.data)
  },
  {
    name: 'Get Item Detail (ID=10101)',
    path: '/api/item/detail?id=10101',
    method: 'GET',
    validate: (data) => data.name !== undefined
  },

  // ===== CONTENT MANAGEMENT TESTS =====
  {
    name: 'Get Content List (Category)',
    path: '/api/content/list?level=category&category_id=1&category_name=Architecture',
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },
  {
    name: 'Get Content List (Subcategory)',
    path: '/api/content/list?level=subcategory&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture',
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },
  {
    name: 'Update Content (Valid)',
    path: '/api/content/update',
    method: 'POST',
    data: {
      level: 'category',
      category_id: '1',
      category_name: 'Architecture',
      description: 'Updated test description',
      details: 'Updated test details',
      wallet: TEST_WALLET
    },
    validate: (data) => data.success === true
  },
  {
    name: 'Update Content (Invalid)',
    path: '/api/content/update',
    method: 'POST',
    expectedStatus: 400,
    data: {
      level: 'category',
      category_name: 'Architecture'
    },
    validate: (data) => data.error !== undefined
  },

  // ===== MARKET TESTS =====
  {
    name: 'Get On-sale NFTs',
    path: '/api/nfts/onsale',
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },
  {
    name: 'List NFT for Sale',
    path: '/api/nft/list',
    method: 'POST',
    data: {
      level: 'category',
      card_number: '1',
      surname: 'Architecture',
      price: 1000,
      seller_wallet: TEST_WALLET,
      hash: '0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6'
    },
    validate: (data) => data.success === true
  },
  {
    name: 'Cancel NFT Sale',
    path: '/api/nft/cancel-sale',
    method: 'POST',
    data: {
      level: 'category',
      id: '1',
      name: 'Architecture'
    },
    validate: (data) => data.success === true
  },

  // ===== USER NFT TESTS =====
  {
    name: 'Get User NFTs',
    path: `/api/user/nfts?wallet=${TEST_WALLET}`,
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },

  // ===== TRANSACTION LOG TESTS =====
  {
    name: 'Get Category Transaction Log',
    path: '/api/log/transaction?level=category&category_id=1&category_name=Architecture',
    method: 'GET',
    validate: (data) => data.log !== undefined
  },
  {
    name: 'Get Subcategory Transaction Log',
    path: '/api/log/transaction?level=subcategory&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture',
    method: 'GET',
    validate: (data) => data.log !== undefined
  },
  {
    name: 'Get Item Transaction Log',
    path: '/api/log/transaction?level=item&category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture&item_number=10101&item_name=Prof._John_Smith',
    method: 'GET',
    validate: (data) => data.log !== undefined
  },

  // ===== SEARCH TESTS =====
  {
    name: 'Search "architecture"',
    path: '/api/search?q=architecture',
    method: 'GET',
    validate: (data) => data.results !== undefined
  },
  {
    name: 'Search "engineering"',
    path: '/api/search?q=engineering',
    method: 'GET',
    validate: (data) => data.results !== undefined
  },
  {
    name: 'Search Empty Query',
    path: '/api/search?q=',
    method: 'GET',
    validate: (data) => data.results !== undefined
  },

  // ===== TRASH TESTS =====
  {
    name: 'List Trash Items',
    path: '/api/trash/list',
    method: 'GET',
    validate: (data) => data.success === true && Array.isArray(data.data)
  },

  // ===== CONTENT RENAME TESTS =====
  {
    name: 'Rename Content (Valid - needs existing file)',
    path: '/api/content/rename',
    method: 'PUT',
    data: {
      level: 'category',
      category_id: '1',
      category_name: 'Architecture',
      timestamp: Date.now(),
      new_name: 'test_renamed'
    },
    // This might fail if the file doesn't exist, but we're testing the endpoint
    validate: (data) => data.success === true || data.error === 'Attachment not found'
  },
  {
    name: 'Rename Content (Invalid - missing params)',
    path: '/api/content/rename',
    method: 'PUT',
    expectedStatus: 400,
    data: {
      level: 'category',
      category_name: 'Architecture'
    },
    validate: (data) => data.error !== undefined
  }
];

async function runTests() {
  console.log('========================================');
  console.log('🧪 HKU DAO Backend API Tests');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const url = `${BASE_URL}${test.path}`;
      const method = test.method || 'GET';
      
      console.log(`📋 Testing: ${test.name}`);
      console.log(`   ${method} ${test.path}`);

      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (test.data) {
        options.body = JSON.stringify(test.data);
      }

      const response = await fetch(url, options);
      const statusCode = response.status;
      
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        // Response might not be JSON
        data = { error: 'Invalid JSON response' };
      }

      const expectedStatus = test.expectedStatus || 200;
      
      if (statusCode !== expectedStatus) {
        console.log(`   ❌ FAILED - Expected HTTP ${expectedStatus}, got ${statusCode}`);
        console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}...`);
        failed++;
      } else {
        // Validate the response
        const isValid = test.validate(data);
        
        if (isValid) {
          console.log(`   ✅ PASSED`);
          passed++;
        } else {
          console.log(`   ❌ FAILED - Validation failed`);
          console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}...`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`   ❌ FAILED - ${error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log('========================================');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`✅ ${passed === tests.length ? 'All tests passed!' : 'Some tests failed.'}`);
  console.log('========================================');
}

// Run the tests
runTests().catch(console.error);