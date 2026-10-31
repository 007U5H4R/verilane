import Image from "next/image";

/** `compact`: the icon rail's and mobile top bar's shrunk card (Design.md §13, 104px max on mobile). */
export function LogoCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md bg-white ${compact ? "p-1.5" : "p-2"}`}
    >
      <Image
        src="/brand/verilane-logo.png"
        alt="Verilane"
        width={150}
        height={32}
        className={`h-auto w-full ${compact ? "max-w-[104px]" : "max-w-[150px]"}`}
        priority
      />
    </div>
  );
}
