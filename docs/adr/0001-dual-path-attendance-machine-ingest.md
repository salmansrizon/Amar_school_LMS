---
status: accepted
---

# Dual-path ingest for attendance-machine sync

The legacy desktop app talks to RFID/biometric attendance machines directly over the school's LAN. A cloud web app can't reach a machine sitting behind a school's router, so on-site hardware needs a way to get data to us. Rather than requiring every school to own push-capable ("ADMS"-style) hardware, we support two ingest paths into the same per-School attendance API endpoint: (1) devices that support pushing logs directly to a cloud URL are configured to POST straight to it, and (2) a small local bridge agent is offered for schools whose existing machines can't push, polling the LAN device and forwarding records to the same endpoint. This avoids forcing hardware upgrades on existing schools while not building a permanent on-site-agent dependency for schools with newer equipment.
