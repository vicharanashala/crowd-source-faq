import { Search } from "lucide-react";

const FAQSearch = ({ search, setSearch }) => {
  return (
    <div className="faq-search">
      <Search size={18} className="faq-search-icon" />

      <input
        type="text"
        placeholder="Search FAQs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="faq-search-input"
      />
    </div>
  );
};

export default FAQSearch;