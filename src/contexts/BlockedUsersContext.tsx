import { createContext, useContext, ReactNode } from "react";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";

interface BlockedUsersContextType {
  blockedIds: Set<string>;
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  loading: boolean;
  blockedUsers: any[];
  refetch: () => Promise<void>;
}

const BlockedUsersContext = createContext<BlockedUsersContextType | null>(null);

export function BlockedUsersProvider({ children }: { children: ReactNode }) {
  const blocked = useBlockedUsers();

  return (
    <BlockedUsersContext.Provider value={blocked}>
      {children}
    </BlockedUsersContext.Provider>
  );
}

export function useBlockedUsersContext() {
  const context = useContext(BlockedUsersContext);
  if (!context) {
    // Return a safe fallback for unauthenticated contexts
    return {
      blockedIds: new Set<string>(),
      isBlocked: () => false,
      blockUser: async () => false,
      unblockUser: async () => false,
      loading: false,
      blockedUsers: [],
      refetch: async () => {},
    };
  }
  return context;
}
