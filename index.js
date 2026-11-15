const fs = require('fs');
const puppeteer = require('puppeteer');
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const xlsx = require('xlsx');
const cron = require('node-cron');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const { Readable } = require('stream'); 
const crypto = require('crypto');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI("AQ.Ab8RN6IkPuSKLGaDQUyQ7mT8S9AbX22wVN5dFAElw_Beyqtfig"); 
const pendingAIRreplies = {};

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
];

// ==========================================
// ⚙️ إعدادات معرفات الملفات والمجلدات
// ==========================================
const PATIENTS_FILE_ID = '12zTa8jHgM6hl4quhHbXzv4Xpgh8lxZUBJJ_FOqTz0V8';
const MAIN_DATA_FILE_ID = '1VPTp4-r7vnR-DhSibNvB27GPXHBqVQ2H'; 
const REPORTS_FOLDER_ID = '1DsMhZeikBqmocqKy230FMkIBOVgeg3mm';

// ==========================================
// ⚙️ لوحة تحكم نسب الأطباء (يمكنك تعديلها بأي وقت)
// ==========================================
const DOCTOR_RATES = {
    'حسام العايدي': 0.35, 
    'شهد بدر': 0.35,      
    'شيماء شموط': 0.30,   
    'وسام النشاش': 0.35,  
    'براء شموط': 0.35,    
    'بيسان أبو بكرة': 0.30, 
    'حسان عودة': 0.30,    
    'ايهاب الديب': 0.70   
};

// ==========================================
// قاعدة بيانات فريق العمل والصلاحيات
// ==========================================
const USERS = {
    '142293071843571': { name: 'العيادة (رقم الاختبار)', role: 'إدارة', permission: 'مسؤول' },
    '972599331114': { name: 'محمد طومان (الرقم العادي)', role: 'إدارة', permission: 'مسؤول' },
    '970599331114': { name: 'محمد طومان (الرقم العادي)', role: 'إدارة', permission: 'مسؤول' },
    '178739996528798': { name: 'محمد طومان', role: 'إدارة', permission: 'مسؤول' },
    '972599453796': { name: 'محمد طومان', role: 'إدارة', permission: 'مسؤول' },
    '970599453796': { name: 'محمد طومان', role: 'إدارة', permission: 'مسؤول' },
    '972567999156': { name: 'مجد العايدي', role: 'إدارة', permission: 'إداري' },
    '970567999156': { name: 'مجد العايدي', role: 'إدارة', permission: 'إداري' },
    '239461740867757': { name: 'فراس العايدي', role: 'إدارة', permission: 'مسؤول' },
    
    // الأطباء 
    '972599727228': { name: 'حسام العايدي', role: 'طبيب أسنان', permission: 'مسؤول' },
    '970599727228': { name: 'حسام العايدي', role: 'طبيب أسنان', permission: 'مسؤول' },
    '972595161622': { name: 'شهد بدر', role: 'طبيب أسنان', permission: 'مسؤول' },
    '970595161622': { name: 'شهد بدر', role: 'طبيب أسنان', permission: 'مسؤول' },
    '972595866082': { name: 'شيماء شموط', role: 'طبيب أسنان', permission: 'طبيب' },
    '970595866082': { name: 'شيماء شموط', role: 'طبيب أسنان', permission: 'طبيب' },
    '972599834385': { name: 'وسام النشاش', role: 'طبيب أسنان', permission: 'طبيب' },
    '970599834385': { name: 'وسام النشاش', role: 'طبيب أسنان', permission: 'طبيب' },
    '972597653990': { name: 'بيسان أبو بكرة', role: 'طبيب أسنان', permission: 'طبيب' },
    '970597653990': { name: 'بيسان أبو بكرة', role: 'طبيب أسنان', permission: 'طبيب' },

    // إضافية
    '205003184717913': { name: 'براء شموط', role: 'طبيب أسنان', permission: 'طبيب' },
    '72477623513172': { name: 'شهد بدر', role: 'طبيب أسنان', permission: 'مسؤول' },
    '9225707249805': { name: 'شيماء شموط', role: 'طبيب أسنان', permission: 'طبيب' },
    '972597072498': { name: 'شيماء شموط', role: 'طبيب أسنان', permission: 'طبيب' },
    '104561113067744': { name: 'وسام النشاش', role: 'طبيب أسنان', permission: 'طبيب' },
    '218029786959920': { name: 'بيسان أبو بكرة', role: 'طبيب أسنان', permission: 'طبيب' },
    '261173421314256': { name: 'دكتور (جهاز مرتبط)', role: 'طبيب أسنان', permission: 'طبيب' },
    '4191213747': { name: 'مجد العايدي', role: 'إدارة', permission: 'إداري' }
};

const DOCTORS_LIST = ['حسام العايدي', 'شهد بدر', 'وسام النشاش', 'شيماء شموط', 'براء شموط', 'بيسان أبو بكرة', 'حسان عودة', 'ايهاب الديب'];

let userState = {}; let userSearchResults = {}; let apptFilters = {}; 
let userSelectedQueue = {}; let dailyFilters = {}; let financialFilters = {}; let userStateData = {};
let isAuthValid = false; 
let isSystemInitialized = false;
let patientForm = {}; 

// ==========================================
// التواريخ والأوقات
// ==========================================
function getStandardDateISO(d) {
    const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getTomorrowStandardDateISO() {
    const now = new Date();
    let daysToAdd = 1;
    if (now.getDay() === 4) { 
        daysToAdd = 2; 
    }
    now.setDate(now.getDate() + daysToAdd);
    return getStandardDateISO(now);
}

function parseDateSafely(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
        if (val > 10000) { 
            const date = new Date(Math.round((val - 25569) * 86400 * 1000));
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            const d = String(date.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${d}`; 
        }
        return null;
    }
    let s = val.toString().trim();
    const parts = s.split(/[-/.]/); 
    if (parts.length >= 3) {
        let d = parts[0].trim(), m = parts[1].trim(), y = parts[2].split(' ')[0].trim(); 
        if (y.length === 2) y = '20' + y;
        if (d.length === 4) { y = d; d = parts[2].split(' ')[0].trim(); }
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return null;
}

function parseTimeSafely(val) {
    if (val === undefined || val === null || val === '') return 'غير محدد';
    if (typeof val === 'number') {
        let fraction = val - Math.floor(val);
        if (val < 1) fraction = val; 
        let totalMinutes = Math.round(fraction * 24 * 60);
        let hours = Math.floor(totalMinutes / 60);
        let minutes = totalMinutes % 60;
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
    return val.toString().trim();
}

function formatDisplayDate(isoDate) {
    if(!isoDate) return '';
    const parts = isoDate.split('-');
    if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`; 
    return isoDate;
}

function getDateRangeFilter(type, customText) {
    const now = new Date();
    if (type === '1') { 
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: getStandardDateISO(firstDay), to: getStandardDateISO(lastDay), label: `الشهر الحالي (${now.getMonth() + 1}/${now.getFullYear()})` };
    }
    if (type === '2') { 
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: getStandardDateISO(firstDay), to: getStandardDateISO(lastDay), label: `الشهر السابق (${firstDay.getMonth() + 1}/${firstDay.getFullYear()})` };
    }
    if (type === '4') { 
        return { from: '0000-00-00', to: '9999-99-99', label: 'جميع الفترات' };
    }
    if (type === '3') { 
        if (!customText) return null;
        const parts = customText.trim().split(/[-–—]|إلى|الى|ألى|الي|\bto\b/);
        if (parts.length >= 2) {
            const f = parseDateSafely(parts[0].trim()); const t = parseDateSafely(parts[1].trim());
            if (f && t) return { from: f < t ? f : t, to: f < t ? t : f, label: `الفترة من (${formatDisplayDate(f < t ? f : t)}) إلى (${formatDisplayDate(f < t ? t : f)})` };
        }
        const single = parseDateSafely(customText.trim()); return { from: single, to: single, label: `تاريخ (${formatDisplayDate(single)})` };
    }
    return { from: '0000-00-00', to: '9999-99-99', label: 'الكل' };
}

function getPatientDateRangeFilter(type, customText) {
    const now = new Date();
    if (type === '1') { 
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: getStandardDateISO(firstDay), to: getStandardDateISO(lastDay), label: `الشهر الحالي (${now.getMonth() + 1}/${now.getFullYear()})` };
    }
    if (type === '2') { 
        const firstDay = new Date(now.getFullYear(), 0, 1);
        const lastDay = new Date(now.getFullYear(), 11, 31);
        return { from: getStandardDateISO(firstDay), to: getStandardDateISO(lastDay), label: `هذه السنة (${now.getFullYear()})` };
    }
    if (type === '4') { 
        return { from: '0000-00-00', to: '9999-99-99', label: 'جميع الفترات' };
    }
    if (type === '3') { 
        if (!customText) return null;
        const parts = customText.trim().split(/[-–—]|إلى|الى|ألى|الي|\bto\b/);
        if (parts.length >= 2) {
            const f = parseDateSafely(parts[0].trim()); const t = parseDateSafely(parts[1].trim());
            if (f && t) return { from: f < t ? f : t, to: f < t ? t : f, label: `الفترة` };
        }
        const single = parseDateSafely(customText.trim()); return { from: single, to: single, label: `تاريخ (${formatDisplayDate(single)})` };
    }
    return null;
}

function parseMoney(val) {
    if (!val) return 0;
    const num = parseFloat(val.toString().replace(/[^\d.-]/g, ''));
    return isNaN(num) ? 0 : num;
}

function normalizeArabic(text) {
    if (!text) return '';
    return text.toString().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ==========================================
// المصادقة والتفاعل مع جوجل
// ==========================================
async function checkAndGetGoogleAuth() {
    const credentials = JSON.parse(fs.readFileSync('credentials.json'));
    const keys = credentials.web || credentials.installed;
    if (!keys) throw new Error('ملف credentials غير صالح.');
    const oAuth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris ? keys.redirect_uris[0] : 'http://localhost');
    try {
        const token = JSON.parse(fs.readFileSync('token.json'));
        if (!token || !token.access_token) throw new Error('لا يوجد توكن');
        oAuth2Client.setCredentials(token);
        isAuthValid = true; 
        return oAuth2Client;
    } catch (err) {
        if (isAuthValid) { console.log('⚠️ تم فصل الصلاحيات. أرسل "ربط جوجل".'); isAuthValid = false; }
        return null; 
    }
}

async function getWorkbookRows(authClient, fileId, sheetNameKeyword) {
    const drive = google.drive({ version: 'v3', auth: authClient });
    let buffer;
    try {
        const res = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        buffer = Buffer.from(res.data);
    } catch (err) {
        const res = await drive.files.export({ fileId: fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' });
        buffer = Buffer.from(res.data);
    }
    const workbook = xlsx.read(buffer, { type: 'buffer', raw: true }); 
    let targetSheetName = workbook.SheetNames[0]; 
    if (sheetNameKeyword) {
        const exactMatch = workbook.SheetNames.find(n => n.trim() === sheetNameKeyword);
        const partialMatch = workbook.SheetNames.find(n => n.includes(sheetNameKeyword));
        targetSheetName = exactMatch || partialMatch || workbook.SheetNames[0];
    }
    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
}

async function sendPdf(whatsappClient, chatId, pdfBuffer, fileName) {
    try {
        const base64Data = pdfBuffer.toString('base64');
        const media = new MessageMedia('application/pdf', base64Data, fileName);
        await whatsappClient.sendMessage(chatId, media, { sendMediaAsDocument: true });
    } catch (err) {
        try {
            const authClient = await checkAndGetGoogleAuth();
            if(!authClient) throw new Error("لا توجد صلاحيات.");
            const drive = google.drive({ version: 'v3', auth: authClient });
            const stream = new Readable(); stream.push(pdfBuffer); stream.push(null);
            const fileMetadata = { name: fileName, mimeType: 'application/pdf', parents: [REPORTS_FOLDER_ID] };
            const file = await drive.files.create({ resource: fileMetadata, media: { mimeType: 'application/pdf', body: stream }, fields: 'id, webViewLink' });
            await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });
            await whatsappClient.sendMessage(chatId, `⚠️ *ملاحظة:* واتساب يواجه عطلاً.\n\n✅ *تم الرفع إلى مجلد التقارير بدرايف!*\n\n📂 لعرض التقرير:\n${file.data.webViewLink}`);
        } catch (driveErr) {
            await whatsappClient.sendMessage(chatId, `❌ عذراً، فشل الإرسال تماماً.`);
        }
    }
}

const PATIENT_BIRTHDATE_COLUMN = 8;

function findBirthColIndex(rows) {
    if (PATIENT_BIRTHDATE_COLUMN >= 0) return PATIENT_BIRTHDATE_COLUMN;
    for (let r = 0; r < Math.min(3, (rows || []).length); r++) {
        const row = rows[r] || [];
        for (let c = 0; c < row.length; c++) {
            const h = (row[c] || '').toString().trim().toLowerCase();
            if (h.includes('ميلاد') || h.includes('birth') || h === 'dob') return c;
        }
    }
    return -1;
}

function calculateAgeText(val) {
    const iso = parseDateSafely(val);
    if (!iso) return '';
    const parts = iso.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (!y || !m || !d) return '';
    const now = new Date();
    let age = now.getFullYear() - y;
    if ((now.getMonth() + 1) < m || ((now.getMonth() + 1) === m && now.getDate() < d)) age--;
    if (age < 0 || age > 120) return '';
    if (age === 0) {
        let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
        if (now.getDate() < d) months--;
        return months > 0 ? `${months} شهر` : 'أقل من شهر';
    }
    return `${age} سنة`;
}

async function getPatientsMap() {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if(!authClient) return {};
        const rows = await getWorkbookRows(authClient, PATIENTS_FILE_ID, 'Sheet2'); 
        if (!rows || rows.length <= 1) return {};
        const map = {}; const birthCol = findBirthColIndex(rows);
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; const id = (row[0] || '').toString().trim().toLowerCase();
            if (id) map[id] = { name: (row[1] || '').toString().trim() || id, phone: (row[2] || 'غير متوفر').toString().trim(), clinic: (row[5] || 'عيادة الأسنان').toString().trim(), birth: birthCol !== -1 ? row[birthCol] : '' };
        }
        return map;
    } catch (error) { return {}; }
}

async function searchPatientByName(patientName) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if(!authClient) return { error: '❌ لم يتم ربط حساب جوجل.' };
        const rows = await getWorkbookRows(authClient, PATIENTS_FILE_ID, 'Sheet2');
        if (!rows || rows.length === 0) return { error: '❌ لا توجد بيانات.' };
        const birthCol = findBirthColIndex(rows); const matches = []; const searchWord = normalizeArabic(patientName); 
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; const currentName = (row[1] || '').toString(); const normalizedCurrentName = normalizeArabic(currentName);
            if (normalizedCurrentName.includes(searchWord)) {
                matches.push({ id: (row[0] || '').toString().trim(), name: currentName.trim(), phone: (row[2] || 'غير متوفر').toString().trim(), clinic: (row[5] || 'عيادة الأسنان').toString().trim(), birth: birthCol !== -1 ? row[birthCol] : '' });
            }
        }
        return { matches };
    } catch (error) { return { error: '⚠️ حدث خطأ في الاتصال.' }; }
}

// ==========================================
// 👤 إدارة بيانات المرضى (إضافة / تعديل) عبر Google Sheets API
// ==========================================
const PATIENT_SHEET_KEYWORD = 'Sheet2';
const PATIENT_COL_ALIASES = {
    id: ['id'], name: ['الاسم', 'اسم المريض', 'الاسم الكامل'], phone: ['الجوال', 'رقم الجوال'], phone2: ['جوال 2', 'جوال2'],
    gender: ['الجنس'], clinic: ['العيادة', 'عيادة'], birth: ['الميلاد', 'تاريخ الميلاد']
};
const PATIENT_COL_DEFAULTS = { id: 0, name: 1, phone: 2, phone2: 3, gender: 4, clinic: 5, birth: 8 };
const PATIENT_ADD_STEPS = ['name', 'phone', 'phone2', 'gender', 'clinic', 'birth'];
const PATIENT_FIELD_LABEL = { name: 'الاسم', phone: 'الجوال', phone2: 'جوال 2', gender: 'الجنس', clinic: 'العيادة', birth: 'تاريخ الميلاد' };

