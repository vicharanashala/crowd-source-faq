def decide(score):
    if score >= 0.90:
        return "hard_intercept"

    elif score >= 0.75:
        return "soft_intercept"

    elif score >= 0.60:
        return "gentle_suggest"

    return "llm"