import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, QrCode, Check, X, DeviceMobile, ArrowLeft, Ticket, House, Coffee, ForkKnife, BookOpen, ShoppingCart, CaretLeft, CaretRight, Users, IconContext, Warning, Trash } from '@phosphor-icons/react';
import NoticesFeed from './components/NoticesFeed';
import SkillSwapGrid from './components/SkillSwapGrid';
import CanteenOrder from './components/CanteenOrder';
import MessMenu from './components/MessMenu';
import StudyMaterials from './components/StudyMaterials';
import AcademicCalendar from './components/AcademicCalendar';
import Timetable from './components/Timetable';
import MetroStartScreen from './components/MetroStartScreen';
import LockScreen from './components/LockScreen';
import PeerChat from './components/PeerChat';
import StudentDashboard from './components/StudentDashboard';
import UserManagement from './components/UserManagement';
import PremiumLoadingScreen from './components/PremiumLoadingScreen';
import AppControls from './components/AppControls';
import CampAi from './components/CampAi';
import InfoView from './components/InfoView';
import { API_BASE } from './config/api';
import { parseJsonResponse } from './utils/parseJsonResponse';
import { applyTheme, applyThemeMode, initGeolocation } from './utils/theme';
import { clearPortalCache } from './utils/cache';
import haptic from './utils/haptic';
import './App.css';

const pageTransitionVariants = {
  initial: { opacity: 0, y: 15, scale: 0.98 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      duration: 0.28, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  },
  exit: { 
    opacity: 0, 
    y: 15, 
    scale: 0.98,
    transition: { 
      duration: 0.2, 
      ease: [0.7, 0, 0.84, 0] 
    } 
  }
};

