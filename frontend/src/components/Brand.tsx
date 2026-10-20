import Link from 'next/link';
import Image from 'next/image';
export default function Brand() {
  return (
    <Link
      href="/"
      aria-label="playhud home"
      className="inline-flex shrink-0 items-center"
    >
      <Image
        src="/icons/Playhud%20Indigo%20Gradient%20Logo.png"
        alt="playhud"
        width={1983}
        height={793}
        priority
        className="h-auto w-40 rounded-md sm:w-44"
      />
    </Link>
  );
}
