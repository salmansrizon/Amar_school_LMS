import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddDetails } from '@/components/add-details'
import { buildingCapacity, buildingRoomTree, type BuildingRow, type RoomRow } from '@/lib/venues'
import { InstituteTabs } from '../tabs'
import { BuildingForm, DeleteVenueButton, EditToggle, RoomForm } from './venue-controls'

// Institute Seat Configuration (issue #93, docs/improvement.md §2A): buildings
// and their rooms as institute master data, exam-independent. Lives under
// /school/institute rather than /school/classes (map #91 grilling decision 8) —
// the doc frames it as institute configuration, and the seat plan is what
// consumes it. /school/classes keeps a link across.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function VenuesPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: buildings }, { data: rooms }] = await Promise.all([
    supabase.from('buildings').select('id, name').order('name'),
    supabase.from('rooms').select('id, building_id, name, capacity, is_active').order('name'),
  ])

  const buildingRows = (buildings ?? []) as BuildingRow[]
  const tree = buildingRoomTree(buildingRows, (rooms ?? []) as RoomRow[])

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <InstituteTabs active="/school/institute/venues" lang={lang} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('venues.intro', lang)}</p>
        <AddDetails label={t('venues.addBuilding', lang)}>
          <BuildingForm lang={lang} />
        </AddDetails>
      </div>

      {!tree.length ? (
        <p className="text-sm text-muted">{t('venues.noBuildings', lang)}</p>
      ) : (
        tree.map((building) => (
          <section key={building.id} className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{building.name}</h2>
                <p className="text-xs text-muted">
                  {building.rooms.length} {t('venues.rooms', lang)} · {buildingCapacity(building)}{' '}
                  {t('venues.seats', lang)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <AddDetails label={t('venues.addRoom', lang)}>
                  <RoomForm lang={lang} buildings={buildingRows} buildingId={building.id} />
                </AddDetails>
                <DeleteVenueButton
                  lang={lang}
                  kind="building"
                  id={building.id}
                  roomCount={building.rooms.length}
                />
              </div>
            </div>

            <div className="mb-4">
              <EditToggle lang={lang}>
                {(close) => <BuildingForm lang={lang} building={building} onDone={close} />}
              </EditToggle>
            </div>

            {!building.rooms.length ? (
              <p className="text-sm text-muted">{t('venues.noRooms', lang)}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className={thClass}>{t('venues.roomName', lang)}</th>
                      <th className={thClass}>{t('venues.capacity', lang)}</th>
                      <th className={thClass}>{t('venues.status', lang)}</th>
                      <th className={thClass}>{t('venues.actions', lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {building.rooms.map((room) => (
                      <tr key={room.id} className="border-b border-line align-top">
                        <td className={`${tdClass} font-medium`}>{room.name}</td>
                        <td className={tdClass}>{room.capacity}</td>
                        <td className={tdClass}>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              room.is_active ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
                            }`}
                          >
                            {t(room.is_active ? 'venues.active' : 'venues.inactive', lang)}
                          </span>
                        </td>
                        <td className={`${tdClass} space-y-2`}>
                          <EditToggle lang={lang}>
                            {(close) => (
                              <RoomForm lang={lang} buildings={buildingRows} room={room} onDone={close} />
                            )}
                          </EditToggle>
                          <DeleteVenueButton lang={lang} kind="room" id={room.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </main>
  )
}
