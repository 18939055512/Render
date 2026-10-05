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
  const preview = document.getElementById('imagePreview');
  const previewImage = document.getElementById('previewImage');
  const previewTitle = document.getElementById('previewTitle');
  const previewViewport = document.getElementById('previewViewport');
  const previewZoomIn = document.getElementById('previewZoomIn');
  const previewZoomOut = document.getElementById('previewZoomOut');
  let previewScale = 1;
  let previewOpener = null;
  let previousOverflow = '';

  function updatePreviewZoom() {
    previewImage.style.width = (previewScale * 100) + '%';
    previewZoomOut.disabled = previewScale === 1;
    previewZoomIn.disabled = previewScale === 4;
  }

  function openPreview(card, opener) {
    if (busy || preview.open) return;
    const index = Number(card.dataset.index);
    const img = images[index];
    if (!img) return;
    previewOpener = opener;
    previewScale = 1;
    previewImage.src = img.previewUrl || img.url;
    previewImage.alt = '图片 ' + (index + 1) + ' 大图';
    previewTitle.textContent = '图片 ' + (index + 1) + ' / ' + images.length;
    updatePreviewZoom();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    preview.showModal();
    previewViewport.scrollTop = previewViewport.scrollLeft = 0;
  }

  previewZoomIn.addEventListener('click', function () {
    previewScale = Math.min(4, previewScale + 1);
    updatePreviewZoom();
  });
  previewZoomOut.addEventListener('click', function () {
    previewScale = Math.max(1, previewScale - 1);
    updatePreviewZoom();
  });
  document.getElementById('previewClose').addEventListener('click', function () { preview.close(); });
  preview.addEventListener('click', function (e) { if (e.target === preview) preview.close(); });
  preview.addEventListener('close', function () {
    document.body.style.overflow = previousOverflow;
    previewImage.removeAttribute('src');
    if (previewOpener && previewOpener.isConnected) previewOpener.focus({ preventScroll: true });
  });

  let sortable = null;

  // 初始化 Sortable
  function initSortable() {
    if (sortable) return;
    sortable = Sortable.create(gallery, {
      animation: 150,
      disabled: busy,
      handle: '.drag-handle',
      filter: '.del, .move-button, .preview-trigger',
      preventOnFilter: false,
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
    gallery.querySelectorAll('.card').forEach(function (card, i) {
      card.querySelector('img').alt = '图片 ' + (i + 1);
      card.querySelector('.move-up').disabled = busy || i === 0;
      card.querySelector('.move-down').disabled = busy || i === images.length - 1;
      card.querySelector('.drag-handle').disabled = busy || images.length < 2;
    });
  }

  function moveImage(card, direction) {
    if (busy) return;
    const index = Number(card.dataset.index);
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const neighbor = gallery.children[target];
    if (direction < 0) gallery.insertBefore(card, neighbor);
    else gallery.insertBefore(neighbor, card);
    reorderDataFromDom();
    refreshOrders();
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
        imgEl.src = img.previewUrl || img.url;
        imgEl.alt = '图片 ' + (i + 1);
        imgEl.loading = 'lazy';
        imgEl.draggable = false;

        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail';
        const imageButton = document.createElement('button');
        imageButton.type = 'button';
        imageButton.className = 'image-button preview-trigger';
        imageButton.setAttribute('aria-label', '查看大图');
        imageButton.appendChild(imgEl);
        imageButton.addEventListener('click', function () { openPreview(card, imageButton); });
        const zoomButton = document.createElement('button');
        zoomButton.type = 'button';
        zoomButton.className = 'zoom-button preview-trigger';
        zoomButton.textContent = '放大';
        zoomButton.addEventListener('click', function () { openPreview(card, zoomButton); });
        thumbnail.appendChild(imageButton);
        thumbnail.appendChild(zoomButton);

        const controls = document.createElement('div');
        controls.className = 'sort-controls';
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'drag-handle';
        handle.textContent = '⠿';
        handle.setAttribute('aria-label', '拖动调整图片顺序');
        handle.title = '按住拖动排序';
        controls.appendChild(handle);
        [-1, 1].forEach(function (direction) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'move-button ' + (direction < 0 ? 'move-up' : 'move-down');
          button.textContent = direction < 0 ? '上移' : '下移';
          button.addEventListener('click', function () { moveImage(card, direction); });
          controls.appendChild(button);
        });

        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '×';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          deleteImage(Number(card.dataset.index));
        });

        card.appendChild(order);
        card.appendChild(thumbnail);
        card.appendChild(del);
        card.appendChild(controls);
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
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const scale = Math.min(1, 2500 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
      canvas.width = canvas.height = 1;
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) {
      return file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function uploadBatch(file, position, total) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.timeout = 180000;
      if (sessionId) xhr.setRequestHeader('x-session-id', sessionId);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) loadingText.textContent = '上传第 ' + position + '/' + total + ' 张：' + Math.round(e.loaded / e.total * 100) + '%';
      };
      xhr.onload = function () {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || '上传失败');
          resolve(data);
        } catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('网络异常，请重新选择未上传的图片')); };
      xhr.ontimeout = function () { reject(new Error('上传超时，请重新选择未上传的图片')); };
      const form = new FormData();
      form.append('images', file);
      xhr.send(form);
    });
  }

  async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    if (busy) return;
    const selected = Array.from(files);
    setBusy(true);
    loadingMask.classList.add('show');
    let added = 0;
    try {
      for (let i = 0; i < selected.length; i++) {
        loadingText.textContent = '正在优化第 ' + (i + 1) + '/' + selected.length + ' 张图片…';
        const file = await compressImage(selected[i]);
        if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20MB：' + selected[i].name);
        const data = await uploadBatch(file, i + 1, selected.length);
        sessionId = data.sessionId;
        data.files.forEach(function (f) {
          f.previewUrl = URL.createObjectURL(file);
          images.push(f);
          added++;
        });
        render();
      }
      showToast('已添加 ' + added + ' 张图片');
    } catch (e) {
      showToast((added ? '已保留 ' + added + ' 张。' : '') + (e.message || '上传出错'));
    } finally {
      loadingMask.classList.remove('show');
      setBusy(false);
      fileInput.value = '';
    }
  }

  // 删除
  async function deleteImage(index) {
    if (busy) return;
    const img = images[index];
    if (!img) return;
    if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
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
    if (sortable) sortable.option('disabled', busy);
    refreshOrders();
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
