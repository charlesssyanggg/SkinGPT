import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(cookieParser());

// API 路由
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', firebase: 'connected' });
});

// 在 Vercel 环境下，我们主要导出这个 app
// 静态资源由 Vercel 的路由配置处理
export default app;
