import Link from 'next/link';
import { CircleDot } from 'lucide-react';
export default function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-xl font-bold tracking-tight"
    >
      <CircleDot className="size-6 text-primary" />
      playzo<span className="text-primary">.</span>
    </Link>
  );
}
