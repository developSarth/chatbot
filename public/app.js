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

  // ===== Local Product Image Pool =====
  const SHOE_IMAGES = [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80', // Red Nike
    'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=400&q=80', // Nike Air
    'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&q=80', // Orange Nike
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=80', // Air Jordan
    'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=400&q=80'  // White sneaker
  ];
  let shoeImgIndex = 0;
  function getNextShoeImage() {
    const img = SHOE_IMAGES[shoeImgIndex % SHOE_IMAGES.length];
    shoeImgIndex++;
    return img;
  }

  // ===== Render Messages =====
  function addBubble(text, role, attachments, doScroll = true) {
    const wrap = document.createElement('div');
    wrap.className = role === 'bot' ? 'msg-admin msg-animate-in' : 'msg-user msg-animate-in';

    if (text && role === 'bot') {
      const productUrls = extractProductUrls(text);
      const prices = extractPrices(text);
      const displayText = cleanBotResponse(text);
      
      wrap.innerHTML = formatBotHtml(displayText);
      body.appendChild(wrap);
      
      if (productUrls.length > 0) {
        renderProductTiles(productUrls, prices);
      }
    } else {
      wrap.innerHTML = escapeHtml(text || '').replace(/\n/g, '<br>');
      body.appendChild(wrap);
    }

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
          wrap.appendChild(attWrap); // Append attachment to bubble
        }
      });
    }

    if (doScroll) scrollToBottom();
  }

  // ===== Smart Extractors =====
  function extractProductUrls(text) {
    const urls = [];
    const urlRegex = /https?:\/\/[^\s]+(?:\/[^\s]+)?/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
      const fullUrl = m[0];
      // Create a display name from the last part of the URL
      const parts = fullUrl.split('/');
      let slug = parts[parts.length - 1] || parts[parts.length - 2] || 'Sneaker';
      slug = slug.replace(/[^a-zA-Z0-9-]/g, '');
      urls.push({ fullUrl, slug });
    }
    const seen = new Set();
    return urls.filter(u => { if (seen.has(u.slug)) return false; seen.add(u.slug); return true; }).slice(0, 3); // Max 3 cards
  }

  function extractPrices(text) {
    const prices = [];
    const priceRegex = /\$(\d+(?:\.\d{2})?)/g;
    let m;
    while ((m = priceRegex.exec(text)) !== null) {
      prices.push(m[1]);
    }
    return prices;
  }

  function cleanBotResponse(text) {
    let clean = text.replace(/\*+/g, '');
    clean = clean.replace(/https?:\/\/[^\s]+/gi, ''); // remove URLs
    clean = clean.replace(/\[API RESPONSE[^\]]*\]/gi, '');
    clean = clean.replace(/\(\s*\)/g, '');
    clean = clean.replace(/\n{3,}/g, '\n\n');
    return clean.trim();
  }

  function formatBotHtml(text) {
    let html = escapeHtml(text).replace(/\n/g, '<br>');
    return html;
  }

  // ===== Interactive Product Tiles =====
  function renderProductTiles(productUrls, prices) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('product-tiles-wrapper', 'msg-animate-in');

    productUrls.forEach((product, index) => {
      const tile = document.createElement('a');
      tile.href = product.fullUrl;
      tile.target = '_blank';
      tile.rel = 'noopener';
      tile.classList.add('product-tile');
      tile.style.animationDelay = `${index * 0.15}s`;

      const prettyName = product.slug.length > 3 ? 
        product.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 
        'Premium Sneaker';

      const price = prices[index] || '120.00';
      const imgSrc = getNextShoeImage();

      tile.innerHTML = `
        <div class="ptile-img-wrap">
          <img src="${imgSrc}" alt="${escapeHtml(prettyName)}" class="ptile-img" />
          <div class="ptile-overlay">
            <span class="ptile-view-btn">View Sneaker</span>
          </div>
          <div class="ptile-tag">HOT 🔥</div>
        </div>
        <div class="ptile-info">
          <div class="ptile-name">${escapeHtml(prettyName)}</div>
          <div class="ptile-price">$${price}</div>
        </div>
        <div class="ptile-link-row">
          <span class="ptile-shop-link">Shop Now</span>
          <span class="ptile-arrow">→</span>
        </div>
      `;

      wrapper.appendChild(tile);
    });

    body.appendChild(wrapper);
    scrollToBottom();
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
