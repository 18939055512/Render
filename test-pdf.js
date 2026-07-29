// 测试脚本：验证上传 + 生成 PDF 接口（使用内置 fetch）
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';

(async () => {
  const f1 = path.join(__dirname, 'uploads', 'test1.png');
  const f2 = path.join(__dirname, 'uploads', 'test2.png');
  if (!fs.existsSync(f1) || !fs.existsSync(f2)) {
    console.log('测试图片不存在，跳过');
    return;
  }

  console.log('1. 测试上传...');
  const form = new FormData();
  form.append('images', new Blob([fs.readFileSync(f1)]), 'test1.png');
  form.append('images', new Blob([fs.readFileSync(f2)]), 'test2.png');
  const up = await fetch(BASE + '/api/upload', { method: 'POST', body: form });
  console.log('   上传状态:', up.status);
  if (!up.ok) {
    console.log('   响应:', await up.text());
    process.exit(1);
  }
  const upData = await up.json();
  console.log('   返回:', JSON.stringify(upData));

  console.log('2. 测试生成 PDF...');
  const gen = await fetch(BASE + '/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: upData.files.map((f) => ({ name: f.name, sessionId: f.sessionId })) }),
  });
  console.log('   生成状态:', gen.status);
  if (!gen.ok) {
    console.log('   响应:', await gen.text());
    process.exit(1);
  }
  const genData = await gen.json();
  console.log('   返回:', JSON.stringify(genData));

  console.log('3. 测试下载 PDF...');
  const dl = await fetch(BASE + genData.url);
  const buf = Buffer.from(await dl.arrayBuffer());
  console.log('   下载状态:', dl.status, '文件大小:', buf.length, '字节');
  console.log('   PDF 头:', buf.slice(0, 5).toString(), '(应为 %PDF-)');

  const out = path.join(__dirname, 'output', 'verify_test.pdf');
  fs.writeFileSync(out, buf);
  console.log('   已保存验证文件:', out);
  console.log('完成');
})().catch((e) => {
  console.error('错误:', e);
  process.exit(1);
});
