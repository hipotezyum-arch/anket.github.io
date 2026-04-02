# 📋 Kurum İçi Çalışan Memnuniyet Anketi

Mobil öncelikli, cihaz başı tek yanıt, Node.js + SQLite tabanlı anket uygulaması.

---

## 🚀 Kurulum (5 Adım)

### 1. Node.js Yükleyin
```bash
# Ubuntu/Debian sunucu için:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Projeyi Sunucuya Kopyalayın
```bash
# Bu klasörü sunucunuza kopyalayın, örneğin:
scp -r anket-app/ kullanici@sunucu-ip:/home/kullanici/
```

### 3. Bağımlılıkları Yükleyin
```bash
cd anket-app
npm install
```

### 4. Uygulamayı Başlatın
```bash
# Normal başlatma:
node server.js

# Admin şifresini değiştirerek başlatma (önerilen):
ADMIN_PASSWORD=gizli_sifreniz PORT=3000 node server.js

# Arka planda sürekli çalıştırma (pm2 ile):
npm install -g pm2
ADMIN_PASSWORD=gizli_sifreniz pm2 start server.js --name anket
pm2 save
pm2 startup
```

### 5. SMS Linkini Hazırlayın
Çalışanlara gönderilecek link:
```
http://SUNUCU-IP:3000
```

---

## 📱 Kullanım

| URL | Açıklama |
|-----|----------|
| `http://sunucu:3000` | Çalışan anket sayfası |
| `http://sunucu:3000/admin.html` | Yönetici rapor paneli |
| `http://sunucu:3000/api/export` | CSV dışa aktarma (admin şifreli) |

---

## 🔐 Cihaz Başı Tek Yanıt Nasıl Çalışır?

Her cihazın benzersiz bir "parmak izi" hesaplanır:
- Tarayıcı User-Agent
- Dil ayarı
- IP adresi

Bu üçünün SHA-256 özeti veritabanına kaydedilir. Aynı cihazdan ikinci kez girilmeye çalışılınca anket gösterilmez.

> ⚠️ **Not:** Farklı tarayıcıdan veya VPN ile giriş yapan kullanıcı tekrar doldurabilir. Daha güçlü kontrol için kurumsal e-posta doğrulaması eklenebilir.

---

## 📊 Rapor Özellikleri

- Katılımcı sayısı
- Soru bazlı ortalama, net skor, dağılım
- Kategori bazlı özet
- CSV dışa aktarma (Excel'de açılır)

---

## 🛠 Teknik Yığın

- **Sunucu:** Node.js + Express
- **Veritabanı:** SQLite (better-sqlite3)
- **Frontend:** Vanilla HTML/CSS/JS — kurulum gerektirmez
- **Cihaz Kontrolü:** SHA-256 parmak izi
