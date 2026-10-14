/**
 * Voice Translator Web App
 * Pure vanilla JavaScript - no frameworks, no build tools, no API keys.
 * 
 * Sections:
 * 1. DOM Elements
 * 2. State Management
 * 3. Language Configurations & Mappings
 * 4. Speech Recognition (STT)
 * 5. Waveform Visualizer (Web Audio API)
 * 6. Translation API (MyMemory)
 * 7. Text-to-Speech (TTS)
 * 8. History Management (localStorage)
 * 9. UI Helpers & Navigation
 * 10. Event Listeners & Initialization
 * 11. Service Worker Registration
 */

// ==========================================================================
// 1. DOM ELEMENTS
// ==========================================================================

const elements = {
  // Navigation & Views
  navItems: document.querySelectorAll('.nav-item'),
  views: {
    voice: document.getElementById('view-voice'),
    history: document.getElementById('view-history'),
    language: document.getElementById('view-language')
  },
  appStatus: document.getElementById('app-status'),

  // Language selectors
  fromLangSelect: document.getElementById('from-lang'),
  toLangSelect: document.getElementById('to-lang'),
  swapLangBtn: document.getElementById('swap-lang-btn'),
  sourceLangLabel: document.getElementById('source-lang-label'),
  toLangLabel: document.getElementById('to-lang-label'),

  // Text cards
  sourceText: document.getElementById('source-text'),
  translationText: document.getElementById('translation-text'),
  clearSourceBtn: document.getElementById('clear-source-btn'),
  speakBtn: document.getElementById('speak-btn'),
  copyBtn: document.getElementById('copy-btn'),
  copyBtnText: document.getElementById('copy-btn-text'),
  translatingIndicator: document.getElementById('translating-indicator'),

  // Voice recording & waveform
  micBtn: document.getElementById('mic-btn'),
  micStatusLabel: document.getElementById('mic-status-label'),
  waveformCanvas: document.getElementById('waveform-canvas'),

  // History & Language settings
  historyList: document.getElementById('history-list'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  presetPairsList: document.getElementById('preset-pairs-list'),
  languageGuideList: document.getElementById('language-guide-list'),

  // Notification Toast
  toast: document.getElementById('toast')
};

// ==========================================================================
// 2. STATE MANAGEMENT
// ==========================================================================

const state = {
  isRecording: false,
  isTranslating: false,
  isSpeaking: false,
  speechRecognitionSupported: false,
  recognitionInstance: null,
  audioContext: null,
  mediaStream: null,
  analyserNode: null,
  animFrameId: null,
  history: [],
  toastTimer: null
};

// ==========================================================================
// 3. LANGUAGE CONFIGURATIONS & MAPPINGS
// ==========================================================================

/**
 * Supported languages list:
 * - code: MyMemory translation API code
 * - speechCode: BCP-47 tag for Web Speech Recognition & SpeechSynthesis
 * - label: English display name
 * - native: Native display name
 */
const LANGUAGES = [
  { code: 'en', speechCode: 'en-US', label: 'English', native: 'English' },
  { code: 'es', speechCode: 'es-ES', label: 'Spanish', native: 'Español' },
  { code: 'fr', speechCode: 'fr-FR', label: 'French', native: 'Français' },
  { code: 'de', speechCode: 'de-DE', label: 'German', native: 'Deutsch' },
  { code: 'it', speechCode: 'it-IT', label: 'Italian', native: 'Italiano' },
  { code: 'pt', speechCode: 'pt-BR', label: 'Portuguese', native: 'Português' },
  { code: 'ja', speechCode: 'ja-JP', label: 'Japanese', native: '日本語' },
  { code: 'ko', speechCode: 'ko-KR', label: 'Korean', native: '한국어' },
  { code: 'zh-CN', speechCode: 'zh-CN', label: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'tl', speechCode: 'fil-PH', label: 'Filipino', native: 'Tagalog' },
  { code: 'ar', speechCode: 'ar-SA', label: 'Arabic', native: 'العربية' },
  { code: 'hi', speechCode: 'hi-IN', label: 'Hindi', native: 'हिन्दी' }
];

const PRESET_PAIRS = [
  { from: 'en', to: 'es', label: 'English ↔ Spanish' },
  { from: 'en', to: 'tl', label: 'English ↔ Filipino' },
  { from: 'en', to: 'ja', label: 'English ↔ Japanese' },
  { from: 'en', to: 'fr', label: 'English ↔ French' },
  { from: 'en', to: 'zh-CN', label: 'English ↔ Chinese' },
  { from: 'en', to: 'de', label: 'English ↔ German' }
];

/**
 * Returns language details matching the given code
 */
function getLanguage(code) {
  return LANGUAGES.find(lang => lang.code === code) || LANGUAGES[0];
}

// ==========================================================================
// 4. SPEECH RECOGNITION (STT)
// ==========================================================================

/**
 * Initializes the Web Speech Recognition instance if supported by the browser.
 */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    state.speechRecognitionSupported = false;
    showToast('Speech recognition is not supported in this browser. Please use Google Chrome.', true);
    return;
  }

  state.speechRecognitionSupported = true;
  state.recognitionInstance = new SpeechRecognition();
  state.recognitionInstance.continuous = true;
  state.recognitionInstance.interimResults = true;

  // Real-time transcription results
  state.recognitionInstance.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = 0; i < event.results.length; ++i) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    const combined = (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
    if (combined) {
      elements.sourceText.value = combined;
    }
  };

  // Handles recognition errors (denied permissions, no speech, network issues)
  state.recognitionInstance.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    
    if (event.error === 'not-allowed') {
      showToast('Microphone access denied. Please allow microphone permissions in Chrome.', true);
      stopRecording();
    } else if (event.error === 'no-speech') {
      showToast('No speech detected. Please try again.');
    } else if (event.error === 'network') {
      showToast('Network error during speech recognition.', true);
      stopRecording();
    }
  };

  // When speech recognition ends unexpectedly or automatically
  state.recognitionInstance.onend = () => {
    if (state.isRecording) {
      // User did not manually tap stop; cleanly finish recording
      stopRecording();
    }
  };
}

