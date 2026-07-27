// server.js
// سيرفر يشغّل جلسة واتس اب حقيقية (whatsapp-web.js) ويستقبل Webhook من AppSheet لإرسال رسائل مباشرة لأي رقم

const express = require("express");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();
app.use(express.json({ limit: "25mb" }));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

let lastQr = null;       // آخر QR Code تم توليده (كصورة Base64)
let isReady = false;     // هل الجلسة متصلة وجاهزة للإرسال؟

// تحديد نوع الملف (MIME type) من امتداده
function getMimeType(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  const map = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

// ==== إعداد عميل واتس اب ====
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "/data/wwebjs_auth" }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-component-extensions-with-background-pages",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--safebrowsing-disable-auto-update",
      "--disable-software-rasterizer",
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("QR Code جديد جاهز — افتح رابط /qr لمسحه");
  lastQr = await qrcode.toDataURL(qr);
  isReady = false;
});

client.on("ready", () => {
  console.log("✅ واتس اب متصل وجاهز للإرسال");
  isReady = true;
  lastQr = null;
});

client.on("disconnected", (reason) => {
  console.log("⚠️ تم قطع الاتصال:", reason);
  isReady = false;
});

client.initialize();

// ==== صفحة لعرض الـ QR Code (تفتحها من متصفحك لتمسحه بموبايلك مرة واحدة) ====
app.get("/qr", (req, res) => {
  if (isReady) {
    return res.send("<h2>✅ واتس اب متصل بالفعل، لا حاجة لمسح QR</h2>");
  }
  if (!lastQr) {
    return res.send("<h2>⏳ جاري تجهيز QR Code، أعد تحميل الصفحة بعد ثوانٍ...</h2>");
  }
  res.send(`
    <html dir="rtl">
      <body style="text-align:center; font-family:sans-serif;">
        <h2>امسح الكود ده من واتس اب على موبايلك</h2>
        <p>واتس اب &gt; الأجهزة المرتبطة &gt; ربط جهاز</p>
        <img src="${lastQr}" style="width:300px;height:300px;" />
      </body>
    </html>
  `);
});

app.get("/", (req, res) => {
  res.send(`الحالة: ${isReady ? "متصل ✅" : "غير متصل — افتح /qr"}`);
});

// ==== نقطة الاستقبال التي سيرسل إليها AppSheet ====
app.post("/webhook/appsheet", async (req, res) => {
  const logBody = { ...req.body };
  if (logBody.fileBase64) {
    logBody.fileBase64 = `[${logBody.fileBase64.length} حرف مشفر]`;
  }
  console.log("📩 طلب جديد وصل من AppSheet:", JSON.stringify(logBody));

  try {
    if (WEBHOOK_SECRET && req.query.secret !== WEBHOOK_SECRET) {
      console.log("❌ رفض الطلب: المفتاح السري غير مطابق");
      return res.status(401).json({ error: "Unauthorized: invalid secret" });
    }

    if (!isReady) {
      console.log("❌ رفض الطلب: واتس اب غير متصل حاليًا");
      return res.status(503).json({
        error: "واتس اب غير متصل حاليًا. افتح رابط /qr وامسح الكود أولًا.",
      });
    }

    const { phone, message, fileBase64, fileName } = req.body;

    if (!phone || (!message && !fileBase64)) {
      console.log("❌ رفض الطلب: لازم يكون فيه phone + (message أو fileBase64)");
      return res.status(400).json({ error: "الحقول المطلوبة: phone و (message أو fileBase64)" });
    }

    // تنظيف رقم الهاتف والتأكد من الصيغة الدولية (بدون + أو رموز)
    const cleanPhone = String(phone).replace(/[^0-9]/g, "");
    const chatId = `${cleanPhone}@c.us`;
    console.log(`🔍 الرقم بعد التنظيف: ${cleanPhone} — chatId: ${chatId}`);

    // التأكد أن الرقم مسجل فعليًا على واتس اب
    const isRegistered = await client.isRegisteredUser(chatId);
    console.log(`🔍 هل الرقم مسجل على واتس اب؟ ${isRegistered}`);

    if (!isRegistered) {
      console.log(`❌ الرقم ${cleanPhone} غير مسجل على واتس اب`);
      return res.status(404).json({ error: `الرقم ${cleanPhone} غير مسجل على واتس اب` });
    }

    if (fileBase64) {
      // إرسال ملف (PDF, صورة, وورد...إلخ) مع كابشن نصي اختياري
      if (!fileName) {
        console.log("❌ رفض الطلب: fileName مطلوب مع fileBase64");
        return res.status(400).json({ error: "الحقل fileName مطلوب مع fileBase64" });
      }
      const mimeType = getMimeType(fileName);
      const media = new MessageMedia(mimeType, fileBase64, fileName);
      await client.sendMessage(chatId, media, { caption: message || "" });
      console.log(`✅ تم إرسال الملف (${fileName}) بنجاح إلى ${cleanPhone}`);
    } else {
      // إرسال رسالة نصية عادية
      await client.sendMessage(chatId, message);
      console.log(`✅ تم إرسال الرسالة بنجاح إلى ${cleanPhone}`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("🔥 خطأ أثناء إرسال الرسالة:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
