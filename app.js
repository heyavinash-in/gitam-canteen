// GITAM Canteen - App Logic & Controller (Full-Stack Edition)

// --- App State ---
const state = {
  user: null,               // { name, roll, email, picture }
  selectedThali: null,      // { type, price }
  coupon: null,             // { id, type, price, purchasedAt, status, code, scratchedAt }
  googleClientId: '',       // Configured in Developer Panel
  razorpayKeyId: 'rzp_test_zHsn7sN6rMvH5e', // Configured in Developer Panel
  currentDayOverride: 'auto' // 'auto' or 0-6 (Sun-Sat)
};

// Polling interval pointer
let couponPollInterval = null;

// --- DOM References ---
const views = {
  login: document.getElementById('login-view'),
  menu: document.getElementById('menu-view'),
  checkout: document.getElementById('checkout-modal'),
  coupon: document.getElementById('coupon-view'),
  admin: document.getElementById('admin-view')
};

const elements = {
  headerLogoutBtn: document.getElementById('logout-btn'),
  adminPortalBtn: document.getElementById('admin-portal-btn'),
  devToggleBtn: document.getElementById('dev-toggle-btn'),
  devConsole: document.getElementById('dev-console'),
  devDaySelect: document.getElementById('dev-day-select'),
  devGoogleClientId: document.getElementById('dev-google-client-id'),
  devRazorpayKeyId: document.getElementById('dev-razorpay-key-id'),
  devRazorpayKeySecret: document.getElementById('dev-razorpay-key-secret'),
  devSaveKeysBtn: document.getElementById('dev-save-keys-btn'),
  devResetBtn: document.getElementById('dev-reset-db-btn'),
  toastContainer: document.getElementById('toast-container'),
  
  // Auth Elements
  loginStudentSelect: document.getElementById('login-student-name'),
  customIdFields: document.getElementById('custom-identity-fields'),
  customNameInput: document.getElementById('custom-name'),
  customRollInput: document.getElementById('custom-roll'),
  customEmailInput: document.getElementById('custom-email'),
  googleLoginBtn: document.getElementById('google-login-btn'),
  googleSigninBtnEl: document.getElementById('google-signin-btn-el'),
  userDisplayName: document.getElementById('user-display-name'),
  userDisplayRoll: document.getElementById('user-display-roll'),
  userDisplayPic: document.getElementById('user-display-pic'),
  
  // Menu Elements
  disabledOverlayBadge: document.getElementById('disabled-overlay-badge'),
  currentDayLabel: document.getElementById('current-day-label'),
  currentDayDesc: document.getElementById('current-day-desc'),
  menuActionBar: document.getElementById('menu-action-bar'),
  summaryItemName: document.getElementById('summary-item-name'),
  summaryItemPrice: document.getElementById('summary-item-price'),
  orderProceedBtn: document.getElementById('order-proceed-btn'),
  activeCouponAlert: document.getElementById('active-coupon-alert'),
  viewActiveCouponBtn: document.getElementById('view-active-coupon-btn'),

  // Checkout Elements
  checkoutCloseBtn: document.getElementById('checkout-close-btn'),
  checkoutItemName: document.getElementById('checkout-item-name'),
  checkoutItemPrice: document.getElementById('checkout-item-price'),
  checkoutRzpPayBtn: document.getElementById('checkout-rzp-pay-btn'),
  paymentProcessingLoader: document.getElementById('payment-processing-loader'),
  loaderProgress: document.getElementById('loader-progress'),
  paymentSuccessOverlay: document.getElementById('payment-success-overlay'),
  payTabs: document.querySelectorAll('.pay-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  launchUpiBtn: document.getElementById('launch-upi-btn'),
  verifyUpiBtn: document.getElementById('verify-upi-btn'),
  cardPaymentForm: document.getElementById('card-payment-form'),
  cardNum: document.getElementById('card-num'),
  cardExpiry: document.getElementById('card-expiry'),
  cardCvv: document.getElementById('card-cvv'),

  // Coupon Elements
  mealTicket: document.getElementById('meal-ticket'),
  ticketHeaderBg: document.getElementById('ticket-header-bg'),
  ticketThaliType: document.getElementById('ticket-thali-type'),
  ticketRefNumber: document.getElementById('ticket-ref-number'),
  ticketStudentName: document.getElementById('ticket-student-name'),
  ticketStudentRoll: document.getElementById('ticket-student-roll'),
  ticketPurchaseTime: document.getElementById('ticket-purchase-time'),
  ticketAmount: document.getElementById('ticket-amount'),
  ticketStatusPill: document.getElementById('ticket-status-pill'),
  scratchPromptText: document.getElementById('scratch-prompt-text'),
  scratchCanvasContainer: document.getElementById('scratch-canvas-container'),
  scratchCanvas: document.getElementById('scratch-canvas'),
  couponSecurityCode: document.getElementById('coupon-security-code'),
  ticketUsedStamp: document.getElementById('ticket-used-stamp'),
  ticketUsedTimestamp: document.getElementById('ticket-used-timestamp'),
  backToMenuBtn: document.getElementById('back-to-menu-btn'),

  // Admin & Attendant Elements
  adminBackBtn: document.getElementById('admin-back-btn'),
  statVegCount: document.getElementById('stat-veg-count'),
  statNonVegCount: document.getElementById('stat-nonveg-count'),
  statRevenueValue: document.getElementById('stat-revenue-value'),
  attendantSearchInput: document.getElementById('attendant-search-input'),
  attendantSearchBtn: document.getElementById('attendant-search-btn'),
  attendantLookupResult: document.getElementById('attendant-lookup-result'),
  ledgerSearch: document.getElementById('ledger-search'),
  ledgerTbody: document.getElementById('ledger-tbody'),

  // PWA Install Elements
  pwaInstallBanner: document.getElementById('pwa-install-banner'),
  pwaInstallBtn: document.getElementById('pwa-install-btn'),
  pwaCloseBtn: document.getElementById('pwa-close-btn')
};

// --- Initialization & Local Storage Sync ---
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadServerConfig().then(() => {
    initApp();
  });
  registerServiceWorker();
  setupNetworkListeners();
});

