# 港大道 (HKU DAO) – NFT Trading Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![RBAS](https://img.shields.io/badge/Blockchain-RBAS-blue.svg)](https://github.com/NichoFedlim/hku-dao)

---

## 📖 Overview

**港大道 (HKU DAO)** is a full‑stack NFT platform built on the **RBAS blockchain**. It transforms HKU's cultural heritage into a digital ecosystem where users can explore, collect, and trade NFTs representing HKU's faculties, buildings, history, and local culture.

### Three‑Level Hierarchy
The application follows a **three‑level+ hierarchical structure**:

```
Level 1: HKU DAO (Main page)
    └── Level 2: Categories (e.g., Faculties, Buildings, History)
        └── Level 3: Subcategories (e.g., Departments, Building Rooms)
        └── Level 3.5: Items* (e.g., Courses, Lecture Halls)
```
*Right now, Items is the same as subcategories. It is combined into one level, Items.

---

## 🏗️ Architecture

### Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, CSS3, Vanilla JS (no framework) |
| **Backend** | Node.js + Express.js |
| **Blockchain** | RBAS (WebSocket connection) |
| **Storage** | JSON files (no database) |
| **Deployment** | Render.com / Any Node.js host |

### Data Flow

```
Frontend (HTML/JS) → Backend APIs (Node.js) → JSON Files → RBAS Wallet (WebSocket)
                   ←                    ←            ←
```

### Core Pages (4 Files)

| File | Purpose |
|------|---------|
| `categories.html` | Level 1 – displays all HKU categories as NFT cards with QR & hash |
| `items.html` | Level 2 unified grid for subcategories & items |
| `detail.html` | Unified detail & edit page for any NFT |
| `index_main.html` | Homepage – featured DAO card, search, and category preview |

---

## 📁 Project Structure

```
project-root/
├── server.js                  # Backend Express server (all APIs)
├── hku_init.js                # One‑time data generator
├── hku_dao.json               # DAO config (hash, shortlink)
├── hku_dao_queue.json         # Queue for blockchain sync
├── package.json               # Node.js dependencies
├── persistence/               # Wallet state persistence
│   └── wallet_state.json
├── uploads/                   # Temporary uploads (multer)
├── nft/
│   ├── index_main.html        # Homepage
│   ├── categories.html        # Level 1 list
│   ├── items.html             # Level 2 unified grid
│   ├── detail.html            # Unified detail + edit
│   ├── NFT_market.html        # Marketplace (buy/sell/list)
│   ├── portfolio.html         # User's owned NFTs
│   ├── ti_log.html            # Transaction log
│   ├── data/                  # Generated NFT data
│   │   ├── {id}_{name}/       # Category folders
│   │   │   ├── content.json
│   │   │   ├── content_log.json
│   │   │   ├── {sub_id}_{name}/  # Subcategory folders
│   │   │   │   ├── subcategory.json
│   │   │   │   ├── subcategory_log.json
│   │   │   │   ├── {item_id}_{name}/  # Item folders
│   │   │   │   │   ├── {item_id}_{name}.json
│   │   │   │   │   ├── {item_id}_{name}_log.json
│   ├── css/style.css          # Global styles
│   ├── js/                    # Frontend modules
│   ├── locales/               # i18n (en.json, zh.json)
│   └── image/                 # Logos and icons
├── wallet-auth.js             # RBAS wallet authentication
└── README.md                  # This file
```

---

## 🚀 Features

### Frontend
- **🏛️ Three‑Level NFT Hierarchy** – Categories → Subcategories → Items
- **🌐 Bilingual Interface** – English / Chinese toggle
- **📱 Fully Responsive** – Works on all devices
- **🔍 Search & QR Scan** – Find NFTs by name or QR code
- **📄 NFT Cards** – Each card shows QR code + blockchain hash
- **📊 Pagination** – 50 items per page + "Show All"
- **🎯 8 Filters** – Faculties, Main Campus, Centennial, Halls, Medical, Sports, History, Culture
- **🛒 NFT Marketplace** – Browse, buy, and sell NFTs
- **👛 Wallet Integration** – Login via RBAS wallet
- **📦 Portfolio Management** – View, list for sale, cancel, transfer NFTs
- **✏️ Content Management** – Edit descriptions, upload images/PDFs
- **📜 Transaction Logs** – Complete history for any NFT

