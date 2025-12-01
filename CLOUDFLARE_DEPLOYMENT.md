# Cloudflare Pages Deployment Guide

## การเตรียมโปรเจ็คสำหรับ Cloudflare Pages

โปรเจ็คนี้ถูกแปลงให้รองรับ Cloudflare Pages โดยใช้ `@cloudflare/next-on-pages` ซึ่งจะแปลง Next.js App Router และ API Routes ให้ทำงานบน Cloudflare Workers

## การเปลี่ยนแปลงที่สำคัญ

### 1. API Routes แปลงเป็น Edge Runtime
ทุก API routes ใน `/app/api/*` ได้ถูกแปลงให้ใช้ Edge Runtime:
- ✅ เพิ่ม `export const runtime = 'edge'` ในทุกไฟล์
- ✅ เปลี่ยนจาก `Buffer` เป็น `btoa()` สำหรับ base64 encoding
- ✅ ลบการใช้ Node.js modules: `fs`, `path`, `net`, `child_process`, `crypto`
- ✅ ใช้ Web APIs แทน: `fetch`, `TextEncoder`, `AbortController`

### 2. Services ที่ถูกปรับ
- **InfluxDB**: ใช้ HTTP API เท่านั้น (ไม่มี TCP check)
- **Grafana**: ใช้ HTTP health check
- **MQTT/Telegraf**: ไม่สามารถตรวจสอบแบบ TCP ได้ใน Edge Runtime
- **File Backups**: ถูกปิดใช้งาน (ใช้ Cloudflare R2 แทนถ้าต้องการ)

## ขั้นตอนการ Deploy

### ก่อนเริ่ม Deploy
1. ติดตั้ง dependencies ใหม่:
   ```bash
   npm install
   ```

2. ตรวจสอบว่า build ได้หรือไม่:
   ```bash
   npm run build
   ```

### วิธีที่ 1: Deploy ผ่าน Cloudflare Dashboard (แนะนำ)

1. **เตรียม GitHub Repository**
   ```bash
   git add .
   git commit -m "Convert to Cloudflare Pages compatible"
   git push origin main
   ```

2. **สร้าง Cloudflare Pages Project**
   - ไปที่ [Cloudflare Dashboard](https://dash.cloudflare.com)
   - เลือก **Pages** > **Create a project**
   - เชื่อมต่อ GitHub repository ของคุณ
   - ตั้งค่า Build:
     - **Build command**: `npx @cloudflare/next-on-pages`
     - **Build output directory**: `.vercel/output/static`
     - **Root directory**: `/` (หรือ path ไปยัง Next.js project)

3. **ตั้งค่า Environment Variables**
   
   ไปที่ **Settings** > **Environment variables** และเพิ่ม:
   
   **Production Variables:**
   ```
   INFLUX_HOST=https://your-influx-server.com
   INFLUX_ORG=K-Energy_Save
   INFLUX_BUCKET=k_db
   INFLUX_TOKEN=<your-secret-token>
   GRAFANA_URL=https://your-grafana-server.com
   ADMIN_WEBHOOK_TOKEN=<optional-webhook-secret>
   INFLUX_WRITE_TOKEN=<optional-write-secret>
   DEVICE_ALIASES={}
   NODE_ENV=production
   ```

4. **Deploy**
   - กด **Save and Deploy**
   - Cloudflare จะ build และ deploy ให้อัตโนมัติ

### วิธีที่ 2: Deploy ผ่าน Wrangler CLI

1. **ติดตั้ง Wrangler** (ถ้ายังไม่มี):
   ```bash
   npm install -g wrangler
   ```

2. **Login เข้า Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Build และ Deploy**:
   ```bash
   npm run deploy
   ```

4. **ตั้งค่า Secrets** (สำหรับ sensitive values):
   ```bash
   wrangler pages secret put INFLUX_TOKEN
   wrangler pages secret put ADMIN_WEBHOOK_TOKEN
   ```

### การตั้งค่า Custom Domain (kenergysaveadmin1.com)

1. ไปที่ Cloudflare Pages project ของคุณ
2. เลือก **Custom domains**
3. คลิก **Set up a custom domain**
4. ใส่ `kenergysaveadmin1.com`
5. Cloudflare จะสร้าง DNS records ให้อัตโนมัติ

หรือตั้งค่า DNS manually:
- ไปที่ **DNS** > **Records**
- เพิ่ม `CNAME` record:
  - Name: `@` (สำหรับ root domain)
  - Target: `<your-project>.pages.dev`
  - Proxy status: Proxied (🟠)

## การทดสอบก่อน Deploy

### ทดสอบ Local Development:
```bash
npm run dev
```
เปิด http://localhost:3001

### ทดสอบ Cloudflare Workers Local:
```bash
npm run preview
```
หรือ
```bash
npm run cf:dev
```

## ปัญหาที่อาจพบและวิธีแก้

### 1. API Routes ไม่ทำงาน
- ตรวจสอบว่าทุก route มี `export const runtime = 'edge'`
- ดูว่ามี Node.js APIs ที่ไม่รองรับหลงเหลืออยู่หรือไม่

### 2. Build Failed
```bash
# ลองลบ cache และ build ใหม่
rm -rf .next .vercel node_modules
npm install
npm run build
```

### 3. Environment Variables ไม่ทำงาน
- ตรวจสอบว่าตั้งค่าใน Cloudflare Dashboard แล้ว
- Environment variables ต้องตั้งทั้ง Production และ Preview environment

### 4. CORS Issues
เพิ่ม headers ใน `next.config.js`:
```javascript
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
      ],
    },
  ]
}
```

## Performance & Monitoring

### Cloudflare Analytics
- ดู real-time traffic ได้ที่ Cloudflare Dashboard > Analytics
- ตรวจสอบ error rate และ response time

### Workers Logs
```bash
wrangler pages deployment tail
```

## การ Rollback
ถ้ามีปัญหา สามารถ rollback ได้ที่:
- Cloudflare Dashboard > Pages > Deployments
- เลือก deployment เก่าและกด **Rollback to this deployment**

## ข้อจำกัดของ Edge Runtime

❌ **ไม่รองรับ:**
- File system access (`fs`, `path`)
- TCP/UDP connections (`net`, `dgram`)
- Child processes (`child_process`, `exec`)
- Node.js crypto (ใช้ Web Crypto API แทน)
- Local file uploads/downloads

✅ **รองรับ:**
- HTTP/HTTPS requests (`fetch`)
- Web Crypto API
- TextEncoder/TextDecoder
- JSON parsing
- Database connections ผ่าน HTTP

## Next Steps

1. ✅ Deploy ไปยัง Cloudflare Pages
2. ✅ ตั้งค่า custom domain `kenergysaveadmin1.com`
3. ✅ ตั้งค่า environment variables
4. ⚠️ ตรวจสอบ InfluxDB และ Grafana endpoints ว่า accessible จาก Cloudflare Workers หรือไม่
5. 🔒 เพิ่ม authentication/authorization ที่เหมาะสม
6. 📊 Setup monitoring และ alerting

## Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [@cloudflare/next-on-pages](https://github.com/cloudflare/next-on-pages)
- [Next.js Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
