// นำเข้าโหมดตรวจโค้ดเข้มงวดของ React (ช่วยหาปัญหาตอน dev)
import { StrictMode } from 'react';
// นำเข้าตัววาดหน้าเว็บลงใน DOM
import { createRoot } from 'react-dom/client';
// นำเข้าแอปหลัก
import { App } from './App';
// นำเข้า CSS ทั้งหมด (Tailwind)
import './index.css';

// วาดแอปลงใน <div id="root"> ของ index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
