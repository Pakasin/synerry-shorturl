-- สร้าง user ของ gateway service ใช้เชื่อมต่อได้เฉพาะ gateway_db
CREATE USER gateway_user WITH PASSWORD 'gateway_pass';
-- สร้าง database ของ gateway โดยให้ gateway_user เป็นเจ้าของ
CREATE DATABASE gateway_db OWNER gateway_user;
-- ปิดสิทธิ์ไม่ให้ user อื่นทั่วไปเชื่อมต่อ gateway_db ได้
REVOKE CONNECT ON DATABASE gateway_db FROM PUBLIC;

-- สร้าง user ของ analytics service ใช้เชื่อมต่อได้เฉพาะ analytics_db
CREATE USER analytics_user WITH PASSWORD 'analytics_pass';
-- สร้าง database ของ analytics โดยให้ analytics_user เป็นเจ้าของ
CREATE DATABASE analytics_db OWNER analytics_user;
-- ปิดสิทธิ์ไม่ให้ user อื่นทั่วไปเชื่อมต่อ analytics_db ได้
REVOKE CONNECT ON DATABASE analytics_db FROM PUBLIC;

-- สร้าง database แยกสำหรับรัน test ของ gateway เพื่อไม่ให้ test ไปลบข้อมูลตัวอย่าง
CREATE DATABASE gateway_test OWNER gateway_user;
-- ปิดสิทธิ์ไม่ให้ user อื่นทั่วไปเชื่อมต่อ gateway_test ได้
REVOKE CONNECT ON DATABASE gateway_test FROM PUBLIC;

-- สร้าง database แยกสำหรับรัน test ของ analytics
CREATE DATABASE analytics_test OWNER analytics_user;
-- ปิดสิทธิ์ไม่ให้ user อื่นทั่วไปเชื่อมต่อ analytics_test ได้
REVOKE CONNECT ON DATABASE analytics_test FROM PUBLIC;
