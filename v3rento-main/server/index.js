/* Главный entry: Express, статика, API, авторизация. */
import './env.js'; // ПЕРВЫМ — грузит .env.local в process.env
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { sessionMiddleware, requireAuth } from './auth.js';
import { withTenantContext, waitDb } from './db.js';
import { securityHeaders, verifyOrigin } from './security.js';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import costumesRoutes from './routes/costumes.js';
import clientsRoutes from './routes/clients.js';
import ordersRoutes from './routes/orders.js';
import miscRoutes from './routes/misc.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

const app = express();
app.disable('x-powered-by');       // не афишируем стек
app.set('trust proxy', 1);         // Railway — один прокси-хоп: даёт реальный req.ip и https

app.use(securityHeaders);          // CSP/HSTS/anti-clickjacking на каждый ответ
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

// ===== API =================================================================
app.use('/api', verifyOrigin);     // CSRF: изменяющие запросы только с нашего Origin
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes); // приём заявок — публичный (GET внутри защищён)

// Все остальные API требуют авторизации
app.use('/api', requireAuth);

// Тенант-контекст на весь запрос: закрепляем одно соединение и ставим app.tenant_id
// (для RLS). Соединение держим открытым до конца ответа, затем возвращаем в пул.
app.use('/api', (req, res, next) => {
  withTenantContext(req.tenantId, false, () => new Promise((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    next();
  })).catch(next);
});

app.use('/api/costumes', costumesRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api', miscRoutes); // dashboard/, transactions, notifications, settings, team, calendar
app.use('/api/admin', adminRoutes); // консоль оператора: создание аккаунтов, заявки, список прокатов

// 404 для несуществующих API
app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

// ===== Статика =============================================================
// ВАЖНО: НЕ раздаём корень проекта целиком — иначе /server/*, /db/*,
// /scripts/*, package.json и .env.local становятся доступны по HTTP.
// Раздаём только заведомо публичные папки и конкретные HTML-страницы.

// Публичные ассеты (секретов не содержат) — без авторизации
app.use('/css', express.static(join(ROOT, 'css')));
app.use('/js', express.static(join(ROOT, 'js')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Публичные страницы (без авторизации)
app.get('/login.html', (_req, res) => res.sendFile(join(ROOT, 'login.html')));
app.get('/register.html', (_req, res) => res.sendFile(join(ROOT, 'register.html')));
app.get('/join.html', (_req, res) => res.sendFile(join(ROOT, 'join.html')));

// Нет сессии → на страницу входа (для HTML-страниц приложения)
function requireAuthHtml(req, res, next) {
  if (!req.session) return res.redirect('/login.html');
  next();
}

// Защищённые SPA-страницы (desktop `/` и mobile `/m/`)
app.get('/', requireAuthHtml, (_req, res) => res.sendFile(join(ROOT, 'index.html')));
app.get('/admin.html', requireAuthHtml, (_req, res) => res.sendFile(join(ROOT, 'admin.html'))); // консоль оператора (API сам проверяет платформ-админа)
app.use('/m', requireAuthHtml, express.static(join(ROOT, 'm'), { index: 'index.html' }));

// Всё остальное — 404. Корень проекта по HTTP недоступен.
app.use((_req, res) => res.status(404).send('Not found'));

// Глобальный error handler. Детали пишем в лог сервера, наружу — обобщённо
// (в проде не раскрываем стек/сообщения ошибок клиенту).
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const body = { ok: false, error: 'internal_error' };
  if (process.env.NODE_ENV !== 'production') body.message = err.message;
  res.status(500).json(body);
});

await waitDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎭 Rento — http://0.0.0.0:${PORT}\n`);
});
