# Sections Quickstart

Last updated: 2025-09-08

Overview
- Sections let you maintain separate Schedules of Events (SOE) per part/phase of a study (e.g., S1 — Open Label, S2 — Double‑Blind).
- Each section has its own anchor logic; subjects can transition between sections with a new anchor date.

Setup
- When creating a study, enable Sections and specify the initial section code/name (defaults to S1).
- Or later, go to Study Settings → Sections to add S2, S3, set order, and activate/deactivate.

Building the SOE
- Open the SOE builder. If the study has multiple sections, a Section dropdown appears above the grid.
- Select a section to view/edit its visit template. Saving writes only that section’s visits.

Subject Transitions
- From the Subjects list, click Transition on a subject.
- Choose the next section and set the new anchor date; confirm to close the current section, cancel future visits in it, and generate the next section’s visits.

APIs
- Study sections: `GET/POST /api/study-sections`, `PUT/DELETE /api/study-sections/[id]`
- Visit schedules (per section): `GET /api/visit-schedules?study_id=...&section_id=...`, `POST /api/visit-schedules`
- Subject transition: `POST /api/subject-sections/transition`

Notes
- Dosing frequency can be overridden per section; expected doses prefer the section’s frequency.
- Reporting can group by section in a follow‑up phase.

