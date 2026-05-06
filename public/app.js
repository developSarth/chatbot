(function () {
  const launcher = document.getElementById('chat-launcher');
  const widget = document.getElementById('chat-widget');
  const iconChat = document.getElementById('icon-chat');
  const iconClose = document.getElementById('icon-close');
  const closeBtn = document.getElementById('chat-close');
  const body = document.getElementById('chat-body');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview-img');
  const previewRemove = document.getElementById('preview-remove');

  let isOpen = false;
  let pendingFile = null;
  let lastPoll = Date.now();
  let pollInterval = null;

  // Toggle
  function toggle() {
    isOpen = !isOpen;
    widget.classList.toggle('open', isOpen);
    iconChat.classList.toggle('hidden', isOpen);
    iconClose.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      input.focus();
      startPolling();
    } else {
      stopPolling();
    }
  }
  launcher.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  // Polling for bot replies
  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/messages/poll?since=' + lastPoll);
        const data = await res.json();
        if (data.messages && data.messages.length) {
          data.messages.forEach(m => {
            if (m.role === 'bot') {
              addBubble(m.text, 'bot', m.attachments);
            }
          });
          lastPoll = Math.max(...data.messages.map(m => m.timestamp));
        }
      } catch (e) { /* ignore */ }
    }, 2000);
  }
  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // Add bubble
  function addBubble(text, role, attachments) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text || '';

    if (attachments && attachments.length) {
      attachments.forEach(att => {
        if (att.content_type && att.content_type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = att.url;
          img.className = 'msg-img';
          img.alt = att.name || 'Image';
          img.addEventListener('click', () => window.open(att.url, '_blank'));
          bubble.appendChild(document.createElement('br'));
          bubble.appendChild(img);
        }
      });
    }

    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }

  // Show typing
  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'typing';
    wrap.innerHTML = '<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }
  function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
  }

  // Send
  async function send() {
    const text = input.value.trim();
    if (!text && !pendingFile) return;

    let attachments = [];

    // Upload image first
    if (pendingFile) {
      const fd = new FormData();
      fd.append('image', pendingFile);
      try {
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        if (upData.success) attachments.push(upData.attachment);
      } catch (e) { console.error('Upload failed', e); }
      clearPreview();
    }

    // Show user bubble
    addBubble(text, 'user', attachments);
    input.value = '';
    updateSend();
    input.style.height = 'auto';

    // Record poll timestamp before sending
    lastPoll = Date.now();

    // Show typing
    showTyping();

    // Send to server
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author: 'Customer', attachments })
      });
    } catch (e) {
      console.error('Send failed', e);
    }

    // Remove typing after a short delay (bot response will come via polling)
    setTimeout(removeTyping, 3000);
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    updateSend();
  });

  function updateSend() {
    sendBtn.classList.toggle('active', !!(input.value.trim() || pendingFile));
  }

  // File
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    pendingFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      previewImg.src = ev.target.result;
      previewWrap.classList.remove('hidden');
      updateSend();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  previewRemove.addEventListener('click', clearPreview);

  function clearPreview() {
    pendingFile = null;
    previewImg.src = '';
    previewWrap.classList.add('hidden');
    updateSend();
  }
})();
