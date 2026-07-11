/**
 * @param {{ category: string, setCategory: (c: string) => void, categories?: string[] }} props
 */
const FAQCategory = ({ category, setCategory, categories }) => {
  const items = ["All", ...(categories || [])];

  return (
    <div className="faq-category-container">
      {items.map((item) => (
        <button
          key={item}
          className={`faq-category-btn ${
            category === item ? "active" : ""
          }`}
          onClick={() => setCategory(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
};

export default FAQCategory;