'use client';

import { useBasename } from '@/hooks/useBasename';

interface BasenameDisplayProps {
  address: string;
  className?: string;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function BasenameDisplay({ address, className }: BasenameDisplayProps) {
  const { basename } = useBasename(address);

  return (
    <span className={className} title={address}>
      {basename || truncateAddress(address)}
    </span>
  );
}
