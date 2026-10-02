import { createRfidSaveQueue, type RfidSaveQueue } from '@/lib/rfid-save-queue'
import { saveRfidEntriesAction } from './actions'

// One save queue per browser tab, held at module scope rather than in a
// component (issue #675). Switching tabs or pages inside the app unmounts the
// RFID table, but this module stays loaded, so writes still in the queue keep
// going instead of being dropped with the component. Closing or reloading the
// tab while writes are pending asks the browser to confirm first.

let queue: RfidSaveQueue | null = null

export function rfidQueue(): RfidSaveQueue {
  if (queue) return queue
  const q = createRfidSaveQueue({ send: (entries) => saveRfidEntriesAction(entries) })
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (event) => {
      if (q.pendingCount() > 0) {
        event.preventDefault()
        // Older browsers only show the prompt when returnValue is set.
        event.returnValue = ''
      }
    })
  }
  queue = q
  return q
}
