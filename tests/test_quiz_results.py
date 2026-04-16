"""
Tests for the session-report helper functions in quiz_runner.py.

Covers two pure functions that compute structured data from a completed
quiz session, tested independently of any terminal I/O:

  compute_domain_breakdown(domain_stats)  → list of per-domain rows
  compute_next_steps(domain_stats, wrong) → ordered recommendation strings
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "study" / "quizzes"))

from quiz_runner import compute_domain_breakdown, compute_next_steps


# ── compute_domain_breakdown ──────────────────────────────────────────────────

class TestComputeDomainBreakdown:

    def test_empty_stats_returns_empty_list(self):
        assert compute_domain_breakdown({}) == []

    def test_single_domain_perfect_score(self):
        result = compute_domain_breakdown({1: {"total": 10, "correct": 10}})
        assert len(result) == 1
        row = result[0]
        assert row["domain"] == 1
        assert row["name"] == "People"
        assert row["correct"] == 10
        assert row["total"] == 10
        assert row["pct"] == 100.0
        assert row["weak"] is False

    def test_exactly_seventy_percent_is_not_weak(self):
        result = compute_domain_breakdown({2: {"total": 10, "correct": 7}})
        assert result[0]["weak"] is False

    def test_below_seventy_percent_is_weak(self):
        result = compute_domain_breakdown({2: {"total": 10, "correct": 6}})
        assert result[0]["weak"] is True

    def test_sixty_nine_percent_is_weak(self):
        # 69 / 100 = 69 % — just below the threshold
        result = compute_domain_breakdown({3: {"total": 100, "correct": 69}})
        assert result[0]["weak"] is True

    def test_rows_sorted_by_domain_number(self):
        stats = {
            3: {"total": 5, "correct": 4},
            1: {"total": 10, "correct": 8},
            2: {"total": 8, "correct": 5},
        }
        result = compute_domain_breakdown(stats)
        assert [r["domain"] for r in result] == [1, 2, 3]

    def test_domain_with_zero_total_is_excluded(self):
        stats = {
            1: {"total": 0, "correct": 0},
            2: {"total": 5, "correct": 3},
        }
        result = compute_domain_breakdown(stats)
        assert len(result) == 1
        assert result[0]["domain"] == 2

    def test_pct_calculated_correctly(self):
        result = compute_domain_breakdown({1: {"total": 4, "correct": 3}})
        assert result[0]["pct"] == 75.0

    def test_domain_name_process(self):
        result = compute_domain_breakdown({2: {"total": 5, "correct": 5}})
        assert result[0]["name"] == "Process"

    def test_domain_name_business_environment(self):
        result = compute_domain_breakdown({3: {"total": 5, "correct": 5}})
        assert result[0]["name"] == "Business Environment"

    def test_all_three_domains(self):
        stats = {
            1: {"total": 10, "correct": 8},
            2: {"total": 10, "correct": 6},
            3: {"total": 5, "correct": 4},
        }
        result = compute_domain_breakdown(stats)
        assert len(result) == 3
        assert result[0]["domain"] == 1
        assert result[1]["domain"] == 2
        assert result[2]["domain"] == 3
        assert result[1]["weak"] is True   # 60 %


# ── compute_next_steps ────────────────────────────────────────────────────────

class TestComputeNextSteps:

    def test_no_data_returns_empty(self):
        assert compute_next_steps({}, []) == []

    def test_all_skipped_no_domain_stats_returns_empty(self):
        # domain_stats is empty because every answer was S (skipped)
        assert compute_next_steps({}, []) == []

    # ── wrong-topic recommendations ───────────────────────────────────────────

    def test_wrong_topics_appear_in_steps(self):
        wrong = [{"topic": "Risk Management", "domain": 2}]
        stats = {2: {"total": 5, "correct": 4}}
        steps = compute_next_steps(stats, wrong)
        assert any("Risk Management" in s for s in steps)

    def test_wrong_topics_sorted_by_miss_count_descending(self):
        wrong = [
            {"topic": "Risk Management", "domain": 2},
            {"topic": "Risk Management", "domain": 2},
            {"topic": "Stakeholder Engagement", "domain": 1},
        ]
        stats = {
            1: {"total": 5, "correct": 4},
            2: {"total": 5, "correct": 3},
        }
        steps = compute_next_steps(stats, wrong)
        risk_idx = next(i for i, s in enumerate(steps) if "Risk Management" in s)
        sth_idx  = next(i for i, s in enumerate(steps) if "Stakeholder Engagement" in s)
        assert risk_idx < sth_idx

    def test_wrong_topics_capped_at_five(self):
        wrong = [{"topic": f"Topic {i}", "domain": 2} for i in range(8)]
        stats = {2: {"total": 20, "correct": 12}}
        steps = compute_next_steps(stats, wrong)
        topic_steps = [s for s in steps if "Review" in s]
        assert len(topic_steps) <= 5

    def test_missing_topic_key_falls_back_to_general(self):
        wrong = [{"domain": 2}]          # no "topic" key
        stats = {2: {"total": 5, "correct": 4}}
        steps = compute_next_steps(stats, wrong)
        assert any("General" in s for s in steps)

    # ── domain-drill recommendations ──────────────────────────────────────────

    def test_weak_domain_suggests_drill_with_flag(self):
        stats = {1: {"total": 10, "correct": 5}}   # 50 % — weak
        steps = compute_next_steps(stats, wrong=[])
        assert any("--domain 1" in s for s in steps)

    def test_strong_domain_does_not_suggest_drill(self):
        stats = {1: {"total": 10, "correct": 8}}   # 80 % — not weak
        steps = compute_next_steps(stats, wrong=[])
        assert not any("--domain 1" in s for s in steps)

    def test_multiple_weak_domains_all_recommended(self):
        stats = {
            1: {"total": 10, "correct": 5},   # 50 % — weak
            2: {"total": 10, "correct": 6},   # 60 % — weak
        }
        steps = compute_next_steps(stats, wrong=[])
        assert any("--domain 1" in s for s in steps)
        assert any("--domain 2" in s for s in steps)

    # ── mixed scenarios ───────────────────────────────────────────────────────

    def test_both_weak_domain_and_wrong_topics_present(self):
        stats = {1: {"total": 10, "correct": 5}}   # 50 %
        wrong = [{"topic": "Conflict Resolution", "domain": 1}]
        steps = compute_next_steps(stats, wrong)
        assert any("Conflict Resolution" in s for s in steps)
        assert any("--domain 1" in s for s in steps)

    def test_wrong_topics_but_no_weak_domain_no_drill(self):
        # 80 % correct in domain 2 — not weak — but there are wrong answers
        stats = {2: {"total": 10, "correct": 8}}
        wrong = [{"topic": "Risk", "domain": 2}]
        steps = compute_next_steps(stats, wrong)
        assert any("Risk" in s for s in steps)
        assert not any("--domain 2" in s for s in steps)

    # ── difficulty-upgrade recommendations ───────────────────────────────────

    def test_perfect_score_suggests_harder_difficulty(self):
        stats = {
            1: {"total": 5, "correct": 5},
            2: {"total": 5, "correct": 5},
        }
        steps = compute_next_steps(stats, wrong=[])
        assert len(steps) > 0
        combined = " ".join(steps).lower()
        assert "hard" in combined or "expert" in combined or "difficult" in combined

    def test_no_wrong_and_no_weak_domains_gives_positive_step(self):
        stats = {
            1: {"total": 5, "correct": 4},   # 80 %
            2: {"total": 5, "correct": 5},   # 100 %
        }
        steps = compute_next_steps(stats, wrong=[])
        assert len(steps) > 0

    def test_order_topics_before_domain_drills(self):
        # Topic reviews should come before domain-drill recommendations so the
        # most actionable items are at the top of the list.
        stats = {1: {"total": 10, "correct": 5}}   # weak
        wrong = [{"topic": "Risk", "domain": 1}]
        steps = compute_next_steps(stats, wrong)
        topic_idx  = next(i for i, s in enumerate(steps) if "Risk" in s)
        domain_idx = next(i for i, s in enumerate(steps) if "--domain" in s)
        assert topic_idx < domain_idx
