import { PageSkeleton } from '@/components/page-skeleton'

// Streamed while /distributor/* server queries resolve (#301).
export default function Loading() {
  return <PageSkeleton />
}
