const fetch = require('node-fetch'); // npm install node-fetch if needed
// Or use built-in fetch in Node 18+
// For Node 16: npm install node-fetch

const BASE_URL = 'http://localhost:5012';

const tests = [
  {
    name: 'Categories List',
    path: '/api/categories/list',
    method: 'GET',
    validate: (data) => data.data && data.data.length > 0
  },
  {
    name: 'Subcategories List (category 1)',
    path: '/api/subcategories/list/1',
    method: 'GET',
    validate: (data) => data.data && data.data.length > 0
  },
  {
    name: 'Category Detail',
    path: '/api/category/detail?id=1&name=Architecture',
    method: 'GET',
    validate: (data) => data.name === 'Architecture'
  },
  {
    name: 'Subcategory Detail',
    path: '/api/subcategory/detail?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture',
    method: 'GET',
    validate: (data) => data.name === 'Architecture'
  },
  {
    name: 'Items List',
    path: '/api/items/list?category_id=1&category_name=Architecture&subcategory_id=101&subcategory_name=Architecture',
    method: 'GET',
    validate: (data) => data.data !== undefined
  },
  {
    name: 'Search',
    path: '/api/search?q=architecture',
    method: 'GET',
    validate: (data) => data.results !== undefined
  },
  {
    name: 'Transaction Log',
    path: '/api/log/transaction?level=category&category_id=1&category_name=Architecture',
    method: 'GET',
    validate: (data) => data.log !== undefined
  },
  {
    name: 'On-sale NFTs',
    path: '/api/nfts/onsale',
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },
  {
    name: 'Content List',
    path: '/api/content/list?level=category&category_id=1&category_name=Architecture',
    method: 'GET',
    validate: (data) => Array.isArray(data)
  },
  {
    name: 'Wallet State',
    path: '/api/wallet-state/status',
    method: 'GET',
    validate: (data) => data.success === true
  }
];

async function runTests() {
  console.log('========================================');
  console.log('🧪 Testing HKU DAO Backend APIs');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const url = `${BASE_URL}${test.path}`;
      console.log(`📋 Testing: ${test.name}`);
      console.log(`   GET ${test.path}`);

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
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

runTests();
