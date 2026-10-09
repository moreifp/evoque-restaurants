import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Camera, Lock, LogOut, Fingerprint, Bell, Smartphone, Globe, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageVariants";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { useDespia } from "@/contexts/DespiaContext";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useNativeNotifications } from "@/hooks/useNativeNotifications";
export default function Account() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language, setLanguage } = useI18n();
  
  // Native features - only active on iOS app
  const { isNative } = useDespia();
  const { isAvailable: biometricAvailable, isEnabled: biometricEnabled, enableBiometric, disableBiometric, getBiometricLabel } = useBiometricAuth();
  const { isAvailable: notificationsAvailable, requestPermission, registerPushToken } = useNativeNotifications();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // Delete account state
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Profile state
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email || "");
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setDisplayName(profile.display_name || "");
        setAvatarUrl(profile.avatar_url || "");
      }
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Avatar: JPEG 512 px (cai para o original se não decodificar)
      const avatar = await compressImage(file, 512, 0.85);
      const filePath = `avatars/${user.id}/${Date.now()}.${avatar.ext}`;

      const { error: uploadError } = await supabase.storage
        .from("restaurant-photos")
        .upload(filePath, avatar.file, {
          cacheControl: "31536000",
          contentType: avatar.file.type || undefined,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant-photos")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast({ title: t("account.avatarUploaded") });
    } catch (error: any) {
      toast({
        title: "Error uploading photo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: t("account.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t("account.passwordTooShort"),
        description: t("account.passwordTooShort"),
        variant: "destructive",
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({ title: t("account.passwordChanged") });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Error updating password",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Signed out successfully" });
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirmed) return;
    
    setDeleteLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No active session");
      }

      const response = await supabase.functions.invoke("delete-account", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to delete account");
      }

      toast({ title: t("account.deleteSuccess") });
      setDeleteDialogOpen(false);
      // Clear local session to trigger redirect to login
      await supabase.auth.signOut();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: t("account.deleteFailed"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
      setDeleteConfirmed(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <h1 className="text-3xl font-bold mb-8">{t("navigation.account")}</h1>

        <div className="max-w-3xl space-y-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t("account.profile")}</CardTitle>
              <CardDescription>{t("account.profile")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback className="text-2xl">
                      {displayName?.charAt(0)?.toUpperCase() || email?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <label htmlFor="avatar-upload">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                      disabled={uploading}
                      asChild
                    >
                      <span>
                        <Camera className="h-4 w-4" />
                      </span>
                    </Button>
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{displayName || "No name set"}</h3>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
              </div>
            </CardContent>
          </Card>

          {/* Password Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t("account.changePassword")}
              </CardTitle>
              <CardDescription>{t("account.password")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("account.newPassword")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("account.newPassword")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("account.confirmPassword")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("account.confirmPassword")}
                  />
                </div>
                <Button type="submit" disabled={passwordLoading}>
                  {passwordLoading ? t("account.changing") : t("account.changePassword")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Native Features Section - Only visible on iOS native app */}
          {isNative && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Native Features
                </CardTitle>
                <CardDescription>Settings available only in the iOS app</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Biometric Login */}
                {biometricAvailable && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Fingerprint className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{getBiometricLabel()} Login</p>
                        <p className="text-sm text-muted-foreground">
                          Sign in quickly with {getBiometricLabel()}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={biometricEnabled}
                      onCheckedChange={async (checked) => {
                        if (checked) {
                          const success = await enableBiometric();
                          if (success) {
                            toast({ title: `${getBiometricLabel()} enabled` });
                          }
                        } else {
                          const success = await disableBiometric();
                          if (success) {
                            toast({ title: `${getBiometricLabel()} disabled` });
                          }
                        }
                      }}
                    />
                  </div>
                )}

                {/* Push Notifications */}
                {notificationsAvailable && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Push Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Get notified about reservations and updates
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={async (checked) => {
                        if (checked) {
                          const granted = await requestPermission();
                          if (granted) {
                            await registerPushToken();
                            setNotificationsEnabled(true);
                            toast({ title: "Notifications enabled" });
                          } else {
                            toast({ 
                              title: "Permission denied", 
                              description: "Please enable notifications in your device settings",
                              variant: "destructive" 
                            });
                          }
                        } else {
                          setNotificationsEnabled(false);
                          toast({ title: "Notifications disabled" });
                        }
                      }}
                    />
                  </div>
                )}
              </CardContent>
          </Card>
          )}

          {/* Preferences Section - Language */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t("account.preferences")}
              </CardTitle>
              <CardDescription>{t("account.languageDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t("account.language")}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "English" : "Português"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={language === "en" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("en")}
                  >
                    🇺🇸 EN
                  </Button>
                  <Button
                    variant={language === "pt" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("pt")}
                  >
                    🇧🇷 PT
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone - Account Deletion */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t("account.dangerZone")}
              </CardTitle>
              <CardDescription>{t("account.deleteAccountDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (!open) setDeleteConfirmed(false);
              }}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("account.deleteAccount")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      {t("account.deleteAccountTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-4">
                      <p>{t("account.deleteAccountWarning")}</p>
                      <p className="whitespace-pre-line text-sm bg-muted p-3 rounded-md">
                        {t("account.deleteAccountList")}
                      </p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex items-center space-x-2 py-4">
                    <Checkbox 
                      id="delete-confirm" 
                      checked={deleteConfirmed}
                      onCheckedChange={(checked) => setDeleteConfirmed(checked === true)}
                    />
                    <label 
                      htmlFor="delete-confirm" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {t("account.deleteAccountConfirm")}
                    </label>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={!deleteConfirmed || deleteLoading}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteLoading ? t("account.deleting") : t("account.deleteAccount")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Sign Out */}
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("account.signOut")}
          </Button>
        </div>
      </main>
    </div>
  );
}