function normalizeDigits(text) {
    return (text || '').toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

function colLetter(n) {
    let s = ''; n = n + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

function normalizePhone(text) {
    let d = normalizeDigits(text).replace(/[^\d]/g, '');
    if (d.startsWith('00972') || d.startsWith('00970')) d = '0' + d.slice(5);
    else if (d.startsWith('972') || d.startsWith('970')) d = '0' + d.slice(3);
    if (d.length === 9 && d.startsWith('5')) d = '0' + d;
    return /^05\d{8}$/.test(d) ? d : null;
}

function parseBirthInput(text) {
    const iso = parseDateSafely(normalizeDigits(text).trim());
    if (!iso) return null;
    const parts = iso.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (!y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizePatientFieldValue(field, text) {
    const t = (text || '').toString().trim();
    const skip = (t === '-');
    if (field === 'name') {
        const name = t.replace(/\s+/g, ' ');
        if (skip || name.length < 3) return { ok: false, error: '❌ الاسم قصير أو غير صحيح.' };
        return { ok: true, value: name };
    }
    if (field === 'phone' || field === 'phone2') {
        if (skip) return { ok: true, value: '' };
        const ph = normalizePhone(t);
        if (!ph) return { ok: false, error: '❌ رقم غير صحيح. يجب أن يكون 10 أرقام ويبدأ بـ 05 (مثال: 0599123456).' };
        return { ok: true, value: ph };
    }
    if (field === 'gender') {
        if (skip) return { ok: true, value: '' };
        if (t === '1') return { ok: true, value: 'أنثى' };
        if (t === '2') return { ok: true, value: 'ذكر' };
        return { ok: false, error: '❌ اختيار غير صحيح، أرسل 1 أو 2.' };
    }
    if (field === 'clinic') {
        if (skip) return { ok: true, value: '' };
        if (t === '1') return { ok: true, value: 'عيادة ناصر' };
        if (t === '2') return { ok: true, value: 'عيادة روني' };
        return { ok: false, error: '❌ اختيار غير صحيح، أرسل 1 أو 2.' };
    }
    if (field === 'birth') {
        if (skip) return { ok: true, value: '' };
        const iso = parseBirthInput(t);
        if (!iso) return { ok: false, error: '❌ تاريخ غير صحيح. اكتبه هكذا: 25/03/1995' };
        return { ok: true, value: iso };
    }
    return { ok: false, error: '❌ حقل غير معروف.' };
}

function patientFieldPrompt(field, mode) {
    const base = {
        name: '🔤 أرسل *اسم المريض* الكامل:',
        phone: '📝 أرسل *رقم الجوال* (مثال: 0599123456):',
        phone2: '📝 أرسل *جوال 2* (رقم آخر للمريض):',
        gender: '📝 *الجنس:*\n1️⃣ - أنثى\n2️⃣ - ذكر',
        clinic: '📝 *العيادة:*\n1️⃣ - عيادة ناصر\n2️⃣ - عيادة روني',
        birth: '📝 أرسل *تاريخ الميلاد* (مثال: 25/03/1995):'
    }[field];
    const hint = field === 'name' ? '' : (mode === 'edit' ? '\n*(أرسل - لمسح القيمة)*' : '\n*(أرسل - للتخطي)*');
    return base + hint + '\n*(أرسل "0" للرجوع)*';
}

function renderPatientMgmtMenu() {
    return `👤 *إدارة بيانات المرضى*\n\n1️⃣ - إضافة مريض جديد\n2️⃣ - تعديل بيانات مريض\n0️⃣ - ↩️ الرجوع للقائمة الرئيسية\n\n*أرسل الرقم المطلوب:*`;
}

function renderPatientEditMenu(p) {
    const age = calculateAgeText(p.birth);
    return `📝 *تعديل بيانات المريض*\n👤 ${p.name}\n📱 ${p.phone}\n🏥 ${p.clinic}${age ? `\n🎂 ${age}` : ''}\n\nما الذي تريد تعديله؟\n\n1️⃣ - الاسم\n2️⃣ - الجوال\n3️⃣ - جوال 2\n4️⃣ - الجنس\n5️⃣ - العيادة\n6️⃣ - تاريخ الميلاد\n0️⃣ - ↩️ الرجوع\n\n*أرسل الرقم المطلوب:*`;
}

function friendlySheetsError(err) {
    const m = (err && err.message) ? err.message : String(err);
    if (m.includes('not supported for this document')) return '⚠️ ملف المرضى ليس Google Sheet أصلياً (نوعه XLSX)، والكتابة عليه غير مدعومة. حوّله عبر: ملف ← حفظ كـ Google Sheets، ثم غيّر PATIENTS_FILE_ID في الكود.';
    if (m.includes('has not been used') || m.includes('is disabled')) return '⚠️ يجب تفعيل *Google Sheets API* في مشروع Google Cloud الخاص بالبوت، ثم أعد المحاولة.';
    if (m.includes('insufficient') || m.includes('PERMISSION_DENIED') || (err && err.code === 403)) return '⚠️ الصلاحيات غير كافية للكتابة. أرسل "ربط جوجل" وأعد الربط (مع الموافقة على كل الصلاحيات)، وتأكد أن الحساب لديه صلاحية تعديل على ملف المرضى.';
    return '⚠️ حدث خطأ أثناء الحفظ: ' + m;
}

async function getPatientsSheetContext() {
    const authClient = await checkAndGetGoogleAuth();
    if (!authClient) throw new Error('لم يتم ربط حساب جوجل. أرسل "ربط جوجل".');
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: PATIENTS_FILE_ID, fields: 'sheets.properties.title' });
    const titles = meta.data.sheets.map(sh => sh.properties.title);
    const title = titles.find(t => t.trim() === PATIENT_SHEET_KEYWORD) || titles.find(t => t.includes(PATIENT_SHEET_KEYWORD)) || titles[0];
    const hdr = await sheets.spreadsheets.values.get({ spreadsheetId: PATIENTS_FILE_ID, range: `'${title}'!1:1` });
    const headers = (hdr.data.values && hdr.data.values[0]) || [];
    const col = Object.assign({}, PATIENT_COL_DEFAULTS);
    Object.keys(PATIENT_COL_ALIASES).forEach(key => {
        const idx = headers.findIndex(h => PATIENT_COL_ALIASES[key].includes((h || '').toString().trim().toLowerCase()));
        if (idx !== -1) col[key] = idx;
    });
    return { sheets, title, headers, col };
}

function toCellValue(field, value) {
    if ((field === 'phone' || field === 'phone2') && value) return "'" + value;
    return value || '';
}

async function addPatientToSheet(data) {
    const ctx = await getPatientsSheetContext();
    const id = crypto.randomBytes(4).toString('hex');
    const width = Math.max(ctx.headers.length, ...Object.values(ctx.col).map(i => i + 1));
    const row = new Array(width).fill('');
    row[ctx.col.id] = "'" + id;
    PATIENT_ADD_STEPS.forEach(f => { row[ctx.col[f]] = toCellValue(f, data[f]); });
    await ctx.sheets.spreadsheets.values.append({
        spreadsheetId: PATIENTS_FILE_ID, range: `'${ctx.title}'!A:A`,
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] }
    });
    return id;
}

async function updatePatientField(id, field, value) {
    const ctx = await getPatientsSheetContext();
    const idCol = colLetter(ctx.col.id);
    const res = await ctx.sheets.spreadsheets.values.get({ spreadsheetId: PATIENTS_FILE_ID, range: `'${ctx.title}'!${idCol}:${idCol}` });
    const vals = res.data.values || [];
    const idx = vals.findIndex(r => (r[0] || '').toString().trim().toLowerCase() === id.toString().trim().toLowerCase());
    if (idx === -1) throw new Error('لم يتم العثور على المريض في الشيت (ID: ' + id + ')');
    await ctx.sheets.spreadsheets.values.update({
        spreadsheetId: PATIENTS_FILE_ID, range: `'${ctx.title}'!${colLetter(ctx.col[field])}${idx + 1}`,
        valueInputOption: 'USER_ENTERED', requestBody: { values: [[toCellValue(field, value)]] }
    });
}

function renderMainMenu(currentUser) {
    const userTitle = (currentUser.role === 'طبيب أسنان') ? 'د.' : 'أ.';
    const isAdmin = (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري');
    let menu = `أهلاً بك ${userTitle} ${currentUser.name} 🦷\n[الصلاحية: ${currentUser.permission}]\nالرجاء اختيار الخدمة:\n\n` +
           `1️⃣ - الاستعلام عن أرقام المرضى\n` +
           `2️⃣ - قسم إدارة المواعيد\n`;
    if (isAdmin) menu += `3️⃣ - الكشف الطبي المجمع وإصدار الفواتير PDF\n`;
    menu += `4️⃣ - تجهيز قائمة أسماء المرضى\n`; 
    if (isAdmin) {
        menu += `5️⃣ - التقرير المالي المجمع واليومية\n`;
        menu += `6️⃣ - التقرير المالي الختامي (PDF للإدارة)\n`;
        menu += `7️⃣ - تقرير ديون المرضى (PDF للإدارة)\n`;
        menu += `8️⃣ - تعديل معلومات السكرتير الذكي (AI)\n`;
        menu += `9️⃣ - إدارة بيانات المرضى (إضافة / تعديل)\n`;
    } else {
        menu += `5️⃣ - كشف اليومية التفصيلي (الخاص بك فقط)\n`;
    }
    menu += `\n*أرسل الرقم المطلوب:*`;
    return menu;
}

function renderApptMainMenu() { return `📅 *قسم المواعيد*\n\n1️⃣ - استعراض جدول المواعيد\n2️⃣ - البحث عن موعد لمريض معين\n0️⃣ - ↩️ الرجوع للقائمة الرئيسية\n\n*أرسل الرقم المطلوب:*`; }
function renderAdminApptTarget() { return `📅 *لوحة تحكم المواعيد للإدارة*\nالرجاء تحديد النطاق:\n\n1️⃣ - عيادة ناصر\n2️⃣ - عيادة روني\n3️⃣ - طبيب محدد\n4️⃣ - جميع الفروع والأطباء\n0️⃣ - ↩️ الرجوع للخلف\n\n*أرسل الرقم المطلوب:*`; }
function renderPatientDateRangeMenu(patientName) { return `🗓️ *تحديد الفترة الزمنية لكشف المريض (${patientName}):*\n\n1️⃣ - هذا الشهر\n2️⃣ - هذه السنة\n3️⃣ - تاريخ أو فترة محددة (من - إلى)\n4️⃣ - جميع الفترات (الكل)\n0️⃣ - ↩️ الرجوع للخلف\n\n*أرسل الرقم المطلوب:*`; }
function renderDateRangeMenu(title, targetLabel) { return `🗓️ *تحديد الفترة الزمنية (${title}) لـ ${targetLabel}:*\n\n1️⃣ - الشهر الحالي\n2️⃣ - الشهر السابق\n3️⃣ - فترة محددة (من - إلى)\n4️⃣ - جميع الفترات (الكل)\n0️⃣ - ↩️ الرجوع للخلف\n\n*أرسل الرقم المطلوب:*`; }
function renderClinicMenu(title) { return `📋 *${title} - تحديد العيادة*\n\n1️⃣ - عيادة ناصر\n2️⃣ - عيادة روني\n3️⃣ - جميع العيادات\n0️⃣ - ↩️ الرجوع للقائمة الرئيسية\n\n*أرسل الرقم المطلوب:*`; }
function renderDoctorSelectMenu(title) { return `👨‍⚕️ *${title} - تحديد الأطباء:*\n\n1️⃣ - جميع الأطباء في العيادة\n2️⃣ - اختيار طبيب معين من القائمة\n0️⃣ - ↩️ الرجوع للخلف\n\n*أرسل الرقم المطلوب:*`; }
function renderDoctorsListMenu() { let msg = `👨‍⚕️ *اختر الطبيب المطلوب بالرقم:*\n\n`; DOCTORS_LIST.forEach((doc, idx) => { msg += `${idx + 1}️⃣ - د. ${doc}\n`; }); msg += `\n0️⃣ - ↩️ الرجوع للخلف`; return msg; }

// ==========================================
// الكشف الطبي 
// ==========================================
async function fetchDetailedPatientSessions(targetPatient, currentUser, dateRange) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if(!authClient) return { error: '❌ لم يتم ربط حساب جوجل.' };
        const patientsMap = await getPatientsMap();
        
        const rows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الوارد');
        if (!rows || rows.length <= 1) return { error: '❌ لا توجد بيانات في صفحة الوارد.' };

        const isAdminOrManager = (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري');
        const doctorName = currentUser.name;
        const targetId = (targetPatient.id || '').toString().trim().toLowerCase();
        const targetName = (targetPatient.name || '').toString().trim().toLowerCase();

        const teethMap = {}; let totalAgreed = 0, totalRequired = 0, totalPaid = 0, hiddenCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.length === 0) continue;
            if (row[4] === 'المدفوع' || row[1] === 'التاريخ') continue;
            
            const stdDate = parseDateSafely(row[1]);
            if (!stdDate) continue;
            if (dateRange && dateRange.from !== '0000-00-00') { if (stdDate < dateRange.from || stdDate > dateRange.to) continue; }

            const rawPatientId = (row[2] || '').toString().trim().toLowerCase();
            const mappedPatient = patientsMap[rawPatientId];
            const mappedName = mappedPatient ? mappedPatient.name.toLowerCase() : '';
            const isMatch = (rawPatientId === targetId) || (mappedName && mappedName.includes(targetName)) || (targetName && mappedName && targetName.includes(mappedName));
            if (!isMatch) continue;

            const sessionDoctor = (row[6])?.toString().trim() || 'غير محدد';
            if (!isAdminOrManager && !sessionDoctor.includes(doctorName)) { hiddenCount++; continue; }

            const agreedVal = parseMoney(row[10]); 
            const reqVal = parseMoney(row[3]); 
            const paidVal = parseMoney(row[4]);    
            const toothNum = (row[12])?.toString().trim() || ''; 
            const workType = (row[13])?.toString().trim() || 'كشف ومتابعة'; 
            
            if (!teethMap[toothNum]) teethMap[toothNum] = { works: new Set(), agreed: 0, required: 0, paid: 0 };
            teethMap[toothNum].works.add(workType); teethMap[toothNum].agreed += agreedVal; teethMap[toothNum].required += reqVal; teethMap[toothNum].paid += paidVal;
            totalAgreed += agreedVal; totalRequired += reqVal; totalPaid += paidVal;
        }

        const groupedByTooth = Object.keys(teethMap).map(tooth => { return { tooth: tooth, workTypes: Array.from(teethMap[tooth].works).join(' + '), agreed: teethMap[tooth].agreed, required: teethMap[tooth].required, paid: teethMap[tooth].paid, balance: teethMap[tooth].required - teethMap[tooth].paid }; });
        return { groupedByTooth, totalAgreed, totalRequired, totalPaid, balance: totalRequired - totalPaid, periodLabel: dateRange ? dateRange.label : 'جميع الفترات', hiddenCount, isAdminOrManager };
    } catch (error) { return { error: '⚠️ حدث خطأ أثناء جلب تفاصيل الجلسات.' }; }
}

function formatDetailedReport(patient, result, currentUser) {
    if (result.groupedByTooth.length === 0) {
        if (result.hiddenCount > 0) return `ℹ️ لا توجد جلسات مسجلة لك مع المريض *${patient.name}* خلال (${result.periodLabel}).\n*(توجد ${result.hiddenCount} جلسة مسجلة مع أطباء آخرين)*.\n\n💡 (أرسل "0" للرجوع).`;
        return `❌ لا توجد أي جلسات مسجلة للمريض *${patient.name}* خلال هذه الفترة.\n\n💡 (أرسل "0" للرجوع).`;
    }
    let msg = `🦷 *كشف الحساب والعمل المجمع للمريض*\n👤 *الاسم:* ${patient.name}\n🗓️ *الفترة:* ${result.periodLabel}\n═══════════════════\n\n`;
    result.groupedByTooth.forEach((t) => { msg += `🦷 *رقم السن:* ${t.tooth || 'عام'}\n🛠 *نوع العمل:* ${t.workTypes}\n`; if (t.agreed > 0) msg += `🤝 *المتفق عليه:* ${t.agreed} شيكل\n`; msg += `💰 *المطلوب:* ${t.required} | 💵 *المدفوع:* ${t.paid}\n〰〰️〰️〰️〰️〰️\n`; });
    msg += `\n📊 *الإجماليات الكلية:* \n🔸 المتفق عليه: *${result.totalAgreed} شيكل*\n🔹 المطلوب: *${result.totalRequired} شيكل*\n🔹 المدفوع: *${result.totalPaid} شيكل*\n`;
    if (result.balance > 0) msg += `🔴 *الرصيد المتبقي عليه:* *${result.balance} شيكل*\n`; else if (result.balance < 0) msg += `🔵 *رصيد مسدد بزيادة:* *${Math.abs(result.balance)} شيكل*\n`; else msg += `🟢 *الحساب مسدد بالكامل*\n`;
    return msg + '\n\n📄 *لاستخراج هذا الكشف كملف PDF للطباعة، أرسل رقم 1*\n💡 (أرسل "0" للرجوع).';
}

