# Code Audit

## Scope

This audit covers the main browser application in `Inklinometers.html`.

The current app is a local, single-file HTML tool that loads sensor mapping files, searches sensor locations, manages track colors, and keeps a session log.

## Batch 1 Fixes

The first implementation batch covers these three items:

1. Unsafe rendering of uploaded or stored data.
2. Ambiguous suffix-based sensor lookup.
3. Duplicate/progress tracking based on raw input instead of canonical sensor IDs.

## Findings

### 1. Unsafe Rendering of Uploaded or Stored Data

Severity: High

Several UI updates use `innerHTML` with values that can come from uploaded mapping files, user input, or `localStorage`.

Affected areas:

- Sensor result rendering.
- Checked sensor list rendering.
- Track color list rendering.
- Some validation and status messages.

Impact:

A crafted mapping file or corrupted `localStorage` value could inject unexpected HTML into the app. Even though the app is local-only, this is still risky because operators load external text files.

Recommended fix:

Build UI with DOM nodes and `textContent` for dynamic text. Use `innerHTML` only for static markup or replace it entirely in dynamic paths.

Status: Fixed in batch 1.

### 2. Ambiguous Suffix-Based Sensor Lookup

Severity: High

When an exact sensor number is not found, the app falls back to `endsWith` matching and returns the first matching key.

Impact:

If multiple sensors share the same last digits, the app can silently return the wrong location. For field work, a wrong location is worse than a not-found result.

Recommended fix:

Return a structured lookup result. If a suffix search has multiple matches, show an ambiguous match warning instead of choosing one automatically.

Status: Fixed in batch 1.

### 3. Duplicate and Progress Tracking Uses Raw Input

Severity: Medium

The checked sensor set stores the operator input value. If a 5-digit suffix resolves to a 6-digit sensor, searching the full sensor number later is treated as a separate checked sensor.

Impact:

The processed count and duplicate warning can become inaccurate.

Recommended fix:

Store the canonical matched sensor ID in the checked sensor set. Use the canonical ID for repeat detection, checked list display, and progress.

Status: Fixed in batch 1.

### 4. Persistent Log File Selection Can Fail Silently

Severity: Medium

The app calls `showSaveFilePicker` from inside an asynchronous file load callback. Browser file picker APIs generally work best when called from a direct user action.

Impact:

Chrome or Edge may deny the picker without an obvious reason. The app then silently falls back to in-memory logging.

Recommended fix:

Add a dedicated "Choose log file" button or ask for log file selection from a direct click handler.

Status: Fixed in batch 2.

### 5. Corrupted `localStorage` Can Break Startup

Severity: Medium

`trackColors` is parsed directly from `localStorage` without a `try/catch` or schema validation.

Impact:

Invalid JSON or malformed values can stop the script before the UI becomes usable.

Recommended fix:

Wrap parsing in `try/catch`, validate entries, and reset only the app-specific key when invalid.

Status: Fixed in batch 2.

### 6. Blob URLs Are Never Revoked

Severity: Low

Every log download update creates a new object URL.

Impact:

Long sessions can leak browser memory.

Recommended fix:

Keep the previous object URL and call `URL.revokeObjectURL` before creating a new one.

Status: Fixed in batch 2.

### 7. Reset Clears All Local Storage for the Origin

Severity: Low

The reset action calls `localStorage.clear()`.

Impact:

If this app ever shares an origin with another local tool, the reset button can remove unrelated data.

Recommended fix:

Use app-specific storage keys and remove only those keys.

Status: Fixed in batch 3.

## Recommended Next Batches

### Batch 2

Completed:

- Made log file selection an explicit user action.
- Hardened `localStorage` parsing and validation.
- Revoked old log download object URLs.

### Batch 3

Completed:

- Replaced global inline `onclick` handlers with event listeners.
- Removed broad `localStorage.clear()` and now reset only app-owned storage.
- Grouped code into clearer parser, lookup, rendering, storage, and logging sections.

## Test Coverage

The project now includes a Python `unittest` suite in `tests/test_project.py`.

The tests cover:

- Sensor number generator output count, uniqueness, 5-/6-digit format, and shuffled ordering.
- Main app audit regressions for unsafe rendering, inline handlers, scoped storage reset, explicit log-file selection, storage validation, object URL cleanup, and ambiguous lookup handling.
- Documentation sync for README and audit status.
- ASCII-only text policy for project source and documentation files.

## Final Audit Status

All audit findings are closed.

## Post-Audit Feature Additions

### Box Sorting

Status: Added after audit closure.

The app now includes a **Box Sorting** tab for physical sensor organization.

Capabilities:

- Import a chaotic TXT list of 5- or 6-digit sensor numbers.
- Ignore invalid values and duplicate sensor numbers.
- Sort valid unique sensor numbers in ascending order.
- Split the sorted list into boxes of 24 sensors.
- Arrange each box as 3 rows x 8 positions.
- Search a sensor number to show its box, row, and position.
- Export a formatted TXT layout using the imported file name plus `_box_layout.txt`.
- Include the source file name and export timestamp inside the exported layout.

Test coverage was extended in `tests/test_project.py` for the new tab, constants, parser/sorter behavior, placement logic, source-based export naming, export metadata, export support, and README documentation.
