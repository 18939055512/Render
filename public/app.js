(function () {
  'use strict';

  // 会话 ID（首次上传后由服务端返回）
  let sessionId = null;
  // 当前图片列表：[{name, url, sessionId}]
  let images = [];
  // 是否正在上传/生成
  let busy = false;

  // DOM
  const fileInput = document.getElementById('fileInput');
  const gallery = document.getElementById('gallery');
  const emptyTip = document.getElementById('emptyTip');
  const count = document.getElementById('count');
  const generateBtn = document.getElementById('generateBtn');
  const generatePdfBtn = document.getElementById('generatePdfBtn');
  const resultModal = document.getElementById('resultModal');
  const downloadLink = document.getElementById('downloadLink');
  const modalTitle = document.getElementById('modalTitle');
  const modalDesc = document.getElementById('modalDesc');
  const closeModal = document.getElementById('closeModal');
  const loadingMask = document.getElementById('loadingMask');
  const loadingText = document.getElementById('loadingText');
  const toast = document.getElementById('toast');

  let sortable = null;

  // 初始化 Sortable
  function initSortable() {
    if (sortable) return;
    sortable = Sortable.create(gallery, {
      animation: 150,
      handle: '.card',
      filter: '.del',
      preventOnFilter: true,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: function () {
        reorderDataFromDom();
        refreshOrders();
      },
    });
  }

  // 根据拖拽后 DOM 顺序重新整理 images 数组
  function reorderDataFromDom() {
    const cards = Array.from(gallery.querySelectorAll('.card'));
    const newImages = [];
    cards.forEach(function (card) {
      const idx = parseInt(card.dataset.index, 10);
      if (!isNaN(idx) && images[idx]) {
        newImages.push(images[idx]);
      }
    });
    images = newImages;
    // 更新 data-index
    cards.forEach(function (card, i) {
      card.dataset.index = i;
    });
  }

  // 刷新序号显示
  function refreshOrders() {
    const orders = gallery.querySelectorAll('.order');
    orders.forEach(function (el, i) {
      el.textContent = (i + 1).toString();
    });
  }

  // 渲染列表
  function render() {
    gallery.innerHTML = '';
    if (images.length === 0) {
      emptyTip.style.display = 'block';
      gallery.style.display = 'none';
    } else {
      emptyTip.style.display = 'none';
      gallery.style.display = 'grid';
      images.forEach(function (img, i) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = i;

        const order = document.createElement('span');
        order.className = 'order';
        order.textContent = (i + 1).toString();

        const imgEl = document.createElement('img');
        imgEl.src = img.url;
        imgEl.alt = '图片 ' + (i + 1);
        imgEl.loading = 'lazy';

        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '×';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          deleteImage(i);
        });

        card.appendChild(order);
        card.appendChild(imgEl);
        card.appendChild(del);
        gallery.appendChild(card);
      });
    }
    count.textContent = images.length + ' 张';
    generateBtn.disabled = images.length === 0 || busy;
    generatePdfBtn.disabled = images.length === 0 || busy;
    initSortable();
    refreshOrders();
  }

  // 上传
  async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    if (busy) return;
    setBusy(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
      }
      const headers = {};
      if (sessionId) headers['x-session-id'] = sessionId;

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: headers,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      sessionId = data.sessionId;
      data.files.forEach(function (f) {
        images.push(f);
      });
      render();
      showToast('已添加 ' + data.files.length + ' 张图片');
    } catch (e) {
      showToast(e.message || '上传出错');
    } finally {
      setBusy(false);
      fileInput.value = '';
    }
  }

  // 删除
  async function deleteImage(index) {
    const img = images[index];
    if (!img) return;
    images.splice(index, 1);
    render();
    // 后台清理
    if (img.sessionId && img.name) {
      try {
        await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: img.name, sessionId: img.sessionId }),
        });
      } catch (e) {
        // 忽略
      }
    }
  }

  // 生成文档（type: 'word' | 'pdf'）
  async function generateDoc(type) {
    if (images.length === 0 || busy) return;
    setBusy(true);
    loadingMask.classList.add('show');
    const isPdf = type === 'pdf';
    loadingText.textContent = isPdf ? '正在生成 PDF 文档…' : '正在生成 Word 文档…';
    try {
      const payload = images.map(function (img) {
        return { name: img.name, sessionId: img.sessionId };
      });
      const endpoint = isPdf ? '/api/generate-pdf' : '/api/generate';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      downloadLink.href = data.url;
      downloadLink.textContent = isPdf ? '下载 PDF 文档' : '下载 Word 文档';
      modalTitle.textContent = isPdf ? 'PDF 已生成' : 'Word 文档已生成';
      modalDesc.textContent = (isPdf ? 'PDF 文档' : 'Word 文档') + '已准备好，点击下方按钮下载';
      resultModal.classList.add('show');
    } catch (e) {
      showToast(e.message || '生成出错');
    } finally {
      loadingMask.classList.remove('show');
      setBusy(false);
    }
  }

  // 工具函数
  function setBusy(v) {
    busy = v;
    generateBtn.disabled = images.length === 0 || busy;
    generatePdfBtn.disabled = images.length === 0 || busy;
  }

  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  // 事件绑定
  fileInput.addEventListener('change', function (e) {
    uploadFiles(e.target.files);
  });

  generateBtn.addEventListener('click', function () { generateDoc('word'); });
  generatePdfBtn.addEventListener('click', function () { generateDoc('pdf'); });

  closeModal.addEventListener('click', function () {
    resultModal.classList.remove('show');
  });

  // 初始渲染
  render();
})();
