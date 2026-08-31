/**
 * HAVIT PRO — Master Application Controller
 * Features: Strict Auth Gate (Name+Real Verified Email OTP+16+ char pass), 10-Minute Session Expiry, Executive Professional Report & Activity Center
 */

class HavitSpreadsheetApp {
  constructor() {
    this.currentView = 'sheet';
    this.currentDate = new Date();
    this.currentYear = this.currentDate.getFullYear();
    this.currentMonth = this.currentDate.getMonth(); // 0-indexed

    // Popover state for numeric habits
    this.activePopoverHabit = null;
    this.activePopoverDateStr = null;

    // Focus Timer State
    this.timerInterval = null;
    this.timerSecondsLeft = 25 * 60;
    this.timerRunning = false;

    // Alarm Trigger State
    this.lastAlarmCheckedMinute = '';

    // Resend OTP Cooldown Timer
    this.resendInterval = null;
    this.resendSecondsLeft = 0;

    // 10-Minute Session Expiry Ticker
    this.sessionTickerInterval = null;

    this.init();
  }

  init() {
    AnalyticsCharts.applyChartDefaults();

    this.applyTheme(HabitData.settings.theme || 'midnight');
    this.setupEventListeners();
    this.setupLiveClock();

    // Check strict Authentication Gate
    this.checkAuthGate();

    if (HabitData.isAuthenticated()) {
      this.onAuthenticatedLaunch();
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // --- Strict Authentication Gate & 10-Minute Session Expiry Engine ---

  checkAuthGate() {
    const authGate = document.getElementById('authGateScreen');
    const mainApp = document.getElementById('mainAppContainer');

    if (!HabitData.isAuthenticated()) {
      if (authGate) authGate.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';
      if (this.sessionTickerInterval) {
        clearInterval(this.sessionTickerInterval);
        this.sessionTickerInterval = null;
      }
    } else {
      if (authGate) authGate.style.display = 'none';
      if (mainApp) mainApp.style.display = 'flex';
      this.startSessionExpiryTicker();
    }
  }

  startSessionExpiryTicker() {
    if (this.sessionTickerInterval) clearInterval(this.sessionTickerInterval);

    const updateSessionDisplay = () => {
      const remainingSecs = HabitData.getSessionRemainingSeconds();
      const timerDisplay = document.getElementById('sessionTimerDisplay');

      if (remainingSecs <= 0) {
        clearInterval(this.sessionTickerInterval);
        this.sessionTickerInterval = null;
        HabitData.signOut();
        this.checkAuthGate();
        this.showToast('⚠️ Session expired after 10 minutes. Please sign in again.', 'error');
        return;
      }

      const m = Math.floor(remainingSecs / 60);
      const s = remainingSecs % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    };

    updateSessionDisplay();
    this.sessionTickerInterval = setInterval(updateSessionDisplay, 1000);
  }

  onAuthenticatedLaunch() {
    if (HabitData.settings.locationMode === 'manual' && HabitData.user.city) {
      this.fetchWeatherForManualCity(HabitData.user.city);
    } else {
      this.autoDetectLocationAndWeather();
    }

    this.updateUserProfileDisplay();
    this.renderCurrentMonthSheet();
    this.startAlarmChecker();
    this.startSessionExpiryTicker();
  }

  // --- Location & Weather Engine: GPS vs Manual City Geocoding ---

  async autoDetectLocationAndWeather() {
    const weatherText = document.getElementById('weatherText');
    if (weatherText) weatherText.textContent = 'Detecting GPS/IP Weather...';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          await this.fetchLiveWeatherFromCoordinates(lat, lon, 'GPS Location');
        },
        async () => {
          await this.fetchLocationByIp();
        },
        { timeout: 7000 }
      );
    } else {
      await this.fetchLocationByIp();
    }
  }

  async fetchLocationByIp() {
    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data && data.success) {
        const city = data.city || '';
        const country = data.country || '';
        const locStr = `${city}${city && country ? ', ' : ''}${country}`;
        const lat = data.latitude;
        const lon = data.longitude;
        await this.fetchLiveWeatherFromCoordinates(lat, lon, locStr);
      } else {
        const res2 = await fetch('https://ipapi.co/json/');
        const data2 = await res2.json();
        const locStr = `${data2.city || 'Detected City'}, ${data2.country_name || 'World'}`;
        await this.fetchLiveWeatherFromCoordinates(data2.latitude, data2.longitude, locStr);
      }
    } catch (e) {
      this.applyWeather('28°C', 'Sunny', '☀️', HabitData.user.location || 'Local Terminal');
    }
  }

  async fetchWeatherForManualCity(cityName) {
    if (!cityName) return;
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (geoData && geoData.results && geoData.results.length > 0) {
        const place = geoData.results[0];
        const lat = place.latitude;
        const lon = place.longitude;
        const locLabel = `${place.name}, ${place.country || ''}`;
        await this.fetchLiveWeatherFromCoordinates(lat, lon, locLabel);
      } else {
        this.applyWeather(HabitData.user.weatherTemp || '28°C', HabitData.user.weatherCond || 'Sunny', '☀️', cityName);
      }
    } catch (e) {
      this.applyWeather('28°C', 'Clear Sky', '☀️', cityName);
    }
  }

  async fetchLiveWeatherFromCoordinates(lat, lon, locationLabel) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.current_weather) {
        const temp = Math.round(data.current_weather.temperature);
        const wCode = data.current_weather.weathercode;
        const { cond, emoji } = this.mapWeatherCode(wCode);
        const tempStr = `${temp}°C`;

        this.applyWeather(tempStr, cond, emoji, locationLabel);
      }
    } catch (e) {
      this.applyWeather('28°C', 'Clear', '☀️', locationLabel);
    }
  }

  mapWeatherCode(code) {
    if (code === 0) return { cond: 'Clear Sky', emoji: '☀️' };
    if (code >= 1 && code <= 3) return { cond: 'Partly Cloudy', emoji: '⛅' };
    if (code >= 45 && code <= 48) return { cond: 'Foggy', emoji: '🌫️' };
    if (code >= 51 && code <= 67) return { cond: 'Rain Shower', emoji: '🌧️' };
    if (code >= 71 && code <= 77) return { cond: 'Snow', emoji: '❄️' };
    if (code >= 80 && code <= 82) return { cond: 'Heavy Rain', emoji: '🌧️' };
    if (code >= 95) return { cond: 'Thunderstorm', emoji: '⚡' };
    return { cond: 'Sunny', emoji: '☀️' };
  }

  applyWeather(tempStr, condStr, emojiStr, locationStr) {
    HabitData.user.weatherTemp = tempStr;
    HabitData.user.weatherCond = condStr;
    HabitData.user.weatherEmoji = emojiStr;
    if (locationStr) HabitData.user.location = locationStr;
    HabitData.saveUser();

    this.updateUserProfileDisplay();
  }

  // --- Theme Management ---

  applyTheme(themeName) {
    document.body.className = `theme-${themeName}`;
    HabitData.settings.theme = themeName;
    HabitData.saveSettings();

    document.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === themeName);
    });

    if (window.AnalyticsCharts && AnalyticsCharts.donutToday) {
      this.renderCurrentMonthSheet();
    }
  }

  // --- User Profile Display ---

  updateUserProfileDisplay() {
    const user = HabitData.user;
    const nameEl = document.getElementById('userActivityName');
    const locEl = document.getElementById('userActivityLocation');
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherText = document.getElementById('weatherText');

    if (nameEl) nameEl.textContent = user.name || 'Champion';
    if (locEl) locEl.textContent = user.location || 'Local Terminal';
    if (weatherIcon && user.weatherEmoji) weatherIcon.textContent = user.weatherEmoji;
    if (weatherText) weatherText.textContent = `${user.weatherTemp || '28°C'} ${user.weatherCond || 'Sunny'}`;

    // Settings Profile Form
    const inputName = document.getElementById('profileUserName');
    const inputEmail = document.getElementById('profileUserEmail');
    const inputLoc = document.getElementById('profileUserLocation');
    const inputTemp = document.getElementById('profileWeatherTemp');
    const inputCond = document.getElementById('profileWeatherCond');

    if (inputName) inputName.value = user.name || 'Champion';
    if (inputEmail) inputEmail.value = user.email || '';
    if (inputLoc) inputLoc.value = user.location || '';
    if (inputTemp) inputTemp.value = user.weatherTemp || '28°C';
    if (inputCond) inputCond.value = user.weatherCond || 'Sunny';
  }

  // --- Live Clock ---

  setupLiveClock() {
    const clockEl = document.getElementById('liveClockDisplay');
    const dateEl = document.getElementById('liveDateDisplay');
    
    const update = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
      }
    };
    update();
    setInterval(update, 1000);
  }

  // --- Live Alarm Checker Engine ---

  startAlarmChecker() {
    setInterval(() => {
      const now = new Date();
      const curHours = String(now.getHours()).padStart(2, '0');
      const curMins = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${curHours}:${curMins}`;

      if (timeStr === this.lastAlarmCheckedMinute) return;

      const alarms = HabitData.settings.alarms || [];
      const triggered = alarms.find(a => a.enabled && a.time === timeStr);

      if (triggered) {
        this.lastAlarmCheckedMinute = timeStr;
        this.triggerAlarmAlert(triggered);
      }
    }, 1000);
  }

  triggerAlarmAlert(alarm) {
    soundEngine.playAlarmTone();

    const banner = document.getElementById('alarmAlertBanner');
    const text = document.getElementById('alarmAlertText');
    if (banner && text) {
      text.textContent = `${alarm.name} (${alarm.time}) — Time to take action!`;
      banner.classList.add('active');
    }

    this.showToast(`⏰ ALARM: ${alarm.name} (${alarm.time})!`, 'error');

    document.getElementById('dismissAlarmBtn')?.addEventListener('click', () => {
      banner?.classList.remove('active');
    }, { once: true });
  }

  // --- Event Listeners Setup ---

  setupEventListeners() {
    // Month Steppers
    document.getElementById('sheetPrevMonthBtn')?.addEventListener('click', () => {
      this.currentMonth--;
      if (this.currentMonth < 0) {
        this.currentMonth = 11;
        this.currentYear--;
      }
      this.renderCurrentMonthSheet();
    });

    document.getElementById('sheetNextMonthBtn')?.addEventListener('click', () => {
      this.currentMonth++;
      if (this.currentMonth > 11) {
        this.currentMonth = 0;
        this.currentYear++;
      }
      this.renderCurrentMonthSheet();
    });

    document.getElementById('sheetCurrentMonthBtn')?.addEventListener('click', () => {
      const now = new Date();
      this.currentYear = now.getFullYear();
      this.currentMonth = now.getMonth();
      this.renderCurrentMonthSheet();
    });

    // View Mode Tabs
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchView(btn.dataset.view);
      });
    });

    // Weather widget click -> refresh
    document.getElementById('weatherWidget')?.addEventListener('click', () => {
      this.showToast('Refreshing live GPS/IP weather...');
      this.autoDetectLocationAndWeather();
    });

    // Use GPS button in Settings
    document.getElementById('settingsUseGpsBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      HabitData.settings.locationMode = 'gps';
      HabitData.saveSettings();
      this.showToast('Detecting live GPS location & weather...');
      this.autoDetectLocationAndWeather();
    });

    // --- AUTH GATE CONTROLS ---
    document.getElementById('gateSwitchToSignUp')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('gateSignInCard').style.display = 'none';
      document.getElementById('gateSignUpCard').style.display = 'block';
      document.getElementById('gateVerifyCard').style.display = 'none';
    });

    document.getElementById('gateSwitchToSignIn')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('gateSignInCard').style.display = 'block';
      document.getElementById('gateSignUpCard').style.display = 'none';
      document.getElementById('gateVerifyCard').style.display = 'none';
    });

    document.getElementById('gateCancelVerifyBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('gateSignInCard').style.display = 'block';
      document.getElementById('gateSignUpCard').style.display = 'none';
      document.getElementById('gateVerifyCard').style.display = 'none';
    });

    // 16-Character Password Realtime Verification Meter (Sign Up)
    const gateSignUpPass = document.getElementById('gateSignUpPassword');
    const gatePassCounter = document.getElementById('gatePassCounter');
    const gatePassBar = document.getElementById('gatePassBar');

    if (gateSignUpPass && gatePassCounter && gatePassBar) {
      gateSignUpPass.addEventListener('input', () => {
        const len = gateSignUpPass.value.length;
        gatePassCounter.textContent = `${len} / 16 chars ${len >= 16 ? '✓ (Secure)' : '(Must be 16+ chars)'}`;
        const pct = Math.min(100, Math.round((len / 16) * 100));
        gatePassBar.style.width = `${pct}%`;
        gatePassBar.style.background = len >= 16 ? 'var(--emerald)' : (len >= 10 ? 'var(--amber)' : 'var(--rose)');
      });
    }

    // Sign In Form Submit
    document.getElementById('gateSignInForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('gateSignInName').value.trim();
      const email = document.getElementById('gateSignInEmail').value.trim();
      const password = document.getElementById('gateSignInPassword').value;

      const res = HabitData.signIn(name, email, password);
      if (res.success) {
        this.showToast(`Access Granted. Welcome, ${res.user.name}! (10-min session active)`);
        this.checkAuthGate();
        this.onAuthenticatedLaunch();
      } else {
        this.showToast(res.error, 'error');
      }
    });

    // Sign Up Form Submit -> Sends Real Email OTP to Mail Inbox Only
    document.getElementById('gateSignUpForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('gateSendOtpSubmitBtn');
      const originalText = submitBtn.innerHTML;

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Sending Code to Mail...`;
      if (window.lucide) lucide.createIcons();

      const name = document.getElementById('gateSignUpName').value.trim();
      const email = document.getElementById('gateSignUpEmail').value.trim();
      const password = document.getElementById('gateSignUpPassword').value;

      const res = await HabitData.initiateSignUp(name, email, password);

      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      if (window.lucide) lucide.createIcons();

      if (res.success) {
        document.getElementById('gateSignUpCard').style.display = 'none';
        document.getElementById('gateVerifyCard').style.display = 'block';
        document.getElementById('gateVerifyEmailTarget').textContent = res.email;
        this.startResendCooldown();
        this.showToast(`Verification code sent to your email inbox: ${res.email}`);
      } else {
        this.showToast(res.error, 'error');
      }
    });

    // Resend OTP Button Click
    document.getElementById('gateResendOtpBtn')?.addEventListener('click', async () => {
      if (this.resendSecondsLeft > 0) return;
      if (!HabitData.pendingVerification) return;

      const btn = document.getElementById('gateResendOtpBtn');
      btn.disabled = true;
      this.showToast(`Sending fresh code to ${HabitData.pendingVerification.email}...`);

      const freshCode = String(Math.floor(100000 + Math.random() * 900000));
      HabitData.pendingVerification.code = freshCode;

      await HabitData.dispatchRealEmailOTP(
        HabitData.pendingVerification.email,
        HabitData.pendingVerification.name,
        freshCode
      );

      this.startResendCooldown();
      this.showToast(`Fresh OTP code sent to ${HabitData.pendingVerification.email}`);
    });

    // Verification Code Form Submit
    document.getElementById('gateVerifyForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('gateVerifyEmailTarget').textContent;
      const code = document.getElementById('gateVerifyCodeInput').value.trim();

      const res = HabitData.verifyAndCreateAccount(email, code);
      if (res.success) {
        this.showToast(`Email Verified! Welcome, ${res.user.name}! (10-min session active)`);
        this.checkAuthGate();
        this.onAuthenticatedLaunch();
      } else {
        this.showToast(res.error, 'error');
      }
    });

    // Sign Out Button in Settings & Profile
    document.getElementById('signOutBtn')?.addEventListener('click', () => {
      if (confirm('Sign out of HAVIT Pro and lock dashboard?')) {
        HabitData.signOut();
        this.checkAuthGate();
        this.showToast('Signed out. Security lock active.');
      }
    });

    // Settings Modal Open / Close
    document.getElementById('openSettingsModalBtn')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('closeSettingsModalBtn')?.addEventListener('click', () => this.closeSettingsModal());
    document.getElementById('settingsModalOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'settingsModalOverlay') this.closeSettingsModal();
    });

    // Settings Tabs Navigation
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.switchSettingsTab(tab);
      });
    });

    // Theme Switcher Cards Click
    document.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', () => {
        const theme = card.dataset.theme;
        this.applyTheme(theme);
        this.showToast(`Theme updated to ${card.querySelector('.theme-info-title')?.textContent}`);
      });
    });

    // Profile Form Submit
    document.getElementById('settingsProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredName = document.getElementById('profileUserName').value.trim() || 'Champion';
      const enteredEmail = document.getElementById('profileUserEmail').value.trim() || HabitData.user.email;
      const enteredLoc = document.getElementById('profileUserLocation').value.trim() || HabitData.user.location;
      
      HabitData.user.name = enteredName;
      HabitData.user.email = enteredEmail;
      HabitData.user.city = enteredLoc;
      HabitData.user.location = enteredLoc;
      HabitData.settings.locationMode = 'manual';

      const enteredTemp = document.getElementById('profileWeatherTemp').value.trim();
      const enteredCond = document.getElementById('profileWeatherCond').value.trim();
      if (enteredTemp) HabitData.user.weatherTemp = enteredTemp;
      if (enteredCond) HabitData.user.weatherCond = enteredCond;

      HabitData.saveUser();
      HabitData.saveSettings();

      if (enteredLoc && enteredLoc !== 'Detecting Location...') {
        this.fetchWeatherForManualCity(enteredLoc);
      }

      this.updateUserProfileDisplay();
      this.showToast('Profile & Location saved!');
      this.closeSettingsModal();
    });

    // Alarms in Settings
    document.getElementById('testAlarmSoundBtn')?.addEventListener('click', () => {
      soundEngine.playAlarmTone();
      this.showToast('🔊 Playing alarm chime');
    });

    document.getElementById('newAlarmForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('newAlarmName').value.trim();
      const time = document.getElementById('newAlarmTime').value;
      if (name && time) {
        HabitData.addAlarm({ name, time });
        this.renderSettingsAlarmsList();
        document.getElementById('newAlarmName').value = '';
        this.showToast(`Alarm set for ${time}!`);
      }
    });

    // Quick Actions
    document.getElementById('openNewHabitModalBtn')?.addEventListener('click', () => this.openHabitModal());
    document.getElementById('settingsAddHabitBtn')?.addEventListener('click', () => {
      this.closeSettingsModal();
      this.openHabitModal();
    });

    document.getElementById('sheetCheckTodayAllBtn')?.addEventListener('click', () => this.completeAllForToday());
    document.getElementById('sheetResetMonthBtn')?.addEventListener('click', () => this.resetCurrentMonth());

    // Print Professional Report
    document.getElementById('printProfessionalReportBtn')?.addEventListener('click', () => {
      window.print();
    });

    // Drawer Toggle
    document.getElementById('toggleDrawerBtn')?.addEventListener('click', () => this.toggleDrawer());
    document.getElementById('closeDrawerBtn')?.addEventListener('click', () => this.toggleDrawer(false));

    // Data Management
    document.getElementById('loadDemoDataBtn')?.addEventListener('click', () => this.handleLoadDemoData());
    document.getElementById('settingsLoadDemoBtn')?.addEventListener('click', () => {
      this.closeSettingsModal();
      this.handleLoadDemoData();
    });

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
      HabitData.exportToCsv();
      this.showToast('Exported habit spreadsheet to CSV');
    });

    document.getElementById('settingsExportCsvBtn')?.addEventListener('click', () => {
      HabitData.exportToCsv();
      this.showToast('Exported habit spreadsheet to CSV');
    });

    document.getElementById('settingsExportJsonBtn')?.addEventListener('click', () => {
      HabitData.exportToJson();
      this.showToast('JSON Backup downloaded');
    });

    document.getElementById('settingsImportJsonInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const success = HabitData.importFromJson(event.target.result);
        if (success) {
          this.showToast('Backup restored successfully!');
          this.applyTheme(HabitData.settings.theme || 'midnight');
          this.updateUserProfileDisplay();
          this.renderCurrentMonthSheet();
          this.closeSettingsModal();
        } else {
          this.showToast('Invalid backup JSON file', 'error');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('settingsFactoryResetBtn')?.addEventListener('click', () => {
      if (confirm('Factory reset all habits, profile, and logs to default?')) {
        HabitData.factoryReset();
        this.applyTheme('midnight');
        this.updateUserProfileDisplay();
        this.renderCurrentMonthSheet();
        this.closeSettingsModal();
        this.showToast('Application reset to clean state');
      }
    });

    // Sound FX Toggle
    const soundToggle = document.getElementById('soundToggleBtn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        soundEngine.enabled = !soundEngine.enabled;
        const icon = document.getElementById('soundIcon');
        if (icon) {
          icon.setAttribute('data-lucide', soundEngine.enabled ? 'volume-2' : 'volume-x');
          if (window.lucide) lucide.createIcons();
        }
        this.showToast(`Sound FX ${soundEngine.enabled ? 'Enabled' : 'Muted'}`);
      });
    }

    // Add Habit Modal
    document.getElementById('closeHabitModalBtn')?.addEventListener('click', () => this.closeHabitModal());
    document.getElementById('cancelHabitModalBtn')?.addEventListener('click', () => this.closeHabitModal());
    document.getElementById('habitModalOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'habitModalOverlay') this.closeHabitModal();
    });

    const habitFormType = document.getElementById('habitFormType');
    const numericRow = document.getElementById('numericOptionsRow');
    if (habitFormType && numericRow) {
      habitFormType.addEventListener('change', () => {
        numericRow.style.display = habitFormType.value === 'numeric' ? 'flex' : 'none';
      });
    }

    document.querySelectorAll('#colorPalette .color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#colorPalette .color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        document.getElementById('habitFormColorInput').value = dot.dataset.color;
      });
    });

    document.getElementById('habitForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveHabitFromForm();
    });

    // Numeric Popover
    document.getElementById('closePopoverBtn')?.addEventListener('click', () => this.closeNumericPopover());
    document.getElementById('numericPopoverOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'numericPopoverOverlay') this.closeNumericPopover();
    });

    document.getElementById('popoverDecBtn')?.addEventListener('click', () => this.adjustPopoverValue(-0.5));
    document.getElementById('popoverIncBtn')?.addEventListener('click', () => this.adjustPopoverValue(0.5));
    document.getElementById('popoverIncBigBtn')?.addEventListener('click', () => this.adjustPopoverValue(1.0));
    document.getElementById('popoverMaxBtn')?.addEventListener('click', () => this.setPopoverFullTarget());

    // Drawer Timer Controls
    document.getElementById('drawerTimerStartBtn')?.addEventListener('click', () => this.toggleDrawerTimer());
    document.getElementById('drawerTimerResetBtn')?.addEventListener('click', () => this.resetDrawerTimer());
    document.getElementById('drawerTimerLogBtn')?.addEventListener('click', () => this.logDrawerTimer());

    // Drawer Notes
    const notesInput = document.getElementById('drawerNotesInput');
    if (notesInput) {
      notesInput.addEventListener('input', () => {
        HabitData.setDailyNoteAndMood(HabitData.getTodayString(), notesInput.value, undefined);
      });
    }
  }

  startResendCooldown() {
    this.resendSecondsLeft = 60;
    const btn = document.getElementById('gateResendOtpBtn');
    const countdownEl = document.getElementById('gateResendCountdown');

    if (this.resendInterval) clearInterval(this.resendInterval);

    if (btn) btn.disabled = true;

    this.resendInterval = setInterval(() => {
      this.resendSecondsLeft--;
      if (countdownEl) {
        countdownEl.textContent = `(in ${this.resendSecondsLeft}s)`;
      }

      if (this.resendSecondsLeft <= 0) {
        clearInterval(this.resendInterval);
        if (btn) btn.disabled = false;
        if (countdownEl) countdownEl.textContent = '';
      }
    }, 1000);
  }

  handleLoadDemoData() {
    if (confirm('Load 60 days of realistic habit tracking history?')) {
      HabitData.generateDemoData();
      this.showToast('60-Day Pro Demo Data Loaded!');
      this.renderCurrentMonthSheet();
    }
  }

  // --- Settings Modal Tabs Controller & Serial Reordering ---

  openSettingsModal(defaultTab = 'profile') {
    this.switchSettingsTab(defaultTab);
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === defaultTab);
    });
    this.renderSettingsHabitsList();
    this.renderSettingsAlarmsList();
    this.updateUserProfileDisplay();
    document.getElementById('settingsModalOverlay')?.classList.add('active');
    if (window.lucide) lucide.createIcons();
  }

  closeSettingsModal() {
    document.getElementById('settingsModalOverlay')?.classList.remove('active');
  }

  switchSettingsTab(tabName) {
    const paneMap = {
      profile: 'paneProfile',
      themes: 'paneThemes',
      habits: 'paneHabits',
      alarms: 'paneAlarms',
      data: 'paneData'
    };

    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById(paneMap[tabName] || 'paneProfile');
    if (targetPane) targetPane.classList.add('active');
  }

  renderSettingsHabitsList() {
    const container = document.getElementById('settingsHabitListContainer');
    if (!container) return;
    container.innerHTML = '';

    HabitData.habits.forEach((h, index) => {
      const item = document.createElement('div');
      item.className = 'settings-habit-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="habit-serial-controls">
            <button class="btn-reorder-arrow btn-reorder-up" data-index="${index}" title="Move Up in Serial Order" ${index === 0 ? 'disabled' : ''}>▲</button>
            <span class="habit-serial-badge font-mono">#${index + 1}</span>
            <button class="btn-reorder-arrow btn-reorder-down" data-index="${index}" title="Move Down in Serial Order" ${index === HabitData.habits.length - 1 ? 'disabled' : ''}>▼</button>
          </div>
          <span style="font-size: 1.2rem;">${h.icon}</span>
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 0.9rem;">${h.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${h.category} • Target: ${h.target} ${h.unit}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="btn-sheet-sm edit-habit-btn" data-id="${h.id}"><i data-lucide="edit-2"></i> Edit</button>
          <button class="btn-sheet-sm delete-habit-btn" data-id="${h.id}" style="color: var(--rose);"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      item.querySelector('.btn-reorder-up')?.addEventListener('click', () => {
        if (HabitData.reorderHabit(index, -1)) {
          this.renderSettingsHabitsList();
          this.renderCurrentMonthSheet();
          soundEngine.playTick();
        }
      });

      item.querySelector('.btn-reorder-down')?.addEventListener('click', () => {
        if (HabitData.reorderHabit(index, 1)) {
          this.renderSettingsHabitsList();
          this.renderCurrentMonthSheet();
          soundEngine.playTick();
        }
      });

      item.querySelector('.edit-habit-btn')?.addEventListener('click', () => {
        this.closeSettingsModal();
        this.openHabitModal(h.id);
      });

      item.querySelector('.delete-habit-btn')?.addEventListener('click', () => {
        if (confirm(`Remove habit "${h.name}" from your spreadsheet?`)) {
          HabitData.deleteHabit(h.id);
          this.renderSettingsHabitsList();
          this.renderCurrentMonthSheet();
          this.showToast(`Habit "${h.name}" deleted`);
        }
      });

      container.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  renderSettingsAlarmsList() {
    const container = document.getElementById('settingsAlarmListContainer');
    if (!container) return;
    container.innerHTML = '';

    const alarms = HabitData.settings.alarms || [];

    if (alarms.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 10px;">No active alarms set.</div>`;
      return;
    }

    alarms.forEach(a => {
      const item = document.createElement('div');
      item.className = 'settings-alarm-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <i data-lucide="bell" style="color: ${a.enabled ? 'var(--cyan)' : 'var(--text-dim)'}; width: 18px; height: 18px;"></i>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; color: #FFF;">${a.name}</div>
            <div style="font-size: 0.74rem; font-family: var(--font-mono); color: var(--text-muted);">${a.time} Daily</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" class="alarm-toggle-input" data-id="${a.id}" ${a.enabled ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--cyan);">
          </label>
          <button class="btn-sheet-sm delete-alarm-btn" data-id="${a.id}" style="color: var(--rose);"><i data-lucide="trash"></i></button>
        </div>
      `;

      item.querySelector('.alarm-toggle-input')?.addEventListener('change', (e) => {
        HabitData.toggleAlarm(a.id);
        this.showToast(`Alarm ${e.target.checked ? 'Enabled' : 'Disabled'}`);
      });

      item.querySelector('.delete-alarm-btn')?.addEventListener('click', () => {
        HabitData.deleteAlarm(a.id);
        this.renderSettingsAlarmsList();
        this.showToast('Alarm removed');
      });

      container.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- View Switcher ---

  switchView(viewName) {
    this.currentView = viewName;
    document.getElementById('mainSpreadsheetView').style.display = viewName === 'sheet' ? 'block' : 'none';
    document.getElementById('yearlyHeatmapView').style.display = viewName === 'yearly' ? 'block' : 'none';
    document.getElementById('achievementsView').style.display = viewName === 'achievements' ? 'block' : 'none';
    document.getElementById('professionalReportView').style.display = viewName === 'report' ? 'block' : 'none';

    if (viewName === 'sheet') {
      this.renderCurrentMonthSheet();
    } else if (viewName === 'yearly') {
      this.renderYearlySubView();
    } else if (viewName === 'achievements') {
      this.renderAchievementsSubView();
    } else if (viewName === 'report') {
      this.renderProfessionalReportView();
    }

    if (window.lucide) lucide.createIcons();
  }

  // --- Executive Professional Report & Activity Center Render Engine ---

  renderProfessionalReportView() {
    const year = this.currentYear;
    const month = this.currentMonth;
    const monthlyStats = HabitData.getMonthlyData(year, month);
    const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const gradeObj = HabitData.calculateDisciplineGrade(monthlyStats.adherenceScore);
    const streak = HabitData.calculateGlobalStreak();
    const cleanStreak = HabitData.getHabitStreak('no_porn');

    // 1. Report Header Info
    document.getElementById('reportHeaderMonth').textContent = monthName;
    document.getElementById('reportHeaderUser').textContent = `${HabitData.user.name} (${HabitData.user.email})`;
    document.getElementById('reportHeaderLocation').textContent = HabitData.user.location;

    // 2. Grade Badge & Score
    const gradeBadge = document.getElementById('reportDisciplineGrade');
    const scoreVal = document.getElementById('reportDisciplineScore');
    const gradeDesc = document.getElementById('reportGradeDesc');

    if (gradeBadge) {
      gradeBadge.textContent = gradeObj.grade;
      gradeBadge.style.color = gradeObj.color;
      gradeBadge.style.borderColor = gradeObj.color;
      gradeBadge.style.boxShadow = `0 0 25px ${gradeObj.color}44`;
    }
    if (scoreVal) scoreVal.textContent = `${monthlyStats.adherenceScore}% Overall`;
    if (gradeDesc) gradeDesc.textContent = `${gradeObj.label} • ${gradeObj.badge}`;

    // 3. Quantitative Summary Cards
    document.getElementById('reportWaterTotal').textContent = `${monthlyStats.totalWater} Liters`;
    document.getElementById('reportWorkTotal').textContent = `${monthlyStats.totalHours} Hours`;
    document.getElementById('reportCleanStreak').textContent = `${cleanStreak} Days Clean`;
    document.getElementById('reportActiveStreak').textContent = `${streak.currentStreak} Days (Best: ${streak.longestStreak})`;

    // 4. Detailed Habit Consistency Table
    const tableBody = document.getElementById('reportHabitsTableBody');
    if (tableBody) {
      tableBody.innerHTML = '';
      monthlyStats.habitRankings.forEach((h, idx) => {
        const tr = document.createElement('tr');
        const habitStreak = HabitData.getHabitStreak(h.id);
        tr.innerHTML = `
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--cyan);">#${idx + 1}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${h.icon}</span>
              <strong>${h.name}</strong>
            </div>
          </td>
          <td><span class="legend-chip" style="font-size: 0.72rem;">${h.category}</span></td>
          <td>${h.target} ${h.unit} / day</td>
          <td><strong>${h.completedDays} / ${monthlyStats.daysInMonth} Days</strong></td>
          <td>
            <span class="habit-sheet-badge font-mono" style="color: ${h.percent >= 75 ? 'var(--emerald)' : (h.percent >= 50 ? 'var(--amber)' : 'var(--rose)')};">
              ${h.percent}%
            </span>
          </td>
          <td style="font-family: var(--font-mono); font-weight: 700;">🔥 ${habitStreak}d</td>
        `;
        tableBody.appendChild(tr);
      });
    }

    // 5. Activity Feed Timeline
    this.renderActivityFeed();
  }

  renderActivityFeed() {
    const feedContainer = document.getElementById('activityFeedContainer');
    if (!feedContainer) return;
    feedContainer.innerHTML = '';

    const activities = HabitData.activities || [];

    if (activities.length === 0) {
      feedContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No recent activity recorded yet. Start logging habits to build your timeline!</div>`;
      return;
    }

    activities.slice(0, 30).forEach(act => {
      const timeStr = new Date(act.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
      const item = document.createElement('div');
      item.className = 'activity-feed-item';
      
      let icon = '⚡';
      if (act.type === 'check') icon = '✓';
      if (act.type === 'rank') icon = '👑';
      if (act.type === 'habit_add') icon = '➕';
      if (act.type === 'habit_order') icon = '🔢';
      if (act.type === 'login') icon = '🔐';

      item.innerHTML = `
        <div class="activity-feed-dot">${icon}</div>
        <div class="activity-feed-content">
          <div class="activity-feed-text">${act.message}</div>
          <div class="activity-feed-time font-mono">${timeStr}</div>
        </div>
      `;
      feedContainer.appendChild(item);
    });
  }

  // --- Master Spreadsheet Matrix Render Engine ---

  renderCurrentMonthSheet() {
    const year = this.currentYear;
    const month = this.currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = HabitData.getTodayString();

    const monthDate = new Date(year, month, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('sheetMonthName').textContent = monthName;
    document.getElementById('monthlyDaysCount').textContent = `${daysInMonth} Days`;

    // 1. Build Header Rows
    const headerDaysRow = document.getElementById('sheetHeaderDaysRow');
    const headerWeekdaysRow = document.getElementById('sheetHeaderWeekdaysRow');

    let daysHtml = `<th class="sticky-col">Month Day</th>`;
    let weekdaysHtml = `<th class="sticky-col">Week Day / Habit</th>`;

    const dayMetadata = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dObj = new Date(year, month, day);
      const dateStr = HabitData.formatDate(dObj);
      const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      const isToday = (dateStr === todayStr);

      dayMetadata.push({ day, dateStr, dayName, isToday, dObj });

      daysHtml += `<th class="${isToday ? 'is-today-col' : ''}">${day}</th>`;
      weekdaysHtml += `<th class="${isToday ? 'is-today-col' : ''}">${dayName}</th>`;
    }

    headerDaysRow.innerHTML = daysHtml;
    headerWeekdaysRow.innerHTML = weekdaysHtml;

    // 2. Build Habit Rows (Body)
    const tbody = document.getElementById('sheetTableBody');
    tbody.innerHTML = '';

    const monthlyStats = HabitData.getMonthlyData(year, month);
    const habits = HabitData.habits;

    habits.forEach((habit, hIdx) => {
      const tr = document.createElement('tr');
      tr.className = `sheet-habit-row ${hIdx % 2 === 0 ? 'row-even' : 'row-odd'}`;

      const rankingObj = monthlyStats.habitRankings.find(r => r.id === habit.id);
      const habitMonthPct = rankingObj ? rankingObj.percent : 0;

      let rowHtml = `
        <td class="sticky-col">
          <div class="habit-sheet-cell">
            <div class="habit-sheet-stripe" style="background: ${habit.color};"></div>
            <div class="habit-sheet-info">
              <span class="habit-serial-mini font-mono">#${hIdx + 1}</span>
              <span class="habit-sheet-icon">${habit.icon}</span>
              <div>
                <div class="habit-sheet-name">${habit.name}</div>
                <div class="habit-sheet-target">${habit.type === 'numeric' ? `Target: ${habit.target} ${habit.unit}` : 'Daily Check'}</div>
              </div>
            </div>
            <span class="habit-sheet-badge" style="color: ${habitMonthPct >= 70 ? 'var(--emerald)' : 'var(--cyan)'};">
              ${habitMonthPct}%
            </span>
          </div>
        </td>
      `;

      dayMetadata.forEach(meta => {
        const dayLog = HabitData.logs[meta.dateStr] || {};
        const item = dayLog[habit.id] || {};
        const isDone = habit.type === 'boolean' ? !!item.completed : ((item.value || 0) >= habit.target);
        const curVal = item.value || 0;

        if (habit.type === 'boolean') {
          rowHtml += `
            <td class="sheet-cell ${meta.isToday ? 'is-today-col' : ''}" data-date="${meta.dateStr}" data-habit="${habit.id}">
              <div class="sheet-checkbox ${isDone ? 'checked' : ''}">
                ${isDone ? '✓' : ''}
              </div>
            </td>
          `;
        } else {
          let statusClass = 'empty';
          if (curVal >= habit.target) statusClass = 'done';
          else if (curVal > 0) statusClass = 'partial';

          rowHtml += `
            <td class="sheet-cell ${meta.isToday ? 'is-today-col' : ''}" data-date="${meta.dateStr}" data-habit="${habit.id}" data-type="numeric">
              <span class="numeric-cell-badge ${statusClass}">
                ${curVal > 0 ? `${curVal}${habit.unit}` : '–'}
              </span>
            </td>
          `;
        }
      });

      tr.innerHTML = rowHtml;

      tr.querySelectorAll('.sheet-cell').forEach(cell => {
        const dateStr = cell.dataset.date;
        const habitId = cell.dataset.habit;
        const isNumeric = cell.dataset.type === 'numeric';

        cell.addEventListener('click', (e) => {
          if (isNumeric && (e.shiftKey || e.altKey)) {
            this.openNumericPopover(habitId, dateStr);
          } else {
            this.handleCellToggle(habitId, dateStr);
          }
        });

        if (isNumeric) {
          cell.addEventListener('dblclick', () => {
            this.openNumericPopover(habitId, dateStr);
          });
        }
      });

      tbody.appendChild(tr);
    });

    // 3. Build Summary Footer Rows
    const footerTotalRow = document.getElementById('sheetFooterTotalRow');
    const footerPercentRow = document.getElementById('sheetFooterPercentRow');

    let totalRowHtml = `<td class="sticky-col" style="text-align: left; padding-left: 14px;"><strong>DAILY COMPLETED</strong></td>`;
    let percentRowHtml = `<td class="sticky-col" style="text-align: left; padding-left: 14px; color: var(--text-muted);">DAILY SCORE %</td>`;

    const dayCompletionList = [];
    const weekdayDistribution = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

    dayMetadata.forEach(meta => {
      const p = HabitData.getDailyProgress(meta.dateStr);
      dayCompletionList.push({ dayNumber: meta.day, completedCount: p.completedCount, percent: p.percent });
      
      if (weekdayDistribution[meta.dayName] !== undefined) {
        weekdayDistribution[meta.dayName] += p.completedCount;
      }

      totalRowHtml += `<td class="${meta.isToday ? 'is-today-col' : ''}"><span style="color: ${p.completedCount > 0 ? 'var(--emerald)' : 'var(--text-dim)'};">${p.completedCount}</span></td>`;
      percentRowHtml += `<td class="${meta.isToday ? 'is-today-col' : ''}"><span style="color: ${p.percent >= 80 ? 'var(--emerald)' : p.percent > 0 ? 'var(--amber)' : 'var(--text-dim)'};">${p.percent}%</span></td>`;
    });

    footerTotalRow.innerHTML = totalRowHtml;
    footerPercentRow.innerHTML = percentRowHtml;

    // 4. Update Top Dashboard
    this.updateExecutiveDashboard(monthlyStats, dayCompletionList, weekdayDistribution);

    // 5. Update Bottom Charts
    AnalyticsCharts.renderWeeklyBarChart(weekdayDistribution);
    AnalyticsCharts.renderMonthlyBarChart(dayCompletionList);

    // 6. Update Drawer
    this.renderDrawerChecklist();
  }

  handleCellToggle(habitId, dateStr) {
    const prevP = HabitData.getDailyProgress(dateStr);
    HabitData.toggleHabitCheck(dateStr, habitId);
    const newP = HabitData.getDailyProgress(dateStr);

    if (newP.percent > prevP.percent) {
      soundEngine.playTick();
    } else {
      soundEngine.playUntick();
    }

    if (newP.percent === 100 && prevP.percent < 100) {
      soundEngine.playComplete();
      this.triggerConfetti();
      this.showToast(`🎉 Flawless 100% Day for ${dateStr}!`);
    }

    this.renderCurrentMonthSheet();
  }

  // --- Numeric Popover Logic ---

  openNumericPopover(habitId, dateStr) {
    const habit = HabitData.habits.find(h => h.id === habitId);
    if (!habit) return;

    this.activePopoverHabit = habit;
    this.activePopoverDateStr = dateStr;

    const log = HabitData.getDailyLog(dateStr);
    const curVal = log[habitId]?.value || 0;

    document.getElementById('popoverHabitName').textContent = `${habit.icon} ${habit.name} (${dateStr})`;
    document.getElementById('popoverCurrentVal').textContent = curVal.toFixed(1);
    document.getElementById('popoverUnit').textContent = habit.unit;
    document.getElementById('popoverDecBtn').textContent = `-${habit.step}`;
    document.getElementById('popoverIncBtn').textContent = `+${habit.step}`;
    document.getElementById('popoverMaxBtn').textContent = `Set Full Target (${habit.target} ${habit.unit})`;

    document.getElementById('numericPopoverOverlay')?.classList.add('active');
  }

  closeNumericPopover() {
    document.getElementById('numericPopoverOverlay')?.classList.remove('active');
  }

  adjustPopoverValue(delta) {
    if (!this.activePopoverHabit || !this.activePopoverDateStr) return;
    const newVal = HabitData.setNumericValue(this.activePopoverDateStr, this.activePopoverHabit.id, delta);
    document.getElementById('popoverCurrentVal').textContent = newVal.toFixed(1);
    soundEngine.playTick();
    this.renderCurrentMonthSheet();
  }

  setPopoverFullTarget() {
    if (!this.activePopoverHabit || !this.activePopoverDateStr) return;
    HabitData.setNumericValue(this.activePopoverDateStr, this.activePopoverHabit.id, this.activePopoverHabit.target);
    document.getElementById('popoverCurrentVal').textContent = this.activePopoverHabit.target.toFixed(1);
    soundEngine.playComplete();
    this.renderCurrentMonthSheet();
    this.closeNumericPopover();
  }

  // --- Executive Dashboard & Donut Gauges Calculation ---

  updateExecutiveDashboard(monthlyStats, dayCompletionList, weekdayDistribution) {
    const todayStr = HabitData.getTodayString();
    const todayProgress = HabitData.getDailyProgress(todayStr);

    const todayObj = new Date();
    const startOfWeek = new Date(todayObj);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const weeklyData = HabitData.getWeeklyData(startOfWeek);

    const totalPossibleMonthly = HabitData.habits.length * monthlyStats.daysInMonth;
    document.getElementById('kpiMonthlyPercent').textContent = `${monthlyStats.adherenceScore}%`;
    document.getElementById('kpiMonthlyTotalTicks').textContent = `${monthlyStats.days.reduce((acc, d) => acc + (HabitData.getDailyProgress(d.date).completedCount), 0)} / ${totalPossibleMonthly}`;
    document.getElementById('kpiLongestStreak').textContent = `${HabitData.calculateGlobalStreak().longestStreak} Days`;

    let bestDay = 'Mon';
    let bestVal = -1;
    for (const d in weekdayDistribution) {
      if (weekdayDistribution[d] > bestVal) {
        bestVal = weekdayDistribution[d];
        bestDay = d;
      }
    }
    document.getElementById('kpiBestDay').textContent = `${bestDay} (${bestVal} ticks)`;

    document.getElementById('kpiWeeklyPercent').textContent = `${weeklyData.avgPercent}%`;
    document.getElementById('kpiWeeklyTotalTicks').textContent = `${weeklyData.totalCompleted} / ${weeklyData.totalPossible}`;
    document.getElementById('kpiCleanStreak').textContent = `${HabitData.getHabitStreak('no_porn')} Days`;
    document.getElementById('kpiBestHabit').textContent = `${weeklyData.habitStats[weeklyData.habitStats.length - 1]?.habit?.name.slice(0, 12) || 'Water'} / ${weeklyData.weakestHabit.slice(0, 12)}`;

    AnalyticsCharts.renderDonutGauges(todayProgress.percent, weeklyData.avgPercent, monthlyStats.adherenceScore);
  }

  // --- Drawer / Quick Checklist & Timer ---

  toggleDrawer(forceState = null) {
    const drawer = document.getElementById('sideDrawer');
    if (drawer) {
      if (forceState !== null) {
        drawer.classList.toggle('open', forceState);
      } else {
        drawer.classList.toggle('open');
      }
    }
    if (drawer?.classList.contains('open')) {
      this.renderDrawerChecklist();
    }
  }

  renderDrawerChecklist() {
    const todayStr = HabitData.getTodayString();
    const todayP = HabitData.getDailyProgress(todayStr);

    document.getElementById('drawerTodayPercent').textContent = `${todayP.percent}%`;
    document.getElementById('drawerTodayHabits').textContent = `${todayP.completedCount} of ${todayP.totalHabits} completed today`;

    const container = document.getElementById('drawerHabitList');
    if (!container) return;
    container.innerHTML = '';

    const todayLog = HabitData.getDailyLog(todayStr);

    HabitData.habits.forEach((h, idx) => {
      const item = todayLog[h.id] || {};
      const isDone = h.type === 'boolean' ? !!item.completed : ((item.value || 0) >= h.target);
      const val = item.value || 0;

      const div = document.createElement('div');
      div.className = `drawer-check-item ${isDone ? 'done' : ''}`;
      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="habit-serial-mini font-mono">#${idx + 1}</span>
          <span>${h.icon}</span>
          <span style="font-weight: 600; font-size: 0.86rem; color: #FFF;">${h.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">
            ${h.type === 'numeric' ? `${val}/${h.target}${h.unit}` : ''}
          </span>
          <div class="sheet-checkbox ${isDone ? 'checked' : ''}" style="width: 20px; height: 20px;">
            ${isDone ? '✓' : ''}
          </div>
        </div>
      `;

      div.addEventListener('click', () => {
        this.handleCellToggle(h.id, todayStr);
      });

      container.appendChild(div);
    });

    const notesInput = document.getElementById('drawerNotesInput');
    if (notesInput) {
      notesInput.value = todayLog._notes || '';
    }
  }

  toggleDrawerTimer() {
    const startBtn = document.getElementById('drawerTimerStartBtn');

    if (this.timerRunning) {
      clearInterval(this.timerInterval);
      this.timerRunning = false;
      if (startBtn) startBtn.innerHTML = '<i data-lucide="play"></i> Resume';
    } else {
      this.timerRunning = true;
      if (startBtn) startBtn.innerHTML = '<i data-lucide="pause"></i> Pause';

      this.timerInterval = setInterval(() => {
        this.timerSecondsLeft--;
        this.updateDrawerTimerDisplay();

        if (this.timerSecondsLeft <= 0) {
          clearInterval(this.timerInterval);
          this.timerRunning = false;
          soundEngine.playComplete();
          this.showToast('⚡ Pomodoro completed!');
          this.logDrawerTimer();
        }
      }, 1000);
    }
    if (window.lucide) lucide.createIcons();
  }

  resetDrawerTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerRunning = false;
    this.timerSecondsLeft = 25 * 60;
    this.updateDrawerTimerDisplay();

    const startBtn = document.getElementById('drawerTimerStartBtn');
    if (startBtn) startBtn.innerHTML = '<i data-lucide="play"></i> Start';
    if (window.lucide) lucide.createIcons();
  }

  updateDrawerTimerDisplay() {
    const clock = document.getElementById('drawerTimerClock');
    const m = Math.floor(this.timerSecondsLeft / 60);
    const s = this.timerSecondsLeft % 60;
    if (clock) {
      clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  logDrawerTimer() {
    const todayStr = HabitData.getTodayString();
    HabitData.setNumericValue(todayStr, 'study', 0.5);
    HabitData.setNumericValue(todayStr, 'work', 0.5);
    soundEngine.playComplete();
    this.showToast('Logged +0.5h to Study & Deep Work!');
    this.renderCurrentMonthSheet();
  }

  // --- Subviews: Yearly & Achievements ---

  renderYearlySubView() {
    const yearlyData = HabitData.getYearlyData(this.currentYear);
    document.getElementById('yearlyViewYearText').textContent = this.currentYear;
    AnalyticsCharts.renderYearlyHeatmap(yearlyData, (dateStr) => {
      const [y, m] = dateStr.split('-').map(Number);
      this.currentYear = y;
      this.currentMonth = m - 1;
      this.switchView('sheet');
    });
    AnalyticsCharts.renderYearlyTrend(yearlyData);
  }

  renderAchievementsSubView() {
    const rankInfo = HabitData.getUserRank();
    document.getElementById('rankHeroIcon').textContent = rankInfo.currentRank.icon;
    document.getElementById('rankHeroTag').textContent = rankInfo.currentRank.tier;
    document.getElementById('rankHeroName').textContent = rankInfo.currentRank.name;
    document.getElementById('rankCurrentXpText').textContent = `${rankInfo.totalXp} XP Total`;
    document.getElementById('rankNextLevelText').textContent = rankInfo.nextRank ? `Next: ${rankInfo.nextRank.name} (${rankInfo.nextRank.minXp} XP)` : 'Max Rank Achieved';
    document.getElementById('rankXpFill').style.width = `${rankInfo.progressPercent}%`;

    const grid = document.getElementById('badgesGridContainer');
    if (!grid) return;
    grid.innerHTML = '';

    ACHIEVEMENTS_LIST.forEach(badge => {
      const isUnlocked = HabitData.user.unlockedAchievements?.includes(badge.id);
      const card = document.createElement('div');
      card.className = `badge-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.innerHTML = `
        <div class="badge-icon">${badge.icon}</div>
        <div>
          <div class="badge-title">${badge.title}</div>
          <div class="badge-desc">${badge.description}</div>
          <span style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--cyan); font-weight: 700;">+${badge.xpReward} XP</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // --- Habit Form CRUD ---

  openHabitModal(habitId = null) {
    const modal = document.getElementById('habitModalOverlay');
    const title = document.getElementById('habitModalTitle');
    const numericRow = document.getElementById('numericOptionsRow');
    if (!modal) return;

    if (habitId) {
      const h = HabitData.habits.find(x => x.id === habitId);
      if (h) {
        title.textContent = 'Edit Habit';
        document.getElementById('habitFormId').value = h.id;
        document.getElementById('habitFormName').value = h.name;
        document.getElementById('habitFormCategory').value = h.category;
        document.getElementById('habitFormType').value = h.type;
        document.getElementById('habitFormTarget').value = h.target;
        document.getElementById('habitFormUnit').value = h.unit;
        document.getElementById('habitFormStep').value = h.step || 1;
        document.getElementById('habitFormIcon').value = h.icon;
        document.getElementById('habitFormColorInput').value = h.color;
        document.getElementById('habitFormDescription').value = h.description || '';
        numericRow.style.display = h.type === 'numeric' ? 'flex' : 'none';
      }
    } else {
      title.textContent = 'Add New Habit';
      document.getElementById('habitFormId').value = '';
      document.getElementById('habitFormName').value = '';
      document.getElementById('habitFormCategory').value = 'productivity';
      document.getElementById('habitFormType').value = 'boolean';
      document.getElementById('habitFormTarget').value = '1';
      document.getElementById('habitFormUnit').value = 'unit';
      document.getElementById('habitFormStep').value = '1';
      document.getElementById('habitFormIcon').value = '⚡';
      document.getElementById('habitFormColorInput').value = '#00F0FF';
      document.getElementById('habitFormDescription').value = '';
      numericRow.style.display = 'none';
    }

    modal.classList.add('active');
  }

  closeHabitModal() {
    document.getElementById('habitModalOverlay')?.classList.remove('active');
  }

  saveHabitFromForm() {
    const id = document.getElementById('habitFormId').value;
    const name = document.getElementById('habitFormName').value.trim();
    if (!name) return;

    const data = {
      name,
      category: document.getElementById('habitFormCategory').value,
      type: document.getElementById('habitFormType').value,
      target: document.getElementById('habitFormTarget').value,
      unit: document.getElementById('habitFormUnit').value,
      step: document.getElementById('habitFormStep').value,
      icon: document.getElementById('habitFormIcon').value || '⚡',
      color: document.getElementById('habitFormColorInput').value || '#00F0FF',
      description: document.getElementById('habitFormDescription').value
    };

    if (id) {
      HabitData.updateHabit(id, data);
      this.showToast('Habit updated!');
    } else {
      HabitData.addHabit(data);
      this.showToast('New habit added to spreadsheet!');
    }

    this.closeHabitModal();
    this.renderCurrentMonthSheet();
  }

  completeAllForToday() {
    const todayStr = HabitData.getTodayString();
    HabitData.habits.forEach(h => {
      const log = HabitData.getDailyLog(todayStr);
      if (h.type === 'boolean') log[h.id] = { completed: true, value: 1 };
      else log[h.id] = { completed: true, value: h.target };
    });
    HabitData.saveLogs();
    HabitData.recalculateXP();
    soundEngine.playComplete();
    this.triggerConfetti();
    this.showToast('🎉 All habits completed for Today!');
    this.renderCurrentMonthSheet();
  }

  resetCurrentMonth() {
    if (confirm('Reset all logged habits for this month?')) {
      const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = HabitData.formatDate(new Date(this.currentYear, this.currentMonth, d));
        delete HabitData.logs[dStr];
      }
      HabitData.saveLogs();
      HabitData.recalculateXP();
      soundEngine.playUntick();
      this.renderCurrentMonthSheet();
      this.showToast('Current month data reset');
    }
  }

  triggerConfetti() {
    if (typeof confetti === 'function') {
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
    }
  }

  showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-circle' : 'check-circle'}" style="color: ${type === 'error' ? 'var(--rose)' : 'var(--cyan)'};"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 3200);
    }, 3200);
  }
}

// Start application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.sheetApp = new HavitSpreadsheetApp();
});
