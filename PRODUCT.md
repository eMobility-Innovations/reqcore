# Reqcore — Product Vision & Goals

## The ATS for High-Volume Applicant Flow

Reqcore is an open-source Applicant Tracking System (ATS) built for teams that receive a high volume of applications. It turns a flood of applicants into a trustworthy shortlist, fast.

## Problem Statement

Modern ATS platforms suffer from three structural problems:

1. **Applicant Overload**: Easy-Apply and AI-generated mass applications mean roles routinely draw hundreds to thousands of applicants. Most ATS platforms just store the pile — they don't help anyone get through it.
2. **Opaque AI**: Incumbent platforms use proprietary algorithms to rank candidates. Recruiters cannot see *why* a candidate was surfaced or rejected — creating legal and ethical liability.
3. **Per-Seat Tax**: Adding a hiring manager or recruiter to the platform increases the software bill, punishing growing teams.

## Unique Value Proposition (UVP)

### 1. Built for the Flood
Reqcore is engineered around one job: taking a high volume of inbound applicants and getting a hiring team to a trustworthy shortlist fast, without capping how many applicants they can receive.

### 2. Auditable Intelligence
Planned AI features will expose ranking logic in a visible **Matching Logic** summary so recruiters can verify and override results. No secret algorithms.

### 3. No Per-Seat Pricing
Reqcore is designed to let companies scale their hiring teams without increasing their software bill.

### 4. Open Source and Self-Hostable
Reqcore is licensed under the AGPLv3 and can be self-hosted with Docker Compose (best-effort, unsupported — see [SELF-HOSTING.md](SELF-HOSTING.md)). A small set of paid, cloud-only features live under [`ee/`](ee) on a separate commercial license; the core hiring/scoring workflow never depends on it.

## Target Users

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Recruiter** | Day-to-day user managing candidates and pipeline | Fast candidate pipeline, clean UI, minimal friction |
| **Hiring Manager** | Reviews candidates, makes hiring decisions | Clear candidate comparisons, process visibility |
| **HR Administrator** | Manages org settings, team access, compliance | Multi-tenant control, audit trails |

### Who this is for

- **Businesses with continuous high-volume hiring** — staffing/recruitment agencies, BPOs/call centers, home/healthcare staffing, multi-unit franchise groups
- **Any SMB drowning in applicants** for a role (remote/entry-level postings routinely draw 250–1,000+ applications)
- **Not for**: occasional/accidental hirers with low applicant volume, or teams that need a large enterprise suite before they need high-throughput applicant review

## Core Features (Current & Planned)

### MVP — Foundation
- [x] Multi-tenant organizations (Better Auth + org plugin)
- [x] Job management (CRUD with status workflow: draft → open → closed → archived)
- [x] Candidate management (per-org candidate pool with deduplication by email)
- [x] Application tracking (link candidates to jobs, status workflow)
- [x] Document storage (resumes, cover letters via MinIO/S3)
- [x] Dashboard with pipeline overview
- [x] Organic SEO (sitemap, robots, JSON-LD structured data, blog content engine)

### Phase 2 — Intelligence
- [ ] Resume parsing (PDF → structured JSON)
- [ ] AI candidate ranking with visible **Matching Logic** summary
- [ ] Skill extraction and matching

### Phase 3 — Collaboration
- [ ] Team comments and notes on candidates
- [ ] Interview scheduling
- [ ] Email integration (send/receive from within Reqcore)
- [ ] Candidate portal (self-service application status)

## Design Principles

1. **Show the Proof**: Decisions should be backed by visible data. If a skill matched, highlight it. If a candidate is ranked highly, show why.
2. **Developer-First UX**: Every screen should feel like a tool built by engineers — fast, keyboard-friendly, no unnecessary friction.
3. **Progressive Disclosure**: Show summaries first, details on demand. Don't overwhelm with data.
4. **Tone**: Professional, high-integrity, and engineering-grade. No marketing fluff in the UI.

## Success Metrics

- **Time to first hire**: How quickly can a new org go from setup to first candidate hired?
- **Transparency score**: % of AI decisions with visible matching logic
- **Time to shortlist**: How quickly a high-volume applicant pool becomes a trustworthy shortlist
- **Team adoption**: Number of users per org (validates anti-seat-pricing model)
