import pytest
from backend.scraper import scrape_faq
from backend.ranking import calculate_hybrid_scores

# Mock HTML containing subsets of the real samagama FAQ page for self-contained testing
MOCK_FAQ_HTML = """
<!DOCTYPE html>
<html>
<head><title>FAQ</title></head>
<body>
<p class="meta"><strong>Version:</strong> v24.4.0   <strong>Last updated:</strong> 2026-06-09, IST</p>
<main>
  <h2 id="s-1">1. About the internship</h2>
  <details class="faq-q" id="q-1-6">
    <summary>1.6 I have to attend my class tomorrow/today/some day — can I take leave?</summary>
    <p>Leave is not permitted. If you are also attending classes or exams, you will be relieved from the internship immediately.</p>
  </details>

  <h2 id="s-3">3. NOC (No Objection Certificate)</h2>
  <details class="faq-q" id="q-3-1">
    <summary>3.1 What dates do I put on the NOC?</summary>
    <p>Default: your chosen start date to your start + 2 months.</p>
  </details>
  <details class="faq-q" id="q-3-7">
    <summary>3.7 Can my HOD email the NOC instead of uploading it?</summary>
    <p>No. Your NOC must be uploaded by you, the student, from your dashboard.</p>
  </details>

  <h2 id="s-13">13. ViBe Platform</h2>
  <details class="faq-q" id="q-13-6">
    <summary>13.6 I have completed all videos and quizzes in the ViBe course, but my progress is still showing less than 100%. What should I do?</summary>
    <p>Please clear browser cache, ensure all linear progress is ticked, and check with support.</p>
  </details>

  <h2 id="s-14">14. Team Formation</h2>
  <details class="faq-q" id="q-14-20">
    <summary>14.20 What happens if a team member is inactive or not contributing?</summary>
    <p>Report it to your mentor. Inactive team members may be removed or disqualified from the internship.</p>
  </details>
</main>
</body>
</html>
"""

def test_scraper_parsing():
    """Asserts that BeautifulSoup correctly parses section headers and FAQ details."""
    data = scrape_faq(html_content=MOCK_FAQ_HTML)
    
    assert data["version"] == "v24.4.0"
    assert data["last_updated"] == "2026-06-09, IST"
    assert len(data["faqs"]) == 5
    
    # Assert specific details parsed
    noc_faq = next(f for f in data["faqs"] if f["id"] == "q-3-7")
    assert "HOD email the NOC" in noc_faq["question"]
    assert "Your NOC must be uploaded by you" in noc_faq["answer"]
    assert noc_faq["section_title"] == "3. NOC (No Objection Certificate)"
    assert noc_faq["url"] == "https://samagama.in/internship/faq#q-3-7"


def test_hybrid_ranking_noc_upload():
    """Asserts that queries about NOC uploading rank the HOD upload FAQ highest."""
    # We will simulate mock search results returned from Vector DB.
    # Each result is a tuple of (payload, individual vector scores).
    mock_db_results = [
        (
            {
                "question": "Can my HOD email the NOC instead of uploading it?",
                "answer": "No. Your NOC must be uploaded by you, the student, from your dashboard.",
                "section_title": "3. NOC (No Objection Certificate)",
                "url": "https://samagama.in/internship/faq#q-3-7"
            },
            {"question": 0.85, "combined": 0.80, "answer": 0.75} # vector similarity scores
        ),
        (
            {
                "question": "I have to attend my class tomorrow/today/some day — can I take leave?",
                "answer": "Leave is not permitted.",
                "section_title": "1. About the internship",
                "url": "https://samagama.in/internship/faq#q-1-6"
            },
            {"question": 0.20, "combined": 0.15, "answer": 0.10}
        )
    ]
    
    query = "noc upload by email"
    scored = calculate_hybrid_scores(query, mock_db_results)
    
    # The first item should be the HOD upload NOC question
    assert len(scored) == 2
    assert scored[0]["url"] == "https://samagama.in/internship/faq#q-3-7"
    assert scored[0]["score"] > scored[1]["score"]
    # Verify exact keyword match/phrase calculations boosted it
    assert scored[0]["debug"]["section_match"] == 1.0  # Query "noc" matches Section "3. NOC..."


