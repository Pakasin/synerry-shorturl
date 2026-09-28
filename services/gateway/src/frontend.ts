// นำเข้าตัวตรวจว่าไฟล์มีอยู่จริง
import { existsSync, readFileSync } from 'node:fs';
// นำเข้าตัวจัดการ path ให้ถูกต้องทุกระบบปฏิบัติการ
import { join, resolve } from 'node:path';
// นำเข้าชนิดข้อมูลของ Hono app
import type { Hono } from 'hono';
// นำเข้าตัวเสิร์ฟไฟล์ static บน Node.js
import { serveStatic } from '@hono/node-server/serve-static';
// นำเข้า logger
import { createLogger } from '@synerry/shared';
// นำเข้าตัวช่วยสร้าง error
import { apiError } from './types';

// สร้าง logger ของ gateway
const log = createLogger('gateway');

// path ที่เป็นของ API ห้ามส่งหน้าเว็บกลับไปแทน
const API_PATH = /^\/(api|internal)(\/|$)/;

// ผูกการเสิร์ฟหน้าเว็บ React ที่ build แล้ว ให้อยู่โดเมนเดียวกับ API (session cookie จึงใช้ได้)
export function mountFrontend(app: Hono<any>) {
  // โฟลเดอร์ผลลัพธ์ของ vite build ค่าเริ่มต้นคือ frontend/dist ที่ root ของโปรเจกต์
  const root = resolve(process.env.FRONTEND_DIST ?? '../../frontend/dist');
  // ไฟล์หน้าเว็บหลัก
  const indexFile = join(root, 'index.html');
  // ตอน dev ยังไม่ได้ build ให้ข้ามไป (หน้าเว็บตอน dev เสิร์ฟโดย Vite ที่ port 5173)
  if (!existsSync(indexFile)) {
    log.info('frontend build not found, not serving the web app', { root });
    return;
  }
  // อ่าน index.html เก็บไว้ในหน่วยความจำ ใช้ตอบทุก path ของหน้าเว็บ
  const indexHtml = readFileSync(indexFile, 'utf8');
  // แจ้งว่าจะเสิร์ฟหน้าเว็บ
  log.info('serving web app', { root });

  // ไฟล์ใน /assets มีรหัสเนื้อหาอยู่ในชื่อไฟล์ (vite ตั้งให้) จึง cache ได้ 1 ปีโดยไม่ต้องกลัวได้ไฟล์เก่า
  app.use('/assets/*', async (c, next) => {
    await next();
    // ใส่ header cache เฉพาะเมื่อเจอไฟล์
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  // เสิร์ฟไฟล์ที่มีอยู่จริงในโฟลเดอร์ dist ถ้าไม่เจอจะไปต่อที่ handler ถัดไป
  app.use('*', serveStatic({ root }));

  // path อื่นทั้งหมดของหน้าเว็บ (เช่น /links/5) ตอบ index.html ให้ React Router จัดการต่อ
  app.get('*', (c) => {
    // ถ้าเป็น path ของ API ที่ไม่มีอยู่จริง ตอบ 404 เป็น JSON ไม่ใช่หน้าเว็บ
    if (API_PATH.test(c.req.path)) return c.json(apiError('not_found', 'Route not found'), 404);
    // index.html ห้าม cache เพื่อให้ผู้ใช้ได้เวอร์ชันใหม่ทันทีหลัง deploy
    c.header('Cache-Control', 'no-cache');
    // ตอบหน้าเว็บ
    return c.html(indexHtml);
  });
}
