import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-stone-300 bg-white/80 px-2.5 py-1 text-xs font-medium text-stone-700',
        className,
      )}
      {...props}
    />
  )
}