def test_hybrid_ranking_vibe_progress():
    """Asserts that queries about vibe progress matching the vibe 100% progress FAQ."""
    mock_db_results = [
        (
            {
                "question": "I have completed all videos and quizzes in the ViBe course, but my progress is still showing less than 100%. What should I do?",
                "answer": "Please clear browser cache, ensure all linear progress is ticked.",
                "section_title": "13. ViBe Platform",
                "url": "https://samagama.in/internship/faq#q-13-6"
            },
            {"question": 0.82, "combined": 0.80, "answer": 0.78}
        ),
        (
            {
                "question": "What dates do I put on the NOC?",
                "answer": "Default: your chosen start date.",
                "section_title": "3. NOC (No Objection Certificate)",
                "url": "https://samagama.in/internship/faq#q-3-1"
            },
            {"question": 0.10, "combined": 0.05, "answer": 0.05}
        )
    ]
    
    query = "vibe progress is not showing 100 percent"
    scored = calculate_hybrid_scores(query, mock_db_results)
    
    assert scored[0]["url"] == "https://samagama.in/internship/faq#q-13-6"
    assert scored[0]["score"] > 0.60
    assert scored[1]["score"] < 0.20


def test_hybrid_ranking_leave():
    """Asserts that leave questions map to the leave FAQ with a high score."""
    mock_db_results = [
        (
            {
                "question": "I have to attend my class tomorrow/today/some day — can I take leave?",
                "answer": "Leave is not permitted. If you are also attending classes or exams, you will be relieved from the internship immediately.",
                "section_title": "1. About the internship",
                "url": "https://samagama.in/internship/faq#q-1-6"
            },
            {"question": 0.90, "combined": 0.85, "answer": 0.80}
        ),
        (
            {
                "question": "What happens if a team member is inactive or not contributing?",
                "answer": "Report it to your mentor.",
                "section_title": "14. Team Formation",
                "url": "https://samagama.in/internship/faq#q-14-20"
            },
            {"question": 0.15, "combined": 0.10, "answer": 0.10}
        )
    ]
    
    query = "can I take leave tomorrow"
    scored = calculate_hybrid_scores(query, mock_db_results)
    
    assert scored[0]["url"] == "https://samagama.in/internship/faq#q-1-6"
    assert scored[0]["score"] > 0.70
    assert scored[0]["debug"]["question_title_match"] >= 0.5  # "can i take leave" phrase contains bigram match


def test_hybrid_ranking_inactive_member():
    """Asserts that inactive teammate questions rank the inactive team member FAQ first."""
    mock_db_results = [
        (
            {
                "question": "What happens if a team member is inactive or not contributing?",
                "answer": "Report it to your mentor. Inactive team members may be removed.",
                "section_title": "14. Team Formation",
                "url": "https://samagama.in/internship/faq#q-14-20"
            },
            {"question": 0.88, "combined": 0.84, "answer": 0.80}
        ),
        (
            {
                "question": "Can my HOD email the NOC instead of uploading it?",
                "answer": "No. Your NOC must be uploaded by you.",
                "section_title": "3. NOC (No Objection Certificate)",
                "url": "https://samagama.in/internship/faq#q-3-7"
            },
            {"question": 0.10, "combined": 0.05, "answer": 0.05}
        )
    ]
    
    query = "team member is inactive"
    scored = calculate_hybrid_scores(query, mock_db_results)
    
    assert scored[0]["url"] == "https://samagama.in/internship/faq#q-14-20"
    assert scored[0]["score"] > 0.70
    assert scored[0]["debug"]["question_title_match"] == 1.0