// Load public credentials from server on page load
async function loadServerConfig() {
  try {
    const res = await fetch('/api/config/load');
    if (res.ok) {
      const data = await res.json();
      state.googleClientId = data.google_client_id || '';
      state.razorpayKeyId = data.razorpay_key_id || 'rzp_test_zHsn7sN6rMvH5e';
      
      if (elements.devGoogleClientId) elements.devGoogleClientId.value = state.googleClientId;
      if (elements.devRazorpayKeyId) elements.devRazorpayKeyId.value = state.razorpayKeyId;
      if (elements.devRazorpayKeySecret) {
        if (data.has_razorpay_secret === 'yes') {
          elements.devRazorpayKeySecret.placeholder = '******** (Saved)';
        } else {
          elements.devRazorpayKeySecret.placeholder = 'Enter secret key';
        }
      }
    }
  } catch (err) {
    console.error('Failed to load server configurations:', err);
    showToast('Failed to connect to backend server configuration APIs.', 'error');
  }
}

function initApp() {
  // Read local DB cache
  const savedData = localStorage.getItem('gitam_canteen_db');
  if (savedData) {
    const db = JSON.parse(savedData);
    state.user = db.user || null;
    state.coupon = db.coupon || null;
  }

  const savedDay = localStorage.getItem('gitam_canteen_day_override');
  if (savedDay) {
    state.currentDayOverride = savedDay;
    if (elements.devDaySelect) elements.devDaySelect.value = savedDay;
  }

  // Clear any existing polling threads
  stopCouponPolling();

  // Update layout based on login status
  if (state.user) {
    showView('menu');
    elements.headerLogoutBtn.classList.remove('hidden');
    elements.adminPortalBtn.classList.remove('hidden');
    elements.userDisplayName.textContent = state.user.name;
    elements.userDisplayRoll.textContent = state.user.email;
    
    if (state.user.picture) {
      elements.userDisplayPic.src = state.user.picture;
      elements.userDisplayPic.classList.remove('hidden');
    } else {
      elements.userDisplayPic.classList.add('hidden');
    }

    updateDayRules();
    checkActiveCoupon();
    
    // Start active polling if coupon is active
    if (state.coupon && state.coupon.status !== 'USED') {
      startCouponPolling();
    }
  } else {
    showView('login');
    elements.headerLogoutBtn.classList.add('hidden');
    elements.adminPortalBtn.classList.add('hidden');
    
    initializeGoogleGSI();
  }
}

function saveDB() {
  const dbData = {
    user: state.user,
    coupon: state.coupon
  };
  localStorage.setItem('gitam_canteen_db', JSON.stringify(dbData));
}

// --- Google Identity Services Initialization ---
function initializeGoogleGSI() {
  if (!state.googleClientId) {
    elements.googleSigninBtnEl.innerHTML = `
      <div style="font-size:0.75rem; color:var(--text-secondary); border:1px dashed var(--surface-glass-border); padding:10px; border-radius:8px; text-align:center; line-height:1.3; background:rgba(0,0,0,0.15);">
        ⚠️ Google Sign-In is unconfigured.<br>Configure a <strong>Google Client ID</strong> in the Developer Panel (⚙) to enable official popup authentication.
      </div>
    `;
    return;
  }

  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initializeGoogleGSI, 500);
    return;
  }

  try {
    google.accounts.id.initialize({
      client_id: state.googleClientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton(
      elements.googleSigninBtnEl,
      { 
        type: 'standard',
        theme: 'filled_blue', 
        size: 'large', 
        text: 'signin_with',
        shape: 'pill',
        width: 280
      }
    );
  } catch (err) {
    console.error('Google GSI Init failed:', err);
    elements.googleSigninBtnEl.innerHTML = `
      <div style="color:var(--nonveg-color); font-size:0.75rem;">
        Failed to render Google Sign-In button.
      </div>
    `;
  }
}

// --- Google GSI Callback (Sends JWT to Backend) ---
async function handleGoogleCredentialResponse(response) {
  showToast('Verifying identity with Google server...', 'info');
  
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: response.credential })
    });

    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      saveDB();
      initApp();
      showToast(`Welcome, ${state.user.name}! Successfully signed in via Google.`, 'success');
    } else {
      const err = await res.json();
      showToast(err.message || 'Token verification failed.', 'error');
    }
  } catch (err) {
    console.error('Auth verification error:', err);
    showToast('Failed to reach authentication server.', 'error');
  }
}