/**
 * Starts recording audio and transcribing speech.
 */
async function startRecording() {
  if (!state.speechRecognitionSupported) {
    showToast('Speech recognition requires Google Chrome on desktop or Android.', true);
    return;
  }

  try {
    // 1. Request microphone access for the AudioContext waveform
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.mediaStream = stream;

    // 2. Configure recognition language matching the "From" language
    const currentFromLang = getLanguage(elements.fromLangSelect.value);
    state.recognitionInstance.lang = currentFromLang.speechCode;

    // 3. Start audio waveform visualization
    startWaveform(stream);

    // 4. Start speech recognition engine
    state.recognitionInstance.start();
    state.isRecording = true;

    // 5. Update UI states
    elements.micBtn.classList.add('recording');
    elements.micBtn.setAttribute('title', 'Tap to stop recording');
    elements.micStatusLabel.textContent = 'Listening... tap to stop';
    elements.micStatusLabel.classList.add('recording');
    elements.appStatus.textContent = 'Listening';
    elements.appStatus.className = 'status-badge listening';

    // Clear previous translation output for new input
    elements.translationText.value = '';

  } catch (err) {
    console.error('Error accessing microphone:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showToast('Microphone permission was denied. Please allow access.', true);
    } else {
      showToast('Could not access microphone. Please check settings.', true);
    }
    stopRecording();
  }
}

/**
 * Stops recording, shuts down audio stream, and triggers translation.
 */
