# Ubuntu Admin Panel Deployment

คู่มือนี้สำหรับรัน Ubuntu Admin Panel บน Ubuntu server แบบ production ด้วย PAM login, systemd, nginx, HTTPS, PM2 log access, และสิทธิ์ sudo ที่จำเป็นเท่านั้น

## 1. Prerequisites

ติดตั้ง package พื้นฐาน:

```bash
sudo apt update
sudo apt install -y git build-essential nginx ufw
```

ติดตั้ง Node.js เวอร์ชันที่ Next.js 16 รองรับ แล้วตรวจสอบ:

```bash
node -v
npm -v
```

ถ้าจะดู process/log ของเว็บอื่นที่รันด้วย PM2:

```bash
npm install -g pm2
```

## 2. Install App

```bash
git clone <your-repo-url> /opt/ubuntu-admin-panel
cd /opt/ubuntu-admin-panel
npm install
npm install authenticate-pam
npm run build
```

ถ้า `authenticate-pam` build ไม่ผ่าน ให้ตรวจสอบว่า server มี `build-essential` และ Node.js ตรงกับเครื่อง production จริง

## 3. Environment

สร้างไฟล์ `.env.production` หรือใส่ env ใน systemd unit:

```bash
AUTH_SECRET=change-this-to-a-long-random-secret
LOGIN_ALLOWED_USERS=yourUbuntuUser
ADMIN_USERS=yourUbuntuUser
PAM_SERVICE=nextjs
AUTH_COOKIE_SECURE=true

FILE_BROWSER_ROOT=/home
ADMIN_SETTINGS_PATH=/var/lib/ubuntu-admin/admin-settings.json
SECURITY_BLOCK_STORE_PATH=/var/lib/ubuntu-admin/security-blocks.json
HEALTH_HISTORY_PATH=/var/lib/ubuntu-admin/health-history.json
AUDIT_LOG_PATH=/var/log/ubuntu-admin/audit.log
FILE_BACKUP_DIR=/var/backups/ubuntu-admin/files

HEALTH_ALERT_FAILURE_STREAK=3
HEALTH_ALERT_LATENCY_MS=2000
HEALTH_HISTORY_MAX_AGE_HOURS=48
HEALTH_HISTORY_MAX_ENTRIES=2500
```

แนะนำให้จำกัดสิทธิ์ตาม role:

```bash
FILE_WRITE_USERS=yourUbuntuUser
SERVICE_RESTART_USERS=yourUbuntuUser
SERVICE_CONTROL_USERS=yourUbuntuUser
FIREWALL_USERS=yourUbuntuUser
```

สร้าง directory สำหรับข้อมูล runtime:

```bash
sudo mkdir -p /var/lib/ubuntu-admin /var/log/ubuntu-admin /var/backups/ubuntu-admin/files
sudo chown -R ubuntu-admin:ubuntu-admin /var/lib/ubuntu-admin /var/log/ubuntu-admin /var/backups/ubuntu-admin
```

เปลี่ยน `ubuntu-admin` เป็น Linux user ที่ใช้รัน panel

## 4. PAM Login

สร้าง PAM service ตามค่า `PAM_SERVICE=nextjs`:

```bash
sudo nano /etc/pam.d/nextjs
```

ใส่:

```text
auth    include common-auth
account include common-account
```

ระบบจะ login ด้วย user/password ของ Ubuntu server และยังถูกจำกัดด้วย `LOGIN_ALLOWED_USERS`

## 5. systemd Service

สร้าง service:

```bash
sudo nano /etc/systemd/system/ubuntu-admin-panel.service
```

ตัวอย่าง:

```ini
[Unit]
Description=Ubuntu Admin Panel
After=network.target

[Service]
Type=simple
User=ubuntu-admin
Group=ubuntu-admin
WorkingDirectory=/opt/ubuntu-admin-panel
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/ubuntu-admin-panel/.env.production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

เปิดใช้งาน:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ubuntu-admin-panel
sudo systemctl status ubuntu-admin-panel
```

## 6. Nginx + HTTPS

ตั้ง reverse proxy:

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

เปิด HTTPS ด้วย certbot หรือระบบ certificate ที่คุณใช้ แล้วตั้ง `AUTH_COOKIE_SECURE=true`

