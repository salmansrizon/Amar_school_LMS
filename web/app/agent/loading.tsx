import { PageSkeleton } from '@/components/page-skeleton'

// Streamed while /agent/* server queries resolve (#301).
export default function Loading() {
  return <PageSkeleton />
}