// --- Navigation Controller ---
function showView(viewName) {
  Object.keys(views).forEach(key => {
    views[key].classList.remove('active');
  });

  if (viewName === 'checkout') {
    views.checkout.classList.remove('hidden');
  } else {
    views[viewName].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (viewName === 'menu') {
    deselectThalis();
    checkActiveCoupon();
    updateDayRules();
    loadAndRenderMenu();
  }

  if (viewName === 'coupon') {
    renderCouponTicket();
  }

  if (viewName === 'admin') {
    renderAdminDashboard();
  }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  if (elements.devToggleBtn) {
    elements.devToggleBtn.addEventListener('click', () => {
      elements.devConsole.classList.toggle('hidden');
    });
  }

  if (elements.devDaySelect) {
    elements.devDaySelect.addEventListener('change', (e) => {
      state.currentDayOverride = e.target.value;
      localStorage.setItem('gitam_canteen_day_override', e.target.value);
      updateDayRules();
      showToast(`Simulation day changed to ${elements.devDaySelect.options[elements.devDaySelect.selectedIndex].text}`, 'info');
    });
  }

  if (elements.devSaveKeysBtn) {
    elements.devSaveKeysBtn.addEventListener('click', async () => {
      const googleId = elements.devGoogleClientId.value.trim();
      const rzpId = elements.devRazorpayKeyId.value.trim();
      const rzpSecret = elements.devRazorpayKeySecret.value.trim();

      try {
        const res = await fetch('/api/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            google_client_id: googleId,
            razorpay_key_id: rzpId,
            razorpay_key_secret: rzpSecret
          })
        });

        if (res.ok) {
          showToast('API Configurations saved on server!', 'success');
          elements.devRazorpayKeySecret.value = ''; // clear password input field
          elements.devConsole.classList.add('hidden');
          await loadServerConfig();
          initApp(); // re-render login components
        } else {
          showToast('Failed to save keys on server.', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Connection failure to save API settings.', 'error');
      }
    });
  }

  if (elements.devResetBtn) {
    elements.devResetBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all server and local database tables? This logs you out.')) {
        // Clear local storage
        localStorage.clear();
        state.user = null;
        state.coupon = null;
        state.selectedThali = null;

        try {
          const res = await fetch('/api/config/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              google_client_id: '',
              razorpay_key_id: 'rzp_test_zHsn7sN6rMvH5e',
              razorpay_key_secret: ''
            })
          });
          if (res.ok) {
            showToast('Server and Client database tables cleared.', 'info');
          }
        } catch (err) {
          console.error(err);
        }
        
        if (elements.devGoogleClientId) elements.devGoogleClientId.value = '';
        if (elements.devRazorpayKeyId) elements.devRazorpayKeyId.value = 'rzp_test_zHsn7sN6rMvH5e';
        if (elements.devRazorpayKeySecret) elements.devRazorpayKeySecret.value = '';
        if (elements.devConsole) elements.devConsole.classList.add('hidden');
        
        await loadServerConfig();
        initApp();
      }
    });
  }

  elements.adminPortalBtn.addEventListener('click', () => {
    const code = prompt('Enter Admin/Attendant Passcode:');
    if (code === 'Gitam@2008') {
      showView('admin');
      showToast('Admin Authorization Granted', 'success');
    } else if (code !== null) {
      showToast('Access Denied: Invalid Passcode', 'error');
    }
  });

  elements.adminBackBtn.addEventListener('click', () => {
    showView('menu');
  });

  // Admin Thali Save handlers
  const saveVegBtn = document.getElementById('admin-veg-save-btn');
  if (saveVegBtn) {
    saveVegBtn.addEventListener('click', () => saveThaliConfig('veg'));
  }
  
  const saveNonVegBtn = document.getElementById('admin-nonveg-save-btn');
  if (saveNonVegBtn) {
    saveNonVegBtn.addEventListener('click', () => saveThaliConfig('nonveg'));
  }
  
  // Clear Ledger handler
  const clearLedgerBtn = document.getElementById('admin-clear-ledger-btn');
  if (clearLedgerBtn) {
    clearLedgerBtn.addEventListener('click', clearAllTransactionsAdmin);
  }

  elements.headerLogoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to sign out?')) {
      state.user = null;
      saveDB();
      initApp();
      showToast('Logged out successfully.', 'info');
    }
  });

  if (elements.loginStudentSelect) {
    elements.loginStudentSelect.addEventListener('change', (e) => {
      elements.customIdFields.classList.toggle('hidden', e.target.value !== 'Custom');
    });
  }

  // Bypass Login Action (registers on server db)
  if (elements.googleLoginBtn) {
    elements.googleLoginBtn.addEventListener('click', simulateGoogleLogin);
  }



  elements.orderProceedBtn.addEventListener('click', () => {
    if (state.selectedThali) {
      elements.checkoutItemName.textContent = state.selectedThali.type;
      elements.checkoutItemPrice.textContent = `₹${state.selectedThali.price}.00`;
      
      // Reset checkout tabs and inputs
      elements.payTabs.forEach(t => t.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));
      elements.payTabs[0].classList.add('active');
      elements.tabContents[0].classList.add('active');
      
      if (elements.cardPaymentForm) {
        elements.cardPaymentForm.reset();
      }

      showView('checkout');
    }
  });

  elements.checkoutCloseBtn.addEventListener('click', () => {
    views.checkout.classList.add('hidden');
    showView('menu');
  });

  // Tab switching
  elements.payTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.payTabs.forEach(t => t.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const target = tab.getAttribute('data-target');
      document.getElementById(target).classList.add('active');
    });
  });

  // UPI deep link & verify
  elements.launchUpiBtn.addEventListener('click', triggerMobileUPIApp);
  elements.verifyUpiBtn.addEventListener('click', verifyDirectUPITransfer);

  // Card Payment submit
  elements.cardPaymentForm.addEventListener('submit', handleCardPaymentSubmit);

  // Input Formatters
  elements.cardNum.addEventListener('input', formatCardNumber);
  elements.cardExpiry.addEventListener('input', formatExpiryDate);

  // Call Razorpay Order APIs
  elements.checkoutRzpPayBtn.addEventListener('click', createRazorpayOrder);

  elements.viewActiveCouponBtn.addEventListener('click', () => {
    if (state.coupon) showView('coupon');
  });

  elements.backToMenuBtn.addEventListener('click', () => {
    showView('menu');
  });

  elements.attendantSearchBtn.addEventListener('click', attendantLookupCoupon);
  elements.ledgerSearch.addEventListener('input', filterLedgerTable);

  elements.pwaInstallBtn.addEventListener('click', triggerPWAInstall);
  elements.pwaCloseBtn.addEventListener('click', () => {
    elements.pwaInstallBanner.classList.add('hidden');
  });
}