## 7. sudoers For Service And Firewall Actions

ถ้าจะให้ panel restart service หรือ block UFW ได้ ต้องใช้ sudo แบบไม่ถามรหัสเฉพาะ command ที่จำเป็น:

```bash
sudo visudo -f /etc/sudoers.d/ubuntu-admin-panel
```

ตัวอย่าง:

```text
ubuntu-admin ALL=(root) NOPASSWD: /bin/systemctl start nginx.service, /bin/systemctl stop nginx.service, /bin/systemctl restart nginx.service
ubuntu-admin ALL=(root) NOPASSWD: /bin/systemctl start mysql.service, /bin/systemctl stop mysql.service, /bin/systemctl restart mysql.service
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw deny from *
ubuntu-admin ALL=(root) NOPASSWD: /usr/sbin/ufw delete deny from *
```

เพิ่ม service เท่าที่ต้องใช้จริงเท่านั้น ถ้าเห็น error `sudo: a password is required` แปลว่าสิทธิ์ sudoers ยังไม่ตรง command ที่ panel เรียก

## 8. PM2 Logs

ถ้าเว็บอื่นรันด้วย PM2 เช่น ERP ที่ `http://localhost:3001`:

1. ไปที่ Health
2. เพิ่ม website target
3. เลือก PM2 logs
4. ใส่ PM2 process name ให้ตรงกับ `pm2 list`

ถ้า panel มองไม่เห็น PM2 process ให้ตรวจสอบว่า user ที่รัน panel มี `PM2_HOME` เดียวกับ user ที่รัน PM2 หรือกำหนด env:

```bash
PM2_HOME=/home/yourUbuntuUser/.pm2
PM2_PATH=/usr/bin/pm2
```

## 9. Backup And Restore

หน้า Settings มี backup 2 แบบ:

- `Backup Settings` สำหรับ service allowlists และ security settings
- `System Backup` สำหรับ settings, health targets, security blocks, และ optional health history/audit log

Audit log export ได้เพื่อเก็บหลักฐาน แต่ restore จะไม่เขียนทับ audit log เดิม

แนะนำให้เก็บไฟล์ backup นอก server เป็นระยะ โดยเฉพาะก่อนแก้ sudoers, firewall, หรือ service allowlists

## 10. Troubleshooting

`PAM authentication is not configured`

- ตรวจสอบว่า `authenticate-pam` ติดตั้งบน server แล้ว
- ตรวจสอบ `serverExternalPackages` ใน `next.config.mjs`
- ตรวจสอบ `/etc/pam.d/nextjs`

Redirect กลับเป็น localhost

- เช็ก reverse proxy headers `Host` และ `X-Forwarded-Proto`
- เข้าเว็บด้วย domain/IP เดียวกับที่ต้องการให้ browser เก็บ cookie

Cookie ไม่ถูกบันทึก

- ถ้าใช้ HTTPS ให้ `AUTH_COOKIE_SECURE=true`
- ถ้าใช้ HTTP ระหว่างทดสอบให้ `AUTH_COOKIE_SECURE=false`
- อย่าสลับเข้าเว็บระหว่าง `localhost`, IP, และ domain ใน session เดียวกัน

PM2 logs ไม่ขึ้น

- ตรวจ process name ด้วย `pm2 list`
- ตรวจ `PM2_HOME`
- ตรวจว่า user ที่รัน panel อ่าน PM2 log files ได้

UFW หรือ systemctl ถาม password

- เพิ่ม sudoers แบบ `NOPASSWD` เฉพาะ command ที่ต้องใช้
- ทดสอบด้วย user ที่รัน panel: `sudo -n /bin/systemctl restart nginx.service`

Production checklist:

- ใช้ HTTPS
- ตั้ง `AUTH_SECRET` ยาวและไม่ซ้ำ
- จำกัด `LOGIN_ALLOWED_USERS` และ role env
- ตั้ง firewall ให้ panel เปิดเฉพาะ IP ที่ไว้ใจถ้าเป็นไปได้
- สำรองข้อมูลจาก `System Backup`
- ตรวจ `/audit` หลังทำ action สำคัญ
