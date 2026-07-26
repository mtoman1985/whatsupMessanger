// server.js
// سيرفر يشغّل جلسة واتس اب حقيقية (whatsapp-web.js) ويستقبل Webhook من AppSheet لإرسال رسائل مباشرة لأي رقم

const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

let lastQr = null;       // آخر QR Code تم توليده (كصورة Base64)
let isReady = false;     // هل الجلسة متصلة وجاهزة للإرسال؟

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
      "--single-process",
      "--no-zygote",
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
      "--renderer-process-limit=1",
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
  try {
    if (WEBHOOK_SECRET && req.query.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized: invalid secret" });
    }

    if (!isReady) {
      return res.status(503).json({
        error: "واتس اب غير متصل حاليًا. افتح رابط /qr وامسح الكود أولًا.",
      });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "الحقول المطلوبة: phone, message" });
    }

    // تنظيف رقم الهاتف والتأكد من الصيغة الدولية (بدون + أو رموز)
    const cleanPhone = String(phone).replace(/[^0-9]/g, "");
    const chatId = `${cleanPhone}@c.us`;

    // التأكد أن الرقم مسجل فعليًا على واتس اب
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({ error: `الرقم ${cleanPhone} غير مسجل على واتس اب` });
    }

    await client.sendMessage(chatId, message);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending message:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
