# 港大道 (HKU DAO) – Frontend Refactor

To view: cmd + shift + v
This is the modern, bilingual frontend for the HKU DAO project, built on top of the RBAS blockchain. The code is modular, maintainable, and fully translatable (English / Chinese).

## Project Structure
├── index_main.html           # Homepage (updated links)
├── categories.html           # Level‑1 list (xingshi.html)
├── subcategories.html        # Level‑2 list (citang.html)
├── subcategory.html          # Level‑2 detail (shows items)
├── css/
│   └── style.css             # Global styles (all pages)
├── js/
│   ├── i18n.js               # Language loader & translation
│   ├── auth.js               # Wallet‑auth wrapper
│   ├── api.js                # API calls (with mock data fallback)
│   ├── components.js         # Card renderers, toast, pagination
│   └── main.js               # App initialisation & page routing
└── locales/
    ├── en.json               # English strings
    └── zh.json               # Chinese strings

citang_detail = subcategory.html -> Renamed to level‑2 detail page (also shows level‑3 items).
citang_member.html = items.html -> Renamed to level‑3 list (items under a subcategory).
member_detail.html = item.html -> Unified detail page for any level (we'll merge logic).
name.html = category.html -> Kept as level‑1 detail page (but we might merge into item.html later).
user.html = portfolio.html
index_bxt_group.html = group.html

## Key Features

- **Bilingual interface** – switch between English and Chinese instantly.
- **NFT marketplace** – browse, buy, and sell NFTs (connected to RBAS).
- **QR scanner** – scan NFT hashes to search or verify.
- **Admin capability** – logged-in users with appropriate permissions can add new categories (future).
- **Responsive** – works on all devices.

## Setup & Usage

1. Ensure the backend server is running (Node/Express with RBAS endpoints).
2. Place the `wallet-auth.js` file in the root (provided by RBAS).
3. Put all frontend files in your web server's document root.
4. Replace placeholder data in `main.js` (the `allCategories` array) with real API calls once backend endpoints are ready.
5. Customize images (e.g., `image/hku_logo.png`) and styles as needed.

## Next Steps

- Refactor other pages (`xingshi.html` → `categories.html`, `index_bxt_group.html` → `group.html`, etc.) using the same pattern.
- Implement the `/api/categories` endpoint on the backend to serve dynamic data.
- Build the "Add Category" admin page.
- Add more NFT metadata fields and improve the detail page.

## Notes

- The `wallet-auth.js` is unchanged – it provides login via the RBAS wallet system.
- This refactor focuses on the frontend; backend APIs remain as they were.

---

Enjoy building HKU DAO!