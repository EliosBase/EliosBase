'use client';

import { useTransactionSync } from '@/hooks/useTransactionSync';

export default function TransactionSyncBridge() {
  useTransactionSync();
  return null;
}
