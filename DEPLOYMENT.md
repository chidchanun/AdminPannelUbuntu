# Ubuntu Admin Panel Deployment

คู่มือนี้สำหรับรัน Ubuntu Admin Panel บน Ubuntu server แบบ production ด้วย PAM login, systemd, nginx, HTTPS, PM2 log access, Docker sandbox Web Terminal, audit logs, backup/restore, และสิทธิ์ sudo ที่จำเป็นเท่านั้น

## 1. Prerequisites

ติดตั้ง package พื้นฐาน:

```bash
sudo apt update
sudo apt install -y git build-essential python3 make g++ nginx ufw docker.io
sudo systemctl enable --now docker
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

ให้ user ที่รัน panel ใช้ Docker ได้ ถ้าใช้ user `ChidchanunServer`:

```bash
sudo usermod -aG docker ChidchanunServer
```

จากนั้น logout/login ใหม่ หรือ restart service/session แล้วตรวจสอบ:

```bash
docker ps
```

หมายเหตุ: user ที่อยู่ในกลุ่ม `docker` มีสิทธิ์สูงมาก ควรเปิด panel เฉพาะ admin และควรใช้ HTTPS + 2FA + firewall/Cloudflare Access

## 2. Install App

```bash
git clone <your-repo-url> /opt/ubuntu-admin-panel
cd /opt/ubuntu-admin-panel
npm install
npm install authenticate-pam
npm install ws node-pty @xterm/xterm @xterm/addon-fit
npm run build
```

ถ้า `authenticate-pam` หรือ `node-pty` build ไม่ผ่าน ให้ตรวจสอบว่า server มี `build-essential`, `python3`, `make`, `g++` และ Node.js ตรงกับเครื่อง production จริง

## 3. Package Scripts

Interactive Web Terminal ต้องใช้ custom server เพื่อ handle WebSocket upgrade ไปที่ `/api/terminal/pty`

แก้ `package.json`:

```json
"scripts": {
  "dev": "NODE_ENV=development node server.cjs",
  "build": "next build",
  "start": "NODE_ENV=production node server.cjs",
  "lint": "eslint"
}
```

## 4. Environment

สร้างไฟล์ `.env.production` หรือใส่ env ใน systemd unit:

```bash
AUTH_SECRET=change-this-to-a-long-random-secret
LOGIN_ALLOWED_USERS=ChidchanunServer
ADMIN_USERS=ChidchanunServer
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

# Docker sandbox Web Terminal
TERMINAL_CONTAINER_IMAGE=admin-panel-terminal:chidchanun
TERMINAL_CONTAINER_USERNAME=ChidchanunServer
TERMINAL_CONTAINER_HOME=/home/ChidchanunServer
TERMINAL_CONTAINER_MOUNT=/home/ChidchanunServer
TERMINAL_CONTAINER_NETWORK=none
```

ถ้า terminal ต้องใช้ internet เช่น `git clone`, `npm install`, `curl` ให้เปลี่ยนเป็น:

```bash
TERMINAL_CONTAINER_NETWORK=bridge
```

แนะนำให้จำกัดสิทธิ์ตาม role:

```bash
FILE_WRITE_USERS=ChidchanunServer
SERVICE_RESTART_USERS=ChidchanunServer
SERVICE_CONTROL_USERS=ChidchanunServer
FIREWALL_USERS=ChidchanunServer
```

สร้าง directory สำหรับข้อมูล runtime:

```bash
sudo mkdir -p /var/lib/ubuntu-admin /var/log/ubuntu-admin /var/backups/ubuntu-admin/files
sudo chown -R ChidchanunServer:ChidchanunServer /var/lib/ubuntu-admin /var/log/ubuntu-admin /var/backups/ubuntu-admin
```

ถ้าใช้ Linux user อื่นรัน panel ให้เปลี่ยน `ChidchanunServer` เป็น user นั้น

## 5. PAM Login

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

## 6. Build Docker Sandbox Terminal Image

สร้างไฟล์ `Dockerfile.terminal` ที่ root project:

```bash
cd /opt/ubuntu-admin-panel
nano Dockerfile.terminal
```

ใส่:

```dockerfile
FROM ubuntu:24.04

ARG USERNAME=ChidchanunServer
ARG UID=1000
ARG GID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color

