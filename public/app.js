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
  let lastPoll = 0; // poll from start first time
  let pollInterval = null;

  // ===== Toggle Chat =====
  function toggleChat() {
    isOpen = !isOpen;
    widget.classList.toggle('open', isOpen);
    iconOpen.classList.toggle('hidden', isOpen);
    iconClose.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      input.focus();
      // Fetch all messages initially if needed, or start polling
      loadMessages();
      startPolling();
    } else {
      stopPolling();
    }
  }

  launcher.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  backBtn.addEventListener('click', toggleChat);

  // Load existing messages when opened
  async function loadMessages() {
    try {
      const res = await fetch('/api/messages/poll?since=0');
      const data = await res.json();
      if (data.success && data.messages.length > 0) {
        body.innerHTML = ''; // clear
        let lastDateStr = '';
        data.messages.forEach(msg => {
            const d = new Date(msg.timestamp);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dateStr !== lastDateStr) {
                lastDateStr = dateStr;
                const dateEl = document.createElement('div');
                dateEl.className = 'msg-date';
                dateEl.textContent = dateStr;
                body.appendChild(dateEl);
            }
            addBubble(msg.text, msg.role, msg.attachments, false);
        });
        lastPoll = Math.max(...data.messages.map(m => m.timestamp));
        scrollToBottom();
      } else {
        injectInitialGreeting();
      }
    } catch (e) { 
      console.error(e); 
      injectInitialGreeting();
    }
  }

  function injectInitialGreeting() {
    if (body.querySelector('.msg-admin')) return; // already has messages
    
    const wrap = document.createElement('div');
    wrap.className = 'msg-admin';
    wrap.innerHTML = `
      Hi there! 👋 I'm Ace, your sneaker assistant. How can I help you today?
      <div class="quick-replies">
        <button class="quick-reply-btn" onclick="window.sendQuickReply('Track My Order')">Track My Order</button>
        <button class="quick-reply-btn" onclick="window.sendQuickReply('Best Affordable Sneakers of Top Brands')">Best Affordable Sneakers of Top Brands</button>
        <button class="quick-reply-btn" onclick="window.sendQuickReply('My Shoe\\'s soles are worn within 2 weeks')">My Shoe's soles are worn within 2 weeks</button>
      </div>
    `;
    body.appendChild(wrap);
    scrollToBottom();
  }

  window.sendQuickReply = function(text) {
    input.value = text;
    sendMessage();
  };

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
    // Map role 'user' to msg-user, 'bot' to msg-admin
    wrap.className = role === 'bot' ? 'msg-admin' : 'msg-user';
    
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
    body.scrollTop = body.scrollHeight;
  }

  // Show typing
  function showTyping() {
    removeTyping(); // ensure only one
    const wrap = document.createElement('div');
    wrap.className = 'msg-admin typing-msg';
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
    
    // reset input
    input.value = '';
    updateSendBtn();
    input.style.height = 'auto';

    // update lastPoll before we hit send so we don't fetch our own message back if we polled it
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
