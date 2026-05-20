# Inkinometers Sensor Location Finder

A local, browser-based tool for finding inclinometer sensor locations by sensor serial number.

The production app is a single self-contained HTML file designed to run on a smartphone without installation, a server, or build tools. It loads plain text files locally, lets an operator search 5- or 6-digit sensor numbers, shows the matching track/location, keeps a session list of checked sensors, writes a search log, and sorts loose sensors into box layouts.

## Project Status

This project is an early working version. It is already usable as a local HTML tool, but the code is still being prepared for future refactoring and feature work.

The main runtime constraint is intentional: keep the field app as one HTML file so it can be opened directly on a phone.

## Language Policy

This project uses English only.

All UI text, browser messages, documentation, code comments, script output, commit messages, issues, and pull requests should be written in English.

## Features

- Load a `.txt` mapping file with sensor numbers and locations.
- Search by exact 5- or 6-digit sensor number.
- Support partial matching by number suffix when an exact match is not found.
- Show the location assigned to a sensor.
- Track checked sensors during the current session.
- Warn when the same sensor is checked more than once.
- Color-code sensor results by track.
- Add, update, and remove custom track colors.
- Keep default tracks locked: `U1`, `U2`, `N1`, `N2`.
- Log every search with timestamp, sensor number, and result.
- Download the current session log as `sensor_log.txt`.
- Append directly to a selected log file in browsers that support the File System Access API.
- Generate random test sensor numbers with the included Python script.
- Sort chaotic sensor number lists into physical boxes.
- Search a sorted sensor list to find the required box, row, and position.
- Export a formatted box layout using the imported file name plus `_box_layout.txt`.
- Export printable box labels using the imported file name plus `_box_labels.txt`.
- Use dark/high-contrast outdoor mode for bright field conditions.
- Use automatic, wide, or compact view modes for smartphone and laptop browsers.
- Add operator notes to exported session logs.
- Import and export track color settings.
- Detect and report duplicate sensor numbers during TXT imports.

## Files

| File | Purpose |
| --- | --- |
| `.gitignore` | Keeps Python cache files, generated TXT exports, and local scratch files out of Git. |
| `Inklinometers.html` | Main single-file web app. Contains HTML, CSS, and JavaScript. |
| `92007868-Inkl.txt` | Example sensor mapping file. |
| `sensor_log.txt` | Example/generated search log file. |
| `generate_sensor_numbers.py` | Utility script for generating random 5- and 6-digit sensor numbers. |
| `track_colors.json` | Example/default track color export that can be imported into the app. |
| `AUDIT.md` | Code audit findings and fix batches. |
| `AGENTS.md` | Project instructions for future development work. |
| `IMPROVEMENTS.md` | Smartphone-first improvement and optimization roadmap. |
| `LICENSE` | MIT license for free use, modification, and distribution. |
| `tests/test_project.py` | Python unittest coverage for generator behavior, app audit regressions, and documentation sync. |
| `README.md` | Project documentation. |

## Sensor Mapping Format

The mapping file must be plain text. Each line starts with the sensor number, followed by location fields.

Example:

```txt
75856   U1  1   MQ001
102301  U1  1   MQ015
151336  U2  1   MQ001
154234  U2  4   MQ246
```

The app accepts tab-separated or space-separated values. The first value is treated as the sensor number. Everything after it is treated as the location.

The uploaded file must include the default track names `U1`, `U2`, `N1`, and `N2`, because the current app validates that all default tracks exist in the mapping.

## How to Use the Web App

1. Open `Inklinometers.html` in a browser.
2. Load a sensor mapping `.txt` file.
3. Enter a 5- or 6-digit sensor number.
4. Click **Show location**.
5. Use **Download session log** to save the current session log if needed.

No server is required. All data is processed locally in the browser.

Use **Outdoor mode** when bright field conditions require stronger contrast.

Use **View: Auto** to let the app choose the layout from the browser width. Click the view button to cycle through **Auto**, **Wide**, and **Compact**. Wide mode is more comfortable on laptop browsers, while compact mode keeps the smartphone layout even in a larger window.

## Box Sorting

Use the **Box Sorting** tab when you have a chaotic TXT file with loose sensor numbers and need to place them into physical boxes.

Workflow:

