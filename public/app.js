(function () {
  const launcher = document.getElementById('chat-launcher');
  const widget = document.getElementById('chat-widget');
  const iconOpen = document.getElementById('chat-icon-open');
  const iconClose = document.getElementById('chat-icon-close');
  const closeBtn = document.getElementById('chat-close-btn');
  const backBtn = document.getElementById('chat-back-btn');
  const body = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const fileInput = document.getElementById('chat-file-input');

  let isOpen = false;
  let pendingFile = null;
  let lastPoll = 0;
  let pollInterval = null;
  let sessionStartTime = 0; // Track when this chat session started

  // ===== Toggle Chat =====
  function toggleChat() {
    isOpen = !isOpen;
    widget.classList.toggle('open', isOpen);
    iconOpen.classList.toggle('hidden', isOpen);
    iconClose.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      // Fresh session every time the widget opens
      startFreshSession();
      input.focus();
      startPolling();
    } else {
      stopPolling();
    }
  }

  launcher.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  backBtn.addEventListener('click', toggleChat);

  // ===== Fresh Session — clear chat on every open =====
  function startFreshSession() {
    // Clear the message area
    body.innerHTML = '';
    // Set session start to now — only poll messages from this point forward
    sessionStartTime = Date.now();
    lastPoll = sessionStartTime;
    // Show fresh greeting with quick replies
    injectInitialGreeting();
  }

  function injectInitialGreeting() {
    if (body.querySelector('.msg-admin')) return;

    // Greeting bubble with slide-in animation
    const greeting = createBotBubble(
      "Hi there! 👋 I'm <strong>Ace</strong>, your sneaker assistant. How can I help you today?"
    );
    greeting.classList.add('msg-animate-in');
    body.appendChild(greeting);

    // Quick Replies — after a short delay for natural feel
    setTimeout(() => {
      const qr = document.createElement('div');
      qr.className = 'quick-replies-container msg-animate-in';
      qr.innerHTML = `
        <div class="quick-replies-grid">
          <button class="quick-reply-chip" data-query="Track My Order">
            <span class="qr-icon">📦</span>
            <span>Track My Order</span>
          </button>
          <button class="quick-reply-chip" data-query="Best Nike shoes">
            <span class="qr-icon">👟</span>
            <span>Best Nike Shoes</span>
          </button>
          <button class="quick-reply-chip" data-query="Suggest running shoes under 5000">
            <span class="qr-icon">🏃</span>
            <span>Running Shoes Under ₹5K</span>
          </button>
          <button class="quick-reply-chip" data-query="Best Adidas shoes">
            <span class="qr-icon">⭐</span>
            <span>Best Adidas Shoes</span>
          </button>
          <button class="quick-reply-chip" data-query="Best Skechers shoes">
            <span class="qr-icon">🔥</span>
            <span>Best Skechers Shoes</span>
          </button>
          <button class="quick-reply-chip" data-query="My shoe sole is damaged, I need a replacement">
            <span class="qr-icon">🛠️</span>
            <span>Report Damaged Shoe</span>
          </button>
        </div>
      `;
      body.appendChild(qr);
      scrollToBottom();

      // Attach click handlers
      qr.querySelectorAll('.quick-reply-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const query = btn.getAttribute('data-query');
          // Remove quick replies after selection
          qr.classList.add('qr-fade-out');
          setTimeout(() => qr.remove(), 300);
          input.value = query;
          sendMessage();
        });
      });
    }, 400);

    scrollToBottom();
  }

  // ===== Create styled bot bubble =====
  function createBotBubble(html) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-admin';
    wrap.innerHTML = html;
    return wrap;
  }

  // ===== Polling for bot replies =====
  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/messages/poll?since=' + lastPoll);
        const data = await res.json();
        if (data.messages && data.messages.length) {
          data.messages.forEach(m => {
            // Only show messages from AFTER this session started
            if (m.timestamp >= sessionStartTime && m.role === 'bot') {
              removeTyping();
              addBubble(m.text, 'bot', m.attachments, true);
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

  // ===== Render Messages =====
  function addBubble(text, role, attachments, doScroll = true) {
    const wrap = document.createElement('div');
    wrap.className = role === 'bot' ? 'msg-admin msg-animate-in' : 'msg-user msg-animate-in';

    // Parse line breaks
    wrap.innerHTML = escapeHtml(text || '').replace(/\n/g, '<br>');

    if (attachments && attachments.length) {
      attachments.forEach(att => {
        if (att.content_type && att.content_type.startsWith('image/')) {
          const attWrap = document.createElement('div');
          attWrap.className = 'msg-attachment';
          const img = document.createElement('img');
          img.src = att.url;
          img.loading = 'lazy';
          img.alt = att.name || 'Attachment';
          img.addEventListener('click', () => window.open(att.url, '_blank'));
          attWrap.appendChild(img);
          wrap.appendChild(attWrap);
        }
      });
    }

    body.appendChild(wrap);
    if (doScroll) scrollToBottom();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    });
  }

  // Show typing indicator
  function showTyping() {
    removeTyping();
    const wrap = document.createElement('div');
    wrap.className = 'msg-admin typing-msg msg-animate-in';
    wrap.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    body.appendChild(wrap);
    scrollToBottom();
  }
  function removeTyping() {
    document.querySelectorAll('.typing-msg').forEach(el => el.remove());
  }

  // ===== Send Message =====
  async function sendMessage() {
    const text = input.value.trim();
    if (!text && !pendingFile) return;

    let attachments = [];

    // Upload image if pending
    if (pendingFile) {
      try {
        const formData = new FormData();
        formData.append('image', pendingFile);
        const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (upData.success) {
          attachments.push(upData.attachment);
        }
      } catch (e) {
        console.error('Upload failed:', e);
      }
      pendingFile = null;
    }

    // Show user message instantly
    if (text || attachments.length > 0) {
      addBubble(text, 'user', attachments, true);
    }

    // Reset input
    input.value = '';
    updateSendBtn();
    input.style.height = 'auto';

    // Update lastPoll before send so we don't fetch our own message back
    lastPoll = Date.now();

    showTyping();

    // Send to API
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          author: 'Customer',
          attachments: attachments
        })
      });
    } catch (e) {
      console.error('Send failed:', e);
      removeTyping();
    }
  }

  // Quick reply handler (for legacy inline onclick if any)
  window.sendQuickReply = function(text) {
    input.value = text;
    sendMessage();
  };

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    updateSendBtn();
  });

  function updateSendBtn() {
    const hasContent = input.value.trim() || pendingFile;
    sendBtn.classList.toggle('active', !!hasContent);
  }

  // ===== File Upload =====
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Only images are supported');
      return;
    }

    // Auto-send immediately
    pendingFile = file;
    sendMessage();

    fileInput.value = '';
  });

  // ===== Carousel =====
  const carouselImages = document.querySelector('.carousel-images');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');

  if (prevBtn && nextBtn && carouselImages) {
    prevBtn.addEventListener('click', () => carouselImages.scrollBy({ left: -130, behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => carouselImages.scrollBy({ left: 130, behavior: 'smooth' }));
  }
})();
