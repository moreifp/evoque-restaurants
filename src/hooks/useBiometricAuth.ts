import { useCallback, useState, useEffect } from 'react';
import { useDespia } from '@/contexts/DespiaContext';
import { supabase } from '@/integrations/supabase/client';
import type { BiometricType } from './useDespiaNative';

interface BiometricState {
  isAvailable: boolean;
  isEnabled: boolean;
  biometricType: BiometricType;
}

export function useBiometricAuth() {
  const { isNative, despia, hasBiometrics } = useDespia();
  const [state, setState] = useState<BiometricState>({
    isAvailable: false,
    isEnabled: false,
    biometricType: 'none',
  });
  const [loading, setLoading] = useState(true);

  // Check if biometrics is enabled for current user
  useEffect(() => {
    const checkBiometricState = async () => {
      if (!isNative || !despia || !hasBiometrics) {
        setState({ isAvailable: false, isEnabled: false, biometricType: 'none' });
        setLoading(false);
        return;
      }

      try {
        // Check device capability
        const biometricType = await despia.biometrics.isAvailable();
        const isAvailable = biometricType !== 'none';

        // Check user preference from database
        const { data: { user } } = await supabase.auth.getUser();
        let isEnabled = false;

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('biometric_enabled')
            .eq('id', user.id)
            .single();

          isEnabled = profile?.biometric_enabled || false;
        }

        setState({ isAvailable, isEnabled, biometricType });
      } catch (error) {
        console.error('[BiometricAuth] Error checking state:', error);
        setState({ isAvailable: false, isEnabled: false, biometricType: 'none' });
      } finally {
        setLoading(false);
      }
    };

    checkBiometricState();
  }, [isNative, despia, hasBiometrics]);

  // Authenticate using biometrics
  const authenticate = useCallback(async (reason?: string): Promise<boolean> => {
    if (!isNative || !despia || !hasBiometrics || !state.isAvailable) {
      return false;
    }

    try {
      const success = await despia.biometrics.authenticate({
        reason: reason || 'Authenticate to continue',
        fallbackLabel: 'Use password',
      });

      console.log('[BiometricAuth] Authentication result:', success);
      return success;
    } catch (error) {
      console.error('[BiometricAuth] Error authenticating:', error);
      return false;
    }
  }, [isNative, despia, hasBiometrics, state.isAvailable]);

  // Enable biometric authentication for the user
  const enableBiometric = useCallback(async (): Promise<boolean> => {
    if (!isNative || !despia || !state.isAvailable) {
      return false;
    }

    try {
      // Verify with biometrics first
      const verified = await authenticate('Verify your identity to enable biometric login');
      if (!verified) return false;

      // Update database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('profiles')
        .update({ biometric_enabled: true })
        .eq('id', user.id);

      if (error) {
        console.error('[BiometricAuth] Error enabling biometric:', error);
        return false;
      }

      setState(prev => ({ ...prev, isEnabled: true }));
      console.log('[BiometricAuth] Biometric enabled');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error enabling biometric:', error);
      return false;
    }
  }, [isNative, despia, state.isAvailable, authenticate]);

  // Disable biometric authentication
  const disableBiometric = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      return false;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('profiles')
        .update({ biometric_enabled: false })
        .eq('id', user.id);

      if (error) {
        console.error('[BiometricAuth] Error disabling biometric:', error);
        return false;
      }

      // Clear stored session
      if (despia) {
        await despia.secureStorage.remove('biometric_session');
      }

      setState(prev => ({ ...prev, isEnabled: false }));
      console.log('[BiometricAuth] Biometric disabled');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error disabling biometric:', error);
      return false;
    }
  }, [isNative, despia]);

  // Store session for biometric login
  const storeSession = useCallback(async (refreshToken: string): Promise<boolean> => {
    if (!isNative || !despia) {
      return false;
    }

    try {
      await despia.secureStorage.set('biometric_session', refreshToken);
      console.log('[BiometricAuth] Session stored');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error storing session:', error);
      return false;
    }
  }, [isNative, despia]);

  // Retrieve and use stored session for biometric login
  const biometricLogin = useCallback(async (): Promise<boolean> => {
    if (!isNative || !despia || !state.isEnabled) {
      return false;
    }

    try {
      // Authenticate with biometrics
      const verified = await authenticate('Sign in with biometrics');
      if (!verified) return false;

      // Retrieve stored session
      const refreshToken = await despia.secureStorage.get('biometric_session');
      if (!refreshToken) {
        console.log('[BiometricAuth] No stored session found');
        return false;
      }

      // Refresh the session
      const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error) {
        console.error('[BiometricAuth] Error refreshing session:', error);
        // Clear invalid session
        await despia.secureStorage.remove('biometric_session');
        return false;
      }

      console.log('[BiometricAuth] Biometric login successful');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error during biometric login:', error);
      return false;
    }
  }, [isNative, despia, state.isEnabled, authenticate]);

  // Get biometric type label
  const getBiometricLabel = useCallback((): string => {
    switch (state.biometricType) {
      case 'face':
        return 'Face ID';
      case 'fingerprint':
        return 'Touch ID';
      default:
        return 'Biometric';
    }
  }, [state.biometricType]);

  return {
    ...state,
    loading,
    authenticate,
    enableBiometric,
    disableBiometric,
    storeSession,
    biometricLogin,
    getBiometricLabel,
  };
}
