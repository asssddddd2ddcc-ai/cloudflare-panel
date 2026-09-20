# Cloudflare Panel

نسخه ساده برای Deploy مستقیم با Cloudflare Workers.

## فایل‌ها
- `src/worker.js` — Worker + رابط کاربری داخل یک فایل
- `wrangler.toml` — تنظیمات Worker
- `package.json` — Wrangler

## Secret
در Cloudflare Worker یک Secret با نام `CF_API_TOKEN` بسازید.

## Deploy
`npx wrangler deploy`
