// Sync status tracking for shops
// In production, this should be stored in a database

interface SyncStatus {
  syncing: boolean;
  lastSyncTime?: Date;
  lastSyncSuccess?: boolean;
  lastSyncError?: string;
  productCount?: number;
}

const syncStatuses = new Map<string, SyncStatus>();

export function setSyncStatus(shop: string, status: Partial<SyncStatus>) {
  const current = syncStatuses.get(shop) || { syncing: false };
  syncStatuses.set(shop, { ...current, ...status });
}

export function getSyncStatus(shop: string): SyncStatus {
  return syncStatuses.get(shop) || { syncing: false };
}

export function startSync(shop: string) {
  setSyncStatus(shop, { 
    syncing: true, 
    lastSyncError: undefined 
  });
}

export function completeSyncSuccess(shop: string, productCount: number) {
  setSyncStatus(shop, {
    syncing: false,
    lastSyncTime: new Date(),
    lastSyncSuccess: true,
    lastSyncError: undefined,
    productCount,
  });
}

export function completeSyncError(shop: string, error: string) {
  setSyncStatus(shop, {
    syncing: false,
    lastSyncTime: new Date(),
    lastSyncSuccess: false,
    lastSyncError: error,
  });
}