// --- Google Sign-in Bypass Flow (Saves to server) ---
async function simulateGoogleLogin() {
  const selectVal = elements.loginStudentSelect.value;
  let identity = {};

  if (selectVal === 'Custom') {
    const name = elements.customNameInput.value.trim();
    const roll = elements.customRollInput.value.trim();
    const email = elements.customEmailInput.value.trim();

    if (!name || !roll || !email) {
      showToast('Please fill out all custom fields.', 'warning');
      return;
    }
    identity = { name, email, picture: '' };
  } else {
    const selectedOption = elements.loginStudentSelect.options[elements.loginStudentSelect.selectedIndex];
    identity = {
      name: selectVal,
      email: selectedOption.getAttribute('data-email'),
      picture: ''
    };
  }

  const originalHtml = elements.googleLoginBtn.innerHTML;
  elements.googleLoginBtn.disabled = true;
  elements.googleLoginBtn.innerHTML = `
    <div style="margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 8px;">
      <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
      <span>Signing In...</span>
    </div>
  `;

  try {
    const res = await fetch('/api/auth/bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(identity)
    });

    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      saveDB();
      initApp();
      showToast(`Logged in bypass successfully! (Demo Mode)`, 'success');
    } else {
      showToast('Failed to register bypass details.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bypass auth server connection failure.', 'error');
  } finally {
    elements.googleLoginBtn.disabled = false;
    elements.googleLoginBtn.innerHTML = originalHtml;
  }
}

// --- Day-Based Rules & Menu Controller ---
function updateDayRules() {
  let dayOfWeek;
  if (state.currentDayOverride === 'auto') {
    dayOfWeek = new Date().getDay();
  } else {
    dayOfWeek = parseInt(state.currentDayOverride);
  }

  const daysText = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  elements.currentDayLabel.textContent = daysText[dayOfWeek];

  const isVegOnly = (dayOfWeek === 1 || dayOfWeek === 4 || dayOfWeek === 6);

  if (isVegOnly) {
    elements.currentDayDesc.innerHTML = `<strong>VEG-ONLY DAY</strong>. Non-veg option is disabled today.`;
    if (state.selectedThali && state.selectedThali.type === 'Non-Veg Thali') {
      deselectThalis();
    }
  } else {
    elements.currentDayDesc.innerHTML = `Veg and Non-Veg Thalis are both orderable today.`;
  }
}



function checkActiveCoupon() {
  elements.activeCouponAlert.classList.toggle('hidden', !state.coupon);
}

// --- Razorpay Payment Gateway Integration ---

// Step 1: Create Order on backend (price locking)
async function createRazorpayOrder() {
  if (!state.selectedThali) return;

  if (typeof Razorpay === 'undefined') {
    showToast('Razorpay Checkout SDK failed to load. Check network.', 'error');
    return;
  }

  showToast('Initializing payment gateway...', 'info');

  try {
    const res = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thali_type: state.selectedThali.type })
    });

    if (res.ok) {
      const data = await res.json();
      launchRazorpayCheckout(data.order_id, data.is_mock);
    } else {
      const err = await res.json();
      showToast(err.message || 'Order creation failed.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Payment gateway connection error.', 'error');
  }
}

// Step 2: Open Razorpay modal overlay using Order ID
function launchRazorpayCheckout(orderId, isMock) {
  const options = {
    key: state.razorpayKeyId,
    amount: state.selectedThali.price * 100, // in paise
    currency: 'INR',
    name: 'GITAM Canteen',
    description: `${state.selectedThali.type} Voucher`,
    image: 'canteen_logo.jpg',
    order_id: isMock ? null : orderId, // If mock order, bypass order_id to trigger sandbox overlay client-side
    prefill: {
      name: state.user.name,
      email: state.user.email,
      contact: '9999999999'
    },
    theme: {
      color: '#4f46e5'
    },
    handler: function (response) {
      // Payment authorized by client -> trigger backend verification
      verifyPaymentSignature(orderId, response.razorpay_payment_id || `mock_pay_${Date.now()}`, response.razorpay_signature || 'mock_sig');
    },
    modal: {
      ondismiss: function () {
        showToast('Transaction cancelled by student.', 'warning');
      }
    }
  };

  try {
    const rzp = new Razorpay(options);
    rzp.open();
  } catch (err) {
    console.error('Razorpay Modal error:', err);
    showToast('Failed to open payment gateway overlay.', 'error');
  }
}

