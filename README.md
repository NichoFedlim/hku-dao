
# 港大道 (HKU DAO) – NFT Trading Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![RBAS](https://img.shields.io/badge/Blockchain-RBAS-blue.svg)](https://github.com/your-repo)

---
## 📋 Table of Content

| Section | What is Added/Improved |
|---------|----------------------|
| **1. Overview** | Clear description of the project's purpose and 3-level hierarchy |
| **2. Architecture** | Data flow diagram and core pages table |
| **3. File Name Mapping** | Kept your old→new mapping, added status column |
| **4. Project Structure** | Complete tree with all folders and key files |
| **5. Features** | Organized into 5 categories with emojis |
| **6. Data Structure** | Tables showing 8 filters with item counts and examples |
| **7. Setup & Installation** | Step-by-step instructions with commands |
| **8. API Endpoints** | Complete list of expected backend endpoints |
| **9. Testing** | Navigation flow and admin feature tests |
| **10. Security** | Security considerations |
| **11. Contributing** | Standard contribution guidelines |
| **12. License & Contact** | Professional footer |

To view: cmd + shift + v

---

## 📖 Overview

**港大道 (HKU DAO)** is a modern, bilingual frontend application built on top of the **RBAS blockchain**. It transforms the University of Hong Kong's cultural heritage into a digital NFT ecosystem where users can explore, collect, and trade NFTs representing HKU's faculties, buildings, history, and local culture.

The application follows a **three‑level+ hierarchical structure**:

```
Level 1: HKU DAO (Main page)
    └── Level 2: Categories (e.g., Faculties, Buildings, History)
        └── Level 3: Subcategories (e.g., Departments, Building Rooms)
        └── Level 3.5: Items* (e.g., Courses, Lecture Halls)
```
*Right now, Items is the same as subcategories. It is combined into one, items.

---

## 🏗️ Architecture

### Data Flow
```
categories.html → items.html (level=category) → detail.html (type=item)
subcategories.html → items.html (level=subcategory) → detail.html (type=subitem)
```

### Core Pages (4 Files Only!)

| Current File | Purpose | Replaces (Old) |
|--------------|---------|-----------------|
| `categories.html` | Level 1 list – displays all HKU categories as NFT cards with QR codes & hashes | `index_main.html` (partial) |
| `items.html` | Unified grid for any level – displays NFT cards with QR codes & hashes | `index_bxt_group.html` + `citang.html` |
| `detail.html` | Unified detail & edit page for any NFT – supports text, images, PDFs | `name.html` + `citang_detail.html` + `member_detail.html` |
| `index_main.html` | Homepage – featured DAO card, search, and category preview | `index_main.html` |

### File Name Mapping (Old → New)

| Old File | Current File | Status |
|----------|--------------|--------|
| `xingshi.html` | `categories.html` | ✅ Refactored |
| `citang.html` | `items.html` (level=category) | ✅ Merged |
| `citang_detail.html` | `detail.html` (type=category) | ✅ Merged |
| `citang_member.html` | `items.html` (level=subcategory) | ✅ Merged |
| `member_detail.html` | `detail.html` (type=item) | ✅ Merged |
| `name.html` | `detail.html` (type=item) | ✅ Merged |
| `user.html` | `portfolio.html` | ✅ Renamed |
| `index_bxt_group.html` | `items.html` (level=subcategory) | ✅ Merged |
| `NFT_market.html` | `NFT_market.html` | ✅ Kept |
| `ti_log.html` | `ti_log.html` | ✅ Kept (unified) |
| `query.html` | `query.html` | ✅ Kept |

---

## 📁 Project Structure

```
/nft/
├── index_main.html              # Homepage
├── categories.html              # Level 1 list (HKU categories)
├── items.html                   # Unified grid for any level
├── detail.html                  # Unified detail + edit for any NFT
├── NFT_market.html              # NFT marketplace (buy/sell/list)
├── portfolio.html               # User's owned NFTs
├── ti_log.html                  # Transaction log (unified)
├── query.html                   # Chain hash verification
│
├── css/
│   └── style.css                # Global styles (all pages)
│
├── js/
│   ├── i18n.js                  # Language loader & translation
│   ├── auth.js                  # Wallet‑auth wrapper
│   ├── api.js                   # API calls (with mock data fallback)
│   ├── components.js            # Card renderers, toast, pagination
│   └── main.js                  # App initialisation & page routing
│
├── locales/
│   ├── en.json                  # English strings
│   └── zh.json                  # Chinese strings (Mandarin)
│
├── image/                       # Logos, icons, and images
│   ├── hku_logo.png
│   ├── favicon.png
│   └── ...
│
└── wallet-auth.js               # RBAS wallet authentication (unchanged)
```

---

## 🚀 Features

### Core Features
- **🏛️ Three‑Level NFT Hierarchy** – Categories → Subcategories → Items
- **🌐 Bilingual Interface** – Switch between English and Chinese instantly
- **📱 Fully Responsive** – Works on all devices (desktop, tablet, mobile)
- **🔍 Search & QR Scan** – Find NFTs by name or scan QR codes
- **📄 NFT Cards** – Every NFT displays its own QR code and blockchain hash
- **📊 Pagination** – 50 items per page with "Show All" option
- **🎯 Filtering** – 8 filter groups (Faculties, Main Campus, Centennial, Halls, Medical, Sports, History, Culture)

