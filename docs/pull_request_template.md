## Summary
What changed and why, in two or three sentences. Lead with what a player sees.

## Plan
docs/plans/YYYY-MM-DD-slug.md (step N), or "Small change, no plan".

## Changes
- One bullet per meaningful change, grouped by area.

## Contract and data model
Changes to packages/contracts, api.ts signatures, or MongoDB collections. "None" if none.

## How to test
Steps a reviewer can follow locally or on the cluster, including the tricky cases.

## Screenshots
For UI changes: desktop and phone width. Mock data only.

## Checklist
- [ ] All checks under Commands in CLAUDE.md pass locally
- [ ] No game files, save files, secrets, or real account data in the diff, commits, or this description
- [ ] Plan updated (steps ticked, decisions recorded), if there is one
- [ ] docs/spec.md updated, if behaviour changed
