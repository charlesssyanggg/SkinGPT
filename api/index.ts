import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(cookieParser());

// 所有的 API 逻辑都放在这里或从这里导入
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: 'vercel' });
});

// 在 Vercel 中，我们不需要调用 app.listen()
// Vercel 会自动处理请求的分发
export default app;