### Marketplace & Wallet
- **🛒 NFT Marketplace** – Browse, buy, and sell NFTs
- **👛 Wallet Integration** – Login via RBAS wallet (wallet-auth.js)
- **📦 Portfolio Management** – View owned NFTs, list for sale, cancel sales
- **🔐 Ownership-Based Editing** – Only NFT owners can edit content

### Content Management
- **✏️ Edit NFTs** – Update descriptions, details, and metadata
- **📎 Attachments** – Upload text, images, and PDFs to any NFT
- **📜 Transaction Logs** – View complete history for any NFT
- **✅ Chain Verification** – Verify blockchain hashes with QR codes

### Admin Capabilities
- **➕ Add Categories** – DAO NFT owners can add new categories
- **➕ Add Subcategories** – Category NFT owners can add sub-items
- **🔑 Permission System** – Based on wallet ownership (RBAS)

---

## 🔧 Data Structure

### Category Data (65+ items across 8 filters)

| Filter | Items | Examples |
|--------|-------|----------|
| Faculties | 10 | Architecture, Engineering, Medicine... |
| Main Campus | 17 | Main Building, Haking Wong, K.K. Leung... |
| Centennial Campus | 7 | Cheng Yu Tung, Run Run Shaw... |
| Halls & Residences | 14 | Eliot Hall, Swire Hall, JCSV... |
| Medical Campus | 5 | Medicine Building, Pauline Chan... |
| Sports | 3 | Stanley Ho, Henry Fok... |
| History | 6 | 1910-1929, 1930-1949... |
| Local Culture | 4 | Dim Sum, Hiking, Siu Mei... |

### Subcategory Data
- **Faculties** → Departments & Schools (e.g., Architecture → Department of Architecture)
- **Buildings** → Rooms & Lecture Halls (e.g., Main Building → Loke Yew Hall, G14, 1/F)
- **History** → Decade intervals
- **Culture** → Specific cultural items

---

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v14 or higher)
- RBAS backend server (running)
- Web server (Apache, Nginx, or Express static)

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/hku-dao-frontend.git
   cd hku-dao-frontend
   ```

2. **Place files in web server root**
   - Copy all HTML, CSS, JS, and locale files to your web server's document root
   - Ensure the `/nft/` folder structure is maintained

3. **Wallet authentication**
   - Place `wallet-auth.js` in the root directory (provided by RBAS)

4. **Backend endpoints**
   - Ensure your RBAS backend server is running
   - Update API endpoints in `js/api.js` if needed

5. **Customize content**
   - Replace `image/hku_logo.png` with your own logo
   - Update category data in `categories.html` (inside `CATEGORY_DATA` object)
   - Update subcategory data in `items.html` (inside `SUBCATEGORY_DATA` object)

6. **Run the application**
   ```bash
   # If using Python's simple server
   python -m http.server 8080

   # Or using Node's http-server
   npx http-server -p 8080
   ```

7. **Access the application**
   - Open `http://localhost:8080/nft/index_main.html` in your browser

---

## 🔌 API Endpoints (Backend)

The frontend expects these backend endpoints (to be implemented on the RBAS server):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/categories` | GET | Fetch all top-level categories |
| `/api/subcategories?category={id}` | GET | Fetch sub-categories for a category |
| `/api/subcategory/{id}` | GET | Fetch detail of a sub-category |
| `/api/items?subcategory={id}` | GET | Fetch items under a sub-category |
| `/api/item/{id}` | GET | Fetch detail of an item |
| `/api/nfts/onsale` | GET | Fetch all NFTs currently on sale |
| `/api/user/nfts?wallet={address}` | GET | Fetch NFTs owned by a wallet |
| `/api/nft/list` | POST | List an NFT for sale |
| `/api/nft/buy` | POST | Buy an NFT |
| `/api/nft/cancel-sale` | POST | Cancel an NFT listing |
| `/api/log?level={level}&id={id}` | GET | Fetch transaction log |
| `/api/send-code` | POST | Send SMS verification code (login) |
| `/api/login` | POST | Authenticate user with phone + code |

> **Note:** The current code includes mock data for development. Replace with real API calls in `js/api.js`.

---

## 🧪 Testing

### Test the Navigation Flow

1. **Homepage** → `index_main.html`
2. **Click "Categories"** → `categories.html`
3. **Click a category card** → `items.html?level=category&id=1`
4. **Click a subcategory card** → `detail.html?type=item&id=101`
5. **Click "View Sub-Items"** → `items.html?level=subcategory&parent=101`
6. **Click an item card** → `detail.html?type=subitem&id=10101`

### Test Admin Features
1. **Login** via wallet-auth modal
2. **Add Category** → `categories.html` (DAO owner only)
3. **Add Subcategory** → `items.html` (category owner only)
4. **Edit NFT** → `detail.html` (NFT owner only)

### Test Language Toggle
- Click the "中文" / "English" button in the header
- All text should switch languages instantly

---

## 🛡️ Security

- **Wallet Authentication** – All sensitive actions require wallet login
- **Ownership Checks** – Only NFT owners can edit content
- **Input Validation** – Basic validation on all forms
- **RBAS Blockchain** – All transactions are recorded on the blockchain

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- **RBAS Blockchain** – For providing the underlying blockchain infrastructure
- **University of Hong Kong** – For inspiration and cultural heritage data
- **Pei Zheng Dao & Bai Xing Dao** – For the original concept and codebase

---

## 📞 Contact

- **Project Lead**: Nicholas Fedlim
- **Email**: nicholasfedlim@gmail.com
- **GitHub**: [https://github.com/your-repo](https://github.com/your-repo)

---

*Built with ❤️ for the HKU community.*
