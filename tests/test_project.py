import importlib.util
import random
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_HTML = ROOT / "Inklinometers.html"
README = ROOT / "README.md"
AUDIT = ROOT / "AUDIT.md"
AGENTS = ROOT / "AGENTS.md"
IMPROVEMENTS = ROOT / "IMPROVEMENTS.md"
GENERATOR = ROOT / "generate_sensor_numbers.py"


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

    def test_log_download_urls_are_revoked(self):
        self.assertIn("currentLogDownloadUrl", self.html)
        self.assertIn("URL.revokeObjectURL(currentLogDownloadUrl)", self.html)

    def test_ambiguous_sensor_lookup_is_handled(self):
        self.assertIn("function findSensor(sensorNumber)", self.html)
        self.assertIn("status: 'ambiguous'", self.html)
        self.assertIn("renderAmbiguousSensorResult", self.html)


class BoxSortingFeatureTests(unittest.TestCase):
    def setUp(self):
        self.html = read_text(APP_HTML)

    def test_box_sorting_tab_exists(self):
        self.assertIn('id="tabBoxes"', self.html)
        self.assertIn("Box Sorting", self.html)
        self.assertIn('id="boxFileInput"', self.html)
        self.assertIn('id="boxSearchForm"', self.html)
        self.assertIn('id="exportBoxLayout"', self.html)

    def test_box_sorting_uses_expected_capacity(self):
        self.assertIn("const BOX_SIZE = 24;", self.html)
        self.assertIn("const BOX_ROW_SIZE = 8;", self.html)
        self.assertIn("const BOX_ROW_COUNT = 3;", self.html)

    def test_box_sorting_parses_sorts_and_deduplicates_numbers(self):
        self.assertIn("function parseBoxSensorNumbers(text)", self.html)
        self.assertIn("uniqueNumbers", self.html)
        self.assertIn("Number(left) - Number(right)", self.html)
        self.assertIn("duplicateCount", self.html)
        self.assertIn("invalidCount", self.html)

    def test_box_position_and_export_are_supported(self):
        self.assertIn("function getBoxPositionByIndex(index)", self.html)
        self.assertIn("function findBoxPlacement(sensorNumber)", self.html)
        self.assertIn("function formatBoxLayout(numbers, sourceFileName = '', exportedAt = new Date())", self.html)
        self.assertIn("Source file: ${sourceName}", self.html)
        self.assertIn("Exported at: ${exportTimestamp}", self.html)
        self.assertIn("Box capacity: ${BOX_SIZE} sensors", self.html)
        self.assertIn("function getBoxLayoutFileName(sourceFileName)", self.html)
        self.assertIn("BOX_LAYOUT_SUFFIX = 'box_layout'", self.html)
        self.assertIn("link.download = getBoxLayoutFileName(boxSourceFileName)", self.html)


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
        self.assertIn("Source file: sensor_numbers_20260520_073634.txt", readme)
        self.assertIn("Exported at:", readme)
        self.assertIn("_box_layout.txt", readme)
        self.assertIn("sensor_numbers_20260520_073634_box_layout.txt", readme)

    def test_project_text_files_are_ascii_only(self):
        for path in [APP_HTML, README, AUDIT, AGENTS, IMPROVEMENTS, GENERATOR, Path(__file__)]:
            with self.subTest(path=path.name):
                path.read_text(encoding="ascii")


if __name__ == "__main__":
    unittest.main()
