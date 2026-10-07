---
status: accepted
---

# Windows Attendance Agent with device drivers

Attendance hardware is integrated through a **Windows Attendance Agent** installed on a PC on the School's LAN. The Agent talks to the devices on the LAN and to the cloud over outbound HTTPS only. Cloud and browser code never connect to a LAN device. This is how the owner resolved OD-1 on 2026-10-06. The design is the Machine Attendance Architecture Baseline v1.1 (`docs/machine_attendance_device_agent_implementation_plan.md`), and the Wayfinder (`docs/machine_attendance_wayfinder.md`) maps where each part lives. This ADR records the decisions; those two documents hold the detail.

## Decision

- **Integration path.** The Agent reads devices on the LAN and sends their data to the cloud. The cloud sends work to it as commands that the Agent polls for. Nothing ever connects from the cloud into a School's LAN, and no device port is exposed to the Internet.
- **Device drivers.** All vendor behaviour sits behind one replaceable driver contract (`IAttendanceDeviceDriver`, in the separate `attendance-agent` repository). Agent Core, cloud APIs and the database never name a vendor SDK.
- **Driver bridges.** A native, COM, bitness-constrained or crash-prone vendor SDK runs in an isolated **Driver Bridge** process. A safe managed driver may run in-process. The first proven case is the 32-bit TIMY ActiveX SDK.
- **Resolving Agent events.** An Agent Attendance Event resolves to a person through the **Enrollment Episode** valid at punch time for `(machine_id, machine_user_id)`. There is never a direct School-wide lookup by ID.
- **Legacy card taps.** Card taps from the existing ingest path (ADR 0001) keep their card-based resolution through Machine Enrollment.
- **Attendance day.** `attendance_date` is School-local. The server converts device-local wall time to UTC using the machine's or School's configured time zone. A time the Agent computes is only a cross-check, never the stored value.
- **Reconciliation schedule.** `attendance_reconcile_dates` is the reconciliation schedule's source of truth. Every ingest re-pends the (School, day) pairs it touched. Migrations 0214 and 0215 implement this.
- **Two credential types.** Device communication keys stay on the Agent PC (DPAPI) and are never stored in the cloud. The Agent's own activation and authentication credential is separate: the Agent generates it, and the cloud stores only a verifier.
- **Machine lifecycle.** A used Attendance Machine is archived and restored, never hard-deleted. A machine that has never been used may be hard-deleted. Replacing physical hardware creates a new machine row.

## Rationale

- **No inbound access.** A cloud app cannot reach a device behind a School's router (the problem ADR 0001 started from). An on-site Agent can, and outbound-only HTTPS needs no router or firewall changes at the School.
- **Vendor variety.** Vendors differ in protocol, SDK, bitness and stability: ZKTeco, TIMY and later others. One driver contract keeps those differences out of the cloud and the database. Bridge isolation keeps a crashing or 32-bit SDK from taking down the 64-bit service, or the other devices it serves.
- **Per-device resolution.** A device user ID is only meaningful on the device that holds it, and only for the period it was assigned. Resolving through the episode valid at punch time keeps keypad-created or reused IDs from being attributed to the wrong person. It also keeps history correct after re-enrollment.
- **Local day and queue.** A School's day is local, not UTC. Late uploads, offline backlogs and re-sent batches must reconcile the day they belong to. The queue makes that independent of when the cron runs.
- **Credentials and lifecycle.** Keeping device keys off the cloud means a cloud breach cannot leak them. Archiving keeps every recorded punch tied to the device row that produced it.

## Consequences

- Schools that use the Agent need an always-on Windows PC on the LAN. Device keys are re-entered locally after reinstalling or moving the Agent.
- The ADR 0001 ingest-token path stays as the legacy card path. The Agent path is added alongside it, not instead of it.
- New database objects (Baseline §21) arrive as expand-only migrations, because staging and main share one database. The two-argument `reconcile_attendance` and the UTC index stay until main runs the queue-draining route.
- Shipping a vendor bridge depends on that SDK's licence (OD-17 for TIMY, OD-3/OD-4 for ZKTeco).
- PRD §3 and ARCHITECTURE §5 are updated to match.

## Considered options

- **Direct cloud-to-device or browser-to-device integration.** Rejected: it would need inbound access to School LANs.
- **Device push only (ADMS-style), with no Agent.** Rejected as the main path: most existing devices cannot push, and push cannot provision users or cards. It remains available for push-capable hardware.
- **One vendor SDK inside the service** (ZKTeco `zkemkeeper` only, or a Python pyzk Agent). Rejected: it ties the platform to one vendor and to that SDK's bitness, and a native crash stops every device.
- **Every driver in-process.** Rejected: the first SDK with a conflicting bitness or runtime would force the whole service down to it.
