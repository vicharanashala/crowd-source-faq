import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import NewDiscussionButton from "../components/NewDiscussionButton";
import QuestionSubmissionForm from "../components/QuestionSubmissionForm";
import DiscussionFeed from "../components/DiscussionFeed";
import { discussionApi } from "../api/discussionApi";
import { Category, Discussion } from "../types";
import { useCurrentUser } from "../hooks/useCurrentUser";

export default function DiscussionForumPage() {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const userId = useCurrentUser();

  const loadDiscussions = useCallback(async (keyword?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await discussionApi.list(keyword ? { search: keyword } : undefined);
      setDiscussions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load discussions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  const handleSearch = (keyword: string) => {
    setSearch(keyword);
    loadDiscussions(keyword || undefined);
  };

  const handleCreate = async (payload: {
    title: string;
    description: string;
    category: Category;
    tags: string[];
  }) => {
    const created = await discussionApi.create({ ...payload, authorId: userId });
    setShowForm(false);
    navigate(`/forum/${created._id}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-clay">
          Peer-to-peer support
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink">Discussion Forum</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          Didn't find your answer on the FAQ page? Search what the community has already
          solved, or start a new discussion — the best answers get promoted to the FAQ.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBar onSearch={handleSearch} initialValue={search} />
        <NewDiscussionButton onClick={() => setShowForm(true)} />
      </div>

      <DiscussionFeed discussions={discussions} loading={loading} error={error} />

      {showForm && (
        <QuestionSubmissionForm onClose={() => setShowForm(false)} onSubmit={handleCreate} />
      )}
    </div>
  );
}
