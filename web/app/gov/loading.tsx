import { PageSkeleton } from '@/components/page-skeleton'

// Streamed while /gov/* server queries resolve (#301).
export default function Loading() {
  return <PageSkeleton />
}