let LETTERHEAD_B64 = null;
try { LETTERHEAD_B64 = fs.readFileSync(path.join(__dirname, 'letterhead.jpg')).toString('base64'); } catch (e) { console.log('⚠️ لم يتم العثور على letterhead.jpg - ستصدر الفاتورة بدون ورقة العيادة.'); }

function buildInvoiceHTML(patient, result) {
    const ageText = calculateAgeText(patient.birth); const reportDate = formatDisplayDate(getStandardDateISO(new Date())); const ROWS_PER_PAGE = 7;
    const bgStyle = LETTERHEAD_B64 ? `background-image: url('data:image/jpeg;base64,${LETTERHEAD_B64}');` : '';
    const list = result.groupedByTooth;
    const pages = [];
    for (let i = 0; i < list.length; i += ROWS_PER_PAGE) pages.push(list.slice(i, i + ROWS_PER_PAGE));

    const totalsRow = `<tr><td colspan="2" style="font-weight:bold;">الإجماليات:</td><td style="font-weight:bold;">${result.totalAgreed}</td><td style="font-weight:bold;">${result.totalRequired}</td><td style="font-weight:bold;">${result.totalPaid}</td><td style="color: ${result.balance > 0 ? 'red' : 'green'}; font-weight:bold;">${result.balance > 0 ? result.balance : 0}</td></tr>`;

    const pagesHtml = pages.map((chunk, pIdx) => {
        const rows = chunk.map(t => `<tr><td>${t.tooth}</td><td>${t.workTypes}</td><td>${t.agreed}</td><td>${t.required}</td><td>${t.paid}</td><td style="color: ${t.balance > 0 ? 'red' : 'green'}; font-weight:bold;">${t.balance > 0 ? t.balance : 0}</td></tr>`).join('');
        const isLast = pIdx === pages.length - 1;
        return `<div class="page"><div class="content">
            <div class="info">اسم المريض: <span>${patient.name}</span>${ageText ? ` &nbsp;|&nbsp; العمر: <span>${ageText}</span>` : ''}<br>الفترة: ${result.periodLabel} &nbsp;|&nbsp; تاريخ التقرير: <span>${reportDate}</span></div>
            <table class="inv"><thead><tr><th>رقم السن</th><th>تفاصيل العمل</th><th>المتفق عليه</th><th>المطلوب</th><th>المدفوع</th><th>رصيد الدين</th></tr></thead>
            <tbody>${rows}${isLast ? totalsRow : ''}</tbody></table>
            ${isLast ? '<div class="disclaimer">تعتبر هذه الورقة بمثابة فاتورة طبية وسند قبض، وأعطيت هذه الورقة للمريض بناءً على طلبه دون أدنى مسؤولية تجاه الغير.</div>' : ''}
        </div></div>`;
    }).join('');

    return `
    <!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>فاتورة طبية</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; font-family: 'Cairo', sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { position: relative; width: 210mm; height: 296.5mm; overflow: hidden; box-sizing: border-box; page-break-after: always; break-after: page; ${bgStyle} background-size: 210mm 297mm; background-repeat: no-repeat; }
        .page:last-child { page-break-after: auto; break-after: auto; }
        .content { position: absolute; top: 90mm; left: 14mm; right: 14mm; height: 125mm; overflow: hidden; }
        .info { font-size: 18px; font-weight: bold; margin-bottom: 10px; line-height: 1.7; }
        .info span { color: #168a9a; }
        table.inv { width: 100%; border-collapse: collapse; text-align: center; font-size: 15px; }
        table.inv th, table.inv td { border: 1px solid #ddd; padding: 8px 6px; font-weight: 800; background: rgba(255,255,255,0.55); }
        table.inv th { background-color: rgba(244,249,249,0.9); color: #168a9a; border-bottom: 2px solid #168a9a; }
        .disclaimer { margin-top: 14px; font-size: 14px; font-weight: 700; line-height: 1.8; text-align: center; color: #000; }
    </style></head>
    <body>${pagesHtml || '<div class="page"></div>'}</body></html>`;
}

async function generatePDFReport(patient, result, currentUser) {
    let browser;
    try {
        const htmlContent = buildInvoiceHTML(patient, result);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'] });
        const page = await browser.newPage(); await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally { if (browser) await browser.close(); }
}

function createFinanceObj() {
    return {
        ILS: { income: 0, expense: 0, debt: 0, cash: 0, app: 0, req: 0 },
        USD: { income: 0, expense: 0, debt: 0, cash: 0, app: 0, req: 0 }
    };
}

const EXPENSE_CATEGORIES = [
    'الرواتب', 'اللوجستيات', 'المواصلات', 'كهرباء', 'غداء', 'مياه', 'ايجار', 'معامل أسنان', 'مواد أسنان', 'أخرى'
];

async function auditPatientDebt(query) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if (!authClient) return '❌ لم يتم ربط حساب جوجل.';
        const patientsMap = await getPatientsMap();
        const rows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الوارد');
        const q = normalizeArabic(query);
        const lines = []; const totals = {}; let skippedCount = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.length === 0) continue;
            if (row[4] === 'المدفوع' || row[1] === 'التاريخ') continue;
            const rawId = (row[2] || '').toString().trim();
            const pName = patientsMap[rawId.toLowerCase()] ? patientsMap[rawId.toLowerCase()].name : rawId;
            if (!normalizeArabic(pName).includes(q)) continue;

            const stdDate = parseDateSafely(row[1]);
            let dateTxt = stdDate ? formatDisplayDate(stdDate) : `غير مقروء [${row[1]}]`;
            let flag = '';
            if (!stdDate) { flag = ' ⚠️ تاريخ غير مقروء (يُتجاهل في التقارير)'; skippedCount++; }
            else {
                const mm = parseInt(stdDate.split('-')[1], 10), dd = parseInt(stdDate.split('-')[2], 10);
                if (mm > 12 || dd > 31) { flag = ' ⚠️ تاريخ غير صالح (يُستبعد من التقارير)'; skippedCount++; }
            }
            const reqVal = parseMoney(row[3]); const paidVal = parseMoney(row[4]);
            const doc = (row[6] || 'غير محدد').toString().trim();
            const clinic = (row[9] || 'عيادة الأسنان').toString().trim();
            const currency = (row[5] || 'شيكل').toString().trim();
            const isDollar = currency.includes('دولار') || currency.includes('$');
            const key = `${pName} | ${clinic} | ${isDollar ? '$' : '₪'}`;
            if (!totals[key]) totals[key] = { req: 0, paid: 0 };
            totals[key].req += reqVal; totals[key].paid += paidVal;
            lines.push(`${dateTxt} | ${doc} | ${clinic} | مطلوب ${reqVal} | مدفوع ${paidVal}${flag}`);
        }
        if (lines.length === 0) return `❌ لا توجد حركات في الوارد لاسم يحتوي: ${query}`;
        let msg = `🔍 *تدقيق حركات:* ${query}\n═══════════════════\n`;
        const MAX = 60;
        lines.slice(0, MAX).forEach((l, i) => { msg += `${i + 1}. ${l}\n`; });
        if (lines.length > MAX) msg += `... (عرض أول ${MAX} من ${lines.length} حركة)\n`;
        msg += `\n📊 *الصافي لكل مريض/عيادة/عملة:*\n`;
        Object.keys(totals).forEach(k => { const t = totals[k]; msg += `• ${k}\n   مطلوب ${t.req} | مدفوع ${t.paid} | المتبقي *${t.req - t.paid}*\n`; });
        if (skippedCount > 0) msg += `\n⚠️ يوجد ${skippedCount} صف بتاريخ غير صالح لا تحسبه التقارير.`;
        return msg;
    } catch (e) { console.error('Audit Error:', e); return '⚠️ حدث خطأ أثناء التدقيق: ' + e.message; }
}

async function fetchFinancialReportAdmin(filter, currentUser) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if(!authClient) return { error: '❌ لم يتم ربط حساب جوجل.' };
        
        const patientsMap = await getPatientsMap(); 
        const incomingRows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الوارد');
        const outgoingRows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الصادر');
        
        const targetDoctor = filter.doctor || 'الكل';
        const targetClinic = filter.clinic || 'الكل';
        const dateRange = filter.dateRange;

        let report = { clinics: {}, special: { private: { ILS: 0, USD: 0, details: [] }, supplies: { ILS: 0, USD: 0, details: [] } } };

        for (let i = 1; i < incomingRows.length; i++) {
            const row = incomingRows[i]; if (!row || row.length === 0) continue;
            if (row[4] === 'المدفوع' || row[1] === 'التاريخ') continue; 
            
            const stdDate = parseDateSafely(row[1]);
            if (!stdDate) continue;

            if (dateRange && dateRange.from !== '0000-00-00') { 
                if (stdDate < dateRange.from || stdDate > dateRange.to) continue; 
            }

            const rawPatientId = (row[2] || '').toString().trim();
            const pName = patientsMap[rawPatientId.toLowerCase()] ? patientsMap[rawPatientId.toLowerCase()].name : (rawPatientId || 'غير محدد');
            
            const docName = (row[6] || 'غير محدد').toString().trim(); 
            const clinicName = (row[9] || 'عيادة الأسنان').toString().trim();
            
            if (targetDoctor !== 'الكل' && !docName.includes(targetDoctor)) continue;
            if (targetClinic !== 'الكل' && !clinicName.includes(targetClinic)) continue;
            
            const reqVal = parseMoney(row[3]); const paidVal = parseMoney(row[4]);
            if (reqVal === 0 && paidVal === 0) continue;

            const currency = (row[5] || 'شيكل').toString().trim(); 
            const isDollar = currency.includes('دولار') || currency.includes('$');
            const isApp = (row[7] || '').toString().trim().toLowerCase().includes('تطبيق') || (row[8] || '').toString().trim() !== '';

            if (!report.clinics[clinicName]) { 
                report.clinics[clinicName] = { 
                    summary: createFinanceObj(), daily: {}, expenses: {}, salaries: [], patientDebts: {}, debtsList: [], doctorTotals: {}
                }; 
                EXPENSE_CATEGORIES.forEach(cat => { report.clinics[clinicName].expenses[cat] = { ILS: 0, USD: 0, details: [] }; });
            }
            const cObj = report.clinics[clinicName];
            
            if (!cObj.daily[stdDate]) cObj.daily[stdDate] = { ILS: { cash: 0, app: 0 }, USD: { cash: 0, app: 0 } };
            const dayObj = cObj.daily[stdDate];

            if(isDollar) {
                cObj.summary.USD.income += paidVal; cObj.summary.USD.req += reqVal;
                if(isApp) { dayObj.USD.app += paidVal; cObj.summary.USD.app += paidVal; } else { dayObj.USD.cash += paidVal; cObj.summary.USD.cash += paidVal; }
            } else {
                cObj.summary.ILS.income += paidVal; cObj.summary.ILS.req += reqVal;
                if(isApp) { dayObj.ILS.app += paidVal; cObj.summary.ILS.app += paidVal; } else { dayObj.ILS.cash += paidVal; cObj.summary.ILS.cash += paidVal; }
            }

            if (!cObj.doctorTotals[docName]) cObj.doctorTotals[docName] = { ILS: {req:0, paid:0}, USD: {req:0, paid:0} };
            if (isDollar) {
                cObj.doctorTotals[docName].USD.req += reqVal; cObj.doctorTotals[docName].USD.paid += paidVal;
            } else {
                cObj.doctorTotals[docName].ILS.req += reqVal; cObj.doctorTotals[docName].ILS.paid += paidVal;
            }

            const debtKey = `${pName}_${isDollar ? 'USD' : 'ILS'}`;
            if (!cObj.patientDebts[debtKey]) {
                cObj.patientDebts[debtKey] = { patient: pName, doctor: docName, isDollar: isDollar, req: 0, paid: 0, docs: {}, phone: (patientsMap[rawPatientId.toLowerCase()] ? patientsMap[rawPatientId.toLowerCase()].phone : 'غير متوفر') };
            }
            cObj.patientDebts[debtKey].req += reqVal;
            cObj.patientDebts[debtKey].paid += paidVal;
            const dRec = cObj.patientDebts[debtKey]; if (!dRec.docs[docName]) dRec.docs[docName] = { req: 0, paid: 0 }; dRec.docs[docName].req += reqVal; dRec.docs[docName].paid += paidVal;
        }

        if (outgoingRows && outgoingRows.length > 1) {
            for (let j = 1; j < outgoingRows.length; j++) {
                const row = outgoingRows[j]; if (!row || row.length === 0) continue;
                if (row[4] === 'المبلغ' || row[1] === 'التاريخ') continue;

                const stdDate = parseDateSafely(row[1]);
                if (!stdDate) continue;

                if (dateRange && dateRange.from !== '0000-00-00') { 
                    if (stdDate < dateRange.from || stdDate > dateRange.to) continue; 
                }
                
                const amt = parseMoney(row[4]);
                if (amt > 0) {
                    let cName = (row[7] ? row[7].toString().trim() : 'مصروفات عامة');
                    if (targetClinic !== 'الكل' && !cName.includes(targetClinic)) continue;
                    
                    let expTypeRaw = (row[2] || '').toString().trim();
                    let expDesc = (row[3] || '').toString().trim(); 
                    let expPayer = (row[8] || '').toString().trim();
                    
                    let expCurrency = (row[6] || 'شيكل').toString().trim();
                    const isDollar = expCurrency.includes('دولار') || expCurrency.includes('$');

                    const isSupplyExp = expTypeRaw.includes('توريد') || cName.includes('توريد');
                    const isPrivateExp = !isSupplyExp && (expTypeRaw.includes('خاص') || cName.includes('خاص'));
                    if (isSupplyExp || isPrivateExp) {
                        const bucket = isSupplyExp ? report.special.supplies : report.special.private;
                        if (isDollar) bucket.USD += amt; else bucket.ILS += amt;
                        const det = [expDesc, expPayer].filter(Boolean).join(' - ');
                        if (det && !bucket.details.includes(det)) bucket.details.push(det);
                        continue;
                    }
                    
                    if (!report.clinics[cName]) { 
                        report.clinics[cName] = { summary: createFinanceObj(), daily: {}, expenses: {}, salaries: [], patientDebts: {}, debtsList: [], doctorTotals: {} }; 
                        EXPENSE_CATEGORIES.forEach(cat => { report.clinics[cName].expenses[cat] = { ILS: 0, USD: 0, details: [] }; });
                    }
                    const cObj = report.clinics[cName];
                    
                    if(isDollar) cObj.summary.USD.expense += amt; else cObj.summary.ILS.expense += amt;

                    if(expTypeRaw.includes('رواتب') || expTypeRaw.includes('راتب')) {
                        cObj.salaries.push({ name: expDesc || 'غير محدد', amount: amt, isDollar });
                        if(isDollar) cObj.expenses['الرواتب'].USD += amt; else cObj.expenses['الرواتب'].ILS += amt;
                    } else {
                        let assignedCat = 'أخرى';
                        for(let cat of EXPENSE_CATEGORIES) {
                            if(expTypeRaw.includes(cat)) { assignedCat = cat; break; }
                        }
                        if(assignedCat === 'أخرى') {
                            if(expTypeRaw.includes('طعام') || expTypeRaw.includes('فطور') || expTypeRaw.includes('كولا') || expTypeRaw.includes('قهوة') || expTypeRaw.includes('خضرة')) assignedCat = 'غداء';
                            else if(expTypeRaw.includes('مشتريات') || expTypeRaw.includes('نثريات') || expTypeRaw.includes('أدوات') || expTypeRaw.includes('كاسات') || expTypeRaw.includes('طباعة')) assignedCat = 'اللوجستيات';
                            else if(expTypeRaw.includes('معمل')) assignedCat = 'معامل أسنان';
                            else if(expTypeRaw.includes('مواد') || expTypeRaw.includes('بنج') || expTypeRaw.includes('Gloves') || expTypeRaw.includes('File')) assignedCat = 'مواد أسنان';
                        }
                        
                        if(isDollar) cObj.expenses[assignedCat].USD += amt; else cObj.expenses[assignedCat].ILS += amt;
                        let combinedDetail = [expDesc, expPayer].filter(Boolean).join(' - ');
                        if(combinedDetail && !cObj.expenses[assignedCat].details.includes(combinedDetail)) cObj.expenses[assignedCat].details.push(combinedDetail);
                    }
                }
            }
        }

        for (let cName in report.clinics) {
            const cObj = report.clinics[cName];
            for (let dKey in cObj.patientDebts) {
                let debtRecord = cObj.patientDebts[dKey];
                let finalDebt = debtRecord.req - debtRecord.paid;
                if (finalDebt > 0) { 
                    const docNames = Object.keys(debtRecord.docs || {}); const owingDocs = docNames.filter(n => debtRecord.docs[n].req - debtRecord.docs[n].paid > 0); const docLabel = (owingDocs.length ? owingDocs : docNames).join(' + ') || debtRecord.doctor;
                    cObj.debtsList.push({ patient: debtRecord.patient, phone: debtRecord.phone, doctor: docLabel, req: Math.round(debtRecord.req * 100) / 100, paid: Math.round(debtRecord.paid * 100) / 100, amount: Math.round(finalDebt * 100) / 100, isDollar: debtRecord.isDollar });
                    if(debtRecord.isDollar) cObj.summary.USD.debt += finalDebt; else cObj.summary.ILS.debt += finalDebt;
                }
            }
        }

        const isAdminOrManager = (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري');
        return { report, isAdminOrManager, targetClinic, periodLabel: filter.dateRange ? filter.dateRange.label : 'الشهر الحالي' };
    } catch (error) { console.error('Daily Report Error:', error); return { error: '⚠️ حدث خطأ أثناء تجميع التقرير.' }; }
}