// Step 3: Call backend /api/payment/verify to compute signature
async function verifyPaymentSignature(orderId, paymentId, signature) {
  // Show full screen processing loader
  elements.paymentProcessingLoader.classList.remove('hidden');
  elements.loaderProgress.style.width = '0%';

  let progress = 0;
  const intervalTime = 30;
  const progressStep = 4;

  const progressInterval = setInterval(async () => {
    progress += progressStep;
    if (progress > 100) progress = 100;
    elements.loaderProgress.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(progressInterval);
      
      try {
        const res = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            payment_id: paymentId,
            signature: signature,
            thali_type: state.selectedThali.type,
            student_email: state.user.email,
            student_name: state.user.name
          })
        });

        if (res.ok) {
          const data = await res.json();
          elements.paymentSuccessOverlay.classList.remove('hidden');
          
          setTimeout(() => {
            state.coupon = data.coupon;
            saveDB();

            elements.paymentProcessingLoader.classList.add('hidden');
            elements.paymentSuccessOverlay.classList.add('hidden');
            elements.checkout.classList.add('hidden');
            
            showView('coupon');
            showToast('Payment settled securely! Token issued.', 'success');
            
            // Start background polling to check if attendant redeems it remotely
            startCouponPolling();
          }, 1200);
        } else {
          const err = await res.json();
          elements.paymentProcessingLoader.classList.add('hidden');
          showToast(err.message || 'Signature validation failed. Tampering suspected.', 'error');
        }
      } catch (err) {
        console.error(err);
        elements.paymentProcessingLoader.classList.add('hidden');
        showToast('Payment verification connection timeout.', 'error');
      }
    }
  }, intervalTime);
}

// --- Active Coupon Polling (Syncs redemption states) ---
function startCouponPolling() {
  if (couponPollInterval) clearInterval(couponPollInterval);
  if (!state.coupon || state.coupon.status === 'USED') return;

  couponPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/coupon/status?id=${encodeURIComponent(state.coupon.id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.coupon_status === 'USED') {
          // Attendant marked coupon as used on their own screen
          stopCouponPolling();
          
          state.coupon.status = 'USED';
          state.coupon.scratchedAt = data.redeemed_at;
          saveDB();
          
          // Instantly update Student Screen PWA
          setCouponAsUsedUI(data.redeemed_at);
          showToast('Coupon has been successfully Redeemed by attendant.', 'success');
        }
      }
    } catch (err) {
      console.log('Polling server status error (Running offline?):', err);
    }
  }, 5000); // Check status every 5 seconds
}

function stopCouponPolling() {
  if (couponPollInterval) {
    clearInterval(couponPollInterval);
    couponPollInterval = null;
  }
}

// --- Digital Scratch Coupon Verification (Local swipe) ---
function renderCouponTicket() {
  if (!state.coupon) {
    showView('menu');
    return;
  }

  elements.ticketThaliType.textContent = state.coupon.type.toUpperCase() + ' COUPON';
  elements.ticketRefNumber.textContent = `REF: ${state.coupon.id}`;
  elements.ticketStudentName.textContent = state.user.name;
  elements.ticketStudentRoll.textContent = state.user.email;
  elements.ticketPurchaseTime.textContent = state.coupon.purchasedAt;
  elements.ticketAmount.textContent = `₹${state.coupon.price}.00`;
  elements.couponSecurityCode.textContent = `VERIFIED: ${state.coupon.code}`;

  elements.ticketHeaderBg.className = state.coupon.type === 'Veg Thali' 
    ? 'ticket-header-gradient veg-ticket' 
    : 'ticket-header-gradient nonveg-ticket';

  if (state.coupon.status === 'USED') {
    setCouponAsUsedUI(state.coupon.scratchedAt);
  } else {
    elements.ticketStatusPill.className = 'ticket-status-pill status-active';
    elements.ticketStatusPill.textContent = 'ACTIVE - READY';
    elements.scratchPromptText.classList.remove('hidden');
    elements.ticketUsedStamp.classList.add('hidden');
    elements.scratchCanvas.classList.remove('hidden');
    
    initScratchCanvas();
    startCouponPolling(); // Enable polling to sync remote redeems
  }
}

function initScratchCanvas() {
  const canvas = elements.scratchCanvas;
  const container = elements.scratchCanvasContainer;
  const ctx = canvas.getContext('2d');
  
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Silver paint coat
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Noise texture
  ctx.fillStyle = '#64748b';
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
  }

  ctx.font = 'bold 11px Outfit, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ATTENDANT SCRATCH', canvas.width / 2, canvas.height / 2 - 8);
  ctx.font = '500 9px Outfit, sans-serif';
  ctx.fillText('TO REDEEM LUNCH', canvas.width / 2, canvas.height / 2 + 10);

  let isDrawing = false;
  const brushRadius = 16;

  const getEventCoords = (e) => {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const canvasRect = canvas.getBoundingClientRect();
    return { x: clientX - canvasRect.left, y: clientY - canvasRect.top };
  };

  const startScratching = (e) => {
    isDrawing = true;
    scratch(e);
  };

  const stopScratching = () => {
    isDrawing = false;
    ctx.beginPath();
    checkScratchPercentage();
  };

  const scratch = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getEventCoords(e);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = brushRadius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  canvas.addEventListener('mousedown', startScratching);
  canvas.addEventListener('mousemove', scratch);
  canvas.addEventListener('mouseup', stopScratching);
  canvas.addEventListener('mouseleave', stopScratching);

  canvas.addEventListener('touchstart', startScratching, { passive: false });
  canvas.addEventListener('touchmove', scratch, { passive: false });
  canvas.addEventListener('touchend', stopScratching, { passive: false });

  function checkScratchPercentage() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparentCount = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparentCount++;
    }

    const scratchRatio = transparentCount / (canvas.width * canvas.height);

    if (scratchRatio > 0.5) {
      redeemCouponLocal();
    }
  }

  // Local swipe redemption (Calls backend redeem API)
  async function redeemCouponLocal() {
    isDrawing = false;
    canvas.replaceWith(canvas.cloneNode(true));
    stopCouponPolling();

    try {
      const res = await fetch('/api/attendant/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.coupon.id })
      });

      if (res.ok) {
        const data = await res.json();
        state.coupon.status = 'USED';
        state.coupon.scratchedAt = data.redeemed_at;
        saveDB();
        setCouponAsUsedUI(data.redeemed_at);
        showToast('Meal successfully redeemed and logged!', 'success');
      } else {
        showToast('Failed to redeem voucher on server database.', 'error');
      }
    } catch (err) {
      console.error(err);
      // Fallback offline redemption local save
      const localTime = formatDate(new Date());
      state.coupon.status = 'USED';
      state.coupon.scratchedAt = localTime;
      saveDB();
      setCouponAsUsedUI(localTime);
      showToast('Offline redemption saved locally.', 'warning');
    }
  }
}

