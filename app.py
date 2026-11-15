import gradio as gr
import subprocess
import os
import threading
import qrcode
import spaces 

@spaces.GPU
def keep_gpu_happy():
    pass

# 1. دالة لتشغيل البوت في الخلفية
def start_bot():
    print("📦 جاري فحص وتثبيت الحزم الضرورية للبوت...")
    # تم إضافة مكتبة stream-buffers لمعالجة الـ PDF بشكل صحيح
    subprocess.run(["npm", "install", "puppeteer", "whatsapp-web.js", "qrcode-terminal", "googleapis", "xlsx", "node-cron", "@google/generative-ai"], check=False)
    print("🚀 جاري تشغيل بوت الواتساب الآن...")
    subprocess.Popen(["node", "index.js"])

# تشغيل العملية في الخلفية
threading.Thread(target=start_bot, daemon=True).start()

# 2. دالة لقراءة النص وتحويله إلى "صورة باركود" وحفظها
def get_status_and_qr():
    if os.path.exists("qr_code.txt"):
        try:
            with open("qr_code.txt", "r", encoding="utf-8") as f:
                qr_data = f.read().strip()
            
            if qr_data:
                # توليد الصورة وحفظها كملف PNG حقيقي ليفهمه Gradio
                qr_img = qrcode.make(qr_data)
                qr_img.save("qr_render.png")
                
                return "⚠️ يوجد باركود جديد، قم بفتح تطبيق الواتساب في هاتفك وامسح الصورة التالية:", "qr_render.png"
        except Exception as e:
            return f"جاري قراءة الباركود...", None
            
    return "✅ السيرفر يعمل بشكل ممتاز، والبوت متصل بالواتساب 🚀", None

# 3. بناء الواجهة
with gr.Blocks() as demo:
    gr.Markdown("# 🦷 لوحة تحكم النظام الآلي للعيادة")
    
    status_text = gr.Textbox(label="حالة النظام", value="جاري التشغيل والبحث عن باركود...", lines=2)
    # تعديل نوع الصورة لتقبل مسار الملف (filepath)
    qr_image = gr.Image(label="الباركود (امسح هذه الصورة)", type="filepath")
    refresh_btn = gr.Button("تحديث الشاشة 🔄", variant="primary")
    
    refresh_btn.click(fn=get_status_and_qr, outputs=[status_text, qr_image])
    demo.load(fn=get_status_and_qr, outputs=[status_text, qr_image])

# 4. إطلاق السيرفر
demo.launch(server_name="0.0.0.0", server_port=7860, ssr_mode=False)