function stopRecording() {
  if (!state.isRecording) return;
  state.isRecording = false;

  // 1. Stop Speech Recognition
  if (state.recognitionInstance) {
    try {
      state.recognitionInstance.stop();
    } catch (e) {
      // Ignore if already stopped
    }
  }

  // 2. Stop Web Audio stream and tracks (turns off browser mic indicator)
  stopWaveform();

  // 3. Reset UI states
  elements.micBtn.classList.remove('recording');
  elements.micBtn.setAttribute('title', 'Tap to start recording');
  elements.micStatusLabel.textContent = 'Tap microphone to speak';
  elements.micStatusLabel.classList.remove('recording');
  elements.appStatus.textContent = 'Ready';
  elements.appStatus.className = 'status-badge';

  // 4. Trigger auto-translation if text was captured
  const capturedText = elements.sourceText.value.trim();
  if (capturedText) {
    translateCurrentText();
  } else {
    showToast('No speech was detected. Tap mic to try again.');
  }
}

// ==========================================================================
// 5. WAVEFORM VISUALIZER (Web Audio API on <canvas>)
// ==========================================================================

/**
 * Starts the Web Audio API AnalyserNode and connects the microphone stream.
 * NOTE: The analyser is NEVER connected to audioContext.destination to prevent feedback audio loops.
 */
function startWaveform(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyserNode = state.audioContext.createAnalyser();
  state.analyserNode.fftSize = 256;
  source.connect(state.analyserNode);

  renderActiveWaveform();
}

/**
 * Continuously draws the active audio waveform on the canvas.
 */
function renderActiveWaveform() {
  const canvas = elements.waveformCanvas;
  const ctx = canvas.getContext('2d');
  const bufferLength = state.analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    if (!state.isRecording) return;
    state.animFrameId = requestAnimationFrame(draw);

    state.analyserNode.getByteTimeDomainData(dataArray);

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#3b82f6';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  };

  draw();
}

/**
 * Draws a calm, subtle flat idle baseline when not recording.
 */
function drawIdleWaveform() {
  const canvas = elements.waveformCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(10, height / 2);
  ctx.lineTo(width - 10, height / 2);
  ctx.stroke();
}

/**
 * Shuts down the Web Audio API context and tracks.
 */
function stopWaveform() {
  if (state.animFrameId) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }

  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }

  drawIdleWaveform();
}

// ==========================================================================
// 6. TRANSLATION API (MyMemory Free API)
// ==========================================================================

/**
 * Helper to decode HTML entities (e.g., &quot;, &#39;) returned by translation APIs.
 */
function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Translates text using the free MyMemory Translation API.
 * Endpoint: https://api.mymemory.translated.net/get?q=TEXT&langpair=from|to
 */