### Backend
- **RESTful API** – Categories, subcategories, items, content, market, portfolio
- **Wallet Integration** – WebSocket connection to RBAS for blockchain operations
- **NFT Ownership** – Track ownership via transaction logs
- **File Storage** – JSON files for all NFT data
- **Content Upload** – Text, images, PDFs (multer)
- **Queue System** – `hku_dao_queue.json` for blockchain sync
- **Shortlink Generation** – Auto‑generate short URLs for NFTs
- **CORS Support** – Configured for local and production

---

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v16 or higher)
- RBAS backend (for wallet connection – optional in dev mode)

### Backend Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-repo/hku-dao.git
cd hku-dao

# 2. Install dependencies
npm install

# 3. Generate initial NFT data
node hku_init.js

# 4. Start the server
node server.js
```

### Frontend (Served by Backend)

The backend serves all frontend files automatically. Access:
```
http://localhost:5013/nft/index_main.html
```

### Environment Variables (`.env`)

```bash
PORT=5013
DEV_MODE=true          # true = wallet disabled, false = wallet enabled
WALLET_URL=ws://192.168.1.26:5000
```

### Development Mode

With `DEV_MODE=true`, the wallet connection is disabled – perfect for testing UI and APIs without blockchain transactions.

---

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| **Categories** |||
| GET | `/api/categories/list` | List all categories |
| GET | `/api/category/detail?id={id}` | Category detail |
| POST | `/api/category/add` | Create new category |
| **Subcategories** |||
| GET | `/api/subcategories/list/{categoryId}` | List subcategories |
| GET | `/api/subcategory/detail?id={id}` | Subcategory detail |
| POST | `/subcategory/{categoryId}/{categoryName}/subcategory` | Create subcategory |
| **Items** |||
| GET | `/api/items/list?subcategory_id={id}` | List items |
| GET | `/api/item/detail?id={id}` | Item detail |
| POST | `/subcategory/{categoryId}/{categoryName}/{subcategoryNumber}/{subcategoryName}/item` | Create item |
| **Market** |||
| GET | `/api/nfts/onsale` | List on‑sale NFTs |
| POST | `/api/nft/list` | List NFT for sale |
| POST | `/api/nft/buy` | Buy NFT |
| POST | `/api/nft/cancel-sale` | Cancel listing |
| **Portfolio** |||
| GET | `/api/user/nfts?wallet={address}` | Get user NFTs |
| POST | `/api/nft/transfer` | Transfer NFT |
| **Content** |||
| GET | `/api/content/list` | List attachments |
| POST | `/api/content/upload` | Upload file/text |
| DELETE | `/api/content/delete` | Delete attachment |
| **Other** |||
| GET | `/api/log/transaction` | Transaction log |
| POST | `/api/send-code` | Send verification code |
| POST | `/api/login` | Wallet login |
| GET | `/api/search?q={query}` | Search all levels |
| GET | `/api/wallet-state/status` | Wallet connection status |

---

## 🧪 Testing

### Manual Testing Flow

1. **Homepage** → `index_main.html`
2. **Browse Categories** → `categories.html`
3. **View Subcategories** → `items.html?level=category&id=1`
4. **View Items** → `items.html?level=subcategory&id=101`
5. **View Detail** → `detail.html?type=item&id=10101`
6. **Login** → Click "Login" → wallet‑auth modal
7. **Portfolio** → View owned NFTs → List for sale → Transfer
8. **Marketplace** → Buy NFTs → View transactions

### API Testing

You can run 
```
chmod +x test_api.sh
./test_api.sh
```
OR

```bash
# List categories
curl http://localhost:5013/api/categories/list

# Get category detail
curl "http://localhost:5013/api/category/detail?id=1"

# Get subcategories
curl http://localhost:5013/api/subcategories/list/1

# Get item detail
curl "http://localhost:5013/api/item/detail?id=10101"

# Search
curl "http://localhost:5013/api/search?q=architecture"

# Wallet status
curl http://localhost:5013/api/wallet-state/status
```

---

## 🛡️ Security

- **Wallet Authentication** – All sensitive actions require login
- **Ownership Checks** – Only NFT owners can edit content
- **Input Validation** – Basic validation on all forms
- **CORS** – Restricts access to allowed origins
- **RBAS Blockchain** – All transactions recorded on-chain

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
- **GitHub**: [https://github.com/NichoFedlim/hku-dao](https://github.com/NichoFedlim/hku-dao)

---

*Built with ❤️ for the HKU community.*
