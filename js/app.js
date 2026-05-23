    // Default mapping used before an operator imports the real sensor map.
    let sensorLocations = {
      "151336": "U2 1 MQ001",
      "97720": "U1 2 MQ014",
      "12345": "N1 3 MQ010",
      "65432": "N2 4 MQ003"
    };

    // Runtime state shared between tabs. Keep it in memory so the app stays single-file.
    let totalSensors = Object.keys(sensorLocations).length;
    const foundSensors = new Set();
    let logLines = [];
    let currentLogDownloadUrl = null;
    let boxSensorNumbers = [];
    let boxSourceFileName = '';
    let boxDuplicateNumbers = [];
    let boxImportStats = { invalidCount: 0, duplicateCount: 0 };
    let boxLayoutSettings = { rowCount: 3, rowSize: 8 };
    let currentBoxExportUrl = null;
    let currentBoxLabelsUrl = null;
    let currentManualExportUrl = null;

    // Storage keys and default box layout values. The active layout can be changed in the Box Sorting tab.
    const TRACK_COLORS_STORAGE_KEY = 'trackColors';
    const OUTDOOR_MODE_STORAGE_KEY = 'outdoorMode';
    const VIEW_MODE_STORAGE_KEY = 'viewMode';
    const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
    const SENSOR_NUMBER_PATTERN = /^[0-9]{5,6}$/;
    const DEFAULT_BOX_ROW_SIZE = 8;
    const DEFAULT_BOX_ROW_COUNT = 3;
    const BOX_LAYOUT_SUFFIX = 'box_layout';
    const BOX_LABELS_SUFFIX = 'box_labels';
    const VIEW_MODES = ['auto', 'wide', 'compact'];
    boxLayoutSettings = { rowCount: DEFAULT_BOX_ROW_COUNT, rowSize: DEFAULT_BOX_ROW_SIZE };
    const defaultTracks = [
      { name: 'U1', color: '#2a65ea' },
      { name: 'U2', color: '#1ec47c' },
      { name: 'N1', color: '#ad3ee6' },
      { name: 'N2', color: '#ffd600' }
    ];

    // Shared UI helpers used by multiple tabs.
    function getContrastColor(bg) {
      // Choose readable text for colored badges in both standard and outdoor modes.
      if (!bg) return '#fff';
      const c = bg.charAt(0) === '#' ? bg.substring(1, 7) : bg;
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      return (yiq >= 180) ? '#222' : '#fff';
    }

    function setResultMessage(message) {
      const resultDiv = document.getElementById('result');
      const messageSpan = document.createElement('span');
      messageSpan.id = 'notfound';
      messageSpan.textContent = message;
      resultDiv.replaceChildren(messageSpan);
    }

    function createFoundBadge(text, color) {
      const badge = document.createElement('span');
      badge.className = 'found';
      badge.textContent = text;
      if (color) {
        badge.style.background = color;
        badge.style.color = getContrastColor(color);
      }
      return badge;
    }

    function isPersistentLogSupported() {
      // The File System Access API is Chromium-only and not reliable in Brave/Firefox here.
      const isFirefox = navigator.userAgent.includes('Firefox');
      const isBrave = typeof navigator.brave !== 'undefined';
      return Boolean(window.showSaveFilePicker && !isFirefox && !isBrave);
    }

    function setLogFileStatus(message) {
      document.getElementById('logFileStatus').textContent = message;
    }

    function updateLogFileControls() {
      const chooseLogFileButton = document.getElementById('chooseLogFile');
      if (!isPersistentLogSupported()) {
        chooseLogFileButton.disabled = true;
        setLogFileStatus('Persistent log file writing is not supported in this browser. Use session download.');
        return;
      }

      chooseLogFileButton.disabled = false;
      setLogFileStatus(window._logFileHandle ? 'Persistent log file selected.' : 'No persistent log file selected. Session download is available.');
    }

    function setOutdoorMode(enabled) {
      // Outdoor mode is saved locally because field work can move between sessions.
      document.body.classList.toggle('outdoor-mode', enabled);
      localStorage.setItem(OUTDOOR_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
      document.getElementById('outdoorModeToggle').textContent = enabled ? 'Standard mode' : 'Outdoor mode';
    }

    function loadOutdoorMode() {
      setOutdoorMode(localStorage.getItem(OUTDOOR_MODE_STORAGE_KEY) === 'true');
    }

    function toggleOutdoorMode() {
      setOutdoorMode(!document.body.classList.contains('outdoor-mode'));
    }

    function setViewMode(mode) {
      // Auto follows screen width, while wide and compact force a saved layout preference.
      const normalizedMode = VIEW_MODES.includes(mode) ? mode : 'auto';
      document.body.classList.toggle('view-wide', normalizedMode === 'wide');
      document.body.classList.toggle('view-compact', normalizedMode === 'compact');
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, normalizedMode);
      document.getElementById('viewModeToggle').textContent =
        `View: ${normalizedMode.charAt(0).toUpperCase()}${normalizedMode.slice(1)}`;
    }

    function loadViewMode() {
      setViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY) || 'auto');
    }

    function toggleViewMode() {
      const currentMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY) || 'auto';
      const nextMode = VIEW_MODES[(VIEW_MODES.indexOf(currentMode) + 1) % VIEW_MODES.length] || 'auto';
      setViewMode(nextMode);
    }

    // Track color storage and import/export helpers.
    function saveTrackColors() {
      localStorage.setItem(TRACK_COLORS_STORAGE_KEY, JSON.stringify(trackColors));
    }

    function isValidTrackColorEntry(entry) {
      return Boolean(
        entry &&
        typeof entry.name === 'string' &&
        entry.name.trim() &&
        typeof entry.color === 'string' &&
        HEX_COLOR_PATTERN.test(entry.color)
      );
    }

    function loadTrackColors() {
      // Normalize saved settings. Defaults are used only before the operator saves changes.
      const storedValue = localStorage.getItem(TRACK_COLORS_STORAGE_KEY);
      if (storedValue === null) {
        return [...defaultTracks];
      }

      let parsed = [];
      try {
        parsed = JSON.parse(storedValue);
      } catch (error) {
        localStorage.removeItem(TRACK_COLORS_STORAGE_KEY);
        return [...defaultTracks];
      }

      if (!Array.isArray(parsed)) {
        localStorage.removeItem(TRACK_COLORS_STORAGE_KEY);
        return [...defaultTracks];
      }

      const uniqueEntries = [];
      const seenNames = new Set();
      for (const entry of parsed) {
        if (!isValidTrackColorEntry(entry)) continue;

        const normalizedName = entry.name.trim().toUpperCase();
        if (seenNames.has(normalizedName)) continue;

        seenNames.add(normalizedName);
        uniqueEntries.push({
          name: entry.name.trim().toUpperCase(),
          color: entry.color
        });
      }

      return uniqueEntries;
    }

    function parseTrackColorImport(text) {
      // Validate imported settings through the same normalization path used at startup.
      const parsed = JSON.parse(text);
      const importedEntries = Array.isArray(parsed) ? parsed : parsed.trackColors;
      if (!Array.isArray(importedEntries)) {
        throw new Error('Track color import must contain an array.');
      }

      const previousValue = localStorage.getItem(TRACK_COLORS_STORAGE_KEY);
      localStorage.setItem(TRACK_COLORS_STORAGE_KEY, JSON.stringify(importedEntries));
      const normalizedEntries = loadTrackColors();

      if (previousValue === null) {
        localStorage.removeItem(TRACK_COLORS_STORAGE_KEY);
      } else {
        localStorage.setItem(TRACK_COLORS_STORAGE_KEY, previousValue);
      }

      return normalizedEntries;
    }

    function exportTrackColors() {
      const payload = {
        exportedAt: new Date().toISOString(),
        trackColors
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'track_colors.json';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    // Main status rendering for checked sensor progress.
    function updateStatus(message) {
      const statusDiv = document.getElementById('status');
      statusDiv.replaceChildren(document.createTextNode(`Processed: ${foundSensors.size} / ${totalSensors} sensors`));
      if (message) {
        const lineBreak = document.createElement('br');
        const messageSpan = document.createElement('span');
        messageSpan.style.color = 'var(--error)';
        messageSpan.style.fontSize = '0.98em';
        messageSpan.textContent = message;
        statusDiv.append(lineBreak, messageSpan);
      }
    }

    // Sensor mapping parsing.
    function parseSensorFile(text) {
      // Expected input: sensor number first, location fields after it. Duplicate IDs are ignored.
      const lines = text.split(/\r?\n/);
      const mapping = {};
      const duplicateNumbers = [];
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        // Prefer tab split, then fall back to whitespace-separated text files.
        let parts = line.split('\t');
        if (parts.length < 2) {
          parts = line.split(/\s{2,}|\s+/);
        }
        if (parts.length >= 2) {
          const num = parts[0].trim();
          const location = parts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
          if (Object.prototype.hasOwnProperty.call(mapping, num)) {
            duplicateNumbers.push(num);
            continue;
          }
          mapping[num] = location;
        }
      }
      return { mapping, duplicateNumbers };
    }

    document.getElementById('fileInput').addEventListener('change', async function(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function(e) {
        const parsedFile = parseSensorFile(e.target.result);
        const mapping = parsedFile.mapping;
        // Collect all track names from imported locations and warn if defaults are missing.
        const allTrackNames = Array.from(new Set(Object.entries(mapping)
          .map(([num, location]) => {
            // Rebuild the row so existing whitespace variations do not matter.
            const line = num + ' ' + location;
            // Split by spaces and tabs to inspect the first location token as the track name.
            let parts = line.split(/\s+|\t/).filter(Boolean);
            return (parts[1] || '').toUpperCase();
          })
          .filter(Boolean)));
        let missing = [];
        for (const defaultTrack of defaultTracks) {
          if (!allTrackNames.includes(defaultTrack.name.toUpperCase())) {
            missing.push(defaultTrack.name);
          }
        }
        if (missing.length) {
          alert('Default track(s) not found in file: ' + missing.join(', ') + '\nPlease check your file.');
          return;
        }
        sensorLocations = mapping;
        totalSensors = Object.keys(sensorLocations).length;
        foundSensors.clear();
        logLines = [];
        const duplicateStatus = parsedFile.duplicateNumbers.length
          ? `Duplicate sensors ignored: ${parsedFile.duplicateNumbers.join(', ')}`
          : null;
        updateStatus(duplicateStatus);
        updateCheckedSensors();
        document.getElementById('result').replaceChildren();
        updateLogDownload();
        updateLogFileControls();
        const duplicateMessage = duplicateStatus
          ? '\n' + duplicateStatus
          : '';
        alert('Sensor mapping loaded from file!\nSensors: ' + totalSensors + '\nTracks: ' + allTrackNames.length + ' (' + allTrackNames.join(', ') + ')' + duplicateMessage);
      };
      reader.readAsText(file);
    });

    // Sensor lookup.
    function findSensor(sensorNumber) {
      // Exact matches win. Short suffix matches are allowed only when they are unambiguous.
      const numStr = String(sensorNumber).trim();
      if (Object.prototype.hasOwnProperty.call(sensorLocations, numStr)) {
        return {
          status: 'found',
          sensorId: numStr,
          location: sensorLocations[numStr],
          matches: []
        };
      }

      const matches = Object.keys(sensorLocations)
        .filter(key => key.endsWith(numStr))
        .map(sensorId => ({ sensorId, location: sensorLocations[sensorId] }));

      if (matches.length === 1) {
        return {
          status: 'found',
          sensorId: matches[0].sensorId,
          location: matches[0].location,
          matches
        };
      }

      if (matches.length > 1) {
        return {
          status: 'ambiguous',
          sensorId: null,
          location: null,
          matches
        };
      }

      return {
        status: 'not_found',
        sensorId: null,
        location: null,
        matches: []
      };
    }

    // Result rendering.
    function getTrackColorByLocation(location) {
      if (!location || !trackColors.length) return null;
      // Try to match any location token against configured track color names.
      const parts = location.trim().split(/\s+/);
      for (const t of trackColors) {
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].toLowerCase() === t.name.toLowerCase()) {
            return t.color;
          }
        }
      }
      return null;
    }

    function renderSensorResult(input, location) {
      const userColor = getTrackColorByLocation(location);
      document.getElementById('result').replaceChildren(createFoundBadge(`Location: ${location}`, userColor));
    }

    function renderAmbiguousSensorResult(input, matches) {
      const matchList = matches.map(match => match.sensorId).join(', ');
      setResultMessage(`Sensor number ${input} is ambiguous. Matches: ${matchList}.`);
    }

    // Box sorting.
    function parseBoxSensorNumbers(text) {
      // Import raw chaotic numbers, keep only valid 5/6 digit IDs, remove duplicates, and sort.
      const tokens = text.split(/\s+/).map(token => token.trim()).filter(Boolean);
      const uniqueNumbers = new Set();
      const duplicateNumbers = [];
      let invalidCount = 0;
      let duplicateCount = 0;

      for (const token of tokens) {
        if (!SENSOR_NUMBER_PATTERN.test(token)) {
          invalidCount += 1;
          continue;
        }

        if (uniqueNumbers.has(token)) {
          duplicateCount += 1;
          duplicateNumbers.push(token);
          continue;
        }

        uniqueNumbers.add(token);
      }

      const numbers = Array.from(uniqueNumbers).sort((left, right) => Number(left) - Number(right));
      return { numbers, duplicateNumbers, invalidCount, duplicateCount };
    }

    function getBoxCapacity(layout = boxLayoutSettings) {
      return layout.rowCount * layout.rowSize;
    }

    function getBoxLayoutDescription(layout = boxLayoutSettings) {
      return `${layout.rowCount} rows x ${layout.rowSize}`;
    }

    function getBoxPositionByIndex(index, layout = boxLayoutSettings) {
      // Convert the sorted list index into the physical box, row, and row position.
      const boxCapacity = getBoxCapacity(layout);
      return {
        box: Math.floor(index / boxCapacity) + 1,
        row: Math.floor((index % boxCapacity) / layout.rowSize) + 1,
        position: (index % layout.rowSize) + 1
      };
    }

    function findBoxPlacement(sensorNumber) {
      const sensorId = String(sensorNumber).trim();
      const index = boxSensorNumbers.indexOf(sensorId);
      if (index === -1) return null;

      return {
        sensorId,
        index,
        ...getBoxPositionByIndex(index)
      };
    }

    function getFileBaseName(fileName) {
      // Exported files keep the source file name and add the smallest useful suffix.
      const trimmedName = String(fileName || '').trim();
      const lastDotIndex = trimmedName.lastIndexOf('.');
      if (lastDotIndex <= 0) return trimmedName || 'sensors';

      return trimmedName.slice(0, lastDotIndex);
    }

    function getBoxLayoutFileName(sourceFileName) {
      return `${getFileBaseName(sourceFileName)}_${BOX_LAYOUT_SUFFIX}.txt`;
    }

    function getBoxLabelsFileName(sourceFileName) {
      return `${getFileBaseName(sourceFileName)}_${BOX_LABELS_SUFFIX}.txt`;
    }

    function padDatePart(value) {
      return String(value).padStart(2, '0');
    }

    function formatLocalDateTime(date) {
      return [
        date.getFullYear(),
        '-',
        padDatePart(date.getMonth() + 1),
        '-',
        padDatePart(date.getDate()),
        ' ',
        padDatePart(date.getHours()),
        ':',
        padDatePart(date.getMinutes()),
        ':',
        padDatePart(date.getSeconds())
      ].join('');
    }

    function formatDateStamp(date) {
      return [
        date.getFullYear(),
        padDatePart(date.getMonth() + 1),
        padDatePart(date.getDate()),
        '_',
        padDatePart(date.getHours()),
        padDatePart(date.getMinutes()),
        padDatePart(date.getSeconds())
      ].join('');
    }

    function getManualSensorListFileName(exportedAt = new Date()) {
      return `manual_sensors_${formatDateStamp(exportedAt)}.txt`;
    }

    function formatSingleBoxBlock(numbers, boxIndex, layout, boxCapacity) {
      const rowHeader = Array.from(
        { length: layout.rowCount },
        (_, rowIndex) => `Row ${rowIndex + 1}`.padStart(8, ' ')
      ).join(' ');
      const lines = [
        `Box ${boxIndex + 1}`,
        `Position${rowHeader}`
      ];

      for (let positionIndex = 0; positionIndex < layout.rowSize; positionIndex += 1) {
        const positionNumbers = [];
        for (let rowIndex = 0; rowIndex < layout.rowCount; rowIndex += 1) {
          const sensorIndex = (boxIndex * boxCapacity) + (rowIndex * layout.rowSize) + positionIndex;
          positionNumbers.push((numbers[sensorIndex] || '------').padStart(8, ' '));
        }
        lines.push(`${String(positionIndex + 1).padStart(8, ' ')}${positionNumbers.join(' ')}`);
      }

      return lines;
    }

    function appendBoxBlocksInPrintRows(lines, boxBlocks, boxesPerLine = 2) {
      const gap = '    ';
      for (let blockIndex = 0; blockIndex < boxBlocks.length; blockIndex += boxesPerLine) {
        const rowBlocks = boxBlocks.slice(blockIndex, blockIndex + boxesPerLine);
        const rowHeight = Math.max(...rowBlocks.map(block => block.length));
        const blockWidth = Math.max(...rowBlocks.flat().map(line => line.length));

        for (let lineIndex = 0; lineIndex < rowHeight; lineIndex += 1) {
          const rowLine = rowBlocks
            .map(block => (block[lineIndex] || '').padEnd(blockWidth, ' '))
            .join(gap)
            .trimEnd();
          lines.push(rowLine);
        }

        lines.push('');
      }
    }

    function formatBoxLayout(numbers, sourceFileName = '', exportedAt = new Date(), duplicateNumbers = [], layout = boxLayoutSettings) {
      // Human-readable export for vertical boxes: rows are columns that increase from left to right.
      const exportTimestamp = exportedAt.toISOString();
      const sourceName = sourceFileName || 'Unknown source file';
      const boxCapacity = getBoxCapacity(layout);
      const lines = [
        'Sensor Box Layout',
        `Source file: ${sourceName}`,
        `Exported at: ${exportTimestamp}`,
        `Total sensors: ${numbers.length}`,
        `Duplicate sensors ignored: ${duplicateNumbers.length ? duplicateNumbers.join(', ') : 'None'}`,
        `Box capacity: ${boxCapacity} sensors (${getBoxLayoutDescription(layout)})`,
        'Orientation: vertical box, rows increase from left to right',
        'Print layout: 2 boxes per line',
        ''
      ];

      const boxCount = Math.ceil(numbers.length / boxCapacity);
      const boxBlocks = Array.from(
        { length: boxCount },
        (_, boxIndex) => formatSingleBoxBlock(numbers, boxIndex, layout, boxCapacity)
      );
      appendBoxBlocksInPrintRows(lines, boxBlocks);

      return lines.join('\n');
    }

    function parseManualSensorList(text) {
      // Keep typed order for field work, while reporting values that cannot be exported.
      const tokens = text.split(/\s+/).map(token => token.trim()).filter(Boolean);
      const numbers = [];
      const seenNumbers = new Set();
      const duplicateNumbers = [];
      let invalidCount = 0;
      let duplicateCount = 0;

      for (const token of tokens) {
        if (!SENSOR_NUMBER_PATTERN.test(token)) {
          invalidCount += 1;
          continue;
        }

        if (seenNumbers.has(token)) {
          duplicateCount += 1;
          duplicateNumbers.push(token);
          continue;
        }

        seenNumbers.add(token);
        numbers.push(token);
      }

      return { numbers, duplicateNumbers, invalidCount, duplicateCount };
    }

    function formatManualSensorList(numbers, exportedAt = new Date(), duplicateNumbers = []) {
      const lines = [
        'Manual Sensor List',
        `Created at: ${exportedAt.toISOString()}`,
        `Local time: ${formatLocalDateTime(exportedAt)}`,
        `Total sensors: ${numbers.length}`,
        `Duplicate sensors ignored: ${duplicateNumbers.length ? duplicateNumbers.join(', ') : 'None'}`,
        '',
        ...numbers
      ];

      return lines.join('\n');
    }

    function formatBoxLabels(numbers, sourceFileName = '', exportedAt = new Date(), layout = boxLayoutSettings) {
      // Compact printable labels for physical boxes.
      const exportTimestamp = exportedAt.toISOString();
      const sourceName = sourceFileName || 'Unknown source file';
      const boxCapacity = getBoxCapacity(layout);
      const lines = [
        'Printable Box Labels',
        `Source file: ${sourceName}`,
        `Exported at: ${exportTimestamp}`,
        ''
      ];

      const boxCount = Math.ceil(numbers.length / boxCapacity);
      for (let boxIndex = 0; boxIndex < boxCount; boxIndex += 1) {
        const boxNumbers = numbers.slice(boxIndex * boxCapacity, (boxIndex + 1) * boxCapacity);
        const firstSensor = boxNumbers[0] || '------';
        const lastSensor = boxNumbers[boxNumbers.length - 1] || '------';

        lines.push('================================');
        lines.push(`BOX ${boxIndex + 1}`);
        lines.push(`Sensors: ${firstSensor} - ${lastSensor}`);
        lines.push(`Count: ${boxNumbers.length} / ${boxCapacity}`);
        lines.push(`Rows: ${getBoxLayoutDescription(layout)}`);
        lines.push('================================');
        lines.push('');
      }

      return lines.join('\n');
    }

    function setBoxSearchMessage(message, isError = true) {
      const result = document.getElementById('boxSearchResult');
      const messageSpan = document.createElement('span');
      messageSpan.className = isError ? '' : 'found';
      messageSpan.id = isError ? 'notfound' : '';
      messageSpan.textContent = message;
      result.replaceChildren(messageSpan);
    }

    function renderBoxPreview() {
      const preview = document.getElementById('boxPreview');
      preview.replaceChildren();
      if (!boxSensorNumbers.length) return;

      const previewText = formatBoxLayout(boxSensorNumbers, boxSourceFileName, new Date(), boxDuplicateNumbers);
      const previewBlock = document.createElement('div');
      previewBlock.className = 'box-preview-block';
      previewBlock.textContent = previewText;
      preview.append(previewBlock);
    }

    function setBoxSortStatus(message) {
      document.getElementById('boxSortStatus').textContent = message;
    }

    function renderBoxSortStatus() {
      if (!boxSensorNumbers.length) {
        setBoxSortStatus('');
        return;
      }

      const boxCapacity = getBoxCapacity();
      const boxCount = Math.ceil(boxSensorNumbers.length / boxCapacity);
      const duplicateList = boxDuplicateNumbers.length
        ? ` Duplicates: ${boxDuplicateNumbers.join(', ')}.`
        : '';

      setBoxSortStatus(
        `Loaded ${boxSensorNumbers.length} unique sensors into ${boxCount} box(es). ` +
        `Layout: ${getBoxLayoutDescription()} (${boxCapacity} sensors per box). ` +
        `Ignored ${boxImportStats.invalidCount} invalid value(s) and ${boxImportStats.duplicateCount} duplicate value(s).` +
        duplicateList
      );
    }

    function updateBoxExportButton() {
      document.getElementById('exportBoxLayout').disabled = boxSensorNumbers.length === 0;
      document.getElementById('exportBoxLabels').disabled = boxSensorNumbers.length === 0;
    }

    function updateBoxSortingData(parsed) {
      // Replace the active box plan with sanitized unique sensor numbers.
      boxSensorNumbers = parsed.numbers;
      boxDuplicateNumbers = parsed.duplicateNumbers;
      boxImportStats = {
        invalidCount: parsed.invalidCount,
        duplicateCount: parsed.duplicateCount
      };
      updateBoxExportButton();
      renderBoxPreview();
      document.getElementById('boxSearchResult').replaceChildren();
      renderBoxSortStatus();
    }

    function refreshBoxSearchResult() {
      const input = document.getElementById('boxSensorId').value.trim();
      if (!boxSensorNumbers.length || !SENSOR_NUMBER_PATTERN.test(input)) return;

      const placement = findBoxPlacement(input);
      if (!placement) {
        setBoxSearchMessage(`Sensor number ${input} is not in the loaded box list.`);
        return;
      }

      setBoxSearchMessage(
        `Sensor ${placement.sensorId}: Box ${placement.box}, Row ${placement.row}, Position ${placement.position}.`,
        false
      );
    }

    function updateBoxLayoutSettings() {
      const rowCount = Number(document.getElementById('boxRowCount').value);
      const rowSize = Number(document.getElementById('boxRowSize').value);
      if (!Number.isInteger(rowCount) || rowCount < 1) return;
      if (!Number.isInteger(rowSize) || rowSize < 1) return;

      boxLayoutSettings = { rowCount, rowSize };
      renderBoxPreview();
      renderBoxSortStatus();
      refreshBoxSearchResult();
    }

    function exportBoxLayout() {
      if (!boxSensorNumbers.length) return;

      if (currentBoxExportUrl) {
        URL.revokeObjectURL(currentBoxExportUrl);
        currentBoxExportUrl = null;
      }

      const blob = new Blob([formatBoxLayout(boxSensorNumbers, boxSourceFileName, new Date(), boxDuplicateNumbers)], { type: 'text/plain' });
      currentBoxExportUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = currentBoxExportUrl;
      link.download = getBoxLayoutFileName(boxSourceFileName);
      document.body.append(link);
      link.click();
      link.remove();
    }

    function exportBoxLabels() {
      if (!boxSensorNumbers.length) return;

      if (currentBoxLabelsUrl) {
        URL.revokeObjectURL(currentBoxLabelsUrl);
        currentBoxLabelsUrl = null;
      }

      const blob = new Blob([formatBoxLabels(boxSensorNumbers, boxSourceFileName)], { type: 'text/plain' });
      currentBoxLabelsUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = currentBoxLabelsUrl;
      link.download = getBoxLabelsFileName(boxSourceFileName);
      document.body.append(link);
      link.click();
      link.remove();
    }

    function getManualSensorListText() {
      return document.getElementById('manualSensorList').value;
    }

    function setManualSensorList(numbers) {
      document.getElementById('manualSensorList').value = numbers.join('\n');
      updateManualEntryStatus();
    }

    function updateManualEntryStatus() {
      const parsed = parseManualSensorList(getManualSensorListText());
      const status = document.getElementById('manualEntryStatus');
      const exportButton = document.getElementById('exportManualSensorList');
      const clearButton = document.getElementById('clearManualSensorList');
      const removeLastButton = document.getElementById('removeLastManualSensor');
      const hasText = getManualSensorListText().trim().length > 0;
      const duplicateText = parsed.duplicateCount
        ? ` Duplicate value(s): ${parsed.duplicateNumbers.join(', ')}.`
        : '';

      status.textContent =
        `Ready to export: ${parsed.numbers.length} sensor(s). ` +
        `Ignored ${parsed.invalidCount} invalid value(s) and ${parsed.duplicateCount} duplicate value(s).` +
        duplicateText;
      exportButton.disabled = parsed.numbers.length === 0;
      clearButton.disabled = !hasText;
      removeLastButton.disabled = parsed.numbers.length === 0;
    }

    function addManualSensor(sensorId) {
      const parsed = parseManualSensorList(getManualSensorListText());
      if (parsed.numbers.includes(sensorId)) {
        document.getElementById('manualEntryStatus').textContent = `Sensor ${sensorId} is already in the manual list.`;
        return false;
      }

      parsed.numbers.push(sensorId);
      setManualSensorList(parsed.numbers);
      return true;
    }

    function removeLastManualSensor() {
      const parsed = parseManualSensorList(getManualSensorListText());
      if (!parsed.numbers.length) return;

      parsed.numbers.pop();
      setManualSensorList(parsed.numbers);
    }

    function clearManualSensorList() {
      if (!getManualSensorListText().trim()) return;
      if (!confirm('This will clear the manual sensor list.\nContinue?')) return;

      setManualSensorList([]);
    }

    function exportManualSensorList() {
      const parsed = parseManualSensorList(getManualSensorListText());
      if (!parsed.numbers.length) return;

      if (currentManualExportUrl) {
        URL.revokeObjectURL(currentManualExportUrl);
        currentManualExportUrl = null;
      }

      const exportedAt = new Date();
      const blob = new Blob([formatManualSensorList(parsed.numbers, exportedAt, parsed.duplicateNumbers)], { type: 'text/plain' });
      currentManualExportUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = currentManualExportUrl;
      link.download = getManualSensorListFileName(exportedAt);
      document.body.append(link);
      link.click();
      link.remove();
    }

    function getOperatorNotes() {
      // Notes are included in downloaded session logs, not in persistent append-only lines.
      return document.getElementById('operatorNotes').value.trim();
    }

    function buildSessionLogText() {
      // Full session log export with metadata and all searches from the current browser session.
      const lines = [
        'Sensor Search Log',
        `Exported at: ${new Date().toISOString()}`,
        `Operator notes: ${getOperatorNotes() || 'None'}`,
        '',
        ...logLines
      ];

      return lines.join('\n');
    }

    function updateCheckedSensors() {
      const checkedDiv = document.getElementById('checkedSensors');
      checkedDiv.replaceChildren();
      if (foundSensors.size === 0) {
        return;
      }
      const title = document.createElement('b');
      title.textContent = 'Checked sensors:';
      checkedDiv.append(title, document.createElement('br'));
      foundSensors.forEach(sensorId => {
        const loc = sensorLocations[sensorId];
        const userColor = getTrackColorByLocation(loc);
        const badge = createFoundBadge(sensorId, userColor);
        badge.style.margin = '2px 4px 2px 0';
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', () => showCheckedSensor(sensorId));
        checkedDiv.append(badge);
      });
    }

    function showCheckedSensor(sensorId) {
      const location = sensorLocations[sensorId];
      if (location) {
        renderSensorResult(sensorId, location);
      }
    }

    // Persistent logging.
    async function chooseLogFile() {
      // Lets supported browsers append search lines directly to a user-selected TXT file.
      if (!isPersistentLogSupported()) {
        updateLogFileControls();
        return;
      }

      try {
        window._logFileHandle = await window.showSaveFilePicker({
          suggestedName: 'sensor_log.txt',
          types: [{
            description: 'Text Files',
            accept: {'text/plain': ['.txt']}
          }]
        });
        updateLogFileControls();
      } catch (error) {
        window._logFileHandle = null;
        updateLogFileControls();
      }
    }

    function resetAppStorage() {
      if (confirm('WARNING! This will erase this app data, track colors, and checked sensors.\nAre you sure you want to reset everything?')) {
        localStorage.removeItem(TRACK_COLORS_STORAGE_KEY);
        localStorage.removeItem(OUTDOOR_MODE_STORAGE_KEY);
        localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
        window._logFileHandle = null;
        boxSourceFileName = '';
        boxDuplicateNumbers = [];
        boxImportStats = { invalidCount: 0, duplicateCount: 0 };
        if (currentLogDownloadUrl) {
          URL.revokeObjectURL(currentLogDownloadUrl);
          currentLogDownloadUrl = null;
        }
        if (currentBoxExportUrl) {
          URL.revokeObjectURL(currentBoxExportUrl);
          currentBoxExportUrl = null;
        }
        if (currentBoxLabelsUrl) {
          URL.revokeObjectURL(currentBoxLabelsUrl);
          currentBoxLabelsUrl = null;
        }
        if (currentManualExportUrl) {
          URL.revokeObjectURL(currentManualExportUrl);
          currentManualExportUrl = null;
        }
        alert('All app data and settings have been reset. The page will reload.');
        location.reload();
      }
    }
    function resetLogFileHandle() {
      if (confirm('This will clear the selected persistent log file.\nYou can choose a new log file with the Choose log file button.\nContinue?')) {
        window._logFileHandle = null;
        updateLogFileControls();
        alert('Log file selection has been reset.');
      }
    }

    // Append one search line to the selected persistent log when the browser supports it.
    async function appendLogPersistent(newLine) {
      if (!newLine) return;
      if (window._logFileHandle) {
        try {
          let writable;
          if (window._logFileHandle.createWritable.length > 0) {
            writable = await window._logFileHandle.createWritable({keepExistingData:true});
            await writable.seek((await window._logFileHandle.getFile()).size);
            await writable.write(newLine + '\n');
            await writable.close();
          } else {
            let oldText = '';
            try {
              const file = await window._logFileHandle.getFile();
              oldText = await file.text();
            } catch (e) { oldText = ''; }
            const logText = oldText + (oldText && !oldText.endsWith('\n') ? '\n' : '') + newLine + '\n';
            writable = await window._logFileHandle.createWritable();
            await writable.write(logText);
            await writable.close();
          }
        } catch (e) {
          // Drop the handle if permission was revoked or the file became unavailable.
          window._logFileHandle = null;
          updateLogFileControls();
        }
      } else {
        // Unsupported browsers keep the session log in memory for manual download.
      }
    }

    // Event wiring for user workflows.
    document.getElementById('sensorForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const inputElem = document.getElementById('sensorId');
      const input = inputElem.value.trim();
      if (!SENSOR_NUMBER_PATTERN.test(input)) {
        setResultMessage('Please enter a valid 5 or 6 digit sensor number.');
        return;
      }
      const lookup = findSensor(input);
      const timestamp = new Date().toISOString();
      let logLine;

      if (lookup.status === 'found') {
        const isRepeat = foundSensors.has(lookup.sensorId);
        foundSensors.add(lookup.sensorId);
        renderSensorResult(lookup.sensorId, lookup.location);
        logLine = `${timestamp}\t${lookup.sensorId}\t${lookup.location}`;
        logLines.push(logLine);
        updateStatus(isRepeat ? 'This sensor number has already been checked!' : null);
      } else if (lookup.status === 'ambiguous') {
        const matchIds = lookup.matches.map(match => match.sensorId).join(', ');
        renderAmbiguousSensorResult(input, lookup.matches);
        logLine = `${timestamp}\t${input}\tAMBIGUOUS (${matchIds})`;
        logLines.push(logLine);
        updateStatus();
      } else {
        setResultMessage(`Sensor number ${input} not found!`);
        logLine = `${timestamp}\t${input}\tNOT FOUND`;
        logLines.push(logLine);
        updateStatus();
      }

      updateLogDownload();
      updateCheckedSensors();
      inputElem.blur();
      await appendLogPersistent(logLine);
    });

    document.getElementById('boxFileInput').addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        boxSourceFileName = file.name;
        updateBoxSortingData(parseBoxSensorNumbers(e.target.result));
      };
      reader.readAsText(file);
    });

    document.getElementById('boxSearchForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const inputElem = document.getElementById('boxSensorId');
      const input = inputElem.value.trim();

      if (!SENSOR_NUMBER_PATTERN.test(input)) {
        setBoxSearchMessage('Please enter a valid 5 or 6 digit sensor number.');
        return;
      }

      if (!boxSensorNumbers.length) {
        setBoxSearchMessage('Load a sensor number list first.');
        return;
      }

      const placement = findBoxPlacement(input);
      if (!placement) {
        setBoxSearchMessage(`Sensor number ${input} is not in the loaded box list.`);
        return;
      }

      setBoxSearchMessage(
        `Sensor ${placement.sensorId}: Box ${placement.box}, Row ${placement.row}, Position ${placement.position}.`,
        false
      );
      inputElem.blur();
    });

    document.getElementById('manualEntryForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const inputElem = document.getElementById('manualSensorId');
      const input = inputElem.value.trim();
      if (!SENSOR_NUMBER_PATTERN.test(input)) {
        document.getElementById('manualEntryStatus').textContent = 'Please enter a valid 5 or 6 digit sensor number.';
        return;
      }

      if (addManualSensor(input)) {
        inputElem.value = '';
      }
      inputElem.focus();
    });

    document.getElementById('clearSensorId').addEventListener('click', function() {
      const inputElem = document.getElementById('sensorId');
      inputElem.value = '';
      inputElem.focus();
    });

    document.getElementById('clearBoxSensorId').addEventListener('click', function() {
      const inputElem = document.getElementById('boxSensorId');
      inputElem.value = '';
      inputElem.focus();
    });

    document.getElementById('clearManualSensorId').addEventListener('click', function() {
      const inputElem = document.getElementById('manualSensorId');
      inputElem.value = '';
      inputElem.focus();
    });

    document.getElementById('manualSensorList').addEventListener('input', updateManualEntryStatus);
    document.getElementById('removeLastManualSensor').addEventListener('click', removeLastManualSensor);
    document.getElementById('clearManualSensorList').addEventListener('click', clearManualSensorList);
    document.getElementById('exportManualSensorList').addEventListener('click', exportManualSensorList);
    document.getElementById('boxRowCount').addEventListener('change', updateBoxLayoutSettings);
    document.getElementById('boxRowSize').addEventListener('change', updateBoxLayoutSettings);

    document.getElementById('operatorNotes').addEventListener('input', function() {
      if (logLines.length) updateLogDownload();
    });

    document.getElementById('exportBoxLayout').addEventListener('click', exportBoxLayout);
    document.getElementById('exportBoxLabels').addEventListener('click', exportBoxLabels);
    document.getElementById('outdoorModeToggle').addEventListener('click', toggleOutdoorMode);
    document.getElementById('viewModeToggle').addEventListener('click', toggleViewMode);
    document.getElementById('chooseLogFile').addEventListener('click', chooseLogFile);
    document.getElementById('resetAppStorage').addEventListener('click', resetAppStorage);
    document.getElementById('resetLogFileHandle').addEventListener('click', resetLogFileHandle);

    function updateLogDownload() {
      // Build a fresh object URL each time so notes and recent searches are included.
      const logText = buildSessionLogText();
      let logDiv = document.getElementById('logDownload');
      logDiv.replaceChildren();
      if (currentLogDownloadUrl) {
        URL.revokeObjectURL(currentLogDownloadUrl);
        currentLogDownloadUrl = null;
      }
      if (!logLines.length) return;

      const blob = new Blob([logText], {type: "text/plain"});
      currentLogDownloadUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = currentLogDownloadUrl;
      link.download = 'sensor_log.txt';
      link.textContent = 'Download session log';

      const note = document.createElement('span');
      note.style.fontSize = '0.92em';
      note.textContent = 'Every search is logged in this file.';

      logDiv.append(link, document.createElement('br'), note);
    }

    // Tab navigation.
    const tabSearch = document.getElementById('tabSearch');
    const tabBoxes = document.getElementById('tabBoxes');
    const tabManual = document.getElementById('tabManual');
    const tabTracks = document.getElementById('tabTracks');
    const tabContentSearch = document.getElementById('tabContentSearch');
    const tabContentBoxes = document.getElementById('tabContentBoxes');
    const tabContentManual = document.getElementById('tabContentManual');
    const tabContentTracks = document.getElementById('tabContentTracks');

    function activateTab(activeTab, activeContent) {
      [tabSearch, tabBoxes, tabManual, tabTracks].forEach(tab => tab.classList.remove('active'));
      [tabContentSearch, tabContentBoxes, tabContentManual, tabContentTracks].forEach(content => {
        content.style.display = 'none';
      });
      activeTab.classList.add('active');
      activeContent.style.display = '';
    }

    tabSearch.addEventListener('click', function() {
      activateTab(tabSearch, tabContentSearch);
    });
    tabBoxes.addEventListener('click', function() {
      activateTab(tabBoxes, tabContentBoxes);
    });
    tabManual.addEventListener('click', function() {
      activateTab(tabManual, tabContentManual);
    });
    tabTracks.addEventListener('click', function() {
      activateTab(tabTracks, tabContentTracks);
    });

    // Track color configuration.
    let trackColors = loadTrackColors();
    saveTrackColors();

    function renderTrackList() {
      const list = document.getElementById('trackList');
      list.replaceChildren();
      if (!trackColors.length) {
        const emptyMessage = document.createElement('i');
        emptyMessage.textContent = 'No tracks configured yet.';
        list.append(emptyMessage);
        return;
      }
      trackColors.forEach((track, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';

        const rowContent = document.createElement('div');
        rowContent.className = 'track-row-content';

        const swatch = document.createElement('span');
        swatch.className = 'track-color';
        swatch.style.background = track.color;

        const name = document.createElement('b');
        name.textContent = track.name;

        const color = document.createElement('span');
        color.style.color = '#888';
        color.style.fontSize = '0.97em';
        color.textContent = track.color;

        const removeButton = document.createElement('button');
        removeButton.className = 'track-remove';
        removeButton.textContent = 'REMOVE';
        removeButton.addEventListener('click', () => removeTrack(index));

        rowContent.append(swatch, name, color);
        row.append(rowContent, removeButton);
        list.append(row);
      });
    }

    document.getElementById('trackForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const name = document.getElementById('trackName').value.trim();
      const color = document.getElementById('trackColor').value;
      if (!name) return;
      // Update existing track names case-insensitively instead of creating duplicates.
      const idx = trackColors.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        // If the track already exists, keep its display name and update only the color.
        trackColors[idx] = { name: trackColors[idx].name, color };
      } else {
        // Keep a defensive duplicate check before adding custom tracks.
        if (trackColors.some(t => t.name.toLowerCase() === name.toLowerCase())) {
          alert('Track with this name already exists!');
          return;
        }
        trackColors.push({ name, color });
      }
      saveTrackColors();
      renderTrackList();
      updateCheckedSensors(); // Refresh colors for already checked sensors.
      this.reset();
    });

    document.getElementById('exportTrackColors').addEventListener('click', exportTrackColors);

    document.getElementById('importTrackColors').addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          trackColors = parseTrackColorImport(e.target.result);
          saveTrackColors();
          renderTrackList();
          updateCheckedSensors();
          alert('Track colors imported successfully.');
        } catch (error) {
          alert('Track color import failed. Please check the file format.');
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    });

    function removeTrack(idx) {
      const selectedTrack = trackColors[idx];
      if (!selectedTrack) return;
      trackColors.splice(idx, 1);
      saveTrackColors();
      renderTrackList();
      updateCheckedSensors(); // Refresh colors for already checked sensors.
    }

    renderTrackList();
    updateLogFileControls();
    loadOutdoorMode();
    loadViewMode();

    // Initial render.
    updateStatus();
    updateCheckedSensors();
    updateManualEntryStatus();