async function translateText(text, fromCode, toCode) {
  if (!text || !text.trim()) return '';

  // Same language: no translation needed
  if (fromCode === toCode) {
    return text;
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${fromCode}|${toCode}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Server returned status ${response.status}`);
  }

  const data = await response.json();

  if (data && data.responseData && data.responseData.translatedText) {
    const cleaned = decodeHtmlEntities(data.responseData.translatedText);
    
    // Check for occasional warning prefix from free tier quota
    if (cleaned.startsWith('MYMEMORY WARNING:')) {
      throw new Error('Daily free translation quota reached.');
    }
    return cleaned;
  } else {
    throw new Error(data.responseDetails || 'Translation failed');
  }
}

/**
 * Translates the current content of the source textarea and updates UI.
 */
async function translateCurrentText() {
  const text = elements.sourceText.value.trim();
  if (!text) return;

  const fromCode = elements.fromLangSelect.value;
  const toCode = elements.toLangSelect.value;

  setTranslatingState(true);

  try {
    const translated = await translateText(text, fromCode, toCode);
    elements.translationText.value = translated;

    // Save successful translation to history
    saveToHistory({
      sourceText: text,
      translatedText: translated,
      fromLang: fromCode,
      toLang: toCode
    });

  } catch (error) {
    console.error('Translation error:', error);
    showToast('Translation error. Please check your internet connection.', true);
  } finally {
    setTranslatingState(false);
  }
}

/**
 * Updates UI loading indicators during translation.
 */
function setTranslatingState(isTranslating) {
  state.isTranslating = isTranslating;
  if (isTranslating) {
    elements.translatingIndicator.classList.add('active');
    elements.appStatus.textContent = 'Translating';
    elements.appStatus.className = 'status-badge translating';
  } else {
    elements.translatingIndicator.classList.remove('active');
    elements.appStatus.textContent = 'Ready';
    elements.appStatus.className = 'status-badge';
  }
}

// ==========================================================================
// 7. TEXT-TO-SPEECH (Browser SpeechSynthesis API)
// ==========================================================================

/**
 * Reads the translated text aloud using the browser's SpeechSynthesis API.
 */
function speakTranslation() {
  const text = elements.translationText.value.trim();
  if (!text) {
    showToast('No translation text to speak.');
    return;
  }

  if (!('speechSynthesis' in window)) {
    showToast('Speech synthesis is not supported on this browser.', true);
    return;
  }

  // Cancel any speech in progress
  window.speechSynthesis.cancel();

  const toLangConfig = getLanguage(elements.toLangSelect.value);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = toLangConfig.speechCode;

  // Try to find a high quality voice matching the target language
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find(v => 
    v.lang.toLowerCase() === toLangConfig.speechCode.toLowerCase() ||
    v.lang.toLowerCase().startsWith(toLangConfig.code.toLowerCase())
  );
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  // Visual feedback on the Speak button
  elements.speakBtn.classList.add('speaking');
  state.isSpeaking = true;

  utterance.onend = () => {
    elements.speakBtn.classList.remove('speaking');
    state.isSpeaking = false;
  };

  utterance.onerror = (e) => {
    console.warn('Speech synthesis error:', e);
    elements.speakBtn.classList.remove('speaking');
    state.isSpeaking = false;
  };

  window.speechSynthesis.speak(utterance);
}

// ==========================================================================
// 8. HISTORY MANAGEMENT (localStorage)
// ==========================================================================

const HISTORY_STORAGE_KEY = 'voice_translator_history_v1';

/**
 * Loads the history array from localStorage (capped at 5 items).
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.history = [];
  }
  renderHistoryList();
}

/**
 * Adds a new translation to the history array and persists to localStorage.
 */
function saveToHistory(item) {
  // Prevent duplicate consecutive entries
  if (state.history.length > 0) {
    const last = state.history[0];
    if (last.sourceText === item.sourceText && last.translatedText === item.translatedText) {
      return;
    }
  }

  const record = {
    id: Date.now(),
    sourceText: item.sourceText,
    translatedText: item.translatedText,
    fromLang: item.fromLang,
    toLang: item.toLang,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  // Keep only the last 5 translations
  state.history.unshift(record);
  if (state.history.length > 5) {
    state.history.pop();
  }

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  } catch (e) {
    console.warn('Failed to save history to localStorage', e);
  }

  renderHistoryList();
}

/**
 * Clears all saved translation history.
 */
function clearAllHistory() {
  state.history = [];
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (e) {}
  renderHistoryList();
  showToast('History cleared.');
}

/**
 * Renders the history list into the History tab.
 */
function renderHistoryList() {
  const container = elements.historyList;
  if (!container) return;

  if (state.history.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <svg class="history-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div class="history-empty-title">No history yet</div>
        <p class="history-empty-desc">Your recent translations will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.history.map(item => {
    const fromName = getLanguage(item.fromLang).label;
    const toName = getLanguage(item.toLang).label;

    return `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-top">
          <span class="history-lang-badge">${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
          <span class="history-time">${escapeHtml(item.timestamp)}</span>
        </div>
        <div class="history-source-text">${escapeHtml(item.sourceText)}</div>
        <div class="history-trans-text">${escapeHtml(item.translatedText)}</div>
        <div class="history-actions">
          <button class="history-action-btn load-history-btn" title="Open in Voice translator" data-id="${item.id}" aria-label="Load translation">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <button class="history-action-btn copy-history-btn" title="Copy translated text" data-text="${escapeHtml(item.translatedText)}" aria-label="Copy translation">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach event handlers to history item action buttons
  container.querySelectorAll('.load-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      loadHistoryItem(id);
    });
  });

  container.querySelectorAll('.copy-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-text');
      copyTextToClipboard(text);
    });
  });

  // Clicking anywhere on the card loads it back into the translator
  container.querySelectorAll('.history-item').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.getAttribute('data-id'));
      loadHistoryItem(id);
    });
  });
}