function setCouponAsUsedUI(timestamp) {
  elements.ticketStatusPill.className = 'ticket-status-pill status-used';
  elements.ticketStatusPill.textContent = 'REDEEMED - MEAL DISPENSED';
  elements.scratchPromptText.classList.add('hidden');
  elements.scratchCanvas.classList.add('hidden');
  elements.ticketUsedTimestamp.textContent = timestamp.toUpperCase();
  elements.ticketUsedStamp.classList.remove('hidden');

  if ('vibrate' in navigator) {
    navigator.vibrate([100, 50, 100]);
  }
}

// --- Admin & Attendant Dashboard Logic ---
async function renderAdminDashboard() {
  try {
    // 1. Fetch counts
    const statsRes = await fetch('/api/admin/stats');
    if (statsRes.ok) {
      const stats = await statsRes.json();
      elements.statVegCount.textContent = stats.veg_count;
      elements.statNonVegCount.textContent = stats.nonveg_count;
      elements.statRevenueValue.textContent = `₹${stats.revenue}.00`;
    }

    // 2. Fetch Ledger rows
    const ledgerRes = await fetch('/api/admin/ledger');
    if (ledgerRes.ok) {
      const ledger = await ledgerRes.json();
      renderLedgerTable(ledger);
    }
  } catch (err) {
    console.error('Failed to load admin stats:', err);
    showToast('Failed to fetch dashboard metrics from server.', 'error');
  }

  elements.attendantSearchInput.value = '';
  elements.attendantLookupResult.classList.add('hidden');
  elements.ledgerSearch.value = '';
  populateAdminThaliInputs();
}

function renderLedgerTable(records) {
  const tbody = elements.ledgerTbody;
  tbody.innerHTML = '';

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No transactions recorded on this terminal database yet.</td>
      </tr>
    `;
    return;
  }

  records.forEach(item => {
    const tr = document.createElement('tr');
    const badgeClass = item.status === 'Paid' ? 'badge-paid' : 'badge-redeemed';
    const statusText = item.status === 'Paid' ? 'ACTIVE' : 'REDEEMED';

    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${item.studentName}</div>
        <div style="font-size:0.7rem; color:var(--text-secondary);">${item.studentRoll}</div>
      </td>
      <td>${item.type}</td>
      <td style="font-weight:600;">₹${item.price}.00</td>
      <td><code>${item.id}</code></td>
      <td style="font-size:0.7rem;">${item.date}</td>
      <td><span class="${badgeClass}">${statusText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

async function filterLedgerTable(e) {
  const query = e.target.value.toLowerCase().trim();
  try {
    const res = await fetch('/api/admin/ledger');
    if (res.ok) {
      const records = await res.json();
      if (!query) {
        renderLedgerTable(records);
        return;
      }
      const filtered = records.filter(item => 
        item.studentName.toLowerCase().includes(query) ||
        item.studentRoll.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
      );
      renderLedgerTable(filtered);
    }
  } catch (err) {
    console.error(err);
  }
}

// Search student records by email or reference id
async function attendantLookupCoupon() {
  const query = elements.attendantSearchInput.value.trim();
  
  if (!query) {
    showToast('Please enter an Email or Coupon Ref ID.', 'warning');
    return;
  }

  const box = elements.attendantLookupResult;
  box.classList.remove('hidden');
  box.innerHTML = `<div class="spinner" style="width:24px; height:24px; margin: 0 auto;"></div>`;

  try {
    const res = await fetch(`/api/attendant/lookup?query=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      const item = data.record;

      const badge = item.status === 'Paid' 
        ? '<span class="badge-paid">ACTIVE</span>' 
        : '<span class="badge-redeemed">REDEEMED</span>';

      let actionButton = '';
      if (item.status === 'Paid') {
        actionButton = `
          <button id="lookup-redeem-btn" class="btn btn-primary btn-block btn-sm" style="margin-top:12px; background:var(--veg-color); box-shadow:none;">
            Mark Meal as Redeemed (Dispense)
          </button>
        `;
      }

      box.innerHTML = `
        <div class="lookup-title">
          <h4>Student Token Found</h4>
          ${badge}
        </div>
        <div class="lookup-details">
          <div class="lookup-detail-row"><span>Student Name:</span><strong>${item.studentName}</strong></div>
          <div class="lookup-detail-row"><span>Student Email:</span><strong>${item.studentRoll}</strong></div>
          <div class="lookup-detail-row"><span>Purchased Meal:</span><strong>${item.type} (₹${item.price})</strong></div>
          <div class="lookup-detail-row"><span>Reference ID:</span><strong>${item.id}</strong></div>
          <div class="lookup-detail-row"><span>Purchased At:</span><strong>${item.date}</strong></div>
          ${item.redeemedAt ? `<div class="lookup-detail-row"><span>Redeemed At:</span><strong style="color:var(--warning);">${item.redeemedAt}</strong></div>` : ''}
        </div>
        ${actionButton}
      `;

      if (item.status === 'Paid') {
        document.getElementById('lookup-redeem-btn').addEventListener('click', async () => {
          try {
            const redeemRes = await fetch('/api/attendant/redeem', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id })
            });

            if (redeemRes.ok) {
              showToast('Transaction redeemed successfully!', 'success');
              renderAdminDashboard();
            } else {
              showToast('Redemption transaction rejected by server database.', 'error');
            }
          } catch (err) {
            console.error(err);
            showToast('Connection error to redeem coupon.', 'error');
          }
        });
      }
    } else {
      box.innerHTML = `
        <div style="color:var(--nonveg-color); font-weight:700; text-align:center;">
          ✖ Record Not Found
        </div>
        <p style="font-size:0.75rem; text-align:center; color:var(--text-secondary); margin-top:4px;">No active transactions match "${query}" on the database.</p>
      `;
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to reach lookup server.', 'error');
  }
}

