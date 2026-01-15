import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useDespiaNative, NativeCapabilities, DespiaSDK } from '@/hooks/useDespiaNative';

interface DespiaContextValue extends NativeCapabilities {
  isReady: boolean;
  despia: DespiaSDK | undefined;
}

const DespiaContext = createContext<DespiaContextValue | null>(null);

interface DespiaProviderProps {
  children: ReactNode;
}

export function DespiaProvider({ children }: DespiaProviderProps) {
  const nativeState = useDespiaNative();

  // Add body class for Despia native to enable extra safe area padding
  useEffect(() => {
    if (nativeState.isNative) {
      document.body.classList.add('despia-native');
    } else {
      document.body.classList.remove('despia-native');
    }
    
    return () => {
      document.body.classList.remove('despia-native');
    };
  }, [nativeState.isNative]);

  return (
    <DespiaContext.Provider value={nativeState}>
      {children}
    </DespiaContext.Provider>
  );
}

export function useDespia(): DespiaContextValue {
  const context = useContext(DespiaContext);
  
  if (!context) {
    // Return default web values if used outside provider
    return {
      isNative: false,
      platform: 'web',
      hasNotifications: false,
      hasCamera: false,
      hasBiometrics: false,
      hasLocation: false,
      isReady: true,
      despia: undefined,
    };
  }
  
  return context;
}
