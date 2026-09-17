# Развёртывание на Vercel + Railway (бесплатно)

## Фронтенд → Vercel

1. Залейте код на GitHub
2. В Vercel: Import Project, укажите репозиторий
3. **Root Directory**: `frontend`
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. **Environment Variables**:
   - `VITE_API_URL`: URL вашего бэкенда на Railway (например `https://arena-backend-production.up.railway.app`)

## Бэкенд → Railway

1. В Railway: New Project → Deploy from GitHub
2. **Root Directory**: `backend`
3. **Volume** (для SQLite):
   - Нажмите "New Volume"
   - Mount Path: `/data`
4. **Environment Variables**:
   - `DB_PATH`: `/data/arena.db`
   - `CORS_ORIGINS`: `https://ваш-домен.vercel.app`
   - `SECRET_KEY`: сгенерируйте случайную строку 32+ символа
   - `GIGACHAT_CREDENTIALS`: (опционально)
   - `GPT2GIGA_API_KEY`: (опционально)

## Важные замечания

### CORS
Фронтенд ходит на `/api/...`. В коде `api.js`:
```js
const BASE = import.meta.env.VITE_API_URL || '';
export async function api(url, opts) {
  const res = await fetch(`${BASE}${url}`, {...});
}
```
Поэтому `VITE_API_URL` должен быть **без** суффикса `/api` — код добавит сам.

### SQLite на Railway
Railway предоставляет ephemeral filesystem. Volume сохраняет данные между перезапусками, но при удалении проекта данные пропадут. Для демо/хакатона подходит.

### Лимиты
- Vercel Hobby: 100 ГБ-часов трафика/мес
- Railway: $5 кредит/мес (~500 часов работы бэкенда)

## Альтернатива: Render

Backend на Render (free tier):
1. New Web Service → Connect GitHub
2. Root Directory: `backend`
3. Build: `pip install -r requirements.txt`
4. Start: `gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 main:app`
5. Disk: добавить Persistent Disk для `/data`

## Проверка

После деплоя:
1. Откройте URL фронтенда (Vercel)
2. Залогиньтесь: `demo` / `demo`
3. Пройдите сценарий «Увольнение без конфликта»
4. Проверьте отчёт

Если API не отвечает — проверьте логи в Railway/Render и CORS.
