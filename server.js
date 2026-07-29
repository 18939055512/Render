const express = require('express');
const multer = require('multer');
const { Document, Packer, Paragraph, ImageRun } = require('docx');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const sizeOf = require('image-size');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
[UPLOAD_DIR, OUTPUT_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 会话目录：每个会话一个子目录，避免文件名冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 同一请求多文件复用同一 sessionId（destination 会被每个文件调用一次）
    if (req.sessionId) {
      const sessionDir = path.join(UPLOAD_DIR, req.sessionId);
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      return cb(null, sessionDir);
    }
    let sessionId = req.headers['x-session-id'];
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      sessionId = crypto.randomBytes(8).toString('hex');
    }
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    req.sessionId = sessionId;
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.originalname) || /^image\//.test(file.mimetype);
    cb(ok ? null : new Error('仅支持图片文件'), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 单张 20MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 提供上传图片的访问（带 sessionId）
app.use('/uploads', express.static(UPLOAD_DIR));

// 上传接口
app.post('/api/upload', upload.array('images', 50), (req, res) => {
  const sessionId = req.sessionId;
  const files = req.files.map((f) => ({
    name: f.filename,
    url: `/uploads/${sessionId}/${f.filename}`,
    sessionId,
  }));
  res.json({ sessionId, files });
});

// 生成 Word 接口
app.post('/api/generate', async (req, res) => {
  try {
    const { files } = req.body; // [{name, sessionId}, ...]
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: '未提供图片' });
    }

    const MAX_W = 600; // 图片最大宽度(像素)，按A4页面适配
    const sections = [];
    const children = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const filePath = path.join(UPLOAD_DIR, f.sessionId, f.name);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: `图片不存在: ${f.name}` });
      }

      const buf = fs.readFileSync(filePath);
      let dims;
      try {
        dims = sizeOf(buf);
      } catch (e) {
        dims = { width: MAX_W, height: MAX_W };
      }

      let w = dims.width || MAX_W;
      let h = dims.height || MAX_W;
      if (w > MAX_W) {
        const scale = MAX_W / w;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: buf,
              transformation: { width: w, height: h },
            }),
          ],
          spacing: { after: 200 },
          alignment: 'center',
        })
      );
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const outName = `doc_${Date.now()}.docx`;
    const outPath = path.join(OUTPUT_DIR, outName);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);

    res.json({ url: `/download/${outName}`, name: outName });
  } catch (err) {
    console.error('生成 Word 失败:', err);
    res.status(500).json({ error: '生成 Word 失败: ' + err.message });
  }
});

// 生成 PDF 接口
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { files } = req.body; // [{name, sessionId}, ...]
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: '未提供图片' });
    }

    // A4 纵向，单位 pt（1pt = 1/72 inch）。A4 = 595.28 x 841.89
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 40; // 页边距
    const MAX_W = PAGE_W - MARGIN * 2; // 图片最大可用宽度
    const GAP = 20; // 图片间距

    // 先用 sharp 统一处理：转 png buffer + 获取尺寸
    const items = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const filePath = path.join(UPLOAD_DIR, f.sessionId, f.name);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: `图片不存在: ${f.name}` });
      }
      const raw = fs.readFileSync(filePath);
      // 转成 png（兼容 jpg/png/webp/gif/bmp），最多取第一帧
      const pngBuf = await sharp(raw, { animated: false }).flatten({ background: '#ffffff' }).png().toBuffer();
      let dims;
      try {
        dims = sizeOf(pngBuf);
      } catch (e) {
        dims = { width: MAX_W, height: MAX_W };
      }
      let w = dims.width || MAX_W;
      let h = dims.height || MAX_W;
      if (w > MAX_W) {
        const scale = MAX_W / w;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      items.push({ buf: pngBuf, w, h });
    }

    const outName = `doc_${Date.now()}.pdf`;
    const outPath = path.join(OUTPUT_DIR, outName);

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      let y = MARGIN;
      const contentH = PAGE_H - MARGIN * 2;

      items.forEach((it, idx) => {
        // 当前页放不下则换页
        if (y + it.h > PAGE_H - MARGIN) {
          doc.addPage();
          y = MARGIN;
        }
        const x = (PAGE_W - it.w) / 2; // 水平居中
        doc.image(it.buf, x, y, { width: it.w, height: it.h });
        y += it.h + GAP;
      });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    res.json({ url: `/download/${outName}`, name: outName });
  } catch (err) {
    console.error('生成 PDF 失败:', err);
    res.status(500).json({ error: '生成 PDF 失败: ' + err.message });
  }
});

// 下载接口
app.get('/download/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const filePath = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('文件不存在');
  }
  res.download(filePath, file, (err) => {
    if (err) console.error('下载错误:', err);
  });
});

// 删除单张图片（前端删除时调用，清理磁盘）
app.post('/api/delete', (req, res) => {
  const { name, sessionId } = req.body;
  if (!name || !sessionId || !/^[a-zA-Z0-9._-]+$/.test(name) || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return res.status(400).json({ error: '参数无效' });
  }
  const filePath = path.join(UPLOAD_DIR, sessionId, name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ ok: true });
});

// 获取局域网 IP
function getLocalIPs() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function startServer(port) {
  const s = app.listen(port, '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log('=================================');
    console.log('  图片转 Word 工具已启动');
    console.log('=================================');
    console.log('本机访问:  http://localhost:' + port);
    ips.forEach((ip) => {
      console.log('局域网访问: http://' + ip + ':' + port);
    });
    console.log('=================================');
    console.log('手机与电脑需在同一局域网/Wi-Fi 下');
  });
  s.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('端口 ' + port + ' 被占用，尝试 ' + (port + 1) + ' ...');
      startServer(port + 1);
    } else {
      console.error('启动失败:', e);
    }
  });
}

startServer(PORT);