const homeTransitionVariants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: { 
      duration: 0.24, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.97,
    transition: { 
      duration: 0.18, 
      ease: [0.7, 0, 0.84, 0] 
    } 
  }
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTabRaw] = useState('home');
  const [stats, setStats] = useState({ notices: 0, skillgigs: 0, canteen: 0 });
  const [tabControls, setTabControls] = useState({
    notices: { enabled: true, message: '' },
    student_dashboard: { enabled: true, message: '' },
    timetable: { enabled: true, message: '' },
    calendar: { enabled: true, message: '' },
    canteen: { enabled: true, message: '' },
    mess: { enabled: true, message: '' },
    materials: { enabled: true, message: '' },
    skillgigs: { enabled: true, message: '' },
    info: { enabled: true, message: '' }
  });
  const [disabledTabInfo, setDisabledTabInfo] = useState(null);
  const [aiTransition, setAiTransition] = useState(null);

  // ─── Back-Gesture / History API ───────────────────────────────────────────
  // Track activeTab in a ref so navigateTo's no-op guard never goes stale
  const activeTabRef = React.useRef('home');
  const setActiveTab = React.useCallback((tab) => {
    // Route validation checks for active tenant profile
    if (tab !== 'home' && tab !== 'notices' && tab !== 'materials' && tab !== 'calendar' && tab !== 'info') {
      const sessionRouteToken = sessionStorage.getItem('cp_route_token');
      const isFeatureAllowed = currentUser?.featureFlags?.[tab] ?? false;
      if (!isFeatureAllowed && !sessionRouteToken) {
        return; // Tenant-level routing restriction
      }
    }
    if (tab === activeTabRef.current) return; // no-op for same screen
    
    // Intercept disabled tabs for standard users (students & educators)
    const isStandardUser = currentUser?.role === 'student' || currentUser?.role === 'educator';
    if (isStandardUser && tabControls[tab] && !tabControls[tab].enabled) {
      haptic.error();
      setDisabledTabInfo({
        name: tab,
        message: tabControls[tab].message
      });
      return;
    }

    haptic.nav();
    history.pushState({ tab }, '', window.location.pathname);
    activeTabRef.current = tab;
    setActiveTabRaw(tab);
  }, [currentUser, tabControls]);

  // Global haptic delegation — fires for any element with data-haptic attribute
  useEffect(() => {
    const handler = (e) => {
      const el = e.target.closest('[data-haptic]');
      if (!el) return;
      const type = el.getAttribute('data-haptic') || 'medium';
      haptic[type]?.();
    };
    document.addEventListener('pointerdown', handler, { passive: true });
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Seed the history stack on first load so pressing back on 'home' never
  // closes the PWA — the sentinel entry means back always stays in the app.
  useEffect(() => {
    history.replaceState({ tab: 'home' }, '', window.location.pathname);
    // Push one extra entry so the FIRST back gesture from home doesn't exit
    history.pushState({ tab: 'home' }, '', window.location.pathname);
  }, []);

  // Handle Android / iOS back gesture (popstate fires on back gesture)
  useEffect(() => {
    const onPopState = (e) => {
      const targetTab = e.state?.tab ?? 'home';
      // 'dashboard' entries are handled internally by StudentDashboard's own
      // popstate listener (with stopImmediatePropagation for tab-switch entries).
      // If we see tab === 'dashboard' here it means the base dashboard entry —
      // just stay on dashboard without touching App state.
      if (targetTab === 'dashboard') return;
      activeTabRef.current = targetTab;
      setActiveTabRaw(targetTab);
      // Re-push home sentinel so the next back press also stays in the app
      if (targetTab === 'home') {
        history.pushState({ tab: 'home' }, '', window.location.pathname);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  // Synchronize theme and mode on load
  useEffect(() => {
    const savedTheme = localStorage.getItem('campos-theme') || 'lavender';
    const savedMode = localStorage.getItem('campos-mode') || 'dark';
    applyTheme(savedTheme);
    applyThemeMode(savedMode);

    if (savedMode === 'auto') {
      initGeolocation(() => {
        applyThemeMode('auto');
      });
    }

    // Set up a 1-minute interval loop to re-evaluate auto mode transitions dynamically
    const timer = setInterval(() => {
      const currentMode = localStorage.getItem('campos-mode') || 'dark';
      if (currentMode === 'auto') {
        applyThemeMode('auto');
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);
  const [canteenCart, setCanteenCart] = useState([]);
  const [canteenAdminTab, setCanteenAdminTab] = useState('menu');
  const [isCartPopping, setIsCartPopping] = useState(false);
  const [showCanteenTicketModal, setShowCanteenTicketModal] = useState(false);
  const [activeChatPeer, setActiveChatPeer] = useState(null);

  const totalCartQty = canteenCart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (totalCartQty === 0) return;
    setIsCartPopping(true);
    const timer = setTimeout(() => setIsCartPopping(false), 600);
    return () => clearTimeout(timer);
  }, [totalCartQty]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [paymentData, setPaymentData] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [hasUnreadNotices, setHasUnreadNotices] = useState(false);
  const [hasReportedChats, setHasReportedChats] = useState(false);

  const checkUnreadNotices = (noticesList) => {
    if (!currentUser) return;
    const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
    const lastRead = localStorage.getItem(`cp_notices_last_read_${username}`);
    
    if (!lastRead) {
      setHasUnreadNotices(noticesList.length > 0);
      return;
    }
    
    const lastReadTime = new Date(lastRead).getTime();
    const hasNew = noticesList.some(notice => {
      const noticeTime = new Date(notice.Date || notice.createdAt).getTime();
      return noticeTime > lastReadTime;
    });
    setHasUnreadNotices(hasNew);
  };

  const markNoticesRead = () => {
    if (!currentUser) return;
    const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
    localStorage.setItem(`cp_notices_last_read_${username}`, new Date().toISOString());
    setHasUnreadNotices(false);
  };

  useEffect(() => {
    if (activeTab === 'notices') {
      markNoticesRead();
    }
  }, [activeTab, currentUser]);

  // Scroll main container to top when activeTab changes
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab]);

  const triggerPayment = (amount, source, payload) => {
    setPaymentData({ amount, source, payload });
    setActiveTab('PAYMENT');
  };

  // Check if user session already exists on load
  const checkSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentUser(data.user);
          activeTabRef.current = 'home';
          history.replaceState({ tab: 'home' }, '', window.location.pathname);
          setActiveTabRaw('home');
        }
      }
    } catch (e) {
      // Session check failed, keep null
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchStats = async () => {
    try {
      const fetches = [
        fetch(`${API_BASE}/api/notices`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/skillgigs`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/canteen/menu`, { credentials: 'include' })
      ];
      
      const isSuperAdmin = currentUser && currentUser.role === 'super_admin';
      if (isSuperAdmin) {
        fetches.push(fetch(`${API_BASE}/api/messages/reports`, { credentials: 'include' }));
      }

      const results = await Promise.all(fetches);
      const noticesRes = results[0];
      const gigsRes = results[1];
      const canteenRes = results[2];
      const reportsRes = isSuperAdmin ? results[3] : null;

      if (noticesRes.ok && gigsRes.ok && canteenRes.ok) {
        const notices = await noticesRes.json();
        const gigs = await gigsRes.json();
        const menu = await canteenRes.json();
        setStats({
          notices: notices.length,
          skillgigs: gigs.filter(g => g.Status === 'Active').length,
          canteen: menu.filter(m => m.IsAvailable).length
        });
        checkUnreadNotices(notices);
      }
      
      if (reportsRes && reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setHasReportedChats(reportsData.length > 0);
      } else {
        setHasReportedChats(false);
      }
    } catch (e) {
      // Ignore statistics fetch errors silently
    }
  };

  useEffect(() => {
    if (!sessionStorage.getItem('cp_cache_cleared')) {
      localStorage.clear();
      sessionStorage.setItem('cp_cache_cleared', 'true');
      window.location.reload();
      return;
    }
    checkSession();
  }, []);

  const fetchTabSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/tabs`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tabControls) {
          setTabControls(data.tabControls);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tab settings:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchStats();
      fetchTabSettings();
      // Refresh stats and tab controls every 10 seconds to keep dashboard live
      const interval = setInterval(() => {
        fetchStats();
        fetchTabSettings();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Periodically check/clean expired mess tokens
  useEffect(() => {
    if (!currentUser) return;
    const checkExpiry = () => {
      const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
      const tokenStr = localStorage.getItem(`cp_token_${username}`);
      if (tokenStr) {
        try {
          const token = JSON.parse(tokenStr);
          if (token && token.ExpiryTime) {
            const isExpired = new Date(token.ExpiryTime) < new Date();
            if (isExpired) {
              localStorage.removeItem(`cp_token_${username}`);
              // Force state refresh
              fetchStats();
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    };
    checkExpiry();
    const interval = setInterval(checkExpiry, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Auto-sync avatar from local storage to database if missing on backend
  useEffect(() => {
    if (currentUser && !currentUser.avatar) {
      const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
      const permanentAvatar = localStorage.getItem(`cp_user_avatar_${username}`);
      if (permanentAvatar) {
        fetch(`${API_BASE}/api/auth/avatar`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar: permanentAvatar }),
          credentials: 'include'
        })
        .then(res => {
          if (res.ok) return res.json();
        })
        .then(data => {
          if (data && data.success) {
            setCurrentUser(prev => prev ? { ...prev, avatar: permanentAvatar } : prev);
          }
        })
        .catch(err => console.warn('Failed to auto-sync avatar to database:', err));
      }
    }
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore logout API failures and clear state anyway
    } finally {
      clearPortalCache();
      setCurrentUser(null);
      sessionStorage.setItem('campos-prevent-autologin', 'true');
      // Reset history stack so back gesture can't return to a logged-in screen
      activeTabRef.current = 'home';
      history.replaceState({ tab: 'home' }, '', window.location.pathname);
      setActiveTabRaw('home');
    }
  };

  // Determine user role and active tabs
  const getTabs = () => {
    if (!currentUser) return [];
    if (currentUser.role === 'canteen_admin') {
      return [
        { id: 'home', label: 'Start Screen', icon: '🏠' },
        { id: 'canteen', label: 'Canteen Menu', icon: '🍔' }
      ];
    }
    if (currentUser.role === 'super_admin') {
      return [
        { id: 'home', label: 'Start Screen', icon: '🏠' },
        { id: 'notices', label: 'Notice Board', icon: '📢' },
        { id: 'skillgigs', label: 'Skill Exchange', icon: '🤝' },
        { id: 'canteen', label: 'Canteen Menu', icon: '🍔' },
        { id: 'mess', label: 'Mess Menu', icon: '🍱' },
        { id: 'materials', label: 'Study Material', icon: '📚' },
        { id: 'calendar', label: 'Academic Calendar', icon: '📅' },
        { id: 'users', label: 'Users', icon: '👥' },
        { id: 'appcontrols', label: 'App Controls', icon: '⚙️' },
        { id: 'campai', label: 'CampAi', icon: '✨' },
        { id: 'info', label: 'Info Hub', icon: 'ℹ️' }
      ];
    }
    if (currentUser.role === 'admin') {
      return [
        { id: 'home', label: 'Start Screen', icon: '🏠' },
        { id: 'notices', label: 'Notice Board', icon: '📢' },
        { id: 'skillgigs', label: 'Skill Exchange', icon: '🤝' },
        { id: 'mess', label: 'Mess Menu', icon: '🍱' },
        { id: 'materials', label: 'Study Material', icon: '📚' },
        { id: 'calendar', label: 'Academic Calendar', icon: '📅' },
        { id: 'campai', label: 'CampAi', icon: '✨' },
        { id: 'info', label: 'Info Hub', icon: 'ℹ️' }
      ];
    }
    // Student role sees all 6 tabs plus home start screen
    return [
      { id: 'home', label: 'Start Screen', icon: '🏠' },
      { id: 'notices', label: 'Notice Board', icon: '📢' },
      { id: 'skillgigs', label: 'Skill Exchange', icon: '🤝' },
      { id: 'canteen', label: 'Canteen Menu', icon: '🍔' },
      { id: 'mess', label: 'Mess Menu', icon: '🍱' },
      { id: 'materials', label: 'Study Material', icon: '📚' },
      { id: 'calendar', label: 'Academic Calendar', icon: '📅' },
      { id: 'campai', label: 'CampAi', icon: '✨' },
      { id: 'info', label: 'Info Hub', icon: 'ℹ️' }
    ];
  };

  const allowedTabs = getTabs().map(t => t.id);
  const handleTabClick = (tabId) => {
    if (allowedTabs.includes(tabId)) {
      setActiveTab(tabId);
    }
  };

  // 🖥️ Dynamic Mobile Viewport Content Router
  const renderContent = () => {
    // If session check is in progress, show premium loading screen inside the viewport
    if (checkingAuth) {
      return (
        <motion.div
          key="auth-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          <PremiumLoadingScreen />
        </motion.div>
      );
    }

    // 🔒 If user is NOT logged in, show the LockScreen
    if (!currentUser) {
      return (
        <motion.div
          key="lockscreen"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full"
        >
          <LockScreen 
            onLoginSuccess={(user) => {
              sessionStorage.removeItem('campos-prevent-autologin');
              setCurrentUser(user);
              activeTabRef.current = 'home';
              history.replaceState({ tab: 'home' }, '', window.location.pathname);
              setActiveTabRaw('home');
            }} 
          />
        </motion.div>
      );
    }

    // 💳 Immersive Checkout / Payment View
    if (activeTab === 'PAYMENT') {
      const handlePay = async (method) => {
        try {
          setProcessingPayment(true);
          // Simulate premium payment processing delay
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';

          if (paymentData.source === 'MESS_GUEST') {
            // POST /api/mess/buy-mess-ticket
            const res = await fetch(`${API_BASE}/api/mess/buy-mess-ticket`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quantity: paymentData.payload?.quantity || 1
              }),
              credentials: 'include',
            });

            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.message || 'Payment failed.');
            }

            const data = await res.json();
            if (data.token) {
              localStorage.setItem(`cp_token_${username}`, JSON.stringify(data.token));
              setActiveTab('MESS_QR_FULL');
            }
          } else if (paymentData.source === 'CANTEEN') {
            // POST /api/canteen/orders
            const res = await fetch(`${API_BASE}/api/canteen/orders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                StudentId: paymentData.payload.studentId,
                ItemsArray: paymentData.payload.cart.map((cartItem) => ({
                  MenuItemId: cartItem._id,
                  Quantity: cartItem.quantity,
                })),
              }),
              credentials: 'include',
            });

            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.message || 'Payment failed.');
            }

            const orderData = await res.json();
            localStorage.setItem(`cp_order_${username}`, JSON.stringify({
              StudentName: `${currentUser.firstName} ${currentUser.lastName}`,
              ItemsArray: orderData.ItemsArray,
              TotalAmount: orderData.TotalAmount,
              PickupPIN: orderData.PickupPIN,
              ItemCount: orderData.ItemsArray.reduce((sum, item) => sum + item.Quantity, 0),
              Timestamp: orderData.Timestamp || new Date().toISOString()
            }));

            setCanteenCart([]); // Clear cart upon successful payment checkout
            activeTabRef.current = 'home';
            history.replaceState({ tab: 'home' }, '', window.location.pathname);
            setActiveTabRaw('home');
            setShowCanteenTicketModal(true);
          }
        } catch (err) {
          alert(err.message);
        } finally {
          setProcessingPayment(false);
        }
      };

      const backTarget = paymentData?.source === 'MESS_GUEST' ? 'mess' : 'canteen';

      return (
        <motion.div
          key="payment-gateway"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 bg-m3-surface flex flex-col z-[9999] overflow-hidden font-sans"
        >
          {/* M3 Header Top Bar */}
          <header className="m3-top-app-bar m3-top-app-bar--collapsed z-[100] shrink-0" style={{ height: '96px', paddingTop: '26px' }}>
            <div className="m3-top-app-bar__row w-full justify-between pr-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab(backTarget)}
                  className="m3-icon-button text-m3-onSurface hover:bg-white/5"
                  type="button"
                  aria-label="Go back"
                >
                  <CaretLeft size={22} strokeWidth={2.5} />
                </button>
                
                <h4 className="m3-title-medium text-white leading-none pl-1">Payment Gateway</h4>
              </div>
              <div className="w-12 h-12"></div> {/* spacer */}
            </div>
          </header>

          <div 
            className="flex-1 overflow-y-auto scrollbar-none p-6 flex flex-col justify-center items-center gap-8 min-h-0 w-full"
            style={{
              paddingTop: '106px',
            }}
          >
            {/* Centered Price Card */}
            <div className="m3-surface-card w-full p-6 text-center shadow-lg relative overflow-hidden flex flex-col items-center gap-2 border border-transparent animate-fade-in">
              <span className="text-[10px] font-bold text-m3-onSurfaceVariant tracking-widest uppercase font-mono">
                Total Payable Amount
              </span>
              <div className="text-5xl font-black tracking-tight text-m3-primary font-sans flex items-center justify-center gap-1.5 my-2">
                <span>₹</span>
                <span>{paymentData?.amount || 0}</span>
              </div>
              <div className="text-[10px] text-m3-onSurfaceVariant/60 font-semibold tracking-wide uppercase font-mono">
                Secure Checkout by CampOS
              </div>
            </div>

            {/* Payment Methods */}
            <div className="flex flex-col w-full gap-4">
              <div className="text-left pl-1">
                <span className="text-[10px] font-bold text-m3-onSurfaceVariant tracking-widest uppercase font-mono">
                  Select Payment Method
                </span>
              </div>
              
              {/* UPI / GPay */}
              <button
                onClick={() => handlePay('UPI')}
                className="w-full flex items-center justify-between p-5 rounded-[24px] bg-m3-surfaceContainer hover:bg-m3-surfaceContainerHighest active:scale-[0.98] transition-all duration-300 border border-transparent group shadow-sm text-left cursor-pointer"
                type="button"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 transition-all duration-300 rounded-[16px] bg-m3-primaryContainer/30 text-m3-primary group-hover:bg-m3-primaryContainer/50 group-hover:text-m3-onPrimaryContainer">
                    <DeviceMobile size={20} />
                  </div>
                  <div>
                    <h4 className="font-sans text-base font-bold text-white group-hover:text-m3-onPrimaryContainer">UPI / GPay</h4>
                    <p className="text-m3-onSurfaceVariant/70 text-xs mt-1 font-medium">Instant transfer using any UPI app</p>
                  </div>
                </div>
                <CaretRight size={18} className="text-m3-primary group-hover:text-white transition-colors duration-300 shrink-0" />
              </button>
            </div>
          </div>

          {/* Full-screen loading overlay */}
          {processingPayment && (
            <div className="absolute inset-0 bg-m3-surface/95 backdrop-blur-sm z-[99999] flex flex-col items-center justify-center p-6 select-none">
              <div className="w-14 h-14 border-4 border-m3-primary rounded-full border-t-transparent animate-spin"></div>
              <h3 className="mt-6 font-sans text-xl font-bold tracking-tight text-white">Processing Payment...</h3>
              <p className="mt-2 text-[10px] font-bold tracking-widest uppercase text-m3-primary">Securing connection to banker</p>
            </div>
          )}
        </motion.div>
      );
    }

    // 🎫 Immersive Mess QR Pass view
    if (activeTab === 'MESS_QR_FULL') {
      const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
      const tokenStr = localStorage.getItem(`cp_token_${username}`);
      const token = tokenStr ? JSON.parse(tokenStr) : null;
      
      // Calculate remaining minutes
      let remainingMinutes = 90;
      if (token && token.ExpiryTime) {
        const remainingMs = new Date(token.ExpiryTime) - new Date();
        remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
      }

      return (
        <motion.div
          key="mess-qr-pass"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 bg-m3-surface text-white flex flex-col items-center z-[9999] overflow-y-auto font-sans"
        >
          {/* Back button on top left */}
          <button 
            onClick={() => setActiveTab('home')}
            className="absolute top-6 left-6 p-3 rounded-full bg-m3-surfaceContainerHigh hover:bg-m3-surfaceContainerHighest text-m3-primary transition-colors cursor-pointer border-none shadow-md z-20"
            title="Back to Home"
            type="button"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>

          <div className="flex flex-col items-center w-full max-w-md text-center my-auto py-8 px-6">
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white select-none animate-fade-in">Mess Ticket</h2>
            
            <div 
              className="flex items-center gap-2 mt-3.5 px-4 py-1.5 rounded-full text-m3-primary border-none select-none shadow-sm animate-fade-in"
              style={{ backgroundColor: 'color-mix(in srgb, var(--m3-primary-container) 30%, transparent)' }}
            >
              <Clock size={16} />
              <span className="text-xs font-bold font-mono tracking-wider uppercase">
                {remainingMinutes > 0 ? `Valid for ${remainingMinutes} Mins` : 'Expired'}
              </span>
            </div>

            {/* Massive white QR card with M3 surface style */}
            <div className="w-full max-w-sm bg-m3-surfaceContainerHigh p-8 rounded-[32px] border-none shadow-2xl mt-8 flex flex-col items-center justify-center transform hover:scale-[1.01] transition-transform duration-300 animate-fade-in">
              <div className="p-3 bg-white rounded-[24px] shadow-inner flex items-center justify-center">
                <QrCode size={220} className="text-black" />
              </div>
              
              <div className="mt-6 text-center w-full flex flex-col gap-2">
                <p className="text-[10px] font-bold tracking-widest uppercase text-m3-onSurfaceVariant">Ticket Verification Code</p>
                <div className="mt-1 text-base font-bold tracking-wide text-white bg-m3-surfaceContainerLow py-2.5 px-5 rounded-2xl inline-block mx-auto shadow-inner border-none">
                  {token ? `ID: #${String(token._id || token.id || '').substring(18).toUpperCase()}` : 'ACTIVE TICKET'}
                </div>
                {token && token.Quantity && (
                  <div className="mt-3 text-xs font-semibold text-m3-primary bg-m3-primaryContainer/30 py-1.5 px-4 rounded-full inline-flex items-center gap-1.5 justify-center self-center mx-auto">
                    <span>Quantity: {token.Quantity} Mess Ticket{token.Quantity > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Remove Ticket Option */}
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to remove this active ticket? This cannot be undone.")) {
                  localStorage.removeItem(`cp_token_${username}`);
                  setActiveTab('home');
                  window.dispatchEvent(new Event('storage'));
                }
              }}
              className="mt-5 px-6 py-3 text-xs font-extrabold text-m3-error hover:bg-m3-error/10 rounded-full transition-all duration-300 border border-m3-error/20 bg-transparent cursor-pointer tracking-wider uppercase"
              type="button"
            >
              Remove Ticket
            </button>
          </div>
        </motion.div>
      );
    }

    // 🍔 Immersive Canteen Success view
    if (activeTab === 'SUCCESS') {
      const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
      const orderStr = localStorage.getItem(`cp_order_${username}`);
      const order = orderStr ? JSON.parse(orderStr) : null;
      const pin = order ? order.PickupPIN : '----';

      return (
        <motion.div
          key="canteen-success"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 moving-gradient-bg text-white flex flex-col items-center justify-center p-6 z-[9999] overflow-hidden font-sans select-none"
        >


          <div className="z-10 flex flex-col items-center w-full max-w-md text-center">
            {/* Sleek check icon */}
            <div className="z-10 flex items-center justify-center w-20 h-20 mb-6 transition-transform duration-300 transform border-4 rounded-full shadow-xl bg-white/20 shadow-white/10 border-white/15 hover:scale-105">
              <Check size={36} className="text-white stroke-[3px]" />
            </div>

            <h2 className="mt-2 font-sans text-2xl font-black tracking-tight text-white">Order Placed!</h2>
            <p className="text-slate-300 mt-1.5 text-xs max-w-xs leading-relaxed font-sans">
              Your hot meal is preparing. Present this digital slip at the counter.
            </p>

            {/* Sleek Glass Credit Slip */}
            <div className="w-full bg-white/[0.03] backdrop-blur-3xl py-6 px-5 rounded-[28px] border-2 border-transparent shadow-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] mt-6 flex flex-col items-center relative overflow-hidden max-w-[340px]">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-white/30 to-white/10"></div>
              
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pickup PIN</span>
              <div className="my-4 text-5xl font-black tracking-widest text-white select-all">
                {pin}
              </div>

              <div className="w-full border-t-2 border-dotted border-white/10 pt-4 mt-1 flex flex-col gap-2.5 text-left font-sans">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Customer:</span>
                  <span className="font-bold text-slate-200">{order?.StudentName || 'Student'}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Total Amount:</span>
                  <span className="text-xs font-extrabold text-white">₹{order?.TotalAmount || 0}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Items Count:</span>
                  <span className="font-bold text-slate-200">{order?.ItemCount || 0} items</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('home')}
              className="mt-6 px-8 py-3.5 bg-m3-primary text-m3-onPrimary hover:brightness-110 font-black rounded-xl shadow-lg transition-all duration-300 text-xs uppercase tracking-wider z-10 cursor-pointer active:scale-95"
            >
              Done & Back Home
            </button>

            {/* Remove Canteen Ticket Option */}
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to remove this active order slip? This cannot be undone.")) {
                  localStorage.removeItem(`cp_order_${username}`);
                  setActiveTab('home');
                  window.dispatchEvent(new Event('storage'));
                }
              }}
              className="mt-4 px-6 py-3 text-xs font-extrabold text-m3-error hover:bg-m3-error/10 rounded-full transition-all duration-300 border border-m3-error/20 bg-transparent cursor-pointer tracking-wider uppercase z-10"
              type="button"
            >
              Remove Ticket
            </button>
          </div>
        </motion.div>
      );
    }

    const immersiveTabs = [
      'home',
      'mess',
      'materials',
      'calendar',
      'notices',
      'skillgigs',
      'canteen',
      'canteen_cart',
      'student_dashboard',
      'timetable',
      'peerchat',
      'users',
      'appcontrols',
      'campai',
      'info',
    ];
    const isImmersiveTab = immersiveTabs.includes(activeTab);

    // Otherwise show main dashboard
    return (
      <motion.div
        key="main-dashboard"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`campos-dashboard flex flex-col justify-between h-full text-white relative font-sans overflow-hidden ${
          activeTab === 'home'
            ? 'campos-dashboard--home'
            : isImmersiveTab
              ? 'campos-dashboard--immersive'
              : 'moving-gradient-bg'
        }`}
      >
        <main
          className={`flex-1 min-h-0 scrollbar-none bg-transparent relative z-10 ${
            isImmersiveTab ? 'overflow-hidden flex flex-col p-0' : 'overflow-y-auto scroll-fade-bottom'
          }`}
        >
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div
                key="home"
                variants={homeTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <MetroStartScreen
                  currentUser={currentUser}
                  stats={stats}
                  tabControls={tabControls}
                  onTileClick={(tabId, event) => {
                    const publicRouteAccess = ['SUCCESS', 'notices', 'materials', 'calendar', 'info'];
                    if (!publicRouteAccess.includes(tabId)) {
                      const sessionRouteToken = sessionStorage.getItem('cp_route_token');
                      const isFeatureAllowed = currentUser?.featureFlags?.[tabId] ?? false;
                      if (!isFeatureAllowed && !sessionRouteToken) {
                        return; // Tenant-level routing toggle restriction
                      }
                    }
                    if (tabId === 'SUCCESS') {
                      setShowCanteenTicketModal(true);
                    } else if (tabId === 'canteen_orders') {
                      setCanteenAdminTab('orders');
                      setActiveTab('canteen');
                    } else if (tabId === 'canteen_menu') {
                      setCanteenAdminTab('menu');
                      setActiveTab('canteen');
                    } else if (tabId === 'campai') {
                      let x = window.innerWidth - 104;
                      let y = 64;
                      if (event && event.currentTarget) {
                        const btnRect = event.currentTarget.getBoundingClientRect();
                        const viewportEl = document.querySelector('.mobile-screen-viewport');
                        if (viewportEl) {
                          const viewportRect = viewportEl.getBoundingClientRect();
                          x = (btnRect.left + btnRect.width / 2) - viewportRect.left;
                          y = (btnRect.top + btnRect.height / 2) - viewportRect.top;
                        } else {
                          x = btnRect.left + btnRect.width / 2;
                          y = btnRect.top + btnRect.height / 2;
                        }
                      }
                      setAiTransition({ x, y, stage: 'expanding' });
                    } else {
                      setActiveTab(tabId);
                    }
                  }}
                  onLogout={handleLogout}
                  hasUnreadNotices={hasUnreadNotices}
                  hasReportedChats={hasReportedChats}
                  onUpdateCurrentUser={setCurrentUser}
                />
              </motion.div>
            )}
            {activeTab === 'notices' && allowedTabs.includes('notices') && (
              <motion.div
                key="notices"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <NoticesFeed 
                  currentUser={currentUser} 
                  onUpdate={fetchStats} 
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'skillgigs' && allowedTabs.includes('skillgigs') && (
              <motion.div
                key="skillgigs"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <SkillSwapGrid 
                  currentUser={currentUser} 
                  onUpdate={fetchStats} 
                  setActiveTab={setActiveTab}
                  hasReportedChats={hasReportedChats}
                  onStartChat={(peerName) => {
                    setActiveChatPeer(peerName);
                    setActiveTab('peerchat');
                  }}
                />
              </motion.div>
            )}
            {activeTab === 'peerchat' && (
              <motion.div
                key="peerchat"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <PeerChat
                  currentUser={currentUser}
                  initialActivePeer={activeChatPeer}
                  onClose={() => setActiveTab('skillgigs')}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'canteen' && allowedTabs.includes('canteen') && (
              <motion.div
                key="canteen"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <CanteenOrder 
                  currentUser={currentUser} 
                  onUpdate={fetchStats} 
                  setActiveTab={setActiveTab}
                  triggerPayment={triggerPayment}
                  cart={canteenCart}
                  setCart={setCanteenCart}
                  initialAdminSubTab={canteenAdminTab}
                />
              </motion.div>
            )}
            {activeTab === 'canteen_cart' && allowedTabs.includes('canteen') && (
              <motion.div
                key="canteen_cart"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <CanteenOrder 
                  currentUser={currentUser} 
                  onUpdate={fetchStats} 
                  setActiveTab={setActiveTab}
                  triggerPayment={triggerPayment}
                  cart={canteenCart}
                  setCart={setCanteenCart}
                  isCartCheckout={true}
                />
              </motion.div>
            )}
            {activeTab === 'users' && allowedTabs.includes('users') && (
              <motion.div
                key="users"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <UserManagement 
                  currentUser={currentUser}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'mess' && allowedTabs.includes('mess') && (
              <motion.div
                key="mess"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <MessMenu currentUser={currentUser} setActiveTab={setActiveTab} triggerPayment={triggerPayment} />
              </motion.div>
            )}
            {activeTab === 'materials' && allowedTabs.includes('materials') && (
              <motion.div
                key="materials"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <StudyMaterials currentUser={currentUser} setActiveTab={setActiveTab} />
              </motion.div>
            )}
            {activeTab === 'calendar' && allowedTabs.includes('calendar') && (
              <motion.div
                key="calendar"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <AcademicCalendar currentUser={currentUser} setActiveTab={setActiveTab} />
              </motion.div>
            )}
            {activeTab === 'timetable' && (
              <motion.div
                key="timetable"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <Timetable 
                  currentUser={currentUser}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'student_dashboard' && (
              <motion.div
                key="student_dashboard"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <StudentDashboard 
                  currentUser={currentUser}
                  onClose={() => setActiveTab('home')}
                />
              </motion.div>
            )}
            {activeTab === 'appcontrols' && allowedTabs.includes('appcontrols') && (
              <motion.div
                key="appcontrols"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <AppControls 
                  currentUser={currentUser}
                  onClose={() => setActiveTab('home')}
                />
              </motion.div>
            )}
            {activeTab === 'campai' && allowedTabs.includes('campai') && (
              <motion.div
                key="campai"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <CampAi 
                  currentUser={currentUser}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'info' && allowedTabs.includes('info') && (
              <motion.div
                key="info"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full w-full flex flex-col"
              >
                <InfoView 
                  currentUser={currentUser}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Floating Premium Cart FAB */}
        {activeTab === 'canteen' && canteenCart.length > 0 && (
          <button
            onClick={() => setActiveTab('canteen_cart')}
            className={`canteen-cart-btn absolute bottom-6 right-6 z-[999] bg-m3-primary text-m3-onPrimary rounded-[20px] w-16 h-16 shadow-2xl flex items-center justify-center transition-all duration-300 cursor-pointer ${
              isCartPopping ? 'scale-110 rotate-12' : 'active:scale-90 hover:brightness-110'
            }`}
            type="button"
            title="View Cart"
          >
            <ShoppingCart size={24} className="stroke-[2.5px]" />
            {totalCartQty > 0 && (
              <span className={`absolute -top-1 -right-1 bg-m3-error text-m3-onError text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-m3-surface ${
                isCartPopping ? 'animate-cart-bounce' : ''
              }`}>
                {totalCartQty}
              </span>
            )}
          </button>
        )}
 
        {/* Canteen Ticket Glass Popup Modal Overlay */}
        {showCanteenTicketModal && (() => {
          try {
            const username = currentUser.email ? currentUser.email.split('@')[0] : 'user';
            const orderStr = localStorage.getItem(`cp_order_${username}`);
            const order = orderStr ? JSON.parse(orderStr) : null;
            
            if (!order) return null;

            return (
              <CanteenTicketModal 
                order={order} 
                onClose={() => setShowCanteenTicketModal(false)} 
                onRemove={() => {
                  if (window.confirm("Are you sure you want to remove this active order slip? This cannot be undone.")) {
                    localStorage.removeItem(`cp_order_${username}`);
                    setShowCanteenTicketModal(false);
                    window.dispatchEvent(new Event('storage'));
                  }
                }}
              />
            );
          } catch (e) {
            console.error("Failed to parse cp_order from localStorage:", e);
            return null;
          }
        })()}

        {/* ⚠️ Disabled Tab Info Overlay */}
        {disabledTabInfo && (
          <div className="absolute inset-0 bg-black/35 z-[99999] flex items-center justify-center p-6 animate-fade-in">
            <div 
              className="w-full max-w-[280px] p-6 shadow-2xl flex flex-col gap-4 text-center rounded-[var(--m3-shape-2xl)] select-none animate-dropdown"
              style={{
                background: 'var(--m3-surface-container)',
                border: '1px solid color-mix(in srgb, var(--m3-outline-variant) 40%, transparent)',
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-m3-error shadow-inner"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--m3-error-container) 20%, transparent)' }}
                >
                  <Warning size={22} />
                </div>
                <h3 className="m3-title-medium text-m3-onSurface font-extrabold tracking-wide capitalize">
                  {disabledTabInfo.name === 'skillgigs' ? 'Skill Swap' : disabledTabInfo.name === 'materials' ? 'Study Shelf' : disabledTabInfo.name} Closed
                </h3>
              </div>
              <p className="text-xs text-m3-onSurfaceVariant leading-relaxed font-sans font-medium">
                {disabledTabInfo.message || 'This section is temporarily closed for maintenance. Please check back later.'}
              </p>
              <button
                onClick={() => setDisabledTabInfo(null)}
                className="m3-filled-button w-full !min-h-[44px] !text-xs cursor-pointer font-bold uppercase tracking-wider"
              >
                OK
              </button>
            </div>
          </div>
        )}

        </motion.div>
      );
  };

  const getTabIcon = (tabId) => {
    switch (tabId) {
      case 'home': return <House size={20} className="stroke-[2.5px]" />;
      case 'canteen': return <Coffee size={20} className="stroke-[2.5px]" />;
      case 'mess': return <ForkKnife size={20} className="stroke-[2.5px]" />;
      case 'skillgigs': return <BookOpen size={20} className="stroke-[2.5px]" />;
      case 'users': return <Users size={20} className="stroke-[2.5px]" />;
      case 'info': return <Users size={20} className="stroke-[2.5px]" />;
      default: return null;
    }
  };

  return (
    <IconContext.Provider value={{ weight: 'light' }}>
      <div className="mobile-device-simulator">
        <div className="mobile-screen-viewport">
          {/* iPhone 17 Premium Dynamic Island Pill Camera */}
          <div className="iphone-dynamic-island" />
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>

          {/* CampAi Transition Overlay */}
          {aiTransition && (
            <motion.div
              style={{
                position: 'absolute',
                left: aiTransition.x - 150,
                top: aiTransition.y - 150,
                width: 300,
                height: 300,
                borderRadius: '50%',
                zIndex: 99999,
                pointerEvents: aiTransition.stage === 'expanding' ? 'auto' : 'none',
                background: 'radial-gradient(circle, var(--m3-primary) 0%, var(--m3-surface-container) 50%, var(--m3-home-surface) 100%)',
                filter: 'blur(36px)',
                transformOrigin: 'center center',
              }}
              initial={{
                scale: 0.1,
                opacity: 1,
              }}
              animate={
                aiTransition.stage === 'expanding'
                  ? {
                      scale: 10,
                      opacity: 1,
                    }
                  : {
                      scale: 10,
                      opacity: 0,
                    }
              }
              transition={
                aiTransition.stage === 'expanding'
                  ? {
                      scale: { duration: 1.8, ease: [0.16, 1, 0.3, 1] },
                    }
                  : {
                      opacity: { delay: 0.3, duration: 0.5, ease: 'easeOut' },
                    }
              }
              onAnimationComplete={() => {
                if (aiTransition.stage === 'expanding') {
                  setActiveTab('campai');
                  setAiTransition((prev) => (prev ? { ...prev, stage: 'fading' } : null));
                } else if (aiTransition.stage === 'fading') {
                  setAiTransition(null);
                }
              }}
            />
          )}
        </div>
      </div>
    </IconContext.Provider>
  );
}

// 🎫 Canteen Ticket Glass Popup Modal with live countdown timer
function CanteenTicketModal({ order, onClose, onRemove }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      if (!order || !order.Timestamp) {
        setTimeLeft('Expired');
        return;
      }
      const orderTime = new Date(order.Timestamp).getTime();
      const expiryTime = orderTime + 20 * 60 * 1000; // 20 mins expiration window
      const remainingMs = expiryTime - Date.now();
      
      if (remainingMs <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      setTimeLeft(`Expires in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order]);

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-6" onClick={onClose}>
      <div 
        className="w-full max-w-[320px] m3-frosted-dialog rounded-[28px] shadow-2xl py-6 px-5 flex flex-col items-center relative overflow-hidden select-none animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header with Title and Ticket Icon */}
        <div 
          className="flex items-center justify-between w-full pb-3 mb-4"
          style={{ borderBottom: '1px solid color-mix(in srgb, var(--m3-outline-variant) 55%, transparent)' }}
        >
          <span className="text-m3-primary font-bold uppercase tracking-wider text-[10px]">Canteen Slip</span>
          <Ticket size={18} className="text-m3-primary/70" />
        </div>

        {/* Live Timer Indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-m3-errorContainer/10 border border-transparent text-m3-error rounded-full text-[9px] font-bold tracking-wider uppercase mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-m3-error animate-pulse"></span>
          {timeLeft}
        </div>

        <span className="text-m3-onSurfaceVariant text-[10px] font-bold uppercase tracking-widest mt-1">Pickup PIN</span>
        <div className="my-4 text-5xl font-black tracking-widest text-m3-onSurface select-all">
          {order.PickupPIN}
        </div>

        {/* Order Items List */}
        <div className="w-full mt-1 mb-2 py-3 text-left flex flex-col gap-2 max-h-[140px] overflow-y-auto scrollbar-none font-sans" style={{ borderTop: '1px solid color-mix(in srgb, var(--m3-outline-variant) 50%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--m3-outline-variant) 50%, transparent)' }}>
          <span className="text-m3-onSurfaceVariant text-[8px] font-bold uppercase tracking-wider block mb-1">Order Items</span>
          {order.ItemsArray && order.ItemsArray.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-[10px] text-m3-onSurfaceVariant font-medium">
              <span className="pr-2 truncate">{item.Name}</span>
              <span className="font-bold text-m3-primary shrink-0">x{item.Quantity}</span>
            </div>
          ))}
        </div>

        <div className="w-full mt-1 flex flex-col gap-2.5 text-left font-sans">
          <div className="flex justify-between items-center text-[10px] font-bold text-m3-onSurfaceVariant">
            <span>Customer:</span>
            <span className="font-bold text-m3-onSurface">{order.StudentName || 'Student'}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-m3-onSurfaceVariant">
            <span>Total Amount:</span>
            <span className="text-xs font-black text-m3-tertiary">₹{order.TotalAmount || 0}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-m3-onSurfaceVariant">
            <span>Items Count:</span>
            <span className="font-bold text-white">{order.ItemCount || 0} items</span>
          </div>
        </div>

        {/* Action Buttons inside modal */}
        <div className="w-full mt-6 flex flex-col gap-2.5">
          <button
            onClick={onClose}
            className="w-full py-3 bg-m3-primary text-m3-onPrimary hover:brightness-110 active:scale-[0.97] font-bold rounded-2xl shadow-lg transition-all duration-300 text-[10px] uppercase tracking-wider cursor-pointer text-center flex items-center justify-center gap-1.5"
            data-haptic
          >
            Dismiss Ticket
          </button>
          
          <button
            onClick={onRemove}
            className="w-full py-3 bg-transparent text-m3-error border border-m3-error/25 hover:bg-m3-error/10 active:scale-[0.97] font-bold rounded-2xl transition-all duration-300 text-[10px] uppercase tracking-wider cursor-pointer text-center flex items-center justify-center gap-1.5"
            data-haptic
            type="button"
          >
            <Trash size={12} className="text-m3-error" />
            Remove Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

// Peer Chat and Notices routes
// <Route path="/chat/:peerId" element={<PeerChat />} />
// <Route path="/notices" element={<NoticeFeed />} />