async function generateClinicFinancialPDF(res) {
    let browser;
    try {
        const r = res.report;
        let htmlContent = `
        <!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التقرير المالي</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
            body { font-family: 'Cairo', sans-serif; background-color: #fff; color: #333; margin: 0; padding: 20px; font-size: 20px; }
            .header-top { text-align: center; border-bottom: 4px solid #168a9a; padding-bottom: 10px; margin-bottom: 25px;}
            h1 { color: #168a9a; margin: 0; font-size: 32px; font-weight: 900;}
            h2 { color: #2c3e50; margin: 5px 0; font-size: 26px; font-weight: 800;}
            h3 { color: #168a9a; font-size: 24px; text-align: left; background: #f4f9f9; display: inline-block; padding: 8px 20px; border-right: 5px solid #168a9a; margin-top: 30px;}
            h4 { font-size: 22px; color: #34495e; font-weight: 800; border-bottom: 2px dashed #bdc3c7; padding-bottom: 5px; margin-bottom: 15px;}
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: center; font-size: 22px; font-weight: 700;}
            th, td { border: 2px solid #ccc; padding: 16px; }
            th { background-color: #f8f9fa; color: #168a9a; font-weight: 900; font-size: 24px;}
            .summary-table td:nth-child(1) { background: #f8f9fa; font-weight: 900; text-align: right; padding-right: 20px;}
            .page-break { page-break-before: always; }
            .global-summary th { background-color: #2c3e50; color: #fff; }
            tr { page-break-inside: avoid; }
        </style></head><body>`;

        const clinics = Object.keys(r.clinics).sort();
        const special = r.special || { private: { ILS: 0, USD: 0, details: [] }, supplies: { ILS: 0, USD: 0, details: [] } };
        const fmt = (v) => Math.round((v || 0) * 100) / 100;

        const buildGlobalSummaryTable = (cur, sym, alwaysShow) => {
            const privAmt = special.private[cur] || 0;
            const supAmt = special.supplies[cur] || 0;
            const showSpecial = alwaysShow || privAmt > 0 || supAmt > 0;
            let tReq = 0, tInc = 0, tExp = 0;
            let rowsHtml = '';

            clinics.forEach(cName => {
                const s = r.clinics[cName].summary[cur];
                if (!alwaysShow && s.income === 0 && s.expense === 0 && s.req === 0) return;
                const isOnlyExpenses = cName.includes('توريد') || cName.includes('مصروف') || cName.includes('نفقات');
                tReq += s.req; tInc += s.income; tExp += s.expense;
                const net = s.income - s.expense;
                const colorNet = (net < 0 && !isOnlyExpenses) ? '#c0392b' : '#2980b9';
                rowsHtml += `<tr>
                    <td style="font-weight:900;">${cName}</td>
                    <td style="color:#e67e22;">${isOnlyExpenses ? '-' : fmt(s.req)}</td>
                    <td style="color:#27ae60;">${isOnlyExpenses ? '-' : fmt(s.income)}</td>
                    <td style="color:#c0392b;">${fmt(s.expense)}</td>
                    <td style="color:${colorNet}; font-weight:900;">${isOnlyExpenses ? '-' : fmt(net)}</td>
                </tr>`;
            });

            if (!alwaysShow && rowsHtml === '' && !showSpecial) return '';

            const totalExp = tExp + privAmt + supAmt;
            let extraHtml = '';
            if (showSpecial) {
                const clinicsNet = tInc - tExp;
                extraHtml += `<tr style="background-color:#eef3f3; font-weight:900;">
                    <td>إجمالي العيادات</td>
                    <td style="color:#e67e22;">${fmt(tReq)}</td>
                    <td style="color:#27ae60;">${fmt(tInc)}</td>
                    <td style="color:#c0392b;">${fmt(tExp)}</td>
                    <td style="color:${clinicsNet < 0 ? '#c0392b' : '#2980b9'};">${fmt(clinicsNet)}</td>
                </tr>`;
                const privDet = special.private.details.length ? `<br><span style="font-size:15px; color:#7f8c8d;">${special.private.details.join(' ، ')}</span>` : '';
                const supDet = special.supplies.details.length ? `<br><span style="font-size:15px; color:#7f8c8d;">${special.supplies.details.join(' ، ')}</span>` : '';
                extraHtml += `<tr>
                    <td style="font-weight:900;">المصاريف الخاصة${privDet}</td>
                    <td>-</td><td>-</td>
                    <td style="color:#c0392b;">${fmt(privAmt)}</td>
                    <td style="color:#c0392b; font-weight:900;">${fmt(-privAmt)}</td>
                </tr>`;
                extraHtml += `<tr>
                    <td style="font-weight:900;">التوريدات${supDet}</td>
                    <td>-</td><td>-</td>
                    <td style="color:#c0392b;">${fmt(supAmt)}</td>
                    <td style="color:#c0392b; font-weight:900;">${fmt(-supAmt)}</td>
                </tr>`;
            }
            const finalNet = tInc - totalExp;
            extraHtml += `<tr style="background-color:#f4f9f9; font-weight:900; font-size:24px;">
                <td style="color:#168a9a;">${showSpecial ? 'الإجمالي الكلي النهائي' : 'الإجمالي الكلي'} (${sym})</td>
                <td style="color:#e67e22;">${fmt(tReq)}</td>
                <td style="color:#27ae60;">${fmt(tInc)}</td>
                <td style="color:#c0392b;">${fmt(totalExp)}</td>
                <td style="color:${finalNet < 0 ? '#c0392b' : '#2980b9'};">${fmt(finalNet)}</td>
            </tr>`;

            return `<table class="global-summary" style="margin-top: 20px;">
                <thead><tr>
                    <th>القسم / العيادة</th>
                    <th>المطلوب (${sym})</th>
                    <th>الإيرادات (${sym})</th>
                    <th>المصروفات (${sym})</th>
                    <th>صافي الربح (${sym})</th>
                </tr></thead>
                <tbody>${rowsHtml}${extraHtml}</tbody>
            </table>`;
        };

        let globalSummaryHtml = `
        <div class="header-top">
            <h1>التقرير المالي المجمع للعيادات</h1>
            <p style="font-weight:700; color:#555; font-size:22px;">الفترة: ${res.periodLabel}</p>
        </div>
        <h3>الملخص الشامل للإيرادات والمصروفات</h3>`;
        globalSummaryHtml += buildGlobalSummaryTable('ILS', '₪', true);
        globalSummaryHtml += buildGlobalSummaryTable('USD', '$', false);

        const mergedPatients = {};
        clinics.forEach(cName => {
            Object.values(r.clinics[cName].patientDebts).forEach(p => {
                const k = p.patient + '_' + (p.isDollar ? 'USD' : 'ILS');
                if (!mergedPatients[k]) mergedPatients[k] = { patient: p.patient, isDollar: p.isDollar, req: 0, paid: 0 };
                mergedPatients[k].req += p.req; mergedPatients[k].paid += p.paid;
            });
        });
        const patientList = Object.values(mergedPatients);
        if (patientList.length > 0) {
            globalSummaryHtml += `<h3>كشف حالات المرضى (المطلوب / المدفوع / المتبقي)</h3>
            <table>
                <thead><tr><th>اسم المريض</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
                <tbody>`;
            const pTot = { ILS: { req: 0, paid: 0 }, USD: { req: 0, paid: 0 } };
            patientList.forEach(p => {
                const sym = p.isDollar ? '$' : '₪';
                const rem = p.req - p.paid;
                const cur = p.isDollar ? 'USD' : 'ILS';
                pTot[cur].req += p.req; pTot[cur].paid += p.paid;
                globalSummaryHtml += `<tr>
                    <td style="font-weight:800;">${p.patient}</td>
                    <td style="color:#e67e22;">${fmt(p.req)} ${sym}</td>
                    <td style="color:#2980b9;">${fmt(p.paid)} ${sym}</td>
                    <td style="color:${rem > 0 ? '#c0392b' : '#27ae60'}; font-weight:900;">${fmt(rem)} ${sym}</td>
                </tr>`;
            });
            ['ILS', 'USD'].forEach(cur => {
                const t = pTot[cur];
                if (t.req === 0 && t.paid === 0) return;
                const sym = cur === 'USD' ? '$' : '₪';
                const rem = t.req - t.paid;
                globalSummaryHtml += `<tr style="background-color:#f4f9f9; font-weight:900;">
                    <td style="color:#168a9a;">الإجمالي (${sym})</td>
                    <td style="color:#e67e22;">${fmt(t.req)} ${sym}</td>
                    <td style="color:#2980b9;">${fmt(t.paid)} ${sym}</td>
                    <td style="color:${rem > 0 ? '#c0392b' : '#27ae60'};">${fmt(rem)} ${sym}</td>
                </tr>`;
            });
            globalSummaryHtml += `</tbody></table>`;
        }

        globalSummaryHtml += `<div class="page-break"></div>`;
        htmlContent += globalSummaryHtml;

        clinics.forEach((cName, index) => {
            if(index > 0) htmlContent += `<div class="page-break"></div>`;
            const c = r.clinics[cName];
            const isOnlyExpenses = cName.includes('توريد') || cName.includes('مصروف') || cName.includes('نفقات');
            
            htmlContent += `
            <div class="header-top">
                <h2>التقرير المالي التفصيلي - ${cName}</h2>
            </div>`;

            if (isOnlyExpenses) {
                htmlContent += `<h3>1. جدول المصروفات الإجمالية</h3>`;
                htmlContent += `<table class="summary-table">
                    <thead><tr><th>البيان</th><th>العملة (شيكل)</th><th>العملة (دولار)</th></tr></thead>
                    <tbody>
                        <tr><td>إجمالي المصروفات والنفقات</td><td style="color:#c0392b; font-weight:900; font-size:26px;">₪ ${c.summary.ILS.expense}</td><td style="color:#c0392b; font-weight:900; font-size:26px;">$ ${c.summary.USD.expense}</td></tr>
                    </tbody>
                </table>`;
            } else {
                htmlContent += `<h3>1. جدول الملخص المالي والربحية</h3>`;
                htmlContent += `<table class="summary-table">
                    <thead><tr><th>البيان</th><th>العملة (شيكل)</th><th>العملة (دولار)</th></tr></thead>
                    <tbody>
                        <tr><td>إجمالي المطلوب</td><td style="color:#e67e22;">₪ ${c.summary.ILS.req}</td><td style="color:#e67e22;">$ ${c.summary.USD.req}</td></tr>
                        <tr><td>إجمالي الإيرادات (الدخل)</td><td style="color:#27ae60;">₪ ${c.summary.ILS.income}</td><td style="color:#27ae60;">$ ${c.summary.USD.income}</td></tr>
                        <tr><td>إجمالي المصروفات</td><td style="color:#c0392b;">₪ ${c.summary.ILS.expense}</td><td style="color:#c0392b;">$ ${c.summary.USD.expense}</td></tr>
                        <tr><td>صافي الربح النهائي</td><td style="color:#2980b9; font-weight:900; font-size:26px;">₪ ${c.summary.ILS.income - c.summary.ILS.expense}</td><td style="color:#2980b9; font-weight:900; font-size:26px;">$ ${c.summary.USD.income - c.summary.USD.expense}</td></tr>
                    </tbody>
                </table>`;
            }

            htmlContent += `<h4>2. تفاصيل المصروفات</h4>`;
            htmlContent += `<p style="font-weight:800; font-size:22px; margin-bottom:8px; color:#2c3e50;">كشف الرواتب والمكافآت الصادرة:</p>`;
            if(c.salaries.length > 0) {
                htmlContent += `<table><thead><tr><th>الموظف</th><th>الراتب المستلم</th></tr></thead><tbody>`;
                c.salaries.forEach(s => htmlContent += `<tr><td>${s.name}</td><td style="color:#c0392b; font-weight:800;">${s.amount} ${s.isDollar?'$':'شيكل'}</td></tr>`);
                htmlContent += `</tbody></table>`;
            } else { htmlContent += `<p style="text-align:center; color:#777;">لا توجد رواتب مسجلة.</p>`;}

            htmlContent += `<p style="font-weight:800; font-size:22px; margin-bottom:8px; color:#2c3e50;">المسحوبات والنثريات اللوجستية ومواد الأسنان والمعامل:</p>`;
            htmlContent += `<table><thead><tr><th>البيان</th><th>تفاصيل/مستلم</th><th>الإجمالي (شيكل)</th><th>الإجمالي (دولار)</th></tr></thead><tbody>`;
            EXPENSE_CATEGORIES.forEach(cat => {
                const exp = c.expenses[cat];
                if(exp.ILS > 0 || exp.USD > 0 || cat === 'الرواتب') {
                    htmlContent += `<tr><td style="font-weight:900;">${cat}</td><td>${exp.details.join(' ، ')}</td><td style="color:#c0392b;">${exp.ILS}</td><td style="color:#c0392b;">${exp.USD}</td></tr>`;
                }
            });
            htmlContent += `</tbody></table>`;

            if(!isOnlyExpenses) {
                htmlContent += `<h4>3. إيرادات ومستحقات الأطباء التفصيلية</h4>`;
                const docs = Object.keys(c.doctorTotals);
                if(docs.length > 0){
                    htmlContent += `<table><thead><tr><th>اسم الطبيب (النسبة)</th><th>إجمالي المطلوب</th><th>إجمالي المدفوع</th><th>المستحق المالي</th></tr></thead><tbody>`;
                    docs.forEach(doc => {
                        const t = c.doctorTotals[doc];
                        let pct = 0.35;
                        for (let dName in DOCTOR_RATES) {
                            if (doc.includes(dName) || dName.includes(doc)) { pct = DOCTOR_RATES[dName]; break; }
                        }
                        if(t.ILS.req > 0 || t.ILS.paid > 0 || t.USD.req > 0 || t.USD.paid > 0){
                            htmlContent += `<tr><td style="color:#2c3e50; font-weight:800;">د. ${doc}<br><span style="font-size:16px; color:#7f8c8d;">(${Math.round(pct*100)}%)</span></td>`;
                            htmlContent += `<td style="color:#e67e22;">${t.ILS.req>0 ? t.ILS.req+'₪ ' : ''}${t.USD.req>0 ? '| '+t.USD.req+'$' : ''}</td>`;
                            htmlContent += `<td style="color:#2980b9;">${t.ILS.paid>0 ? t.ILS.paid+'₪ ' : ''}${t.USD.paid>0 ? '| '+t.USD.paid+'$' : ''}</td>`;
                            htmlContent += `<td style="color:#27ae60; font-size:26px; font-weight:900;">${t.ILS.paid>0 ? (t.ILS.paid*pct).toFixed(2)+'₪ ' : ''}${t.USD.paid>0 ? '| '+(t.USD.paid*pct).toFixed(2)+'$' : ''}</td></tr>`;
                        }
                    });
                    htmlContent += `</tbody></table>`;
                } else { htmlContent += `<p style="text-align:center; color:#777;">لا توجد إيرادات للأطباء مسجلة.</p>`;}
            }

            htmlContent += `<h4>كشف ديون المرضى</h4>`;
            if(c.debtsList.length > 0) {
                htmlContent += `<table><thead><tr><th>اسم المريض</th><th>الطبيب المعالج</th><th>المبلغ المتبقي (دين)</th></tr></thead><tbody>`;
                c.debtsList.forEach(d => htmlContent += `<tr><td>${d.patient}</td><td>د. ${d.doctor}</td><td style="color:#c0392b; font-weight:900;">${d.amount} ${d.isDollar?'$':'₪'}</td></tr>`);
                htmlContent += `</tbody></table>`;
            } else { htmlContent += `<p style="text-align:center; color:#777;">لا توجد ديون مسجلة لهذه العيادة.</p>`;}
        });

        htmlContent += `</body></html>`;
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'] });
        const page = await browser.newPage(); await page.setContent(htmlContent, { waitUntil: 'networkidle0' }); return await page.pdf({ format: 'A4', printBackground: true });
    } finally { if (browser) await browser.close(); }
}