/**
 * Loads a selected history record back into the voice translator view.
 */
function loadHistoryItem(id) {
  const item = state.history.find(h => h.id === id);
  if (!item) return;

  elements.fromLangSelect.value = item.fromLang;
  elements.toLangSelect.value = item.toLang;
  updateLanguageLabels();

  elements.sourceText.value = item.sourceText;
  elements.translationText.value = item.translatedText;

  // Switch back to Voice view
  switchTab('voice');
  showToast('Loaded translation into Voice view.');
}

// ==========================================================================
// 9. UI HELPERS & NAVIGATION
// ==========================================================================

/**
 * Switch active navigation tab (voice, history, language).
 */
function switchTab(targetTab) {
  // Update nav buttons
  elements.navItems.forEach(btn => {
    const tabName = btn.getAttribute('data-tab');
    if (tabName === targetTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update view containers
  Object.keys(elements.views).forEach(tabKey => {
    const viewEl = elements.views[tabKey];
    if (tabKey === targetTab) {
      viewEl.classList.add('active');
    } else {
      viewEl.classList.remove('active');
    }
  });

  // If opening history, re-render to ensure freshness
  if (targetTab === 'history') {
    renderHistoryList();
  }
}

/**
 * Populates language dropdowns with configured languages.
 */
function populateLanguageDropdowns() {
  const fromSelect = elements.fromLangSelect;
  const toSelect = elements.toLangSelect;

  fromSelect.innerHTML = '';
  toSelect.innerHTML = '';

  LANGUAGES.forEach(lang => {
    const optFrom = document.createElement('option');
    optFrom.value = lang.code;
    optFrom.textContent = `${lang.label} (${lang.native})`;
    fromSelect.appendChild(optFrom);

    const optTo = document.createElement('option');
    optTo.value = lang.code;
    optTo.textContent = `${lang.label} (${lang.native})`;
    toSelect.appendChild(optTo);
  });

  // Default pairs: English -> Spanish
  fromSelect.value = 'en';
  toSelect.value = 'es';

  updateLanguageLabels();
}

/**
 * Updates card labels to reflect current language selections.
 */
function updateLanguageLabels() {
  const fromLang = getLanguage(elements.fromLangSelect.value);
  const toLang = getLanguage(elements.toLangSelect.value);

  elements.sourceLangLabel.textContent = fromLang.label;
  elements.toLangLabel.textContent = toLang.label;
}

/**
 * Swaps From and To languages, and also swaps source and translated text.
 */
function swapLanguages() {
  const currentFrom = elements.fromLangSelect.value;
  const currentTo = elements.toLangSelect.value;

  elements.fromLangSelect.value = currentTo;
  elements.toLangSelect.value = currentFrom;
  updateLanguageLabels();

  // Swap texts
  const currentSource = elements.sourceText.value;
  const currentTrans = elements.translationText.value;

  elements.sourceText.value = currentTrans;
  elements.translationText.value = currentSource;

  // Add subtle rotation trigger to swap button
  elements.swapLangBtn.style.transform = 'rotate(180deg)';
  setTimeout(() => {
    elements.swapLangBtn.style.transform = '';
  }, 220);

  // If source now has text, auto-translate into the swapped target
  if (elements.sourceText.value.trim()) {
    translateCurrentText();
  }
}

/**
 * Copies text to clipboard and shows confirmation state.
 */
async function copyTextToClipboard(text) {
  if (!text || !text.trim()) {
    showToast('Nothing to copy.');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    
    // Button visual confirmation
    elements.copyBtn.classList.add('copied');
    elements.copyBtnText.textContent = 'Copied!';
    showToast('Copied to clipboard!');

    setTimeout(() => {
      elements.copyBtn.classList.remove('copied');
      elements.copyBtnText.textContent = 'Copy';
    }, 2000);

  } catch (err) {
    // Fallback for older browsers
    try {
      const tempInput = document.createElement('textarea');
      tempInput.value = text;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);

      elements.copyBtn.classList.add('copied');
      elements.copyBtnText.textContent = 'Copied!';
      showToast('Copied to clipboard!');

      setTimeout(() => {
        elements.copyBtn.classList.remove('copied');
        elements.copyBtnText.textContent = 'Copy';
      }, 2000);
    } catch (e) {
      showToast('Could not copy to clipboard.', true);
    }
  }
}

/**
 * Displays a bottom toast notification with auto-dismissal.
 */
function showToast(message, isError = false) {
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }

  elements.toast.textContent = message;
  elements.toast.className = 'toast visible' + (isError ? ' toast-error' : '');

  state.toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3200);
}

