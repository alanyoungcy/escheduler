from datetime import date, time

from app.repository import _times_overlap


def test_times_overlap_handles_overnight_shift() -> None:
    assert _times_overlap(time(22, 0), time(7, 0), "23:00", "07:00")


def test_times_overlap_rejects_non_overlapping_ranges() -> None:
    assert not _times_overlap(time(8, 0), time(12, 0), "15:00", "23:00")