async function generateDebtPDF(res) {
    let browser;
    try {
        const r = res.report;
        let htmlContent = `
        <!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير الديون</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
            body { font-family: 'Cairo', sans-serif; background-color: #fff; color: #333; margin: 0; padding: 20px; font-size: 20px; }
            .header-top { text-align: center; border-bottom: 4px solid #c0392b; padding-bottom: 10px; margin-bottom: 25px;}
            h1 { color: #c0392b; margin: 0; font-size: 32px; font-weight: 900;}
            h2 { color: #2c3e50; margin: 5px 0; font-size: 26px; font-weight: 800;}
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: center; font-size: 22px; font-weight: 700;}
            th, td { border: 2px solid #ccc; padding: 16px; }
            th { background-color: #fdf2e9; color: #d35400; font-weight: 900; font-size: 24px;}
            .summary-table td:nth-child(1) { background: #fdf2e9; font-weight: 900; text-align: right; padding-right: 20px;}
            .page-break { page-break-before: always; }
            .debt-table { font-size: 17px; }
            .debt-table th { font-size: 18px; padding: 10px 6px; }
            .debt-table td { padding: 10px 6px; }
            tr { page-break-inside: avoid; }
        </style></head><body>`;

        const clinics = Object.keys(r.clinics).sort();
        clinics.forEach((cName, index) => {
            if(index > 0) htmlContent += `<div class="page-break"></div>`;
            const c = r.clinics[cName];
            
            htmlContent += `
            <div class="header-top">
                <h1>عيادات الدكتور حسام العايدي للأسنان</h1>
                <h2>تقرير الذمم والديون المالية المستحقة</h2>
                <p style="margin:5px 0; font-weight:700; color:#555; font-size:22px;">تقرير ${cName} عن ${res.periodLabel}</p>
            </div>`;

            if(c.debtsList.length > 0) {
                htmlContent += `<table class="debt-table"><thead><tr><th>اسم المريض</th><th>رقم الهاتف</th><th>الطبيب المعالج</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي (دين)</th></tr></thead><tbody>`;
                c.debtsList.forEach(d => { const sym = d.isDollar ? '$' : '₪'; htmlContent += `<tr><td>${d.patient}</td><td dir="ltr">${d.phone || 'غير متوفر'}</td><td>د. ${d.doctor}</td><td style="color:#e67e22;">${d.req} ${sym}</td><td style="color:#2980b9;">${d.paid} ${sym}</td><td style="color:#c0392b; font-weight:900;">${d.amount} ${sym}</td></tr>`; });
                htmlContent += `</tbody></table>`;
                
                htmlContent += `
                <table class="summary-table" style="width:50%; margin: 0 auto; border: 4px solid #c0392b;">
                    <thead><tr><th colspan="2" style="background:#c0392b; color:#fff;">إجمالي الديون الكلية لـ (${cName})</th></tr></thead>
                    <tbody>
                        <tr><td>إجمالي الشيكل ₪</td><td style="color:#c0392b; font-size:26px;">${c.summary.ILS.debt}</td></tr>
                        <tr><td>إجمالي الدولار $</td><td style="color:#c0392b; font-size:26px;">${c.summary.USD.debt}</td></tr>
                    </tbody>
                </table>`;
            } else { 
                htmlContent += `<p style="text-align:center; color:#27ae60; font-weight:900; font-size:26px; margin-top:50px;">لا توجد ديون مالية مسجلة لهذه العيادة والحمد لله.</p>`;
            }
        });

        htmlContent += `</body></html>`;
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'] });
        const page = await browser.newPage(); await page.setContent(htmlContent, { waitUntil: 'networkidle0' }); return await page.pdf({ format: 'A4', printBackground: true });
    } finally { if (browser) await browser.close(); }
}

async function fetchDoctorDailySummary(doctorName) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if (!authClient) return null;
        const patientsMap = await getPatientsMap();
        const incomingRows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الوارد');
        if (!incomingRows || incomingRows.length <= 1) return null;

        const now = new Date();
        const todayDateISO = getStandardDateISO(now);

        let cases = [];
        let sumILSReq = 0, sumILSPaid = 0, sumUSDReq = 0, sumUSDPaid = 0;

        for (let i = 1; i < incomingRows.length; i++) {
            const row = incomingRows[i];
            if (!row || row.length === 0) continue;
            if (row[4] === 'المدفوع' || row[1] === 'التاريخ') continue;

            const stdDate = parseDateSafely(row[1]);
            if (stdDate !== todayDateISO) continue;

            const rowDoc = (row[6] || '').toString().trim();
            if (!rowDoc.includes(doctorName.split(' ')[0])) continue;

            const rawPatientId = (row[2] || '').toString().trim();
            const pName = patientsMap[rawPatientId.toLowerCase()] ? patientsMap[rawPatientId.toLowerCase()].name : (rawPatientId || 'غير محدد');

            const reqVal = parseMoney(row[3]);
            const paidVal = parseMoney(row[4]);
            const currency = (row[5] || 'شيكل').toString().trim();

            cases.push({ patient: pName, req: reqVal, paid: paidVal, currency: currency });

            if (currency.includes('$') || currency.includes('دولار')) {
                sumUSDReq += reqVal; sumUSDPaid += paidVal;
            } else {
                sumILSReq += reqVal; sumILSPaid += paidVal;
            }
        }

        if (cases.length === 0) return null;

        let msg = `🌙 *تقرير نهاية اليوم (حالات اليوم)*\n👨‍⚕️ *د. ${doctorName}*\n📅 *التاريخ:* ${formatDisplayDate(todayDateISO)}\n═══════════════════\n\n`;

        cases.forEach((c, idx) => {
            msg += `*${idx + 1}.* 👤 ${c.patient}\n`;
            msg += `   🔸 المطلوب: ${c.req} | 🔹 المدفوع: ${c.paid} (${c.currency})\n〰〰️〰️\n`;
        });

        msg += `\n📊 *إجمالي حالاتك اليوم:*\n`;
        if(sumILSReq > 0 || sumILSPaid > 0) msg += `شيكل ₪ ⟸ المطلوب: ${sumILSReq} | المدفوع: ${sumILSPaid}\n`;
        if(sumUSDReq > 0 || sumUSDPaid > 0) msg += `دولار $ ⟸ المطلوب: ${sumUSDReq} | المدفوع: ${sumUSDPaid}\n`;

        msg += `\n💡 نشكر لك جهودك، تصبح على خير!`;
        return msg;
    } catch (error) {
        return null;
    }
}

async function fetchAppointmentsFromSheet(filter) {
    try {
        const authClient = await checkAndGetGoogleAuth();
        if(!authClient) return { data: [] };
        
        const patientsMap = await getPatientsMap();
        const rows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'مواعيد');
        let data = [];
        if (!rows || rows.length < 1) return { data: [] };
        
        let hRowIdx = 0;
        for(let r = 0; r < Math.min(5, rows.length); r++) {
            if (rows[r] && rows[r].some(c => c && c.toString().includes('تاريخ'))) { hRowIdx = r; break; }
        }
        const headers = rows[hRowIdx] ? rows[hRowIdx].map(h => (h || '').toString().trim()) : [];
        const fName = headers.findIndex(h => h.includes('اسم') || h.includes('مريض')); const fDoc = headers.findIndex(h => h.includes('طبيب') || h.includes('دكتور')); const fDate = headers.findIndex(h => h === 'التاريخ' || h.includes('تاريخ')); const fTime = headers.findIndex(h => h.includes('وقت') || h.includes('ساعة')); const fClinic = headers.findIndex(h => h.includes('عيادة') || h.includes('فرع'));
        
        for (let i = hRowIdx + 1; i < rows.length; i++) {
            const row = rows[i]; if (!row || row.length === 0) continue;
            
            let rawPatientId = (fName !== -1 ? row[fName] : row[1])?.toString().trim() || '';
            let pName = patientsMap[rawPatientId.toLowerCase()] ? patientsMap[rawPatientId.toLowerCase()].name : rawPatientId;
            if (!pName) continue;

            const doctor = (fDoc !== -1 ? row[fDoc] : row[3])?.toString().trim() || ''; 
            const dateStr = parseDateSafely(fDate !== -1 ? row[fDate] : row[4]); 
            const timeStr = parseTimeSafely(fTime !== -1 ? row[fTime] : row[5]); 
            const clinic = (fClinic !== -1 ? row[fClinic] : row[6])?.toString().trim() || '';

            if (filter.targetPatient && !pName.includes(filter.targetPatient.name)) continue;
            if (filter.doctor && filter.doctor !== 'الكل' && !doctor.includes(filter.doctor)) continue;
            if (filter.clinic && filter.clinic !== 'الكل' && !clinic.includes(filter.clinic)) continue;
            if (filter.date && filter.date !== 'الكل' && dateStr !== filter.date) continue;
            
            data.push({ patient: pName, doctor: doctor, clinic: clinic, date: dateStr, start: timeStr });
        }
        return { data };
    } catch (error) { return { error: '⚠ حدث خطأ فني أثناء المواعيد.' }; }
}

function formatAppointmentMessage(patientName, patientPhone, appts) {
    if (!appts || appts.length === 0) return `❌ لا توجد مواعيد لـ: *${patientName}*.\n\n💡 (أرسل "0" للرجوع).`;
    let msg = `📅 *مواعيد المريض:* ${patientName}\n\n`;
    appts.forEach((appt, i) => { msg += `*${i + 1}. الطبيب:* ${appt.doctor}\n🗓️ *التاريخ:* ${formatDisplayDate(appt.date)}\n⏰ *الوقت:* ${appt.start}\n〰️〰️〰️〰\n`; });
    return msg + '💡 (أرسل "استعلام" للعودة).';
}

async function fetchQueueBookingReport(queueList, currentUser) {
    return { reports: queueList.map(p => ({ name: p.name, phone: p.phone, clinic: p.clinic, currentWork: 'كشف', totalRequired: 0, totalPaid: 0, balance: 0 })), isAdminOrManager: true };
}
function formatQueueBookingMessage(reportResult) {
    let msg = `📋 *قائمة بيانات المرضى المحددين*\n═══════════════════\n\n`;
    reportResult.reports.forEach((rep, idx) => { msg += `*${idx + 1}. 👤* ${rep.name}\n📱 ${rep.phone}\n〰️〰️〰️〰️\n`; });
    return msg + '\n💡 (أرسل "استعلام" للبدء من جديد).';
}

let lastKnownRowCount = -1;
function startSheetTracker(whatsappClient) {
    setInterval(async () => {
        try {
            if (!isAuthValid) return; 
            const authClient = await checkAndGetGoogleAuth(); if(!authClient) return;
            const rows = await getWorkbookRows(authClient, MAIN_DATA_FILE_ID, 'الوارد');
            if (!rows || rows.length <= 1) return;

            if (lastKnownRowCount === -1) { lastKnownRowCount = rows.length; return; }
            if (rows.length > lastKnownRowCount) {
                let hRowIdx = 0;
                for(let r = 0; r < Math.min(5, rows.length); r++) {
                    if (rows[r] && (rows[r].some(c => c && c.toString().includes('مطلوب')) || rows[r].some(c => c && c.toString().includes('مدفوع')))) { hRowIdx = r; break; }
                }
                const headers = rows[hRowIdx] ? rows[hRowIdx].map(h => (h || '').toString().trim()) : [];
                const fPatient = headers.findIndex(h => h.includes('اسم') || h.includes('مريض')); 
                const fDoc = headers.findIndex(h => h.includes('طبيب') || h.includes('دكتور')); 
                const fClinic = headers.findIndex(h => h.includes('عيادة'));
                
                for (let i = lastKnownRowCount; i < rows.length; i++) {
                    const row = rows[i]; if (!row || row.length === 0) continue;
                    const patientName = (fPatient !== -1 ? row[fPatient] : row[2])?.toString().trim() || ''; 
                    const doctorName = (fDoc !== -1 ? row[fDoc] : row[6])?.toString().trim() || ''; 
                    const clinicName = (fClinic !== -1 ? row[fClinic] : row[9])?.toString().trim() || '';
                    if (patientName && doctorName) {
                        let doctorPhone = null;
                        for (const phone in USERS) { if (USERS[phone].role === 'طبيب أسنان' && doctorName.includes(USERS[phone].name.split(' ')[0])) { doctorPhone = phone; break; } }
                        if (doctorPhone) { whatsappClient.sendMessage(doctorPhone + '@c.us', `🔔 *تنبيه دخول مريض*\n👨‍⚕️ د. ${doctorName}\nتم إضافة المريض *${patientName}* الآن في ${clinicName}.`).catch(console.error); }
                    }
                }
                lastKnownRowCount = rows.length;
            }
        } catch (err) {}
    }, 15000); 
}

async function run11PMReport(whatsappClient, testChatId, testUser) {
    const isTest = !!testChatId;
    try {
        if (!isAuthValid) {
            if (isTest) await whatsappClient.sendMessage(testChatId, '❌ لم يتم ربط حساب جوجل. أرسل "ربط جوجل" أولاً.');
            return;
        }

        if (isTest) {
            if (testUser && testUser.role === 'طبيب أسنان') {
                const doctorMsg = await fetchDoctorDailySummary(testUser.name);
                await whatsappClient.sendMessage(testChatId, doctorMsg || `🌙 *تقرير نهاية اليوم*\nد. ${testUser.name}، لا توجد حالات مسجلة باسمك لليوم.`);
            }
        } else {
            for (const phone in USERS) {
                const user = USERS[phone];
                if (user.role === 'طبيب أسنان') {
                    const doctorMsg = await fetchDoctorDailySummary(user.name);
                    if (doctorMsg) {
                        await whatsappClient.sendMessage(phone + '@c.us', doctorMsg).catch(err => {});
                    } else {
                        await whatsappClient.sendMessage(phone + '@c.us', `🌙 *تقرير نهاية اليوم*\nد. ${user.name}، لا توجد حالات مسجلة باسمك لليوم.\nتصبح على خير!`).catch(err => {});
                    }
                }
            }
        }

        const botUser = { name: 'النظام الآلي', permission: 'مسؤول' };
        const todayISO = getStandardDateISO(new Date());
        const dailyFilter = {
            clinic: 'الكل',
            doctor: 'الكل',
            dateRange: { from: todayISO, to: todayISO, label: `اليوم (${formatDisplayDate(todayISO)})` }
        };

        const res = await fetchFinancialReportAdmin(dailyFilter, botUser);
        if (res.error) {
            if (isTest) await whatsappClient.sendMessage(testChatId, res.error);
            return;
        }

        const msgText = `🔔 *التقرير المالي المجمع (الساعة 11 مساءً)* 🔔\n\nمرفق التقرير الختامي لحركات اليوم بصيغة PDF.`;
        let pdfBuffer = null;
        try { pdfBuffer = await generateClinicFinancialPDF(res); }
        catch (pdfErr) {
            console.error('11PM PDF Error:', pdfErr);
            if (isTest) await whatsappClient.sendMessage(testChatId, '⚠️ فشل إنشاء الـ PDF: ' + pdfErr.message);
        }

        if (isTest) {
            await whatsappClient.sendMessage(testChatId, '🧪 *نتيجة اختبار تقرير الساعة 11:*\n' + msgText);
            if (pdfBuffer) await sendPdf(whatsappClient, testChatId, pdfBuffer, `TEST_Daily_Report_${Date.now()}.pdf`);
            return;
        }

        for (const phone of Object.keys(USERS)) {
            const user = USERS[phone];
            if (user.permission === 'مسؤول' || user.permission === 'إداري' || user.name.includes('شهد') || user.name.includes('فراس')) {
                await whatsappClient.sendMessage(phone + '@c.us', msgText).catch(err => {});
                if (pdfBuffer) { await sendPdf(whatsappClient, phone + '@c.us', pdfBuffer, `Auto_Daily_Report_${Date.now()}.pdf`).catch(err => {}); }
            }
        }
    } catch (error) {
        console.error('11PM Report Error:', error);
        if (isTest) await whatsappClient.sendMessage(testChatId, '❌ خطأ أثناء الاختبار: ' + error.message).catch(() => {});
    }
}