/**
 * Populates language settings view with presets and reference guide.
 */
function renderLanguageSettings() {
  // Render quick presets
  elements.presetPairsList.innerHTML = PRESET_PAIRS.map(pair => `
    <button class="preset-btn" data-from="${pair.from}" data-to="${pair.to}">
      ${escapeHtml(pair.label)}
    </button>
  `).join('');

  elements.presetPairsList.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const from = btn.getAttribute('data-from');
      const to = btn.getAttribute('data-to');
      elements.fromLangSelect.value = from;
      elements.toLangSelect.value = to;
      updateLanguageLabels();
      switchTab('voice');
      showToast(`Set to ${btn.textContent.trim()}`);
    });
  });

  // Render language guide list
  elements.languageGuideList.innerHTML = LANGUAGES.map(lang => `
    <li class="language-guide-item">
      <span class="language-guide-name">${escapeHtml(lang.label)} (${escapeHtml(lang.native)})</span>
      <span class="language-guide-meta">${escapeHtml(lang.speechCode)}</span>
    </li>
  `).join('');
}

/**
 * Utility to prevent XSS in rendered HTML templates.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// 10. EVENT LISTENERS & INITIALIZATION
// ==========================================================================

function initEventListeners() {
  // Tab Navigation
  elements.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Mic Button tap to start/stop
  elements.micBtn.addEventListener('click', () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // Language selectors change
  elements.fromLangSelect.addEventListener('change', () => {
    updateLanguageLabels();
  });

  elements.toLangSelect.addEventListener('change', () => {
    updateLanguageLabels();
    if (elements.sourceText.value.trim()) {
      translateCurrentText();
    }
  });

  // Swap Languages
  elements.swapLangBtn.addEventListener('click', swapLanguages);

  // Clear Source Text
  elements.clearSourceBtn.addEventListener('click', () => {
    elements.sourceText.value = '';
    elements.translationText.value = '';
    elements.sourceText.focus();
  });

  // Manual typing in source textarea translates when user presses Enter (without shift)
  elements.sourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      translateCurrentText();
    }
  });

  // Copy button
  elements.copyBtn.addEventListener('click', () => {
    copyTextToClipboard(elements.translationText.value);
  });

  // Speak button
  elements.speakBtn.addEventListener('click', speakTranslation);

  // Clear history button
  elements.clearHistoryBtn.addEventListener('click', clearAllHistory);

  // Load voices for SpeechSynthesis as soon as available
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

/**
 * App initialization entry point.
 */
function initApp() {
  populateLanguageDropdowns();
  renderLanguageSettings();
  loadHistory();
  initSpeechRecognition();
  initEventListeners();
  drawIdleWaveform();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ==========================================================================
// 11. SERVICE WORKER REGISTRATION (PWA)
// ==========================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Voice Translator Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.warn('Service Worker registration failed:', err);
      });
  });
}
