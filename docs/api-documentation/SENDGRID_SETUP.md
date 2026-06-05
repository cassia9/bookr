# SendGrid 郵件服務配置指南

## 步驟 1️⃣：建立 SendGrid 帳號

### 1. 註冊 SendGrid
```
https://sendgrid.com/
→ Sign up (免費方案)
```

### 2. 驗證郵件
完成註冊並驗證你的郵件地址

---

## 步驟 2️⃣：生成 API 密鑰

### 1. 進入 Settings > API Keys
```
SendGrid Dashboard
→ Settings (左下齒輪)
→ API Keys
```

### 2. 建立新的 API Key
- 點擊 **"Create API Key"**
- 名稱：`supabase-booking-system`
- 權限：選擇 **"Restricted Access"**
  - ✅ Mail Send (完整存取)
  - 其他都不需要

### 3. 複製 API Key
```
例如：SG.1234567890abcdef...
```

**重要：** 這個 key 只會顯示一次，保存好它！

---

## 步驟 3️⃣：驗證寄件者郵件

### 1. 進入 Settings > Sender Authentication
```
SendGrid Dashboard
→ Settings
→ Sender Authentication
```

### 2. 驗證單一寄件者
- 點擊 **"Verify a Single Sender"**
- 填入你的信息：
  ```
  From Name: 預約系統
  From Email: your-email@example.com  (你的郵件)
  Reply To: support@your-domain.com   (或使用你的郵件)
  ```

### 3. 確認驗證郵件
SendGrid 會發送驗證郵件到你的信箱，點擊確認連結

---

## 步驟 4️⃣：在 Supabase 配置環境變數

### 1. 登入 Supabase Dashboard
```
https://app.supabase.com
→ 你的項目
→ Settings (左下齒輪)
→ Environment (or Secrets)
```

### 2. 新增環境變數
新增以下變數：

```
SENDGRID_API_KEY = SG.你複製的key...

SENDGRID_FROM_EMAIL = 你驗證的郵件地址
例：noreply@your-store.com

SENDGRID_REPLY_EMAIL = 回覆郵件
例：support@your-store.com
```

### 3. 儲存設定

---

## 步驟 5️⃣：部署 Edge Function

### 1. 確認 Function 文件位置
```
/Users/CL/Documents/預約系統/supabase/functions/send-invitation-email/index.ts
```

### 2. 部署到 Supabase
```bash
cd /Users/CL/Documents/預約系統

# 使用 Supabase CLI 部署
npx supabase functions deploy send-invitation-email
```

### 3. 確認部署成功
```bash
npx supabase functions list
# 應該看到 send-invitation-email 列在其中
```

---

## 步驟 6️⃣：測試郵件發送

### 測試 curl 命令

```bash
# 替換 <SUPABASE_URL> 和 <SUPABASE_ANON_KEY>
curl -X POST \
  https://<project-id>.supabase.co/functions/v1/send-invitation-email \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "storeName": "我的店",
    "invitationLink": "https://yourdomain.com/auth/accept-invitation?token=test-uuid",
    "invitedByName": "李老闆"
  }'
```

### 預期回應
```json
{
  "ok": true,
  "message": "Invitation email sent successfully",
  "email": "test@example.com"
}
```

---

## 步驟 7️⃣：檢查郵件交付

### 1. SendGrid 統計
```
SendGrid Dashboard
→ Mail Activity
```
你應該看到剛才發送的測試郵件

### 2. 檢查垃圾箱
郵件可能進入垃圾箱，檢查一下

### 3. 常見問題

| 問題 | 解決方案 |
|------|---------|
| 郵件進垃圾箱 | 檢查 SPF/DKIM 設定，使用 SendGrid 提供的 DNS 記錄 |
| 401 Unauthorized | 檢查 API Key 是否正確、是否過期 |
| 郵件格式錯誤 | 檢查 `SENDGRID_FROM_EMAIL` 是否驗證過 |

---

## 🎯 環境變數小結

最終你的 Supabase 環境變數應該是：

```
SENDGRID_API_KEY = SG.1234567890abcdef...
SENDGRID_FROM_EMAIL = noreply@your-store.com
SENDGRID_REPLY_EMAIL = support@your-store.com
```

---

## 下一步

完成以上步驟後：
1. ✅ Edge Function 已部署
2. ✅ SendGrid 已配置
3. ⏭️ 建立後端 API 端點

告訴我何時準備好繼續！