// --- Floating Toast System ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✖';
  if (type === 'warning') icon = '⚠';
  if (type === 'info') icon = 'ℹ';

  toast.innerHTML = `
    <span class="toast-icon" style="font-weight:bold; font-size:1.1rem;">${icon}</span>
    <span>${message}</span>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Connection / Network Status Detectors ---
function setupNetworkListeners() {
  window.addEventListener('online', () => {
    showToast('Internet connection restored. App is online.', 'success');
    document.querySelectorAll('.pwa-status-badge').forEach(badge => {
      badge.textContent = 'PWA Online';
      badge.style.background = 'rgba(34, 197, 94, 0.15)';
      badge.style.color = '#a7f3d0';
      badge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    });
  });

  window.addEventListener('offline', () => {
    showToast('Network connection lost. Running in offline cache mode.', 'warning');
    document.querySelectorAll('.pwa-status-badge').forEach(badge => {
      badge.textContent = 'Offline Cache';
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#fde68a';
      badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    });
  });
}

// --- Utility Helpers ---
function formatDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getDate().toString().padStart(2, '0');
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  let hr = date.getHours();
  const min = date.getMinutes().toString().padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12;
  hr = hr ? hr : 12;
  return `${d}-${m}-${y} ${hr.toString().padStart(2, '0')}:${min} ${ampm}`;
}

// --- Progressive Web App Installation ---
let deferredPrompt;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('PWA Service Worker running'))
      .catch(err => console.error('PWA Registration failed', err));
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  elements.pwaInstallBanner.classList.remove('hidden');
});

async function triggerPWAInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA Installation Result: ${outcome}`);
    deferredPrompt = null;
    elements.pwaInstallBanner.classList.add('hidden');
    showToast('PWA added to your home screen!', 'success');
  }
}