function schedule11PMReport(whatsappClient) {
    cron.schedule('0 23 * * *', () => { run11PMReport(whatsappClient); }, { scheduled: true, timezone: "Asia/Gaza" });
}

function scheduleMorningAppointments(whatsappClient) {
    cron.schedule('0 10 * * *', async () => {
        try {
            if(!isAuthValid) return;
            const targetStr = getTomorrowStandardDateISO();
            for (const phone in USERS) {
                const user = USERS[phone];
                if (user.role === 'طبيب أسنان') {
                    const filter = { clinic: 'الكل', doctor: user.name, date: targetStr };
                    const result = await fetchAppointmentsFromSheet(filter);
                    if (result && !result.error && result.data && result.data.length > 0) {
                        let msg = `☀️ *صباح الخير د. ${user.name}*\n📅 *جدول مواعيدك للغد (${formatDisplayDate(targetStr)}):*\n\n`;
                        result.data.forEach((appt, i) => { msg += `*${i + 1}.* المريض: ${appt.patient}\n⏰ الوقت: ${appt.start || 'غير محدد'}\n🏥 العيادة: ${appt.clinic || 'غير محدد'}\n〰️〰️〰️\n`; });
                        msg += `\n💡 نتمنى لك يوماً موفقاً!`; whatsappClient.sendMessage(phone + '@c.us', msg).catch(err => {});
                    } else {
                        whatsappClient.sendMessage(phone + '@c.us', `☀️ *صباح الخير د. ${user.name}*\n📅 *لا يوجد لديك مواعيد مجدولة للغد (${formatDisplayDate(targetStr)}).* \n💡 نتمنى لك يوماً موفقاً!`).catch(err => {});
                    }
                }
            }
        } catch (error) {}
    }, { scheduled: true, timezone: "Asia/Gaza" });
}

app.post('/api/jawwal-pay', (req, res) => {
    const { sender, message } = req.body;
    if (sender && (sender.toLowerCase().includes('jawwal') || message.includes('ILS'))) {
        res.status(200).send('Success');
    } else { res.status(200).send('Ignored'); }
});

const PORT = process.env.PORT || 7861; 
app.listen(PORT, () => { console.log(`🌍 نظام الاستقبال يعمل بنجاح على البورت ${PORT}`); });

