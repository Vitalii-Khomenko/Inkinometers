import importlib.util
import random
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_HTML = ROOT / "Inklinometers.html"
INDEX_HTML = ROOT / "index.html"
CSS_FILE = ROOT / "css" / "style.css"
JS_FILE = ROOT / "js" / "app.js"
BUILD_SCRIPT = ROOT / "scripts" / "build_singlefile.py"
README = ROOT / "README.md"
AUDIT = ROOT / "AUDIT.md"
AGENTS = ROOT / "AGENTS.md"
IMPROVEMENTS = ROOT / "IMPROVEMENTS.md"
GENERATOR = ROOT / "generate_sensor_numbers.py"
LICENSE = ROOT / "LICENSE"
TRACK_COLORS = ROOT / "track_colors.json"


def read_text(path):
    return path.read_text(encoding="utf-8")


def load_generator_module():
    spec = importlib.util.spec_from_file_location("generate_sensor_numbers", GENERATOR)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load generator module from {GENERATOR}")

    loader = spec.loader
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def load_build_module():
    spec = importlib.util.spec_from_file_location("build_singlefile", BUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load build module from {BUILD_SCRIPT}")

    loader = spec.loader
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class SensorNumberGeneratorTests(unittest.TestCase):
    def test_generates_unique_5_and_6_digit_numbers(self):
        generator = load_generator_module()
        random.seed(42)

        numbers = generator.generate_sensor_numbers(20)

        self.assertEqual(len(numbers), 20)
        self.assertEqual(len(set(numbers)), 20)
        self.assertTrue(all(re.fullmatch(r"\d{5,6}", number) for number in numbers))
        self.assertTrue(any(len(number) == 5 for number in numbers))
        self.assertTrue(any(len(number) == 6 for number in numbers))

    def test_generated_numbers_are_shuffled(self):
        generator = load_generator_module()
        random.seed(7)

        numbers = generator.generate_sensor_numbers(12)

        self.assertNotEqual(numbers, sorted(numbers, key=int))


class AppAuditRegressionTests(unittest.TestCase):
    def setUp(self):
        self.html = read_text(APP_HTML)

    def test_dynamic_rendering_does_not_use_inner_html(self):
        self.assertNotIn("innerHTML", self.html)
        self.assertIn("textContent", self.html)
        self.assertIn("replaceChildren", self.html)

    def test_no_inline_event_handlers_remain(self):
        self.assertNotIn("onclick=", self.html)
        self.assertNotIn("window.removeTrack", self.html)
        self.assertIn("addEventListener('click'", self.html)

    def test_log_file_picker_is_explicit_user_action(self):
        self.assertIn('id="chooseLogFile"', self.html)
        self.assertIn("async function chooseLogFile()", self.html)
        self.assertIn("window.showSaveFilePicker", self.html)

        file_load_start = self.html.index("reader.onload")
        file_load_end = self.html.index("reader.readAsText(file)")
        file_load_block = self.html[file_load_start:file_load_end]
        self.assertNotIn("showSaveFilePicker", file_load_block)

    def test_local_storage_reset_is_scoped_to_app_key(self):
        self.assertNotIn("localStorage.clear()", self.html)
        self.assertIn("localStorage.removeItem(TRACK_COLORS_STORAGE_KEY)", self.html)

    def test_track_color_storage_is_validated(self):
        self.assertIn("function loadTrackColors()", self.html)
        self.assertIn("try {", self.html)
        self.assertIn("isValidTrackColorEntry", self.html)
        self.assertIn("HEX_COLOR_PATTERN", self.html)

    def test_default_track_colors_are_removable(self):
        self.assertIn("const defaultTracks = [", self.html)
        self.assertIn("storedValue === null", self.html)
        self.assertIn("return [...defaultTracks]", self.html)
        self.assertIn("removeButton.textContent = 'REMOVE'", self.html)
        self.assertNotIn("LOCKED", self.html)
        self.assertNotIn("Default tracks cannot be removed.", self.html)

    def test_log_download_urls_are_revoked(self):
        self.assertIn("currentLogDownloadUrl", self.html)
        self.assertIn("URL.revokeObjectURL(currentLogDownloadUrl)", self.html)

    def test_outdoor_mode_is_available(self):
        self.assertIn('id="outdoorModeToggle"', self.html)
        self.assertIn("body.outdoor-mode", self.html)
        self.assertIn("function toggleOutdoorMode()", self.html)
        self.assertIn("OUTDOOR_MODE_STORAGE_KEY", self.html)

    def test_responsive_view_modes_are_available(self):
        self.assertIn('id="viewModeToggle"', self.html)
        self.assertIn("VIEW_MODE_STORAGE_KEY", self.html)
        self.assertIn("VIEW_MODES = ['auto', 'wide', 'compact']", self.html)
        self.assertIn("function toggleViewMode()", self.html)
        self.assertIn("body.view-wide", self.html)
        self.assertIn("body.view-compact", self.html)
        self.assertIn("@media (min-width: 760px)", self.html)

    def test_ambiguous_sensor_lookup_is_handled(self):
        self.assertIn("function findSensor(sensorNumber)", self.html)
        self.assertIn("status: 'ambiguous'", self.html)
        self.assertIn("renderAmbiguousSensorResult", self.html)


class SplitSourceBuildTests(unittest.TestCase):
    def test_split_source_files_exist(self):
        self.assertTrue(INDEX_HTML.exists())
        self.assertTrue(CSS_FILE.exists())
        self.assertTrue(JS_FILE.exists())
        self.assertTrue(BUILD_SCRIPT.exists())

    def test_index_uses_external_source_files(self):
        index = read_text(INDEX_HTML)

        self.assertIn('<link rel="stylesheet" href="css/style.css">', index)
        self.assertIn('<script src="js/app.js"></script>', index)
        self.assertNotIn("<style>", index)

    def test_production_html_is_single_file(self):
        html = read_text(APP_HTML)

        self.assertIn("<style>", html)
        self.assertIn("<script>", html)
        self.assertNotIn('<link rel="stylesheet" href="css/style.css">', html)
        self.assertNotIn('<script src="js/app.js"></script>', html)

    def test_build_output_matches_production_html(self):
        builder = load_build_module()

        self.assertEqual(builder.build_singlefile(), read_text(APP_HTML))

    def test_app_javascript_syntax_is_valid(self):
        subprocess.run(
            ["node", "--check", str(JS_FILE)],
            cwd=ROOT,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


class BoxSortingFeatureTests(unittest.TestCase):
    def setUp(self):
        self.html = read_text(APP_HTML)

    def test_box_sorting_tab_exists(self):
        self.assertIn('id="tabBoxes"', self.html)
        self.assertIn("Box Sorting", self.html)
        self.assertIn('id="boxFileInput"', self.html)
        self.assertIn('id="boxSearchForm"', self.html)
        self.assertIn('id="exportBoxLayout"', self.html)

    def test_box_sorting_uses_configurable_capacity(self):
        self.assertIn('id="boxRowCount"', self.html)
        self.assertIn('id="boxRowSize"', self.html)
        self.assertIn("const DEFAULT_BOX_ROW_SIZE = 8;", self.html)
        self.assertIn("const DEFAULT_BOX_ROW_COUNT = 3;", self.html)
        self.assertIn("function getBoxCapacity(layout = boxLayoutSettings)", self.html)
        self.assertIn("function updateBoxLayoutSettings()", self.html)

    def test_box_sorting_parses_sorts_and_deduplicates_numbers(self):
        self.assertIn("function parseBoxSensorNumbers(text)", self.html)
        self.assertIn("uniqueNumbers", self.html)
        self.assertIn("duplicateNumbers", self.html)
        self.assertIn("Number(left) - Number(right)", self.html)
        self.assertIn("duplicateCount", self.html)
        self.assertIn("invalidCount", self.html)

    def test_box_position_and_export_are_supported(self):
        self.assertIn("function getBoxPositionByIndex(index, layout = boxLayoutSettings)", self.html)
        self.assertIn("function findBoxPlacement(sensorNumber)", self.html)
        self.assertIn("function formatBoxLayout(numbers, sourceFileName = '', exportedAt = new Date(), duplicateNumbers = [], layout = boxLayoutSettings)", self.html)
        self.assertIn("Source file: ${sourceName}", self.html)
        self.assertIn("Exported at: ${exportTimestamp}", self.html)
        self.assertIn("Box capacity: ${boxCapacity} sensors", self.html)
        self.assertIn("Orientation: vertical box, rows increase from left to right", self.html)
        self.assertIn("positionNumbers", self.html)
        self.assertIn("function getBoxLayoutFileName(sourceFileName)", self.html)
        self.assertIn("BOX_LAYOUT_SUFFIX = 'box_layout'", self.html)
        self.assertIn("link.download = getBoxLayoutFileName(boxSourceFileName)", self.html)

    def test_printable_box_labels_are_supported(self):
        self.assertIn('id="exportBoxLabels"', self.html)
        self.assertIn("function formatBoxLabels(numbers", self.html)
        self.assertIn("function exportBoxLabels()", self.html)
        self.assertIn("BOX_LABELS_SUFFIX = 'box_labels'", self.html)

    def test_operator_notes_are_in_exported_logs(self):
        self.assertIn('id="operatorNotes"', self.html)
        self.assertIn("function buildSessionLogText()", self.html)
        self.assertIn("Operator notes:", self.html)

    def test_track_color_import_export_is_supported(self):
        self.assertIn('id="exportTrackColors"', self.html)
        self.assertIn('id="importTrackColors"', self.html)
        self.assertIn("function exportTrackColors()", self.html)
        self.assertIn("function parseTrackColorImport(text)", self.html)

    def test_mapping_import_reports_duplicates(self):
        self.assertIn("function parseSensorFile(text)", self.html)
        self.assertIn("duplicateNumbers.push(num)", self.html)
        self.assertIn("Duplicate sensors ignored", self.html)


class ManualSensorListFeatureTests(unittest.TestCase):
    def setUp(self):
        self.html = read_text(APP_HTML)

    def test_manual_list_tab_exists(self):
        self.assertIn('id="tabManual"', self.html)
        self.assertIn("Manual List", self.html)
        self.assertIn('id="tabContentManual"', self.html)
        self.assertIn('id="manualEntryForm"', self.html)
        self.assertIn('id="manualSensorList"', self.html)
        self.assertIn('id="exportManualSensorList"', self.html)

    def test_manual_list_export_includes_metadata(self):
        self.assertIn("function getManualSensorListFileName(exportedAt = new Date())", self.html)
        self.assertIn("manual_sensors_${formatDateStamp(exportedAt)}.txt", self.html)
        self.assertIn("function formatManualSensorList(numbers, exportedAt = new Date(), duplicateNumbers = [])", self.html)
        self.assertIn("Manual Sensor List", self.html)
        self.assertIn("Created at: ${exportedAt.toISOString()}", self.html)
        self.assertIn("Local time: ${formatLocalDateTime(exportedAt)}", self.html)
        self.assertIn("Total sensors: ${numbers.length}", self.html)

    def test_manual_list_validates_and_deduplicates_numbers(self):
        self.assertIn("function parseManualSensorList(text)", self.html)
        self.assertIn("SENSOR_NUMBER_PATTERN.test(token)", self.html)
        self.assertIn("duplicateNumbers.push(token)", self.html)
        self.assertIn("Sensor ${sensorId} is already in the manual list.", self.html)
        self.assertIn("removeLastManualSensor", self.html)


class DocumentationTests(unittest.TestCase):
    def test_audit_is_fully_closed(self):
        audit = read_text(AUDIT)

        self.assertNotIn("Status: Open.", audit)
        self.assertIn("Status: Fixed in batch 3.", audit)

    def test_readme_documents_tests_and_audit(self):
        readme = read_text(README)

        self.assertIn("AUDIT.md", readme)
        self.assertIn("Tests", readme)
        self.assertIn("python -m unittest discover -s tests", readme)

    def test_readme_documents_split_source_build(self):
        readme = read_text(README)

        self.assertIn("Development Build", readme)
        self.assertIn("index.html", readme)
        self.assertIn("css/style.css", readme)
        self.assertIn("js/app.js", readme)
        self.assertIn("scripts/build_singlefile.py", readme)
        self.assertIn("python scripts/build_singlefile.py", readme)

    def test_docs_preserve_single_file_mobile_constraint(self):
        readme = read_text(README)
        agents = read_text(AGENTS)
        improvements = read_text(IMPROVEMENTS)

        self.assertIn("single self-contained HTML file", readme)
        self.assertIn("without installation", readme)
        self.assertIn("one self-contained HTML file", agents)
        self.assertIn("smartphone", improvements)
        self.assertIn("must stay as one self-contained HTML file", improvements)

    def test_readme_documents_box_sorting(self):
        readme = read_text(README)

        self.assertIn("Box Sorting", readme)
        self.assertIn("24 sensors", readme)
        self.assertIn("3 rows x 8", readme)
        self.assertIn("16 sensors", readme)
        self.assertIn("12 sensors", readme)
        self.assertIn("vertical transport orientation", readme)
        self.assertIn("rows increase from left to right", readme)
        self.assertIn("Source file: sensor_numbers_20260520_073634.txt", readme)
        self.assertIn("Exported at:", readme)
        self.assertIn("_box_layout.txt", readme)
        self.assertIn("sensor_numbers_20260520_073634_box_layout.txt", readme)
        self.assertIn("sensor_numbers_20260520_073634_box_labels.txt", readme)

    def test_readme_documents_manual_sensor_list(self):
        readme = read_text(README)

        self.assertIn("Manual Sensor List", readme)
        self.assertIn("Manual List", readme)
        self.assertIn("Export TXT list", readme)
        self.assertIn("manual_sensors_20260520_083000.txt", readme)
        self.assertIn("Total sensors: 3", readme)
        self.assertIn("Created at:", readme)
        self.assertIn("Local time:", readme)

    def test_readme_documents_field_workflow_enhancements(self):
        readme = read_text(README)

        self.assertIn("Outdoor mode", readme)
        self.assertIn("View: Auto", readme)
        self.assertIn("Wide", readme)
        self.assertIn("Compact", readme)
        self.assertIn("operator notes", readme)
        self.assertIn("Import track colors", readme)
        self.assertIn("Export track colors", readme)
        self.assertIn("Duplicate sensor numbers", readme)
        self.assertIn("Default tracks are starter settings", readme)
        self.assertIn("they can also be removed", readme)
        self.assertIn("#2a65ea", readme)
        self.assertIn("#1ec47c", readme)
        self.assertIn("#ad3ee6", readme)
        self.assertIn("#ffd600", readme)

    def test_license_and_track_color_sample_are_documented(self):
        readme = read_text(README)
        license_text = read_text(LICENSE)
        track_colors = read_text(TRACK_COLORS)

        self.assertIn("MIT License", license_text)
        self.assertIn("licensed under the MIT License", readme)
        self.assertIn("track_colors.json", readme)
        self.assertIn('"name": "U1"', track_colors)
        self.assertIn('"color": "#2a65ea"', track_colors)

    def test_project_text_files_are_ascii_only(self):
        for path in [
            APP_HTML,
            INDEX_HTML,
            CSS_FILE,
            JS_FILE,
            BUILD_SCRIPT,
            README,
            AUDIT,
            AGENTS,
            IMPROVEMENTS,
            GENERATOR,
            LICENSE,
            TRACK_COLORS,
            Path(__file__),
        ]:
            with self.subTest(path=path.name):
                path.read_text(encoding="ascii")


if __name__ == "__main__":
    unittest.main()
