
    /* Live clock for status bar */
    function updateClock() {
      const el = document.getElementById('ios-clock');
      if (!el) return;
      const now = new Date();
      const h = now.getHours() % 12 || 12;
      const m = String(now.getMinutes()).padStart(2, '0');
      el.textContent = `${h}:${m}`;
    }
    updateClock();
    setInterval(updateClock, 30000);

    /* ============================================================
       DOM refs
    ============================================================ */
    const btnBrainstorm = document.getElementById('btn-brainstorm');
    const topicRow      = document.getElementById('topic-row');
    const topicInput    = document.getElementById('topic-input');
    const btnGenerate   = document.getElementById('btn-generate');
    const statusEl      = document.getElementById('status');
    const outputSection = document.getElementById('output-section');
    const igTrack       = document.getElementById('ig-track');
    const igDots        = document.getElementById('ig-dots');
    const navPrev       = document.getElementById('nav-prev');
    const navNext       = document.getElementById('nav-next');
    const slideCounter  = document.getElementById('slide-counter');
    const captionBox    = document.getElementById('caption-box');
    const researchSourcesPanel = document.getElementById('research-sources');
    const researchSourcesList = document.getElementById('research-sources-list');
    const researchSourcesNote = document.getElementById('research-sources-note');
    const hashtagChips  = document.getElementById('hashtag-chips');
    const controls      = document.getElementById('controls');
    const postGenerateActions = document.getElementById('post-generate-actions');
    const btnDownloadTop = document.getElementById('btn-download-top');
    const btnCopyTop = document.getElementById('btn-copy-top');
    const btnRegenerate = document.getElementById('btn-regenerate');
    const btnSourcePreview = document.getElementById('btn-source-preview');
    const workspaceTabs = document.getElementById('workspace-tabs');
    const workspaceTabButtons = [...workspaceTabs.querySelectorAll('.workspace-tab')];
    const workspacePanels = [...document.querySelectorAll('.workspace-panel')];
    const copiedBadge   = document.getElementById('copied-badge');
    const renderGrid    = document.getElementById('render-grid');

    const bgMap = {
      'gradient-blue':   'bg-gradient-blue',
      'gradient-purple': 'bg-gradient-purple',
      'gradient-red':    'bg-gradient-red',
      'gradient-green':  'bg-gradient-green',
      'gradient-gold':   'bg-gradient-gold',
    };

    let currentSlide = 0;
    let totalSlides  = 5;
    let currentScript = [];
    let currentSources = [];

    function setStatus(msg, spinner = false) {
      statusEl.innerHTML = spinner ? `<span class="spinner"></span>${msg}` : msg;
    }

    function showWorkspaceTab(panelId, scrollToTabs = true) {
      const targetButton = workspaceTabButtons.find(button => button.dataset.panel === panelId);
      const targetPanel = document.getElementById(panelId);
      if (!targetButton || !targetPanel || targetButton.disabled) return;
      workspaceTabButtons.forEach(button => {
        const selected = button === targetButton;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });
      workspacePanels.forEach(panel => {
        const selected = panel === targetPanel;
        panel.hidden = !selected;
        panel.classList.toggle('active', selected);
      });
      if (scrollToTabs) {
        const top = workspaceTabs.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }

    workspaceTabs.addEventListener('click', event => {
      const button = event.target.closest('.workspace-tab');
      if (button && !button.disabled) showWorkspaceTab(button.dataset.panel);
    });

    btnSourcePreview.addEventListener('click', () => showWorkspaceTab('preview-panel'));

    function renderResearchSources(sources) {
      researchSourcesList.replaceChildren();
      const validSources = (Array.isArray(sources) ? sources : []).filter(source => {
        try { return ['http:', 'https:'].includes(new URL(source.url).protocol); }
        catch { return false; }
      });
      researchSourcesPanel.hidden = false;
      if (validSources.length === 0) {
        researchSourcesNote.textContent = 'No source links came back from web search. Verify factual details before posting.';
        return;
      }

      validSources.forEach(source => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        const parsedUrl = new URL(source.url);
        link.href = parsedUrl.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title || parsedUrl.hostname;
        item.append(link);
        const claim = Array.isArray(source.claims) ? source.claims.find(text => typeof text === 'string' && text.trim()) : '';
        if (claim) {
          const excerpt = document.createElement('div');
          excerpt.className = 'research-sources-note';
          excerpt.textContent = claim.trim().slice(0, 220);
          item.append(excerpt);
        }
        researchSourcesList.append(item);
      });
      researchSourcesNote.textContent = 'Open the reports and check the details before publishing.';
    }

    /* ============================================================
       Genre Picker
    ============================================================ */
    const GENRES = [
      { label: 'Economics', icon: '💰' },
      { label: 'Tech & AI', icon: '🤖' },
      { label: 'Mental Health', icon: '🧠' },
      { label: 'Physical Fitness', icon: '💪' },
      { label: 'Health & Nutrition', icon: '🥗' },
      { label: 'Bioengineering', icon: '🧬' },
      { label: 'Student Life', icon: '🎓' },
      { label: 'Entrepreneurship', icon: '🚀' },
      { label: 'Climate & Environment', icon: '🌍' },
      { label: 'Space & Astronomy', icon: '🔭' },
      { label: 'Neuroscience', icon: '🧪' },
      { label: 'Relationships', icon: '❤️' },
      { label: 'Personal Finance', icon: '📈' },
      { label: 'Future of Work', icon: '🏢' },
      { label: 'Psychology', icon: '💭' },
      { label: 'History & Hidden Facts', icon: '📜' },
      { label: 'Philosophy', icon: '🔮' },
      { label: 'Geopolitics', icon: '🌐' },
      { label: 'Parenting', icon: '👶' },
      { label: 'Food Science', icon: '🍕' },
      { label: 'Crypto & Web3', icon: '🔗' },
      { label: 'Other', icon: '✏️' },
    ];

    const genreOptions = document.getElementById('genre-options');
    const genreSearchWrap = document.getElementById('genre-search-wrap');
    const genreSearch = document.getElementById('genre-search');
    const customGenreRow = document.getElementById('custom-genre-row');
    const customGenreInput = document.getElementById('custom-genre-input');
    const genreSelectedLabel = document.getElementById('genre-selected-label');
    let selectedGenre = null;
    let isCustomGenre = false;

    GENRES.forEach(g => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'genre-option';
      option.setAttribute('role', 'option');
      option.dataset.label = g.label;
      option.setAttribute('aria-selected', 'false');
      option.textContent = `${g.icon}  ${g.label}`;
      option.addEventListener('click', () => {
        clearDraftTopic();
        if (g.label === 'Other') {
          isCustomGenre = true;
          selectedGenre = null;
          genreSearch.value = 'Other';
          customGenreRow.classList.add('visible');
          customGenreInput.focus();
        } else {
          isCustomGenre = false;
          customGenreRow.classList.remove('visible');
          selectedGenre = g.label;
          customGenreInput.value = '';
          genreSearch.value = `${g.icon} ${g.label}`;
        }
        genreOptions.querySelectorAll('.genre-option').forEach(item => item.setAttribute('aria-selected', String(item === option)));
        closeGenreOptions();
        updateGenreLabel();
        updateActionAvailability();
      });
      genreOptions.appendChild(option);
    });

    customGenreInput.addEventListener('input', () => {
      clearDraftTopic();
      selectedGenre = null;
      updateGenreLabel();
      updateActionAvailability();
    });

    genreSearch.addEventListener('input', () => {
      openGenreOptions();
      const q = genreSearch.value.replace(/^\p{Extended_Pictographic}\s*/u, '').trim().toLowerCase();
      genreOptions.querySelectorAll('.genre-option').forEach(option => {
        option.classList.toggle('hidden', !option.dataset.label.toLowerCase().includes(q));
      });
    });

    genreSearch.addEventListener('focus', () => {
      if (selectedGenre || isCustomGenre) genreSearch.select();
      openGenreOptions();
    });
    genreSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeGenreOptions();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        genreOptions.querySelector('.genre-option:not(.hidden)')?.focus();
      }
    });
    document.addEventListener('click', event => {
      if (!genreSearchWrap.contains(event.target)) closeGenreOptions();
    });

    function openGenreOptions() {
      genreOptions.classList.add('open');
      genreSearch.setAttribute('aria-expanded', 'true');
    }

    function closeGenreOptions() {
      genreOptions.classList.remove('open');
      genreSearch.setAttribute('aria-expanded', 'false');
      genreOptions.querySelectorAll('.genre-option').forEach(option => option.classList.remove('hidden'));
    }

    function updateGenreLabel() {
      genreSelectedLabel.textContent = isCustomGenre
        ? (customGenreInput.value.trim() ? `✅ Niche: ${customGenreInput.value.trim()}` : 'Enter your custom niche to continue.')
        : selectedGenre ? `✅ Niche: ${selectedGenre}` : '';
    }

    function clearDraftTopic() {
      outputSection.classList.remove('visible');
      controls.classList.remove('has-generated');
      postGenerateActions.classList.remove('visible');
      setStatus('');
    }

    function getGenre() {
      if (isCustomGenre) return customGenreInput.value.trim() || null;
      return selectedGenre;
    }

    function updateActionAvailability() {
      const genre = getGenre();
      btnBrainstorm.disabled = !genre;
      btnGenerate.disabled = !genre || !topicInput.value.trim();
    }

    topicInput.addEventListener('input', () => {
      if (outputSection.classList.contains('visible')) clearDraftTopic();
      updateActionAvailability();
    });
    updateActionAvailability();

    /* ============================================================
       Step 1: Brainstorm
    ============================================================ */
    btnBrainstorm.addEventListener('click', async () => {
      btnBrainstorm.disabled = true;
      const genre = getGenre();
      if (!genre) {
        setStatus('Choose a niche before brainstorming a topic.');
        updateActionAvailability();
        return;
      }
      setStatus(`Brainstorming a viral ${genre} topic...`, true);
      try {
        const res  = await fetch('/api/brainstorm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ genre })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
        if (data.genre !== genre) {
          throw new Error(`Genre mismatch: you selected "${genre}" but the server used "${data.genre || 'none'}". No topic was accepted.`);
        }
        if (data.topic) {
          topicInput.value = data.topic;
          updateActionAvailability();
          setStatus(`✅ Topic ready for ${data.genre} — edit it or approve as-is.`);
        } else {
          throw new Error('The server returned no topic. Please try again.');
        }
      } catch (err) {
        setStatus(`❌ ${err.message || 'Failed to connect to server.'}`);
      }
      updateActionAvailability();
    });

    /* ============================================================
       Step 2: Generate via SSE
    ============================================================ */
    btnGenerate.addEventListener('click', () => {
      const topic = topicInput.value.trim();
      const genre = getGenre();
      if (!genre || !topic) {
        setStatus(!genre ? 'Choose a niche before generating the carousel.' : 'Enter a topic before generating the carousel.');
        updateActionAvailability();
        return;
      }

      btnGenerate.disabled = true;
      showWorkspaceTab('topic-panel', false);
      document.getElementById('tab-sources').disabled = true;
      document.getElementById('tab-preview').disabled = true;
      outputSection.classList.remove('visible');
      igTrack.innerHTML = '';
      igDots.innerHTML  = '';
      hashtagChips.innerHTML = '';
      captionBox.value  = '';
      btnRegenerate.classList.remove('visible');
      postGenerateActions.classList.remove('visible');
      currentSources = [];
      researchSourcesPanel.hidden = true;
      researchSourcesList.replaceChildren();
      researchSourcesNote.textContent = '';
      setStatus('Searching free web sources, then writing your story...', true);

      const evtSource = new EventSource(`/api/generate-stream?topic=${encodeURIComponent(topic)}&genre=${encodeURIComponent(genre || '')}`);

      evtSource.onmessage = async (e) => {
        const payload = JSON.parse(e.data);

        if (payload.error) {
          setStatus('❌ Error: ' + payload.error);
          evtSource.close();
          btnGenerate.disabled = false;
          return;
        }

        if (payload.status) setStatus(payload.status, true);

        if (payload.done && payload.script) {
          evtSource.close();
          currentScript = payload.script;
          currentSources = Array.isArray(payload.sources) ? payload.sources : [];
          renderResearchSources(currentSources);
          
          setStatus('📸 Fetching high-quality backgrounds...', true);
          
          // Fetch images for each slide in parallel
          await Promise.all(currentScript.map(async (slide) => {
            if (!slide.image_query) return;
            try {
              const res = await fetch(`/api/images?q=${encodeURIComponent(slide.image_query)}`);
              const data = await res.json();
              if (data.images && data.images.length > 0) {
                slide.bg_image = data.images[0];
              }
            } catch (e) { console.error('Image fetch error', e); }
          }));

          renderPhonePreview(currentScript);
          buildRenderGrid(currentScript);

          if (payload.caption) {
            captionBox.value = payload.caption;
            // Auto-copy caption to clipboard
            navigator.clipboard.writeText(payload.caption).catch(() => {});
            showCopied();
            // Show hashtag chips
            const tags = payload.caption.match(/#\w+/g) || [];
            hashtagChips.innerHTML = tags.map(t => `<span class="hashtag-chip">${t}</span>`).join('');
            // Update phone caption preview (first non-hashtag line)
            const previewEl = document.getElementById('ig-caption-preview');
            if (previewEl) {
              const firstLine = payload.caption.split('\n').find(l => l.trim() && !l.trim().startsWith('#')) || '';
              previewEl.innerHTML = `<strong>g0wtham.exe</strong> ${firstLine}`;
            }
          }

          outputSection.classList.add('visible');
          controls.classList.add('has-generated');
          postGenerateActions.classList.add('visible');
          btnRegenerate.classList.add('visible');
          document.getElementById('tab-sources').disabled = false;
          document.getElementById('tab-preview').disabled = false;
          showWorkspaceTab('sources-panel');
          setStatus('✅ Carousel ready! Review the sources, then open Preview when you’re ready.');
          btnGenerate.disabled = false;
        }
      };

      evtSource.onerror = () => {
        setStatus('❌ Connection error. Try again.');
        evtSource.close();
        btnGenerate.disabled = false;
      };
    });

    /* ============================================================
       Render Instagram phone preview
    ============================================================ */
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function formatTitle(title) {
      // Highlight the last word or specific words for visual pop
      const words = escapeHtml(title).split(/\s+/);
      const lastWord = words.pop() || '';
      return `${words.length ? `${words.join(' ')} ` : ''}<span class="highlight">${lastWord}</span>`;
    }

    function getCaretOffset(element) {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return null;
      const range = selection.getRangeAt(0).cloneRange();
      range.selectNodeContents(element);
      range.setEnd(selection.anchorNode, selection.anchorOffset);
      return range.toString().length;
    }

    function setCaretOffset(element, offset) {
      if (offset === null) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let remaining = offset;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        remaining -= node.textContent.length;
      }
      const last = element.lastChild;
      if (last) {
        const range = document.createRange();
        range.selectNodeContents(last);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    function getSlideCopy(slide) {
      return [slide.body_text, slide.hook].filter(Boolean).join(' ').trim();
    }

    function renderPhonePreview(slides, preserveIndex = false) {
      igTrack.innerHTML = '';
      igDots.innerHTML  = '';
      totalSlides = slides.length;
      currentSlide = preserveIndex ? Math.min(currentSlide, slides.length - 1) : 0;

      slides.forEach((slide, i) => {
        const mood = slide.bg_type ? slide.bg_type.replace('gradient-', '') : 'blue';
        const bgClass = bgMap[slide.bg_type] || 'bg-gradient-blue';
        const bgStyle = slide.bg_image ? `background-image: url('${slide.bg_image}')` : '';
        // Slide
        const el = document.createElement('div');
        el.className = `ig-slide ${!slide.bg_image ? bgClass : ''}`;
        el.dataset.mood = mood;
        el.dataset.cover = i === 0 ? 'true' : 'false';
        el.innerHTML = `
          <div class="ig-slide-bg" style="${bgStyle}"></div>
          <div class="ig-slide-content">
            <div class="ig-slide-main">
              <div class="ig-slide-title editable-slide-text" contenteditable="true" role="textbox" aria-label="Slide ${i + 1} title" spellcheck="true" data-slide-index="${i}" data-slide-field="title">${formatTitle(slide.title)}</div>
              ${i === 0 || !getSlideCopy(slide) ? '' : `<div class="ig-slide-body editable-slide-text" contenteditable="true" role="textbox" aria-label="Slide ${i + 1} text" spellcheck="true" data-slide-index="${i}" data-slide-field="copy">${escapeHtml(getSlideCopy(slide)).replace(/\n/g, '<br>')}</div>`}
            </div>
          </div>
        `;
        igTrack.appendChild(el);

        // Dot
        const dot = document.createElement('div');
        dot.className = 'ig-dot' + (i === 0 ? ' active' : '');
        igDots.appendChild(dot);
      });

      updateCarousel();
      setupSwipe();
    }

    let renderGridUpdateTimer;
    igTrack.addEventListener('input', event => {
      const field = event.target.dataset.slideField;
      const slide = currentScript[Number(event.target.dataset.slideIndex)];
      if (!field || !slide) return;
      if (field === 'title') {
        const caretOffset = getCaretOffset(event.target);
        slide.title = event.target.textContent.replace(/\s+/g, ' ').trim();
        event.target.innerHTML = formatTitle(slide.title);
        setCaretOffset(event.target, Math.min(caretOffset ?? slide.title.length, slide.title.length));
      }
      if (field === 'copy') {
        slide.body_text = event.target.innerText.trim();
        slide.hook = '';
      }
      clearTimeout(renderGridUpdateTimer);
      renderGridUpdateTimer = setTimeout(() => buildRenderGrid(currentScript), 150);
    });

    igTrack.addEventListener('blur', event => {
      if (!event.target.matches('.editable-slide-text')) return;
      clearTimeout(renderGridUpdateTimer);
      renderPhonePreview(currentScript, true);
      buildRenderGrid(currentScript);
    }, true);

    /* ============================================================
       Carousel navigation
    ============================================================ */
    function updateCarousel() {
      igTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
      document.querySelectorAll('.ig-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
      });
      slideCounter.textContent = `${currentSlide + 1} / ${totalSlides}`;
    }

    navPrev.addEventListener('click', () => {
      if (currentSlide > 0) { currentSlide--; updateCarousel(); }
    });
    navNext.addEventListener('click', () => {
      if (currentSlide < totalSlides - 1) { currentSlide++; updateCarousel(); }
    });

    // Touch/mouse swipe inside phone
    function setupSwipe() {
      const wrap = document.getElementById('ig-track-wrap');
      if (wrap.dataset.swipeReady === 'true') return;
      wrap.dataset.swipeReady = 'true';
      let startX = 0;

      wrap.addEventListener('mousedown', e => { startX = e.clientX; });
      wrap.addEventListener('mouseup', e => {
        const diff = startX - e.clientX;
        if (diff > 30 && currentSlide < totalSlides - 1) { currentSlide++; updateCarousel(); }
        if (diff < -30 && currentSlide > 0)               { currentSlide--; updateCarousel(); }
      });

      wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
      wrap.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (diff > 30 && currentSlide < totalSlides - 1) { currentSlide++; updateCarousel(); }
        if (diff < -30 && currentSlide > 0)               { currentSlide--; updateCarousel(); }
      });
    }

    /* ============================================================
       Build hidden render grid (full resolution for download)
    ============================================================ */
    function buildRenderGrid(slides) {
      renderGrid.innerHTML = '';
      const numSlides = slides.length;
      
      // Update CSS for the off-screen grid to match the new style
      if (!document.getElementById('render-grid-style')) {
        const style = document.createElement('style');
        style.id = 'render-grid-style';
        style.innerHTML = `
          #render-grid .slide-card { width: 400px; height: 500px; min-height: 500px; background-color: #0a0a12; }
          #render-grid .slide-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; z-index: 0; }
          #render-grid .slide-card-bg::after {
            content: ''; position: absolute; inset: 0; z-index: 1;
            background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.75) 65%, rgba(0,0,0,0.92) 100%);
          }
          #render-grid .slide-card[data-mood="red"] .slide-card-bg::after { background: linear-gradient(to bottom, rgba(100,0,0,0.1) 0%, rgba(60,0,0,0.3) 30%, rgba(30,0,0,0.75) 65%, rgba(10,0,0,0.95) 100%); }
          #render-grid .slide-card[data-mood="purple"] .slide-card-bg::after { background: linear-gradient(to bottom, rgba(40,0,80,0.1) 0%, rgba(30,0,60,0.3) 30%, rgba(15,0,40,0.75) 65%, rgba(5,0,15,0.95) 100%); }
          #render-grid .slide-card[data-mood="green"] .slide-card-bg::after { background: linear-gradient(to bottom, rgba(0,60,20,0.1) 0%, rgba(0,40,10,0.3) 30%, rgba(0,20,5,0.75) 65%, rgba(0,5,2,0.95) 100%); }
          #render-grid .slide-card[data-mood="gold"] .slide-card-bg::after { background: linear-gradient(to bottom, rgba(80,60,0,0.1) 0%, rgba(60,40,0,0.3) 30%, rgba(30,20,0,0.75) 65%, rgba(10,5,0,0.95) 100%); }
          #render-grid .slide-content { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 1.5rem 2.35rem; min-height: 0; overflow: hidden; }
          #render-grid .slide-main { width: 100%; min-width: 0; }
          #render-grid .slide-title { font-size: 2.6rem; font-weight: 900; line-height: 1.12; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1.05rem; text-shadow: 0 2px 8px rgba(0,0,0,0.6); overflow-wrap: anywhere; }
          #render-grid .slide-title .highlight { color: var(--cyan); }
          #render-grid .slide-body { font-size: 1.35rem; line-height: 1.45; color: rgba(255,255,255,0.88); font-weight: 500; text-shadow: 0 1px 4px rgba(0,0,0,0.5); overflow-wrap: anywhere; }
          #render-grid .slide-card[data-cover="true"] .slide-title { font-size: 3rem; margin-bottom: 0; }
        `;
        document.head.appendChild(style);
      }

      slides.forEach((slide, i) => {
        const mood = slide.bg_type ? slide.bg_type.replace('gradient-', '') : 'blue';
        const bgClass = bgMap[slide.bg_type] || 'bg-gradient-blue';
        const bgStyle = slide.bg_image ? `background-image: url('${slide.bg_image}')` : '';
        const card = document.createElement('div');
        card.className = `slide-card ${!slide.bg_image ? bgClass : ''}`;
        card.dataset.mood = mood;
        card.dataset.cover = i === 0 ? 'true' : 'false';
        card.id = `render-slide-${i + 1}`;
        card.innerHTML = `
          <div class="slide-card-bg" style="${bgStyle}"></div>
          <div class="slide-content">
            <div class="slide-main">
              <div class="slide-title">${formatTitle(slide.title)}</div>
              ${i === 0 || !getSlideCopy(slide) ? '' : `<div class="slide-body">${escapeHtml(getSlideCopy(slide)).replace(/\n/g, '<br>')}</div>`}
            </div>
          </div>
        `;
        renderGrid.appendChild(card);
      });

      fitRenderText();
    }

    function fitRenderText() {
      renderGrid.querySelectorAll('.slide-card').forEach(card => {
        const title = card.querySelector('.slide-title');
        const body = card.querySelector('.slide-body');
        const main = card.querySelector('.slide-main');
        const content = card.querySelector('.slide-content');
        if (!title || !body || !main || !content) return;
        main.style.transform = '';
        main.style.transformOrigin = 'center center';
        let fontSize = card.dataset.cover === 'true' ? 48 : 42;
        title.style.fontSize = `${fontSize}px`;
        while (fontSize > 24 && (title.scrollHeight > content.clientHeight * 0.42 || title.scrollWidth > title.clientWidth + 1)) {
          fontSize -= 1;
          title.style.fontSize = `${fontSize}px`;
        }
        let bodySize = 21.6;
        body.style.fontSize = `${bodySize}px`;
        const fits = () => main.scrollHeight <= content.clientHeight + 1
          && title.scrollWidth <= title.clientWidth + 1;
        while (bodySize > 14 && !fits()) {
          bodySize -= 0.5;
          body.style.fontSize = `${bodySize}px`;
        }
        while (fontSize > 20 && !fits()) {
          fontSize -= 1;
          title.style.fontSize = `${fontSize}px`;
        }
        if (!fits()) {
          const scale = Math.min(1, content.clientWidth / main.scrollWidth, content.clientHeight / main.scrollHeight);
          main.style.transform = `scale(${Math.max(0.5, scale)})`;
        }
      });
    }

    /* ============================================================
       Copy Caption
    ============================================================ */
    btnCopyTop.addEventListener('click', () => {
      navigator.clipboard.writeText(captionBox.value)
        .then(showCopied)
        .catch(() => {
          captionBox.select();
          document.execCommand('copy');
          showCopied();
        });
    });

    btnRegenerate.addEventListener('click', () => {
      controls.classList.remove('has-generated');
      btnRegenerate.classList.remove('visible');
      postGenerateActions.classList.remove('visible');
      showWorkspaceTab('topic-panel');
      btnGenerate.click();
    });

    function showCopied() {
      copiedBadge.classList.remove('show');
      void copiedBadge.offsetWidth; // reflow to restart animation
      copiedBadge.classList.add('show');
      setTimeout(() => copiedBadge.classList.remove('show'), 2200);
    }

    /* ============================================================
       Download Slides as individual JPEGs in a ZIP
    ============================================================ */
    async function downloadSlides(button) {
      button.disabled = true;
      button.textContent = '⏳ Preparing...';

      try {
        // Load dependencies
        const [h2cMod, JSZip] = await Promise.all([
          import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js'),
          loadJSZip()
        ]);
        const html2canvas = h2cMod.default;
        const zip = new JSZip();

        buildRenderGrid(currentScript);
        await document.fonts.ready;
        fitRenderText();

        for (let i = 1; i <= currentScript.length; i++) {
          const el = document.getElementById(`render-slide-${i}`);
          if (!el) continue;
          const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null });
          if (!canvas.width || !canvas.height) throw new Error(`Could not render slide ${i}.`);
          const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error(`Could not encode slide ${i}.`)), 'image/jpeg', 0.95));
          zip.file(`slide_${i}.jpg`, blob);
        }

        const caption = captionBox.value.trim();
        if (caption) zip.file('caption.txt', `${caption}\n`);

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename: YYYY-MM-DD_slide-1-title.zip
        const dateStr = new Date().toISOString().split('T')[0];
        let titleStr = "carousel";
        if (currentScript && currentScript.length > 0 && currentScript[0].title) {
          titleStr = currentScript[0].title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        }
        a.download = `${dateStr}_${titleStr}.zip`;
        
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        alert('Download failed: ' + err.message);
      }

      button.disabled = false;
      button.innerHTML = '⬇️ Download Slides';
    }

    btnDownloadTop.addEventListener('click', () => downloadSlides(btnDownloadTop));

    function loadJSZip() {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

  
