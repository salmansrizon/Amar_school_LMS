import { PageSkeleton } from '@/components/page-skeleton'

// Streamed while /student/* server queries resolve (#301).
export default function Loading() {
  return <PageSkeleton />
}
