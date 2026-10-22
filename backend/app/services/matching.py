"""Deterministic compatibility and scoring. Never use hidden gender to filter."""
LEVELS = {"hobby": 0, "beginner": 0, "intermediate": 1, "advanced": 2, "pro": 3}


def accepts(viewer, other):
    preference = viewer.teammate_preference
    if preference in {"no_preference", "mixed"}:
        return True
    # Explicit gender filters only use attributes already chosen to be public.
    # Otherwise discovery results could reveal a hidden identity indirectly.
    expected = "woman" if preference == "women" else "man"
    return other.gender_visibility == "public" and other.gender == expected


def compatible(first, second):
    return accepts(first, second) and accepts(second, first)


def match_score(first, other, skill, other_skill, distance, radius, weights):
    mine = {(x["weekday"], x["time_slot"]) for x in first.availability}
    theirs = {(x["weekday"], x["time_slot"]) for x in other.availability}
    overlap = sorted(mine & theirs)
    proximity = max(0, 1 - distance / max(radius, 1))
    skill_match = 1 - abs(LEVELS.get(skill, 0) - LEVELS.get(other_skill, 0)) / 3
    availability = len(overlap) / len(mine | theirs) if mine | theirs else 0
    score = 100 * (weights["sport"] + weights["distance"] * proximity
                   + weights["skill"] * skill_match + weights["availability"] * availability)
    explanation = ["Plays the same sport", "Nearby"]
    if skill_match >= 2 / 3:
        explanation.append("Similar skill level")
    if overlap:
        explanation.append("Shared playing times")
    return round(score), [{"weekday": d, "time_slot": t} for d, t in overlap], explanation