RUN apt-get update && apt-get install -y \
    bash \
    nano \
    vim \
    less \
    procps \
    htop \
    iproute2 \
    iputils-ping \
    curl \
    git \
    ca-certificates \
    locales \
    nodejs \
    npm \
    passwd \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    if getent group "${GID}" >/dev/null; then \
      OLD_GROUP="$(getent group "${GID}" | cut -d: -f1)"; \
      if [ "${OLD_GROUP}" != "${USERNAME}" ]; then \
        groupmod -n "${USERNAME}" "${OLD_GROUP}" || true; \
      fi; \
    else \
      groupadd --gid "${GID}" "${USERNAME}"; \
    fi; \
    if getent passwd "${UID}" >/dev/null; then \
      OLD_USER="$(getent passwd "${UID}" | cut -d: -f1)"; \
      if [ "${OLD_USER}" != "${USERNAME}" ]; then \
        usermod \
          --login "${USERNAME}" \
          --home "/home/${USERNAME}" \
          --move-home \
          --shell /bin/bash \
          "${OLD_USER}"; \
      fi; \
      usermod --gid "${GID}" "${USERNAME}"; \
    else \
      useradd \
        --uid "${UID}" \
        --gid "${GID}" \
        --home-dir "/home/${USERNAME}" \
        --create-home \
        --shell /bin/bash \
        "${USERNAME}"; \
    fi; \
    mkdir -p "/home/${USERNAME}"; \
    chown -R "${UID}:${GID}" "/home/${USERNAME}"

RUN echo "export PS1='\u@ubuntu:\w\$ '" >> /home/${USERNAME}/.bashrc \
    && echo "cd /home/${USERNAME}" >> /home/${USERNAME}/.bashrc \
    && chown ${UID}:${GID} /home/${USERNAME}/.bashrc

USER ${USERNAME}
WORKDIR /home/${USERNAME}

CMD ["/bin/bash", "-l"]
```

Build image:

```bash
docker build --no-cache \
  -f Dockerfile.terminal \
  -t admin-panel-terminal:chidchanun \
  --build-arg USERNAME=ChidchanunServer \
  --build-arg UID=$(id -u ChidchanunServer) \
  --build-arg GID=$(id -g ChidchanunServer) \
  .
```

ทดสอบ image ก่อนเปิดใช้งานจริง:

```bash
docker run --rm -it \
  --user $(id -u ChidchanunServer):$(id -g ChidchanunServer) \
  --mount type=bind,source=/home/ChidchanunServer,target=/home/ChidchanunServer \
  --workdir /home/ChidchanunServer \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  --tmpfs /run:rw,nosuid,nodev,size=64m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 256 \
  --memory 512m \
  --cpus 1 \
  admin-panel-terminal:chidchanun \
  /bin/bash -l
```

ใน container ลอง:

```bash
whoami
pwd
nano test.txt
```

ควรได้:

```text
ChidchanunServer
/home/ChidchanunServer
```

## 7. systemd Service

สร้าง service:

```bash
sudo nano /etc/systemd/system/ubuntu-admin-panel.service
```

ตัวอย่างถ้ารันด้วย user `ChidchanunServer`:

```ini
[Unit]
Description=Ubuntu Admin Panel
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ChidchanunServer
Group=ChidchanunServer
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

ถ้าใช้ PM2 แทน systemd:

```bash
npm run build
pm2 delete admin-panel
PORT=3001 pm2 start npm --name admin-panel -- start
pm2 save
```

## 8. Nginx + HTTPS

ตั้ง reverse proxy พร้อม WebSocket headers:

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
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

เปิด HTTPS ด้วย certbot หรือระบบ certificate ที่คุณใช้ แล้วตั้ง:

```bash
AUTH_COOKIE_SECURE=true
```

## 9. sudoers For Service And Firewall

ถ้าจะให้ panel restart service, block UFW, install package หรือ run update/upgrade ได้ ต้องใช้ sudo แบบไม่ถามรหัสเฉพาะ command ที่จำเป็น:

```bash
sudo visudo -f /etc/sudoers.d/ubuntu-admin-panel
```

ตัวอย่าง:

```text
ChidchanunServer ALL=(root) NOPASSWD: /bin/systemctl start nginx.service, /bin/systemctl stop nginx.service, /bin/systemctl restart nginx.service
ChidchanunServer ALL=(root) NOPASSWD: /bin/systemctl start mysql.service, /bin/systemctl stop mysql.service, /bin/systemctl restart mysql.service
ChidchanunServer ALL=(root) NOPASSWD: /usr/sbin/ufw deny from *
ChidchanunServer ALL=(root) NOPASSWD: /usr/sbin/ufw delete deny from *
```

เพิ่ม service และ command เท่าที่ต้องใช้จริงเท่านั้น ถ้าเห็น error `sudo: a password is required` แปลว่าสิทธิ์ sudoers ยังไม่ตรง command ที่ panel เรียก

## 10. PM2 Logs

ถ้าเว็บอื่นรันด้วย PM2 เช่น ERP ที่ `http://localhost:3001`:

1. ไปที่ Health
2. เพิ่ม website target
3. เลือก PM2 logs
4. ใส่ PM2 process name ให้ตรงกับ `pm2 list`

ถ้า panel มองไม่เห็น PM2 process ให้ตรวจสอบว่า user ที่รัน panel มี `PM2_HOME` เดียวกับ user ที่รัน PM2 หรือกำหนด env:

```bash
PM2_HOME=/home/ChidchanunServer/.pm2
PM2_PATH=/usr/bin/pm2
```

## 11. Backup And Restore

หน้า Settings มี backup 2 แบบ:

