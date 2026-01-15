import React, { createContext, useContext, ReactNode } from 'react';
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
