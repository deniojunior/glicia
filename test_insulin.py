import unittest

from insulin import calculate_suggested_dose


class InsulinTest(unittest.TestCase):
    def test_calculates_suggested_dose(self) -> None:
        correction, carbohydrate, total, suggested = calculate_suggested_dose(
            glucose=160,
            carbohydrates=29,
            target_glucose=120,
            correction_factor=40,
            carbohydrate_ratio=10,
        )
        self.assertEqual(correction, 1)
        self.assertEqual(carbohydrate, 2.9)
        self.assertEqual(total, 3.9)
        self.assertEqual(suggested, 4)


if __name__ == "__main__":
    unittest.main()