// --- Payment Method Handlers ---
function triggerMobileUPIApp() {
  if (!state.selectedThali) return;
  
  const payeeAddress = 'gitamfinance@okaxis'; 
  const payeeName = 'GITAM Canteen Finance';
  const transactionId = `TXN${Date.now()}`;
  const amount = state.selectedThali.price;
  const transactionNote = `${state.selectedThali.type} Token for ${state.user.name}`;

  const upiLink = `upi://pay?pa=${payeeAddress}&pn=${encodeURIComponent(payeeName)}&tr=${transactionId}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  
  console.log("Deep link UPI URL:", upiLink);
  showToast("Launching UPI App...", "info");
  
  window.location.href = upiLink;
}

async function verifyDirectUPITransfer() {
  if (!state.selectedThali) return;
  const mockTxnId = `UPI-${Math.floor(100000 + Math.random() * 900000)}`;
  showToast("Verifying transfer with database...", "info");
  await verifyPaymentSignature(`order_mock_upi`, mockTxnId, 'mock_upi_signature');
}

async function handleCardPaymentSubmit(e) {
  e.preventDefault();
  if (!state.selectedThali) return;
  const mockCardId = `CRD-${Math.floor(100000 + Math.random() * 900000)}`;
  showToast("Authorizing card payment...", "info");
  await verifyPaymentSignature(`order_mock_card`, mockCardId, 'mock_card_signature');
}

function formatCardNumber(e) {
  let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  let formatted = '';
  for (let i = 0; i < value.length; i++) {
    if (i > 0 && i % 4 === 0) formatted += ' ';
    formatted += value[i];
  }
  e.target.value = formatted;
}

function formatExpiryDate(e) {
  let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  if (value.length >= 2) {
    e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
  } else {
    e.target.value = value;
  }
}

// --- Dynamic Menu Loading & Rendering ---
async function loadAndRenderMenu() {
  const container = document.getElementById('menu-grid-el');
  if (!container) return;
  
  try {
    const res = await fetch('/api/menu/load');
    if (!res.ok) throw new Error("Could not load menu options.");
    const menuItems = await res.json();
    
    container.innerHTML = '';
    
    if (menuItems.length === 0) {
      container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-secondary);">No lunch options configured in the system.</div>`;
      return;
    }
    
    let dayOfWeek = (state.currentDayOverride === 'auto') ? new Date().getDay() : parseInt(state.currentDayOverride);
    const isVegOnlyDay = (dayOfWeek === 1 || dayOfWeek === 4 || dayOfWeek === 6);
    
    menuItems.forEach(item => {
      let isAvailable = item.is_available;
      if (item.id === 'nonveg' && isVegOnlyDay) {
        isAvailable = false;
      }
      
      const card = document.createElement('div');
      card.className = `menu-card ${!isAvailable ? 'disabled' : ''}`;
      card.id = `card-${item.id}`;
      card.setAttribute('data-price', item.price);
      card.setAttribute('data-type', item.name);
      
      const imgPath = item.id === 'veg' ? 'veg_thali.jpg' : 'nonveg_thali.jpg';
      const badgeText = item.id === 'veg' ? '100% VEG' : 'NON-VEG';
      const badgeClass = item.id === 'veg' ? 'veg-badge' : 'nonveg-badge';
      const fallbackClass = item.id === 'veg' ? 'card-veg-fallback' : 'card-nonveg-fallback';
      
      const bullets = item.id === 'veg' 
        ? `<li>Fresh & Hygiene Assured</li><li>Unlimited Rice Refill</li>`
        : `<li>High-Quality Protein</li><li>Authentic Odia Style Curry</li>`;
        
      card.innerHTML = `
        <div class="card-image-fallback ${fallbackClass}">
          <img src="${imgPath}" alt="${item.name}">
          <div class="${badgeClass}">${badgeText}</div>
          ${!isAvailable ? `<div id="disabled-overlay-badge" class="disabled-badge">Disabled Today</div>` : ''}
        </div>
        <div class="card-details">
          <div class="card-title-row">
            <h4>${item.name}</h4>
            <span class="price-tag">₹${item.price}</span>
          </div>
          <p class="card-desc">${item.description}</p>
          <ul class="card-bullets">
            ${bullets}
          </ul>
        </div>
        <div class="select-indicator"></div>
      `;
      
      if (isAvailable) {
        card.addEventListener('click', () => selectThaliDynamic(item.id, item.name, item.price));
      }
      
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--nonveg-color); font-weight:600;">✖ Failed to load menu options from server.</div>`;
  }
}

function selectThaliDynamic(id, name, price) {
  const vegCard = document.getElementById('card-veg');
  const nonvegCard = document.getElementById('card-nonveg');
  
  if (id === 'veg') {
    if (vegCard) vegCard.classList.add('selected');
    if (nonvegCard) nonvegCard.classList.remove('selected');
  } else {
    if (nonvegCard) nonvegCard.classList.add('selected');
    if (vegCard) vegCard.classList.remove('selected');
  }
  
  state.selectedThali = { type: name, price: price };
  
  elements.summaryItemName.textContent = name;
  elements.summaryItemPrice.textContent = `₹${price}`;
  elements.menuActionBar.classList.remove('hidden');
}

function deselectThalis() {
  const vegCard = document.getElementById('card-veg');
  const nonvegCard = document.getElementById('card-nonveg');
  if (vegCard) vegCard.classList.remove('selected');
  if (nonvegCard) nonvegCard.classList.remove('selected');
  elements.menuActionBar.classList.add('hidden');
  state.selectedThali = null;
}

// Load current DB thali values to Admin input fields
async function populateAdminThaliInputs() {
  try {
    const res = await fetch('/api/menu/load');
    if (res.ok) {
      const menuItems = await res.json();
      menuItems.forEach(item => {
        const priceInput = document.getElementById(`admin-${item.id}-price`);
        const statusInput = document.getElementById(`admin-${item.id}-status`);
        if (priceInput) priceInput.value = item.price;
        if (statusInput) statusInput.checked = item.is_available;
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// Save Thali updates to backend
async function saveThaliConfig(id) {
  const priceInput = document.getElementById(`admin-${id}-price`);
  const statusInput = document.getElementById(`admin-${id}-status`);
  if (!priceInput || !statusInput) return;
  
  const payload = {
    id: id,
    price: parseInt(priceInput.value),
    is_available: statusInput.checked
  };
  
  try {
    const res = await fetch('/api/admin/menu/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showToast(`${id === 'veg' ? 'Veg' : 'Non-Veg'} Thali configuration saved!`, 'success');
      loadAndRenderMenu(); // Re-render thalis on main screen
    } else {
      showToast('Failed to update thali on server.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Connection error updating thali settings.', 'error');
  }
}

// Clear all database records
async function clearAllTransactionsAdmin() {
  if (!confirm('🚨 WARNING: Are you sure you want to permanently clear all transactions, coupons, and orders from the database? This cannot be undone.')) {
    return;
  }
  
  try {
    const res = await fetch('/api/admin/clear-ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'Gitam@2008' })
    });
    
    if (res.ok) {
      showToast('All transaction records cleared successfully!', 'success');
      state.coupon = null;
      saveDB();
      checkActiveCoupon();
      renderAdminDashboard(); // Refresh metrics
    } else {
      showToast('Ledger clearing was rejected by server.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to connect to system maintenance API.', 'error');
  }
}
