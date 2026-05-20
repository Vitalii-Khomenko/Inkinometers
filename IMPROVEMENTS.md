# Improvement Roadmap

## Core Constraint

The production field app must stay as one self-contained HTML file.

The target use case is smartphone operation without installation, a server, or build tools. Future improvements should preserve direct file opening in a mobile browser.

## Priority Improvements

### 1. Mobile Operator Flow

- Make the active task more obvious with stronger tab state and clearer loaded-file status.
- Add larger touch targets for search, clear, export, and reset actions.
- Keep the primary input visible after each search so repeated sensor entry is faster.
- Add a compact "last result" area that is easy to read outdoors.

### 2. Box Sorting Workflow

- Add a placed/unplaced counter for the Box Sorting tab.
- Let operators mark sensors as placed after they are put in a box.
- Highlight the active box and row in the preview after a search.
- Add an option to export only remaining unplaced sensors.

### 3. Performance for Large Files

- Avoid rendering the full box preview for very large lists by default.
- Show only the searched box first, with an option to expand the full layout.
- Build large previews with `DocumentFragment` to reduce layout work.
- Revoke generated object URLs after export actions are complete.

### 4. Data Safety

- Show a detailed import summary with total values, valid sensors, duplicates, and invalid values.
- Export ignored duplicate and invalid values into a separate report when needed.
- Add clearer warnings before replacing a loaded mapping or box sorting list.
- Keep all parsing strict: only 5- or 6-digit sensor numbers should be accepted as sensor IDs.

### 5. Offline Reliability

- Keep all processing local in the browser.
- Avoid external libraries, CDN assets, and network requests.
- Keep generated files plain text for easy sharing and inspection.
- Test on Chrome/Edge mobile and Firefox/Brave mobile where possible.

### 6. Code Maintainability Within One File

- Keep CSS, markup, and JavaScript in one HTML file, but organize the JavaScript into clear sections.
- Prefer small pure functions for parsing, sorting, placement, formatting, and validation.
- Keep tests in Python for repository validation, while the production app remains dependency-free.
- Continue updating README, audit notes, and tests after each functional change.

## Ideas to Consider Later

- Add camera/barcode scan support if the browser can do it without installation.
- Add a dark/high-contrast outdoor mode.
- Add operator notes to exported log files.
- Add optional import/export for track color settings.
- Add a printable box label format.
