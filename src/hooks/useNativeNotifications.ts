import { useCallback } from 'react';
import { useDespia } from '@/contexts/DespiaContext';
import { supabase } from '@/integrations/supabase/client';
import type { LocalNotificationOptions } from './useDespiaNative';

interface ScheduleReminderOptions {
  visitId: string;
  restaurantName: string;
  scheduledAt: Date;
  reminderMinutesBefore: number;
}

export function useNativeNotifications() {
  const { isNative, despia, hasNotifications } = useDespia();

  // Request notification permission (only for native)
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNative || !despia || !hasNotifications) {
      return false;
    }

    try {
      return await despia.notifications.requestPermission();
    } catch (error) {
      console.error('[NativeNotifications] Error requesting permission:', error);
      return false;
    }
  }, [isNative, despia, hasNotifications]);

  // Schedule a local reminder for a reservation
  const scheduleReservationReminder = useCallback(async ({
    visitId,
    restaurantName,
    scheduledAt,
    reminderMinutesBefore,
  }: ScheduleReminderOptions): Promise<string | null> => {
    if (!isNative || !despia || !hasNotifications) {
      return null;
    }

    try {
      const reminderTime = new Date(scheduledAt.getTime() - reminderMinutesBefore * 60 * 1000);
      
      // Don't schedule if the reminder time is in the past
      if (reminderTime <= new Date()) {
        console.log('[NativeNotifications] Reminder time is in the past, skipping');
        return null;
      }

      const notificationOptions: LocalNotificationOptions = {
        title: 'Reservation Reminder',
        body: `Your reservation at ${restaurantName} is in ${reminderMinutesBefore} minutes`,
        scheduledAt: reminderTime,
        data: { visitId, type: 'reservation_reminder' },
        sound: true,
      };

      const notificationId = await despia.notifications.scheduleLocal(notificationOptions);
      
      // Store the notification ID in the database
      await supabase
        .from('scheduled_visits')
        .update({ local_notification_id: notificationId })
        .eq('id', visitId);

      console.log('[NativeNotifications] Scheduled reminder:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('[NativeNotifications] Error scheduling reminder:', error);
      return null;
    }
  }, [isNative, despia, hasNotifications]);

  // Cancel a scheduled local notification
  const cancelReminder = useCallback(async (notificationId: string): Promise<void> => {
    if (!isNative || !despia || !hasNotifications) {
      return;
    }

    try {
      await despia.notifications.cancelLocal(notificationId);
      console.log('[NativeNotifications] Cancelled reminder:', notificationId);
    } catch (error) {
      console.error('[NativeNotifications] Error cancelling reminder:', error);
    }
  }, [isNative, despia, hasNotifications]);

  // Get push notification token for remote notifications
  const getPushToken = useCallback(async (): Promise<string | null> => {
    if (!isNative || !despia || !hasNotifications) {
      return null;
    }

    try {
      const token = await despia.notifications.getToken();
      return token;
    } catch (error) {
      console.error('[NativeNotifications] Error getting push token:', error);
      return null;
    }
  }, [isNative, despia, hasNotifications]);

  // Register push token with backend
  const registerPushToken = useCallback(async (): Promise<boolean> => {
    if (!isNative || !despia || !hasNotifications) {
      return false;
    }

    try {
      const token = await getPushToken();
      if (!token) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.functions.invoke('register-push-token', {
        body: { token, platform: despia.getPlatform() },
      });

      if (error) {
        console.error('[NativeNotifications] Error registering token:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[NativeNotifications] Error registering push token:', error);
      return false;
    }
  }, [isNative, despia, hasNotifications, getPushToken]);

  return {
    isAvailable: isNative && hasNotifications,
    requestPermission,
    scheduleReservationReminder,
    cancelReminder,
    getPushToken,
    registerPushToken,
  };
}
