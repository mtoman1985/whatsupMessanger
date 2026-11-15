const fs = require('fs');
const express = require('express');
const { google } = require('googleapis');

const app = express();
const PORT = 7860;

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];

let oAuth2Client;

try {
    const credentials = JSON.parse(fs.readFileSync('credentials.json'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    // التأكد من استخدام الرابط الصحيح من ملف credentials
    const redirectUrl = redirect_uris[0]; 
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUrl);
} catch (error) {
    console.error('❌ خطأ في قراءة credentials.json');
    process.exit(1);
}

app.get('/', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // إجبار جوجل على إعطاء Refresh Token
        scope: SCOPES,
    });
    res.send(`
        <html dir="rtl">
            <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                <h2>مرحباً بك في نظام ربط عيادات الأسنان 🦷</h2>
                <a href="${authUrl}" style="background-color: #168a9a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px;">ربط حساب Google الآن</a>
            </body>
        </html>
    `);
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('❌ لم يتم استلام الكود.');

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        
        // طباعة التوكن على الشاشة ليسهل على المستخدم نسخه
        res.send(`
            <html dir="rtl">
                <body style="font-family: Arial; text-align: center; margin-top: 50px;">
                    <h1 style="color: green;">✅ تم الربط بنجاح!</h1>
                    <p style="color: red; font-weight: bold;">انسخ الكود الموجود في المربع الأسفل بالكامل، وضعه داخل ملف token.json في Hugging Face:</p>
                    <textarea style="width: 80%; height: 200px; padding: 10px; font-family: monospace; direction: ltr;" readonly>${JSON.stringify(tokens, null, 2)}</textarea>
                    <br><br>
                    <p>بعد لصق الكود وحفظه، قم بتغيير إعدادات التشغيل لتعمل على <b>index.js</b>.</p>
                </body>
            </html>
        `);
    } catch (error) {
        res.send('❌ فشل استخراج التوكن: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log(`🌍 سيرفر الربط يعمل... افتح رابط المساحة.`);
});