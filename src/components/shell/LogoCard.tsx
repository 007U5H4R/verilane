import Image from "next/image";

export function LogoCard() {
  return (
    <div className="flex items-center justify-center rounded-md bg-white p-2">
      <Image
        src="/brand/verilane-logo.png"
        alt="Verilane"
        width={150}
        height={32}
        className="h-auto w-full max-w-[150px]"
        priority
      />
    </div>
  );
}