- `Backup Settings` สำหรับ service allowlists และ security settings
- `System Backup` สำหรับ settings, health targets, security blocks, และ optional health history/audit log

Audit log export ได้เพื่อเก็บหลักฐาน แต่ restore จะไม่เขียนทับ audit log เดิม
ก่อน restore ระบบจะแสดง preview ว่า backup มี section อะไรบ้าง และต้องกดยืนยันอีกชั้น

แนะนำให้เก็บไฟล์ backup นอก server เป็นระยะ โดยเฉพาะก่อนแก้ sudoers, PAM, Docker terminal, firewall, หรือ service allowlists

## 12. Alerts And Versions

Alert webhooks ตั้งค่าได้ที่ Settings:

```text
Webhook URL: Discord webhook, LINE relay, Telegram relay, or any JSON endpoint
Minimum severity: critical, warning, or info
```

Payload ที่ส่งมี `content`, `text`, `title`, และ `notification` เพื่อให้ต่อกับ Discord ได้ง่าย ถ้าใช้ LINE/Telegram แนะนำทำ relay เล็ก ๆ รับ JSON แล้วแปลงไปยัง API ของ provider นั้น

หน้า Editor จะสร้าง backup ก่อน save ทุกครั้ง และสามารถ restore version เก่าจากหน้าเว็บได้ ถ้าใช้ `FILE_BACKUP_DIR` แบบรวมศูนย์ ควรกำหนด directory ที่ user ของ panel อ่าน/เขียนได้:

```bash
sudo mkdir -p /var/backups/ubuntu-admin/files
sudo chown -R ChidchanunServer:ChidchanunServer /var/backups/ubuntu-admin
```

## 13. Troubleshooting

### `PAM authentication is not configured`

- ตรวจสอบว่า `authenticate-pam` ติดตั้งบน server แล้ว
- ตรวจสอบ `serverExternalPackages` ใน `next.config.mjs`
- ตรวจสอบ `/etc/pam.d/nextjs`

### Redirect กลับเป็น localhost

- เช็ก reverse proxy headers `Host` และ `X-Forwarded-Proto`
- เข้าเว็บด้วย domain/IP เดียวกับที่ต้องการให้ browser เก็บ cookie

### Cookie ไม่ถูกบันทึก

- ถ้าใช้ HTTPS ให้ `AUTH_COOKIE_SECURE=true`
- ถ้าใช้ HTTP ระหว่างทดสอบให้ `AUTH_COOKIE_SECURE=false`
- อย่าสลับเข้าเว็บระหว่าง `localhost`, IP, และ domain ใน session เดียวกัน

### WebSocket terminal ไม่เชื่อมต่อ

- ตรวจว่า `package.json` ใช้ `node server.cjs` ไม่ใช่ `next start`
- ตรวจว่า nginx มี `Upgrade` และ `Connection "upgrade"`
- ดู log ด้วย `pm2 logs admin-panel` หรือ `journalctl -u ubuntu-admin-panel -f`

### Docker terminal เปิดไม่ได้

ตรวจ Docker permission:

```bash
docker ps
```

ตรวจ image:

```bash
docker images | grep admin-panel-terminal
```

ลอง run เอง:

```bash
docker run --rm -it admin-panel-terminal:chidchanun /bin/bash -l
```

ถ้าเจอ `permission denied` ให้ตรวจว่า user ที่รัน panel อยู่ใน group `docker` และได้ login session ใหม่แล้ว

### `useradd: UID 1000 is not unique`

ใช้ `Dockerfile.terminal` ในคู่มือนี้ เพราะมี logic rename user/group เดิมใน `ubuntu:24.04` ที่อาจใช้ UID 1000 อยู่แล้ว

### PM2 logs ไม่ขึ้น

- ตรวจ process name ด้วย `pm2 list`
- ตรวจ `PM2_HOME`
- ตรวจว่า user ที่รัน panel อ่าน PM2 log files ได้

### UFW หรือ systemctl ถาม password

- เพิ่ม sudoers แบบ `NOPASSWD` เฉพาะ command ที่ต้องใช้
- ทดสอบด้วย user ที่รัน panel: `sudo -n /bin/systemctl restart nginx.service`

## Production checklist

- ใช้ HTTPS
- ตั้ง `AUTH_SECRET` ยาวและไม่ซ้ำ
- จำกัด `LOGIN_ALLOWED_USERS` และ role env
- เปิด 2FA ให้ admin ทุกคน
- ตั้ง firewall หรือ Cloudflare Access ให้ panel เปิดเฉพาะ IP/user ที่ไว้ใจ
- ใช้ Docker sandbox terminal แทน host shell โดยตรง
- จำกัด `TERMINAL_CONTAINER_MOUNT` ให้แคบที่สุด เช่น `/home/ChidchanunServer`
- ใช้ `TERMINAL_CONTAINER_NETWORK=none` ถ้าไม่จำเป็นต้องออก internet
- สำรองข้อมูลจาก `System Backup`
- ตรวจ `/audit` หลังทำ action สำคัญ