// ==========================================
// 🔌 الاتصال بقاعدة بيانات MongoDB وتجهيز RemoteAuth
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://mtoman1985:Ofar017157@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI).then(() => {
    console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح.');

    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // مزامنة الجلسة السحابية كل 5 دقائق
        }),
        puppeteer: { 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote', '--disable-accelerated-2d-canvas', '--disable-software-rasterizer', '--mute-audio'], 
            timeout: 120000 
        },
        authTimeoutMs: 120000, 
        qrMaxRetries: 3,
        webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
    });

    client.on('qr', (qr) => { 
        console.log('\n✅ تم توليد باركود جديد (امسحه مرة واحدة فقط):'); 
        qrcode.generate(qr, { small: true });
        fs.writeFileSync('qr_code.txt', qr); 
    });

    client.on('ready', async () => {
        console.log('\n✅ تم الربط بنجاح! البوت متصل بالواتساب وجاهز للعمل! 🚀');
        if (fs.existsSync('qr_code.txt')) fs.unlinkSync('qr_code.txt');
        
        if (!isSystemInitialized) {
            await checkAndGetGoogleAuth();
            startSheetTracker(client); 
            schedule11PMReport(client); 
            scheduleMorningAppointments(client); 
            console.log('✅ تم تفعيل الجداول الزمنية والمتعقب بنجاح.');
            isSystemInitialized = true;
        }
    });

    client.on('remote_session_saved', () => {
        console.log('💾 تم حفظ ملفات الجلسة في قاعدة بيانات MongoDB بنجاح ولن تحتاج لمسح الـ QR مجدداً.');
    });

    client.on('disconnected', (reason) => { 
        console.log('🔴 تم قطع الاتصال بالواتساب:', reason); 
        setTimeout(() => { client.initialize(); }, 5000); 
    });

    client.on('message_create', async msg => {
        try {
            let senderPhone = (msg.author || msg.from).split('@')[0];
            if (senderPhone.includes(':')) senderPhone = senderPhone.split(':')[0];

            const text = msg.body ? msg.body.trim() : '';

            if (text === 'رقمي') {
                const isReg = USERS[senderPhone] ? '✅ مسجل كـ ' + USERS[senderPhone].permission : '❌ غير مسجل';
                return msg.reply(`📱 رقمك الذي يقرؤه البوت هو:\n*${senderPhone}*\n\nحالة الرقم في النظام:\n${isReg}`);
            }

            if (msg.fromMe && msg.to !== msg.from) {
                let targetPhone = msg.to.split('@')[0];
                if (targetPhone.includes(':')) targetPhone = targetPhone.split(':')[0];
                if (!USERS[targetPhone] || (USERS[targetPhone].permission !== 'مسؤول' && USERS[targetPhone].permission !== 'إداري')) return;
            }

            const botSignatures = ['الرجاء اختيار الخدمة', 'أرسل الرقم المطلوب', '💡', '✅', '❌', '📋', '🦷', '⏳', '📅', '👨‍⚕️', '🗓️', '🔤', '📝', '🔔', '📄', '📊', '🛒', '🏥', '☀️', '⚠️', '🌐', '🌙'];
            if (msg.fromMe && botSignatures.some(sig => text.includes(sig))) return;

            const currentUser = USERS[senderPhone];
            const isAdmin = (currentUser && (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري'));

            if (isAdmin && text === 'ربط جوجل') {
                try {
                    const credentials = JSON.parse(fs.readFileSync('credentials.json'));
                    const keys = credentials.web || credentials.installed;
                    const oAuth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris[0]);
                    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
                    return msg.reply(`🌐 *رابط تجديد الصلاحيات:*\n\n${authUrl}\n\nبعد الموافقة، سيتم توجيهك لصفحة. فقط **انسخ الرابط بالكامل من شريط العنوان في الأعلى** وأرسله لي هكذا:\n\nكود جوجل [الرابط]`);
                } catch (err) { return msg.reply('❌ فشل توليد الرابط. تأكد من وجود ملف credentials.json'); }
            }

            if (isAdmin && text.startsWith('كود جوجل')) {
                const input = text.replace('كود جوجل', '').trim();
                let code = input; const match = input.match(/code=([^&]+)/);
                if (match) { code = decodeURIComponent(match[1]); }
                try {
                    const credentials = JSON.parse(fs.readFileSync('credentials.json'));
                    const keys = credentials.web || credentials.installed;
                    const oAuth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris[0]);
                    const { tokens } = await oAuth2Client.getToken(code);
                    
                    let replyMsg = `✅ مبروك! تم الربط وتحديث الصلاحيات بنجاح!\n\n`;
                    replyMsg += `⚠️ *لضمان عدم طلب الربط منك مرة أخرى أبداً:*\n`;
                    replyMsg += `بما أن سيرفر الحوسبة يحذف الملفات المؤقتة عند إعادة تشغيله، يرجى حفظ الصلاحية بشكل دائم كالتالي:\n\n`;
                    replyMsg += `1️⃣ اذهب إلى ملفات البوت واضغط على *Add file* ثم *Create a new file*.\n`;
                    replyMsg += `2️⃣ في خانة الاسم اكتب بالضبط: *token.json*\n`;
                    replyMsg += `3️⃣ انسخ الكود الموجود في الرسالة التالية بالكامل، الصقه داخل الملف، واضغط *Commit new file*.\n\n👇 الكود في الرسالة القادمة:`;

                    await msg.reply(replyMsg);
                    return client.sendMessage(msg.from, JSON.stringify(tokens, null, 2));
                } catch (err) { return msg.reply('❌ فشل الربط: ' + err.message + '\n\n💡 أرسل "ربط جوجل" للحصول على رابط جديد.'); }
            }
            
            if (isAdmin && (text === 'اختبار التقرير' || text === 'اختبار تقرير 11')) {
                await msg.reply('⏳ جاري تشغيل اختبار تقرير الساعة 11 (سيصلك أنت فقط)...');
                await run11PMReport(client, msg.from, currentUser);
                return;
            }

            if (isAdmin && text.startsWith('تدقيق')) {
                const q = text.replace(/^تدقيق(\s+دين)?/, '').trim();
                if (!q) return msg.reply('🔍 اكتب: *تدقيق اسم المريض*\nمثال: تدقيق فاطمة الطويل');
                await msg.reply('⏳ جاري التدقيق...');
                return msg.reply(await auditPatientDebt(q));
            }

            if (!currentUser) {
                if (msg.fromMe) { const recipientPhone = msg.to.split('@')[0]; if (pendingAIRreplies[recipientPhone]) { clearTimeout(pendingAIRreplies[recipientPhone].timer); delete pendingAIRreplies[recipientPhone]; } return; }
                if (!text) return;
                if (!pendingAIRreplies[senderPhone]) pendingAIRreplies[senderPhone] = { messages: [], timer: null };
                pendingAIRreplies[senderPhone].messages.push(text);
                clearTimeout(pendingAIRreplies[senderPhone].timer);
                pendingAIRreplies[senderPhone].timer = setTimeout(async () => {
                    try {
                        let orthoDate = new Date('2026-09-12T00:00:00'); const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0); 
                        while (orthoDate < todayDate) { orthoDate.setDate(orthoDate.getDate() + 14); }
                        const oDay = String(orthoDate.getDate()).padStart(2, '0'); const oMonth = String(orthoDate.getMonth() + 1).padStart(2, '0'); const oYear = orthoDate.getFullYear();
                        const nextOrthoDateStr = `${oDay}/${oMonth}/${oYear}`;
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        const fullPatientMessage = pendingAIRreplies[senderPhone].messages.join(' \n');
                        let customClinicInfo = fs.existsSync('ai_info.txt') ? fs.readFileSync('ai_info.txt', 'utf8') : 'العيادة تعمل يومياً من 8 صباحاً للرابعة عصراً.';
                        const prompt = `أنت سكرتير افتراضي ذكي لعيادات طب الأسنان.\nرسالة المريض: "${fullPatientMessage}"\nتعليمات العيادة: ${customClinicInfo}\nملاحظة حاسبة المواعيد: مواعيد تقويم الأسنان المتاحة القادمة هي يوم (${nextOrthoDateStr}) من الساعة 10:00 صباحاً حتى 2:00 مساءً. (أخبر المريض بهذا التاريخ إذا سأل عن التقويم).\nأجب باختصار شديد وبلهجة شامية مهنية ومحترمة.`;
                        const result = await model.generateContent(prompt);
                        client.sendMessage(msg.from, result.response.text()); delete pendingAIRreplies[senderPhone];
                    } catch (err) {}
                }, 60000); 
                return; 
            }

            if (!text) return;
            if (text === 'استعلام' || text === 'إستعلام') { userState[senderPhone] = 'MENU'; userSelectedQueue[senderPhone] = []; dailyFilters[senderPhone] = {}; financialFilters[senderPhone] = {}; return msg.reply(renderMainMenu(currentUser)); }
            const isBack = (text === '0' || text === 'رجوع' || text === 'الرجوع' || text === 'خروج');
            if (isBack) {
                const currentState = userState[senderPhone];
                if (!currentState || currentState === 'MENU') { userState[senderPhone] = 'MENU'; return msg.reply(renderMainMenu(currentUser)); }
                if (currentState === 'PAT_MGMT_MENU') { userState[senderPhone] = 'MENU'; delete patientForm[senderPhone]; return msg.reply(renderMainMenu(currentUser)); }
                if (typeof currentState === 'string' && currentState.startsWith('PAT_')) { userState[senderPhone] = 'PAT_MGMT_MENU'; patientForm[senderPhone] = {}; return msg.reply(renderPatientMgmtMenu()); }
                if (['WAITING_NAME', 'APPT_MAIN_MENU', 'CLINICAL_SINGLE_INPUT', 'QUEUE_SEARCH_INPUT', 'QUEUE_ACTION_MENU', 'DAILY_CLINIC_SELECT', 'FINANCIAL_CLINIC_SELECT', 'DEBT_CLINIC_SELECT', 'WAITING_AI_INFO'].includes(currentState)) { userState[senderPhone] = 'MENU'; userSelectedQueue[senderPhone] = []; dailyFilters[senderPhone] = {}; financialFilters[senderPhone] = {}; return msg.reply(renderMainMenu(currentUser)); }
                if (currentState === 'CLINICAL_SINGLE_DATE_MENU') { userState[senderPhone] = 'CLINICAL_SINGLE_INPUT'; delete userStateData[senderPhone]; return msg.reply('🔤 الرجاء إرسال *اسم المريض*:\n*(أرسل "0" للرجوع)*'); }
                if (currentState === 'CLINICAL_SINGLE_CUSTOM_DATE' || currentState === 'CLINICAL_SINGLE_ACTION') { userState[senderPhone] = 'CLINICAL_SINGLE_DATE_MENU'; return msg.reply(renderPatientDateRangeMenu(userStateData[senderPhone].patient.name)); }
                if (currentState === 'CLINICAL_SINGLE_SELECT') { userState[senderPhone] = 'CLINICAL_SINGLE_INPUT'; delete userSearchResults[senderPhone]; return msg.reply('🔤 الرجاء إرسال *اسم المريض*:\n*(أرسل "0" للرجوع)*'); }
                if (currentState === 'QUEUE_SELECT_PATIENT') { userState[senderPhone] = 'QUEUE_SEARCH_INPUT'; delete userSearchResults[senderPhone]; return msg.reply('🔤 الرجاء إرسال *اسم المريض*:\n*(أرسل "0" للرجوع)*'); }
                if (currentState === 'APPT_PATIENT_SEARCH_INPUT') { userState[senderPhone] = 'APPT_MAIN_MENU'; return msg.reply(renderApptMainMenu()); }
                if (currentState === 'APPT_PATIENT_SELECT') { userState[senderPhone] = 'APPT_PATIENT_SEARCH_INPUT'; delete userSearchResults[senderPhone]; return msg.reply('🔤 الرجاء إرسال *اسم المريض*:\n*(أرسل "0" للرجوع)*'); }
                if (currentState === 'ADMIN_APPT_TARGET') { userState[senderPhone] = 'APPT_MAIN_MENU'; apptFilters[senderPhone] = {}; return msg.reply(renderApptMainMenu()); }
                if (currentState === 'ADMIN_APPT_DOCTOR') { userState[senderPhone] = 'ADMIN_APPT_TARGET'; return msg.reply(renderAdminApptTarget()); }
                if (currentState === 'APPT_DATE_PROMPT') { userState[senderPhone] = 'ADMIN_APPT_TARGET'; return msg.reply(renderAdminApptTarget()); }
                if (currentState === 'DAILY_DOCTOR_SELECT') { userState[senderPhone] = 'DAILY_CLINIC_SELECT'; return msg.reply(renderClinicMenu('التقرير المالي (PDF)')); }
                if (currentState === 'DAILY_DOCTOR_SPECIFIC') { userState[senderPhone] = 'DAILY_DOCTOR_SELECT'; return msg.reply(renderDoctorSelectMenu('التقرير المالي (PDF)')); }
                if (currentState === 'DAILY_DATE_MENU') {
                    if (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري') {
                        if (dailyFilters[senderPhone]?.doctor && dailyFilters[senderPhone].doctor !== 'الكل') { userState[senderPhone] = 'DAILY_DOCTOR_SPECIFIC'; return msg.reply(renderDoctorsListMenu()); }
                        else { userState[senderPhone] = 'DAILY_DOCTOR_SELECT'; return msg.reply(renderDoctorSelectMenu('التقرير المالي (PDF)')); }
                    } else { userState[senderPhone] = 'MENU'; return msg.reply(renderMainMenu(currentUser)); }
                }
                if (currentState === 'DAILY_CUSTOM_DATE_INPUT') { userState[senderPhone] = 'DAILY_DATE_MENU'; return msg.reply(renderDateRangeMenu('التقرير', dailyFilters[senderPhone]?.doctor ? `د. ${dailyFilters[senderPhone].doctor}` : 'الجميع')); }
                if (currentState === 'FINANCIAL_CLINIC_SELECT') { userState[senderPhone] = 'MENU'; return msg.reply(renderMainMenu(currentUser)); }
                if (currentState === 'FINANCIAL_DOCTOR_SELECT') { userState[senderPhone] = 'FINANCIAL_CLINIC_SELECT'; return msg.reply(renderClinicMenu('التقرير المالي (PDF)')); }
                if (currentState === 'FINANCIAL_DOCTOR_SPECIFIC') { userState[senderPhone] = 'FINANCIAL_DOCTOR_SELECT'; return msg.reply(renderDoctorSelectMenu('التقرير المالي (PDF)')); }
                if (currentState === 'FINANCIAL_DATE_MENU') {
                    if (financialFilters[senderPhone]?.doctor && financialFilters[senderPhone].doctor !== 'الكل') { userState[senderPhone] = 'FINANCIAL_DOCTOR_SPECIFIC'; return msg.reply(renderDoctorsListMenu()); }
                    else { userState[senderPhone] = 'FINANCIAL_DOCTOR_SELECT'; return msg.reply(renderDoctorSelectMenu('التقرير المالي (PDF)')); }
                }
                if (currentState === 'FINANCIAL_CUSTOM_DATE_INPUT') { userState[senderPhone] = 'FINANCIAL_DATE_MENU'; return msg.reply(renderDateRangeMenu('التقرير المالي', financialFilters[senderPhone]?.doctor ? `د. ${financialFilters[senderPhone].doctor}` : 'الجميع')); }
                if (currentState === 'DEBT_CLINIC_SELECT') { userState[senderPhone] = 'MENU'; return msg.reply(renderMainMenu(currentUser)); }
                if (currentState === 'DEBT_DATE_MENU') { userState[senderPhone] = 'DEBT_CLINIC_SELECT'; return msg.reply(renderClinicMenu('تقرير الديون')); }
                if (currentState === 'DEBT_CUSTOM_DATE_INPUT') { userState[senderPhone] = 'DEBT_DATE_MENU'; return msg.reply(renderDateRangeMenu('تقرير الديون', financialFilters[senderPhone]?.clinic || 'الجميع')); }
            }

            if (userState[senderPhone] === 'MENU') {
                if (text === '1') { userState[senderPhone] = 'WAITING_NAME'; return msg.reply('🔤 الرجاء إرسال *اسم المريض* للاستعلام:\n*(أرسل "0" للرجوع)*'); }
                else if (text === '2') { userState[senderPhone] = 'APPT_MAIN_MENU'; return msg.reply(renderApptMainMenu()); }
                else if (text === '3') {
                    if (isAdmin) { userState[senderPhone] = 'CLINICAL_SINGLE_INPUT'; return msg.reply('🦷 *الكشف الطبي المفصل*\n\n🔤 الرجاء إرسال *اسم المريض*:\n*(أرسل "0" للرجوع)*'); } 
                    else return msg.reply('❌ عذراً، هذه الخدمة مخصصة للإدارة فقط.\n\n💡 (أرسل "0" للرجوع).');
                }
                else if (text === '4') { userState[senderPhone] = 'QUEUE_SEARCH_INPUT'; userSelectedQueue[senderPhone] = []; return msg.reply('📝 *تجهيز قائمة أسماء المرضى*\n\n🔤 إرسال اسم المريض الأول:'); }
                else if (text === '5') {
                    if (isAdmin) { userState[senderPhone] = 'FINANCIAL_CLINIC_SELECT'; financialFilters[senderPhone] = {}; return msg.reply(renderClinicMenu('التقرير المالي الختامي للإدارة (PDF)')); } 
                    else { userState[senderPhone] = 'FINANCIAL_DATE_MENU'; financialFilters[senderPhone] = { clinic: 'الكل', doctor: currentUser.name }; return msg.reply(renderDateRangeMenu('التقرير المالي الخاص بك', `د. ${currentUser.name}`)); }
                } 
                else if (text === '6') {
                    if (isAdmin) { userState[senderPhone] = 'FINANCIAL_CLINIC_SELECT'; financialFilters[senderPhone] = {}; return msg.reply(renderClinicMenu('التقرير المالي (PDF)')); }
                    else return msg.reply('❌ عذراً، مخصصة للإدارة فقط.\n\n💡 (أرسل "0" للرجوع).');
                } 
                else if (text === '7') {
                    if (isAdmin) { userState[senderPhone] = 'DEBT_CLINIC_SELECT'; financialFilters[senderPhone] = {}; return msg.reply(renderClinicMenu('تقرير الديون')); }
                    else return msg.reply('❌ مخصصة للإدارة فقط.\n\n💡 (أرسل "0" للرجوع).');
                }
                else if (text === '8') {
                    if (isAdmin) {
                        userState[senderPhone] = 'WAITING_AI_INFO'; let currentInfo = fs.existsSync('ai_info.txt') ? fs.readFileSync('ai_info.txt', 'utf8') : 'لا يوجد تعليمات'; return msg.reply(`🤖 *تعديل تعليمات السكرتير الذكي*\nالتعليمات الحالية:\n${currentInfo}\n\n📝 *أرسل التعليمات الجديدة:*`); } else return msg.reply('❌ عذراً، مخصصة للإدارة فقط.');
                }
                else if (text === '9') {
                    if (isAdmin) { userState[senderPhone] = 'PAT_MGMT_MENU'; patientForm[senderPhone] = {}; return msg.reply(renderPatientMgmtMenu()); }
                    else return msg.reply('❌ عذراً، مخصصة للإدارة فقط.');
                }
                else { return msg.reply('❌ اختيار غير صحيح، أرسل الرقم المطلوب من القائمة.'); }
            }

            if (typeof userState[senderPhone] === 'string' && userState[senderPhone].startsWith('PAT_')) {
                if (!isAdmin) { userState[senderPhone] = 'MENU'; return msg.reply('❌ هذه الخدمة مخصصة للإدارة فقط.'); }
                const st = userState[senderPhone];
                if (!patientForm[senderPhone]) patientForm[senderPhone] = {};
                const form = patientForm[senderPhone];

                if (st === 'PAT_MGMT_MENU') {
                    if (text === '1') { patientForm[senderPhone] = { step: 0 }; userState[senderPhone] = 'PAT_ADD_STEP'; return msg.reply('📝 *إضافة مريض جديد*\n\n' + patientFieldPrompt('name', 'add')); }
                    if (text === '2') { userState[senderPhone] = 'PAT_EDIT_SEARCH'; return msg.reply('🔤 أرسل *اسم المريض* المراد تعديل بياناته:\n*(أرسل "0" للرجوع)*'); }
                    return msg.reply('❌ اختيار غير صحيح، أرسل الرقم المطلوب من القائمة.');
                }

                if (st === 'PAT_ADD_STEP') {
                    const field = PATIENT_ADD_STEPS[form.step || 0];
                    const v = normalizePatientFieldValue(field, text);
                    if (!v.ok) return msg.reply(v.error + '\n\n' + patientFieldPrompt(field, 'add'));
                    form[field] = v.value;
                    if (field === 'name') {
                        const found = await searchPatientByName(v.value);
                        form.duplicate = !!(found.matches && found.matches.some(m => normalizeArabic(m.name) === normalizeArabic(v.value)));
                    }
                    form.step = (form.step || 0) + 1;
                    if (form.step < PATIENT_ADD_STEPS.length) return msg.reply(patientFieldPrompt(PATIENT_ADD_STEPS[form.step], 'add'));
                    userState[senderPhone] = 'PAT_ADD_CONFIRM';
                    let sum = `📋 *مراجعة بيانات المريض الجديد*\n═══════════════════\n`;
                    sum += `👤 الاسم: ${form.name}\n📱 الجوال: ${form.phone || '-'}\n📱 جوال 2: ${form.phone2 || '-'}\n⚧ الجنس: ${form.gender || '-'}\n🏥 العيادة: ${form.clinic || '-'}\n🎂 الميلاد: ${form.birth ? formatDisplayDate(form.birth) : '-'}\n`;
                    if (form.duplicate) sum += `\n⚠️ *تنبيه:* يوجد مريض مسجل بنفس الاسم مسبقاً!\n`;
                    sum += `\n1️⃣ - حفظ ✅\n2️⃣ - إلغاء ❌\n\n*أرسل الرقم المطلوب:*`;
                    return msg.reply(sum);
                }

                if (st === 'PAT_ADD_CONFIRM') {
                    if (text === '2') { userState[senderPhone] = 'PAT_MGMT_MENU'; patientForm[senderPhone] = {}; return msg.reply('❌ تم إلغاء الإضافة.\n\n' + renderPatientMgmtMenu()); }
                    if (text !== '1') return msg.reply('❌ اختيار غير صحيح، أرسل 1 للحفظ أو 2 للإلغاء.');
                    msg.reply('⏳ جاري الحفظ...');
                    try {
                        const newId = await addPatientToSheet(form);
                        const savedName = form.name;
                        userState[senderPhone] = 'PAT_MGMT_MENU'; patientForm[senderPhone] = {};
                        return msg.reply(`✅ تمت إضافة المريض *${savedName}* بنجاح.\n🆔 ${newId}\n\n` + renderPatientMgmtMenu());
                    } catch (err) { console.error('Add patient error:', err); return msg.reply(friendlySheetsError(err)); }
                }

                if (st === 'PAT_EDIT_SEARCH') {
                    msg.reply('⏳ جاري البحث...');
                    const result = await searchPatientByName(text);
                    if (result.error) return msg.reply(result.error);
                    if (result.matches.length === 0) return msg.reply('❌ لم يتم العثور على مريض بهذا الاسم.');
                    if (result.matches.length === 1) { form.patient = result.matches[0]; userState[senderPhone] = 'PAT_EDIT_FIELD'; return msg.reply(renderPatientEditMenu(form.patient)); }
                    form.matches = result.matches.slice(0, 30); userState[senderPhone] = 'PAT_EDIT_SELECT';
                    let listMsg = `✅ *تم العثور على أكثر من مريض:*\n\n`; form.matches.forEach((pt, i) => listMsg += `*${i + 1}.* ${pt.name} (${pt.phone})\n`);
                    return msg.reply(listMsg + `\n*0.* ↩️ الرجوع`);
                }

                if (st === 'PAT_EDIT_SELECT') {
                    const i = parseInt(text) - 1;
                    if (isNaN(i) || i < 0 || !form.matches || i >= form.matches.length) return msg.reply('❌ غير صحيح.');
                    form.patient = form.matches[i]; userState[senderPhone] = 'PAT_EDIT_FIELD';
                    return msg.reply(renderPatientEditMenu(form.patient));
                }

                if (st === 'PAT_EDIT_FIELD') {
                    const fieldMap = { '1': 'name', '2': 'phone', '3': 'phone2', '4': 'gender', '5': 'clinic', '6': 'birth' };
                    const field = fieldMap[text];
                    if (!field) return msg.reply('❌ اختيار غير صحيح، أرسل رقماً من 1 إلى 6.');
                    form.field = field; userState[senderPhone] = 'PAT_EDIT_VALUE';
                    return msg.reply(`✏️ تعديل *${PATIENT_FIELD_LABEL[field]}* للمريض ${form.patient.name}\n\n` + patientFieldPrompt(field, 'edit'));
                }

                if (st === 'PAT_EDIT_VALUE') {
                    const field = form.field;
                    const v = normalizePatientFieldValue(field, text);
                    if (!v.ok) return msg.reply(v.error + '\n\n' + patientFieldPrompt(field, 'edit'));
                    msg.reply('⏳ جاري الحفظ...');
                    try {
                        await updatePatientField(form.patient.id, field, v.value);
                        if (field === 'name') form.patient.name = v.value;
                        else if (field === 'phone') form.patient.phone = v.value || 'غير متوفر';
                        else if (field === 'clinic') form.patient.clinic = v.value || 'عيادة الأسنان';
                        else if (field === 'birth') form.patient.birth = v.value;
                        userState[senderPhone] = 'PAT_EDIT_FIELD';
                        return msg.reply(`✅ تم تحديث *${PATIENT_FIELD_LABEL[field]}* بنجاح.\n\n` + renderPatientEditMenu(form.patient));
                    } catch (err) { console.error('Update patient error:', err); return msg.reply(friendlySheetsError(err)); }
                }
            }

            if (userState[senderPhone] === 'WAITING_NAME') {
                msg.reply('⏳ جاري البحث...'); const result = await searchPatientByName(text);
                if (result.error) return msg.reply(result.error); if (result.matches.length === 0) return msg.reply('❌ لم يتم العثور على مريض.');
                if (result.matches.length === 1) { userState[senderPhone] = 'IDLE'; return msg.reply(`✅ *المريض:* ${result.matches[0].name}\n📱 *الجوال:* ${result.matches[0].phone}\n\n💡 (أرسل "استعلام" للعودة).`); }
                userState[senderPhone] = 'WAITING_SELECTION'; userSearchResults[senderPhone] = result.matches;
                let listMsg = `✅ *مريض متعدد:*\n\n`; result.matches.forEach((p, i) => listMsg += `*${i + 1}.* ${p.name}\n`); return msg.reply(listMsg + `\n*0.* ↩️ الرجوع`);
            }
            if (userState[senderPhone] === 'WAITING_SELECTION') {
                const matches = userSearchResults[senderPhone]; const i = parseInt(text) - 1; if (isNaN(i) || i < 0 || i >= matches.length) return msg.reply('❌ غير صحيح.');
                userState[senderPhone] = 'IDLE'; delete userSearchResults[senderPhone]; return msg.reply(`✅ *المريض:* ${matches[i].name}\n📱 *الجوال:* ${matches[i].phone}\n\n💡 (أرسل "استعلام" للعودة).`);
            }
            if (userState[senderPhone] === 'WAITING_AI_INFO') {
                fs.writeFileSync('ai_info.txt', text, 'utf8'); userState[senderPhone] = 'IDLE'; return msg.reply('✅ تم تحديث تعليمات الذكاء الاصطناعي بنجاح!\n💡 (أرسل "استعلام" للعودة).');
            }

            if (userState[senderPhone] === 'CLINICAL_SINGLE_INPUT') {
                msg.reply('⏳ جاري البحث...'); const result = await searchPatientByName(text);
                if (result.error) return msg.reply(result.error); if (result.matches.length === 0) return msg.reply('❌ غير موجود.');
                if (result.matches.length === 1) { userStateData[senderPhone] = { patient: result.matches[0] }; userState[senderPhone] = 'CLINICAL_SINGLE_DATE_MENU'; return msg.reply(renderPatientDateRangeMenu(result.matches[0].name)); }
                userState[senderPhone] = 'CLINICAL_SINGLE_SELECT'; userSearchResults[senderPhone] = result.matches;
                let listMsg = `✅ *تم العثور على أكثر من مريض:*\n\n`; result.matches.forEach((p, i) => listMsg += `*${i + 1}.* ${p.name}\n`); return msg.reply(listMsg + `\n*0.* ↩️ الرجوع`);
            }
            if (userState[senderPhone] === 'CLINICAL_SINGLE_SELECT') {
                const matches = userSearchResults[senderPhone]; const i = parseInt(text) - 1; if (isNaN(i) || i < 0 || i >= matches.length) return msg.reply('❌ غير صحيح.');
                userStateData[senderPhone] = { patient: matches[i] }; userState[senderPhone] = 'CLINICAL_SINGLE_DATE_MENU'; delete userSearchResults[senderPhone]; return msg.reply(renderPatientDateRangeMenu(matches[i].name));
            }
            if (userState[senderPhone] === 'CLINICAL_SINGLE_DATE_MENU') {
                if (['1', '2', '4'].includes(text)) {
                    const range = getPatientDateRangeFilter(text); msg.reply(`⏳ جاري التجميع...`);
                    const detailedRes = await fetchDetailedPatientSessions(userStateData[senderPhone].patient, currentUser, range);
                    if (detailedRes.error) return msg.reply(detailedRes.error);
                    userStateData[senderPhone].clinicalRes = detailedRes; userState[senderPhone] = 'CLINICAL_SINGLE_ACTION'; return msg.reply(formatDetailedReport(userStateData[senderPhone].patient, detailedRes, currentUser));
                } else if (text === '3') { userState[senderPhone] = 'CLINICAL_SINGLE_CUSTOM_DATE'; return msg.reply('📅 أرسل الفترة المطلوبة (مثال: 01/09/2026 - 15/09/2026):'); } else return msg.reply('❌ غير صحيح.');
            }
            if (userState[senderPhone] === 'CLINICAL_SINGLE_CUSTOM_DATE') {
                const range = getPatientDateRangeFilter('3', text); if (!range) return msg.reply('❌ صيغة التاريخ غير صحيحة.');
                msg.reply(`⏳ جاري التجميع...`); const detailedRes = await fetchDetailedPatientSessions(userStateData[senderPhone].patient, currentUser, range);
                if (detailedRes.error) return msg.reply(detailedRes.error);
                userStateData[senderPhone].clinicalRes = detailedRes; userState[senderPhone] = 'CLINICAL_SINGLE_ACTION'; return msg.reply(formatDetailedReport(userStateData[senderPhone].patient, detailedRes, currentUser));
            }
            if (userState[senderPhone] === 'CLINICAL_SINGLE_ACTION') {
                if (text === '1') {
                    const data = userStateData[senderPhone]; if (!data) return msg.reply('❌ انتهت الجلسة.');
                    msg.reply('⏳ جاري إنشاء الفاتورة (PDF)...');
                    try {
                        const pdfBuffer = await generatePDFReport(data.patient, data.clinicalRes, currentUser);
                        await sendPdf(client, msg.from, pdfBuffer, `Medical_Invoice_${Date.now()}.pdf`);
                    } catch (err) { return msg.reply('⚠️ خطأ في إصدار الـ PDF'); }
                } else return msg.reply('❌ غير صحيح.');
            }

            if (userState[senderPhone] === 'FINANCIAL_CLINIC_SELECT') {
                if (text === '1') financialFilters[senderPhone].clinic = 'ناصر'; else if (text === '2') financialFilters[senderPhone].clinic = 'روني'; else if (text === '3') financialFilters[senderPhone].clinic = 'الكل'; else return msg.reply('❌ غير صحيح.');
                userState[senderPhone] = 'FINANCIAL_DOCTOR_SELECT'; return msg.reply(renderDoctorSelectMenu('التقرير المالي (PDF)'));
            }
            if (userState[senderPhone] === 'FINANCIAL_DOCTOR_SELECT') {
                if (text === '1') { financialFilters[senderPhone].doctor = 'الكل'; userState[senderPhone] = 'FINANCIAL_DATE_MENU'; return msg.reply(renderDateRangeMenu('التقرير المالي', 'جميع الأطباء')); }
                else if (text === '2') { userState[senderPhone] = 'FINANCIAL_DOCTOR_SPECIFIC'; return msg.reply(renderDoctorsListMenu()); } else return msg.reply('❌ غير صحيح.');
            }
            if (userState[senderPhone] === 'FINANCIAL_DOCTOR_SPECIFIC') {
                const idx = parseInt(text) - 1; if (isNaN(idx) || idx < 0 || idx >= DOCTORS_LIST.length) return msg.reply('❌ غير صحيح.');
                financialFilters[senderPhone].doctor = DOCTORS_LIST[idx]; userState[senderPhone] = 'FINANCIAL_DATE_MENU'; return msg.reply(renderDateRangeMenu('التقرير المالي', `د. ${DOCTORS_LIST[idx]}`));
            }
            if (userState[senderPhone] === 'FINANCIAL_DATE_MENU') {
                if (['1', '2', '4'].includes(text)) {
                    financialFilters[senderPhone].dateRange = getDateRangeFilter(text); msg.reply('⏳ جاري استخراج التقرير المالي...');
                    const financialRes = await fetchFinancialReportAdmin(financialFilters[senderPhone], currentUser);
                    userState[senderPhone] = 'IDLE'; delete financialFilters[senderPhone];
                    if (financialRes.error) return msg.reply(financialRes.error);
                    try {
                        const pdfBuffer = await generateClinicFinancialPDF(financialRes);
                        await sendPdf(client, msg.from, pdfBuffer, `Financial_${Date.now()}.pdf`);
                    } catch (err) { return msg.reply('⚠️ خطأ في PDF.'); }
                } else if (text === '3') { userState[senderPhone] = 'FINANCIAL_CUSTOM_DATE_INPUT'; return msg.reply('📅 أرسل الفترة المطلوبة (مثال: 01/09/2026 - 15/09/2026):'); } else return msg.reply('❌ غير صحيح.');
            }
            if (userState[senderPhone] === 'FINANCIAL_CUSTOM_DATE_INPUT') {
                financialFilters[senderPhone].dateRange = getDateRangeFilter('3', text); msg.reply('⏳ جاري الإعداد...');
                const financialRes = await fetchFinancialReportAdmin(financialFilters[senderPhone], currentUser);
                userState[senderPhone] = 'IDLE'; delete financialFilters[senderPhone];
                if (financialRes.error) return msg.reply(financialRes.error);
                try {
                    const pdfBuffer = await generateClinicFinancialPDF(financialRes);
                    await sendPdf(client, msg.from, pdfBuffer, `Financial_${Date.now()}.pdf`);
                } catch (err) { return msg.reply('⚠️ خطأ في PDF.'); }
            }

            if (userState[senderPhone] === 'DEBT_CLINIC_SELECT') {
                if (text === '1') financialFilters[senderPhone].clinic = 'ناصر'; else if (text === '2') financialFilters[senderPhone].clinic = 'روني'; else if (text === '3') financialFilters[senderPhone].clinic = 'الكل'; else return msg.reply('❌ غير صحيح.');
                userState[senderPhone] = 'DEBT_DATE_MENU'; return msg.reply(renderDateRangeMenu('تقرير الديون', financialFilters[senderPhone].clinic));
            }
            if (userState[senderPhone] === 'DEBT_DATE_MENU') {
                if (['1', '2', '4'].includes(text)) {
                    financialFilters[senderPhone].dateRange = getDateRangeFilter(text); msg.reply('⏳ جاري إعداد تقرير الديون (PDF)...');
                    const debtRes = await fetchFinancialReportAdmin(financialFilters[senderPhone], currentUser);
                    userState[senderPhone] = 'IDLE'; delete financialFilters[senderPhone];
                    if (debtRes.error) return msg.reply(debtRes.error);
                    try {
                        const pdfBuffer = await generateDebtPDF(debtRes);
                        await sendPdf(client, msg.from, pdfBuffer, `Debt_Report_${Date.now()}.pdf`);
                    } catch (err) { return msg.reply('⚠️ حدث خطأ في PDF.'); }
                } else if (text === '3') { userState[senderPhone] = 'DEBT_CUSTOM_DATE_INPUT'; return msg.reply('📅 أرسل الفترة المطلوبة (مثال: 01/09/2026 - 15/09/2026):'); } else return msg.reply('❌ غير صحيح.');
            }
            if (userState[senderPhone] === 'DEBT_CUSTOM_DATE_INPUT') {
                financialFilters[senderPhone].dateRange = getDateRangeFilter('3', text); msg.reply('⏳ جاري الإعداد...');
                const debtRes = await fetchFinancialReportAdmin(financialFilters[senderPhone], currentUser);
                userState[senderPhone] = 'IDLE'; delete financialFilters[senderPhone];
                if (debtRes.error) return msg.reply(debtRes.error);
                try {
                    const pdfBuffer = await generateDebtPDF(debtRes);
                    await sendPdf(client, msg.from, pdfBuffer, `Debt_Report_${Date.now()}.pdf`);
                } catch (err) { return msg.reply('⚠️ خطأ في PDF.'); }
            }

            if (userState[senderPhone] === 'APPT_MAIN_MENU') {
                if (text === '1') {
                    if (currentUser.permission === 'مسؤول' || currentUser.permission === 'إداري') { userState[senderPhone] = 'ADMIN_APPT_TARGET'; apptFilters[senderPhone] = {}; return msg.reply(renderAdminApptTarget()); }
                    else { userState[senderPhone] = 'APPT_DATE_PROMPT'; apptFilters[senderPhone] = { doctor: currentUser.name, clinic: 'الكل' }; return msg.reply(`📅 *مواعيد د. ${currentUser.name}*\nالرجاء إرسال التاريخ (مثال: ${formatDisplayDate(getStandardDateISO(new Date()))}):`); }
                } else if (text === '2') { userState[senderPhone] = 'APPT_PATIENT_SEARCH_INPUT'; return msg.reply('🔤 أرسل *اسم المريض*:'); }
            }
            if (userState[senderPhone] === 'APPT_PATIENT_SEARCH_INPUT') {
                msg.reply('⏳ جاري البحث...'); const result = await searchPatientByName(text);
                if (result.error) return msg.reply(result.error); if (result.matches.length === 0) return msg.reply('❌ غير موجود.');
                if (result.matches.length === 1) {
                    msg.reply(`⏳ جاري جلب مواعيد *${result.matches[0].name}*...`);
                    const apptRes = await fetchAppointmentsFromSheet({ targetPatient: result.matches[0], doctor: 'الكل', clinic: 'الكل', date: 'الكل' });
                    userState[senderPhone] = 'IDLE'; return msg.reply(formatAppointmentMessage(result.matches[0].name, result.matches[0].phone, apptRes.data || []));
                }
                userState[senderPhone] = 'APPT_PATIENT_SELECT'; userSearchResults[senderPhone] = result.matches;
                let listMsg = `✅ *متعدد:*\n\n`; result.matches.forEach((p, i) => listMsg += `*${i + 1}.* ${p.name}\n`); return msg.reply(listMsg + `\n*0.* ↩️ الرجوع`);
            }
            if (userState[senderPhone] === 'APPT_PATIENT_SELECT') {
                const matches = userSearchResults[senderPhone]; const i = parseInt(text) - 1; if (isNaN(i) || i < 0 || i >= matches.length) return msg.reply('❌ غير صحيح.');
                userState[senderPhone] = 'IDLE'; delete userSearchResults[senderPhone];
                msg.reply(`⏳ جاري الجلب...`); const apptRes = await fetchAppointmentsFromSheet({ targetPatient: matches[i], doctor: 'الكل', clinic: 'الكل', date: 'الكل' });
                return msg.reply(formatAppointmentMessage(matches[i].name, matches[i].phone, apptRes.data || []));
            }
            if (userState[senderPhone] === 'ADMIN_APPT_TARGET') {
                if (text === '1') { apptFilters[senderPhone].clinic = 'ناصر'; apptFilters[senderPhone].doctor = 'الكل'; }
                else if (text === '2') { apptFilters[senderPhone].clinic = 'روني'; apptFilters[senderPhone].doctor = 'الكل'; }
                else if (text === '3') { userState[senderPhone] = 'ADMIN_APPT_DOCTOR'; return msg.reply('👨‍⚕️ اكتب *اسم الطبيب*:'); }
                else if (text === '4') { apptFilters[senderPhone].clinic = 'الكل'; apptFilters[senderPhone].doctor = 'الكل'; }
                else return msg.reply('❌ غير صحيح.');
                userState[senderPhone] = 'APPT_DATE_PROMPT'; return msg.reply('🗓️ أرسل التاريخ أو "الكل":');
            }
            if (userState[senderPhone] === 'ADMIN_APPT_DOCTOR') { apptFilters[senderPhone].doctor = text; apptFilters[senderPhone].clinic = 'الكل'; userState[senderPhone] = 'APPT_DATE_PROMPT'; return msg.reply('🗓️ أرسل التاريخ أو "الكل":'); }
            if (userState[senderPhone] === 'APPT_DATE_PROMPT') {
                msg.reply('⏳ جاري الجلب...'); apptFilters[senderPhone].date = text; 
                const result = await fetchAppointmentsFromSheet(apptFilters[senderPhone]);
                userState[senderPhone] = 'IDLE'; delete apptFilters[senderPhone];
                if (result.error) return msg.reply(result.error); if (result.data.length === 0) return msg.reply('❌ لا توجد مواعيد.');
                let responseMsg = `📅 *المواعيد:*\n\n`; result.data.forEach((appt, i) => { responseMsg += `*${i + 1}.* ${appt.patient} (${appt.doctor})\n🗓️ ${formatDisplayDate(appt.date)} ⏰ ${appt.start}\n〰️〰️〰️\n`; });
                return msg.reply(responseMsg + '💡 (أرسل "استعلام").');
            }

            if (userState[senderPhone] === 'QUEUE_SEARCH_INPUT') {
                msg.reply('⏳ جاري البحث...'); const result = await searchPatientByName(text);
                if (result.error) return msg.reply(result.error); if (result.matches.length === 0) return msg.reply('❌ غير موجود.');
                if (result.matches.length === 1) {
                    if (!userSelectedQueue[senderPhone]) userSelectedQueue[senderPhone] = []; userSelectedQueue[senderPhone].push(result.matches[0]); userState[senderPhone] = 'QUEUE_ACTION_MENU';
                    return msg.reply(`✅ تمت الإضافة!\n👥 العدد: *${userSelectedQueue[senderPhone].length}*\n1️⃣ إضافة آخر ➕\n2️⃣ إنهاء وعرض 📋`);
                }
                userState[senderPhone] = 'QUEUE_SELECT_PATIENT'; userSearchResults[senderPhone] = result.matches;
                let listMsg = `✅ *مريض متعدد:*\n\n`; result.matches.forEach((p, i) => listMsg += `*${i + 1}.* ${p.name}\n`); return msg.reply(listMsg + `\n*0.* ↩️ الرجوع`);
            }
            if (userState[senderPhone] === 'QUEUE_SELECT_PATIENT') {
                const matches = userSearchResults[senderPhone]; const i = parseInt(text) - 1; if (isNaN(i) || i < 0 || i >= matches.length) return msg.reply('❌ غير صحيح.');
                if (!userSelectedQueue[senderPhone]) userSelectedQueue[senderPhone] = []; userSelectedQueue[senderPhone].push(matches[i]);
                delete userSearchResults[senderPhone]; userState[senderPhone] = 'QUEUE_ACTION_MENU';
                return msg.reply(`✅ تمت الإضافة!\n👥 العدد: *${userSelectedQueue[senderPhone].length}*\n1️⃣ إضافة آخر ➕\n2️⃣ إنهاء وعرض 📋`);
            }
            if (userState[senderPhone] === 'QUEUE_ACTION_MENU') {
                if (text === '1') { userState[senderPhone] = 'QUEUE_SEARCH_INPUT'; return msg.reply('🔤 أرسل اسم المريض التالي:'); }
                else if (text === '2') {
                    const queue = userSelectedQueue[senderPhone] || []; if (queue.length === 0) { userState[senderPhone] = 'MENU'; return msg.reply('❌ القائمة فارغة.'); }
                    msg.reply(`⏳ جاري التجميع...`); const reportRes = await fetchQueueBookingReport(queue, currentUser);
                    userState[senderPhone] = 'IDLE'; userSelectedQueue[senderPhone] = [];
                    if (reportRes.error) return msg.reply(reportRes.error); return msg.reply(formatQueueBookingMessage(reportRes));
                } else return msg.reply('❌ اختيار غير صحيح.');
            }

        } catch (error) { console.error('Handler Error:', error); }
    });

    client.initialize();

}).catch(err => {
    console.error('❌ فشل الاتصال بقاعدة بيانات MongoDB:', err);
});