1. Load a `.txt` file containing 5- or 6-digit sensor numbers.
2. The app sorts all valid unique sensor numbers in ascending order.
3. The sorted list is split into boxes of 24 sensors.
4. Each box is arranged as 3 rows x 8 positions.
5. Enter a sensor number to see its box, row, and position.
6. Export the formatted layout. The export filename uses the imported file name plus `_box_layout.txt`.
7. Export printable labels. The label filename uses the imported file name plus `_box_labels.txt`.

Example placement:

```txt
Sensor 151336: Box 2, Row 1, Position 5.
```

The exported TXT includes the source file name and export date/time.

Export format example:

```txt
Sensor Box Layout
Source file: sensor_numbers_20260520_073634.txt
Exported at: 2026-05-20T07:45:00.000Z
Total sensors: 24
Box capacity: 24 sensors (3 rows x 8)

Box 1
Position:     1      2      3      4      5      6      7      8
Row 1:    75856  93127  93157  93173  94632  95685  95700  96289
Row 2:    97117  97252  97461  97798  99925 102301 102766 102796
Row 3:   103349 103509 103519 103810 104001 104002 104003 104004
```

Invalid values and duplicate sensor numbers are ignored and counted in the status message.
Duplicate sensor numbers are listed in the status message and in the exported box layout metadata.

If the imported file is named `sensor_numbers_20260520_073634.txt`, the export file is named:

```txt
sensor_numbers_20260520_073634_box_layout.txt
```

The printable label export uses:

```txt
sensor_numbers_20260520_073634_box_labels.txt
```

## Track Colors

Open the **Track Colors** tab to manage track color settings.

Default tracks:

| Track | Default color |
| --- | --- |
| `U1` | `#2a65ea` |
| `U2` | `#1ec47c` |
| `N1` | `#ad3ee6` |
| `N2` | `#ffd600` |

Default tracks are starter settings. Their colors can be updated, and they can also be removed. The app uses the starter tracks again only when no saved track color settings exist.

Track color settings are stored in browser `localStorage`.

Use **Export track colors** to download a JSON backup, and use **Import track colors** to restore or move settings to another device. The repository includes `track_colors.json` as an example import file.

## Logging

Each search creates one log line:

```txt
2025-05-14T16:08:17.237Z    154234  U2 4 MQ246
2025-05-14T16:08:22.238Z    999999  NOT FOUND
```

Chrome and Edge can append searches directly to a selected log file when file access is allowed. Other browsers keep the log in memory for the current session and provide a download link.

Optional operator notes are included in the downloaded session log.

## Generate Test Sensor Numbers

Use the Python script to generate random sensor numbers:

```powershell
python generate_sensor_numbers.py
```

The script asks how many numbers to generate and creates a file named like:

```txt
sensor_numbers_20260520_071734.txt
```

Generated files contain one unique sensor number per line. The script generates both 5-digit and 6-digit numbers, then shuffles the final output to simulate chaotic incoming data.

## Tests

Run the test suite with:

```powershell
python -m unittest discover -s tests
```

The tests use only the Python standard library. They cover the sensor number generator, key HTML app audit regressions, box sorting feature checks, documentation sync, and the English-only text-file policy.

## Audit

The current audit is tracked in `AUDIT.md`.

All recorded audit findings are closed:

- Unsafe dynamic rendering was replaced with DOM rendering and `textContent`.
- Ambiguous suffix lookup now shows an ambiguous result instead of choosing the first match.
- Duplicate/progress tracking now uses canonical sensor IDs.
- Persistent log file selection is an explicit user action.
- Track color storage is parsed and validated safely.
- Old log download object URLs are revoked.
- Reset now removes only app-owned storage.
- Inline event handlers were replaced with event listeners.

## Browser Compatibility

- Chrome: recommended, supports persistent log file writing.
- Edge: recommended, supports persistent log file writing.
- Firefox: works, but log writing is session/download based.
- Brave: works, but log writing is session/download based.

## Privacy

The app is fully local:

- No backend server.
- No network requests.
- Uploaded mapping files stay in the browser.
- Logs are saved only when the user chooses to save or download them.

## Roadmap Ideas

See `IMPROVEMENTS.md` for the smartphone-first optimization roadmap. The production app should remain a single HTML file.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
