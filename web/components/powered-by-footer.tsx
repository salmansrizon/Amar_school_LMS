import Image from 'next/image'

export function PoweredByFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex items-center justify-end gap-1 text-[10px] text-muted ${className}`}>
      <span>Powered by</span>
      <a href="http://edumebd.com/" aria-label="Visit EdumeBD">
        <Image
          src="/images/edumebd-logo.png"
          alt="EdumeBD"
          width={108}
          height={36}
          className="h-12 w-auto"
        />
      </a>
    </footer>
  )
}
