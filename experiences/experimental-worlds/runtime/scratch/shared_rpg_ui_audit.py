import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class SharedRpgUiAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.multiplayer = (ROOT / "multiplayer.js").read_text(encoding="utf-8")
        cls.build = (ROOT / "scripts" / "build-portable.sh").read_text(encoding="utf-8")

    def test_shared_module_loads_before_consumers(self):
        self.assertLess(self.html.index('src="rpg-mechanics.js'), self.html.index('src="multiplayer-engine.js'))
        self.assertLess(self.html.index('src="multiplayer-engine.js'), self.html.index('src="multiplayer.js'))

    def test_worlds_expose_optional_equipment(self):
        self.assertIn('data-rule-module="equipment"', self.html)
        self.assertIn('Off · Pure Narrative', self.html)
        self.assertIn('w-rules-item-catalog', self.html)
        self.assertIn('world-mechanics-toggle-btn', self.html)
        self.assertIn('openWorldItemEditor', self.app)
        self.assertIn('effectiveWorldStatValue', self.app)
        self.assertIn('toggleWorldOptionalRpg', self.app)
        self.assertIn('pausedMechanicalModules', self.app)

    def test_multiplayer_exposes_live_mechanics_control(self):
        self.assertIn('world-party-mechanics-mode', self.html)
        self.assertIn('data-gm-mechanics-mode', self.multiplayer)
        self.assertIn('Effective ${escape(effective)}', self.multiplayer)
        self.assertIn('items are never deleted', self.multiplayer)

    def test_portable_contains_all_runtime_engines(self):
        self.assertIn('rpg-mechanics.js', self.build)
        self.assertIn('multiplayer-engine.js', self.build)
        self.assertIn('multiplayer.js', self.build)


if __name__ == '__main__':
    unittest.main()
