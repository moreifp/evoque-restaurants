import { useState, useEffect } from 'react';

interface PWAInstallState {
  isIOS: boolean;
  isIOSSafari: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  
  // Detect iOS (iPhone, iPad, iPod)
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  
  // Detect if running in Safari on iOS (not Chrome, Firefox, etc.)
  const isIOSSafari = isIOS && /Safari/.test(userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(userAgent);
  
  // Detect Android
  const isAndroid = /Android/.test(userAgent);
  
  // Detect if running as standalone PWA
  const isStandalone = 
    (window.matchMedia('(display-mode: standalone)').matches) ||
    ((window.navigator as any).standalone === true) ||
    document.referrer.includes('android-app://');
  
  // Can install via beforeinstallprompt (Android/Desktop Chrome)
  const canInstall = deferredPrompt !== null && !isStandalone;

  return {
    isIOS,
    isIOSSafari,
    isAndroid,
    isStandalone,
    canInstall,
    deferredPrompt,
  };
}
